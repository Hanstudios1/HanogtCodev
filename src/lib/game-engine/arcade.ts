/**
 * Leaderboards and achievements of a game (V5), shared by the engine, the
 * editor and the server. The author defines them in the project settings;
 * scripts report scores and unlocks (Leaderboard.Submit, Achievements.Unlock)
 * and the Arcade stores them for signed-in players. The server checks every
 * score against the definitions of the published game, so the bounds and the
 * minimum play time below are rules, not hints.
 */
import type { ArcadeAchievement, ArcadeLeaderboard, ArcadeSettings } from "./types";

export const ARCADE_LIMITS = {
    leaderboards: 5,
    achievements: 30,
    idLength: 32,
    nameLength: 40,
    descriptionLength: 120,
    /** Longest minimum play time an author can ask for (seconds). */
    maxPlaySeconds: 3600,
    /** Scores and bounds stay within ±this. */
    scoreBound: 1_000_000_000,
} as const;

/** Ids scripts use ("main", "best-time", "coins_100"). */
export const ARCADE_ID = /^[a-z0-9][a-z0-9_-]{0,31}$/;

export const LEADERBOARD_ORDERS = ["desc", "asc"] as const;
export const LEADERBOARD_FORMATS = ["number", "time"] as const;

/** An id as typed ("Best Time" → "best-time"); null when nothing usable is left. */
export function cleanArcadeId(value: unknown): string | null {
    if (typeof value !== "string") return null;
    const id = value.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9_-]/g, "").slice(0, ARCADE_LIMITS.idLength);
    return ARCADE_ID.test(id) ? id : null;
}

export function emptyArcadeSettings(): ArcadeSettings {
    return { leaderboards: [], achievements: [] };
}

export function createLeaderboard(id: string, name = ""): ArcadeLeaderboard {
    return { id, name: name || id, order: "desc", format: "number", minScore: 0, maxScore: 1_000_000, minPlaySeconds: 10 };
}

export function createAchievement(id: string, name = ""): ArcadeAchievement {
    return { id, name: name || id, description: "", hidden: false };
}

/** A score with at most three decimals (what is stored and compared). */
export function roundScore(value: number): number {
    return Math.round(value * 1000) / 1000;
}

const line = (value: unknown, fallback: string, max: number) => {
    const clean = typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max) : "";
    return clean || fallback;
};

const bound = (value: unknown, fallback: number) => {
    const number = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
    return Number.isFinite(number) ? roundScore(Math.min(ARCADE_LIMITS.scoreBound, Math.max(-ARCADE_LIMITS.scoreBound, number))) : fallback;
};

const record = (value: unknown): Record<string, unknown> => (value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {});

function normalizeLeaderboard(value: unknown): ArcadeLeaderboard | null {
    const source = record(value);
    const id = cleanArcadeId(source.id);
    if (!id) return null;
    let minScore = bound(source.minScore, 0);
    let maxScore = bound(source.maxScore, 1_000_000);
    if (minScore > maxScore) [minScore, maxScore] = [maxScore, minScore];
    const seconds = Number(source.minPlaySeconds);
    return {
        id,
        name: line(source.name, id, ARCADE_LIMITS.nameLength),
        order: source.order === "asc" ? "asc" : "desc",
        format: source.format === "time" ? "time" : "number",
        minScore,
        maxScore,
        minPlaySeconds: Number.isFinite(seconds) ? Math.min(ARCADE_LIMITS.maxPlaySeconds, Math.max(0, Math.round(seconds))) : 10,
    };
}

function normalizeAchievement(value: unknown): ArcadeAchievement | null {
    const source = record(value);
    const id = cleanArcadeId(source.id);
    if (!id) return null;
    return {
        id,
        name: line(source.name, id, ARCADE_LIMITS.nameLength),
        description: line(source.description, "", ARCADE_LIMITS.descriptionLength),
        hidden: source.hidden === true,
    };
}

/** Valid, unique boards and achievements within the limits; anything else is dropped. */
export function normalizeArcadeSettings(value: unknown): ArcadeSettings {
    const source = record(value);
    const take = <T extends { id: string }>(items: unknown, normalize: (item: unknown) => T | null, max: number) => {
        const result: T[] = [];
        for (const item of Array.isArray(items) ? items : []) {
            if (result.length >= max) break;
            const clean = normalize(item);
            if (clean && !result.some((existing) => existing.id === clean.id)) result.push(clean);
        }
        return result;
    };
    return {
        leaderboards: take(source.leaderboards, normalizeLeaderboard, ARCADE_LIMITS.leaderboards),
        achievements: take(source.achievements, normalizeAchievement, ARCADE_LIMITS.achievements),
    };
}

/** `score` beats `best` on a board of this order (anything beats no score). */
export function isBetterScore(order: ArcadeLeaderboard["order"], score: number, best: number | null | undefined): boolean {
    if (best === null || best === undefined || !Number.isFinite(best)) return true;
    return order === "asc" ? score < best : score > best;
}

/** Within the board's bounds (after rounding, like the server). */
export function scoreInRange(board: Pick<ArcadeLeaderboard, "minScore" | "maxScore">, score: number): boolean {
    if (!Number.isFinite(score)) return false;
    const value = roundScore(score);
    return value >= board.minScore && value <= board.maxScore;
}

/** A score as players read it: "12,500" or, for times, "1:23.46". */
export function formatArcadeScore(value: number, format: ArcadeLeaderboard["format"], locale = "en"): string {
    if (!Number.isFinite(value)) return "—";
    if (format === "time") {
        const sign = value < 0 ? "-" : "";
        const hundredths = Math.round(Math.abs(value) * 100);
        const hours = Math.floor(hundredths / 360_000);
        const minutes = Math.floor((hundredths % 360_000) / 6000);
        const seconds = Math.floor((hundredths % 6000) / 100);
        const fraction = String(hundredths % 100).padStart(2, "0");
        const pad = (number: number) => String(number).padStart(2, "0");
        return hours ? `${sign}${hours}:${pad(minutes)}:${pad(seconds)}.${fraction}` : `${sign}${minutes}:${pad(seconds)}.${fraction}`;
    }
    try {
        return new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(value);
    } catch {
        return String(value);
    }
}
