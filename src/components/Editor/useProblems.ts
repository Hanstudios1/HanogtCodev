"use client";

import { useEffect, useMemo, useState } from "react";
import { emptyCounts, groupProblems, type ProblemCounts, type ProblemGroup } from "@/lib/editor/problems";
import type { MonacoApi } from "@/lib/monaco";

export interface ProblemFile {
    tabId: string;
    name: string;
    language: string;
    /** The file's Monaco model path. */
    path: string;
}

const EMPTY: { groups: ProblemGroup[]; counts: ProblemCounts } = { groups: [], counts: emptyCounts() };

/** Monaco's markers (errors, warnings, infos) for the given files, kept up to date. */
export function useProblems(monaco: MonacoApi | null, files: readonly ProblemFile[]) {
    // The file list changes identity on every keystroke; only its content matters here.
    const key = files.map((file) => `${file.tabId}\u0000${file.name}\u0000${file.language}\u0000${file.path}`).join("\n");
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const stableFiles = useMemo(() => files, [key]);
    const [state, setState] = useState(EMPTY);

    useEffect(() => {
        if (!monaco) return;
        let frame = 0;
        const read = () => {
            frame = 0;
            setState(groupProblems(stableFiles.map((file) => ({
                tabId: file.tabId,
                name: file.name,
                language: file.language,
                markers: monaco.editor.getModelMarkers({ resource: monaco.Uri.parse(file.path) }),
            }))));
        };
        const schedule = () => {
            if (!frame) frame = window.requestAnimationFrame(read);
        };
        schedule();
        const subscription = monaco.editor.onDidChangeMarkers(schedule);
        return () => {
            subscription.dispose();
            window.cancelAnimationFrame(frame);
        };
    }, [monaco, stableFiles]);

    return monaco ? state : EMPTY;
}
