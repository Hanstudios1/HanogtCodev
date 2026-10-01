"use client";

import { doc, getDoc } from "firebase/firestore";
import { AnimatePresence, motion } from "framer-motion";
import { Ban, BookOpen, Crown, MessageCircle, MoreHorizontal, Phone, Shield, ShieldOff, UserMinus, UserPlus, UsersRound } from "lucide-react";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import ProfileModal, { type UserProfile } from "@/components/ProfileModal";
import StaffBadge, { parseStaffRole } from "@/components/StaffBadge";
import { db } from "@/lib/firebase";
import { useI18n, type Copy } from "@/lib/i18n";
import { GROUP_LIMITS, toMillis } from "@/lib/groups";
import { groupsApi } from "../api";
import { RoleBadge, UI_COPY, UserAvatar, cx, relativeTime } from "../ui";
import { useWorkspace } from "./context";
import type { WorkspaceMember } from "./model";

const C = {
    members: { TR: "Üyeler", EN: "Members" },
    count: { TR: "{count}/{max}", EN: "{count}/{max}" },
    invite: { TR: "Davet et", EN: "Invite" },
    rules: { TR: "Kurallar", EN: "Rules" },
    online: { TR: "Çevrimiçi — {count}", EN: "Online — {count}" },
    offline: { TR: "Çevrimdışı — {count}", EN: "Offline — {count}" },
    lastSeen: { TR: "Son görülme {time}", EN: "Last seen {time}" },
    call: { TR: "Sesli ara", EN: "Voice call" },
    callFriendsOnly: { TR: "Sesli arama yalnızca arkadaşlar arasında yapılabilir", EN: "Voice calls are available between friends only" },
    message: { TR: "Özel mesaj", EN: "Direct message" },
    addFriend: { TR: "Arkadaş ekle", EN: "Add friend" },
    profile: { TR: "{name} profilini aç", EN: "Open {name}'s profile" },
    manage: { TR: "{name} için yönetim", EN: "Manage {name}" },
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
} satisfies Record<string, Copy>;

type MemberAction = "make-admin" | "remove-admin" | "transfer" | "remove" | "ban";

export default function MembersPanel({ onInvite, onCall, onOpenRules }: { onInvite: () => void; onCall: (member: WorkspaceMember) => void; onOpenRules: () => void }) {
    const { tx, locale } = useI18n();
    const { groupId, members, me, role, isManager, isOwner, canInvite, now, notify, confirm, errorText, refresh } = useWorkspace();
    const [menuFor, setMenuFor] = useState("");
    const [busy, setBusy] = useState("");
    const [profile, setProfile] = useState<UserProfile | null>(null);
    const online = members.filter((member) => member.online);
    const offline = members.filter((member) => !member.online);

    useEffect(() => {
        if (!menuFor) return;
        const onPointer = (event: PointerEvent) => {
            if (!(event.target instanceof Element) || !event.target.closest("[data-member-menu]")) setMenuFor("");
        };
        const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setMenuFor(""); };
        document.addEventListener("pointerdown", onPointer);
        document.addEventListener("keydown", onKey);
        return () => {
            document.removeEventListener("pointerdown", onPointer);
            document.removeEventListener("keydown", onKey);
        };
    }, [menuFor]);

    const openProfile = async (member: WorkspaceMember) => {
        const snapshot = await getDoc(doc(db, "public_profiles", member.email)).catch(() => null);
        const data = snapshot?.exists() ? snapshot.data() as Partial<UserProfile> : {};
        setProfile({ ...data, username: data.username || member.username, avatarUrl: data.avatarUrl || member.avatarUrl || undefined, email: member.email, staffRole: parseStaffRole(data.staffRole) ?? parseStaffRole(member.staffRole) });
    };

    const run = async (member: WorkspaceMember, action: MemberAction) => {
        setMenuFor("");
        const name = member.username;
        const copy: Record<MemberAction, { title: Copy; body?: Copy; tone: "danger" | "default" }> = {
            "make-admin": { title: C.makeAdminTitle, body: C.makeAdminBody, tone: "default" },
            "remove-admin": { title: C.removeAdminTitle, tone: "default" },
            transfer: { title: C.transferTitle, body: C.transferBody, tone: "danger" },
            remove: { title: C.removeTitle, body: C.removeBody, tone: "danger" },
            ban: { title: C.banTitle, body: C.banBody, tone: "danger" },
        };
        const entry = copy[action];
        const approved = await confirm({
            title: tx(entry.title, { name }),
            body: entry.body ? tx(entry.body, { name }) : undefined,
            confirmLabel: action === "transfer" ? tx(C.transfer) : action === "remove" ? tx(C.remove) : action === "ban" ? tx(C.ban) : tx(C.confirm),
            tone: entry.tone,
        });
        if (!approved) return;
        setBusy(member.email);
        try {
            if (action === "make-admin" || action === "remove-admin") await groupsApi.action({ action: "set-admin", groupId, targetEmail: member.email, enabled: action === "make-admin" });
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

    const renderMember = (member: WorkspaceMember) => {
        const self = member.email === me.email;
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
        const status = member.customStatus ? `${member.statusEmoji ? `${member.statusEmoji} ` : ""}${member.customStatus}` : "";
        return (
            <li key={member.email} className={cx("group relative flex items-center gap-2.5 rounded-xl px-2 py-1.5 transition hover:bg-zinc-100 dark:hover:bg-zinc-800/70", busy === member.email && "opacity-60")}>
                <button type="button" onClick={() => void openProfile(member)} className="flex min-w-0 flex-1 items-center gap-2.5 text-start" aria-label={tx(C.profile, { name: member.username })}>
                    <UserAvatar name={member.username} src={member.avatarUrl} size="md" online={member.online} />
                    <span className="min-w-0">
                        <span className="flex items-center gap-1.5">
                            <span className="min-w-0 truncate text-sm font-semibold">{member.username}</span>
                            {self && <span className="shrink-0 text-[11px] text-zinc-400">({tx(UI_COPY.you)})</span>}
                            <RoleBadge role={member.role} compact />
                            <StaffBadge role={parseStaffRole(member.staffRole)} size="sm" compactOnMobile />
                        </span>
                        <span className="block truncate text-xs text-zinc-500 dark:text-zinc-400">
                            {status || (member.online ? "" : member.lastSeenAt ? tx(C.lastSeen, { time: relativeTime(toMillis(member.lastSeenAt), now, locale) }) : "")}
                        </span>
                    </span>
                </button>
                {!self && (
                    <span className="flex shrink-0 items-center gap-0.5">
                        {member.isFriend ? (
                            <>
                                <button type="button" onClick={() => onCall(member)} className="rounded-lg p-1.5 text-emerald-600 transition hover:bg-emerald-500/10 dark:text-emerald-400" aria-label={tx(C.call)} title={tx(C.call)}><Phone className="h-4 w-4" aria-hidden /></button>
                                <Link href={`/messages/${encodeURIComponent(member.email)}`} className="rounded-lg p-1.5 text-indigo-600 transition hover:bg-indigo-500/10 dark:text-indigo-300" aria-label={tx(C.message)} title={tx(C.message)}><MessageCircle className="h-4 w-4" aria-hidden /></Link>
                            </>
                        ) : (
                            <Link href="/friends" className="rounded-lg p-1.5 text-zinc-400 transition hover:bg-zinc-200 hover:text-zinc-700 dark:hover:bg-zinc-700 dark:hover:text-zinc-200" aria-label={tx(C.addFriend)} title={tx(C.callFriendsOnly)}><UserPlus className="h-4 w-4" aria-hidden /></Link>
                        )}
                        {actions.length > 0 && (
                            <span className="relative" data-member-menu>
                                <button type="button" onClick={() => setMenuFor(menuFor === member.email ? "" : member.email)} className="rounded-lg p-1.5 text-zinc-400 transition hover:bg-zinc-200 hover:text-zinc-700 dark:hover:bg-zinc-700 dark:hover:text-zinc-200" aria-label={tx(C.manage, { name: member.username })} aria-haspopup="menu" aria-expanded={menuFor === member.email}>
                                    <MoreHorizontal className="h-4 w-4" aria-hidden />
                                </button>
                                <AnimatePresence>
                                    {menuFor === member.email && (
                                        <motion.div role="menu" initial={{ opacity: 0, y: -4, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -4, scale: 0.97 }} transition={{ duration: 0.12 }} className="absolute end-0 top-full z-30 mt-1 w-56 overflow-hidden rounded-xl border border-zinc-200 bg-white py-1 shadow-2xl dark:border-white/10 dark:bg-zinc-800">
                                            {actions.map((action) => (
                                                <button key={action.id} type="button" role="menuitem" onClick={() => void run(member, action.id)} className={cx("flex w-full items-center gap-3 px-3.5 py-2 text-start text-sm transition", action.danger ? "text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10" : "text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-700")}>
                                                    {action.icon}{tx(action.label)}
                                                </button>
                                            ))}
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </span>
                        )}
                    </span>
                )}
            </li>
        );
    };

    return (
        <div className="flex h-full min-h-0 w-full flex-col">
            <div className="flex items-center gap-2 border-b border-zinc-200 px-3 py-2 dark:border-white/10">
                <h2 className="flex flex-1 items-center gap-2 text-sm font-black"><UsersRound className="h-4 w-4 text-indigo-500" aria-hidden />{tx(C.members)}<span className="text-xs font-semibold tabular-nums text-zinc-400">{tx(C.count, { count: members.length, max: GROUP_LIMITS.membersMax })}</span></h2>
                <button type="button" onClick={onOpenRules} className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-white"><BookOpen className="h-3.5 w-3.5" aria-hidden />{tx(C.rules)}</button>
                {canInvite && <button type="button" onClick={onInvite} className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-2.5 py-1.5 text-xs font-bold text-white transition hover:bg-indigo-500"><UserPlus className="h-3.5 w-3.5" aria-hidden />{tx(C.invite)}</button>}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-2">
                {online.length > 0 && <p className="px-2 pb-1 pt-2 text-[11px] font-black uppercase tracking-wider text-emerald-600 dark:text-emerald-400">{tx(C.online, { count: online.length })}</p>}
                <ul>{online.map(renderMember)}</ul>
                {offline.length > 0 && <p className="px-2 pb-1 pt-3 text-[11px] font-black uppercase tracking-wider text-zinc-400">{tx(C.offline, { count: offline.length })}</p>}
                <ul>{offline.map(renderMember)}</ul>
                {isManager && members.length === 1 && canInvite && (
                    <button type="button" onClick={onInvite} className="mt-4 flex w-full flex-col items-center gap-2 rounded-2xl border border-dashed border-indigo-500/40 p-5 text-center text-sm text-indigo-700 transition hover:bg-indigo-500/5 dark:text-indigo-300">
                        <UserPlus className="h-6 w-6" aria-hidden />{tx(C.invite)}
                    </button>
                )}
            </div>
            {profile && <ProfileModal user={profile} isOpen onClose={() => setProfile(null)} />}
        </div>
    );
}
