"use client";

import { createContext, useContext } from "react";
import type { ConfirmOptions, ToastTone } from "@/components/Groups/ui";
import type { Copy } from "@/lib/i18n";
import type { GroupInvitationItem, GroupListItem } from "@/lib/groups";
import type { PresenceStatus } from "@/lib/presence";
import type { SocialAudio } from "@/lib/social/local-state";
import type {
    BlockedItem,
    DmSummary,
    FriendRequestItem,
    GroupNotifyLevel,
    GroupUnread,
    SocialMode,
    SocialPerson,
    SocialRoute,
} from "@/lib/social/model";

export type SocialMe = {
    email: string;
    username: string;
    avatarUrl: string | null;
    nickname: string;
    nicknameTag: string;
    customStatus: string;
    status: PresenceStatus;
};

export type SocialContextValue = {
    me: SocialMe;
    mode: SocialMode;
    /** The client SDK can be used (realtime listeners, voice messages, files, calls). */
    live: boolean;
    markBroken: () => void;
    route: SocialRoute;
    /** Ticks every 30 s for relative times. */
    now: number;

    friends: {
        list: SocialPerson[];
        incoming: FriendRequestItem[];
        outgoing: FriendRequestItem[];
        blocked: BlockedItem[];
        loaded: boolean;
        failed: boolean;
        refresh: () => Promise<void>;
    };
    isFriend: (email: string) => boolean;
    isBlocked: (email: string) => boolean;
    /** Best known data of a person (live presence, friends list or conversation list). */
    person: (email: string) => SocialPerson | null;

    dms: {
        /** Every conversation, newest first. */
        list: DmSummary[];
        /** Without the ones the user closed (the open one always stays). */
        visible: DmSummary[];
        loaded: boolean;
        unreadTotal: number;
        refresh: () => Promise<void>;
        hide: (chatId: string, lastMessageAt: number) => void;
    };

    groups: {
        list: GroupListItem[];
        invites: GroupInvitationItem[];
        loaded: boolean;
        failed: boolean;
        unread: Record<string, GroupUnread>;
        levels: Record<string, GroupNotifyLevel>;
        refresh: () => Promise<void>;
        patch: (groupId: string, patch: Partial<GroupListItem>) => void;
    };

    homeBadge: number;

    /** Friend actions with toasts; resolves to true on success. */
    friendAction: (body: Record<string, unknown>, success?: Copy) => Promise<boolean>;
    notify: (text: string, tone?: ToastTone) => void;
    confirm: (options: ConfirmOptions) => Promise<boolean>;
    errorText: (error: unknown, fallback?: Copy) => string;

    audio: SocialAudio & { toggleMic: () => void; toggleDeafen: () => void };

    ui: {
        openSwitcher: () => void;
        openCreateGroup: () => void;
        openJoin: () => void;
        /** Mobile: rail + sidebar drawer. */
        navOpen: boolean;
        setNavOpen: (open: boolean) => void;
        /** Wide screens: the right column (members / profile) is collapsed. */
        asideCollapsed: boolean;
        /** Narrow screens: the right column is shown as a drawer. */
        asideOpen: boolean;
        toggleAside: () => void;
        closeAside: () => void;
        /** True from the `lg` breakpoint on (the right column is a column, not a drawer). */
        wide: boolean;
        /** True from the `md` breakpoint on (rail and sidebar are always visible). */
        desktop: boolean;
    };
};

export const SocialContext = createContext<SocialContextValue | null>(null);

export function useSocial() {
    const value = useContext(SocialContext);
    if (!value) throw new Error("useSocial must be used inside Hanogt Social");
    return value;
}
