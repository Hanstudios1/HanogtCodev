"use client";

import { Ban, Check, Clock, Copy as CopyIcon, Inbox, Mail, MessageCircle, MoreVertical, Phone, Search, UserMinus, UserPlus, UserRound, Users, X } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import { groupsApi, useGroupErrorText } from "@/components/Groups/api";
import { GroupTile, Spinner, copyText, cx, relativeTime } from "@/components/Groups/ui";
import PresenceAvatar from "@/components/PresenceAvatar";
import StaffBadge from "@/components/StaffBadge";
import { useVoiceCall } from "@/components/VoiceCallProvider";
import { useI18n, type Copy } from "@/lib/i18n";
import { toMillis, type GroupInvitationItem } from "@/lib/groups";
import { LAST_SEEN_COPY, PRESENCE_STATUS_COPY, presenceTime } from "@/lib/presence";
import { socialApi } from "@/lib/social/api";
import { FRIENDS_TABS, dmHref, filterFriends, formatFriendTag, groupHref, isFriendsTab, parseFriendTag, type FriendRequestItem, type FriendsTab, type SocialPerson } from "@/lib/social/model";
import { useSocial } from "./context";
import { FirstRunNotice } from "./Disclaimer";
import { useProfileViewer } from "./profile";
import { CountBadge, DropdownMenu, EmptyState, MainHeader } from "./ui";

type View = FriendsTab | "add";

const C = {
    title: { TR: "Arkadaşlar", EN: "Friends" },
    tabs: { TR: "Arkadaş listeleri", EN: "Friend lists" },
    online: { TR: "Çevrimiçi", EN: "Online" },
    all: { TR: "Tümü", EN: "All" },
    pending: { TR: "Bekleyen", EN: "Pending" },
    blocked: { TR: "Engellenen", EN: "Blocked" },
    add: { TR: "Arkadaş ekle", EN: "Add friend" },
    search: { TR: "Ara", EN: "Search" },
    searchLabel: { TR: "Arkadaşlarında ara", EN: "Search your friends" },
    onlineCount: { TR: "Çevrimiçi — {count}", EN: "Online — {count}" },
    allCount: { TR: "Tüm arkadaşlar — {count}", EN: "All friends — {count}" },
    incoming: { TR: "Gelen istekler — {count}", EN: "Incoming requests — {count}" },
    outgoing: { TR: "Gönderilen istekler — {count}", EN: "Sent requests — {count}" },
    groupInvites: { TR: "Grup davetleri — {count}", EN: "Group invitations — {count}" },
    blockedCount: { TR: "Engellenenler — {count}", EN: "Blocked — {count}" },
    message: { TR: "Mesaj gönder", EN: "Message" },
    call: { TR: "Sesli ara", EN: "Voice call" },
    callBusy: { TR: "Başka bir aramadasın", EN: "You're in another call" },
    more: { TR: "{name} için diğer işlemler", EN: "More actions for {name}" },
    profile: { TR: "Profili görüntüle", EN: "View profile" },
    remove: { TR: "Arkadaşlıktan çıkar", EN: "Remove friend" },
    block: { TR: "Engelle", EN: "Block" },
    unblock: { TR: "Engeli kaldır", EN: "Unblock" },
    accept: { TR: "Kabul et", EN: "Accept" },
    reject: { TR: "Reddet", EN: "Decline" },
    cancel: { TR: "İsteği iptal et", EN: "Cancel request" },
    incomingHint: { TR: "Gelen arkadaşlık isteği", EN: "Incoming friend request" },
    outgoingHint: { TR: "Giden arkadaşlık isteği", EN: "Outgoing friend request" },
    invitedBy: { TR: "{name} seni davet etti", EN: "{name} invited you" },
    expires: { TR: "Son geçerlilik: {time}", EN: "Expires {time}" },
    lastSeen: LAST_SEEN_COPY,
    removeTitle: { TR: "{name} arkadaşlıktan çıkarılsın mı?", EN: "Remove {name} as a friend?" },
    removeBody: { TR: "Sohbet geçmişiniz kalır ama birbirinize mesaj gönderemez ve arayamazsınız.", EN: "Your chat history stays, but you can't message or call each other." },
    blockTitle: { TR: "{name} engellensin mi?", EN: "Block {name}?" },
    blockBody: { TR: "Arkadaşlıktan çıkarılır, sana istek gönderemez ve sohbet listende görünmez.", EN: "They're removed as a friend, can't send you requests and disappear from your conversations." },
    removed: { TR: "Arkadaşlıktan çıkarıldı.", EN: "Friend removed." },
    blockedToast: { TR: "Kullanıcı engellendi.", EN: "User blocked." },
    unblocked: { TR: "Engel kaldırıldı.", EN: "User unblocked." },
    accepted: { TR: "Artık arkadaşsınız!", EN: "You're friends now!" },
    rejected: { TR: "İstek reddedildi.", EN: "Request declined." },
    cancelled: { TR: "İstek iptal edildi.", EN: "Request cancelled." },
    joinedGroup: { TR: "Gruba katıldın!", EN: "You joined the group!" },
    declinedInvite: { TR: "Davet reddedildi.", EN: "Invitation declined." },
    emptyOnlineTitle: { TR: "Şu an çevrimiçi arkadaşın yok", EN: "No friends are online right now" },
    emptyOnlineText: { TR: "Biri gelince burada yeşil bir noktayla görünecek.", EN: "When someone shows up, they'll appear here with a green dot." },
    emptyAllTitle: { TR: "Henüz arkadaşın yok", EN: "You don't have any friends yet" },
    emptyAllText: { TR: "Takma adı ve etiketiyle (ör. Oyuncu#1234) arkadaş ekleyebilirsin.", EN: "Add friends by their nickname and tag (e.g. Player#1234)." },
    emptyPendingTitle: { TR: "Bekleyen istek yok", EN: "No pending requests" },
    emptyPendingText: { TR: "Arkadaşlık istekleri ve grup davetleri burada görünür.", EN: "Friend requests and group invitations show up here." },
    emptyBlockedTitle: { TR: "Kimseyi engellemedin", EN: "You haven't blocked anyone" },
    noMatch: { TR: "Aramanla eşleşen arkadaş yok.", EN: "No friends match your search." },
    loadFailed: { TR: "Arkadaş listesi yüklenemedi.", EN: "The friend list couldn't be loaded." },
    retry: { TR: "Tekrar dene", EN: "Try again" },
    addTitle: { TR: "Arkadaş ekle", EN: "Add friend" },
    addText: { TR: "Hanogt takma adı ve etiketiyle arkadaş ekleyebilirsin. Büyük-küçük harfe dikkat et!", EN: "You can add friends with their Hanogt nickname and tag. Mind upper and lower case!" },
    addLabel: { TR: "Takma ad ve etiket", EN: "Nickname and tag" },
    addPlaceholder: { TR: "Oyuncu#1234", EN: "Player#1234" },
    addSubmit: { TR: "Arkadaşlık isteği gönder", EN: "Send friend request" },
    addSent: { TR: "{tag} kişisine arkadaşlık isteği gönderildi.", EN: "Friend request sent to {tag}." },
    addAccepted: { TR: "{tag} sana zaten istek göndermişti; artık arkadaşsınız!", EN: "{tag} had already sent you a request; you're friends now!" },
    yourTag: { TR: "Senin etiketin", EN: "Your tag" },
    copyTag: { TR: "Etiketini kopyala", EN: "Copy your tag" },
    copied: { TR: "Etiketin panoya kopyalandı.", EN: "Your tag was copied." },
    copyFailed: { TR: "Panoya kopyalanamadı.", EN: "Couldn't copy to the clipboard." },
    noTag: { TR: "Henüz bir takma adın yok. Arkadaşlarının seni bulabilmesi için Hesap Ayarları'ndan bir takma ad belirle.", EN: "You don't have a nickname yet. Set one in Account Settings so your friends can find you." },
    settings: { TR: "Hesap Ayarları", EN: "Account Settings" },
} satisfies Record<string, Copy>;

const TAB_COPY: Record<FriendsTab, Copy> = { online: C.online, all: C.all, pending: C.pending, blocked: C.blocked };

/** Home: the Friends screen with Discord's tabs (Çevrimiçi, Tümü, Bekleyen, Engellenen) and "Arkadaş ekle". */
export default function FriendsView() {
    const { tx } = useI18n();
    const router = useRouter();
    const params = useSearchParams();
    const social = useSocial();
    const { friends, groups, ui, notify } = social;
    const raw = params.get("tab");
    const view: View = raw === "add" ? "add" : isFriendsTab(raw) ? raw : "online";
    const [search, setSearch] = useState("");
    const profiles = useProfileViewer();

    const setView = (next: View) => router.replace(next === "online" ? "/social" : `/social?tab=${next}`, { scroll: false });

    // Links from the old pages: /groups?create=1 opens the wizard, /groups?notice=… confirms what happened.
    const create = params.get("create") === "1";
    const notice = params.get("notice");
    const openCreateGroup = ui.openCreateGroup;
    useEffect(() => {
        if (!create && notice !== "left" && notice !== "deleted") return;
        if (create) openCreateGroup();
        if (notice === "left" || notice === "deleted") {
            notify(tx(notice === "left" ? { TR: "Gruptan ayrıldın.", EN: "You left the group." } : { TR: "Grup ve tüm içeriği silindi.", EN: "The group and all of its content were deleted." }), "success");
        }
        router.replace("/social", { scroll: false });
    }, [create, notice, notify, openCreateGroup, router, tx]);

    const pendingCount = friends.incoming.length + groups.invites.length;
    const onTabKey = (event: KeyboardEvent<HTMLDivElement>) => {
        if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
        const tabs = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>("[role='tab']"));
        const index = tabs.indexOf(document.activeElement as HTMLButtonElement);
        if (index < 0) return;
        event.preventDefault();
        const forward = (event.key === "ArrowRight") !== (document.documentElement.dir === "rtl");
        const next = tabs[(index + (forward ? 1 : -1) + tabs.length) % tabs.length];
        next.focus();
        next.click();
    };

    return (
        <main id="main-content" className="flex min-w-0 flex-1 flex-col bg-white dark:bg-zinc-900">
            <MainHeader aside={false}>
                <Users className="h-5 w-5 shrink-0 text-zinc-500" aria-hidden />
                <h1 className="shrink-0 text-base font-bold">{tx(C.title)}</h1>
                <span className="mx-1.5 hidden h-6 w-px shrink-0 bg-zinc-200 dark:bg-white/10 sm:block" aria-hidden />
                <div role="tablist" aria-label={tx(C.tabs)} onKeyDown={onTabKey} className="flex min-w-0 items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                    {FRIENDS_TABS.map((tab) => (
                        <button
                            key={tab}
                            type="button"
                            role="tab"
                            id={`friends-tab-${tab}`}
                            aria-selected={view === tab}
                            aria-controls="friends-panel"
                            tabIndex={view === tab || (view === "add" && tab === "online") ? 0 : -1}
                            onClick={() => setView(tab)}
                            className={cx(
                                "inline-flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1 text-[15px] font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500",
                                view === tab ? "bg-zinc-200 text-zinc-900 dark:bg-white/10 dark:text-white" : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800 dark:text-zinc-400 dark:hover:bg-white/[0.05] dark:hover:text-zinc-100",
                            )}
                        >
                            {tx(TAB_COPY[tab])}
                            {tab === "pending" && <CountBadge count={pendingCount} />}
                        </button>
                    ))}
                    <button
                        type="button"
                        onClick={() => setView("add")}
                        aria-pressed={view === "add"}
                        className={cx(
                            "ms-1 inline-flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1 text-[15px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500",
                            view === "add" ? "bg-transparent text-emerald-600 dark:text-emerald-400" : "bg-emerald-600 text-white hover:bg-emerald-500",
                        )}
                    >
                        <UserPlus className="h-4 w-4 sm:hidden" aria-hidden />
                        <span className="hidden sm:inline">{tx(C.add)}</span>
                        <span className="sr-only sm:hidden">{tx(C.add)}</span>
                    </button>
                </div>
            </MainHeader>

            <div id="friends-panel" role={view === "add" ? undefined : "tabpanel"} aria-labelledby={view === "add" ? undefined : `friends-tab-${view}`} className="min-h-0 flex-1 overflow-y-auto">
                {view === "add" ? <AddFriend /> : (
                    <div className="mx-auto w-full max-w-4xl px-3 py-4 sm:px-6">
                        <FirstRunNotice />
                        {friends.failed ? (
                            <div className="flex flex-col items-start gap-3 rounded-2xl border border-amber-500/30 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-200 sm:flex-row sm:items-center sm:justify-between" role="alert">
                                <span>{tx(C.loadFailed)}</span>
                                <button type="button" onClick={() => void friends.refresh()} className="rounded-xl bg-amber-600 px-3 py-1.5 font-bold text-white hover:bg-amber-500">{tx(C.retry)}</button>
                            </div>
                        ) : !friends.loaded ? (
                            <div className="flex justify-center py-16" aria-busy="true"><Spinner className="h-7 w-7 text-indigo-500" /></div>
                        ) : view === "pending" ? (
                            <PendingList />
                        ) : view === "blocked" ? (
                            <BlockedList />
                        ) : (
                            <FriendList tab={view} search={search} onSearch={setSearch} onProfile={profiles.show} onAdd={() => setView("add")} />
                        )}
                    </div>
                )}
            </div>
            {profiles.element}
        </main>
    );
}

function ListHeading({ children }: { children: ReactNode }) {
    return <h2 className="mb-2 mt-5 px-2 text-[11px] font-black uppercase tracking-wide text-zinc-500 first:mt-1 dark:text-zinc-400">{children}</h2>;
}

function personLine(person: SocialPerson, tx: (copy: Copy, vars?: Record<string, string | number>) => string, now: number, locale: string) {
    if (person.customStatus) return person.customStatus;
    if (person.status === "offline") {
        const seen = presenceTime(person.lastSeenAt);
        return seen ? tx(C.lastSeen, { time: relativeTime(seen, now, locale) }) : tx(PRESENCE_STATUS_COPY.offline);
    }
    return tx(PRESENCE_STATUS_COPY[person.status]);
}

function ActionButton({ label, onClick, children, tone = "default", disabled = false }: { label: string; onClick: () => void; children: ReactNode; tone?: "default" | "success" | "danger"; disabled?: boolean }) {
    return (
        <button
            type="button"
            onClick={(event) => { event.stopPropagation(); onClick(); }}
            disabled={disabled}
            aria-label={label}
            title={label}
            className={cx(
                "inline-flex h-9 w-9 items-center justify-center rounded-full bg-zinc-100 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-zinc-950",
                tone === "success" ? "text-emerald-600 hover:bg-emerald-500/15 dark:text-emerald-400" : tone === "danger" ? "text-red-500 hover:bg-red-500/15" : "text-zinc-500 hover:bg-zinc-200 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-white",
            )}
        >
            {children}
        </button>
    );
}

function FriendList({ tab, search, onSearch, onProfile, onAdd }: { tab: "online" | "all"; search: string; onSearch: (value: string) => void; onProfile: (email: string) => void; onAdd: () => void }) {
    const { tx, locale } = useI18n();
    const router = useRouter();
    const { friends, now, friendAction, confirm } = useSocial();
    const { startCall, status: callStatus } = useVoiceCall();
    const inCall = callStatus !== "idle";
    const list = useMemo(() => filterFriends(friends.list, tab, search, locale), [friends.list, locale, search, tab]);
    const total = tab === "online" ? friends.list.filter((friend) => friend.status !== "offline").length : friends.list.length;

    if (!friends.list.length) {
        return (
            <EmptyState icon={<Users className="h-8 w-8" aria-hidden />} title={tx(C.emptyAllTitle)} text={tx(C.emptyAllText)}>
                <button type="button" onClick={onAdd} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-500"><UserPlus className="h-4 w-4" aria-hidden />{tx(C.add)}</button>
            </EmptyState>
        );
    }

    const remove = async (friend: SocialPerson) => {
        if (!await confirm({ title: tx(C.removeTitle, { name: friend.username }), body: tx(C.removeBody), confirmLabel: tx(C.remove), tone: "danger" })) return;
        await friendAction({ action: "remove", targetEmail: friend.email }, C.removed);
    };
    const block = async (friend: SocialPerson) => {
        if (!await confirm({ title: tx(C.blockTitle, { name: friend.username }), body: tx(C.blockBody), confirmLabel: tx(C.block), tone: "danger" })) return;
        await friendAction({ action: "block", targetEmail: friend.email }, C.blockedToast);
    };

    return (
        <>
            <label className="relative block">
                <span className="sr-only">{tx(C.searchLabel)}</span>
                <input type="search" value={search} onChange={(event) => onSearch(event.target.value)} placeholder={tx(C.search)} className="w-full rounded-lg border border-zinc-200 bg-zinc-100 py-2 pe-9 ps-3 text-sm outline-none transition focus:border-indigo-500 focus:bg-white focus:ring-4 focus:ring-indigo-500/10 dark:border-white/5 dark:bg-zinc-950 dark:focus:bg-zinc-950" />
                <Search className="pointer-events-none absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" aria-hidden />
            </label>
            <ListHeading>{tx(tab === "online" ? C.onlineCount : C.allCount, { count: search ? list.length : total })}</ListHeading>
            {list.length === 0 ? (
                search ? <p className="px-2 py-8 text-center text-sm text-zinc-500">{tx(C.noMatch)}</p>
                    : <EmptyState icon={<Users className="h-8 w-8" aria-hidden />} title={tx(C.emptyOnlineTitle)} text={tx(C.emptyOnlineText)} />
            ) : (
                <ul className="divide-y divide-zinc-200/70 dark:divide-white/5">
                    {list.map((friend) => (
                        <li key={friend.email} className="group relative">
                            <div className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-2.5 transition hover:bg-zinc-100 focus-within:bg-zinc-100 dark:hover:bg-white/[0.04] dark:focus-within:bg-white/[0.04]">
                                {/* The whole row opens the conversation; the buttons sit above this link. */}
                                <Link href={dmHref(friend.email)} className="absolute inset-0 -mx-2 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-500" aria-label={`${friend.username}, ${tx(PRESENCE_STATUS_COPY[friend.status])} — ${tx(C.message)}`} />
                                <PresenceAvatar src={friend.avatarUrl} name={friend.username} status={friend.status} size="md" ring="bg-white group-hover:bg-zinc-100 dark:bg-zinc-900 dark:group-hover:bg-zinc-800" />
                                <span className="min-w-0 flex-1">
                                    <span className="flex min-w-0 items-center gap-1.5">
                                        <span className="truncate font-semibold text-zinc-900 dark:text-white">{friend.username}</span>
                                        <span className="hidden truncate text-xs text-zinc-400 group-hover:inline">{formatFriendTag(friend.nickname, friend.nicknameTag)}</span>
                                        <StaffBadge role={friend.staffRole} size="sm" compactOnMobile />
                                    </span>
                                    <span className="block truncate text-[13px] text-zinc-500 dark:text-zinc-400">{personLine(friend, tx, now, locale)}</span>
                                </span>
                                <span className="relative z-10 flex shrink-0 items-center gap-2">
                                    <ActionButton label={tx(C.message)} onClick={() => router.push(dmHref(friend.email))}><MessageCircle className="h-[18px] w-[18px]" aria-hidden /></ActionButton>
                                    <ActionButton label={inCall ? tx(C.callBusy) : tx(C.call)} disabled={inCall} onClick={() => void startCall({ email: friend.email, username: friend.username, avatarUrl: friend.avatarUrl ?? undefined, staffRole: friend.staffRole })}><Phone className="h-[18px] w-[18px]" aria-hidden /></ActionButton>
                                    <DropdownMenu
                                            label={tx(C.more, { name: friend.username })}
                                            trigger={<MoreVertical className="h-[18px] w-[18px]" aria-hidden />}
                                            triggerClassName="inline-flex h-9 w-9 items-center justify-center rounded-full bg-zinc-100 text-zinc-500 transition hover:bg-zinc-200 hover:text-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:bg-zinc-950 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-white"
                                            items={[
                                                { id: "profile", label: tx(C.profile), icon: <UserRound className="h-4 w-4" aria-hidden />, onSelect: () => onProfile(friend.email) },
                                                { id: "remove", label: tx(C.remove), icon: <UserMinus className="h-4 w-4" aria-hidden />, onSelect: () => void remove(friend), danger: true },
                                                { id: "block", label: tx(C.block), icon: <Ban className="h-4 w-4" aria-hidden />, onSelect: () => void block(friend), danger: true },
                                            ]}
                                        />
                                </span>
                            </div>
                        </li>
                    ))}
                </ul>
            )}
        </>
    );
}

function RequestRow({ request, hint, children }: { request: FriendRequestItem; hint: string; children: ReactNode }) {
    const tag = formatFriendTag(request.person.nickname, request.person.nicknameTag);
    return (
        <li className="group -mx-2 flex items-center gap-3 rounded-lg px-2 py-2.5 transition hover:bg-zinc-100 dark:hover:bg-white/[0.04]">
            <PresenceAvatar src={request.person.avatarUrl} name={request.person.username} size="md" />
            <span className="min-w-0 flex-1">
                <span className="flex min-w-0 items-center gap-1.5">
                    <span className="truncate font-semibold text-zinc-900 dark:text-white">{request.person.username}</span>
                    {tag && <span className="truncate text-xs text-zinc-400">{tag}</span>}
                    <StaffBadge role={request.person.staffRole} size="sm" compactOnMobile />
                </span>
                <span className="block truncate text-[13px] text-zinc-500 dark:text-zinc-400">{hint}</span>
            </span>
            <span className="flex shrink-0 items-center gap-2">{children}</span>
        </li>
    );
}

function PendingList() {
    const { tx, locale } = useI18n();
    const router = useRouter();
    const { friends, groups, now, friendAction, notify } = useSocial();
    const groupError = useGroupErrorText();
    const [busy, setBusy] = useState("");

    const run = async (id: string, task: () => Promise<unknown>) => {
        setBusy(id);
        try {
            await task();
        } finally {
            setBusy("");
        }
    };

    const resolveInvite = (invite: GroupInvitationItem, accept: boolean) => run(invite.id, async () => {
        try {
            await groupsApi.action({ action: accept ? "accept-invite" : "reject-invite", groupId: invite.groupId });
            notify(tx(accept ? C.joinedGroup : C.declinedInvite), accept ? "success" : "info");
            await groups.refresh();
            if (accept) router.push(groupHref(invite.groupId));
        } catch (error) {
            notify(groupError(error), "error");
            await groups.refresh();
        }
    });

    if (!friends.incoming.length && !friends.outgoing.length && !groups.invites.length) {
        return <EmptyState icon={<Inbox className="h-8 w-8" aria-hidden />} title={tx(C.emptyPendingTitle)} text={tx(C.emptyPendingText)} />;
    }

    return (
        <>
            {groups.invites.length > 0 && (
                <section aria-labelledby="pending-groups">
                    <ListHeading><span id="pending-groups">{tx(C.groupInvites, { count: groups.invites.length })}</span></ListHeading>
                    <ul className="divide-y divide-zinc-200/70 dark:divide-white/5">
                        {groups.invites.map((invite) => (
                            <li key={invite.id} className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-2.5 hover:bg-zinc-100 dark:hover:bg-white/[0.04]">
                                <GroupTile emoji={invite.groupEmoji} color={invite.groupColor} size="sm" />
                                <span className="min-w-0 flex-1">
                                    <span className="block truncate font-semibold text-zinc-900 dark:text-white">{invite.groupName}</span>
                                    <span className="block truncate text-[13px] text-zinc-500 dark:text-zinc-400">
                                        {tx(C.invitedBy, { name: invite.fromName })}
                                        {invite.expiresAt && <> · <Clock className="inline h-3 w-3" aria-hidden /> {tx(C.expires, { time: relativeTime(toMillis(invite.expiresAt), now, locale) })}</>}
                                    </span>
                                </span>
                                <span className="flex shrink-0 items-center gap-2">
                                    <ActionButton label={tx(C.accept)} tone="success" disabled={Boolean(busy)} onClick={() => void resolveInvite(invite, true)}>{busy === invite.id ? <Spinner className="h-4 w-4" /> : <Check className="h-[18px] w-[18px]" aria-hidden />}</ActionButton>
                                    <ActionButton label={tx(C.reject)} tone="danger" disabled={Boolean(busy)} onClick={() => void resolveInvite(invite, false)}><X className="h-[18px] w-[18px]" aria-hidden /></ActionButton>
                                </span>
                            </li>
                        ))}
                    </ul>
                </section>
            )}
            {friends.incoming.length > 0 && (
                <section aria-labelledby="pending-incoming">
                    <ListHeading><span id="pending-incoming">{tx(C.incoming, { count: friends.incoming.length })}</span></ListHeading>
                    <ul className="divide-y divide-zinc-200/70 dark:divide-white/5">
                        {friends.incoming.map((request) => (
                            <RequestRow key={request.id} request={request} hint={tx(C.incomingHint)}>
                                <ActionButton label={tx(C.accept)} tone="success" disabled={Boolean(busy)} onClick={() => void run(request.id, () => friendAction({ action: "accept", requestId: request.id }, C.accepted))}>{busy === request.id ? <Spinner className="h-4 w-4" /> : <Check className="h-[18px] w-[18px]" aria-hidden />}</ActionButton>
                                <ActionButton label={tx(C.reject)} tone="danger" disabled={Boolean(busy)} onClick={() => void run(request.id, () => friendAction({ action: "reject", requestId: request.id }, C.rejected))}><X className="h-[18px] w-[18px]" aria-hidden /></ActionButton>
                            </RequestRow>
                        ))}
                    </ul>
                </section>
            )}
            {friends.outgoing.length > 0 && (
                <section aria-labelledby="pending-outgoing">
                    <ListHeading><span id="pending-outgoing">{tx(C.outgoing, { count: friends.outgoing.length })}</span></ListHeading>
                    <ul className="divide-y divide-zinc-200/70 dark:divide-white/5">
                        {friends.outgoing.map((request) => (
                            <RequestRow key={request.id} request={request} hint={tx(C.outgoingHint)}>
                                <ActionButton label={tx(C.cancel)} tone="danger" disabled={Boolean(busy)} onClick={() => void run(request.id, () => friendAction({ action: "cancel", requestId: request.id }, C.cancelled))}>{busy === request.id ? <Spinner className="h-4 w-4" /> : <X className="h-[18px] w-[18px]" aria-hidden />}</ActionButton>
                            </RequestRow>
                        ))}
                    </ul>
                </section>
            )}
        </>
    );
}

function BlockedList() {
    const { tx } = useI18n();
    const { friends, friendAction } = useSocial();
    const [busy, setBusy] = useState("");
    if (!friends.blocked.length) return <EmptyState icon={<Ban className="h-8 w-8" aria-hidden />} title={tx(C.emptyBlockedTitle)} />;
    return (
        <>
            <ListHeading>{tx(C.blockedCount, { count: friends.blocked.length })}</ListHeading>
            <ul className="divide-y divide-zinc-200/70 dark:divide-white/5">
                {friends.blocked.map((entry) => {
                    const tag = formatFriendTag(entry.nickname, entry.nicknameTag);
                    return (
                        <li key={entry.email} className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-2.5 hover:bg-zinc-100 dark:hover:bg-white/[0.04]">
                            <PresenceAvatar src={entry.avatarUrl} name={entry.username} size="md" />
                            <span className="min-w-0 flex-1">
                                <span className="block truncate font-semibold text-zinc-900 dark:text-white">{entry.username}</span>
                                <span className="block truncate text-[13px] text-zinc-500 dark:text-zinc-400">{tag || tx(C.blocked)}</span>
                            </span>
                            <button
                                type="button"
                                disabled={Boolean(busy)}
                                onClick={() => {
                                    setBusy(entry.email);
                                    void friendAction({ action: "unblock", targetEmail: entry.email }, C.unblocked).finally(() => setBusy(""));
                                }}
                                className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-100 px-3 py-1.5 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-200 disabled:opacity-50 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-800"
                            >
                                {busy === entry.email && <Spinner className="h-3.5 w-3.5" />}{tx(C.unblock)}
                            </button>
                        </li>
                    );
                })}
            </ul>
        </>
    );
}

function AddFriend() {
    const { tx } = useI18n();
    const { me, notify, errorText, friends } = useSocial();
    const [value, setValue] = useState("");
    const [result, setResult] = useState<{ tone: "success" | "error"; text: string } | null>(null);
    const [busy, setBusy] = useState(false);
    const ownTag = formatFriendTag(me.nickname, me.nicknameTag);

    const submit = async (event: FormEvent) => {
        event.preventDefault();
        const parsed = parseFriendTag(value);
        if (!parsed) {
            setResult({ tone: "error", text: errorText("invalid_tag") });
            return;
        }
        setBusy(true);
        setResult(null);
        try {
            const response = await socialApi.friendAction({ action: "request", tag: `${parsed.nickname}#${parsed.tag}` });
            const tag = `${parsed.nickname}#${parsed.tag}`;
            setResult({ tone: "success", text: tx(response.accepted ? C.addAccepted : C.addSent, { tag }) });
            setValue("");
            await friends.refresh();
        } catch (error) {
            setResult({ tone: "error", text: errorText(error) });
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="mx-auto w-full max-w-4xl px-3 py-5 sm:px-6">
            <h2 className="text-base font-bold uppercase tracking-wide">{tx(C.addTitle)}</h2>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{tx(C.addText)}</p>
            <form onSubmit={(event) => void submit(event)} className={cx("mt-4 flex flex-col gap-2 rounded-xl border bg-zinc-50 p-2 transition focus-within:ring-4 sm:flex-row sm:items-center dark:bg-zinc-950", result?.tone === "error" ? "border-red-500 focus-within:ring-red-500/15" : result?.tone === "success" ? "border-emerald-500 focus-within:ring-emerald-500/15" : "border-zinc-200 focus-within:border-indigo-500 focus-within:ring-indigo-500/15 dark:border-white/10")}>
                <label htmlFor="add-friend-input" className="sr-only">{tx(C.addLabel)}</label>
                <input
                    id="add-friend-input"
                    value={value}
                    onChange={(event) => { setValue(event.target.value); setResult(null); }}
                    placeholder={tx(C.addPlaceholder)}
                    autoComplete="off"
                    spellCheck={false}
                    maxLength={110}
                    aria-invalid={result?.tone === "error" ? true : undefined}
                    aria-describedby={result ? "add-friend-result" : undefined}
                    className="min-w-0 flex-1 bg-transparent px-2 py-2 font-mono text-base outline-none"
                />
                <button type="submit" disabled={busy || !value.trim()} className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-indigo-500 disabled:opacity-50">
                    {busy ? <Spinner className="h-4 w-4" /> : <Mail className="h-4 w-4" aria-hidden />}{tx(C.addSubmit)}
                </button>
            </form>
            <p id="add-friend-result" role={result?.tone === "error" ? "alert" : "status"} className={cx("mt-2 min-h-5 text-sm", result?.tone === "error" ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400")}>{result?.text}</p>

            <div className="mt-6 rounded-xl border border-zinc-200 p-4 dark:border-white/10">
                {ownTag ? (
                    <div className="flex flex-wrap items-center gap-3">
                        <span className="text-sm text-zinc-500 dark:text-zinc-400">{tx(C.yourTag)}</span>
                        <code className="rounded-lg bg-zinc-100 px-2.5 py-1 font-mono text-sm font-semibold dark:bg-zinc-950">{ownTag}</code>
                        <button type="button" onClick={() => void copyText(ownTag).then((ok) => notify(tx(ok ? C.copied : C.copyFailed), ok ? "success" : "error"))} className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-sm font-semibold text-indigo-600 transition hover:bg-indigo-500/10 dark:text-indigo-300" aria-label={tx(C.copyTag)}>
                            <CopyIcon className="h-4 w-4" aria-hidden />{tx(C.copyTag)}
                        </button>
                    </div>
                ) : (
                    <p className="text-sm text-zinc-600 dark:text-zinc-300">{tx(C.noTag)} <Link href="/account-settings" className="font-semibold text-indigo-600 underline-offset-2 hover:underline dark:text-indigo-300">{tx(C.settings)}</Link></p>
                )}
            </div>
        </div>
    );
}
