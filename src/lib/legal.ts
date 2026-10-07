import type { Copy } from "@/lib/i18n";
import { isOperatorPublished, type OperatorInfo } from "@/lib/legal-info";

/**
 * Version metadata shared by the legal pages (src/components/LegalPage.tsx) and
 * the in-app notice (src/components/PrivacyPolicyModal.tsx). Dates and change
 * notes are { TR, EN } copy so they follow the interface language; the Turkish
 * text prevails.
 */
export const LEGAL_VERSION = "5.8";
export const LEGAL_EFFECTIVE_DATE: Copy = { TR: "7 Ekim 2026", EN: "7 October 2026" };
/** Stored in the browser when the user acknowledges the notice; a new id re-shows the notice. */
export const LEGAL_NOTICE_ID = "5.8-2026-10-07";

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

/** Dotted version numbers compared part by part ("4.10" comes after "4.9"). */
function compareVersions(a: string, b: string) {
    const left = a.split(".").map(Number);
    const right = b.split(".").map(Number);
    for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
        const difference = (left[index] ?? 0) - (right[index] ?? 0);
        if (difference) return difference;
    }
    return 0;
}

/**
 * What the notice lists for a browser that acknowledged `noticeId` (the
 * LEGAL_NOTICE_ID of that time, e.g. "4.4-2026-10-02"): every version
 * published since, newest first and at most `max`, so a visitor who missed one
 * still sees its changes. The latest alone when the stored id says nothing usable.
 */
export function legalChangesSince(noticeId: string | null, max = 3): LegalChange[] {
    const seen = /^(\d+(?:\.\d+)*)-/.exec(noticeId ?? "")?.[1];
    const newer = seen ? LEGAL_CHANGES.filter((change) => compareVersions(change.version, seen) > 0) : [];
    return (newer.length ? newer : LEGAL_CHANGES.slice(0, 1)).slice(0, Math.max(1, max));
}

/** Newest first. The first entry is listed in the notice shown after an update. */
export const LEGAL_CHANGES: LegalChange[] = [
    {
        version: "5.8",
        date: { TR: "7 Ekim 2026", EN: "7 October 2026" },
        items: [
            { TR: "Ücretli planlara yeni avantajlar (Ücretsiz plan değişmedi): Plus ve Pro'da sunucuda daha büyük kod çalıştırma (dosya başına 100.000 veya 200.000 karakter kod, daha uzun girdi ve çıktı), Hanogt Social'da daha uzun mesajlar (6.000 veya 8.000 karakter), gruplarda Hanogt AI'dan daha uzun yanıtlar (2.000 veya 3.000 token; soruyla birlikte kanalın son 20 veya 30 mesajı okunur), 24 veya 48 saat süren ve 40 veya 100 dosya tutan ekiple düzenleme oturumları ve Hanogt Engine oyunlarını “Hanogt Engine ile yapıldı” rozeti olmadan dışa aktarabilme. Daha düşük bir plana geçtiğinizde gönderilmiş mesajlar, dışa aktarılmış oyunlar ve başlamış oturumlar olduğu gibi kalır; yeni mesajlar, çalıştırmalar ve oturumlar yeni planın sınırlarıyla çalışır. Kullanım Şartları'ndaki plan avantajları listesi ile Gizlilik Politikası'ndaki oturum süreleri ve gruplarda yapay zekâya gönderilen mesaj sayısı buna göre güncellendi.", EN: "New benefits on paid plans (the Free plan is unchanged): on Plus and Pro, bigger code runs on the server (100,000 or 200,000 characters of code per file, longer input and output), longer messages in Hanogt Social (6,000 or 8,000 characters), longer Hanogt AI answers in groups (2,000 or 3,000 tokens, with the channel's last 20 or 30 messages read along with the question), team editing sessions that last 24 or 48 hours and hold 40 or 100 files, and exporting Hanogt Engine games without the “Made with Hanogt Engine” badge. When you move to a lower plan, messages already sent, games already exported and sessions already started stay as they are; new messages, runs and sessions follow the new plan's limits. The list of plan benefits in the Terms of Use, and the session lengths and the number of messages sent to the AI in groups in the Privacy Policy, were updated accordingly." },
            { TR: "Hesap Ayarları: Hiçbir yerde uygulanmayan tercihler (e-posta bildirimleri ve yeni özellik duyuruları, beğeni bildirimleri, bildirim sesi, sessiz saatler, bağlantı önizlemeleri, çıkartma önerileri, sohbet baloncuğu rengi, fotoğraf görünürlüğü ve arkadaş listesini gizleme; arkadaş listeniz zaten kimseye gösterilmiyor) kaldırıldı. Bunlar artık toplanmaz; kayıtlı değerleri, ayarlarınızı bir sonraki kaydedişinizde silinir.", EN: "Account Settings: preferences that were never applied anywhere (e-mail notifications and new-feature announcements, like notifications, a notification sound, quiet hours, link previews, sticker suggestions, the chat bubble colour, photo visibility and hiding the friend list; your friend list isn't shown to anyone anyway) were removed. They are no longer collected, and their stored values are deleted the next time you save your settings." },
        ],
    },
    {
        version: "5.7",
        date: { TR: "6 Ekim 2026", EN: "6 October 2026" },
        items: [
            { TR: "Hanogt Social grup kuralları: Bir grubun sahibi ve yöneticileri madde madde kurallar yazabilir ve üyelerden yazmadan, tepki vermeden veya sesli kanala katılmadan önce bu kuralları kabul etmelerini isteyebilir. Kabul ettiğiniz kural sürümü, e-posta adresiniz yerine gruba özel takma anahtarınızla grubun kaydında tutulur; gruptan ayrıldığınızda, çıkarıldığınızda veya hesabınızı sildiğinizde silinir. Grup kuralları bu Şartlarla çelişemez ve içeriklerinden grubun sahibi ve yöneticileri sorumludur. Gizlilik Politikası ve Kullanım Şartları buna göre güncellendi.", EN: "Hanogt Social group rules: a group's owner and admins can write rules point by point and ask members to accept them before they post, react or join the voice channel. The rules version you accepted is kept in the group's record under your group-specific pseudonymous key instead of your e-mail address, and is deleted when you leave the group, are removed or delete your account. Group rules can't contradict these Terms, and the group's owner and admins are responsible for their content. The Privacy Policy and the Terms of Use were updated accordingly." },
            { TR: "Hanogt AI ayarları: Yaratıcılık düzeyi, yeni sohbetlerin bu tarayıcıda saklanıp saklanmayacağı ve yanıt hazır olunca bildirim isteyip istemediğiniz de hesabınızla saklanır. “Yeni sohbetleri sakla” kapalıyken sohbetler hiçbir yerde saklanmaz; bildirimler yalnızca cihazınızda gösterilir.", EN: "Hanogt AI settings: the creativity level, whether new chats are kept in this browser and whether you want a notification when an answer is ready are also stored with your account. With “Keep new chats” off, chats are not stored anywhere; notifications are shown only on your device." },
        ],
    },
    {
        version: "5.6",
        date: { TR: "6 Ekim 2026", EN: "6 October 2026" },
        items: [
            { TR: "Hanogt News yalnızca son 24 saati tutar: Eski haber arşivi kaldırıldı. Bir günden eski haberler ve haber yorumları, yazıldıktan 24 saat sonra sunucumuzdan kendiliğinden silinir; yorumunuzu daha önce de silebilirsiniz. Gizlilik Politikası'ndaki saklama süreleri tablosu buna göre güncellendi.", EN: "Hanogt News keeps only the last 24 hours: the old news archive has been removed. Stories older than a day, and news comments 24 hours after they were written, are deleted from our server automatically; you can still delete your comment sooner. The retention table in the Privacy Policy was updated accordingly." },
        ],
    },
    {
        version: "5.5",
        date: { TR: "6 Ekim 2026", EN: "6 October 2026" },
        items: [
            { TR: "Hanogt AI'ın günlük kullanım toplamları: Ekibin hizmetin kapasitesini planlayabilmesi için her gün sayılan Hanogt AI mesajlarının toplamı, kaynağa (sohbet, kendi bağlantılarınız, API, gruplar) ve plana göre sayıları ve yanıt alınamadığı için iade edilen mesaj sayısı tutulur. Bu toplamlar kimin mesaj gönderdiğini ve mesajların içeriğini içermez; yaklaşık 13 ay sonra otomatik silinir.", EN: "Hanogt AI's daily usage totals: so the team can plan the service's capacity, the number of Hanogt AI messages counted each day, the counts by source (chat, your own connections, the API, groups) and by plan, and the number of messages given back because no answer came are kept. These totals don't include who sent a message or what it said; they are deleted automatically after about 13 months." },
            { TR: "Yönetici Paneli'nde Hanogt Social: Ekip, Social için yalnızca toplam sayıları (gruplar, sohbetler, açık sesli kanallar, raporlar, AutoMod'un durdurduğu mesajlar ve kurallara göre dağılımı, dosyalar) ve en çok açık raporu olan grupların adlarını görür; bu özette raporlayan, raporlanan veya mesaj gösterilmez.", EN: "Hanogt Social in the Admin Panel: for Social, staff see only totals (groups, chats, live voice channels, reports, messages AutoMod stopped and their split by rule, files) and the names of the groups with the most open reports; no reporter, reported person or message is shown in this summary." },
        ],
    },
    {
        version: "5.4",
        date: { TR: "6 Ekim 2026", EN: "6 October 2026" },
        items: [
            { TR: "Mesajlarda dosyalar: Hanogt Social'da birebir ve grup mesajlarıyla görsel, video, ses, PDF, arşiv, ofis belgesi ve metin veya kod dosyası gönderebilirsiniz. Dosyalar mesajla birlikte Cloud Firestore'da tarayıcıların okuyamadığı bir koleksiyonda saklanır ve yalnızca mesajı görebilenler tarafından, mesaj durdukça açılabilir. Görsellerdeki konum ve cihaz gibi gömülü bilgiler saklanmadan önce silinir; diğer dosyaların içindeki bilgiler değiştirilmez ve dosyalar virüs taramasından geçirilmez. Dosya başına en fazla 2 MB (Ücretsiz) veya 4 MB (Plus ve Pro), toplam 25 MB, 250 MB veya 1 GB alan; mesaj, sohbet, grup veya hesap silindiğinde dosyalar da silinir. Kullanım Şartları'na dosyalarla ilgili kurallar, plan avantajları listesine dosya alanı eklendi.", EN: "Files in messages: in Hanogt Social you can send pictures, video, sound, PDFs, archives, office documents and text or code files in one-to-one and group messages. Files are stored with their message in Cloud Firestore, in a collection browsers can't read, and can be opened only by people who can see the message, while it is there. Location, device and similar details embedded in pictures are removed before they are stored; details inside other files are not changed and files are not scanned for viruses. Up to 2 MB per file (Free) or 4 MB (Plus and Pro), and 25 MB, 250 MB or 1 GB of space in all; files are deleted with their message, chat, group or account. Rules for files were added to the Terms of Use and file space to the list of plan benefits." },
            { TR: "Ekran paylaşımı ve sesli kanallar: Birebir aramalarda ekranınızı (yalnızca görüntü, ses olmadan) karşı tarafla paylaşabilir, grupların sesli kanalında en fazla 5 kişiyle konuşabilirsiniz. Ses ve görüntü mümkün olduğunda cihazlar arasında doğrudan ve şifreli taşınır, kaydedilmez. Sesli kanalda kimlerin bulunduğu, katılma zamanları ve mikrofon ya da kulaklık durumları grubun üyelerine gösterilir ve kanaldan çıkıldığında silinir; bağlantı kayıtları en çok 2 dakika tutulur. Sesli mesajların artık Cloud Firestore'da saklandığı da düzeltildi.", EN: "Screen sharing and voice channels: in one-to-one calls you can share your screen (picture only, no sound) with the other person, and you can talk with up to 5 people in a group's voice channel. Audio and video travel directly and encrypted between devices where possible and are not recorded. Who is in a voice channel, when they joined and whether their microphone or headphones are off are shown to the group's members and deleted when they leave; connection records are kept for at most 2 minutes. We also corrected that voice messages are now stored in Cloud Firestore." },
        ],
    },
    {
        version: "5.3",
        date: { TR: "6 Ekim 2026", EN: "6 October 2026" },
        items: [
            { TR: "Skor tabloları ve başarımlar (Hanogt Engine V5): Arcade'de giriş yapmış olarak oynadığınız oyunlarda her tablo için en iyi skorunuz; tuzlanmış takma kimliğiniz, o anki takma adınız (yoksa kullanıcı adınız), skor ve tarihle saklanır ve tablo herkese açık gösterilir. E-posta adresiniz gösterilmez ve kayıtta yer almaz. Açtığınız başarımlar yalnızca size gösterilir. Paylaşımı kapatabilir ve kaydınızı istediğiniz zaman kaldırabilirsiniz; bu kayıtlar hesap silmeye ve “Verilerimi İndir”e dahildir. Kullanım Şartları'na skorların doğrulanmadığı, sıralamaların ödül ya da hak doğurmadığı ve hile yasağı eklendi.", EN: "Leaderboards and achievements (Hanogt Engine V5): in games you play on the Arcade while signed in, your best score on each leaderboard is kept with your salted pseudonymous ID, your nickname at the time (or your username), the score and the date, and the leaderboard is shown publicly. Your e-mail address is never shown and isn't part of the entry. Achievements you unlock are shown only to you. You can turn sharing off and remove your entry at any time; these records are covered by account deletion and “Download my data”. The Terms of Use now say that scores are unverified, that rankings carry no prize or right, and that cheating is not allowed." },
            { TR: "Oyunlarda 3D modeller: Oyunlarınıza GLB model (dosya başına en fazla 300 KB) yükleyebilirsiniz. Modeller ses dosyalarıyla aynı oyun dosyası kitaplığında, içeriklerinden türetilen bir kimlikle saklanır ve planınızın oyun dosyası depolamasına sayılır; başka adreslere bağlanan ya da sıkıştırılmış modeller kabul edilmez. Oyunların SaveSystem kayıtları (oyun başına en fazla 512 KB) yalnızca tarayıcınızda tutulur.", EN: "3D models in games: you can upload GLB models (up to 300 KB each) to your games. Models are kept in the same game file library as sounds, under an identifier derived from their content, and count against your plan's game file storage; models that link to other addresses or are compressed are refused. Games' SaveSystem saves (at most 512 KB per game) are kept only in your browser." },
        ],
    },
    {
        version: "5.2",
        date: { TR: "6 Ekim 2026", EN: "6 October 2026" },
        items: [
            { TR: "Oyunlarda ses dosyaları: Hanogt Engine V4 ile oyunlarınıza WAV, MP3 veya OGG dosyası (dosya başına en fazla 300 KB) yükleyebilirsiniz. Giriş yaptığınızda dosyalar hesabınızın ses kitaplığına kaydedilir; her dosya içeriğinden türetilen bir kimlikle bir kez saklanır ve oyunların çalabilmesi için bu kimliği bilen herkes tarafından indirilebilir. Yayımlanan oyunların sesleri yayınla birlikte saklanır; hiçbir hesabın ve yayının kullanmadığı dosyalar silinir. Ses kitaplığınız “Verilerimi İndir” dosyasında yer alır.", EN: "Audio files in games: with Hanogt Engine V4 you can upload WAV, MP3 or OGG files (up to 300 KB each) to your games. When you are signed in, files are saved to your account's audio library; each file is stored once under an identifier derived from its content and can be downloaded by anyone who knows that identifier so games can play it. The sounds of published games are kept with the publication; files that no account or publication uses are deleted. Your audio library is included in the “Download My Data” file." },
            { TR: "Yeni plan avantajı ve kullanım kuralı: oyunlar için ses depolaması Ücretsiz planda 5 MB (30 dosya), Plus'ta 25 MB (150 dosya), Pro'da 100 MB (600 dosya). Yalnızca kullanma hakkına sahip olduğunuz sesleri yükleyebilirsiniz; Kullanım Şartları buna göre güncellendi.", EN: "New plan benefit and usage rule: audio storage for games is 5 MB (30 files) on Free, 25 MB (150 files) on Plus and 100 MB (600 files) on Pro. You may only upload sounds you have the right to use; the Terms of Use were updated accordingly." },
        ],
    },
    {
        version: "5.1",
        date: { TR: "6 Ekim 2026", EN: "6 October 2026" },
        items: [
            { TR: "Kendi API anahtarınızla bağlantılar: Plus ve Pro'da bu bağlantılarla gönderdiğiniz mesajların ayrı bir günlük sınırı kalmadı; sohbet, geliştirici API'si ve gruplardaki Hanogt AI ile aynı Hanogt AI mesaj hakkından düşüyor ve aynı sayaçla sayılıyor. Sağlayıcı yanıt vermezse mesaj hakkınıza geri ekleniyor.", EN: "Connections with your own API key: on Plus and Pro, messages through these connections no longer have a separate daily limit; they use the same Hanogt AI allowance as the chat, the developer API and Hanogt AI in groups and are counted by the same counter. If the provider doesn't answer, the message is given back." },
            { TR: "Yeni plan avantajları: kod editöründe tek seferde 8, 25 ya da 75 dosya çalıştırma (derlenen dillerde dakikada 40, 150 ya da 400 dosya); grubun sahibinin planına göre grup başına 25, 100 ya da 250 üye ile daha fazla sabitlenmiş mesaj, özel bot komutu ve AutoMod yasaklı kelimesi; 200, 500 ya da 1.000 yıldızlı mesaj. Plan düştüğünde hiçbir şey silinmiyor; yalnızca sınırın altına inene kadar yenisi eklenemiyor.", EN: "New plan benefits: running 8, 25 or 75 files at once in the code editor (40, 150 or 400 files a minute for compiled languages); depending on the group owner's plan, 25, 100 or 250 members per group with more pinned messages, custom bot commands and AutoMod banned words; and 200, 500 or 1,000 starred messages. Nothing is removed when a plan goes down; nothing new can be added until you are under the limit." },
            { TR: "Grup sınırları ve gizlilik: Bir grubun sınırları için yalnızca sahibinin plan seviyesi okunuyor ve plan bilgisi üyelere gönderilmiyor; ancak sınırlar üyelere ve davet önizlemesinde gösterildiğinden sahibin plan seviyesi bu sayılardan anlaşılabilir. Gizlilik Politikası ve Kullanım Şartları buna göre güncellendi.", EN: "Group limits and privacy: only the owner's plan level is read for a group's limits and the plan isn't sent to members; because the limits are shown to members and in invite previews, though, the owner's plan level can be inferred from them. The Privacy Policy and the Terms of Use are updated accordingly." },
        ],
    },
    {
        version: "5.0",
        date: { TR: "5 Ekim 2026", EN: "5 October 2026" },
        items: [
            { TR: "Hanogt Social mesajları: Birebir ve grup mesajları artık yalnızca sunucumuz üzerinden yazılıyor; Markdown biçimlendirmesi, GIF, iletme, yıldızlama ve sabitleme eklendi. Birebir mesajlardaki tepkiler, tepki veren katılımcıyla birlikte saklanıyor. Yıldızladığınız mesajlar (en fazla 200) yalnızca sizin görebildiğiniz bir listede kısa bir alıntıyla tutuluyor. Bir mesaj silindiğinde yanıtlardaki alıntısı ve yıldızlardaki kopyası da siliniyor, düzenlendiğinde güncelleniyor.", EN: "Hanogt Social messages: one-to-one and group messages are now written only through our server; Markdown formatting, GIFs, forwarding, starring and pinning were added. Reactions in one-to-one chats are stored with the participant who reacted. Messages you star (up to 200) are kept, with a short excerpt, in a list only you can see. When a message is deleted, its quote in replies and its copy in stars are deleted too, and when it is edited they are updated." },
            { TR: "GIF'ler: GIF araması sunucumuz üzerinden KLIPY (ABD) ya da GIPHY, Inc. (ABD) ile yapılıyor; sağlayıcıya yalnızca arama metni, sayfa, dil ve içerik derecelendirmesi gidiyor. GIF görselleri sağlayıcının sunucularından yüklendiği için bu sunucular IP adresinizi ve tarayıcı bilgilerinizi görebilir. Alıcılar, yurt dışına aktarım ve tarayıcı depolama tabloları buna göre güncellendi.", EN: "GIFs: GIF search goes through our server to KLIPY (USA) or GIPHY, Inc. (USA); only the search text, page, language and content rating are sent to the provider. Because GIF images load from the provider's servers, those servers can see your IP address and browser details. The recipients, international transfer and browser storage tables were updated accordingly." },
            { TR: "Grup moderasyonu: Hanogt Security Bot artık her grupta bulunan ve kaldırılamayan moderasyon botu; uyarılar ve raporlar 180 gün, susturmalar süreleri bitene kadar saklanıyor. AutoMod, grup mesajlarını kaydedilmeden önce grubun kurallarına göre otomatik olarak tarıyor ve kurala takılan mesajı durduruyor; durdurulan mesajın metni değil, yalnızca gönderen, kural ve zaman 90 gün saklanıyor. Otomatik kararlar ve itiraz bölümü buna göre güncellendi.", EN: "Group moderation: Hanogt Security Bot is now also the moderation bot of every group and can't be removed; warnings and reports are kept for 180 days and mutes until they end. AutoMod automatically scans group messages against the group's rules before they are saved and stops a message that breaks one; the text of a stopped message isn't kept, only the sender, the rule and the time, for 90 days. The automated decisions and objections section was updated accordingly." },
            { TR: "Gruplarda Hanogt AI: Bir grupta /ai ile ya da @Hanogt AI diye sorulan soru, kanalın son 12 mesajıyla (yazarlarının görünen adlarıyla) birlikte Hanogt AI'ın dil modeline iletiliyor ve soranın mesaj hakkından düşüyor; soru ve yanıt grubun sohbetinde kalıyor. Grup sahibi ve yöneticileri botu kapatabiliyor.", EN: "Hanogt AI in groups: a question asked in a group with /ai or by mentioning @Hanogt AI is passed to Hanogt AI's language model together with the channel's last 12 messages (with their authors' display names) and counts against the asker's message allowance; the question and the answer stay in the group chat. Group owners and admins can switch the bot off." },
            { TR: "Bildirimler, ayarlar ve şartlar: Gruplarda sizden bahsedildiğinde ve bir aramayı kaçırdığınızda bildirim gönderiliyor; bunları ve mesajlaşma ayarlarını (okundu bilgisi, yazıyor göstergesi, Enter ile gönderme, GIF'lerin oynaması, yazı boyutu, arka plan) yeni Hanogt Social ayarlarından değiştirebilirsiniz. Kullanım Şartları'na Hanogt Social sorumluluk reddi ile grup sahipleri ve moderatörlerinin sorumlulukları eklendi.", EN: "Notifications, settings and terms: you are notified when you are mentioned in a group and when you miss a call; you can change these and the messaging settings (read receipts, typing indicator, Enter to send, GIF playback, font size, background) in the new Hanogt Social settings. Hanogt Social's disclaimer and the responsibilities of group owners and moderators were added to the Terms of Use." },
        ],
    },
    {
        version: "4.9",
        date: { TR: "5 Ekim 2026", EN: "5 October 2026" },
        items: [
            { TR: "Son girişler: Hesabınıza yapılan son 10 girişin zamanı, yöntemi (parola ya da Google), tarayıcı ve işletim sistemi türü ile ülkesi kaydedilir ve Hesap Ayarları'nda yalnızca size gösterilir; IP adresi bu kayıtta tutulmaz. Kayıtlar verilerinizi indirdiğinizde yer alır ve hesabınızı sildiğinizde silinir.", EN: "Recent sign-ins: the time, method (password or Google), browser and operating system family and country of the last 10 sign-ins to your account are recorded and shown only to you in Account Settings; no IP address is kept in this record. The records are included when you download your data and deleted when you delete your account." },
            { TR: "Hanogt AI: Açık editör dosyası hakkında sorduğunuzda, ayarlarınıza göre dosyanın son çalıştırmasının hata çıktısı (en fazla 3.000 karakter; varsayılan olarak açık) ve projedeki diğer dosyaların yalnızca adları (varsayılan olarak kapalı) da dil modeline iletilir. Yeni kod tercihleriniz (uzmanlık, yorum dili, kod stili, tercih ettiğiniz diller, tam dosya ya da fark) her mesajla iletilir. Önerilen değişikliği gösterebilmek için dosyanın sorulduğu andaki hâli son üç yanıtta tarayıcınızda tutulur; sohbetlerin tarayıcınızda ne kadar saklanacağını seçebilirsiniz.", EN: "Hanogt AI: when you ask about the open editor file, depending on your settings the error output of the file's last run (up to 3,000 characters; on by default) and only the names of the project's other files (off by default) are also passed to the language model. Your new code preferences (experience, comment language, code style, preferred languages, whole file or diff) are passed with every message. To show a proposed change, the file as it was when you asked is kept in your browser for the last three answers; you can choose how long chats are kept in your browser." },
            { TR: "Görünüm: “Animasyonları azalt” ve “Yüksek kontrast” artık her sayfada uygulanır ve sayfa açılırken hemen uygulanabilmeleri için tarayıcınızda da hatırlanır. Hiçbir işlevi olmayan sıkı görünüm, arayüz yazı boyutu, saat dilimi ve emoji stili ayarları kaldırıldı; kayıtlı değerleri silinir.", EN: "Appearance: “Reduce animations” and “High contrast” now apply on every page and are also remembered in your browser so they apply as soon as a page opens. The compact mode, interface font size, time zone and emoji style settings, which did nothing, were removed and their stored values are deleted." },
        ],
    },
    {
        version: "4.8",
        date: { TR: "5 Ekim 2026", EN: "5 October 2026" },
        items: [
            { TR: "Google ile giriş ve parola: Hesabınızda bir parola varsa Google ile her girişten sonra bu parola, iki adımlı doğrulama açıksa kodunuz da istenir; 15 dakika içinde tamamlanmayan giriş iptal edilir. Parolasını unutan, ekipten parola şartının kaldırılmasını isteyebilir. Gizlilik Politikası, KVKK Aydınlatma Metni ve Kullanım Şartları buna göre güncellendi.", EN: "Google sign-in and passwords: if your account has a password, every Google sign-in is followed by a request for it, and for your code when two-step verification is on; a sign-in not completed within 15 minutes is cancelled. If you forget the password, you can ask the team to remove the requirement. The Privacy Policy, the KVKK Information Notice and the Terms of Use were updated accordingly." },
            { TR: "Hesapların korunması: Bir adresle yapılan ilk Google girişi, o adresle önceden açılmış hesabın doğrulanmamış parolasını ve iki adımlı doğrulamasını kaldırır, diğer oturumları kapatır ve size bildirir. Google'ın doğrulamadığı adreslerle Google girişi kabul edilmez.", EN: "Protecting accounts: the first Google sign-in with an address removes the unverified password and two-step verification of an account opened earlier with that address, signs other sessions out and lets you know. Google sign-in with an address Google hasn't verified is not accepted." },
            { TR: "Oturumlar: “Diğer tüm oturumları kapat” ve parola değişikliği diğer cihazlardaki oturumlarınızı ve gerçek zamanlı bağlantılarınızı sonlandırır. İlk parolayı belirlemek ve hesabı silmek için son 30 dakika içinde giriş yapmış olmanız gerekir. İki adımlı doğrulama kodu denemeleri günde 20 ile sınırlandı; sınır aşılırsa size bildirim gönderilir.", EN: "Sessions: “Sign out all other sessions” and changing your password end your sessions and real-time connections on other devices. Setting the first password and deleting the account require a sign-in within the last 30 minutes. Two-step verification code attempts are now limited to 20 a day; if the limit is exceeded, you are notified." },
            { TR: "Profiller: Herkese açık profil kayıtları artık tarayıcıdan listelenemez veya aranamaz; yalnızca tek tek açılabilir ve yalnızca sunucu tarafından yazılır. Özel durumdaki emoji kaldırıldı; durum yalnızca metindir.", EN: "Profiles: public profile records can no longer be listed or searched from the browser; they can only be opened one at a time and are written by the server only. The emoji was removed from the custom status; the status is text only." },
        ],
    },
    {
        version: "4.7",
        date: { TR: "5 Ekim 2026", EN: "5 October 2026" },
        items: [
            { TR: "Hanogt AI'ın motoru: Groq ve Anthropic (Claude) artık Hanogt AI'ın motoru olarak kullanılmıyor; gelişmiş kod motoru kaldırıldı. Sorularınız Hanogt AI'ın kendi dil modeline, Hugging Face, Inc. (ABD) ve onun üzerinden seçilen çıkarım sağlayıcısı aracılığıyla iletiliyor. Gizlilik Politikası, KVKK Aydınlatma Metni ve Kullanım Şartları'ndaki alıcı ve yurt dışı aktarım bilgileri buna göre güncellendi.", EN: "Hanogt AI's engine: Groq and Anthropic (Claude) are no longer used as Hanogt AI's engine, and the advanced code engine was removed. Your questions go to Hanogt AI's own language model through Hugging Face, Inc. (USA) and the inference provider selected through it. The recipient and international transfer details in the Privacy Policy, the KVKK Information Notice and the Terms of Use were updated accordingly." },
            { TR: "Giriş zorunluluğu ve yeni sınırlar: Hanogt AI artık yalnızca giriş yapmış kişilere açık. Mesaj hakları günlük yerine plan penceresiyle sayılıyor: Ücretsiz planda 7 günde 50, Plus'ta 14 günde 750, Pro'da 7 günde 2.000 mesaj (dakikada 5, 20 ve 30). Geliştirici API'sinin ayrı sınırları kaldırıldı; API istekleri sohbetle aynı haktan düşüyor. Model hiç yanıt veremediğinde mesaj hakkınızdan düşmüyor.", EN: "Sign-in and new limits: Hanogt AI is now open to signed-in people only. Messages are counted per plan window instead of per day: 50 in 7 days on Free, 750 in 14 days on Plus and 2,000 in 7 days on Pro (5, 20 and 30 a minute). The developer API's separate limits were removed; API requests use the same allowance as the chat. When the model can't answer at all, the message doesn't count." },
            { TR: "Düşünme: Hanogt AI zor sorularda yanıt vermeden önce düşünebiliyor ve bunu yanıtın üstünde gösterebiliyor. Düşünme metni yalnızca tarayıcınızda saklanıyor ve sonraki mesajlarla geri gönderilmiyor; düşünme tercihleriniz Hanogt AI ayarlarınızla birlikte hesabınızda tutuluyor. Groq ile eklenmiş kendi anahtar bağlantıları artık kullanılamıyor ve siz silene kadar listede kalıyor.", EN: "Thinking: Hanogt AI can think before it answers hard questions and show this above the answer. The thinking is kept only in your browser and never sent back with later messages; your thinking preferences are kept in your account with your Hanogt AI settings. Own-key connections added for Groq can no longer be used and stay listed until you delete them." },
        ],
    },
    {
        version: "4.6",
        date: { TR: "3 Ekim 2026", EN: "3 October 2026" },
        items: [
            { TR: "Gelişmiş kod motoru: yönetici açtıysa kod ve güvenlik soruları, planınızın günlük hakkı kadar Anthropic, PBC'nin (ABD) Claude modeline iletiliyor; sağlayıcıya standart motorla aynı veriler gidiyor, e-posta adresiniz ve hesap kimliğiniz gitmiyor. Hak dolduğunda ya da motor yanıt veremediğinde yanıtı standart motor veriyor. Gizlilik Politikası, KVKK Aydınlatma Metni ve Kullanım Şartları buna göre güncellendi.", EN: "Advanced code engine: if the administrator has switched it on, code and security questions go, up to your plan's daily allowance, to the Claude model of Anthropic, PBC (USA); the provider receives the same data as the standard engine, not your e-mail address or account ID. When the allowance runs out or the engine can't answer, the standard engine answers. The Privacy Policy, the KVKK Information Notice and the Terms of Use were updated accordingly." },
        ],
    },
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
