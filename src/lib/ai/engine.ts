/**
 * Hanogt AI's engines. The standard engine is the OpenAI-compatible model in
 * src/lib/server/hanogt-ai.ts (Groq by default); the advanced code engine is
 * Claude (src/lib/server/claude-engine.ts), used only when the server has
 * ANTHROPIC_API_KEY and the team keeps it switched on (Admin › Subscriptions ›
 * Hanogt AI engine, site_config/ai_engine). Each plan gets a number of advanced
 * answers a day; past it, answers come from the standard engine again.
 * Client-safe: types, defaults, normalization and which messages go where.
 */
import { PLAN_IDS, type PlanId } from "@/lib/plans";
import type { UsageWindow } from "./usage";

export const ENGINE_EFFORTS = ["low", "medium", "high", "xhigh", "max"] as const;
export type EngineEffort = (typeof ENGINE_EFFORTS)[number];

/** "code": code and security work only · "all": every message of the chat. */
export const ENGINE_SCOPES = ["code", "all"] as const;
export type EngineScope = (typeof ENGINE_SCOPES)[number];

export type AiEngineSettings = {
    /** The team's switch; the engine also needs ANTHROPIC_API_KEY on the server. */
    enabled: boolean;
    model: string;
    effort: EngineEffort;
    scope: EngineScope;
    /** Advanced answers each plan gets in 24 hours (0: none). */
    daily: Record<PlanId, number>;
};

export const DEFAULT_ENGINE_MODEL = "claude-opus-5-5";
export const ENGINE_DAILY_MAX = 1_000;
export const ENGINE_MODEL_PATTERN = /^claude-[a-z0-9][a-z0-9.-]{2,62}$/;

export const DEFAULT_ENGINE_SETTINGS: AiEngineSettings = {
    enabled: true,
    model: DEFAULT_ENGINE_MODEL,
    effort: "medium",
    scope: "code",
    daily: { free: 3, plus: 25, pro: 100 },
};

export function isEngineEffort(value: unknown): value is EngineEffort {
    return typeof value === "string" && (ENGINE_EFFORTS as readonly string[]).includes(value);
}

export function isEngineScope(value: unknown): value is EngineScope {
    return typeof value === "string" && (ENGINE_SCOPES as readonly string[]).includes(value);
}

export function isEngineModel(value: unknown): value is string {
    return typeof value === "string" && ENGINE_MODEL_PATTERN.test(value);
}

function dailyOf(value: unknown, fallback: number) {
    return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= ENGINE_DAILY_MAX ? value : fallback;
}

/** Stored settings, with anything missing or malformed taken from `fallback`. */
export function normalizeEngineSettings(value: unknown, fallback: AiEngineSettings = DEFAULT_ENGINE_SETTINGS): AiEngineSettings {
    const record = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
    const daily = record.daily && typeof record.daily === "object" && !Array.isArray(record.daily) ? record.daily as Record<string, unknown> : {};
    return {
        enabled: typeof record.enabled === "boolean" ? record.enabled : fallback.enabled,
        model: isEngineModel(record.model) ? record.model : fallback.model,
        effort: isEngineEffort(record.effort) ? record.effort : fallback.effort,
        scope: isEngineScope(record.scope) ? record.scope : fallback.scope,
        daily: Object.fromEntries(PLAN_IDS.map((plan) => [plan, dailyOf(daily[plan], fallback.daily[plan])])) as Record<PlanId, number>,
    };
}

/** The admin's input, strictly: every field present and valid, or null. */
export function readEngineSettingsInput(value: unknown): AiEngineSettings | null {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const record = value as Record<string, unknown>;
    const daily = record.daily && typeof record.daily === "object" && !Array.isArray(record.daily) ? record.daily as Record<string, unknown> : null;
    if (typeof record.enabled !== "boolean" || !isEngineModel(record.model) || !isEngineEffort(record.effort) || !isEngineScope(record.scope) || !daily) return null;
    const limits = PLAN_IDS.map((plan) => daily[plan]);
    if (!limits.every((limit) => typeof limit === "number" && Number.isInteger(limit) && limit >= 0 && limit <= ENGINE_DAILY_MAX)) return null;
    return {
        enabled: record.enabled,
        model: record.model,
        effort: record.effort,
        scope: record.scope,
        daily: Object.fromEntries(PLAN_IDS.map((plan, index) => [plan, limits[index]])) as Record<PlanId, number>,
    };
}

// Programming words (Turkish and English, with Turkish suffixes); words with an everyday meaning
// too ("dizi", "sınıf", "program") are left out. Matched between non-letters without \b (ASCII
// only) or a lookbehind (older Safari can't parse it).
const CODING_TERMS = [
    "python", "javascript", "typescript", "java", "kotlin", "swift", "rust", "golang", "c\\+\\+", "c#", "php", "ruby", "lua", "sql",
    "html", "css", "react", "next\\.?js", "node(?:\\.?js)?", "django", "flask", "unity", "regex", "json", "yaml", "api", "sdk",
    "algoritma\\p{L}*", "algorithm\\p{L}*", "fonksiyon\\p{L}*", "function\\p{L}*", "metot\\p{L}*", "metod\\p{L}*", "method\\p{L}*",
    "değişken\\p{L}*", "variable\\p{L}*", "döngü\\p{L}*", "loop\\p{L}*", "array\\p{L}*", "class\\p{L}*", "derle\\p{L}*", "compile\\p{L}*",
    "debug\\p{L}*", "hata ayıkla\\p{L}*", "refactor\\p{L}*", "kod\\p{L}*", "code\\p{L}*", "programla\\p{L}*", "programming",
    "script\\p{L}*", "betik\\p{L}*", "unit test\\p{L}*",
];
const CODING_WORDS = new RegExp(`(?:^|[^\\p{L}\\p{N}_])(?:${CODING_TERMS.join("|")})(?=$|[^\\p{L}\\p{N}_])`, "iu");

// Error output people paste: stack traces and compiler or runtime messages.
const ERROR_TRACE = /Traceback \(most recent call last\)|Exception in thread|\bat [\w$.<>]+\([^()\n]*:\d+(?::\d+)?\)|\b(?:SyntaxError|TypeError|ReferenceError|RangeError|ValueError|KeyError|IndexError|AttributeError|NameError|NullPointerException|ClassNotFoundException|IndentationError|ModuleNotFoundError|Segmentation fault|panic:)|error(?:\[E\d{4}\]| TS\d{4}|: expected|: cannot find symbol)|undefined reference to/;

const CODE_LINE = /[;{}]\s*$|^\s*(?:def|class|function|const|let|var|import|from|export|public|private|protected|static|#include|using|fn|func|package|return|if|elif|else|for|while|switch|case|try|catch|SELECT|INSERT|UPDATE|CREATE)\b|=>|\bconsole\.log\(|\bprint\(/;

/** Code in a message: a fenced block, an error trace or several lines that look like code. */
export function looksLikeCode(text: string) {
    if (text.includes("```") || ERROR_TRACE.test(text)) return true;
    return text.split("\n").filter((line) => CODE_LINE.test(line)).length >= 3;
}

/** A question about programming, even without code in it. */
export function looksLikeCodingQuestion(text: string) {
    return looksLikeCode(text) || CODING_WORDS.test(text);
}

/**
 * Whether a chat message goes to the advanced engine: with the "code" scope,
 * Code and Security mode, an attached or open editor file, and messages with
 * code, an error trace or a programming question; with "all", every message.
 */
export function wantsAdvancedEngine(input: { scope: EngineScope; mode: "general" | "code" | "security"; hasFile: boolean; message: string }) {
    if (input.scope === "all") return true;
    if (input.mode !== "general" || input.hasFile) return true;
    return looksLikeCodingQuestion(input.message);
}

/**
 * Which engine wrote an answer (X-Hanogt-AI-Engine), why the advanced one
 * didn't when it was wanted (X-Hanogt-AI-Engine-Note: its daily allowance was
 * used up, or it failed and the standard engine answered), and after an
 * advanced answer its 24-hour window, for the usage meter.
 */
export type AiEngineId = "standard" | "advanced";
export type AiEngineNote = "quota" | "unavailable";
export const ENGINE_HEADERS = {
    engine: "X-Hanogt-AI-Engine",
    note: "X-Hanogt-AI-Engine-Note",
    limit: "X-Hanogt-AI-Engine-Limit",
    remaining: "X-Hanogt-AI-Engine-Remaining",
    reset: "X-Hanogt-AI-Engine-Reset",
} as const;

export function engineWindowHeaders(window: UsageWindow): Record<string, string> {
    return {
        [ENGINE_HEADERS.limit]: String(window.limit),
        [ENGINE_HEADERS.remaining]: String(window.remaining),
        ...(window.resetsAt ? { [ENGINE_HEADERS.reset]: window.resetsAt } : {}),
    };
}

const headerCount = (value: string | null) => {
    const number = Number(value ?? "x");
    return Number.isInteger(number) && number >= 0 && number <= 1_000_000 ? number : null;
};

export function readEngineHeaders(headers: { get(name: string): string | null }): { engine: AiEngineId; note: AiEngineNote | null; window: UsageWindow | null } {
    const engine = headers.get(ENGINE_HEADERS.engine) === "advanced" ? "advanced" : "standard";
    const note = headers.get(ENGINE_HEADERS.note);
    const limit = headerCount(headers.get(ENGINE_HEADERS.limit));
    const remaining = headerCount(headers.get(ENGINE_HEADERS.remaining));
    const reset = headers.get(ENGINE_HEADERS.reset);
    const window = limit !== null && remaining !== null && remaining <= limit
        ? { limit, used: limit - remaining, remaining, resetsAt: reset && reset.length <= 40 && Number.isFinite(Date.parse(reset)) ? reset : null }
        : null;
    return { engine, note: note === "quota" || note === "unavailable" ? note : null, window };
}
