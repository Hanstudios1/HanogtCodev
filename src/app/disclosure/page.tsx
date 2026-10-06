import type { Metadata } from "next";
import LegalPage, { type LegalHighlight, type LegalSection } from "@/components/LegalPage";
import { controllerTableRows } from "@/lib/legal";
import { isOperatorPublished, type OperatorInfo } from "@/lib/legal-info";
import { getOperatorInfo } from "@/lib/server/legal-info";

export const metadata: Metadata = {
    title: "KVKK Aydınlatma Metni",
    description: "6698 sayılı KVKK m.10 uyarınca veri sorumlusu, işlenen veriler, amaçlar, hukuki sebepler, toplama yöntemi, yurt içi ve yurt dışı aktarımlar, saklama ve ilgili kişi hakları.",
    alternates: { canonical: "/disclosure" },
};

// The operator's details come from the Admin Panel; re-read them every few minutes.
export const revalidate = 300;

// Turkish is the authoritative text; keep every paragraph a separate { TR, EN }
// pair with plain string literals so the copy packs can translate it. Texts that
// also appear in the Privacy Policy are kept identical so they share a translation.
// Where a text depends on whether the operator's details are published, both
// versions are written out in full.

const highlights = (published: boolean): LegalHighlight[] => [
    {
        title: { TR: "Kim?", EN: "Who?" },
        text: published
            ? { TR: "Veri sorumlusu, Hanogt Codev'i işleten ve kimlik ve iletişim bilgileri bu sayfada yer alan işletmecidir.", EN: "The data controller is the operator of Hanogt Codev, whose identity and contact details are on this page." }
            : { TR: "Veri sorumlusu, Hanogt Codev'i işleten HanStudios / Hanogt Codev işletmesidir.", EN: "The data controller is HanStudios / Hanogt Codev, which operates Hanogt Codev." },
    },
    {
        title: { TR: "Neden?", EN: "Why?" },
        text: { TR: "Hesabınızı, projelerinizi, topluluk ve iletişim özelliklerini sunmak, güvenliği sağlamak ve yasal yükümlülükleri yerine getirmek için.", EN: "To provide your account, projects and the community and communication features, keep the service secure and meet legal obligations." },
    },
    {
        title: { TR: "Kime?", EN: "To whom?" },
        text: { TR: "Barındırma, veritabanı, kimlik doğrulama, ödeme (Paddle), yapay zekâ ve kod çalıştırma sağlayıcılarına; bunların çoğu yurt dışındadır.", EN: "To hosting, database, authentication, payment (Paddle), AI and code execution providers, most of them abroad." },
    },
    {
        title: { TR: "Haklarınız", EN: "Your rights" },
        text: { TR: "KVKK m.11 haklarınızı “İstek” kategorisindeki destek talebiyle kullanabilirsiniz; en geç 30 gün içinde yanıt verilir.", EN: "Use your rights under KVKK Art. 11 with a support ticket in the “Request” category; you'll get a reply within 30 days at the latest." },
    },
];

const sections = (operator: OperatorInfo): LegalSection[] => [
    {
        id: "controller",
        title: { TR: "Veri sorumlusu", EN: "Data controller" },
        paragraphs: [
            isOperatorPublished(operator)
                ? { TR: "6698 sayılı Kişisel Verilerin Korunması Kanunu (“KVKK”) kapsamında veri sorumlusu, Hanogt Codev hizmetini işleten ve kimlik ve iletişim bilgileri aşağıdaki tabloda yer alan işletmecidir.", EN: "Under the Law No. 6698 on the Protection of Personal Data (“KVKK”), the data controller is the operator of the Hanogt Codev service, whose identity and contact details are in the table below." }
                : { TR: "6698 sayılı Kişisel Verilerin Korunması Kanunu (“KVKK”) kapsamında veri sorumlusu, Hanogt Codev hizmetini işleten HanStudios / Hanogt Codev işletmesidir. Aşağıdaki kimlik ve iletişim bilgileri henüz yayımlanmamıştır; yayımlandığında bu metne eklenecektir. O zamana kadar başvurular uygulama içindeki destek talebi kanalından alınır.", EN: "Under the Law No. 6698 on the Protection of Personal Data (“KVKK”), the data controller is HanStudios / Hanogt Codev, the business that operates the Hanogt Codev service. The identity and contact details below have not been published yet; they will be added to this notice when they are. Until then, requests are received through the in-app support ticket channel." },
        ],
        table: {
            head: [{ TR: "Bilgi", EN: "Item" }, { TR: "Değer", EN: "Details" }],
            rows: controllerTableRows(operator),
        },
    },
    {
        id: "scope",
        title: { TR: "Bu metnin kapsamı", EN: "Scope of this notice" },
        paragraphs: [
            { TR: "Bu metin; Hanogt Codev'in web sitesini ve uygulamalarını ziyaret eden, hesap oluşturan, içerik yayımlayan, diğer kullanıcılarla iletişim kuran, ücretli bir plan satın alan, destek talebi veya KVKK başvurusu gönderen gerçek kişileri kapsar.", EN: "This notice covers the individuals who visit Hanogt Codev's website and apps, create an account, publish content, communicate with other users, buy a paid plan, or send a support ticket or a KVKK request." },
            { TR: "Metin, KVKK m.10 ve Aydınlatma Yükümlülüğünün Yerine Getirilmesinde Uyulacak Usul ve Esaslar Hakkında Tebliğ uyarınca hazırlanmıştır. Her özelliğin ayrıntılı işleyişi [Gizlilik Politikası](/privacy-policy)'nda anlatılır.", EN: "It has been prepared under KVKK Art. 10 and the Communiqué on the Procedures and Principles for Fulfilling the Duty to Inform. How each feature works is described in detail in the [Privacy Policy](/privacy-policy)." },
        ],
    },
    {
        id: "categories",
        title: { TR: "İşlenen kişisel veri kategorileri", EN: "Categories of personal data processed" },
        table: {
            head: [{ TR: "Kategori", EN: "Category" }, { TR: "Veriler", EN: "Data" }],
            rows: [
                [{ TR: "Kimlik", EN: "Identity" }, { TR: "Kullanıcı adı, takma ad ve etiket; KVKK başvurularında ad, soyad ve kimlik numarası", EN: "Username, nickname and tag; in KVKK requests, name, surname and ID number" }],
                [{ TR: "İletişim", EN: "Contact" }, { TR: "E-posta adresi; KVKK başvurularında adres ve telefon numarası", EN: "E-mail address; in KVKK requests, address and phone number" }],
                [{ TR: "Profil ve tercihler", EN: "Profile and preferences" }, { TR: "Avatar ve kapak görseli bağlantıları, biyografi, bağlantılar, durum mesajı; bildirim, gizlilik ve görünüm tercihleri", EN: "Avatar and banner links, bio, links, status message; notification, privacy and appearance preferences" }],
                [{ TR: "İşlem güvenliği", EN: "Transaction security" }, { TR: "Parola karması, şifreli iki adımlı doğrulama kayıtları, oturum bilgileri (giriş zamanı, giriş sağlayıcısı, oturum sürümü), son 10 girişin kaydı (zaman, yöntem, tarayıcı ve işletim sistemi türü, ülke; IP adresi olmadan), IP adresinden veya hesaptan türetilen hız sınırı anahtarları, güvenlik olayları, denetim kayıtları, barındırma günlükleri", EN: "Password hash, encrypted two-step verification records, session data (sign-in time, sign-in provider, session version), a record of the last 10 sign-ins (time, method, browser and operating system family, country; without the IP address), rate-limit keys derived from IP addresses or accounts, security events, audit records, hosting logs" }],
                [{ TR: "Kullanıcı içeriği ve işlemleri", EN: "User content and activity" }, { TR: "Kod ve oyun projeleri, scriptler, oyunlara yüklenen ses dosyaları, Media yayınları, Arcade oyunları, yorumlar, beğeniler, içerik bildirimleri, arena oyları (takma kimlikle), geri bildirimler", EN: "Code and game projects, scripts, audio files uploaded to games, Media posts, Arcade games, comments, likes, content reports, arena votes (pseudonymous), feedback" }],
                [{ TR: "İletişim içerikleri", EN: "Communications" }, { TR: "Birebir ve grup mesajları (GIF'ler ve iletilen mesajlar dahil), tepkiler, sabitlenen ve yıldızlanan mesajlar, sesli mesajlar, mesajlarla gönderilen dosyalar ve dosya alanı kullanımı, arkadaşlık ve grup kayıtları, bildirimler, çevrimiçi durum; sesli aramalarda, ekran paylaşımında ve grupların sesli kanallarında geçici bağlantı verileri ile sesli kanaldaki katılım durumu (aramalar, sesli kanallar ve paylaşılan ekranlar kaydedilmez)", EN: "One-to-one and group messages (including GIFs and forwarded messages), reactions, pinned and starred messages, voice messages, files sent in messages and the file space used, friend and group records, notifications, online status; temporary connection data for voice calls, screen sharing and groups' voice channels, and presence in voice channels (calls, voice channels and shared screens are not recorded)" }],
                [{ TR: "Grup moderasyonu", EN: "Group moderation" }, { TR: "Grup rolleri; Hanogt Security Bot komutlarıyla oluşan uyarı, susturma ve rapor kayıtları; AutoMod kayıtları (gönderen, kural ve zaman; mesaj metni olmadan); grubun AutoMod ayarları, özel komutları ve karşılama mesajı", EN: "Group roles; warning, mute and report records created with Hanogt Security Bot commands; AutoMod records (sender, rule and time; without the message text); the group's AutoMod settings, custom commands and welcome message" }],
                [{ TR: "Görsel ve işitsel kayıtlar", EN: "Audio-visual records" }, { TR: "Profil ve kapak görselleri, sesli mesaj dosyaları", EN: "Profile and banner images, voice message files" }],
                [{ TR: "Yapay zekâ etkileşimleri", EN: "AI interactions" }, { TR: "Hanogt AI'a gönderilen mesajlar ve bağlam (Hanogt AI yalnızca giriş yapmış kişilere açıktır); gruplarda Hanogt AI'a sorulan sorular ve onlarla birlikte gönderilen kanalın son 12 mesajı (yazarların görünen adlarıyla); Hanogt AI ayarlarındaki kişisel talimatlar ve tercihler (düşünme, kod ve ses tercihleri dahil); açık editör dosyası hakkında sorulduğunda, ayarlara göre son çalıştırmanın hata çıktısı ve projedeki diğer dosyaların adları; ajan modunda verilen izinler; eklediyseniz kendi yapay zekâ bağlantılarınız (sağlayıcı, bağlantı adı, model, şifreli API anahtarı ve son dört karakteri); oluşturduysanız Hanogt AI API anahtar kayıtlarınız (anahtarın yalnızca SHA-256 özeti, adı, ilk ve son karakterleri, tarihleri) ve API'ye gönderilen istekler", EN: "Messages and context sent to Hanogt AI (Hanogt AI is open to signed-in people only); questions asked to Hanogt AI in groups and the channel's last 12 messages sent with them (with their authors' display names); personal instructions and preferences in the Hanogt AI settings (thinking, code and voice preferences included); when asking about the open editor file, depending on the settings, the error output of its last run and the names of the project's other files; permissions given in agent mode; if you added them, your own AI connections (provider, connection name, model, the encrypted API key and its last four characters); if you created them, your Hanogt AI API key records (only the key's SHA-256 digest, its name, first and last characters and dates) and requests sent to the API" }],
                [{ TR: "Müşteri işlem", EN: "Customer transactions" }, { TR: "Plan, abonelik durumu, fatura dönemi, dönem sonu ve sonraki ödeme tarihi, planlanmış iptal veya değişiklik; Paddle müşteri ve abonelik kimlikleri; herkese açık profildeki plan rozeti ve gizleme tercihi; destek taleplerine eklenen plan. Kart ve diğer ödeme bilgileri tarafımızca işlenmez; bunları Paddle toplar.", EN: "Plan, subscription status, billing period, period end and next payment date, any scheduled cancellation or change; Paddle customer and subscription IDs; the plan badge on your public profile and your choice to hide it; the plan added to support tickets. Card and other payment details are not processed by us; Paddle collects them." }],
                [{ TR: "Talep ve şikâyet yönetimi", EN: "Request and complaint management" }, { TR: "Destek talepleri, KVKK başvuruları, itirazlar ve yanıtlar; talebi değerlendirmek için hesap kaydı ve moderasyon geçmişi", EN: "Support tickets, KVKK requests, appeals and replies; the account record and moderation history used to assess them" }],
                [{ TR: "Hukuki işlem", EN: "Legal matters" }, { TR: "Moderasyon kararları, yetkili makam talepleri ve bunlara ilişkin yazışmalar", EN: "Moderation decisions, requests from authorities and related correspondence" }],
            ],
        },
        note: { TR: "Özel nitelikli kişisel veri talep etmeyiz. Lütfen bu tür verileri içeriklerinize, mesajlarınıza veya taleplerinize yazmayın.", EN: "We don't ask for special categories of personal data. Please don't include such data in your content, messages or requests." },
    },
    {
        id: "purposes",
        title: { TR: "İşleme amaçları", EN: "Purposes of processing" },
        items: [
            { TR: "Üyelik işlemlerinin yürütülmesi: hesap açma, giriş, oturum ve iki adımlı doğrulama, Google ile girişten sonra parolanın (ve kodun) istenmesi, oturumların kapatılması ve hesabın ele geçirilmesine karşı koruma,", EN: "running membership processes: creating accounts, sign-in, sessions and two-step verification, asking for the password (and the code) after a Google sign-in, signing sessions out and protecting accounts against takeover;" },
            { TR: "Kod editörü, kod çalıştırma, Hanogt Engine, Arcade, Media, News, arena, gruplar, sohbetler, yıldızlı mesajlar, GIF araması, mesajlarda dosya paylaşımı, aramalar, ekran paylaşımı ve sesli kanallar gibi hizmetlerin sunulması,", EN: "providing services such as the code editor, code execution, Hanogt Engine, the Arcade, Media, News, the arena, groups, chats, starred messages, GIF search, files in messages, calls, screen sharing and voice channels;" },
            { TR: "Hanogt Social gruplarında topluluk kurallarının uygulanması: Hanogt Security Bot komutları, AutoMod taraması ve moderasyon kayıtlarının tutulması,", EN: "enforcing community rules in Hanogt Social groups: Hanogt Security Bot commands, AutoMod scanning and keeping moderation records;" },
            { TR: "Hanogt AI yanıtlarının üretilmesi (gruplarda sorulan sorular dahil), Hanogt AI ayarlarınızın uygulanması ve izin verdiğiniz ajan işlemlerinin yapılması; Hanogt AI API anahtarlarının yönetilmesi ve API isteklerinin yanıtlanması,", EN: "generating Hanogt AI replies (including questions asked in groups), applying your Hanogt AI settings and carrying out agent actions you allow; managing Hanogt AI API keys and answering API requests;" },
            { TR: "Ücretli planların satışına ilişkin sözleşmenin kurulması ve ifası: aboneliğin Paddle üzerinden başlatılması ve hesabınıza bağlanması, plan avantajlarının ve sınırlarının uygulanması, plan değişikliği ve iptal işlemleri,", EN: "concluding and performing the contract for the sale of paid plans: starting the subscription through Paddle and linking it to your account, applying the plan's benefits and limits, and handling plan changes and cancellations;" },
            { TR: "Ödeme ve faturalandırma süreçlerinin Kayıtlı Satıcı Paddle aracılığıyla yürütülmesi, abonelikle ilgili uygulama içi bildirimlerin gönderilmesi, ödeme ve iade taleplerinin yanıtlanması,", EN: "running payment and invoicing processes through Paddle, the Merchant of Record, sending in-app notices about your subscription and answering payment and refund requests;" },
            { TR: "Bilgi güvenliği süreçlerinin yürütülmesi: kötüye kullanımın, spam'in ve saldırıların önlenmesi, hız sınırları ve güvenlik olaylarının incelenmesi,", EN: "running information security processes: preventing abuse, spam and attacks, applying rate limits and investigating security events;" },
            { TR: "Topluluk kurallarının uygulanması, içerik bildirimlerinin ve moderasyonun yürütülmesi, ekip işlemlerinin denetim kaydının tutulması,", EN: "enforcing community rules, handling content reports and moderation, and keeping an audit log of staff actions;" },
            { TR: "Destek taleplerinin, itirazların ve KVKK başvurularının yanıtlanması,", EN: "answering support tickets, appeals and KVKK requests;" },
            { TR: "Hukuki yükümlülüklerin yerine getirilmesi ve yetkili kişi, kurum ve kuruluşlara bilgi verilmesi,", EN: "complying with legal obligations and providing information to authorised persons, institutions and organisations;" },
            { TR: "Yalnızca açık rızanızla, Security Bot imzalarının insan denetimiyle geliştirilmesi.", EN: "only with your explicit consent, improving Security Bot's signatures under human review." },
        ],
    },
    {
        id: "legal-bases",
        title: { TR: "Hukuki sebepler", EN: "Legal bases" },
        paragraphs: [
            { TR: "Kişisel verileriniz KVKK m.5'te sayılan aşağıdaki hukuki sebeplere dayanılarak işlenir:", EN: "Your personal data is processed on the following legal bases set out in KVKK Art. 5:" },
        ],
        table: {
            head: [{ TR: "Hukuki sebep", EN: "Legal basis" }, { TR: "Dayanılan işlemler", EN: "Processing it covers" }],
            rows: [
                [{ TR: "Sözleşmenin kurulması veya ifasıyla doğrudan ilgili olması (m.5/2-c)", EN: "Directly related to concluding or performing a contract (Art. 5(2)(c))" }, { TR: "Hesap ve oturum, projeler, kod çalıştırma, topluluk ve iletişim özellikleri (yıldızlı mesajlar, GIF araması ve grupların moderasyon araçları dahil), Hanogt AI (soranın gruplardaki soruları dahil), destek talepleri; ücretli planların satışı, abonelik yönetimi ve bunun için Paddle'a yapılan aktarım", EN: "Account and sessions, projects, code execution, community and communication features (including starred messages, GIF search and the groups' moderation tools), Hanogt AI (including the asker's questions in groups), support tickets; selling paid plans, managing subscriptions and the transfer to Paddle this requires" }],
                [{ TR: "Veri sorumlusunun meşru menfaati (m.5/2-f)", EN: "The data controller's legitimate interests (Art. 5(2)(f))" }, { TR: "Hesap ve hizmet güvenliği, hız sınırları, güvenlik olayları, moderasyon (grupların AutoMod taraması ve moderasyon kayıtları dahil), kötüye kullanımın ayırt edilmesi, denetim kaydı; gruplarda Hanogt AI'a soruyla birlikte gönderilen, soruyu sormayan üyelere ait mesajlar; satın almaların doğru hesaba bağlanması ve plan avantajlarının kötüye kullanılmasının önlenmesi", EN: "Account and service security, rate limits, security events, moderation (including the groups' AutoMod scanning and moderation records), telling genuine requests from abuse, the audit log; messages of members who didn't ask that are sent to Hanogt AI with a question in a group; linking purchases to the right account and preventing abuse of plan benefits" }],
                [{ TR: "Hukuki yükümlülüğün yerine getirilmesi (m.5/2-ç)", EN: "Complying with a legal obligation (Art. 5(2)(ç))" }, { TR: "KVKK başvurularının yanıtlanması, veri ihlali bildirimleri, yetkili makam talepleri; ödeme ve faturalandırmaya ilişkin vergi ve muhasebe yükümlülükleri (satıcı sıfatıyla Paddle tarafından yerine getirilir)", EN: "Answering KVKK requests, data breach notifications, requests from authorities; tax and accounting obligations relating to payments and invoicing (met by Paddle as the seller)" }],
                [{ TR: "Kanunlarda açıkça öngörülmesi (m.5/2-a)", EN: "Expressly provided for by law (Art. 5(2)(a))" }, { TR: "Mevzuatta öngörülen saklama ve bildirim yükümlülükleri", EN: "Retention and reporting obligations set by law" }],
                [{ TR: "Bir hakkın tesisi, kullanılması veya korunması (m.5/2-e)", EN: "Establishing, exercising or protecting a right (Art. 5(2)(e))" }, { TR: "Uyuşmazlıklar, itirazlar, kötüye kullanım ve güvenlik incelemeleri", EN: "Disputes, appeals, abuse and security investigations" }],
                [{ TR: "İlgili kişinin kendisi tarafından alenileştirilmesi (m.5/2-d)", EN: "Data made public by the data subject (Art. 5(2)(d))" }, { TR: "Media, Arcade, haber yorumları ve geri bildirim panosunda yayımlamayı seçtiğiniz içerikler, yalnızca alenileştirme amacıyla sınırlı olarak", EN: "Content you choose to publish on Media, the Arcade, news comments and the feedback board, only within the purpose of making it public" }],
                [{ TR: "Açık rıza (m.5/1)", EN: "Explicit consent (Art. 5(1))" }, { TR: "Security Bot katkı programı; açık rıza gerektiren bir yurt dışı aktarımı olursa o aktarım", EN: "The Security Bot contribution programme, and any transfer abroad that requires explicit consent" }],
            ],
        },
        after: [
            { TR: "Özel nitelikli kişisel veri talep edilmez; içeriklerde bulunması hâlinde yalnızca KVKK m.6'da sayılan şartlar çerçevesinde işlenebilir.", EN: "Special categories of personal data are not requested; if they appear in content, they may be processed only under the conditions listed in KVKK Art. 6." },
        ],
    },
    {
        id: "methods",
        title: { TR: "Toplama yöntemi", EN: "How data is collected" },
        paragraphs: [
            { TR: "Kişisel verileriniz elektronik ortamda, kısmen otomatik yollarla şu kaynaklardan toplanır:", EN: "Your personal data is collected electronically, partly by automated means, from the following sources:" },
        ],
        items: [
            { TR: "Kayıt, giriş, profil, editör, oyun motoru, yayımlama, yorum, oy, mesajlaşma, destek ve başvuru formları aracılığıyla sizden,", EN: "from you, through the sign-up, sign-in, profile, editor, game engine, publishing, comment, voting, messaging, support and request forms;" },
            { TR: "Google ile giriş seçtiğinizde Google'dan (e-posta, ad, profil fotoğrafı bağlantısı),", EN: "from Google when you choose Sign in with Google (e-mail, name, profile photo link);" },
            { TR: "Ücretli bir plan satın aldığınızda ve aboneliğinizi yönettiğinizde Kayıtlı Satıcı Paddle'dan (abonelik durumu ve Paddle kimlikleri, imzalı bildirimlerle),", EN: "from Paddle, the Merchant of Record, when you buy a paid plan or manage your subscription (subscription status and Paddle IDs, through signed notifications);" },
            { TR: "Hizmeti kullanırken sunucularımız, altyapı sağlayıcılarımız ve tarayıcınız tarafından otomatik olarak (oturum, çevrimiçi durum, hız sınırı ve güvenlik kayıtları, gruplardaki AutoMod kayıtları, barındırma günlükleri),", EN: "automatically, by our servers, our infrastructure providers and your browser while you use the service (sessions, online status, rate-limit and security records, AutoMod records in groups, hosting logs);" },
            { TR: "Sesli arama, ekran paylaşımı ve sesli kanal sırasında geçici bağlantı verilerinden,", EN: "from temporary connection data during voice calls, screen sharing and voice channels;" },
            { TR: "Diğer kullanıcıların sizinle ilgili yaptığı işlemlerden (ör. arkadaşlık isteği, grup daveti, içerik bildirimi, gruplardaki uyarı, susturma ve raporlar, bir grupta Hanogt AI'a sorulan bir soruyla mesajlarınızın da gönderilmesi).", EN: "from actions other users take that concern you (for example friend requests, group invitations, content reports, warnings, mutes and reports in groups, or your messages being sent along with a question asked to Hanogt AI in a group)." },
        ],
        after: [
            { TR: "Tarayıcınızda çalışan araçlar (tarayıcı dilleri, Kod Danışmanı, parola ölçer, bağlantı kontrolü, Hanogt AI Çekirdeği) verilerinizi sunucuya göndermez. Toplanan veriler, yukarıdaki amaçlar için ve hukuki sebepler tablosundaki sebeplere dayanılarak işlenir.", EN: "Tools that run in your browser (the browser languages, Code Advisor, password meter, link check and the Hanogt AI Core) do not send your data to a server. Collected data is processed for the purposes above, on the grounds in the legal bases table." },
            { TR: "Ödeme ekranına girdiğiniz bilgiler (ör. kart bilgileri, fatura adresi ve vergi numarası) tarafımızca toplanmaz; bunları Paddle doğrudan sizden, bağımsız veri sorumlusu olarak kendi [Gizlilik Bildirimi](https://www.paddle.com/legal/privacy) kapsamında toplar.", EN: "The details you enter at checkout (for example card details, billing address and tax number) are not collected by us; Paddle collects them directly from you as an independent data controller under its own [Privacy Notice](https://www.paddle.com/legal/privacy)." },
        ],
    },
    {
        id: "domestic-transfers",
        title: { TR: "Yurt içine aktarım (KVKK m.8)", EN: "Transfers within Türkiye (KVKK Art. 8)" },
        paragraphs: [
            { TR: "Kişisel verileriniz, KVKK m.8'deki şartlara uygun olarak ve amaçla sınırlı biçimde; hukuken yetkili kamu kurum ve kuruluşlarına ve yargı mercilerine, hukuki uyuşmazlıklarda ise sır saklama yükümlülüğü altındaki avukat ve danışmanlarımıza aktarılabilir. Verileriniz satılmaz ve reklam amacıyla paylaşılmaz.", EN: "Your personal data may be transferred, in line with the conditions of KVKK Art. 8 and only as far as the purpose requires, to legally authorised public institutions and courts and, in legal disputes, to our lawyers and advisers who are bound by confidentiality. Your data is not sold or shared for advertising." },
        ],
    },
    {
        id: "transfers",
        title: { TR: "Yurt dışına aktarım (KVKK m.9)", EN: "Transfers abroad (KVKK Art. 9)" },
        paragraphs: [
            { TR: "Hizmeti sunmak için aşağıdaki alıcılara, sunucuları Türkiye dışında olabilecek şekilde aktarım yapılır:", EN: "To provide the service, data is transferred to the following recipients, whose servers may be outside Türkiye:" },
        ],
        table: {
            head: [{ TR: "Alıcı", EN: "Recipient" }, { TR: "Veriler", EN: "Data" }, { TR: "Amaç", EN: "Purpose" }],
            rows: [
                ["Google (Firebase)", { TR: "Hesap, profil, içerik, mesaj ve diğer hizmet verileri", EN: "Account, profile, content, message and other service data" }, { TR: "Veritabanı, dosya depolama ve kimlik doğrulama", EN: "Database, file storage and authentication" }],
                ["Vercel Inc.", { TR: "Web istekleri, IP adresi, teknik günlükler", EN: "Web requests, IP addresses, technical logs" }, { TR: "Barındırma ve sunucu işlevleri", EN: "Hosting and server functions" }],
                [{ TR: "Paddle.com Market Limited (Birleşik Krallık)", EN: "Paddle.com Market Limited (United Kingdom)" }, { TR: "Hesap e-posta adresi, seçilen plan ve dönem, satın almayı hesaba bağlayan imzalı özel veri, Paddle müşteri ve abonelik kimlikleri", EN: "Account e-mail address, the plan and billing period chosen, signed custom data linking the purchase to the account, Paddle customer and subscription IDs" }, { TR: "Kayıtlı Satıcı olarak ödeme, faturalama, vergi, iade ve abonelik yönetimi", EN: "Payment, invoicing, tax, refunds and subscription management as the Merchant of Record" }],
                [{ TR: "Hanogt AI'ın model barındırma sağlayıcısı (Hugging Face, Inc., ABD, ve onun üzerinden seçilen çıkarım sağlayıcısı)", EN: "Hanogt AI's model hosting provider (Hugging Face, Inc., USA, and the inference provider selected through it)" }, { TR: "Hanogt AI'a yazılanlar, bağlam ve kişisel talimatlar; Hanogt AI API'sine gönderilen istekler; gruplarda sorulan sorular ve kanalın son 12 mesajı (yazarlarının görünen adlarıyla)", EN: "What you write to Hanogt AI, its context and your personal instructions; requests sent to the Hanogt AI API; questions asked in groups and the channel's last 12 messages (with their authors' display names)" }, { TR: "Hanogt AI'ın kendi modeliyle yanıt üretimi", EN: "Generating replies with Hanogt AI's own model" }],
                [{ TR: "Kendi API anahtarınızla bağladığınız yapay zekâ sağlayıcısı (ör. OpenAI, Anthropic, Google, Mistral, OpenRouter, DeepSeek, xAI, Together)", EN: "An AI provider you connected with your own API key (for example OpenAI, Anthropic, Google, Mistral, OpenRouter, DeepSeek, xAI, Together)" }, { TR: "Bu bağlantıyla Hanogt AI'a yazılanlar ve bağlam", EN: "What you write to Hanogt AI with that connection, and its context" }, { TR: "Seçtiğiniz sağlayıcıyla yanıt üretimi", EN: "Generating replies with the provider you chose" }],
                [{ TR: "Wandbox, JetBrains Kotlin Playground veya Hanogt adına işletilen çalıştırıcı", EN: "Wandbox, JetBrains Kotlin Playground or a runner operated for Hanogt" }, { TR: "Sunucuda çalışan dillerdeki kaynak kod ve program girdisi", EN: "Source code and program input for server-run languages" }, { TR: "Kodun çalıştırılması", EN: "Running code" }],
                [{ TR: "Google STUN sunucuları, TURN aktarma sunucusu", EN: "Google STUN servers, TURN relay server" }, { TR: "IP adresi, ağ bilgileri; TURN için e-posta adresinden tuzla türetilen takma kimliği içeren geçici kullanıcı adı", EN: "IP address, network details; for TURN, a temporary username containing a salted pseudonymous ID derived from your e-mail address" }, { TR: "Sesli arama, ekran paylaşımı ve sesli kanal bağlantısı", EN: "Connecting voice calls, screen sharing and voice channels" }],
                [{ TR: "Hanogt'un seçtiği GIF sağlayıcısı: KLIPY (ABD) veya GIPHY, Inc. (ABD)", EN: "The GIF provider Hanogt chooses: KLIPY (USA) or GIPHY, Inc. (USA)" }, { TR: "GIF arama metni, sayfa, dil ve içerik derecelendirmesi (sunucumuz üzerinden, hesap bilgisi olmadan); GIF'ler yüklenirken tarayıcınızın IP adresi ve tarayıcı bilgileri", EN: "The GIF search text, page, language and content rating (through our server, without account details); your browser's IP address and browser details when GIFs load" }, { TR: "GIF arama ve gösterme", EN: "Searching for and showing GIFs" }],
                ["Have I Been Pwned", { TR: "Parola SHA-1 özetinin ilk 5 karakteri (isteğe bağlı kontrol)", EN: "The first 5 characters of a password's SHA-1 hash (optional check)" }, { TR: "Parola sızıntı kontrolü", EN: "Password breach check" }],
            ],
        },
        after: [
            { TR: "Bu aktarımlar, 7499 sayılı Kanun'la değiştirilen KVKK m.9 ve Kişisel Verilerin Yurt Dışına Aktarılmasına İlişkin Usul ve Esaslar Hakkında Yönetmelik çerçevesinde; KVKK m.5 veya m.6'daki bir işleme şartının yanında, varsa Kurul'un yeterlilik kararına, yoksa m.9/4'te sayılan uygun güvencelere (düzenli aktarımlarda özellikle Kurul'ca ilan edilen standart sözleşmelere) dayanılarak yapılır. m.9/6'daki arızi aktarım hâllerine yalnızca düzenli olmayan durumlarda başvurulur.", EN: "These transfers are made under KVKK Art. 9, as amended by Law No. 7499, and the Regulation on the Procedures and Principles for the Transfer of Personal Data Abroad: in addition to a processing condition in KVKK Art. 5 or 6, they rely on an adequacy decision of the Board where one exists and, where none exists, on the appropriate safeguards in Art. 9(4) (for regular transfers, in particular the standard contracts announced by the Board). The incidental transfer exceptions in Art. 9(6) are used only for transfers that are not regular." },
            { TR: "Ücretli bir plan satın aldığınızda ve aboneliğinizi yönettiğinizde Paddle'a (Birleşik Krallık) yapılan aktarım, sizin başlattığınız bu işlemlerle sınırlı ve düzenli olmayan (arızi) bir aktarımdır. Bu aktarım, talebiniz üzerine alınan sözleşme öncesi tedbirlerin uygulanması ve sizinle aramızdaki sözleşmenin ifası için zorunlu olduğundan KVKK m.9/6-b'ye dayanır. Ödeme ekranına girdiğiniz bilgiler ise tarafımızdan aktarılmaz; doğrudan Paddle tarafından, kendi [Gizlilik Bildirimi](https://www.paddle.com/legal/privacy) kapsamında toplanır.", EN: "When you buy a paid plan or manage your subscription, the transfer to Paddle (United Kingdom) is an incidental transfer, limited to these actions that you start and not regular. It relies on KVKK Art. 9(6)(b), because it is necessary to carry out pre-contractual steps you asked for and to perform the contract between you and us. The details you enter at checkout are not transferred by us: Paddle collects them directly under its own [Privacy Notice](https://www.paddle.com/legal/privacy)." },
            { TR: "Kendi API anahtarınızla bağladığınız bir yapay zekâ sağlayıcısına yapılan aktarım, yalnızca sizin seçtiğiniz sağlayıcıya ve sizin talebinizle, o bağlantıyı kullandığınız mesajlar için yapılır; sağlayıcının hangi ülkelerde veri işlediği ve hangi güvenceleri sunduğu, o sağlayıcının koşullarında yer alır.", EN: "A transfer to an AI provider you connected with your own API key is made only to the provider you chose, at your request, for the messages in which you use that connection; the countries where the provider processes data and the safeguards it offers are set out in that provider's terms." },
            { TR: "Bu aktarım, bağlantıyı eklerken verdiğiniz açık rızaya dayanır (KVKK m.9/6-a); rızanızın tarihi bağlantıyla birlikte saklanır. Bağlantıyı sildiğinizde rızanızı geri almış olursunuz ve o andan sonra bu sağlayıcıya hiçbir veri gönderilmez.", EN: "This transfer is based on the explicit consent you give when adding the connection (KVKK Art. 9(6)(a)); the date of your consent is stored with the connection. Deleting the connection withdraws your consent, and nothing is sent to that provider from then on." },
            { TR: "Hangi alıcı için hangi mekanizmaya dayanıldığına ilişkin bilgiyi “İstek” kategorisinde destek talebiyle isteyebilirsiniz. Ayrıntılar [Gizlilik Politikası](/privacy-policy#transfers)'nda yer alır.", EN: "You can ask which mechanism is relied on for which recipient with a support ticket in the “Request” category. Details are in the [Privacy Policy](/privacy-policy#transfers)." },
        ],
    },
    {
        id: "retention",
        title: { TR: "Saklama süresi", EN: "Retention" },
        paragraphs: [
            { TR: "Kişisel verileriniz, işlendikleri amaç için gerekli olan süre ve mevzuatta öngörülen süreler boyunca saklanır; ardından silinir, yok edilir veya anonim hâle getirilir. Veri türlerine göre ayrıntılı saklama süreleri [Gizlilik Politikası](/privacy-policy#retention)'ndaki tabloda yer alır.", EN: "Your personal data is kept for as long as needed for the purpose it is processed for and for any period required by law, and is then deleted, destroyed or anonymised. Detailed retention periods for each type of data are in the table in the [Privacy Policy](/privacy-policy#retention)." },
        ],
    },
    {
        id: "rights",
        title: { TR: "KVKK m.11 kapsamındaki haklarınız", EN: "Your rights under KVKK Art. 11" },
        paragraphs: [
            { TR: "Veri sorumlusuna başvurarak şunları yapabilirsiniz:", EN: "By applying to the data controller, you can:" },
        ],
        items: [
            { TR: "Kişisel verilerinizin işlenip işlenmediğini öğrenme ve işlenmişse buna ilişkin bilgi talep etme,", EN: "find out whether your personal data is processed and, if so, request information about it;" },
            { TR: "İşlenme amacını ve verilerin amacına uygun kullanılıp kullanılmadığını öğrenme,", EN: "find out the purpose of the processing and whether the data is used in line with that purpose;" },
            { TR: "Yurt içinde veya yurt dışında verilerin aktarıldığı üçüncü kişileri bilme,", EN: "know the third parties in Türkiye or abroad to whom your data is transferred;" },
            { TR: "Eksik veya yanlış işlenmişse düzeltilmesini isteme,", EN: "ask for incomplete or inaccurate data to be corrected;" },
            { TR: "KVKK m.7'deki şartlar çerçevesinde silinmesini veya yok edilmesini isteme,", EN: "ask for your data to be deleted or destroyed under the conditions of KVKK Art. 7;" },
            { TR: "Düzeltme, silme veya yok etme işlemlerinin verilerin aktarıldığı üçüncü kişilere bildirilmesini isteme,", EN: "ask for corrections, deletions or destruction to be notified to the third parties to whom the data was transferred;" },
            { TR: "İşlenen verilerin münhasıran otomatik sistemlerle analiz edilmesi suretiyle aleyhinize bir sonucun ortaya çıkmasına itiraz etme,", EN: "object to an outcome against you resulting from the analysis of your data exclusively through automated systems;" },
            { TR: "Kanuna aykırı işleme nedeniyle zarara uğramanız hâlinde zararın giderilmesini talep etme.", EN: "claim compensation if you suffer damage because of unlawful processing." },
        ],
        note: { TR: "Bazı haklarınızı doğrudan kullanabilirsiniz: [Hesap Ayarları](/account-settings)'ndaki “Verilerimi İndir” seçeneği hesap, proje, oyun, ses kitaplığı, Media, grup, yorum, beğeni ve oy kayıtlarınızı, yıldızlı mesajlarınızı ve hakkınızdaki grup moderasyon kayıtlarını JSON dosyası olarak indirir; “Hesabımı Sil” hesabınızı ve ilişkili verileri siler.", EN: "You can use some rights directly: “Download My Data” in [Account Settings](/account-settings) downloads your account, project, game, audio library, Media, group, comment, like and vote records, your starred messages and the group moderation records about you as a JSON file, and “Delete My Account” deletes your account and the related data." },
    },
    {
        id: "application",
        title: { TR: "Başvuru usulü", EN: "How to apply" },
        paragraphs: [
            { TR: "Taleplerinizi, Veri Sorumlusuna Başvuru Usul ve Esasları Hakkında Tebliğ'e uygun olarak şu yollarla iletebilirsiniz:", EN: "You can send your requests, in line with the Communiqué on the Procedures and Principles of Applications to the Data Controller, in the following ways:" },
        ],
        items: [
            { TR: "Hesabınıza giriş yaparak [Geri Bildirim ve SSS](/feedback) sayfasında “Talep oluştur” ile “İstek” kategorisinde destek talebi oluşturarak. Bu kanal başvuru amacıyla geliştirilmiş bir uygulamadır; kimliğiniz oturumunuzla doğrulanır, gerekirse ek doğrulama istenebilir.", EN: "By signing in and using “Create a ticket” on the [Feedback & FAQ](/feedback) page to open a support ticket in the “Request” category. This channel is an application built for such requests; your identity is verified by your session, and additional verification may be requested if needed." },
            ...(isOperatorPublished(operator)
                ? [
                    { TR: "Veri sorumlusunun [veri sorumlusu](/disclosure#controller) bölümünde yer alan adresine yazılı olarak veya, varsa, KEP adresine güvenli elektronik imza ya da mobil imzayla.", EN: "In writing to the data controller's address in the [data controller](/disclosure#controller) section or, if it has one, to its KEP address with a secure electronic or mobile signature." },
                    { TR: "Sistemimizde kayıtlı e-posta adresinizden, [veri sorumlusu](/disclosure#controller) bölümünde ve [İletişim](/contact) sayfasında yer alan iletişim e-postasına.", EN: "From the e-mail address registered in our system to the contact e-mail address in the [data controller](/disclosure#controller) section and on the [Contact](/contact) page." },
                ]
                : [
                    { TR: "Veri sorumlusunun adresine yazılı olarak veya KEP adresine güvenli elektronik imza ya da mobil imzayla; bu bilgiler yayımlandığında [veri sorumlusu](/disclosure#controller) bölümünde yer alacaktır.", EN: "In writing to the data controller's address, or to its KEP address with a secure electronic or mobile signature; these details will appear in the [data controller](/disclosure#controller) section once published." },
                    { TR: "Sistemimizde kayıtlı e-posta adresinizden, veri sorumlusunun yayımlanacak iletişim e-postasına.", EN: "From the e-mail address registered in our system to the data controller's contact e-mail address, once published." },
                ]),
        ],
        after: [
            { TR: "Başvuruda adınız ve soyadınız, yazılı başvurularda imzanız, Türkiye Cumhuriyeti vatandaşları için T.C. kimlik numaranız, yabancılar için uyruğunuz ile pasaport numaranız veya varsa kimlik numaranız, tebligata esas yerleşim yeri veya iş yeri adresiniz, varsa bildirime esas e-posta adresiniz, telefon ve faks numaranız ile talep konunuz bulunmalıdır. Uygulama içi başvurularda yalnızca talebinizi yanıtlamak için gerekli bilgiler istenir.", EN: "A request should include your name and surname, your signature for written requests, your Turkish ID number if you are a Turkish citizen or, if you are not, your nationality and passport number or ID number if any, your residential or business address for notifications, your e-mail address, phone and fax number for notifications if any, and the subject of your request. For in-app requests we only ask for the information needed to answer your request." },
            { TR: "Başvurunuz talebin niteliğine göre en kısa sürede ve en geç 30 gün içinde ücretsiz olarak sonuçlandırılır; işlemin ayrıca bir maliyet gerektirmesi hâlinde Kurul'ca belirlenen tarifedeki ücret alınabilir. Talebinizi kabul eder veya gerekçesini açıklayarak reddeder, yanıtımızı yazılı olarak veya elektronik ortamda bildiririz.", EN: "We conclude your request free of charge as soon as possible depending on its nature, and within 30 days at the latest; if the process involves an additional cost, the fee in the tariff set by the Board may be charged. We either accept your request or reject it with reasons, and send our reply in writing or electronically." },
            { TR: "Başvurunuzun reddedilmesi, yanıtı yetersiz bulmanız veya süresinde yanıt verilmemesi hâlinde; yanıtı öğrendiğiniz tarihten itibaren 30 gün ve her hâlde başvuru tarihinden itibaren 60 gün içinde Kişisel Verileri Koruma Kurulu'na şikâyette bulunabilirsiniz (KVKK m.14).", EN: "If your request is rejected, you find the reply insufficient or no reply is given in time, you can file a complaint with the Personal Data Protection Board within 30 days of learning of the reply, and in any case within 60 days of the request date (KVKK Art. 14)." },
        ],
    },
    {
        id: "consent",
        title: { TR: "Aydınlatma ile açık rıza ayrımı", EN: "Information is not consent" },
        paragraphs: [
            { TR: "Bu aydınlatma metnini okumanız veya “Okudum” olarak işaretlemeniz, açık rıza gerektiren işlemlere toplu rıza verdiğiniz anlamına gelmez. Açık rıza gerektiren işlemler için amaca özel, ayrı ve geri alınabilir bir tercih sunulur; rıza vermemeniz veya rızanızı geri çekmeniz temel hizmetleri etkilemez.", EN: "Reading this notice or marking it as read does not mean you give blanket consent to processing that requires explicit consent. For such processing you are offered a separate, purpose-specific choice that you can withdraw; not giving or withdrawing consent does not affect the core services." },
            { TR: "Şu anda açık rızaya dayanan tek işlem Security Bot katkı programıdır. Program iki aşamalıdır: hesap düzeyindeki tercih ve proje düzeyindeki işaret. İkisi birden açık değilse proje aday gösterilmez. Rızanızı Media sayfasından ileriye etkili olarak geri çekebilirsiniz; bekleyen katkı kayıtları silinir.", EN: "Currently the only processing based on explicit consent is the Security Bot contribution programme. It has two steps: the account-level setting and the project-level tick. Unless both are on, a project is not put forward. You can withdraw your consent with effect for the future on the Media page; pending contribution records are deleted." },
        ],
    },
    {
        id: "automated",
        title: { TR: "Otomatik işleme ve itiraz", EN: "Automated processing and objections" },
        paragraphs: [
            { TR: "Security Bot taraması, yorum filtresi, Hanogt Social gruplarındaki AutoMod ve hız sınırları bazı istekleri otomatik olarak engelleyebilir; AutoMod, grubun seçimine göre otomatik uyarı ve süreli susturma da uygulayabilir. Bu sonuçlar yalnızca ilgili isteği veya o gruptaki mesajlaşmayı etkiler; askıya alma veya silme gibi yaptırımlar insan incelemesiyle uygulanır. Münhasıran otomatik analiz sonucu aleyhinize ortaya çıkan bir sonuca itiraz etme hakkınızı (KVKK m.11/1-g) destek talebiyle kullanabilirsiniz; AutoMod'un verdiği bir susturmayı grubun moderatörleri de kaldırabilir.", EN: "The Security Bot scan, the comment filter, AutoMod in Hanogt Social groups and rate limits may block some requests automatically; depending on the group's choice, AutoMod may also give automatic warnings and timed mutes. These results only affect the request in question or messaging in that group; sanctions such as suspension or deletion are applied after human review. You can use your right to object to an outcome against you resulting exclusively from automated analysis (KVKK Art. 11(1)(g)) with a support ticket; a mute given by AutoMod can also be lifted by the group's moderators." },
        ],
    },
    {
        id: "updates",
        title: { TR: "Güncellemeler", EN: "Updates" },
        paragraphs: [
            { TR: "Bu metin, işleme faaliyetlerimiz veya mevzuat değiştiğinde güncellenir. Her sürüm, yürürlük tarihi ve değişiklik özetiyle sayfanın sonundaki sürüm geçmişinde yer alır. Bu metnin Türkçe sürümü esas alınır.", EN: "This notice is updated when our processing activities or the law change. Each version, with its effective date and a summary of changes, is listed in the version history at the end of the page. The Turkish version of this notice prevails." },
        ],
    },
];

export default async function DisclosurePage() {
    const operator = await getOperatorInfo();
    return (
        <LegalPage
            current="/disclosure"
            eyebrow={{ TR: "KVKK m.10", EN: "KVKK Art. 10" }}
            title={{ TR: "Kişisel Verilerin İşlenmesine İlişkin Aydınlatma Metni", EN: "Information Notice on the Processing of Personal Data" }}
            summary={{ TR: "6698 sayılı Kişisel Verilerin Korunması Kanunu'nun 10. maddesi ve Aydınlatma Yükümlülüğü Tebliği uyarınca; veri sorumlusunu, hangi kişisel verilerinizi hangi amaçlarla ve hangi hukuki sebeplere dayanarak işlediğimizi, verilerin nasıl toplandığını, kimlere aktarıldığını ve haklarınızı açıklar.", EN: "In line with Article 10 of the Law No. 6698 on the Protection of Personal Data (KVKK) and the Communiqué on the Duty to Inform, this notice explains who the data controller is, which of your personal data we process, for which purposes and on which legal bases, how it is collected, to whom it is transferred and what your rights are." }}
            sections={sections(operator)}
            highlights={highlights(isOperatorPublished(operator))}
            operator={operator}
            notice={{ TR: "Bu metin, kişisel verileriniz elde edilirken sizi bilgilendirmek içindir; okumanız veya “Okudum” olarak işaretlemeniz açık rıza anlamına gelmez. Ayrıntılı açıklamalar [Gizlilik Politikası](/privacy-policy)'ndadır.", EN: "This notice informs you when your personal data is collected; reading it or marking it as read does not mean you give explicit consent. Detailed explanations are in the [Privacy Policy](/privacy-policy)." }}
        />
    );
}
