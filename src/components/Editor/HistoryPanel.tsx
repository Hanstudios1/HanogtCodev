"use client";

import { Camera, Eraser, GitCompareArrows, History, LoaderCircle, RotateCcw, ShieldCheck, Trash2 } from "lucide-react";
import { useEffect, useId, useMemo, useState } from "react";
import LanguageIcon from "@/components/Editor/LanguageIcon";
import type { ConfirmOptions } from "@/components/Editor/Modal";
import type { LocalHistoryStatus } from "@/components/Editor/useLocalHistory";
import type { LocalHistory, SnapshotMeta, SnapshotReason } from "@/lib/editor/local-history";
import { useI18n, type Copy } from "@/lib/i18n";

const C = {
    title: { TR: "Geçmiş", EN: "History" },
    file: { TR: "Dosya", EN: "File" },
    snapshotNow: { TR: "Şimdi anlık görüntü al", EN: "Take a snapshot now" },
    clearFile: { TR: "Bu dosyanın geçmişini sil", EN: "Clear this file's history" },
    clearAll: { TR: "Tüm yerel geçmişi sil", EN: "Clear all local history" },
    compare: { TR: "Karşılaştır", EN: "Compare" },
    compareLabel: { TR: "{time} tarihli anlık görüntüyü şimdiki hâliyle karşılaştır", EN: "Compare the snapshot from {time} with the current file" },
    restore: { TR: "Geri yükle", EN: "Restore" },
    restoreLabel: { TR: "{time} tarihli anlık görüntüyü geri yükle", EN: "Restore the snapshot from {time}" },
    remove: { TR: "{time} tarihli anlık görüntüyü sil", EN: "Delete the snapshot from {time}" },
    list: { TR: "{name} için anlık görüntüler", EN: "Snapshots of {name}" },
    empty: { TR: "{name} için henüz anlık görüntü yok.", EN: "There are no snapshots of {name} yet." },
    howItWorks: { TR: "Kaydettiğinizde, çalıştırdığınızda ve düzenlerken 3 dakikada bir, değişen dosyaların anlık görüntüsü alınır (dosya başına en fazla 30).", EN: "Changed files get a snapshot when you save, when you run and every 3 minutes while you edit (up to 30 per file)." },
    local: { TR: "Yalnızca bu tarayıcıda saklanır, hiçbir sunucuya gönderilmez.", EN: "Kept only in this browser; never sent to a server." },
    off: { TR: "Yerel geçmiş kapalı; yeni anlık görüntü alınmıyor.", EN: "Local history is off; no new snapshots are taken." },
    turnOn: { TR: "Aç", EN: "Turn on" },
    unavailable: { TR: "Bu tarayıcıda yerel geçmiş kullanılamıyor (tarayıcı depolaması engellenmiş olabilir).", EN: "Local history isn't available in this browser (browser storage may be blocked)." },
    loading: { TR: "Yükleniyor…", EN: "Loading…" },
    noFiles: { TR: "Açık dosya yok.", EN: "No open files." },
    clearFileTitle: { TR: "Dosyanın geçmişi silinsin mi?", EN: "Clear the file's history?" },
    clearFileMessage: { TR: "{name} için bu tarayıcıdaki tüm anlık görüntüler silinecek. Dosyanın kendisi değişmez.", EN: "Every snapshot of {name} in this browser will be deleted. The file itself doesn't change." },
    clearAllTitle: { TR: "Tüm yerel geçmiş silinsin mi?", EN: "Clear all local history?" },
    clearAllMessage: { TR: "Bu tarayıcıdaki tüm projelerin ve dosyaların anlık görüntüleri silinecek. Açık dosyalarınız değişmez.", EN: "The snapshots of every project and file in this browser will be deleted. Your open files don't change." },
    clear: { TR: "Sil", EN: "Delete" },
    bytes: { TR: "{value} B", EN: "{value} B" },
    kilobytes: { TR: "{value} KB", EN: "{value} KB" },
    megabytes: { TR: "{value} MB", EN: "{value} MB" },
} satisfies Record<string, Copy>;

/** The panel's name (its tab in the output panel). */
export const HISTORY_TITLE: Copy = C.title;

export const SNAPSHOT_REASONS: Record<SnapshotReason, Copy> = {
    save: { TR: "Kayıt", EN: "Save" },
    run: { TR: "Çalıştırma", EN: "Run" },
    auto: { TR: "Otomatik", EN: "Automatic" },
    manual: { TR: "El ile", EN: "Manual" },
    restore: { TR: "Geri yüklemeden önce", EN: "Before a restore" },
};

const REASON_TONES: Record<SnapshotReason, string> = {
    save: "bg-indigo-500/10 text-indigo-700 dark:text-indigo-300",
    run: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    auto: "bg-zinc-500/10 text-zinc-600 dark:text-zinc-300",
    manual: "bg-sky-500/10 text-sky-700 dark:text-sky-300",
    restore: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
};

/** "1,2 KB" in the reader's locale. */
export function useSizeFormatter() {
    const { tx, locale } = useI18n();
    return (bytes: number) => {
        const format = (value: number, digits: number) => new Intl.NumberFormat(locale, { maximumFractionDigits: digits }).format(value);
        if (bytes < 1024) return tx(C.bytes, { value: format(bytes, 0) });
        if (bytes < 1024 * 1024) return tx(C.kilobytes, { value: format(bytes / 1024, 1) });
        return tx(C.megabytes, { value: format(bytes / (1024 * 1024), 1) });
    };
}

/** "3 minutes ago", "yesterday"… */
export function relativeTime(at: number, now: number, locale: string): string {
    const seconds = Math.round((at - now) / 1000);
    const format = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
    const abs = Math.abs(seconds);
    if (abs < 45) return format.format(0, "second");
    if (abs < 45 * 60) return format.format(Math.round(seconds / 60), "minute");
    if (abs < 22 * 3600) return format.format(Math.round(seconds / 3600), "hour");
    return format.format(Math.round(seconds / 86400), "day");
}

interface HistoryPanelProps {
    tabs: ReadonlyArray<{ id: string; name: string; lang: string }>;
    activeTabId: string;
    store: LocalHistory | null;
    status: LocalHistoryStatus;
    /** Changes when snapshots were added or removed. */
    version: number;
    /** The "localHistory" setting. */
    enabled: boolean;
    keyFor: (name: string) => string;
    onCompare: (meta: SnapshotMeta) => void;
    onRestore: (meta: SnapshotMeta) => void;
    onSnapshotNow: (tabId: string) => void;
    onEnable: () => void;
    /** Snapshots were deleted here. */
    onChanged: () => void;
    confirm: (options: ConfirmOptions) => Promise<boolean>;
}

/** The local snapshots of one open file: compare with the current text, restore or delete them. */
export default function HistoryPanel({ tabs, activeTabId, store, status, version, enabled, keyFor, onCompare, onRestore, onSnapshotNow, onEnable, onChanged, confirm }: HistoryPanelProps) {
    const { tx, locale } = useI18n();
    const formatSize = useSizeFormatter();
    const selectId = useId();
    // The panel follows the editor's file; picking another one lasts until the editor switches files.
    const [picked, setPicked] = useState<{ tabId: string; whileActive: string } | null>(null);
    const selectedId = picked && picked.whileActive === activeTabId && tabs.some((tab) => tab.id === picked.tabId) ? picked.tabId : activeTabId;
    const selected = tabs.find((tab) => tab.id === selectedId) ?? tabs[0];
    const fileKey = selected ? keyFor(selected.name) : "";
    const [loaded, setLoaded] = useState<{ key: string; version: number; items: SnapshotMeta[] } | null>(null);
    const [now, setNow] = useState(() => Date.now());

    useEffect(() => {
        if (!store || !fileKey) return;
        let alive = true;
        store.list(fileKey).then((items) => {
            if (!alive) return;
            setLoaded({ key: fileKey, version, items });
            setNow(Date.now());
        }, () => undefined);
        return () => {
            alive = false;
        };
    }, [store, fileKey, version]);

    // Relative times stay fresh while the panel is open.
    useEffect(() => {
        const timer = window.setInterval(() => setNow(Date.now()), 30_000);
        return () => window.clearInterval(timer);
    }, []);

    const items = loaded?.key === fileKey ? loaded.items : null;
    const absolute = useMemo(() => new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "medium" }), [locale]);
    const iconButton = "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-2 text-xs font-semibold text-zinc-600 transition hover:bg-zinc-100 hover:text-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-40 dark:text-zinc-300 dark:hover:bg-white/10 dark:hover:text-white";

    const clearFile = async () => {
        if (!store || !selected) return;
        const accepted = await confirm({ title: tx(C.clearFileTitle), message: tx(C.clearFileMessage, { name: selected.name }), confirmLabel: tx(C.clear), destructive: true });
        if (!accepted) return;
        await store.clearFile(fileKey).catch(() => undefined);
        onChanged();
    };
    const clearAll = async () => {
        if (!store) return;
        const accepted = await confirm({ title: tx(C.clearAllTitle), message: tx(C.clearAllMessage), confirmLabel: tx(C.clear), destructive: true });
        if (!accepted) return;
        await store.clearAll().catch(() => undefined);
        onChanged();
    };
    const remove = async (meta: SnapshotMeta) => {
        if (!store) return;
        await store.remove(meta.id).catch(() => undefined);
        onChanged();
    };

    return (
        <div className="flex h-full min-h-0 flex-col bg-white text-sm dark:bg-zinc-950" data-history-panel>
            <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-zinc-200 p-2 dark:border-white/10">
                <label htmlFor={selectId} className="sr-only">{tx(C.file)}</label>
                <div className="relative flex min-w-0 flex-1 items-center">
                    {selected && <span className="pointer-events-none absolute start-2.5"><LanguageIcon language={selected.lang} size={14} /></span>}
                    <select
                        id={selectId}
                        value={selected?.id ?? ""}
                        onChange={(event) => setPicked({ tabId: event.target.value, whileActive: activeTabId })}
                        disabled={!tabs.length}
                        data-history-file
                        className="h-8 w-full min-w-0 rounded-lg border border-zinc-200 bg-zinc-50 pe-2 ps-8 text-sm text-zinc-800 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-100"
                    >
                        {tabs.map((tab) => <option key={tab.id} value={tab.id}>{tab.name}</option>)}
                    </select>
                </div>
                <button type="button" onClick={() => selected && onSnapshotNow(selected.id)} disabled={!store || !selected} className={iconButton} title={tx(C.snapshotNow)} aria-label={tx(C.snapshotNow)} data-history-snapshot>
                    <Camera className="h-4 w-4" aria-hidden />
                </button>
                <button type="button" onClick={() => void clearFile()} disabled={!store || !items?.length} className={iconButton} title={tx(C.clearFile)} aria-label={tx(C.clearFile)} data-history-clear-file>
                    <Eraser className="h-4 w-4" aria-hidden />
                </button>
                <button type="button" onClick={() => void clearAll()} disabled={!store} className={`${iconButton} text-red-600 hover:bg-red-500/10 hover:text-red-700 dark:text-red-400 dark:hover:bg-red-500/10 dark:hover:text-red-300`} title={tx(C.clearAll)} aria-label={tx(C.clearAll)} data-history-clear-all>
                    <Trash2 className="h-4 w-4" aria-hidden />
                </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-2">
                {status === "unavailable" ? (
                    <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs leading-5 text-amber-800 dark:text-amber-200" role="status">{tx(C.unavailable)}</p>
                ) : (
                    <>
                        {!enabled && (
                            <div className="mb-2 flex flex-wrap items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-200" role="status" data-history-off>
                                <span className="min-w-0 flex-1">{tx(C.off)}</span>
                                <button type="button" onClick={onEnable} className="rounded-lg bg-amber-600 px-2.5 py-1 font-semibold text-white transition hover:bg-amber-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500">{tx(C.turnOn)}</button>
                            </div>
                        )}
                        {!selected ? (
                            <p className="px-2 py-8 text-center text-zinc-500 dark:text-zinc-400">{tx(C.noFiles)}</p>
                        ) : status === "opening" || !items ? (
                            <p className="flex items-center justify-center gap-2 px-2 py-8 text-zinc-500 dark:text-zinc-400" role="status"><LoaderCircle className="h-4 w-4 animate-spin" aria-hidden />{tx(C.loading)}</p>
                        ) : items.length === 0 ? (
                            <div className="flex flex-col items-center justify-center gap-2 px-4 py-8 text-center">
                                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-zinc-100 text-zinc-500 dark:bg-white/5 dark:text-zinc-400"><History className="h-6 w-6" aria-hidden /></span>
                                <p className="font-medium text-zinc-700 dark:text-zinc-200">{tx(C.empty, { name: selected.name })}</p>
                                <p className="max-w-xs text-xs leading-5 text-zinc-500 dark:text-zinc-400">{tx(C.howItWorks)}</p>
                            </div>
                        ) : (
                            <ol aria-label={tx(C.list, { name: selected.name })} className="space-y-1">
                                {items.map((meta) => {
                                    const when = absolute.format(meta.at);
                                    return (
                                        <li key={meta.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border border-zinc-200 px-2.5 py-2 dark:border-white/10" data-history-item>
                                            <div className="min-w-0 flex-1">
                                                <p className="truncate text-sm font-medium text-zinc-800 first-letter:uppercase dark:text-zinc-100">
                                                    <time dateTime={new Date(meta.at).toISOString()} title={when}>{relativeTime(meta.at, now, locale)}</time>
                                                </p>
                                                <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-zinc-500 dark:text-zinc-400">
                                                    <span className={`rounded-full px-1.5 py-px font-semibold ${REASON_TONES[meta.reason]}`}>{tx(SNAPSHOT_REASONS[meta.reason])}</span>
                                                    <span className="tabular-nums">{formatSize(meta.size)}</span>
                                                    <span className="hidden truncate sm:inline">{when}</span>
                                                </p>
                                            </div>
                                            <div className="flex shrink-0 items-center gap-0.5">
                                                <button type="button" onClick={() => onCompare(meta)} className={iconButton} aria-label={tx(C.compareLabel, { time: when })} title={tx(C.compareLabel, { time: when })} data-history-compare>
                                                    <GitCompareArrows className="h-4 w-4" aria-hidden />
                                                    <span className="hidden min-[420px]:inline">{tx(C.compare)}</span>
                                                </button>
                                                <button type="button" onClick={() => onRestore(meta)} className={iconButton} aria-label={tx(C.restoreLabel, { time: when })} title={tx(C.restoreLabel, { time: when })} data-history-restore>
                                                    <RotateCcw className="h-4 w-4" aria-hidden />
                                                    <span className="hidden min-[420px]:inline">{tx(C.restore)}</span>
                                                </button>
                                                <button type="button" onClick={() => void remove(meta)} className={`${iconButton} px-1.5 text-zinc-400 hover:text-red-600 dark:hover:text-red-400`} aria-label={tx(C.remove, { time: when })} title={tx(C.remove, { time: when })} data-history-delete>
                                                    <Trash2 className="h-3.5 w-3.5" aria-hidden />
                                                </button>
                                            </div>
                                        </li>
                                    );
                                })}
                            </ol>
                        )}
                        <p className="mt-3 flex items-start gap-1.5 px-1 text-[11px] leading-5 text-zinc-500 dark:text-zinc-400">
                            <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" aria-hidden />
                            {tx(C.local)}
                        </p>
                    </>
                )}
            </div>
        </div>
    );
}
