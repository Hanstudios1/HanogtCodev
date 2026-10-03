/**
 * Hanogt AI Core: the offline engine that runs in the browser when the large
 * language model isn't available (signed out, not configured, rate-limited,
 * offline). It combines deterministic tools (secret detection, password
 * strength, link check, error explainer, code scan, calculator) with the trained
 * intent model (public/ai/hanogt-intent-model.bin) and BM25 retrieval over the
 * knowledge base and code examples. Action intents ("React çalışma grubu kur")
 * become the same agent tool calls the language model makes (agent-intents.ts),
 * and requests Hanogt AI must never carry out are refused with an explanation.
 * Answers are built from static { TR, EN } copy, so they are translated by the
 * copy packs like the rest of the UI.
 */
import type { Copy } from "@/lib/i18n";
import { analyzeCode, containsSecret } from "@/lib/security/advisor";
import { checkLink, findUrl } from "@/lib/security/links";
import { checkPassword } from "@/lib/security/password";
import { isCoreActionIntent, proposeCoreAction, routeLabel, type CoreProgram, type CoreProposal, type ProgramLibrary } from "./agent-intents";
import { agentGameTemplates, AGENT_TOOL_REQUIRES_AUTH, detectSensitiveRequest, isHowToQuestion, type AgentCallInput, type AgentMode, type SensitiveRequest } from "./agent-tools";
import { calculate, formatNumber } from "./calc";
import { explainError, looksLikeError } from "./errors";
import { allKnowledge, type KnowledgeEntry } from "./knowledge";
import { knowledgeById, searchKnowledge } from "./retrieval";
import modelMeta from "./model-meta.json";
import { Bm25Index, classify, decodeModelBinary } from "./nlp.mjs";
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
    /** Agent actions to propose (shown as permission cards). */
    actions?: AgentCallInput[];
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
    /** The chat's agent mode: "off" explains how to do things instead of proposing actions. */
    agentMode?: AgentMode;
}

type IntentModel = Parameters<typeof classify>[0] & { threshold?: number };

let modelPromise: Promise<IntentModel | null> | null = null;

/** Loads the trained intent model once; null if it can't be fetched. */
export function loadIntentModel(): Promise<IntentModel | null> {
    if (!modelPromise) {
        modelPromise = fetch(`/ai/${modelMeta.file}?v=${modelMeta.hash}`, { cache: "force-cache" })
            .then((response) => (response.ok ? response.arrayBuffer() : null))
            .then((buffer) => {
                if (!buffer) return null;
                const model = decodeModelBinary(buffer) as IntentModel;
                return model.featureVersion === modelMeta.featureVersion ? model : null;
            })
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

type ConceptLibrary = { concepts: typeof import("./concepts").CONCEPTS; index: InstanceType<typeof Bm25Index> };
let conceptLibrary: Promise<ConceptLibrary | null> | null = null;
/** The programming concepts glossary (concepts.ts) and its index, loaded on first use. */
function conceptsLibrary() {
    conceptLibrary ??= import("./concepts")
        .then(({ CONCEPTS }) => ({
            concepts: CONCEPTS,
            index: new Bm25Index(CONCEPTS.map((concept) => ({ id: concept.id, text: `${concept.title.TR} ${concept.title.EN} ${concept.keywords} ${concept.keywords}` }))),
        }))
        .catch(() => null);
    return conceptLibrary;
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
    programHead: { TR: "**{title}** — {language}:", EN: "**{title}** — {language}:" },
    programMissingLanguage: { TR: "{requested} için hazır bir örneğim yok, aynı programı {language} ile yazdım. Giriş yaptığında dil modeli {requested} ile de yazabilir.", EN: "I don't have a ready example in {requested}, so I wrote the same program in {language}. When you're signed in, the language model can write it in {requested} too." },
    programOpenHint: { TR: "Editörde açmamı istersen \"editörde aç\" yaz ya da aşağıdaki **Editörde aç** düğmesini kullan.", EN: "To open it in the editor, say \"open it in the editor\" or use the **Open in editor** button below." },
    programNeedTopic: { TR: "Ne yazmamı istersin? Örneğin: \"Python ile hesap makinesi yaz ve editörde aç\", \"HTML ile yılan oyunu yap\" ya da \"JavaScript ile yapılacaklar listesi\". Hazır programlarım: {programs}.", EN: "What should I write? For example: \"Write a calculator in Python and open it in the editor\", \"Make a snake game in HTML\" or \"A to-do list in JavaScript\". Ready programs: {programs}." },
    actionGroup: { TR: "**{name}** adında yeni bir grup oluşturabilirim. Ayrıntıları kartta düzenleyebilirsin; izin verdiğinde oluşturacağım.", EN: "I can create a new group called **{name}**. You can edit the details on the card; I'll create it when you allow it." },
    actionGroupUnnamed: { TR: "Senin için yeni bir grup oluşturabilirim. Karta bir ad yaz, istersen şablonu değiştir; izin verdiğinde oluşturacağım.", EN: "I can create a new group for you. Enter a name on the card and change the template if you like; I'll create it when you allow it." },
    actionProfile: { TR: "Profil bilgilerine bakmam için izin vermen gerekiyor. Yalnızca görünen adını, takma adını, biyografini, favori dillerini ve sayılarını okurum; e-posta gibi özel bilgileri okumam.", EN: "I need your permission to look at your profile. I only read your display name, nickname, bio, favourite languages and counts, never private data such as your e-mail." },
    actionGame: { TR: "**{template}** şablonuyla **{name}** adında yeni bir oyun projesi oluşturup Oyun Motoru'nda açabilirim. Şablonu ve adı kartta değiştirebilirsin.", EN: "I can create a new game project called **{name}** from the **{template}** template and open it in the Game Engine. You can change the template and the name on the card." },
    actionNavigate: { TR: "**{page}** sayfasını açayım mı?", EN: "Shall I open **{page}**?" },
    actionEditor: { TR: "Kodu Kod Editörü'nde yeni bir sekmede açabilirim (hiçbir şey kaydedilmez ya da çalıştırılmaz).", EN: "I can open the code in a new Code Editor tab (nothing is saved or run)." },
    agentOff: { TR: "**Ajan modu kapalı** olduğu için bunu senin yerine yapmıyorum. Mesaj kutusunun yanındaki **Ajan** menüsünden açarsan, her adımda iznini alarak yapabilirim.", EN: "**Agent mode is off**, so I won't do this for you. Turn it on from the **Agent** menu next to the message box and I can do it, asking for your permission at every step." },
    manualGroup: { TR: "Kendin oluşturmak için [Hanogt Social](/social?create=1)'de grup rayındaki **Grup oluştur** düğmesini kullan.", EN: "To create it yourself, use **Create a group** in the group rail of [Hanogt Social](/social?create=1)." },
    manualProfile: { TR: "Profilini [Hesap Ayarları](/account-settings) sayfasında görebilirsin.", EN: "You can see your profile on the [Account Settings](/account-settings) page." },
    manualEditor: { TR: "Kodu **Editörde aç** düğmesiyle kendin açabilirsin.", EN: "You can open the code yourself with the **Open in editor** button." },
    manualGame: { TR: "[Oyun Motoru](/game-engine) sayfasında **Yeni proje** ile bir şablon seçebilirsin.", EN: "On the [Game Engine](/game-engine) page, pick a template with **New project**." },
    manualNavigate: { TR: "Sayfaya buradan gidebilirsin: [{page}]({route})", EN: "You can go there from here: [{page}]({route})" },
    signInForAction: { TR: "Bunu yapabilmem için **giriş yapman** gerekiyor; işlemler senin hesabınla, senin izninle yapılır. [Giriş yap](/login)", EN: "I need you to **sign in** first; actions run with your own account and your permission. [Sign in](/login)" },
    refused: {
        delete: { TR: "🔒 Silme işlemlerini (hesap, grup, proje, mesaj…) senin yerine yapmam; geri alınamayan işlemleri yalnızca sen yapabilirsin. Hesabınla ilgili ayarlar [Hesap Ayarları](/account-settings) sayfasında; grup ve projeleri kendi sayfalarındaki menüden silebilirsin.", EN: "🔒 I don't delete things (accounts, groups, projects, messages…) for you; only you can do something that can't be undone. Account options are on [Account Settings](/account-settings); groups and projects can be deleted from the menu on their own pages." },
        password: { TR: "🔒 Parolanı göremem, değiştiremem ya da sıfırlayamam; bunu yalnızca sen yapabilirsin. Parolanı [Hesap Ayarları](/account-settings) sayfasından değiştirebilir, giriş sayfasındaki **Parolamı unuttum** ile sıfırlayabilirsin. Parolanı kimseyle, benimle bile paylaşma.", EN: "🔒 I can't see, change or reset your password; only you can. Change it on [Account Settings](/account-settings) or reset it with **Forgot password** on the sign-in page. Never share your password with anyone, me included." },
        two_factor: { TR: "🔒 İki adımlı doğrulamayı (2FA) senin yerine açıp kapatamam ya da sıfırlayamam; hesabının güvenliği için bu ayarı yalnızca sen değiştirebilirsin: [Hesap Ayarları](/account-settings).", EN: "🔒 I can't turn two-factor authentication (2FA) on or off or reset it for you; for your account's safety only you can change it: [Account Settings](/account-settings)." },
        admin: { TR: "🔒 Yetki ya da rol veremem ve yönetici işlemleri yapamam. Admin Paneli yalnızca yetkili ekip üyelerine açıktır ve oradaki her işlem denetim kaydına yazılır.", EN: "🔒 I can't grant permissions or roles or do admin work. The Admin Panel is only open to authorised staff, and every action there is written to the audit log." },
        moderation: { TR: "🔒 Kimseyi yasaklayamam, susturamam ya da gruptan çıkaramam. Bir sorunu [Geri Bildirim ve Destek](/feedback) sayfasından bildirebilirsin; grup yöneticisiysen bu işlemleri grup ayarlarından kendin yapabilirsin.", EN: "🔒 I can't ban, mute or remove anyone. Report a problem on [Feedback and Support](/feedback); if you manage a group, you can do this yourself in the group settings." },
        message_others: { TR: "🔒 Başkalarına senin adına mesaj, davet ya da yorum göndermem. Metni yazmana yardım edebilirim; göndermeyi [Hanogt Social](/social)'deki direkt mesajlardan kendin yaparsın.", EN: "🔒 I don't send messages, invites or comments to other people on your behalf. I can help you write the text; you send it yourself from your direct messages in [Hanogt Social](/social)." },
    } satisfies Record<SensitiveRequest, Copy>,
    relatedTitle: { TR: "İlgili:", EN: "Related:" },
    coreNote: { TR: "Hanogt AI Çekirdeği · çevrimdışı", EN: "Hanogt AI Core · offline" },
};

const SUGGESTIONS: Record<string, Copy[]> = {
    default: [
        { TR: "Neler yapabilirsin?", EN: "What can you do?" },
        { TR: "Python'da liste nasıl sıralanır?", EN: "How do I sort a list in Python?" },
        { TR: "Zıplama kodu (Hanogt Engine)", EN: "Jump code (Hanogt Engine)" },
    ],
    code_concept: [
        { TR: "Özyineleme nedir?", EN: "What is recursion?" },
        { TR: "async/await nasıl çalışır?", EN: "How does async/await work?" },
        { TR: "SQL ile NoSQL farkı", EN: "SQL vs NoSQL" },
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

// The question around a concept ("X nedir", "what is X", "X ile Y farkı"); no lookbehind (older Safari can't parse it).
const CONCEPT_FILLER = new RegExp(`(^|[^\\p{L}\\p{N}_])(?:${[
    "nedir", "ne demek(?:tir)?", "ne işe yarar", "ne ise yarar", "ne zaman kullanılır", "nasıl çalışır", "nasil calisir", "neden önemli",
    "açıklar mısın", "açıkla", "acikla", "anlatır mısın", "anlat", "kısaca", "basitçe", "tam olarak", "programlamada", "yazılımda",
    "hakkında bilgi verir misin", "kavramını", "kavramı", "mantığını anlamadım", "arasındaki", "farkı", "fark", "farklar", "neler", "nelerdir", "bana",
    "bir", "bu", "oluyor", "olur", "aynı şey", "m[ıiuü]", "neden", "kullanırız", "işler",
    "what(?:'s| is| are)?", "explain", "explained", "simply", "define", "meaning of", "mean", "does", "how", "work", "why do we use",
    "when should i use", "help me understand", "i don't understand", "in programming", "difference between", "the", "an?", "vs", "and", "ile", "ve",
].join("|")})(?=$|[^\\p{L}\\p{N}_])`, "giu");
/** Asks what a programming concept is (used when the intent model isn't sure). */
const DEFINITION_WORDS = /(?:nedir|ne demek|ne işe yarar|farkı|nasıl (?:çalışır|işler)|what (?:is|are|'s)|what's|explain|difference between|how does|\bvs\b)/i;

/** The concept part of a "what is X" question. */
function conceptQuery(text: string) {
    const stripped = text.toLocaleLowerCase("tr").replace(/[?!.,:;"“”]+/g, " ").replace(CONCEPT_FILLER, "$1 ").replace(/\s+/g, " ").trim();
    return stripped || text;
}

// ------------------------------------------------------------------ agent actions
const PROGRAM_INTENTS = new Set(["write_code", "open_editor", "make_game"]);

type ProgramsModule = typeof import("./programs");

/** The program library is a separate chunk: only code requests download it. */
async function programLibrary(): Promise<ProgramsModule | null> {
    try {
        return await import("./programs");
    } catch {
        return null;
    }
}

function programParts(found: CoreProgram, library: ProgramLibrary, tx: LocalOptions["tx"]) {
    const info = library.PROGRAM_LANGUAGES[found.language];
    return [
        tx(C.programHead, { title: tx(found.program.title), language: info.name }),
        [`\`\`\`${found.language}`, (found.program.code[found.language] ?? "").trimEnd(), "```"].join("\n"),
        found.missingLanguage ? tx(C.programMissingLanguage, { requested: found.missingLanguage, language: info.name }) : "",
        found.program.note ? tx(found.program.note) : "",
    ].filter(Boolean);
}

/** What the card will do, in one sentence. */
function describeCall(call: AgentCallInput, tx: LocalOptions["tx"]) {
    switch (call.name) {
        case "create_group":
            return call.args.name ? tx(C.actionGroup, { name: call.args.name }) : tx(C.actionGroupUnnamed);
        case "get_my_profile":
            return tx(C.actionProfile);
        case "create_game": {
            const template = agentGameTemplates().find((entry) => entry.id === call.args.template);
            return tx(C.actionGame, { name: call.args.name, template: template ? tx(template.name) : call.args.template });
        }
        case "navigate":
            return tx(C.actionNavigate, { page: tx(routeLabel(call.args.route)) });
        case "open_editor_with_code":
            return tx(C.actionEditor);
        default:
            return "";
    }
}

/** How to do it by hand when Hanogt AI may not. */
function manualSteps(call: AgentCallInput, tx: LocalOptions["tx"]) {
    switch (call.name) {
        case "create_group":
            return tx(C.manualGroup);
        case "get_my_profile":
            return tx(C.manualProfile);
        case "create_game":
            return tx(C.manualGame);
        case "navigate":
            return tx(C.manualNavigate, { page: tx(routeLabel(call.args.route)), route: call.args.route });
        case "open_editor_with_code":
            return tx(C.manualEditor);
        default:
            return "";
    }
}

/** Core's action for a message, used when the language model can't call tools. */
export async function proposeActionsLocally(message: string, options: Pick<LocalOptions, "tx" | "context">): Promise<AgentCallInput[]> {
    const text = message.trim().slice(0, 8_000);
    if (!text || detectSensitiveRequest(text)) return [];
    const model = await loadIntentModel();
    const top = model ? classify(model, text)[0] : null;
    if (!top || top.probability < 0.5 || !isCoreActionIntent(top.label)) return [];
    const library = PROGRAM_INTENTS.has(top.label) ? await programLibrary() : null;
    const proposal = proposeCoreAction(top.label, text, { tx: options.tx, programs: library, editorLanguage: options.context?.language });
    return proposal?.kind === "call" ? [proposal.call] : [];
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

    // 7. Requests Hanogt AI never carries out ("hesabımı sil", "beni admin yap"); how-to questions are answered below.
    const sensitive = detectSensitiveRequest(text);
    if (sensitive && !isHowToQuestion(text)) {
        return reply({ text: tx(C.refused[sensitive]), intent: "refused", suggestions: [] });
    }

    // 8. Intent model + retrieval.
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

    /** A programming concept from the glossary; `strict` when the intent model didn't ask for one. */
    const answerConcept = async (strict: boolean): Promise<LocalReply | null> => {
        const library = await conceptsLibrary();
        const hit = library?.index.search(conceptQuery(text), 1)[0];
        if (!library || !hit || hit.coverage < (strict ? 0.6 : 0.5)) return null;
        const concept = library.concepts.find((entry) => entry.id === hit.id);
        if (!concept) return null;
        const example = concept.example;
        const editorLanguage = example?.language === "python" ? "py" : example?.language === "javascript" ? "js" : null;
        return reply({
            text: [`**${tx(concept.title)}**`, tx(concept.text), example ? `\`\`\`${example.language}\n${example.code}\n\`\`\`` : ""].filter(Boolean).join("\n\n"),
            intent: "code_concept",
            confidence: strict ? Math.min(0.9, hit.coverage) : confidence,
            ...(example && editorLanguage ? { code: { language: editorLanguage, code: example.code } } : {}),
        });
    };

    // 9. Agent actions: the same tool calls the language model would make, shown as permission cards.
    const actionReply = (proposal: CoreProposal, library: ProgramsModule | null): LocalReply | null => {
        if (proposal.kind === "need_topic") {
            const programs = library ? library.PROGRAM_SNIPPETS.map((program) => tx(program.title)).join(", ") : "";
            return reply({ text: tx(C.programNeedTopic, { programs }), intent, confidence, suggestions: [] });
        }
        const found = proposal.program ?? null;
        const parts = found && library ? programParts(found, library, tx) : [];
        const code = found && library ? { language: library.PROGRAM_LANGUAGES[found.language].id, code: found.program.code[found.language] ?? "" } : undefined;
        if (proposal.kind === "code") {
            return reply({ text: [...parts, tx(C.programOpenHint)].join("\n\n"), intent, confidence, code });
        }
        const { call } = proposal;
        if (options.agentMode === "off") {
            return reply({ text: [...parts, tx(C.agentOff), manualSteps(call, tx)].filter(Boolean).join("\n\n"), intent, confidence, code });
        }
        if (AGENT_TOOL_REQUIRES_AUTH[call.name] && !options.signedIn) {
            return reply({ text: [...parts, tx(C.signInForAction), manualSteps(call, tx)].filter(Boolean).join("\n\n"), intent, confidence, code });
        }
        return reply({ text: [...parts, describeCall(call, tx)].filter(Boolean).join("\n\n"), intent, confidence, code, actions: [call] });
    };
    if (intent && isCoreActionIntent(intent)) {
        const library = PROGRAM_INTENTS.has(intent) ? await programLibrary() : null;
        const proposal = proposeCoreAction(intent, text, { tx, programs: library, editorLanguage: context?.language });
        const answer = proposal ? actionReply(proposal, library) : null;
        if (answer) return answer;
    }

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
            // "event loop nasıl işler" is a how-it-works question: a concept answers it when no example does.
            const answer = answerSnippet() ?? await answerConcept(true);
            if (answer) return answer;
            return reply({ text: tx(C.snippetMissing), intent, confidence });
        }
        case "code_concept": {
            const answer = await answerConcept(false);
            if (answer) return answer;
            break;
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

    // 10. Low confidence: a programming concept, a programming how-to, then knowledge retrieval, then fallback.
    if (intent !== "unknown" && DEFINITION_WORDS.test(text)) {
        const answer = await answerConcept(true);
        if (answer) return answer;
    }
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
