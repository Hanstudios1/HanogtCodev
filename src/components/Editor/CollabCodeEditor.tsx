"use client";

import { useCallback, useEffect, useRef } from "react";
import type { editor } from "monaco-editor";
import CodeEditor from "@/components/Editor/CodeEditor";
import type { CollabSession } from "@/lib/collab/session-client";
import { useCollabValue } from "@/lib/collab/use-editor-collab";
import { useI18n, type Copy } from "@/lib/i18n";
import type { MonacoApi } from "@/lib/monaco";

const C = {
    undo: { TR: "Geri al (canlı oturum)", EN: "Undo (live session)" },
    redo: { TR: "Yinele (canlı oturum)", EN: "Redo (live session)" },
    readOnly: { TR: "{name} (salt okunur)", EN: "{name} (read-only)" },
} satisfies Record<string, Copy>;

const ignoreChange = () => undefined;

/**
 * The editor of a live session. The model's content belongs to the shared
 * document (CollabTextBinding), so the editor gets no `value` updates: a
 * constant empty value keeps @monaco-editor/react from replacing the text.
 * Undo/redo only revert this browser's own changes.
 */
export default function CollabCodeEditor({ session, fileId, language, ariaLabel, onMount }: {
    session: CollabSession;
    fileId: string;
    language: string;
    ariaLabel: string;
    onMount?: (instance: editor.IStandaloneCodeEditor, monaco: MonacoApi) => void;
}) {
    const { tx } = useI18n();
    const canEdit = useCollabValue(session, (state) => state.canEdit, false);
    const detachRef = useRef<(() => void) | null>(null);
    const labelsRef = useRef({ undo: tx(C.undo), redo: tx(C.redo) });
    useEffect(() => {
        labelsRef.current = { undo: tx(C.undo), redo: tx(C.redo) };
    }, [tx]);

    const handleMount = useCallback((instance: editor.IStandaloneCodeEditor, monaco: MonacoApi) => {
        detachRef.current?.();
        detachRef.current = session.attachEditor(instance, monaco);
        const mod = monaco.KeyMod.CtrlCmd;
        const actions = [
            instance.addAction({ id: "hanogt.collab.undo", label: labelsRef.current.undo, keybindings: [mod | monaco.KeyCode.KeyZ], run: () => session.undo() }),
            instance.addAction({ id: "hanogt.collab.redo", label: labelsRef.current.redo, keybindings: [mod | monaco.KeyMod.Shift | monaco.KeyCode.KeyZ, mod | monaco.KeyCode.KeyY], run: () => session.redo() }),
        ];
        instance.onDidDispose(() => actions.forEach((action) => action.dispose()));
        onMount?.(instance, monaco);
    }, [onMount, session]);

    useEffect(() => {
        const detach = detachRef;
        return () => {
            detach.current?.();
            detach.current = null;
        };
    }, []);

    return (
        <CodeEditor
            language={language}
            path={session.modelPath(fileId)}
            value=""
            onChange={ignoreChange}
            onMount={handleMount}
            readOnly={!canEdit}
            ariaLabel={canEdit ? ariaLabel : tx(C.readOnly, { name: ariaLabel })}
        />
    );
}
