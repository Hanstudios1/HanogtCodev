"use client";

/**
 * Watch panel (V4): live values of the running game, such as "Player.score",
 * "Player.transform.position" or "Time.time", with a short history line for
 * numbers. Watches are kept per project on this device.
 */
import { Eye, Plus, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type MutableRefObject } from "react";
import type { GamePlayer } from "@/lib/game-engine/player/game-player";
import { readWatch, watchSuggestions, type WatchResult } from "@/lib/game-engine/runtime/watch";
import { describeBehaviour } from "@/lib/game-engine/script/compiler";
import { useEditor } from "./context";
import { activeScene } from "./operations";
import { useEditorState } from "./store";
import { IconButton, PanelHeader, cx, inputClass } from "./ui";

const MAX_WATCHES = 30;
const HISTORY = 60;
/** Asks the editor to show the Watch panel (after the Inspector's eye button added a watch). */
export const SHOW_WATCH_EVENT = "hanogt-engine:show-watch";

// Watches of each project, kept on this device and shared by the panel and the Inspector.
const watchCache = new Map<string, string[]>();
const watchListeners = new Set<() => void>();
const EMPTY: string[] = [];

function storageKey(projectId: string) {
    return `hanogt-engine:watch:${projectId}`;
}

function readWatches(projectId: string): string[] {
    const cached = watchCache.get(projectId);
    if (cached) return cached;
    let list: string[] = EMPTY;
    try {
        const raw = JSON.parse(localStorage.getItem(storageKey(projectId)) ?? "[]") as unknown;
        if (Array.isArray(raw)) list = raw.filter((item): item is string => typeof item === "string" && item.length <= 200).slice(0, MAX_WATCHES);
    } catch {
        // Private mode or bad data: start empty.
    }
    watchCache.set(projectId, list);
    return list;
}

function writeWatches(projectId: string, list: string[]) {
    watchCache.set(projectId, list);
    try {
        if (list.length) localStorage.setItem(storageKey(projectId), JSON.stringify(list));
        else localStorage.removeItem(storageKey(projectId));
    } catch {
        // Private mode: watches last for this visit only.
    }
    for (const listener of watchListeners) listener();
}

/** Adds a watch to a project (no effect when it's already there or the list is full). */
export function addWatch(projectId: string, value: string) {
    const path = value.trim().replace(/\s*\.\s*/g, ".");
    const current = readWatches(projectId);
    if (!path || current.includes(path) || current.length >= MAX_WATCHES) return false;
    writeWatches(projectId, [...current, path]);
    return true;
}

function useWatches(projectId: string) {
    return useSyncExternalStore(
        (listener) => {
            watchListeners.add(listener);
            return () => watchListeners.delete(listener);
        },
        () => readWatches(projectId),
        () => EMPTY,
    );
}

/** A small line of the last values of a number. */
function Sparkline({ values }: { values: number[] }) {
    if (values.length < 2) return <span className="inline-block w-16" />;
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min || 1;
    const points = values.map((value, index) => `${(index / (HISTORY - 1)) * 64},${16 - ((value - min) / span) * 14 - 1}`).join(" ");
    return (
        <svg width="64" height="16" viewBox="0 0 64 16" className="shrink-0 text-teal-300/80" aria-hidden>
            <polyline points={points} fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinejoin="round" strokeLinecap="round" />
        </svg>
    );
}

const KIND_CLASS: Record<string, string> = {
    number: "text-sky-300",
    bool: "text-violet-300",
    string: "text-amber-300",
    vector: "text-teal-300",
    object: "text-zinc-200",
    null: "text-zinc-500",
};

export default function WatchPanel({ controlRef }: { controlRef: MutableRefObject<GamePlayer | null> }) {
    const { store, t, playing, program } = useEditor();
    const projectId = useEditorState(store, (state) => state.project.id);
    const project = useEditorState(store, (state) => state.project);
    const watches = useWatches(projectId);
    const [draft, setDraft] = useState("");
    const [results, setResults] = useState<Record<string, { result: WatchResult; series: number[] }>>({});
    const [liveSuggestions, setLiveSuggestions] = useState<string[]>([]);
    const history = useRef(new Map<string, number[]>());

    const add = (value: string) => {
        addWatch(projectId, value);
        setDraft("");
    };

    // Live values, about seven times a second while the game runs.
    useEffect(() => {
        if (!playing) {
            history.current.clear();
            return;
        }
        let lastSuggest = 0;
        const read = () => {
            const world = controlRef.current?.world;
            if (!world) return;
            const next: Record<string, { result: WatchResult; series: number[] }> = {};
            for (const path of watches) {
                const result = readWatch(world, path);
                const line = history.current.get(path) ?? [];
                if (result.ok && result.number !== null) {
                    line.push(result.number);
                    if (line.length > HISTORY) line.shift();
                    history.current.set(path, line);
                }
                next[path] = { result, series: [...line] };
            }
            setResults(next);
            const now = Date.now();
            if (now - lastSuggest > 2000) {
                lastSuggest = now;
                setLiveSuggestions(watchSuggestions(world));
            }
        };
        read();
        const timer = window.setInterval(read, 150);
        return () => window.clearInterval(timer);
    }, [playing, watches, controlRef]);

    // Before the game runs: the scene's objects with their scripts' fields.
    const staticSuggestions = useMemo(() => {
        const output: string[] = [];
        for (const entity of activeScene(project).objects) {
            for (const component of entity.components) {
                if (component.type !== "script") continue;
                const className = component.className ?? (program.behavioursByScript.get(component.scriptId) ?? [])[0];
                if (!className) continue;
                for (const field of describeBehaviour(program, className)) output.push(`${entity.name}.${field.name}`);
            }
            output.push(`${entity.name}.transform.position`);
            if (output.length > 80) break;
        }
        return [...output, "Time.time", "Time.timeScale"];
    }, [project, program]);
    const suggestions = playing && liveSuggestions.length ? liveSuggestions : staticSuggestions;

    const remove = (path: string) => {
        writeWatches(projectId, watches.filter((item) => item !== path));
        history.current.delete(path);
    };

    return (
        <div className="flex h-full min-h-0 flex-col" data-watch-panel>
            <PanelHeader>
                <Eye className="h-3.5 w-3.5 text-zinc-500" />
                <form
                    className="relative flex min-w-0 flex-1 items-center gap-1"
                    onSubmit={(event) => {
                        event.preventDefault();
                        add(draft);
                    }}
                >
                    <input
                        value={draft}
                        onChange={(event) => setDraft(event.target.value.slice(0, 200))}
                        list="hanogt-watch-suggestions"
                        placeholder={t("watchPlaceholder")}
                        aria-label={t("watchAdd")}
                        spellCheck={false}
                        className={cx(inputClass, "font-mono")}
                    />
                    <datalist id="hanogt-watch-suggestions">{suggestions.map((item) => <option key={item} value={item} />)}</datalist>
                    <IconButton icon={Plus} label={t("watchAdd")} size="sm" disabled={!draft.trim() || watches.length >= MAX_WATCHES} onClick={() => add(draft)} />
                </form>
                {watches.length ? <IconButton icon={Trash2} label={t("watchClear")} size="sm" tone="danger" onClick={() => {
                    writeWatches(projectId, []);
                    history.current.clear();
                }} /> : null}
            </PanelHeader>
            <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">
                {!watches.length ? (
                    <div className="space-y-1.5 px-3 py-4 text-[12px] leading-relaxed text-zinc-500">
                        <p>{t("watchEmpty")}</p>
                        <p className="font-mono text-[11.5px] text-zinc-400">Player.score · Player.transform.position · Enemy.Rigidbody2D.velocity · GameManager.highScore · Time.time</p>
                    </div>
                ) : (
                    <ul className="divide-y divide-white/[0.04]">
                        {watches.map((path) => {
                            const entry = playing ? results[path] : undefined;
                            const result = entry?.result;
                            return (
                                <li key={path} className="group flex min-h-8 items-center gap-2 px-2 py-1 font-mono text-[11.5px]">
                                    <span className="min-w-0 max-w-[45%] shrink-0 truncate text-zinc-300" title={path}>{path}</span>
                                    <span className="min-w-0 flex-1 truncate" title={result ? (result.ok ? result.text : result.error) : undefined}>
                                        {!result ? <span className="text-zinc-600">—</span> : result.ok ? <span className={KIND_CLASS[result.kind]}>{result.text}</span> : <span className="font-sans text-[11px] text-amber-300/90">{result.error}</span>}
                                    </span>
                                    {result?.ok && result.number !== null ? <Sparkline values={entry?.series ?? []} /> : null}
                                    <IconButton icon={X} label={t("watchRemove")} size="sm" className="opacity-60 group-hover:opacity-100" onClick={() => remove(path)} />
                                </li>
                            );
                        })}
                    </ul>
                )}
                {watches.length && !playing ? <p className="px-3 py-2 text-[11px] text-zinc-500">{t("watchNotPlaying")}</p> : null}
            </div>
        </div>
    );
}
