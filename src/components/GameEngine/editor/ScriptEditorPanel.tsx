"use client";

import type { OnMount } from "@monaco-editor/react";
import type { Position, editor as MonacoEditor } from "monaco-editor";
import { AlertTriangle, Check, FileCode, LoaderCircle, Save, X, XCircle } from "lucide-react";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { KEY_CODES } from "@/lib/game-engine/script/stdlib";
import { API_MEMBERS, GLOBAL_SUGGESTIONS, LIFECYCLE_SNIPPETS, TYPE_MEMBERS } from "./completions";
import { useEditor } from "./context";
import { touch } from "./operations";
import { useEditorState } from "./store";
import { Button, IconButton, cx } from "./ui";

const CodeEditor = dynamic(() => import("@/components/Editor/CodeEditor"), {
    ssr: false,
    loading: () => <div className="grid h-full place-items-center text-sm text-zinc-500"><LoaderCircle className="h-5 w-5 animate-spin" /></div>,
});

type Monaco = Parameters<OnMount>[1];
type CodeEditorInstance = Parameters<OnMount>[0];

let completionsRegistered = false;

function toSnippet(entry: string) {
    const match = /^([A-Za-z_][A-Za-z0-9_<>]*)\((.*)\)$/.exec(entry);
    if (!match) return { label: entry, insert: entry, isMethod: false };
    const [, name, args] = match;
    const params = args ? args.split(",").map((arg, index) => `\${${index + 1}:${arg.trim().replace(/[{}$]/g, "")}}`) : [];
    return { label: name, insert: `${name}(${params.join(", ")})`, isMethod: true, detail: entry };
}

function registerCompletions(monaco: Monaco) {
    if (completionsRegistered) return;
    completionsRegistered = true;
    const kinds = monaco.languages.CompletionItemKind;
    for (const language of ["csharp", "cpp"]) {
        monaco.languages.registerCompletionItemProvider(language, {
            triggerCharacters: [".", ":", ">"],
            provideCompletionItems(model: MonacoEditor.ITextModel, position: Position) {
                const line = model.getLineContent(position.lineNumber).slice(0, position.column - 1);
                const word = model.getWordUntilPosition(position);
                const range = { startLineNumber: position.lineNumber, endLineNumber: position.lineNumber, startColumn: word.startColumn, endColumn: word.endColumn };
                const member = /([A-Za-z_][A-Za-z0-9_]*)\s*(?:\.|::|->)\s*[A-Za-z0-9_]*$/.exec(line);
                if (member) {
                    const owner = member[1];
                    let list = API_MEMBERS[owner] ?? TYPE_MEMBERS[owner];
                    if (owner === "KeyCode") list = KEY_CODES.slice();
                    if (!list) {
                        // Guess the declared type of a variable: "Rigidbody2D rb;" / "Rigidbody* rb".
                        const declaration = new RegExp(`\\b([A-Z][A-Za-z0-9_]*)\\s*\\*?\\s+${owner}\\b`).exec(model.getValue());
                        if (declaration) list = TYPE_MEMBERS[declaration[1]] ?? API_MEMBERS[declaration[1]];
                    }
                    if (!list) return { suggestions: [] };
                    return {
                        suggestions: list.map((entry) => {
                            const snippet = toSnippet(entry);
                            return {
                                label: snippet.label,
                                kind: snippet.isMethod ? kinds.Method : kinds.Property,
                                insertText: snippet.insert,
                                insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                                detail: snippet.detail ?? `${owner}.${entry}`,
                                range,
                            };
                        }),
                    };
                }
                const dialect = model.getLanguageId() === "cpp" ? "cpp" : "csharp";
                return {
                    suggestions: [
                        ...LIFECYCLE_SNIPPETS.map((snippet) => ({
                            label: snippet.label,
                            kind: kinds.Snippet,
                            insertText: dialect === "cpp" ? snippet.cpp : snippet.csharp,
                            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                            detail: `Hanogt · ${snippet.detail}`,
                            range,
                        })),
                        ...GLOBAL_SUGGESTIONS.map((name) => ({ label: name, kind: kinds.Class, insertText: name, detail: "Hanogt Engine API", range })),
                    ],
                };
            },
        });
    }
}

export default function ScriptEditorPanel({ tabs, activeId, onActivate, onCloseTab, onClose, goto }: {
    tabs: string[];
    activeId: string | null;
    onActivate: (id: string) => void;
    onCloseTab: (id: string) => void;
    onClose: () => void;
    goto: { id: string; line: number; nonce: number } | null;
}) {
    const { store, program, t, playing } = useEditor();
    const scripts = useEditorState(store, (state) => state.project.scripts);
    const projectId = useEditorState(store, (state) => state.project.id);
    const [buffers, setBuffers] = useState<Record<string, string>>({});
    const committed = useRef<Record<string, string>>({});
    const timers = useRef<Record<string, number>>({});
    const editorRef = useRef<CodeEditorInstance | null>(null);
    const monacoRef = useRef<Monaco | null>(null);
    const [mounted, setMounted] = useState(0);
    const active = scripts.find((script) => script.id === activeId) ?? null;
    const activeIdRef = useRef(activeId);
    useEffect(() => {
        activeIdRef.current = activeId;
    }, [activeId]);

    // Pull external changes (undo/redo, other panels) into clean buffers.
    useEffect(() => {
        setBuffers((current) => {
            let changed = false;
            const next = { ...current };
            for (const script of scripts) {
                const buffer = current[script.id];
                if (buffer === undefined || buffer === committed.current[script.id]) {
                    if (buffer !== script.content) {
                        next[script.id] = script.content;
                        changed = true;
                    }
                    committed.current[script.id] = script.content;
                }
            }
            return changed ? next : current;
        });
    }, [scripts]);

    const commit = useCallback((id: string, text: string) => {
        window.clearTimeout(timers.current[id]);
        delete timers.current[id];
        if (committed.current[id] === text) return;
        committed.current[id] = text;
        store.update(t("hEditScript"), (draft) => {
            const script = draft.scripts.find((item) => item.id === id);
            if (script && script.content !== text) {
                script.content = text.slice(0, 160 * 1024);
                touch(draft);
            }
        }, { mergeKey: `script:${id}` });
    }, [store, t]);

    const commitRef = useRef(commit);
    useEffect(() => {
        commitRef.current = commit;
    }, [commit]);

    const buffersRef = useRef(buffers);
    useEffect(() => {
        buffersRef.current = buffers;
    }, [buffers]);

    const flushAll = useCallback(() => {
        for (const [id, text] of Object.entries(buffersRef.current)) commit(id, text);
    }, [commit]);

    useEffect(() => {
        const pending = timers.current;
        const onFlush = () => flushAll();
        window.addEventListener("hanogt-engine:flush-scripts", onFlush);
        return () => {
            window.removeEventListener("hanogt-engine:flush-scripts", onFlush);
            for (const timer of Object.values(pending)) window.clearTimeout(timer);
            // Never lose keystrokes typed right before the panel unmounts.
            for (const [id, text] of Object.entries(buffersRef.current)) commitRef.current(id, text);
        };
    }, [flushAll]);

    // Flush pending edits when the panel closes or the game starts.
    useEffect(() => {
        if (playing) flushAll();
    }, [playing, flushAll]);

    const onChange = (value: string | undefined) => {
        if (!active || playing) return;
        const text = value ?? "";
        const id = active.id;
        setBuffers((current) => ({ ...current, [id]: text }));
        window.clearTimeout(timers.current[id]);
        timers.current[id] = window.setTimeout(() => commit(id, text), 650);
    };

    const onMount: OnMount = (editor, monaco) => {
        editorRef.current = editor;
        monacoRef.current = monaco;
        registerCompletions(monaco);
        editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
            const target = activeIdRef.current;
            if (target) commitRef.current(target, editor.getValue());
        });
        setMounted((value) => value + 1);
    };

    // Compiler diagnostics → Monaco markers.
    useEffect(() => {
        const monaco = monacoRef.current;
        const editor = editorRef.current;
        const model = editor?.getModel();
        if (!monaco || !model || !active) return;
        const diagnostics = program.diagnostics.filter((item) => item.scriptId === active.id);
        monaco.editor.setModelMarkers(model, "hanogt", diagnostics.map((item) => {
            const lineText = model.getLineContent(Math.min(model.getLineCount(), Math.max(1, item.line)));
            const start = Math.max(1, item.col);
            const wordMatch = /^[A-Za-z0-9_]+/.exec(lineText.slice(start - 1));
            return {
                startLineNumber: Math.max(1, item.line),
                endLineNumber: Math.max(1, item.line),
                startColumn: start,
                endColumn: start + Math.max(1, wordMatch?.[0].length ?? lineText.length - start + 1),
                message: item.message,
                severity: item.severity === "error" ? monaco.MarkerSeverity.Error : monaco.MarkerSeverity.Warning,
                source: "Hanogt",
            };
        }));
    }, [program, active, mounted, buffers]);

    useEffect(() => {
        const editor = editorRef.current;
        if (!goto || !editor || goto.id !== activeId) return;
        const frame = window.requestAnimationFrame(() => {
            editor.revealLineInCenter(goto.line);
            editor.setPosition({ lineNumber: goto.line, column: 1 });
            editor.focus();
        });
        return () => window.cancelAnimationFrame(frame);
    }, [goto, activeId, mounted]);

    const diagnostics = active ? program.diagnostics.filter((item) => item.scriptId === active.id) : [];
    const errorCount = diagnostics.filter((item) => item.severity === "error").length;
    const dirty = (id: string) => buffers[id] !== undefined && buffers[id] !== scripts.find((script) => script.id === id)?.content;

    return (
        <div className="flex h-full min-h-0 flex-col bg-[#1e1e1e]">
            <div className="flex h-9 shrink-0 items-center gap-1 border-b border-black/40 bg-zinc-950 pr-1.5">
                <div className="scrollbar-none flex min-w-0 flex-1 items-stretch overflow-x-auto">
                    {tabs.map((id) => {
                        const script = scripts.find((item) => item.id === id);
                        if (!script) return null;
                        const errors = program.diagnostics.filter((item) => item.scriptId === id && item.severity === "error").length;
                        return (
                            <div key={id} className={cx("group flex h-9 shrink-0 items-center gap-1.5 border-r border-black/40 pl-3 pr-1.5 text-[12px]", id === activeId ? "bg-[#1e1e1e] text-white" : "text-zinc-400 hover:bg-white/[0.03]")}>
                                <button type="button" onClick={() => onActivate(id)} className="flex items-center gap-1.5">
                                    <FileCode className={cx("h-3.5 w-3.5", script.language === "cpp" ? "text-sky-300" : "text-emerald-300")} />
                                    <span className="max-w-[160px] truncate">{script.name}</span>
                                    {errors ? <XCircle className="h-3 w-3 text-red-400" /> : null}
                                    {dirty(id) ? <span className="h-1.5 w-1.5 rounded-full bg-amber-300" aria-label={t("unsaved")} /> : null}
                                </button>
                                <button type="button" onClick={() => {
                                    const buffer = buffers[id];
                                    if (buffer !== undefined) commit(id, buffer);
                                    onCloseTab(id);
                                }} className="grid h-5 w-5 place-items-center rounded text-zinc-500 opacity-60 hover:bg-white/10 hover:text-white group-hover:opacity-100" aria-label={t("close")}><X className="h-3 w-3" /></button>
                            </div>
                        );
                    })}
                </div>
                {active ? (
                    <span className={cx("hidden items-center gap-1 text-[11px] sm:inline-flex", errorCount ? "text-red-300" : "text-emerald-300")}>
                        {errorCount ? <><XCircle className="h-3.5 w-3.5" />{errorCount} {t("errors").toLocaleLowerCase()}</> : <><Check className="h-3.5 w-3.5" />{t("compiledOk")}</>}
                    </span>
                ) : null}
                <Button variant="ghost" className="h-7 px-2" disabled={!active || playing} onClick={() => active && commit(active.id, buffers[active.id] ?? active.content)}><Save className="h-3.5 w-3.5" />{t("save")}</Button>
                <IconButton icon={X} label={t("close")} size="sm" onClick={() => {
                    flushAll();
                    onClose();
                }} />
            </div>
            <div className="relative min-h-0 flex-1">
                {active ? (
                    <CodeEditor
                        language={active.language === "cpp" ? "cpp" : "csharp"}
                        value={buffers[active.id] ?? active.content}
                        path={`hanogt://${projectId}/${active.id}/${active.name}`}
                        onChange={onChange}
                        onMount={onMount}
                        theme="dark"
                        readOnly={playing}
                        className="rounded-none border-0"
                    />
                ) : (
                    <div className="grid h-full place-items-center text-sm text-zinc-500">{t("selectScript")}</div>
                )}
            </div>
            {diagnostics.length ? (
                <div className="scrollbar-thin max-h-28 shrink-0 overflow-y-auto border-t border-black/40 bg-zinc-950 py-1 font-mono text-[11px]">
                    {diagnostics.map((item, index) => (
                        <button
                            key={index}
                            type="button"
                            onClick={() => {
                                const editor = editorRef.current;
                                if (!editor) return;
                                editor.revealLineInCenter(item.line);
                                editor.setPosition({ lineNumber: item.line, column: Math.max(1, item.col) });
                                editor.focus();
                            }}
                            className="flex w-full items-start gap-2 px-3 py-0.5 text-left hover:bg-white/[0.04]"
                        >
                            {item.severity === "error" ? <XCircle className="mt-0.5 h-3 w-3 shrink-0 text-red-400" /> : <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-amber-300" />}
                            <span className="text-zinc-500">{item.line}:{item.col}</span>
                            <span className={item.severity === "error" ? "text-red-200" : "text-amber-100"}>{item.message}</span>
                        </button>
                    ))}
                </div>
            ) : null}
        </div>
    );
}
