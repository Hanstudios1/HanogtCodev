"use client";

import { LogIn, MessagesSquare, UserPlus } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import CreateGroupWizard from "@/components/Groups/CreateGroupWizard";
import { Spinner, ToastViewport, cx, useConfirm, useToasts } from "@/components/Groups/ui";
import Header from "@/components/Header";
import { useFirebaseBridge, useRawSession } from "@/components/Provider";
import { useOwnProfile, useOwnStatus } from "@/lib/account-profile-client";
import { useI18n, type Copy } from "@/lib/i18n";
import { socialApi, useSocialErrorText } from "@/lib/social/api";
import { useDmList, useFriendsOverview, useGroupUnread, useGroupsList, useLiveProfiles, useNow, useSocialModeState } from "@/lib/social/hooks";
import {
    hideDm,
    setAsideCollapsed,
    setSocialAudio,
    unhideDm,
    useAsideCollapsed,
    useGroupNotifyLevels,
    useGroupReadMap,
    useHiddenDms,
    useSocialAudio,
} from "@/lib/social/local-state";
import {
    dmChatId,
    dmHref,
    dmUnreadTotal,
    groupHref,
    homeBadgeCount,
    parseSocialRoute,
    railBadge,
    sortDms,
    visibleDms,
    type DmSummary,
    type SocialPerson,
} from "@/lib/social/model";
import { SocialContext, type SocialContextValue } from "./context";
import { clearSocialProfileCache } from "./profile";
import { GroupNavContext, type GroupNavState } from "./group/nav";
import GroupSidebar from "./GroupSidebar";
import HomeSidebar from "./HomeSidebar";
import JoinInviteDialog from "./JoinInviteDialog";
import QuickSwitcher from "./QuickSwitcher";
import ServerRail from "./ServerRail";
import { useDrawerFocus, useMediaQuery } from "./ui";
import UserPanel from "./UserPanel";

const C = {
    loading: { TR: "Hanogt Social açılıyor", EN: "Opening Hanogt Social" },
    navigation: { TR: "Hanogt Social gezinmesi", EN: "Hanogt Social navigation" },
    channels: { TR: "Kanallar ve sohbetler", EN: "Channels and conversations" },
    signInTitle: { TR: "Hanogt Social'a hoş geldin", EN: "Welcome to Hanogt Social" },
    signInText: { TR: "Arkadaşların, direkt mesajların ve grupların tek yerde. Sesli mesajlar, aramalar ve ortak kod dosyaları için giriş yap.", EN: "Your friends, direct messages and groups in one place. Sign in for voice messages, calls and shared code files." },
    signIn: { TR: "Giriş yap", EN: "Sign in" },
    signUp: { TR: "Hesap oluştur", EN: "Create an account" },
    friendsTitle: { TR: "Arkadaşlar", EN: "Friends" },
} satisfies Record<string, Copy>;

/**
 * Hanogt Social: friends, direct messages and groups in one Discord-style
 * app. The shell (a layout, so it survives navigation between screens)
 * holds the data, the server rail, the second column with the user panel,
 * the drawers on phones, the quick switcher and the shared dialogs; each
 * page renders the main area and its right-hand column.
 */
export default function SocialShell({ children }: { children: ReactNode }) {
    const auth = useRawSession();
    const email = auth.status === "authenticated" ? auth.data?.user?.email?.toLowerCase() || "" : "";
    if (auth.status === "loading") return <FullScreenSpinner />;
    if (!email) return <SignedOut />;
    return <SocialApp key={email} email={email} sessionName={auth.data?.user?.name || ""}>{children}</SocialApp>;
}

function FullScreenSpinner() {
    const { tx } = useI18n();
    return (
        <div className="flex h-dvh items-center justify-center bg-zinc-100 dark:bg-zinc-950" aria-busy="true" aria-label={tx(C.loading)}>
            <Spinner className="h-8 w-8 text-indigo-500" />
        </div>
    );
}

function SignedOut() {
    const { tx } = useI18n();
    const pathname = usePathname() || "/social";
    const callback = encodeURIComponent(pathname);
    return (
        <div className="min-h-dvh bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-white">
            <Header />
            <main id="main-content" className="mx-auto flex max-w-xl flex-col items-center px-4 pb-24 pt-32 text-center">
                <span className="flex h-16 w-16 items-center justify-center rounded-3xl bg-gradient-to-br from-indigo-500 to-fuchsia-600 text-white shadow-xl shadow-indigo-500/25"><MessagesSquare className="h-8 w-8" aria-hidden /></span>
                <h1 className="mt-6 text-3xl font-black tracking-tight">{tx(C.signInTitle)}</h1>
                <p className="mt-3 text-zinc-500 dark:text-zinc-400">{tx(C.signInText)}</p>
                <div className="mt-7 flex flex-col gap-2 sm:flex-row">
                    <Link href={`/login?callbackUrl=${callback}`} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-indigo-600 to-violet-600 px-6 py-3 font-bold text-white shadow-lg shadow-indigo-600/25 transition hover:-translate-y-0.5"><LogIn className="h-5 w-5" aria-hidden />{tx(C.signIn)}</Link>
                    <Link href={`/signup?callbackUrl=${callback}`} className="inline-flex items-center justify-center gap-2 rounded-2xl border border-zinc-200 px-6 py-3 font-semibold transition hover:bg-zinc-100 dark:border-white/10 dark:hover:bg-zinc-800"><UserPlus className="h-5 w-5" aria-hidden />{tx(C.signUp)}</Link>
                </div>
            </main>
        </div>
    );
}

function placeholderPerson(email: string): SocialPerson {
    return { email, username: email.split("@")[0] || "Hanogt", avatarUrl: null, nickname: "", nicknameTag: "", staffRole: null, planBadge: null, customStatus: "", statusEmoji: "", status: "offline", lastSeenAt: null };
}

function SocialApp({ email, sessionName, children }: { email: string; sessionName: string; children: ReactNode }) {
    const { tx } = useI18n();
    const router = useRouter();
    const pathname = usePathname() || "/social";
    const route = useMemo(() => parseSocialRoute(pathname), [pathname]);
    const bridge = useFirebaseBridge();
    const { mode, markBroken } = useSocialModeState({ ready: bridge.ready, failed: Boolean(bridge.failure) });
    const live = mode === "live";
    const now = useNow(30_000);
    const errorText = useSocialErrorText();
    const { toasts, push: notify, dismiss } = useToasts();
    const [confirmElement, confirm] = useConfirm();

    /* ---------------------------- the signed-in user ---------------------------- */

    const own = useOwnProfile(email);
    const ownStatus = useOwnStatus(email);
    const me = useMemo(() => ({
        email,
        username: own?.username || sessionName || email.split("@")[0],
        avatarUrl: own?.avatarUrl || null,
        nickname: own?.nickname || "",
        nicknameTag: own?.nicknameTag || "",
        customStatus: own?.customStatus || "",
        statusEmoji: own?.statusEmoji || "",
        status: ownStatus ?? (own?.statusPreference === "invisible" ? "offline" as const : own?.statusPreference === "dnd" ? "dnd" as const : own?.statusPreference === "idle" ? "idle" as const : "online" as const),
    }), [email, own, ownStatus, sessionName]);

    /* ---------------------------------- data ----------------------------------- */

    const friendsData = useFriendsOverview(email, mode, markBroken);
    const dmList = useDmList(email, mode, markBroken);
    const groupsList = useGroupsList(email, mode);

    const friendEmails = useMemo(() => friendsData.data?.friends.map((friend) => friend.email) ?? [], [friendsData.data]);
    const friendSet = useMemo(() => new Set(friendEmails), [friendEmails]);
    const blockedSet = useMemo(() => new Set(friendsData.data?.blocked.map((entry) => entry.email) ?? []), [friendsData.data]);
    const watchEmails = useMemo(() => [...friendEmails, ...dmList.entries.map((entry) => entry.partnerEmail)], [dmList.entries, friendEmails]);
    const liveProfiles = useLiveProfiles(watchEmails, live, markBroken);

    const friendMap = useMemo(() => new Map((friendsData.data?.friends ?? []).map((friend) => [friend.email, friend])), [friendsData.data]);
    const dmPeople = useMemo(() => new Map(dmList.entries.flatMap((entry) => (entry.person ? [[entry.partnerEmail, entry.person] as const] : []))), [dmList.entries]);

    const person = useCallback((target: string): SocialPerson | null => {
        const base = friendMap.get(target) ?? dmPeople.get(target) ?? null;
        const realtime = liveProfiles.get(target);
        if (!realtime) return base;
        const merged: SocialPerson = { ...(base ?? placeholderPerson(target)), ...realtime, email: target, username: realtime.username || base?.username || target.split("@")[0] };
        // Presence is shared between friends only (the server API does the same).
        return friendSet.has(target) ? merged : { ...merged, status: "offline", customStatus: "", statusEmoji: "", lastSeenAt: null };
    }, [dmPeople, friendMap, friendSet, liveProfiles]);

    const friendsList = useMemo(() => friendEmails.map((friend) => person(friend) ?? placeholderPerson(friend)), [friendEmails, person]);

    const hidden = useHiddenDms();
    const activeChatId = route.kind === "dm" ? dmChatId(email, route.email) : "";
    const dmSummaries: DmSummary[] = useMemo(() => sortDms(dmList.entries.map((entry) => ({
        chatId: entry.chatId,
        partner: person(entry.partnerEmail) ?? placeholderPerson(entry.partnerEmail),
        isFriend: entry.isFriend ?? friendSet.has(entry.partnerEmail),
        lastMessage: entry.lastMessage,
        lastMessageAt: entry.lastMessageAt,
        lastFromMe: entry.lastFromMe,
        unread: entry.chatId === activeChatId ? 0 : entry.unread,
        typing: entry.typing,
    })).filter((dm) => !blockedSet.has(dm.partner.email))), [activeChatId, blockedSet, dmList.entries, friendSet, person]);
    const visibleDmList = useMemo(() => visibleDms(dmSummaries, hidden, activeChatId), [activeChatId, dmSummaries, hidden]);
    const unreadTotal = dmUnreadTotal(dmSummaries);

    // Signing out (or into another account) unmounts this tree.
    useEffect(() => () => clearSocialProfileCache(), []);

    // Opening a closed conversation brings it back to the list.
    useEffect(() => {
        if (activeChatId && activeChatId in hidden) unhideDm(activeChatId);
    }, [activeChatId, hidden]);

    const groupIds = useMemo(() => groupsList.groups.map((group) => group.id), [groupsList.groups]);
    const readMap = useGroupReadMap(groupIds);
    const levels = useGroupNotifyLevels();
    const groupUnread = useGroupUnread({ groups: groupsList.groups, me: email, myName: me.username, activeGroupId: route.kind === "group" ? route.groupId : "", readMap, live });

    const incomingCount = friendsData.data?.incoming.length ?? 0;
    const homeBadge = homeBadgeCount(unreadTotal, incomingCount, groupsList.invites.length);
    const mentionTotal = groupsList.groups.reduce((sum, group) => sum + railBadge(groupUnread[group.id], levels[group.id]).count, 0);

    /* --------------------------------- actions --------------------------------- */

    const refreshFriends = friendsData.refresh;
    const refreshDms = dmList.refresh;
    const friendAction = useCallback(async (body: Record<string, unknown>, success?: Copy) => {
        try {
            await socialApi.friendAction(body);
            if (success) notify(tx(success), "success");
            await Promise.all([refreshFriends(), mode === "fallback" ? refreshDms().catch(() => undefined) : Promise.resolve()]);
            return true;
        } catch (failure) {
            notify(errorText(failure), "error");
            return false;
        }
    }, [errorText, mode, notify, refreshDms, refreshFriends, tx]);

    const audio = useSocialAudio();
    const toggleMic = useCallback(() => setSocialAudio(audio.micOff ? { micOff: false, deafened: false } : { micOff: true, deafened: false }), [audio.micOff]);
    const toggleDeafen = useCallback(() => setSocialAudio(audio.deafened ? { micOff: false, deafened: false } : { micOff: true, deafened: true }), [audio.deafened]);

    /* ------------------------------------ ui ------------------------------------ */

    const desktop = useMediaQuery("(min-width: 768px)");
    const wide = useMediaQuery("(min-width: 1024px)");
    // Drawer state is tied to the page it was opened on, so navigating closes it.
    const [navPath, setNavPath] = useState<string | null>(null);
    const [asidePath, setAsidePath] = useState<string | null>(null);
    const navOpen = !desktop && navPath === pathname;
    const asideOpen = !wide && asidePath === pathname;
    const asideCollapsed = useAsideCollapsed();
    const [switcher, setSwitcher] = useState({ open: false, key: 0 });
    const [wizard, setWizard] = useState({ open: false, key: 0 });
    const [join, setJoin] = useState({ open: false, key: 0 });
    const navRef = useRef<HTMLDivElement | null>(null);
    useDrawerFocus(navOpen, navRef);
    const [groupNav, setGroupNav] = useState<GroupNavState | null>(null);
    const groupSlot = useMemo(() => ({ nav: groupNav, publish: setGroupNav }), [groupNav]);

    const openSwitcher = useCallback(() => setSwitcher(({ key }) => ({ open: true, key: key + 1 })), []);
    const openCreateGroup = useCallback(() => setWizard(({ key }) => ({ open: true, key: key + 1 })), []);
    const openJoin = useCallback(() => setJoin(({ key }) => ({ open: true, key: key + 1 })), []);
    const setNavOpen = useCallback((open: boolean) => setNavPath(open ? pathname : null), [pathname]);
    const toggleAside = useCallback(() => {
        if (wide) setAsideCollapsed(!asideCollapsed);
        else setAsidePath((current) => (current === pathname ? null : pathname));
    }, [asideCollapsed, pathname, wide]);
    const closeAside = useCallback(() => setAsidePath(null), []);

    // Discord's navigation keys: Alt+↑/↓ moves between conversations (or a group's channels),
    // Ctrl+Alt+↑/↓ between Home and the groups.
    const navigationRef = useRef({ conversations: [] as string[], servers: [] as string[], current: "", server: "" });
    useEffect(() => {
        const groupChannels = groupNav?.group && route.kind === "group" && groupNav.groupId === route.groupId
            ? [groupHref(route.groupId), ...groupNav.group.topics.filter((topic) => topic !== "genel" && topic !== "general").map((topic) => groupHref(route.groupId, { topic }))]
            : [];
        navigationRef.current = {
            conversations: route.kind === "group" ? groupChannels : ["/social", ...visibleDmList.map((dm) => dmHref(dm.partner.email))],
            servers: ["/social", ...groupsList.groups.map((group) => groupHref(group.id))],
            current: route.kind === "dm" ? dmHref(route.email) : route.kind === "group" ? groupHref(route.groupId) : "/social",
            server: route.kind === "group" ? groupHref(route.groupId) : "/social",
        };
    });

    useEffect(() => {
        const onKey = (event: KeyboardEvent) => {
            if (event.altKey && !event.shiftKey && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
                if (event.target instanceof Element && event.target.closest(".monaco-editor")) return;
                const navigation = navigationRef.current;
                const servers = event.ctrlKey || event.metaKey;
                const list = servers ? navigation.servers : navigation.conversations;
                if (list.length < 2) return;
                let current = servers ? navigation.server : navigation.current;
                // Inside a group the open #topic is part of the address.
                if (!servers && route.kind === "group") {
                    const topic = new URLSearchParams(window.location.search).get("topic");
                    if (topic) current = groupHref(route.groupId, { topic });
                }
                event.preventDefault();
                const index = list.indexOf(current);
                const step = event.key === "ArrowDown" ? 1 : -1;
                router.push(list[index < 0 ? 0 : (index + step + list.length) % list.length]);
                return;
            }
            if ((event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === "k") {
                // Ctrl+K starts Monaco's chords (e.g. Ctrl+K Ctrl+C) inside the code editor.
                if (event.target instanceof Element && event.target.closest(".monaco-editor")) return;
                event.preventDefault();
                openSwitcher();
                return;
            }
            if (event.key !== "Escape") return;
            // Dialogs close themselves first.
            if (document.querySelector("[aria-modal='true']:not([data-social-drawer])")) return;
            if (navPath) setNavPath(null);
            if (asidePath) setAsidePath(null);
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [asidePath, navPath, openSwitcher, route, router]);

    // "(3) Hanogt Social" like Discord: unread direct messages, requests and mentions.
    useEffect(() => {
        const total = homeBadge + mentionTotal;
        const base = document.title.replace(/^\(\d+\+?\)\s+/, "");
        document.title = total > 0 ? `(${total > 99 ? "99+" : total}) ${base}` : base;
    }, [homeBadge, mentionTotal, pathname]);

    const value: SocialContextValue = useMemo(() => ({
        me,
        mode,
        live,
        markBroken,
        route,
        now,
        friends: {
            list: friendsList,
            incoming: friendsData.data?.incoming ?? [],
            outgoing: friendsData.data?.outgoing ?? [],
            blocked: friendsData.data?.blocked ?? [],
            loaded: friendsData.loaded,
            failed: Boolean(friendsData.error) && !friendsData.data,
            refresh: refreshFriends,
        },
        isFriend: (target: string) => friendSet.has(target),
        isBlocked: (target: string) => blockedSet.has(target),
        person,
        dms: {
            list: dmSummaries,
            visible: visibleDmList,
            loaded: dmList.loaded,
            unreadTotal,
            refresh: async () => {
                if (mode === "fallback") await refreshDms().catch(() => undefined);
            },
            hide: (chatId: string, lastMessageAt: number) => hideDm(chatId, Math.max(lastMessageAt, 1)),
        },
        groups: {
            list: groupsList.groups,
            invites: groupsList.invites,
            loaded: groupsList.loaded,
            failed: groupsList.error && !groupsList.groups.length,
            unread: groupUnread,
            levels,
            refresh: groupsList.refresh,
            patch: groupsList.patchGroup,
        },
        homeBadge,
        friendAction,
        notify,
        confirm,
        errorText,
        audio: { ...audio, toggleMic, toggleDeafen },
        ui: {
            openSwitcher,
            openCreateGroup,
            openJoin,
            navOpen,
            setNavOpen,
            asideCollapsed,
            asideOpen,
            toggleAside,
            closeAside,
            wide,
            desktop,
        },
    }), [
        asideCollapsed, asideOpen, audio, blockedSet, closeAside, confirm, desktop, dmList.loaded, dmSummaries, errorText, friendAction, friendSet, friendsData.data,
        friendsData.error, friendsData.loaded, friendsList, groupUnread, groupsList.error, groupsList.groups, groupsList.invites, groupsList.loaded, groupsList.patchGroup,
        groupsList.refresh, homeBadge, levels, live, markBroken, me, mode, navOpen, notify, now, openCreateGroup, openJoin, openSwitcher, person, refreshDms, refreshFriends,
        route, setNavOpen, toggleAside, toggleDeafen, toggleMic, unreadTotal, visibleDmList, wide,
    ]);

    const frame = (
        <div className="flex h-dvh w-full overflow-hidden bg-white text-zinc-900 dark:bg-zinc-900 dark:text-zinc-100">
            {navOpen && <div className="fixed inset-0 z-40 bg-zinc-950/60 backdrop-blur-[1px] md:hidden" onClick={() => setNavPath(null)} aria-hidden />}
            <div
                ref={navRef}
                id="social-nav"
                role={desktop ? undefined : "dialog"}
                aria-modal={navOpen ? true : undefined}
                aria-label={tx(C.navigation)}
                data-social-drawer
                inert={!desktop && !navOpen ? true : undefined}
                className={cx(
                    "fixed inset-y-0 start-0 z-50 flex h-full shrink-0 shadow-2xl transition-transform duration-200 md:static md:z-auto md:translate-x-0! md:shadow-none md:transition-none",
                    navOpen ? "translate-x-0" : "-translate-x-full rtl:translate-x-full",
                )}
            >
                <ServerRail />
                <div className="flex h-full w-60 flex-col bg-zinc-100 dark:bg-zinc-950" role="navigation" aria-label={tx(C.channels)}>
                    <div className="flex min-h-0 flex-1 flex-col">{route.kind === "group" ? <Suspense fallback={null}><GroupSidebar /></Suspense> : <HomeSidebar />}</div>
                    <UserPanel />
                </div>
            </div>
            <div className="flex min-w-0 flex-1">{children}</div>
        </div>
    );

    return (
        <SocialContext.Provider value={value}>
            <GroupNavContext.Provider value={groupSlot}>{frame}</GroupNavContext.Provider>
            <QuickSwitcher key={`switcher-${switcher.key}`} open={switcher.open} onClose={() => setSwitcher((current) => ({ ...current, open: false }))} />
            <JoinInviteDialog key={`join-${join.key}`} open={join.open} onClose={() => setJoin((current) => ({ ...current, open: false }))} />
            <CreateGroupWizard
                key={`wizard-${wizard.key}`}
                open={wizard.open}
                onClose={() => setWizard((current) => ({ ...current, open: false }))}
                onCreated={(id) => {
                    setWizard((current) => ({ ...current, open: false }));
                    void groupsList.refresh();
                    router.push(groupHref(id));
                }}
                email={email}
            />
            {confirmElement}
            <ToastViewport toasts={toasts} onDismiss={dismiss} />
        </SocialContext.Provider>
    );
}
