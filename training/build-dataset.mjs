#!/usr/bin/env node
// Builds the supervised fine-tuning set for a Hanogt AI model (chat JSONL with
// "messages" and, for agent samples, "tools") from what this repository
// already knows:
//
//   • the knowledge base, the FAQ and the user guide (answers grounded in the
//     same retrieval notes the chat route adds to its system prompt)
//   • the intent dataset's real user phrasings (ai/dataset/intents.json)
//   • the programming concepts, code examples, programs and error
//     explanations of Hanogt AI Core (examples that run were checked by tests)
//   • the agent's site actions as tool calls in the site's own schemas, with
//     the result the browser sends back and the final answer (also denied
//     actions and Agent mode off)
//   • refusals of what the agent never does for anyone (deleting, passwords,
//     two-factor settings, admin rights, writing to others), in the Core's words
//
// No user data: everything comes from this repository. The system prompt is
// the one production sends (src/lib/server/hanogt-ai.ts), so the model learns
// in the format it will see. The code-bench tasks (scripts/ai-eval) are kept
// out so the benchmark stays honest.
//
//   node training/build-dataset.mjs [--out training/data] [--eval-share 0.05] [--seed 20261003]
//
// Needs Node 22.18+ (TypeScript type stripping), like the unit tests.
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { register } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

register("../scripts/tests/ts-hooks.mjs", import.meta.url);

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const src = (file) => import(pathToFileURL(path.join(ROOT, "src", file)).href);

/** A seeded random generator (mulberry32), so a build is reproducible. */
function random(seed) {
    let state = seed >>> 0;
    return () => {
        state = (state + 0x6d2b79f5) >>> 0;
        let t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

const TURKISH = /[çğışÇĞİŞ]|(?:^|\s)(?:ve|bir|bu|şu|ne|nasıl|nasil|neden|nedir|mı|mi|mu|mü|için|icin|ile|bana|beni|benim|grubu?|oluştur|olustur|yap|aç|ac|kur|sayfa\w*|götür|gotur|yaz|göster|goster|lütfen|lutfen|yok|istiyorum|misin|musun)(?=\s|$|[?.!,])/i;
const ENGLISH = /(?:^|\s)(?:the|a|an|how|what|why|my|me|i|create|open|make|go|to|please|show|can|you|do|is|are|write|take|start|build|new)(?=\s|$|[?.!,])/i;
/** "TR", "EN" or null (other languages are left out: the site answers them, but the training set stays bilingual). */
export function languageOf(text) {
    if (TURKISH.test(text)) return "TR";
    if (/^[\x20-\x7e]+$/.test(text) && ENGLISH.test(text)) return "EN";
    return null;
}

const txFor = (lang) => (copy, vars) => {
    const text = lang === "TR" ? copy.TR : copy.EN;
    const merged = { ...(copy.vars ?? {}), ...(vars ?? {}) };
    return text.replace(/\{([a-zA-Z0-9_]+)\}/g, (match, name) => (name in merged ? String(merged[name]) : match));
};
const fence = (language, code) => `\`\`\`${language}\n${code.trim()}\n\`\`\``;

/** The bench's function names (as definitions or calls) and 8-word runs of its prompts: none may appear in a sample. */
export async function benchFingerprints() {
    const { BENCH_TASKS } = await import(pathToFileURL(path.join(ROOT, "scripts/ai-eval/bench-tasks.mjs")).href);
    const names = [...new Set(BENCH_TASKS.flatMap((task) => task.entries))];
    const callPattern = new RegExp(`(?:^|[^\\w$.])(?:${names.map((name) => name.replace(/[$]/g, "\\$")).join("|")})\\s*\\(`);
    const shingles = new Set();
    for (const task of BENCH_TASKS) {
        for (const text of [task.prompt.TR, task.prompt.EN]) {
            const words = text.toLowerCase().split(/\s+/).filter(Boolean);
            for (let index = 0; index + 8 <= words.length; index++) shingles.add(words.slice(index, index + 8).join(" "));
        }
    }
    return { names, callPattern, shingles };
}

export function touchesBench(text, fingerprints) {
    if (fingerprints.callPattern.test(text)) return true;
    const words = text.toLowerCase().split(/\s+/).filter(Boolean);
    for (let index = 0; index + 8 <= words.length; index++) if (fingerprints.shingles.has(words.slice(index, index + 8).join(" "))) return true;
    return false;
}

/** Every sample, in a stable order. Each has an id, a group (variants of one source item share it), its source and language. */
export async function buildDataset({ seed = 20261003 } = {}) {
    const rand = random(seed);
    const pick = (list) => list[Math.floor(rand() * list.length)];
    const sampleOf = (list, count) => {
        const copy = [...list];
        for (let index = copy.length - 1; index > 0; index--) {
            const other = Math.floor(rand() * (index + 1));
            [copy[index], copy[other]] = [copy[other], copy[index]];
        }
        return copy.slice(0, count);
    };

    const [{ systemPrompt, knowledgeNotes }, { allKnowledge, knowledgeText }, { searchKnowledge }, { CONCEPTS }, snippets, { PROGRAM_SNIPPETS, PROGRAM_LANGUAGES, findProgram, pickProgramLanguage }, { ERROR_PATTERNS, explainError }, agentTools, agentIntents, localEngine] = await Promise.all([
        src("lib/server/hanogt-ai.ts"),
        src("lib/ai/knowledge.ts"),
        src("lib/ai/retrieval.ts"),
        src("lib/ai/concepts.ts"),
        src("lib/ai/snippets.ts"),
        src("lib/ai/programs.ts"),
        src("lib/ai/errors.ts"),
        src("lib/ai/agent-tools.ts"),
        src("lib/ai/agent-intents.ts"),
        src("lib/ai/local-engine.ts"),
    ]);
    // The shipped intent model, so the Core's answers below route exactly as in the browser.
    const { decodeModelBinary } = await src("lib/ai/nlp.mjs");
    const meta = JSON.parse(await readFile(path.join(ROOT, "src/lib/ai/model-meta.json"), "utf8"));
    localEngine.setIntentModel(decodeModelBinary(await readFile(path.join(ROOT, "public/ai", meta.file))));
    const intents = JSON.parse(await readFile(path.join(ROOT, "ai/dataset/intents.json"), "utf8")).intents;
    const fingerprints = await benchFingerprints();
    const tools = agentTools.agentToolSchemas();
    const programs = { findProgram, pickProgramLanguage, PROGRAM_LANGUAGES };

    const samples = [];
    const seen = new Set();
    const stats = { dropped: { bench: 0, duplicate: 0 } };
    /** System prompt exactly as the chat route builds it for this message. */
    const system = (lang, mode, userText, extra = {}) => {
        const { notes } = knowledgeNotes(userText, lang === "TR");
        return systemPrompt({ language: lang, mode, knowledge: notes, tools: [], path: "/ai", file: null, agent: "off", sensitive: null, personal: null, ...extra });
    };
    const add = (sample) => {
        // The system prompt is production's own text; what the user and the assistant say must not touch the benchmark.
        const said = sample.messages.filter((message) => message.role !== "system").map((message) => `${message.content ?? ""} ${JSON.stringify(message.tool_calls ?? "")}`).join("\n");
        if (touchesBench(said, fingerprints)) {
            stats.dropped.bench += 1;
            return;
        }
        const key = createHash("sha256").update(JSON.stringify(sample.messages.slice(1))).digest("hex");
        if (seen.has(key)) {
            stats.dropped.duplicate += 1;
            return;
        }
        seen.add(key);
        samples.push(sample);
    };
    const chat = (id, group, source, lang, mode, user, answer, extra = {}) => add({
        id,
        group,
        source,
        lang,
        messages: [{ role: "system", content: system(lang, mode, user, extra) }, { role: "user", content: user }, { role: "assistant", content: answer }],
    });

    // ---------------------------------------------------------------- knowledge, FAQ and guide
    const linksText = (entry, tx) => (entry.links?.length ? `\n\n${entry.links.map((link) => `[${tx(link.label)}](${link.href})`).join(" · ")}` : "");
    const knowledgeAnswer = (entry, lang) => `${knowledgeText(entry.body, lang === "TR")}${linksText(entry, txFor(lang))}`;
    const QUESTION_FORMS = {
        TR: ["{title} hakkında bilgi verir misin?", "{title} nedir, nasıl kullanılır?", "{title} ile ilgili bilmem gerekenler neler?"],
        EN: ["Tell me about {title}.", "What is {title} and how do I use it?", "What should I know about {title}?"],
    };
    const entries = allKnowledge();
    for (const entry of entries) {
        for (const lang of ["TR", "EN"]) {
            const title = knowledgeText(entry.title, lang === "TR");
            const isQuestion = /\?\s*$/.test(title);
            const questions = isQuestion ? [title] : sampleOf(QUESTION_FORMS[lang], entry.id.startsWith("guide:") ? 1 : 2).map((form) => form.replace("{title}", title));
            questions.forEach((question, index) => chat(`knowledge:${entry.id}:${lang}:${index}`, `knowledge:${entry.id}`, "knowledge", lang, "general", question, knowledgeAnswer(entry, lang)));
        }
    }
    // The intent dataset's own phrasings for the entries that answer an intent, kept only when
    // retrieval also ranks that entry first: a generic answer to a specific question teaches nothing good.
    const byIntent = new Map();
    for (const entry of entries) for (const intent of entry.intents) if (!byIntent.has(intent)) byIntent.set(intent, entry);
    for (const [intent, entry] of byIntent) {
        if (agentIntents.isCoreActionIntent(intent)) continue;
        const phrasings = (intents[intent] ?? []).map((text) => ({ text, lang: languageOf(text) })).filter((item) => item.lang && searchKnowledge(item.text, 1)[0]?.id === entry.id);
        for (const [index, item] of sampleOf(phrasings, 14).entries()) {
            chat(`phrasing:${intent}:${index}`, `knowledge:${entry.id}`, "phrasing", item.lang, "general", item.text, knowledgeAnswer(entry, item.lang));
        }
    }

    // ---------------------------------------------------------------- programming concepts
    const CONCEPT_FORMS = {
        TR: ["{title} nedir?", "{title} kavramını açıklar mısın?", "Bana {title} konusunu kısaca anlat."],
        EN: ["What is {title}?", "Can you explain {title}?", "Briefly explain {title} to me."],
    };
    for (const concept of CONCEPTS) {
        for (const lang of ["TR", "EN"]) {
            const tx = txFor(lang);
            const title = tx(concept.title).replace(/\s*\([^)]*\)\s*$/, "");
            const answer = [`**${tx(concept.title)}**`, tx(concept.text), concept.example ? fence(concept.example.language, concept.example.code) : ""].filter(Boolean).join("\n\n");
            sampleOf(CONCEPT_FORMS[lang], 2).forEach((form, index) => chat(`concept:${concept.id}:${lang}:${index}`, `concept:${concept.id}`, "concept", lang, "code", form.replace("{title}", title), answer));
        }
    }
    const conceptPhrasings = (intents.code_concept ?? []).map((text) => ({ text, lang: languageOf(text) })).filter((item) => item.lang);
    for (const [index, item] of conceptPhrasings.entries()) {
        const reply = await localEngine.answerLocally(item.text, { tx: txFor(item.lang), locale: item.lang === "TR" ? "tr-TR" : "en-US", mode: "code", signedIn: true, context: null, agentMode: "ask" });
        if (reply.intent !== "code_concept") continue;
        chat(`concept-phrasing:${index}`, `concept-phrasing:${index}`, "concept", item.lang, "code", item.text, reply.text);
    }

    // ---------------------------------------------------------------- code examples
    const LANGUAGE_NAMES = { python: "Python", javascript: "JavaScript", csharp: "C#", cpp: "C++", java: "Java", html: "HTML" };
    const FENCES = { python: "python", javascript: "javascript", csharp: "csharp", cpp: "cpp", java: "java", html: "html" };
    // Turkish suffixes follow the name's last vowel: Python'da, JavaScript'te, C#'ta.
    const LOCATIVE = { python: "Python'da", javascript: "JavaScript'te", csharp: "C#'ta", cpp: "C++'ta", java: "Java'da", html: "HTML'de" };
    const SNIPPET_FORMS = {
        TR: ["{language} ile {title} örneği gösterir misin?", "{locative} {title} nasıl yapılır?", "{title} için {language} kodu yazar mısın?"],
        EN: ["Show me a {language} example of {title}.", "How do I do {title} in {language}?", "Can you write {language} code for {title}?"],
    };
    for (const snippet of snippets.SNIPPETS) {
        for (const [language, code] of Object.entries(snippet.code)) {
            for (const lang of ["TR", "EN"]) {
                const tx = txFor(lang);
                const title = tx(snippet.title).toLocaleLowerCase(lang === "TR" ? "tr" : "en");
                const question = pick(SNIPPET_FORMS[lang]).replace("{locative}", LOCATIVE[language]).replace("{language}", LANGUAGE_NAMES[language]).replace("{title}", title);
                const answer = [lang === "TR" ? `İşte ${LANGUAGE_NAMES[language]} ile ${title}:` : `Here's ${title} in ${LANGUAGE_NAMES[language]}:`, fence(FENCES[language], code), snippet.note ? tx(snippet.note) : ""].filter(Boolean).join("\n\n");
                chat(`snippet:${snippet.id}:${language}:${lang}`, `snippet:${snippet.id}`, "snippet", lang, "code", question, answer);
            }
        }
    }
    for (const snippet of snippets.ENGINE_SNIPPETS) {
        for (const lang of ["TR", "EN"]) {
            const tx = txFor(lang);
            const title = tx(snippet.title);
            const question = lang === "TR" ? `Hanogt Engine'de ${title.toLocaleLowerCase("tr")} için C# script yazar mısın?` : `Can you write a Hanogt Engine C# script for ${title.toLowerCase()}?`;
            const answer = [lang === "TR" ? `**${title}** (Hanogt Engine, C#):` : `**${title}** (Hanogt Engine, C#):`, fence("csharp", snippet.code), snippet.note ? tx(snippet.note) : ""].filter(Boolean).join("\n\n");
            chat(`engine:${snippet.id}:${lang}`, `engine:${snippet.id}`, "engine", lang, "code", question, answer);
        }
    }
    for (const program of PROGRAM_SNIPPETS) {
        for (const [language, code] of Object.entries(program.code)) {
            const lang = rand() < 0.6 ? "TR" : "EN";
            const tx = txFor(lang);
            const title = tx(program.title);
            const question = lang === "TR" ? `${LANGUAGE_NAMES[language]} ile ${title.toLocaleLowerCase("tr")} yazar mısın?` : `Can you write ${title.toLowerCase()} in ${LANGUAGE_NAMES[language]}?`;
            const file = `${program.file}.${PROGRAM_LANGUAGES[language].extension}`;
            const answer = [lang === "TR" ? `**${title}** — \`${file}\`:` : `**${title}** — \`${file}\`:`, fence(FENCES[language], code), program.note ? tx(program.note) : ""].filter(Boolean).join("\n\n");
            chat(`program:${program.id}:${language}`, `program:${program.id}`, "program", lang, "code", question, answer);
        }
    }

    // ---------------------------------------------------------------- error explanations
    const errorTexts = (intents.error_help ?? []).filter((text) => explainError(text));
    for (const [index, text] of errorTexts.entries()) {
        const { pattern, line } = explainError(text);
        for (const lang of ["TR", "EN"]) {
            const tx = txFor(lang);
            const question = lang === "TR" ? `Şu hatayı alıyorum, ne demek?\n\n${text}` : `I'm getting this error, what does it mean?\n\n${text}`;
            const answer = [
                `**${tx(pattern.title)}** (${pattern.language})${line ? (lang === "TR" ? ` — satır ${line}` : ` — line ${line}`) : ""}`,
                `${lang === "TR" ? "**Neden:**" : "**Why:**"} ${tx(pattern.cause)}`,
                `${lang === "TR" ? "**Nasıl düzeltilir:**" : "**How to fix it:**"}\n${tx(pattern.fix)}`,
            ].join("\n\n");
            chat(`error:${pattern.id}:${index}:${lang}`, `error:${pattern.id}`, "error", lang, "code", question, answer);
        }
    }
    stats.errorPatternsCovered = new Set(errorTexts.map((text) => explainError(text).pattern.id)).size;
    stats.errorPatterns = ERROR_PATTERNS.length;

    // ---------------------------------------------------------------- agent actions
    const callId = () => `call_${Math.floor(rand() * 2 ** 40).toString(36).padStart(8, "0")}`;
    const resultFor = (call) => {
        switch (call.name) {
            case "create_group":
                return { status: "created", groupId: `g_${Math.floor(rand() * 1e9).toString(36)}`, name: call.args.name, template: call.args.template, url: "/social" };
            case "create_game":
                return { status: "created", projectId: `p_${Math.floor(rand() * 1e9).toString(36)}`, name: call.args.name, template: call.args.template, url: "/game-engine", opened: true };
            case "open_editor_with_code":
                return { status: "opened", fileName: call.args.fileName, note: "The code is open in a new unsaved Code Editor tab." };
            case "navigate":
                return { status: "opened", route: call.args.route };
            case "get_my_profile":
                return { status: "ok", profile: { displayName: "Deniz", handle: "deniz#4821", bio: "Oyun ve web geliştirmeyi seviyorum.", favoriteLanguages: ["Python", "C#"], memberSince: "2025-11-02", role: null, counts: { projects: 6, gameProjects: 2, groups: 3, friends: 11, mediaPosts: 4 } } };
            default:
                return { status: "ok" };
        }
    };
    const finalAnswer = (call, result, lang) => {
        const tr = lang === "TR";
        if (result.status === "denied") {
            return tr ? "Tamam, bu işlemi yapmadım; hiçbir şey değişmedi. İstersen ayrıntıları değiştirip yeniden deneyebiliriz." : "Okay, I didn't do it; nothing was changed. If you like, we can adjust the details and try again.";
        }
        switch (call.name) {
            case "create_group":
                return tr ? `**${result.name}** grubu hazır. Kanalları ve başlangıç dosyalarını [Hanogt Social](${result.url}) içinden düzenleyebilir, arkadaşlarını davet edebilirsin.` : `The **${result.name}** group is ready. You can edit its channels and starter files in [Hanogt Social](${result.url}) and invite your friends.`;
            case "create_game":
                return tr ? `**${result.name}** oyun projesini oluşturup motorda açtım. Sahnedeki nesneleri düzenleyip ▶ ile oynayarak deneyebilirsin.` : `I created the **${result.name}** game project and opened it in the engine. Edit the objects in the scene and press ▶ to play-test it.`;
            case "open_editor_with_code":
                return tr ? `\`${result.fileName}\` Kod Editörü'nde yeni, kaydedilmemiş bir sekmede açık. ▶ ile çalıştırabilirsin; beğenirsen kaydetmeyi unutma.` : `\`${result.fileName}\` is open in a new, unsaved Code Editor tab. Run it with ▶, and remember to save it if you like it.`;
            case "navigate": {
                const label = txFor(lang)(agentIntents.routeLabel(result.route));
                return tr ? `${label} sayfasını açtım.` : `I opened the ${label} page.`;
            }
            case "get_my_profile": {
                const profile = result.profile;
                return tr
                    ? `Profilin: **${profile.displayName}** (${profile.handle}). Favori dillerin ${profile.favoriteLanguages.join(" ve ")}; ${profile.counts.projects} kod projen, ${profile.counts.gameProjects} oyun projen, ${profile.counts.groups} grubun ve ${profile.counts.friends} arkadaşın var. Biyografin: "${profile.bio}"`
                    : `Your profile: **${profile.displayName}** (${profile.handle}). Your favourite languages are ${profile.favoriteLanguages.join(" and ")}; you have ${profile.counts.projects} code projects, ${profile.counts.gameProjects} game projects, ${profile.counts.groups} groups and ${profile.counts.friends} friends. Bio: "${profile.bio}"`;
            }
            default:
                return tr ? "Tamamlandı." : "Done.";
        }
    };
    const offAnswer = (call, lang) => {
        const tr = lang === "TR";
        const how = {
            create_group: tr ? "[Hanogt Social](/social) sayfasında sol taraftaki **+** düğmesiyle yeni bir grup kurabilirsin." : "You can create a group with the **+** button on the left of [Hanogt Social](/social).",
            create_game: tr ? "[Oyun Motoru](/game-engine) sayfasında **Yeni proje** ile bir şablon seçerek başlayabilirsin." : "Start from a template with **New project** on the [Game Engine](/game-engine) page.",
            open_editor_with_code: tr ? "Kodu [Kod Editörü](/editor)'nde yeni bir dosyaya yapıştırabilirsin." : "You can paste the code into a new file in the [Code Editor](/editor).",
            navigate: tr ? `Sayfaya [buradan](${call.args.route}) gidebilirsin.` : `You can open the page [here](${call.args.route}).`,
            get_my_profile: tr ? "Profilini [Hesap Ayarları](/account-settings) içinde görebilirsin." : "You can see your profile in [Account Settings](/account-settings).",
        }[call.name] ?? "";
        return `${how} ${tr ? "Ajan modunu (mesaj kutusunun yanındaki Ajan menüsü) açarsan bunu iznini alarak senin için yapabilirim." : "If you turn on Agent mode (the Agent menu next to the message box), I can do it for you with your permission."}`.trim();
    };
    for (const intent of agentIntents.CORE_ACTION_INTENTS) {
        const phrasings = (intents[intent] ?? []).map((text) => ({ text, lang: languageOf(text) })).filter((item) => item.lang);
        for (const [index, item] of sampleOf(phrasings, 70).entries()) {
            const tx = txFor(item.lang);
            const proposal = agentIntents.proposeCoreAction(intent, item.text, { tx, programs, editorLanguage: null });
            if (!proposal || proposal.kind !== "call") continue;
            // Only calls a good answer would make: a game template that really matches the request (not the
            // Core's fallback), a group with a name; empty optional arguments are left out.
            if (proposal.call.name === "create_game" && !agentIntents.matchGameTemplate(item.text)) continue;
            if (proposal.call.name === "create_group" && !String(proposal.call.args.name ?? "").trim()) continue;
            const call = { name: proposal.call.name, args: Object.fromEntries(Object.entries(proposal.call.args).filter(([, value]) => value !== "" && value !== null && value !== undefined)) };
            const group = `agent:${intent}:${index}`;
            const roll = rand();
            if (roll < 0.12) {
                // Agent mode off: explain, don't call.
                chat(`${group}:off`, group, "agent-off", item.lang, "general", item.text, offAnswer(call, item.lang), { agent: "off" });
                continue;
            }
            const id = callId();
            const result = roll < 0.24 ? { status: "denied", note: "The user declined this action. Nothing was done." } : resultFor(call);
            add({
                id: `${group}:${result.status}`,
                group,
                source: "agent",
                lang: item.lang,
                tools,
                messages: [
                    { role: "system", content: system(item.lang, "general", item.text, { agent: "requested" }) },
                    { role: "user", content: item.text },
                    { role: "assistant", content: "", tool_calls: [{ id, type: "function", function: { name: call.name, arguments: call.args } }] },
                    { role: "tool", tool_call_id: id, name: call.name, content: JSON.stringify(result) },
                    { role: "assistant", content: finalAnswer(call, result, item.lang) },
                ],
            });
        }
    }

    // ---------------------------------------------------------------- refusals
    const SENSITIVE = {
        TR: ["hesabımı sil", "tüm projelerimi sil", "şifremi değiştir", "iki adımlı doğrulamayı kapat", "beni admin yap", "şu kullanıcıyı banla", "arkadaşıma benim adıma mesaj gönder", "grubumu sil gitsin"],
        EN: ["delete my account", "remove all my projects", "change my password", "turn off two-factor authentication", "make me an admin", "ban that user", "send a message to my friend as me", "delete my group"],
    };
    for (const lang of ["TR", "EN"]) {
        for (const [index, text] of SENSITIVE[lang].entries()) {
            const sensitive = agentTools.detectSensitiveRequest(text);
            if (!sensitive) continue;
            const reply = await localEngine.answerLocally(text, { tx: txFor(lang), locale: lang === "TR" ? "tr-TR" : "en-US", mode: "general", signedIn: true, context: null, agentMode: "ask" });
            if (reply.intent !== "refused") continue;
            chat(`refusal:${sensitive}:${lang}:${index}`, `refusal:${sensitive}:${index}`, "refusal", lang, "general", text, reply.text.replace(/^🔒\s*/, ""), { sensitive, agent: "requested" });
        }
    }

    stats.total = samples.length;
    return { samples, stats };
}

/** Train/eval split by group, so the variants of one source item never straddle the two (a stable hash picks the eval share). */
export function splitDataset(samples, evalShare = 0.05) {
    const train = [];
    const evaluation = [];
    for (const sample of samples) {
        const bucket = Number.parseInt(createHash("sha256").update(sample.group).digest("hex").slice(0, 8), 16) / 0xffffffff;
        (bucket < evalShare ? evaluation : train).push(sample);
    }
    return { train, evaluation };
}

/** Samples per source and language, and their size in characters (≈ 3.5 characters a token). */
export function describeDataset(samples) {
    const count = (key) => samples.reduce((totals, sample) => ({ ...totals, [sample[key]]: (totals[sample[key]] ?? 0) + 1 }), {});
    const chars = samples.reduce((sum, sample) => sum + sample.messages.reduce((inner, message) => inner + (message.content?.length ?? 0) + JSON.stringify(message.tool_calls ?? "").length, 0), 0);
    return { samples: samples.length, bySource: count("source"), byLanguage: count("lang"), characters: chars, approxTokens: Math.round(chars / 3.5) };
}

const line = (sample) => JSON.stringify({ id: sample.id, source: sample.source, lang: sample.lang, messages: sample.messages, ...(sample.tools ? { tools: sample.tools } : {}) });

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
    const { parseArgs } = await import("node:util");
    const { values } = parseArgs({ options: { out: { type: "string", default: "training/data" }, "eval-share": { type: "string", default: "0.05" }, seed: { type: "string", default: "20261003" } } });
    const { samples, stats } = await buildDataset({ seed: Number(values.seed) });
    const { train, evaluation } = splitDataset(samples, Number(values["eval-share"]));
    const out = path.resolve(values.out);
    await mkdir(out, { recursive: true });
    await writeFile(path.join(out, "train.jsonl"), `${train.map(line).join("\n")}\n`);
    await writeFile(path.join(out, "eval.jsonl"), `${evaluation.map(line).join("\n")}\n`);
    const summary = { built: new Date().toISOString(), seed: Number(values.seed), train: describeDataset(train), eval: describeDataset(evaluation), dropped: stats.dropped, errorPatterns: { covered: stats.errorPatternsCovered, total: stats.errorPatterns } };
    await writeFile(path.join(out, "stats.json"), `${JSON.stringify(summary, null, 2)}\n`);
    console.log(JSON.stringify(summary, null, 2));
    console.log(`→ ${path.relative(process.cwd(), path.join(out, "train.jsonl"))}, ${path.relative(process.cwd(), path.join(out, "eval.jsonl"))}`);
}
