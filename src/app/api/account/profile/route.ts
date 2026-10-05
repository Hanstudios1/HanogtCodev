import { randomInt } from "node:crypto";
import type { Session } from "next-auth";
import { NextResponse, after, type NextRequest } from "next/server";
import {
    PUBLIC_PROFILE_KEYS,
    RETIRED_ACCOUNT_KEYS,
    defaultNickname,
    isNicknameTag,
    isSafeProfileUrl,
    mergeStoredAccount,
    sameNickname,
    sanitizeAccountPatch,
    splitAccountPatch,
    type AccountFacts,
    type AccountProfileErrorBody,
    type AccountProfileErrorCode,
    type AccountProfilePatch,
    type AccountProfileResponse,
    type EditableAccountFields,
} from "@/lib/account-profile";
import type { PlanBadgeState } from "@/lib/plan-badge";
import { effectiveStatus, presenceWrites, readPresenceReport, resolvePresence, type PresenceStatus } from "@/lib/presence";
import { getActiveSession } from "@/lib/server/active-session";
import { resolveUserRole, toIso } from "@/lib/server/admin";
import { commitServerPatches, countServerQuery, getServerDocument, isWriteConflict, runServerQuery } from "@/lib/server/firebase-rest";
import { planBadgeStateFor, syncPlanBadgeThrottled } from "@/lib/server/plan-badge";
import { getSubscription } from "@/lib/server/plans";
import { enforceRateLimit, enforceRateLimitWithFallback } from "@/lib/server/rate-limit";
import { isSameOrigin, jsonSecurityHeaders } from "@/lib/server/request-security";
import { readJsonBody } from "@/lib/server/validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/*
 * The signed-in user's own profile and settings, read and written on the
 * server. Account Settings and Hanogt AI use this instead of the Firestore
 * client SDK, so they keep working when the browser's Firebase connection
 * (custom-token bridge or security rules) is broken.
 */

type StoredDoc = Record<string, unknown> & { _updateTime?: string };
type RepairFields = Partial<Pick<EditableAccountFields, "username" | "nickname" | "nicknameTag">>;

const PATCH_MAX_BYTES = 32_000;
const WRITES_PER_MINUTE = 30;
const READS_PER_MINUTE = 120;
/** COUNT() stops here; the header shows "10000" for anyone above it. */
const STATS_CAP = 10_000;

const MESSAGES: Record<AccountProfileErrorCode, string> = {
    unauthorized: "Etkin oturum gerekli.",
    bad_origin: "Geçersiz istek kaynağı.",
    rate_limited: "Çok fazla istek. Biraz sonra tekrar deneyin.",
    invalid_body: "Geçerli bir JSON nesnesi gönderilmelidir.",
    unknown_field: "İstek desteklenmeyen bir alan içeriyor.",
    invalid_field: "Alan değeri geçersiz.",
    nickname_taken: "Bu takma ad ve etiket başka bir hesap tarafından kullanılıyor.",
    unavailable: "Profil hizmeti şu anda kullanılamıyor.",
};

function errorResponse(status: number, code: AccountProfileErrorCode, extra: Omit<Partial<AccountProfileErrorBody>, "code" | "error"> = {}, headers: Record<string, string> = {}) {
    const body: AccountProfileErrorBody = { error: MESSAGES[code], code, ...extra };
    return NextResponse.json(body, { status, headers: jsonSecurityHeaders(headers) });
}

function json(payload: AccountProfileResponse) {
    return NextResponse.json(payload, { headers: jsonSecurityHeaders() });
}

/** Username and avatar from the sign-in provider when the profile has none. */
function withSessionFallbacks(fields: EditableAccountFields, email: string, session: Session | null): EditableAccountFields {
    const next = { ...fields };
    if (!next.username) {
        const name = typeof session?.user?.name === "string" ? [...session.user.name.replace(/[<>]/g, "").trim()].slice(0, 100).join("").trim() : "";
        next.username = name || email.split("@")[0];
    }
    const image = typeof session?.user?.image === "string" ? session.user.image : "";
    if (!next.avatarUrl && image && isSafeProfileUrl(image)) next.avatarUrl = image;
    return next;
}

/** True when another account already uses `nickname#tag` (case-insensitive). A failing query allows the name. */
async function nicknameTaken(email: string, nickname: string, tag: string) {
    try {
        const matches = await runServerQuery<{ nickname?: unknown }>({
            collectionId: "public_profiles",
            where: [{ field: "nicknameTag", op: "EQUAL", value: tag }],
            select: ["nickname"],
            limit: 500,
        });
        return matches.some((profile) => profile._id.toLowerCase() !== email && typeof profile.nickname === "string" && sameNickname(profile.nickname, nickname));
    } catch (error) {
        console.warn("[account-profile] nickname check skipped:", error instanceof Error ? error.message : error);
        return false;
    }
}

async function pickFreeTag(email: string, nickname: string) {
    for (let attempt = 0; attempt < 5; attempt += 1) {
        const tag = String(randomInt(1000, 10_000));
        if (!(await nicknameTaken(email, nickname, tag))) return tag;
    }
    return String(randomInt(1000, 10_000));
}

/**
 * Identity fields every profile needs so friends can find it as
 * `nickname#tag`: missing ones get a default (and a free random tag).
 * `stored` is what the documents hold, `shown` includes session fallbacks.
 */
async function planRepair(email: string, stored: EditableAccountFields, shown: EditableAccountFields): Promise<RepairFields | null> {
    const repair: RepairFields = {};
    if (!stored.username) repair.username = shown.username;
    const nickname = stored.nickname || defaultNickname(shown.username, email);
    if (!stored.nickname) repair.nickname = nickname;
    if (!isNicknameTag(stored.nicknameTag)) repair.nicknameTag = await pickFreeTag(email, nickname);
    return Object.keys(repair).length ? repair : null;
}

/** Update mask: the defined fields of `data` plus `extra` (fields to delete). */
function maskOf(data: Record<string, unknown>, extra: string[] = []) {
    return [...new Set([...Object.entries(data).filter(([, value]) => value !== undefined).map(([key]) => key), ...extra])];
}

function publicFieldsOf(fields: EditableAccountFields) {
    return Object.fromEntries(PUBLIC_PROFILE_KEYS.map((key) => [key, fields[key]]));
}

/** Account facts shown next to the form; the stored role is never returned as such. */
function accountFacts(email: string, user: StoredDoc, planBadge: PlanBadgeState | null): AccountFacts {
    const role = resolveUserRole(email, user.role);
    const hasPassword = user.hasPassword === true;
    return {
        email,
        provider: typeof user.provider === "string" && user.provider ? user.provider.slice(0, 40) : hasPassword ? "credentials" : null,
        hasPassword,
        createdAt: toIso(user.createdAt),
        lastLoginAt: toIso(user.lastLoginAt ?? user.lastLoginDate),
        staffRole: role === "user" ? null : role,
        planBadge,
    };
}

/**
 * The Plus / Pro badge as its owner sees it; null when the plan can't be read
 * now. On a page load the public profile also catches up with the plan
 * (at most every ten minutes).
 */
async function loadPlanBadge(email: string, user: StoredDoc, catchUp: boolean): Promise<PlanBadgeState | null> {
    const staff = resolveUserRole(email, user.role) !== "user";
    try {
        const subscription = await getSubscription(email);
        if (catchUp) after(() => syncPlanBadgeThrottled(email, { subscription, staff }).then(() => undefined));
        return await planBadgeStateFor(email, subscription, staff);
    } catch {
        return null;
    }
}

async function loadStats(email: string, user: StoredDoc): Promise<AccountProfileResponse["stats"]> {
    const count = (collectionId: string, field: string, op: "EQUAL" | "ARRAY_CONTAINS") =>
        countServerQuery({ collectionId, where: [{ field, op, value: email }], upTo: STATS_CAP }).catch(() => null);
    const [projects, gameProjects, groups, mediaPosts] = await Promise.all([
        count("projects", "email", "EQUAL"),
        count("game_projects", "ownerEmail", "EQUAL"),
        count("groups", "members", "ARRAY_CONTAINS"),
        count("media_posts", "ownerEmail", "EQUAL"),
    ]);
    return { projects, gameProjects, groups, friends: Array.isArray(user.friends) ? user.friends.length : 0, mediaPosts };
}

/**
 * The displayed fields, repairing a missing username, nickname or tag on the
 * way. The repair is written to both documents with update-time
 * preconditions: when two requests race, the loser re-reads and shows the
 * winner's tag instead of a second random one.
 */
async function loadFields(email: string, session: Session | null, initialUser: StoredDoc, initialProfile: StoredDoc | null) {
    let user: StoredDoc | null = initialUser;
    let profile = initialProfile;
    for (let attempt = 0; ; attempt += 1) {
        const stored = mergeStoredAccount(user, profile);
        const shown = withSessionFallbacks(stored, email, session);
        const repair = await planRepair(email, stored, shown);
        if (!repair) return shown;
        const repaired = { ...shown, ...repair };
        const now = new Date();
        const data = { ...repair, email, updatedAt: now };
        try {
            await commitServerPatches([
                { path: `users/${email}`, data, ...(user?._updateTime ? { updateTime: user._updateTime } : {}) },
                profile
                    ? { path: `public_profiles/${email}`, data, ...(profile._updateTime ? { updateTime: profile._updateTime } : {}) }
                    // Accounts without a public profile get a full one, so others can find them.
                    : { path: `public_profiles/${email}`, data: { ...publicFieldsOf(repaired), email, updatedAt: now }, exists: false },
            ]);
            return repaired;
        } catch (error) {
            if (!isWriteConflict(error) || attempt >= 1) {
                console.warn("[account-profile] profile repair not saved:", error instanceof Error ? error.message : error);
                return repaired;
            }
            [user, profile] = await Promise.all([
                getServerDocument<Record<string, unknown>>(`users/${email}`),
                getServerDocument<Record<string, unknown>>(`public_profiles/${email}`),
            ]);
            if (!user) return repaired;
        }
    }
}

export async function GET() {
    const active = await getActiveSession();
    if (!active) return errorResponse(401, "unauthorized");
    const { email, session } = active;
    try {
        const rate = await enforceRateLimitWithFallback(`account-profile:read:${email}`, READS_PER_MINUTE, 60_000);
        if (!rate.allowed) return errorResponse(429, "rate_limited", {}, { "Retry-After": String(rate.retryAfterSeconds) });
        const user = active.user as StoredDoc;
        const profile = await getServerDocument<Record<string, unknown>>(`public_profiles/${email}`);
        const [fields, stats, planBadge] = await Promise.all([loadFields(email, session, user, profile), loadStats(email, user), loadPlanBadge(email, user, true)]);
        return json({ account: accountFacts(email, user, planBadge), fields, presence: effectiveStatus(profile), stats });
    } catch (error) {
        console.error("[account-profile:get]", error instanceof Error ? error.message : error);
        return errorResponse(503, "unavailable");
    }
}

export async function PATCH(request: NextRequest) {
    if (!isSameOrigin(request)) return errorResponse(403, "bad_origin");
    const active = await getActiveSession();
    if (!active) return errorResponse(401, "unauthorized");
    const { email, session } = active;

    let rate: Awaited<ReturnType<typeof enforceRateLimit>>;
    try {
        rate = await enforceRateLimit(`account-profile:write:${email}`, WRITES_PER_MINUTE, 60_000);
    } catch (error) {
        console.error("[account-profile:patch] rate limit", error instanceof Error ? error.message : error);
        return errorResponse(503, "unavailable");
    }
    if (!rate.allowed) return errorResponse(429, "rate_limited", {}, { "Retry-After": String(rate.retryAfterSeconds) });

    const body = await readJsonBody(request, PATCH_MAX_BYTES);
    if (!body) return errorResponse(400, "invalid_body");
    const result = sanitizeAccountPatch(body);
    if (!result.ok) {
        if (result.error.code === "unknown_field") return errorResponse(400, "unknown_field", { field: result.error.field });
        return errorResponse(400, "invalid_field", { field: result.error.field, reason: result.error.code });
    }

    try {
        const user = active.user as StoredDoc;
        const profile = await getServerDocument<Record<string, unknown>>(`public_profiles/${email}`);
        const stored = mergeStoredAccount(user, profile);
        const requested: AccountProfilePatch = { ...result.patch };
        // "Do Not Disturb" from an older client: the status preference holds it now,
        // and the presence write below keeps the public dndMode in step.
        if (typeof requested.dndMode === "boolean" && requested.statusPreference === undefined) {
            requested.statusPreference = requested.dndMode ? "dnd" : stored.statusPreference === "dnd" ? "auto" : stored.statusPreference;
        }
        delete requested.dndMode;
        const afterPatch = { ...stored, ...requested };
        // Missing identity fields are repaired in the same commit as the change.
        const repair = await planRepair(email, afterPatch, withSessionFallbacks(afterPatch, email, session));
        const patch: AccountProfilePatch = { ...repair, ...requested };

        if ("nickname" in result.patch || "nicknameTag" in result.patch) {
            const nickname = patch.nickname ?? stored.nickname;
            const tag = patch.nicknameTag ?? stored.nicknameTag;
            const changed = nickname !== stored.nickname || tag !== stored.nicknameTag;
            if (changed && isNicknameTag(tag) && nickname && await nicknameTaken(email, nickname, tag)) {
                return errorResponse(409, "nickname_taken", { field: "nickname" in result.patch ? "nickname" : "nicknameTag" });
            }
        }

        // The friend count comes from the users document and the badge from the plan: this patch changes neither.
        const statsPromise = loadStats(email, user);
        const planBadgePromise = loadPlanBadge(email, user, false);
        let nextUser = user;
        let nextProfile = profile;
        let presenceStatus: PresenceStatus | null = null;
        if (Object.keys(patch).length) {
            const now = new Date();
            const { publicPatch } = splitAccountPatch(patch);
            const final = { ...stored, ...patch };
            // The status preference and the privacy settings apply at once: the
            // status is published again (saving a setting means the person is here).
            let presence: ReturnType<typeof presenceWrites> | null = null;
            if (["statusPreference", "showOnlineStatus", "showLastSeen"].some((key) => key in patch)) {
                const previous = readPresenceReport(user.presenceState);
                presenceStatus = resolvePresence(final.statusPreference, "active", final.showOnlineStatus);
                presence = presenceWrites({
                    report: { activity: "active", tab: previous?.tab ?? "", at: now.getTime(), status: presenceStatus },
                    invisible: final.statusPreference === "invisible" || !final.showOnlineStatus,
                    showLastSeen: final.showLastSeen,
                    previousStatus: previous?.status ?? null,
                    force: true,
                });
            }
            // The status is text only now: saving it deletes an emoji stored with it before.
            const retired = "customStatus" in patch ? RETIRED_ACCOUNT_KEYS : [];
            const userData = { ...patch, email, updatedAt: now, ...presence?.user.data };
            const writes: Parameters<typeof commitServerPatches>[0] = [{ path: `users/${email}`, data: userData, updateFields: maskOf(userData, [...presence?.user.mask ?? [], ...retired]) }];
            let profileData: Record<string, unknown> | null = null;
            if (profile) {
                if (Object.keys(publicPatch).length) profileData = { ...publicPatch, email, updatedAt: now };
            } else {
                // No public profile yet: mirror every public field, not just the changed ones.
                profileData = { ...publicFieldsOf(withSessionFallbacks(final, email, session)), email, updatedAt: now };
            }
            if (profileData || presence?.profile) {
                const data = { ...profileData, ...presence?.profile?.data };
                // A field in the mask without a value is deleted (lastSeenAt while "show last seen" is off).
                writes.push({ path: `public_profiles/${email}`, data, updateFields: maskOf(data, [...presence?.profile?.mask ?? [], ...retired]) });
                profileData = data;
            }
            // updateMask = the given fields only: friends, role and badges stay untouched.
            await commitServerPatches(writes);
            nextUser = { ...user, ...userData };
            nextProfile = profileData ? { ...(profile ?? {}), ...profileData } : profile;
        }

        const fields = withSessionFallbacks(mergeStoredAccount(nextUser, nextProfile), email, session);
        return json({ account: accountFacts(email, nextUser, await planBadgePromise), fields, presence: presenceStatus ?? effectiveStatus(nextProfile), stats: await statsPromise });
    } catch (error) {
        console.error("[account-profile:patch]", error instanceof Error ? error.message : error);
        return errorResponse(503, "unavailable");
    }
}
