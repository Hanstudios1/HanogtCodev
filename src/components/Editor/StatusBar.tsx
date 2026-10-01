"use client";

import { AlertTriangle, CheckCircle2, CircleDot, Cpu, Eye, FileCode2, LoaderCircle, Server, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import type { editor } from "monaco-editor";
import LanguageIcon from "@/components/Editor/LanguageIcon";
import { useI18n, type Copy } from "@/lib/i18n";
import type { MonacoApi } from "@/lib/monaco";
import { ENGINE_LABELS, getLanguage, type LanguageEngine } from "@/lib/runtimes/languages";

export type SaveState = "saved" | "unsaved" | "saving" | "error";

interface StatusBarProps {
    editor: editor.IStandaloneCodeEditor | null;
    monaco: MonacoApi | null;
    language: string;
    engine: LanguageEngine;
    onLanguageClick: () => void;
    saveState: SaveState;
    /** A short note about automatic saving, e.g. "Auto save: after 2 s". */
    autoSaveNote?: string | null;
}

type CursorInfo = { line: number; column: number; selected: number; selections: number };
type ModelInfo = { tabSize: number; insertSpaces: boolean; eol: "LF" | "CRLF"; errors: number; warnings: number };

const C = {
    position: { TR: "Sat {line}, Süt {column}", EN: "Ln {line}, Col {column}" },
    selected: { TR: "({count} seçili)", EN: "({count} selected)" },
    cursors: { TR: "{count} imleç", EN: "{count} cursors" },
    spaces: { TR: "Boşluk: {size}", EN: "Spaces: {size}" },
    tabs: { TR: "Sekme: {size}", EN: "Tab size: {size}" },
    goToLine: { TR: "Satıra git", EN: "Go to line" },
    indentation: { TR: "Girintiyi değiştir", EN: "Change indentation" },
    eol: { TR: "Satır sonunu değiştir (LF/CRLF)", EN: "Change line endings (LF/CRLF)" },
    encoding: { TR: "Kodlama", EN: "Encoding" },
    language: { TR: "Dil modunu değiştir", EN: "Change language mode" },
    problems: { TR: "Sorunlar: {errors} hata, {warnings} uyarı", EN: "Problems: {errors} errors, {warnings} warnings" },
    saved: { TR: "Kaydedildi", EN: "Saved" },
    unsaved: { TR: "Kaydedilmedi", EN: "Unsaved" },
    saving: { TR: "Kaydediliyor…", EN: "Saving…" },
    saveError: { TR: "Kaydedilemedi", EN: "Not saved" },
    status: { TR: "Durum çubuğu", EN: "Status bar" },
} satisfies Record<string, Copy>;

const ENGINE_ICONS: Record<LanguageEngine, typeof Cpu> = { browser: Cpu, server: Server, preview: Eye, none: FileCode2 };
const ENGINE_TONES: Record<LanguageEngine, string> = {
    browser: "text-emerald-700 dark:text-emerald-300",
    server: "text-indigo-700 dark:text-indigo-300",
    preview: "text-sky-700 dark:text-sky-300",
    none: "text-zinc-500 dark:text-zinc-400",
};

const item = "flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 transition hover:bg-zinc-200/70 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-indigo-500 dark:hover:bg-white/10";

export default function StatusBar({ editor: instance, monaco, language, engine, onLanguageClick, saveState, autoSaveNote }: StatusBarProps) {
    const { tx, locale } = useI18n();
    const [cursor, setCursor] = useState<CursorInfo>({ line: 1, column: 1, selected: 0, selections: 1 });
    const [model, setModel] = useState<ModelInfo>({ tabSize: 4, insertSpaces: true, eol: "LF", errors: 0, warnings: 0 });

    useEffect(() => {
        if (!instance || !monaco) return;
        let frame = 0;
        const readCursor = () => {
            window.cancelAnimationFrame(frame);
            frame = window.requestAnimationFrame(() => {
                const position = instance.getPosition();
                const selections = instance.getSelections() ?? [];
                const current = instance.getModel();
                const selected = current ? selections.reduce((total, selection) => total + current.getValueInRange(selection).length, 0) : 0;
                setCursor({ line: position?.lineNumber ?? 1, column: position?.column ?? 1, selected, selections: Math.max(1, selections.length) });
            });
        };
        let lastEol = "";
        const readModel = () => {
            const current = instance.getModel();
            if (!current) return;
            lastEol = current.getEOL();
            const options = current.getOptions();
            const markers = monaco.editor.getModelMarkers({ resource: current.uri });
            setModel({
                tabSize: options.tabSize,
                insertSpaces: options.insertSpaces,
                eol: current.getEOL() === "\r\n" ? "CRLF" : "LF",
                errors: markers.filter((marker) => marker.severity === monaco.MarkerSeverity.Error).length,
                warnings: markers.filter((marker) => marker.severity === monaco.MarkerSeverity.Warning).length,
            });
        };
        let modelSubscriptions: Array<{ dispose(): void }> = [];
        let modelFrame = 0;
        const watchModel = () => {
            modelSubscriptions.forEach((subscription) => subscription.dispose());
            const current = instance.getModel();
            modelSubscriptions = current ? [current.onDidChangeOptions(readModel), current.onDidChangeContent(() => {
                if (current.getEOL() !== lastEol) readModel();
            })] : [];
            window.cancelAnimationFrame(modelFrame);
            modelFrame = window.requestAnimationFrame(readModel);
            readCursor();
        };
        const subscriptions = [
            instance.onDidChangeCursorSelection(readCursor),
            instance.onDidChangeModel(watchModel),
            monaco.editor.onDidChangeMarkers((uris) => {
                const current = instance.getModel();
                if (current && uris.some((uri) => uri.toString() === current.uri.toString())) readModel();
            }),
        ];
        watchModel();
        return () => {
            window.cancelAnimationFrame(frame);
            window.cancelAnimationFrame(modelFrame);
            subscriptions.forEach((subscription) => subscription.dispose());
            modelSubscriptions.forEach((subscription) => subscription.dispose());
        };
    }, [instance, monaco]);

    const run = (actionId: string) => {
        if (!instance) return;
        instance.focus();
        void instance.getAction(actionId)?.run();
    };

    const toggleEol = () => {
        const current = instance?.getModel();
        if (!current || !monaco) return;
        current.pushEOL(current.getEOL() === "\r\n" ? monaco.editor.EndOfLineSequence.LF : monaco.editor.EndOfLineSequence.CRLF);
        setModel((previous) => ({ ...previous, eol: current.getEOL() === "\r\n" ? "CRLF" : "LF" }));
    };

    const info = getLanguage(language);
    const EngineIcon = ENGINE_ICONS[engine];
    const number = new Intl.NumberFormat(locale);

    return (
        <footer aria-label={tx(C.status)} className="flex h-7 shrink-0 items-center gap-0.5 overflow-x-auto border-t border-zinc-200 bg-zinc-100 px-1.5 text-[11px] text-zinc-600 [scrollbar-width:none] dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-400">
            <button type="button" className={item} onClick={onLanguageClick} title={tx(C.language)}>
                <LanguageIcon language={language} size={12} />
                <span className="font-medium text-zinc-700 dark:text-zinc-200">{info?.name ?? language}</span>
            </button>
            <span className={`${item} ${ENGINE_TONES[engine]}`} title={tx(ENGINE_LABELS[engine].description)}>
                <EngineIcon className="h-3 w-3" aria-hidden />
                {tx(ENGINE_LABELS[engine].short)}
            </span>
            <button type="button" className={item} onClick={() => run("editor.action.marker.next")} title={tx(C.problems, { errors: model.errors, warnings: model.warnings })} aria-label={tx(C.problems, { errors: model.errors, warnings: model.warnings })}>
                <XCircle className={`h-3 w-3 ${model.errors ? "text-red-500" : ""}`} aria-hidden />{number.format(model.errors)}
                <AlertTriangle className={`ms-1 h-3 w-3 ${model.warnings ? "text-amber-500" : ""}`} aria-hidden />{number.format(model.warnings)}
            </button>
            <span className="flex-1" />
            <span className={`${item} hidden sm:flex`} title={autoSaveNote ?? undefined}>
                {saveState === "saving" ? <LoaderCircle className="h-3 w-3 animate-spin" aria-hidden />
                    : saveState === "saved" ? <CheckCircle2 className="h-3 w-3 text-emerald-500" aria-hidden />
                        : saveState === "error" ? <XCircle className="h-3 w-3 text-red-500" aria-hidden />
                            : <CircleDot className="h-3 w-3 text-amber-500" aria-hidden />}
                {tx(saveState === "saving" ? C.saving : saveState === "saved" ? C.saved : saveState === "error" ? C.saveError : C.unsaved)}
            </span>
            <button type="button" className={item} onClick={() => run("editor.action.gotoLine")} title={tx(C.goToLine)}>
                {tx(C.position, { line: number.format(cursor.line), column: number.format(cursor.column) })}
                {cursor.selected > 0 && <span className="hidden sm:inline">{tx(C.selected, { count: number.format(cursor.selected) })}</span>}
                {cursor.selections > 1 && <span className="hidden md:inline">· {tx(C.cursors, { count: cursor.selections })}</span>}
            </button>
            <button type="button" className={`${item} hidden sm:flex`} onClick={() => run(model.insertSpaces ? "editor.action.indentUsingSpaces" : "editor.action.indentUsingTabs")} title={tx(C.indentation)}>
                {tx(model.insertSpaces ? C.spaces : C.tabs, { size: model.tabSize })}
            </button>
            <span className={`${item} hidden md:flex`} title={tx(C.encoding)}>UTF-8</span>
            <button type="button" className={`${item} hidden md:flex`} onClick={toggleEol} title={tx(C.eol)}>{model.eol}</button>
        </footer>
    );
}
