"use client";

import { AlertTriangle, CheckCircle2, Code2, Download, FilePlus2, RefreshCw, Save } from "lucide-react";
import { useEffect, type ReactNode } from "react";
import CodeEditor from "@/components/Editor/CodeEditor";
import { useI18n, type Copy } from "@/lib/i18n";
import { GROUP_LIMITS } from "@/lib/groups";
import { Spinner, cx, relativeTime } from "../ui";
import { useWorkspace } from "./context";
import { FileBadge, languageName } from "./FilesPanel";
import type { GroupFileItem, MonacoEditor, SaveState } from "./model";

const C = {
    saving: { TR: "Kaydediliyor…", EN: "Saving…" },
    saved: { TR: "Kaydedildi", EN: "Saved" },
    live: { TR: "Canlı senkron", EN: "Live sync" },
    saveError: { TR: "Kaydedilemedi · tekrar dene", EN: "Not saved · retry" },
    lastEdit: { TR: "Son düzenleyen: {name} · {time}", EN: "Last edited by {name} · {time}" },
    unknownMember: { TR: "eski bir üye", EN: "a former member" },
    download: { TR: "Bu dosyayı indir", EN: "Download this file" },
    openInEditor: { TR: "Düzenleyici'de aç (kopya)", EN: "Open a copy in the Editor" },
    chars: { TR: "{count} karakter", EN: "{count} characters" },
    nearLimit: { TR: "Dosya boyut sınırına yaklaşıyor ({count}/{max})", EN: "The file is close to the size limit ({count}/{max})" },
    emptyTitle: { TR: "Açık dosya yok", EN: "No file open" },
    emptyText: { TR: "Soldan bir dosya seç ya da yeni bir dosya oluştur.", EN: "Pick a file from the list or create a new one." },
    newFile: { TR: "Yeni dosya", EN: "New file" },
    loading: { TR: "Dosyalar yükleniyor", EN: "Loading files" },
} satisfies Record<string, Copy>;

export function SaveIndicator({ state, onRetry, compact = false }: { state: SaveState; onRetry: () => void; compact?: boolean }) {
    const { tx } = useI18n();
    if (state === "error") {
        return (
            <button type="button" onClick={onRetry} className="inline-flex items-center gap-1.5 rounded-full bg-red-500/10 px-2.5 py-1 text-xs font-bold text-red-700 transition hover:bg-red-500/20 dark:text-red-300">
                <RefreshCw className="h-3.5 w-3.5" aria-hidden />{compact ? <span className="sr-only">{tx(C.saveError)}</span> : tx(C.saveError)}
            </button>
        );
    }
    const saving = state === "saving";
    return (
        <span className={cx("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold", saving ? "bg-amber-500/10 text-amber-700 dark:text-amber-300" : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300")} role="status">
            {saving ? <Save className="h-3.5 w-3.5 animate-pulse" aria-hidden /> : <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />}
            {compact ? <span className="sr-only">{tx(saving ? C.saving : state === "saved" ? C.saved : C.live)}</span> : tx(saving ? C.saving : state === "saved" ? C.saved : C.live)}
        </span>
    );
}

function EditorSurface({ groupId, file, onChange, bindEditor }: { groupId: string; file: GroupFileItem; onChange: (fileId: string, code: string) => void; bindEditor: (editor: MonacoEditor | null) => void }) {
    useEffect(() => () => bindEditor(null), [bindEditor]);
    return (
        <CodeEditor
            language={file.lang}
            value={file.code}
            path={`group-${groupId}/${file.id}`}
            onChange={(value) => onChange(file.id, value ?? "")}
            onMount={(editor) => bindEditor(editor)}
        />
    );
}

type EditorPaneProps = {
    file: GroupFileItem | null;
    loaded: boolean;
    saveState: SaveState;
    onChange: (fileId: string, code: string) => void;
    bindEditor: (editor: MonacoEditor | null) => void;
    setMountedFile: (fileId: string) => void;
    onRetrySave: () => void;
    onDownload: (file: GroupFileItem) => void;
    onOpenInEditor: (files: GroupFileItem[]) => void;
    onNewFile: () => void;
    top?: ReactNode;
};

export default function EditorPane({ file, loaded, saveState, onChange, bindEditor, setMountedFile, onRetrySave, onDownload, onOpenInEditor, onNewFile, top }: EditorPaneProps) {
    const { tx, locale } = useI18n();
    const { groupId, memberByEmail, me, now } = useWorkspace();
    const fileId = file?.id ?? "";
    useEffect(() => {
        setMountedFile(fileId);
    }, [fileId, setMountedFile]);

    const editor = file?.updatedBy ? memberByEmail.get(file.updatedBy) : undefined;
    const editorName = file?.updatedBy === me.email ? me.username : editor?.username ?? tx(C.unknownMember);
    const length = file?.code.length ?? 0;
    const nearLimit = length > GROUP_LIMITS.fileContentMax * 0.9;
    const numberFormat = (value: number) => {
        try {
            return new Intl.NumberFormat(locale).format(value);
        } catch {
            return String(value);
        }
    };

    return (
        <div className="flex h-full min-h-0 w-full flex-col gap-2 p-2">
            {top}
            {file ? (
                <>
                    <div className="flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 dark:border-white/10 dark:bg-zinc-900">
                        <FileBadge lang={file.lang} />
                        <span className="min-w-0 truncate text-sm font-semibold" title={file.name}>{file.name}</span>
                        <span className="hidden text-xs text-zinc-400 sm:inline">{languageName(file.lang)}</span>
                        <span className="ms-auto flex items-center gap-1">
                            <SaveIndicator state={saveState} onRetry={onRetrySave} compact />
                            <button type="button" onClick={() => onOpenInEditor([file])} className="rounded-lg p-1.5 text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-white" title={tx(C.openInEditor)} aria-label={tx(C.openInEditor)}><Code2 className="h-4 w-4" aria-hidden /></button>
                            <button type="button" onClick={() => onDownload(file)} className="rounded-lg p-1.5 text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-white" title={tx(C.download)} aria-label={tx(C.download)}><Download className="h-4 w-4" aria-hidden /></button>
                        </span>
                    </div>
                    <div className="min-h-0 flex-1">
                        <EditorSurface groupId={groupId} file={file} onChange={onChange} bindEditor={bindEditor} />
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-1.5 text-[11px] text-zinc-500 dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-400">
                        <span className="truncate">{file.updatedAt ? tx(C.lastEdit, { name: editorName, time: relativeTime(file.updatedAt, now, locale) }) : "—"}</span>
                        <span className={cx("flex items-center gap-1 tabular-nums", nearLimit && "font-bold text-amber-600 dark:text-amber-400")}>
                            {nearLimit && <AlertTriangle className="h-3.5 w-3.5" aria-hidden />}
                            {nearLimit ? tx(C.nearLimit, { count: numberFormat(length), max: numberFormat(GROUP_LIMITS.fileContentMax) }) : tx(C.chars, { count: numberFormat(length) })}
                        </span>
                    </div>
                </>
            ) : (
                <div className="flex flex-1 flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-300 bg-white/60 p-8 text-center dark:border-zinc-700 dark:bg-zinc-900/40">
                    {!loaded ? (
                        <span aria-label={tx(C.loading)}><Spinner className="h-6 w-6 text-indigo-500" /></span>
                    ) : (
                        <>
                            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-300"><Code2 className="h-7 w-7" aria-hidden /></span>
                            <p className="mt-4 font-bold">{tx(C.emptyTitle)}</p>
                            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{tx(C.emptyText)}</p>
                            <button type="button" onClick={onNewFile} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-indigo-500"><FilePlus2 className="h-4 w-4" aria-hidden />{tx(C.newFile)}</button>
                        </>
                    )}
                </div>
            )}
        </div>
    );
}
