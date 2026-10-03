/**
 * Hanogt AI settings kept with the account (users/{email}.aiSettings, written
 * only by PUT /api/ai/settings): how answers should sound (the person's own
 * instructions, tone, length, a fixed answer language) and the defaults a
 * device starts with (answer mode, model, attaching the open file, agent
 * mode). A choice made on the device itself wins over these defaults. No
 * hooks: the routes import this too.
 */
import { AGENT_MODES, DEFAULT_AGENT_MODE, isAgentMode, type AgentMode } from "./agent-tools";
import { DEFAULT_CONNECTION, isConnectionId } from "./connections";
import { PLAN_AI_FEATURES, type PlanId } from "@/lib/plans";

export const AI_TONES = ["balanced", "friendly", "professional"] as const;
export type AiTone = (typeof AI_TONES)[number];
export const AI_LENGTHS = ["short", "normal", "detailed"] as const;
export type AiLength = (typeof AI_LENGTHS)[number];
export const AI_ANSWER_MODES = ["general", "code", "security"] as const;
export type AiAnswerModeSetting = (typeof AI_ANSWER_MODES)[number];

export type AiSettings = {
    /** What the person wants Hanogt AI to know about them. */
    about: string;
    /** How they want answers written. */
    style: string;
    tone: AiTone;
    length: AiLength;
    /** "site": answer in the site's language; else a fixed language code (TR, EN, DE…). */
    language: string;
    /** The answer mode a new chat starts in. */
    defaultMode: AiAnswerModeSetting;
    /** "hanogt" (Hanogt AI's model) or the id of one of the person's own connections. */
    defaultModel: string;
    /** Whether the open editor file goes with questions by default. */
    attachEditorFile: boolean;
    agentMode: AgentMode;
};

export const DEFAULT_AI_SETTINGS: AiSettings = {
    about: "",
    style: "",
    tone: "balanced",
    length: "normal",
    language: "site",
    defaultMode: "general",
    defaultModel: DEFAULT_CONNECTION,
    attachEditorFile: true,
    agentMode: DEFAULT_AGENT_MODE,
};

/** The longest instruction any plan allows (Pro); a stored text is cut to the person's plan when used. */
export const AI_INSTRUCTIONS_MAX = Math.max(...Object.values(PLAN_AI_FEATURES).map((features) => features.instructionsChars));

const SETTING_KEYS = Object.keys(DEFAULT_AI_SETTINGS) as Array<keyof AiSettings>;

/** Text without control characters (line breaks kept), trimmed. */
function cleanText(value: string) {
    return value.replace(/\r\n?/g, "\n").replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, "").trim();
}

const isLanguageSetting = (value: unknown): value is string => value === "site" || (typeof value === "string" && /^[A-Z]{2}$/.test(value));
const oneOf = <T extends string>(list: readonly T[], value: unknown): value is T => typeof value === "string" && (list as readonly string[]).includes(value);

/**
 * Stored settings as they apply on `plan`: unknown or broken fields fall back
 * to the defaults and the instructions are cut to the plan's length (500,
 * 1,500 or 3,000 characters).
 */
export function normalizeAiSettings(value: unknown, plan: PlanId): AiSettings {
    const record = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
    const max = PLAN_AI_FEATURES[plan].instructionsChars;
    const text = (input: unknown) => (typeof input === "string" ? cleanText(input).slice(0, max) : "");
    return {
        about: text(record.about),
        style: text(record.style),
        tone: oneOf(AI_TONES, record.tone) ? record.tone : DEFAULT_AI_SETTINGS.tone,
        length: oneOf(AI_LENGTHS, record.length) ? record.length : DEFAULT_AI_SETTINGS.length,
        language: isLanguageSetting(record.language) ? record.language : DEFAULT_AI_SETTINGS.language,
        defaultMode: oneOf(AI_ANSWER_MODES, record.defaultMode) ? record.defaultMode : DEFAULT_AI_SETTINGS.defaultMode,
        defaultModel: record.defaultModel === DEFAULT_CONNECTION || isConnectionId(record.defaultModel) ? record.defaultModel : DEFAULT_CONNECTION,
        attachEditorFile: typeof record.attachEditorFile === "boolean" ? record.attachEditorFile : DEFAULT_AI_SETTINGS.attachEditorFile,
        agentMode: isAgentMode(record.agentMode) ? record.agentMode : DEFAULT_AI_SETTINGS.agentMode,
    };
}

export type AiSettingsInputError = "unknown_field" | "invalid_value" | "too_long";

/**
 * A PUT body checked strictly: every field must be a known one with a valid
 * value, and instructions must fit the plan (the page shows the limit).
 */
export function parseAiSettingsInput(value: unknown, plan: PlanId): { ok: true; settings: AiSettings } | { ok: false; code: AiSettingsInputError; field?: string; limit?: number } {
    if (!value || typeof value !== "object" || Array.isArray(value)) return { ok: false, code: "invalid_value" };
    const record = value as Record<string, unknown>;
    const unknown = Object.keys(record).find((key) => !(SETTING_KEYS as string[]).includes(key));
    if (unknown) return { ok: false, code: "unknown_field", field: unknown.slice(0, 40) };
    const limit = PLAN_AI_FEATURES[plan].instructionsChars;
    for (const field of ["about", "style"] as const) {
        if (field in record && typeof record[field] !== "string") return { ok: false, code: "invalid_value", field };
        if (typeof record[field] === "string" && cleanText(record[field]).length > limit) return { ok: false, code: "too_long", field, limit };
    }
    const checks: Record<Exclude<keyof AiSettings, "about" | "style">, (input: unknown) => boolean> = {
        tone: (input) => oneOf(AI_TONES, input),
        length: (input) => oneOf(AI_LENGTHS, input),
        language: isLanguageSetting,
        defaultMode: (input) => oneOf(AI_ANSWER_MODES, input),
        defaultModel: (input) => input === DEFAULT_CONNECTION || isConnectionId(input),
        attachEditorFile: (input) => typeof input === "boolean",
        agentMode: (input) => oneOf(AGENT_MODES, input),
    };
    for (const [field, check] of Object.entries(checks)) {
        if (field in record && !check(record[field])) return { ok: false, code: "invalid_value", field };
    }
    return { ok: true, settings: normalizeAiSettings({ ...DEFAULT_AI_SETTINGS, ...record }, plan) };
}

/** GET and PUT /api/ai/settings. */
export type AiSettingsResponse = {
    settings: AiSettings;
    /** Characters each instruction may have on the person's plan. */
    instructionsLimit: number;
    plan: PlanId;
    updatedAt: string | null;
};
