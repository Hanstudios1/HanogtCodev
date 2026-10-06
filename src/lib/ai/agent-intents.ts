/**
 * Hanogt AI Core → agent actions. When the offline intent model recognises an
 * action ("React çalışma grubu kur", "bana bir platform oyunu yap"), this
 * turns the message into the same tool call the language model would make,
 * so the chat shows the same confirmation card either way.
 *
 * Pure and framework-free (the Node tests load it). The program library is
 * passed in by the caller (local-engine.ts imports it on demand) so the chat
 * bundle doesn't carry it.
 */
import type { Copy } from "@/lib/i18n";
import { GROUP_LIMITS, type GroupTemplateId } from "@/lib/groups";
import {
    agentGameTemplates, AGENT_ROUTES, sanitizeAgentCall,
    type AgentCallInput, type AgentGameTemplate, type AgentRoute,
} from "./agent-tools";
import { normalize } from "./nlp.mjs";
import type { ProgramLanguage, ProgramSnippet } from "./programs";
import { detectSnippetLanguage, snippetLanguageFromEditor } from "./snippets";

export const CORE_ACTION_INTENTS = ["create_group", "my_profile", "write_code", "open_editor", "make_game", "navigate"] as const;
export type CoreActionIntent = (typeof CORE_ACTION_INTENTS)[number];

export function isCoreActionIntent(value: unknown): value is CoreActionIntent {
    return typeof value === "string" && (CORE_ACTION_INTENTS as readonly string[]).includes(value);
}

/** What programs.ts provides; injected so this module stays light. */
export interface ProgramLibrary {
    findProgram: (query: string) => ProgramSnippet | null;
    pickProgramLanguage: (program: ProgramSnippet, wanted: ProgramLanguage | null) => ProgramLanguage;
    PROGRAM_LANGUAGES: Readonly<Record<ProgramLanguage, { id: string; extension: string; name: string }>>;
}

export interface CoreProgram {
    program: ProgramSnippet;
    language: ProgramLanguage;
    /** Display name of a language the user asked for but the program doesn't have ("Rust"). */
    missingLanguage: string | null;
}

export type CoreProposal =
    | { kind: "call"; call: AgentCallInput; program?: CoreProgram }
    /** A program was found but the user didn't ask to open it: show the code only. */
    | { kind: "code"; program: CoreProgram }
    /** "Bana kod yaz" without a topic. */
    | { kind: "need_topic" };

export interface CoreProposalOptions {
    tx: (copy: Copy, vars?: Record<string, string | number>) => string;
    /** Required for write_code / open_editor / make_game programs; without it those fall back to plain answers. */
    programs?: ProgramLibrary | null;
    /** Editor language id of the open file, used when the message names no language. */
    editorLanguage?: string | null;
}

// ------------------------------------------------------------------ helpers
const QUOTED = /["“”«»‘’'`]([^"“”«»‘’'`\n]{2,80})["“”«»‘’'`]/;

function capitalize(value: string) {
    return value ? value.charAt(0).toLocaleUpperCase("tr") + value.slice(1) : value;
}

function tidy(value: string) {
    return value.replace(/\s+/g, " ").replace(/^[\s,.:;!?-]+|[\s,.:;!?-]+$/g, "").trim();
}

function quoted(text: string): string | null {
    const match = QUOTED.exec(text);
    return match ? tidy(match[1]) : null;
}

/** Names given with "adı X olsun", "X adlı/isimli", "called X", "named X". */
function namedAs(text: string): string | null {
    const patterns = [
        /\b(?:ad[ıi]|ismi|isim)\s*[:=]?\s*(.{2,60}?)\s*(?:olsun|olan|olacak)?\s*(?:[.,!?]|$)/i,
        /(?:^|\s)(.{2,60}?)\s+(?:adl[ıi]|ad[ıi]nda|isimli|ismiyle|ismini taşıyan)\s/i,
        /\b(?:called|named|name it|titled)\s+(.{2,60}?)\s*(?:[.,!?]|$)/i,
    ];
    for (const pattern of patterns) {
        const match = pattern.exec(text);
        if (match) {
            const name = tidy(match[1].replace(/^(?:bir|yeni|a|an|the)\s+/i, ""));
            if (name.length >= 2 && !/^(?:grup|group|ekip|team|oyun|game|proje|project)$/i.test(name)) return name;
        }
    }
    return null;
}

// ------------------------------------------------------------------ groups
// \w is ASCII-only even with the u flag, so Turkish suffixes use \p{L}.
const GROUP_WORD = /(?<![\p{L}\p{N}])(?:grub\p{L}*|grup\p{L}*|ekib\p{L}*|ekip\p{L}*|tak[ıi]m\p{L}*|toplulu\p{L}*|kul[uü][bp]\p{L}*|group|groups|team|teams|club|community)(?![\p{L}\p{N}])/iu;
// Whole verb forms only: "kurs", "açık kaynak" and "yapay zeka" must survive in a name.
const VERB_ENDINGS = "(?:ar|er|abilir|ebilir|sana|sene|al[ıi]m|elim|[ıiuü]n|mak|mek|s[ıi]n)?";
const GROUP_VERBS = new RegExp(`(?<![\\p{L}\\p{N}])(?:kur${VERB_ENDINGS}|olu[sş]tur${VERB_ENDINGS}|a[cç]${VERB_ENDINGS}|yap${VERB_ENDINGS}|haz[ıi]rla${VERB_ENDINGS}|ba[sş]lat${VERB_ENDINGS}|create|make|set up|setup|start|build|open|form|spin up)(?:\\s+(?:m[ıiuü]s[ıiuü]n(?:[ıiuü]z)?|l[uü]tfen|please))?(?![\\p{L}\\p{N}])`, "giu");
const GROUP_FILLERS = /(?<![\p{L}\p{N}])(?:hanogt|hey|l[uü]tfen|please|can you|could you|would you|bana|benim i[cç]in|bizim i[cç]in|bize|for me|for us|bir|yeni|new|a|an|the|me|us|i want to|i'd like to|istiyorum|isterim|bi)(?![\p{L}\p{N}])/giu;

const GROUP_TEMPLATE_WORDS: Array<[RegExp, GroupTemplateId]> = [
    [/\b(?:hackathon\w*|hackaton\w*|yarisma\w*|competition)\b/, "hackathon"],
    [/\b(?:acik kaynak\w*|open source|opensource|oss|github)\b/, "opensource"],
    [/\b(?:sinif\w*|ogretmen\w*|ogrenci\w*|classroom|teacher\w*|student\w*|okul\w*|school)\b/, "classroom"],
    [/\b(?:game ?jam|jam|oyun\w*|game\w*|unity|engine)\b/, "gamejam"],
    [/\b(?:calisma\w*|ders\w*|ogren\w*|study|learn\w*|kurs\w*|course\w*|egitim\w*|bootcamp|sinav\w*)\b/, "study"],
];

/** The starter template a request hints at ("çalışma grubu" → study); blank when nothing fits. */
export function groupTemplateFor(text: string): GroupTemplateId {
    const value = normalize(text);
    for (const [pattern, template] of GROUP_TEMPLATE_WORDS) if (pattern.test(value)) return template;
    return "blank";
}

/**
 * A group name taken from the request: quotes, "adı X olsun" / "called X",
 * "X için grup" / "group for X", else the words before the group word
 * ("React çalışma grubu kur" → "React çalışma grubu"). Empty when the
 * request names nothing ("bana bir grup kur"); the card then asks for one.
 */
export function extractGroupName(text: string): string {
    const explicit = quoted(text) ?? namedAs(text);
    if (explicit) return capitalize(explicit).slice(0, GROUP_LIMITS.nameMax);
    const clean = tidy(text.replace(/[\r\n]+/g, " "));
    // "Python öğrenenler için bir grup aç" → "Python öğrenenler grubu"
    const forTurkish = /^(.{2,60}?)\s+i[cç]in\s+(?:bir\s+|yeni\s+)*(?:grup|ekip|tak[ıi]m|topluluk)\b/iu.exec(clean.replace(GROUP_FILLERS, " ").replace(/\s+/g, " ").trim());
    if (forTurkish) return capitalize(`${tidy(forTurkish[1])} grubu`).slice(0, GROUP_LIMITS.nameMax);
    // "make a study group for javascript" → "Javascript study group"
    const forEnglish = /\b((?:[\p{L}-]+\s+){0,2})(group|team|club|community)\s+for\s+(.{2,40}?)\s*(?:[.,!?]|$)/iu.exec(clean);
    if (forEnglish) return capitalize(tidy(`${tidy(forEnglish[3])} ${forEnglish[1].replace(GROUP_FILLERS, " ")} ${forEnglish[2]}`)).slice(0, GROUP_LIMITS.nameMax);
    const match = GROUP_WORD.exec(clean);
    if (!match) return "";
    const before = clean.slice(0, match.index + match[0].length).replace(GROUP_VERBS, " ").replace(GROUP_FILLERS, " ");
    const name = tidy(before);
    // Only the group word itself is left: no real name was given.
    if (!name || GROUP_WORD.test(name) && name.split(/\s+/).length === 1) return "";
    return capitalize(name).slice(0, GROUP_LIMITS.nameMax);
}

// ------------------------------------------------------------------ games
const GAME_WORDS: Array<[RegExp, string]> = [
    [/\b(?:gok kule\w*|sky tower|kule tirman\w*|tower climb\w*)\b/, "sky-tower-2d"],
    [/\b(?:labirent\w*|maze|pac ?man|hayalet\w*|ghost\w*)\b/, "maze-hunt-2d"],
    [/\b(?:sapan\w*|slingshot|angry birds)\b/, "slingshot-2d"],
    [/\b(?:tilemap|tile|karo\w*|bolum editor\w*|level editor)\b/, "tilemap-platformer-2d"],
    [/\b(?:flappy|kanat\w*|kus oyun\w*|bird)\b/, "flappy-2d"],
    [/\b(?:rpg|macera\w*|adventure|zindan\w*|dungeon|zelda|kilic\w*|sword)\b/, "rpg-topdown-2d"],
    [/\b(?:parkur\w*|obby|obstacle course|engel parkur\w*|fall guys)\b/, "obstacle-course-3d"],
    [/\b(?:tower defen[cs]e|kule savunma\w*|kale savunma\w*)\b/, "tower-defense-2d"],
    [/\b(?:arena\w*|twin ?stick|ikiz cubuk\w*|survivor\w*)\b/, "arena-2d"],
    [/\b(?:yilan\w*|snake)\b/, "snake-2d"],
    [/\b(?:pong|ping ?pong)\b/, "pong-2d"],
    [/\b(?:platform\w*|zipla\w*|mario|jump\w*)\b/, "platformer-2d"],
    [/\b(?:clicker|tiklama\w*|idle|cookie)\b/, "clicker-ui-2d"],
    [/\b(?:2d (?:runner|kosu\w*)|neon (?:kosu\w*|run\w*)|dino\w*)\b/, "runner-2d"],
    [/\b(?:runner|kosu\w*|endless|sonsuz|subway|yaris\w*|racing|race)\b/, "runner-3d"],
    [/\b(?:roll ?a ?ball|rollaball|top|topu|toplu|ball|yuvarla\w*|bilye\w*)\b/, "rollaball-3d"],
    [/\b(?:uzay\w*|space|shooter|nisanci\w*|ates etme\w*|gemi\w*|spaceship|asteroid\w*|shmup)\b/, "space-shooter-2d"],
    [/\b(?:breakout|tugla\w*|brick\w*|arkanoid)\b/, "breakout-2d"],
];
/** Asking for the engine (or C++/C#) picks the engine template even when a browser program exists. */
const ENGINE_WORDS = /\b(?:oyun motor\w*|motor\w*|engine|unity|sablon\w*|template\w*|c\+\+|c#|csharp|cpp)(?=\s|$|[.,!?])/;
/** Games that exist as browser programs instead of engine templates. */
const HTML_GAME_WORDS: Array<[RegExp, string]> = [
    [/\b(?:yilan\w*|snake)\b/, "snake"],
    [/\b(?:pong|ping ?pong|raket\w*|paddle)\b/, "pong"],
    [/\b(?:xox|tic ?tac ?toe|uc tas|uctas)\b/, "tic-tac-toe"],
];

/** The engine template a request hints at, among the templates the engine has now. */
export function matchGameTemplate(text: string, templates: readonly AgentGameTemplate[] = agentGameTemplates()): AgentGameTemplate | null {
    const value = normalize(text);
    const byId = (id: string) => templates.find((template) => template.id === id) ?? null;
    for (const [pattern, id] of GAME_WORDS) {
        if (pattern.test(value) && byId(id)) return byId(id);
    }
    // Templates added later are found by the words of their own names.
    const words = new Set(value.split(" ").filter((word) => word.length >= 4));
    let best: { template: AgentGameTemplate; score: number } | null = null;
    for (const template of templates) {
        const name = normalize(`${template.name.TR} ${template.name.EN}`).split(" ").filter((word) => word.length >= 4 && !/^(?:oyun\w*|game\w*|bos|empty)$/.test(word));
        const score = name.filter((word) => words.has(word)).length;
        if (score > 0 && (!best || score > best.score)) best = { template, score };
    }
    if (best) return best.template;
    const playable = (dimension: "2d" | "3d") => templates.find((template) => template.dimension === dimension && !template.id.startsWith("empty")) ?? null;
    if (/\b(?:3d|3 boyutlu|uc boyutlu|three dimensional)\b/.test(value)) return playable("3d");
    if (/\b(?:2d|2 boyutlu|iki boyutlu)\b/.test(value)) return playable("2d");
    return null;
}

function htmlGameFor(text: string): string | null {
    const value = normalize(text);
    if (ENGINE_WORDS.test(value)) return null;
    for (const [pattern, id] of HTML_GAME_WORDS) if (pattern.test(value)) return id;
    return null;
}

/** A project name from quotes or "adı X olsun"; null when the request gives none. */
export function extractGameName(text: string): string | null {
    const name = quoted(text) ?? namedAs(text);
    return name ? capitalize(name).slice(0, 80) : null;
}

// ------------------------------------------------------------------ routes
const ROUTE_WORDS: Array<[RegExp, AgentRoute]> = [
    [/\b(?:(?:hanogt )?ai api\w*|api anahtar\w*|api key\w*|gelistirici api\w*|developer api)\b/, "/ai/api"],
    [/\b(?:(?:hanogt )?ai(?:'?(?:n|nin|in))? ayar\w*|yapay zeka ayar\w*|asistan ayar\w*|(?:hanogt )?ai settings|assistant settings)\b/, "/ai/settings"],
    [/\b(?:editor ayar\w*|editor settings|kod ayar\w*)\b/, "/settings"],
    [/\b(?:hesap ayar\w*|profil ayar\w*|account settings|profile settings|hesap sayfa\w*|account page)\b/, "/account-settings"],
    [/\b(?:oyun motor\w*|game engine|engine|motor\w*|hanogt engine)\b/, "/game-engine"],
    [/\b(?:guvenlik\w*|security|parola laboratuvar\w*|password lab|baglanti kontrol\w*|kod danisman\w*)\b/, "/security"],
    [/\b(?:geri bildirim\w*|feedback|destek\w*|support|talep\w*|ticket\w*)\b/, "/feedback"],
    [/\b(?:kilavuz\w*|rehber\w*|guide|sss|faq|yardim sayfa\w*|help page)\b/, "/guide"],
    [/\b(?:hakkinda|about)\b/, "/about"],
    [/\b(?:editor\w*|kod editor\w*|code editor|ide)\b/, "/editor"],
    [/\b(?:panel\w*|pano\w*|dashboard|projelerim\w*|projects|ana sayfa\w*|home ?page|home)\b/, "/dashboard"],
    // Friends, direct messages and groups all live in Hanogt Social.
    [/\b(?:social|sosyal|grup\w*|grub\w*|group\w*|ekip\w*|takim\w*|arkadas\w*|friend\w*|dost\w*|mesaj\w*|message\w*|dm|sohbet\w*|inbox)\b/, "/social"],
    [/\b(?:media\w*|medya\w*)\b/, "/media"],
    [/\b(?:haber\w*|news|duyuru\w*)\b/, "/news"],
    [/\b(?:arcade\w*|atari\w*)\b/, "/arcade"],
    [/\b(?:ayar\w*|settings|preferences)\b/, "/account-settings"],
];

/** The whitelisted page a "go to …" request names, or null. */
export function extractRoute(text: string): AgentRoute | null {
    const value = normalize(text);
    for (const [pattern, route] of ROUTE_WORDS) if (pattern.test(value)) return route;
    return null;
}

export function routeLabel(route: AgentRoute): Copy {
    return AGENT_ROUTES.find((entry) => entry.path === route)?.label ?? { TR: route, EN: route };
}

// ------------------------------------------------------------------ code
// Without a named language, web words ("site", "sayfa", "app") ask for the HTML version.
const PROGRAM_LANGUAGE_WORDS: Array<[RegExp, ProgramLanguage]> = [
    [/(?:^|\s)(?:html|css|web\w*|site\w*|sayfa\w*|page|tarayici\w*|browser|app|apps|uygulama\w*)(?=\s|$)/, "html"],
];
/** Languages the editor runs but the offline programs don't cover (the reply says so). */
const OTHER_LANGUAGES: Array<[RegExp, string]> = [
    [/(?:^|\s)(?:rust)(?=\s|$)/, "Rust"], [/(?:^|\s)(?:golang|go dili\w*)(?=\s|$)/, "Go"], [/(?:^|\s)kotlin(?=\s|$)/, "Kotlin"],
    [/(?:^|\s)php(?=\s|$)/, "PHP"], [/(?:^|\s)ruby(?=\s|$)/, "Ruby"], [/(?:^|\s)swift(?=\s|$)/, "Swift"], [/(?:^|\s)lua(?=\s|$)/, "Lua"],
    [/(?:^|\s)dart(?=\s|$)/, "Dart"], [/(?:^|\s)scala(?=\s|$)/, "Scala"], [/(?:^|\s)(?:c dili\w*|c ile|ansi c)(?=\s|$)/, "C"],
    [/(?:^|\s)haskell(?=\s|$)/, "Haskell"], [/(?:^|\s)perl(?=\s|$)/, "Perl"],
];
const EDITOR_REQUEST = /\b(?:editor\w*|ide|ac|acar|acsana|acin|acabilir|acip|open|opens|koy|koyar|koysana|aktar\w*|put it|launch|load it)\b/;
const FENCE = /```([\w#+.-]*)[^\n]*\n([\s\S]*?)```/;

function programLanguageFor(text: string, editorLanguage: string | null | undefined): { language: ProgramLanguage | null; missing: string | null } {
    const value = normalize(text);
    const named = detectSnippetLanguage(text);
    if (named) return { language: named, missing: null };
    for (const [pattern, language] of PROGRAM_LANGUAGE_WORDS) if (pattern.test(value)) return { language, missing: null };
    for (const [pattern, name] of OTHER_LANGUAGES) if (pattern.test(value)) return { language: null, missing: name };
    const fromEditor = editorLanguage === "html" ? "html" : snippetLanguageFromEditor(editorLanguage);
    return { language: fromEditor, missing: null };
}

// Words that say "write code" rather than what the program does.
const CODE_FILLERS = new RegExp(`(?<![\\p{L}\\p{N}#+])(?:kod\\p{L}*|code|program\\p{L}*|script\\p{L}*|yaz${VERB_ENDINGS}|write|make|create|build|olu[sş]tur${VERB_ENDINGS}|yap${VERB_ENDINGS}|haz[ıi]rla${VERB_ENDINGS}|bana|benim i[cç]in|for me|please|l[uü]tfen|bir|a|an|the|ile|with|in|using|dilinde|language|edit[oö]r\\p{L}*|a[cç]${VERB_ENDINGS}|open|koy${VERB_ENDINGS}|ve|and|then|sonra|m[ıiuü]s[ıiuü]n(?:[ıiuü]z)?|python|javascript|js|java|c#|c\\+\\+|cpp|csharp|html|css)(?![\\p{L}\\p{N}#+])`, "giu");

function programFor(text: string, options: CoreProposalOptions): CoreProgram | null {
    const library = options.programs;
    if (!library) return null;
    const query = text.replace(CODE_FILLERS, " ").replace(/\s+/g, " ").trim() || text;
    const program = library.findProgram(query) ?? library.findProgram(text);
    if (!program) return null;
    const { language: wanted, missing } = programLanguageFor(text, options.editorLanguage);
    const language = library.pickProgramLanguage(program, wanted);
    const missingLanguage = missing ?? (wanted && wanted !== language ? library.PROGRAM_LANGUAGES[wanted].name : null);
    return { program, language, missingLanguage };
}

function programCall(found: CoreProgram, library: ProgramLibrary): AgentCallInput | null {
    const info = library.PROGRAM_LANGUAGES[found.language];
    // Java needs the public class Main in Main.java.
    const fileName = found.language === "java" ? "Main.java" : found.language === "html" && found.program.file === "index" ? "index.html" : `${found.program.file}.${info.extension}`;
    const result = sanitizeAgentCall("open_editor_with_code", { language: info.id, fileName, code: found.program.code[found.language] });
    return result.ok ? result.call : null;
}

/** Code the user pasted in a fenced block ("bunu editörde aç: ```py …```"). */
function pastedCode(text: string): AgentCallInput | null {
    const match = FENCE.exec(text);
    if (!match || !match[2].trim()) return null;
    const fence = match[1].toLowerCase();
    const language = fence || detectSnippetLanguage(text) || "plaintext";
    const result = sanitizeAgentCall("open_editor_with_code", { language, code: match[2] });
    if (result.ok) return result.call;
    const plain = sanitizeAgentCall("open_editor_with_code", { language: "plaintext", code: match[2] });
    return plain.ok ? plain.call : null;
}

// ------------------------------------------------------------------ proposals
/**
 * The agent action for a message the intent model put into an action intent,
 * or null when the message doesn't contain enough to act on (the caller then
 * answers from the knowledge base as before).
 */
export function proposeCoreAction(intent: string, text: string, options: CoreProposalOptions): CoreProposal | null {
    switch (intent) {
        case "my_profile":
            return { kind: "call", call: { name: "get_my_profile", args: {} } };
        case "create_group": {
            const result = sanitizeAgentCall("create_group", { name: extractGroupName(text), template: groupTemplateFor(text) });
            return result.ok ? { kind: "call", call: result.call } : null;
        }
        case "navigate": {
            const route = extractRoute(text);
            return route ? { kind: "call", call: { name: "navigate", args: { route } } } : null;
        }
        case "make_game": {
            const htmlGame = htmlGameFor(text);
            const library = options.programs;
            if (htmlGame && library) {
                const program = library.findProgram(htmlGame);
                if (program) {
                    const found: CoreProgram = { program, language: "html", missingLanguage: null };
                    const call = programCall(found, library);
                    if (call) return { kind: "call", call, program: found };
                }
            }
            const templates = agentGameTemplates();
            const template = matchGameTemplate(text, templates) ?? templates.find((entry) => entry.id === "platformer-2d") ?? templates[0];
            if (!template) return null;
            const name = extractGameName(text) ?? options.tx(template.name);
            const result = sanitizeAgentCall("create_game", { name, template: template.id });
            return result.ok ? { kind: "call", call: result.call } : null;
        }
        case "open_editor": {
            const pasted = pastedCode(text);
            if (pasted) return { kind: "call", call: pasted };
            const found = programFor(text, options);
            if (found && options.programs) {
                const call = programCall(found, options.programs);
                if (call) return { kind: "call", call, program: found };
            }
            return { kind: "call", call: { name: "navigate", args: { route: "/editor" } } };
        }
        case "write_code": {
            const pasted = pastedCode(text);
            if (pasted && EDITOR_REQUEST.test(normalize(text))) return { kind: "call", call: pasted };
            const found = programFor(text, options);
            if (!found) return { kind: "need_topic" };
            if (!EDITOR_REQUEST.test(normalize(text.replace(FENCE, " ")))) return { kind: "code", program: found };
            const call = options.programs ? programCall(found, options.programs) : null;
            return call ? { kind: "call", call, program: found } : { kind: "code", program: found };
        }
        default:
            return null;
    }
}
