/**
 * Hanogt AI agent tools: the registry shared by the /api/ai route (function
 * calling schemas, server-side validation), the browser (confirmation cards,
 * executors in agent-client.ts) and the offline Core (agent-intents.ts).
 *
 * Framework-free so the plain-Node tests can load it. Nothing in this module
 * performs an action: tools only run in the browser, with the signed-in
 * user's own session and existing APIs, after agentDecision() allows it or
 * the user approves the confirmation card. Destructive and sensitive requests
 * (deleting, passwords, 2FA, admin work, messaging other people) have no tool
 * at all and are recognised by detectSensitiveRequest() so they can be
 * refused with an explanation.
 */
import type { AccountProfileResponse, StaffRoleBadge } from "@/lib/account-profile";
import { PROJECT_TEMPLATES } from "@/lib/game-engine/templates";
import { GROUP_COLOR_IDS, GROUP_LIMITS, GROUP_TEMPLATE_IDS, isGroupColor, isGroupTemplateId, type GroupColor, type GroupTemplateId } from "@/lib/groups";
import type { Copy } from "@/lib/i18n";
import { ensureFileExtension, getLanguage, languageDisplayName, languageFromFileName, normalizeLanguageId } from "@/lib/runtimes/languages";
import { normalize } from "./nlp.mjs";

// ------------------------------------------------------------------ registry
export const AGENT_TOOL_NAMES = ["get_my_profile", "create_group", "open_editor_with_code", "create_game", "navigate", "search_site"] as const;
export type AgentToolName = (typeof AGENT_TOOL_NAMES)[number];

/**
 * info: public knowledge, runs without asking · read: the user's own data,
 * asked once per session · navigate: opens a page or an editor tab · write:
 * creates something on the user's account.
 */
export type AgentToolKind = "info" | "read" | "navigate" | "write";

export const AGENT_TOOL_KIND: Readonly<Record<AgentToolName, AgentToolKind>> = {
    get_my_profile: "read",
    create_group: "write",
    open_editor_with_code: "navigate",
    create_game: "write",
    navigate: "navigate",
    search_site: "info",
};

/** Account actions need a signed-in user; the others work for everyone. */
export const AGENT_TOOL_REQUIRES_AUTH: Readonly<Record<AgentToolName, boolean>> = {
    get_my_profile: true,
    create_group: true,
    open_editor_with_code: false,
    create_game: true,
    navigate: false,
    search_site: false,
};

export const AGENT_TOOL_TITLES: Readonly<Record<AgentToolName, Copy>> = {
    get_my_profile: { TR: "Profil bilgilerini okumak", EN: "Read your profile" },
    create_group: { TR: "Yeni bir grup oluşturmak", EN: "Create a new group" },
    open_editor_with_code: { TR: "Kodu Kod Editörü'nde açmak", EN: "Open code in the Code Editor" },
    create_game: { TR: "Yeni bir oyun projesi oluşturmak", EN: "Create a new game project" },
    navigate: { TR: "Bir sayfayı açmak", EN: "Open a page" },
    search_site: { TR: "Sitede arama yapmak", EN: "Search the site" },
};

export function isAgentToolName(value: unknown): value is AgentToolName {
    return typeof value === "string" && (AGENT_TOOL_NAMES as readonly string[]).includes(value);
}

/** Tool rounds per user message before the model must answer in text. */
export const AGENT_MAX_ROUNDS = 4;
/** Tool calls accepted from one model response. */
export const AGENT_MAX_CALLS = 4;
export const AGENT_MAX_CODE_CHARS = 100_000;
const MAX_ARGUMENT_CHARS = AGENT_MAX_CODE_CHARS + 20_000;
export const AGENT_GAME_NAME_MAX = 80;
export const AGENT_GAME_DESCRIPTION_MAX = 500;
export const AGENT_QUERY_MAX = 200;
export const AGENT_CALL_ID_PATTERN = /^[A-Za-z0-9_.:-]{1,80}$/;

// ------------------------------------------------------------------ routes
export const AGENT_ROUTES = [
    { path: "/editor", label: { TR: "Kod Editörü", EN: "Code Editor" } },
    { path: "/dashboard", label: { TR: "Panel", EN: "Dashboard" } },
    { path: "/social", label: { TR: "Hanogt Social (arkadaşlar, mesajlar, gruplar)", EN: "Hanogt Social (friends, messages, groups)" } },
    { path: "/media", label: { TR: "Hanogt Media", EN: "Hanogt Media" } },
    { path: "/news", label: { TR: "Hanogt News", EN: "Hanogt News" } },
    { path: "/arcade", label: { TR: "Arcade", EN: "Arcade" } },
    { path: "/game-engine", label: { TR: "Oyun Motoru", EN: "Game Engine" } },
    { path: "/account-settings", label: { TR: "Hesap Ayarları", EN: "Account Settings" } },
    { path: "/settings", label: { TR: "Editör Ayarları", EN: "Editor Settings" } },
    { path: "/feedback", label: { TR: "Geri Bildirim ve Destek", EN: "Feedback and Support" } },
    { path: "/guide", label: { TR: "Kullanım Kılavuzu", EN: "User Guide" } },
    { path: "/security", label: { TR: "Güvenlik Merkezi", EN: "Security Center" } },
    { path: "/about", label: { TR: "Hakkında", EN: "About" } },
] as const satisfies ReadonlyArray<{ path: string; label: Copy }>;

export type AgentRoute = (typeof AGENT_ROUTES)[number]["path"];
export const AGENT_ROUTE_PATHS: readonly AgentRoute[] = AGENT_ROUTES.map((route) => route.path);

export function isAgentRoute(value: unknown): value is AgentRoute {
    return typeof value === "string" && (AGENT_ROUTE_PATHS as readonly string[]).includes(value);
}

// Friends, messages and groups moved into Hanogt Social; the old pages redirect there.
const LEGACY_ROUTES: Readonly<Record<string, AgentRoute>> = { "/friends": "/social", "/messages": "/social", "/groups": "/social" };

/**
 * Accepts "editor", "/Editor/" or "/editor" and returns the whitelisted path.
 * Anything with a scheme, host, query, traversal or an unknown page is null.
 */
export function normalizeAgentRoute(value: unknown): AgentRoute | null {
    if (typeof value !== "string") return null;
    let path = value.trim().toLowerCase();
    if (!path || path.length > 64 || /[\s\\?#:@%]/.test(path) || path.startsWith("//")) return null;
    if (!path.startsWith("/")) path = `/${path}`;
    if (path.length > 1) path = path.replace(/\/+$/, "");
    if (LEGACY_ROUTES[path]) return LEGACY_ROUTES[path];
    return isAgentRoute(path) ? path : null;
}

export function agentRouteLabel(route: AgentRoute): Copy {
    return AGENT_ROUTES.find((entry) => entry.path === route)?.label ?? { TR: route, EN: route };
}

// ------------------------------------------------------------------ game templates
/** The engine's starter templates, read from the engine itself so new templates appear automatically. */
export interface AgentGameTemplate {
    id: string;
    dimension: "2d" | "3d";
    name: Copy;
    description: Copy;
    emoji: string;
}

export function agentGameTemplates(): AgentGameTemplate[] {
    return PROJECT_TEMPLATES.map((template) => ({
        id: template.id,
        dimension: template.dimension === "2d" ? "2d" : "3d",
        name: { TR: template.name.tr, EN: template.name.en },
        description: { TR: template.description.tr, EN: template.description.en },
        emoji: template.emoji,
    }));
}

/** Exact id, or the single template whose id starts with / contains the value ("platformer" → "platformer-2d"). */
export function resolveGameTemplateId(value: unknown, templates: readonly AgentGameTemplate[] = agentGameTemplates()): string | null {
    if (typeof value !== "string") return null;
    const key = value.trim().toLowerCase().replace(/[\s_]+/g, "-");
    if (!key || key.length > 60) return null;
    const exact = templates.find((template) => template.id === key);
    if (exact) return exact.id;
    const prefixed = templates.filter((template) => template.id.startsWith(key) || template.id.replace(/-(?:2d|3d)$/, "") === key);
    if (prefixed.length === 1) return prefixed[0].id;
    const contained = templates.filter((template) => template.id.includes(key));
    return contained.length === 1 ? contained[0].id : null;
}

// ------------------------------------------------------------------ arguments
export interface ProfileArgs {
    [key: string]: never;
}
export interface CreateGroupArgs {
    name: string;
    description: string;
    template: GroupTemplateId;
    color: GroupColor | null;
}
export interface OpenEditorArgs {
    /** Canonical registry id from src/lib/runtimes/languages.ts. */
    language: string;
    fileName: string;
    code: string;
}
export interface CreateGameArgs {
    name: string;
    template: string;
    description: string;
}
export interface NavigateArgs {
    route: AgentRoute;
}
export interface SearchSiteArgs {
    query: string;
}

export interface AgentToolArgsMap {
    get_my_profile: ProfileArgs;
    create_group: CreateGroupArgs;
    open_editor_with_code: OpenEditorArgs;
    create_game: CreateGameArgs;
    navigate: NavigateArgs;
    search_site: SearchSiteArgs;
}

/** A sanitized call: the name and its typed arguments. */
export type AgentCallInput = { [N in AgentToolName]: { name: N; args: AgentToolArgsMap[N] } }[AgentToolName];

export type AgentArgError =
    | "unknown_tool" | "invalid_arguments" | "name_too_short" | "unsupported_language"
    | "empty_code" | "code_too_large" | "invalid_route" | "empty_query" | "invalid_template";

// Bidirectional overrides and other invisible controls could make a
// confirmation card show something different from what will be sent.
const BIDI = /[\u202a-\u202e\u2066-\u2069]/g;
const CONTROL_KEEP_LINES = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/g;
const INVISIBLE = /[\u200b\u200e\u200f\u2028\u2029\ufeff]/g;

/** One line of plain text: no controls, collapsed whitespace, at most `max` characters. */
export function cleanAgentLine(value: unknown, max: number): string {
    if (typeof value !== "string") return "";
    return value
        .slice(0, max * 4)
        .replace(BIDI, "")
        .replace(INVISIBLE, "")
        .replace(/[\u0000-\u001f\u007f-\u009f]/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, max)
        .trim();
}

/** Multi-line text such as a description: keeps line breaks and tabs. */
export function cleanAgentText(value: unknown, max: number): string {
    if (typeof value !== "string") return "";
    return value
        .slice(0, max * 4)
        .replace(/\r\n?/g, "\n")
        .replace(BIDI, "")
        .replace(CONTROL_KEEP_LINES, "")
        .replace(/\n{3,}/g, "\n\n")
        .trim()
        .slice(0, max);
}

/** Source code: only NUL-like controls and bidi overrides ("Trojan Source") are removed. */
export function cleanAgentCode(value: unknown): string {
    if (typeof value !== "string") return "";
    return value.replace(/\r\n?/g, "\n").replace(BIDI, "").replace(CONTROL_KEEP_LINES, "");
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/** Function-call arguments arrive as a JSON string from the model or as an object from the browser. */
export function parseAgentArguments(raw: unknown): Record<string, unknown> | null {
    if (raw === undefined || raw === null || raw === "") return {};
    if (typeof raw === "string") {
        if (raw.length > MAX_ARGUMENT_CHARS) return null;
        try {
            const parsed = JSON.parse(raw) as unknown;
            return isPlainObject(parsed) ? parsed : null;
        } catch {
            return null;
        }
    }
    return isPlainObject(raw) ? raw : null;
}

function sanitizeGroupArgs(raw: Record<string, unknown>): CreateGroupArgs {
    return {
        name: cleanAgentLine(raw.name, GROUP_LIMITS.nameMax),
        description: cleanAgentText(raw.description, GROUP_LIMITS.descriptionMax),
        template: isGroupTemplateId(raw.template) ? raw.template : "blank",
        color: isGroupColor(raw.color) ? raw.color : null,
    };
}

function sanitizeEditorArgs(raw: Record<string, unknown>): OpenEditorArgs | AgentArgError {
    const rawName = cleanAgentLine(raw.fileName ?? raw.file_name ?? raw.name, 120).split(/[\\/]/).pop() ?? "";
    const language = normalizeLanguageId(typeof raw.language === "string" ? raw.language : null) ?? languageFromFileName(rawName)?.id ?? null;
    if (!language) return "unsupported_language";
    const code = cleanAgentCode(raw.code);
    if (!code.trim()) return "empty_code";
    if (code.length > AGENT_MAX_CODE_CHARS) return "code_too_large";
    const baseName = rawName && rawName !== "." && rawName !== ".." && !rawName.startsWith(".") ? rawName : "";
    const fileName = baseName ? ensureFileExtension(baseName, language).slice(0, 120) : getLanguage(language)?.defaultFileName ?? "main.txt";
    return { language, fileName, code };
}

function sanitizeGameArgs(raw: Record<string, unknown>): CreateGameArgs | AgentArgError {
    const templates = agentGameTemplates();
    const template = raw.template === undefined || raw.template === "" ? templates[0]?.id ?? null : resolveGameTemplateId(raw.template, templates);
    if (!template) return "invalid_template";
    return {
        name: cleanAgentLine(raw.name, AGENT_GAME_NAME_MAX),
        template,
        description: cleanAgentText(raw.description, AGENT_GAME_DESCRIPTION_MAX),
    };
}

/**
 * Lenient pass used on every call (server and browser): cleans strings,
 * normalises ids and fills defaults. Fails only when the call can't be shown
 * to the user at all (unknown tool or page, unsupported language, no code).
 * Problems the user can fix in the card are reported by agentArgsProblem().
 */
export function sanitizeAgentCall(name: unknown, rawArgs: unknown): { ok: true; call: AgentCallInput } | { ok: false; error: AgentArgError } {
    if (!isAgentToolName(name)) return { ok: false, error: "unknown_tool" };
    const raw = parseAgentArguments(rawArgs);
    if (!raw) return { ok: false, error: "invalid_arguments" };
    switch (name) {
        case "get_my_profile":
            return { ok: true, call: { name, args: {} } };
        case "create_group":
            return { ok: true, call: { name, args: sanitizeGroupArgs(raw) } };
        case "open_editor_with_code": {
            const args = sanitizeEditorArgs(raw);
            return typeof args === "string" ? { ok: false, error: args } : { ok: true, call: { name, args } };
        }
        case "create_game": {
            const args = sanitizeGameArgs(raw);
            return typeof args === "string" ? { ok: false, error: args } : { ok: true, call: { name, args } };
        }
        case "navigate": {
            const route = normalizeAgentRoute(raw.route ?? raw.path ?? raw.page);
            return route ? { ok: true, call: { name, args: { route } } } : { ok: false, error: "invalid_route" };
        }
        case "search_site": {
            const query = cleanAgentLine(raw.query, AGENT_QUERY_MAX);
            return query ? { ok: true, call: { name, args: { query } } } : { ok: false, error: "empty_query" };
        }
    }
}

/** Strict check before running: the card keeps "Allow" disabled while this returns a problem. */
export function agentArgsProblem(call: AgentCallInput): AgentArgError | null {
    switch (call.name) {
        case "create_group":
            return call.args.name.trim().length < GROUP_LIMITS.nameMin ? "name_too_short" : null;
        case "create_game":
            return call.args.name.trim().length < 2 ? "name_too_short" : null;
        case "open_editor_with_code":
            if (!normalizeLanguageId(call.args.language)) return "unsupported_language";
            if (!call.args.code.trim()) return "empty_code";
            return call.args.code.length > AGENT_MAX_CODE_CHARS ? "code_too_large" : null;
        case "navigate":
            return isAgentRoute(call.args.route) ? null : "invalid_route";
        case "search_site":
            return call.args.query.trim() ? null : "empty_query";
        default:
            return null;
    }
}

// ------------------------------------------------------------------ permissions
/** off: explain only · ask: confirm every action (default) · auto_safe: pages and editor tabs open without asking. */
export type AgentMode = "off" | "ask" | "auto_safe";
export const AGENT_MODES: readonly AgentMode[] = ["off", "ask", "auto_safe"];
export const DEFAULT_AGENT_MODE: AgentMode = "ask";

export function isAgentMode(value: unknown): value is AgentMode {
    return typeof value === "string" && (AGENT_MODES as readonly string[]).includes(value);
}

export type AgentDecision = "run" | "ask" | "blocked";

/**
 * Whether a call may run now. `granted` means the user picked "always allow
 * in this session" for the tool earlier (or approved a profile read once).
 */
export function agentDecision(name: AgentToolName, options: { mode: AgentMode; granted: boolean }): AgentDecision {
    if (options.mode === "off") return "blocked";
    const kind = AGENT_TOOL_KIND[name];
    if (kind === "info" || options.granted) return "run";
    if (options.mode === "auto_safe" && kind === "navigate") return "run";
    return "ask";
}

/** Reading the profile is asked once per session; other tools only when the user ticks "always". */
export function approvalGrantsSession(name: AgentToolName, remember: boolean): boolean {
    return remember || AGENT_TOOL_KIND[name] === "read";
}

// ------------------------------------------------------------------ sensitive requests
export type SensitiveRequest = "delete" | "password" | "two_factor" | "admin" | "moderation" | "message_others";

// Patterns run on normalize()d text (lower case, no diacritics, ı → i). Verbs
// are listed in their request forms only ("sil", "siler misin", "silmek
// istiyorum"), so "mesaj gönderemiyorum" or "banlandım" stay help questions.
const either = (a: string, b: string) => `\\b(?:${a})\\b.*\\b(?:${b})\\b|\\b(?:${b})\\b.*\\b(?:${a})\\b`;
const DELETE_VERBS = "sil|silin|silsene|siler misin|silebilir misin|silmeni istiyorum|silmek istiyorum|kaldir|kaldirin|kaldirsana|kaldirir misin|kaldirabilir misin|yok et|yok eder misin|delete|remove|erase|wipe|destroy|purge|get rid of";
const DELETE_OBJECTS = "hesab\\w*|hesap\\w*|grub\\w*|grup\\w*|proje\\w*|mesaj\\w*|yorum\\w*|paylasim\\w*|gonderi\\w*|oyun\\w*|arkadas\\w*|sohbet\\w*|profil\\w*|kullanici\\w*|uye\\w*|hepsini|tumunu|her seyi|verilerimi|account\\w*|group\\w*|project\\w*|message\\w*|comment\\w*|post\\w*|game\\w*|friend\\w*|chat\\w*|profile\\w*|user\\w*|member\\w*|everything|my data";
const PASSWORD_ANY = "sifre\\w*|parola\\w*|password\\w*|passwort\\w*|contrasena";
const PASSWORD_MINE = "sifrem\\w*|parolam\\w*|my password|benim sifre\\w*|hesabimin sifre\\w*";
const PASSWORD_CHANGE = "degistir|degistirir misin|degistirsene|degistirmek istiyorum|sifirla|sifirlar misin|sifirlasana|change|reset";
const PASSWORD_REVEAL = "goster|gosterir misin|soyle|soyler misin|ver|verir misin|gonder|show|reveal|tell me|give me|send me";
const TWO_FACTOR_WORDS = "2fa|2 fa|iki adimli\\w*|iki asamali\\w*|iki faktorlu\\w*|2 adimli\\w*|two factor|two step|2 step|authenticator|dogrulayici|totp";
const TWO_FACTOR_VERBS = "kapat|kapatir misin|kapatsana|kapatmak istiyorum|devre disi birak|iptal et|kaldir|sifirla|disable|turn off|turn it off|remove|reset|bypass|atla|skip";
const ROLES = "admin\\w*|yonetici\\w*|moderator\\w*|owner|staff|sahib\\w*";
const SENSITIVE_PATTERNS: Array<[SensitiveRequest, RegExp]> = [
    ["two_factor", new RegExp(either(TWO_FACTOR_WORDS, TWO_FACTOR_VERBS))],
    ["password", new RegExp(`${either(PASSWORD_ANY, PASSWORD_CHANGE)}|${either(PASSWORD_MINE, PASSWORD_REVEAL)}`)],
    ["admin", new RegExp([
        `\\b(?:beni|kendimi)\\b.*\\b(?:${ROLES})\\b.*\\b(?:yap|yapar misin|yapsana|ata|atar misin)\\b`,
        "\\b(?:bana|kendime)\\b.*\\b(?:yetki\\w*|rol\\w*|rutbe\\w*)\\b.*\\b(?:ver|verir misin|versene|ata)\\b",
        `\\b(?:make|promote|grant|give) me (?:an? |the )?(?:${ROLES})\\b|\\b(?:promote|demote) (?:me|him|her|them|this user|\\w+ to)\\b|\\bterfi ettir\\b`,
        "\\b(?:admin|yonetici) panel\\w*\\b.*\\b(?:ac|acar misin|git|gir|goster|open|go to|enter|show)\\b",
    ].join("|"))],
    ["moderation", /\b(?:banla|banlayin|banlasana|banlar misin|yasakla|yasaklayin|yasaklasana|yasaklar misin|askiya al|uzaklastir|ban|unban|suspend|kick|mute)\b/],
    // Turkish puts the verb after the object ("Ali'ye mesaj at"); English the other way round.
    ["message_others", /\b(?:mesaj|mesaji|ozel mesaj|dm|e posta|eposta|mail|sms)\b.*\b(?:gonder|gonderir misin|gondersene|gonderebilir misin|at|atar misin|atsana|atabilir misin|yolla|yollar misin|yollasana|ilet|iletir misin)\b|\b(?:send|text|dm|email)\b.*\b(?:message|dm|email|mail)\b|\b(?:herkese|arkadaslarima|uyelere)\b.*\b(?:yaz|duyur|gonder)\b|\b(?:davet et|davet eder misin|invite)\b|\b(?:yorum yap|yorum yaz|post a comment|comment on)\b/],
    ["delete", new RegExp(`${either(DELETE_VERBS, DELETE_OBJECTS)}|\\bgruptan\\b.*\\b(?:cik|ayril|cikar|cikart)\\b|\\bleave (?:the |my |this )?group\\b|\\bunfriend\\b`)],
];
// "Write a Python password generator" or "a bot that sends messages" is a coding task, not a request to act.
const PROGRAMMING_CONTEXT = /(?:^|\s)(?:python|javascript|typescript|java|c#|c\+\+|cpp|csharp|golang|rust|kotlin|php|ruby|sql|lua|html|css|bash|react|vue|angular|node|nodejs|django|flask|unity|script\w*|fonksiyon\w*|function\w*|algoritma\w*|algorithm\w*|bot\w*|regex|uret\w*|generator|kod yaz\w*|kodu yaz\w*|kodunu yaz\w*|write (?:a |some |the )?(?:code|program))(?=\s|$)/;

/** Recognises requests for actions Hanogt AI must never perform. */
export function detectSensitiveRequest(text: string): SensitiveRequest | null {
    const value = normalize(text);
    if (!value || PROGRAMMING_CONTEXT.test(value)) return null;
    for (const [category, pattern] of SENSITIVE_PATTERNS) {
        if (pattern.test(value)) return category;
    }
    return null;
}

/** "How do I delete my account?" is a question to answer, "delete my account" a request to refuse. */
export function isHowToQuestion(text: string): boolean {
    const value = normalize(text);
    return /\b(?:nasil|nerede|nereden|hangi sayfa\w*|how|where|which page|what happens|ne olur|neler olur)\b/.test(value)
        || /\b\w+(?:ebilir|abilir) miyim\b/.test(value)
        || /\b(?:can|could|may) i\b/.test(value)
        || /\b(?:mumkun mu|olur mu)\b/.test(value);
}

// ------------------------------------------------------------------ profile summary
export interface AgentProfileSummary {
    displayName: string;
    nickname: string;
    /** "1234" or "" when the user has no tag yet. */
    tag: string;
    bio: string;
    customStatus: string;
    favoriteLanguages: string[];
    /** YYYY-MM-DD */
    memberSince: string | null;
    staffRole: StaffRoleBadge | null;
    stats: AccountProfileResponse["stats"];
}

const STAFF_ROLES: readonly StaffRoleBadge[] = ["owner", "admin", "moderator"];

function countOrNull(value: unknown) {
    return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.floor(value) : null;
}

/** The part of /api/account/profile Hanogt AI may show and tell the model: no e-mail, links or private settings. */
export function summarizeProfile(response: unknown): AgentProfileSummary | null {
    if (!isPlainObject(response) || !isPlainObject(response.fields)) return null;
    const fields = response.fields;
    const account = isPlainObject(response.account) ? response.account : {};
    const stats = isPlainObject(response.stats) ? response.stats : {};
    const createdAt = typeof account.createdAt === "string" && !Number.isNaN(Date.parse(account.createdAt)) ? new Date(account.createdAt).toISOString().slice(0, 10) : null;
    const tag = typeof fields.nicknameTag === "string" && /^\d{4}$/.test(fields.nicknameTag) ? fields.nicknameTag : "";
    const languages = Array.isArray(fields.favoriteLangs) ? fields.favoriteLangs.filter((entry): entry is string => typeof entry === "string").slice(0, 8) : [];
    return {
        displayName: cleanAgentLine(fields.username, 100),
        nickname: cleanAgentLine(fields.nickname, 100),
        tag,
        bio: cleanAgentText(fields.bio, 600),
        customStatus: cleanAgentLine(fields.customStatus, 120),
        favoriteLanguages: languages.map((entry) => languageDisplayName(entry)),
        memberSince: createdAt,
        staffRole: STAFF_ROLES.includes(account.staffRole as StaffRoleBadge) ? account.staffRole as StaffRoleBadge : null,
        stats: {
            projects: countOrNull(stats.projects),
            gameProjects: countOrNull(stats.gameProjects),
            groups: countOrNull(stats.groups),
            friends: countOrNull(stats.friends),
            mediaPosts: countOrNull(stats.mediaPosts),
        },
    };
}

// ------------------------------------------------------------------ function-calling schemas
export interface AgentToolSchema {
    type: "function";
    function: { name: AgentToolName; description: string; parameters: Record<string, unknown> };
}

/** OpenAI-style tool definitions; the game templates are read from the engine at call time. */
export function agentToolSchemas(): AgentToolSchema[] {
    const templates = agentGameTemplates();
    const templateList = templates.map((template) => `${template.id} (${template.dimension.toUpperCase()}, ${template.name.EN}: ${template.description.EN})`).join("; ");
    return [
        {
            type: "function",
            function: {
                name: "get_my_profile",
                description: "Read the signed-in user's own Hanogt profile summary: display name, nickname#tag, bio, favourite languages, member since, staff role and counts of projects, game projects, groups, friends and Media posts. Use it when the user asks about their own profile or account. The user grants this once per session.",
                parameters: { type: "object", properties: {}, additionalProperties: false },
            },
        },
        {
            type: "function",
            function: {
                name: "create_group",
                description: "Create a new private group in Hanogt Social (a Discord-style team space with channels, shared files and chat) owned by the user. The user sees the details in a confirmation card, can edit them and must approve before anything is created. Pick a short, descriptive name from the request.",
                parameters: {
                    type: "object",
                    properties: {
                        name: { type: "string", description: `Group name, ${GROUP_LIMITS.nameMin}-${GROUP_LIMITS.nameMax} characters, in the user's language.` },
                        description: { type: "string", description: `Optional purpose of the group, at most ${GROUP_LIMITS.descriptionMax} characters.` },
                        template: { type: "string", enum: [...GROUP_TEMPLATE_IDS], description: "Starter template: blank, study (study group), gamejam (game development), opensource, classroom, hackathon." },
                        color: { type: "string", enum: [...GROUP_COLOR_IDS], description: "Optional accent colour; omit to use the template's colour." },
                    },
                    required: ["name", "template"],
                    additionalProperties: false,
                },
            },
        },
        {
            type: "function",
            function: {
                name: "open_editor_with_code",
                description: "Open code in the Hanogt Code Editor as a new unsaved tab and take the user there (nothing is saved or run automatically). Use it when the user asks you to write a program, page or small browser game and open/put it in the editor. Write complete, runnable code. Small browser games work best as one HTML file with inline CSS and JavaScript (the editor previews HTML live).",
                parameters: {
                    type: "object",
                    properties: {
                        language: { type: "string", description: "Editor language id, e.g. python, javascript, typescript, html, css, java, csharp, cpp, c, go, rust, kotlin, php, ruby, lua, sql." },
                        fileName: { type: "string", description: "File name with the right extension, e.g. calculator.py, index.html, Main.java." },
                        code: { type: "string", description: "The complete source code." },
                    },
                    required: ["language", "fileName", "code"],
                    additionalProperties: false,
                },
            },
        },
        {
            type: "function",
            function: {
                name: "create_game",
                description: `Create a new Hanogt Engine game project from a ready-to-play starter template on the user's account and open it in the engine. Templates: ${templateList}.`,
                parameters: {
                    type: "object",
                    properties: {
                        name: { type: "string", description: `Project name, 2-${AGENT_GAME_NAME_MAX} characters.` },
                        template: { type: "string", enum: templates.map((template) => template.id), description: "Starter template id." },
                        description: { type: "string", description: `Optional description, at most ${AGENT_GAME_DESCRIPTION_MAX} characters.` },
                    },
                    required: ["name", "template"],
                    additionalProperties: false,
                },
            },
        },
        {
            type: "function",
            function: {
                name: "navigate",
                description: "Open a page of the Hanogt site for the user. Only these pages exist for this tool.",
                parameters: {
                    type: "object",
                    properties: {
                        route: { type: "string", enum: [...AGENT_ROUTE_PATHS], description: AGENT_ROUTES.map((route) => `${route.path} = ${route.label.EN}`).join("; ") },
                    },
                    required: ["route"],
                    additionalProperties: false,
                },
            },
        },
        {
            type: "function",
            function: {
                name: "search_site",
                description: "Search the Hanogt knowledge base (features, pages, settings, how-tos, FAQ). Use it when the notes you were given don't answer a question about Hanogt.",
                parameters: {
                    type: "object",
                    properties: { query: { type: "string", description: "A few keywords in the user's language." } },
                    required: ["query"],
                    additionalProperties: false,
                },
            },
        },
    ];
}
