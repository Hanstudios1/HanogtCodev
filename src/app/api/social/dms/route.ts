import { queryServerCollection, runServerQuery } from "@/lib/server/firebase-rest";
import { dmChatId, previewText, sortDms, timeOf, type DmSummary } from "@/lib/social/model";
import {
    assertRateLimit,
    chatPartner,
    loadPublicProfiles,
    mapLimit,
    requireSocialUser,
    socialErrorResponse,
    socialJson,
    socialPerson,
} from "@/lib/social/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type StoredChat = { participants?: unknown; lastMessage?: unknown; lastMessageAt?: unknown; lastSender?: unknown; typingUser?: unknown; updatedAt?: unknown };

const CHATS_MAX = 150;
const UNREAD_MAX = 100;
/** A typing flag the sender didn't refresh within this time is stale (clients refresh it every 3 s). */
const TYPING_FRESH_MS = 8_000;

/** Unread messages from the partner (the `read` flag is the existing read-receipt mechanism). */
async function unreadFrom(chatPath: string, partner: string) {
    try {
        const records = await runServerQuery<{ fromEmail?: unknown }>({
            collectionId: "messages",
            parentPath: chatPath,
            where: [{ field: "read", op: "EQUAL", value: false }],
            select: ["fromEmail"],
            limit: UNREAD_MAX,
        });
        return records.filter((record) => record.fromEmail === partner).length;
    } catch {
        return 0;
    }
}

/**
 * The signed-in user's direct conversations, newest first, for browsers that
 * can't listen to chats/ directly. Conversations with people the user blocked
 * are left out (the blocked list shows them).
 */
export async function GET() {
    try {
        const user = await requireSocialUser();
        const { email } = user;
        await assertRateLimit(`social:dms:${email}`, 120);
        const chats = await queryServerCollection<StoredChat>("chats", "participants", "ARRAY_CONTAINS", email, { limit: CHATS_MAX });
        const blocked = new Set(user.blockedUsers);
        const friends = new Set(user.friends);
        const entries = chats.flatMap((chat) => {
            const partner = chatPartner(chat.participants, email);
            // Only conversations reachable at /social/dm/<partner> that have a message are listed.
            if (!partner || blocked.has(partner) || chat._id !== dmChatId(email, partner) || !timeOf(chat.lastMessageAt)) return [];
            return [{ chat, partner }];
        });
        const [profiles, unread] = await Promise.all([
            loadPublicProfiles(entries.map((entry) => entry.partner)),
            mapLimit(entries, 6, ({ chat, partner }) => (chat.lastSender === email ? Promise.resolve(0) : unreadFrom(chat._path, partner))),
        ]);
        const now = Date.now();
        const dms: DmSummary[] = entries.map(({ chat, partner }, index) => {
            const isFriend = friends.has(partner);
            const typingAt = timeOf(chat.updatedAt);
            return {
                chatId: chat._id,
                // Presence is shared between friends only.
                partner: socialPerson(partner, profiles.get(partner), isFriend, now),
                isFriend,
                lastMessage: previewText(chat.lastMessage),
                lastMessageAt: timeOf(chat.lastMessageAt),
                lastFromMe: chat.lastSender === email,
                unread: unread[index] ?? 0,
                typing: chat.typingUser === partner && now - typingAt < TYPING_FRESH_MS,
            };
        });
        return socialJson({ dms: sortDms(dms) });
    } catch (error) {
        return socialErrorResponse(error, "social/dms");
    }
}
