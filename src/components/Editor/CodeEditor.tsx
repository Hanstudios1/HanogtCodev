"use client";

import Editor, { OnMount } from "@monaco-editor/react";
import { useRef, useState, useEffect } from "react";

interface CodeEditorProps {
    language: string;
    theme: "light" | "dark";
    value: string;
    onChange: (value: string | undefined) => void;
}

interface EditorSettings {
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
    highlightActiveLine: boolean;
    renderIndentGuides: boolean;
    cursorBlinking: "blink" | "smooth" | "phase" | "expand" | "solid";
}

const defaultSettings: EditorSettings = {
    fontSize: 14,
    fontFamily: "Cascadia Code, SFMono-Regular, Consolas, Liberation Mono, monospace",
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
    highlightActiveLine: true,
    renderIndentGuides: true,
    cursorBlinking: "blink"
};

export default function CodeEditor({ language, theme, value, onChange }: CodeEditorProps) {
    const editorRef = useRef(null);
    const [settings, setSettings] = useState<EditorSettings>(defaultSettings);

    // Load settings from localStorage
    useEffect(() => {
        const loadSettings = () => {
            const savedSettings = localStorage.getItem("hanogt_editor_settings");
            if (savedSettings) {
                try {
                    const parsed = JSON.parse(savedSettings);
                    setSettings({ ...defaultSettings, ...parsed });
                } catch (e) {
                    console.error("Error loading editor settings:", e);
                }
            }
        };

        loadSettings();

        // Listen for storage changes
        const handleStorageChange = (e: StorageEvent) => {
            if (e.key === "hanogt_editor_settings") {
                loadSettings();
            }
        };

        window.addEventListener("storage", handleStorageChange);
        return () => window.removeEventListener("storage", handleStorageChange);
    }, []);

    const handleEditorDidMount: OnMount = (editor) => {
        // @ts-expect-error Monaco's standalone editor type is narrower than the shared editor ref.
        editorRef.current = editor;
    };

    return (
        <div className="w-full h-full border border-zinc-200 dark:border-zinc-800 rounded-lg overflow-hidden shadow-sm">
            <Editor
                height="100%"
                language={language}
                value={value}
                theme={theme === "dark" ? "vs-dark" : "light"}
                onChange={onChange}
                onMount={handleEditorDidMount}
                options={{
                    minimap: { enabled: settings.minimap },
                    fontSize: settings.fontSize,
                    fontFamily: settings.fontFamily,
                    tabSize: settings.tabSize,
                    wordWrap: settings.wordWrap ? "on" : "off",
                    lineNumbers: settings.lineNumbers ? "on" : "off",
                    cursorStyle: settings.cursorStyle,
                    cursorBlinking: settings.cursorBlinking,
                    smoothScrolling: settings.smoothScrolling,
                    scrollBeyondLastLine: false,
                    automaticLayout: true,
                    padding: { top: 16 },
                    bracketPairColorization: { enabled: settings.bracketPairColorization },
                    autoClosingBrackets: settings.autoCloseBrackets ? "always" : "never",
                    autoClosingQuotes: settings.autoCloseQuotes ? "always" : "never",
                    formatOnPaste: settings.formatOnPaste,
                    renderLineHighlight: settings.highlightActiveLine ? "all" : "none",
                    guides: { indentation: settings.renderIndentGuides },
                }}
            />
        </div>
    );
}

