"use client";

import { Plus, Save, Terminal, Trash2 } from "lucide-react";
import { useState } from "react";
import { BOT_LABEL, BotAvatar, BotTag } from "@/components/Social/chat/bots";
import { useI18n, type Copy } from "@/lib/i18n";
import { CUSTOM_COMMAND_LIMITS, WELCOME_MESSAGE_MAX, sanitizeCustomCommands, type CustomCommand } from "@/lib/groups";
import { PLAN_GROUP_FEATURES } from "@/lib/plans";
import { RESERVED_COMMAND_NAMES } from "@/lib/social/commands";
import { groupsApi } from "../api";
import { Spinner, cx } from "../ui";
import { useWorkspace } from "./context";

const C = {
    securityText: { TR: "Her grupta bulunur ve kaldırılamaz. Grubun AutoMod kurallarını uygular, /uyar, /sustur, /at, /yasakla, /temizle ve /yavasmod gibi moderatör komutlarını çalıştırır ve kararları sohbette duyurur.", EN: "Part of every group and can't be removed. It applies the group's AutoMod rules, runs moderator commands such as /warn, /mute, /kick, /ban, /purge and /slowmode, and announces decisions in the chat." },
    always: { TR: "Her zaman açık", EN: "Always on" },
    aiText: { TR: "Üyeler /ai yazarak ya da @Hanogt AI diyerek soru sorar. Yanıt, kanalın son mesajlarını dikkate alır ve soran kişinin Hanogt AI hakkından düşer.", EN: "Members ask with /ai or by mentioning @Hanogt AI. The answer takes the channel's latest messages into account and counts against the asker's Hanogt AI allowance." },
    aiOn: { TR: "Hanogt AI bu grupta açık", EN: "Hanogt AI is on in this group" },
    welcome: { TR: "Karşılama mesajı", EN: "Welcome message" },
    welcomeHint: { TR: "Yeni bir üye katıldığında Hanogt Security Bot bu mesajı gönderir. {name} yeni üyenin adıyla değiştirilir. Boş bırakırsan mesaj gönderilmez.", EN: "When someone joins, Hanogt Security Bot sends this message. {name} is replaced with the newcomer's name. Leave it empty to send nothing." },
    welcomePlaceholder: { TR: "Hoş geldin {name}! Kurallara göz atmak için /kurallar yaz.", EN: "Welcome {name}! Type /rules to read the rules." },
    commands: { TR: "Özel komutlar", EN: "Custom commands" },
    commandsHint: { TR: "Bir üye /komut yazdığında Hanogt Security Bot buradaki yanıtı gönderir ({count}/{max} komut; sınır grup sahibinin planına göredir: Ücretsiz {free}, Plus {plus}, Pro {pro}). Hanogt'un kendi komut adları kullanılamaz.", EN: "When a member types /command, Hanogt Security Bot posts the answer you write here ({count}/{max} commands; the limit follows the group owner's plan: Free {free}, Plus {plus}, Pro {pro}). Hanogt's own command names can't be used." },
    name: { TR: "Komut adı", EN: "Command name" },
    description: { TR: "Açıklama (isteğe bağlı)", EN: "Description (optional)" },
    response: { TR: "Yanıt", EN: "Answer" },
    add: { TR: "Komut ekle", EN: "Add a command" },
    remove: { TR: "/{name} komutunu sil", EN: "Delete /{name}" },
    invalidName: { TR: "Ad küçük harfle başlamalı; harf, rakam, - ve _ içerebilir (en fazla 24).", EN: "The name must start with a lowercase letter and may contain letters, digits, - and _ (24 at most)." },
    reserved: { TR: "Bu ad Hanogt'un bir komutuna ait.", EN: "This name belongs to one of Hanogt's commands." },
    duplicate: { TR: "Bu adla bir komut zaten var.", EN: "There is already a command with this name." },
    needsResponse: { TR: "Bir yanıt yaz.", EN: "Write an answer." },
    none: { TR: "Henüz özel komut yok.", EN: "No custom commands yet." },
    save: { TR: "Bot ayarlarını kaydet", EN: "Save bot settings" },
    saved: { TR: "Bot ayarları kaydedildi.", EN: "Bot settings saved." },
    readOnly: { TR: "Bot ayarlarını grup sahibi ve yöneticiler değiştirir.", EN: "The owner and admins change the bot settings." },
    chars: { TR: "{count}/{max}", EN: "{count}/{max}" },
} satisfies Record<string, Copy>;

const NAME = /^[a-z][a-z0-9_-]{0,23}$/;

/** Group settings › Bots: Hanogt Security Bot, Hanogt AI on or off, the welcome message and custom commands. */
export default function BotSettings() {
    const { tx } = useI18n();
    const { groupId, group, isManager, notify, errorText, refresh, limits } = useWorkspace();
    const [aiBot, setAiBot] = useState(group.aiBot !== false);
    const [welcome, setWelcome] = useState(group.welcomeMessage);
    const [commands, setCommands] = useState<CustomCommand[]>(group.customCommands);
    const [draft, setDraft] = useState<CustomCommand>({ name: "", description: "", response: "" });
    const [draftError, setDraftError] = useState("");
    const [busy, setBusy] = useState(false);

    const dirty = aiBot !== (group.aiBot !== false) || welcome.trim() !== group.welcomeMessage || JSON.stringify(commands) !== JSON.stringify(group.customCommands);

    const addCommand = () => {
        const name = draft.name.trim().replace(/^\//, "").toLowerCase();
        if (!NAME.test(name)) return setDraftError(tx(C.invalidName));
        if (RESERVED_COMMAND_NAMES.includes(name)) return setDraftError(tx(C.reserved));
        if (commands.some((command) => command.name === name)) return setDraftError(tx(C.duplicate));
        if (!draft.response.trim()) return setDraftError(tx(C.needsResponse));
        const [command] = sanitizeCustomCommands([{ ...draft, name }], RESERVED_COMMAND_NAMES);
        if (!command) return setDraftError(tx(C.invalidName));
        setCommands([...commands, command]);
        setDraft({ name: "", description: "", response: "" });
        setDraftError("");
    };

    const save = async () => {
        setBusy(true);
        try {
            await groupsApi.action({ action: "update-settings", groupId, aiBot, welcomeMessage: welcome.trim(), customCommands: commands });
            notify(tx(C.saved), "success");
            await refresh();
        } catch (error) {
            notify(errorText(error), "error");
        } finally {
            setBusy(false);
        }
    };

    const field = "w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 disabled:bg-zinc-50 disabled:text-zinc-500 dark:border-white/10 dark:bg-zinc-950 dark:disabled:bg-zinc-900";

    return (
        <div className="space-y-4">
            {!isManager && <p className="rounded-2xl bg-zinc-100 px-4 py-3 text-sm text-zinc-600 dark:bg-white/5 dark:text-zinc-300">{tx(C.readOnly)}</p>}
            <section className="rounded-2xl border border-zinc-200 p-4 dark:border-white/10">
                <div className="flex items-center gap-3">
                    <BotAvatar bot="security" size={40} />
                    <p className="flex min-w-0 flex-1 flex-wrap items-center gap-2 font-bold">{tx(BOT_LABEL.security)}<BotTag /></p>
                    <span className="shrink-0 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-bold text-emerald-700 dark:text-emerald-400">{tx(C.always)}</span>
                </div>
                <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-300">{tx(C.securityText)}</p>
            </section>
            <section className="rounded-2xl border border-zinc-200 p-4 dark:border-white/10">
                <div className="flex items-center gap-3">
                    <BotAvatar bot="ai" size={40} />
                    <p className="flex min-w-0 flex-1 flex-wrap items-center gap-2 font-bold">{tx(BOT_LABEL.ai)}<BotTag /></p>
                    <button type="button" role="switch" aria-checked={aiBot} aria-label={tx(C.aiOn)} disabled={!isManager} onClick={() => setAiBot((value) => !value)} className={cx("relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition disabled:opacity-60", aiBot ? "bg-indigo-600" : "bg-zinc-300 dark:bg-zinc-700")}>
                        <span className={cx("inline-block h-5 w-5 rounded-full bg-white shadow transition", aiBot ? "translate-x-6 rtl:-translate-x-6" : "translate-x-1 rtl:-translate-x-1")} />
                    </button>
                </div>
                <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-300">{tx(C.aiText)}</p>
            </section>
            <section className="rounded-2xl border border-zinc-200 p-4 dark:border-white/10">
                <label htmlFor="bot-welcome" className="flex items-center justify-between text-sm font-black"><span>{tx(C.welcome)}</span><span className="text-xs font-semibold tabular-nums text-zinc-400">{tx(C.chars, { count: welcome.length, max: WELCOME_MESSAGE_MAX })}</span></label>
                <textarea id="bot-welcome" value={welcome} disabled={!isManager} maxLength={WELCOME_MESSAGE_MAX} rows={3} onChange={(event) => setWelcome(event.target.value)} placeholder={tx(C.welcomePlaceholder)} className={cx(field, "mt-2 resize-y")} />
                <p className="mt-1.5 text-xs text-zinc-500 dark:text-zinc-400">{tx(C.welcomeHint)}</p>
            </section>
            <section className="rounded-2xl border border-zinc-200 p-4 dark:border-white/10">
                <h3 className="flex items-center gap-2 text-sm font-black"><Terminal className="h-4 w-4 text-indigo-500" aria-hidden />{tx(C.commands)}</h3>
                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{tx(C.commandsHint, { count: commands.length, max: limits.commands, free: PLAN_GROUP_FEATURES.free.commands, plus: PLAN_GROUP_FEATURES.plus.commands, pro: PLAN_GROUP_FEATURES.pro.commands })}</p>
                {commands.length ? (
                    <ul className="mt-3 space-y-2">
                        {commands.map((command) => (
                            <li key={command.name} className="rounded-xl bg-zinc-50 px-3 py-2 dark:bg-white/5">
                                <div className="flex items-start gap-2">
                                    <div className="min-w-0 flex-1">
                                        <p className="font-mono text-sm font-bold">/{command.name}</p>
                                        {command.description && <p className="text-xs text-zinc-500 dark:text-zinc-400">{command.description}</p>}
                                        <p className="mt-1 line-clamp-3 whitespace-pre-wrap break-words text-sm text-zinc-700 dark:text-zinc-200">{command.response}</p>
                                    </div>
                                    {isManager && <button type="button" onClick={() => setCommands(commands.filter((entry) => entry.name !== command.name))} className="rounded-lg p-1.5 text-red-500 hover:bg-red-500/10" aria-label={tx(C.remove, { name: command.name })}><Trash2 className="h-4 w-4" aria-hidden /></button>}
                                </div>
                            </li>
                        ))}
                    </ul>
                ) : <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">{tx(C.none)}</p>}
                {isManager && commands.length < limits.commands && (
                    <div className="mt-3 grid gap-2 rounded-xl border border-dashed border-zinc-300 p-3 dark:border-white/15">
                        <div className="grid gap-2 sm:grid-cols-2">
                            <label className="text-xs font-semibold">{tx(C.name)}
                                <span className="mt-1 flex items-center rounded-xl border border-zinc-200 bg-white focus-within:border-indigo-500 dark:border-white/10 dark:bg-zinc-950"><span className="ps-3 font-mono text-sm text-zinc-400" aria-hidden>/</span><input value={draft.name} onChange={(event) => { setDraft({ ...draft, name: event.target.value }); setDraftError(""); }} maxLength={25} dir="ltr" className="min-w-0 flex-1 bg-transparent px-1 py-2 font-mono text-sm outline-none" /></span>
                            </label>
                            <label className="text-xs font-semibold">{tx(C.description)}
                                <input value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} maxLength={CUSTOM_COMMAND_LIMITS.description} className={cx(field, "mt-1")} />
                            </label>
                        </div>
                        <label className="text-xs font-semibold">{tx(C.response)}
                            <textarea value={draft.response} onChange={(event) => { setDraft({ ...draft, response: event.target.value }); setDraftError(""); }} maxLength={CUSTOM_COMMAND_LIMITS.response} rows={3} className={cx(field, "mt-1 resize-y")} />
                        </label>
                        {draftError && <p className="text-xs text-red-600 dark:text-red-400" role="alert">{draftError}</p>}
                        <div className="flex justify-end">
                            <button type="button" onClick={addCommand} className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-200 px-3 py-2 text-sm font-semibold transition hover:bg-zinc-100 dark:border-white/10 dark:hover:bg-zinc-800"><Plus className="h-4 w-4" aria-hidden />{tx(C.add)}</button>
                        </div>
                    </div>
                )}
            </section>
            {isManager && (
                <div className="flex justify-end">
                    <button type="button" disabled={!dirty || busy} onClick={() => void save()} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white shadow-lg shadow-indigo-600/20 transition hover:bg-indigo-500 disabled:opacity-50">
                        {busy ? <Spinner className="h-4 w-4" /> : <Save className="h-4 w-4" aria-hidden />}{tx(C.save)}
                    </button>
                </div>
            )}
        </div>
    );
}
