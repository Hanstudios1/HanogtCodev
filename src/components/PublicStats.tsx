"use client";

import { animate, motion, useInView, useMotionValue, useReducedMotionConfig, useTransform } from "framer-motion";
import { useEffect, useRef, useState } from "react";

export type PublicStatKey = "users" | "projects" | "gameProjects" | "arcadeGames" | "mediaPosts" | "groups";
export type PublicStats = Record<PublicStatKey, number | null> & { generatedAt: string | null };

export const PUBLIC_STAT_KEYS: readonly PublicStatKey[] = ["users", "projects", "gameProjects", "arcadeGames", "mediaPosts", "groups"];

const STATS_TTL_MS = 10 * 60_000;
// Module scope: the numbers survive client-side navigation between pages.
let statsMemo: { at: number; stats: PublicStats } | null = null;

function parsePublicStats(value: unknown): PublicStats | null {
    if (!value || typeof value !== "object") return null;
    const source = value as Record<string, unknown>;
    const counts = Object.fromEntries(PUBLIC_STAT_KEYS.map((key) => {
        const count = source[key];
        return [key, typeof count === "number" && Number.isFinite(count) && count >= 0 ? Math.trunc(count) : null];
    })) as Record<PublicStatKey, number | null>;
    if (!PUBLIC_STAT_KEYS.some((key) => counts[key] !== null)) return null;
    return { ...counts, generatedAt: typeof source.generatedAt === "string" ? source.generatedAt : null };
}

function freshMemo() {
    return statsMemo && Date.now() - statsMemo.at < STATS_TTL_MS ? statsMemo.stats : undefined;
}

/** undefined while loading; null when there are no numbers (offline, desktop app, server error). */
export function usePublicStats() {
    const [stats, setStats] = useState<PublicStats | null | undefined>(freshMemo);
    useEffect(() => {
        if (freshMemo()) return;
        const controller = new AbortController();
        fetch("/api/stats/public", { signal: controller.signal, headers: { Accept: "application/json" } })
            .then((response) => (response.ok ? response.json() as Promise<unknown> : null))
            .then((data) => {
                const parsed = parsePublicStats(data);
                if (parsed) statsMemo = { at: Date.now(), stats: parsed };
                setStats(parsed);
            })
            .catch(() => {
                if (!controller.signal.aborted) setStats(null);
            });
        return () => controller.abort();
    }, []);
    return stats;
}

const numberFormats = new Map<string, Intl.NumberFormat>();

export function formatCount(value: number, locale: string, compact: boolean) {
    const id = `${locale}|${compact}`;
    let format = numberFormats.get(id);
    if (!format) {
        try {
            format = new Intl.NumberFormat(locale, compact ? { notation: "compact", maximumFractionDigits: 1 } : undefined);
        } catch {
            format = new Intl.NumberFormat("en-US");
        }
        numberFormats.set(id, format);
    }
    return format.format(value);
}

/** Counts up to `value` the first time it scrolls into view (instantly with reduced motion). */
export function CountUp({ value, locale }: { value: number; locale: string }) {
    const ref = useRef<HTMLSpanElement | null>(null);
    const inView = useInView(ref, { once: true, margin: "-40px" });
    const reduceMotion = useReducedMotionConfig();
    const progress = useMotionValue(0);
    const compact = value >= 10_000;
    const text = useTransform(progress, (latest) => formatCount(Math.round(latest), locale, compact));
    useEffect(() => {
        if (!inView) return;
        if (reduceMotion) {
            progress.set(value);
            return;
        }
        const controls = animate(progress, value, { duration: 1.4, ease: [0.22, 1, 0.36, 1] });
        return () => controls.stop();
    }, [inView, reduceMotion, value, progress]);
    // The digits run from zero while they animate, so assistive technology reads the final number instead.
    return (
        <>
            <motion.span ref={ref} aria-hidden="true" className="tabular-nums">{text}</motion.span>
            <span className="sr-only">{formatCount(value, locale, compact)}</span>
        </>
    );
}
