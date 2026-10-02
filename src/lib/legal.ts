import type { Copy } from "@/lib/i18n";

/**
 * Version metadata shared by the legal pages (src/components/LegalPage.tsx) and
 * the in-app notice (src/components/PrivacyPolicyModal.tsx). Dates and change
 * notes are { TR, EN } copy so they follow the interface language; the Turkish
 * text prevails.
 */
export const LEGAL_VERSION = "4.2";
export const LEGAL_EFFECTIVE_DATE: Copy = { TR: "2 Ekim 2026", EN: "2 October 2026" };
/** Stored in the browser when the user acknowledges the notice; a new id re-shows the notice. */
export const LEGAL_NOTICE_ID = "4.2-2026-10-02";

export type LegalChange = { version: string; date: Copy; items: Copy[] };

/** Newest first. The first entry is listed in the notice shown after an update. */
export const LEGAL_CHANGES: LegalChange[] = [
    {
        version: "4.2",
        date: { TR: "2 Ekim 2026", EN: "2 October 2026" },
        items: [
            { TR: "Hanogt Social: arkadaşlar, direkt mesajlar ve grupların tek ekranda birleştiği; gerçek zamanlı bağlantı kurulamadığında sohbetlerin aynı erişim kurallarıyla sunucu üzerinden çalıştığı ve hangi tercihlerin yalnızca tarayıcıda tutulduğu açıklandı.", EN: "Hanogt Social: explained that friends, direct messages and groups now share one screen, that chats work through our server under the same access rules when the real-time connection can't be set up, and which preferences stay only in your browser." },
            { TR: "Durum (Çevrimiçi, Boşta, Rahatsız Etmeyin, Görünmez): seçtiğiniz durumun gizli tutulduğu, başkalarının yalnızca ortaya çıkan durumu gördüğü, sekmelerin rastgele kimlikle bildirim gönderdiği ve Rahatsız Etmeyin'de aramaların çalmadığı açıklandı.", EN: "Status (Online, Idle, Do Not Disturb, Invisible): explained that the status you choose stays private, that others see only the resulting status, that tabs report under random IDs and that calls don't ring during Do Not Disturb." },
            { TR: "Hanogt News piyasa şeridinin veri kaynakları (TCMB, gold-api.com, Yahoo Finance, CoinGecko) eklendi; verilerin gecikmeli olabileceği ve yatırım tavsiyesi olmadığı belirtildi. Topluluk rakamlarının yalnızca toplam sayılar olduğu açıklandı.", EN: "Added the data sources of the Hanogt News market strip (TCMB, gold-api.com, Yahoo Finance, CoinGecko) and stated that the data may be delayed and is not investment advice. Explained that the community numbers are totals only." },
            { TR: "İki adımlı doğrulamaya erişimini kaybedenler için giriş ekranındaki kurtarma talebi açıklandı; TURN aktarma sunucusunun gördüğü geçici kullanıcı adının e-posta adresinizi değil, ondan tuzla türetilen bir takma kimliği içerdiği düzeltildi.", EN: "Explained the recovery request on the sign-in screen for people who lost access to two-step verification, and corrected that the temporary username the TURN relay sees contains a salted pseudonymous ID, not your e-mail address." },
            { TR: "Tarayıcıda çalışan diller (Prolog, Forth, BASIC, Befunge, Whitespace, MIPS), dosya doğrulayıcıları ve SVG, Mermaid ve LaTeX önizlemeleri kod çalıştırma bölümüne eklendi; tarayıcı depolama tablosuna Social ve durum anahtarları eklendi.", EN: "Added the in-browser languages (Prolog, Forth, BASIC, Befunge, Whitespace, MIPS), the file validators and the SVG, Mermaid and LaTeX previews to the code execution section, and the Social and status keys to the browser storage table." },
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
