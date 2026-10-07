"use client";

import { GitCompareArrows, RotateCcw } from "lucide-react";
import { useEffect, useRef } from "react";
import Modal, { buttonClasses } from "@/components/Editor/Modal";
import { fontStack, useEditorSettings } from "@/lib/editor-settings";
import { monacoLanguageOf } from "@/lib/editor/models";
import { useI18n, type Copy } from "@/lib/i18n";
import type { MonacoApi } from "@/lib/monaco";
import { fileExtensionFor } from "@/lib/runtimes/languages";

const C = {
    title: { TR: "{name}: {time} ile şimdiki hâli", EN: "{name}: {time} vs now" },
    description: { TR: "Solda anlık görüntü, sağda dosyanın şimdiki hâli. Geri yüklemek tek bir değişiklik olarak eklenir; editörde geri alınabilir.", EN: "The snapshot on the left, the file as it is now on the right. A restore is a single change you can undo in the editor." },
    restore: { TR: "Bu sürümü geri yükle", EN: "Restore this version" },
    close: { TR: "Kapat", EN: "Close" },
    diffLabel: { TR: "Anlık görüntü ile şimdiki hâlin farkları", EN: "Differences between the snapshot and the current file" },
} satisfies Record<string, Copy>;

let diffSequence = 0;

export interface HistoryDiff {
    name: string;
    lang: string;
    /** The snapshot's text. */
    original: string;
    /** The file's text now. */
    modified: string;
    /** When the snapshot was taken (already formatted). */
    time: string;
}

/** A read-only Monaco diff of a local history snapshot against the open file. */
export default function HistoryDiffDialog({ diff, monaco, onClose, onRestore }: { diff: HistoryDiff | null; monaco: MonacoApi | null; onClose: () => void; onRestore: () => void }) {
    const { tx } = useI18n();
    const settings = useEditorSettings();
    const containerRef = useRef<HTMLDivElement>(null);
    const restoreRef = useRef<HTMLButtonElement>(null);
    const fontFamily = fontStack(settings.fontFamily);
    const fontSize = settings.fontSize;

    useEffect(() => {
        const container = containerRef.current;
        if (!diff || !monaco || !container) return;
        diffSequence += 1;
        const extension = fileExtensionFor(diff.lang).toLowerCase().replace(/[^a-z0-9_-]/g, "") || "txt";
        const language = monacoLanguageOf(diff.lang);
        // Separate URIs: the tab's own model must not be touched (and markers of these stay out of the Problems panel).
        const original = monaco.editor.createModel(diff.original, language, monaco.Uri.parse(`inmemory://hanogt-history/${diffSequence}/snapshot.${extension}`));
        const modified = monaco.editor.createModel(diff.modified, language, monaco.Uri.parse(`inmemory://hanogt-history/${diffSequence}/current.${extension}`));
        const editor = monaco.editor.createDiffEditor(container, {
            readOnly: true,
            originalEditable: false,
            automaticLayout: true,
            renderSideBySide: true,
            useInlineViewWhenSpaceIsLimited: true,
            renderOverviewRuler: false,
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            fontFamily,
            fontSize,
            ariaLabel: tx(C.diffLabel),
        });
        editor.setModel({ original, modified });
        return () => {
            editor.dispose();
            original.dispose();
            modified.dispose();
        };
    }, [diff, monaco, fontFamily, fontSize, tx]);

    return (
        <Modal
            open={Boolean(diff)}
            onClose={onClose}
            size="xl"
            icon={<GitCompareArrows className="h-5 w-5" aria-hidden />}
            title={diff ? tx(C.title, { name: diff.name, time: diff.time }) : ""}
            description={tx(C.description)}
            initialFocus={restoreRef}
            bodyClassName="p-0"
            footer={(
                <>
                    <button type="button" className={buttonClasses.secondary} onClick={onClose}>{tx(C.close)}</button>
                    <button ref={restoreRef} type="button" className="inline-flex items-center justify-center gap-2 rounded-2xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-zinc-900" onClick={onRestore} data-history-diff-restore>
                        <RotateCcw className="h-4 w-4" aria-hidden />
                        {tx(C.restore)}
                    </button>
                </>
            )}
        >
            <div ref={containerRef} dir="ltr" className="h-[min(56dvh,600px)] w-full" data-history-diff />
        </Modal>
    );
}
