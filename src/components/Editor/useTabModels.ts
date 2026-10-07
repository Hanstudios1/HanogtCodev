"use client";

import { useEffect, useRef } from "react";
import type { editor } from "monaco-editor";
import { monacoLanguageOf, replaceModelText } from "@/lib/editor/models";
import type { MonacoApi } from "@/lib/monaco";

export interface ModelTab {
    id: string;
    name: string;
    lang: string;
    code: string;
}

/**
 * Gives every open file a Monaco model and keeps the models of the files that
 * aren't on screen equal to the tabs' text (the editor keeps its own model in
 * sync). Markers then cover all open files, and search-and-replace or a local
 * history restore can change any file as an undoable edit.
 *
 * Disabled during a live session: its models belong to the shared document.
 */
export function useTabModels({ monaco, editorInstance, tabs, enabled, pathFor }: {
    monaco: MonacoApi | null;
    editorInstance: editor.IStandaloneCodeEditor | null;
    tabs: readonly ModelTab[];
    enabled: boolean;
    pathFor: (tab: ModelTab) => string;
}) {
    /** The text each tab's model was last known to hold (same string: nothing to compare). */
    const synced = useRef(new Map<string, string>());
    /** Models created here, freed when the editor page goes away (unless an editor still shows one). */
    const created = useRef(new Set<editor.ITextModel>());
    const monacoRef = useRef(monaco);
    useEffect(() => {
        monacoRef.current = monaco;
    }, [monaco]);
    useEffect(() => {
        const models = created.current;
        const api = monacoRef;
        return () => {
            const shown = new Set(api.current?.editor.getEditors().map((instance) => instance.getModel()) ?? []);
            for (const model of models) if (!model.isDisposed() && !shown.has(model)) model.dispose();
            models.clear();
        };
    }, []);

    useEffect(() => {
        if (!monaco || !enabled) return;
        // After the editor applied its own changes (tab switches, typing).
        const timer = window.setTimeout(() => {
            const shown = editorInstance?.getModel() ?? null;
            const known = new Set(monaco.languages.getLanguages().map((language: { id: string }) => language.id));
            const ids = new Set<string>();
            for (const tab of tabs) {
                ids.add(tab.id);
                const uri = monaco.Uri.parse(pathFor(tab));
                const language = monacoLanguageOf(tab.lang);
                const model = monaco.editor.getModel(uri);
                if (!model) {
                    created.current.add(monaco.editor.createModel(tab.code, language, uri));
                    synced.current.set(tab.id, tab.code);
                    continue;
                }
                if (model.isDisposed() || model === shown) continue;
                if (known.has(language) && model.getLanguageId() !== language) monaco.editor.setModelLanguage(model, language);
                if (synced.current.get(tab.id) === tab.code) continue;
                // Changed outside the editor (saving's clean-ups, Hanogt AI, a live session's end): undoable.
                replaceModelText(model, tab.code);
                synced.current.set(tab.id, tab.code);
            }
            for (const id of [...synced.current.keys()]) if (!ids.has(id)) synced.current.delete(id);
            for (const model of [...created.current]) if (model.isDisposed()) created.current.delete(model);
        }, 120);
        return () => window.clearTimeout(timer);
    }, [monaco, editorInstance, tabs, enabled, pathFor]);
}
