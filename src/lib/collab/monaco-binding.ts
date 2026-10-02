/**
 * Monaco ↔ Yjs for live sessions.
 *
 * CollabTextBinding keeps one Monaco model and one Y.Text identical. It is
 * adapted from y-monaco's MonacoBinding (MIT © Kevin Jahns) with these
 * differences:
 * - the Monaco API is passed in: the editor loads Monaco's AMD build from
 *   /monaco/vs, and the static `monaco-editor` import y-monaco makes would
 *   bundle a second, multi-megabyte copy of the editor;
 * - models are kept on LF line endings (a Windows browser would otherwise
 *   count "\r\n" as two characters and the offsets would drift);
 * - local edits can be refused (read-only sessions, size limits) and are then
 *   reverted;
 * - undo/redo go through a Y.UndoManager that only reverts this browser's
 *   changes (Monaco's own undo stack doesn't know about remote edits);
 * - remote edits are applied as one batch and every cursor of a multi-cursor
 *   selection is kept.
 *
 * CollabEditorPresence publishes the local cursor and open file through
 * y-protocols awareness and draws the other participants' cursors and
 * selections (colours and name labels come from CSS classes per client).
 */
import * as Y from "yjs";
import type { IDisposable, editor as MonacoEditor } from "monaco-editor";
import type { MonacoApi } from "@/lib/monaco";
import { textChange } from "./doc";
import { normalizeNewlines, type CollabAwarenessState, type RelativePositionJson } from "./protocol";

type Editor = MonacoEditor.IStandaloneCodeEditor;
type Model = MonacoEditor.ITextModel;

/** Origin of the transaction that removes stray "\r" characters another client inserted. */
export const REPAIR_ORIGIN = Symbol("collab-repair");

type SavedSelection = { start: Y.RelativePosition; end: Y.RelativePosition; direction: number };

export type TextBindingOptions = {
    /** Called for every local change with the model's new length; false reverts it. */
    allowLocalChange?: (nextLength: number) => boolean;
    onRejected?: () => void;
};

export class CollabTextBinding {
    readonly ytext: Y.Text;
    readonly model: Model;
    readonly undoManager: Y.UndoManager;
    /** Called once when the binding is destroyed (also when its model is disposed). */
    onDestroy: (() => void) | null = null;
    private readonly monaco: MonacoApi;
    private readonly doc: Y.Doc;
    private readonly editors: () => readonly Editor[];
    private readonly options: TextBindingOptions;
    private readonly disposables: IDisposable[] = [];
    private saved = new Map<Editor, SavedSelection[]>();
    private muted = false;
    private destroyed = false;
    private repairScheduled = false;

    constructor(monaco: MonacoApi, ytext: Y.Text, model: Model, editors: () => readonly Editor[], options: TextBindingOptions = {}) {
        const doc = ytext.doc;
        if (!doc) throw new Error("The shared text must belong to a document.");
        this.monaco = monaco;
        this.ytext = ytext;
        this.model = model;
        this.doc = doc;
        this.editors = editors;
        this.options = options;
        this.undoManager = new Y.UndoManager(ytext, { trackedOrigins: new Set([this]), captureTimeout: 500 });
        doc.on("beforeAllTransactions", this.beforeTransaction);
        ytext.observe(this.onTextChange);
        model.setEOL(monaco.editor.EndOfLineSequence.LF);
        this.mute(() => this.syncModelFromText());
        this.disposables.push(
            model.onDidChangeContent((event) => this.onModelChange(event)),
            model.onWillDispose(() => this.destroy()),
        );
    }

    get isDestroyed() {
        return this.destroyed;
    }

    undo() {
        this.undoManager.undo();
    }

    redo() {
        this.undoManager.redo();
    }

    destroy() {
        if (this.destroyed) return;
        this.destroyed = true;
        this.disposables.forEach((disposable) => disposable.dispose());
        this.ytext.unobserve(this.onTextChange);
        this.doc.off("beforeAllTransactions", this.beforeTransaction);
        this.undoManager.destroy();
        this.onDestroy?.();
    }

    private mute(run: () => void) {
        if (this.muted) return;
        this.muted = true;
        try {
            run();
        } finally {
            this.muted = false;
        }
    }

    private showing() {
        return this.editors().filter((editor) => editor.getModel() === this.model);
    }

    /** Remembers every editor's selections as relative positions before the document changes. */
    private readonly beforeTransaction = () => {
        this.mute(() => {
            const saved = new Map<Editor, SavedSelection[]>();
            for (const editor of this.showing()) {
                const selections = editor.getSelections();
                if (!selections?.length) continue;
                saved.set(editor, selections.map((selection) => ({
                    start: Y.createRelativePositionFromTypeIndex(this.ytext, this.model.getOffsetAt(selection.getStartPosition())),
                    end: Y.createRelativePositionFromTypeIndex(this.ytext, this.model.getOffsetAt(selection.getEndPosition())),
                    direction: selection.getDirection(),
                })));
            }
            this.saved = saved;
        });
    };

    /** Remote (or undo/redo) changes of the text → one batch of model edits. */
    private readonly onTextChange = (event: Y.YTextEvent, transaction: Y.Transaction) => {
        this.mute(() => {
            const model = this.model;
            const edits: Array<{ start: number; end: number; text: string }> = [];
            let index = 0;
            let cursor = -1;
            let position = 0;
            let carriageReturn = false;
            for (const op of event.delta) {
                if (op.retain !== undefined) {
                    index += op.retain;
                    position += op.retain;
                } else if (typeof op.insert === "string") {
                    const previous = edits[edits.length - 1];
                    if (previous && previous.end === index) previous.text += op.insert;
                    else edits.push({ start: index, end: index, text: op.insert });
                    position += op.insert.length;
                    cursor = position;
                    if (op.insert.includes("\r")) carriageReturn = true;
                } else if (op.delete !== undefined) {
                    const previous = edits[edits.length - 1];
                    if (previous && previous.end === index) previous.end += op.delete;
                    else edits.push({ start: index, end: index + op.delete, text: "" });
                    index += op.delete;
                    cursor = position;
                }
            }
            if (edits.length) {
                model.applyEdits(edits.map((edit) => {
                    const from = model.getPositionAt(edit.start);
                    const to = model.getPositionAt(edit.end);
                    return { range: new this.monaco.Range(from.lineNumber, from.column, to.lineNumber, to.column), text: edit.text };
                }));
            }
            // A model that drifted (Monaco normalised a stray "\r") is brought back to the text.
            if (model.getValueLength() !== this.ytext.length) this.syncModelFromText();
            this.restoreSelections();
            if (transaction.origin === this.undoManager && cursor >= 0) {
                const target = model.getPositionAt(Math.min(cursor, model.getValueLength()));
                for (const editor of this.showing()) {
                    editor.setPosition(target);
                    editor.revealPositionInCenterIfOutsideViewport(target);
                }
            }
            if (carriageReturn) this.scheduleRepair();
        });
    };

    /** Local model changes → the shared text (one transaction, undoable through the undo manager). */
    private onModelChange(event: MonacoEditor.IModelContentChangedEvent) {
        if (this.muted || this.destroyed) return;
        this.mute(() => {
            // Line endings stay LF inside a session (the status bar's LF/CRLF switch is undone).
            if (event.eol !== "\n") {
                this.model.setEOL(this.monaco.editor.EndOfLineSequence.LF);
                return;
            }
            const allowed = this.options.allowLocalChange?.(this.model.getValueLength()) ?? true;
            if (!allowed) {
                this.syncModelFromText();
                this.options.onRejected?.();
                return;
            }
            if (event.isFlush) {
                const change = textChange(this.ytext.toString(), normalizeNewlines(this.model.getValue()));
                if (change) {
                    this.doc.transact(() => {
                        if (change.remove) this.ytext.delete(change.index, change.remove);
                        if (change.insert) this.ytext.insert(change.index, change.insert);
                    }, this);
                }
            } else {
                const changes = [...event.changes].sort((a, b) => b.rangeOffset - a.rangeOffset);
                this.doc.transact(() => {
                    for (const change of changes) {
                        if (change.rangeLength) this.ytext.delete(change.rangeOffset, change.rangeLength);
                        if (change.text) this.ytext.insert(change.rangeOffset, normalizeNewlines(change.text));
                    }
                }, this);
            }
            if (this.ytext.length !== this.model.getValueLength()) this.syncModelFromText();
        });
    }

    /** Smallest model edit that makes the model equal to the text (keeps the view and cursors). */
    private syncModelFromText() {
        const value = this.ytext.toString();
        const target = value.includes("\r") ? value.replace(/\r/g, "") : value;
        const change = textChange(this.model.getValue(), target);
        if (change) {
            const from = this.model.getPositionAt(change.index);
            const to = this.model.getPositionAt(change.index + change.remove);
            this.model.applyEdits([{ range: new this.monaco.Range(from.lineNumber, from.column, to.lineNumber, to.column), text: change.insert }]);
        }
        if (target !== value) this.scheduleRepair();
    }

    private restoreSelections() {
        for (const [editor, saved] of this.saved) {
            if (editor.getModel() !== this.model) continue;
            const selections = saved.flatMap((selection) => {
                const start = Y.createAbsolutePositionFromRelativePosition(selection.start, this.doc);
                const end = Y.createAbsolutePositionFromRelativePosition(selection.end, this.doc);
                if (!start || !end || start.type !== this.ytext || end.type !== this.ytext) return [];
                const from = this.model.getPositionAt(start.index);
                const to = this.model.getPositionAt(end.index);
                return [this.monaco.Selection.createWithDirection(from.lineNumber, from.column, to.lineNumber, to.column, selection.direction)];
            });
            if (selections.length) editor.setSelections(selections);
        }
    }

    /** Removes "\r" characters from the shared text (another client's line endings). */
    private scheduleRepair() {
        if (this.repairScheduled) return;
        this.repairScheduled = true;
        setTimeout(() => {
            this.repairScheduled = false;
            if (this.destroyed) return;
            const value = this.ytext.toString();
            if (!value.includes("\r")) return;
            this.doc.transact(() => {
                for (let index = value.length - 1; index >= 0; index -= 1) if (value.charCodeAt(index) === 13) this.ytext.delete(index, 1);
            }, REPAIR_ORIGIN);
        }, 0);
    }
}

// ---------------------------------------------------------------------------
// Cursors of the other participants
// ---------------------------------------------------------------------------

export type PresencePeer = {
    clientID: number;
    color: string;
    selection: { anchor: RelativePositionJson; head: RelativePositionJson } | null;
};

export type PresenceTarget = { fileId: string; ytext: Y.Text };

type LocalPresence = Pick<CollabAwarenessState, "file" | "selection" | "line">;

function absolute(json: RelativePositionJson, doc: Y.Doc) {
    try {
        return Y.createAbsolutePositionFromRelativePosition(Y.createRelativePositionFromJSON(json), doc);
    } catch {
        return null;
    }
}

export class CollabEditorPresence {
    readonly editor: Editor;
    private readonly monaco: MonacoApi;
    private readonly resolve: (model: Model | null) => PresenceTarget | null;
    private readonly publish: (state: LocalPresence) => void;
    private readonly onUserMove: () => void;
    private readonly decorations: MonacoEditor.IEditorDecorationsCollection;
    private readonly disposables: IDisposable[];
    private peers: readonly PresencePeer[] = [];
    private last = "";
    private disposed = false;

    constructor(monaco: MonacoApi, editor: Editor, resolve: (model: Model | null) => PresenceTarget | null, publish: (state: LocalPresence) => void, onUserMove: () => void) {
        this.monaco = monaco;
        this.editor = editor;
        this.resolve = resolve;
        this.publish = publish;
        this.onUserMove = onUserMove;
        this.decorations = editor.createDecorationsCollection();
        this.disposables = [
            editor.onDidChangeCursorSelection((event) => {
                this.report();
                if (event.source === "mouse" || event.source === "keyboard") this.onUserMove();
            }),
            editor.onDidChangeModel(() => {
                this.report();
                this.render();
            }),
        ];
        this.report();
    }

    /** Publishes the open file and the selection (relative positions survive concurrent edits). */
    report(force = false) {
        if (this.disposed) return;
        const model = this.editor.getModel();
        const target = this.resolve(model);
        const selection = this.editor.getSelection();
        let state: LocalPresence = { file: target?.fileId ?? null, selection: null, line: null };
        if (model && target && selection) {
            let anchor = model.getOffsetAt(selection.getStartPosition());
            let head = model.getOffsetAt(selection.getEndPosition());
            if (selection.getDirection() === this.monaco.SelectionDirection.RTL) [anchor, head] = [head, anchor];
            state = {
                file: target.fileId,
                selection: {
                    anchor: Y.relativePositionToJSON(Y.createRelativePositionFromTypeIndex(target.ytext, anchor)) as RelativePositionJson,
                    head: Y.relativePositionToJSON(Y.createRelativePositionFromTypeIndex(target.ytext, head)) as RelativePositionJson,
                },
                line: selection.positionLineNumber,
            };
        }
        const key = JSON.stringify(state);
        if (!force && key === this.last) return;
        this.last = key;
        this.publish(state);
    }

    /** Draws the remote selections and cursors that belong to the open file. */
    render(peers: readonly PresencePeer[] = this.peers) {
        if (this.disposed) return;
        this.peers = peers;
        const model = this.editor.getModel();
        const target = this.resolve(model);
        const doc = target?.ytext.doc;
        if (!model || !target || !doc) {
            this.decorations.clear();
            return;
        }
        const decorations: MonacoEditor.IModelDeltaDecoration[] = [];
        const length = model.getValueLength();
        for (const peer of peers) {
            if (!peer.selection) continue;
            const anchor = absolute(peer.selection.anchor, doc);
            const head = absolute(peer.selection.head, doc);
            if (!anchor || !head || anchor.type !== target.ytext || head.type !== target.ytext) continue;
            const start = Math.min(anchor.index, head.index, length);
            const end = Math.min(Math.max(anchor.index, head.index), length);
            if (start !== end) {
                const from = model.getPositionAt(start);
                const to = model.getPositionAt(end);
                decorations.push({
                    range: new this.monaco.Range(from.lineNumber, from.column, to.lineNumber, to.column),
                    options: { className: `collab-sel collab-sel-${peer.clientID}`, stickiness: this.monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges },
                });
            }
            const at = model.getPositionAt(Math.min(head.index, length));
            decorations.push({
                range: new this.monaco.Range(at.lineNumber, at.column, at.lineNumber, at.column),
                options: {
                    beforeContentClassName: `collab-head collab-head-${peer.clientID}`,
                    stickiness: this.monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
                    overviewRuler: { color: peer.color, position: this.monaco.editor.OverviewRulerLane.Center },
                },
            });
        }
        this.decorations.set(decorations);
    }

    /** Scrolls to a participant's cursor (follow mode). */
    reveal(peer: PresencePeer) {
        const model = this.editor.getModel();
        const target = this.resolve(model);
        const doc = target?.ytext.doc;
        if (!model || !target || !doc || !peer.selection) return false;
        const head = absolute(peer.selection.head, doc);
        if (!head || head.type !== target.ytext) return false;
        const position = model.getPositionAt(Math.min(head.index, model.getValueLength()));
        this.editor.revealPositionInCenterIfOutsideViewport(position);
        return true;
    }

    dispose() {
        if (this.disposed) return;
        this.disposed = true;
        this.disposables.forEach((disposable) => disposable.dispose());
        this.decorations.clear();
    }
}

/** Base styles of remote cursors; per-client colours and labels are added by CollabSession. */
export const COLLAB_CURSOR_CSS = [
    ".collab-sel{border-radius:2px}",
    ".collab-head{position:absolute;height:100%;border-left:2px solid #6366f1;margin-left:-1px;box-sizing:border-box;pointer-events:none;z-index:2}",
    ".collab-head::after{position:absolute;left:-2px;top:-1.35em;padding:0 4px;border-radius:3px 3px 3px 0;font:600 10px/1.35em ui-sans-serif,system-ui,sans-serif;color:#fff;white-space:nowrap;pointer-events:none;opacity:.92}",
].join("\n");
