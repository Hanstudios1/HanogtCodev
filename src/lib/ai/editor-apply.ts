"use client";

/**
 * "Apply to editor" between Hanogt AI and the code editor on the same page:
 * the chat asks, the editor answers at once (window events are synchronous,
 * so the answer is written into the event's detail). The editor checks that
 * the file is still the one Hanogt AI read; when it changed since, the chat
 * asks the person before applying anyway.
 */
import { useEffect, useRef } from "react";

const APPLY_EVENT = "hanogt:ai-apply";

export interface ApplyRequest {
    /** The editor tab the file came from, else found by its name. */
    tabId?: string;
    fileName: string;
    /** The file as Hanogt AI read it. */
    base: string;
    /** The file after the change. */
    code: string;
    /** Apply even though the file changed since Hanogt AI read it. */
    force?: boolean;
}

/** applied · changed: the file isn't what Hanogt AI read (ask, then force) · missing: no editor or no such file. */
export type ApplyStatus = "applied" | "changed" | "missing";

type ApplyDetail = { request: ApplyRequest; status: ApplyStatus | null };

/** Asks the editor on this page to apply a change; "missing" when no editor answered. */
export function requestApply(request: ApplyRequest): ApplyStatus {
    const detail: ApplyDetail = { request, status: null };
    window.dispatchEvent(new CustomEvent<ApplyDetail>(APPLY_EVENT, { detail }));
    return detail.status ?? "missing";
}

/** The editor's side: `handle` applies a request (or says why not) and returns the status. */
export function useApplyRequests(handle: (request: ApplyRequest) => ApplyStatus) {
    const ref = useRef(handle);
    useEffect(() => {
        ref.current = handle;
    });
    useEffect(() => {
        const listener = (event: Event) => {
            const detail = (event as CustomEvent<ApplyDetail>).detail;
            if (!detail || detail.status !== null || !detail.request) return;
            detail.status = ref.current(detail.request);
        };
        window.addEventListener(APPLY_EVENT, listener);
        return () => window.removeEventListener(APPLY_EVENT, listener);
    }, []);
}
