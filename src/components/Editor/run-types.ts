import type { BrowserStatusCode } from "@/lib/runtimes/browser-runner";
import type { ExecuteJob, RunEngine, SecurityCheck } from "@/services/piston";

/** One file of a run; `job` stays null until it finishes. */
export interface RunEntry {
    tabId: string;
    name: string;
    language: string;
    engine: RunEngine;
    job: ExecuteJob | null;
}

export interface RunState {
    id: number;
    status: "running" | "done";
    startedAt: number;
    finishedAt?: number;
    entries: RunEntry[];
    /** A runtime that is still loading (e.g. Python's first download). */
    loading?: { code: BrowserStatusCode; text: string } | null;
    /** Set when Hanogt Security Bot blocked the server part of the run. */
    security?: SecurityCheck;
    /** An unexpected failure of the whole run. */
    error?: string;
}

export interface HistoryEntry {
    id: number;
    at: number;
    label: string;
    count: number;
    ok: boolean;
    durationMs: number;
}
