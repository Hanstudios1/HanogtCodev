import type { Copy } from "@/lib/i18n";
import { isOperatorPublished, type OperatorInfo } from "@/lib/legal-info";

/**
 * Version metadata shared by the legal pages (src/components/LegalPage.tsx) and
 * the in-app notice (src/components/PrivacyPolicyModal.tsx). Dates and change
 * notes are { TR, EN } copy so they follow the interface language; the Turkish
 * text prevails.
 */
export const LEGAL_VERSION = "4.5";
export const LEGAL_EFFECTIVE_DATE: Copy = { TR: "3 Ekim 2026", EN: "3 October 2026" };
/** Stored in the browser when the user acknowledges the notice; a new id re-shows the notice. */
export const LEGAL_NOTICE_ID = "4.5-2026-10-03";

/** Labels of the operator's details: the card on every legal page and the data controller tables. */
export const OPERATOR_LABELS = {
    legalName: { TR: "Ticari unvan / ad soyad", EN: "Trade name / full name" },
    brand: { TR: "Marka", EN: "Brand" },
    taxId: { TR: "MERSİS / VKN", EN: "MERSİS / tax number" },
    address: { TR: "Açık adres", EN: "Address" },
    kep: { TR: "KEP adresi", EN: "Registered e-mail address (KEP)" },
    contactEmail: { TR: "İletişim e-postası", EN: "Contact e-mail" },
} satisfies Record<string, Copy>;

const TO_BE_PUBLISHED: Copy = { TR: "[Yayımlanacak]", EN: "[To be published]" };
const REQUEST_CHANNEL: Copy = { TR: "Giriş yapmış olarak [Geri Bildirim ve SSS](/feedback) → “Talep oluştur” → “İstek” kategorisi", EN: "While signed in: [Feedback & FAQ](/feedback) → “Create a ticket” → “Request” category" };

/**
 * Rows of the data controller table in the Privacy Policy and the KVKK notice.
 * Until the owner publishes the operator's details (Admin Panel), every value
 * reads "[To be published]"; afterwards the published values are shown verbatim
 * and optional details that were left empty (MERSİS/VKN, KEP) are omitted.
 */
export function controllerTableRows(operator: OperatorInfo): Array<Array<Copy | string>> {
    if (!isOperatorPublished(operator)) {
        return [
            [OPERATOR_LABELS.legalName, TO_BE_PUBLISHED],
            [OPERATOR_LABELS.taxId, TO_BE_PUBLISHED],
            [OPERATOR_LABELS.address, TO_BE_PUBLISHED],
            [OPERATOR_LABELS.kep, TO_BE_PUBLISHED],
            [OPERATOR_LABELS.contactEmail, TO_BE_PUBLISHED],
            [{ TR: "Şu an kullanılabilen başvuru kanalı", EN: "Request channel available now" }, REQUEST_CHANNEL],
        ];
    }
    return [
        [OPERATOR_LABELS.legalName, operator.legalName],
        ...(operator.taxId ? [[OPERATOR_LABELS.taxId, operator.taxId]] : []),
        [OPERATOR_LABELS.address, operator.address || TO_BE_PUBLISHED],
        ...(operator.kep ? [[OPERATOR_LABELS.kep, operator.kep]] : []),
        [OPERATOR_LABELS.contactEmail, operator.contactEmail],
        [{ TR: "Uygulama içi başvuru kanalı", EN: "In-app request channel" }, REQUEST_CHANNEL],
    ];
}

export type LegalChange = { version: string; date: Copy; items: Copy[] };

/** Newest first. The first entry is listed in the notice shown after an update. */
export const LEGAL_CHANGES: LegalChange[] = [
    {
        version: "4.5",
        date: { TR: "3 Ekim 2026", EN: "3 October 2026" },
        items: [
            { TR: "Plan avantajları güncellendi: Kullanım Şartları'ndaki liste artık Hanogt AI'ın en uzun yanıtını, okuduğu dosya uzunluğunu ve kişisel talimat sınırını, Hanogt Social grup sayısını, ekiple düzenlemedeki kişi sınırını (Ücretsiz 2, Plus 5, Pro 30), kendi anahtarınızla mesaj sınırlarını, geliştirici API'sini, profil rozetini, Pro'da destek önceliğini ve yeni özelliklere erken erişimi kapsıyor; daha düşük bir plana geçildiğinde bunlara ne olduğu açıklandı.", EN: "Plan benefits updated: the list in the Terms of Use now covers Hanogt AI's longest answer, how much of a file it reads and the personal instruction limit, the number of Hanogt Social groups, the team editing limit (Free 2, Plus 5, Pro 30), the message limits for your own keys, the developer API, the profile badge, Pro's support priority and early access to new features, and explains what happens to them when you move to a lower plan." },
            { TR: "Yeni “Hanogt AI API” bölümü: Plus ve Pro'da anahtarla kullanılan geliştirici API'si için anahtarın gizli tutulması, kotalar, yeniden satış yasağı ve kötüye kullanımda anahtarların iptal edilmesi kuralları eklendi. Gizlilik Politikası'na anahtarların yalnızca SHA-256 özetiyle saklandığı ve API isteklerinin yanıt üretmek için dil modeli sağlayıcısına iletilip sunucularımızda saklanmadığı eklendi.", EN: "New “Hanogt AI API” section: added the rules for the developer API used with keys on Plus and Pro: keeping keys secret, quotas, no reselling, and keys being revoked for abuse. The Privacy Policy now says that keys are stored only as SHA-256 digests and that API requests are passed to the language model provider to generate answers and not stored on our servers." },
            { TR: "Plan rozeti ve destek önceliği: Plus ve Pro abonelerinin herkese açık profilinde plan rozeti gösterildiği ve rozetin Planlar sayfasından veya Hesap Ayarları'ndan gizlenebildiği; destek taleplerine talep anındaki planın kaydedildiği ve talebin önceliğini belirlediği açıklandı.", EN: "Plan badge and support priority: explained that Plus and Pro subscribers' public profiles show a plan badge, which can be hidden on the Plans page or in Account Settings, and that a support ticket records the plan at the time and that this sets the ticket's priority." },
            { TR: "Hanogt AI ayarları ve ses: kişisel talimatlarınızın ve tercihlerinizin (üslup, yanıt uzunluğu, dil, sohbet varsayılanları) hesabınızda saklandığı ve her mesajla dil modeli sağlayıcısına iletildiği; erken erişimdeki sesle yazma ve sesli dinlemenin tarayıcınızın konuşma hizmetini kullandığı ve sesinizin Hanogt'a gönderilmediği açıklandı.", EN: "Hanogt AI settings and voice: explained that your personal instructions and preferences (tone, answer length, language, chat defaults) are stored in your account and passed to the language model provider with every message, and that dictation and answers read aloud, in early access, use your browser's speech service and your voice is not sent to Hanogt." },
            { TR: "Yeni “Erken erişim ve beta” bölümü: Pro'da ve ekipte önce açılan özelliklerin deneme niteliğinde olduğu, değişebileceği, herkese açılabileceği veya kaldırılabileceği açıklandı. Çerez ve tarayıcı depolama tablosuna Hanogt AI ve plan değişikliği anahtarları eklendi.", EN: "New “Early access and beta” section: explained that features opened first on Pro and for staff are trials and may change, open to everyone or be removed. Added the Hanogt AI and plan change keys to the cookie and browser storage table." },
        ],
    },
    {
        version: "4.4",
        date: { TR: "2 Ekim 2026", EN: "2 October 2026" },
        items: [
            { TR: "Ücretli planlar: Plus ve Pro, Paddle üzerinden aylık veya yıllık abonelik olarak satılıyor. Paddle.com siparişlerin Kayıtlı Satıcısıdır (Merchant of Record); ödemeyi, faturayı, vergileri ve iadeleri o yürütür. Kullanım Şartları'na planların avantajları ve sınırları (Hanogt AI mesajları, proje sayısı, kendi yapay zekâ bağlantıları), otomatik yenileme, fiyat ve plan değişikliği, iptal ve başarısız ödeme kuralları eklendi.", EN: "Paid plans: Plus and Pro are sold through Paddle as monthly or yearly subscriptions. Paddle.com is the Merchant of Record for our orders and handles payment, invoices, taxes and refunds. The Terms of Use now cover the plans' benefits and limits (Hanogt AI messages, number of projects, your own AI connections), automatic renewal, price and plan changes, cancellation and failed payments." },
            { TR: "Yeni İade Politikası: bir aboneliğin ilk ödemesinden sonraki 14 gün içinde para iade güvencesi, yenileme ödemelerinin hangi durumlarda iade edildiği, iadenin nasıl isteneceği ve ne kadar sürdüğü açıklandı.", EN: "New Refund Policy: explained the 14-day money-back guarantee on a subscription's first payment, when renewal payments are refunded, how to ask for a refund and how long it takes." },
            { TR: "Gizlilik Politikası ve KVKK Aydınlatma Metni: Paddle'a hangi verilerin neden iletildiği, ödeme ekranına girilen bilgilerin doğrudan Paddle tarafından toplandığı, Birleşik Krallık'a aktarım ve abonelik kayıtlarının saklanması (hesap silindikten sonra e-posta adresi olmadan tutulan Paddle müşteri kimliği dahil) eklendi.", EN: "Privacy Policy and KVKK Information Notice: added which data is passed to Paddle and why, that the details entered at checkout are collected by Paddle directly, the transfer to the United Kingdom and how subscription records are kept (including the Paddle customer ID kept without an e-mail address after an account is deleted)." },
            { TR: "Kendi yapay zekâ bağlantıları: Plus ve Pro'da Hanogt AI'a kendi API anahtarıyla bağlanan bir sağlayıcı kullanıldığında mesajların doğrudan o sağlayıcıya iletildiği, anahtarın AES-256-GCM ile şifrelenerek saklandığı, bir daha gösterilmediği ve bağlantı kaldırıldığında ya da hesap silindiğinde silindiği açıklandı.", EN: "Your own AI connections: explained that on Plus and Pro, messages sent through an AI provider connected with your own API key go directly to that provider, and that the key is stored encrypted with AES-256-GCM, never shown again and deleted when the connection is removed or the account is deleted." },
            { TR: "İşletmecinin unvanı, adresi ve iletişim bilgileri yayımlandığında tüm yasal metinlerin başında gösteriliyor ve metinler yeni İletişim sayfasına bağlanıyor. Hanogt AI kullanım sınırları planlara göre güncellendi.", EN: "Once published, the operator's legal name, address and contact details are shown at the top of every legal text, and the texts link to the new Contact page. Hanogt AI usage limits were updated for each plan." },
        ],
    },
    {
        version: "4.3",
        date: { TR: "2 Ekim 2026", EN: "2 October 2026" },
        items: [
            { TR: "Hanogt Arcade: oyunlar artık yalnızca yapımcı “Remikslemelere izin ver” seçeneğini açtıysa remikslenebiliyor; remiksler orijinal oyunun adını ve yazarını atıf olarak taşıyor ve izinsiz kopyalar Şikayet talebiyle bildirilebiliyor.", EN: "Hanogt Arcade: games can now be remixed only if the author turned on “Allow remixes”; remixes carry the original game's title and author as attribution, and unauthorised copies can be reported with a Complaint ticket." },
            { TR: "Planlar (Yakında): ödeme alınmadığı, ekibin planları elle tanımlayıp geri alabildiği, planın canlı avantajları (Hanogt AI sınırı, destek önceliği), “Açılınca haber ver” kaydı ve bu kayıtların saklanması açıklandı.", EN: "Plans (Coming soon): explained that no payments are taken, that staff can assign and take back plans by hand, a plan's live benefits (Hanogt AI limit, support priority), the “Notify me” record and how these records are kept." },
        ],
    },
    {
        version: "4.2",
        date: { TR: "2 Ekim 2026", EN: "2 October 2026" },
        items: [
            { TR: "Hanogt Social: arkadaşlar, direkt mesajlar ve grupların tek ekranda birleştiği; gerçek zamanlı bağlantı kurulamadığında sohbetlerin aynı erişim kurallarıyla sunucu üzerinden çalıştığı ve hangi tercihlerin yalnızca tarayıcıda tutulduğu açıklandı.", EN: "Hanogt Social: explained that friends, direct messages and groups now share one screen, that chats work through our server under the same access rules when the real-time connection can't be set up, and which preferences stay only in your browser." },
            { TR: "Durum (Çevrimiçi, Boşta, Rahatsız Etmeyin, Görünmez): seçtiğiniz durumun gizli tutulduğu, başkalarının yalnızca ortaya çıkan durumu gördüğü, sekmelerin rastgele kimlikle bildirim gönderdiği ve Rahatsız Etmeyin'de aramaların çalmadığı açıklandı.", EN: "Status (Online, Idle, Do Not Disturb, Invisible): explained that the status you choose stays private, that others see only the resulting status, that tabs report under random IDs and that calls don't ring during Do Not Disturb." },
            { TR: "Hanogt News piyasa şeridinin veri kaynakları (TCMB, gold-api.com, Yahoo Finance, CoinGecko) eklendi; verilerin gecikmeli olabileceği ve yatırım tavsiyesi olmadığı belirtildi. Topluluk rakamlarının yalnızca toplam sayılar olduğu açıklandı.", EN: "Added the data sources of the Hanogt News market strip (TCMB, gold-api.com, Yahoo Finance, CoinGecko) and stated that the data may be delayed and is not investment advice. Explained that the community numbers are totals only." },
            { TR: "İki adımlı doğrulamaya erişimini kaybedenler için giriş ekranındaki kurtarma talebi açıklandı; TURN aktarma sunucusunun gördüğü geçici kullanıcı adının e-posta adresinizi değil, ondan tuzla türetilen bir takma kimliği içerdiği düzeltildi.", EN: "Explained the recovery request on the sign-in screen for people who lost access to two-step verification, and corrected that the temporary username the TURN relay sees contains a salted pseudonymous ID, not your e-mail address." },
            { TR: "Tarayıcıda çalışan diller (Prolog, Forth, BASIC, Befunge, Whitespace, MIPS), dosya doğrulayıcıları ve SVG, Mermaid ve LaTeX önizlemeleri kod çalıştırma bölümüne eklendi; tarayıcı depolama tablosuna Social ve durum anahtarları eklendi.", EN: "Added the in-browser languages (Prolog, Forth, BASIC, Befunge, Whitespace, MIPS), the file validators and the SVG, Mermaid and LaTeX previews to the code execution section, and the Social and status keys to the browser storage table." },
            { TR: "Ekiple düzenleme: yalnızca arkadaşların davet edilebildiği, en fazla 5 kişilik canlı oturumlarda katılımcıların gördüğü bilgiler, sohbet ve kaydedilmeyen sesli görüşme, oturum verilerinin saklama süreleri (en fazla 12 saat, son hâl 24 saat) ve oturum kuralları eklendi.", EN: "Team editing: added what participants see in live sessions of up to 5 people to which only friends can be invited, the chat and the unrecorded voice call, how long session data is kept (at most 12 hours, the final state 24 hours) and the session rules." },
        ],
    },
    {
        version: "4.1",
        date: { TR: "2 Ekim 2026", EN: "2 October 2026" },
        items: [
            { TR: "Destek talebi kategorileri altıya indi: Şikayet, İstek, Güvenlik Açığı, Ban Kaldırma İsteği, Soru ve Geri Bildirim. KVKK başvuruları artık “İstek” kategorisinden yapılıyor.", EN: "Support tickets now have six categories: Complaint, Request, Security vulnerability, Unban request, Question and Feedback. KVKK requests are now made in the “Request” category." },
            { TR: "Askıya alınan hesaplar, şifre veya Google ile kimliklerini doğruladıktan sonra giriş sayfasındaki formdan itiraz edebiliyor; itiraz “Ban Kaldırma İsteği” talebi olarak ekibe iletiliyor.", EN: "Suspended accounts can appeal from the form on the sign-in page after verifying themselves with their password or Google; the appeal reaches the team as an “Unban request” ticket." },
            { TR: "Yeni destek taleplerinde ekip üyelerine bildirim gönderildiği ve talep türüne göre toplanan ek alanlar (ör. şikayet konusu, yasaklanan hesap veya grup) açıklandı.", EN: "Explained that staff are notified about new support tickets and which extra fields are collected per ticket type (e.g. the subject of a complaint, the banned account or group)." },
            { TR: "İlk ziyarette arayüz dili, henüz bir dil seçmediyseniz ülke kodunuza ve tarayıcınızın dil ayarına göre belirleniyor; ülke kodu saklanmıyor.", EN: "On your first visit, if you haven't chosen a language yet, the interface language is picked from your country code and your browser's language setting; the country code is not stored." },
        ],
    },
    {
        version: "4.0",
        date: { TR: "1 Ekim 2026", EN: "1 October 2026" },
        items: [
            { TR: "Gizlilik Politikası, KVKK Aydınlatma Metni ve Kullanım Şartları baştan yazılarak ayrıntılandırıldı; metinler artık Türkçe ve İngilizce eksiksiz sunuluyor, diğer dillerde çeviri olarak gösteriliyor ve Türkçe sürüm esas alınıyor.", EN: "Rewrote and expanded the Privacy Policy, the KVKK Information Notice and the Terms of Use; the texts are now complete in Turkish and English, shown as translations in other languages, and the Turkish version prevails." },
            { TR: "Hesap güvenliği: iki adımlı doğrulama (AES-256-GCM ile şifrelenen TOTP anahtarı, HMAC özetiyle saklanan kurtarma kodları), oturum çerezi ve Google ile giriş ayrıntılandırıldı.", EN: "Account security: detailed two-step verification (TOTP secret encrypted with AES-256-GCM, recovery codes stored as HMAC digests), the session cookie and Google sign-in." },
            { TR: "Hanogt AI ajan modu eklendi: hangi işlemleri yalnızca izninizle yapabildiği ve bu işlemlerin sonuçlarının dil modeli sağlayıcısına iletilebileceği açıklandı.", EN: "Added Hanogt AI agent mode: which actions it can take only with your permission, and that their results may be passed to the language model provider." },
            { TR: "Destek talepleri: kategoriler, ekibin görebildiği bilgiler ve saklama; KVKK başvuruları ve itirazlar için “Hesap / KVKK” kategorisi açıklandı.", EN: "Support tickets: explained the categories, what staff can see and retention, and the “Account / KVKK” category for KVKK requests and appeals." },
            { TR: "Yönetim ve moderasyon: ekip rolleri, denetim kaydı, askıya alma, kural ihlalinde içerik veya hesap silme ve itiraz yolu eklendi.", EN: "Administration and moderation: added staff roles, the audit log, suspension, deletion of content or accounts for rule violations and how to appeal." },
            { TR: "Kullanım Şartları: kod çalıştırıcının kötüye kullanılması yasağı, sorumlu güvenlik araştırması (iyi niyet güvencesi), Media lisansları, yapay zekâ çıktıları ve 6502 sayılı Kanun'la uyumlu sorumluluk hükümleri eklendi.", EN: "Terms of Use: added the ban on abusing the code runner, responsible security research (good-faith safe harbour), Media licences, AI output and liability terms consistent with Consumer Protection Law No. 6502." },
            { TR: "Hanogt Media: kod editöründen doğrudan yayımlama, yayınların güncellenmesi veya kaldırılması ve lisans değişikliğinin etkisi açıklandı.", EN: "Hanogt Media: explained publishing directly from the code editor, updating or removing posts, and the effect of changing the licence." },
            { TR: "Yurt dışına aktarım, 2024'te değişen KVKK m.9'a göre yeniden yazıldı; alıcılar tablosu (Google Firebase, Vercel, dil modeli sağlayıcısı, derleyiciler, STUN/TURN) güncellendi.", EN: "Rewrote international transfers under KVKK Art. 9 as amended in 2024 and updated the recipients table (Google Firebase, Vercel, the language model provider, compilers, STUN/TURN)." },
            { TR: "Saklama süreleri ile çerez ve tarayıcı depolama tabloları koddaki gerçek anahtarlara göre güncellendi; çevrimiçi durum, bildirimler, sesli aramalar ve TURN aktarımı açıklandı.", EN: "Updated the retention table and the cookie and browser storage table to match the keys actually used in the code; explained online status, notifications, voice calls and TURN relaying." },
        ],
    },
    {
        version: "3.1",
        date: { TR: "1 Ekim 2026", EN: "1 October 2026" },
        items: [
            { TR: "Hanogt AI: tarayıcıda çalışan Çekirdek ile giriş yapınca kullanılan dil modelinin hangi verileri, hangi sağlayıcıya, ne amaçla ilettiği ve sohbet geçmişinin yalnızca tarayıcıda saklandığı açıklandı.", EN: "Hanogt AI: explained the in-browser Core and, for signed-in use, which data the language model receives, which provider receives it and why, and that chat history is kept only in the browser." },
            { TR: "Security Bot'un sohbet etmeyen, sunucu tarafı bir ön eleme olduğu netleştirildi.", EN: "Clarified that Security Bot is a server-side pre-screen and does not chat." },
            { TR: "Oturum çerezinin adı ve süresi (90 gün, her ziyarette yenilenir) güncellendi; tarayıcı depolama tablosuna Hanogt AI anahtarları eklendi.", EN: "Updated the session cookie's name and lifetime (90 days, renewed on every visit) and added the Hanogt AI keys to the browser storage table." },
        ],
    },
    {
        version: "3.0",
        date: { TR: "27 Eylül 2026", EN: "27 September 2026" },
        items: [
            { TR: "Hanogt News: haber toplama yöntemi, üçüncü taraf içeriklere ilişkin ilkeler, yorum verileri ve otomatik moderasyon eklendi.", EN: "Hanogt News: added how news is collected, principles for third-party content, comment data and automatic moderation." },
            { TR: "Yapay zeka arenası: oyların tuzlanmış takma kimlikle saklanması ve dış sıralama kaynakları açıklandı.", EN: "AI arena: explained that votes are stored under a salted pseudonymous ID, and the external ranking sources." },
            { TR: "Hanogt Arcade: oyun yayınlama, beğeni, oynanma sayısı, remiks ve kaldırma kuralları eklendi.", EN: "Hanogt Arcade: added the rules for publishing games, likes, play counts, remixes and removal." },
            { TR: "Hanogt Engine v2: bulut ve tarayıcı (IndexedDB) kaydı, HTML dışa aktarım ve script sanal makinesi açıklandı.", EN: "Hanogt Engine v2: explained cloud and in-browser (IndexedDB) saving, HTML export and the script virtual machine." },
            { TR: "Güvenlik Merkezi ve Security Bot v6: yerel analiz, k-anonim parola sızıntı kontrolü ve ilgili aktarım açıklandı.", EN: "Security Center and Security Bot v6: explained local analysis, the k-anonymous password breach check and the related transfer." },
            { TR: "Tarayıcı depolama tablosu (çerez ve yerel depolama anahtarları) ile saklama süreleri tablosu eklendi.", EN: "Added the browser storage table (cookie and local storage keys) and the retention table." },
        ],
    },
    {
        version: "2.0",
        date: { TR: "3 Eylül 2026", EN: "3 September 2026" },
        items: [
            { TR: "Hanogt Media, gruplar ve Security Bot katkı programı açıklamaları eklendi.", EN: "Added descriptions of Hanogt Media, groups and the Security Bot contribution programme." },
            { TR: "KVKK m.11 hakları, başvuru usulü ve otomatik karar itiraz yolu ayrıntılandırıldı.", EN: "Detailed the rights under KVKK Art. 11, how to make a request and how to object to automated decisions." },
        ],
    },
];
