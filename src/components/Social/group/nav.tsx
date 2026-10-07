"use client";

import { createContext, useContext } from "react";
import type { SettingsTab } from "@/components/Groups/workspace/SettingsDialog";
import type { GroupInfo, GroupRole } from "@/lib/groups";
import type { ChannelUnread } from "@/lib/social/model";

/**
 * What the group sidebar (owned by the shell) needs from the open group
 * (owned by the group page): the page publishes it, so switching groups
 * never remounts the rail and sidebar.
 */
export type GroupNavState = {
    groupId: string;
    phase: "loading" | "ready" | "error" | "gone";
    group: GroupInfo | null;
    role: GroupRole | null;
    canInvite: boolean;
    isManager: boolean;
    fileCount: number;
    filesAvailable: boolean;
    pinnedCount: number;
    /** The Rules section: how many rules and whether this person still has to accept them. */
    rules: { count: number; mustAccept: boolean };
    guide: { show: boolean; done: number; total: number; open: boolean };
    /** Unread messages and mentions per channel ("" = the main channel, else a #topic). */
    channelUnread: Record<string, ChannelUnread>;
    openInvite: () => void;
    openSettings: (tab: SettingsTab) => void;
    leave: () => void;
    toggleGuide: () => void;
    showPinned: () => void;
};

export type GroupNavSlot = { nav: GroupNavState | null; publish: (nav: GroupNavState | null) => void };

export const GroupNavContext = createContext<GroupNavSlot>({ nav: null, publish: () => undefined });

export function useGroupNav() {
    return useContext(GroupNavContext);
}
