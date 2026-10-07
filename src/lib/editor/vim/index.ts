/**
 * Vim keybindings for the code editor (the "keybindingMode" setting) through
 * an adapted copy of monaco-vim that works with the Monaco editor loaded from
 * /monaco/vs (see monaco-vim.js). The mode (--NORMAL--, --INSERT--…), pending
 * keys and ":" commands show in the node given to startVim (the editor's
 * status bar). Loaded only when Vim is turned on.
 */
import type { editor } from "monaco-editor";
import { readEditorSettings } from "@/lib/editor-settings";
import type { MonacoApi } from "@/lib/monaco";
import { createMonacoVim, createShiftCommand, type MonacoVimModule, type VimAdapter, type VimStatusBar } from "./monaco-vim.js";

export interface VimHooks {
    /** ":w" */
    save?: () => void;
}

type Editor = editor.IStandaloneCodeEditor;

const modules = new WeakMap<object, MonacoVimModule>();
const hooks = new WeakMap<Editor, VimHooks>();

/** The cursor from the editor settings (insert mode, and after Vim is turned off). */
function settingsCursor(): editor.IEditorOptions {
    const settings = readEditorSettings();
    return { cursorStyle: settings.cursorStyle, cursorBlinking: settings.cursorBlinking, cursorWidth: 0 };
}

/** Runs an editor action when the editor has it. */
function runAction(instance: Editor, id: string): boolean {
    const action = instance.getAction(id);
    if (!action) return false;
    void action.run();
    return true;
}

function moduleFor(monaco: MonacoApi): MonacoVimModule {
    const existing = modules.get(monaco);
    if (existing) return existing;
    const vim = createMonacoVim(monaco);
    const ShiftCommand = createShiftCommand(monaco);
    const proto = vim.VimMode.prototype;
    // ">>" and "<<" with the model's indentation (monaco-vim read Monaco's internal cursor configuration).
    proto.indentLine = function indentLine(this: VimAdapter, line: number, indentRight = true) {
        const model = this.editor.getModel();
        if (!model) return;
        const options = model.getOptions();
        const position = new monaco.Position(line + 1, 1);
        this.editor.executeCommand("vim", new ShiftCommand(monaco.Selection.fromPositions(position, position), {
            isUnshift: !indentRight,
            tabSize: options.tabSize,
            indentSize: options.indentSize,
            insertSpaces: options.insertSpaces,
        }));
    };
    // Insert mode keeps the cursor of the editor settings (monaco-vim always set a blinking line).
    const leave = proto.leaveVimMode;
    proto.leaveVimMode = function leaveVimMode(this: VimAdapter) {
        leave.call(this);
        this.editor.updateOptions(settingsCursor());
    };
    // A live session's editor undoes only this browser's own changes (CollabCodeEditor's actions).
    vim.VimMode.commands.undo = (adapter) => {
        if (!runAction(adapter.editor, "hanogt.collab.undo")) void adapter.editor.getModel()?.undo();
    };
    vim.VimMode.commands.redo = (adapter) => {
        if (!runAction(adapter.editor, "hanogt.collab.redo")) void adapter.editor.getModel()?.redo();
    };
    vim.VimMode.commands.save = (adapter) => hooks.get(adapter.editor)?.save?.();
    // Leaving insert or visual mode with Esc left "<Esc>" among the pending keys (--NORMAL--<Esc>); show only what follows it.
    const setKeyBuffer = vim.StatusBar.prototype.setKeyBuffer;
    vim.StatusBar.prototype.setKeyBuffer = function setPendingKeys(this: VimStatusBar, keys: string) {
        const esc = keys.lastIndexOf("<Esc>");
        setKeyBuffer.call(this, esc < 0 ? keys : keys.slice(esc + "<Esc>".length));
    };
    modules.set(monaco, vim);
    return vim;
}

/** Turns Vim keybindings on for an editor; the returned function turns them off again. */
export function startVim(monaco: MonacoApi, instance: Editor, statusNode: HTMLElement, options: VimHooks = {}): () => void {
    const { initVimMode } = moduleFor(monaco);
    hooks.set(instance, options);
    const adapter = initVimMode(instance, statusNode);
    // The page re-applies the editor settings now and then (another file shown); normal mode keeps its block cursor.
    const subscription = instance.onDidChangeConfiguration((event) => {
        if (!event.hasChanged(monaco.editor.EditorOption.cursorStyle) || adapter.ctxInsert.get()) return;
        if (instance.getOption(monaco.editor.EditorOption.cursorStyle) !== monaco.editor.TextEditorCursorStyle.Block) adapter.enterVimMode();
    });
    let stopped = false;
    return () => {
        if (stopped) return;
        stopped = true;
        subscription.dispose();
        hooks.delete(instance);
        // The editor may already be gone (another editor replaced it).
        try {
            adapter.dispose();
            instance.updateOptions(settingsCursor());
        } catch {
            // Nothing left to restore.
        }
    };
}
