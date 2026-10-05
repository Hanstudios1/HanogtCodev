"use client";

import { Ban, Crown, Gavel, Shield, ShieldOff, UserMinus, UserPlus, UsersRound } from "lucide-react";
import { useState, type ReactNode } from "react";
import { groupsApi } from "@/components/Groups/api";
import { RoleBadge, Spinner, UI_COPY, cx } from "@/components/Groups/ui";
import { useWorkspace } from "@/components/Groups/workspace/context";
import type { WorkspaceMember } from "@/components/Groups/workspace/model";
import PresenceAvatar from "@/components/PresenceAvatar";
import StaffBadge from "@/components/StaffBadge";
import { useI18n, type Copy } from "@/lib/i18n";
import { GROUP_LIMITS, ROLE_RANK, canModerate, isManagerRole } from "@/lib/groups";
import { LAST_SEEN_COPY } from "@/lib/presence";
import { sectionMembers, type MemberSectionId } from "@/lib/social/model";
import { useProfileViewer } from "../profile";
import UserPopout from "../UserPopout";
import { useGroupSession } from "./GroupSession";

const C = {
    title: { TR: "Üyeler", EN: "Members" },
    count: { TR: "{count}/{max}", EN: "{count}/{max}" },
    invite: { TR: "Davet et", EN: "Invite" },
    owner: { TR: "Sahip — {count}", EN: "Owner — {count}" },
    admin: { TR: "Yöneticiler — {count}", EN: "Admins — {count}" },
    moderator: { TR: "Moderatörler — {count}", EN: "Moderators — {count}" },
    member: { TR: "Üyeler — {count}", EN: "Members — {count}" },
    offline: { TR: "Çevrimdışı — {count}", EN: "Offline — {count}" },
    open: { TR: "{name} üye kartını aç", EN: "Open {name}'s member card" },
    manage: { TR: "Yönetim", EN: "Management" },
    makeAdmin: { TR: "Yönetici yap", EN: "Make admin" },
    removeAdmin: { TR: "Yöneticiliği kaldır", EN: "Remove admin role" },
    makeModerator: { TR: "Moderatör yap", EN: "Make moderator" },
    removeModerator: { TR: "Moderatörlüğü kaldır", EN: "Remove moderator role" },
    makeModeratorTitle: { TR: "{name} moderatör olsun mu?", EN: "Make {name} a moderator?" },
    makeModeratorBody: { TR: "Moderatörler sohbeti düzenli tutar: mesaj siler, uyarır, susturur, üyeleri çıkarır ve yavaş modu açar. Grup ayarlarını değiştiremez, kimseyi engelleyemez.", EN: "Moderators keep the chat in order: they delete messages, warn, mute, remove members and turn on slow mode. They can't change the group's settings or block anyone." },
    removeModeratorTitle: { TR: "{name} için moderatörlük kaldırılsın mı?", EN: "Remove moderator role from {name}?" },
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

const SECTION_COPY: Record<MemberSectionId, Copy> = { owner: C.owner, admin: C.admin, moderator: C.moderator, member: C.member, offline: C.offline };
const ROLE_NAME = { owner: "text-amber-600 dark:text-amber-400", admin: "text-indigo-600 dark:text-indigo-300", moderator: "text-emerald-600 dark:text-emerald-400", member: "text-zinc-700 dark:text-zinc-200" } as const;

type MemberAction = "make-admin" | "remove-admin" | "make-moderator" | "remove-moderator" | "transfer" | "remove" | "ban";

/** Right column inside a group: people grouped by role while they're around, then everyone offline. */
export default function MemberList() {
    const { tx, locale } = useI18n();
    const { members, me, canInvite } = useWorkspace();
    const session = useGroupSession();
    const sections = sectionMembers(members, locale);
    const openEmail = session.userCard?.person.email ?? "";

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
                                const status = entry.customStatus;
                                return (
                                    <li key={entry.email}>
                                        <button
                                            type="button"
                                            onClick={(event) => session.openUserCard(entry.email, event.currentTarget)}
                                            aria-label={tx(C.open, { name: entry.username })}
                                            aria-expanded={openEmail === entry.email}
                                            className={cx("group flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-start transition hover:bg-zinc-200/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:hover:bg-white/[0.06]", openEmail === entry.email && "bg-zinc-200/70 dark:bg-white/[0.06]", entry.status === "offline" && openEmail !== entry.email && "opacity-50 hover:opacity-100")}
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
        </div>
    );
}

/**
 * The profile card of a group member (or of someone who left), opened from
 * the member list or a message: Discord's popout with the member's role and,
 * for owners and admins, the management actions.
 */
export function GroupUserCard() {
    const { members } = useWorkspace();
    const session = useGroupSession();
    const viewer = useProfileViewer();
    const card = session.userCard;
    const member = card ? members.find((entry) => entry.email === card.person.email) ?? null : null;
    return (
        <>
            {card && (
                <UserPopout
                    key={`${card.person.email}:${card.anchor.top}`}
                    popout={card}
                    onClose={session.closeUserCard}
                    onViewProfile={(email) => void viewer.show(email)}
                    badges={member ? <RoleBadge role={member.role} showMember /> : null}
                    footer={member ? <MemberManage member={member} onDone={session.closeUserCard} /> : null}
                />
            )}
            {viewer.element}
        </>
    );
}

/** Owner and admin actions on a member (shown inside the member's card). */
function MemberManage({ member, onDone }: { member: WorkspaceMember; onDone: () => void }) {
    const { tx } = useI18n();
    const { groupId, me, role, isOwner, notify, confirm, errorText, refresh } = useWorkspace();
    const [busy, setBusy] = useState("");
    const self = member.email === me.email;
    // Moderation reaches only people of a lower rank; blocking is for owners and admins.
    const outranked = !self && ROLE_RANK[role] > ROLE_RANK[member.role];
    const canRemove = outranked && canModerate(role);
    const canBan = outranked && isManagerRole(role);
    const actions: Array<{ id: MemberAction; label: Copy; icon: ReactNode; danger?: boolean }> = [];
    if (isOwner && !self) {
        actions.push(member.role === "admin"
            ? { id: "remove-admin", label: C.removeAdmin, icon: <ShieldOff className="h-4 w-4" aria-hidden /> }
            : { id: "make-admin", label: C.makeAdmin, icon: <Shield className="h-4 w-4" aria-hidden /> });
    }
    if (outranked && isManagerRole(role) && (member.role === "member" || member.role === "moderator")) {
        actions.push(member.role === "moderator"
            ? { id: "remove-moderator", label: C.removeModerator, icon: <ShieldOff className="h-4 w-4" aria-hidden /> }
            : { id: "make-moderator", label: C.makeModerator, icon: <Gavel className="h-4 w-4" aria-hidden /> });
    }
    if (isOwner && !self) actions.push({ id: "transfer", label: C.transfer, icon: <Crown className="h-4 w-4" aria-hidden /> });
    if (canRemove) actions.push({ id: "remove", label: C.remove, icon: <UserMinus className="h-4 w-4" aria-hidden />, danger: true });
    if (canBan) actions.push({ id: "ban", label: C.ban, icon: <Ban className="h-4 w-4" aria-hidden />, danger: true });
    if (!actions.length) return null;

    const run = async (action: MemberAction) => {
        const name = member.username;
        const copy: Record<MemberAction, { title: Copy; body?: Copy; tone: "danger" | "default"; confirm: Copy }> = {
            "make-admin": { title: C.makeAdminTitle, body: C.makeAdminBody, tone: "default", confirm: C.confirm },
            "remove-admin": { title: C.removeAdminTitle, tone: "default", confirm: C.confirm },
            "make-moderator": { title: C.makeModeratorTitle, body: C.makeModeratorBody, tone: "default", confirm: C.confirm },
            "remove-moderator": { title: C.removeModeratorTitle, tone: "default", confirm: C.confirm },
            transfer: { title: C.transferTitle, body: C.transferBody, tone: "danger", confirm: C.transfer },
            remove: { title: C.removeTitle, body: C.removeBody, tone: "danger", confirm: C.remove },
            ban: { title: C.banTitle, body: C.banBody, tone: "danger", confirm: C.ban },
        };
        const entry = copy[action];
        // The confirmation is a dialog of its own: the card closes first.
        onDone();
        if (!await confirm({ title: tx(entry.title, { name }), body: entry.body ? tx(entry.body, { name }) : undefined, confirmLabel: tx(entry.confirm), tone: entry.tone })) return;
        setBusy(action);
        try {
            if (action === "make-admin" || action === "remove-admin") await groupsApi.action({ action: "set-admin", groupId, targetEmail: member.email, enabled: action === "make-admin" });
            else if (action === "make-moderator" || action === "remove-moderator") await groupsApi.action({ action: "set-moderator", groupId, targetEmail: member.email, enabled: action === "make-moderator" });
            else if (action === "transfer") await groupsApi.action({ action: "transfer-ownership", groupId, targetEmail: member.email });
            else await groupsApi.action({ action: "remove-member", groupId, targetEmail: member.email, ban: action === "ban" });
            notify(tx(C.done), "success");
            await refresh();
        } catch (error) {
            notify(errorText(error), "error");
        } finally {
            setBusy("");
        }
    };

    return (
        <section aria-label={tx(C.manage)} className="mt-3 border-t border-zinc-200 pt-2 dark:border-white/10">
            <h3 className="px-1 pb-1 text-[11px] font-black uppercase tracking-wide text-zinc-500 dark:text-zinc-400">{tx(C.manage)}</h3>
            {actions.map((action) => (
                <button key={action.id} type="button" disabled={Boolean(busy)} onClick={() => void run(action.id)} className={cx("flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-start text-sm font-medium transition disabled:opacity-50", action.danger ? "text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10" : "text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-white/[0.06]")}>
                    {busy === action.id ? <Spinner className="h-4 w-4" /> : action.icon}{tx(action.label)}
                </button>
            ))}
        </section>
    );
}
