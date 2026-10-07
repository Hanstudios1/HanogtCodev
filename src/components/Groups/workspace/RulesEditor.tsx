"use client";

import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, ArrowDown, ArrowUp, Check, Pencil, Plus, Save, ScrollText, Sparkles, Trash2, X } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useI18n, type Copy } from "@/lib/i18n";
import { GROUP_LIMITS, cleanMultiLine, cleanSingleLine, mergeRules, newRuleId, suggestedRules, type GroupRule } from "@/lib/groups";
import RulesList from "../RulesList";
import { Spinner, cx } from "../ui";
import { useWorkspace } from "./context";

const C = {
    title: { TR: "Grup kuralları", EN: "Group rules" },
    count: { TR: "{count}/{max} kural", EN: "{count}/{max} rules" },
    hint: { TR: "Kurallar, kanal listesinin en üstündeki Kurallar bölümünde herkese gösterilir; /kurallar komutu da onları listeler.", EN: "Rules are shown to everyone in the Rules section at the top of the channel list, and the /rules command lists them too." },
    empty: { TR: "Henüz kural yok. Aşağıdan bir kural ekle ya da önerilen kurallarla başla.", EN: "No rules yet. Add one below or start with the suggested rules." },
    emptyMember: { TR: "Bu grup için henüz kural eklenmedi.", EN: "No rules have been added for this group yet." },
    moveUp: { TR: "{n}. kuralı yukarı taşı", EN: "Move rule {n} up" },
    moveDown: { TR: "{n}. kuralı aşağı taşı", EN: "Move rule {n} down" },
    edit: { TR: "{n}. kuralı düzenle", EN: "Edit rule {n}" },
    remove: { TR: "{n}. kuralı sil", EN: "Delete rule {n}" },
    ruleTitle: { TR: "Başlık", EN: "Title" },
    ruleDescription: { TR: "Açıklama (isteğe bağlı)", EN: "Description (optional)" },
    titlePlaceholder: { TR: "Örn. Saygılı ve yapıcı ol", EN: "e.g. Be respectful and constructive" },
    descriptionPlaceholder: { TR: "Kuralı birkaç cümleyle açıkla.", EN: "Explain the rule in a sentence or two." },
    done: { TR: "Tamam", EN: "Done" },
    cancel: { TR: "Vazgeç", EN: "Cancel" },
    add: { TR: "Kural ekle", EN: "Add rule" },
    newRule: { TR: "Yeni kural", EN: "New rule" },
    suggested: { TR: "Önerilen kuralları ekle", EN: "Add the suggested rules" },
    suggestedAdded: { TR: "{count} önerilen kural eklendi. Kaydetmeyi unutma.", EN: "Suggested rules added: {count}. Don't forget to save." },
    suggestedNone: { TR: "Önerilen kuralların hepsi zaten listede.", EN: "All of the suggested rules are already on the list." },
    titleMissing: { TR: "Kuralın bir başlığı olmalı.", EN: "The rule needs a title." },
    limit: { TR: "En fazla {max} kural eklenebilir.", EN: "You can add at most {max} rules." },
    chars: { TR: "{count}/{max}", EN: "{count}/{max}" },
    screening: { TR: "Üyeler sohbet etmeden önce kuralları kabul etsin", EN: "Members accept the rules before they chat" },
    screeningHint: { TR: "Açıkken üyeler kuralları kabul edene kadar mesaj yazamaz, tepki veremez ve sesli kanala katılamaz; okumaya devam edebilir. Sahip, yöneticiler ve moderatörler muaftır.", EN: "While it's on, members can't write, react or join the voice channel until they accept the rules; they can still read. The owner, admins and moderators are exempt." },
    screeningNew: { TR: "Kaydettiğinde üyelerin sohbete katılmadan önce kuralları kabul etmesi gerekecek.", EN: "Once you save, members will need to accept the rules before they join the chat." },
    screeningEmpty: { TR: "Kabul zorunluluğu en az bir kural olduğunda çalışır.", EN: "Acceptance applies once there is at least one rule." },
    reaccept: { TR: "Herkes kuralları yeniden kabul etsin", EN: "Ask everyone to accept the rules again" },
    reacceptHint: { TR: "İşaretlemezsen kuralları daha önce kabul edenlerden yeniden istenmez; küçük düzeltmeler için gerekmez.", EN: "If you leave it unticked, people who already accepted aren't asked again; small fixes don't need it." },
    save: { TR: "Kuralları kaydet", EN: "Save the rules" },
    saveEditing: { TR: "Kaydetmeden önce düzenlediğin kuralı tamamla.", EN: "Finish the rule you're editing before saving." },
    memberScreening: { TR: "Bu grupta üyeler sohbet etmeden önce kuralları kabul ediyor.", EN: "In this group, members accept the rules before they chat." },
} satisfies Record<string, Copy>;

type Editing = { id: string; title: string; description: string };

const sameRules = (a: readonly GroupRule[], b: readonly GroupRule[]) => a.length === b.length && a.every((rule, index) => rule.title === b[index].title && rule.description === b[index].description);

/** The texts as the server stores them (one line for the title, at most one empty line in a row), so a saved list isn't "changed". */
const cleanTitle = (value: string) => cleanSingleLine(value, GROUP_LIMITS.ruleTitleMax).slice(0, GROUP_LIMITS.ruleTitleMax);
const cleanDescription = (value: string) => cleanMultiLine(value, GROUP_LIMITS.ruleDescriptionMax).replace(/\n{3,}/g, "\n\n").slice(0, GROUP_LIMITS.ruleDescriptionMax);

const inputClass = "w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 dark:border-white/10 dark:bg-zinc-950";

/** A title and description field pair with their character counts. */
function RuleFields({ idPrefix, title, description, onTitle, onDescription, autoFocus = false }: {
    idPrefix: string;
    title: string;
    description: string;
    onTitle: (value: string) => void;
    onDescription: (value: string) => void;
    autoFocus?: boolean;
}) {
    const { tx } = useI18n();
    return (
        <div className="space-y-2.5">
            <div>
                <label htmlFor={`${idPrefix}-title`} className="flex items-center justify-between text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                    <span>{tx(C.ruleTitle)}</span>
                    <span className="tabular-nums text-zinc-400">{tx(C.chars, { count: title.length, max: GROUP_LIMITS.ruleTitleMax })}</span>
                </label>
                <input id={`${idPrefix}-title`} value={title} maxLength={GROUP_LIMITS.ruleTitleMax} autoFocus={autoFocus} onChange={(event) => onTitle(event.target.value)} placeholder={tx(C.titlePlaceholder)} className={cx(inputClass, "mt-1")} autoComplete="off" />
            </div>
            <div>
                <label htmlFor={`${idPrefix}-description`} className="flex items-center justify-between text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                    <span>{tx(C.ruleDescription)}</span>
                    <span className="tabular-nums text-zinc-400">{tx(C.chars, { count: description.length, max: GROUP_LIMITS.ruleDescriptionMax })}</span>
                </label>
                <textarea id={`${idPrefix}-description`} value={description} maxLength={GROUP_LIMITS.ruleDescriptionMax} rows={2} onChange={(event) => onDescription(event.target.value)} placeholder={tx(C.descriptionPlaceholder)} className={cx(inputClass, "mt-1 resize-y")} />
            </div>
        </div>
    );
}

/**
 * The Rules section in the group settings. Owners and admins edit the list
 * (add, edit in place, reorder, delete, the suggested rules) and choose
 * whether members accept the rules before they chat; everyone else reads it.
 */
export default function RulesEditor({ busy, onSave }: { busy: boolean; onSave: (body: Record<string, unknown>) => Promise<boolean> }) {
    const { tx } = useI18n();
    const { group, isManager, notify } = useWorkspace();
    const [rules, setRules] = useState<GroupRule[]>(group.rulesList);
    const [screening, setScreening] = useState(group.rulesScreening);
    const [reaccept, setReaccept] = useState(false);
    const [editing, setEditing] = useState<Editing | null>(null);
    const [newTitle, setNewTitle] = useState("");
    const [newDescription, setNewDescription] = useState("");
    const [error, setError] = useState("");
    const max = GROUP_LIMITS.rulesCount;
    const full = rules.length >= max;

    if (!isManager) {
        return (
            <section aria-labelledby="settings-rules-title">
                <h3 id="settings-rules-title" className="flex items-center gap-2 text-sm font-semibold"><ScrollText className="h-4 w-4 text-indigo-500" aria-hidden />{tx(C.title)}</h3>
                {group.rulesList.length
                    ? <RulesList rules={group.rulesList} className="mt-3 rounded-2xl bg-zinc-50 p-4 dark:bg-white/5" />
                    : <p className="mt-2 rounded-2xl bg-zinc-50 p-4 text-sm text-zinc-600 dark:bg-white/5 dark:text-zinc-300">{tx(C.emptyMember)}</p>}
                {group.rulesScreening && group.rulesList.length > 0 && <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">{tx(C.memberScreening)}</p>}
                <p className="mt-1.5 text-xs text-zinc-500 dark:text-zinc-400">{tx(C.hint)}</p>
            </section>
        );
    }

    const wasScreening = group.rulesScreening;
    const dirty = !sameRules(rules, group.rulesList) || screening !== wasScreening || (reaccept && screening && wasScreening);

    const move = (index: number, step: -1 | 1) => {
        const target = index + step;
        if (target < 0 || target >= rules.length) return;
        const next = [...rules];
        [next[index], next[target]] = [next[target], next[index]];
        setRules(next);
    };

    const finishEdit = () => {
        if (!editing) return;
        const title = cleanTitle(editing.title);
        if (!title) {
            setError(tx(C.titleMissing));
            return;
        }
        setRules(rules.map((rule) => (rule.id === editing.id ? { ...rule, title, description: cleanDescription(editing.description) } : rule)));
        setEditing(null);
        setError("");
    };

    const add = (event: FormEvent) => {
        event.preventDefault();
        const title = cleanTitle(newTitle);
        if (!title) {
            setError(tx(C.titleMissing));
            return;
        }
        if (full) {
            setError(tx(C.limit, { max }));
            return;
        }
        setRules([...rules, { id: newRuleId(), title, description: cleanDescription(newDescription) }]);
        setNewTitle("");
        setNewDescription("");
        setError("");
    };

    const addSuggested = () => {
        const next = mergeRules(rules, suggestedRules(group.contentLanguage), (rule) => ({ id: newRuleId(), ...rule }));
        const added = next.length - rules.length;
        if (!added) {
            notify(tx(full ? C.limit : C.suggestedNone, { max }), "info");
            return;
        }
        setRules(next);
        setError("");
        notify(tx(C.suggestedAdded, { count: added }), "success");
    };

    const save = async () => {
        if (editing) {
            setError(tx(C.saveEditing));
            return;
        }
        const saved = await onSave({
            rulesList: rules.map(({ id, title, description }) => ({ id, title, description })),
            rulesScreening: screening,
            ...(reaccept && screening && wasScreening ? { rulesReaccept: true } : {}),
        });
        if (saved) setReaccept(false);
    };

    const iconButton = "rounded-lg p-1.5 text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:pointer-events-none disabled:opacity-30 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-white";

    return (
        <section aria-labelledby="settings-rules-title" className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 id="settings-rules-title" className="flex items-center gap-2 text-sm font-semibold"><ScrollText className="h-4 w-4 text-indigo-500" aria-hidden />{tx(C.title)}</h3>
                <span className={cx("text-xs font-semibold tabular-nums", full ? "text-amber-600 dark:text-amber-400" : "text-zinc-400")}>{tx(C.count, { count: rules.length, max })}</span>
            </div>
            <p className="-mt-2 text-xs text-zinc-500 dark:text-zinc-400">{tx(C.hint)}</p>

            {rules.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-zinc-300 p-4 text-center text-sm text-zinc-500 dark:border-white/15 dark:text-zinc-400">{tx(C.empty)}</p>
            ) : (
                <ol className="space-y-2">
                    <AnimatePresence initial={false}>
                        {rules.map((rule, index) => {
                            const n = index + 1;
                            const open = editing?.id === rule.id;
                            return (
                                <motion.li key={rule.id} layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.16 }} className={cx("rounded-2xl border p-3", open ? "border-indigo-500/40 bg-indigo-500/[0.03]" : "border-zinc-200 bg-white dark:border-white/10 dark:bg-zinc-950/40")}>
                                    <div className="flex items-start gap-3">
                                        <span aria-hidden className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-500/10 text-[11px] font-black tabular-nums text-indigo-700 dark:text-indigo-300">{n}</span>
                                        {open && editing ? (
                                            <div className="min-w-0 flex-1">
                                                <RuleFields idPrefix={`rule-${rule.id}`} title={editing.title} description={editing.description} onTitle={(title) => setEditing({ ...editing, title })} onDescription={(description) => setEditing({ ...editing, description })} autoFocus />
                                                <div className="mt-2.5 flex justify-end gap-2">
                                                    <button type="button" onClick={() => { setEditing(null); setError(""); }} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-zinc-600 transition hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"><X className="h-3.5 w-3.5" aria-hidden />{tx(C.cancel)}</button>
                                                    <button type="button" onClick={finishEdit} className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-indigo-500"><Check className="h-3.5 w-3.5" aria-hidden />{tx(C.done)}</button>
                                                </div>
                                            </div>
                                        ) : (
                                            <>
                                                <div className="min-w-0 flex-1">
                                                    <p className="break-words text-sm font-bold">{rule.title}</p>
                                                    {rule.description && <p className="mt-0.5 whitespace-pre-line break-words text-sm text-zinc-600 dark:text-zinc-400">{rule.description}</p>}
                                                </div>
                                                <div className="flex shrink-0 items-center">
                                                    <button type="button" onClick={() => move(index, -1)} disabled={index === 0 || Boolean(editing)} className={iconButton} aria-label={tx(C.moveUp, { n })} title={tx(C.moveUp, { n })}><ArrowUp className="h-4 w-4" aria-hidden /></button>
                                                    <button type="button" onClick={() => move(index, 1)} disabled={index === rules.length - 1 || Boolean(editing)} className={iconButton} aria-label={tx(C.moveDown, { n })} title={tx(C.moveDown, { n })}><ArrowDown className="h-4 w-4" aria-hidden /></button>
                                                    <button type="button" onClick={() => { setEditing({ id: rule.id, title: rule.title, description: rule.description }); setError(""); }} disabled={Boolean(editing)} className={iconButton} aria-label={tx(C.edit, { n })} title={tx(C.edit, { n })}><Pencil className="h-4 w-4" aria-hidden /></button>
                                                    <button type="button" onClick={() => setRules(rules.filter((entry) => entry.id !== rule.id))} disabled={Boolean(editing)} className={cx(iconButton, "hover:bg-red-500/10 hover:text-red-600 dark:hover:bg-red-500/10 dark:hover:text-red-400")} aria-label={tx(C.remove, { n })} title={tx(C.remove, { n })}><Trash2 className="h-4 w-4" aria-hidden /></button>
                                                </div>
                                            </>
                                        )}
                                    </div>
                                </motion.li>
                            );
                        })}
                    </AnimatePresence>
                </ol>
            )}

            <form onSubmit={add} className="rounded-2xl border border-zinc-200 p-3 dark:border-white/10" aria-label={tx(C.newRule)}>
                <p className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400"><Plus className="h-3.5 w-3.5" aria-hidden />{tx(C.newRule)}</p>
                <RuleFields idPrefix="rule-new" title={newTitle} description={newDescription} onTitle={(value) => { setNewTitle(value); setError(""); }} onDescription={setNewDescription} />
                <div className="mt-3 flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <button type="button" onClick={addSuggested} disabled={Boolean(editing)} className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-zinc-200 px-3 py-2 text-sm font-semibold transition hover:bg-zinc-100 disabled:opacity-50 dark:border-white/10 dark:hover:bg-zinc-800"><Sparkles className="h-4 w-4 text-indigo-500" aria-hidden />{tx(C.suggested)}</button>
                    <button type="submit" disabled={full || !newTitle.trim()} className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-zinc-900 px-3 py-2 text-sm font-bold text-white transition hover:bg-zinc-700 disabled:opacity-40 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"><Plus className="h-4 w-4" aria-hidden />{tx(C.add)}</button>
                </div>
                {full && <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">{tx(C.limit, { max })}</p>}
            </form>

            <div className="rounded-2xl border border-zinc-200 p-4 dark:border-white/10">
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <p id="rules-screening-label" className="text-sm font-semibold">{tx(C.screening)}</p>
                        <p className="mt-1 text-xs leading-5 text-zinc-500 dark:text-zinc-400">{tx(C.screeningHint)}</p>
                    </div>
                    <button type="button" role="switch" aria-checked={screening} aria-labelledby="rules-screening-label" onClick={() => setScreening(!screening)} className={cx("relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-zinc-900", screening ? "bg-indigo-600" : "bg-zinc-300 dark:bg-zinc-700")}>
                        <span className={cx("inline-block h-5 w-5 rounded-full bg-white shadow transition", screening ? "translate-x-6 rtl:-translate-x-6" : "translate-x-1 rtl:-translate-x-1")} />
                    </button>
                </div>
                {screening && rules.length === 0 && <p className="mt-3 flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-300"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />{tx(C.screeningEmpty)}</p>}
                {screening && !wasScreening && rules.length > 0 && <p className="mt-3 text-xs text-indigo-700 dark:text-indigo-300">{tx(C.screeningNew)}</p>}
                {screening && wasScreening && (
                    <label className="mt-3 flex cursor-pointer items-start gap-2.5 rounded-xl bg-zinc-50 p-3 dark:bg-white/5">
                        <input type="checkbox" checked={reaccept} onChange={(event) => setReaccept(event.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded accent-indigo-600" />
                        <span>
                            <span className="block text-sm font-semibold">{tx(C.reaccept)}</span>
                            <span className="mt-0.5 block text-xs text-zinc-500 dark:text-zinc-400">{tx(C.reacceptHint)}</span>
                        </span>
                    </label>
                )}
            </div>

            {error && <p className="text-xs font-medium text-red-600 dark:text-red-400" role="alert">{error}</p>}
            <div className="flex flex-col items-end gap-1.5">
                {editing && <p className="text-xs text-zinc-500 dark:text-zinc-400">{tx(C.saveEditing)}</p>}
                <button type="button" disabled={!dirty || busy || Boolean(editing)} onClick={() => void save()} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white shadow-lg shadow-indigo-600/20 transition hover:bg-indigo-500 disabled:opacity-50">
                    {busy ? <Spinner className="h-4 w-4" /> : <Save className="h-4 w-4" aria-hidden />}{tx(C.save)}
                </button>
            </div>
        </section>
    );
}
