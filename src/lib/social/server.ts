import "server-only";

import { NextResponse, type NextRequest } from "next/server";
import { readPlanBadge } from "@/lib/plan-badge";
import { effectiveStatus, lastSeenTime, presenceTime } from "@/lib/presence";
import { getActiveSession } from "@/lib/server/active-session";
import { getServerDocument } from "@/lib/server/firebase-rest";
import { enforceRateLimitWithFallback } from "@/lib/server/rate-limit";
import { isSameOrigin, jsonSecurityHeaders } from "@/lib/server/request-security";
import { normalizeEmail } from "@/lib/server/validate";
import type { PersonCard, SocialPerson, SocialProfile, StaffRoleBadge } from "./model";

/*
 * Server side of Hanogt Social: request guards, error responses and the
 * mapping of public_profiles documents to the people the interface shows.
 * Everything here runs with the service account, so every route checks the
 * session, friendship or membership itself before reading anything.
 */

export type SocialErrorCode =
    | "unauthorized" | "forbidden_origin" | "rate_limited" | "invalid_request" | "payload_too_large"
    | "invalid_email" | "invalid_id" | "not_found" | "not_friend" | "blocked" | "forbidden"
    | "message_not_found" | "empty_message" | "message_too_long" | "invalid_tag" | "user_not_found"
    | "already_friends" | "request_exists" | "self_action" | "cannot_add" | "conflict" | "server_error";

/** Expected failures: the message is Turkish (primary language), the code is translated by the interface. */
export class SocialApiError extends Error {
    readonly status: number;
    readonly code: SocialErrorCode;
    readonly headers: Record<string, string>;

    constructor(status: number, code: SocialErrorCode, message: string, headers: Record<string, string> = {}) {
        super(message);
        this.name = "SocialApiError";
        this.status = status;
        this.code = code;
        this.headers = headers;
    }
}

export function socialJson(data: unknown, status = 200) {
    return NextResponse.json(data, { status, headers: jsonSecurityHeaders() });
}

export function socialErrorResponse(error: unknown, scope = "social") {
    if (error instanceof SocialApiError) {
        return NextResponse.json({ error: error.message, code: error.code }, { status: error.status, headers: jsonSecurityHeaders(error.headers) });
    }
    // Only the message is logged: request bodies and message texts stay out of the logs.
    console.error(`[${scope}] request failed:`, error instanceof Error ? error.message : "unknown error");
    return NextResponse.json({ error: "İşlem tamamlanamadı. Lütfen tekrar deneyin.", code: "server_error" }, { status: 500, headers: jsonSecurityHeaders() });
}

export type SocialUser = {
    email: string;
    friends: string[];
    blockedUsers: string[];
    /** The rest of users/{email} (private settings). */
    record: Record<string, unknown>;
    sessionName: string;
};

export function emailList(value: unknown, max = 500): string[] {
    if (!Array.isArray(value)) return [];
    const result = new Set<string>();
    for (const entry of value) {
        const email = normalizeEmail(entry);
        if (email) result.add(email);
        if (result.size >= max) break;
    }
    return [...result];
}

export async function requireSocialUser(): Promise<SocialUser> {
    const active = await getActiveSession();
    if (!active) throw new SocialApiError(401, "unauthorized", "Etkin oturum gerekli.");
    const record = active.user as Record<string, unknown>;
    const sessionName = typeof active.session?.user?.name === "string" ? active.session.user.name.trim() : "";
    return { email: active.email, friends: emailList(record.friends), blockedUsers: emailList(record.blockedUsers), record, sessionName };
}

export function assertSameOrigin(request: NextRequest) {
    if (!isSameOrigin(request)) throw new SocialApiError(403, "forbidden_origin", "Geçersiz istek kaynağı.");
}

export async function assertRateLimit(key: string, limit: number, windowMs = 60_000) {
    const result = await enforceRateLimitWithFallback(key, limit, windowMs);
    if (!result.allowed) {
        throw new SocialApiError(429, "rate_limited", "Çok fazla istek. Biraz sonra tekrar deneyin.", { "Retry-After": String(result.retryAfterSeconds) });
    }
}

/** Parses a small JSON object body; anything else is rejected before it reaches the handlers. */
export async function readBody(request: NextRequest, maxBytes = 16_384): Promise<Record<string, unknown>> {
    const declared = Number(request.headers.get("content-length") || 0);
    if (declared > maxBytes) throw new SocialApiError(413, "payload_too_large", "İstek çok büyük.");
    const text = await request.text().catch(() => "");
    if (text.length > maxBytes) throw new SocialApiError(413, "payload_too_large", "İstek çok büyük.");
    let parsed: unknown = {};
    if (text.trim()) {
        try {
            parsed = JSON.parse(text);
        } catch {
            throw new SocialApiError(400, "invalid_request", "Geçersiz istek gövdesi.");
        }
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new SocialApiError(400, "invalid_request", "Geçersiz istek gövdesi.");
    return parsed as Record<string, unknown>;
}

/** Another person's address from a parameter; the caller's own address is refused. */
export function readPartner(value: unknown, me: string) {
    const email = normalizeEmail(value);
    if (!email) throw new SocialApiError(400, "invalid_email", "Geçersiz kullanıcı.");
    if (email === me) throw new SocialApiError(400, "self_action", "Bu işlemi kendi hesabınıza uygulayamazsınız.");
    return email;
}

/** Milliseconds from a query parameter; anything else (or a time far in the future) counts as missing. */
export function readCursor(value: string | null) {
    if (!value || !/^[0-9]{1,15}$/.test(value)) return 0;
    const time = Number(value);
    return time > 0 && time < Date.now() + 86_400_000 ? time : 0;
}

export async function mapLimit<T, R>(items: readonly T[], limit: number, worker: (item: T, index: number) => Promise<R>): Promise<R[]> {
    const results = new Array<R>(items.length);
    let next = 0;
    const run = async () => {
        while (next < items.length) {
            const index = next;
            next += 1;
            results[index] = await worker(items[index], index);
        }
    };
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
    return results;
}

/* -------------------------------------------------------------------------- */
/* Profiles                                                                   */
/* -------------------------------------------------------------------------- */

export type StoredProfile = Record<string, unknown> & {
    username?: unknown;
    avatarUrl?: unknown;
    nickname?: unknown;
    nicknameTag?: unknown;
    customStatus?: unknown;
    staffRole?: unknown;
};

/** public_profiles documents of the given addresses (missing or unreadable ones map to null). */
export async function loadPublicProfiles(emails: readonly string[], max = 400) {
    const unique = [...new Set(emails)].filter((email) => normalizeEmail(email) === email).slice(0, max);
    const entries = await mapLimit(unique, 12, async (email) => [email, await getServerDocument<StoredProfile>(`public_profiles/${email}`).catch(() => null)] as const);
    return new Map<string, StoredProfile | null>(entries);
}

const text = (value: unknown, max: number) => (typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max) : "");
/** Like text(), but line breaks stay (bios are shown with their paragraphs). */
const multiline = (value: unknown, max: number) => (typeof value === "string" ? value.replace(/\r\n?/g, "\n").replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, " ").replace(/\n{3,}/g, "\n\n").trim().slice(0, max) : "");
const httpsUrl = (value: unknown) => (typeof value === "string" && value.length <= 2048 && /^https:\/\/[^\s"'<>`]+$/.test(value) ? value : null);
const STAFF_ROLES: readonly StaffRoleBadge[] = ["owner", "admin", "moderator"];

/** `revealEmail` false: a person without a username isn't named after their address (request cards of strangers). */
export function personCard(email: string, profile: StoredProfile | null | undefined, revealEmail = true): PersonCard {
    const nickname = text(profile?.nickname, 100);
    const tag = typeof profile?.nicknameTag === "string" && /^[0-9]{4}$/.test(profile.nicknameTag) ? profile.nicknameTag : "";
    return {
        username: text(profile?.username, 60) || (revealEmail ? email.split("@")[0] : "") || "Hanogt",
        avatarUrl: httpsUrl(profile?.avatarUrl),
        nickname: nickname && tag ? nickname : "",
        nicknameTag: nickname && tag ? tag : "",
        staffRole: STAFF_ROLES.find((role) => role === profile?.staffRole) ?? null,
        planBadge: readPlanBadge(profile?.planBadge),
    };
}

/**
 * A person with presence. `withPresence` is false for people the caller has
 * no relation to that would justify seeing it (they then look offline).
 */
export function socialPerson(email: string, profile: StoredProfile | null | undefined, withPresence = true, now = Date.now()): SocialPerson {
    const seen = withPresence ? lastSeenTime(profile) : 0;
    return {
        ...personCard(email, profile),
        email,
        customStatus: withPresence ? text(profile?.customStatus, 120) : "",
        status: withPresence ? effectiveStatus(profile, now) : "offline",
        lastSeenAt: seen ? new Date(seen).toISOString() : null,
    };
}

const PROFILE_LINKS = ["socialGithub", "socialLinkedin", "socialTwitter", "socialWebsite"] as const;

function toIso(value: unknown) {
    const time = presenceTime(value);
    return time ? new Date(time).toISOString() : null;
}

/** Full profile card (Profili görüntüle). `showBio` follows the person's bio visibility setting. */
export function socialProfile(email: string, profile: StoredProfile | null | undefined, options: { showBio: boolean; withPresence: boolean }, now = Date.now()): SocialProfile {
    const { showBio, withPresence } = options;
    const links = Object.fromEntries(PROFILE_LINKS.map((key) => [key, text(profile?.[key], 200)])) as Record<(typeof PROFILE_LINKS)[number], string>;
    const accent = typeof profile?.accentColor === "string" && /^#[0-9a-fA-F]{3,8}$/.test(profile.accentColor) ? profile.accentColor : "";
    const stored = withPresence && profile?.presence && typeof profile.presence === "object" ? profile.presence as Record<string, unknown> : null;
    const presence = stored && typeof stored.status === "string"
        ? { status: stored.status.slice(0, 16), updatedAt: toIso(stored.updatedAt), expiresAt: toIso(stored.expiresAt) }
        : null;
    return {
        ...socialPerson(email, profile, withPresence, now),
        presence,
        ...links,
        bio: showBio ? multiline(profile?.bio, 600) : "",
        bannerUrl: httpsUrl(profile?.bannerUrl) ?? "",
        accentColor: accent,
        favoriteLangs: Array.isArray(profile?.favoriteLangs) ? profile.favoriteLangs.filter((lang): lang is string => typeof lang === "string").map((lang) => lang.slice(0, 30)).slice(0, 12) : [],
        badges: Array.isArray(profile?.badges) ? profile.badges.filter((badge): badge is string => typeof badge === "string").map((badge) => badge.slice(0, 40)).slice(0, 20) : [],
        publicProjects: profile?.publicProjects === true,
    };
}

/** The other participant of a two-person chat document, or null for anything else. */
export function chatPartner(participants: unknown, me: string) {
    const list = emailList(participants, 3);
    if (list.length !== 2 || !list.includes(me)) return null;
    return list.find((email) => email !== me) ?? null;
}
