"use client";

import { createContext, useContext } from "react";
import type { Copy } from "@/lib/i18n";
import type { GroupDetailResponse, GroupInfo, GroupRole } from "@/lib/groups";
import type { ConfirmOptions, ToastTone } from "../ui";
import type { WorkspaceMember } from "./model";

export type WorkspaceContextValue = {
    groupId: string;
    /** Group document merged with its live snapshot. */
    group: GroupInfo;
    members: WorkspaceMember[];
    me: WorkspaceMember;
    role: GroupRole;
    isManager: boolean;
    isOwner: boolean;
    canInvite: boolean;
    memberByEmail: Map<string, WorkspaceMember>;
    memberByKey: Map<string, WorkspaceMember>;
    usernames: string[];
    stats: GroupDetailResponse["stats"];
    banned: GroupDetailResponse["banned"];
    /** Wall clock that ticks every 30 s for relative times. */
    now: number;
    notify: (text: string, tone?: ToastTone) => void;
    confirm: (options: ConfirmOptions) => Promise<boolean>;
    errorText: (error: unknown, fallback?: Copy) => string;
    refresh: () => Promise<void>;
};

export const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function useWorkspace() {
    const value = useContext(WorkspaceContext);
    if (!value) throw new Error("useWorkspace must be used inside the group workspace");
    return value;
}
