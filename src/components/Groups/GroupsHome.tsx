"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
    ArrowRight, ArrowUpDown, Check, Clock, FolderGit2, Link2, LogIn, Mail, MessageSquare, Mic, Plus, RefreshCw, Search,
    Sparkles, UsersRound, X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import Header from "@/components/Header";
import SiteFooter from "@/components/SiteFooter";
import { useI18n, type Copy } from "@/lib/i18n";
import {
    GROUP_COLORS,
    INVITE_TOKEN_PATTERN,
    getGroupTemplate,
    inviteLinkPath,
    toMillis,
    type GroupInvitationItem,
    type GroupListItem,
    type GroupListResponse,
} from "@/lib/groups";
import { groupsApi, useGroupErrorText } from "./api";
import CreateGroupWizard from "./CreateGroupWizard";
import { AvatarStack, GroupTile, RoleBadge, Spinner, ToastViewport, cx, lastReadKey, relativeTime, storageGet, useToasts } from "./ui";

type Filter = "all" | "owned" | "managed" | "joined";
type Sort = "activity" | "name";

const C = {
    badge: { TR: "Canlı ortak çalışma", EN: "Live collaboration" },
    title: { TR: "Gruplar", EN: "Groups" },
    subtitle: { TR: "Arkadaşlarınla aynı dosyalarda canlı kod yaz, proje sohbetinde yazılı ya da sesli konuş, önemli mesajları sabitle ve ekibini davet bağlantılarıyla büyüt.", EN: "Code live in the same files with your friends, talk in the project chat by text or voice, pin what matters and grow your team with invite links." },
    newGroup: { TR: "Yeni grup", EN: "New group" },
    joinTitle: { TR: "Davet bağlantın mı var?", EN: "Have an invite link?" },
    joinPlaceholder: { TR: "Bağlantıyı veya davet kodunu yapıştır", EN: "Paste the link or invite code" },
    joinButton: { TR: "Katıl", EN: "Join" },
    joinInvalid: { TR: "Bu bir Hanogt davet bağlantısına benzemiyor.", EN: "That doesn't look like a Hanogt invite link." },
    statGroups: { TR: "grup", EN: "groups" },
    statUnread: { TR: "okunmamış", EN: "unread" },
    statInvites: { TR: "davet", EN: "invitations" },
    invitations: { TR: "Grup davetleri", EN: "Group invitations" },
    invitedBy: { TR: "{name} seni davet etti", EN: "{name} invited you" },
    expires: { TR: "Son geçerlilik: {time}", EN: "Expires {time}" },
    accept: { TR: "Kabul et", EN: "Accept" },
    decline: { TR: "Reddet", EN: "Decline" },
    accepted: { TR: "Gruba katıldın!", EN: "You joined the group!" },
    declined: { TR: "Davet reddedildi.", EN: "Invitation declined." },
    search: { TR: "Gruplarda ara…", EN: "Search groups…" },
    searchLabel: { TR: "Gruplarda ara", EN: "Search groups" },
    filterLabel: { TR: "Rol filtresi", EN: "Role filter" },
    filterAll: { TR: "Tümü", EN: "All" },
    filterOwned: { TR: "Sahibi olduklarım", EN: "Owned" },
    filterManaged: { TR: "Yönettiklerim", EN: "Admin" },
    filterJoined: { TR: "Üye olduklarım", EN: "Member" },
    sortLabel: { TR: "Sıralama", EN: "Sort" },
    sortActivity: { TR: "Son etkinlik", EN: "Recent activity" },
    sortName: { TR: "Ada göre", EN: "By name" },
    noMatch: { TR: "Aramanla eşleşen grup yok.", EN: "No groups match your search." },
    clearFilters: { TR: "Filtreleri temizle", EN: "Clear filters" },
    unread: { TR: "Yeni mesaj", EN: "New messages" },
    lastActivity: { TR: "Son etkinlik {time}", EN: "Active {time}" },
    noActivity: { TR: "Henüz mesaj yok", EN: "No messages yet" },
    loading: { TR: "Gruplar yükleniyor", EN: "Loading groups" },
    loadFailed: { TR: "Gruplar yüklenemedi.", EN: "Groups couldn't be loaded." },
    retry: { TR: "Tekrar dene", EN: "Try again" },
    emptyTitle: { TR: "İlk grubunu kur", EN: "Set up your first group" },
    emptyText: { TR: "Gruplar; arkadaşlarınla, sınıfınla veya takımınla birlikte üretmen için özel çalışma alanlarıdır. Hazır bir şablon seç, dosyalar ve karşılama mesajı otomatik hazırlansın.", EN: "Groups are private workspaces where you build together with friends, classmates or your team. Pick a template and the starter files and welcome message are prepared for you." },
    featureFiles: { TR: "Canlı ortak dosyalar", EN: "Live shared files" },
    featureFilesText: { TR: "Herkes aynı dosyayı düzenler, değişiklikler anında görünür.", EN: "Everyone edits the same files and sees changes instantly." },
    featureChat: { TR: "Sohbet ve sesli mesaj", EN: "Chat & voice messages" },
    featureChatText: { TR: "@bahsetmeler, #konular, tepkiler ve sabitlenen mesajlar.", EN: "@mentions, #topics, reactions and pinned messages." },
    featureInvite: { TR: "Kolay davet", EN: "Easy invites" },
    featureInviteText: { TR: "Arkadaşlarını davet et ya da süreli bir bağlantı paylaş.", EN: "Invite friends or share a link that expires." },
    createFirst: { TR: "Grup oluştur", EN: "Create a group" },
    signInTitle: { TR: "Gruplar için giriş yapın", EN: "Sign in to use Groups" },
    signInText: { TR: "Ortak çalışma alanları yalnızca doğrulanmış grup üyelerine açıktır.", EN: "Shared workspaces are open to verified group members only." },
    signIn: { TR: "Giriş yap", EN: "Sign in" },
    members: { TR: "{count} üye", EN: "{count} members" },
    oneMember: { TR: "1 üye", EN: "1 member" },
    openGroup: { TR: "{name} grubunu aç", EN: "Open {name}" },
    noticeLeft: { TR: "Gruptan ayrıldın.", EN: "You left the group." },
    noticeDeleted: { TR: "Grup ve tüm içeriği silindi.", EN: "The group and all of its content were deleted." },
} satisfies Record<string, Copy>;

/** Accepts a full invite URL, a `?join=` URL or the bare 22-character code. */
export function extractInviteToken(value: string) {
    const trimmed = value.trim();
    const match = /(?:\/groups\/join\/|[?&]join=)([A-Za-z0-9_-]{22})(?![A-Za-z0-9_-])/.exec(trimmed);
    if (match) return match[1];
    return INVITE_TOKEN_PATTERN.test(trimmed) ? trimmed : null;
}

function activityOf(group: GroupListItem) {
    return Math.max(toMillis(group.lastMessageAt), toMillis(group.updatedAt), toMillis(group.createdAt));
}

export default function GroupsHome() {
    const { data: session, status } = useSession();
    const router = useRouter();
    const { tx, locale } = useI18n();
    const errorText = useGroupErrorText();
    const { toasts, push, dismiss } = useToasts();
    const email = session?.user?.email?.toLowerCase() || "";
    const [data, setData] = useState<GroupListResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState("");
    const [readMap, setReadMap] = useState<Record<string, number>>({});
    const [query, setQuery] = useState("");
    const [filter, setFilter] = useState<Filter>("all");
    const [sort, setSort] = useState<Sort>("activity");
    const [wizardOpen, setWizardOpen] = useState(false);
    const [wizardKey, setWizardKey] = useState(0);
    const [joinValue, setJoinValue] = useState("");
    const [joinError, setJoinError] = useState("");
    const [busyInvite, setBusyInvite] = useState("");
    const [now, setNow] = useState(() => Date.now());

    const applyList = useCallback((list: GroupListResponse) => {
        setData(list);
        setReadMap(Object.fromEntries(list.groups.map((group) => [group.id, Number(storageGet(lastReadKey(group.id)) || 0)])));
        setNow(Date.now());
        setLoadError("");
    }, []);

    const reload = useCallback(async () => {
        setLoading(true);
        try {
            applyList(await groupsApi.list());
        } catch (error) {
            setLoadError(errorText(error, C.loadFailed));
        } finally {
            setLoading(false);
        }
    }, [applyList, errorText]);

    useEffect(() => {
        if (!email) return;
        let active = true;
        groupsApi.list()
            .then((list) => { if (active) applyList(list); })
            .catch((error: unknown) => { if (active) setLoadError(errorText(error, C.loadFailed)); })
            .finally(() => { if (active) setLoading(false); });
        return () => { active = false; };
    }, [applyList, email, errorText]);

    // Deep links: /groups?join=<token> opens the join card, /groups?create=1 opens the wizard,
    // /groups?notice=left|deleted confirms what just happened in a workspace.
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const token = extractInviteToken(params.get("join") || "");
        if (token) {
            router.replace(inviteLinkPath(token));
            return;
        }
        const notice = params.get("notice");
        const create = params.get("create") === "1";
        if (!create && notice !== "left" && notice !== "deleted") return;
        const timer = window.setTimeout(() => {
            if (create) setWizardOpen(true);
            if (notice === "left" || notice === "deleted") push(tx(notice === "left" ? C.noticeLeft : C.noticeDeleted), "success");
            // Handled once: a reload or language change must not repeat it.
            window.history.replaceState(null, "", "/groups");
        }, 0);
        return () => window.clearTimeout(timer);
    }, [push, router, tx]);

    useEffect(() => {
        const timer = window.setInterval(() => setNow(Date.now()), 60_000);
        return () => window.clearInterval(timer);
    }, []);

    const groups = useMemo(() => data?.groups ?? [], [data]);
    const invites = data?.invites ?? [];
    const isUnread = useCallback((group: GroupListItem) => Boolean(group.lastMessageAt) && !group.lastMessageFromMe && toMillis(group.lastMessageAt) > (readMap[group.id] || 0), [readMap]);
    const unreadCount = groups.filter(isUnread).length;

    const visible = useMemo(() => {
        const needle = query.trim().toLocaleLowerCase(locale);
        const list = groups.filter((group) => {
            if (filter === "owned" && group.role !== "owner") return false;
            if (filter === "managed" && group.role !== "admin") return false;
            if (filter === "joined" && group.role !== "member") return false;
            return !needle || `${group.name} ${group.description} ${group.projectName}`.toLocaleLowerCase(locale).includes(needle);
        });
        return sort === "name" ? [...list].sort((a, b) => a.name.localeCompare(b.name, locale)) : [...list].sort((a, b) => activityOf(b) - activityOf(a));
    }, [filter, groups, locale, query, sort]);

    /** A fresh wizard (new key) every time it opens, so no stale input survives. */
    const openWizard = () => {
        setWizardKey((value) => value + 1);
        setWizardOpen(true);
    };

    const submitJoin = (event: FormEvent) => {
        event.preventDefault();
        const token = extractInviteToken(joinValue);
        if (!token) {
            setJoinError(tx(C.joinInvalid));
            return;
        }
        setJoinError("");
        router.push(inviteLinkPath(token));
    };

    const resolveInvite = async (invite: GroupInvitationItem, accept: boolean) => {
        setBusyInvite(invite.id);
        try {
            await groupsApi.action({ action: accept ? "accept-invite" : "reject-invite", groupId: invite.groupId });
            if (accept) {
                push(tx(C.accepted), "success");
                router.push(`/groups/${invite.groupId}`);
                return;
            }
            push(tx(C.declined), "info");
            await reload();
        } catch (error) {
            push(errorText(error), "error");
            await reload();
        } finally {
            setBusyInvite("");
        }
    };

    if (status === "loading") {
        return <div className="flex min-h-dvh items-center justify-center bg-zinc-50 dark:bg-zinc-950"><Spinner className="h-7 w-7 text-indigo-500" /></div>;
    }
    if (!session?.user) {
        return (
            <div className="min-h-dvh bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-white">
                <Header />
                <main id="main-content" className="mx-auto flex max-w-xl flex-col items-center px-4 pb-24 pt-36 text-center">
                    <span className="flex h-16 w-16 items-center justify-center rounded-3xl bg-gradient-to-br from-indigo-500 to-fuchsia-600 text-white shadow-xl shadow-indigo-500/25"><UsersRound className="h-8 w-8" aria-hidden /></span>
                    <h1 className="mt-6 text-3xl font-black tracking-tight">{tx(C.signInTitle)}</h1>
                    <p className="mt-3 text-zinc-500 dark:text-zinc-400">{tx(C.signInText)}</p>
                    <Link href="/login?callbackUrl=%2Fgroups" className="mt-7 inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-indigo-600 to-violet-600 px-6 py-3 font-bold text-white shadow-lg shadow-indigo-600/25 transition hover:-translate-y-0.5"><LogIn className="h-5 w-5" aria-hidden />{tx(C.signIn)}</Link>
                </main>
            </div>
        );
    }

    const filters: Array<{ id: Filter; label: Copy }> = [
        { id: "all", label: C.filterAll },
        { id: "owned", label: C.filterOwned },
        { id: "managed", label: C.filterManaged },
        { id: "joined", label: C.filterJoined },
    ];

    return (
        <div className="min-h-dvh overflow-x-clip bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-white">
            <Header />
            <main id="main-content" className="mx-auto max-w-7xl px-4 pb-24 pt-24 sm:px-6">
                <motion.section
                    initial={{ opacity: 0, y: 14 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.45, ease: "easeOut" }}
                    className="relative mb-8 overflow-hidden rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-zinc-900/60 sm:p-8"
                >
                    <div className="pointer-events-none absolute -top-24 end-0 h-64 w-64 rounded-full bg-indigo-500/15 blur-3xl" aria-hidden />
                    <div className="pointer-events-none absolute -bottom-24 start-1/3 h-56 w-56 rounded-full bg-fuchsia-500/10 blur-3xl" aria-hidden />
                    <div className="relative grid gap-8 lg:grid-cols-[1.4fr_1fr] lg:items-end">
                        <div className="min-w-0">
                            <span className="inline-flex items-center gap-2 rounded-full border border-indigo-500/20 bg-indigo-500/10 px-3 py-1 text-xs font-bold text-indigo-700 dark:text-indigo-300"><Sparkles className="h-3.5 w-3.5" aria-hidden />{tx(C.badge)}</span>
                            <h1 className="mt-4 text-4xl font-black tracking-tight sm:text-5xl">{tx(C.title)}</h1>
                            <p className="mt-3 max-w-2xl text-[15px] leading-7 text-zinc-600 dark:text-zinc-400">{tx(C.subtitle)}</p>
                            <div className="mt-5 flex flex-wrap items-center gap-2 text-sm">
                                <span className="inline-flex items-center gap-2 rounded-2xl border border-zinc-200 bg-zinc-50 px-3.5 py-2 dark:border-white/10 dark:bg-white/5"><UsersRound className="h-4 w-4 text-indigo-500" aria-hidden /><strong className="tabular-nums">{loading && !data ? "–" : groups.length}</strong><span className="text-zinc-500 dark:text-zinc-400">{tx(C.statGroups)}</span></span>
                                <span className="inline-flex items-center gap-2 rounded-2xl border border-zinc-200 bg-zinc-50 px-3.5 py-2 dark:border-white/10 dark:bg-white/5"><MessageSquare className="h-4 w-4 text-fuchsia-500" aria-hidden /><strong className="tabular-nums">{loading && !data ? "–" : unreadCount}</strong><span className="text-zinc-500 dark:text-zinc-400">{tx(C.statUnread)}</span></span>
                                {invites.length > 0 && <a href="#group-invitations" className="inline-flex items-center gap-2 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-3.5 py-2 font-semibold text-amber-800 dark:text-amber-300"><Mail className="h-4 w-4" aria-hidden /><strong className="tabular-nums">{invites.length}</strong>{tx(C.statInvites)}</a>}
                            </div>
                        </div>
                        <div className="flex flex-col gap-3">
                            <button type="button" onClick={openWizard} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-indigo-600 to-violet-600 px-5 py-3.5 font-bold text-white shadow-lg shadow-indigo-600/25 transition hover:-translate-y-0.5 hover:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-zinc-900">
                                <Plus className="h-5 w-5" aria-hidden />{tx(C.newGroup)}
                            </button>
                            <form onSubmit={submitJoin} className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3 dark:border-white/10 dark:bg-white/[0.03]">
                                <label htmlFor="group-join-input" className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400"><Link2 className="h-3.5 w-3.5" aria-hidden />{tx(C.joinTitle)}</label>
                                <div className="flex gap-2">
                                    <input id="group-join-input" value={joinValue} onChange={(event) => { setJoinValue(event.target.value); setJoinError(""); }} placeholder={tx(C.joinPlaceholder)} className="min-w-0 flex-1 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 dark:border-white/10 dark:bg-zinc-900" autoComplete="off" spellCheck={false} />
                                    <button type="submit" disabled={!joinValue.trim()} className="rounded-xl bg-zinc-900 px-4 text-sm font-bold text-white transition hover:bg-zinc-700 disabled:opacity-40 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200">{tx(C.joinButton)}</button>
                                </div>
                                {joinError && <p className="mt-2 text-xs font-medium text-red-600 dark:text-red-400" role="alert">{joinError}</p>}
                            </form>
                        </div>
                    </div>
                </motion.section>

                {invites.length > 0 && (
                    <section id="group-invitations" aria-labelledby="group-invitations-title" className="mb-8 scroll-mt-24 rounded-3xl border border-amber-500/25 bg-gradient-to-br from-amber-500/[0.08] to-fuchsia-500/[0.06] p-5 sm:p-6">
                        <h2 id="group-invitations-title" className="flex items-center gap-2 text-lg font-black"><Mail className="h-5 w-5 text-amber-500" aria-hidden />{tx(C.invitations)}<span className="rounded-full bg-amber-500 px-2 py-0.5 text-xs font-bold text-white">{invites.length}</span></h2>
                        <div className="mt-4 grid gap-3 md:grid-cols-2">
                            <AnimatePresence initial={false}>
                                {invites.map((invite) => (
                                    <motion.div key={invite.id} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.97 }} className="flex items-center gap-3 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-zinc-900">
                                        <GroupTile emoji={invite.groupEmoji} color={invite.groupColor} size="md" />
                                        <div className="min-w-0 flex-1">
                                            <p className="truncate font-bold">{invite.groupName}</p>
                                            <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">{tx(C.invitedBy, { name: invite.fromName })} · {invite.memberCount === 1 ? tx(C.oneMember) : tx(C.members, { count: invite.memberCount })}</p>
                                            {invite.expiresAt && <p className="mt-0.5 flex items-center gap-1 text-[11px] text-zinc-400"><Clock className="h-3 w-3" aria-hidden />{tx(C.expires, { time: relativeTime(toMillis(invite.expiresAt), now, locale) })}</p>}
                                        </div>
                                        <div className="flex shrink-0 gap-1.5">
                                            <button type="button" disabled={Boolean(busyInvite)} onClick={() => void resolveInvite(invite, true)} className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-sm font-bold text-white transition hover:bg-emerald-500 disabled:opacity-50" aria-label={tx(C.accept)}>
                                                {busyInvite === invite.id ? <Spinner className="h-4 w-4" /> : <Check className="h-4 w-4" aria-hidden />}<span className="hidden sm:inline">{tx(C.accept)}</span>
                                            </button>
                                            <button type="button" disabled={Boolean(busyInvite)} onClick={() => void resolveInvite(invite, false)} className="rounded-xl bg-zinc-100 p-2 text-zinc-600 transition hover:bg-zinc-200 disabled:opacity-50 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700" aria-label={tx(C.decline)} title={tx(C.decline)}>
                                                <X className="h-4 w-4" aria-hidden />
                                            </button>
                                        </div>
                                    </motion.div>
                                ))}
                            </AnimatePresence>
                        </div>
                    </section>
                )}

                {loadError && (
                    <div className="mb-6 flex flex-col items-start gap-3 rounded-2xl border border-amber-500/30 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-200 sm:flex-row sm:items-center sm:justify-between" role="alert">
                        <span>{loadError}</span>
                        <button type="button" onClick={() => void reload()} className="inline-flex items-center gap-1.5 rounded-xl bg-amber-600 px-3 py-1.5 font-bold text-white hover:bg-amber-500"><RefreshCw className="h-4 w-4" aria-hidden />{tx(C.retry)}</button>
                    </div>
                )}

                {groups.length > 0 && (
                    <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-center">
                        <label className="relative flex-1">
                            <span className="sr-only">{tx(C.searchLabel)}</span>
                            <Search className="pointer-events-none absolute start-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" aria-hidden />
                            <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={tx(C.search)} className="w-full rounded-2xl border border-zinc-200 bg-white py-2.5 pe-4 ps-10 text-sm outline-none transition focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 dark:border-white/10 dark:bg-zinc-900" />
                        </label>
                        <div className="flex flex-wrap items-center gap-2">
                            <div className="inline-flex flex-wrap items-center gap-1 rounded-2xl border border-zinc-200 bg-white p-1 text-sm dark:border-white/10 dark:bg-zinc-900" role="group" aria-label={tx(C.filterLabel)}>
                                {filters.map((entry) => (
                                    <button key={entry.id} type="button" onClick={() => setFilter(entry.id)} aria-pressed={filter === entry.id} className={cx("rounded-xl px-3 py-1.5 font-medium transition", filter === entry.id ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900" : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white")}>{tx(entry.label)}</button>
                                ))}
                            </div>
                            <div className="inline-flex items-center gap-1 rounded-2xl border border-zinc-200 bg-white p-1 text-sm dark:border-white/10 dark:bg-zinc-900" role="group" aria-label={tx(C.sortLabel)}>
                                <ArrowUpDown className="mx-2 h-4 w-4 text-zinc-400" aria-hidden />
                                {(["activity", "name"] as const).map((mode) => (
                                    <button key={mode} type="button" onClick={() => setSort(mode)} aria-pressed={sort === mode} className={cx("rounded-xl px-3 py-1.5 font-medium transition", sort === mode ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900" : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white")}>{tx(mode === "activity" ? C.sortActivity : C.sortName)}</button>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                {loading && !data ? (
                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" aria-busy="true" aria-label={tx(C.loading)}>
                        {[0, 1, 2].map((item) => <div key={item} className="h-56 animate-pulse rounded-3xl border border-zinc-200 bg-white dark:border-white/10 dark:bg-zinc-900" />)}
                    </div>
                ) : groups.length === 0 && !loadError ? (
                    <EmptyState onCreate={openWizard} onJoin={() => document.getElementById("group-join-input")?.focus()} />
                ) : visible.length === 0 && groups.length > 0 ? (
                    <div className="flex flex-col items-center gap-3 rounded-3xl border border-dashed border-zinc-300 p-10 text-center text-sm text-zinc-500 dark:border-zinc-700">
                        <Search className="h-6 w-6" aria-hidden />
                        {tx(C.noMatch)}
                        <button type="button" onClick={() => { setQuery(""); setFilter("all"); }} className="font-semibold text-indigo-600 hover:underline dark:text-indigo-400">{tx(C.clearFilters)}</button>
                    </div>
                ) : (
                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                        {visible.map((group, index) => <GroupCard key={group.id} group={group} index={index} unread={isUnread(group)} now={now} />)}
                    </div>
                )}
            </main>
            <SiteFooter />
            <CreateGroupWizard
                key={wizardKey}
                open={wizardOpen}
                onClose={() => setWizardOpen(false)}
                onCreated={(id) => router.push(`/groups/${id}`)}
                email={email}
            />
            <ToastViewport toasts={toasts} onDismiss={dismiss} />
        </div>
    );
}

function GroupCard({ group, index, unread, now }: { group: GroupListItem; index: number; unread: boolean; now: number }) {
    const { tx, locale } = useI18n();
    const palette = GROUP_COLORS[group.color];
    const template = group.template ? getGroupTemplate(group.template) : null;
    const lastActivity = activityOf(group);
    return (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(index, 9) * 0.04, duration: 0.3 }}>
            <Link
                href={`/groups/${group.id}`}
                aria-label={tx(C.openGroup, { name: group.name })}
                className="group relative flex h-full flex-col rounded-3xl border border-zinc-200 bg-white p-5 transition hover:-translate-y-0.5 hover:border-indigo-500/40 hover:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-white/10 dark:bg-zinc-900 dark:hover:border-indigo-400/40"
            >
                <span className={cx("pointer-events-none absolute inset-x-0 top-0 h-1 rounded-t-3xl bg-gradient-to-r opacity-80", palette.gradient)} aria-hidden />
                <div className="flex items-start justify-between gap-3">
                    <span className="relative">
                        <GroupTile emoji={group.emoji} color={group.color} size="md" />
                        {unread && <span className="absolute -end-1 -top-1 h-3.5 w-3.5 rounded-full border-2 border-white bg-fuchsia-500 dark:border-zinc-900" aria-hidden />}
                    </span>
                    <div className="flex items-center gap-2">
                        <RoleBadge role={group.role} showMember />
                        <ArrowRight className="h-5 w-5 text-zinc-300 transition group-hover:translate-x-1 group-hover:text-indigo-500 rtl:rotate-180 rtl:group-hover:-translate-x-1 dark:text-zinc-600" aria-hidden />
                    </div>
                </div>
                <h2 className="mt-4 line-clamp-1 text-lg font-black tracking-tight">{group.name}</h2>
                <p className="mt-1.5 line-clamp-2 min-h-10 text-sm leading-5 text-zinc-500 dark:text-zinc-400">{group.description || (template ? tx(template.description) : "")}</p>
                <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
                    {template && <span className={cx("inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold", palette.soft, palette.text)}>{template.emoji} {tx(template.name)}</span>}
                    {!template && group.projectName && <span className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2 py-0.5 font-semibold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"><FolderGit2 className="h-3 w-3" aria-hidden />{group.projectName}</span>}
                    {unread && <span className="inline-flex items-center gap-1 rounded-full bg-fuchsia-500/10 px-2 py-0.5 font-bold text-fuchsia-700 dark:text-fuchsia-300"><MessageSquare className="h-3 w-3" aria-hidden />{tx(C.unread)}</span>}
                </div>
                <div className="mt-auto flex items-center justify-between gap-3 border-t border-zinc-100 pt-4 text-xs text-zinc-500 dark:border-white/5 dark:text-zinc-400">
                    <span className="flex min-w-0 items-center gap-2">
                        <AvatarStack people={group.members} total={group.memberCount} />
                        <span className="truncate">{group.memberCount === 1 ? tx(C.oneMember) : tx(C.members, { count: group.memberCount })}</span>
                    </span>
                    <span className="flex shrink-0 items-center gap-1"><Clock className="h-3.5 w-3.5" aria-hidden />{group.lastMessageAt ? tx(C.lastActivity, { time: relativeTime(lastActivity, now, locale) }) : tx(C.noActivity)}</span>
                </div>
            </Link>
        </motion.div>
    );
}

function EmptyState({ onCreate, onJoin }: { onCreate: () => void; onJoin: () => void }) {
    const { tx } = useI18n();
    const features = [
        { icon: FolderGit2, title: C.featureFiles, text: C.featureFilesText, tone: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-300" },
        { icon: Mic, title: C.featureChat, text: C.featureChatText, tone: "bg-fuchsia-500/10 text-fuchsia-600 dark:text-fuchsia-300" },
        { icon: Link2, title: C.featureInvite, text: C.featureInviteText, tone: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-300" },
    ];
    return (
        <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="rounded-3xl border border-dashed border-zinc-300 bg-white/70 px-6 py-12 text-center dark:border-zinc-700 dark:bg-zinc-900/50 sm:px-10">
            <div className="mx-auto flex w-fit items-center" aria-hidden>
                <GroupTile emoji="📚" color="emerald" size="md" className="-rotate-6" />
                <GroupTile emoji="👥" color="indigo" size="lg" className="relative z-10 -mx-2" />
                <GroupTile emoji="🎮" color="fuchsia" size="md" className="rotate-6" />
            </div>
            <h2 className="mt-6 text-2xl font-black tracking-tight">{tx(C.emptyTitle)}</h2>
            <p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-zinc-500 dark:text-zinc-400">{tx(C.emptyText)}</p>
            <div className="mx-auto mt-8 grid max-w-3xl gap-3 text-start sm:grid-cols-3">
                {features.map((feature) => (
                    <div key={feature.title.EN} className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-white/10 dark:bg-zinc-900">
                        <span className={cx("flex h-9 w-9 items-center justify-center rounded-xl", feature.tone)}><feature.icon className="h-5 w-5" aria-hidden /></span>
                        <p className="mt-3 text-sm font-bold">{tx(feature.title)}</p>
                        <p className="mt-1 text-xs leading-5 text-zinc-500 dark:text-zinc-400">{tx(feature.text)}</p>
                    </div>
                ))}
            </div>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <button type="button" onClick={onCreate} className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-indigo-600 to-violet-600 px-5 py-3 font-bold text-white shadow-lg shadow-indigo-600/25 transition hover:-translate-y-0.5"><Plus className="h-5 w-5" aria-hidden />{tx(C.createFirst)}</button>
                <button type="button" onClick={onJoin} className="inline-flex items-center gap-2 rounded-2xl border border-zinc-200 px-5 py-3 font-semibold text-zinc-700 transition hover:bg-zinc-100 dark:border-white/10 dark:text-zinc-200 dark:hover:bg-zinc-800"><Link2 className="h-5 w-5" aria-hidden />{tx(C.joinTitle)}</button>
            </div>
        </motion.section>
    );
}
