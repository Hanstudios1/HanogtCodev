"use client";

import Editor, { type BeforeMount, type OnMount } from "@monaco-editor/react";
import { LoaderCircle } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { editor } from "monaco-editor";
import { retainEmmet } from "@/lib/editor/emmet";
import { DEFAULT_EDITOR_SETTINGS, resolveEditorTheme, tabSizeFor, toMonacoOptions, useEditorSettings, type EditorSettings } from "@/lib/editor-settings";
import { useI18n } from "@/lib/i18n";
import { configureMonaco, setupMonaco, type MonacoApi } from "@/lib/monaco";
import { monacoLanguageFor } from "@/lib/runtimes/languages";
import { useTheme } from "@/lib/theme";

configureMonaco();

// Kept for existing imports of the settings API from this module.
export { DEFAULT_EDITOR_SETTINGS, useEditorSettings };
export type { EditorSettings };

interface CodeEditorProps {
    /** A language id from src/lib/runtimes/languages.ts (or a Monaco language id). */
    language: string;
    value: string;
    onChange: (value: string | undefined) => void;
    /**
     * Forces a light or dark editor (pages with a fixed colour scheme). The
     * user's theme is kept when it already has that brightness.
     */
    theme?: "light" | "dark";
    /** An exact Monaco theme id, e.g. for the settings preview. */
    monacoTheme?: string;
    path?: string;
    readOnly?: boolean;
    onMount?: (editor: editor.IStandaloneCodeEditor, monaco: MonacoApi) => void;
    className?: string;
    /** Extra Monaco options applied after the user's settings. */
    options?: editor.IStandaloneEditorConstructionOptions;
    /** Uses these settings instead of the saved ones (live previews). */
    settingsOverride?: EditorSettings;
    ariaLabel?: string;
}

const beforeMount: BeforeMount = (monaco: MonacoApi) => setupMonaco(monaco);

export default function CodeEditor({ language, theme, monacoTheme, value, onChange, path, readOnly = false, onMount, className = "", options, settingsOverride, ariaLabel }: CodeEditorProps) {
    const savedSettings = useEditorSettings();
    const settings = settingsOverride ?? savedSettings;
    const { theme: siteTheme } = useTheme();
    const { tx } = useI18n();
    const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
    const monacoRef = useRef<MonacoApi | null>(null);
    const [mounted, setMounted] = useState(false);
    const resolvedTheme = monacoTheme ?? resolveEditorTheme(settings.theme, siteTheme, theme);
    // Registry ids map to Monaco ids; anything else (a raw Monaco id) passes through.
    const monacoLanguage = useMemo(() => {
        const mapped = monacoLanguageFor(language);
        return mapped === "plaintext" && language ? language : mapped;
    }, [language]);

    const mergedOptions = useMemo<editor.IStandaloneEditorConstructionOptions>(() => ({
        ...toMonacoOptions(settings),
        readOnly,
        automaticLayout: true,
        padding: { top: 14, bottom: 14 },
        fixedOverflowWidgets: true,
        ariaLabel: ariaLabel ?? tx({ TR: "Kod düzenleyici", EN: "Code editor" }),
        ...options,
    }), [settings, readOnly, options, ariaLabel, tx]);

    /**
     * The text stays in sync both ways: the editor reports changes through
     * onChange and a new `value` from the parent replaces the text. The parent
     * can re-render with an older value when typing outruns its renders; the
     * values the editor reported but the parent hasn't caught up with are
     * remembered, so such a stale value is ignored instead of undoing the newer
     * keystrokes (@monaco-editor/react re-applied it and moved the cursor).
     */
    const reported = useRef<{ uri: string; values: string[] }>({ uri: "", values: [] });
    const applying = useRef(false);
    const onChangeRef = useRef(onChange);
    useEffect(() => {
        onChangeRef.current = onChange;
    }, [onChange]);
    const handleChange = useCallback((next: string | undefined) => {
        if (applying.current) return;
        const uri = editorRef.current?.getModel()?.uri.toString() ?? "";
        const values = reported.current.uri === uri ? reported.current.values : [];
        reported.current = { uri, values: [...values.slice(-199), next ?? ""] };
        onChangeRef.current(next);
    }, []);

    const appliedValue = useRef(value);
    useEffect(() => {
        const instance = editorRef.current;
        const monaco = monacoRef.current;
        if (!mounted || !instance || !monaco || appliedValue.current === value) return;
        appliedValue.current = value;
        const model = instance.getModel();
        if (!model) return;
        // Values reported for this model (another file's don't count).
        if (reported.current.uri !== model.uri.toString()) reported.current = { uri: model.uri.toString(), values: [] };
        if (value === model.getValue()) {
            // The parent caught up with the editor.
            reported.current.values = [];
            return;
        }
        const echo = reported.current.values.lastIndexOf(value);
        if (echo >= 0) {
            reported.current.values = reported.current.values.slice(echo + 1);
            return;
        }
        // A change made outside the editor (another file shown, a clean-up on save…): one undoable edit.
        applying.current = true;
        try {
            if (instance.getOption(monaco.editor.EditorOption.readOnly)) {
                instance.setValue(value);
            } else {
                instance.pushUndoStop();
                instance.executeEdits("", [{ range: model.getFullModelRange(), text: value, forceMoveMarkers: true }]);
                instance.pushUndoStop();
            }
        } finally {
            applying.current = false;
        }
        reported.current.values = [];
    }, [mounted, value]);

    const handleMount = useCallback<OnMount>((instance, monaco: MonacoApi) => {
        editorRef.current = instance;
        monacoRef.current = monaco;
        setMounted(true);
        // Fonts that load after Monaco measured them would misplace the cursor.
        if (typeof document !== "undefined" && "fonts" in document) {
            document.fonts.ready.then(() => monaco.editor.remeasureFonts()).catch(() => undefined);
        }
        onMount?.(instance, monaco);
    }, [onMount]);

    // Indentation is a model option: apply it to the open model too (the language's own tab size when it has one).
    const tabSize = tabSizeFor(settings, language);
    useEffect(() => {
        const instance = editorRef.current;
        if (!mounted || !instance) return;
        const apply = () => {
            const model = instance.getModel();
            if (model && !settings.detectIndentation) model.updateOptions({ tabSize, indentSize: tabSize, insertSpaces: settings.insertSpaces });
        };
        apply();
        const subscription = instance.onDidChangeModel(apply);
        return () => subscription.dispose();
    }, [mounted, tabSize, settings.insertSpaces, settings.detectIndentation]);

    // Emmet abbreviations (editor setting, on by default) while this editor is on the page.
    useEffect(() => {
        if (!mounted || !monacoRef.current || !settings.emmet) return;
        return retainEmmet(monacoRef.current);
    }, [mounted, settings.emmet]);

    useEffect(() => {
        if (!mounted || !monacoRef.current) return;
        const monaco = monacoRef.current;
        if (typeof document === "undefined" || !("fonts" in document)) return;
        document.fonts.ready.then(() => monaco.editor.remeasureFonts()).catch(() => undefined);
    }, [mounted, settings.fontFamily, settings.fontSize, settings.fontWeight, settings.letterSpacing]);

    return (
        // Code reads left to right; Monaco drew its lines off-screen inside right-to-left pages.
        <div dir="ltr" className={`h-full w-full overflow-hidden rounded-xl border border-zinc-200 shadow-sm dark:border-zinc-800 ${className}`}>
            <Editor
                height="100%"
                language={monacoLanguage}
                path={path}
                defaultValue={value}
                theme={resolvedTheme}
                onChange={handleChange}
                beforeMount={beforeMount}
                onMount={handleMount}
                loading={<div className="flex items-center gap-2 text-sm text-zinc-500"><LoaderCircle className="h-4 w-4 animate-spin" aria-hidden />{tx({ TR: "Editör yükleniyor…", EN: "Loading the editor…" })}</div>}
                options={mergedOptions}
            />
        </div>
    );
}
