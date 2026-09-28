import type { Metadata } from "next";
import LegalPage, { type LegalHighlight, type LegalSection } from "@/components/LegalPage";

export const metadata: Metadata = {
    title: "Gizlilik Politikası",
    description: "Hanogt Codev'in hangi kişisel verileri neden işlediği, kimlerle paylaşabildiği, ne kadar sakladığı ve haklarınızı nasıl kullanabileceğiniz.",
    alternates: { canonical: "/privacy-policy" },
};

const highlights: LegalHighlight[] = [
    { title: "Veri satmayız", text: "Kişisel verilerinizi satmayız, kiralamayız ve reklam profili oluşturmak için kullanmayız." },
    { title: "Reklam çerezi yok", text: "Reklam veya üçüncü taraf takip çerezi kullanılmaz; yalnızca oturum için zorunlu çerezler vardır." },
    { title: "Yerel güvenlik araçları", text: "Kod Danışmanı, parola ölçer, bağlantı kontrolü ve Security Bot analizi tarayıcınızda yapılır." },
    { title: "Kontrol sizde", text: "Hesap Ayarları'ndan verilerinizi indirebilir, hesabınızı ve ilişkili içeriklerinizi silebilirsiniz." },
];

const sections: LegalSection[] = [
    {
        id: "scope",
        title: "Kapsam ve veri sorumlusu",
        paragraphs: [
            "Bu politika; Hanogt Codev web sitesi, masaüstü ve mobil uygulamalarında sunulan kod editörü, Hanogt Engine oyun motoru, Hanogt Arcade, Hanogt News, Hanogt Media, gruplar ve mesajlaşma, Güvenlik Merkezi ve Security Bot hizmetlerinde kişisel verilerin nasıl işlendiğini açıklar.",
            "6698 sayılı Kişisel Verilerin Korunması Kanunu (KVKK) kapsamında veri sorumlusu, hizmeti işleten HanStudios/Hanogt Codev işletmesidir. Ticari unvan, MERSİS/VKN, açık adres ve KEP bilgileri kesinleştirilmeden ücretli veya ticari sürüm yayımlanmaz; bu bilgiler yayımlandığında bu bölüm gecikmeksizin güncellenir.",
            "Başvurular Geri Bildirim ve SSS sayfasında \"Gizlilik/KVKK\" başlığıyla alınır. Başvuru, hesabınızla ilişkili e-posta üzerinden kimlik doğrulaması yapılarak işletilir.",
        ],
    },
    {
        id: "principles",
        title: "Temel ilkelerimiz",
        items: [
            "Hukuka ve dürüstlük kurallarına uygunluk: verilerinizi yalnızca açıkladığımız amaçlarla işleriz.",
            "Veri minimizasyonu: bir özellik için gerekmeyen veriyi toplamayız. Örneğin haber akışı ve yapay zeka sıralamaları giriş yapmadan kullanılabilir.",
            "Takma adlandırma: arena oylarında ve Arcade beğenilerinde e-posta adresiniz yerine tuzlanmış, geri çevrilemeyen bir kimlik saklanır.",
            "Yerel işlem önceliği: güvenlik araçları ve Security Bot mesajları sunucuya gönderilmeden tarayıcıda işlenir.",
            "Şeffaflık: yapılmamış bir denetimi yapılmış gibi, kurulmamış bir güvenceyi kurulmuş gibi beyan etmeyiz.",
        ],
    },
    {
        id: "data",
        title: "İşlenen kişisel veri kategorileri",
        items: [
            "Kimlik ve iletişim: e-posta adresi, kullanıcı adı, takma ad, profil adı, avatar bağlantısı ve isteğe bağlı profil alanları (biyografi, bağlantılar).",
            "Hesap güvenliği: parolanın kendisi değil, benzersiz tuzla üretilmiş tek yönlü scrypt karması; oturum bilgisi, başarısız deneme ve güvenlik olayı kayıtları.",
            "İçerik: kod projeleri ve dosyaları; oyun projesi sahneleri, nesneleri, bileşenleri, prefab/doku verileri ve C#/C++ script kaynakları; Arcade yayın başlığı, açıklaması ve kapak görseli.",
            "Topluluk etkileşimi: Media gönderileri, yorumlar, beğeniler ve raporlar; Hanogt News yorumları; Arcade beğenileri; yapay zeka arenası oyları (takma kimlikle).",
            "İletişim: birebir ve grup mesajları, sesli mesaj dosyaları, arkadaşlık ilişkileri, engellenen kullanıcılar, çevrimiçi durum ve son görülme tercihi.",
            "Teknik kayıtlar: IP adresinden türetilen hız sınırı anahtarları, tarayıcı/cihaz bilgisi, zaman damgaları ve hata kayıtları.",
            "Sesli arama (WebRTC): geçici SDP/ICE bağlantı verisi. Arama sesi kaydedilmez; ses katılımcılar arasında gerçek zamanlı taşınır.",
        ],
        note: "Özel nitelikli kişisel veri (sağlık, biyometrik veri, din, siyasi görüş vb.) talep etmeyiz. Lütfen bu tür verileri profilinize, kodunuza, yorumlarınıza veya mesajlarınıza yazmayın.",
    },
    {
        id: "matrix",
        title: "Veri, amaç ve hukuki sebep matrisi",
        table: {
            head: ["Veri", "Kaynak", "Amaç", "Hukuki sebep (KVKK m.5)"],
            rows: [
                ["E-posta, kullanıcı adı, profil", "Kayıt formu / Google OAuth", "Hesap açma, oturum, iletişim", "Sözleşmenin kurulması ve ifası (m.5/2-c)"],
                ["Parola karması, oturum", "Kayıt ve giriş", "Kimlik doğrulama, hesap güvenliği", "Sözleşmenin ifası; meşru menfaat (m.5/2-f)"],
                ["Kod ve oyun projeleri", "Editör ve Hanogt Engine", "Saklama, düzenleme, çalıştırma, dışa aktarma", "Sözleşmenin ifası"],
                ["Arcade yayını", "Yayınlama ekranı", "Oyunu herkese açık sunmak", "Sözleşmenin ifası; alenileştirme iradesi (m.5/2-d)"],
                ["Haber yorumu", "Yorum formu", "Yorumu yayımlamak ve moderasyon", "Sözleşmenin ifası; meşru menfaat"],
                ["Arena oyu (takma kimlik)", "Oy düğmeleri", "Topluluk sıralaması, kötüye kullanım önleme", "Sözleşmenin ifası; meşru menfaat"],
                ["Mesaj, sesli mesaj, grup verisi", "Sohbet ve gruplar", "İletişim ve iş birliği", "Sözleşmenin ifası"],
                ["IP türevi anahtar, güvenlik olayı", "Sunucu kayıtları", "Kötüye kullanım ve saldırı önleme", "Meşru menfaat; hukuki yükümlülük (m.5/2-ç)"],
                ["Security katkı projesi", "Ayrı işaretleme", "Güvenlik imzalarını geliştirme", "Açık rıza (geri alınabilir)"],
            ],
        },
    },
    {
        id: "purposes",
        title: "İşleme amaçları",
        items: [
            "Hesap oluşturma, oturum yönetimi ve temel hizmetlerin sunulması.",
            "Projelerinizin saklanması, eşitlenmesi, çalıştırılması ve dışa aktarılması.",
            "Topluluk özelliklerinin (Media, Arcade, Haber yorumları, arena, gruplar) işletilmesi.",
            "Güvenlik: kötüye kullanımın önlenmesi, hız sınırları, denetim izi, ihlal tespiti ve müdahale.",
            "Destek taleplerinin, geri bildirimlerin, güvenlik itirazlarının ve KVKK başvurularının yanıtlanması.",
            "Hukuki yükümlülüklerin yerine getirilmesi ve yetkili makam taleplerinin karşılanması.",
            "Ticari elektronik ileti gönderilirse 6563 sayılı Kanun uyarınca ayrı onay alınır; hizmet bildirimleri pazarlama onayı sayılmaz.",
        ],
    },
    {
        id: "news",
        title: "Hanogt News, haber içerikleri ve yorumlar",
        paragraphs: [
            "Haber akışı, yayıncıların herkese açık RSS/Atom akışlarından sunucumuz tarafından toplanır. Yalnızca başlık, en fazla yaklaşık 300 karakterlik özet, görsel bağlantısı, yayın tarihi ve orijinal habere bağlantı alınır; haberin tamamı kopyalanmaz. Her kart yayıncının sitesine yönlendirir ve içerik hakları ilgili yayıncıya aittir. Akış toplanırken sizin kişisel verileriniz yayıncılara gönderilmez.",
            "Haber kartlarındaki görseller doğrudan yayıncının sunucusundan tarayıcınıza yüklenir. Bu sırada yayıncı, her web sitesinde olduğu gibi IP adresinizi ve tarayıcı bilgilerinizi görebilir; tarayıcıya yönlendiren sayfa bilgisi (referrer) gönderilmemesi istenir. Haber bağlantısına tıkladığınızda yayıncının kendi gizlilik politikası geçerlidir.",
            "Yorumlar için haber kimliği, haber başlığı ve bağlantısı, e-posta adresiniz (yalnızca sahiplik ve silme kontrolü için; yayımlanmaz), görünen adınız, avatarınız, yorum metni ve zaman damgası saklanır. Diğer kullanıcılar yalnızca ad, avatar, metin ve zamanı görür. Her haberin yorum sayısı ayrı bir sayaçta tutulur.",
        ],
        items: [
            "Yorumlar otomatik olarak hakaret, spam ve kişisel veri (telefon, e-posta, T.C. kimlik, kart, IBAN) içeriğine karşı denetlenir; uygun olmayan yorum kaydedilmeden reddedilir.",
            "Kendi yorumunuzu dilediğiniz zaman silebilirsiniz; hesap silindiğinde tüm yorumlarınız silinir ve sayaçlar güncellenir.",
            "Sunucu tarafında yalnızca haber başlıklarından oluşan bir önbellek tutulur; bu önbellek kişisel veri içermez.",
            "\"Sonra oku\" ile kaydettiğiniz haberler yalnızca kendi tarayıcınızda saklanır, sunucuya gönderilmez.",
        ],
    },
    {
        id: "arena",
        title: "Yapay zeka arenası ve sıralamalar",
        paragraphs: [
            "Arena oylarında e-posta adresiniz saklanmaz. Bunun yerine gizli bir tuz ile üretilmiş, geri çevrilemeyen 24 karakterlik bir takma kimlik; kategori, karşılaştırılan iki asistan, sonuç ve oy günü kaydedilir. Bu kayıt; aynı ikiliye günde bir oy kuralını ve saatlik oy sınırını uygulamak için kullanılır. Takma kimlik, tuza erişimi olan sistemlerimiz açısından yine kişisel veri sayıldığından KVKK güvencelerine tabidir.",
            "Sıralama puanları oylardan Elo yöntemiyle hesaplanan toplu istatistiklerdir ve kişiyle ilişkilendirilmez. Hesabınızı sildiğinizde oy kayıtlarınız silinir; daha önce hesaplanmış toplu puanlar anonim istatistik olarak kalır.",
            "Dış sıralama verileri (ör. OpenRouter model kataloğu, yapılandırılmışsa benchmark endeksleri) sunucumuz tarafından ilgili kaynaklardan çekilir; bu isteklerde hiçbir kullanıcı verisi gönderilmez ve kaynak her zaman belirtilir.",
        ],
    },
    {
        id: "engine-arcade",
        title: "Hanogt Engine ve Hanogt Arcade",
        paragraphs: [
            "Giriş yaptığınızda oyun projeleriniz hesabınıza bağlı olarak buluta kaydedilir; sahne verileri ve her script ayrı kayıtlarda tutulur. Giriş yapmadan oluşturulan projeler yalnızca tarayıcınızın yerel veritabanında (IndexedDB) saklanır ve sunucuya gönderilmez. Oyunların PlayerPrefs verileri de tarayıcınızda tutulur.",
            "Oyun scriptleri doğrudan tarayıcı kodu olarak değil, Hanogt'un C#/C++ script sanal makinesinde çalışır ve yalnızca motorun sunduğu arayüzlere erişebilir. \"HTML olarak dışa aktar\" özelliği projenizi tarayıcınızda tek bir dosyaya dönüştürür.",
            "Arcade'de yayımlama sizin açık ve ayrı eyleminizle gerçekleşir. Yayımlanan oyunun başlığı, açıklaması, kapak görseli, görünen yazar adı ve avatarı, kullanılan diller, oynanma ve beğeni sayıları herkese açıktır; oyun başkaları tarafından oynanabilir ve remikslenebilir. E-posta adresiniz yayımlanmaz.",
        ],
        items: [
            "Yayın öncesinde scriptler sunucuda Hanogt Security imzalarıyla taranır; yüksek riskli kod yayımlanmaz.",
            "Beğeniler e-postanız yerine tuzlanmış bir kimlikle saklanır; hesap silindiğinde beğenileriniz kaldırılır ve sayaçlar düşürülür.",
            "Oynanma sayısı, aynı bağlantıdan tekrarlanan sayımları önlemek için IP türevi kısa süreli bir anahtarla sınırlandırılır; kişiye özel oynama geçmişi tutulmaz.",
            "Yayını dilediğiniz zaman kaldırabilirsiniz. Başkalarının daha önce indirdiği veya dışa aktardığı kopyaların uzaktan silinmesi teknik olarak mümkün değildir.",
        ],
    },
    {
        id: "media",
        title: "Hanogt Media ve herkese açık içerikler",
        paragraphs: [
            "Hanogt Media'da yayımlanan proje başlığı, açıklama, etiketler, programlama dili, kaynak dosyaları, beğeni ve yorum sayıları internet kullanıcıları tarafından görülebilir ve proje dosyaları indirilebilir. Yayımlama sizin açık eyleminizle gerçekleşir; özel projeler kendiliğinden Media'ya aktarılmaz.",
            "Profil adınızı göstermeyi veya anonim yayın yapmayı seçebilirsiniz. E-posta adresiniz Media yanıtlarında açıklanmaz. Kaynak kodun içine yazdığınız ad, e-posta, erişim anahtarı veya diğer kişisel veriler otomatik olarak ayıklanamayabilir; yayımlamadan önce içeriği temizlemek yayıncının sorumluluğundadır. Güvenlik Merkezi'ndeki Kod Danışmanı bu kontrolde size yardımcı olur.",
        ],
        items: [
            "Beğeni kayıtlarında kötüye kullanımı önlemek için hesap kimliği sunucu tarafında tutulur; diğer kullanıcılara açıklanmaz.",
            "Yorumlarda profil adı ve isteğe bağlı avatar yayımlanır.",
            "Zararlı kod, telif, kişisel veri ve spam bildirimleri; inceleme, savunma ve uyuşmazlık kaydı amacıyla sınırlı süre saklanır.",
            "Bir yayın silindiğinde anlık görüntü dosyaları, beğeni, yorum, rapor ilişkileri ve bekleyen güvenlik katkı kaydı silme kapsamına alınır.",
        ],
    },
    {
        id: "groups",
        title: "Gruplar, mesajlar ve sesli aramalar",
        paragraphs: [
            "Grup üyeleri grup adı, üye listesi, üyelerin profil bilgileri, ortak dosyalar, değişikliği yapan üye, sohbet ve sesli mesajlara erişebilir. Davetler süreli bağlantılarla yapılır ve davet kabul edilmeden grup içeriğine erişim başlamaz.",
            "Ortak dosyalarda güncellemeler gerçek zamanlı eşitlenir; eş zamanlı düzenlemelerde son yazma baskın olabilir. Sesli aramalar WebRTC ile eşten eşe kurulur ve Hanogt tarafından kaydedilmez. Sesli mesajlar ise sizin kaydedip gönderdiğiniz, erişimi sohbet katılımcılarıyla sınırlı ayrı dosyalardır.",
        ],
    },
    {
        id: "security-tools",
        title: "Güvenlik Merkezi ve Security Bot",
        paragraphs: [
            "Kod Danışmanı, Parola Laboratuvarı, Bağlantı Kontrolü ve Güvenlik Kontrol Listesi tarayıcınızda çalışır; yapıştırdığınız kod, yazdığınız parola ve kontrol ettiğiniz bağlantı sunucumuza gönderilmez. Kontrol listesi ilerlemeniz yalnızca tarayıcınızda saklanır.",
            "Security Bot'a yazdığınız mesajlar tarayıcınızda işlenir; sohbet geçmişi yalnızca açık sekme süresince tarayıcı oturum depolamasında tutulur ve sekme kapandığında silinir. Bot, mesajınızda gizli anahtar veya jeton algılarsa sizi uyarır; bu bilgiyi hiçbir yere göndermez.",
            "İsteğe bağlı \"Sızıntılarda ara\" özelliği k-anonimlik yöntemini kullanır: parolanızın SHA-1 özeti tarayıcınızda hesaplanır ve yalnızca ilk 5 karakteri sunucumuza, oradan da Have I Been Pwned \"Pwned Passwords\" hizmetine iletilir. Parolanız ve tam özeti hiçbir zaman ağ üzerinden gönderilmez; eşleşme tarayıcınızda yapılır. Sunucumuz bu istekler için yalnızca 10 dakikalık, bellekte tutulan bir hız sınırı sayacı kullanır.",
        ],
    },
    {
        id: "security-contribution",
        title: "Security Bot katkı programı ve açık rıza",
        paragraphs: [
            "\"Hanogt Security Bot'u geliştirmek için verilerinizi paylaşmak ister misiniz?\" tercihi varsayılan olarak kapalıdır. Tercihin açılması tek başına projelerinizi aktarmaz; ilgili projeyi yayımlama ekranında ayrıca işaretlemeniz gerekir. Amaç, güvenlik imzalarının ve yanlış pozitiflerin insan denetimli değerlendirilmesidir. Ham kod üzerinde kontrolsüz veya kendi kendine otomatik model eğitimi yapılmaz.",
            "Rızanızı geri çektiğinizde bekleyen katkı kayıtları silinir ve yeni katkı alınmaz. Rızanın verilmemesi temel hizmetleri engellemez.",
        ],
        items: [
            "Amaç: güvenlik ön elemesini iyileştirmek ve yanlış pozitifleri azaltmak.",
            "Kapsam: yalnızca ayrıca işaretlediğiniz Media proje anlık görüntüsü.",
            "Hukuki sebep: özgür iradeyle verilen, belirli ve bilgilendirilmiş açık rıza.",
            "Geri çekme: Media sayfasındaki tercih düğmesi ve KVKK başvuru kanalı.",
        ],
    },
    {
        id: "sharing",
        title: "Alıcılar ve hizmet sağlayıcılar",
        paragraphs: ["Verileriniz satılmaz. Hizmetin çalışması için aşağıdaki alıcı gruplarına, amaçla sınırlı ve ölçülü olarak aktarılabilir:"],
        table: {
            head: ["Alıcı", "Aktarılan veri", "Amaç"],
            rows: [
                ["Google / Firebase", "Hesap, proje, mesaj, yorum ve dosya verileri", "Veritabanı, dosya depolama ve altyapı"],
                ["Google OAuth", "Google ile giriş seçerseniz kimlik bilgileri", "Kimlik doğrulama"],
                ["Yapay zeka sağlayıcısı (ör. Groq)", "Yalnızca AI asistanına gönderdiğiniz istem ve kod", "Yanıt üretimi"],
                ["İzole kod çalıştırıcısı", "Yalnızca çalıştırılmasını istediğiniz kaynak kod", "Kodun çalıştırılması"],
                ["TURN/STUN işletmecisi", "WebRTC için IP ve ağ üst verisi", "Sesli arama bağlantısı"],
                ["Have I Been Pwned", "Parola SHA-1 özetinin ilk 5 karakteri (isteğe bağlı)", "Parola sızıntı kontrolü"],
                ["Haber yayıncıları", "Görsel yüklenirken tarayıcınızın IP ve tarayıcı bilgisi", "Haber görsellerinin gösterimi"],
                ["Barındırma sağlayıcısı", "Web istekleri ve teknik kayıtlar", "Hizmetin sunulması"],
                ["Yetkili kamu kurumları", "Talep kapsamındaki veriler", "Hukuka uygun ve bağlayıcı talepler"],
            ],
        },
    },
    {
        id: "transfers",
        title: "Yurt dışına aktarım",
        paragraphs: [
            "Hizmet sağlayıcılarımızın bir kısmı (ör. Google/Firebase, yapay zeka sağlayıcısı, Have I Been Pwned) sunucularını yurt dışında işletebilir. Yurt dışına aktarım, 7499 sayılı Kanun ile değişik KVKK m.9 ve Kişisel Verilerin Yurt Dışına Aktarılmasına İlişkin Usul ve Esaslar Hakkında Yönetmelik çerçevesinde; yeterlilik kararı, standart sözleşme gibi uygun güvenceler veya kanunda sayılan arızi aktarım hâllerinden uygun olanına dayanılarak yapılır.",
            "Standart sözleşme kullanıldığında mevzuatta öngörülen süre içinde Kurul'a bildirim yapılır. Gerekli güvence kurulmadan ilgili özellik etkinleştirilmez; genel bir politika onayı, gerektiği durumda ayrı açık rızanın yerine geçmez.",
        ],
    },
    {
        id: "local-storage",
        title: "Çerezler ve tarayıcı depolama",
        paragraphs: ["Reklam, analitik veya üçüncü taraf takip çerezi kullanmayız. Aşağıdaki çerezler ve tarayıcı depolama anahtarları yalnızca hizmetin çalışması ve tercihlerinizin hatırlanması içindir. Tarayıcı ayarlarınızdan dilediğiniz zaman silebilirsiniz; bu, buluttaki hesap verilerinizi silmez."],
        table: {
            head: ["Ad", "Tür", "Amaç", "Süre"],
            rows: [
                ["next-auth.session-token", "Zorunlu çerez", "Oturumunuzu güvenle sürdürmek", "En fazla 30 gün"],
                ["next-auth.csrf-token, callback-url", "Zorunlu çerez", "Sahte istek (CSRF) koruması ve giriş sonrası yönlendirme", "Oturum"],
                ["theme, hanogt_lang", "Yerel depolama", "Tema ve dil tercihi", "Siz silene kadar"],
                ["hanogt_privacy_accepted, hanogt_legal_notice_version", "Yerel depolama", "Bilgilendirmenin hangi sürümünün gösterildiği", "Siz silene kadar"],
                ["hanogt_banner_closed", "Yerel depolama", "Beta uyarısının kapatıldığını hatırlamak", "Siz silene kadar"],
                ["hanogt_editor_settings, hanogt_unsaved_tabs", "Yerel depolama", "Editör ayarları ve kaydedilmemiş sekmeleri kurtarma", "Siz silene kadar"],
                ["hanogt_projects…", "Yerel depolama", "Bulut erişilemezse yerel proje yedeği", "Siz silene kadar"],
                ["hanogt-engine (IndexedDB), hanogt-engine:layout", "Tarayıcı veritabanı", "Yerel oyun projeleri ve editör düzeni", "Siz silene kadar"],
                ["hanogt-engine:prefs:…", "Yerel depolama", "Oyunların PlayerPrefs kayıtları (ör. en yüksek skor)", "Siz silene kadar"],
                ["hanogt-news:saved", "Yerel depolama", "\"Sonra oku\" listesi", "Siz silene kadar"],
                ["hanogt-security:checklist", "Yerel depolama", "Güvenlik kontrol listesi ilerlemesi", "Siz silene kadar"],
                ["hanogt-security-bot:chat, hanogt-engine:clipboard", "Oturum depolaması", "Bot sohbet geçmişi ve motor içi kopyala/yapıştır", "Sekme kapanınca silinir"],
            ],
        },
        note: "Firebase istemci kitaplığı gerçek zamanlı bağlantı için teknik depolama kullanabilir. Ortak kullanılan cihazlarda oturumu kapatmanızı ve yerel proje taslaklarını temizlemenizi öneririz.",
    },
    {
        id: "retention",
        title: "Saklama süreleri ve imha",
        table: {
            head: ["Veri", "Saklama süresi"],
            rows: [
                ["Hesap ve profil", "Hesap açık kaldıkça; silme talebinde yasal istisnalar dışında imha"],
                ["Kod ve oyun projeleri", "Siz silene veya hesap silinene kadar (sahne ve script alt kayıtları dahil)"],
                ["Arcade yayını ve beğeniler", "Yayından kaldırılana veya hesap silinene kadar"],
                ["Haber yorumları", "Siz silene veya hesap silinene kadar"],
                ["Arena oy kayıtları", "Hesap silinene kadar; toplu puanlar anonim istatistik olarak kalır"],
                ["Mesajlar ve sesli mesajlar", "Gönderen silene veya hesap/grup silinene kadar; dosyası da silinir"],
                ["WebRTC sinyalleşme", "Arama bitince silinir; kopmada kısa süreli son kullanım işaretiyle otomatik silinir"],
                ["Hız sınırı kayıtları", "İlgili zaman penceresi + kısa süreli otomatik silme (TTL)"],
                ["Güvenlik olayları", "Orantılı inceleme süresi; ham kod yerine kod özeti ve bulgu kimlikleriyle"],
                ["Haber önbelleği", "Her yenilemede üzerine yazılır; kişisel veri içermez"],
                ["Yedekler", "Silinen kayıtlar olağan yedek döngüsünde erişilemez hâle getirilir"],
            ],
        },
    },
    {
        id: "security",
        title: "Güvenlik tedbirleri",
        paragraphs: [
            "Parolalar benzersiz tuzla scrypt ile tek yönlü karmalanır ve istemci erişimine kapalı ayrı bir koleksiyonda tutulur. Hassas uç noktalar oturum, aynı kaynak kontrolü, şema ve boyut doğrulaması ile dağıtık hız sınırı uygular. Veritabanı kuralları en az ayrıcalık ilkesine göre tanımlanır; yorumlar, oylar, oyun yayınları ve önbellekler gibi hassas koleksiyonlara tarayıcıdan doğrudan erişim kapalıdır.",
            "Web güvenliği için İçerik Güvenliği Politikası (CSP), HSTS, çerçeveleme yasağı, MIME türü koruması, sıkı referrer ve izin politikaları uygulanır. Hanogt Security bir imza ve davranış ön eleme katmanıdır; tek başına antivirüs, güvenli sandbox veya kesin kötü amaçlı yazılım kararı değildir.",
        ],
    },
    {
        id: "automated-decisions",
        title: "Otomatik analiz, moderasyon ve insan incelemesi",
        paragraphs: [
            "Kod güvenlik taraması yüksek riskli imzaları tespit ettiğinde çalıştırma veya yayın geçici olarak engellenebilir; yorum filtresi uygun olmayan bir yorumu kaydetmeden reddedebilir. Bu sonuçlar kişi hakkında hukukî veya benzeri önemli etki doğuran nihai bir karar değildir; metni düzenleyip yeniden deneyebilir veya güvenlik itirazıyla insan incelemesi isteyebilirsiniz.",
            "Hesap askıya alma veya kalıcı yaptırım yalnızca otomatik bir eşleşmeye dayandırılmaz. KVKK m.11/1-g kapsamında, münhasıran otomatik sistemlerle analiz edilmesi sonucu aleyhinize bir sonucun ortaya çıkmasına itiraz hakkınız saklıdır.",
        ],
    },
    {
        id: "breach",
        title: "İhlal yönetimi ve bildirim",
        paragraphs: [
            "Kişisel veri ihlali şüphesinde erişim sınırlandırma, delil bütünlüğünü koruma, etki ve kapsam analizi, hizmet sağlayıcı koordinasyonu ve giderim adımları uygulanır. İhlal durumunda Kurul kararlarında öngörülen usul ve süreler (en kısa sürede ve Kurul'un belirlediği süre içinde) dikkate alınarak Kurul'a ve etkilenen kişilere bildirim yapılır.",
            "Güvenlik açığı bulan araştırmacılar, kişisel veriye erişmeden ve hizmeti aksatmadan Geri Bildirim sayfasındaki güvenlik kanalını kullanmalıdır. Ayrıntılar Güvenlik Merkezi'ndeki sorumlu bildirim rehberindedir.",
        ],
    },
    {
        id: "rights",
        title: "KVKK m.11 kapsamındaki haklarınız",
        items: [
            "Kişisel verinizin işlenip işlenmediğini öğrenme ve işlenmişse bilgi isteme.",
            "İşleme amacını ve amacına uygun kullanılıp kullanılmadığını öğrenme.",
            "Yurt içinde veya yurt dışında aktarıldığı üçüncü kişileri bilme.",
            "Eksik veya yanlış işlenen verinin düzeltilmesini isteme.",
            "Şartları oluştuğunda silinmesini veya yok edilmesini ve bu işlemlerin aktarılan üçüncü kişilere bildirilmesini isteme.",
            "Münhasıran otomatik sistemlerle analiz sonucu aleyhinize bir sonuca itiraz etme.",
            "Kanuna aykırı işleme nedeniyle zarara uğramanız hâlinde zararın giderilmesini talep etme.",
        ],
        note: "Birçok hakkınızı doğrudan kullanabilirsiniz: Hesap Ayarları → Verilerimi indir (projeler, oyunlar, yorumlar, beğeniler ve oy kayıtları dahil) ve Hesabı sil.",
    },
    {
        id: "applications",
        title: "Başvuru usulü",
        paragraphs: [
            "Başvuruda ad-soyad, (yazılı başvuruda) imza, T.C. kimlik numarası veya yabancılar için kimlik bilgisi, tebligata esas adres, varsa e-posta/telefon ve talep konusu bulunmalıdır. Hesap içi kanaldan yapılan başvuruda hesap e-postasıyla ek doğrulama istenebilir. Başvurular en geç 30 gün içinde ücretsiz sonuçlandırılır; işlemin ayrıca maliyet gerektirmesi hâlinde Kurul tarifesi uygulanabilir.",
            "Yanıtı yetersiz bulmanız veya süresinde yanıt verilmemesi hâlinde KVKK'da öngörülen sürelerde Kişisel Verileri Koruma Kurulu'na şikâyet hakkınız saklıdır.",
        ],
    },
    {
        id: "children",
        title: "Çocukların gizliliği",
        paragraphs: [
            "Hizmet 13 yaşın altındaki çocuklara yönelik değildir ve bilerek bu yaştaki çocuklardan kişisel veri toplanmaz. 18 yaşından küçük kullanıcıların hizmeti ebeveyn veya vasilerinin bilgisi dahilinde kullanmasını öneririz. Bir çocuğun verisinin işlendiğini düşünüyorsanız Geri Bildirim'den bize ulaşın; veri gecikmeksizin silinir.",
        ],
    },
    {
        id: "changes",
        title: "Politika değişiklikleri",
        paragraphs: [
            "Esaslı değişiklikler yürürlüğe girmeden önce uygulama içinde duyurulur ve güncel sürüm bilgilendirmesi yeniden gösterilir. Metin sessizce değiştirilmez; her sürüm, tarih ve değişiklik özetiyle aşağıdaki sürüm geçmişinde tutulur.",
        ],
    },
];

export default function PrivacyPolicyPage() {
    return (
        <LegalPage
            current="/privacy-policy"
            eyebrow="Gizlilik ve veri koruma"
            title="Gizlilik Politikası"
            summary="Hangi veriyi neden işlediğimizi, kimlerle paylaşabildiğimizi, ne kadar sakladığımızı ve kontrolün sizde olduğu noktaları açık, ölçülü ve doğrulanabilir biçimde anlatır."
            sections={sections}
            highlights={highlights}
            notice="Bu metin uygulamanın teknik işleyişiyle uyumlu hazırlanmıştır. İşletme unvanı, açık adres, KEP ve VERBİS kaydı gibi bilgiler gerçek işletme bilgileriyle bir hukuk danışmanı tarafından üretim öncesinde doğrulanmalıdır."
        />
    );
}
