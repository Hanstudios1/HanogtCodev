/** Types for monaco-vim.js (the adapted monaco-vim module); only what Hanogt uses. */
import type { editor, Selection } from "monaco-editor";
import type { MonacoApi } from "@/lib/monaco";

export interface VimModeChange {
    mode: string;
    subMode?: string;
}

/** One editor's Vim adapter (CodeMirror's vim keymap on a Monaco editor). */
export interface VimAdapter {
    readonly editor: editor.IStandaloneCodeEditor;
    /** True in insert mode (Monaco's "insertMode" context key). */
    readonly ctxInsert: { get(): boolean | undefined };
    on(event: "vim-mode-change", handler: (change: VimModeChange) => void): void;
    on(event: string, handler: (...args: unknown[]) => void): void;
    enterVimMode(toVim?: boolean): void;
    leaveVimMode(): void;
    indentLine(line: number, indentRight?: boolean): void;
    dispose(): void;
}

export interface VimAdapterClass {
    new (instance: editor.IStandaloneCodeEditor): VimAdapter;
    readonly prototype: VimAdapter;
    /** Editor commands Vim calls (":w" → save, "u" → undo, Ctrl+R → redo). */
    commands: Record<string, (adapter: VimAdapter) => void>;
}

/** The Vim status line: mode, pending keys, the ":" command input and notifications. */
export interface VimStatusBar {
    /** Shows the keys typed so far for the next command. */
    setKeyBuffer(keys: string): void;
}

export interface VimStatusBarClass {
    readonly prototype: VimStatusBar;
}

export interface MonacoVimModule {
    initVimMode(instance: editor.IStandaloneCodeEditor, statusNode?: HTMLElement | null): VimAdapter;
    VimMode: VimAdapterClass;
    StatusBar: VimStatusBarClass;
}

export interface ShiftOptions {
    isUnshift: boolean;
    tabSize: number;
    indentSize: number;
    insertSpaces: boolean;
}

export function createMonacoVim(monaco: MonacoApi): MonacoVimModule;
export function createShiftCommand(monaco: MonacoApi): new (selection: Selection, options: ShiftOptions) => editor.ICommand;
