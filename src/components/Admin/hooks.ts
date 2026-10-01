"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { adminRequest, type ApiFailure } from "./api";

type ResourceState<T> = { key: string | null; data: T | null; error: ApiFailure | null };

/**
 * Loads an admin API resource whenever `path` changes (null pauses loading).
 * `loading` is derived from the requested key, so no state is set
 * synchronously inside the effect. `mutate` updates the loaded data in place
 * (optimistic updates); pass `onlyFor` to ignore it if the data has changed
 * underneath (e.g. a new search) in the meantime.
 */
export function useAdminResource<T>(path: string | null) {
    const [version, setVersion] = useState(0);
    const [state, setState] = useState<ResourceState<T>>({ key: null, data: null, error: null });
    const key = path ? `${version}|${path}` : null;

    useEffect(() => {
        if (!path || !key) return;
        const controller = new AbortController();
        void adminRequest<T>(path, { signal: controller.signal }).then((result) => {
            if (controller.signal.aborted) return;
            setState((previous) => (result.ok
                ? { key, data: result.data, error: null }
                // Keep what was shown before (e.g. the previous search) next to the error.
                : { key, data: previous.data, error: result }));
        });
        return () => controller.abort();
    }, [key, path]);

    const reload = useCallback(() => setVersion((value) => value + 1), []);
    const mutate = useCallback((update: (data: T) => T, onlyFor?: string | null) => {
        setState((previous) => (previous.data === null || (onlyFor !== undefined && previous.key !== onlyFor)
            ? previous
            : { ...previous, data: update(previous.data) }));
    }, []);

    return {
        data: state.data,
        error: state.key === key ? state.error : null,
        loading: key !== null && state.key !== key,
        /** Key of the request the current data belongs to. */
        dataKey: state.key,
        reload,
        mutate,
    };
}

export type AdminResource<T> = ReturnType<typeof useAdminResource<T>>;

export function useDebouncedValue<T>(value: T, delay = 350) {
    const [debounced, setDebounced] = useState(value);
    useEffect(() => {
        const timer = window.setTimeout(() => setDebounced(value), delay);
        return () => window.clearTimeout(timer);
    }, [value, delay]);
    return debounced;
}

function subscribeClock(callback: () => void) {
    const timer = window.setInterval(callback, 30_000);
    return () => window.clearInterval(timer);
}

function clockSnapshot() {
    return Math.floor(Date.now() / 30_000) * 30_000;
}

function serverClock() {
    return 0;
}

/** Current time in 30-second steps (0 during server rendering). */
export function useNow() {
    return useSyncExternalStore(subscribeClock, clockSnapshot, serverClock);
}

const RELATIVE_UNITS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ["year", 31_536_000],
    ["month", 2_592_000],
    ["week", 604_800],
    ["day", 86_400],
    ["hour", 3_600],
    ["minute", 60],
];

export function formatRelativeTime(iso: string | null | undefined, now: number, locale: string) {
    if (!iso || !now) return "";
    const time = Date.parse(iso);
    if (!Number.isFinite(time)) return "";
    const seconds = Math.round((time - now) / 1000);
    try {
        const format = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
        for (const [unit, size] of RELATIVE_UNITS) {
            if (Math.abs(seconds) >= size) return format.format(Math.round(seconds / size), unit);
        }
        return format.format(0, "second");
    } catch {
        return "";
    }
}

export function formatDateTime(iso: string | null | undefined, locale: string) {
    if (!iso) return "";
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return "";
    try {
        return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(date);
    } catch {
        return date.toISOString();
    }
}

export function formatNumber(value: number, locale: string) {
    try {
        return new Intl.NumberFormat(locale).format(value);
    } catch {
        return String(value);
    }
}
