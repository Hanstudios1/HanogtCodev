"use client";

/**
 * Project settings → Languages (V5): the game's languages, the language it
 * starts in and the string table, plus the "Localization key" field of the UI
 * inspectors.
 */
import { AlertTriangle, Download, Languages, Plus, Search, Star, Trash2, Upload, X } from "lucide-react";
import { useId, useMemo, useRef, useState } from "react";
import {
    COMMON_LANGUAGES,
    LOCALIZATION_LIMITS,
    cleanLocalizationKey,
    isKnownLanguage,
    languageName,
    localizationFromCsv,
    localizationToCsv,
    mergeLocalization,
    normalizeLanguageCode,
} from "@/lib/game-engine/localization";
import type { GameEntity, GameProjectDocument, LocalizationSettings } from "@/lib/game-engine/types";
import { useI18n } from "@/lib/i18n";
import { useEditor } from "./context";
import { touch } from "./operations";
import { downloadBlob, safeFileName } from "./persistence";
import { useEditorState } from "./store";
import { Button, IconButton, SelectInput, TextInput, cx, inputClass } from "./ui";

/** Asks the editor to open Project settings on the Languages tab. */
export const OPEN_LOCALIZATION_EVENT = "hanogt-engine:open-localization";

const PAGE_SIZE = 60;

function allEntities(project: GameProjectDocument): GameEntity[] {
    return [...project.scenes.flatMap((scene) => scene.objects), ...project.prefabs.flatMap((prefab) => prefab.entities)];
}

/** A table cell: grows with its text and keeps line breaks (a plain input would drop them). */
function CellInput({ value, placeholder, disabled, missing, onChange }: { value: string; placeholder?: string; disabled: boolean; missing?: boolean; onChange: (value: string) => void }) {
    const [draft, setDraft] = useState<string | null>(null);
    return (
        <textarea
            value={draft ?? value}
            rows={1}
            dir="auto"
            placeholder={placeholder}
            disabled={disabled}
            maxLength={LOCALIZATION_LIMITS.valueLength}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={() => {
                if (draft !== null && draft !== value) onChange(draft);
                setDraft(null);
            }}
            onKeyDown={(event) => {
                if (event.key === "Escape") {
                    setDraft(null);
                    event.currentTarget.blur();
                }
            }}
            className={cx(inputClass, "h-auto min-h-7 resize-y py-1 leading-snug [field-sizing:content]", missing && "border-amber-500/40")}
        />
    );
}

export function LocalizationPanel({ disabled }: { disabled: boolean }) {
    const { store, t } = useEditor();
    const { locale } = useI18n();
    const project = useEditorState(store, (state) => state.project);
    const localization = project.settings.localization;
    const languages = localization.languages;
    const [query, setQuery] = useState("");
    const [limit, setLimit] = useState(PAGE_SIZE);
    const [customCode, setCustomCode] = useState("");
    const [notice, setNotice] = useState<{ tone: "ok" | "warn"; text: string } | null>(null);
    const fileRef = useRef<HTMLInputElement | null>(null);
    const nameOf = (code: string) => languageName(code, locale);

    const update = (label: string, recipe: (settings: LocalizationSettings, draft: GameProjectDocument) => void, mergeKey?: string) => store.update(label, (draft) => {
        recipe(draft.settings.localization, draft);
        touch(draft);
    }, mergeKey ? { mergeKey: `localization:${mergeKey}` } : {});

    const addLanguage = (raw: string) => {
        const code = normalizeLanguageCode(raw);
        if (!code || !isKnownLanguage(code)) {
            setNotice({ tone: "warn", text: t("invalidLanguageCode") });
            return;
        }
        setNotice(null);
        setCustomCode("");
        if (languages.includes(code) || languages.length >= LOCALIZATION_LIMITS.languages) return;
        update(t("addLanguage"), (settings) => {
            settings.languages.push(code);
        });
    };

    const removeLanguage = (code: string) => {
        const used = localization.entries.some((entry) => entry.values[code]);
        if (used && !window.confirm(`"${nameOf(code)}" ${t("removeLanguageConfirm")}`)) return;
        update(t("removeLanguage"), (settings) => {
            settings.languages = settings.languages.filter((item) => item !== code);
            for (const entry of settings.entries) delete entry.values[code];
            if (settings.startLanguage === code) settings.startLanguage = "auto";
        });
    };

    const makeMain = (code: string) => update(t("makeMainLanguage"), (settings) => {
        settings.languages = [code, ...settings.languages.filter((item) => item !== code)];
    });

    const addKey = () => {
        const taken = new Set(localization.entries.map((entry) => entry.key));
        let index = localization.entries.length + 1;
        while (taken.has(`text_${index}`)) index += 1;
        const key = `text_${index}`;
        update(t("addTextKey"), (settings) => {
            settings.entries.push({ key, values: {} });
        });
        setQuery("");
        setLimit(Number.MAX_SAFE_INTEGER);
    };

    /** Renames a key; UI elements that use it follow (scripts name keys in strings, so they don't). */
    const renameKey = (from: string, raw: string) => {
        const key = cleanLocalizationKey(raw);
        if (!key || key === from) return;
        if (localization.entries.some((entry) => entry.key === key)) {
            setNotice({ tone: "warn", text: t("duplicateKey") });
            return;
        }
        setNotice(null);
        update(t("keyColumn"), (settings, draft) => {
            const entry = settings.entries.find((item) => item.key === from);
            if (entry) entry.key = key;
            for (const entity of allEntities(draft)) {
                for (const component of entity.components) {
                    if ("localizationKey" in component && component.localizationKey === from) component.localizationKey = key;
                }
            }
        });
    };

    const setValue = (key: string, code: string, value: string) => update(t("stringTable"), (settings) => {
        const entry = settings.entries.find((item) => item.key === key);
        if (!entry) return;
        const text = value.slice(0, LOCALIZATION_LIMITS.valueLength);
        if (text) entry.values[code] = text;
        else delete entry.values[code];
    }, `${key}:${code}`);

    const removeKey = (key: string) => update(t("deleteKey"), (settings) => {
        settings.entries = settings.entries.filter((entry) => entry.key !== key);
    });

    const exportCsv = () => {
        // The byte order mark makes Excel read the file as UTF-8 (ç, ğ, ş…).
        downloadBlob(new Blob([`﻿${localizationToCsv(localization)}`], { type: "text/csv;charset=utf-8" }), `${safeFileName(project.name)}-languages.csv`);
    };

    const importCsv = async (file: File) => {
        if (file.size > 2 * 1024 * 1024) {
            setNotice({ tone: "warn", text: t("csvTooLarge") });
            return;
        }
        const imported = localizationFromCsv(await file.text());
        if (!imported.languages.length) {
            setNotice({ tone: "warn", text: t("csvEmpty") });
            return;
        }
        update(t("importCsv"), (settings) => {
            const merged = mergeLocalization(settings, imported);
            settings.languages = merged.languages;
            settings.entries = merged.entries;
        });
        const parts = [t("csvImported").replace("{rows}", String(imported.entries.length))];
        if (imported.skipped) parts.push(t("csvSkipped").replace("{count}", String(imported.skipped)));
        if (imported.ignoredColumns.length) parts.push(t("csvIgnored").replace("{columns}", imported.ignoredColumns.slice(0, 4).join(", ")));
        setNotice({ tone: imported.skipped || imported.ignoredColumns.length ? "warn" : "ok", text: parts.join(" ") });
    };

    const missing = useMemo(() => Object.fromEntries(languages.map((code) => [code, localization.entries.filter((entry) => !entry.values[code]).length])), [languages, localization.entries]);
    const matches = useMemo(() => {
        const needle = query.trim().toLocaleLowerCase(locale);
        if (!needle) return localization.entries;
        return localization.entries.filter((entry) => entry.key.toLocaleLowerCase(locale).includes(needle) || Object.values(entry.values).some((value) => value.toLocaleLowerCase(locale).includes(needle)));
    }, [localization.entries, query, locale]);
    const offered = COMMON_LANGUAGES.filter((code) => !languages.includes(code));

    return (
        <div className="space-y-4" data-localization-panel>
            <section className="space-y-2">
                <div className="flex items-start gap-2">
                    <Languages className="mt-0.5 h-4 w-4 shrink-0 text-indigo-300" />
                    <div className="min-w-0">
                        <p className="text-[12.5px] font-semibold text-zinc-100">{t("localizationTitle")}</p>
                        <p className="text-[11.5px] leading-snug text-zinc-500">{t("localizationHint")}</p>
                    </div>
                </div>
                {languages.length ? (
                    <ul className="flex flex-wrap gap-1.5">
                        {languages.map((code, index) => (
                            <li key={code} className={cx("flex items-center gap-1 rounded-full border py-0.5 pl-2.5 pr-1 text-[11.5px]", index === 0 ? "border-indigo-400/40 bg-indigo-500/10 text-indigo-100" : "border-white/10 bg-white/[0.03] text-zinc-200")}>
                                <span className="font-medium">{nameOf(code)}</span>
                                <span className="font-mono text-[10.5px] text-zinc-500">{code}</span>
                                {index === 0 ? (
                                    <span className="ml-0.5 inline-flex items-center gap-0.5 rounded-full px-1 text-[10px] text-indigo-300" title={t("mainLanguageHint")}><Star className="h-3 w-3" />{t("mainLanguage")}</span>
                                ) : (
                                    <button type="button" disabled={disabled} onClick={() => makeMain(code)} title={t("makeMainLanguage")} aria-label={`${t("makeMainLanguage")}: ${nameOf(code)}`} className="grid h-5 w-5 place-items-center rounded-full text-zinc-500 transition hover:bg-white/10 hover:text-indigo-200 disabled:opacity-40"><Star className="h-3 w-3" /></button>
                                )}
                                {missing[code] ? <span className="rounded-full bg-amber-500/15 px-1.5 text-[10px] text-amber-300">{missing[code]} {t("missingTranslations")}</span> : null}
                                <button type="button" disabled={disabled} onClick={() => removeLanguage(code)} title={t("removeLanguage")} aria-label={`${t("removeLanguage")}: ${nameOf(code)}`} className="grid h-5 w-5 place-items-center rounded-full text-zinc-500 transition hover:bg-rose-500/15 hover:text-rose-300 disabled:opacity-40"><X className="h-3 w-3" /></button>
                            </li>
                        ))}
                    </ul>
                ) : (
                    <p className="rounded-lg border border-dashed border-white/10 px-3 py-2.5 text-[11.5px] text-zinc-400">{t("localizationEmpty")}</p>
                )}
                {languages.length < LOCALIZATION_LIMITS.languages ? (
                    <div className="flex flex-wrap items-center gap-1.5">
                        <div className="w-44">
                            <SelectInput
                                value=""
                                disabled={disabled}
                                onChange={(value) => value && addLanguage(value)}
                                options={[{ value: "", label: `+ ${t("addLanguage")}` }, ...offered.map((code) => ({ value: code, label: `${nameOf(code)} (${code})` }))]}
                            />
                        </div>
                        <form
                            className="flex items-center gap-1"
                            onSubmit={(event) => {
                                event.preventDefault();
                                addLanguage(customCode);
                            }}
                        >
                            <input value={customCode} disabled={disabled} onChange={(event) => setCustomCode(event.target.value)} placeholder={t("languageCodePlaceholder")} aria-label={t("languageCodePlaceholder")} maxLength={12} className={cx(inputClass, "w-36 font-mono")} />
                            <Button type="submit" className="shrink-0 whitespace-nowrap" disabled={disabled || !customCode.trim()}>{t("addLanguage")}</Button>
                        </form>
                    </div>
                ) : null}
                {languages.length ? (
                    <div className="grid gap-1 sm:grid-cols-[10rem_minmax(0,1fr)] sm:items-center">
                        <span className="text-[11.5px] text-zinc-400">{t("startLanguage")}</span>
                        <div className="max-w-xs">
                            <SelectInput
                                value={localization.startLanguage}
                                disabled={disabled}
                                onChange={(value) => update(t("startLanguage"), (settings) => { settings.startLanguage = value; })}
                                options={[{ value: "auto", label: t("startLanguageAuto") }, ...languages.map((code) => ({ value: code, label: `${nameOf(code)} (${code})` }))]}
                            />
                        </div>
                        <p className="text-[11px] leading-snug text-zinc-500 sm:col-start-2">{t("startLanguageHint")}</p>
                    </div>
                ) : null}
            </section>

            {languages.length ? (
                <section className="space-y-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                        <p className="mr-auto text-[12.5px] font-semibold text-zinc-100">
                            {t("stringTable")} <span className="font-normal text-zinc-500">· {t("entriesCount").replace("{count}", String(localization.entries.length))}</span>
                        </p>
                        <IconButton icon={Download} label={t("exportCsv")} onClick={exportCsv} disabled={!localization.entries.length} />
                        <IconButton icon={Upload} label={t("importCsv")} onClick={() => fileRef.current?.click()} disabled={disabled} />
                        <input
                            ref={fileRef}
                            type="file"
                            accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values"
                            className="hidden"
                            onChange={(event) => {
                                const file = event.target.files?.[0];
                                event.target.value = "";
                                if (file) void importCsv(file);
                            }}
                        />
                        <Button variant="primary" disabled={disabled || localization.entries.length >= LOCALIZATION_LIMITS.entries} onClick={addKey}><Plus className="h-3.5 w-3.5" />{t("addTextKey")}</Button>
                    </div>
                    <label className="relative block">
                        <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
                        <input value={query} onChange={(event) => { setQuery(event.target.value); setLimit(PAGE_SIZE); }} placeholder={t("searchKeys")} aria-label={t("searchKeys")} className={cx(inputClass, "pl-7")} />
                    </label>
                    {notice ? (
                        <p role="status" className={cx("flex items-start gap-1.5 rounded-md px-2 py-1.5 text-[11.5px] leading-snug", notice.tone === "ok" ? "bg-emerald-500/10 text-emerald-200" : "bg-amber-500/10 text-amber-200")}>
                            {notice.tone === "warn" ? <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> : null}
                            {notice.text}
                        </p>
                    ) : null}
                    {localization.entries.length ? (
                        <div className="max-h-[52vh] overflow-auto rounded-lg border border-white/[0.07]">
                            <table className="w-full border-collapse text-left text-[12px]">
                                <thead className="sticky top-0 z-10 bg-zinc-900">
                                    <tr>
                                        <th scope="col" className="sticky left-0 z-10 min-w-[9rem] bg-zinc-900 px-2 py-1.5 text-[10.5px] font-bold uppercase tracking-wider text-zinc-500">{t("keyColumn")}</th>
                                        {languages.map((code) => (
                                            <th key={code} scope="col" className="min-w-[11rem] px-2 py-1.5 text-[10.5px] font-bold uppercase tracking-wider text-zinc-500">
                                                {nameOf(code)} <span className="font-mono normal-case text-zinc-600">{code}</span>
                                            </th>
                                        ))}
                                        <th scope="col" className="w-8"><span className="sr-only">{t("deleteKey")}</span></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {matches.slice(0, limit).map((entry) => (
                                        <tr key={entry.key} className="border-t border-white/[0.05] align-top">
                                            <td className="sticky left-0 bg-zinc-950 p-1">
                                                <TextInput value={entry.key} maxLength={LOCALIZATION_LIMITS.keyLength} disabled={disabled} onChange={(value) => renameKey(entry.key, value)} className="font-mono" />
                                            </td>
                                            {languages.map((code, index) => (
                                                <td key={code} className="p-1">
                                                    <CellInput
                                                        value={entry.values[code] ?? ""}
                                                        placeholder={index > 0 ? entry.values[languages[0]] : undefined}
                                                        missing={!entry.values[code]}
                                                        disabled={disabled}
                                                        onChange={(value) => setValue(entry.key, code, value)}
                                                    />
                                                </td>
                                            ))}
                                            <td className="p-1">
                                                <IconButton icon={Trash2} label={t("deleteKey")} size="sm" tone="danger" disabled={disabled} onClick={() => removeKey(entry.key)} />
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            {!matches.length ? <p className="px-3 py-3 text-[11.5px] text-zinc-500">{t("noMatches")}</p> : null}
                            {matches.length > limit ? (
                                <div className="border-t border-white/[0.05] p-1.5 text-center">
                                    <Button onClick={() => setLimit((value) => value + PAGE_SIZE)}>{t("showMore")} ({matches.length - limit})</Button>
                                </div>
                            ) : null}
                        </div>
                    ) : (
                        <p className="rounded-lg border border-dashed border-white/10 px-3 py-2.5 text-[11.5px] text-zinc-400">{t("stringTableEmpty")}</p>
                    )}
                    <p className="text-[11px] leading-snug text-zinc-500">{t("csvHint")}</p>
                </section>
            ) : null}
        </div>
    );
}

/**
 * The "Localization key" row of the UI Text, Button, Toggle and Input Field
 * inspectors: picks a key of the string table and previews its text.
 */
export function LocalizationKeyField({ value, text, disabled, onChange }: {
    value: string;
    /** The element's own text (offered as the first translation when the key is new). */
    text: string;
    disabled: boolean;
    /** The new key, and the text the element should show in the editor (null: keep its own). */
    onChange: (key: string, preview: string | null) => void;
}) {
    const { store, t } = useEditor();
    const { locale } = useI18n();
    const localization = useEditorState(store, (state) => state.project.settings.localization);
    const listId = useId();
    const main = localization.languages[0] ?? null;
    const entry = value ? localization.entries.find((item) => item.key === value) ?? null : null;
    const preview = entry && main ? entry.values[main] ?? "" : null;
    const missingIn = entry ? localization.languages.filter((code) => !entry.values[code]).map((code) => languageName(code, locale)) : [];

    const choose = (raw: string) => {
        const key = cleanLocalizationKey(raw);
        const found = key ? localization.entries.find((item) => item.key === key) : null;
        onChange(key, found && main && found.values[main] ? found.values[main] : null);
    };

    const addToTable = () => {
        if (!value || entry) return;
        store.update(t("addKeyToTable"), (draft) => {
            const settings = draft.settings.localization;
            if (settings.entries.some((item) => item.key === value) || settings.entries.length >= LOCALIZATION_LIMITS.entries) return;
            const first = settings.languages[0];
            settings.entries.push({ key: value, values: first && text ? { [first]: text.slice(0, LOCALIZATION_LIMITS.valueLength) } : {} });
            touch(draft);
        });
    };

    return (
        <div className="space-y-1">
            <TextInput value={value} list={listId} placeholder={t("localizationKeyPlaceholder")} maxLength={LOCALIZATION_LIMITS.keyLength} disabled={disabled} onChange={choose} className="font-mono" />
            <datalist id={listId}>
                {localization.entries.slice(0, 500).map((item) => <option key={item.key} value={item.key}>{main ? item.values[main] ?? "" : ""}</option>)}
            </datalist>
            {value ? (
                entry ? (
                    <p className="truncate text-[11px] text-zinc-500" title={preview ?? ""}>
                        {main ? <span className="mr-1 font-mono text-zinc-600">{main}</span> : null}
                        {preview || <span className="italic">{t("noTranslationYet")}</span>}
                    </p>
                ) : (
                    <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                        <span className="inline-flex items-center gap-1 text-amber-300"><AlertTriangle className="h-3 w-3" />{t("localizationKeyMissing")}</span>
                        {localization.languages.length ? (
                            <button type="button" disabled={disabled} onClick={addToTable} className="rounded px-1.5 py-0.5 text-indigo-300 underline-offset-2 hover:underline disabled:opacity-40">{t("addKeyToTable")}</button>
                        ) : (
                            <button type="button" onClick={() => window.dispatchEvent(new CustomEvent(OPEN_LOCALIZATION_EVENT))} className="rounded px-1.5 py-0.5 text-indigo-300 underline-offset-2 hover:underline">{t("openLanguages")}</button>
                        )}
                    </div>
                )
            ) : localization.languages.length ? null : (
                <p className="text-[11px] leading-snug text-zinc-600">{t("localizationKeyHint")} <button type="button" onClick={() => window.dispatchEvent(new CustomEvent(OPEN_LOCALIZATION_EVENT))} className="text-indigo-300 underline-offset-2 hover:underline">{t("openLanguages")}</button></p>
            )}
            {missingIn.length ? <p className="text-[10.5px] text-amber-300/80">{t("missingIn")}: {missingIn.join(", ")}</p> : null}
        </div>
    );
}
