"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AUTO_SNAPSHOT_MS, historyFileKey, openLocalHistory, type LocalHistory, type SnapshotReason } from "@/lib/editor/local-history";

export interface HistoryTab {
    id: string;
    name: string;
    lang: string;
    code: string;
}

export type LocalHistoryStatus = "opening" | "ready" | "unavailable";

/**
 * The editor's local history (src/lib/editor/local-history.ts): snapshots of
 * the open files in this browser. `scope` names the workspace (account and
 * project); `draft` marks an unsaved workspace, whose history moves along
 * when it is saved as a project. While `enabled` (the "localHistory"
 * setting) edited files also get a snapshot every few minutes.
 */
export function useLocalHistory({ enabled, scope, draft, tabs }: { enabled: boolean; scope: string; draft: boolean; tabs: readonly HistoryTab[] }) {
    const [store, setStore] = useState<LocalHistory | null>(null);
    const [status, setStatus] = useState<LocalHistoryStatus>("opening");
    /** Changes whenever snapshots were added or removed (the History panel reloads). */
    const [version, setVersion] = useState(0);
    const bump = useCallback(() => setVersion((value) => value + 1), []);

    useEffect(() => {
        let alive = true;
        openLocalHistory().then((history) => {
            if (!alive) return;
            setStore(history);
            setStatus(history ? "ready" : "unavailable");
        }, () => {
            if (alive) setStatus("unavailable");
        });
        return () => {
            alive = false;
        };
    }, []);

    const tabsRef = useRef(tabs);
    const scopeRef = useRef(scope);
    /** Files edited since their last snapshot (by tab id). */
    const edited = useRef(new Set<string>());
    const previousCode = useRef(new Map<string, string>());
    useEffect(() => {
        tabsRef.current = tabs;
        const seen = new Map<string, string>();
        for (const tab of tabs) {
            seen.set(tab.id, tab.code);
            const before = previousCode.current.get(tab.id);
            if (before !== undefined && before !== tab.code) edited.current.add(tab.id);
        }
        previousCode.current = seen;
    }, [tabs]);

    const keyFor = useCallback((name: string) => historyFileKey(scopeRef.current, name), []);

    /** Snapshots the given files (all by default); returns how many were stored (unchanged files are skipped). */
    const snapshot = useCallback(async (reason: SnapshotReason, ids?: readonly string[]): Promise<number> => {
        if (!store) return 0;
        const wanted = ids ? new Set(ids) : null;
        const targets = tabsRef.current.filter((tab) => !wanted || wanted.has(tab.id));
        let stored = 0;
        for (const tab of targets) {
            edited.current.delete(tab.id);
            try {
                if (await store.snapshot({ fileKey: historyFileKey(scopeRef.current, tab.name), name: tab.name, lang: tab.lang, code: tab.code, reason })) stored += 1;
            } catch {
                // Storage full or blocked: the editor keeps working without this snapshot.
            }
        }
        if (stored) bump();
        return stored;
    }, [bump, store]);

    // Every few minutes, the files edited since their last snapshot.
    useEffect(() => {
        if (!enabled || !store) return;
        const timer = window.setInterval(() => {
            const ids = [...edited.current];
            if (ids.length) void snapshot("auto", ids);
        }, AUTO_SNAPSHOT_MS);
        return () => window.clearInterval(timer);
    }, [enabled, snapshot, store]);

    // An unsaved workspace saved as a project (or game script) keeps its history.
    const draftRef = useRef(draft);
    useEffect(() => {
        const previous = scopeRef.current;
        const wasDraft = draftRef.current;
        scopeRef.current = scope;
        draftRef.current = draft;
        if (!store || previous === scope || !wasDraft || draft) return;
        // Only within the same account ("tag|workspace").
        if (previous.split("|")[0] !== scope.split("|")[0]) return;
        void store.moveScope(previous, scope, tabsRef.current.map((tab) => tab.name)).then(bump, () => undefined);
    }, [bump, draft, scope, store]);

    return { store, status, version, snapshot, keyFor, bump };
}
