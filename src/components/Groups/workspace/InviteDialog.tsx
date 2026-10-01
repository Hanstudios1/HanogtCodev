"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Check, Clock, Copy as CopyIcon, Infinity as InfinityIcon, Link2, Lock, Search, Share2, Trash2, UserCheck, UserPlus, UsersRound, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useI18n, type Copy } from "@/lib/i18n";
import {
    INVITE_LINK_EXPIRIES,
    INVITE_LINK_MAX_USES,
    inviteLinkPath,
    toMillis,
    type GroupFriendCandidate,
    type GroupInviteLinkInfo,
    type GroupInvitesResponse,
    type InviteLinkExpiry,
    type InviteLinkMaxUses,
} from "@/lib/groups";
import { groupsApi } from "../api";
import { GroupTile, Modal, ModalHeader, Spinner, UI_COPY, UserAvatar, copyText, cx, relativeTime } from "../ui";
import { useWorkspace } from "./context";

const C = {
    title: { TR: "Gruba davet et", EN: "Invite to the group" },
    subtitle: { TR: "Arkadaşlarını doğrudan davet et veya paylaşılabilir bir bağlantı oluştur.", EN: "Invite friends directly or create a shareable link." },
    friendsTab: { TR: "Arkadaşlar", EN: "Friends" },
    linksTab: { TR: "Davet bağlantıları", EN: "Invite links" },
    search: { TR: "Arkadaşlarında ara…", EN: "Search your friends…" },
    searchLabel: { TR: "Arkadaşlarında ara", EN: "Search your friends" },
    invite: { TR: "Davet et", EN: "Invite" },
    invited: { TR: "Davet edildi", EN: "Invited" },
    member: { TR: "Üye", EN: "Member" },
    banned: { TR: "Engelli", EN: "Blocked" },
    cancelInvite: { TR: "Daveti iptal et", EN: "Cancel invitation" },
    inviteSent: { TR: "{name} davet edildi.", EN: "{name} was invited." },
    inviteCancelled: { TR: "Davet iptal edildi.", EN: "Invitation cancelled." },
    noFriends: { TR: "Henüz arkadaşın yok. Arkadaş ekleyip onları gruba davet edebilirsin.", EN: "You don't have any friends yet. Add some and invite them to the group." },
    findFriends: { TR: "Arkadaş bul", EN: "Find friends" },
    noMatch: { TR: "Eşleşen arkadaş yok.", EN: "No matching friends." },
    invitesDisabled: { TR: "Bu grupta yalnızca yöneticiler davet gönderebilir.", EN: "Only admins can send invitations in this group." },
    pending: { TR: "Bekleyen davetler", EN: "Pending invitations" },
    pendingMeta: { TR: "{name} davet etti · {time} sona eriyor", EN: "Invited by {name} · expires {time}" },
    expiry: { TR: "Geçerlilik süresi", EN: "Expires after" },
    maxUses: { TR: "Kullanım sınırı", EN: "Use limit" },
    ownerOnly: { TR: "Süresiz bağlantıları yalnızca grup sahibi oluşturabilir.", EN: "Only the group owner can create links that never expire." },
    create: { TR: "Bağlantı oluştur", EN: "Create link" },
    created: { TR: "Bağlantı oluşturuldu ve panoya kopyalandı.", EN: "Link created and copied to the clipboard." },
    createdNoCopy: { TR: "Bağlantı oluşturuldu.", EN: "Link created." },
    active: { TR: "Etkin bağlantılar", EN: "Active links" },
    noLinks: { TR: "Etkin bağlantı yok. Yukarıdan bir tane oluştur.", EN: "No active links. Create one above." },
    copy: { TR: "Kopyala", EN: "Copy" },
    copied: { TR: "Bağlantı kopyalandı.", EN: "Link copied." },
    share: { TR: "Paylaş", EN: "Share" },
    shareText: { TR: "{group} grubuna katıl!", EN: "Join {group}!" },
    revoke: { TR: "İptal et", EN: "Revoke" },
    revokeTitle: { TR: "Bağlantı iptal edilsin mi?", EN: "Revoke this link?" },
    revokeBody: { TR: "Bu bağlantıyla artık kimse katılamaz. Zaten katılmış üyeler etkilenmez.", EN: "Nobody can join with this link anymore. Members who already joined are not affected." },
    revoked: { TR: "Bağlantı iptal edildi.", EN: "Link revoked." },
    createdBy: { TR: "{name} oluşturdu", EN: "Created by {name}" },
    uses: { TR: "{uses}/{max} kullanım", EN: "{uses}/{max} uses" },
    usesUnlimited: { TR: "{uses} kullanım", EN: "{uses} uses" },
    expires: { TR: "{time} sona eriyor", EN: "expires {time}" },
    neverExpires: { TR: "süresiz", EN: "never expires" },
    unlimited: { TR: "Sınırsız", EN: "No limit" },
    useCount: { TR: "{count} kişi", EN: "{count} people" },
    oneUse: { TR: "1 kişi", EN: "1 person" },
    linkNote: { TR: "Bağlantıya sahip olan ve Hanogt hesabı bulunan herkes katılabilir; gerektiğinde iptal et.", EN: "Anyone with the link and a Hanogt account can join; revoke it when needed." },
    loadFailed: { TR: "Davet bilgileri yüklenemedi.", EN: "Invitation details couldn't be loaded." },
} satisfies Record<string, Copy>;

const EXPIRY_COPY: Record<InviteLinkExpiry, Copy> = {
    "1h": { TR: "1 saat", EN: "1 hour" },
    "24h": { TR: "24 saat", EN: "24 hours" },
    "7d": { TR: "7 gün", EN: "7 days" },
    never: { TR: "Süresiz", EN: "Never" },
};

function linkUrl(token: string) {
    return typeof window === "undefined" ? inviteLinkPath(token) : `${window.location.origin}${inviteLinkPath(token)}`;
}

export default function InviteDialog({ open, onClose, onChanged }: { open: boolean; onClose: () => void; onChanged: () => void }) {
    const { tx, locale } = useI18n();
    const { groupId, group, isManager, now, notify, confirm, errorText } = useWorkspace();
    const [tab, setTab] = useState<"friends" | "links">("friends");
    const [data, setData] = useState<GroupInvitesResponse | null>(null);
    const [loadError, setLoadError] = useState("");
    const [reloadKey, setReloadKey] = useState(0);
    const [query, setQuery] = useState("");
    const [busy, setBusy] = useState("");
    const [expiry, setExpiry] = useState<InviteLinkExpiry>("7d");
    const [maxUses, setMaxUses] = useState<InviteLinkMaxUses>(0);
    const [freshToken, setFreshToken] = useState("");

    useEffect(() => {
        if (!open) return;
        let active = true;
        groupsApi.invites(groupId)
            .then((result) => { if (active) { setData(result); setLoadError(""); } })
            .catch((error: unknown) => { if (active) setLoadError(errorText(error, C.loadFailed)); });
        return () => { active = false; };
    }, [errorText, groupId, open, reloadKey]);

    const reload = () => setReloadKey((value) => value + 1);

    const friends = useMemo(() => {
        const needle = query.trim().toLocaleLowerCase(locale);
        const list = data?.friends ?? [];
        return needle ? list.filter((friend) => friend.username.toLocaleLowerCase(locale).includes(needle)) : list;
    }, [data, locale, query]);

    const updateFriend = (email: string, status: GroupFriendCandidate["status"]) => {
        setData((current) => current ? { ...current, friends: current.friends.map((friend) => (friend.email === email ? { ...friend, status } : friend)) } : current);
    };

    const inviteFriend = async (friend: GroupFriendCandidate) => {
        setBusy(friend.email);
        try {
            await groupsApi.action({ action: "invite-friend", groupId, targetEmail: friend.email });
            updateFriend(friend.email, "invited");
            notify(tx(C.inviteSent, { name: friend.username }), "success");
            reload();
            onChanged();
        } catch (error) {
            notify(errorText(error), "error");
        } finally {
            setBusy("");
        }
    };

    const cancelInvite = async (email: string) => {
        setBusy(email);
        try {
            await groupsApi.action({ action: "cancel-invite", groupId, targetEmail: email });
            updateFriend(email, "available");
            notify(tx(C.inviteCancelled), "success");
            reload();
            onChanged();
        } catch (error) {
            notify(errorText(error), "error");
        } finally {
            setBusy("");
        }
    };

    const createLink = async () => {
        setBusy("create");
        try {
            const result = await groupsApi.createLink({ groupId, expiry, maxUses });
            setData((current) => current ? { ...current, links: [result.link, ...current.links] } : current);
            setFreshToken(result.link.token);
            notify(tx(await copyText(linkUrl(result.link.token)) ? C.created : C.createdNoCopy), "success");
            onChanged();
        } catch (error) {
            notify(errorText(error), "error");
        } finally {
            setBusy("");
        }
    };

    const revokeLink = async (link: GroupInviteLinkInfo) => {
        const approved = await confirm({ title: tx(C.revokeTitle), body: tx(C.revokeBody), confirmLabel: tx(C.revoke), tone: "danger" });
        if (!approved) return;
        setBusy(link.token);
        try {
            await groupsApi.revokeLink(groupId, link.token);
            setData((current) => current ? { ...current, links: current.links.filter((entry) => entry.token !== link.token) } : current);
            notify(tx(C.revoked), "success");
            onChanged();
        } catch (error) {
            notify(errorText(error), "error");
        } finally {
            setBusy("");
        }
    };

    const share = async (link: GroupInviteLinkInfo) => {
        const url = linkUrl(link.token);
        if (typeof navigator.share === "function") {
            try {
                await navigator.share({ title: group.name, text: tx(C.shareText, { group: group.name }), url });
                return;
            } catch (error) {
                if (error instanceof DOMException && error.name === "AbortError") return;
            }
        }
        notify(await copyText(url) ? tx(C.copied) : errorText("clipboard_failed"), "info");
    };

    const canManageLinks = Boolean(data?.canManageLinks ?? isManager);
    const tabs = canManageLinks ? (["friends", "links"] as const) : (["friends"] as const);

    return (
        <Modal open={open} onClose={onClose} labelledBy="invite-dialog-title" size="lg">
            <ModalHeader id="invite-dialog-title" title={tx(C.title)} description={tx(C.subtitle)} onClose={onClose} icon={<GroupTile emoji={group.emoji} color={group.color} size="sm" />} />
            {tabs.length > 1 && (
                <div className="flex gap-1 border-b border-zinc-200 px-5 pt-2 dark:border-white/10 sm:px-6" role="tablist">
                    {tabs.map((entry) => (
                        <button key={entry} type="button" role="tab" aria-selected={tab === entry} onClick={() => setTab(entry)} className={cx("relative inline-flex items-center gap-2 px-3 py-2.5 text-sm font-semibold transition", tab === entry ? "text-indigo-700 dark:text-indigo-300" : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white")}>
                            {entry === "friends" ? <UsersRound className="h-4 w-4" aria-hidden /> : <Link2 className="h-4 w-4" aria-hidden />}
                            {tx(entry === "friends" ? C.friendsTab : C.linksTab)}
                            {tab === entry && <motion.span layoutId="invite-tab" className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-indigo-600 dark:bg-indigo-400" />}
                        </button>
                    ))}
                </div>
            )}
            <div className="min-h-[320px] flex-1 overflow-y-auto px-5 py-5 sm:px-6">
                {loadError ? (
                    <p className="rounded-2xl bg-amber-500/10 p-4 text-sm text-amber-800 dark:text-amber-200" role="alert">{loadError}</p>
                ) : !data ? (
                    <div className="flex justify-center py-16"><Spinner className="h-6 w-6 text-indigo-500" /></div>
                ) : tab === "friends" ? (
                    <div className="space-y-5">
                        {!data.canInviteFriends && <p className="flex items-center gap-2 rounded-2xl bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-200"><Lock className="h-4 w-4 shrink-0" aria-hidden />{tx(C.invitesDisabled)}</p>}
                        {data.friends.length > 0 && (
                            <label className="relative block">
                                <span className="sr-only">{tx(C.searchLabel)}</span>
                                <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" aria-hidden />
                                <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={tx(C.search)} className="w-full rounded-2xl border border-zinc-200 bg-white py-2.5 pe-3 ps-9 text-sm outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 dark:border-white/10 dark:bg-zinc-950" />
                            </label>
                        )}
                        {data.friends.length === 0 ? (
                            <div className="flex flex-col items-center rounded-2xl border border-dashed border-zinc-300 px-6 py-10 text-center dark:border-zinc-700">
                                <UsersRound className="h-8 w-8 text-zinc-400" aria-hidden />
                                <p className="mt-3 max-w-sm text-sm text-zinc-500 dark:text-zinc-400">{tx(C.noFriends)}</p>
                                <Link href="/friends" className="mt-4 inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-bold text-white"><UserPlus className="h-4 w-4" aria-hidden />{tx(C.findFriends)}</Link>
                            </div>
                        ) : friends.length === 0 ? (
                            <p className="py-6 text-center text-sm text-zinc-500">{tx(C.noMatch)}</p>
                        ) : (
                            <ul className="divide-y divide-zinc-100 overflow-hidden rounded-2xl border border-zinc-200 dark:divide-white/5 dark:border-white/10">
                                {friends.map((friend) => {
                                    const pendingEntry = data.pending.find((entry) => entry.email === friend.email);
                                    const canCancel = friend.status === "invited" && (isManager || pendingEntry?.invitedByMe);
                                    return (
                                        <li key={friend.email} className="flex items-center gap-3 bg-white px-3 py-2.5 dark:bg-zinc-900">
                                            <UserAvatar name={friend.username} src={friend.avatarUrl} size="md" online={friend.online} />
                                            <span className="min-w-0 flex-1 truncate text-sm font-semibold">{friend.username}</span>
                                            {friend.status === "available" && (
                                                <button type="button" onClick={() => void inviteFriend(friend)} disabled={!data.canInviteFriends || Boolean(busy)} className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-indigo-500 disabled:opacity-50">
                                                    {busy === friend.email ? <Spinner className="h-3.5 w-3.5" /> : <UserPlus className="h-3.5 w-3.5" aria-hidden />}{tx(C.invite)}
                                                </button>
                                            )}
                                            {friend.status === "invited" && (
                                                <span className="flex items-center gap-1.5">
                                                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-300"><Check className="h-3.5 w-3.5" aria-hidden />{tx(C.invited)}</span>
                                                    {canCancel && <button type="button" onClick={() => void cancelInvite(friend.email)} disabled={Boolean(busy)} className="rounded-lg p-1.5 text-zinc-400 transition hover:bg-zinc-100 hover:text-red-600 dark:hover:bg-zinc-800" aria-label={tx(C.cancelInvite)} title={tx(C.cancelInvite)}>{busy === friend.email ? <Spinner className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" aria-hidden />}</button>}
                                                </span>
                                            )}
                                            {friend.status === "member" && <span className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-semibold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"><UserCheck className="h-3.5 w-3.5" aria-hidden />{tx(C.member)}</span>}
                                            {friend.status === "banned" && <span className="rounded-full bg-red-500/10 px-2.5 py-1 text-xs font-semibold text-red-700 dark:text-red-300">{tx(C.banned)}</span>}
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                        {data.pending.length > 0 && (
                            <section>
                                <h3 className="mb-2 text-xs font-black uppercase tracking-wider text-zinc-500 dark:text-zinc-400">{tx(C.pending)}</h3>
                                <ul className="space-y-1.5">
                                    {data.pending.map((entry) => (
                                        <li key={entry.email} className="flex items-center gap-3 rounded-xl bg-zinc-50 px-3 py-2 dark:bg-white/5">
                                            <UserAvatar name={entry.username} src={entry.avatarUrl} size="sm" />
                                            <span className="min-w-0 flex-1">
                                                <span className="block truncate text-sm font-semibold">{entry.username}</span>
                                                <span className="block truncate text-[11px] text-zinc-500 dark:text-zinc-400">{tx(C.pendingMeta, { name: entry.invitedByMe ? tx(UI_COPY.you) : entry.invitedByName, time: relativeTime(toMillis(entry.expiresAt), now, locale) })}</span>
                                            </span>
                                            {(isManager || entry.invitedByMe) && <button type="button" onClick={() => void cancelInvite(entry.email)} disabled={Boolean(busy)} className="rounded-lg px-2 py-1 text-xs font-semibold text-red-600 transition hover:bg-red-500/10 dark:text-red-400">{tx(C.cancelInvite)}</button>}
                                        </li>
                                    ))}
                                </ul>
                            </section>
                        )}
                    </div>
                ) : (
                    <div className="space-y-6">
                        <section className="rounded-2xl border border-zinc-200 p-4 dark:border-white/10">
                            <fieldset>
                                <legend className="flex items-center gap-1.5 text-sm font-semibold"><Clock className="h-4 w-4 text-zinc-400" aria-hidden />{tx(C.expiry)}</legend>
                                <div className="mt-2 flex flex-wrap gap-2">
                                    {INVITE_LINK_EXPIRIES.map((option) => {
                                        const locked = option === "never" && !data.canCreatePermanentLinks;
                                        return (
                                            <button key={option} type="button" disabled={locked} onClick={() => setExpiry(option)} aria-pressed={expiry === option} title={locked ? tx(C.ownerOnly) : undefined} className={cx("inline-flex items-center gap-1 rounded-xl border px-3 py-1.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-40", expiry === option ? "border-indigo-500 bg-indigo-500/10 text-indigo-700 dark:text-indigo-300" : "border-zinc-200 hover:bg-zinc-50 dark:border-white/10 dark:hover:bg-white/5")}>
                                                {locked && <Lock className="h-3.5 w-3.5" aria-hidden />}{tx(EXPIRY_COPY[option])}
                                            </button>
                                        );
                                    })}
                                </div>
                                {!data.canCreatePermanentLinks && <p className="mt-1.5 text-xs text-zinc-500 dark:text-zinc-400">{tx(C.ownerOnly)}</p>}
                            </fieldset>
                            <fieldset className="mt-4">
                                <legend className="flex items-center gap-1.5 text-sm font-semibold"><UsersRound className="h-4 w-4 text-zinc-400" aria-hidden />{tx(C.maxUses)}</legend>
                                <div className="mt-2 flex flex-wrap gap-2">
                                    {INVITE_LINK_MAX_USES.map((option) => (
                                        <button key={option} type="button" onClick={() => setMaxUses(option)} aria-pressed={maxUses === option} className={cx("inline-flex items-center gap-1 rounded-xl border px-3 py-1.5 text-sm font-semibold transition", maxUses === option ? "border-indigo-500 bg-indigo-500/10 text-indigo-700 dark:text-indigo-300" : "border-zinc-200 hover:bg-zinc-50 dark:border-white/10 dark:hover:bg-white/5")}>
                                            {option === 0 ? <><InfinityIcon className="h-3.5 w-3.5" aria-hidden />{tx(C.unlimited)}</> : option === 1 ? tx(C.oneUse) : tx(C.useCount, { count: option })}
                                        </button>
                                    ))}
                                </div>
                            </fieldset>
                            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                <p className="text-xs text-zinc-500 dark:text-zinc-400">{tx(C.linkNote)}</p>
                                <button type="button" onClick={() => void createLink()} disabled={Boolean(busy)} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white shadow-lg shadow-indigo-600/20 transition hover:bg-indigo-500 disabled:opacity-50">
                                    {busy === "create" ? <Spinner className="h-4 w-4" /> : <Link2 className="h-4 w-4" aria-hidden />}{tx(C.create)}
                                </button>
                            </div>
                        </section>
                        <section>
                            <h3 className="mb-2 text-xs font-black uppercase tracking-wider text-zinc-500 dark:text-zinc-400">{tx(C.active)}</h3>
                            {data.links.length === 0 ? (
                                <p className="rounded-2xl border border-dashed border-zinc-300 px-4 py-6 text-center text-sm text-zinc-500 dark:border-zinc-700">{tx(C.noLinks)}</p>
                            ) : (
                                <ul className="space-y-2">
                                    <AnimatePresence initial={false}>
                                        {data.links.map((link) => (
                                            <motion.li key={link.token} layout initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.97 }} className={cx("rounded-2xl border p-3", link.token === freshToken ? "border-emerald-500/50 bg-emerald-500/[0.06]" : "border-zinc-200 dark:border-white/10")}>
                                                <div className="flex items-center gap-2">
                                                    <code className="min-w-0 flex-1 truncate rounded-lg bg-zinc-100 px-2 py-1.5 font-mono text-xs text-zinc-700 dark:bg-zinc-950 dark:text-zinc-300">{linkUrl(link.token)}</code>
                                                    <button type="button" onClick={() => void copyText(linkUrl(link.token)).then((ok) => notify(ok ? tx(C.copied) : errorText("clipboard_failed"), ok ? "success" : "error"))} className="rounded-lg p-2 text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-white" aria-label={tx(C.copy)} title={tx(C.copy)}><CopyIcon className="h-4 w-4" aria-hidden /></button>
                                                    <button type="button" onClick={() => void share(link)} className="rounded-lg p-2 text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-white" aria-label={tx(C.share)} title={tx(C.share)}><Share2 className="h-4 w-4" aria-hidden /></button>
                                                    <button type="button" onClick={() => void revokeLink(link)} disabled={busy === link.token} className="rounded-lg p-2 text-red-500 transition hover:bg-red-500/10" aria-label={tx(C.revoke)} title={tx(C.revoke)}>{busy === link.token ? <Spinner className="h-4 w-4" /> : <Trash2 className="h-4 w-4" aria-hidden />}</button>
                                                </div>
                                                <p className="mt-1.5 flex flex-wrap gap-x-2 text-[11px] text-zinc-500 dark:text-zinc-400">
                                                    <span>{tx(C.createdBy, { name: link.createdByMe ? tx(UI_COPY.you) : link.createdByName })}</span>
                                                    <span>· {link.maxUses ? tx(C.uses, { uses: link.uses, max: link.maxUses }) : tx(C.usesUnlimited, { uses: link.uses })}</span>
                                                    <span>· {link.expiresAt ? tx(C.expires, { time: relativeTime(toMillis(link.expiresAt), now, locale) }) : tx(C.neverExpires)}</span>
                                                </p>
                                            </motion.li>
                                        ))}
                                    </AnimatePresence>
                                </ul>
                            )}
                        </section>
                    </div>
                )}
            </div>
        </Modal>
    );
}
