"use client";

import { Ban, Crown, MessageCircle, Phone, Shield, ShieldOff, UserMinus, UserPlus, UserRound, UsersRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { groupsApi } from "@/components/Groups/api";
import { Modal, RoleBadge, Spinner, UI_COPY, cx, relativeTime } from "@/components/Groups/ui";
import { useWorkspace } from "@/components/Groups/workspace/context";
import type { WorkspaceMember } from "@/components/Groups/workspace/model";
import PresenceAvatar from "@/components/PresenceAvatar";
import StaffBadge from "@/components/StaffBadge";
import { useI18n, type Copy } from "@/lib/i18n";
import { GROUP_COLORS, GROUP_LIMITS, toMillis } from "@/lib/groups";
import { LAST_SEEN_COPY, PRESENCE_STATUS_COPY } from "@/lib/presence";
import { socialApi } from "@/lib/social/api";
import { dmHref, formatFriendTag, sectionMembers, type MemberSectionId } from "@/lib/social/model";
import { useSocial } from "../context";
import { useProfileViewer } from "../profile";
import { useGroupSession } from "./GroupSession";

const C = {
    title: { TR: "Üyeler", EN: "Members" },
    count: { TR: "{count}/{max}", EN: "{count}/{max}" },
    invite: { TR: "Davet et", EN: "Invite" },
    owner: { TR: "Sahip — {count}", EN: "Owner — {count}" },
    admin: { TR: "Yöneticiler — {count}", EN: "Admins — {count}" },
    member: { TR: "Üyeler — {count}", EN: "Members — {count}" },
    offline: { TR: "Çevrimdışı — {count}", EN: "Offline — {count}" },
    open: { TR: "{name} üye kartını aç", EN: "Open {name}'s member card" },
    message: { TR: "Mesaj gönder", EN: "Message" },
    call: { TR: "Sesli ara", EN: "Voice call" },
    callOffline: { TR: "Sesli arama için bulut bağlantısı gerekiyor", EN: "Voice calls need the cloud connection" },
    addFriend: { TR: "Arkadaş ekle", EN: "Add friend" },
    requestSent: { TR: "{name} kişisine arkadaşlık isteği gönderildi.", EN: "Friend request sent to {name}." },
    nowFriends: { TR: "{name} ile artık arkadaşsınız!", EN: "You and {name} are friends now!" },
    noTag: { TR: "Bu üyenin takma adı yok; arkadaş eklemek için takma adını ve etiketini sor.", EN: "This member has no nickname; ask for their nickname and tag to add them." },
    profile: { TR: "Profili görüntüle", EN: "View profile" },
    manage: { TR: "Yönetim", EN: "Management" },
    makeAdmin: { TR: "Yönetici yap", EN: "Make admin" },
    removeAdmin: { TR: "Yöneticiliği kaldır", EN: "Remove admin role" },
    transfer: { TR: "Sahipliği devret", EN: "Transfer ownership" },
    remove: { TR: "Gruptan çıkar", EN: "Remove from group" },
    ban: { TR: "Çıkar ve engelle", EN: "Remove and block" },
    makeAdminTitle: { TR: "{name} yönetici olsun mu?", EN: "Make {name} an admin?" },
    makeAdminBody: { TR: "Yöneticiler üyeleri davet edebilir ve çıkarabilir, mesaj sabitleyebilir, dosya silebilir ve grup ayarlarını değiştirebilir.", EN: "Admins can invite and remove members, pin messages, delete files and change group settings." },
    removeAdminTitle: { TR: "{name} için yöneticilik kaldırılsın mı?", EN: "Remove admin role from {name}?" },
    removeTitle: { TR: "{name} gruptan çıkarılsın mı?", EN: "Remove {name} from the group?" },
    removeBody: { TR: "Dosyalara ve sohbete erişimi hemen kesilir. Yeniden davet edilirse tekrar katılabilir.", EN: "Their access to files and chat ends immediately. They can rejoin if invited again." },
    banTitle: { TR: "{name} çıkarılıp engellensin mi?", EN: "Remove and block {name}?" },
    banBody: { TR: "Engellenen kişi davetlerle veya bağlantılarla yeniden katılamaz. Engeli Ayarlar → Üyelik bölümünden kaldırabilirsin.", EN: "Blocked people can't rejoin with invitations or links. You can lift the block in Settings → Membership." },
    transferTitle: { TR: "Sahiplik {name} kullanıcısına devredilsin mi?", EN: "Transfer ownership to {name}?" },
    transferBody: { TR: "{name} grubun yeni sahibi olur; sen yönetici olarak kalırsın. Bu işlemi yalnızca yeni sahip geri alabilir.", EN: "{name} becomes the new owner and you stay an admin. Only the new owner can undo this." },
    confirm: { TR: "Onayla", EN: "Confirm" },
    done: { TR: "İşlem tamamlandı.", EN: "Done." },
    lastSeen: LAST_SEEN_COPY,
    you: UI_COPY.you,
} satisfies Record<string, Copy>;

const SECTION_COPY: Record<MemberSectionId, Copy> = { owner: C.owner, admin: C.admin, member: C.member, offline: C.offline };
const ROLE_NAME = { owner: "text-amber-600 dark:text-amber-400", admin: "text-indigo-600 dark:text-indigo-300", member: "text-zinc-700 dark:text-zinc-200" } as const;

type MemberAction = "make-admin" | "remove-admin" | "transfer" | "remove" | "ban";

/** Right column inside a group: people grouped by role while they're around, then everyone offline. */
export default function MemberList() {
    const { tx, locale } = useI18n();
    const { members, me, canInvite } = useWorkspace();
    const session = useGroupSession();
    const [selected, setSelected] = useState("");
    const sections = sectionMembers(members, locale);
    const member = members.find((entry) => entry.email === selected) ?? null;

    return (
        <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex h-12 shrink-0 items-center gap-2 border-b border-zinc-200 px-3 dark:border-black/40">
                <UsersRound className="h-4 w-4 text-zinc-500" aria-hidden />
                <h2 className="flex-1 text-sm font-bold">{tx(C.title)} <span className="font-medium tabular-nums text-zinc-400">{tx(C.count, { count: members.length, max: GROUP_LIMITS.membersMax })}</span></h2>
                {canInvite && <button type="button" onClick={session.openInvite} className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-2.5 py-1.5 text-xs font-bold text-white transition hover:bg-indigo-500"><UserPlus className="h-3.5 w-3.5" aria-hidden />{tx(C.invite)}</button>}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
                {sections.map((section) => (
                    <section key={section.id} aria-labelledby={`members-${section.id}`}>
                        <h3 id={`members-${section.id}`} className="px-2 pb-1 pt-5 text-[11px] font-black uppercase tracking-wide text-zinc-500 dark:text-zinc-400">{tx(SECTION_COPY[section.id], { count: section.members.length })}</h3>
                        <ul className="space-y-0.5">
                            {section.members.map((entry) => {
                                const status = entry.customStatus ? `${entry.statusEmoji ? `${entry.statusEmoji} ` : ""}${entry.customStatus}` : "";
                                return (
                                    <li key={entry.email}>
                                        <button
                                            type="button"
                                            onClick={() => setSelected(entry.email)}
                                            aria-label={tx(C.open, { name: entry.username })}
                                            className={cx("group flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-start transition hover:bg-zinc-200/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:hover:bg-white/[0.06]", entry.status === "offline" && "opacity-50 hover:opacity-100")}
                                        >
                                            <PresenceAvatar src={entry.avatarUrl} name={entry.username} status={entry.status} size="sm" ring="bg-zinc-50 group-hover:bg-zinc-200 dark:bg-zinc-950 dark:group-hover:bg-zinc-800" />
                                            <span className="min-w-0 flex-1">
                                                <span className="flex min-w-0 items-center gap-1">
                                                    <span className={cx("truncate text-[15px] font-medium", ROLE_NAME[entry.role])}>{entry.username}</span>
                                                    {entry.email === me.email && <span className="shrink-0 text-[11px] text-zinc-400">({tx(C.you)})</span>}
                                                    {entry.role !== "member" && <RoleBadge role={entry.role} compact />}
                                                    <StaffBadge role={entry.staffRole} size="sm" compactOnMobile />
                                                </span>
                                                {status && <span className="block truncate text-xs text-zinc-500 dark:text-zinc-400">{status}</span>}
                                            </span>
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                    </section>
                ))}
            </div>
            <MemberCard member={member} onClose={() => setSelected("")} />
        </div>
    );
}

function MemberCard({ member, onClose }: { member: WorkspaceMember | null; onClose: () => void }) {
    const { tx, locale } = useI18n();
    const router = useRouter();
    const { groupId, group, me, role, isOwner, now, notify, confirm, errorText, refresh } = useWorkspace();
    const session = useGroupSession();
    const social = useSocial();
    const viewer = useProfileViewer();
    const [busy, setBusy] = useState("");
    const palette = GROUP_COLORS[group.color] ?? GROUP_COLORS.indigo;

    if (!member) return viewer.element;

    const self = member.email === me.email;
    const friend = social.isFriend(member.email);
    const tag = formatFriendTag(member.nickname ?? "", member.nicknameTag ?? "");
    const canRemove = !self && member.role !== "owner" && (role === "owner" || (role === "admin" && member.role === "member"));
    const actions: Array<{ id: MemberAction; label: Copy; icon: ReactNode; danger?: boolean }> = [];
    if (isOwner && !self) {
        actions.push(member.role === "admin"
            ? { id: "remove-admin", label: C.removeAdmin, icon: <ShieldOff className="h-4 w-4" aria-hidden /> }
            : { id: "make-admin", label: C.makeAdmin, icon: <Shield className="h-4 w-4" aria-hidden /> });
        actions.push({ id: "transfer", label: C.transfer, icon: <Crown className="h-4 w-4" aria-hidden /> });
    }
    if (canRemove) {
        actions.push({ id: "remove", label: C.remove, icon: <UserMinus className="h-4 w-4" aria-hidden />, danger: true });
        actions.push({ id: "ban", label: C.ban, icon: <Ban className="h-4 w-4" aria-hidden />, danger: true });
    }

    const run = async (action: MemberAction) => {
        const name = member.username;
        const copy: Record<MemberAction, { title: Copy; body?: Copy; tone: "danger" | "default"; confirm: Copy }> = {
            "make-admin": { title: C.makeAdminTitle, body: C.makeAdminBody, tone: "default", confirm: C.confirm },
            "remove-admin": { title: C.removeAdminTitle, tone: "default", confirm: C.confirm },
            transfer: { title: C.transferTitle, body: C.transferBody, tone: "danger", confirm: C.transfer },
            remove: { title: C.removeTitle, body: C.removeBody, tone: "danger", confirm: C.remove },
            ban: { title: C.banTitle, body: C.banBody, tone: "danger", confirm: C.ban },
        };
        const entry = copy[action];
        if (!await confirm({ title: tx(entry.title, { name }), body: entry.body ? tx(entry.body, { name }) : undefined, confirmLabel: tx(entry.confirm), tone: entry.tone })) return;
        setBusy(action);
        try {
            if (action === "make-admin" || action === "remove-admin") await groupsApi.action({ action: "set-admin", groupId, targetEmail: member.email, enabled: action === "make-admin" });
            else if (action === "transfer") await groupsApi.action({ action: "transfer-ownership", groupId, targetEmail: member.email });
            else await groupsApi.action({ action: "remove-member", groupId, targetEmail: member.email, ban: action === "ban" });
            notify(tx(C.done), "success");
            await refresh();
            if (action === "remove" || action === "ban") onClose();
        } catch (error) {
            notify(errorText(error), "error");
        } finally {
            setBusy("");
        }
    };

    const addFriend = async () => {
        if (!tag) {
            notify(tx(C.noTag), "info");
            return;
        }
        setBusy("friend");
        try {
            const result = await socialApi.friendAction({ action: "request", tag });
            notify(tx(result.accepted ? C.nowFriends : C.requestSent, { name: member.username }), "success");
            await social.friends.refresh();
        } catch (error) {
            notify(social.errorText(error), "error");
        } finally {
            setBusy("");
        }
    };

    const statusLine = member.customStatus
        ? `${member.statusEmoji ? `${member.statusEmoji} ` : ""}${member.customStatus}`
        : member.status === "offline" && member.lastSeenAt ? tx(C.lastSeen, { time: relativeTime(toMillis(member.lastSeenAt), now, locale) }) : tx(PRESENCE_STATUS_COPY[member.status]);

    return (
        <>
            <Modal open onClose={onClose} labelledBy="member-card-title" size="sm">
                <div className={cx("h-20 shrink-0 bg-gradient-to-br", palette.gradient)} aria-hidden />
                <div className="-mt-10 px-5">
                    <PresenceAvatar src={member.avatarUrl} name={member.username} status={member.status} size="xl" ring="bg-white dark:bg-zinc-900" className="rounded-full ring-[6px] ring-white dark:ring-zinc-900" />
                </div>
                <div className="space-y-4 overflow-y-auto px-5 pb-5 pt-2">
                    <div>
                        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                            <h2 id="member-card-title" className="min-w-0 break-words text-xl font-black">{member.username}</h2>
                            <RoleBadge role={member.role} showMember />
                            <StaffBadge role={member.staffRole} size="sm" />
                        </div>
                        {tag && <p className="font-mono text-sm text-zinc-500 dark:text-zinc-400">{tag}</p>}
                        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">{statusLine}</p>
                    </div>
                    {!self && (
                        <div className="flex flex-wrap gap-2">
                            {friend ? (
                                <>
                                    <button type="button" onClick={() => { onClose(); router.push(dmHref(member.email)); }} className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-indigo-600 px-3 py-2 text-sm font-bold text-white transition hover:bg-indigo-500"><MessageCircle className="h-4 w-4" aria-hidden />{tx(C.message)}</button>
                                    <button type="button" disabled={!social.live} onClick={() => { onClose(); session.callMember(member); }} title={social.live ? tx(C.call) : tx(C.callOffline)} className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-sm font-bold text-white transition hover:bg-emerald-500 disabled:opacity-50"><Phone className="h-4 w-4" aria-hidden />{tx(C.call)}</button>
                                </>
                            ) : (
                                <button type="button" disabled={busy === "friend"} onClick={() => void addFriend()} className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-sm font-bold text-white transition hover:bg-emerald-500 disabled:opacity-50">{busy === "friend" ? <Spinner className="h-4 w-4" /> : <UserPlus className="h-4 w-4" aria-hidden />}{tx(C.addFriend)}</button>
                            )}
                            <button type="button" onClick={() => void viewer.show(member.email)} className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-zinc-100 px-3 py-2 text-sm font-semibold text-zinc-800 transition hover:bg-zinc-200 dark:bg-white/10 dark:text-white dark:hover:bg-white/15"><UserRound className="h-4 w-4" aria-hidden />{tx(C.profile)}</button>
                        </div>
                    )}
                    {actions.length > 0 && (
                        <section aria-labelledby="member-card-manage" className="rounded-2xl border border-zinc-200 p-2 dark:border-white/10">
                            <h3 id="member-card-manage" className="px-2 pb-1 pt-1 text-[11px] font-black uppercase tracking-wide text-zinc-500 dark:text-zinc-400">{tx(C.manage)}</h3>
                            {actions.map((action) => (
                                <button key={action.id} type="button" disabled={Boolean(busy)} onClick={() => void run(action.id)} className={cx("flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-start text-sm font-medium transition disabled:opacity-50", action.danger ? "text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10" : "text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-white/[0.06]")}>
                                    {busy === action.id ? <Spinner className="h-4 w-4" /> : action.icon}{tx(action.label)}
                                </button>
                            ))}
                        </section>
                    )}
                </div>
            </Modal>
            {viewer.element}
        </>
    );
}
