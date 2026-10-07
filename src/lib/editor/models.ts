/**
 * Helpers for the Monaco models behind the editor's tabs. The page keeps the
 * tabs' text in React state; every open file also has a model (created here
 * when the file wasn't shown yet) so that markers, search-and-replace and
 * local history can work on files that aren't in the editor.
 */
import type { editor, IRange } from "monaco-editor";
import type { MonacoApi } from "@/lib/monaco";
import { monacoLanguageFor } from "@/lib/runtimes/languages";

type Model = editor.ITextModel;

/** The Monaco language of a tab (as CodeEditor picks it: registry ids map, other ids pass through). */
export function monacoLanguageOf(language: string): string {
    const mapped = monacoLanguageFor(language);
    return mapped === "plaintext" && language ? language : mapped;
}

/** The model at `path`, created with `text` when it doesn't exist yet. */
export function ensureModel(monaco: MonacoApi, path: string, text: string, language: string): Model {
    const uri = monaco.Uri.parse(path);
    const existing = monaco.editor.getModel(uri);
    if (existing && !existing.isDisposed()) return existing;
    return monaco.editor.createModel(text, monacoLanguageOf(language), uri);
}

export type ModelEdit = { range: IRange; text: string };

/**
 * Applies edits to a model as one undo step: Ctrl+Z in that file undoes
 * all of them together. Returns false when there was nothing to change.
 */
export function applyModelEdits(model: Model, edits: readonly ModelEdit[]): boolean {
    if (!edits.length || model.isDisposed()) return false;
    model.pushStackElement();
    model.pushEditOperations([], edits.map((edit) => ({ range: edit.range, text: edit.text, forceMoveMarkers: true })), () => null);
    model.pushStackElement();
    return true;
}

/** Replaces a model's whole text as one undo step (no-op when it is already equal). */
export function replaceModelText(model: Model, text: string): boolean {
    if (model.isDisposed() || model.getValue() === text) return false;
    return applyModelEdits(model, [{ range: model.getFullModelRange(), text }]);
}
