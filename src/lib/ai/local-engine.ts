/**
 * Hanogt AI Core: the offline engine that runs in the browser when the large
 * language model isn't available (signed out, not configured, rate-limited,
 * offline). It combines deterministic tools (secret detection, password
 * strength, link check, error explainer, code scan, calculator) with the trained
 * intent model (public/ai/hanogt-intent-model.json) and BM25 retrieval over the
 * knowledge base and code examples. Answers are built from static { TR, EN }
 * copy, so they are translated by the copy packs like the rest of the UI.
 */
import type { Copy } from "@/lib/i18n";
import { analyzeCode, containsSecret } from "@/lib/security/advisor";
import { checkLink, findUrl } from "@/lib/security/links";
import { checkPassword } from "@/lib/security/password";
import { calculate, formatNumber } from "./calc";
import { explainError, looksLikeError } from "./errors";
import { allKnowledge, type KnowledgeEntry } from "./knowledge";
import { knowledgeById, searchKnowledge } from "./retrieval";
import modelMeta from "./model-meta.json";
import { Bm25Index, classify } from "./nlp.mjs";
import { detectSnippetLanguage, ENGINE_SNIPPETS, SNIPPET_LANGUAGES, SNIPPETS, snippetLanguageFromEditor, type SnippetLanguage } from "./snippets";

export type AiMode = "general" | "code" | "security";

export interface AiContext {
    /** Code of the file open in the editor (trimmed by the caller). */
    code?: string;
    /** Editor language id of that file (e.g. "py", "cs"). */
    language?: string;
    fileName?: string;
    /** Current page path. */
    path?: string;
}

export interface LocalReply {
    text: string;
    intent: string | null;
    confidence: number;
    suggestions: string[];
    sources: Array<{ title: string; href: string }>;
    /** Runnable example that the UI can open in the editor. */
    code?: { language: string; code: string };
}

export interface LocalOptions {
    tx: (copy: Copy, vars?: Record<string, string | number>) => string;
    /** BCP 47 locale for number formatting. */
    locale: string;
    mode: AiMode;
    signedIn: boolean;
    context?: AiContext;
    /** Previously detected intent, for "more" follow-ups. */
    lastIntent?: string | null;
}

type IntentModel = Parameters<typeof classify>[0] & { threshold?: number };

let modelPromise: Promise<IntentModel | null> | null = null;

/** Loads the trained intent model once; null if it can't be fetched. */
export function loadIntentModel(): Promise<IntentModel | null> {
    if (!modelPromise) {
        modelPromise = fetch("/ai/hanogt-intent-model.json", { cache: "force-cache" })
            .then((response) => (response.ok ? response.json() as Promise<IntentModel> : null))
            .then((model) => (model && model.featureVersion === modelMeta.featureVersion ? model : null))
            .catch(() => null);
    }
    return modelPromise;
}

/** For tests and Node: use an already-parsed model. */
export function setIntentModel(model: IntentModel | null) {
    modelPromise = Promise.resolve(model);
}

export const CORE_INFO = modelMeta;

// ------------------------------------------------------------------ indexes
let snippetIndex: InstanceType<typeof Bm25Index> | null = null;
function snippets() {
    if (!snippetIndex) {
        snippetIndex = new Bm25Index([
            ...SNIPPETS.map((snippet) => ({ id: `code:${snippet.id}`, text: `${snippet.title.TR} ${snippet.title.EN} ${snippet.keywords} ${snippet.keywords}` })),
            ...ENGINE_SNIPPETS.map((snippet) => ({ id: `engine:${snippet.id}`, text: `${snippet.title.TR} ${snippet.title.EN} ${snippet.keywords} ${snippet.keywords}` })),
        ]);
    }
    return snippetIndex;
}

// ------------------------------------------------------------------ copy
const C = {
    greetings: [
        { TR: "Merhaba! 👋 Ben **Hanogt AI**. Kod yazmak, oyun geliştirmek, hata ayıklamak ya da sitede yolunu bulmak için buradayım. Ne yapalım?", EN: "Hi! 👋 I'm **Hanogt AI**. I'm here to help you code, build games, debug or find your way around the site. What shall we do?" },
        { TR: "Selam! Bugün ne üzerinde çalışıyoruz? Kod yapıştırabilir, bir hata mesajı gönderebilir ya da bir şey sorabilirsin. 🚀", EN: "Hey! What are we working on today? Paste some code, send an error message or just ask. 🚀" },
        { TR: "Merhaba, hoş geldin! Hanogt'ta seni neyle hızlandırabilirim?", EN: "Hello and welcome! How can I speed you up on Hanogt?" },
    ] as Copy[],
    thanks: [
        { TR: "Rica ederim! Başka bir şey olursa buradayım. 😊", EN: "You're welcome! I'm here if you need anything else. 😊" },
        { TR: "Ne demek, iyi kodlamalar! 🛠️", EN: "Anytime. Happy coding! 🛠️" },
    ] as Copy[],
    goodbye: [
        { TR: "Görüşürüz! Kodun hep derlensin. 👋", EN: "See you! May your code always compile. 👋" },
        { TR: "Hoşça kal! Döndüğünde sohbetin burada olacak.", EN: "Bye! Your chat will be here when you come back." },
    ] as Copy[],
    jokes: [
        { TR: "Programcının eşi der ki: \"Markete git, bir ekmek al; yumurta varsa 6 tane al.\" Programcı 6 ekmekle döner: \"Yumurta vardı.\" 🥚", EN: "A programmer's partner says: \"Go buy a loaf of bread; if they have eggs, get 6.\" They come back with 6 loaves: \"They had eggs.\" 🥚" },
        { TR: "Programcılar neden karanlık modu sever? Çünkü ışık böcekleri (bug) çeker. 🐛", EN: "Why do programmers prefer dark mode? Because light attracts bugs. 🐛" },
        { TR: "Bir SQL sorgusu bara girer, iki masaya (table) yaklaşır ve sorar: \"Size JOIN olabilir miyim?\" 🍻", EN: "A SQL query walks into a bar, walks up to two tables and asks: \"Can I join you?\" 🍻" },
        { TR: "Programcılar Cadılar Bayramı ile Noel'i karıştırır, çünkü Oct 31 == Dec 25. 🎃🎄", EN: "Programmers mix up Halloween and Christmas because Oct 31 == Dec 25. 🎃🎄" },
        { TR: "Java geliştiricileri neden gözlük takar? Çünkü C# göremezler. 👓", EN: "Why do Java developers wear glasses? Because they can't C#. 👓" },
        { TR: "Bir hatayı düzelttim, yerine iki yeni hata çıktı. Buna \"Hydra odaklı geliştirme\" diyoruz. 🐉", EN: "I fixed one bug and two new ones appeared. We call it Hydra-driven development. 🐉" },
    ] as Copy[],
    secret: { TR: "⚠️ **Mesajında gerçek bir gizli anahtar/jeton olabilir.** Gizli bilgileri kimseyle paylaşma, bana bile. Bu mesajı bir yere göndermedim ama anahtar başka bir yerde açığa çıktıysa hemen **iptal et ve yenile**.", EN: "⚠️ **Your message may contain a real secret key/token.** Never share secrets with anyone, not even me. I didn't send this message anywhere, but if the key leaked elsewhere, **revoke and rotate** it now." },
    passwordHead: { TR: "Bu parolayı cihazında ölçtüm (hiçbir yere gönderilmedi):", EN: "I measured this password on your device (it wasn't sent anywhere):" },
    passwordLevel: [
        { TR: "çok zayıf", EN: "very weak" }, { TR: "zayıf", EN: "weak" }, { TR: "orta", EN: "fair" }, { TR: "güçlü", EN: "strong" }, { TR: "çok güçlü", EN: "very strong" },
    ] as Copy[],
    passwordScore: { TR: "**Güç:** {level} ({score}/4)", EN: "**Strength:** {level} ({score}/4)" },
    passwordCrack: { TR: "**Tahmini kırılma süresi:** çevrim içi saldırıda {online}, hızlı çevrim dışı saldırıda {fast}", EN: "**Estimated crack time:** {online} for an online attack, {fast} for a fast offline attack" },
    passwordMore: { TR: "Sızıntı kontrolü ve parola üretici: [Parola Laboratuvarı](/security#password). Gerçek parolanı kimseyle paylaşma.", EN: "Breach check and generator: [Password Lab](/security#password). Never share your real password." },
    linkDanger: { TR: "🚨 **Tehlikeli görünüyor, tıklama!**", EN: "🚨 **Looks dangerous, don't click!**" },
    linkCaution: { TR: "⚠️ **Dikkatli ol.**", EN: "⚠️ **Be careful.**" },
    linkSafe: { TR: "✅ **Belirgin bir tehlike işareti görmedim.**", EN: "✅ **I see no obvious danger signs.**" },
    linkInvalid: { TR: "Bu geçerli bir bağlantı gibi görünmüyor.", EN: "This doesn't look like a valid link." },
    linkNote: { TR: "Not: Adresin yalnızca yapısını inceledim, siteye bağlanmadım. Ayrıntı: [Bağlantı Kontrolü](/security#links)", EN: "Note: I only inspected the address structure and never connected to it. Details: [Link Check](/security#links)" },
    scanFindings: { TR: "Kodunu Hanogt Security kurallarıyla taradım: puan **{score}/100 ({grade})**, {count} bulgu.", EN: "I scanned your code with the Hanogt Security rules: score **{score}/100 ({grade})**, {count} findings." },
    scanFinding: { TR: "• **{title}** (satır {line})", EN: "• **{title}** (line {line})" },
    scanBlocked: { TR: "🚫 Bu kod Hanogt çalıştırıcısında **engellenir**.", EN: "🚫 The Hanogt runner **blocks** this code." },
    scanClean: { TR: "Kodunu taradım ve **bilinen bir risk deseni bulamadım** (puan 100/100). Bu kesin güvenli olduğu anlamına gelmez; mantık hatalarını da gözden geçir.", EN: "I scanned your code and **found no known risk patterns** (score 100/100). That doesn't prove it's secure; review the logic too." },
    scanMore: { TR: "Ayrıntılar ve düzeltme önerileri: [Kod Danışmanı](/security#advisor)", EN: "Details and fixes: [Code Advisor](/security#advisor)" },
    codeStats: { TR: "Algılanan dil: **{language}**, {lines} satır.", EN: "Detected language: **{language}**, {lines} lines." },
    codeOfflineNote: { TR: "Kodunu satır satır açıklamak ve iyileştirmek için büyük dil modeli gerekir; giriş yaptığında Hanogt AI bunu yapar.", EN: "Explaining and improving your code line by line needs the large language model; Hanogt AI does it when you're signed in." },
    codeLlmUnavailable: { TR: "Büyük dil modeline şu an ulaşılamadığı için yalnızca çevrimdışı güvenlik taramasını yapabildim; açıklama için biraz sonra tekrar sor.", EN: "The large language model can't be reached right now, so I could only run the offline security scan; ask again in a moment for an explanation." },
    errorHead: { TR: "**{title}** ({language})", EN: "**{title}** ({language})" },
    errorLine: { TR: "Hata **{line}. satırda** ya da hemen öncesinde.", EN: "The error is on **line {line}** or just before it." },
    errorCause: { TR: "**Neden:**", EN: "**Why:**" },
    errorFix: { TR: "**Nasıl düzeltilir:**", EN: "**How to fix it:**" },
    errorGeneric: { TR: "Bu hatayı tanıyamadım, ama genel hata ayıklama adımları şunlar:\n1. Mesajın **ilk satırını** ve **satır numarasını** oku; asıl neden genelde oradadır.\n2. O satırdaki değişkenlerin değerlerini yazdır (`print`, `console.log`, `Debug.Log`).\n3. Sorunu en küçük örneğe indir.\n4. Hata mesajının tamamını ve ilgili kodu buraya yapıştır.", EN: "I don't recognize this error, but here are general debugging steps:\n1. Read the **first line** and the **line number**; the cause is usually there.\n2. Print the values of the variables on that line (`print`, `console.log`, `Debug.Log`).\n3. Reduce the problem to the smallest example.\n4. Paste the full error message and the related code here." },
    calcResult: { TR: "🧮 `{expression}` = **{value}**", EN: "🧮 `{expression}` = **{value}**" },
    calcDegrees: { TR: "Trigonometrik fonksiyonlarda açılar derece cinsindendir.", EN: "Trigonometric functions use degrees." },
    calcHelp: { TR: "Hesaplamak istediğin ifadeyi yaz, örneğin `(3+5)*2`, `2^10`, `sqrt(144)`, `15% of 80` ya da `12 çarpı 7`.", EN: "Type the expression to calculate, e.g. `(3+5)*2`, `2^10`, `sqrt(144)`, `15% of 80` or `12 times 7`." },
    snippetHead: { TR: "**{title}** — {language} örneği:", EN: "**{title}** — {language} example:" },
    snippetOther: { TR: "Başka bir dilde istersen dil adını yaz: Python, JavaScript, C#, C++ veya Java.", EN: "Want another language? Just name it: Python, JavaScript, C#, C++ or Java." },
    engineHead: { TR: "**{title}** — Hanogt Engine (C#) script'i:", EN: "**{title}** — Hanogt Engine (C#) script:" },
    engineMore: { TR: "Daha fazlası: [Motor belgeleri](/game-engine/docs)", EN: "More: [Engine docs](/game-engine/docs)" },
    snippetMissing: { TR: "Bu konuda hazır bir örneğim yok. Ne yapmak istediğini biraz daha ayrıntılı anlatır mısın? Örneğin: \"Python'da listeyi sırala\" ya da \"C# ile zıplama kodu\".", EN: "I don't have a ready example for that. Could you describe it in more detail? For example: \"sort a list in Python\" or \"jump code in C#\"." },
    unknownSignedOut: { TR: "Bu soru Hanogt AI Çekirdeği'nin çevrimdışı bilgisinin dışında. **Giriş yaparsan** sorularını büyük dil modeli yanıtlar. Bu arada kod, oyun motoru, güvenlik ve site kullanımı hakkında yardımcı olabilirim.", EN: "This question is outside Hanogt AI Core's offline knowledge. **Sign in** and the large language model will answer it. Meanwhile I can help with code, the game engine, security and using the site." },
    unknownSignedIn: { TR: "Şu anda büyük dil modeline ulaşamıyorum, bu yüzden Hanogt AI Çekirdeği yanıtlıyor ve bu soru onun bilgisinin dışında. Biraz sonra tekrar dene ya da kod, oyun motoru, güvenlik veya site kullanımı hakkında sor.", EN: "I can't reach the large language model right now, so Hanogt AI Core is answering and this question is outside its knowledge. Try again in a moment, or ask about code, the game engine, security or using the site." },
    relatedTitle: { TR: "İlgili:", EN: "Related:" },
    coreNote: { TR: "Hanogt AI Çekirdeği · çevrimdışı", EN: "Hanogt AI Core · offline" },
};

const SUGGESTIONS: Record<string, Copy[]> = {
    default: [
        { TR: "Neler yapabilirsin?", EN: "What can you do?" },
        { TR: "Python'da liste nasıl sıralanır?", EN: "How do I sort a list in Python?" },
        { TR: "Zıplama kodu (Hanogt Engine)", EN: "Jump code (Hanogt Engine)" },
    ],
    code: [
        { TR: "C# ile sınıf örneği", EN: "Class example in C#" },
        { TR: "JavaScript'te dosya okuma", EN: "Read a file in JavaScript" },
        { TR: "NullReferenceException ne demek?", EN: "What does NullReferenceException mean?" },
    ],
    security: [
        { TR: "Güçlü parola nasıl olmalı?", EN: "What makes a strong password?" },
        { TR: "API anahtarımı sızdırdım", EN: "I leaked my API key" },
        { TR: "2FA nasıl açılır?", EN: "How do I enable 2FA?" },
    ],
    engine_help: [
        { TR: "2D karakter hareketi", EN: "2D character movement" },
        { TR: "Belirli aralıklarla düşman oluştur", EN: "Spawn enemies on a timer" },
        { TR: "En yüksek skoru kaydet", EN: "Save the high score" },
    ],
    run_code: [
        { TR: "Hangi diller destekleniyor?", EN: "Which languages are supported?" },
        { TR: "Kullanıcıdan girdi nasıl alınır?", EN: "How do I read user input?" },
    ],
    groups_help: [
        { TR: "Davet bağlantısı nasıl oluşturulur?", EN: "How do I create an invite link?" },
        { TR: "Arkadaş nasıl eklenir?", EN: "How do I add a friend?" },
    ],
    phishing: [
        { TR: "Hesabım çalındı, ne yapmalıyım?", EN: "My account was hacked, what now?" },
        { TR: "2FA nasıl açılır?", EN: "How do I enable 2FA?" },
    ],
};

function pick<T>(items: T[], seed: string) {
    let hash = 0;
    for (let index = 0; index < seed.length; index += 1) hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
    return items[(hash + Date.now()) % items.length];
}

function looksLikeCode(text: string) {
    const lines = text.split("\n").length;
    const symbols = (text.match(/[{}();=<>]/g) ?? []).length;
    return (lines >= 3 && symbols >= 6)
        || (/\b(?:def |function |class |import |#include|public |const |let |var |SELECT |curl |sudo |using System|fn |func |package )/.test(text) && symbols >= 3);
}

function quotedPassword(text: string) {
    if (!/(?:parola|şifre|sifre|password|passwort|contraseña|пароль)/i.test(text)) return null;
    const match = /["“”'‘’`]([^"“”'‘’`\n]{4,64})["“”'‘’`]/.exec(text);
    return match ? match[1] : null;
}

function languageName(id: SnippetLanguage) {
    return SNIPPET_LANGUAGES.find((language) => language.id === id)?.name ?? id;
}

// No \\b here: JS word boundaries are ASCII-only and would miss "zıplama".
const ENGINE_WORDS = /(?:oyun|game|unity|hanogt engine|motor|engine|sprite|prefab|rigidbody|collider|zıpla|zipla|jump|spawn|düşman|dusman|enemy|player|oyuncu|karakter|character|sahne|scene|skor|score|playerprefs|coroutine|kamera|camera|mermi|bullet|coin|monobehaviour)/i;
const HOWTO_WORDS = /(?:nasıl|nasil|how (?:do|to|can)|örne|ornek|example|kod|code|script|yaz|write|göster|show me|implement)/i;

const LANGUAGE_WORDS = new RegExp(`(?<![\\p{L}\\p{N}#+])(?:${SNIPPET_LANGUAGES.flatMap((language) => language.aliases).map((alias) => alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})(?![\\p{L}\\p{N}#+])`, "giu");
const GENERIC_WORDS = /(?<![\p{L}\p{N}])(?:kod(?:u|lar[ıi])?|code|script(?:i)?|örne(?:k|ği)|ornek|example|nasıl|nasil|yazılır|yazilir|yaz|write|how|to|do|i|in|ile|with|için|icin|bana|ver|göster|show|me|a|an|the|dilinde|language|programming|programlama|'(?:da|de|ta|te|la|le))(?![\p{L}\p{N}])/giu;

/** The task part of a code request: language names and filler words removed. */
function snippetQuery(text: string) {
    const stripped = text.toLocaleLowerCase("tr").replace(LANGUAGE_WORDS, " ").replace(GENERIC_WORDS, " ").replace(/\s+/g, " ").trim();
    return stripped || text;
}

function entryText(entry: KnowledgeEntry, tx: LocalOptions["tx"]) {
    const body = entry.parts ? entry.parts.map((part) => `• ${tx(part)}`).join("\n") : tx(entry.body);
    return `**${tx(entry.title)}**\n${body}`;
}

function suggestionsFor(intent: string | null, mode: AiMode, tx: LocalOptions["tx"]) {
    const list = (intent && SUGGESTIONS[intent]) || SUGGESTIONS[mode === "general" ? "default" : mode];
    return list.map((copy) => tx(copy));
}

function sourcesFor(entry: KnowledgeEntry | undefined, tx: LocalOptions["tx"]) {
    return entry?.links?.map((link) => ({ title: tx(link.label), href: link.href })) ?? [];
}

/** Answers a message offline. Never throws. */
export async function answerLocally(message: string, options: LocalOptions): Promise<LocalReply> {
    const { tx, mode, context } = options;
    const text = message.trim().slice(0, 8_000);
    const reply = (partial: Partial<LocalReply> & { text: string }): LocalReply => ({
        intent: null,
        confidence: 1,
        sources: [],
        suggestions: suggestionsFor(partial.intent ?? null, mode, tx),
        ...partial,
    });

    if (!text) return reply({ text: tx(pick(C.greetings, "empty")), intent: "greeting" });

    // 1. Secrets are never repeated back.
    if (containsSecret(text)) {
        const secrets = knowledgeById("secrets");
        return reply({ text: `${tx(C.secret)}\n\n${secrets ? tx(secrets.body) : ""}`.trim(), intent: "secrets", sources: sourcesFor(secrets, tx) });
    }

    // 2. "Is "Kitty2024!" a strong password?"
    const password = quotedPassword(text);
    if (password) {
        const report = checkPassword(password, options.locale.startsWith("tr") ? "tr" : "en");
        const lines = [
            tx(C.passwordHead),
            tx(C.passwordScore, { level: tx(C.passwordLevel[report.score]), score: report.score }),
            tx(C.passwordCrack, { online: report.crackTimes.online, fast: report.crackTimes.offlineFast }),
            ...report.warnings.slice(0, 3).map((warning) => `• ${tx(warning)}`),
            ...report.suggestions.slice(0, 3).map((suggestion) => `• ${tx(suggestion)}`),
            tx(C.passwordMore),
        ];
        return reply({ text: lines.join("\n"), intent: "password", suggestions: suggestionsFor("password", "security", tx) });
    }

    // 3. Links are checked structurally (no request is made).
    const url = findUrl(text);
    if (url && !looksLikeCode(text)) {
        const report = checkLink(url);
        const verdict = report.verdict === "danger" ? C.linkDanger : report.verdict === "caution" ? C.linkCaution : report.verdict === "safe" ? C.linkSafe : C.linkInvalid;
        const signals = report.signals.slice(0, 4).map((signal) => `• ${tx(signal.text)}`);
        const positives = report.positives.slice(0, 2).map((positive) => `• ${tx(positive)}`);
        return reply({
            text: [`${tx(verdict)} (${report.host ?? url})`, ...signals, ...positives, tx(C.linkNote)].join("\n"),
            intent: "phishing",
            suggestions: suggestionsFor("phishing", mode, tx),
        });
    }

    // 4. Error messages and stack traces.
    if (looksLikeError(text)) {
        const explained = explainError(text);
        if (explained) {
            const { pattern, line } = explained;
            const parts = [
                tx(C.errorHead, { title: tx(pattern.title), language: pattern.language }),
                line ? tx(C.errorLine, { line }) : "",
                `${tx(C.errorCause)} ${tx(pattern.cause)}`,
                `${tx(C.errorFix)}\n${tx(pattern.fix)}`,
            ].filter(Boolean);
            return reply({ text: parts.join("\n"), intent: "error_help", suggestions: suggestionsFor("code", "code", tx) });
        }
    }

    // 5. Pasted code: security scan (and stats).
    const scanTarget = looksLikeCode(text) ? text : null;
    if (scanTarget) {
        const report = analyzeCode(scanTarget);
        const top = report.findings.slice(0, 5).map((finding) => tx(C.scanFinding, { title: tx(finding.title), line: finding.line }));
        const parts = report.findings.length
            ? [tx(C.scanFindings, { score: report.score, grade: report.grade, count: report.findings.length }), ...top, report.blockedByGuard ? tx(C.scanBlocked) : "", tx(C.scanMore)]
            : [tx(C.scanClean)];
        parts.push(tx(C.codeStats, { language: report.language, lines: report.lines }));
        if (mode !== "security") parts.push(tx(options.signedIn ? C.codeLlmUnavailable : C.codeOfflineNote));
        return reply({ text: parts.filter(Boolean).join("\n"), intent: "code_scan", suggestions: suggestionsFor("code", "code", tx) });
    }

    // 6. Arithmetic.
    const calculation = calculate(text);
    if (calculation) {
        const trig = /\b(?:sin|cos|tan|asin|acos|atan)\b/.test(calculation.expression);
        return reply({
            text: `${tx(C.calcResult, { expression: calculation.expression, value: formatNumber(calculation.value, options.locale) })}${trig ? `\n${tx(C.calcDegrees)}` : ""}`,
            intent: "math",
            suggestions: [],
        });
    }

    // 7. Intent model + retrieval.
    const model = await loadIntentModel();
    const ranked = model ? classify(model, text) : [];
    const top = ranked[0] ?? null;
    const intent = top && top.probability >= 0.3 ? top.label : null;
    const confidence = top?.probability ?? 0;
    const hits = searchKnowledge(text, 3);
    const bestHit = hits[0] && hits[0].coverage >= 0.6 && hits[0].matched >= 2 && hits[0].score >= 3 ? hits[0] : null;

    const answerSnippet = (): LocalReply | null => {
        const wantsEngine = ENGINE_WORDS.test(text) || /\.cs$/.test(context?.fileName ?? "") && /oyun|game/i.test(context?.path ?? "");
        const results = snippets().search(snippetQuery(text), 5).filter((hit) => hit.coverage >= 0.34 && hit.matched >= 1);
        const engineHit = results.find((hit) => hit.id.startsWith("engine:"));
        const codeHit = results.find((hit) => hit.id.startsWith("code:"));
        const chosen = wantsEngine && engineHit ? engineHit : codeHit ?? engineHit;
        if (!chosen) return null;
        if (chosen.id.startsWith("engine:")) {
            const snippet = ENGINE_SNIPPETS.find((entry) => `engine:${entry.id}` === chosen.id)!;
            return reply({
                text: [tx(C.engineHead, { title: tx(snippet.title) }), "```csharp", snippet.code, "```", snippet.note ? tx(snippet.note) : "", tx(C.engineMore)].filter(Boolean).join("\n"),
                intent: "engine_help",
                confidence,
                code: { language: "cs", code: snippet.code },
            });
        }
        const snippet = SNIPPETS.find((entry) => `code:${entry.id}` === chosen.id)!;
        const language = detectSnippetLanguage(text) ?? snippetLanguageFromEditor(context?.language) ?? "python";
        const available = (snippet.code[language] ? language : (Object.keys(snippet.code)[0] as SnippetLanguage));
        const code = snippet.code[available]!;
        const fence = { python: "python", javascript: "javascript", csharp: "csharp", cpp: "cpp", java: "java" }[available];
        const editorLanguage = { python: "py", javascript: "js", csharp: "cs", cpp: "cpp", java: "java" }[available];
        return reply({
            text: [tx(C.snippetHead, { title: tx(snippet.title), language: languageName(available) }), `\`\`\`${fence}`, code, "```", snippet.note ? tx(snippet.note) : "", tx(C.snippetOther)].filter(Boolean).join("\n"),
            intent: "code_howto",
            confidence,
            code: { language: editorLanguage, code },
        });
    };

    switch (intent) {
        case "greeting":
            return reply({ text: tx(pick(C.greetings, text)), intent, confidence });
        case "thanks":
            return reply({ text: tx(pick(C.thanks, text)), intent, confidence });
        case "goodbye":
            return reply({ text: tx(pick(C.goodbye, text)), intent, confidence, suggestions: [] });
        case "joke":
            return reply({ text: tx(pick(C.jokes, text)), intent, confidence });
        case "math":
            return reply({ text: tx(C.calcHelp), intent, confidence, suggestions: [] });
        case "error_help": {
            const explained = explainError(text);
            if (explained) {
                const { pattern, line } = explained;
                return reply({
                    text: [tx(C.errorHead, { title: tx(pattern.title), language: pattern.language }), line ? tx(C.errorLine, { line }) : "", `${tx(C.errorCause)} ${tx(pattern.cause)}`, `${tx(C.errorFix)}\n${tx(pattern.fix)}`].filter(Boolean).join("\n"),
                    intent,
                    confidence,
                });
            }
            return reply({ text: tx(C.errorGeneric), intent, confidence });
        }
        case "code_howto": {
            const answer = answerSnippet();
            if (answer) return answer;
            return reply({ text: tx(C.snippetMissing), intent, confidence });
        }
        case "unknown":
            // The model is sure it's off-topic: don't let a weak keyword match answer it.
            if (confidence >= 0.45) return reply({ text: tx(options.signedIn ? C.unknownSignedIn : C.unknownSignedOut), intent: "unknown", confidence });
            break;
        case null:
            break;
        default: {
            // "C# ile zıplama kodu", "how do I read input in java": a concrete code request
            // beats a general how-to article.
            const namesLanguage = detectSnippetLanguage(text) !== null;
            if ((intent === "engine_help" && HOWTO_WORDS.test(text)) || (namesLanguage && HOWTO_WORDS.test(text) && ["run_code", "editor_help", "languages_supported"].includes(intent))) {
                const answer = answerSnippet();
                if (answer) return answer;
            }
            const entry = allKnowledge().find((candidate) => candidate.intents.includes(intent));
            if (entry) {
                // When retrieval strongly prefers another curated entry (e.g. a specific FAQ), use it.
                const chosen = bestHit && bestHit.entry.intents.length === 0 && bestHit.coverage >= 0.8 && confidence < 0.6 ? bestHit.entry : entry;
                return reply({ text: entryText(chosen, tx), intent, confidence, sources: sourcesFor(chosen, tx) });
            }
        }
    }

    // 8. Low confidence: programming how-to, then knowledge retrieval, then fallback.
    if (HOWTO_WORDS.test(text) || detectSnippetLanguage(text)) {
        const answer = answerSnippet();
        if (answer) return answer;
    }
    if (bestHit) {
        return reply({ text: entryText(bestHit.entry, tx), intent: bestHit.entry.intents[0] ?? null, confidence: Math.min(0.9, bestHit.coverage), sources: sourcesFor(bestHit.entry, tx) });
    }
    return reply({ text: tx(options.signedIn ? C.unknownSignedIn : C.unknownSignedOut), intent: "unknown", confidence });
}

export const CORE_LABEL = C.coreNote;
