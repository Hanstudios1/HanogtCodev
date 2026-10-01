"use client";

import { doc, onSnapshot } from "firebase/firestore";
import {
    ArrowLeft, Code2, FolderOpen, LogIn, MessageSquare, Pin, RefreshCw, Settings, UserPlus, UsersRound,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { useVoiceCall } from "@/components/VoiceCallProvider";
import { db } from "@/lib/firebase";
import { useI18n, type Copy } from "@/lib/i18n";
import {
    SYSTEM_SENDER,
    WELCOME_MESSAGE_ID,
    getGroupTemplate,
    groupColor,
    groupEmoji,
    isGroupId,
    isManagerRole,
    toMillis,
    type GroupDetailResponse,
    type GroupInfo,
} from "@/lib/groups";
import { GroupRequestError, groupsApi, useGroupErrorText, type GroupClientErrorCode } from "../api";
import { AvatarStack, GroupTile, Spinner, ToastViewport, cx, lastReadKey, storageGet, storageSet, useConfirm, useToasts } from "../ui";
import ChatPanel, { PinnedPanel } from "./ChatPanel";
import { WorkspaceContext, type WorkspaceContextValue } from "./context";
import EditorPane, { SaveIndicator } from "./EditorPane";
import FilesPanel from "./FilesPanel";
import GettingStarted, { type ChecklistStep } from "./GettingStarted";
import { useGroupFiles, useGroupMessages } from "./hooks";
import InviteDialog from "./InviteDialog";
import MembersPanel from "./MembersPanel";
import { EDITOR_TABS_KEY, EDITOR_TABS_MAX, downloadName, liveGroupFromData, mimeFor, roleFor, saveBlob, type GroupFileItem, type LiveGroupFields, type WorkspaceMember } from "./model";
import SettingsDialog, { type SettingsTab } from "./SettingsDialog";

const C = {
    back: { TR: "Gruplara dön", EN: "Back to groups" },
    loading: { TR: "Grup açılıyor", EN: "Opening the group" },
    members: { TR: "{count} üye", EN: "{count} members" },
    oneMember: { TR: "1 üye", EN: "1 member" },
    online: { TR: "{count} çevrimiçi", EN: "{count} online" },
    invite: { TR: "Davet et", EN: "Invite" },
    settings: { TR: "Grup ayarları", EN: "Group settings" },
    info: { TR: "Grup bilgileri", EN: "Group info" },
    chat: { TR: "Sohbet", EN: "Chat" },
    pinned: { TR: "Sabitlenenler", EN: "Pinned" },
    membersTab: { TR: "Üyeler", EN: "Members" },
    files: { TR: "Dosyalar", EN: "Files" },
    code: { TR: "Kod", EN: "Code" },
    panelTabs: { TR: "Yan panel", EN: "Side panel" },
    mobileNav: { TR: "Çalışma alanı bölümleri", EN: "Workspace sections" },
    goneTitle: { TR: "Bu gruba erişimin yok", EN: "You don't have access to this group" },
    goneText: { TR: "Grup silinmiş olabilir ya da gruptan çıkarılmış olabilirsin.", EN: "The group may have been deleted, or you may have been removed from it." },
    errorTitle: { TR: "Grup açılamadı", EN: "Couldn't open the group" },
    retry: { TR: "Tekrar dene", EN: "Try again" },
    signInTitle: { TR: "Grubu görmek için giriş yap", EN: "Sign in to see this group" },
    signIn: { TR: "Giriş yap", EN: "Sign in" },
    fileCreated: { TR: "{name} oluşturuldu.", EN: "{name} was created." },
    fileRenamed: { TR: "Dosya yeniden adlandırıldı.", EN: "The file was renamed." },
    fileDeleteTitle: { TR: "{name} silinsin mi?", EN: "Delete {name}?" },
    fileDeleteBody: { TR: "Dosya tüm üyeler için kalıcı olarak silinir.", EN: "The file is deleted permanently for all members." },
    fileDeleteConfirm: { TR: "Dosyayı sil", EN: "Delete file" },
    fileDeleted: { TR: "Dosya silindi.", EN: "The file was deleted." },
    saveFlushed: { TR: "Tüm değişiklikler kaydediliyor.", EN: "Saving all changes." },
    editorOpened: { TR: "Düzenleyici'de bir kopya açıldı; oradaki değişiklikler gruba yansımaz.", EN: "A copy was opened in the Editor; changes there don't sync back to the group." },
    pinHint: { TR: "Sabitlemek istediğin mesajın üzerine gel ve 📌 simgesine bas.", EN: "Hover the message you want to pin and press 📌." },
} satisfies Record<string, Copy>;

type MobileView = "files" | "editor" | "panel";
type RightTab = "chat" | "pinned" | "members";

function useMediaQuery(queryText: string) {
    return useSyncExternalStore(
        (onChange) => {
            const list = window.matchMedia(queryText);
            list.addEventListener("change", onChange);
            return () => list.removeEventListener("change", onChange);
        },
        () => window.matchMedia(queryText).matches,
        () => false,
    );
}

function isStoredTab(value: unknown): value is { name: string; code: string } {
    return typeof value === "object" && value !== null && typeof (value as { name?: unknown }).name === "string" && typeof (value as { code?: unknown }).code === "string";
}

function zipPath(name: string) {
    return name.split("/").map((segment) => downloadName(segment)).join("/");
}

export default function GroupWorkspace({ groupId }: { groupId: string }) {
    const { data: session, status } = useSession();
    const router = useRouter();
    const { tx } = useI18n();
    const { startCall } = useVoiceCall();
    const errorText = useGroupErrorText();
    const { toasts, push, dismiss } = useToasts();
    const [confirmElement, confirm] = useConfirm();
    const email = session?.user?.email?.toLowerCase() || "";
    const validId = isGroupId(groupId);
    const desktop = useMediaQuery("(min-width: 1024px)");

    const [detail, setDetail] = useState<GroupDetailResponse | null>(null);
    const [phase, setPhase] = useState<"loading" | "ready" | "error" | "gone">(validId ? "loading" : "gone");
    const [loadError, setLoadError] = useState("");
    const [reloadKey, setReloadKey] = useState(0);
    const [live, setLive] = useState<LiveGroupFields | null>(null);
    const [now, setNow] = useState(() => Date.now());
    const [typingSeen, setTypingSeen] = useState<Record<string, number>>({});
    const [typingNow, setTypingNow] = useState(0);
    const [lastReadAt] = useState(() => Number(storageGet(lastReadKey(groupId)) || 0));
    const [activeFileId, setActiveFileId] = useState("");
    const [mobileView, setMobileView] = useState<MobileView>("editor");
    const [rightTab, setRightTab] = useState<RightTab>("chat");
    const [invite, setInvite] = useState({ open: false, key: 0 });
    const [settings, setSettings] = useState<{ open: boolean; key: number; tab: SettingsTab }>({ open: false, key: 0, tab: "general" });
    const [newFile, setNewFile] = useState({ open: false, key: 0 });
    const [zipBusy, setZipBusy] = useState(false);
    const [focusNonce, setFocusNonce] = useState(0);
    const [jumpTarget, setJumpTarget] = useState<{ id: string; nonce: number } | null>(null);
    const [dismissing, setDismissing] = useState(false);
    const typingRef = useRef<Record<string, number>>({});
    const typingPrimedRef = useRef(false);
    const typingSentRef = useRef(0);
    const typingActiveRef = useRef(false);
    const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const errorTextRef = useRef(errorText);
    useEffect(() => {
        errorTextRef.current = errorText;
    });

    const notify = push;
    const ready = phase === "ready";

    // Initial load (and manual retries).
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

    // Live group document: name, roles, pins, topics, typing… (members can read it directly).
    useEffect(() => {
        if (!ready) return;
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
            setLive(fields);
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
        }, () => setPhase("gone"));
    }, [groupId, ready]);

    useEffect(() => {
        const timer = window.setInterval(() => setNow(Date.now()), 30_000);
        return () => window.clearInterval(timer);
    }, []);

    // Presence and profile details are refreshed every two minutes while the tab is visible.
    useEffect(() => {
        if (!ready) return;
        const timer = window.setInterval(() => {
            if (document.visibilityState === "visible") void refresh();
        }, 120_000);
        return () => window.clearInterval(timer);
    }, [ready, refresh]);

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

    const group: GroupInfo | null = useMemo(() => {
        if (!detail) return null;
        const base = detail.group;
        if (!live) return base;
        return {
            ...base,
            name: live.name ?? base.name,
            description: live.description ?? base.description,
            emoji: live.emoji !== undefined ? groupEmoji(live.emoji) : base.emoji,
            color: live.color !== undefined ? groupColor(live.color) : base.color,
            rules: live.rules ?? base.rules,
            topics: live.topics ?? base.topics,
            ownerEmail: live.ownerEmail ?? base.ownerEmail,
            admins: live.admins ?? base.admins,
            members: live.members ?? base.members,
            pinnedMessageIds: live.pinnedMessageIds ? live.pinnedMessageIds.filter(isGroupId) : base.pinnedMessageIds,
            allowMemberInvites: live.allowMemberInvites ?? base.allowMemberInvites,
            onboarding: live.onboarding ?? base.onboarding,
        };
    }, [detail, live]);

    // A changed member list (someone joined or left) reloads the member profiles.
    const liveMembersKey = live?.members?.join(",") ?? "";
    const detailMembersKey = detail?.group.members.join(",") ?? "";
    useEffect(() => {
        if (!liveMembersKey || liveMembersKey === detailMembersKey) return;
        const timer = window.setTimeout(() => void refresh(), 400);
        return () => window.clearTimeout(timer);
    }, [detailMembersKey, liveMembersKey, refresh]);

    const members: WorkspaceMember[] = useMemo(() => {
        if (!detail || !group) return [];
        const rank = { owner: 0, admin: 1, member: 2 } as const;
        return detail.members
            .filter((member) => group.members.includes(member.email))
            .map((member) => ({ ...member, role: roleFor(member.email, group.ownerEmail, group.admins) }))
            .sort((a, b) => rank[a.role] - rank[b.role]);
    }, [detail, group]);

    const me: WorkspaceMember | null = useMemo(() => {
        if (!detail) return null;
        const own = members.find((member) => member.email === detail.me.email);
        if (own) return own;
        const fallback = detail.members.find((member) => member.email === detail.me.email);
        return fallback ? { ...fallback, role: detail.me.role } : null;
    }, [detail, members]);

    const handleError = useCallback((code: GroupClientErrorCode) => {
        notify(errorTextRef.current(code), "error");
        if (code === "files" || code === "chat") void refresh();
    }, [notify, refresh]);

    const filesApi = useGroupFiles({ groupId, email, enabled: ready, onError: handleError });
    const messagesApi = useGroupMessages({ groupId, enabled: ready, onError: handleError });
    const { files, flushAll } = filesApi;
    const activeFile: GroupFileItem | null = files.find((file) => file.id === activeFileId) ?? files[0] ?? null;

    useEffect(() => {
        const onKey = (event: KeyboardEvent) => {
            if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
                event.preventDefault();
                flushAll();
            }
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [flushAll]);

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
        if (!text.trim()) {
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
    }, [groupId, stopTyping]);

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
            now,
            notify,
            confirm,
            errorText,
            refresh,
        };
    }, [confirm, detail, errorText, group, groupId, me, members, notify, now, refresh]);

    // Joined into a key so the chat only re-renders when the set of typing members changes.
    const typingKey = useMemo(() => {
        if (!context) return "";
        return Object.entries(typingSeen)
            .filter(([key, seen]) => key !== context.me.key && (!typingNow || typingNow - seen < 7000))
            .map(([key]) => context.memberByKey.get(key)?.username)
            .filter((name): name is string => Boolean(name))
            .join("\n");
    }, [context, typingNow, typingSeen]);
    const typingNames = useMemo(() => (typingKey ? typingKey.split("\n") : []), [typingKey]);

    /* ------------------------------ actions ----------------------------- */

    const openInvite = () => setInvite(({ key }) => ({ open: true, key: key + 1 }));
    const openSettings = (tab: SettingsTab) => setSettings(({ key }) => ({ open: true, key: key + 1, tab }));
    const openNewFile = () => {
        setNewFile(({ key }) => ({ open: true, key: key + 1 }));
    };
    const showPanel = (tab: RightTab) => {
        setRightTab(tab);
        setMobileView("panel");
    };

    const selectFile = (fileId: string) => {
        setActiveFileId(fileId);
        setMobileView("editor");
    };

    const createFile = async (name: string, code: string) => {
        try {
            const id = await filesApi.createFile(name, code);
            setActiveFileId(id);
            setMobileView("editor");
            notify(tx(C.fileCreated, { name }), "success");
            return id;
        } catch {
            notify(errorText("save_failed"), "error");
            return null;
        }
    };

    const renameFile = async (file: GroupFileItem, name: string) => {
        try {
            await filesApi.renameFile(file.id, name);
            notify(tx(C.fileRenamed), "success");
            return true;
        } catch {
            notify(errorText("save_failed"), "error");
            return false;
        }
    };

    const deleteFile = async (file: GroupFileItem) => {
        const approved = await confirm({ title: tx(C.fileDeleteTitle, { name: file.name }), body: tx(C.fileDeleteBody), confirmLabel: tx(C.fileDeleteConfirm), tone: "danger" });
        if (!approved) return;
        try {
            await filesApi.deleteFile(file.id);
            notify(tx(C.fileDeleted), "success");
        } catch {
            notify(errorText("forbidden"), "error");
        }
    };

    const downloadFile = (file: GroupFileItem) => saveBlob(new Blob([file.code], { type: mimeFor(file.lang) }), downloadName(file.name.split("/").pop() || file.name));

    const downloadAll = async () => {
        if (!files.length || !group) return;
        setZipBusy(true);
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
    };

    const openInEditor = (selected: GroupFileItem[]) => {
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
    };

    const callMember = (member: WorkspaceMember) => {
        void startCall({ email: member.email, username: member.username, avatarUrl: member.avatarUrl || undefined });
        if (context?.isManager && !context.group.onboarding.callStarted) {
            void groupsApi.action({ action: "onboarding", groupId, step: "call" }).catch(() => undefined);
        }
    };

    const dismissGuide = async () => {
        setDismissing(true);
        try {
            await groupsApi.action({ action: "onboarding", groupId, step: "dismiss" });
        } catch (error) {
            notify(errorText(error), "error");
        } finally {
            setDismissing(false);
        }
    };

    const restoreGuide = async () => {
        try {
            await groupsApi.action({ action: "onboarding", groupId, step: "restore" });
            return true;
        } catch (error) {
            notify(errorText(error), "error");
            return false;
        }
    };

    /** The groups page shows the matching notice after the redirect. */
    const leftGroup = (reason: "left" | "deleted") => {
        setSettings((current) => ({ ...current, open: false }));
        router.push(`/groups?notice=${reason}`);
    };

    /* ------------------------------ states ------------------------------ */

    if (status === "loading" || (phase === "loading" && email)) {
        return <div className="flex min-h-dvh items-center justify-center bg-zinc-100 dark:bg-zinc-950" aria-busy="true" aria-label={tx(C.loading)}><Spinner className="h-7 w-7 text-indigo-500" /></div>;
    }
    if (!email) {
        return (
            <StateCard icon={<LogIn className="h-7 w-7" aria-hidden />} title={tx(C.signInTitle)}>
                <Link href={`/login?callbackUrl=${encodeURIComponent(`/groups/${validId ? groupId : ""}`)}`} className="mt-6 inline-flex items-center gap-2 rounded-2xl bg-indigo-600 px-5 py-3 font-bold text-white">{tx(C.signIn)}</Link>
            </StateCard>
        );
    }
    if (phase === "gone" || (phase === "ready" && (!context || !group))) {
        return (
            <StateCard icon={<UsersRound className="h-7 w-7" aria-hidden />} title={tx(C.goneTitle)} text={tx(C.goneText)}>
                <Link href="/groups" className="mt-6 inline-flex items-center gap-2 rounded-2xl bg-indigo-600 px-5 py-3 font-bold text-white"><ArrowLeft className="h-4 w-4 rtl:rotate-180" aria-hidden />{tx(C.back)}</Link>
            </StateCard>
        );
    }
    if (phase === "error" || !context || !group || !me) {
        return (
            <StateCard icon={<RefreshCw className="h-7 w-7" aria-hidden />} title={tx(C.errorTitle)} text={loadError}>
                <div className="mt-6 flex gap-2">
                    <button type="button" onClick={() => { setPhase("loading"); setReloadKey((value) => value + 1); }} className="inline-flex items-center gap-2 rounded-2xl bg-indigo-600 px-5 py-3 font-bold text-white"><RefreshCw className="h-4 w-4" aria-hidden />{tx(C.retry)}</button>
                    <Link href="/groups" className="inline-flex items-center gap-2 rounded-2xl border border-zinc-200 px-5 py-3 font-semibold dark:border-white/10">{tx(C.back)}</Link>
                </div>
            </StateCard>
        );
    }

    const template = group.template ? getGroupTemplate(group.template) : null;
    const onlineCount = members.filter((member) => member.online).length;
    const showGuide = context.isManager && !group.onboarding.dismissed;
    const createdMs = toMillis(group.createdAt);
    const checklist: ChecklistStep[] = [
        { id: "invite", done: members.length > 1 || (detail?.stats?.pendingInvites ?? 0) > 0 || (detail?.stats?.activeLinks ?? 0) > 0, onAction: openInvite },
        { id: "rules", done: Boolean(group.description.trim() && group.rules.trim()), onAction: () => openSettings(group.description.trim() ? "rules" : "general") },
        { id: "file", done: files.some((file) => file.updatedAt > createdMs + 10_000), onAction: openNewFile },
        { id: "message", done: messagesApi.messages.some((message) => message.type !== "system" && message.fromEmail !== SYSTEM_SENDER), onAction: () => { showPanel("chat"); setFocusNonce((value) => value + 1); } },
        { id: "call", done: group.onboarding.callStarted, onAction: () => showPanel("members") },
        { id: "pin", done: group.pinnedMessageIds.some((id) => id !== WELCOME_MESSAGE_ID), onAction: () => { showPanel("chat"); notify(tx(C.pinHint), "info"); } },
    ];
    const chatVisible = rightTab === "chat" && (desktop || mobileView === "panel");
    const panelTabs: Array<{ id: RightTab; label: Copy; icon: typeof MessageSquare; count?: number }> = [
        { id: "chat", label: C.chat, icon: MessageSquare },
        { id: "pinned", label: C.pinned, icon: Pin, count: group.pinnedMessageIds.length },
        { id: "members", label: C.membersTab, icon: UsersRound, count: members.length },
    ];
    const mobileTabs: Array<{ id: string; label: Copy; icon: typeof MessageSquare; active: boolean; onClick: () => void }> = [
        { id: "files", label: C.files, icon: FolderOpen, active: mobileView === "files", onClick: () => setMobileView("files") },
        { id: "editor", label: C.code, icon: Code2, active: mobileView === "editor", onClick: () => setMobileView("editor") },
        { id: "chat", label: C.chat, icon: MessageSquare, active: mobileView === "panel" && rightTab !== "members", onClick: () => showPanel("chat") },
        { id: "members", label: C.membersTab, icon: UsersRound, active: mobileView === "panel" && rightTab === "members", onClick: () => showPanel("members") },
    ];

    return (
        <WorkspaceContext.Provider value={context}>
            <main id="main-content" className="flex h-dvh min-w-0 flex-col overflow-hidden bg-zinc-100 text-zinc-900 dark:bg-zinc-950 dark:text-white">
                <header className="flex h-14 shrink-0 items-center gap-2 border-b border-zinc-200 bg-white px-2 dark:border-white/10 dark:bg-zinc-900 sm:px-3">
                    <Link href="/groups" className="rounded-xl p-2 text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-white" aria-label={tx(C.back)} title={tx(C.back)}><ArrowLeft className="h-5 w-5 rtl:rotate-180" aria-hidden /></Link>
                    <div className="flex min-w-0 items-center gap-2.5 p-1 pe-2">
                        <GroupTile emoji={group.emoji} color={group.color} size="sm" />
                        <div className="min-w-0">
                            <h1 className="truncate text-sm font-black sm:text-base">{group.name}</h1>
                            <p className="truncate text-[11px] text-zinc-500 dark:text-zinc-400">
                                {template && <>{template.emoji} {tx(template.name)} · </>}{members.length === 1 ? tx(C.oneMember) : tx(C.members, { count: members.length })} · <span className="text-emerald-600 dark:text-emerald-400">{tx(C.online, { count: onlineCount })}</span>
                            </p>
                        </div>
                    </div>
                    <div className="ms-auto flex items-center gap-1">
                        <span className="hidden md:inline-flex"><SaveIndicator state={filesApi.saveState} onRetry={flushAll} /></span>
                        <span className="hidden xl:inline-flex"><AvatarStack people={members.filter((member) => member.online)} total={onlineCount} /></span>
                        {context.canInvite && (
                            <button type="button" onClick={openInvite} className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-2.5 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-indigo-500" aria-label={tx(C.invite)}>
                                <UserPlus className="h-4 w-4" aria-hidden /><span className="hidden sm:inline">{tx(C.invite)}</span>
                            </button>
                        )}
                        <button type="button" onClick={() => openSettings("general")} className="rounded-xl p-2 text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-white" aria-label={tx(context.isManager ? C.settings : C.info)} title={tx(context.isManager ? C.settings : C.info)}><Settings className="h-5 w-5" aria-hidden /></button>
                    </div>
                </header>

                <div className="flex min-h-0 flex-1">
                    <aside className={cx("min-h-0 w-full shrink-0 flex-col border-e border-zinc-200 bg-white dark:border-white/10 dark:bg-zinc-900 lg:flex lg:w-64", mobileView === "files" ? "flex" : "hidden")} aria-label={tx(C.files)}>
                        <FilesPanel
                            files={files}
                            loaded={filesApi.loaded}
                            activeId={activeFile?.id ?? ""}
                            onSelect={selectFile}
                            onCreate={createFile}
                            onRename={renameFile}
                            onDelete={(file) => void deleteFile(file)}
                            onDownload={downloadFile}
                            onDownloadAll={() => void downloadAll()}
                            onOpenInEditor={openInEditor}
                            zipBusy={zipBusy}
                            newFileOpen={newFile.open}
                            newFileKey={newFile.key}
                            onNewFile={openNewFile}
                            onCloseNewFile={() => setNewFile((current) => ({ ...current, open: false }))}
                        />
                    </aside>

                    <section className={cx("min-h-0 min-w-0 flex-1 lg:flex", mobileView === "editor" ? "flex" : "hidden")}>
                        <EditorPane
                            file={activeFile}
                            loaded={filesApi.loaded}
                            saveState={filesApi.saveState}
                            onChange={filesApi.updateCode}
                            bindEditor={filesApi.bindEditor}
                            setMountedFile={filesApi.setMountedFile}
                            onRetrySave={flushAll}
                            onDownload={downloadFile}
                            onOpenInEditor={openInEditor}
                            onNewFile={openNewFile}
                            top={showGuide ? <GettingStarted steps={checklist} onDismiss={() => void dismissGuide()} dismissing={dismissing} /> : null}
                        />
                    </section>

                    <aside className={cx("min-h-0 w-full shrink-0 flex-col border-s border-zinc-200 bg-white dark:border-white/10 dark:bg-zinc-900 lg:flex lg:w-[360px] xl:w-[400px]", mobileView === "panel" ? "flex" : "hidden")}>
                        <div className="flex shrink-0 gap-1 border-b border-zinc-200 px-2 pt-1.5 dark:border-white/10" role="tablist" aria-label={tx(C.panelTabs)}>
                            {panelTabs.map((tab) => (
                                <button key={tab.id} type="button" role="tab" aria-selected={rightTab === tab.id} onClick={() => setRightTab(tab.id)} className={cx("relative inline-flex flex-1 items-center justify-center gap-1.5 rounded-t-lg px-2 py-2 text-xs font-bold transition", rightTab === tab.id ? "text-indigo-700 dark:text-indigo-300" : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white")}>
                                    <tab.icon className="h-4 w-4" aria-hidden />{tx(tab.label)}
                                    {tab.count !== undefined && tab.count > 0 && <span className="rounded-full bg-zinc-100 px-1.5 text-[10px] tabular-nums text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">{tab.count}</span>}
                                    {rightTab === tab.id && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-indigo-600 dark:bg-indigo-400" aria-hidden />}
                                </button>
                            ))}
                        </div>
                        <div className="relative min-h-0 flex-1">
                            <div className={cx("absolute inset-0 flex", rightTab !== "chat" && "invisible")} aria-hidden={rightTab !== "chat"}>
                                <ChatPanel
                                    messages={messagesApi.messages}
                                    loaded={messagesApi.loaded}
                                    hasMore={messagesApi.hasMore}
                                    onLoadOlder={messagesApi.loadOlder}
                                    lastReadAt={lastReadAt}
                                    visible={chatVisible}
                                    typingNames={typingNames}
                                    onTyping={onTyping}
                                    onStopTyping={stopTyping}
                                    focusNonce={focusNonce}
                                    jumpTarget={jumpTarget}
                                    onShowPinned={() => setRightTab("pinned")}
                                />
                            </div>
                            {rightTab === "pinned" && (
                                <div className="absolute inset-0 flex">
                                    <PinnedPanel messages={messagesApi.messages} onJump={(id) => { setRightTab("chat"); setJumpTarget({ id, nonce: Date.now() }); }} />
                                </div>
                            )}
                            {rightTab === "members" && (
                                <div className="absolute inset-0 flex">
                                    <MembersPanel onInvite={openInvite} onCall={callMember} onOpenRules={() => openSettings("rules")} />
                                </div>
                            )}
                        </div>
                    </aside>
                </div>

                <nav className="grid shrink-0 grid-cols-4 border-t border-zinc-200 bg-white pb-[env(safe-area-inset-bottom)] dark:border-white/10 dark:bg-zinc-900 lg:hidden" aria-label={tx(C.mobileNav)}>
                    {mobileTabs.map((tab) => (
                        <button key={tab.id} type="button" onClick={tab.onClick} aria-current={tab.active ? "page" : undefined} className={cx("flex flex-col items-center gap-0.5 py-2 text-[11px] font-semibold transition", tab.active ? "text-indigo-600 dark:text-indigo-300" : "text-zinc-500 dark:text-zinc-400")}>
                            <tab.icon className="h-5 w-5" aria-hidden />{tx(tab.label)}
                        </button>
                    ))}
                </nav>
            </main>

            <InviteDialog key={`invite-${invite.key}`} open={invite.open} onClose={() => setInvite((current) => ({ ...current, open: false }))} onChanged={() => void refresh()} />
            <SettingsDialog key={`settings-${settings.key}`} open={settings.open} initialTab={settings.tab} onClose={() => setSettings((current) => ({ ...current, open: false }))} onLeft={leftGroup} onRestoreGuide={restoreGuide} />
            {confirmElement}
            <ToastViewport toasts={toasts} onDismiss={dismiss} />
        </WorkspaceContext.Provider>
    );
}

function StateCard({ icon, title, text, children }: { icon: ReactNode; title: string; text?: string; children?: ReactNode }) {
    return (
        <main id="main-content" className="flex min-h-dvh flex-col items-center justify-center bg-zinc-100 p-6 text-center text-zinc-900 dark:bg-zinc-950 dark:text-white">
            <span className="flex h-16 w-16 items-center justify-center rounded-3xl bg-gradient-to-br from-indigo-500 to-fuchsia-600 text-white shadow-xl shadow-indigo-500/25">{icon}</span>
            <h1 className="mt-5 text-2xl font-black tracking-tight">{title}</h1>
            {text && <p className="mt-2 max-w-md text-sm text-zinc-500 dark:text-zinc-400">{text}</p>}
            {children}
        </main>
    );
}
