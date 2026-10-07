/**
 * Hanogt AI knowledge base: curated answers about every part of Hanogt Codev,
 * plus the FAQ and the pages of the interactive guide. The offline Hanogt AI
 * Core answers from it directly; the server adds the best matching entries to
 * the language model's context (retrieval-augmented generation).
 *
 * Counts that change with the code (languages) come from their registries as
 * {placeholders} with `vars`, so the copy stays translatable and never stale.
 */
import type { Copy } from "@/lib/i18n";
import { FAQS } from "@/lib/faq";
import { PLAN_AI_CONNECTIONS, PLAN_AI_FEATURES, PLAN_AI_LIMITS, PLAN_ATTACHMENT_LIMITS, PLAN_COLLAB_LIMITS, PLAN_GAME_AUDIO_LIMITS, PLAN_GROUP_AI, PLAN_GROUP_FEATURES, PLAN_GROUP_LIMITS, PLAN_MESSAGE_CHARS, PLAN_PROJECT_LIMITS, PLAN_RUN_LIMITS, PLAN_RUN_SIZES, PLAN_STAR_LIMITS } from "@/lib/plans";
import { BROWSER_LANGUAGES, LANGUAGE_STATS, LANGUAGES } from "@/lib/runtimes/languages";
import { formatBytes } from "@/lib/social/attachments";
import { CHAPTERS, PAGES, type Block } from "@/components/Guide/book-content";

export interface KnowledgeLink {
    href: string;
    label: Copy;
}

export interface KnowledgeEntry {
    id: string;
    /** Intent labels of the offline model (ai/dataset/intents.json) answered by this entry. */
    intents: string[];
    title: Copy;
    /** Markdown answer: **bold**, "• " bullets, "1. " steps and internal [links](/path). */
    body: Copy;
    /** Extra search words (both languages) for retrieval. */
    keywords?: string;
    links?: KnowledgeLink[];
    /** Bullet items shown one by one (keeps each item translatable by the copy packs). */
    parts?: Copy[];
}

const L = {
    security: { href: "/security", label: { TR: "Güvenlik Merkezi", EN: "Security Center" } },
    settings: { href: "/account-settings", label: { TR: "Hesap Ayarları", EN: "Account Settings" } },
    editor: { href: "/editor", label: { TR: "Kod Editörü", EN: "Code Editor" } },
    editorSettings: { href: "/settings", label: { TR: "Editör Ayarları", EN: "Editor Settings" } },
    engine: { href: "/game-engine", label: { TR: "Oyun Motoru", EN: "Game Engine" } },
    docs: { href: "/game-engine/docs", label: { TR: "Motor belgeleri", EN: "Engine docs" } },
    arcade: { href: "/arcade", label: { TR: "Arcade", EN: "Arcade" } },
    media: { href: "/media", label: { TR: "Hanogt Media", EN: "Hanogt Media" } },
    news: { href: "/news", label: { TR: "Hanogt News", EN: "Hanogt News" } },
    social: { href: "/social", label: { TR: "Hanogt Social", EN: "Hanogt Social" } },
    friends: { href: "/social?tab=all", label: { TR: "Arkadaşlar", EN: "Friends" } },
    messages: { href: "/social", label: { TR: "Direkt mesajlar", EN: "Direct messages" } },
    groups: { href: "/social?create=1", label: { TR: "Grup oluştur", EN: "Create a group" } },
    feedback: { href: "/feedback", label: { TR: "Geri Bildirim ve Destek", EN: "Feedback and Support" } },
    guide: { href: "/guide", label: { TR: "Kullanım kılavuzu", EN: "User guide" } },
    privacy: { href: "/privacy-policy", label: { TR: "Gizlilik Politikası", EN: "Privacy Policy" } },
    dashboard: { href: "/dashboard", label: { TR: "Panel", EN: "Dashboard" } },
    ai: { href: "/ai", label: { TR: "Hanogt AI", EN: "Hanogt AI" } },
    aiSettings: { href: "/ai/settings", label: { TR: "Hanogt AI ayarları", EN: "Hanogt AI settings" } },
    aiApi: { href: "/ai/api", label: { TR: "API ve bağlantılar", EN: "API and connections" } },
    plans: { href: "/plans", label: { TR: "Fiyatlandırma", EN: "Pricing" } },
    refunds: { href: "/refund-policy", label: { TR: "İade Politikası", EN: "Refund Policy" } },
} satisfies Record<string, KnowledgeLink>;

// Counts and names come from the language registry, so new languages show up here by themselves.
const namesOf = (engine: string) => LANGUAGES.filter((language) => language.engine === engine && language.id !== "plaintext").map((language) => language.name);
const languageCounts = {
    usable: LANGUAGE_STATS.usable,
    runnable: LANGUAGE_STATS.runnable,
    preview: LANGUAGE_STATS.preview,
    highlighted: LANGUAGE_STATS.highlighted,
    browser: BROWSER_LANGUAGES.size,
    server: LANGUAGE_STATS.runnable - BROWSER_LANGUAGES.size,
    editOnly: namesOf("none").length,
    browserList: namesOf("browser").join(", "),
    serverList: namesOf("server").join(", "),
    previewList: namesOf("preview").join(", "),
    editOnlyList: namesOf("none").slice(0, 10).join(", "),
};

// Plan limits come from src/lib/plans.ts, so the plan answers follow the plans; null means unlimited.
const planLimit = (value: number | null) => value ?? "∞";
const planNumbers = {
    aiFree: PLAN_AI_LIMITS.free.perWindow,
    aiPlus: PLAN_AI_LIMITS.plus.perWindow,
    aiPro: PLAN_AI_LIMITS.pro.perWindow,
    codeFree: planLimit(PLAN_PROJECT_LIMITS.free.code),
    gameFree: planLimit(PLAN_PROJECT_LIMITS.free.game),
    codePlus: planLimit(PLAN_PROJECT_LIMITS.plus.code),
    gamePlus: planLimit(PLAN_PROJECT_LIMITS.plus.game),
    connectionsPlus: PLAN_AI_CONNECTIONS.plus,
    connectionsPro: PLAN_AI_CONNECTIONS.pro,
    groupsFree: planLimit(PLAN_GROUP_LIMITS.free),
    groupsPlus: planLimit(PLAN_GROUP_LIMITS.plus),
    collabFree: PLAN_COLLAB_LIMITS.free.people,
    collabPlus: PLAN_COLLAB_LIMITS.plus.people,
    collabPro: PLAN_COLLAB_LIMITS.pro.people,
    tokensFree: PLAN_AI_FEATURES.free.maxTokens,
    tokensPlus: PLAN_AI_FEATURES.plus.maxTokens,
    tokensPro: PLAN_AI_FEATURES.pro.maxTokens,
    fileFree: PLAN_AI_FEATURES.free.contextChars,
    filePlus: PLAN_AI_FEATURES.plus.contextChars,
    filePro: PLAN_AI_FEATURES.pro.contextChars,
    apiKeysPlus: PLAN_AI_FEATURES.plus.api?.keys ?? 0,
    apiKeysPro: PLAN_AI_FEATURES.pro.api?.keys ?? 0,
    runFree: PLAN_RUN_LIMITS.free.files,
    runPlus: PLAN_RUN_LIMITS.plus.files,
    runPro: PLAN_RUN_LIMITS.pro.files,
    runMinutePlus: PLAN_RUN_LIMITS.plus.perMinute,
    runMinutePro: PLAN_RUN_LIMITS.pro.perMinute,
    membersFree: PLAN_GROUP_FEATURES.free.members,
    membersPlus: PLAN_GROUP_FEATURES.plus.members,
    membersPro: PLAN_GROUP_FEATURES.pro.members,
    pinsPlus: PLAN_GROUP_FEATURES.plus.pinned,
    pinsPro: PLAN_GROUP_FEATURES.pro.pinned,
    commandsPlus: PLAN_GROUP_FEATURES.plus.commands,
    commandsPro: PLAN_GROUP_FEATURES.pro.commands,
    wordsPlus: PLAN_GROUP_FEATURES.plus.bannedWords,
    wordsPro: PLAN_GROUP_FEATURES.pro.bannedWords,
    starsFree: PLAN_STAR_LIMITS.free,
    starsPlus: PLAN_STAR_LIMITS.plus,
    starsPro: PLAN_STAR_LIMITS.pro,
    audioFree: PLAN_GAME_AUDIO_LIMITS.free.bytes / 1024 / 1024,
    audioPlus: PLAN_GAME_AUDIO_LIMITS.plus.bytes / 1024 / 1024,
    audioPro: PLAN_GAME_AUDIO_LIMITS.pro.bytes / 1024 / 1024,
    // Files in Social messages: whole megabytes and gigabytes, the same in every language.
    attachFree: formatBytes(PLAN_ATTACHMENT_LIMITS.free.fileBytes, "EN"),
    attachPlus: formatBytes(PLAN_ATTACHMENT_LIMITS.plus.fileBytes, "EN"),
    attachPro: formatBytes(PLAN_ATTACHMENT_LIMITS.pro.fileBytes, "EN"),
    attachSpaceFree: formatBytes(PLAN_ATTACHMENT_LIMITS.free.storageBytes, "EN"),
    attachSpacePlus: formatBytes(PLAN_ATTACHMENT_LIMITS.plus.storageBytes, "EN"),
    attachSpacePro: formatBytes(PLAN_ATTACHMENT_LIMITS.pro.storageBytes, "EN"),
};

export const CURATED_KNOWLEDGE: KnowledgeEntry[] = [
    {
        id: "identity",
        intents: ["identity"],
        title: { TR: "Hanogt AI kimdir?", EN: "Who is Hanogt AI?" },
        body: {
            TR: "Ben **Hanogt AI**, HanStudios'un Hanogt Codev için geliştirdiği yapay zeka asistanıyım. İki katmanla çalışırım:\n• **Hanogt AI (LLM):** Giriş yaptığında sorularını, sunucuda yapılandırılmış büyük dil modeli Hanogt bilgi tabanından seçilen notlarla yanıtlar.\n• **Hanogt AI Çekirdeği:** Cihazında çalışan, Hanogt verileriyle eğitilmiş küçük bir niyet modeli; site bilgisi, güvenlik araçları, kod örnekleri, hata açıklamaları ve hesap makinesiyle çevrimdışı yanıt verir.\n**Ajan modunda** izin verdiğin işleri senin yerine yaparım: grup kurmak, profilini özetlemek, kodu editörde açmak, oyun projesi oluşturmak, sayfa açmak.\nİnsan değilim, hata yapabilirim; önemli kararlarda yanıtlarımı doğrula.",
            EN: "I'm **Hanogt AI**, the AI assistant HanStudios built for Hanogt Codev. I work in two layers:\n• **Hanogt AI (LLM):** when you're signed in, the large language model configured on the server answers with notes picked from the Hanogt knowledge base.\n• **Hanogt AI Core:** a small intent model trained on Hanogt data that runs on your device and answers offline with site knowledge, security tools, code samples, error explanations and a calculator.\nIn **Agent mode** I do the things you allow for you: create a group, summarise your profile, open code in the editor, create a game project or open a page.\nI'm not a person and I can make mistakes; double-check my answers for important decisions.",
        },
        keywords: "hanogt ai kimsin model llm yapay zeka asistan who are you model assistant çekirdek core",
        links: [L.ai],
    },
    {
        id: "capabilities",
        intents: ["capabilities"],
        title: { TR: "Hanogt AI neler yapabilir?", EN: "What can Hanogt AI do?" },
        body: {
            TR: "Şunlarda yardımcı olurum:\n• **Kod:** örnek kod, açıklama, hata ayıklama, hata mesajlarını yorumlama; yazdığım kodu Kod Editörü'nde açma.\n• **Oyun geliştirme:** Hanogt Engine'de C#/C++ scriptleri, fizik, girdi, prefab, sahneler; hazır şablondan oyun projesi oluşturma.\n• **Site işleri (Ajan modu):** grup kurmak, profilini özetlemek, sayfaları açmak; her işlemden önce iznini isterim.\n• **Güvenlik:** yapıştırdığın bağlantıyı ve kodu anında incelerim, parola ve hesap güvenliği, sızmış anahtarlar.\n• **Site rehberi:** editör, Arcade, Media, Haberler, Arkadaşlar, Gruplar, destek talepleri, Hesap Ayarları.\n• **Hesap makinesi:** `(3+5)*2`, `sqrt(144)` gibi ifadeler.\nİpucu: Kod, Güvenlik ve Genel modları arasında geçiş yapabilirsin.",
            EN: "I can help with:\n• **Code:** examples, explanations, debugging, reading error messages; opening the code I write in the Code Editor.\n• **Game development:** C#/C++ scripts in Hanogt Engine, physics, input, prefabs, scenes; creating a game project from a template.\n• **Site tasks (Agent mode):** creating groups, summarising your profile, opening pages; I ask for your permission before every action.\n• **Security:** I inspect links and code you paste right away, plus passwords, account safety and leaked keys.\n• **Site guide:** editor, Arcade, Media, News, Friends, Groups, support tickets, Account Settings.\n• **Calculator:** expressions like `(3+5)*2` or `sqrt(144)`.\nTip: switch between the Code, Security and General modes.",
        },
        keywords: "yardım özellikler neler yapabilirsin help features abilities ajan agent",
    },
    {
        id: "agent-mode",
        intents: ["agent_mode"],
        title: { TR: "Ajan modu ve izinler", EN: "Agent mode and permissions" },
        body: {
            TR: "**Ajan modunda** Hanogt AI, senin oturumunla ve sitenin kendi işlevleriyle şu işleri yapabilir: profilini özetlemek, grup kurmak, yazdığı kodu Kod Editörü'nde açmak, hazır şablondan oyun projesi oluşturmak ve sayfa açmak.\n• Mesaj kutusunun yanındaki **Ajan** menüsü: **Kapalı** (yalnızca anlatır), **Her seferinde sor** (varsayılan) ya da **Güvenli işlemlerde otomatik** (sayfa ve editör sekmesi açmak sormadan yapılır, oluşturma işlemleri yine izin ister).\n• Her işlem önce bir onay kartıyla gösterilir; ayrıntıları (ör. grup adı, dosya adı) düzenleyip **İzin ver**, **Bu oturumda hep izin ver** ya da **Reddet** seçebilirsin. Profilini okumak için oturum başına bir kez izin istenir.\n• Silme, parola, iki adımlı doğrulama, yönetici işlemleri ve başkalarına mesaj göndermek gibi hassas işleri **asla yapmam**; nasıl yapacağını anlatırım.\n• Hesap işlemleri için giriş yapman gerekir.",
            EN: "In **Agent mode** Hanogt AI can do these things with your session and the site's own features: summarise your profile, create a group, open the code it wrote in the Code Editor, create a game project from a template and open pages.\n• The **Agent** menu next to the message box: **Off** (explain only), **Ask every time** (default) or **Automatic for safe actions** (opening pages and editor tabs runs without asking; creating things still asks).\n• Every action is first shown on a confirmation card; you can edit the details (e.g. the group or file name) and choose **Allow**, **Always allow this session** or **Deny**. Reading your profile is asked once per session.\n• I **never** do sensitive things such as deleting, passwords, two-factor authentication, admin work or messaging other people; I explain how you can do them.\n• Account actions need you to be signed in.",
        },
        keywords: "ajan modu agent mode izin permission onay confirm otomatik automatic benim yerime on my behalf işlem action",
        links: [L.ai],
    },
    {
        id: "ai-settings",
        intents: [],
        title: { TR: "Hanogt AI ayarları", EN: "Hanogt AI settings" },
        body: {
            TR: "[Hanogt AI ayarları](/ai/settings) sayfasında (sohbetin üstündeki ⚙ düğmesi ya da Hesap Ayarları › Hanogt AI) şunları seçebilirsin:\n• **Kişiselleştirme:** Hanogt AI'ın senin hakkında bilmesini istediklerin ve nasıl yanıt vermesini istediğin (her biri Ücretsiz'de {instructionsFree}, Plus'ta {instructionsPlus}, Pro'da {instructionsPro} karakter), üslup (dengeli, samimi, profesyonel), yanıt uzunluğu ve sabit bir yanıt dili. Bunlar güvenlik kurallarını değiştiremez.\n• **Sohbet varsayılanları:** yeni sohbetin yanıt modu, varsayılan model (Hanogt AI ya da kendi bağlantın), ajan modu ve açık editör dosyasının sorulara eklenmesi. Bir cihazda kendin seçtiğin ajan modu ve model, oradaki varsayılandan önce gelir.\n• **Yaratıcılık:** Hassas, Dengeli ya da Yaratıcı; yanıtların ne kadar özgür yazılacağını belirler (ajan modu açıkken etkisi daha küçüktür).\n• **Geçmiş ve gizlilik:** sohbetlerin yalnızca tarayıcında saklanır; JSON olarak dışa aktarabilir, hepsini silebilir ya da çıkış yapınca bu cihazdaki sohbetlerin silinmesini açabilirsin. **Yeni sohbetleri sakla** kapalıyken sohbetler gizli olur: sekme kapanınca kaybolur, hiçbir yerde saklanmaz.\n• **Bildirim:** sekme arka plandayken yanıt biterse tarayıcı bildirimi alabilirsin.\n• Ayarlarda arama, her bölümde **Varsayılana döndür**, ayarları JSON olarak dışa/içe aktarma ve **Bu cihazdaki seçimleri sıfırla** düğmesi var.\n• **Kullanım ve erken erişim:** bugünkü mesajların, planındaki bütün haklar ve sana açık yeni özellikler.\nAyarlar hesabınla saklanır; hesap verilerini indirdiğinde dosyada yer alır.",
            EN: "On the [Hanogt AI settings](/ai/settings) page (the ⚙ button above the chat, or Account Settings › Hanogt AI) you can choose:\n• **Personalization:** what Hanogt AI should know about you and how you want answers ({instructionsFree} characters each on Free, {instructionsPlus} on Plus, {instructionsPro} on Pro), the tone (balanced, friendly, professional), answer length and a fixed answer language. They can't change the safety rules.\n• **Chat defaults:** the answer mode of a new chat, the default model (Hanogt AI or one of your connections), the agent mode and attaching the open editor file. The agent mode and model you pick yourself on a device win over the defaults there.\n• **Creativity:** Precise, Balanced or Creative; how freely answers are written (with agent mode on the effect is smaller).\n• **History and privacy:** your chats stay in your browser only; export them as JSON, delete them all, or have this device's chats deleted when you sign out. With **Keep new chats** off, chats are private: they're gone when the tab closes and are never stored.\n• **Notifications:** get a browser notification when an answer finishes while the tab is in the background.\n• You can search the settings, **Reset to defaults** in each section, export or import your settings as JSON, and **Reset this device's choices**.\n• **Usage and early access:** today's messages, every benefit of your plan and new features open to you.\nSettings are kept with your account and included when you download your account data.",
            vars: { instructionsFree: PLAN_AI_FEATURES.free.instructionsChars, instructionsPlus: PLAN_AI_FEATURES.plus.instructionsChars, instructionsPro: PLAN_AI_FEATURES.pro.instructionsChars },
        },
        keywords: "hanogt ai ayarları ai settings yapay zeka ayarlar talimat instructions üslup ton tone uzunluk length dil language varsayılan default model ajan agent geçmiş history sil delete dışa aktar export kişiselleştirme personalization custom instructions",
        links: [L.aiSettings, L.ai],
    },
    {
        id: "ai-api",
        intents: [],
        title: { TR: "Hanogt AI API'si", EN: "The Hanogt AI API" },
        body: {
            TR: "Hanogt AI'ı kendi uygulamandan (bot, site, betik) **OpenAI uyumlu** bir API ile çağırabilirsin. [API ve bağlantılar](/ai/api) sayfasından (sohbetin üstündeki 🔑 düğmesi) anahtar oluşturursun; anahtar `hnk_` ile başlar ve **yalnızca bir kez** gösterilir, biz yalnızca özetini saklarız.\n• **Adres:** `/api/v1/chat/completions`, model `hanogt-ai`; OpenAI'ın resmî kütüphaneleri temel adresi değiştirerek çalışır. Akışlı yanıt (stream) desteklenir; araç çağrısı (tools) ve görseller desteklenmez.\n• **Planlar:** Plus'ta {plusKeys}, Pro'da {proKeys} anahtar. API'nin ayrı bir sınırı yoktur: her istek planının Hanogt AI mesaj hakkından bir mesaj düşer (Plus 2 haftada {plusWindow}, Pro haftada {proWindow}; dakikada en fazla Plus {plusMinute}, Pro {proMinute}). Model hiç yanıt veremezse mesaj düşülmez.\n• **Düşünme:** istekte `include_reasoning: true` gönderirsen model önce düşünür ve düşüncesi `reasoning_content` alanında gelir.\n• **Güvenlik:** anahtarını tarayıcıda, mobil uygulamada ya da herkese açık depoda kullanma; sızdıysa sayfadan hemen iptal et. Başka sitelerin tarayıcıdan çağırmasına izin verilmez.\n• Aynı sayfanın **Kendi anahtarların** sekmesinde OpenAI, Claude, Gemini gibi sağlayıcıları kendi anahtarınla Hanogt AI sohbetine bağlarsın; bu bağlantılarla gönderdiğin mesajlar da aynı Hanogt AI hakkından düşer.\nAPI, Plus ve Pro planlarında açık; ekip bir hesabın ya da herkesin erişimini kapatırsa sayfa bunu söyler.",
            EN: "You can call Hanogt AI from your own app (a bot, a site, a script) through an **OpenAI-compatible** API. Create a key on the [API and connections](/ai/api) page (the 🔑 button above the chat); keys start with `hnk_` and are shown **only once**, and we keep only a hash.\n• **Address:** `/api/v1/chat/completions`, model `hanogt-ai`; OpenAI's official libraries work by changing the base URL. Streaming is supported; tool calls and images aren't.\n• **Plans:** {plusKeys} keys on Plus, {proKeys} on Pro. The API has no limit of its own: every request uses one of your plan's Hanogt AI messages ({plusWindow} every 2 weeks on Plus, {proWindow} a week on Pro; at most {plusMinute} a minute on Plus, {proMinute} on Pro). A request the model can't answer at all isn't counted.\n• **Thinking:** send `include_reasoning: true` and the model thinks first; its thinking comes back in `reasoning_content`.\n• **Safety:** don't use your key in a browser, a mobile app or a public repository; if it leaks, revoke it on the page at once. Other sites can't call the API from a browser.\n• On the same page's **Your own keys** tab you connect providers such as OpenAI, Claude or Gemini to the Hanogt AI chat with your own key; messages through them use the same Hanogt AI allowance.\nThe API is open on the Plus and Pro plans; if the team switches it off for an account or for everyone, the page says so.",
            vars: {
                plusKeys: PLAN_AI_FEATURES.plus.api?.keys ?? 0, plusMinute: PLAN_AI_LIMITS.plus.perMinute, plusWindow: PLAN_AI_LIMITS.plus.perWindow,
                proKeys: PLAN_AI_FEATURES.pro.api?.keys ?? 0, proMinute: PLAN_AI_LIMITS.pro.perMinute, proWindow: PLAN_AI_LIMITS.pro.perWindow,
            },
        },
        keywords: "hanogt ai api developer api geliştirici api anahtar key hnk openai uyumlu compatible chat completions sdk curl python javascript bot entegrasyon integration stream kota quota rate limit",
        links: [L.aiApi, L.plans],
    },
    {
        id: "ai-thinking",
        intents: [],
        title: { TR: "Hanogt AI'ın düşünmesi", EN: "Hanogt AI's thinking" },
        body: {
            TR: "Hanogt AI zor sorularda yanıtlamadan önce **düşünür** ve ne düşündüğünü yanıtın üstündeki panelde gösterir: yazarken \"Düşünüyor…\", bitince \"N sn düşündü\". Paneli açıp düşünceyi ve atılan adımları (bilgi tabanında bakılan konular, bağlantı ya da kod kontrolü, okunan dosya) görebilirsin.\n• [Hanogt AI ayarları](/ai/settings) → **Düşünme**: Otomatik (kod ve güvenlik işlerinde, uzun sorularda düşünür), Her zaman ya da Kapalı; **Düşünmeyi göster** ile paneli gizleyebilirsin.\n• Düşünce yalnızca tarayıcında, sohbetle birlikte saklanır; modele bir daha gönderilmez.\n• Cihazında çalışan Hanogt AI Çekirdeği yanıt verdiğinde panel, sorunu hangi konuya eşlediğini ve ne kadar emin olduğunu gösterir.\n• Yanıt uzunluk ya da süre sınırına takılırsa altında **Devam et** düğmesi çıkar; model kaldığı yerden sürdürür (bir mesaj sayılır).",
            EN: "On hard questions Hanogt AI **thinks** before answering and shows what it thought in a panel above the answer: \"Thinking…\" while it writes, then \"Thought for N s\". Open the panel to see the thinking and the steps taken (topics looked up in the knowledge base, a link or code check, the file it read).\n• [Hanogt AI settings](/ai/settings) → **Thinking**: Automatic (thinks in code and security work and on long questions), Always or Off; **Show thinking** hides the panel.\n• The thinking is kept only in your browser with the chat and is never sent to the model again.\n• When Hanogt AI Core answers on your device, the panel shows which topic it matched your question to and how sure it was.\n• If an answer hits its length or time limit, a **Continue** button appears under it and the model picks up where it stopped (counts as one message).",
        },
        keywords: "düşünme düşünüyor thinking reasoning düşündü thought gemini gibi düşün akıl yürütme muhakeme adımlar steps devam et continue kesildi cut",
        links: [L.aiSettings, L.ai],
    },
    {
        id: "ai-voice",
        intents: [],
        title: { TR: "Sesle yazma ve sesli dinleme", EN: "Dictation and answers read aloud" },
        body: {
            TR: "Hanogt AI'da **sesle yazma** ve **yanıtları sesli dinleme**, Pro'da ve ekipte **erken erişimde** (beta):\n• **Sesle yazma:** mesaj kutusundaki 🎤 düğmesine bas ve konuş; tanınan metin kutuya eklenir, sen gönderene kadar hiçbir yere gitmez. Tarayıcı ilk seferde mikrofon izni ister.\n• **Sesli dinleme:** bir yanıtın altındaki 🔊 düğmesi yanıtı okur, ■ ile durdurursun. Kod blokları satır satır okunmaz, \"Kod bloğu\" diye geçilir.\n• Dil, sitenin diline göre seçilir.\n• Bu özellikler **tarayıcının** konuşma hizmetini kullanır; sesin Hanogt'a gönderilmez. Chrome sesini tanımak için Google'a, Safari Apple'a gönderebilir. Tarayıcın bunlardan birini desteklemiyorsa o düğme görünmez (ör. Firefox sesle yazmayı desteklemez).\nErken erişim özellikleri değişebilir ya da herkese açılabilir: [Kullanım Şartları](/terms-of-use#early-access).",
            EN: "**Dictation** and **answers read aloud** in Hanogt AI are in **early access** (beta) on Pro and for staff:\n• **Dictation:** press the 🎤 button in the message box and speak; the recognised text is added to the box and goes nowhere until you send it. The browser asks for microphone permission the first time.\n• **Read aloud:** the 🔊 button under an answer reads it, and ■ stops it. Code blocks aren't read line by line; they're announced as \"Code block\".\n• The language follows the site's language.\n• These features use your **browser's** speech service; your voice isn't sent to Hanogt. Chrome may send your voice to Google to recognise it, Safari to Apple. If your browser doesn't support one of them, that button doesn't appear (Firefox, for example, has no dictation).\nEarly access features may change or open to everyone: [Terms of Use](/terms-of-use#early-access).",
        },
        keywords: "ses sesli sesle yazma dikte dictation mikrofon microphone konuş speak sesli dinle read aloud oku seslendir text to speech tts speech recognition erken erişim early access beta pro",
        links: [L.ai, L.plans],
    },
    {
        id: "password",
        intents: ["password"],
        title: { TR: "Parola güvenliği", EN: "Password security" },
        body: {
            TR: "**Parolalar açık metin olarak saklanmaz.** Sunucuda her parolaya benzersiz bir tuz eklenir ve **scrypt** ile tek yönlü karmalanır; kimlik bilgileri profil verisinden ayrı, tarayıcının erişemeyeceği bir koleksiyonda durur.\n• En az 12–16 karakter ve her sitede farklı parola kullan; bir parola yöneticisi en kolay yoldur.\n• Parolanı **Güvenlik Merkezi → Parola Laboratuvarı**'nda ölçebilir, k-anonimlikle sızıntılarda arayabilirsin: [Parola Laboratuvarı](/security#password)\n• Parolanı Hesap Ayarları'ndan değiştirebilirsin: [Hesap Ayarları](/account-settings)\n• Bana tırnak içinde bir parola yazarsan (ör. \"Kedi2024!\") gücünü cihazında hesaplarım; gerçek parolanı paylaşma.",
            EN: "**Passwords are never stored in plain text.** Each one gets a unique salt and is hashed one-way with **scrypt**; credentials live apart from profile data in a collection browsers cannot read.\n• Use 12–16+ characters and a different password per site; a password manager is the easiest way.\n• Measure yours and check breaches with k-anonymity in **Security Center → Password Lab**: [Password Lab](/security#password)\n• Change it in Account Settings: [Account Settings](/account-settings)\n• Write a password in quotes (e.g. \"Kitty2024!\") and I'll estimate its strength on your device; don't share your real one.",
        },
        keywords: "şifre parola scrypt hash güçlü password strong breach sızıntı pwned",
        links: [L.security, L.settings],
    },
    {
        id: "twofa",
        intents: ["twofa"],
        title: { TR: "İki adımlı doğrulama (2FA)", EN: "Two-factor authentication (2FA)" },
        body: {
            TR: "E-posta ve parolayla giriş yapan hesaplar **doğrulayıcı uygulamasıyla (TOTP)** iki adımlı doğrulamayı açabilir:\n1. [Hesap Ayarları](/account-settings) → **Güvenlik** → İki adımlı doğrulama.\n2. QR kodu Google Authenticator, Microsoft Authenticator, Aegis veya 1Password gibi bir uygulamayla tara.\n3. Uygulamadaki 6 haneli kodu girip onayla ve **kurtarma kodlarını** indirip güvenli bir yere kaydet; her kurtarma kodu yalnızca bir kez kullanılır.\nGiriş yaparken parolanın ardından uygulamadaki kod (ya da bir kurtarma kodu) istenir. Gizli anahtar sunucuda şifreli saklanır ve aynı kod iki kez kabul edilmez.\n• Doğrulayıcı uygulamana ve kurtarma kodlarına erişemiyorsan giriş sayfasındaki iki adımlı doğrulama adımında **\"Doğrulayıcıma ve kurtarma kodlarıma erişemiyorum\"** seçeneğini kullan: parolan yeniden doğrulanır (oturum açılmaz) ve ekibe yüksek öncelikli bir **İstek** talebi gider (hesap başına günde 1). Yetkili ekip kimliğini doğrulayıp 2FA'yı gerekçesini kaydederek sıfırlayabilir.\n• Google ile giriş yapıyorsan Google hesabındaki 2 adımlı doğrulama seni korur.\n• Kimse senden doğrulama kodu isteyemez; Hanogt ekibi de istemez.",
            EN: "Accounts that sign in with e-mail and password can enable two-step verification with an **authenticator app (TOTP)**:\n1. [Account Settings](/account-settings) → **Security** → Two-factor authentication.\n2. Scan the QR code with an app such as Google Authenticator, Microsoft Authenticator, Aegis or 1Password.\n3. Enter the 6-digit code to confirm, then download your **recovery codes** and keep them somewhere safe; each recovery code works only once.\nAfter your password, sign-in asks for the app's code (or a recovery code). The secret is stored encrypted on the server and the same code is never accepted twice.\n• Lost your authenticator and your recovery codes? At the two-step step of the sign-in page choose **\"I can't access my authenticator or my recovery codes\"**: your password is checked again (no session is opened) and a high-priority **Request** ticket reaches the team (one per account per day). Authorised staff verify you and can reset 2FA, recording the reason.\n• If you sign in with Google, the 2-step verification of your Google account protects you.\n• No one should ask for your verification codes; the Hanogt team never will.",
        },
        keywords: "2fa totp iki adımlı doğrulama authenticator kod recovery kurtarma two factor qr",
        links: [L.settings, L.feedback],
    },
    {
        id: "hacked",
        intents: ["hacked"],
        title: { TR: "Hesabım ele geçirildiyse", EN: "If your account was compromised" },
        body: {
            TR: "Sakin ol, adım adım gidelim:\n1. **Parolanı hemen değiştir** ([Hesap Ayarları](/account-settings)). Google ile giriyorsan Google parolanı değiştir.\n2. **İki adımlı doğrulamayı aç** ve kurtarma kodlarını kaydet.\n3. Aynı parolayı kullandığın diğer sitelerde de değiştir.\n4. Projelerini, Media paylaşımlarını, gruplarını ve arkadaş listeni tanımadığın değişikliklere karşı kontrol et.\n5. [Geri Bildirim ve Destek](/feedback) sayfasından **İstek** kategorisinde destek talebi açıp neler olduğunu anlat; talebini yalnızca Hanogt ekibi görür. Sitede bir güvenlik açığından şüpheleniyorsan **Güvenlik Açığı** kategorisini seç.",
            EN: "Stay calm, step by step:\n1. **Change your password now** ([Account Settings](/account-settings)). With Google sign-in, change your Google password.\n2. **Turn on two-factor authentication** and save the recovery codes.\n3. Change it anywhere you reused it.\n4. Check projects, Media posts, groups and your friend list for changes you don't recognize.\n5. Open a support ticket in the **Request** category on [Feedback and Support](/feedback) and describe what happened; only the Hanogt team sees it. If you suspect a vulnerability in the site, choose **Security vulnerability**.",
        },
        keywords: "hack çalındı ele geçirildi compromised hacked takeover şüpheli giriş",
        links: [L.settings, L.feedback],
    },
    {
        id: "phishing",
        intents: ["phishing"],
        title: { TR: "Oltalama ve sahte bağlantılar", EN: "Phishing and fake links" },
        body: {
            TR: "Oltalama saldırıları seni acele ettirir: \"hesabın kapanacak\", \"hediye kazandın\", \"ücretsiz Nitro\" gibi.\n• Bağlantıyı bana **yapıştır**, yapısını hemen inceleyeyim (siteye bağlanmam).\n• Ya da [Bağlantı Kontrolü](/security#links) aracını kullan.\n• Banka, e-Devlet ya da Hanogt'a giderken adresi **kendin yaz**; e-postadaki düğmeye güvenme.\n• Tıkladıysan: parola girmediysen genelde sorun yoktur; girdiysen parolanı hemen değiştir ve 2FA aç.",
            EN: "Phishing rushes you: \"your account will close\", \"you won a gift\", \"free Nitro\".\n• **Paste** the link here and I'll inspect its structure right away (I never connect to it).\n• Or use the [Link Check](/security#links) tool.\n• Type your bank's, government portal's or Hanogt's address **yourself**; don't trust buttons in e-mails.\n• Already clicked? If you didn't type a password you're usually fine; if you did, change it now and enable 2FA.",
        },
        keywords: "oltalama phishing sahte link bağlantı dolandırıcı scam nitro hediye",
        links: [L.security],
    },
    {
        id: "code-scan",
        intents: ["code_scan"],
        title: { TR: "Kodumu güvenlik açısından tara", EN: "Scan my code for security issues" },
        body: {
            TR: "Kodunu doğrudan buraya yapıştır; **Hanogt Security Kod Danışmanı** kurallarıyla tarayıp puan ve bulguları söyleyeyim. Ayrıntılı rapor ve düzeltme önerileri için: [Kod Danışmanı](/security#advisor)\n• 65+ kural: sızmış API anahtarları, SQL/komut enjeksiyonu, XSS, zayıf kripto, kapalı TLS doğrulaması, güvensiz deserialization, C bellek hataları…\n• Analiz tamamen tarayıcında yapılır.",
            EN: "Paste your code right here; I'll scan it with the **Hanogt Security Code Advisor** rules and report a score and findings. For the full report and fixes: [Code Advisor](/security#advisor)\n• 65+ rules: leaked API keys, SQL/command injection, XSS, weak crypto, disabled TLS checks, unsafe deserialization, C memory bugs…\n• The analysis runs entirely in your browser.",
        },
        keywords: "tara scan güvenlik açığı vulnerability sql injection xss advisor danışman",
        links: [L.security],
    },
    {
        id: "secrets",
        intents: ["secrets"],
        title: { TR: "Sızmış API anahtarı", EN: "Leaked API key" },
        body: {
            TR: "Bir anahtar herkese açık bir yere (GitHub, Media, ekran görüntüsü) düştüyse **silmek yetmez, iptal etmen gerekir**:\n1. Sağlayıcının panelinden anahtarı **iptal et / yenile**.\n2. Yeni anahtarı kodda değil **ortam değişkeninde** tut; `.env` dosyasını paylaşma ve `.gitignore`'a ekle.\n3. Git geçmişinden de temizle; ama asıl koruma iptaldir.\n4. Kullanım ve fatura kayıtlarını kontrol et.\nHanogt Media, gizli anahtar içeren kodu zaten yayınlamaz.",
            EN: "If a key landed somewhere public (GitHub, Media, a screenshot) **deleting it isn't enough, revoke it**:\n1. **Revoke/rotate** it in the provider's dashboard.\n2. Keep the new key in an **environment variable**, not in code; never share `.env` and add it to `.gitignore`.\n3. Clean the Git history too, but revocation is what protects you.\n4. Review usage and billing logs.\nHanogt Media already refuses to publish code that contains secret keys.",
        },
        keywords: "api key anahtar token sızdı leak env gitignore secret revoke rotate",
    },
    {
        id: "ban",
        intents: ["ban_appeal"],
        title: { TR: "Engellendim / itiraz", EN: "Blocked / appeal" },
        body: {
            TR: "Otomatik bir eşleşme hesabını **kalıcı olarak kapatmaz**. Riskli kod çalıştırma isteği anında durdurulur ve asgari bir denetim kaydı oluşur; hesap yaptırımları insan incelemesiyle verilir.\n• Kodunu [Kod Danışmanı](/security#advisor)'nda tarayıp hangi imzanın tetiklendiğini görebilirsin (ör. sonsuz fork, disk silme, ters kabuk).\n• Yanlış alarm olduğunu düşünüyorsan [Geri Bildirim ve Destek](/feedback) sayfasından **Şikayet** kategorisinde (konu: hizmet / site) destek talebi aç.\n• **Hesabın askıya alındıysa** giriş ekranı bunu söyler: parolanla ya da Google ile kimliğini doğruladıktan sonra açılan **itiraz formunu** kullan.\n• **Bir gruptan yasaklandıysan** **Ban Kaldırma İsteği** kategorisinde destek talebi aç ve grubun adını yaz.",
            EN: "An automated match **never permanently closes** your account. A risky code-execution request is stopped on the spot with a minimal audit record; account sanctions need human review.\n• Scan your code in the [Code Advisor](/security#advisor) to see which signature fired (e.g. fork bombs, disk wipes, reverse shells).\n• Think it's a false alarm? Open a support ticket in the **Complaint** category (subject: service / site) on [Feedback and Support](/feedback).\n• **If your account is suspended** the sign-in screen says so: verify with your password or Google, then use the **appeal form** that opens there.\n• **If you were banned from a group**, open a support ticket in the **Unban request** category and name the group.",
        },
        keywords: "engel ban askı suspended blocked itiraz appeal yanlış alarm false positive",
        links: [L.feedback],
    },
    {
        id: "privacy",
        intents: ["privacy"],
        title: { TR: "Gizlilik ve KVKK", EN: "Privacy and KVKK" },
        body: {
            TR: "Hangi verilerin neden işlendiği, hizmet sağlayıcılar ve saklama süreleri [Gizlilik Politikası](/privacy-policy) ile [KVKK Aydınlatma Metni](/disclosure)'nde anlatılır.\n• Verilerini satmayız ve reklam takibi yapmayız.\n• [Hesap Ayarları](/account-settings)'ndan **verilerini indirebilir** veya **hesabını silebilirsin**.\n• Profilini gizleyebilir, çevrimiçi durumunu ve son görülme bilgisini kapatabilirsin.\n• KVKK başvurunu [Geri Bildirim ve Destek](/feedback) sayfasından **İstek** kategorisinde destek talebiyle iletebilirsin.",
            EN: "What is processed and why, the providers involved and retention periods are explained in the [Privacy Policy](/privacy-policy) and the [KVKK Notice](/disclosure).\n• We don't sell your data or run ad tracking.\n• In [Account Settings](/account-settings) you can **download your data** or **delete your account**.\n• You can hide your profile and turn off online status and last seen.\n• Send data-protection (KVKK) requests as a support ticket in the **Request** category on [Feedback and Support](/feedback).",
        },
        keywords: "gizlilik kvkk gdpr veri data privacy kişisel personal",
        links: [L.privacy, L.settings],
    },
    {
        id: "cookies",
        intents: ["cookies"],
        title: { TR: "Çerezler ve yerel depolama", EN: "Cookies and local storage" },
        body: {
            TR: "Hanogt **reklam veya üçüncü taraf takip çerezi kullanmaz.** Oturum için gerekli çerezler ve tarayıcında tutulan bazı tercihler vardır: tema, dil, editör ayarları, kaydedilen haberler (Sonra oku), Hanogt AI sohbetlerin ve ajan modu tercihin, güvenlik kontrol listesi ilerlemesi ve giriş yapmadan oluşturduğun motor projeleri. Bunları tarayıcı ayarlarından silebilirsin.",
            EN: "Hanogt uses **no advertising or third-party tracking cookies.** There are session cookies and a few preferences kept in your browser: theme, language, editor settings, saved news (Read later), your Hanogt AI chats and agent mode choice, security checklist progress and engine projects created while signed out. You can clear them in your browser settings.",
        },
        keywords: "çerez cookie localstorage takip tracking reklam ads analytics",
    },
    {
        id: "calls",
        intents: ["calls"],
        title: { TR: "Sesli aramalar, ekran paylaşımı ve sesli kanallar", EN: "Voice calls, screen sharing and voice channels" },
        body: {
            TR: "[Hanogt Social](/social)'de arkadaşlarını direkt mesaj ekranından, grup üyelerini grup sohbetinden arayabilirsin. Aramalar **WebRTC ile eşten eşe** kurulur ve Hanogt tarafından **kaydedilmez**; geçici bağlantı belgeleri görüşme bitince silinir.\n• Mikrofon izni ver; tarayıcı adres çubuğundaki kilit simgesinden kontrol edebilirsin.\n• Her arama mikrofon ve ses açık başlar; ses gitmiyorsa arama çubuğu nedenini yazar (mikrofonun kapalı, karşı taraf mikrofonunu kapattı, ses verisi gelmiyor…).\n• **Ses ayarları** (Sosyal paneldeki kaydırıcı simgesi ya da arama çubuğundaki ayar düğmesi): mikrofon ve hoparlör seçimi, mikrofon testi.\n• **Büyük görünüm:** arama çubuğundaki “Büyük görünüm” düğmesi aramayı tam sayfa açar; oradan tam ekrana geçebilir ya da küçültebilirsin.\n• **Ekran paylaşımı:** birebir aramada “Ekranını paylaş”a bas ve bir ekran, pencere ya da sekme seç. Yalnızca görüntü gider (bilgisayarın sesi gitmez, mikrofonun açık kalır); karşı taraf büyük görünümde, tam ekranda ya da pencere içinde pencere olarak izler. Telefon tarayıcıları desteklemediği için orada düğme görünmez.\n• **Sesli kanallar:** her grubun kenar çubuğunda bir sesli kanal vardır; tıklayınca katılırsın ve aynı anda en fazla 5 kişi konuşabilir. Konuşanın adının çevresinde halka yanar, sitede başka sayfalara geçince bağlantı sürer; mikrofonunu ve sesini kanaldan ya da ses çubuğundan kapatabilir, oradan çıkabilirsin. Kanalda kimlerin olduğunu yalnızca grubun üyeleri görür; grupta susturulan kişi katılamaz.\n• Bazı mobil ve kurumsal ağlarda bağlantı için TURN sunucusu gerekir; yoksa arama ekranı bunu belirtir.\n• Sesli mesajlar en fazla 60 saniye ve 3 MB'tır.",
            EN: "In [Hanogt Social](/social), call friends from their direct message and group members from the group chat. Calls are **peer-to-peer via WebRTC** and are **never recorded** by Hanogt; temporary signaling documents are deleted when the call ends.\n• Allow microphone access; check it via the lock icon in the address bar.\n• Every call starts with the microphone and sound on; if no sound gets through, the call bar says why (your microphone is off, the other person muted, no audio is arriving…).\n• **Voice settings** (the sliders icon in the Social panel or the settings button in the call bar): pick your microphone and speaker and test the microphone.\n• **Full view:** the “Full view” button in the call bar opens the call full page; from there you can go full screen or minimize it.\n• **Screen sharing:** in a one-to-one call, press “Share your screen” and pick a screen, window or tab. Only the picture is sent (your computer's sound isn't, and your microphone stays on); the other person watches it in the full view, full screen or picture in picture. Phone browsers don't support it, so the button doesn't appear there.\n• **Voice channels:** every group has a voice channel in its sidebar; click it to join, and up to 5 people can talk at a time. A ring lights up around whoever is speaking, the connection stays up while you move to other pages of the site, and you can mute your microphone or your sound, or leave, from the channel or the voice bar. Only the group's members can see who is in the channel; someone muted in the group can't join.\n• Some mobile and corporate networks need a TURN server to connect; the call screen tells you if it's missing.\n• Voice messages are limited to 60 seconds and 3 MB.",
        },
        keywords: "arama call webrtc mikrofon microphone ses voice turn ekran paylaşımı ekranı paylaş screen share screen sharing yayın go live sesli kanal voice channel büyük görünüm full view tam ekran fullscreen",
        links: [L.social],
    },
    {
        id: "report",
        intents: ["report_vuln"],
        title: { TR: "Güvenlik açığı bildirimi", EN: "Reporting a vulnerability" },
        body: {
            TR: "Teşekkürler! **Sorumlu bildirim** için:\n1. [Geri Bildirim ve Destek](/feedback) sayfasında **Güvenlik Açığı** kategorisinde bir destek talebi aç ve önem derecesini seç (Düşük, Orta, Yüksek, Kritik). Bu talepleri yalnızca Hanogt ekibi görür ve öncelikli ele alınır.\n2. Yeniden üretme adımlarını, etkilenen sayfayı ve beklenen/gerçekleşen davranışı yaz.\n3. Gerçek parola, erişim anahtarı veya başkasına ait kişisel veri ekleme.\n4. Başkalarının verisine erişme, hizmeti aksatma ve düzeltilene kadar açığı herkese açık paylaşma.",
            EN: "Thank you! For **responsible disclosure**:\n1. On [Feedback and Support](/feedback), open a support ticket in the **Security vulnerability** category and pick a severity (Low, Medium, High, Critical). Only the Hanogt team sees these tickets and they are handled first.\n2. Add reproduction steps, the affected page and expected vs. actual behavior.\n3. Don't include real passwords, access keys or others' personal data.\n4. Don't access others' data, disrupt the service or publish the issue before it's fixed.",
        },
        keywords: "açık bildir vulnerability report bug bounty responsible disclosure önem severity",
        links: [L.feedback],
    },
    {
        id: "account-delete",
        intents: ["account_delete"],
        title: { TR: "Hesabımı silme", EN: "Deleting my account" },
        body: {
            TR: "[Hesap Ayarları](/account-settings) → **Hesap** bölümündeki **Hesabı Sil** düğmesini kullan. Silme geri alınamaz:\n• Projelerin, oyun projelerin, Arcade oyunların, Media paylaşımların, yorumların, beğenilerin, sohbetlerin ve sesli mesajların silinir.\n• Sahibi olduğun gruplar silinir, üye olduğun gruplardan çıkarılırsın.\nİstersen önce **Verilerimi İndir** ile bir kopya al. Hanogt AI hesabını senin yerine silemez; bu kararı yalnızca sen verebilirsin.",
            EN: "Use **Delete Account** under [Account Settings](/account-settings) → **Account**. Deletion can't be undone:\n• Your projects, game projects, Arcade games, Media posts, comments, likes, chats and voice messages are removed.\n• Groups you own are deleted and you leave the groups you're a member of.\nIf you like, take a copy first with **Download My Data**. Hanogt AI can't delete your account for you; only you can make that decision.",
        },
        keywords: "hesap sil delete account kapat close üyelik",
        links: [L.settings],
    },
    {
        id: "account-export",
        intents: ["account_export"],
        title: { TR: "Verilerimi indirme", EN: "Downloading my data" },
        body: {
            TR: "[Hesap Ayarları](/account-settings) → **Hesap** → **Verilerimi İndir** ile profilini, projelerini ve dosyalarını, oyun projelerini, Media ve Arcade kayıtlarını, yorumlarını ve mesajlarını tek bir JSON dosyası olarak indirirsin. Parola karmaları gibi gizli kimlik bilgileri dosyaya eklenmez.",
            EN: "[Account Settings](/account-settings) → **Account** → **Download My Data** gives you your profile, projects and files, game projects, Media and Arcade records, comments and messages as one JSON file. Secret credentials such as password hashes are never included.",
        },
        keywords: "veri indir export dışa aktar yedek backup json download data",
        links: [L.settings],
    },
    {
        id: "account-profile",
        intents: ["account_profile", "my_profile"],
        title: { TR: "Profil ve hesap ayarları", EN: "Profile and account settings" },
        body: {
            TR: "[Hesap Ayarları](/account-settings)'nda şunları değiştirebilirsin:\n• **Profil:** kullanıcı adı, profil resmi adresi (https), takma ad, hakkında, banner, vurgu rengi, favori diller (en fazla 5), durum mesajı, sosyal bağlantılar.\n• **Takma ad ve etiket:** arkadaşların seni `TakmaAd#1234` ile bulur.\n• **Bildirimler, mesajlaşma, görünüm, gizlilik:** çevrimiçi durumu, son görülme, kimlerin seni ekleyebileceği.\n• **Güvenlik:** parola ve iki adımlı doğrulama.\nHanogt ekibindekilerin profilinde **Sahip**, **Yönetici** veya **Moderatör** rozeti görünür; kullanıcılar kendine rol veya rozet veremez. Ajan modunda profilini senin için özetleyebilirim (oturum başına bir kez izin isterim).",
            EN: "In [Account Settings](/account-settings) you can change:\n• **Profile:** username, profile picture URL (https), nickname, about, banner, accent color, favorite languages (up to 5), status message, social links.\n• **Nickname & tag:** friends find you with `Nickname#1234`.\n• **Notifications, messaging, appearance, privacy:** online status, last seen, who can add you.\n• **Security:** password and two-factor authentication.\nHanogt team members show an **Owner**, **Admin** or **Moderator** badge on their profile; users can't give themselves roles or badges. In Agent mode I can summarise your profile for you (I ask once per session).",
        },
        keywords: "profil kullanıcı adı avatar resim takma ad etiket tag banner rozet badge settings ayarlar favori dil",
        links: [L.settings],
    },
    {
        id: "login-help",
        intents: ["login_help"],
        title: { TR: "Giriş sorunları", EN: "Sign-in problems" },
        body: {
            TR: "Giriş yapamıyorsan:\n• **Google ile giriş:** Tarayıcı seni Google'ın döndüğü alan adına taşıyıp girişi tamamlar; çerezleri engelleyen eklentileri kapatıp yeniden dene.\n• **İki adımlı doğrulama açıksa** parolandan sonra doğrulayıcı uygulamadaki 6 haneli kodu ya da bir kurtarma kodunu gir.\n• **\"Çok fazla deneme\":** güvenlik için belirtilen süre kadar bekle.\n• **Parolanı unuttuysan:** hesabı Google ile açtıysan Google ile giriş yap. E-postayla sıfırlama henüz yok; [Geri Bildirim ve Destek](/feedback) sayfasından başka bir hesapla **İstek** kategorisinde destek talebi aç.\n• **\"Hesap askıya alındı\":** giriş ekranında parolanla ya da Google ile doğrulama yaptıktan sonra açılan itiraz formunu kullan.\n• Oturum 90 gün geçerlidir ve her ziyarette yenilenir; çıkış yapmadıkça tekrar giriş gerekmez.",
            EN: "If you can't sign in:\n• **Google sign-in:** the browser moves you to the domain Google returns to and completes sign-in; turn off cookie-blocking extensions and try again.\n• **With two-factor authentication on**, enter the 6-digit code from your authenticator app (or a recovery code) after your password.\n• **\"Too many attempts\":** wait the time shown, it's a safety limit.\n• **Forgot your password:** if you created the account with Google, sign in with Google. E-mail reset isn't available yet; open a support ticket in the **Request** category on [Feedback and Support](/feedback) from another account.\n• **\"Account suspended\":** verify with your password or Google on the sign-in screen, then use the appeal form that opens there.\n• Sessions last 90 days and renew on every visit; you stay signed in until you sign out.",
        },
        keywords: "giriş login sign in google şifremi unuttum forgot password oturum session hata error oauth 2fa kod",
        links: [L.feedback],
    },
    {
        id: "editor",
        intents: ["editor_help", "open_editor"],
        title: { TR: "Kod editörünü kullanmak", EN: "Using the code editor" },
        body: {
            TR: "[Kod Editörü](/editor) Monaco (VS Code'un editörü) tabanlıdır ve {highlighted} dili vurgular:\n• **Sekmeler ve dosyalar:** yeni dosya ekle, yeniden adlandır, farklı dillerde çoklu dosya çalıştır; şablon galerisi, ZIP içe/dışa aktarma ve parçacık paylaşımı var.\n• **Kaydet:** giriş yaptıysan projelerin buluta kaydedilir ve [Panel](/dashboard)'de görünür.\n• **Çalıştır:** tarayıcı dilleri anında, derlenen diller güvenli derleyici hizmetinde çalışır; **Girdi** sekmesinden stdin verirsin, konsoldaki `dosya:satır` bağlantıları hatalı satıra götürür.\n• **Media'da yayınla:** projeni editörden doğrudan Hanogt Media'da paylaşabilirsin.\n• **Ayarlar:** tema, yazı tipi, boyut, sekme genişliği, mini harita, otomatik kaydetme [Editör Ayarları](/settings)'nda.\n• Kısayollar: Ctrl/⌘+K komut paleti, Ctrl+S kaydet, Ctrl+Enter çalıştır, Ctrl+F bul.\nAjan modunda yazdığım kodu editörde yeni bir sekmede açabilirim.",
            EN: "The [Code Editor](/editor) is built on Monaco (VS Code's editor) and highlights {highlighted} languages:\n• **Tabs and files:** add, rename and run multiple files in different languages; there is a template gallery, ZIP import/export and snippet sharing.\n• **Save:** when signed in, projects are saved to the cloud and appear on your [Dashboard](/dashboard).\n• **Run:** browser languages run instantly, compiled ones on a secure compiler service; give stdin in the **Input** tab, and `file:line` links in the console jump to the failing line.\n• **Publish to Media:** share your project on Hanogt Media straight from the editor.\n• **Settings:** theme, font, size, tab width, minimap and auto-save in [Editor Settings](/settings).\n• Shortcuts: Ctrl/⌘+K command palette, Ctrl+S save, Ctrl+Enter run, Ctrl+F find.\nIn Agent mode I can open the code I write in a new editor tab.",
            vars: languageCounts,
        },
        keywords: "editör editor monaco dosya file sekme tab kaydet save proje project kısayol shortcut tema komut paleti command palette zip",
        links: [L.editor, L.editorSettings],
    },
    {
        id: "run-code",
        intents: ["run_code"],
        title: { TR: "Kod çalıştırma", EN: "Running code" },
        body: {
            TR: "**Çalıştır** düğmesine bas (Ctrl+Enter):\n• **Tarayıcıda ({browser} dil):** {browserList} ayrı bir Web Worker içinde çalışır (veri biçimleri doğrulayıcıyla denetlenir); giriş gerekmez, kod sunucuya gitmez. Sonsuz döngüler 15 saniyede durdurulur.\n• **Derleyici hizmetinde ({server} dil):** C, C++, C#, Java, Go, Rust, Kotlin ve diğerleri giriş yapmayı gerektirir; kod önce Hanogt Security ile taranır, sonra izole bir hizmette (yöneticinin çalıştırıcısı ya da Wandbox) derlenir. Planına göre dakikada 40 (Ücretsiz), 150 (Plus) veya 400 (Pro) dosya çalıştırabilirsin.\n• **Önizleme ({preview} dil):** {previewList} güvenli önizleme panelinde canlı görüntülenir.\n• **Girdi:** `input()`, `Scanner`, `cin`, `io.read()` okumaları **Girdi** sekmesindeki metinden gelir.\n• Python ilk açılışta ~12 MB indirir; biraz bekle.",
            EN: "Press **Run** (Ctrl+Enter):\n• **In the browser ({browser} languages):** {browserList} run in a separate Web Worker (data formats are checked by a validator); no sign-in needed and code never leaves your device. Infinite loops are stopped after 15 seconds.\n• **On the compiler service ({server} languages):** C, C++, C#, Java, Go, Rust, Kotlin and more need sign-in; code is first screened by Hanogt Security and then compiled in an isolated service (the operator's runner or Wandbox). You can run 40 (Free), 150 (Plus) or 400 (Pro) files per minute, depending on your plan.\n• **Preview ({preview} languages):** {previewList} render live in a sandboxed preview panel.\n• **Input:** `input()`, `Scanner`, `cin` and `io.read()` read from the text in the **Input** tab.\n• Python downloads ~12 MB on first use; give it a moment.",
            vars: languageCounts,
        },
        keywords: "çalıştır run execute input girdi stdin çıktı output wandbox runner derle compile timeout zaman aşımı önizleme preview",
        links: [L.editor],
    },
    {
        id: "languages-supported",
        intents: ["languages_supported"],
        title: { TR: "Desteklenen programlama dilleri", EN: "Supported programming languages" },
        body: {
            TR: "Kod Editörü **{highlighted} dili** sözdizimi vurgulamasıyla düzenler; bunların **{usable} tanesi çalıştırılabilir ya da önizlenebilir** ({runnable} çalıştırılabilir + {preview} önizleme):\n• **Tarayıcıda ({browser}):** {browserList}.\n• **Derleyici hizmetinde ({server}):** {serverList}.\n• **Canlı önizleme ({preview}):** {previewList}.\n• **Yalnızca düzenleme ({editOnly}):** {editOnlyList} ve diğerleri.\n**Oyun scriptleri:** Hanogt Engine'de C# ve C++ (tarayıcıdaki HanogtScript sanal makinesinde).",
            EN: "The Code Editor edits **{highlighted} languages** with syntax highlighting; **{usable} of them can be run or previewed** ({runnable} runnable + {preview} preview):\n• **In the browser ({browser}):** {browserList}.\n• **On the compiler service ({server}):** {serverList}.\n• **Live preview ({preview}):** {previewList}.\n• **Edit only ({editOnly}):** {editOnlyList} and more.\n**Game scripts:** C# and C++ in Hanogt Engine (in the HanogtScript virtual machine in your browser).",
            vars: languageCounts,
        },
        keywords: "dil diller language languages python java c# c++ rust go kotlin php ruby prolog forth basic mips yaml toml svg mermaid latex destek supported kaç dil how many",
        links: [L.editor],
    },
    {
        id: "ui-language",
        intents: ["ui_language"],
        title: { TR: "Arayüz dilini değiştirme", EN: "Changing the interface language" },
        body: {
            TR: "Üst menüdeki **dil seçiciden** (bayrak/dünya simgesi) ya da [Hesap Ayarları](/account-settings) → Dil ve Bölge'den **50 dil** arasından seçim yapabilirsin; Arapça, Farsça, İbranice ve Urduca sağdan sola gösterilir. Seçimin bu tarayıcıda hatırlanır.",
            EN: "Pick one of **50 languages** from the **language menu** at the top (flag/globe icon) or in [Account Settings](/account-settings) → Language & Region; Arabic, Persian, Hebrew and Urdu are shown right-to-left. Your choice is remembered in this browser.",
        },
        keywords: "dil language arayüz interface çeviri translate türkçe english arapça",
        links: [L.settings],
    },
    {
        id: "engine",
        intents: ["engine_help", "make_game"],
        title: { TR: "Hanogt Engine ile oyun yapmak", EN: "Making games with Hanogt Engine" },
        body: {
            TR: "[Oyun Motoru](/game-engine) (Hanogt Engine V5) Unity benzeri, tarayıcıda çalışan bir 2D/3D motordur:\n1. **Yeni proje** oluştur, 2D veya 3D seç ya da hazır şablonla başla (Yıldız Düellosu, Zindan Kaçışı, Meteor Yağmuru, Gök Kulesi, Labirent Avı, Sapan Ustası, Neon Koşu, Kanat Çırp, Pong, Yılan (C++), Küçük Macera, Engel Parkuru, Kale Savunması, Neon Arena (C++), Tilemap Macerası, Tıklama Fabrikası, Sisli Koşu, 2D Platform, 3D Top Yuvarlama, Uzay Nişancısı, Tuğla Kırma, boş 2D/3D).\n2. **Hiyerarşi**'den nesne ekle, **Inspector**'da Transform, Sprite/Mesh, Collider, Rigidbody, Character Controller 2D, Camera Follow, Nav Agent 2D, eklemler, Kamera, Işık, Tilemap, Animasyon, Animator, Player Input, Ses Kaynağı, UI ve Script bileşenlerini düzenle; GLB 3D model yükleyebilirsin. Birden çok nesneyi seçip (Shift + sürükle ya da Ctrl+A) birlikte düzenleyebilirsin.\n3. **C# veya C++ script** yaz: `Start()`, `Update()`, `OnCollisionEnter2D()`, `Input.GetButtonDown(\"Jump\")`, `Input.GetAxis(\"Horizontal\")`, `Instantiate()`, `Audio.PlayMusic()`, `SaveSystem.Save()`, `Localization.Get()`, `Leaderboard.Submit()`…\n4. **Oynat** ile test et, konsoldaki hataları satır numarasıyla gör, **İzle** panelinde değişkenleri canlı takip et.\n5. **Arcade'de yayınla** (skor tabloları ve başarımlarla), **web paketi (ZIP · PWA)** olarak kendi sitende yayınla ya da tek dosya HTML olarak dışa aktar.\nYeni başlıyorsan [İlk oyunun: adım adım](/game-engine/docs#ilk-oyun) bölümü 10 dakikada coin toplayan bir platform oyunu yaptırır. Ayrıntılar: [Motor belgeleri](/game-engine/docs). Ajan modunda senin için şablondan oyun projesi oluşturabilirim; \"zıplama kodu\" gibi bir şey sorarsan örnek script veririm.",
            EN: "[Game Engine](/game-engine) (Hanogt Engine V5) is a Unity-like 2D/3D engine that runs in the browser:\n1. Create a **new project**, choose 2D or 3D or start from a template (Star Duel, Dungeon Escape, Meteor Storm, Sky Tower, Maze Hunt, Slingshot Master, Neon Run, Flap, Pong, Snake (C++), Little Adventure, Obstacle Course, Castle Defense, Neon Arena (C++), Tilemap Adventure, Clicker Factory, Foggy Runner, 2D Platformer, 3D Roll-a-Ball, Space Shooter, Breakout, empty 2D/3D).\n2. Add objects in the **Hierarchy** and edit Transform, Sprite/Mesh, Collider, Rigidbody, Character Controller 2D, Camera Follow, Nav Agent 2D, joints, Camera, Light, Tilemap, Animation, Animator, Player Input, Audio Source, UI and Script components in the **Inspector**, and upload GLB 3D models. Select several objects (Shift + drag or Ctrl+A) to edit them together.\n3. Write **C# or C++ scripts**: `Start()`, `Update()`, `OnCollisionEnter2D()`, `Input.GetButtonDown(\"Jump\")`, `Input.GetAxis(\"Horizontal\")`, `Instantiate()`, `Audio.PlayMusic()`, `SaveSystem.Save()`, `Localization.Get()`, `Leaderboard.Submit()`…\n4. Test with **Play**, read errors with line numbers in the console and follow variables live in the **Watch** panel.\n5. **Publish to the Arcade** (with leaderboards and achievements), host it on your own site as a **web package (ZIP · PWA)** or export a single-file HTML game.\nNew to it? [Your first game, step by step](/game-engine/docs#ilk-oyun) builds a coin-collecting platformer in 10 minutes. Details: [Engine docs](/game-engine/docs). In Agent mode I can create a game project from a template for you; ask for something like \"jump code\" and I'll give you a sample script.",
        },
        keywords: "oyun motoru game engine unity c# c++ script sprite prefab rigidbody collider sahne scene 2d 3d monobehaviour şablon template gök kulesi sky tower labirent maze sapan slingshot izle watch yıldız düellosu star duel zindan dungeon meteor animator glb model",
        links: [L.engine, L.docs],
    },
    {
        id: "engine-v3",
        intents: ["engine_v3"],
        title: { TR: "Hanogt Engine V5'te neler var?", EN: "What's new in Hanogt Engine V5?" },
        body: {
            TR: "**Hanogt Engine V5** (proje şeması v5) oyunlara karakter animasyonu, kayıt, çeviri ve paylaşım için yeni yapı taşları getirir. Eski projeler açılırken otomatik taşınır; önceki sürümlerle yapılan oyunlar kendi kurallarıyla aynı şekilde çalışmaya devam eder.\n• **Animator durum makinesi:** Idle, Run, Jump gibi durumlar, parametreler (bool, float, int, trigger), geçişler ve Her Durum; betik yalnızca `animator.SetFloat(\"speed\", hız)` ya da `SetTrigger(\"attack\")` der. Alt paneldeki Animator sekmesi oyun çalışırken geçerli durumu canlı gösterir.\n• **Skor tabloları ve başarımlar:** Ayarlar → Arcade'de tanımla, `Leaderboard.Submit(\"score\", skor)` ve `Achievements.Unlock(\"first-win\")` ile bildir. Arcade'de giriş yapan oyuncuların en iyi skorları saklanır; sunucu sınırları ve en kısa oynama süresini denetler, tablolar \"doğrulanmamış\" olarak gösterilir.\n• **Oyunun dilleri:** Ayarlar → Diller'de dil tablosu, `Localization.Get(\"anahtar\")`, UI'da dil anahtarı ve CSV ile çeviri.\n• **Yerel çok oyunculu:** Player Input ile aynı ekranda dört oyuncuya kadar; klavyenin iki yarısı ve gamepad'ler.\n• **SaveSystem ve JsonUtility:** kendi sınıflarını `SaveSystem.Save(\"slot1\", veri)` ile kaydet, `Load<T>()` ile geri yükle; 20 yuva.\n• **3D modeller (GLB):** en fazla 300 KB, kendi malzemeleri ve dokularıyla; ses dosyalarıyla aynı depolama alanına sayılır.\n• **Ekran efektleri V2:** renk düzenleme, renk filtresi, kromatik sapma, pikselleştirme ve CRT; `ScreenEffects` ile oyun sırasında değiştir.\n• **Web paketi (ZIP · PWA):** oyunu kendi sitende ya da itch.io'da yayınla; uygulama olarak yüklenir, çevrim dışı da oynanır.\n• **Üç yeni şablon:** Yıldız Düellosu (iki kişilik), Zindan Kaçışı ve Meteor Yağmuru.\nV4'ün getirdikleri (giriş eylemleri ve gamepad, Character Controller 2D, kamera takibi, A* yol bulma, eklemler, Slider/Toggle/Input Field, ses dosyaları ve müzik, İzle paneli) ve V3'ünkiler (tilemap, animasyon ve Tween, sis ve ekran efektleri) aynen sürüyor. Detaylar için [Motor belgeleri](/game-engine/docs)'ne bak ya da [Oyun Motoru](/game-engine)'nda bir şablonla dene.",
            EN: "**Hanogt Engine V5** (project schema v5) adds building blocks for character animation, saving, translating and sharing games. Older projects are migrated automatically when opened, and games made with earlier versions keep playing with their own rules.\n• **Animator state machine:** states such as Idle, Run and Jump, parameters (bool, float, int, trigger), transitions and Any State; scripts only call `animator.SetFloat(\"speed\", speed)` or `SetTrigger(\"attack\")`. The Animator tab of the bottom panel shows the current state live while the game runs.\n• **Leaderboards and achievements:** define them under Settings → Arcade and report with `Leaderboard.Submit(\"score\", score)` and `Achievements.Unlock(\"first-win\")`. The Arcade keeps the best scores of signed-in players; the server checks bounds and the minimum play time, and leaderboards are marked \"unverified\".\n• **Game languages:** a string table under Settings → Languages, `Localization.Get(\"key\")`, localization keys on UI and CSV for translators.\n• **Local multiplayer:** up to four players on one screen with Player Input, using the two halves of the keyboard and gamepads.\n• **SaveSystem and JsonUtility:** save your own classes with `SaveSystem.Save(\"slot1\", data)` and load them with `Load<T>()`; 20 slots.\n• **3D models (GLB):** up to 300 KB, with their own materials and textures; they share storage with audio files.\n• **Screen effects V2:** color grading, tint, chromatic aberration, pixelation and CRT; change them during the game with `ScreenEffects`.\n• **Web package (ZIP · PWA):** host the game on your own site or on itch.io; it installs as an app and plays offline.\n• **Three new templates:** Star Duel (two players), Dungeon Escape and Meteor Storm.\nEverything V4 brought (input actions and gamepads, Character Controller 2D, camera follow, A* path finding, joints, Slider/Toggle/Input Field, audio files and music, the Watch panel) and V3's features (tilemaps, animation and Tween, fog and screen effects) are still there. See the [Engine docs](/game-engine/docs) or try a template in the [Game Engine](/game-engine).",
        },
        keywords: "engine v5 motor v5 engine v4 motor v4 engine v3 yenilik new animator durum makinesi state machine skor tablosu leaderboard başarım achievement çeviri localization dil language yerel çok oyunculu local multiplayer player input savesystem kayıt save jsonutility glb model ekran efekti screen effects crt pikselleştirme pixelate web paketi web package zip pwa yıldız düellosu star duel zindan dungeon meteor girdi input gamepad character controller yol bulma pathfinding ses dosyası audio",
        links: [L.engine, L.docs],
    },
    {
        id: "arcade",
        intents: ["arcade_help"],
        title: { TR: "Arcade", EN: "Arcade" },
        body: {
            TR: "[Arcade](/arcade), Hanogt Engine ile yapılan oyunların vitrinidir:\n• **Yayınlamak için** motorda **Yayınla**'ya bas; oyun derlenir ve Hanogt Security taramasından geçer.\n• Oyuncular tarayıcıda, tam ekranda ve dokunmatik kontrollerle oynar; beğenir, oynanma sayısını görür.\n• **Remiks:** yapımcı yayınlarken **Remikslemelere izin ver**'i açtıysa (kartta \"Remikslenebilir\" simgesi) oyunun kopyasını kendi projene alıp geliştirebilirsin; remiksin sayfası asıl oyuna bağlantı verir. İzin yoksa oyun yalnızca oynanır.\n• **Skor tabloları ve başarımlar:** yapımcı tanımladıysa oyunun yanında görünür; giriş yaptıysan en iyi skorun tabloya, açtığın başarımlar hesabına kaydedilir (giriş yapmadan yalnızca bu cihazda tutulur). Skorlar oyuncunun tarayıcısından geldiği için tablolarda \"doğrulanmamış\" yazar; paylaşımı kapatabilir ya da skorunu kaldırabilirsin.\n• Yayınladığın oyunu istediğin an yayından kaldırabilirsin; uygunsuz oyunlar yetkili ekip tarafından incelenir.",
            EN: "The [Arcade](/arcade) showcases games made with Hanogt Engine:\n• **To publish**, press **Publish** in the engine; the game is compiled and screened by Hanogt Security.\n• Players play in the browser, fullscreen and with touch controls, like games and see play counts.\n• **Remix:** if the maker turned on **Allow remixes** when publishing (the card shows a \"Remixable\" icon), you can copy the game into your own project and build on it; the remix's page links back to the original. Without permission a game can only be played.\n• **Leaderboards and achievements:** when the maker defined them, they show next to the game; signed in, your best score goes on the board and your achievements are kept on your account (without signing in they stay on this device). Scores come from the player's browser, so boards say \"unverified\"; you can turn sharing off or remove your score.\n• You can unpublish your game any time; inappropriate games are reviewed by staff.",
        },
        keywords: "arcade oyun yayınla publish remix oyna play beğen like skor tablosu leaderboard başarım achievement rekor high score",
        links: [L.arcade, L.engine],
    },
    {
        id: "media",
        intents: ["media_help"],
        title: { TR: "Hanogt Media", EN: "Hanogt Media" },
        body: {
            TR: "[Hanogt Media](/media), kod projelerini toplulukla paylaştığın yerdir:\n• Projeler Kod Editörü'nden ya da Media sayfasından yayınlanır; başlık, açıklama, en fazla 6 etiket ve **lisans** (Tüm hakları saklı, MIT, Apache-2.0, GPL-3.0) seçilir.\n• Yayınlar önce güvenlik ön elemesinden geçer; gizli anahtar içeren kod yayınlanmaz.\n• Diğerleri projeni görüntüler, tek dosya veya ZIP olarak indirir, editörde açar, beğenir ve yorumlar; uygunsuz içeriği bildirebilirler.\n• Popüler ve yeni projeleri keşfet sekmelerinden görürsün; kendi yayınını güncelleyebilir ya da istediğin zaman silebilirsin.",
            EN: "[Hanogt Media](/media) is where you share code projects with the community:\n• Projects are published from the Code Editor or the Media page with a title, description, up to 6 tags and a **license** (all rights reserved, MIT, Apache-2.0, GPL-3.0).\n• Posts pass a security pre-check first; code containing secret keys isn't published.\n• Others view your project, download it as a file or ZIP, open it in the editor, like and comment; they can report inappropriate content.\n• Browse popular and new projects in the discover tabs; update your own post or delete it any time.",
        },
        keywords: "media paylaş share lisans license mit yorum comment beğeni like indir download keşfet",
        links: [L.media],
    },
    {
        id: "publish-media",
        intents: ["publish_media"],
        title: { TR: "Kodu editörden Media'da yayınlamak", EN: "Publishing code to Media from the editor" },
        body: {
            TR: "Projeni [Kod Editörü](/editor)'nden doğrudan [Hanogt Media](/media)'da yayınlayabilirsin:\n1. Giriş yap ve yayınlamak istediğin dosyaları editörde aç.\n2. Araç çubuğundaki menüden **Media'da yayınla**'yı seç.\n3. Başlık (en fazla 100 karakter), açıklama, en fazla 6 etiket ve lisans (Tüm hakları saklı, MIT, Apache-2.0, GPL-3.0) gir; yayınlanacak dosyaları seç (en fazla 50 dosya).\n4. Yayınlamadan önce dosyalar tarayıcında ve sunucuda güvenlik taramasından geçer; gizli anahtar ya da zararlı kod bulunursa satırıyla birlikte gösterilir ve yayın durdurulur.\n5. Kendi Media projeni editörde açtığında değişikliklerini aynı yayına **güncelleme** olarak gönderebilirsin.",
            EN: "You can publish your project to [Hanogt Media](/media) straight from the [Code Editor](/editor):\n1. Sign in and open the files you want to share in the editor.\n2. Choose **Publish to Media** from the toolbar menu.\n3. Enter a title (up to 100 characters), a description, up to 6 tags and a license (all rights reserved, MIT, Apache-2.0, GPL-3.0), and pick the files to publish (up to 50).\n4. Before publishing, the files are security-scanned in your browser and on the server; secret keys or harmful code are shown with their line and the post is stopped.\n5. When you open your own Media project in the editor, you can send your changes to the same post as an **update**.",
        },
        keywords: "media yayınla publish editörden from editor paylaş share kod code proje project lisans license etiket tag güncelle update",
        links: [L.editor, L.media],
    },
    {
        id: "news",
        intents: ["news_help"],
        title: { TR: "Hanogt News", EN: "Hanogt News" },
        body: {
            TR: "[Hanogt News](/news) yapay zeka, yazılım, oyun, uygulama ve bilim haberlerini 20'yi aşkın güvenilir kaynağın herkese açık RSS/Atom akışlarından toplar; yalnızca başlık, kısa özet ve kaynağa bağlantı gösterilir.\n• Akış kendiliğinden yenilenir ve yalnızca **son 24 saatin** haberlerini gösterir; bir günden eski haberler ve yorumları kendiliğinden silinir. Son dakika bandı, kategori ve dil filtresi, arama (`/` kısayolu), gündem konuları ve **Sonra oku** listesi vardır.\n• Yorumlar giriş gerektirir; hakaret, spam ve kişisel veri otomatik engellenir.\n• **Yapay Zeka Arenası:** iki asistanı karşılaştırıp oy verirsin; sıralama yalnızca topluluk oylarından Elo ile hesaplanır.",
            EN: "[Hanogt News](/news) collects AI, software, gaming, app and science stories from the public RSS/Atom feeds of 20+ trusted sources; only the headline, a short excerpt and a link to the source are shown.\n• The feed refreshes itself and shows only the **last 24 hours**; stories older than a day and their comments are deleted automatically. There's a breaking-news ticker, category and language filters, search (`/` shortcut), trending topics and a **Read later** list.\n• Comments need sign-in; abuse, spam and personal data are blocked automatically.\n• **AI Arena:** compare two assistants and vote; rankings come only from community votes via Elo.",
        },
        keywords: "haber news rss kaynak source yorum comment arena elo oy vote sonra oku read later",
        links: [L.news],
    },
    {
        id: "friends",
        intents: ["friends_help"],
        title: { TR: "Arkadaşlar (Hanogt Social)", EN: "Friends (Hanogt Social)" },
        body: {
            TR: "Arkadaşların [Hanogt Social](/social)'dedir (Discord benzeri; eski /friends adresi buraya yönlenir). Ana sayfadaki **Arkadaşlar** ekranında **Çevrimiçi**, **Tümü**, **Bekleyen** ve **Engellenen** sekmeleri vardır:\n• **Arkadaş ekle:** karşı tarafın takma adını ve etiketini `TakmaAd#1234` biçiminde yaz; istek gönderilir, kabul edince arkadaş olursunuz. Karşı tarafın \"kimler ekleyebilir\" ayarına uyulur ve gönderdiğin isteği iptal edebilirsin. Kendi etiketin Hesap Ayarları'nda yazar.\n• Gelen istekleri kabul et ya da reddet; arkadaşını çıkar, istersen **engelle** (engellediğin kişi sana yazamaz ve arayamaz).\n• **Durumlar** her yerde aynıdır: Çevrimiçi (yeşil), Boşta, Rahatsız Etmeyin ve çevrimdışı/Görünmez (gri). Kendi durumunu sol alttaki kullanıcı panelinden seçersin.\n• Arkadaşlıklar karşılıklıdır ve sunucuda yönetilir; kimse kendi kendine seni arkadaş listesine ekleyemez.",
            EN: "Your friends live in [Hanogt Social](/social) (Discord-style; the old /friends address redirects there). The **Friends** screen on its home has **Online**, **All**, **Pending** and **Blocked** tabs:\n• **Add a friend:** type their nickname and tag as `Nickname#1234`; a request is sent and you become friends when they accept. Their \"who can add me\" setting is respected and you can cancel a request you sent. Your own tag is shown in Account Settings.\n• Accept or decline incoming requests; remove a friend or **block** them (blocked people can't message or call you).\n• **Statuses** are the same everywhere: Online (green), Idle, Do Not Disturb and offline/Invisible (grey). Pick your own in the user panel at the bottom left.\n• Friendships are mutual and managed on the server; nobody can add you to their friend list on their own.",
        },
        keywords: "arkadaş friend ekle add istek request bekleyen pending engelle block engellenen blocked etiket tag çevrimiçi online durum status boşta idle rahatsız etmeyin do not disturb görünmez invisible hanogt social sosyal",
        links: [L.social, L.friends],
    },
    {
        id: "groups",
        intents: ["groups_help", "create_group"],
        title: { TR: "Gruplar (Hanogt Social)", EN: "Groups (Hanogt Social)" },
        body: {
            TR: "Gruplar [Hanogt Social](/social)'de Discord benzeri ekip alanlarıdır (eski /groups adresleri buraya yönlenir):\n1. Soldaki grup rayında **Grup oluştur** sihirbazıyla (3 adım) bir şablon seç: Boş grup, Çalışma grubu, Oyun geliştirme (Game jam), Açık kaynak proje, Sınıf, Hackathon takımı. Grup README ve görev listesi gibi başlangıç dosyaları, hazır bir **Kurallar** bölümü, sohbet konuları ve sabitlenmiş bir karşılama mesajıyla açılır; istersen kendi projenin dosyalarını aktarabilirsin.\n2. **Davet et:** arkadaşlarını doğrudan davet et ya da süreli (1 saat, 24 saat, 7 gün, süresiz) ve kullanım sınırlı, iptal edilebilir bir **davet bağlantısı** paylaş.\n3. **Birlikte çalış:** kanallar (#genel ve konular), **Dosyalar** ve sabitlenenler; ortak dosyaları otomatik kaydederek düzenleyin, editörde açın; sohbette tepkiler, @bahsetme, #kanal, /komutlar, GIF, Markdown, arama, sesli mesaj, dosya gönderme ve sesli arama var; kenar çubuğundaki **sesli kanala** aynı anda 5 kişi katılabilir. Sağdaki üye listesi role ve duruma göre gruplanır; okunmamış ve bahsetme sayaçları rayda görünür. Ctrl/⌘+K ile hızlı geçiş yapabilirsin.\n4. **Roller:** sahip, yönetici, moderatör ve üye; sahip ve yöneticiler üyeleri, ayarları ve AutoMod'u yönetir, moderatörler uyarır, susturur, mesaj siler ve gruptan çıkarır. Hanogt Security Bot ve AutoMod için “Gruplarda botlar ve AutoMod” notuna bak.\n5. **Kurallar:** kanal listesinin en üstündeki Kurallar bölümü (Discord'daki gibi) grubun numaralı kurallarını başlık ve açıklamalarıyla gösterir. Sahip ve yöneticiler kuralları Grup ayarları → Kurallar ve konular'dan ekler, düzenler, sıralar ya da önerilen kurallarla başlar (en fazla 20 kural). “Üyeler sohbet etmeden önce kuralları kabul etsin” açıksa üyeler kuralları kabul edene kadar yazamaz, tepki veremez, dosya ya da sesli mesaj gönderemez ve sesli kanala katılamaz; okumaya devam edebilirler. Kurallar davet sayfasında katılmadan önce de gösterilir ve “Kuralları okudum ve kabul ediyorum” işaretlenerek katılınır. Sahip, yöneticiler ve moderatörler kabul etmek zorunda değildir; kurallar önemli ölçüde değişirse sahip herkesten yeniden kabul isteyebilir.\nSınırlar: grup başına 50 dosya; grubun büyüklüğü sahibinin planına göredir: Ücretsiz'de {membersFree}, Plus'ta {membersPlus}, Pro'da {membersPro} üye (sabitlenmiş mesaj, özel bot komutu ve AutoMod yasaklı kelime sınırları da planla büyür). Sahibi olabileceğin grup sayısı planına bağlı: Ücretsiz planda {groupsFree}, Plus'ta {groupsPlus}, Pro'da sınırsız ([Planlar](/plans)). Gruplar gizlidir; yalnızca davet edilenler katılır. Ajan modunda senin için grup kurabilirim.",
            EN: "Groups are Discord-style team spaces in [Hanogt Social](/social) (old /groups addresses redirect there):\n1. Use **Create a group** in the group rail on the left (a 3-step wizard) and pick a template: Blank group, Study group, Game dev (Game jam), Open-source project, Classroom, Hackathon team. The group opens with starter files like a README and a task list, a ready **Rules** section, chat topics and a pinned welcome message; you can also import files from one of your projects.\n2. **Invite:** invite friends directly or share an **invite link** that expires (1 hour, 24 hours, 7 days or never), can be use-limited and revoked.\n3. **Work together:** channels (#general and topics), **Files** and pinned messages; edit shared files with auto-save and open them in the editor; the chat has reactions, @mentions, #channels, /commands, GIFs, Markdown, search, voice messages, files and voice calls, and up to 5 people at a time can join the **voice channel** in the sidebar. The member list on the right is grouped by role and status, and unread and mention counters show in the rail. Ctrl/⌘+K switches quickly.\n4. **Roles:** owner, admin, moderator and member; owners and admins manage members, settings and AutoMod, and moderators warn, mute, delete messages and remove members. See “Bots and AutoMod in groups” for Hanogt Security Bot and AutoMod.\n5. **Rules:** the Rules section at the top of the channel list (like Discord's) shows the group's numbered rules with their titles and descriptions. Owners and admins add, edit and reorder them in Group settings → Rules & topics, or start from the suggested rules (20 rules at most). When “Members accept the rules before they chat” is on, members can't write, react, send files or voice messages or join the voice channel until they accept the rules; they can still read. The rules also show on the invite page before joining, where you join by ticking “I've read the rules and accept them”. The owner, admins and moderators don't have to accept; if the rules change a lot, the owner can ask everyone to accept them again.\nLimits: 50 files per group; a group's size follows its owner's plan: {membersFree} members on Free, {membersPlus} on Plus and {membersPro} on Pro (the limits for pinned messages, custom bot commands and AutoMod banned words grow with the plan too). How many groups you can own depends on your plan: {groupsFree} on Free, {groupsPlus} on Plus, unlimited on Pro ([Plans](/plans)). Groups are private; only invited people can join. In Agent mode I can create a group for you.",
            vars: planNumbers,
        },
        keywords: "grup group ekip team davet invite bağlantı link şablon template çalışma study sınıf classroom hackathon game jam açık kaynak kanal channel konu topic dosyalar files hanogt social sosyal discord kurallar rules kural rule kabul accept kuralları kabul et accept rules",
        links: [L.social, L.groups],
    },
    {
        id: "social-bots",
        intents: ["groups_help"],
        title: { TR: "Gruplarda botlar ve AutoMod (Hanogt Social)", EN: "Bots and AutoMod in groups (Hanogt Social)" },
        body: {
            TR: "Her grupta iki bot var:\n• **Hanogt Security Bot** (kaldırılamaz): grubun Kurallar bölümündeki kuralları `/kurallar` ile numaralı olarak listeler, karşılama mesajını gösterir ve moderasyonu duyurur. Komutlar: herkes için `/yardim`, `/kurallar`, `/uyarilar`, `/rapor @kişi sebep`; moderatörler için `/uyar`, `/sustur @kişi 10dk sebep` (en çok 28 gün), `/sesiac`, `/at`, `/temizle 20`, `/yavasmod 10s`; sahip ve yöneticiler için `/yasakla`. Komut yanıtları yalnızca sana görünür. Uyarılar ve raporlar 180 gün saklanır.\n• **Hanogt AI**: `/ai soru` ya da `@Hanogt AI` ile sor; kanalın son mesajlarını (planına göre 12, 20 ya da 30) okuyup grupta yanıtlar ve senin Hanogt AI mesaj hakkından düşer. Grup ayarları → Botlar'dan kapatılabilir.\n**AutoMod** (Grup ayarları → Güvenlik): küfür, argo, gruba özel yasaklı kelimeler, spam, çok fazla bahsetme, bağlantılar, büyük harf ve kişisel veri (e-posta, telefon, T.C. kimlik, kart, IBAN) kuralları. Kurala takılan mesaj hiç gönderilmez; grup seçerse uyarı verilir ve belli sayıda uyarıda otomatik susturulur. Sahip her zaman, yöneticiler varsayılan olarak muaftır. Sahip ve yöneticiler ayrıca **özel komutlar** ve bir **karşılama mesajı** tanımlayabilir.",
            EN: "Every group has two bots:\n• **Hanogt Security Bot** (can't be removed): lists the rules of the group's Rules section, numbered, with `/rules`, shows the welcome message and announces moderation. Commands: `/help`, `/rules`, `/warnings` and `/report @person reason` for everyone; `/warn`, `/mute @person 10m reason` (28 days at most), `/unmute`, `/kick`, `/purge 20` and `/slowmode 10s` for moderators; `/ban` for owners and admins. Command replies are visible only to you. Warnings and reports are kept for 180 days.\n• **Hanogt AI**: ask with `/ai question` or `@Hanogt AI`; it reads the channel's latest messages (12, 20 or 30 depending on your plan), answers in the group and uses your Hanogt AI message allowance. It can be switched off in Group settings → Bots.\n**AutoMod** (Group settings → Safety): rules for profanity, slang, the group's own banned words, spam, too many mentions, links, capital letters and personal data (e-mail, phone, Turkish ID, card, IBAN). A message that breaks a rule is never sent; if the group chooses, a warning is given and a set number of warnings mutes automatically. The owner is always exempt, and admins are by default. Owners and admins can also define **custom commands** and a **welcome message**.",
        },
        keywords: "bot botlar security bot güvenlik botu automod otomod moderasyon moderation moderatör moderator komut command slash uyar warn sustur mute timeout at kick yasakla ban temizle purge yavaş mod slowmode rapor report kurallar rules küfür profanity spam yasaklı kelime banned words ai botu hanogt ai grup group özel komut custom command karşılama welcome",
        links: [L.social],
    },
    {
        id: "messages",
        intents: ["messages_help"],
        title: { TR: "Direkt mesajlar (Hanogt Social)", EN: "Direct messages (Hanogt Social)" },
        body: {
            TR: "Direkt mesajlar [Hanogt Social](/social)'dedir (eski /messages adresi buraya yönlenir): soldaki **Direkt mesajlar** listesinden bir sohbet seç ya da Arkadaşlar ekranında arkadaşının mesaj düğmesine bas. Sağda karşındaki kişinin profil kartı görünür.\n• Metin, emoji, GIF, çıkartma ve **sesli mesaj** (en fazla 60 sn) gönderebilir; mesajı yanıtlayabilir, düzenleyebilir, silebilir, iletebilir, yıldızlayabilir ve sabitleyebilir, tepki verebilirsin. Yıldızlı mesajların sol menüde.\n• **Dosyalar:** yazma kutusundaki ataç düğmesiyle, yapıştırarak ya da sürükleyip bırakarak görsel, video, ses, PDF, arşiv, ofis belgesi ve kod dosyası gönderebilirsin; her dosya bir mesajdır ve açıklama ekleyebilirsin. Dosya başına Ücretsiz'de {attachFree}, Plus'ta {attachPlus}, Pro'da {attachPro}; gönderdiğin dosyalar için toplam {attachSpaceFree}, {attachSpacePlus} ve {attachSpacePro}. Programlar (.exe, .bat, .apk…) kabul edilmez; görsellerdeki konum ve cihaz bilgileri silinir. Dosyaları virüs taramasından geçmediği için yalnızca güvendiğin kişilerden geleni aç. Aynısı gruplarda da geçerlidir.\n• **Markdown:** `**kalın**`, `*italik*`, `__altı çizili__`, `~~üstü çizili~~`, `||spoiler||`, `` `kod` `` ve ``` ile kod blokları.\n• Yazıyor göstergesi, okundu bilgisi, Enter ile gönderme, yazı boyutu, arka plan ve GIF oynatma **Hanogt Social ayarları → Mesajlar**'dadır (sol alttaki dişli).\n• Yalnızca arkadaşlarınla mesajlaşabilirsin; engellediğin kişiler sana yazamaz.\nHanogt AI senin adına başkalarına mesaj göndermez.",
            EN: "Direct messages live in [Hanogt Social](/social) (the old /messages address redirects there): pick a chat from the **Direct messages** list on the left, or press the message button on a friend in the Friends screen. The other person's profile card shows on the right.\n• Send text, emoji, GIFs, stickers and **voice messages** (up to 60 s); reply to, edit, delete, forward, star and pin messages, and react to them. Your starred messages are in the side menu.\n• **Files:** use the paperclip button in the message box, paste or drag and drop to send pictures, video, sound, PDFs, archives, office documents and code files; each file is a message and you can add a caption. Up to {attachFree} per file on Free, {attachPlus} on Plus and {attachPro} on Pro, and {attachSpaceFree}, {attachSpacePlus} and {attachSpacePro} in all for the files you send. Programs (.exe, .bat, .apk…) aren't accepted, and location and device details are removed from pictures. Files aren't scanned for viruses, so only open ones from people you trust. The same goes for groups.\n• **Markdown:** `**bold**`, `*italic*`, `__underline__`, `~~strikethrough~~`, `||spoiler||`, `` `code` `` and code blocks with ```.\n• The typing indicator, read receipts, Enter to send, font size, background and GIF playback are in **Hanogt Social settings → Messages** (the gear at the bottom left).\n• You can only message friends; people you block can't write to you.\nHanogt AI never sends messages to other people on your behalf.",
            vars: planNumbers,
        },
        keywords: "mesaj message direkt mesaj direct message dm sohbet chat dosya file ek attachment ataç paperclip görsel resim image fotoğraf photo pdf zip yükle upload sesli mesaj voice message çıkartma sticker gif emoji markdown yıldız star ilet forward sabitle pin tepki reaction okundu read yazıyor typing hanogt social sosyal",
        links: [L.social, L.messages],
    },
    {
        id: "security-center",
        intents: ["security_center"],
        title: { TR: "Hanogt Güvenlik Merkezi", EN: "Hanogt Security Center" },
        body: {
            TR: "[Güvenlik Merkezi](/security) tarayıcında çalışan araçlar sunar:\n• **Kod Danışmanı:** 65+ kuralla kod taraması, puan ve düzeltme önerileri.\n• **Parola Laboratuvarı:** kırılma süresi tahmini, k-anonimlikle sızıntı kontrolü, güçlü parola üretici.\n• **Bağlantı Kontrolü:** punycode/Kiril taklidi, sahte alan adları, kısaltıcılar.\n• **Güvenlik kontrol listesi** (2FA'yı açmak gibi adımlar).\nSunucu tarafında **Hanogt Security Bot** kod çalıştırma ve yayın isteklerini zararlı imzalara karşı tarar; oturum, yetki, hız sınırı ve izole çalıştırıcı asıl korumadır. Güvenlik olayları yetkili ekibin Yönetici Paneli'nde izlenir.",
            EN: "The [Security Center](/security) offers tools that run in your browser:\n• **Code Advisor:** code scan with 65+ rules, a score and fixes.\n• **Password Lab:** crack-time estimate, k-anonymity breach check, strong password generator.\n• **Link Check:** punycode/Cyrillic look-alikes, fake domains, shorteners.\n• **Security checklist** (steps such as turning on 2FA).\nOn the server, **Hanogt Security Bot** screens code-execution and publishing requests for malicious signatures; sessions, authorization, rate limits and the isolated runner are the main protection. Security events are monitored by staff in the Admin Panel.",
        },
        keywords: "güvenlik merkezi security center bot araç tool kontrol listesi checklist",
        links: [L.security],
    },
    {
        id: "feedback",
        intents: ["feedback_help"],
        title: { TR: "Geri bildirim ve SSS", EN: "Feedback and FAQ" },
        body: {
            TR: "[Geri Bildirim ve Destek](/feedback) sayfası iki işe yarar:\n• **Herkese açık pano:** öneri ve soru paylaş, diğerlerinin önerilerini beğen ve yorumla. Hakaret, spam, bağlantı yığını ve kişisel veri otomatik engellenir.\n• **Sık Sorulan Sorular:** parola, kod çalıştırma, Hanogt AI, oyun motoru, gruplar ve gizlilik hakkında kısa yanıtlar.\nÖzel bir konu (şikayet, KVKK isteği, güvenlik açığı, yasak itirazı) için herkese açık pano yerine **destek talebi** aç; onu yalnızca Hanogt ekibi görür.",
            EN: "The [Feedback and Support](/feedback) page does two things:\n• **Public board:** share ideas and questions, like and comment on others' suggestions. Abuse, spam, link dumps and personal data are blocked automatically.\n• **FAQ:** short answers about passwords, running code, Hanogt AI, the game engine, groups and privacy.\nFor a private matter (a complaint, a KVKK request, a vulnerability, a ban appeal) open a **support ticket** instead of posting publicly; only the Hanogt team sees it.",
        },
        keywords: "geri bildirim feedback öneri suggestion hata bug sss faq pano board",
        links: [L.feedback],
    },
    {
        id: "support-ticket",
        intents: ["support_ticket"],
        title: { TR: "Destek talepleri", EN: "Support tickets" },
        body: {
            TR: "**Destek talebi**, seninle Hanogt Ekibi arasında özel bir yazışmadır; [Geri Bildirim ve Destek](/feedback) sayfasından açılır ve giriş gerektirir:\n1. Altı kategoriden birini seç: **Şikayet** (bir kullanıcı, içerik, grup ya da hizmet/site sorunu; site hataları da buraya), **İstek** (yeni özellik ya da değişiklik; KVKK başvuruları da buraya), **Güvenlik Açığı** (sorumlu bildirim, önem derecesiyle), **Ban Kaldırma İsteği** (ör. bir gruptan yasaklandıysan), **Soru** ya da **Geri Bildirim**.\n2. Başlık (en az 3 karakter) ve açıklama (en az 10 karakter) yaz. Askıya alınan hesaplar için itiraz, giriş ekranında parolayla ya da Google ile doğrulamadan sonra açılan formla yapılır.\n3. Yeni talepler yetkili ekibe bildirim olarak gider; ekip **Admin Paneli**'nden yanıtlar. Talebin durumunu takip et: **Açık**, **İnceleniyor**, **Yanıtlandı**, **Çözüldü**, **Kapatıldı**. Ekip yanıtları \"Hanogt Ekibi\" adıyla gelir; yazışmaya devam edebilir, talebi kapatabilir ya da çözülen/kapanan talebi yeniden açabilirsin.\n• Kötüye kullanımı önlemek için saatte en fazla 5 talep açılabilir.\n• Parola, doğrulama kodu ya da gizli anahtar paylaşma; Hanogt ekibi bunları asla istemez.",
            EN: "A **support ticket** is a private conversation between you and the Hanogt Team; open it on the [Feedback and Support](/feedback) page while signed in:\n1. Pick one of six categories: **Complaint** (a user, content, a group or the service/site; site bugs go here too), **Request** (a new feature or change; KVKK requests go here too), **Security vulnerability** (responsible disclosure, with a severity), **Unban request** (e.g. a group ban), **Question** or **Feedback**.\n2. Write a title (at least 3 characters) and a description (at least 10 characters). Suspended accounts appeal through the form that opens on the sign-in screen after verifying with a password or Google.\n3. New tickets notify the staff, who reply from the **Admin Panel**. Follow its status: **Open**, **In review**, **Answered**, **Resolved**, **Closed**. Replies come from \"Hanogt Team\"; you can write back, close the ticket or reopen a resolved/closed one.\n• To prevent abuse, at most 5 tickets can be opened per hour.\n• Never share passwords, verification codes or secret keys; the Hanogt team will never ask for them.",
        },
        keywords: "destek talebi support ticket bilet yardım help ekip team iletişim contact şikayet complaint istek request kvkk güvenlik açığı vulnerability ban kaldırma unban soru question geri bildirim feedback durum status",
        links: [L.feedback],
    },
    {
        id: "admin-panel",
        intents: ["admin_panel"],
        title: { TR: "Yönetici Paneli ve roller", EN: "Admin Panel and roles" },
        body: {
            TR: "**Yönetici Paneli** yalnızca Hanogt ekibine açıktır; menüde yalnızca yetkililere görünür ve her işlem sunucuda yetki denetiminden geçip **denetim kaydına** yazılır:\n• **Moderatör:** moderasyon kuyrukları (bildirilen içerik, haber yorumları), geri bildirimler, destek talepleri, istatistikler ve grafikler, Hanogt Social ve Hanogt AI özetleri (yalnızca toplam sayılar, kimseyi göstermeden), güvenlik olayları ve denetim kaydı.\n• **Yönetici:** bunlara ek olarak kullanıcı yönetimi (askıya alma, rol), site duyuruları ve kilitlenen kullanıcılar için gerekçeli 2FA sıfırlama.\n• **Sahip:** kurucu hesaplar; tüm yetkiler, yöneticileri atar veya alır.\nYetkililerin profilinde rol rozeti görünür. Roller sunucuda saklanır, kimse kendine rol veremez; Hanogt AI da yönetici işlemi yapmaz. Bir sorunu ekibe iletmek için [destek talebi](/feedback) aç.",
            EN: "The **Admin Panel** is only for the Hanogt team; the menu shows it to staff only, and every action is authorised on the server and written to an **audit log**:\n• **Moderator:** moderation queues (reported content, news comments), feedback, support tickets, statistics and charts, the Hanogt Social and Hanogt AI summaries (totals only, without showing anyone), security events and the audit log.\n• **Admin:** additionally user management (suspension, roles), site announcements and reasoned 2FA resets for locked-out users.\n• **Owner:** the founder accounts; full access, they grant and revoke admins.\nStaff show a role badge on their profile. Roles are stored on the server and nobody can give themselves one; Hanogt AI never performs admin actions either. To reach the team, open a [support ticket](/feedback).",
        },
        keywords: "yönetici paneli admin panel moderatör moderator rol role rozet badge sahip owner yetki permission denetim audit duyuru announcement",
        links: [L.feedback],
    },
    {
        id: "site-map",
        intents: ["navigate"],
        title: { TR: "Sitede nereye gidebilirim?", EN: "Where can I go on the site?" },
        body: {
            TR: "Başlıca sayfalar:\n• [Kod Editörü](/editor) ve [Panel](/dashboard) (projelerin)\n• [Oyun Motoru](/game-engine), [Arcade](/arcade), [Motor belgeleri](/game-engine/docs)\n• [Hanogt Media](/media), [Hanogt News](/news)\n• [Hanogt Social](/social): arkadaşlar, direkt mesajlar ve gruplar\n• [Hesap Ayarları](/account-settings), [Editör Ayarları](/settings)\n• [Güvenlik Merkezi](/security), [Geri Bildirim ve Destek](/feedback), [Kullanım kılavuzu](/guide), [Hakkında](/about)\nAjan modunda \"beni Hanogt Social'a götür\" dersen sayfayı senin için açarım.",
            EN: "Main pages:\n• [Code Editor](/editor) and [Dashboard](/dashboard) (your projects)\n• [Game Engine](/game-engine), [Arcade](/arcade), [Engine docs](/game-engine/docs)\n• [Hanogt Media](/media), [Hanogt News](/news)\n• [Hanogt Social](/social): friends, direct messages and groups\n• [Account Settings](/account-settings), [Editor Settings](/settings)\n• [Security Center](/security), [Feedback and Support](/feedback), [User guide](/guide), [About](/about)\nIn Agent mode, say \"take me to Hanogt Social\" and I'll open it for you.",
        },
        keywords: "sayfa page git go aç open menü menu site haritası sitemap nerede where",
    },
    {
        id: "theme",
        intents: ["theme"],
        title: { TR: "Tema", EN: "Theme" },
        body: {
            TR: "Üst menüdeki **güneş/ay** düğmesiyle açık, koyu ya da sistem temasını seçebilirsin; seçim bu tarayıcıda hatırlanır. Editörün kendi renk teması (10 tema) [Editör Ayarları](/settings)'nda ayrıca seçilir.",
            EN: "Use the **sun/moon** button at the top to pick the light, dark or system theme; your choice is remembered in this browser. The editor's own color theme (10 themes) is chosen separately in [Editor Settings](/settings).",
        },
        keywords: "tema theme karanlık koyu dark açık light gece night",
        links: [L.editorSettings],
    },
    {
        id: "pricing",
        intents: ["pricing"],
        title: { TR: "Ücret ve planlar", EN: "Pricing and plans" },
        body: {
            TR: "Hanogt Codev'in tamamı **Ücretsiz** planda kullanılabilir; sitede reklam gösterilmez. Daha fazlasını isteyenler için **Plus** ve **Pro**, [Planlar](/plans) sayfasından aylık veya yıllık abonelikle alınır:\n• **Hanogt AI:** Ücretsiz planda haftada {aiFree}, Plus'ta 2 haftada {aiPlus}, Pro'da haftada {aiPro} mesaj. Süre ilk mesajından itibaren sayılır; sohbet, kendi API anahtarınla bağlantıların, geliştirici API'si ve gruplardaki Hanogt AI aynı haktan düşer. Hanogt AI sekmesinin üstündeki sayaç kullandığını ve ne zaman yenileneceğini gösterir.\n• **Daha uzun yanıtlar:** Hanogt AI'ın bir yanıtı Ücretsiz'de en fazla {tokensFree}, Plus'ta {tokensPlus}, Pro'da {tokensPro} token olabilir; editörde açık dosyanın Ücretsiz'de {fileFree}, Plus'ta {filePlus}, Pro'da {filePro} karakteri okunur.\n• **Projeler:** Ücretsiz planda {codeFree} kod ve {gameFree} oyun projesi; Plus'ta {codePlus} ve {gamePlus}, Pro'da sınırsız.\n• **Gruplar:** Ücretsiz planda {groupsFree}, Plus'ta {groupsPlus} grup açabilirsin, Pro'da sınırsız.\n• **Grup büyüklüğü (grubun sahibinin planına göre):** Ücretsiz'de {membersFree}, Plus'ta {membersPlus}, Pro'da {membersPro} üye; Plus'ta {pinsPlus}, Pro'da {pinsPro} sabitlenmiş mesaj, {commandsPlus} / {commandsPro} özel bot komutu ve {wordsPlus} / {wordsPro} AutoMod yasaklı kelimesi. Plan düşerse hiçbir şey silinmez, yalnızca yenisi eklenemez.\n• **Kod çalıştırma:** tek seferde Ücretsiz'de {runFree}, Plus'ta {runPlus}, Pro'da {runPro} dosya; derlenen dillerde dakikada Plus'ta {runMinutePlus}, Pro'da {runMinutePro} dosya.\n• **Yıldızlı mesajlar:** Ücretsiz'de {starsFree}, Plus'ta {starsPlus}, Pro'da {starsPro}.\n• **Mesajlarda dosyalar:** dosya başına Ücretsiz'de {attachFree}, Plus'ta {attachPlus}, Pro'da {attachPro}; gönderdiğin dosyalar için toplam {attachSpaceFree}, {attachSpacePlus} ve {attachSpacePro}. Dosyalı mesajları silince alan geri döner.\n• **Oyun dosyası depolaması:** Hanogt Engine oyunlarına yüklenen sesler ve 3D modeller (GLB) için Ücretsiz planda {audioFree} MB, Plus'ta {audioPlus} MB, Pro'da {audioPro} MB (dosya başına en fazla 300 KB; aynı dosya bir kez sayılır).\n• **Ekiple düzenleme:** bir oturuma (sen dahil) Ücretsiz'de {collabFree}, Plus'ta {collabPlus}, Pro'da {collabPro} kişi katılabilir.\n• **Kendi yapay zekâ bağlantıların:** Hanogt AI'a kendi API anahtarınla Plus'ta en fazla {connectionsPlus}, Pro'da {connectionsPro} sağlayıcı bağlayabilirsin; bu bağlantılarla gönderdiğin mesajlar ayrı bir sınırla değil, Hanogt AI mesaj hakkından düşer (sağlayıcı yanıt vermezse geri eklenir).\n• **Geliştirici API'si:** Hanogt AI'ı kendi uygulamandan çağırmak için Plus'ta {apiKeysPlus}, Pro'da {apiKeysPro} anahtar; her istek sohbetle aynı Hanogt AI hakkından düşer: [API ve bağlantılar](/ai/api).\n• **Profil rozeti:** Plus ve Pro'da profilinde planının rozeti görünür; istersen Planlar sayfasından ya da Hesap Ayarları › Profil'den gizleyebilirsin.\n• **Erken erişim (Pro):** yeni özellikleri herkesten önce denersin; şu an sesle yazma ve yanıtları sesli dinleme.\n• **Destek önceliği:** taleplerin yüksek öncelikle sıraya alınır, Pro talepleri Plus taleplerinden önce gelir; sonradan yükseltirsen açık talebine yazdığında o da yükselir (belirli bir yanıt süresi taahhüdü değildir).\nBütün hakların \"kullanılan / sınır\" olarak [Planlar](/plans#usage) sayfasındaki hesap kutusunda listelenir. Fiyatlar vergiler dahil Planlar sayfasında ve ödeme ekranında gösterilir. Ödemeleri Kayıtlı Satıcımız (Merchant of Record) **Paddle** ABD doları cinsinden alır ve faturayı o keser; kart bilgilerin bize ulaşmaz. Bir planda fiyat görünmüyorsa henüz satışta değildir; \"Açılınca haber ver\" ile haber alabilirsin. İlk ödemeden sonraki 14 gün içinde iade isteyebilirsin: [İade Politikası](/refund-policy).",
            EN: "All of Hanogt Codev is available on the **Free** plan, with no ads. For people who want more, **Plus** and **Pro** are monthly or yearly subscriptions on the [Plans](/plans) page:\n• **Hanogt AI:** {aiFree} messages a week on Free, {aiPlus} every 2 weeks on Plus and {aiPro} a week on Pro. The period counts from your first message; the chat, your own API key connections, the developer API and Hanogt AI in groups share it. The meter at the top of Hanogt AI shows what you've used and when it renews.\n• **Longer answers:** a Hanogt AI answer can be up to {tokensFree} tokens on Free, {tokensPlus} on Plus and {tokensPro} on Pro; {fileFree} characters of the file open in the editor are read on Free, {filePlus} on Plus and {filePro} on Pro.\n• **Projects:** {codeFree} code and {gameFree} game projects on Free; {codePlus} and {gamePlus} on Plus, unlimited on Pro.\n• **Groups:** create {groupsFree} on Free, {groupsPlus} on Plus, unlimited on Pro.\n• **Group size (by the group owner's plan):** {membersFree} members on Free, {membersPlus} on Plus and {membersPro} on Pro; {pinsPlus} pinned messages on Plus and {pinsPro} on Pro, {commandsPlus} / {commandsPro} custom bot commands and {wordsPlus} / {wordsPro} AutoMod banned words. Nothing is removed when the plan goes down; nothing new can be added.\n• **Running code:** {runFree} files at once on Free, {runPlus} on Plus and {runPro} on Pro; for compiled languages {runMinutePlus} files a minute on Plus and {runMinutePro} on Pro.\n• **Starred messages:** {starsFree} on Free, {starsPlus} on Plus and {starsPro} on Pro.\n• **Files in messages:** up to {attachFree} per file on Free, {attachPlus} on Plus and {attachPro} on Pro, and {attachSpaceFree}, {attachSpacePlus} and {attachSpacePro} in all for the files you send. Deleting messages with files gives the space back.\n• **Game file storage:** for sounds and 3D models (GLB) uploaded to Hanogt Engine games, {audioFree} MB on Free, {audioPlus} MB on Plus and {audioPro} MB on Pro (up to 300 KB per file; the same file counts once).\n• **Team editing:** a session holds {collabFree} people on Free, {collabPlus} on Plus and {collabPro} on Pro (you included).\n• **Your own AI connections:** connect up to {connectionsPlus} providers to Hanogt AI with your own API keys on Plus and {connectionsPro} on Pro; messages through them have no separate limit and use your Hanogt AI messages (given back when the provider doesn't answer).\n• **Developer API:** to call Hanogt AI from your own app, {apiKeysPlus} keys on Plus and {apiKeysPro} on Pro; every request counts against the same Hanogt AI allowance as the chat: [API and connections](/ai/api).\n• **Profile badge:** on Plus and Pro your profile shows your plan's badge; you can hide it on the Plans page or in Account Settings › Profile.\n• **Early access (Pro):** try new features before everyone else; right now, dictation and answers read aloud.\n• **Support priority:** your tickets are queued with high priority, and Pro tickets come before Plus tickets; if you upgrade later, an open ticket moves up when you write in it (not a promise of a response time).\nEvery benefit is listed as \"used / limit\" in the account box of the [Plans](/plans#usage) page. Prices, including taxes, are shown on the Plans page and at checkout. Payments are taken in US dollars by **Paddle**, our Merchant of Record, which also issues the invoice; your card details never reach us. If a plan shows no price, it isn't on sale yet; use \"Notify me when it opens\" to hear when it is. You can ask for a refund within 14 days of the first payment: [Refund Policy](/refund-policy).",
            vars: planNumbers,
        },
        keywords: "ücret fiyat free bedava ücretsiz price premium abonelik subscription reklam ads plan plus pro satın al buy paddle ödeme payment proje project api anahtarı api key bağlantı connection yakında coming soon bekleme listesi waitlist rozet badge erken erişim early access beta yanıt uzunluğu answer length",
        links: [L.plans, L.refunds],
    },
    {
        id: "plan-extras",
        intents: ["pricing"],
        title: { TR: "Plus ve Pro'nun ek avantajları", EN: "Extra benefits of Plus and Pro" },
        body: {
            TR: "Ücretsiz plandaki hiçbir şey azalmadı; Plus ve Pro şu avantajları da getirir:\n• **Daha uzun Social mesajları:** doğrudan mesajlarda ve gruplarda mesaj başına {msgFree} (Ücretsiz), {msgPlus} (Plus) veya {msgPro} (Pro) karakter.\n• **Gruplarda daha uzun Hanogt AI yanıtları:** soranın planına göre {botFree}, {botPlus} veya {botPro} token; kanalın son {histFree}, {histPlus} veya {histPro} mesajı okunur.\n• **Sunucuda daha büyük çalıştırmalar:** dosya başına {runFree}, {runPlus} veya {runPro} karakter kod; {outFree}, {outPlus} veya {outPro} karakter çıktı.\n• **Daha uzun ekiple düzenleme:** oturumlar {hoursFree}, {hoursPlus} veya {hoursPro} saat sürer, {filesFree}, {filesPlus} veya {filesPro} dosya tutar.\n• **Rozetsiz dışa aktarma:** Plus ve Pro'da Hanogt Engine oyunları “Hanogt Engine ile yapıldı” rozeti olmadan dışa aktarılabilir (Dışa aktar menüsündeki rozet seçeneği).",
            EN: "Nothing on the Free plan was reduced; Plus and Pro also bring:\n• **Longer Social messages:** {msgFree} (Free), {msgPlus} (Plus) or {msgPro} (Pro) characters per message in direct messages and groups.\n• **Longer Hanogt AI answers in groups:** {botFree}, {botPlus} or {botPro} tokens by the asker's plan, reading the channel's last {histFree}, {histPlus} or {histPro} messages.\n• **Bigger server runs:** {runFree}, {runPlus} or {runPro} characters of code per file; {outFree}, {outPlus} or {outPro} characters of output.\n• **Longer team editing:** sessions last {hoursFree}, {hoursPlus} or {hoursPro} hours and hold {filesFree}, {filesPlus} or {filesPro} files.\n• **Exports without the badge:** on Plus and Pro, Hanogt Engine games can be exported without the “Made with Hanogt Engine” badge (the badge option in the Export menu).",
            vars: {
                msgFree: PLAN_MESSAGE_CHARS.free, msgPlus: PLAN_MESSAGE_CHARS.plus, msgPro: PLAN_MESSAGE_CHARS.pro,
                botFree: PLAN_GROUP_AI.free.answerTokens, botPlus: PLAN_GROUP_AI.plus.answerTokens, botPro: PLAN_GROUP_AI.pro.answerTokens,
                histFree: PLAN_GROUP_AI.free.history, histPlus: PLAN_GROUP_AI.plus.history, histPro: PLAN_GROUP_AI.pro.history,
                runFree: PLAN_RUN_SIZES.free.fileChars, runPlus: PLAN_RUN_SIZES.plus.fileChars, runPro: PLAN_RUN_SIZES.pro.fileChars,
                outFree: PLAN_RUN_SIZES.free.outputChars, outPlus: PLAN_RUN_SIZES.plus.outputChars, outPro: PLAN_RUN_SIZES.pro.outputChars,
                hoursFree: PLAN_COLLAB_LIMITS.free.hours, hoursPlus: PLAN_COLLAB_LIMITS.plus.hours, hoursPro: PLAN_COLLAB_LIMITS.pro.hours,
                filesFree: PLAN_COLLAB_LIMITS.free.files, filesPlus: PLAN_COLLAB_LIMITS.plus.files, filesPro: PLAN_COLLAB_LIMITS.pro.files,
            },
        },
        keywords: "plus pro avantaj benefit ek extra mesaj uzunluğu message length karakter characters grup bot hanogt ai yanıt answer token çalıştırma run boyut size çıktı output ekiple düzenleme team editing oturum session saat hours dosya files rozet badge dışa aktar export white label",
        links: [L.plans],
    },
    {
        id: "billing",
        intents: [],
        title: { TR: "Abonelik: yönetme, iptal ve iade", EN: "Your subscription: managing, cancelling and refunds" },
        body: {
            TR: "Aboneliğini [Planlar](/plans) sayfasından yönetirsin:\n• **Aboneliği yönet:** Paddle'ın müşteri portalını açar; ödeme yöntemini güncelleyebilir, faturalarını indirebilir ve aboneliği iptal edebilirsin. paddle.net üzerinden de iptal edebilirsin.\n• **İptal:** ödediğin dönemin sonunda geçerli olur; o güne kadar avantajların sürer, sonra Ücretsiz plana geçersin. Dönem bitmeden iptali geri alabilirsin; projelerin silinmez.\n• **Plan değişikliği:** Plus ile Pro ya da aylık ile yıllık arasında geçebilirsin; fark orantılı hesaplanır ve onaylamadan önce gösterilir.\n• **İade:** ilk ödemeden sonraki 14 gün içinde gerekçesiz tam iade. Yenileme ödemeleri; iptalin işlenmediyse, hatayla alındıysa ya da bizden kaynaklanan bir sorun yüzünden planı kullanamadıysan 14 gün içinde iade edilir. İadeyi paddle.net üzerinden veya İstek kategorisinde [destek talebiyle](/feedback) isteyebilirsin; tutar ödeme yöntemine genellikle 5–10 iş gününde döner.\n• **Ödeme alınamazsa:** Paddle birkaç kez yeniden dener, bu sürede avantajların sürer; ödeme yöntemini güncellemeyi unutma.\n• **Ödedim ama planım açılmadı:** [Fiyatlandırma](/plans) sayfasında \"Ödememi kontrol et\"e bas; ödeme Paddle'dan doğrulanır ve plan açılır. Yeniden ödeme yapma: ödeme işlenirken ikinci bir satın alma zaten engellenir.\n• **Kupon:** [Fiyatlandırma](/plans) sayfasında \"Kupon kodun var mı?\" alanına yazılıp Uygula'ya basılır (ödeme ekranındaki \"İndirim ekle\" ile de girilebilir); kuponun hangi planda ve kaç ödemede geçerli olduğu uygulanınca yazılır. Kuponlar yeni aboneliklerde geçerlidir; mevcut aboneliğe ya da plan değişikliğine uygulanmaz.\n• **Hesabı silmek** aboneliği hemen iptal eder; iade hakkın varsa önce iade iste.\nAyrıntılar: [İade Politikası](/refund-policy) ve [Kullanım Şartları](/terms-of-use#paid-services).",
            EN: "You manage your subscription on the [Plans](/plans) page:\n• **Manage subscription:** opens Paddle's customer portal, where you can update your payment method, download invoices and cancel. You can also cancel at paddle.net.\n• **Cancelling:** takes effect at the end of the period you paid for; your benefits last until then, after which you move to the Free plan. You can undo it before the period ends, and your projects aren't deleted.\n• **Changing plans:** switch between Plus and Pro or between monthly and yearly billing; the difference is prorated and shown before you confirm.\n• **Refunds:** a full refund without giving a reason within 14 days of the first payment. Renewal payments are refunded within 14 days if your cancellation wasn't processed, the charge was a mistake, or you couldn't use the plan because of a problem caused by us. Ask at paddle.net or with a [support ticket](/feedback) in the Request category; the money usually returns to your payment method within 5–10 business days.\n• **Failed payments:** Paddle retries a few times and your benefits continue meanwhile; remember to update your payment method.\n• **Paid but the plan didn't switch:** press \"Check my payment\" on the [Pricing](/plans) page; the payment is confirmed with Paddle and the plan unlocks. Don't pay again: a second purchase is blocked while a payment is being processed.\n• **Coupons:** on the [Pricing](/plans) page press \"Have a coupon code?\", enter it and press Apply (it also works with \"Add discount\" at checkout); which plan and how many payments it covers is shown once it's applied. Coupons apply to new subscriptions, not to an existing one or to plan changes.\n• **Deleting your account** cancels the subscription at once; if you are entitled to a refund, ask for it first.\nDetails: [Refund Policy](/refund-policy) and [Terms of Use](/terms-of-use#paid-services).",
        },
        keywords: "abonelik subscription yönet manage iptal cancel iade refund para iadesi money back fatura invoice makbuz receipt paddle paddle.net ödeme payment kart card yenileme renewal kupon coupon indirim discount plan değiştir change plan yükselt upgrade düşür downgrade ödeme alınamadı failed payment",
        links: [L.plans, L.refunds],
    },
    {
        id: "apps",
        intents: ["apps"],
        title: { TR: "Masaüstü ve mobil uygulamalar", EN: "Desktop and mobile apps" },
        body: {
            TR: "Ana sayfadaki **İndir** menüsü, GitHub Releases'teki doğrulanmış sürümlere (Windows, Linux, Android) bağlanır. Uygulamalar web sitesinin aynısını açar; güncellemeler web ile birlikte gelir. Yalnızca resmi sürüm sayfasından indir.",
            EN: "The **Download** menu on the home page links to verified builds on GitHub Releases (Windows, Linux, Android). The apps open the same site and update with it. Only download from the official release page.",
        },
        keywords: "uygulama app masaüstü desktop mobil mobile android ios windows linux indir download apk exe",
    },
];

/** Text of a copy in Turkish or English with its {placeholders} filled (search index and language model). */
export function knowledgeText(copy: Copy, turkish: boolean): string {
    const text = turkish ? copy.TR : copy.EN;
    const vars = copy.vars;
    return vars ? text.replace(/\{([a-zA-Z0-9_]+)\}/g, (match, name: string) => (name in vars ? String(vars[name]) : match)) : text;
}

function blockText(block: Block): Copy[] {
    switch (block.type) {
        case "p": return [block.text];
        case "list":
        case "steps": return block.items;
        case "tip": return [block.title, block.text];
        case "item": return [block.name, block.text];
        case "keys": return block.items.map((item) => item.text);
        default: return [];
    }
}

let cachedKnowledge: KnowledgeEntry[] | null = null;

/** Curated entries + FAQ + guide pages. */
export function allKnowledge(): KnowledgeEntry[] {
    if (cachedKnowledge) return cachedKnowledge;
    const faq: KnowledgeEntry[] = FAQS.map((entry) => ({
        id: `faq:${entry.id}`,
        intents: [],
        title: entry.question,
        body: entry.answer,
        keywords: `${entry.category.TR} ${entry.category.EN}`,
        links: [L.feedback],
    }));
    const guide: KnowledgeEntry[] = [];
    PAGES.forEach((page, index) => {
        if (!page.title) return;
        const parts = page.blocks.flatMap(blockText);
        if (!parts.length) return;
        const chapter = CHAPTERS.find((entry) => entry.id === page.chapter);
        guide.push({
            id: `guide:${index}`,
            intents: [],
            title: page.title,
            // The joined body is plain text for search and the model, so placeholders are filled here.
            body: { TR: parts.map((part) => `• ${knowledgeText(part, true)}`).join("\n"), EN: parts.map((part) => `• ${knowledgeText(part, false)}`).join("\n") },
            keywords: chapter ? `${chapter.title.TR} ${chapter.title.EN}` : undefined,
            parts,
            links: [L.guide],
        });
    });
    cachedKnowledge = [...CURATED_KNOWLEDGE, ...faq, ...guide];
    return cachedKnowledge;
}

/** Plain text of an entry for retrieval (both languages). */
export function knowledgeSearchText(entry: KnowledgeEntry) {
    const title = `${knowledgeText(entry.title, true)} ${knowledgeText(entry.title, false)}`;
    return `${title} ${title} ${entry.keywords ?? ""} ${knowledgeText(entry.body, true)} ${knowledgeText(entry.body, false)}`;
}
