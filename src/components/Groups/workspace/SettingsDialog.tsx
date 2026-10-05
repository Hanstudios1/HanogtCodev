"use client";

import { motion } from "framer-motion";
import { AlertTriangle, BookOpen, Bot, Crown, Hash, LogOut, Plus, Save, Settings2, ShieldAlert, ShieldCheck, Trash2, UserCheck, UsersRound, X } from "lucide-react";
import { useState, type FormEvent, type ReactNode } from "react";
import { useI18n, type Copy } from "@/lib/i18n";
import { GROUP_COLORS, GROUP_COLOR_IDS, GROUP_EMOJIS, GROUP_LIMITS, canModerate, normalizeTopic, type GroupColor } from "@/lib/groups";
import { groupsApi } from "../api";
import { GroupTile, Modal, ModalHeader, Spinner, cx } from "../ui";
import BotSettings from "./BotSettings";
import { useWorkspace } from "./context";
import SafetySettings from "./SafetySettings";

export type SettingsTab = "general" | "rules" | "membership" | "safety" | "bots" | "danger";

const C = {
    title: { TR: "Grup ayarları", EN: "Group settings" },
    titleMember: { TR: "Grup bilgileri", EN: "Group info" },
    general: { TR: "Genel", EN: "General" },
    rules: { TR: "Kurallar ve konular", EN: "Rules & topics" },
    membership: { TR: "Üyelik", EN: "Membership" },
    safety: { TR: "Güvenlik", EN: "Safety" },
    bots: { TR: "Botlar", EN: "Bots" },
    danger: { TR: "Gelişmiş", EN: "Advanced" },
    name: { TR: "Grup adı", EN: "Group name" },
    description: { TR: "Açıklama", EN: "Description" },
    icon: { TR: "Simge", EN: "Icon" },
    color: { TR: "Vurgu rengi", EN: "Accent color" },
    save: { TR: "Değişiklikleri kaydet", EN: "Save changes" },
    saved: { TR: "Ayarlar kaydedildi.", EN: "Settings saved." },
    readOnly: { TR: "Bu ayarları yalnızca grup sahibi ve yöneticiler değiştirebilir.", EN: "Only the owner and admins can change these settings." },
    rulesLabel: { TR: "Grup kuralları", EN: "Group rules" },
    rulesHint: { TR: "Kurallar her üyeye Üyeler panelinden gösterilir. Ayrıntılı kurallar için KURALLAR.md dosyasını da kullanabilirsin.", EN: "Rules are shown to every member from the Members panel. You can also keep detailed rules in a RULES.md file." },
    rulesEmpty: { TR: "Bu grup için henüz kural yazılmadı.", EN: "No rules have been written for this group yet." },
    topics: { TR: "Sohbet konuları", EN: "Chat topics" },
    topicsHint: { TR: "Konular sohbetin üstünde filtre olarak görünür; mesajlarda #konu yazarak etiketlenir.", EN: "Topics appear as filters above the chat; messages are tagged by writing #topic." },
    addTopic: { TR: "Konu ekle", EN: "Add topic" },
    topicPlaceholder: { TR: "örn. sorular", EN: "e.g. questions" },
    removeTopic: { TR: "#{topic} konusunu kaldır", EN: "Remove #{topic}" },
    topicInvalid: { TR: "Konu yalnızca harf, rakam, - ve _ içerebilir (en fazla 24 karakter).", EN: "A topic may only contain letters, digits, - and _ (max 24 characters)." },
    topicLimit: { TR: "En fazla 12 konu eklenebilir.", EN: "You can add at most 12 topics." },
    memberInvites: { TR: "Üyeler arkadaşlarını davet edebilir", EN: "Members can invite their friends" },
    memberInvitesHint: { TR: "Kapalıyken yalnızca sahip ve yöneticiler davet gönderebilir. Davet bağlantılarını her zaman yalnızca yöneticiler oluşturur.", EN: "When off, only the owner and admins can send invitations. Invite links are always created by admins only." },
    banned: { TR: "Engellenen kişiler", EN: "Blocked people" },
    bannedEmpty: { TR: "Engellenen kimse yok.", EN: "Nobody is blocked." },
    unban: { TR: "Engeli kaldır", EN: "Unblock" },
    unbanned: { TR: "Engel kaldırıldı.", EN: "Block lifted." },
    guide: { TR: "Başlangıç rehberi", EN: "Getting-started guide" },
    guideText: { TR: "Yeni grubun için hazırlanan kontrol listesini tekrar göster.", EN: "Show the getting-started checklist for your group again." },
    guideShow: { TR: "Rehberi göster", EN: "Show the guide" },
    guideShown: { TR: "Başlangıç rehberi yeniden açıldı.", EN: "The getting-started guide is back." },
    transferTitle: { TR: "Sahipliği devret", EN: "Transfer ownership" },
    transferText: { TR: "Grubu başka bir üyeye devret. Sen yönetici olarak kalırsın.", EN: "Hand the group over to another member. You stay an admin." },
    transferSelect: { TR: "Yeni sahip", EN: "New owner" },
    transferPick: { TR: "Üye seç…", EN: "Choose a member…" },
    transferButton: { TR: "Devret", EN: "Transfer" },
    transferConfirmTitle: { TR: "Sahiplik {name} kullanıcısına devredilsin mi?", EN: "Transfer ownership to {name}?" },
    transferConfirmBody: { TR: "Bu işlemi yalnızca yeni sahip geri alabilir.", EN: "Only the new owner can undo this." },
    transferred: { TR: "Sahiplik devredildi.", EN: "Ownership transferred." },
    noMembers: { TR: "Devredebilmek için grupta başka bir üye olmalı.", EN: "There must be another member to transfer the group to." },
    deleteTitle: { TR: "Grubu sil", EN: "Delete the group" },
    deleteText: { TR: "Tüm dosyalar, mesajlar, sesli mesajlar, davetler ve bağlantılar kalıcı olarak silinir. Bu işlem geri alınamaz.", EN: "All files, messages, voice messages, invitations and links are deleted permanently. This can't be undone." },
    deleteConfirmLabel: { TR: "Onaylamak için grup adını yaz: {name}", EN: "Type the group name to confirm: {name}" },
    deleteButton: { TR: "Grubu kalıcı olarak sil", EN: "Delete the group permanently" },
    deleting: { TR: "Siliniyor…", EN: "Deleting…" },
    leaveTitle: { TR: "Gruptan ayrıl", EN: "Leave the group" },
    leaveText: { TR: "Dosyalara ve sohbete erişimini kaybedersin. Yeniden katılmak için davet gerekir.", EN: "You lose access to the files and chat. You'll need an invitation to rejoin." },
    leaveButton: { TR: "Gruptan ayrıl", EN: "Leave the group" },
    leaveConfirm: { TR: "{name} grubundan ayrılmak istediğine emin misin?", EN: "Are you sure you want to leave {name}?" },
    ownerLeave: { TR: "Grup sahibi olarak ayrılmadan önce sahipliği devretmeli veya grubu silmelisin.", EN: "As the owner, transfer ownership or delete the group before leaving." },
    chars: { TR: "{count}/{max}", EN: "{count}/{max}" },
} satisfies Record<string, Copy>;

function Section({ title, icon, children, tone = "default" }: { title: string; icon: ReactNode; children: ReactNode; tone?: "default" | "danger" }) {
    return (
        <section className={cx("rounded-2xl border p-4 sm:p-5", tone === "danger" ? "border-red-500/30 bg-red-500/[0.03]" : "border-zinc-200 dark:border-white/10")}>
            <h3 className={cx("flex items-center gap-2 text-sm font-black", tone === "danger" && "text-red-700 dark:text-red-400")}>{icon}{title}</h3>
            <div className="mt-3">{children}</div>
        </section>
    );
}

export default function SettingsDialog({ open, onClose, initialTab, onLeft, onRestoreGuide }: { open: boolean; onClose: () => void; initialTab: SettingsTab; onLeft: (reason: "left" | "deleted") => void; onRestoreGuide: () => Promise<boolean> }) {
    const { tx } = useI18n();
    const { groupId, group, members, me, role, isManager, isOwner, banned, notify, confirm, errorText, refresh } = useWorkspace();
    const [tab, setTab] = useState<SettingsTab>(initialTab);
    const [name, setName] = useState(group.name);
    const [description, setDescription] = useState(group.description);
    const [emoji, setEmoji] = useState(group.emoji);
    const [color, setColor] = useState<GroupColor>(group.color);
    const [rules, setRules] = useState(group.rules);
    const [topics, setTopics] = useState<string[]>(group.topics);
    const [topicInput, setTopicInput] = useState("");
    const [topicError, setTopicError] = useState("");
    const [busy, setBusy] = useState("");
    const [transferTo, setTransferTo] = useState("");
    const [confirmName, setConfirmName] = useState("");

    const generalDirty = name.trim() !== group.name || description.trim() !== group.description || emoji !== group.emoji || color !== group.color;
    const rulesDirty = rules.trim() !== group.rules || topics.join("|") !== group.topics.join("|");
    const tabs: Array<{ id: SettingsTab; label: Copy; icon: ReactNode }> = [
        { id: "general", label: C.general, icon: <Settings2 className="h-4 w-4" aria-hidden /> },
        { id: "rules", label: C.rules, icon: <BookOpen className="h-4 w-4" aria-hidden /> },
        ...(isManager ? [{ id: "membership" as const, label: C.membership, icon: <UsersRound className="h-4 w-4" aria-hidden /> }] : []),
        ...(canModerate(role) ? [{ id: "safety" as const, label: C.safety, icon: <ShieldCheck className="h-4 w-4" aria-hidden /> }] : []),
        { id: "bots", label: C.bots, icon: <Bot className="h-4 w-4" aria-hidden /> },
        { id: "danger", label: C.danger, icon: <ShieldAlert className="h-4 w-4" aria-hidden /> },
    ];

    const save = async (body: Record<string, unknown>, key: string) => {
        setBusy(key);
        try {
            await groupsApi.action({ action: "update-settings", groupId, ...body });
            notify(tx(C.saved), "success");
            await refresh();
            return true;
        } catch (error) {
            notify(errorText(error), "error");
            return false;
        } finally {
            setBusy("");
        }
    };

    const addTopic = (event: FormEvent) => {
        event.preventDefault();
        const topic = normalizeTopic(topicInput, group.contentLanguage);
        if (!topic) {
            setTopicError(tx(C.topicInvalid));
            return;
        }
        if (topics.length >= GROUP_LIMITS.topicsMax) {
            setTopicError(tx(C.topicLimit));
            return;
        }
        if (!topics.includes(topic)) setTopics([...topics, topic]);
        setTopicInput("");
        setTopicError("");
    };

    const transfer = async () => {
        const target = members.find((member) => member.email === transferTo);
        if (!target) return;
        const approved = await confirm({ title: tx(C.transferConfirmTitle, { name: target.username }), body: tx(C.transferConfirmBody), confirmLabel: tx(C.transferButton), tone: "danger" });
        if (!approved) return;
        setBusy("transfer");
        try {
            await groupsApi.action({ action: "transfer-ownership", groupId, targetEmail: target.email });
            notify(tx(C.transferred), "success");
            await refresh();
            onClose();
        } catch (error) {
            notify(errorText(error), "error");
        } finally {
            setBusy("");
        }
    };

    const remove = async () => {
        setBusy("delete");
        try {
            await groupsApi.action({ action: "delete", groupId, confirmName: confirmName.trim() });
            onLeft("deleted");
        } catch (error) {
            notify(errorText(error), "error");
            setBusy("");
        }
    };

    const leave = async () => {
        const approved = await confirm({ title: tx(C.leaveConfirm, { name: group.name }), body: tx(C.leaveText), confirmLabel: tx(C.leaveButton), tone: "danger" });
        if (!approved) return;
        setBusy("leave");
        try {
            await groupsApi.action({ action: "leave", groupId });
            onLeft("left");
        } catch (error) {
            notify(errorText(error), "error");
            setBusy("");
        }
    };

    const unban = async (email: string) => {
        setBusy(email);
        try {
            await groupsApi.action({ action: "unban", groupId, targetEmail: email });
            notify(tx(C.unbanned), "success");
            await refresh();
        } catch (error) {
            notify(errorText(error), "error");
        } finally {
            setBusy("");
        }
    };

    const inputClass = "mt-2 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 disabled:bg-zinc-50 disabled:text-zinc-500 dark:border-white/10 dark:bg-zinc-950 dark:disabled:bg-zinc-900";

    return (
        <Modal open={open} onClose={() => { if (!busy) onClose(); }} labelledBy="group-settings-title" size="lg" dismissible={!busy}>
            <ModalHeader id="group-settings-title" title={tx(isManager ? C.title : C.titleMember)} description={group.name} onClose={() => { if (!busy) onClose(); }} icon={<GroupTile emoji={group.emoji} color={group.color} size="sm" />} />
            <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
                <nav className="flex shrink-0 gap-1 overflow-x-auto border-b border-zinc-200 p-2 dark:border-white/10 sm:w-52 sm:flex-col sm:border-b-0 sm:border-e" role="tablist" aria-orientation="vertical">
                    {tabs.map((entry) => (
                        <button key={entry.id} type="button" role="tab" aria-selected={tab === entry.id} onClick={() => setTab(entry.id)} className={cx("relative flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-start text-sm font-semibold transition", tab === entry.id ? "text-indigo-700 dark:text-indigo-300" : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-white", entry.id === "danger" && tab !== entry.id && "text-red-600/80 dark:text-red-400/80")}>
                            {tab === entry.id && <motion.span layoutId="settings-tab" className="absolute inset-0 rounded-xl bg-indigo-500/10" transition={{ type: "spring", stiffness: 420, damping: 36 }} />}
                            <span className="relative flex items-center gap-2">{entry.icon}{tx(entry.label)}</span>
                        </button>
                    ))}
                </nav>
                <div className="min-h-[360px] flex-1 overflow-y-auto p-5 sm:p-6">
                    {tab === "general" && (
                        <div className="space-y-5">
                            {!isManager && <p className="rounded-2xl bg-zinc-100 px-4 py-3 text-sm text-zinc-600 dark:bg-white/5 dark:text-zinc-300">{tx(C.readOnly)}</p>}
                            <div>
                                <label htmlFor="settings-name" className="flex items-center justify-between text-sm font-semibold"><span>{tx(C.name)}</span><span className="text-xs tabular-nums text-zinc-400">{tx(C.chars, { count: name.length, max: GROUP_LIMITS.nameMax })}</span></label>
                                <input id="settings-name" value={name} disabled={!isManager} maxLength={Math.max(GROUP_LIMITS.nameMax, group.name.length)} onChange={(event) => setName(event.target.value)} className={inputClass} />
                            </div>
                            <div>
                                <label htmlFor="settings-description" className="flex items-center justify-between text-sm font-semibold"><span>{tx(C.description)}</span><span className="text-xs tabular-nums text-zinc-400">{tx(C.chars, { count: description.length, max: GROUP_LIMITS.descriptionMax })}</span></label>
                                <textarea id="settings-description" value={description} disabled={!isManager} maxLength={GROUP_LIMITS.descriptionMax} rows={3} onChange={(event) => setDescription(event.target.value)} className={cx(inputClass, "resize-none")} />
                            </div>
                            {isManager && (
                                <>
                                    <fieldset>
                                        <legend className="text-sm font-semibold">{tx(C.icon)}</legend>
                                        <div className="mt-2 grid max-h-32 grid-cols-8 gap-1.5 overflow-y-auto rounded-2xl border border-zinc-200 p-2 dark:border-white/10 sm:grid-cols-10">
                                            {GROUP_EMOJIS.map((option) => (
                                                <button key={option} type="button" onClick={() => setEmoji(option)} aria-pressed={emoji === option} aria-label={option} className={cx("flex aspect-square items-center justify-center rounded-xl text-xl transition hover:bg-zinc-100 dark:hover:bg-zinc-800", emoji === option && "bg-indigo-500/15 ring-2 ring-indigo-500")}>{option}</button>
                                            ))}
                                        </div>
                                    </fieldset>
                                    <fieldset>
                                        <legend className="text-sm font-semibold">{tx(C.color)}</legend>
                                        <div className="mt-2 flex flex-wrap gap-2">
                                            {GROUP_COLOR_IDS.map((option) => (
                                                <button key={option} type="button" onClick={() => setColor(option)} aria-pressed={color === option} aria-label={tx(GROUP_COLORS[option].name)} title={tx(GROUP_COLORS[option].name)} className={cx("h-9 w-9 rounded-full bg-gradient-to-br transition hover:scale-110", GROUP_COLORS[option].gradient, color === option && "ring-2 ring-zinc-900 ring-offset-2 dark:ring-white dark:ring-offset-zinc-900")} />
                                            ))}
                                        </div>
                                    </fieldset>
                                    <div className="flex justify-end">
                                        <button type="button" disabled={!generalDirty || Boolean(busy) || name.trim().length < GROUP_LIMITS.nameMin} onClick={() => void save({ name: name.trim(), description: description.trim(), emoji, color }, "general")} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white shadow-lg shadow-indigo-600/20 transition hover:bg-indigo-500 disabled:opacity-50">
                                            {busy === "general" ? <Spinner className="h-4 w-4" /> : <Save className="h-4 w-4" aria-hidden />}{tx(C.save)}
                                        </button>
                                    </div>
                                </>
                            )}
                        </div>
                    )}

                    {tab === "rules" && (
                        <div className="space-y-6">
                            <div>
                                <label htmlFor="settings-rules" className="flex items-center justify-between text-sm font-semibold"><span>{tx(C.rulesLabel)}</span>{isManager && <span className="text-xs tabular-nums text-zinc-400">{tx(C.chars, { count: rules.length, max: GROUP_LIMITS.rulesMax })}</span>}</label>
                                {isManager ? (
                                    <textarea id="settings-rules" value={rules} maxLength={GROUP_LIMITS.rulesMax} rows={9} onChange={(event) => setRules(event.target.value)} className={cx(inputClass, "resize-y font-mono text-[13px] leading-6")} />
                                ) : (
                                    <div className="mt-2 whitespace-pre-wrap rounded-2xl bg-zinc-50 p-4 text-sm leading-6 text-zinc-700 dark:bg-white/5 dark:text-zinc-200">{group.rules || tx(C.rulesEmpty)}</div>
                                )}
                                <p className="mt-1.5 text-xs text-zinc-500 dark:text-zinc-400">{tx(C.rulesHint)}</p>
                            </div>
                            <div>
                                <p className="text-sm font-semibold">{tx(C.topics)}</p>
                                <ul className="mt-2 flex flex-wrap gap-1.5">
                                    {topics.map((topic) => (
                                        <li key={topic} className="inline-flex items-center gap-1 rounded-full bg-fuchsia-500/10 py-1 pe-1.5 ps-2.5 text-xs font-semibold text-fuchsia-700 dark:text-fuchsia-300">
                                            <Hash className="h-3 w-3" aria-hidden />{topic}
                                            {isManager && <button type="button" onClick={() => setTopics(topics.filter((entry) => entry !== topic))} className="rounded-full p-0.5 hover:bg-fuchsia-500/20" aria-label={tx(C.removeTopic, { topic })}><X className="h-3 w-3" aria-hidden /></button>}
                                        </li>
                                    ))}
                                </ul>
                                {isManager && (
                                    <form onSubmit={addTopic} className="mt-3 flex gap-2">
                                        <input value={topicInput} onChange={(event) => { setTopicInput(event.target.value); setTopicError(""); }} maxLength={GROUP_LIMITS.topicMax + 1} placeholder={tx(C.topicPlaceholder)} aria-label={tx(C.addTopic)} className="min-w-0 flex-1 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500 dark:border-white/10 dark:bg-zinc-950" />
                                        <button type="submit" className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-200 px-3 py-2 text-sm font-semibold transition hover:bg-zinc-100 dark:border-white/10 dark:hover:bg-zinc-800"><Plus className="h-4 w-4" aria-hidden />{tx(C.addTopic)}</button>
                                    </form>
                                )}
                                {topicError && <p className="mt-1.5 text-xs text-red-600 dark:text-red-400" role="alert">{topicError}</p>}
                                <p className="mt-1.5 text-xs text-zinc-500 dark:text-zinc-400">{tx(C.topicsHint)}</p>
                            </div>
                            {isManager && (
                                <div className="flex justify-end">
                                    <button type="button" disabled={!rulesDirty || Boolean(busy)} onClick={() => void save({ rules: rules.trim(), topics }, "rules")} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white shadow-lg shadow-indigo-600/20 transition hover:bg-indigo-500 disabled:opacity-50">
                                        {busy === "rules" ? <Spinner className="h-4 w-4" /> : <Save className="h-4 w-4" aria-hidden />}{tx(C.save)}
                                    </button>
                                </div>
                            )}
                        </div>
                    )}

                    {tab === "membership" && isManager && (
                        <div className="space-y-4">
                            <Section title={tx(C.memberInvites)} icon={<UserCheck className="h-4 w-4 text-indigo-500" aria-hidden />}>
                                <div className="flex items-start justify-between gap-4">
                                    <p className="text-sm text-zinc-600 dark:text-zinc-400">{tx(C.memberInvitesHint)}</p>
                                    <button type="button" role="switch" aria-checked={group.allowMemberInvites} aria-label={tx(C.memberInvites)} disabled={busy === "invites"} onClick={() => void save({ allowMemberInvites: !group.allowMemberInvites }, "invites")} className={cx("relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition disabled:opacity-60", group.allowMemberInvites ? "bg-indigo-600" : "bg-zinc-300 dark:bg-zinc-700")}>
                                        <span className={cx("inline-block h-5 w-5 rounded-full bg-white shadow transition", group.allowMemberInvites ? "translate-x-6 rtl:-translate-x-6" : "translate-x-1 rtl:-translate-x-1")} />
                                    </button>
                                </div>
                            </Section>
                            <Section title={tx(C.banned)} icon={<ShieldAlert className="h-4 w-4 text-red-500" aria-hidden />}>
                                {banned.length === 0 ? <p className="text-sm text-zinc-500">{tx(C.bannedEmpty)}</p> : (
                                    <ul className="space-y-1.5">
                                        {banned.map((entry) => (
                                            <li key={entry.email} className="flex items-center gap-3 rounded-xl bg-zinc-50 px-3 py-2 dark:bg-white/5">
                                                <span className="min-w-0 flex-1 truncate text-sm font-semibold">{entry.username}</span>
                                                <button type="button" onClick={() => void unban(entry.email)} disabled={Boolean(busy)} className="rounded-lg px-2.5 py-1 text-xs font-semibold text-indigo-600 transition hover:bg-indigo-500/10 dark:text-indigo-300">{busy === entry.email ? <Spinner className="h-3.5 w-3.5" /> : tx(C.unban)}</button>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </Section>
                            {group.onboarding.dismissed && (
                                <Section title={tx(C.guide)} icon={<BookOpen className="h-4 w-4 text-emerald-500" aria-hidden />}>
                                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                        <p className="text-sm text-zinc-600 dark:text-zinc-400">{tx(C.guideText)}</p>
                                        <button type="button" disabled={busy === "guide"} onClick={() => { setBusy("guide"); void onRestoreGuide().then((done) => { setBusy(""); if (done) { notify(tx(C.guideShown), "success"); onClose(); } }); }} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-zinc-200 px-3 py-2 text-sm font-semibold transition hover:bg-zinc-100 dark:border-white/10 dark:hover:bg-zinc-800">{busy === "guide" ? <Spinner className="h-4 w-4" /> : <BookOpen className="h-4 w-4" aria-hidden />}{tx(C.guideShow)}</button>
                                    </div>
                                </Section>
                            )}
                        </div>
                    )}

                    {tab === "safety" && canModerate(role) && <SafetySettings />}

                    {tab === "bots" && <BotSettings />}

                    {tab === "danger" && (
                        <div className="space-y-4">
                            {isOwner ? (
                                <>
                                    <Section title={tx(C.transferTitle)} icon={<Crown className="h-4 w-4 text-amber-500" aria-hidden />}>
                                        <p className="text-sm text-zinc-600 dark:text-zinc-400">{tx(C.transferText)}</p>
                                        {members.length > 1 ? (
                                            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                                                <select value={transferTo} onChange={(event) => setTransferTo(event.target.value)} aria-label={tx(C.transferSelect)} className="min-w-0 flex-1 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500 dark:border-white/10 dark:bg-zinc-950">
                                                    <option value="">{tx(C.transferPick)}</option>
                                                    {members.filter((member) => member.email !== me.email).map((member) => <option key={member.email} value={member.email}>{member.username}</option>)}
                                                </select>
                                                <button type="button" disabled={!transferTo || Boolean(busy)} onClick={() => void transfer()} className="inline-flex items-center justify-center gap-2 rounded-xl bg-amber-500 px-4 py-2 text-sm font-bold text-amber-950 transition hover:bg-amber-400 disabled:opacity-50">{busy === "transfer" ? <Spinner className="h-4 w-4" /> : <Crown className="h-4 w-4" aria-hidden />}{tx(C.transferButton)}</button>
                                            </div>
                                        ) : <p className="mt-2 text-xs text-zinc-500">{tx(C.noMembers)}</p>}
                                    </Section>
                                    <Section title={tx(C.deleteTitle)} icon={<Trash2 className="h-4 w-4" aria-hidden />} tone="danger">
                                        <p className="text-sm text-zinc-600 dark:text-zinc-400">{tx(C.deleteText)}</p>
                                        <label htmlFor="settings-delete-confirm" className="mt-3 block text-xs font-semibold text-zinc-600 dark:text-zinc-300">{tx(C.deleteConfirmLabel, { name: group.name })}</label>
                                        <input id="settings-delete-confirm" value={confirmName} onChange={(event) => setConfirmName(event.target.value)} autoComplete="off" spellCheck={false} className="mt-1.5 w-full rounded-xl border border-red-500/30 bg-white px-3 py-2 text-sm outline-none focus:border-red-500 focus:ring-4 focus:ring-red-500/10 dark:bg-zinc-950" />
                                        <button type="button" disabled={confirmName.trim() !== group.name.trim() || Boolean(busy)} onClick={() => void remove()} className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-red-500 disabled:opacity-40 sm:w-auto">
                                            {busy === "delete" ? <Spinner className="h-4 w-4" /> : <Trash2 className="h-4 w-4" aria-hidden />}{busy === "delete" ? tx(C.deleting) : tx(C.deleteButton)}
                                        </button>
                                    </Section>
                                    <p className="flex items-start gap-2 text-xs text-zinc-500 dark:text-zinc-400"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />{tx(C.ownerLeave)}</p>
                                </>
                            ) : (
                                <Section title={tx(C.leaveTitle)} icon={<LogOut className="h-4 w-4" aria-hidden />} tone="danger">
                                    <p className="text-sm text-zinc-600 dark:text-zinc-400">{tx(C.leaveText)}</p>
                                    <button type="button" disabled={Boolean(busy)} onClick={() => void leave()} className="mt-3 inline-flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-red-500 disabled:opacity-50">{busy === "leave" ? <Spinner className="h-4 w-4" /> : <LogOut className="h-4 w-4" aria-hidden />}{tx(C.leaveButton)}</button>
                                </Section>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </Modal>
    );
}
