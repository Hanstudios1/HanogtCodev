/**
 * Hanogt AI knowledge base: curated answers about every part of Hanogt Codev,
 * plus the FAQ and the pages of the interactive guide. The offline Hanogt AI
 * Core answers from it directly; the server adds the best matching entries to
 * the language model's context (retrieval-augmented generation).
 */
import type { Copy } from "@/lib/i18n";
import { FAQS } from "@/lib/faq";
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
    friends: { href: "/friends", label: { TR: "Arkadaşlar", EN: "Friends" } },
    groups: { href: "/groups", label: { TR: "Gruplar", EN: "Groups" } },
    feedback: { href: "/feedback", label: { TR: "Geri Bildirim", EN: "Feedback" } },
    guide: { href: "/guide", label: { TR: "Kullanım kılavuzu", EN: "User guide" } },
    privacy: { href: "/privacy-policy", label: { TR: "Gizlilik Politikası", EN: "Privacy Policy" } },
    dashboard: { href: "/dashboard", label: { TR: "Panel", EN: "Dashboard" } },
    ai: { href: "/ai", label: { TR: "Hanogt AI", EN: "Hanogt AI" } },
} satisfies Record<string, KnowledgeLink>;

export const CURATED_KNOWLEDGE: KnowledgeEntry[] = [
    {
        id: "identity",
        intents: ["identity"],
        title: { TR: "Hanogt AI kimdir?", EN: "Who is Hanogt AI?" },
        body: {
            TR: "Ben **Hanogt AI**, HanStudios'un Hanogt Codev için geliştirdiği yapay zeka asistanıyım. İki katmanla çalışırım:\n• **Hanogt AI (LLM):** Giriş yaptığında sorularını, sunucuda yapılandırılmış büyük dil modeli Hanogt bilgi tabanından seçilen notlarla yanıtlar.\n• **Hanogt AI Çekirdeği:** Cihazında çalışan, Hanogt verileriyle eğitilmiş küçük bir niyet modeli; site bilgisi, güvenlik araçları, kod örnekleri, hata açıklamaları ve hesap makinesiyle çevrimdışı yanıt verir.\nİnsan değilim, hata yapabilirim; önemli kararlarda yanıtlarımı doğrula.",
            EN: "I'm **Hanogt AI**, the AI assistant HanStudios built for Hanogt Codev. I work in two layers:\n• **Hanogt AI (LLM):** when you're signed in, the large language model configured on the server answers with notes picked from the Hanogt knowledge base.\n• **Hanogt AI Core:** a small intent model trained on Hanogt data that runs on your device and answers offline with site knowledge, security tools, code samples, error explanations and a calculator.\nI'm not a person and I can make mistakes; double-check my answers for important decisions.",
        },
        keywords: "hanogt ai kimsin model llm yapay zeka asistan who are you model assistant",
        links: [L.ai],
    },
    {
        id: "capabilities",
        intents: ["capabilities"],
        title: { TR: "Hanogt AI neler yapabilir?", EN: "What can Hanogt AI do?" },
        body: {
            TR: "Şunlarda yardımcı olurum:\n• **Kod:** örnek kod, açıklama, hata ayıklama, hata mesajlarını yorumlama, kodu editörde açma.\n• **Oyun geliştirme:** Hanogt Engine'de C#/C++ scriptleri, fizik, girdi, prefab, sahneler.\n• **Güvenlik:** yapıştırdığın bağlantıyı ve kodu anında incelerim, parola ve hesap güvenliği, sızmış anahtarlar.\n• **Site rehberi:** editör, Arcade, Media, Haberler, Arkadaşlar, Gruplar, Hesap Ayarları.\n• **Hesap makinesi:** `(3+5)*2`, `sqrt(144)` gibi ifadeler.\nİpucu: Kod, Güvenlik ve Genel modları arasında geçiş yapabilirsin.",
            EN: "I can help with:\n• **Code:** examples, explanations, debugging, reading error messages, opening code in the editor.\n• **Game development:** C#/C++ scripts in Hanogt Engine, physics, input, prefabs, scenes.\n• **Security:** I inspect links and code you paste right away, plus passwords, account safety and leaked keys.\n• **Site guide:** editor, Arcade, Media, News, Friends, Groups, Account Settings.\n• **Calculator:** expressions like `(3+5)*2` or `sqrt(144)`.\nTip: switch between the Code, Security and General modes.",
        },
        keywords: "yardım özellikler neler yapabilirsin help features abilities",
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
            TR: "E-posta ve parolayla giriş yapan hesaplar **doğrulayıcı uygulamasıyla (TOTP)** iki adımlı doğrulamayı açabilir:\n1. [Hesap Ayarları](/account-settings) → **Güvenlik** → İki adımlı doğrulama.\n2. QR kodu Google Authenticator, Microsoft Authenticator, Aegis veya 1Password gibi bir uygulamayla tara.\n3. Uygulamadaki 6 haneli kodu girip onayla ve **kurtarma kodlarını** güvenli bir yere kaydet.\nGiriş yaparken parolanın ardından uygulamadaki kod istenir. Google ile giriş yapıyorsan Google hesabındaki 2 adımlı doğrulama seni korur.\n• Kimse senden doğrulama kodu isteyemez; Hanogt ekibi de istemez.",
            EN: "Accounts that sign in with e-mail and password can enable two-step verification with an **authenticator app (TOTP)**:\n1. [Account Settings](/account-settings) → **Security** → Two-factor authentication.\n2. Scan the QR code with an app such as Google Authenticator, Microsoft Authenticator, Aegis or 1Password.\n3. Enter the 6-digit code to confirm and store your **recovery codes** somewhere safe.\nAfter your password, sign-in asks for the app's code. If you sign in with Google, the 2-step verification of your Google account protects you.\n• No one should ask for your verification codes; the Hanogt team never will.",
        },
        keywords: "2fa totp iki adımlı doğrulama authenticator kod recovery kurtarma two factor",
        links: [L.settings],
    },
    {
        id: "hacked",
        intents: ["hacked"],
        title: { TR: "Hesabım ele geçirildiyse", EN: "If your account was compromised" },
        body: {
            TR: "Sakin ol, adım adım gidelim:\n1. **Parolanı hemen değiştir** ([Hesap Ayarları](/account-settings)). Google ile giriyorsan Google parolanı değiştir.\n2. **İki adımlı doğrulamayı aç** ve kurtarma kodlarını kaydet.\n3. Aynı parolayı kullandığın diğer sitelerde de değiştir.\n4. Projelerini, Media paylaşımlarını, gruplarını ve arkadaş listeni tanımadığın değişikliklere karşı kontrol et.\n5. [Geri Bildirim](/feedback) sayfasından **\"Güvenlik\"** başlığıyla bize yaz.",
            EN: "Stay calm, step by step:\n1. **Change your password now** ([Account Settings](/account-settings)). With Google sign-in, change your Google password.\n2. **Turn on two-factor authentication** and save the recovery codes.\n3. Change it anywhere you reused it.\n4. Check projects, Media posts, groups and your friend list for changes you don't recognize.\n5. Write to us via [Feedback](/feedback) titled **\"Security\"**.",
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
            TR: "Bir anahtar herkese açık bir yere (GitHub, Media, ekran görüntüsü) düştüyse **silmek yetmez, iptal etmen gerekir**:\n1. Sağlayıcının panelinden anahtarı **iptal et / yenile**.\n2. Yeni anahtarı kodda değil **ortam değişkeninde** tut; `.env` dosyasını paylaşma ve `.gitignore`'a ekle.\n3. Git geçmişinden de temizle; ama asıl koruma iptaldir.\n4. Kullanım ve fatura kayıtlarını kontrol et.",
            EN: "If a key landed somewhere public (GitHub, Media, a screenshot) **deleting it isn't enough, revoke it**:\n1. **Revoke/rotate** it in the provider's dashboard.\n2. Keep the new key in an **environment variable**, not in code; never share `.env` and add it to `.gitignore`.\n3. Clean the Git history too, but revocation is what protects you.\n4. Review usage and billing logs.",
        },
        keywords: "api key anahtar token sızdı leak env gitignore secret revoke rotate",
    },
    {
        id: "ban",
        intents: ["ban_appeal"],
        title: { TR: "Engellendim / itiraz", EN: "Blocked / appeal" },
        body: {
            TR: "Otomatik bir eşleşme hesabını **kalıcı olarak kapatmaz**. Riskli kod çalıştırma isteği anında durdurulur ve asgari bir denetim kaydı oluşur; hesap yaptırımları insan incelemesiyle verilir.\n• Kodunu [Kod Danışmanı](/security#advisor)'nda tarayıp hangi imzanın tetiklendiğini görebilirsin (ör. sonsuz fork, disk silme, ters kabuk).\n• Yanlış alarm olduğunu düşünüyorsan [Geri Bildirim](/feedback)'den **\"Güvenlik itirazı\"** gönder.\n• Hesabın askıya alındıysa giriş ekranı bunu söyler; itirazını başka bir e-postadan geri bildirimle iletebilirsin.",
            EN: "An automated match **never permanently closes** your account. A risky code-execution request is stopped on the spot with a minimal audit record; account sanctions need human review.\n• Scan your code in the [Code Advisor](/security#advisor) to see which signature fired (e.g. fork bombs, disk wipes, reverse shells).\n• Think it's a false alarm? File a **\"Security appeal\"** via [Feedback](/feedback).\n• If your account is suspended the sign-in screen says so; you can appeal through feedback from another account.",
        },
        keywords: "engel ban askı suspended blocked itiraz appeal yanlış alarm false positive",
        links: [L.feedback],
    },
    {
        id: "privacy",
        intents: ["privacy"],
        title: { TR: "Gizlilik ve KVKK", EN: "Privacy and KVKK" },
        body: {
            TR: "Hangi verilerin neden işlendiği, hizmet sağlayıcılar ve saklama süreleri [Gizlilik Politikası](/privacy-policy) ile [KVKK Aydınlatma Metni](/disclosure)'nde anlatılır.\n• Verilerini satmayız ve reklam takibi yapmayız.\n• [Hesap Ayarları](/account-settings)'ndan **verilerini indirebilir** veya **hesabını silebilirsin**.\n• Profilini gizleyebilir, çevrimiçi durumunu ve son görülme bilgisini kapatabilirsin.\n• KVKK başvurunu [Geri Bildirim](/feedback)'ten iletebilirsin.",
            EN: "What is processed and why, the providers involved and retention periods are explained in the [Privacy Policy](/privacy-policy) and the [KVKK Notice](/disclosure).\n• We don't sell your data or run ad tracking.\n• In [Account Settings](/account-settings) you can **download your data** or **delete your account**.\n• You can hide your profile and turn off online status and last seen.\n• Send data-protection requests via [Feedback](/feedback).",
        },
        keywords: "gizlilik kvkk gdpr veri data privacy kişisel personal",
        links: [L.privacy, L.settings],
    },
    {
        id: "cookies",
        intents: ["cookies"],
        title: { TR: "Çerezler ve yerel depolama", EN: "Cookies and local storage" },
        body: {
            TR: "Hanogt **reklam veya üçüncü taraf takip çerezi kullanmaz.** Oturum için gerekli çerezler ve tarayıcında tutulan bazı tercihler vardır: tema, dil, editör ayarları, kaydedilen haberler (Sonra oku), Hanogt AI sohbetlerin, güvenlik kontrol listesi ilerlemesi ve giriş yapmadan oluşturduğun motor projeleri. Bunları tarayıcı ayarlarından silebilirsin.",
            EN: "Hanogt uses **no advertising or third-party tracking cookies.** There are session cookies and a few preferences kept in your browser: theme, language, editor settings, saved news (Read later), your Hanogt AI chats, security checklist progress and engine projects created while signed out. You can clear them in your browser settings.",
        },
        keywords: "çerez cookie localstorage takip tracking reklam ads analytics",
    },
    {
        id: "calls",
        intents: ["calls"],
        title: { TR: "Sesli aramalar", EN: "Voice calls" },
        body: {
            TR: "Arkadaşlarını [Arkadaşlar](/friends) sayfasından ya da sohbet ekranından arayabilirsin. Aramalar **WebRTC ile eşten eşe** kurulur ve Hanogt tarafından **kaydedilmez**; geçici bağlantı belgeleri görüşme bitince silinir.\n• Mikrofon izni ver; tarayıcı adres çubuğundaki kilit simgesinden kontrol edebilirsin.\n• Bazı kurumsal ağlarda bağlantı için TURN sunucusu gerekir; yoksa arama ekranı bunu belirtir.\n• Sesli mesajlar en fazla 60 saniye ve 3 MB'tır.",
            EN: "Call friends from the [Friends](/friends) page or the chat screen. Calls are **peer-to-peer via WebRTC** and are **never recorded** by Hanogt; temporary signaling documents are deleted when the call ends.\n• Allow microphone access; check it via the lock icon in the address bar.\n• Some corporate networks need a TURN server to connect; the call screen tells you if it's missing.\n• Voice messages are limited to 60 seconds and 3 MB.",
        },
        keywords: "arama call webrtc mikrofon microphone ses voice turn",
        links: [L.friends],
    },
    {
        id: "report",
        intents: ["report_vuln"],
        title: { TR: "Güvenlik açığı bildirimi", EN: "Reporting a vulnerability" },
        body: {
            TR: "Teşekkürler! **Sorumlu bildirim** için:\n1. [Geri Bildirim](/feedback)'te **\"Güvenlik\"** başlıklı bir kayıt aç.\n2. Yeniden üretme adımlarını, etkilenen sayfayı ve beklenen/gerçekleşen davranışı yaz.\n3. Gerçek parola, erişim anahtarı veya başkasına ait kişisel veri ekleme.\n4. Başkalarının verisine erişme, hizmeti aksatma ve düzeltilene kadar açığı herkese açık paylaşma.",
            EN: "Thank you! For **responsible disclosure**:\n1. Open a report titled **\"Security\"** on [Feedback](/feedback).\n2. Add reproduction steps, the affected page and expected vs. actual behavior.\n3. Don't include real passwords, access keys or others' personal data.\n4. Don't access others' data, disrupt the service or publish the issue before it's fixed.",
        },
        keywords: "açık bildir vulnerability report bug bounty responsible disclosure",
        links: [L.feedback],
    },
    {
        id: "account-delete",
        intents: ["account_delete"],
        title: { TR: "Hesabımı silme", EN: "Deleting my account" },
        body: {
            TR: "[Hesap Ayarları](/account-settings) → **Hesap** bölümündeki **Hesabı Sil** düğmesini kullan. Silme geri alınamaz:\n• Projelerin, oyun projelerin, Arcade oyunların, Media paylaşımların, yorumların, beğenilerin, sohbetlerin ve sesli mesajların silinir.\n• Sahibi olduğun gruplar silinir, üye olduğun gruplardan çıkarılırsın.\nİstersen önce **Verilerimi İndir** ile bir kopya al.",
            EN: "Use **Delete Account** under [Account Settings](/account-settings) → **Account**. Deletion can't be undone:\n• Your projects, game projects, Arcade games, Media posts, comments, likes, chats and voice messages are removed.\n• Groups you own are deleted and you leave the groups you're a member of.\nIf you like, take a copy first with **Download My Data**.",
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
        intents: ["account_profile"],
        title: { TR: "Profil ve hesap ayarları", EN: "Profile and account settings" },
        body: {
            TR: "[Hesap Ayarları](/account-settings)'nda şunları değiştirebilirsin:\n• **Profil:** kullanıcı adı, profil resmi adresi (https), takma ad, hakkında, banner, vurgu rengi, favori diller, sosyal bağlantılar.\n• **Takma ad ve etiket:** arkadaşların seni `TakmaAd#1234` ile bulur.\n• **Bildirimler, mesajlaşma, görünüm, gizlilik:** çevrimiçi durumu, son görülme, kimlerin seni ekleyebileceği.\n• **Güvenlik:** parola ve iki adımlı doğrulama.\nRozetler Hanogt ekibi tarafından verilir; kullanıcılar kendine rozet ekleyemez.",
            EN: "In [Account Settings](/account-settings) you can change:\n• **Profile:** username, profile picture URL (https), nickname, about, banner, accent color, favorite languages, social links.\n• **Nickname & tag:** friends find you with `Nickname#1234`.\n• **Notifications, messaging, appearance, privacy:** online status, last seen, who can add you.\n• **Security:** password and two-factor authentication.\nBadges are granted by the Hanogt team; users can't give themselves badges.",
        },
        keywords: "profil kullanıcı adı avatar resim takma ad etiket tag banner rozet badge settings ayarlar",
        links: [L.settings],
    },
    {
        id: "login-help",
        intents: ["login_help"],
        title: { TR: "Giriş sorunları", EN: "Sign-in problems" },
        body: {
            TR: "Giriş yapamıyorsan:\n• **Google ile giriş:** Tarayıcı sizi Google'ın döndüğü alan adına taşıyıp girişi tamamlar; çerezleri engelleyen eklentileri kapatıp yeniden dene.\n• **\"Çok fazla deneme\":** güvenlik için belirtilen süre kadar bekle.\n• **Parolanı unuttuysan:** hesabı Google ile açtıysan Google ile giriş yap. E-postayla sıfırlama henüz yok; [Geri Bildirim](/feedback)'ten ya da başka bir hesaptan \"Hesap erişimi\" başlığıyla yaz.\n• **\"Hesap askıya alındı\":** itiraz için geri bildirim gönder.\n• Oturum 90 gün geçerlidir ve her ziyarette yenilenir; çıkış yapmadıkça tekrar giriş gerekmez.",
            EN: "If you can't sign in:\n• **Google sign-in:** the browser moves you to the domain Google returns to and completes sign-in; turn off cookie-blocking extensions and try again.\n• **\"Too many attempts\":** wait the time shown, it's a safety limit.\n• **Forgot your password:** if you created the account with Google, sign in with Google. E-mail reset isn't available yet; write to us via [Feedback](/feedback) or from another account titled \"Account access\".\n• **\"Account suspended\":** send an appeal through feedback.\n• Sessions last 90 days and renew on every visit; you stay signed in until you sign out.",
        },
        keywords: "giriş login sign in google şifremi unuttum forgot password oturum session hata error oauth",
        links: [L.feedback],
    },
    {
        id: "editor",
        intents: ["editor_help"],
        title: { TR: "Kod editörünü kullanmak", EN: "Using the code editor" },
        body: {
            TR: "[Kod Editörü](/editor) Monaco (VS Code'un editörü) tabanlıdır:\n• **Sekmeler ve dosyalar:** yeni dosya ekle, yeniden adlandır, farklı dillerde çoklu dosya çalıştır.\n• **Kaydet:** giriş yaptıysan projelerin buluta kaydedilir ve [Panel](/dashboard)'de görünür.\n• **Çalıştır:** tarayıcı dilleri anında, derlenen diller güvenli derleyici hizmetinde çalışır; **Girdi** sekmesinden stdin verirsin.\n• **Ayarlar:** tema, yazı tipi, boyut, sekme genişliği, mini harita, otomatik kaydetme [Editör Ayarları](/settings)'nda.\n• Kısayollar: Ctrl+S kaydet, Ctrl+Enter çalıştır, Ctrl+F bul, F1 komut paleti.",
            EN: "The [Code Editor](/editor) is built on Monaco (VS Code's editor):\n• **Tabs and files:** add, rename and run multiple files in different languages.\n• **Save:** when signed in, projects are saved to the cloud and appear on your [Dashboard](/dashboard).\n• **Run:** browser languages run instantly, compiled ones on a secure compiler service; give stdin in the **Input** tab.\n• **Settings:** theme, font, size, tab width, minimap and auto-save in [Editor Settings](/settings).\n• Shortcuts: Ctrl+S save, Ctrl+Enter run, Ctrl+F find, F1 command palette.",
        },
        keywords: "editör editor monaco dosya file sekme tab kaydet save proje project kısayol shortcut tema",
        links: [L.editor, L.editorSettings],
    },
    {
        id: "run-code",
        intents: ["run_code"],
        title: { TR: "Kod çalıştırma", EN: "Running code" },
        body: {
            TR: "**Çalıştır** düğmesine bas (Ctrl+Enter):\n• **Tarayıcıda:** JavaScript, TypeScript, Python, SQL ve Lua ayrı bir Web Worker içinde WebAssembly ile çalışır; giriş gerekmez, kod sunucuya gitmez. Sonsuz döngüler 15 saniyede durdurulur.\n• **Derleyici hizmetinde:** C, C++, C#, Java, Go, Rust ve 25'ten fazla dil giriş yapmayı gerektirir; kod önce Hanogt Security ile taranır, sonra izole bir hizmette (yöneticinin çalıştırıcısı ya da Wandbox) derlenir. Dakikada 20 çalıştırma sınırı vardır.\n• **Girdi:** `input()`, `Scanner`, `cin`, `io.read()` okumaları **Girdi** sekmesindeki metinden gelir.\n• Python ilk açılışta ~12 MB indirir; biraz bekle.",
            EN: "Press **Run** (Ctrl+Enter):\n• **In the browser:** JavaScript, TypeScript, Python, SQL and Lua run with WebAssembly in a separate Web Worker; no sign-in needed and code never leaves your device. Infinite loops are stopped after 15 seconds.\n• **On the compiler service:** C, C++, C#, Java, Go, Rust and 25+ more need sign-in; code is first screened by Hanogt Security and then compiled in an isolated service (the operator's runner or Wandbox). The limit is 20 runs per minute.\n• **Input:** `input()`, `Scanner`, `cin` and `io.read()` read from the text in the **Input** tab.\n• Python downloads ~12 MB on first use; give it a moment.",
        },
        keywords: "çalıştır run execute input girdi stdin çıktı output wandbox runner derle compile timeout zaman aşımı",
        links: [L.editor],
    },
    {
        id: "languages-supported",
        intents: ["languages_supported"],
        title: { TR: "Desteklenen programlama dilleri", EN: "Supported programming languages" },
        body: {
            TR: "**Tarayıcıda çalışanlar:** JavaScript, TypeScript, Python, SQL (SQLite), Lua; ayrıca HTML/CSS/JS web sayfası önizlemesi.\n**Derleyici hizmetinde çalışanlar:** C, C++, C#, Java, Kotlin, Go, Rust, Swift, Ruby, PHP, Perl, Scala, Haskell, Elixir, Erlang, Nim, D, Crystal, Bash, Pascal, OCaml, Zig, Julia, R, Groovy, Lisp, F#, CoffeeScript ve diğerleri.\n**Oyun scriptleri:** Hanogt Engine'de C# ve C++ (tarayıcıdaki HanogtScript sanal makinesinde).\nJSON, YAML, Markdown, XML, Dockerfile gibi dosyalar sözdizimi vurgulamasıyla düzenlenebilir.",
            EN: "**Run in the browser:** JavaScript, TypeScript, Python, SQL (SQLite), Lua, plus an HTML/CSS/JS web page preview.\n**Run on the compiler service:** C, C++, C#, Java, Kotlin, Go, Rust, Swift, Ruby, PHP, Perl, Scala, Haskell, Elixir, Erlang, Nim, D, Crystal, Bash, Pascal, OCaml, Zig, Julia, R, Groovy, Lisp, F#, CoffeeScript and more.\n**Game scripts:** C# and C++ in Hanogt Engine (in the HanogtScript virtual machine in your browser).\nFiles like JSON, YAML, Markdown, XML or Dockerfile can be edited with syntax highlighting.",
        },
        keywords: "dil diller language languages python java c# c++ rust go kotlin php ruby destek supported",
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
        intents: ["engine_help"],
        title: { TR: "Hanogt Engine ile oyun yapmak", EN: "Making games with Hanogt Engine" },
        body: {
            TR: "[Oyun Motoru](/game-engine) Unity benzeri, tarayıcıda çalışan bir 2D/3D motordur:\n1. **Yeni proje** oluştur, 2D veya 3D seç ya da hazır şablonla başla (2D Platform, 3D Roll-a-Ball, Uzay Nişancısı, Tuğla Kırma).\n2. **Hiyerarşi**'den nesne ekle, **Inspector**'da Transform, Sprite/Mesh, Collider, Rigidbody, Kamera, Işık ve Script bileşenlerini düzenle.\n3. **C# veya C++ script** yaz: `Start()`, `Update()`, `OnCollisionEnter2D()`, `Input.GetAxis(\"Horizontal\")`, `Instantiate()`, `PlayerPrefs`…\n4. **Oynat** ile test et, konsoldaki hataları satır numarasıyla gör.\n5. **Arcade'de yayınla** ya da tek dosya HTML olarak dışa aktar.\nAyrıntılar: [Motor belgeleri](/game-engine/docs). Bana \"zıplama kodu\" gibi bir şey sor, örnek script vereyim.",
            EN: "[Game Engine](/game-engine) is a Unity-like 2D/3D engine that runs in the browser:\n1. Create a **new project**, choose 2D or 3D or start from a template (2D Platformer, 3D Roll-a-Ball, Space Shooter, Brick Breaker).\n2. Add objects in the **Hierarchy** and edit Transform, Sprite/Mesh, Collider, Rigidbody, Camera, Light and Script components in the **Inspector**.\n3. Write **C# or C++ scripts**: `Start()`, `Update()`, `OnCollisionEnter2D()`, `Input.GetAxis(\"Horizontal\")`, `Instantiate()`, `PlayerPrefs`…\n4. Test with **Play** and read errors with line numbers in the console.\n5. **Publish to the Arcade** or export a single-file HTML game.\nDetails: [Engine docs](/game-engine/docs). Ask me for something like \"jump code\" and I'll give you a sample script.",
        },
        keywords: "oyun motoru game engine unity c# c++ script sprite prefab rigidbody collider sahne scene 2d 3d monobehaviour",
        links: [L.engine, L.docs],
    },
    {
        id: "arcade",
        intents: ["arcade_help"],
        title: { TR: "Arcade", EN: "Arcade" },
        body: {
            TR: "[Arcade](/arcade), Hanogt Engine ile yapılan oyunların vitrinidir:\n• **Yayınlamak için** motorda **Yayınla**'ya bas; oyun derlenir ve Hanogt Security taramasından geçer.\n• Oyuncular tarayıcıda, tam ekranda ve dokunmatik kontrollerle oynar; beğenir, oynanma sayısını görür.\n• **Remiks** ile bir oyunun kopyasını kendi projene alıp geliştirebilirsin.\n• Yayınladığın oyunu istediğin an yayından kaldırabilirsin.",
            EN: "The [Arcade](/arcade) showcases games made with Hanogt Engine:\n• **To publish**, press **Publish** in the engine; the game is compiled and screened by Hanogt Security.\n• Players play in the browser, fullscreen and with touch controls, like games and see play counts.\n• **Remix** copies a game into your own project so you can build on it.\n• You can unpublish your game any time.",
        },
        keywords: "arcade oyun yayınla publish remix oyna play beğen like",
        links: [L.arcade, L.engine],
    },
    {
        id: "media",
        intents: ["media_help"],
        title: { TR: "Hanogt Media", EN: "Hanogt Media" },
        body: {
            TR: "[Hanogt Media](/media), kod projelerini toplulukla paylaştığın yerdir:\n• **Yayınla**'ya bas, bir projeni seç, başlık, açıklama, etiketler ve **lisans** (MIT, Apache-2.0, GPL-3.0, CC BY 4.0 ya da tüm hakları saklı) belirle.\n• Yayınlar önce güvenlik ön elemesinden geçer; gizli anahtar içeren kod yayınlanmaz.\n• Diğerleri projeni görüntüler, tek dosya veya ZIP olarak indirir, beğenir ve yorumlar; uygunsuz içeriği bildirebilirler.\n• Popüler ve yeni projeleri keşfet sekmelerinden görürsün; kendi yayınını istediğin zaman silebilirsin.",
            EN: "[Hanogt Media](/media) is where you share code projects with the community:\n• Press **Publish**, pick a project and set a title, description, tags and a **license** (MIT, Apache-2.0, GPL-3.0, CC BY 4.0 or all rights reserved).\n• Posts pass a security pre-check first; code containing secret keys isn't published.\n• Others view your project, download it as a file or ZIP, like and comment; they can report inappropriate content.\n• Browse popular and new projects in the discover tabs; delete your own post any time.",
        },
        keywords: "media paylaş share yayınla publish lisans license mit yorum comment beğeni like indir download",
        links: [L.media],
    },
    {
        id: "news",
        intents: ["news_help"],
        title: { TR: "Hanogt News", EN: "Hanogt News" },
        body: {
            TR: "[Hanogt News](/news) yapay zeka, yazılım, oyun, uygulama ve bilim haberlerini 20'yi aşkın güvenilir kaynağın herkese açık RSS/Atom akışlarından toplar; yalnızca başlık, kısa özet ve kaynağa bağlantı gösterilir.\n• Akış kendiliğinden yenilenir; kategori ve dil filtresi, arama (`/` kısayolu), **Sonra oku** listesi vardır.\n• Yorumlar giriş gerektirir; hakaret, spam ve kişisel veri otomatik engellenir.\n• **Yapay Zeka Arenası:** iki asistanı karşılaştırıp oy verirsin; sıralama yalnızca topluluk oylarından Elo ile hesaplanır.",
            EN: "[Hanogt News](/news) collects AI, software, gaming, app and science stories from the public RSS/Atom feeds of 20+ trusted sources; only the headline, a short excerpt and a link to the source are shown.\n• The feed refreshes itself; there are category and language filters, search (`/` shortcut) and a **Read later** list.\n• Comments need sign-in; abuse, spam and personal data are blocked automatically.\n• **AI Arena:** compare two assistants and vote; rankings come only from community votes via Elo.",
        },
        keywords: "haber news rss kaynak source yorum comment arena elo oy vote sonra oku read later",
        links: [L.news],
    },
    {
        id: "friends",
        intents: ["friends_help"],
        title: { TR: "Arkadaşlar", EN: "Friends" },
        body: {
            TR: "[Arkadaşlar](/friends) sayfasında:\n• **Arkadaş ekle:** karşı tarafın takma adını ve etiketini `TakmaAd#1234` biçiminde yaz; istek gönderilir, kabul edince arkadaş olursunuz. Kendi etiketin Hesap Ayarları'nda yazar.\n• Gelen istekleri kabul et ya da reddet; arkadaşını çıkar, istersen **engelle** (engellediğin kişi sana yazamaz ve arayamaz).\n• Çevrimiçi arkadaşlarını üstteki şeritte görürsün; mesaj, sesli arama ve sesli mesaj buradan başlar.\n• Arkadaşlıklar karşılıklıdır ve sunucuda yönetilir; kimse kendi kendine seni arkadaş listesine ekleyemez.",
            EN: "On the [Friends](/friends) page:\n• **Add a friend:** type their nickname and tag as `Nickname#1234`; a request is sent and you become friends when they accept. Your own tag is shown in Account Settings.\n• Accept or decline incoming requests; remove a friend or **block** them (blocked people can't message or call you).\n• Online friends appear in the strip at the top; messages, voice calls and voice messages start from here.\n• Friendships are mutual and managed on the server; nobody can add you to their friend list on their own.",
        },
        keywords: "arkadaş friend ekle add istek request engelle block etiket tag çevrimiçi online",
        links: [L.friends],
    },
    {
        id: "groups",
        intents: ["groups_help"],
        title: { TR: "Gruplar", EN: "Groups" },
        body: {
            TR: "[Gruplar](/groups) ekip çalışma alanlarıdır:\n1. **Yeni grup** oluştur ve bir şablon seç: Boş, Çalışma grubu, Oyun geliştirme (Game jam), Açık kaynak proje, Sınıf, Hackathon takımı. Grup README, kurallar, görev listesi gibi başlangıç dosyaları ve bir karşılama mesajıyla açılır.\n2. **Davet et:** arkadaşlarını doğrudan ekle ya da süreli ve kullanım sınırlı bir **davet bağlantısı** paylaş.\n3. **Birlikte çalış:** ortak dosyaları otomatik kaydederek düzenleyin, sohbet edin, sesli mesaj gönderin, sesli arama başlatın, önemli mesajları sabitleyin.\n4. **Roller:** sahip, yönetici ve üye; sahip ve yöneticiler üyeleri ve ayarları yönetir.",
            EN: "[Groups](/groups) are team workspaces:\n1. Create a **new group** and pick a template: Blank, Study group, Game jam, Open-source project, Classroom, Hackathon team. The group opens with starter files like a README, rules and a task list, plus a welcome message.\n2. **Invite:** add friends directly or share an expiring, usage-limited **invite link**.\n3. **Work together:** edit shared files with auto-save, chat, send voice messages, start voice calls and pin important messages.\n4. **Roles:** owner, admin and member; owners and admins manage members and settings.",
        },
        keywords: "grup group ekip team davet invite bağlantı link şablon template çalışma study sınıf classroom",
        links: [L.groups],
    },
    {
        id: "messages",
        intents: ["messages_help"],
        title: { TR: "Mesajlar", EN: "Messages" },
        body: {
            TR: "Bir arkadaşının kartındaki mesaj düğmesiyle sohbeti aç:\n• Metin, çıkartma ve **sesli mesaj** (en fazla 60 sn) gönderebilir, mesajı yanıtlayabilir, düzenleyebilir ve silebilirsin.\n• Yazıyor göstergesi ve okundu bilgisi vardır; bunları Hesap Ayarları → Mesajlaşma'dan kapatabilirsin.\n• Yalnızca arkadaşlarınla mesajlaşabilirsin; engellediğin kişiler sana yazamaz.",
            EN: "Open a chat with the message button on a friend's card:\n• Send text, stickers and **voice messages** (up to 60 s), and reply to, edit or delete messages.\n• There's a typing indicator and read receipts; turn them off in Account Settings → Messaging.\n• You can only message friends; people you block can't write to you.",
        },
        keywords: "mesaj message sohbet chat sesli mesaj voice message çıkartma sticker okundu read",
        links: [L.friends],
    },
    {
        id: "security-center",
        intents: ["security_center"],
        title: { TR: "Hanogt Güvenlik Merkezi", EN: "Hanogt Security Center" },
        body: {
            TR: "[Güvenlik Merkezi](/security) tarayıcında çalışan araçlar sunar:\n• **Kod Danışmanı:** 65+ kuralla kod taraması, puan ve düzeltme önerileri.\n• **Parola Laboratuvarı:** kırılma süresi tahmini, k-anonimlikle sızıntı kontrolü, güçlü parola üretici.\n• **Bağlantı Kontrolü:** punycode/Kiril taklidi, sahte alan adları, kısaltıcılar.\n• **Güvenlik kontrol listesi.**\nSunucu tarafında **Hanogt Security Bot** kod çalıştırma ve yayın isteklerini zararlı imzalara karşı tarar; oturum, yetki, hız sınırı ve izole çalıştırıcı asıl korumadır.",
            EN: "The [Security Center](/security) offers tools that run in your browser:\n• **Code Advisor:** code scan with 65+ rules, a score and fixes.\n• **Password Lab:** crack-time estimate, k-anonymity breach check, strong password generator.\n• **Link Check:** punycode/Cyrillic look-alikes, fake domains, shorteners.\n• **Security checklist.**\nOn the server, **Hanogt Security Bot** screens code-execution and publishing requests for malicious signatures; sessions, authorization, rate limits and the isolated runner are the main protection.",
        },
        keywords: "güvenlik merkezi security center bot araç tool kontrol listesi checklist",
        links: [L.security],
    },
    {
        id: "feedback",
        intents: ["feedback_help"],
        title: { TR: "Geri bildirim ve destek", EN: "Feedback and support" },
        body: {
            TR: "[Geri Bildirim](/feedback) sayfasında öneri, hata bildirimi veya soru paylaşabilir, diğerlerinin önerilerini beğenip yorumlayabilirsin. Sık sorulan sorular da orada. Hata bildirirken: ne yaptın, ne bekliyordun, ne oldu ve hangi tarayıcıyı kullanıyorsun, yaz. Güvenlik açıkları için başlığa \"Güvenlik\" ekle.",
            EN: "On the [Feedback](/feedback) page you can share suggestions, bug reports or questions and like or comment on others' ideas. The FAQ lives there too. When reporting a bug, write what you did, what you expected, what happened and which browser you use. Put \"Security\" in the title for vulnerabilities.",
        },
        keywords: "geri bildirim feedback öneri suggestion hata bug destek support sss faq iletişim contact",
        links: [L.feedback],
    },
    {
        id: "theme",
        intents: ["theme"],
        title: { TR: "Tema", EN: "Theme" },
        body: {
            TR: "Üst menüdeki **güneş/ay** düğmesiyle açık, koyu ya da sistem temasını seçebilirsin; seçim bu tarayıcıda hatırlanır. Editörün kendi renk teması [Editör Ayarları](/settings)'nda ayrıca seçilir.",
            EN: "Use the **sun/moon** button at the top to pick the light, dark or system theme; your choice is remembered in this browser. The editor's own color theme is chosen separately in [Editor Settings](/settings).",
        },
        keywords: "tema theme karanlık koyu dark açık light gece night",
        links: [L.editorSettings],
    },
    {
        id: "pricing",
        intents: ["pricing"],
        title: { TR: "Ücret", EN: "Pricing" },
        body: {
            TR: "Hanogt Codev **ücretsizdir** ve reklam göstermez. Kod editörü, oyun motoru, Arcade, Media, Haberler, Arkadaşlar, Gruplar ve Hanogt AI kullanılabilir; yoğun kullanımı korumak için hız sınırları vardır.",
            EN: "Hanogt Codev is **free** and shows no ads. The code editor, game engine, Arcade, Media, News, Friends, Groups and Hanogt AI are all available; rate limits keep heavy use fair.",
        },
        keywords: "ücret fiyat free bedava price premium abonelik subscription reklam ads",
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
            body: { TR: parts.map((part) => `• ${part.TR}`).join("\n"), EN: parts.map((part) => `• ${part.EN}`).join("\n") },
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
    return `${entry.title.TR} ${entry.title.EN} ${entry.title.TR} ${entry.title.EN} ${entry.keywords ?? ""} ${entry.body.TR} ${entry.body.EN}`;
}
