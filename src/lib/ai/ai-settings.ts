/**
 * Hanogt AI settings kept with the account (users/{email}.aiSettings, written
 * only by PUT /api/ai/settings): how answers should sound (the person's own
 * instructions, tone, length, a fixed answer language, their level and how
 * they like code), the defaults a device starts with (answer mode, model,
 * what goes with a question, agent mode) and how the chat behaves (send
 * shortcut, artifacts, dictation, reading answers aloud, how long chats are
 * kept). A choice made on the device itself wins over these defaults. No
 * hooks: the routes import this too.
 */
import { AGENT_MODES, DEFAULT_AGENT_MODE, isAgentMode, type AgentMode } from "./agent-tools";
import { DEFAULT_CONNECTION, isConnectionId } from "./connections";
import { THINKING_SETTINGS, type ThinkingSetting } from "./thinking";
import { PLAN_AI_FEATURES, type PlanId } from "@/lib/plans";
import { getLanguage } from "@/lib/runtimes/languages";

export const AI_TONES = ["balanced", "friendly", "professional"] as const;
export type AiTone = (typeof AI_TONES)[number];
export const AI_LENGTHS = ["short", "normal", "detailed"] as const;
export type AiLength = (typeof AI_LENGTHS)[number];
export const AI_ANSWER_MODES = ["general", "code", "security"] as const;
export type AiAnswerModeSetting = (typeof AI_ANSWER_MODES)[number];
export const AI_EXPERTISE = ["beginner", "intermediate", "expert"] as const;
export type AiExpertise = (typeof AI_EXPERTISE)[number];
/** How changes to the open file come back: the whole file, or a unified diff. */
export const AI_CODE_OUTPUTS = ["full", "diff"] as const;
export type AiCodeOutput = (typeof AI_CODE_OUTPUTS)[number];
/** "enter": Enter sends, Shift+Enter is a new line · "mod-enter": Ctrl/Cmd+Enter sends, Enter is a new line. */
export const AI_SEND_SHORTCUTS = ["enter", "mod-enter"] as const;
export type AiSendShortcut = (typeof AI_SEND_SHORTCUTS)[number];
/** Days chats are kept in the browser; 0 keeps them until deleted. */
export const AI_RETENTION_DAYS = [0, 7, 30, 90] as const;
export type AiRetentionDays = (typeof AI_RETENTION_DAYS)[number];
export const AI_ANSWER_FONTS = ["serif", "sans"] as const;
export type AiAnswerFont = (typeof AI_ANSWER_FONTS)[number];
/** How freely Hanogt AI writes: "precise" keeps to the likeliest words, "creative" explores more. */
export const AI_CREATIVITY = ["precise", "balanced", "creative"] as const;
export type AiCreativity = (typeof AI_CREATIVITY)[number];
/** Preferred programming languages (ids of src/lib/runtimes/languages.ts). */
export const AI_PREFERRED_LANGUAGES_MAX = 5;
export const AI_CODE_STYLE_MAX = 300;
export const AI_VOICE_NAME_MAX = 120;
export const AI_VOICE_RATE_MIN = 0.5;
export const AI_VOICE_RATE_MAX = 2;

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
    /** Whether Hanogt AI thinks before answering: "auto" in code and security work and for long questions. */
    thinking: ThinkingSetting;
    /** Show the thinking (and the steps taken) above the answer. */
    showThinking: boolean;
    /** How much the person already knows: explanations are pitched at this level. */
    expertise: AiExpertise;
    /** Language of comments in code: "site" follows the answer language, else a language code (TR, EN…). */
    commentLanguage: string;
    /** Code style wishes (indentation, quotes, naming…), at most 300 characters. */
    codeStyle: string;
    /** Languages to use when a question doesn't name one (up to five language ids). */
    preferredLanguages: string[];
    /** Changes to the open file as the whole file or as a unified diff. */
    codeOutput: AiCodeOutput;
    sendShortcut: AiSendShortcut;
    /** The errors of the editor's last run go with questions about the open file. */
    attachConsoleErrors: boolean;
    /** The names of the project's other files go with questions about the open file. */
    attachProjectTree: boolean;
    /** Long code and pages open in the side panel by themselves. */
    autoOpenArtifacts: boolean;
    /** Language heard by dictation: "site" follows the site, else a BCP 47 tag (tr-TR, en-US…). */
    dictationLanguage: string;
    localRetentionDays: AiRetentionDays;
    /** The voice that reads answers aloud ("" is the device's default for the answer's language). */
    answerVoice: string;
    answerVoiceRate: number;
    /** Answers in a serif (paper) or a sans-serif face. */
    answerFont: AiAnswerFont;
    /** How freely answers are written (the sampling temperature; a smaller step while the agent's tools are on). */
    creativity: AiCreativity;
    /** New chats are kept in this browser; off starts private chats that are never stored. */
    saveHistory: boolean;
    /** A browser notification when an answer finishes while the tab is in the background. */
    notifyOnDone: boolean;
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
    thinking: "auto",
    showThinking: true,
    expertise: "intermediate",
    commentLanguage: "site",
    codeStyle: "",
    preferredLanguages: [],
    codeOutput: "full",
    sendShortcut: "enter",
    attachConsoleErrors: true,
    attachProjectTree: false,
    autoOpenArtifacts: true,
    dictationLanguage: "site",
    localRetentionDays: 0,
    answerVoice: "",
    answerVoiceRate: 1,
    answerFont: "serif",
    creativity: "balanced",
    saveHistory: true,
    notifyOnDone: false,
};

/**
 * The sampling temperature of an answer: the kind of work sets the base (code
 * and agent requests low) and the creativity setting moves it. With the agent's
 * tools on the move is smaller (0.15 to 0.5) so proposed actions stay exact.
 */
export function answerTemperature(creativity: AiCreativity, kind: "chat" | "code" | "agent") {
    const base = kind === "agent" ? 0.3 : kind === "code" ? 0.25 : 0.45;
    const shift = kind === "agent"
        ? creativity === "precise" ? -0.15 : creativity === "creative" ? 0.2 : 0
        : creativity === "precise" ? -0.2 : creativity === "creative" ? 0.35 : 0;
    return Math.round(Math.min(1, Math.max(0.05, base + shift)) * 100) / 100;
}

/** The longest instruction any plan allows (Pro); a stored text is cut to the person's plan when used. */
export const AI_INSTRUCTIONS_MAX = Math.max(...Object.values(PLAN_AI_FEATURES).map((features) => features.instructionsChars));

const SETTING_KEYS = Object.keys(DEFAULT_AI_SETTINGS) as Array<keyof AiSettings>;

/** Text without control characters (line breaks kept), trimmed. */
function cleanText(value: string) {
    return value.replace(/\r\n?/g, "\n").replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, "").trim();
}

const isLanguageSetting = (value: unknown): value is string => value === "site" || (typeof value === "string" && /^[A-Z]{2}$/.test(value));
const oneOf = <T extends string>(list: readonly T[], value: unknown): value is T => typeof value === "string" && (list as readonly string[]).includes(value);
const isDictationLanguage = (value: unknown): value is string => value === "site" || (typeof value === "string" && /^[a-z]{2,3}(?:-[A-Z]{2})?$/.test(value));
const isRetentionDays = (value: unknown): value is AiRetentionDays => typeof value === "number" && (AI_RETENTION_DAYS as readonly number[]).includes(value);
const isVoiceRate = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= AI_VOICE_RATE_MIN && value <= AI_VOICE_RATE_MAX;
const isProgrammingLanguage = (value: unknown): value is string => typeof value === "string" && value !== "plaintext" && Boolean(getLanguage(value));
/** One line of text: no control characters or line breaks. */
const oneLine = (value: string) => value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();

/** Known language ids, each once, at most five. */
function preferredLanguagesOf(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return [...new Set(value.filter(isProgrammingLanguage))].slice(0, AI_PREFERRED_LANGUAGES_MAX);
}

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
        thinking: oneOf(THINKING_SETTINGS, record.thinking) ? record.thinking : DEFAULT_AI_SETTINGS.thinking,
        showThinking: typeof record.showThinking === "boolean" ? record.showThinking : DEFAULT_AI_SETTINGS.showThinking,
        expertise: oneOf(AI_EXPERTISE, record.expertise) ? record.expertise : DEFAULT_AI_SETTINGS.expertise,
        commentLanguage: isLanguageSetting(record.commentLanguage) ? record.commentLanguage : DEFAULT_AI_SETTINGS.commentLanguage,
        codeStyle: typeof record.codeStyle === "string" ? oneLine(record.codeStyle).slice(0, AI_CODE_STYLE_MAX) : "",
        preferredLanguages: preferredLanguagesOf(record.preferredLanguages),
        codeOutput: oneOf(AI_CODE_OUTPUTS, record.codeOutput) ? record.codeOutput : DEFAULT_AI_SETTINGS.codeOutput,
        sendShortcut: oneOf(AI_SEND_SHORTCUTS, record.sendShortcut) ? record.sendShortcut : DEFAULT_AI_SETTINGS.sendShortcut,
        attachConsoleErrors: typeof record.attachConsoleErrors === "boolean" ? record.attachConsoleErrors : DEFAULT_AI_SETTINGS.attachConsoleErrors,
        attachProjectTree: typeof record.attachProjectTree === "boolean" ? record.attachProjectTree : DEFAULT_AI_SETTINGS.attachProjectTree,
        autoOpenArtifacts: typeof record.autoOpenArtifacts === "boolean" ? record.autoOpenArtifacts : DEFAULT_AI_SETTINGS.autoOpenArtifacts,
        dictationLanguage: isDictationLanguage(record.dictationLanguage) ? record.dictationLanguage : DEFAULT_AI_SETTINGS.dictationLanguage,
        localRetentionDays: isRetentionDays(record.localRetentionDays) ? record.localRetentionDays : DEFAULT_AI_SETTINGS.localRetentionDays,
        answerVoice: typeof record.answerVoice === "string" ? oneLine(record.answerVoice).slice(0, AI_VOICE_NAME_MAX) : "",
        answerVoiceRate: isVoiceRate(record.answerVoiceRate) ? Math.round(record.answerVoiceRate * 100) / 100 : DEFAULT_AI_SETTINGS.answerVoiceRate,
        answerFont: oneOf(AI_ANSWER_FONTS, record.answerFont) ? record.answerFont : DEFAULT_AI_SETTINGS.answerFont,
        creativity: oneOf(AI_CREATIVITY, record.creativity) ? record.creativity : DEFAULT_AI_SETTINGS.creativity,
        saveHistory: typeof record.saveHistory === "boolean" ? record.saveHistory : DEFAULT_AI_SETTINGS.saveHistory,
        notifyOnDone: typeof record.notifyOnDone === "boolean" ? record.notifyOnDone : DEFAULT_AI_SETTINGS.notifyOnDone,
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
        expertise: (input) => oneOf(AI_EXPERTISE, input),
        commentLanguage: isLanguageSetting,
        codeStyle: (input) => typeof input === "string" && oneLine(input).length <= AI_CODE_STYLE_MAX,
        preferredLanguages: (input) => Array.isArray(input) && input.length <= AI_PREFERRED_LANGUAGES_MAX && input.every(isProgrammingLanguage) && new Set(input).size === input.length,
        codeOutput: (input) => oneOf(AI_CODE_OUTPUTS, input),
        sendShortcut: (input) => oneOf(AI_SEND_SHORTCUTS, input),
        attachConsoleErrors: (input) => typeof input === "boolean",
        attachProjectTree: (input) => typeof input === "boolean",
        autoOpenArtifacts: (input) => typeof input === "boolean",
        dictationLanguage: isDictationLanguage,
        localRetentionDays: isRetentionDays,
        answerVoice: (input) => typeof input === "string" && oneLine(input).length <= AI_VOICE_NAME_MAX,
        answerVoiceRate: isVoiceRate,
        answerFont: (input) => oneOf(AI_ANSWER_FONTS, input),
        creativity: (input) => oneOf(AI_CREATIVITY, input),
        saveHistory: (input) => typeof input === "boolean",
        notifyOnDone: (input) => typeof input === "boolean",
        tone: (input) => oneOf(AI_TONES, input),
        length: (input) => oneOf(AI_LENGTHS, input),
        language: isLanguageSetting,
        defaultMode: (input) => oneOf(AI_ANSWER_MODES, input),
        defaultModel: (input) => input === DEFAULT_CONNECTION || isConnectionId(input),
        attachEditorFile: (input) => typeof input === "boolean",
        agentMode: (input) => oneOf(AGENT_MODES, input),
        thinking: (input) => oneOf(THINKING_SETTINGS, input),
        showThinking: (input) => typeof input === "boolean",
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
