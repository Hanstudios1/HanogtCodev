// Hanogt AI text processing. Plain ESM (no TypeScript, no path aliases) so the
// browser engine, the /api/ai route and scripts/train-hanogt-ai.mjs share the
// exact same normalization and features — a trained model is only valid with
// the feature extractor it was trained with (see FEATURE_VERSION).

export const FEATURE_VERSION = 4;

/**
 * Lower-cases with Turkish rules (I → ı, İ → i), strips diacritics, turns
 * apostrophes and punctuation into spaces. Keeps letters of every script,
 * digits and the characters of "c#", "c++" and "f#".
 * @param {string} text
 * @returns {string}
 */
export function normalize(text) {
    return String(text ?? "")
        .toLocaleLowerCase("tr")
        .normalize("NFKD")
        .replace(/[̀-ͯ]/g, "")
        .replace(/ı/g, "i")
        .replace(/[^\p{L}\p{N}#+]+/gu, " ")
        .replace(/(^|\s)[#+]+(?=\s|$)/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

/**
 * @param {string} text
 * @returns {string[]}
 */
export function tokenize(text) {
    const normalized = normalize(text);
    return normalized ? normalized.split(" ") : [];
}

/**
 * Prefix stemming: the first five characters of a word are a strong stem for
 * agglutinative Turkish ("parolamı", "parolanın" → "parol") and work well
 * enough for English ("passwords" → "passw").
 * @param {string} token
 * @returns {string}
 */
export function stem(token) {
    return token.length > 5 ? token.slice(0, 5) : token;
}

const STOPWORDS = new Set([
    // Turkish
    "ve", "ile", "bir", "bu", "su", "o", "da", "de", "mi", "mu", "mii", "ne", "icin", "gibi", "ama", "veya", "ya", "ki", "cok", "daha",
    "en", "ben", "sen", "biz", "siz", "onlar", "benim", "senin", "nasil", "neden", "nerede", "hangi", "mı", "var", "yok", "olan", "olarak",
    "ise", "diye", "her", "hem", "kadar", "sonra", "once", "simdi", "lutfen", "acaba", "bana", "sana", "beni", "seni", "şu",
    // English
    "the", "a", "an", "and", "or", "of", "to", "in", "on", "for", "with", "is", "are", "was", "were", "be", "it", "this", "that", "i",
    "you", "me", "my", "your", "do", "does", "can", "could", "would", "should", "how", "what", "why", "where", "which", "please", "at",
    "as", "by", "from", "about", "into", "so", "if", "then", "there", "their", "we", "our", "us", "am", "have", "has", "will",
]);

/**
 * Content terms for retrieval (BM25): stems without stop words.
 * @param {string} text
 * @returns {string[]}
 */
const SHORT_TERMS = new Set(["c", "r", "d", "go", "js", "ts", "ai", "ui", "db", "os", "id", "c#", "f#", "c++", "3d", "2d", "ip", "pc"]);

export function terms(text) {
    // Turkish suffixes after an apostrophe ("javascript'te") become 1–2 letter tokens; they only add noise.
    return tokenize(text).filter((token) => (token.length > 2 || SHORT_TERMS.has(token)) && !STOPWORDS.has(token)).map(stem);
}

// Small multilingual concept lexicon: synonyms (Turkish, English and a few
// other languages) map to shared concept tags, so "takım oluştur", "create a
// team" and "создай группу" all light up create + group. Entries ending in
// "=" match whole words; the others match word prefixes (Turkish suffixes).
// Words are written in normalize()d form or are normalized when indexed.
const CONCEPT_LEXICON = {
    create: "olustur kur= kurar= kursana= kuralim= kurmak= kurabil kurun= kurul yarat yap= yapar= yapsana= yapalim= yapabil yapmak= yapin= yapil hazirla baslat create make= makes= build set= setup start= spin= erstell grund crea= crear cria= criar cree= creer cre= созда yarad duzelt fammi faca= hazme",
    open: "ac= acar= acsana= acin= acabil acmak= acilir open launch offne abre= abrir ouvre= ouvrir откр apri= apre",
    show: "goster show display zeig muestra montre покаж mostra mostre",
    go: "git= gidelim gidin= gotur gec= gecelim go= take= navigate bring= head= ir= vai= va= aller gehe geh= перейд kec=",
    write: "yaz= yazar= yazsana= yazabil yazmak= yazin= yazip= yazarmisin kodla write writes= escribe ecris напиш schreib scrivi escreva escrev",
    remove: "sil= silin= siler= silebil silmek silsene kaldir delete remove erase wipe losch borra supprim удал",
    change: "degistir guncelle duzenle change update edit= edits= editing= modify andern cambi modifi измен",
    question: "nasil how nerede nereden where hangi which neden niye why nedir what wie como comment как nece qual mi= mu= midir",
    request: "misin= musun= misiniz= musunuz= can= could= would= please= lutfen= rica",
    want: "istiyorum isterim istiyoruz want wanna need lazim gerek mochte quiero veux хочу",
    self: "benim= bana= beni= kendim my= me= mine= myself mein= meine= mio= mon= мой мне я= mənim miyim= muyum= miyiz= ich= bin= je= suis= soy= sou=",
    count: "kac= sayi istatistik stats statistic count viele cuant сколько",
    group: "grup grub ekip takim team group kulup club topluluk community gruppe grupo groupe групп qrup gruppo",
    profile: "profil profile kullanici username takma nickname etiket tag= biyografi bio= hakkimda rozet badge perfil профил",
    account: "hesap= hesaplar= hesab account uyelik konto cuenta compte аккаунт",
    project: "proje project projekt proyecto projet проект layih",
    role: "rol= rolu rolum rolun roller= role= roles= rutbe",
    calc: "hesapla calculat compute rechne calcul calcola считай",
    game: "oyun oyn= game games platform shooter nisanci breakout tugla mario spiel juego jeu= jogo игр gioco",
    engine: "motor engine unity sahne scene sprite prefab rigidbody tilemap collider monobehaviour",
    code: "kod code= codes program script fonksiyon function python javascript typescript java= c# c++ cpp csharp html css rust golang kotlin php ruby swift sql lua",
    editor: "editor ide= monaco sekme tab= dosya file редактор",
    page: "sayfa page ekran screen seite pagina страниц",
    news: "haber news akis arena noticia actualit новост xeber",
    friends: "arkadas friend dost= amigo ami= amis= freund друз друг",
    messages: "mesaj message dm= sohbet chat mensaje сообщ",
    media: "media medya",
    publish: "yayinla yayin paylas share publish lisans license veroffentlich publica publier опублик",
    arcade: "arcade remix remiks",
    settings: "ayar setting tercih preference einstellung ajuste parametre настрой",
    security: "guvenlik security sicherheit segurid securit безопас təhlükəsiz",
    password: "sifre parola password passwort contrasena пароль parol",
    twofa: "2fa totp authenticator dogrulama dogrulayici",
    support: "destek support talep ticket iletisim contact kundendienst soporte поддерж helpdesk musteri atencion dəstək",
    feedback: "feedback oneri suggestion sss= faq",
    admin: "yonetici admin moderator staff yetkili audit denetim personel админ модератор",
    agent: "ajan agent izin permission onay otomatik automatic",
    error: "hata error exception traceback ошибк xeta",
    greet: "merhaba selam hello hi= hey= hola bonjour hallo привет здравств gunaydin naber salam greetings guten= buenos= buenas= ciao= ola= olá= salut= こんにち おはよう こんばん 你好 안녕하세요 안녕= नमस् namaste salve= servus czesc szia coucou bonsoir hej= ahoj moin= yo= sa= selamun aleykum nasilsin keyifler مرحبا",
    thanks: "tesekkur sagol sag= saol eyw= tsk= tsm= thanks thank thx ty= tysm= tyvm= appreciat danke gracias merci mersi спасибо благодар eyvallah minnettar grazie obrigad dziek koszon شكرا ありがとう 谢谢 감사 고마워 धन्यवाद cheers",
    bye: "gorusuruz gorusuru görüşərik hosca bye goodbye tschus adios adeus addio пока увидим свидан встреч прощай bay= baybay ci= bis= arrivederci a= tchau さようなら 再见 안녕히 अलविदा وداع cikmam gitmem kactim kacar farewell adieu later= cya= wiedersehen demain bientot prochaine uykular leaving selametle emanet",
    who: "kimsin kimsiniz ismin adin= sen= you= heisst heiß llamas quien eres= nom= nome= chiami appelles quem= зовут имя кто اسمك من= hitap seslen yasindasin nerelisin",
    joke: "saka fikra espri joke pun= witz chiste blague шутк анекдот zarafat barzellett piada komik funny laugh gulmek guldur",
    call: "arama= aramak ara= sesli call= calls calling voice video mikrofon microphone kulaklik headphone headset unmute webrtc turn= звон llamada appel= anruf zeng zəng duymuyor= duyamiyorum= duyamiyor=",
    run: "calistir calisti run= runs= execute output cikti girdi input stdin konsol console derle compile timeout",
    math: "sin= cos= tan= log= sqrt karekok kok= ussu us= carpi bolu arti eksi plus= minus= times= divided mod= yuzde percent pi= faktoriyel",
    hack: "hack calindi calinmis calin gecirildi gecirdi takeover compromis stolen stole suspicious supheli yabanci kurtar recover entro pirat взлом gehackt izinsiz unauthori gestohlen robar компромет tanimadigim unrecogni",
    link: "link baglanti url= site= scam dolandir olta phish sahte fake nitro robux vbucks elmas= hediye gift spam",
    lang: "dil= dili= dilini= diller arayuz language languages translat ceviri turkce ingilizce english= turkish arabic arapca sprache idioma langue язык",
    theme: "tema theme karanlik koyu dark= light= gece night parlak bright sombre oscuro dunkel темн qaranliq",
    price: "fiyat ucret ucretsiz bedava para= price cost free= pay= paid subscription abonelik premium kostenlos gratis gratuit precio prix цена бесплат pulsuz тариф стоит cuesta coute",
    dashboard: "panel= panele panelim dashboard",
    faq: "sss= faq sik= sikca",
    forgot: "unuttum unutmus unuttu hatirlamiyorum forgot forget vergessen olvid oubli забыл unutdum",
    privacy: "gizlilik privacy kvkk gdpr kisisel personal personnel donnees datos= datenschutz privacidad confidential конфиденц персональн mexfilik konum location",
    editorui: "minimap autosave font= yazi= zip= snippet parcacik format bicimlendir satir line= wrap komut= palet palette sekme",
    behalf: "yerime adima behalf kart= card onay confirm",
    download: "indir= indirme indiril indirebil indirmek indirip download descarg telecharg скача herunterlad",
    login: "giris= girisi girise giremiyorum giremedim giremiyor login logged signin oturum anmeld iniciar entrar= войти connexion daxil kaydol",
    ban: "ban= banned banlan banlandi yasak askiya askida suspend uzaklastir engellendi kapatildi",
    vuln: "zafiyet acigi aciklari xss sqli injection vulnerab bounty exploit csrf pentest sizma",
    cookie: "cerez cookie galleta куки",
    app: "uygulama app= apps= android ios= iphone mobil mobile masaustu desktop pwa",
    save: "kaydet kayded save= saved saving speicher guardar enregistr сохран",
    ads: "reklam ads= advert",
    // Everyday topics outside Hanogt: strong hints for "unknown".
    weather: "hava= havada weather wetter clima meteo погод yagmur yagacak yagar gunesli bulutlu rain= raining snow= sunny cloudy forecast",
    food: "yemek tarif recipe receta recette rezept pizza makarna lazanya lasagna kek= cake corba pilav manti kahvalti breakfast dinner restoran restaurant pisir cook= cooking",
    money: "borsa bitcoin kripto crypto ethereum dolar euro gold= stock= hisse yatirim invest maas salary vergi tax= kira= rent= emeklilik retirement piyango lottery loto iddaa",
    health: "saglik hastalik hasta= ilac doktor doctor medicine agri= agrisi agriyor ates= atesim grip= flu= fever headache toothache diyet diet kilo= workout egzersiz exercise muscle kas= uyku uykum meditasyon meditation stres stress",
    sport: "spor= mac= maci macin futbol football soccer basketbol basketball nba= fenerbahce galatasaray besiktas messi ronaldo lig= league",
    travel: "tatil vacation holiday otel hotel ucak= ucus flight seyahat travel gezi gezilecek taksi taxi uber= otobus trafik traffic",
    music: "sarki muzik music song= songs spotify radyo radio konser concert",
    school: "odev odevi odevim homework sinav exam= universite college",
    love: "ask= sevgili sevgilim girlfriend boyfriend evlen married relationship iliski",
    astro: "burc burcum horoscope zodiac tarot fal= ruya ruyamda dream",
    animal: "kedi kopek kopegim dog= cat= aslan zurafa animal hayvan",
    film: "film movie netflix anime",
    science: "atom= atomu dna= fotosentez photosynthesis gezegen planet evren universe galaksi galaxy kara= delik black= hole= einstein ataturk imparator empire savas war= nehir river dag= mountain okyanus ocean baskent capital nufus population iklim climate volkan volcano deprem earthquake dinozor dinosaur evrim evolution felsefe philosoph fizik physics kimya chemistry biyoloji biology siyaset politic ekonomi economy enflasyon inflation baskan president basbakan minister",
    device: "yazici printer modem router wifi kombi boiler sarj battery",
    social: "instagram youtube tiktok twitter takipci follower whatsapp facebook",
    time: "몇=",
};
const CONCEPT_PHRASES = [
    [/\bgeri bildirim/, "feedback"], [/\b(?:two factor|iki adimli|iki asamali)\b/, "twofa"], [/\b(?:how many|kac tane)\b/, "count"],
    [/\bset up\b/, "create"], [/\btake me\b/, "go"], [/\b(?:yapay zeka|ai)\b/, "ai"], [/\btake care\b/, "bye"],
    [/\b(?:who are you|your name|adin ne)\b/, "who"], [/\bsik sorulan\b/, "faq"], [/\bgotta go\b/, "bye"],
    [/\b(?:how old are you|where are you from|are you (?:married|real|human|a bot|an ai))\b/, "who"],
    [/\b(?:how (?:are|r) (?:you|u)|ne haber|nice to meet you|good to see you|(?:are you|anybody|anyone) there|(?:kimse|biri) var mi)\b/, "greet"],
    [/\b(?:see (?:you|ya)|(?:until|till) next time|signing off|log(?:ging)? off|good ?night|night night|sleep well|that s all for now|have a (?:nice|great|good) (?:day|evening|weekend))\b/, "bye"],
    [/\b(?:gorusmek uzere|ate logo|ate mais|ate breve|a plus tard|a plus|hasta la vista)\b/, "bye"], [/\bgood (?:morning|afternoon|evening)\b/, "greet"],
    [/\b(?:talk|speak) (?:to you )?(?:later|soon|tomorrow)\b/, "bye"], [/\b(?:sonra|yarin) (?:konusuruz|konusalim|yazarim|gorusuruz)\b/, "bye"],
    [/\b(?:cikiyorum|gidiyorum|kaciyorum|gitme vakti)\b/, "bye"], [/\b(?:a demain|a bientot|a la prochaine|hasta (?:luego|manana|pronto))\b/, "bye"],
    [/(?:^|\s)до (?:скорого|завтра|встречи|свидания)(?:\s|$)/, "bye"], [/مع السلامة/, "bye"],
    [/\b(?:customer (?:service|support)|help desk|(?:real|live) (?:person|human|agent)|gercek bir kisi\w*|insanla konus\w*|servicio al cliente)\b/, "support"],
    [/\b(?:kac (?:lira|dolar|tl|para)|how much)\b/, "price"],
    [/\b(?:disa aktar\w*|export\w*)\b/, "download"], [/\byazi tipi\b/, "editorui"],
    [/\b(?:saat kac|saat ne|what time is it|what s the time|what day is it|bugun gunlerden|ayin kaci|que horas|que hora|quelle heure|wie spat|che ore)\b/, "time"],
    // Patterns see normalize()d text: "который" loses its breve, Hangul is decomposed (see the "time" words above).
    [/何時|الساعة|которы\S* час/, "time"],
];

// Turkish marks "my" with a suffix: grubum, projemi, hesabımda, rolüm.
const POSSESSIVE_TARGETS = new Set(["group", "profile", "account", "project", "friends", "messages", "game", "role", "code", "media", "password"]);
const MY_SUFFIX = /^(?:lar|ler)?(?:i|u)?m(?:i|u|a|e|da|de|dan|den|in|un|iz|izi|uz|uzu)?$/;

let conceptIndex = null;
function conceptLexicon() {
    if (conceptIndex) return conceptIndex;
    const exact = new Map();
    const prefixes = new Map();
    for (const [concept, words] of Object.entries(CONCEPT_LEXICON)) {
        for (const raw of words.split(/\s+/)) {
            const word = normalize(raw.replace(/=$/, ""));
            if (!word) continue;
            if (raw.endsWith("=")) {
                exact.set(word, [...(exact.get(word) ?? []), concept]);
            } else {
                const key = word.slice(0, 2);
                prefixes.set(key, [...(prefixes.get(key) ?? []), [word, concept]]);
            }
        }
    }
    conceptIndex = { exact, prefixes };
    return conceptIndex;
}

/**
 * Concept tags of a text (sorted), e.g. "React çalışma grubu kur" → ["create", "group"].
 * @param {string} text
 * @returns {string[]}
 */
export function concepts(text) {
    const { exact, prefixes } = conceptLexicon();
    const found = new Set();
    const normalized = normalize(text);
    for (const token of normalized ? normalized.split(" ").slice(0, 64) : []) {
        for (const concept of exact.get(token) ?? []) found.add(concept);
        for (const [prefix, concept] of prefixes.get(token.slice(0, 2)) ?? []) {
            if (!token.startsWith(prefix)) continue;
            found.add(concept);
            if (POSSESSIVE_TARGETS.has(concept) && token.length > prefix.length && MY_SUFFIX.test(token.slice(prefix.length))) found.add("self");
        }
    }
    for (const [pattern, concept] of CONCEPT_PHRASES) if (pattern.test(normalized)) found.add(concept);
    // "hesap makinesi" is a calculator, not an account.
    if (/\bhesap makin/.test(normalized)) {
        found.add("calc");
        if (!/\bhesab/.test(normalized)) found.delete("account");
    }
    if (/[?？؟]/.test(String(text ?? ""))) found.add("question");
    return [...found].sort();
}

/**
 * Classifier features (version 3): words, 5-character stems, stem bigrams,
 * in-word character trigrams (robust against typos and suffixes), the
 * first and last stem (Turkish puts the verb last: "grup kur" vs "grup nasıl
 * kurulur"), concept tags and concept pairs from the lexicon above, and the
 * script/shape of the text (digits, operators, codes, non-Latin scripts, length).
 * @param {string} text
 * @returns {string[]}
 */
export function features(text) {
    const raw = String(text ?? "");
    const tokens = tokenize(raw).slice(0, 64);
    const out = [];
    const stems = tokens.map(stem);
    for (let index = 0; index < tokens.length; index += 1) {
        const token = tokens[index];
        out.push(`w:${token}`);
        if (stems[index] !== token) out.push(`s:${stems[index]}`);
        if (index + 1 < tokens.length) out.push(`b:${stems[index]}_${stems[index + 1]}`);
        if (token.length >= 3) {
            const padded = `<${token}>`;
            for (let start = 0; start + 3 <= padded.length && start < 14; start += 1) out.push(`c3:${padded.slice(start, start + 3)}`);
        }
    }
    if (tokens.length) {
        out.push(`f:${stems[0]}`);
        out.push(`e:${stems[stems.length - 1]}`);
    } else {
        out.push("empty");
    }
    // Script and shape: digits and operators (arithmetic), letter+digit codes (CS0103), non-Latin scripts, length.
    if (/\d/.test(raw)) out.push(/[+\-*/^%×÷=]/.test(raw) ? "x:arith" : "x:digit");
    if (/(?=[^\s]*\d)(?=[^\s]*[a-z])[a-z0-9]{3,}/i.test(raw)) out.push("x:code");
    if (/[\u0400-\u04ff]/.test(raw)) out.push("x:cyrillic");
    if (/[\u0600-\u06ff]/.test(raw)) out.push("x:arabic");
    if (/[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/.test(raw)) out.push("x:cjk");
    out.push(`n:${Math.min(tokens.length, 5)}`);
    const tags = concepts(raw);
    // Concept tags are emitted twice (k: and K:) so these few, meaningful
    // features weigh about as much as the many character n-grams of a word.
    if (!tags.length) out.push("k:none");
    for (let a = 0; a < tags.length; a += 1) {
        out.push(`k:${tags[a]}`, `K:${tags[a]}`);
        for (let b = a + 1; b < tags.length; b += 1) out.push(`kk:${tags[a]}+${tags[b]}`, `KK:${tags[a]}+${tags[b]}`);
    }
    return out;
}

/**
 * 32-bit FNV-1a.
 * @param {string} value
 * @returns {number}
 */
export function fnv1a(value) {
    let hash = 0x811c9dc5;
    for (let index = 0; index < value.length; index += 1) {
        hash ^= value.charCodeAt(index);
        hash = Math.imul(hash, 0x01000193);
    }
    return hash >>> 0;
}

/**
 * Hashed, de-duplicated feature buckets of a text.
 * @param {string} text
 * @param {number} bits
 * @returns {number[]}
 */
export function featureBuckets(text, bits) {
    const mask = (1 << bits) - 1;
    const seen = new Set();
    for (const feature of features(text)) seen.add(fnv1a(feature) & mask);
    return [...seen];
}

/**
 * Softmax over logits.
 * @param {number[]} logits
 * @returns {number[]}
 */
export function softmax(logits) {
    const max = Math.max(...logits);
    const exps = logits.map((value) => Math.exp(value - max));
    const sum = exps.reduce((total, value) => total + value, 0);
    return exps.map((value) => value / sum);
}

/**
 * Decodes base64 into bytes (browser + Node).
 * @param {string} base64
 * @returns {Uint8Array}
 */
export function decodeBytes(base64) {
    if (typeof atob === "function") {
        const binary = atob(base64);
        const out = new Uint8Array(binary.length);
        for (let index = 0; index < binary.length; index += 1) out[index] = binary.charCodeAt(index);
        return out;
    }
    return new Uint8Array(Buffer.from(base64, "base64"));
}

/**
 * Decodes a base64 string of signed 8-bit weights (browser + Node).
 * @param {string} base64
 * @returns {Int8Array}
 */
export function decodeInt8(base64) {
    const bytes = decodeBytes(base64);
    return new Int8Array(bytes.buffer, bytes.byteOffset, bytes.length);
}

/** @param {string | Uint8Array} value */
function bytesOf(value) {
    return typeof value === "string" ? decodeBytes(value) : value;
}

/**
 * Turns the stored weight table into a bucket → row index plus flat typed
 * arrays. Rows are listed by bucket id (LEB128 varint deltas in `index`) and
 * each has a scale code (row scale = scale × 2^((code − 128) / scaleSteps)).
 * The weights come in one of two layouts:
 * • masks + values (format 3): a bitmask of the labels each row has
 *   (ceil(labels / 8) bytes) and one int8 per set bit, in label order;
 * • counts + pairs (format 2, base64 in JSON): the number of entries per row
 *   and [label, int8 weight] byte pairs.
 * @param {{ labels: string[], index: string | Uint8Array, scales: string | Uint8Array, scale: number, scaleSteps?: number, masks?: Uint8Array, values?: Uint8Array, counts?: string | Uint8Array, pairs?: string | Uint8Array }} model
 */
function decodeCompact(model) {
    const index = bytesOf(model.index);
    const codes = bytesOf(model.scales);
    const steps = model.scaleSteps || 8;
    const rowCount = codes.length;
    const offsets = new Uint32Array(rowCount + 1);
    let labels;
    let weights;
    if (model.masks && model.values) {
        const maskBytes = Math.ceil(model.labels.length / 8);
        const masks = model.masks;
        const values = model.values;
        labels = new Uint8Array(values.length);
        weights = new Int8Array(values.length);
        let entry = 0;
        for (let row = 0; row < rowCount; row += 1) {
            const at = row * maskBytes;
            for (let label = 0; label < model.labels.length; label += 1) {
                if (!(masks[at + (label >> 3)] & (1 << (label & 7)))) continue;
                labels[entry] = label;
                weights[entry] = (values[entry] << 24) >> 24;
                entry += 1;
            }
            offsets[row + 1] = entry;
        }
    } else {
        const counts = bytesOf(/** @type {string | Uint8Array} */ (model.counts));
        const pairs = bytesOf(/** @type {string | Uint8Array} */ (model.pairs));
        labels = new Uint8Array(pairs.length / 2);
        weights = new Int8Array(pairs.length / 2);
        for (let pair = 0; pair < labels.length; pair += 1) {
            labels[pair] = pairs[pair * 2];
            weights[pair] = (pairs[pair * 2 + 1] << 24) >> 24;
        }
        for (let row = 0; row < rowCount; row += 1) offsets[row + 1] = offsets[row] + counts[row];
    }
    const rows = new Map();
    const rowScales = new Float64Array(rowCount);
    let position = 0;
    let bucket = 0;
    for (let row = 0; row < rowCount; row += 1) {
        let delta = 0;
        let shift = 0;
        for (;;) {
            const byte = index[position++];
            delta += (byte & 0x7f) * 2 ** shift;
            if (byte < 0x80) break;
            shift += 7;
        }
        bucket += delta;
        rows.set(bucket, row);
        rowScales[row] = model.scale * 2 ** ((codes[row] - 128) / steps);
    }
    return { rows, offsets, rowScales, labels, weights };
}

export const MODEL_MAGIC = "HAIM";

/**
 * Model format 3, the file the browser downloads: "HAIM", a version byte
 * (3), three reserved bytes, the byte length of a UTF-8 JSON header (uint32,
 * little-endian), the header (labels, bias, scales and `blobs`: the name and
 * byte length of each binary part, in file order) and then those parts. A
 * third the size of format 2's base64 pairs, decoded without string copies.
 * @param {ArrayBuffer | Uint8Array} data
 */
export function decodeModelBinary(data) {
    const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
    const magic = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
    if (bytes.length < 12 || magic !== MODEL_MAGIC || bytes[4] !== 3) throw new Error("Not a Hanogt AI model file");
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const headerLength = view.getUint32(8, true);
    const header = JSON.parse(new TextDecoder().decode(bytes.subarray(12, 12 + headerLength)));
    // An older or unknown layout must fail loudly: scoring with the bias alone would look like a model.
    if (!Array.isArray(header.blobs)) throw new Error("Unsupported Hanogt AI model layout");
    /** @type {Record<string, Uint8Array>} */
    const parts = {};
    let offset = 12 + headerLength;
    for (const [name, length] of header.blobs) {
        const part = bytes.subarray(offset, offset + length);
        if (part.length !== length || !/^[a-z]+$/.test(name)) throw new Error("Truncated Hanogt AI model file");
        parts[name] = part;
        offset += length;
    }
    if (!parts.index || !parts.scales || !((parts.masks && parts.values) || (parts.counts && parts.pairs))) throw new Error("Unsupported Hanogt AI model layout");
    return { ...header, ...parts };
}

/**
 * Builds a format 3 file (used by the trainer and tests).
 * @param {Record<string, unknown>} header
 * @param {Record<string, Uint8Array>} blobs in file order
 * @returns {Uint8Array}
 */
export function encodeModelBinary(header, blobs) {
    const entries = Object.entries(blobs);
    const json = new TextEncoder().encode(JSON.stringify({ ...header, blobs: entries.map(([name, part]) => [name, part.length]) }));
    const out = new Uint8Array(12 + json.length + entries.reduce((sum, [, part]) => sum + part.length, 0));
    for (let position = 0; position < 4; position += 1) out[position] = MODEL_MAGIC.charCodeAt(position);
    out[4] = 3;
    new DataView(out.buffer).setUint32(8, json.length, true);
    let offset = 12;
    for (const part of [json, ...entries.map(([, blob]) => blob)]) {
        out.set(part, offset);
        offset += part.length;
    }
    return out;
}

/**
 * Scores a text with a trained intent model (see scripts/train-hanogt-ai.mjs).
 * Formats 2 and 3 (compact blobs) are decoded once; format 1 (an object of
 * base64 rows with one global scale) is decoded lazily and cached on the model.
 * @param {{ bits: number, labels: string[], bias: number[], scale: number, scaleSteps?: number, version?: number, rows?: Record<string, string>, index?: string | Uint8Array, counts?: string | Uint8Array, scales?: string | Uint8Array, pairs?: string | Uint8Array, masks?: Uint8Array, values?: Uint8Array, featureVersion?: number, threshold?: number, _cache?: Map<number, Int8Array | null>, _compact?: ReturnType<typeof decodeCompact> }} model
 * @param {string} text
 * @returns {Array<{ label: string, probability: number }>}
 */
export function classify(model, text) {
    const buckets = featureBuckets(text, model.bits);
    const logits = model.bias.slice();
    const norm = 1 / Math.sqrt(Math.max(1, buckets.length));
    if (model.index !== undefined && model.scales !== undefined && ((model.counts !== undefined && model.pairs !== undefined) || (model.masks !== undefined && model.values !== undefined))) {
        if (!model._compact) model._compact = decodeCompact(/** @type {Parameters<typeof decodeCompact>[0]} */ (model));
        const { rows, offsets, rowScales, labels, weights } = model._compact;
        for (const bucket of buckets) {
            const row = rows.get(bucket);
            if (row === undefined) continue;
            const factor = rowScales[row] * norm;
            for (let pair = offsets[row]; pair < offsets[row + 1]; pair += 1) logits[labels[pair]] += weights[pair] * factor;
        }
    } else {
        if (!model._cache) model._cache = new Map();
        const factor = model.scale * norm;
        for (const bucket of buckets) {
            let row = model._cache.get(bucket);
            if (row === undefined) {
                const encoded = model.rows?.[bucket];
                row = encoded ? decodeInt8(encoded) : null;
                model._cache.set(bucket, row);
            }
            if (!row) continue;
            // Rows are sparse: [label, weight, label, weight, …] as signed bytes.
            for (let index = 0; index + 1 < row.length; index += 2) logits[row[index]] += row[index + 1] * factor;
        }
    }
    const probabilities = softmax(logits);
    return model.labels
        .map((label, index) => ({ label, probability: probabilities[index] }))
        .sort((a, b) => b.probability - a.probability);
}

/**
 * Small BM25 index over documents made of one or more text fields.
 */
export class Bm25Index {
    /**
     * @param {Array<{ id: string, text: string, boost?: number }>} documents
     * @param {{ k1?: number, b?: number }} [options]
     */
    constructor(documents, options = {}) {
        this.k1 = options.k1 ?? 1.2;
        this.b = options.b ?? 0.75;
        this.documents = documents.map((document) => {
            const tokens = terms(document.text);
            const frequencies = new Map();
            for (const token of tokens) frequencies.set(token, (frequencies.get(token) ?? 0) + 1);
            return { id: document.id, boost: document.boost ?? 1, length: tokens.length, frequencies };
        });
        this.averageLength = this.documents.reduce((sum, document) => sum + document.length, 0) / Math.max(1, this.documents.length);
        this.documentFrequency = new Map();
        for (const document of this.documents) for (const token of document.frequencies.keys()) this.documentFrequency.set(token, (this.documentFrequency.get(token) ?? 0) + 1);
    }

    /**
     * @param {string} term
     */
    idf(term) {
        const count = this.documentFrequency.get(term) ?? 0;
        return Math.log(1 + (this.documents.length - count + 0.5) / (count + 0.5));
    }

    /**
     * @param {string} query
     * @param {number} [limit]
     * @returns {Array<{ id: string, score: number, matched: number, coverage: number }>}
     */
    search(query, limit = 5) {
        const queryTerms = [...new Set(terms(query))];
        if (!queryTerms.length) return [];
        const results = [];
        for (const document of this.documents) {
            let score = 0;
            let matched = 0;
            for (const term of queryTerms) {
                const frequency = document.frequencies.get(term);
                if (!frequency) continue;
                matched += 1;
                const denominator = frequency + this.k1 * (1 - this.b + (this.b * document.length) / Math.max(1, this.averageLength));
                score += this.idf(term) * ((frequency * (this.k1 + 1)) / denominator);
            }
            if (score > 0) results.push({ id: document.id, score: score * document.boost, matched });
        }
        return results.sort((a, b) => b.score - a.score).slice(0, limit).map((result) => ({ ...result, coverage: result.matched / queryTerms.length }));
    }
}
