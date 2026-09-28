"use client";

import Editor, { type OnMount } from "@monaco-editor/react";
import { LoaderCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { configureMonaco } from "@/lib/monaco";
import { useTheme } from "@/lib/theme";

configureMonaco();

interface CodeEditorProps {
    language: string;
    value: string;
    onChange: (value: string | undefined) => void;
    /** Forces a Monaco theme; by default the saved editor setting or the site theme is used. */
    theme?: "light" | "dark";
    path?: string;
    readOnly?: boolean;
    onMount?: OnMount;
    className?: string;
}

export interface EditorSettings {
    fontSize: number;
    fontFamily: string;
    tabSize: number;
    wordWrap: boolean;
    lineNumbers: boolean;
    minimap: boolean;
    bracketPairColorization: boolean;
    cursorStyle: "line" | "block" | "underline";
    smoothScrolling: boolean;
    autoCloseBrackets: boolean;
    autoCloseQuotes: boolean;
    formatOnPaste: boolean;
    formatOnType: boolean;
    highlightActiveLine: boolean;
    renderIndentGuides: boolean;
    cursorBlinking: "blink" | "smooth" | "phase" | "expand" | "solid";
    theme: "light" | "dark" | "system";
    lineHeight: number;
    autocomplete: boolean;
    snippetSuggestions: boolean;
    parameterHints: boolean;
    hoverInfo: boolean;
    linkedEditing: boolean;
    renderWhitespace: "none" | "boundary" | "all";
    autoIndent: "none" | "keep" | "brackets" | "advanced";
    stickyScroll: boolean;
    codeLens: boolean;
    inlineSuggest: boolean;
}

export const DEFAULT_EDITOR_SETTINGS: EditorSettings = {
    fontSize: 14,
    fontFamily: "JetBrains Mono",
    tabSize: 4,
    wordWrap: true,
    lineNumbers: true,
    minimap: true,
    bracketPairColorization: true,
    cursorStyle: "line",
    smoothScrolling: true,
    autoCloseBrackets: true,
    autoCloseQuotes: true,
    formatOnPaste: false,
    formatOnType: false,
    highlightActiveLine: true,
    renderIndentGuides: true,
    cursorBlinking: "blink",
    theme: "system",
    lineHeight: 1.6,
    autocomplete: true,
    snippetSuggestions: true,
    parameterHints: true,
    hoverInfo: true,
    linkedEditing: true,
    renderWhitespace: "none",
    autoIndent: "advanced",
    stickyScroll: true,
    codeLens: true,
    inlineSuggest: true,
};

const SETTINGS_KEY = "hanogt_editor_settings";

function readSettings(): EditorSettings {
    try {
        const saved = window.localStorage.getItem(SETTINGS_KEY);
        if (!saved) return DEFAULT_EDITOR_SETTINGS;
        const parsed = JSON.parse(saved) as Partial<EditorSettings>;
        return { ...DEFAULT_EDITOR_SETTINGS, ...parsed };
    } catch {
        return DEFAULT_EDITOR_SETTINGS;
    }
}

/** Editor preferences saved on the settings page, kept in sync across tabs. */
export function useEditorSettings() {
    const [settings, setSettings] = useState<EditorSettings>(DEFAULT_EDITOR_SETTINGS);
    useEffect(() => {
        const load = () => setSettings(readSettings());
        const frame = window.requestAnimationFrame(load);
        const onStorage = (event: StorageEvent) => { if (event.key === SETTINGS_KEY) load(); };
        window.addEventListener("storage", onStorage);
        return () => {
            window.cancelAnimationFrame(frame);
            window.removeEventListener("storage", onStorage);
        };
    }, []);
    return settings;
}

const MONO_FALLBACK = "'JetBrains Mono Variable', 'JetBrains Mono', 'Cascadia Code', 'SFMono-Regular', Consolas, 'Liberation Mono', monospace";

export default function CodeEditor({ language, theme, value, onChange, path, readOnly = false, onMount, className = "" }: CodeEditorProps) {
    const settings = useEditorSettings();
    const { theme: siteTheme } = useTheme();
    const resolvedTheme = theme ?? (settings.theme === "system" ? siteTheme : settings.theme);

    return (
        <div className={`h-full w-full overflow-hidden rounded-xl border border-zinc-200 shadow-sm dark:border-zinc-800 ${className}`}>
            <Editor
                height="100%"
                language={language}
                path={path}
                value={value}
                theme={resolvedTheme === "dark" ? "vs-dark" : "light"}
                onChange={onChange}
                onMount={onMount}
                loading={<div className="flex items-center gap-2 text-sm text-zinc-500"><LoaderCircle className="h-4 w-4 animate-spin" />Editör yükleniyor…</div>}
                options={{
                    readOnly,
                    minimap: { enabled: settings.minimap },
                    fontSize: settings.fontSize,
                    fontFamily: settings.fontFamily ? `'${settings.fontFamily.replace(/'/g, "")}', ${MONO_FALLBACK}` : MONO_FALLBACK,
                    fontLigatures: true,
                    lineHeight: settings.lineHeight,
                    tabSize: settings.tabSize,
                    wordWrap: settings.wordWrap ? "on" : "off",
                    lineNumbers: settings.lineNumbers ? "on" : "off",
                    cursorStyle: settings.cursorStyle,
                    cursorBlinking: settings.cursorBlinking,
                    smoothScrolling: settings.smoothScrolling,
                    scrollBeyondLastLine: false,
                    automaticLayout: true,
                    padding: { top: 14, bottom: 14 },
                    bracketPairColorization: { enabled: settings.bracketPairColorization },
                    autoClosingBrackets: settings.autoCloseBrackets ? "always" : "never",
                    autoClosingQuotes: settings.autoCloseQuotes ? "always" : "never",
                    formatOnPaste: settings.formatOnPaste,
                    formatOnType: settings.formatOnType,
                    renderLineHighlight: settings.highlightActiveLine ? "all" : "none",
                    guides: { indentation: settings.renderIndentGuides, bracketPairs: settings.bracketPairColorization },
                    quickSuggestions: settings.autocomplete,
                    suggestOnTriggerCharacters: settings.autocomplete,
                    snippetSuggestions: settings.snippetSuggestions ? "inline" : "none",
                    parameterHints: { enabled: settings.parameterHints },
                    hover: { enabled: settings.hoverInfo ? "on" : "off" },
                    linkedEditing: settings.linkedEditing,
                    renderWhitespace: settings.renderWhitespace,
                    autoIndent: settings.autoIndent,
                    stickyScroll: { enabled: settings.stickyScroll },
                    codeLens: settings.codeLens,
                    inlineSuggest: { enabled: settings.inlineSuggest },
                }}
            />
        </div>
    );
}
