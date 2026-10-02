import type { NextRequest } from "next/server";
import { getServerDocument, queryServerCollection } from "@/lib/server/firebase-rest";
import { groupColor, groupEmoji, isGroupId } from "@/lib/groups";
import { dmChatId, type MutualGroup, type SocialProfileResponse } from "@/lib/social/model";
import {
    SocialApiError,
    assertRateLimit,
    emailList,
    readPartner,
    requireSocialUser,
    socialErrorResponse,
    socialJson,
    socialProfile,
    type StoredProfile,
} from "@/lib/social/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type StoredGroup = { name?: unknown; emoji?: unknown; color?: unknown; members?: unknown };

/**
 * A person's profile card for Hanogt Social (direct-message sidebar, member
 * list, "Profili görüntüle"). Only people the caller is connected to (a
 * friend, a conversation or a shared group) can be looked up; the bio follows
 * the person's bio visibility setting.
 */
export async function GET(request: NextRequest) {
    try {
        const user = await requireSocialUser();
        await assertRateLimit(`social:profile:${user.email}`, 60);
        const target = readPartner(request.nextUrl.searchParams.get("email"), user.email);
        const isFriend = user.friends.includes(target);
        const [chat, groups] = await Promise.all([
            getServerDocument<{ participants?: unknown }>(`chats/${dmChatId(user.email, target)}`),
            queryServerCollection<StoredGroup>("groups", "members", "ARRAY_CONTAINS", user.email, { limit: 100 }),
        ]);
        const mutualGroups: MutualGroup[] = groups
            .filter((group) => isGroupId(group._id) && emailList(group.members, 100).includes(target))
            .map((group) => ({
                id: group._id,
                name: typeof group.name === "string" ? group.name.slice(0, 60) : "Hanogt",
                emoji: groupEmoji(group.emoji),
                color: groupColor(group.color),
            }))
            .sort((a, b) => a.name.localeCompare(b.name, "tr"));
        const inChat = Boolean(chat && emailList(chat.participants, 3).includes(user.email));
        if (!isFriend && !inChat && !mutualGroups.length) throw new SocialApiError(404, "not_found", "Profil bulunamadı.");
        const [profile, record] = await Promise.all([
            getServerDocument<StoredProfile>(`public_profiles/${target}`),
            getServerDocument<{ bioVisibility?: unknown }>(`users/${target}`),
        ]);
        const visibility = record?.bioVisibility;
        const showBio = visibility === "nobody" ? false : visibility === "friends" ? isFriend : true;
        // Presence is shared with friends and with people in the same group (the member list shows it too).
        const person = socialProfile(target, profile, { showBio, withPresence: isFriend || mutualGroups.length > 0 });
        const response: SocialProfileResponse = { person, isFriend, mutualGroups };
        return socialJson(response);
    } catch (error) {
        return socialErrorResponse(error, "social/profile");
    }
}
