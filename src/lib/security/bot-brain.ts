/**
 * Hanogt Security Bot "brain": deterministic intent matching (TR + EN) plus inline tools
 * (link check, code scan, secret warning). No message leaves the browser.
 */

import type { Copy } from "@/lib/i18n";
import { analyzeCode, containsSecret } from "./advisor";
import { checkLink, findUrl } from "./links";

export interface BotReply {
    text: Copy;
    /** Follow-up suggestions (topic ids). */
    suggestions: string[];
    topic?: string;
}

interface Topic {
    id: string;
    label: Copy;
    keywords: string[];
    answer: Copy;
    related: string[];
}

export const TOPICS: Topic[] = [
    {
        id: "password",
        label: { TR: "Parola güvenliği", EN: "Password security" },
        keywords: ["parola", "şifre", "sifre", "password", "hash", "scrypt", "bcrypt", "güçlü", "strong", "unuttum", "forgot"],
        answer: {
            TR: "**Parolalar açık metin olarak saklanmaz.** Sunucuda her parolaya benzersiz bir tuz eklenir ve **scrypt** ile tek yönlü karmalanır; kimlik bilgileri profil verisinden ayrı, tarayıcının erişemeyeceği bir koleksiyonda durur.\n• En az 12–16 karakter ve her sitede farklı parola kullan.\n• Parolanı **Güvenlik Merkezi → Parola Laboratuvarı**'nda ölçebilir, k-anonimlikle sızıntılarda arayabilirsin: [/security#password](/security#password)\n• Parolanı değiştirmek için Hesap Ayarları → Şifre Yönetimi.",
            EN: "**Passwords are never stored in plain text.** Each one gets a unique salt and is hashed one-way with **scrypt**; credentials live apart from profile data in a collection browsers cannot read.\n• Use 12–16+ characters and a different password per site.\n• Measure yours and check breaches with k-anonymity in **Security Center → Password Lab**: [/security#password](/security#password)\n• Change it in Account Settings → Password Management.",
        },
        related: ["twofa", "hacked", "phishing"],
    },
    {
        id: "twofa",
        label: { TR: "İki adımlı doğrulama", EN: "Two-factor auth" },
        keywords: ["2fa", "iki adım", "iki faktör", "two factor", "2 adım", "otp", "authenticator", "doğrulama kodu", "verification code"],
        answer: {
            TR: "Hanogt'ta şu an **ayrı bir iki adımlı doğrulama (2FA) seçeneği yok** — dürüst olalım. En güçlü yol: **Google ile giriş yapıp Google hesabında 2 adımlı doğrulamayı açmak.** E-posta/parola kullanıyorsan uzun ve benzersiz bir parola seç.\n• Kimse senden doğrulama kodu isteyemez; Hanogt ekibi de istemez.",
            EN: "Hanogt currently has **no separate two-factor (2FA) option** — to be honest. The strongest path: **sign in with Google and enable 2-step verification on your Google account.** With e-mail/password, use a long unique password.\n• No one should ask for your verification codes; the Hanogt team never will.",
        },
        related: ["password", "hacked"],
    },
    {
        id: "hacked",
        label: { TR: "Hesabım çalındı mı?", EN: "Was I hacked?" },
        keywords: ["çalındı", "calindi", "hacklendi", "hacked", "ele geçir", "ele gecir", "compromised", "şüpheli giriş", "suspicious login", "birisi girdi", "someone logged"],
        answer: {
            TR: "Sakin ol, adım adım gidelim:\n1. **Parolanı hemen değiştir** (Hesap Ayarları → Şifre Yönetimi). Google ile giriyorsan Google parolanı değiştir.\n2. Aynı parolayı kullandığın diğer sitelerde de değiştir.\n3. Projelerini, Media paylaşımlarını ve gruplarını tanımadığın değişikliklere karşı kontrol et.\n4. Geri Bildirim sayfasından **\"Güvenlik\"** başlığıyla bize yaz: [/feedback](/feedback)",
            EN: "Stay calm, step by step:\n1. **Change your password now** (Account Settings → Password Management). With Google sign-in, change your Google password.\n2. Change it anywhere you reused it.\n3. Check projects, Media posts and groups for changes you don't recognize.\n4. Write to us via Feedback titled **\"Security\"**: [/feedback](/feedback)",
        },
        related: ["password", "twofa", "report"],
    },
    {
        id: "phishing",
        label: { TR: "Oltalama ve sahte bağlantılar", EN: "Phishing & fake links" },
        keywords: ["oltalama", "phishing", "sahte", "fake", "link", "bağlantı", "baglanti", "dolandırıcı", "dolandirici", "scam", "nitro", "hediye", "gift", "tıkladım", "clicked"],
        answer: {
            TR: "Oltalama saldırıları seni acele ettirir: \"hesabın kapanacak\", \"hediye kazandın\" gibi.\n• Bağlantıyı bana **yapıştır**, yapısını hemen inceleyeyim (hiçbir yere istek atmam).\n• Ya da **Güvenlik Merkezi → Bağlantı Kontrolü**'nü kullan: [/security#links](/security#links)\n• Banka veya e-Devlet'e giderken adresi **kendin yaz**.",
            EN: "Phishing rushes you: \"your account will close\", \"you won a gift\".\n• **Paste** the link here and I'll inspect its structure right away (no request is made).\n• Or use **Security Center → Link Check**: [/security#links](/security#links)\n• Type your bank's or government portal's address **yourself**.",
        },
        related: ["password", "hacked"],
    },
    {
        id: "code-execution",
        label: { TR: "Kod çalıştırma", EN: "Code execution" },
        keywords: ["kod çalıştır", "kod calistir", "runner", "çalıştırıcı", "execute", "run", "piston", "wandbox", "sandbox", "izole", "isolated"],
        answer: {
            TR: "Kod yalnızca yöneticinin yapılandırdığı **izole bir çalıştırıcıda** süre, bellek ve ağ sınırlarıyla çalışır; herkese açık Piston/Wandbox gibi yedeklere düşülmez. Çalıştırıcı yoksa özellik güvenli biçimde kapalı kalır.\n• Her istek önce sunucuda **Hanogt Security** imzalarıyla taranır: ters kabuk, fork bomb, disk silme, kimlik bilgisi hırsızlığı, keylogger, kripto madenciliği, konteyner kaçışı…",
            EN: "Code runs only in an administrator-configured **isolated runner** with time, memory and network limits; there is no fallback to public services like Piston/Wandbox. Without a runner the feature stays safely off.\n• Every request is first screened on the server by **Hanogt Security** signatures: reverse shells, fork bombs, disk wipes, credential theft, keyloggers, cryptomining, container escapes…",
        },
        related: ["ban", "advisor"],
    },
    {
        id: "advisor",
        label: { TR: "Kodumu tara", EN: "Scan my code" },
        keywords: ["tara", "scan", "danışman", "danisman", "advisor", "açık", "vulnerab", "api key", "anahtar", "sql", "xss", "injection", "enjeksiyon", "kodum güvenli", "is my code"],
        answer: {
            TR: "Kodunu doğrudan buraya yapıştırabilirsin, özet bir rapor vereyim. Ayrıntılı analiz için **Güvenlik Merkezi → Kod Danışmanı**: [/security#advisor](/security#advisor)\n• 65+ kural: sızmış API anahtarları, SQL/komut enjeksiyonu, XSS, zayıf kripto, kapalı TLS doğrulaması, güvensiz deserialization, C bellek hataları…\n• Analiz tamamen tarayıcında yapılır.",
            EN: "Paste your code right here and I'll summarize the risks. For the full analysis open **Security Center → Code Advisor**: [/security#advisor](/security#advisor)\n• 65+ rules: leaked API keys, SQL/command injection, XSS, weak crypto, disabled TLS checks, unsafe deserialization, C memory bugs…\n• Analysis runs entirely in your browser.",
        },
        related: ["code-execution", "secrets"],
    },
    {
        id: "secrets",
        label: { TR: "API anahtarı sızdırdım", EN: "I leaked an API key" },
        keywords: ["sızdır", "sizdir", "leak", "token", "secret", "gizli anahtar", "github'a", "pushladım", "committed", "env", ".env"],
        answer: {
            TR: "Bir anahtar herkese açık bir yere (GitHub, Media, ekran görüntüsü) düştüyse **silmek yetmez, iptal etmen gerekir**:\n1. Sağlayıcının panelinden anahtarı **iptal et / yenile**.\n2. Yeni anahtarı kodda değil **ortam değişkeninde** tut (.env dosyasını paylaşma).\n3. Git geçmişinden de temizle; ama asıl koruma iptaldir.\n4. Kullanım/fatura kayıtlarını kontrol et.",
            EN: "If a key landed somewhere public (GitHub, Media, a screenshot) **deleting it isn't enough, revoke it**:\n1. **Revoke/rotate** it in the provider's dashboard.\n2. Keep the new key in an **environment variable**, not in code (don't share .env files).\n3. Clean Git history too, but revocation is what protects you.\n4. Review usage and billing logs.",
        },
        related: ["advisor", "hacked"],
    },
    {
        id: "ban",
        label: { TR: "Engellendim / itiraz", EN: "Blocked / appeal" },
        keywords: ["ban", "engel", "engellendi", "blocked", "itiraz", "appeal", "ceza", "yaptırım", "neden engellendi", "why blocked", "false positive", "yanlış alarm"],
        answer: {
            TR: "Otomatik bir eşleşme hesabını **kalıcı olarak kapatmaz**. Riskli istek anında durdurulur ve asgari bir denetim kaydı oluşur. Hesap yaptırımları orantılı incelemeyle verilir.\n• Yanlış alarm olduğunu düşünüyorsan Geri Bildirim'den **\"Güvenlik itirazı\"** gönder: [/feedback](/feedback)\n• Kodunu Kod Danışmanı'nda tarayıp hangi imzanın tetiklendiğini görebilirsin.",
            EN: "An automated match **never permanently closes** your account. The risky request is stopped and a minimal audit record is created. Sanctions require proportionate review.\n• Think it's a false alarm? File a **\"Security appeal\"** via Feedback: [/feedback](/feedback)\n• Scan your code in the Code Advisor to see which signature fired.",
        },
        related: ["code-execution", "report"],
    },
    {
        id: "privacy",
        label: { TR: "Gizlilik ve KVKK", EN: "Privacy & KVKK" },
        keywords: ["gizlilik", "privacy", "kvkk", "gdpr", "veri", "data", "sil", "delete", "indir", "export", "aydınlatma", "kişisel", "personal"],
        answer: {
            TR: "Hangi verilerin neden işlendiği, hizmet sağlayıcılar ve saklama süreleri **Gizlilik Politikası** ile **KVKK Aydınlatma Metni**'nde anlatılır.\n• Hesap Ayarları'ndan **verilerini indirebilir** veya **hesabını silebilirsin** (projeler, oyunlar, yorumlar ve mesajlar silinir).\n• KVKK başvurunu Geri Bildirim'den iletebilirsin.\n[/privacy-policy](/privacy-policy) · [/disclosure](/disclosure)",
            EN: "What is processed and why, the providers involved and retention are explained in the **Privacy Policy** and the **KVKK Notice**.\n• In Account Settings you can **download your data** or **delete your account** (projects, games, comments and messages are removed).\n• Send data-protection requests via Feedback.\n[/privacy-policy](/privacy-policy) · [/disclosure](/disclosure)",
        },
        related: ["cookies", "hacked"],
    },
    {
        id: "cookies",
        label: { TR: "Çerezler ve yerel depolama", EN: "Cookies & local storage" },
        keywords: ["çerez", "cerez", "cookie", "localstorage", "yerel depolama", "local storage", "takip", "tracking", "reklam", "ads"],
        answer: {
            TR: "Hanogt **reklam veya üçüncü taraf takip çerezi kullanmaz.** Oturum için gerekli çerezler ve tarayıcında tutulan bazı tercihler vardır: tema, dil, kaydedilen haberler (Sonra oku), güvenlik kontrol listesi ilerlemesi, tarayıcıya kaydedilen motor projeleri. Bunları tarayıcı ayarlarından silebilirsin.",
            EN: "Hanogt uses **no advertising or third-party tracking cookies.** There are session cookies and a few preferences kept in your browser: theme, language, saved news (Read later), security checklist progress and engine projects saved locally. You can clear them in your browser settings.",
        },
        related: ["privacy"],
    },
    {
        id: "calls",
        label: { TR: "Sesli arama ve mesajlar", EN: "Voice calls & messages" },
        keywords: ["arama", "call", "webrtc", "ses", "voice", "mikrofon", "microphone", "sesli mesaj", "voice message", "kayıt", "record"],
        answer: {
            TR: "Sesli aramalar **WebRTC ile eşten eşe** kurulur ve Hanogt tarafından **kaydedilmez**. Geçici bağlantı (SDP/ICE) belgeleri görüşme bitince silinir.\n• Sesli mesajlar yetkili dosya depolamasında tutulur; mesajı silince dosyası da silinir.",
            EN: "Voice calls are **peer-to-peer via WebRTC** and are **never recorded** by Hanogt. Temporary signaling (SDP/ICE) documents are deleted when the call ends.\n• Voice messages live in access-controlled file storage and are removed with the message.",
        },
        related: ["privacy"],
    },
    {
        id: "media",
        label: { TR: "Media, gruplar ve paylaşım", EN: "Media, groups & sharing" },
        keywords: ["media", "paylaş", "paylas", "share", "grup", "group", "davet", "invite", "gönderi", "post", "rıza", "consent", "eğitim", "training"],
        answer: {
            TR: "Media paylaşımları yayından önce **güvenlik ön elemesinden** geçer; kodun yalnızca sen açıkça yayımlarsan görünür. Güvenlik katkı programı **varsayılan olarak kapalıdır** ve proje bazında ikinci onay ister.\n• Grup erişimi süreli davet bağlantıları, üyelik ve rol kontrolleriyle sınırlandırılır.",
            EN: "Media posts pass a **security pre-check** before publishing; your code is visible only when you explicitly publish it. The security contribution program is **off by default** and needs a second, per-project consent.\n• Group access is limited by expiring invites, membership and roles.",
        },
        related: ["news", "arcade"],
    },
    {
        id: "news",
        label: { TR: "Haber yorumları ve arena", EN: "News comments & arena" },
        keywords: ["haber", "news", "yorum", "comment", "arena", "oy", "vote", "elo", "sıralama", "ranking", "leaderboard", "küfür", "hakaret", "moderasyon", "moderation"],
        answer: {
            TR: "Hanogt News yorumları **giriş yapan kullanıcılara** açıktır; dakikada en fazla 8 yorum ve yorum başına 2 bağlantı sınırı vardır. Hakaret, spam ve kişisel veri (telefon, e-posta, T.C. kimlik, kart, IBAN) otomatik engellenir.\n• Yapay zeka arenası oyları e-postan yerine **tuzlanmış bir takma kimlikle** saklanır; aynı ikiliye günde bir oy verilir. Puanlar sadece oylardan (Elo) hesaplanır.",
            EN: "Hanogt News comments are open to **signed-in users**, with at most 8 comments a minute and 2 links per comment. Abuse, spam and personal data (phone, e-mail, national ID, card, IBAN) are blocked automatically.\n• AI arena votes are stored under a **salted pseudonym** instead of your e-mail; one vote per pair per day. Ratings come only from votes (Elo).",
        },
        related: ["media", "privacy"],
    },
    {
        id: "arcade",
        label: { TR: "Arcade ve oyun yayınlama", EN: "Arcade & publishing games" },
        keywords: ["arcade", "oyun", "game", "yayınla", "yayinla", "publish", "motor", "engine", "remix"],
        answer: {
            TR: "Arcade'e yayınlanan oyunların scriptleri yayından önce sunucuda **Hanogt Security** imzalarıyla taranır. Oyun scriptleri doğrudan tarayıcı kodu olarak değil, Hanogt'un C#/C++ script sanal makinesinde çalışır ve yalnızca motorun sunduğu API'lere erişebilir (sayfaya veya ağa doğrudan erişemez).\n• Motor projelerin giriş yaptıysan hesabına, yapmadıysan yalnızca tarayıcına kaydedilir.\n• Oyununda gizli anahtar veya parola saklama: PlayerPrefs düz metindir.",
            EN: "Scripts of games published to the Arcade are screened on the server with **Hanogt Security** signatures before release. Game scripts don't run as raw browser code; they run inside Hanogt's C#/C++ script virtual machine and can only reach the engine's API (no direct page or network access).\n• Engine projects are saved to your account when signed in, otherwise only in your browser.\n• Never keep secrets or passwords in your game: PlayerPrefs is plain text.",
        },
        related: ["code-execution", "advisor"],
    },
    {
        id: "report",
        label: { TR: "Açık bildir", EN: "Report a vulnerability" },
        keywords: ["bildir", "report", "açık buldum", "vulnerability", "bug", "hata", "bounty", "güvenlik açığı", "security issue"],
        answer: {
            TR: "Teşekkürler! **Sorumlu bildirim** için:\n1. Geri Bildirim'de **\"Güvenlik\"** başlıklı bir kayıt aç: [/feedback](/feedback)\n2. Yeniden üretme adımlarını, etkilenen sayfayı ve beklenen/gerçekleşen davranışı yaz.\n3. Gerçek parola, erişim anahtarı veya başkasına ait kişisel veri ekleme.\n4. Başkalarının verisine erişme ve hizmeti aksatma.",
            EN: "Thank you! For **responsible disclosure**:\n1. Open a report titled **\"Security\"** on Feedback: [/feedback](/feedback)\n2. Add reproduction steps, the affected page and expected vs. actual behavior.\n3. Don't include real passwords, access keys or others' personal data.\n4. Don't access others' data or disrupt the service.",
        },
        related: ["ban", "hacked"],
    },
];

const GREETING = /^(?:merhaba|selam|slm|hey|hi|hello|günaydın|iyi akşamlar|naber|sa|selamün aleyküm)\b/i;
const THANKS = /\b(?:teşekkür|tesekkur|sağol|sagol|thanks|thank you|eyvallah|tşk)\b/i;
const MORE = /^(?:daha fazla|devam|ayrıntı|detay|more|tell me more|example|örnek)\b/i;

function looksLikeCode(text: string) {
    const lines = text.split("\n").length;
    const symbols = (text.match(/[{}();=<>]/g) ?? []).length;
    return (lines >= 3 && symbols >= 6) || /\b(?:def |function |class |import |#include|public |const |let |var |SELECT |curl |sudo )/.test(text) && symbols >= 3;
}

function scoreTopic(topic: Topic, text: string) {
    let score = 0;
    for (const keyword of topic.keywords) if (text.includes(keyword)) score += keyword.includes(" ") ? 3 : 2;
    return score;
}

export function botReply(message: string, lastTopic: string | null): BotReply {
    const text = message.toLocaleLowerCase("tr").trim();

    if (containsSecret(message)) {
        return {
            text: {
                TR: "⚠️ **Mesajında gerçek bir gizli anahtar/jeton olabilir.** Lütfen gizli bilgileri kimseyle paylaşma — bana bile. Bu mesaj hiçbir yere gönderilmedi ama anahtar başka bir yerde açığa çıktıysa hemen **iptal et ve yenile**.",
                EN: "⚠️ **Your message may contain a real secret key/token.** Please never share secrets with anyone — not even me. This message wasn't sent anywhere, but if the key leaked elsewhere, **revoke and rotate** it now.",
            },
            suggestions: ["secrets", "advisor"],
            topic: "secrets",
        };
    }

    if (looksLikeCode(message)) {
        const report = analyzeCode(message);
        const top = report.findings.slice(0, 4);
        const trList = top.map((finding) => `• **${finding.title.TR}** (satır ${finding.line})`).join("\n");
        const enList = top.map((finding) => `• **${finding.title.EN}** (line ${finding.line})`).join("\n");
        return {
            text: report.findings.length
                ? {
                    TR: `Kodunu taradım: puan **${report.score}/100 (${report.grade})**, ${report.findings.length} bulgu.\n${trList}${report.blockedByGuard ? "\n🚫 Bu kod Hanogt çalıştırıcısında **engellenir**." : ""}\nAyrıntılar ve düzeltme önerileri için: [/security#advisor](/security#advisor)`,
                    EN: `I scanned your code: score **${report.score}/100 (${report.grade})**, ${report.findings.length} findings.\n${enList}${report.blockedByGuard ? "\n🚫 The Hanogt runner **blocks** this code." : ""}\nDetails and fixes: [/security#advisor](/security#advisor)`,
                }
                : {
                    TR: "Kodunu taradım ve **bilinen bir risk deseni bulamadım** (puan 100/100). Bu kesin güvenli olduğu anlamına gelmez; mantık hatalarını da gözden geçir.",
                    EN: "I scanned your code and **found no known risk patterns** (score 100/100). That doesn't prove it's secure; review the logic too.",
                },
            suggestions: ["advisor", "secrets"],
            topic: "advisor",
        };
    }

    const url = findUrl(message);
    if (url) {
        const report = checkLink(url);
        const verdict = report.verdict === "danger"
            ? { TR: "🚨 **Tehlikeli görünüyor, tıklama!**", EN: "🚨 **Looks dangerous, don't click!**" }
            : report.verdict === "caution"
                ? { TR: "⚠️ **Dikkatli ol.**", EN: "⚠️ **Be careful.**" }
                : report.verdict === "safe"
                    ? { TR: "✅ **Belirgin bir tehlike işareti görmedim.**", EN: "✅ **I see no obvious danger signs.**" }
                    : { TR: "Bu geçerli bir bağlantı gibi görünmüyor.", EN: "This doesn't look like a valid link." };
        const trSignals = report.signals.slice(0, 4).map((signal) => `• ${signal.text.TR}`).join("\n");
        const enSignals = report.signals.slice(0, 4).map((signal) => `• ${signal.text.EN}`).join("\n");
        return {
            text: {
                TR: `${verdict.TR} (${report.host ?? url})\n${trSignals}${trSignals ? "\n" : ""}Not: Adresin yalnızca yapısını inceledim, siteye bağlanmadım. Ayrıntı: [/security#links](/security#links)`,
                EN: `${verdict.EN} (${report.host ?? url})\n${enSignals}${enSignals ? "\n" : ""}Note: I only inspected the address structure and never connected to it. Details: [/security#links](/security#links)`,
            },
            suggestions: ["phishing", "hacked"],
            topic: "phishing",
        };
    }

    if (GREETING.test(text) && text.length < 40) {
        return {
            text: { TR: "Merhaba! 👋 Ben Hanogt Security Bot. Parola, oltalama, kod güvenliği, gizlilik veya hesap güvenliği hakkında sorabilirsin. Şüpheli bir bağlantıyı ya da kodunu da yapıştırabilirsin.", EN: "Hi! 👋 I'm Hanogt Security Bot. Ask about passwords, phishing, code security, privacy or account safety. You can also paste a suspicious link or your code." },
            suggestions: ["password", "phishing", "advisor"],
        };
    }
    if (THANKS.test(text)) {
        return { text: { TR: "Rica ederim! Güvende kal. 🛡️", EN: "You're welcome! Stay safe. 🛡️" }, suggestions: ["report", "privacy"] };
    }
    if (MORE.test(text) && lastTopic) {
        const topic = TOPICS.find((entry) => entry.id === lastTopic);
        if (topic) {
            return {
                text: { TR: `**${topic.label.TR}** ile ilgili şunlara da göz atabilirsin:`, EN: `Related to **${topic.label.EN}**, you might also check:` },
                suggestions: topic.related,
                topic: topic.id,
            };
        }
    }

    let best: Topic | null = null;
    let bestScore = 0;
    for (const topic of TOPICS) {
        const score = scoreTopic(topic, text) + (topic.id === lastTopic ? 0.5 : 0);
        if (score > bestScore) {
            best = topic;
            bestScore = score;
        }
    }
    if (best && bestScore >= 2) return { text: best.answer, suggestions: best.related, topic: best.id };

    return {
        text: {
            TR: "Bunu tam anlayamadım. 🤔 Şu konularda yardımcı olabilirim: parola ve iki adımlı doğrulama, oltalama bağlantıları, kod güvenliği ve sızmış anahtarlar, engellemeler ve itiraz, gizlilik/KVKK, sesli aramalar, Media/Arcade ve haber yorumları. Bir bağlantı ya da kod da yapıştırabilirsin.",
            EN: "I didn't quite get that. 🤔 I can help with passwords and 2FA, phishing links, code security and leaked keys, blocks and appeals, privacy/KVKK, voice calls, Media/Arcade and news comments. You can also paste a link or code.",
        },
        suggestions: ["password", "phishing", "advisor", "privacy"],
    };
}
