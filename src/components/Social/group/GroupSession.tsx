"use client";

import { doc, onSnapshot } from "firebase/firestore";
import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { GroupRequestError, groupsApi, useGroupErrorText, type GroupClientErrorCode } from "@/components/Groups/api";
import { storageGet, storageSet } from "@/components/Groups/ui";
import { WorkspaceContext, type WorkspaceContextValue } from "@/components/Groups/workspace/context";
import type { ChecklistStep } from "@/components/Groups/workspace/GettingStarted";
import { useGroupFiles, useGroupMessages } from "@/components/Groups/workspace/hooks";
import InviteDialog from "@/components/Groups/workspace/InviteDialog";
import {
    EDITOR_TABS_KEY,
    EDITOR_TABS_MAX,
    downloadName,
    liveGroupFromData,
    mimeFor,
    roleFor,
    saveBlob,
    type GroupFileItem,
    type LiveGroupFields,
    type WorkspaceMember,
} from "@/components/Groups/workspace/model";
import SettingsDialog, { type SettingsTab } from "@/components/Groups/workspace/SettingsDialog";
import { useVoiceCall } from "@/components/VoiceCallProvider";
import { db } from "@/lib/firebase";
import { useI18n, type Copy } from "@/lib/i18n";
import {
    SYSTEM_SENDER,
    WELCOME_MESSAGE_ID,
    groupColor,
    groupEmoji,
    isGroupId,
    isManagerRole,
    mustAcceptRules as rulesStillToAccept,
    toMillis,
    type GroupDetailResponse,
    type GroupInfo,
} from "@/lib/groups";
import { PLAN_GROUP_FEATURES } from "@/lib/plans";
import { useLiveProfiles, usePoll } from "@/lib/social/hooks";
import { getGroupReadAt } from "@/lib/social/local-state";
import { SOCIAL_POLL, channelUnreadState, groupHref } from "@/lib/social/model";
import { useSocial } from "../context";
import { nextPopout, type PopoutState } from "../UserPopout";
import { useGroupNav, type GroupNavState } from "./nav";

/** Members whose presence is watched live in one group (a listener each); a 250-member group doesn't open 250. */
const LIVE_PROFILES_MAX = 50;

const C = {
    fileCreated: { TR: "{name} oluşturuldu.", EN: "{name} was created." },
    fileRenamed: { TR: "Dosya yeniden adlandırıldı.", EN: "The file was renamed." },
    fileDeleteTitle: { TR: "{name} silinsin mi?", EN: "Delete {name}?" },
    fileDeleteBody: { TR: "Dosya tüm üyeler için kalıcı olarak silinir.", EN: "The file is deleted permanently for all members." },
    fileDeleteConfirm: { TR: "Dosyayı sil", EN: "Delete file" },
    fileDeleted: { TR: "Dosya silindi.", EN: "The file was deleted." },
    editorOpened: { TR: "Düzenleyici'de bir kopya açıldı; oradaki değişiklikler gruba yansımaz.", EN: "A copy was opened in the Editor; changes there don't sync back to the group." },
    pinHint: { TR: "Sabitlemek istediğin mesajın üzerine gel ve 📌 simgesine bas.", EN: "Hover the message you want to pin and press 📌." },
    leaveTitle: { TR: "{name} grubundan ayrılmak istediğine emin misin?", EN: "Are you sure you want to leave {name}?" },
    leaveBody: { TR: "Dosyalara ve sohbete erişimini kaybedersin. Yeniden katılmak için davet gerekir.", EN: "You lose access to the files and chat. You'll need an invitation to rejoin." },
    leaveConfirm: { TR: "Gruptan ayrıl", EN: "Leave the group" },
    left: { TR: "Gruptan ayrıldın.", EN: "You left the group." },
    deleted: { TR: "Grup ve tüm içeriği silindi.", EN: "The group and all of its content were deleted." },
} satisfies Record<string, Copy>;

export type GroupPanel = "members" | "pinned";

export type GroupSession = {
    groupId: string;
    phase: "loading" | "ready" | "error" | "gone";
    loadError: string;
    retry: () => void;
    /** Ready once the group is loaded; the workspace components read it through WorkspaceContext. */
    context: WorkspaceContextValue | null;
    files: ReturnType<typeof useGroupFiles>;
    filesAvailable: boolean;
    messages: ReturnType<typeof useGroupMessages>;
    typingNames: string[];
    onTyping: (text: string) => void;
    stopTyping: () => void;
    /** When the group was last read before it was opened (the "new messages" divider). */
    lastReadAt: number;
    openInvite: () => void;
    openSettings: (tab: SettingsTab) => void;
    newFile: { open: boolean; key: number };
    openNewFile: () => void;
    closeNewFile: () => void;
    createFile: (name: string, code: string) => Promise<string | null>;
    renameFile: (file: GroupFileItem, name: string) => Promise<boolean>;
    deleteFile: (file: GroupFileItem) => void;
    downloadFile: (file: GroupFileItem) => void;
    downloadAll: () => void;
    zipBusy: boolean;
    openInEditor: (files: GroupFileItem[]) => void;
    checklist: ChecklistStep[];
    showGuide: boolean;
    guideOpen: boolean;
    setGuideOpen: (open: boolean) => void;
    dismissGuide: () => void;
    dismissing: boolean;
    callMember: (member: WorkspaceMember) => void;
    panel: GroupPanel;
    setPanel: (panel: GroupPanel) => void;
    focusNonce: number;
    focusComposer: () => void;
    jumpTarget: { id: string; nonce: number } | null;
    jumpTo: (messageId: string) => void;
    leave: () => Promise<void>;
    /** The profile card opened from the chat or the member list. */
    userCard: PopoutState | null;
    openUserCard: (email: string, trigger: HTMLElement) => void;
    closeUserCard: () => void;
    /** The channel ("" = the main one, else a #topic) is on screen up to `time`. */
    markChannelRead: (topic: string, time: number) => void;
    /** The group's rules must still be accepted before this person can take part. */
    mustAcceptRules: boolean;
    /** The rules version this person accepted (0: never). */
    rulesAcceptedVersion: number;
    /** "I've read and accept the rules": records the shown version; false when it didn't go through (a toast says why). */
    acceptRules: () => Promise<boolean>;
};

const GroupSessionContext = createContext<GroupSession | null>(null);

export function useGroupSession() {
    const value = useContext(GroupSessionContext);
    if (!value) throw new Error("useGroupSession must be used inside a Hanogt Social group");
    return value;
}

export function useGroupSessionOptional() {
    return useContext(GroupSessionContext);
}

function isStoredTab(value: unknown): value is { name: string; code: string } {
    return typeof value === "object" && value !== null && typeof (value as { name?: unknown }).name === "string" && typeof (value as { code?: unknown }).code === "string";
}

function zipPath(name: string) {
    return name.split("/").map((segment) => downloadName(segment)).join("/");
}

/**
 * Everything one open group needs: the detail from /api/groups, the live
 * group document (names, roles, pins, typing), messages and shared files.
 * The group sidebar and the group screen both read it, and it provides the
 * WorkspaceContext the chat, files and dialogs of the workspace expect.
 */
export default function GroupSessionProvider({ groupId, children }: { groupId: string; children: ReactNode }) {
    const { tx } = useI18n();
    const router = useRouter();
    const social = useSocial();
    const { me: socialMe, live, notify, confirm, now, markBroken } = social;
    const refreshGroups = social.groups.refresh;
    // "Typing indicator" off: nobody sees this person typing (Hanogt Social settings › Messages).
    const showTyping = social.prefs.typingIndicator;
    const { startCall } = useVoiceCall();
    const errorText = useGroupErrorText();
    const email = socialMe.email;
    const validId = isGroupId(groupId);

    const [detail, setDetail] = useState<GroupDetailResponse | null>(null);
    const [phase, setPhase] = useState<GroupSession["phase"]>(validId ? "loading" : "gone");
    const [loadError, setLoadError] = useState("");
    const [reloadKey, setReloadKey] = useState(0);
    const [liveFields, setLiveFields] = useState<LiveGroupFields | null>(null);
    const [typingSeen, setTypingSeen] = useState<Record<string, number>>({});
    const [typingNow, setTypingNow] = useState(0);
    const [lastReadAt] = useState(() => getGroupReadAt(groupId));
    const [invite, setInvite] = useState({ open: false, key: 0 });
    const [settings, setSettings] = useState<{ open: boolean; key: number; tab: SettingsTab }>({ open: false, key: 0, tab: "general" });
    const [newFile, setNewFile] = useState({ open: false, key: 0 });
    const [zipBusy, setZipBusy] = useState(false);
    const [focusNonce, setFocusNonce] = useState(0);
    const [jumpTarget, setJumpTarget] = useState<{ id: string; nonce: number } | null>(null);
    const [dismissing, setDismissing] = useState(false);
    const [guideOpen, setGuideOpen] = useState(true);
    const [panel, setPanel] = useState<GroupPanel>("members");
    const [userCard, setUserCard] = useState<PopoutState | null>(null);
    // When each channel was last on screen in this visit (the channel list's unread markers).
    const [channelReadAt, setChannelReadAt] = useState<Record<string, number>>({});
    // The rules version accepted from this tab, until the group document (or the next detail) shows it.
    const [acceptedHere, setAcceptedHere] = useState(0);
    const typingRef = useRef<Record<string, number>>({});
    const typingPrimedRef = useRef(false);
    const typingSentRef = useRef(0);
    const typingActiveRef = useRef(false);
    const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const errorTextRef = useRef(errorText);
    useEffect(() => {
        errorTextRef.current = errorText;
    });
    const ready = phase === "ready";

    /* ------------------------------ loading ----------------------------- */

    useEffect(() => {
        if (!email || !validId) return;
        let active = true;
        groupsApi.detail(groupId)
            .then((result) => {
                if (!active) return;
                setDetail(result);
                setPhase("ready");
            })
            .catch((error: unknown) => {
                if (!active) return;
                setLoadError(errorTextRef.current(error));
                setPhase(error instanceof GroupRequestError && (error.code === "not_found" || error.code === "invalid_id") ? "gone" : "error");
            });
        return () => { active = false; };
    }, [email, groupId, reloadKey, validId]);

    const refresh = useCallback(async () => {
        try {
            setDetail(await groupsApi.detail(groupId));
        } catch (error) {
            if (error instanceof GroupRequestError && error.code === "not_found") setPhase("gone");
        }
    }, [groupId]);

    const retry = useCallback(() => {
        setPhase("loading");
        setReloadKey((value) => value + 1);
    }, []);

    // Losing access (removed, group deleted) also updates the server rail.
    useEffect(() => {
        if (phase === "gone") void refreshGroups();
    }, [phase, refreshGroups]);

    // Live group document: name, roles, pins, topics, typing… (members can read it directly).
    useEffect(() => {
        if (!ready || !live) return;
        return onSnapshot(doc(db, "groups", groupId), (snapshot) => {
            if (!snapshot.exists()) {
                setPhase("gone");
                return;
            }
            const fields = liveGroupFromData(snapshot.data());
            const previous = typingRef.current;
            const primed = typingPrimedRef.current;
            typingRef.current = fields.typing;
            typingPrimedRef.current = true;
            const received = Date.now();
            setLiveFields(fields);
            // Entries present in the first snapshot may be stale: only later changes count as typing.
            if (!primed) return;
            setTypingSeen((current) => {
                const next: Record<string, number> = {};
                for (const [key, value] of Object.entries(fields.typing)) {
                    if (previous[key] !== value) next[key] = received;
                    else if (current[key]) next[key] = current[key];
                }
                return next;
            });
        }, (failure) => {
            // Removed from the group, or the rules refuse the read: the server decides which.
            if (failure.code === "permission-denied") void refresh();
            else setPhase("gone");
        });
    }, [groupId, live, ready, refresh]);

    // Presence and profiles: every two minutes with the live document, every 30 s without it.
    usePoll(refresh, live ? 120_000 : SOCIAL_POLL.groupDetailMs, ready);

    useEffect(() => {
        if (!Object.keys(typingSeen).length) return;
        const timer = window.setInterval(() => {
            const current = Date.now();
            setTypingNow(current);
            setTypingSeen((entries) => {
                const kept = Object.entries(entries).filter(([, seen]) => current - seen < 7000);
                return kept.length === Object.keys(entries).length ? entries : Object.fromEntries(kept);
            });
        }, 1000);
        return () => window.clearInterval(timer);
    }, [typingSeen]);

    const handleError = useCallback((code: GroupClientErrorCode) => {
        notify(errorTextRef.current(code), "error");
        if (code === "files" || code === "chat") void refresh();
    }, [notify, refresh]);

    const filesApi = useGroupFiles({ groupId, email, enabled: ready && live, onError: handleError });
    const messagesApi = useGroupMessages({ groupId, enabled: ready, live, onError: handleError });

    /* ------------------------------ the group --------------------------- */

    const group: GroupInfo | null = useMemo(() => {
        if (!detail) return null;
        const base = detail.group;
        const pinnedFallback = !live && messagesApi.serverPins ? messagesApi.serverPins.filter(isGroupId) : null;
        if (!liveFields) return pinnedFallback ? { ...base, pinnedMessageIds: pinnedFallback } : base;
        return {
            ...base,
            name: liveFields.name ?? base.name,
            description: liveFields.description ?? base.description,
            emoji: liveFields.emoji !== undefined ? groupEmoji(liveFields.emoji) : base.emoji,
            color: liveFields.color !== undefined ? groupColor(liveFields.color) : base.color,
            rules: liveFields.rules ?? base.rules,
            rulesList: liveFields.rulesList ?? base.rulesList,
            rulesVersion: liveFields.rulesVersion ?? base.rulesVersion,
            rulesUpdatedAt: liveFields.rulesUpdatedAt !== undefined ? liveFields.rulesUpdatedAt : base.rulesUpdatedAt,
            rulesScreening: liveFields.rulesScreening ?? base.rulesScreening,
            rulesAcceptVersion: liveFields.rulesAcceptVersion ?? base.rulesAcceptVersion,
            topics: liveFields.topics ?? base.topics,
            ownerEmail: liveFields.ownerEmail ?? base.ownerEmail,
            admins: liveFields.admins ?? base.admins,
            members: liveFields.members ?? base.members,
            pinnedMessageIds: liveFields.pinnedMessageIds ? liveFields.pinnedMessageIds.filter(isGroupId) : base.pinnedMessageIds,
            allowMemberInvites: liveFields.allowMemberInvites ?? base.allowMemberInvites,
            onboarding: liveFields.onboarding ?? base.onboarding,
            moderators: liveFields.moderators ?? base.moderators,
            slowmode: liveFields.slowmode ?? base.slowmode,
            aiBot: liveFields.aiBot ?? base.aiBot,
            welcomeMessage: liveFields.welcomeMessage ?? base.welcomeMessage,
            customCommands: liveFields.customCommands ?? base.customCommands,
        };
    }, [detail, live, liveFields, messagesApi.serverPins]);

    // A changed member list (someone joined or left) reloads the member profiles.
    const liveMembersKey = liveFields?.members?.join(",") ?? "";
    const detailMembersKey = detail?.group.members.join(",") ?? "";
    useEffect(() => {
        if (!liveMembersKey || liveMembersKey === detailMembersKey) return;
        const timer = window.setTimeout(() => void refresh(), 400);
        return () => window.clearTimeout(timer);
    }, [detailMembersKey, liveMembersKey, refresh]);

    const memberEmails = useMemo(() => detail?.members.map((member) => member.email) ?? [], [detail]);
    // One listener per member up to LIVE_PROFILES_MAX (the owner and the team come first); a bigger group's
    // other members show the presence of the last detail read.
    const liveEmails = useMemo(() => memberEmails.slice(0, LIVE_PROFILES_MAX), [memberEmails]);
    const liveProfiles = useLiveProfiles(liveEmails, live && ready, markBroken);

    const members: WorkspaceMember[] = useMemo(() => {
        if (!detail || !group) return [];
        const rank = { owner: 0, admin: 1, moderator: 2, member: 3 } as const;
        return detail.members
            .filter((member) => group.members.includes(member.email))
            .map((member) => {
                const realtime = liveProfiles.get(member.email);
                const status = member.email === email ? socialMe.status : realtime?.status ?? member.status ?? (member.online ? "online" : "offline");
                return {
                    ...member,
                    username: realtime?.username || member.username,
                    avatarUrl: realtime ? realtime.avatarUrl : member.avatarUrl,
                    customStatus: realtime ? realtime.customStatus : member.customStatus,
                    status,
                    online: status !== "offline",
                    role: roleFor(member.email, group.ownerEmail, group.admins, group.moderators),
                };
            })
            .sort((a, b) => rank[a.role] - rank[b.role]);
    }, [detail, email, group, liveProfiles, socialMe.status]);

    // Kept in a ref so the chat rows (memoized) get a stable callback.
    const membersRef = useRef(members);
    useEffect(() => {
        membersRef.current = members;
    });
    const openUserCard = useCallback((target: string, trigger: HTMLElement) => {
        const member = membersRef.current.find((entry) => entry.email === target);
        const person = member
            ? { email: member.email, username: member.username, avatarUrl: member.avatarUrl, status: member.status, nickname: member.nickname, nicknameTag: member.nicknameTag, staffRole: member.staffRole ?? null, customStatus: member.customStatus }
            // Someone who left the group: the card loads what it may show.
            : { email: target, username: target.split("@")[0] || "Hanogt", avatarUrl: null, status: null };
        setUserCard((current) => nextPopout(current, person, trigger));
    }, []);
    const closeUserCard = useCallback(() => setUserCard(null), []);
    const markChannelRead = useCallback((topic: string, time: number) => {
        if (!time) return;
        setChannelReadAt((current) => ((current[topic] ?? 0) >= time ? current : { ...current, [topic]: time }));
    }, []);

    const me: WorkspaceMember | null = useMemo(() => {
        if (!detail) return null;
        const own = members.find((member) => member.email === detail.me.email);
        if (own) return own;
        const fallback = detail.members.find((member) => member.email === detail.me.email);
        return fallback ? { ...fallback, role: detail.me.role } : null;
    }, [detail, members]);

    /* ------------------------------ rules ------------------------------- */

    // The live document says what this person accepted (by their member key); without it, the last detail does.
    const myKey = detail?.me.key ?? "";
    const liveAccepted = liveFields?.rulesAccepted;
    const rulesAcceptedVersion = Math.max(acceptedHere, liveAccepted ? liveAccepted[myKey] ?? 0 : detail?.me.rulesAcceptedVersion ?? 0);
    const mustAcceptRules = Boolean(group && me && rulesStillToAccept(
        { list: group.rulesList, version: group.rulesVersion, updatedAt: group.rulesUpdatedAt, screening: group.rulesScreening, acceptVersion: group.rulesAcceptVersion },
        me.role,
        rulesAcceptedVersion,
    ));

    const acceptRules = useCallback(async () => {
        if (!group) return false;
        try {
            const result = await groupsApi.acceptRules(groupId, group.rulesVersion);
            setAcceptedHere((value) => Math.max(value, result.version));
            void refresh();
            return true;
        } catch (error) {
            notify(errorTextRef.current(error), "error");
            // Changed rules arrive with the next read; the person reads them and accepts again.
            if (error instanceof GroupRequestError && error.code === "rules_changed") void refresh();
            return false;
        }
    }, [group, groupId, notify, refresh]);

    /* ------------------------------ typing ------------------------------ */

    const stopTyping = useCallback(() => {
        if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
        typingTimerRef.current = null;
        if (!typingActiveRef.current) return;
        typingActiveRef.current = false;
        typingSentRef.current = 0;
        void groupsApi.chat({ action: "typing", groupId, active: false }, true).catch(() => undefined);
    }, [groupId]);

    const onTyping = useCallback((text: string) => {
        if (!text.trim() || !showTyping) {
            stopTyping();
            return;
        }
        if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
        typingTimerRef.current = setTimeout(stopTyping, 6000);
        const stamp = performance.now();
        if (typingActiveRef.current && stamp - typingSentRef.current < 4000) return;
        typingSentRef.current = stamp;
        typingActiveRef.current = true;
        void groupsApi.chat({ action: "typing", groupId, active: true }).catch(() => undefined);
    }, [groupId, showTyping, stopTyping]);

    useEffect(() => () => stopTyping(), [stopTyping]);

    /* ------------------------------ context ----------------------------- */

    const context: WorkspaceContextValue | null = useMemo(() => {
        if (!group || !me || !detail) return null;
        const isManager = isManagerRole(me.role);
        return {
            groupId,
            group,
            members,
            me,
            role: me.role,
            isManager,
            isOwner: me.role === "owner",
            canInvite: isManager || group.allowMemberInvites,
            memberByEmail: new Map(members.map((member) => [member.email, member])),
            memberByKey: new Map(members.map((member) => [member.key, member])),
            usernames: members.map((member) => member.username),
            stats: detail.stats,
            banned: detail.banned,
            // A server from before plan-based groups sends no limits: Free's.
            limits: detail.limits ?? PLAN_GROUP_FEATURES.free,
            mustAcceptRules,
            now,
            live,
            notify,
            confirm,
            errorText,
            refresh,
        };
    }, [confirm, detail, errorText, group, groupId, live, me, members, mustAcceptRules, notify, now, refresh]);

    // Joined into a key so the chat only re-renders when the set of typing members changes.
    const typingKey = useMemo(() => {
        if (!context) return "";
        const keys = live
            ? Object.entries(typingSeen).filter(([, seen]) => !typingNow || typingNow - seen < 7000).map(([key]) => key)
            : Object.keys(messagesApi.serverTyping);
        return keys
            .filter((key) => key !== context.me.key)
            .map((key) => context.memberByKey.get(key)?.username)
            .filter((name): name is string => Boolean(name))
            .join("\n");
    }, [context, live, messagesApi.serverTyping, typingNow, typingSeen]);
    const typingNames = useMemo(() => (typingKey ? typingKey.split("\n") : []), [typingKey]);

    /* ------------------------------ actions ----------------------------- */

    const openInvite = useCallback(() => setInvite(({ key }) => ({ open: true, key: key + 1 })), []);
    const openSettings = useCallback((tab: SettingsTab) => setSettings(({ key }) => ({ open: true, key: key + 1, tab })), []);
    const openNewFile = useCallback(() => setNewFile(({ key }) => ({ open: true, key: key + 1 })), []);
    const closeNewFile = useCallback(() => setNewFile((current) => ({ ...current, open: false })), []);
    const focusComposer = useCallback(() => setFocusNonce((value) => value + 1), []);
    const jumpTo = useCallback((id: string) => setJumpTarget({ id, nonce: Date.now() }), []);

    const createFile = useCallback(async (name: string, code: string) => {
        try {
            const id = await filesApi.createFile(name, code);
            notify(tx(C.fileCreated, { name }), "success");
            router.push(groupHref(groupId, { view: "files", file: id }));
            return id;
        } catch {
            notify(errorText("save_failed"), "error");
            return null;
        }
    }, [errorText, filesApi, groupId, notify, router, tx]);

    const renameFile = useCallback(async (file: GroupFileItem, name: string) => {
        try {
            await filesApi.renameFile(file.id, name);
            notify(tx(C.fileRenamed), "success");
            return true;
        } catch {
            notify(errorText("save_failed"), "error");
            return false;
        }
    }, [errorText, filesApi, notify, tx]);

    const deleteFile = useCallback((file: GroupFileItem) => {
        void (async () => {
            const approved = await confirm({ title: tx(C.fileDeleteTitle, { name: file.name }), body: tx(C.fileDeleteBody), confirmLabel: tx(C.fileDeleteConfirm), tone: "danger" });
            if (!approved) return;
            try {
                await filesApi.deleteFile(file.id);
                notify(tx(C.fileDeleted), "success");
            } catch {
                notify(errorText("forbidden"), "error");
            }
        })();
    }, [confirm, errorText, filesApi, notify, tx]);

    const downloadFile = useCallback((file: GroupFileItem) => saveBlob(new Blob([file.code], { type: mimeFor(file.lang) }), downloadName(file.name.split("/").pop() || file.name)), []);

    const downloadAll = useCallback(() => {
        const files = filesApi.files;
        if (!files.length || !group) return;
        setZipBusy(true);
        void (async () => {
            try {
                const JSZip = (await import("jszip")).default;
                const zip = new JSZip();
                for (const file of files) zip.file(zipPath(file.name), file.code);
                const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
                saveBlob(blob, `${downloadName(group.name)}.zip`);
            } catch {
                notify(errorText("zip_failed"), "error");
            } finally {
                setZipBusy(false);
            }
        })();
    }, [errorText, filesApi.files, group, notify]);

    const flushAll = filesApi.flushAll;
    const openInEditor = useCallback((selected: GroupFileItem[]) => {
        if (!selected.length) return;
        let existing: unknown = [];
        try {
            existing = JSON.parse(storageGet(EDITOR_TABS_KEY) || "[]");
        } catch {
            existing = [];
        }
        const previous = Array.isArray(existing) ? existing.filter(isStoredTab) : [];
        const stamp = Date.now().toString(36);
        const incoming = selected.map((file, index) => ({
            id: `group-${file.id}-${stamp}-${index}`,
            name: file.name.split("/").pop() || file.name,
            lang: file.lang,
            code: file.code,
            output: [],
            isRunning: false,
            isSaved: false,
        }));
        const merged = [...incoming, ...previous.filter((tab) => !incoming.some((entry) => entry.name === tab.name && entry.code === tab.code))];
        const serialized = JSON.stringify(merged);
        if (serialized.length > EDITOR_TABS_MAX) {
            notify(errorText("editor_too_large"), "error");
            return;
        }
        storageSet(EDITOR_TABS_KEY, serialized);
        flushAll();
        notify(tx(C.editorOpened), "info");
        router.push("/editor");
    }, [errorText, flushAll, notify, router, tx]);

    const callMember = useCallback((member: WorkspaceMember) => {
        void startCall({ email: member.email, username: member.username, avatarUrl: member.avatarUrl || undefined, staffRole: member.staffRole ?? null });
        if (context?.isManager && !context.group.onboarding.callStarted) {
            void groupsApi.action({ action: "onboarding", groupId, step: "call" }).catch(() => undefined);
        }
    }, [context, groupId, startCall]);

    const dismissGuide = useCallback(() => {
        setDismissing(true);
        void groupsApi.action({ action: "onboarding", groupId, step: "dismiss" })
            .then(() => refresh())
            .catch((error: unknown) => notify(errorText(error), "error"))
            .finally(() => setDismissing(false));
    }, [errorText, groupId, notify, refresh]);

    const restoreGuide = useCallback(async () => {
        try {
            await groupsApi.action({ action: "onboarding", groupId, step: "restore" });
            await refresh();
            setGuideOpen(true);
            return true;
        } catch (error) {
            notify(errorText(error), "error");
            return false;
        }
    }, [errorText, groupId, notify, refresh]);

    /** Back to Hanogt Social's home with a confirmation, after leaving or deleting the group. */
    const afterExit = useCallback((reason: "left" | "deleted") => {
        setSettings((current) => ({ ...current, open: false }));
        notify(tx(reason === "left" ? C.left : C.deleted), "success");
        void refreshGroups();
        router.push("/social");
    }, [notify, refreshGroups, router, tx]);

    const leave = useCallback(async () => {
        if (!group) return;
        const approved = await confirm({ title: tx(C.leaveTitle, { name: group.name }), body: tx(C.leaveBody), confirmLabel: tx(C.leaveConfirm), tone: "danger" });
        if (!approved) return;
        try {
            await groupsApi.action({ action: "leave", groupId });
            afterExit("left");
        } catch (error) {
            notify(errorText(error), "error");
        }
    }, [afterExit, confirm, errorText, group, groupId, notify, tx]);

    /* ------------------------------ guide ------------------------------- */

    const files = filesApi.files;
    const showGuide = Boolean(context?.isManager && group && !group.onboarding.dismissed);
    const checklist: ChecklistStep[] = useMemo(() => {
        if (!group) return [];
        const createdMs = toMillis(group.createdAt);
        const chat = () => router.push(groupHref(groupId));
        return [
            { id: "invite", done: members.length > 1 || (detail?.stats?.pendingInvites ?? 0) > 0 || (detail?.stats?.activeLinks ?? 0) > 0, onAction: openInvite },
            // The Rules section counts (not the old plain-text rules).
            { id: "rules", done: Boolean(group.description.trim() && group.rulesList.length), onAction: () => openSettings(group.description.trim() ? "rules" : "general") },
            { id: "file", done: files.some((file) => file.updatedAt > createdMs + 10_000), onAction: () => { router.push(groupHref(groupId, { view: "files" })); openNewFile(); } },
            { id: "message", done: messagesApi.messages.some((message) => message.type !== "system" && message.fromEmail !== SYSTEM_SENDER), onAction: () => { chat(); focusComposer(); } },
            { id: "call", done: group.onboarding.callStarted, onAction: () => { setPanel("members"); if (social.ui.wide ? social.ui.asideCollapsed : !social.ui.asideOpen) social.ui.toggleAside(); } },
            { id: "pin", done: group.pinnedMessageIds.some((id) => id !== WELCOME_MESSAGE_ID), onAction: () => { chat(); notify(tx(C.pinHint), "info"); } },
        ];
    }, [detail, files, focusComposer, group, groupId, members.length, messagesApi.messages, notify, openInvite, openNewFile, openSettings, router, social.ui, tx]);

    const session: GroupSession = {
        groupId,
        phase: phase === "ready" && !context ? "gone" : phase,
        loadError,
        retry,
        context,
        files: filesApi,
        filesAvailable: live,
        messages: messagesApi,
        typingNames,
        onTyping,
        stopTyping,
        lastReadAt,
        openInvite,
        openSettings,
        newFile,
        openNewFile,
        closeNewFile,
        createFile,
        renameFile,
        deleteFile,
        downloadFile,
        downloadAll,
        zipBusy,
        openInEditor,
        checklist,
        showGuide,
        guideOpen,
        setGuideOpen,
        dismissGuide,
        dismissing,
        callMember,
        panel,
        setPanel,
        focusNonce,
        focusComposer,
        jumpTarget,
        jumpTo,
        leave,
        userCard,
        openUserCard,
        closeUserCard,
        markChannelRead,
        mustAcceptRules,
        rulesAcceptedVersion,
        acceptRules,
    };

    /* ------------------------------ sidebar ------------------------------ */

    // The shell's group sidebar reads this; it only changes when something it shows changes.
    const { publish } = useGroupNav();
    const sessionPhase = session.phase;
    const fileCount = files.length;
    const pinnedCount = group?.pinnedMessageIds.length ?? 0;
    const rulesCount = group?.rulesList.length ?? 0;
    const guideDone = checklist.filter((step) => step.done).length;
    const myName = socialMe.username;
    const channelUnread = useMemo(() => channelUnreadState(messagesApi.messages, {
        me: email,
        myName,
        usernames: members.map((member) => member.username),
        lastReadAt,
        readAt: channelReadAt,
    }), [channelReadAt, email, lastReadAt, members, messagesApi.messages, myName]);
    const guideTotal = checklist.length;
    const toggleGuide = useCallback(() => setGuideOpen((value) => !value), []);
    const showPinned = useCallback(() => {
        setPanel("pinned");
        if (social.ui.wide ? social.ui.asideCollapsed : !social.ui.asideOpen) social.ui.toggleAside();
    }, [social.ui]);
    const nav: GroupNavState = useMemo(() => ({
        groupId,
        phase: sessionPhase,
        group,
        role: context?.role ?? null,
        canInvite: context?.canInvite ?? false,
        isManager: context?.isManager ?? false,
        fileCount,
        filesAvailable: live,
        pinnedCount,
        rules: { count: rulesCount, mustAccept: mustAcceptRules },
        guide: { show: showGuide, done: guideDone, total: guideTotal, open: guideOpen },
        channelUnread,
        openInvite,
        openSettings,
        leave: () => void leave(),
        toggleGuide,
        showPinned,
    }), [channelUnread, context?.canInvite, context?.isManager, context?.role, fileCount, group, groupId, guideDone, guideOpen, guideTotal, leave, live, mustAcceptRules, openInvite, openSettings, pinnedCount, rulesCount, sessionPhase, showGuide, showPinned, toggleGuide]);
    useEffect(() => {
        publish(nav);
    }, [nav, publish]);
    useEffect(() => () => publish(null), [publish]);

    // Keeps the rail in step with the open group (renames, icon and color changes, member count).
    const patchGroup = social.groups.patch;
    const memberCount = members.length;
    useEffect(() => {
        if (!group) return;
        patchGroup(group.id, { name: group.name, emoji: group.emoji, color: group.color, ...(memberCount ? { memberCount } : {}) });
    }, [group, memberCount, patchGroup]);

    // The provider is always rendered (null while loading) so the screen inside it isn't remounted once the group arrives.
    return (
        <GroupSessionContext.Provider value={session}>
            <WorkspaceContext.Provider value={context}>
                {children}
                {context && (
                    <>
                        <InviteDialog key={`invite-${invite.key}`} open={invite.open} onClose={() => setInvite((current) => ({ ...current, open: false }))} onChanged={() => void refresh()} />
                        <SettingsDialog key={`settings-${settings.key}`} open={settings.open} initialTab={settings.tab} onClose={() => setSettings((current) => ({ ...current, open: false }))} onLeft={afterExit} onRestoreGuide={restoreGuide} />
                    </>
                )}
            </WorkspaceContext.Provider>
        </GroupSessionContext.Provider>
    );
}
