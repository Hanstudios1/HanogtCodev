"use client";

import Editor, { type BeforeMount, type OnMount } from "@monaco-editor/react";
import { LoaderCircle } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { editor } from "monaco-editor";
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

    useEffect(() => {
        if (!mounted || !monacoRef.current) return;
        const monaco = monacoRef.current;
        if (typeof document === "undefined" || !("fonts" in document)) return;
        document.fonts.ready.then(() => monaco.editor.remeasureFonts()).catch(() => undefined);
    }, [mounted, settings.fontFamily, settings.fontSize, settings.fontWeight, settings.letterSpacing]);

    return (
        <div className={`h-full w-full overflow-hidden rounded-xl border border-zinc-200 shadow-sm dark:border-zinc-800 ${className}`}>
            <Editor
                height="100%"
                language={monacoLanguage}
                path={path}
                value={value}
                theme={resolvedTheme}
                onChange={onChange}
                beforeMount={beforeMount}
                onMount={handleMount}
                loading={<div className="flex items-center gap-2 text-sm text-zinc-500"><LoaderCircle className="h-4 w-4 animate-spin" aria-hidden />{tx({ TR: "Editör yükleniyor…", EN: "Loading the editor…" })}</div>}
                options={mergedOptions}
            />
        </div>
    );
}
