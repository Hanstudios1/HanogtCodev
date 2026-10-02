import { runServerQuery } from "@/lib/server/firebase-rest";
import { normalizeEmail } from "@/lib/server/validate";
import type { FriendRequestItem, FriendsOverview } from "@/lib/social/model";
import {
    assertRateLimit,
    loadPublicProfiles,
    personCard,
    requireSocialUser,
    socialErrorResponse,
    socialJson,
    socialPerson,
    type SocialUser,
} from "@/lib/social/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type StoredRequest = { fromEmail?: unknown; toEmail?: unknown; status?: unknown; createdAt?: unknown };

const REQUESTS_MAX = 100;

function iso(value: unknown) {
    const time = typeof value === "string" ? Date.parse(value) : value instanceof Date ? value.getTime() : Number.NaN;
    return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

/** Pending requests in one direction (the composite indexes on toEmail/fromEmail + status serve these). */
async function pendingRequests(field: "toEmail" | "fromEmail", email: string) {
    const records = await runServerQuery<StoredRequest>({
        collectionId: "friendRequests",
        where: [{ field, op: "EQUAL", value: email }, { field: "status", op: "EQUAL", value: "pending" }],
        limit: REQUESTS_MAX,
    });
    const other = field === "toEmail" ? "fromEmail" : "toEmail";
    return records
        .map((record) => ({ id: record._id, email: normalizeEmail(record[other]), createdAt: iso(record.createdAt) }))
        .filter((entry): entry is { id: string; email: string; createdAt: string | null } => Boolean(entry.email) && entry.email !== email);
}

/**
 * Friends with presence, pending requests in both directions and the people
 * the user blocked. Request lists show name cards only: no addresses of
 * people who aren't friends, and no presence.
 */
async function overview(user: SocialUser): Promise<FriendsOverview> {
    const { email, friends, blockedUsers } = user;
    const friendSet = new Set(friends);
    const blockedSet = new Set(blockedUsers);
    const [incomingRaw, outgoingRaw] = await Promise.all([pendingRequests("toEmail", email), pendingRequests("fromEmail", email)]);
    // Requests involving blocked people and between people who are friends already are left out.
    const incoming = incomingRaw.filter((entry) => !blockedSet.has(entry.email) && !friendSet.has(entry.email));
    const outgoing = outgoingRaw.filter((entry) => !blockedSet.has(entry.email) && !friendSet.has(entry.email));
    const profiles = await loadPublicProfiles([...friends, ...incoming.map((entry) => entry.email), ...outgoing.map((entry) => entry.email), ...blockedUsers]);
    const now = Date.now();
    const request = (entry: { id: string; email: string; createdAt: string | null }): FriendRequestItem => ({
        id: entry.id,
        createdAt: entry.createdAt,
        person: personCard(entry.email, profiles.get(entry.email), false),
    });
    return {
        friends: friends.map((friend) => socialPerson(friend, profiles.get(friend), true, now)),
        incoming: incoming.map(request),
        outgoing: outgoing.map(request),
        blocked: blockedUsers.map((blocked) => ({ ...personCard(blocked, profiles.get(blocked)), email: blocked })),
    };
}

export async function GET() {
    try {
        const user = await requireSocialUser();
        await assertRateLimit(`social:friends:${user.email}`, 60);
        return socialJson(await overview(user));
    } catch (error) {
        return socialErrorResponse(error, "social/friends");
    }
}
