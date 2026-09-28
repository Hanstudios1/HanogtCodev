import type { Metadata } from "next";
import LegalPage, { type LegalHighlight, type LegalSection } from "@/components/LegalPage";

export const metadata: Metadata = {
    title: "KVKK Aydınlatma Metni",
    description: "6698 sayılı KVKK m.10 uyarınca veri sorumlusu, işleme amaçları, hukuki sebepler, aktarım alıcıları, toplama yöntemleri ve ilgili kişi hakları.",
    alternates: { canonical: "/disclosure" },
};

const highlights: LegalHighlight[] = [
    { title: "Kim?", text: "Veri sorumlusu Hanogt Codev hizmetini işleten HanStudios/Hanogt Codev işletmesidir." },
    { title: "Neden?", text: "Hesap, projeler, topluluk özellikleri, güvenlik ve yasal yükümlülükler için; ayrıntılar aşağıdaki matriste." },
    { title: "Kime?", text: "Altyapı, kimlik doğrulama, yapay zeka, kod çalıştırma ve iletişim sağlayıcılarına amaçla sınırlı olarak." },
    { title: "Haklarınız", text: "Bilgi alma, düzeltme, silme, itiraz ve zararın giderilmesi haklarınızı Geri Bildirim'den kullanabilirsiniz." },
];

const sections: LegalSection[] = [
    {
        id: "controller",
        title: "Veri sorumlusu",
        paragraphs: [
            "6698 sayılı Kişisel Verilerin Korunması Kanunu (\"KVKK\") kapsamında veri sorumlusu, Hanogt Codev hizmetini işleten HanStudios/Hanogt Codev işletmesidir. Kesin ticari unvan, MERSİS/VKN, açık adres, KEP ve irtibat e-postası üretim öncesinde bu metne eklenecektir; eksik kimlik bilgisiyle ticari yayına geçilmez.",
            "Bu metin, KVKK m.10 ve Aydınlatma Yükümlülüğünün Yerine Getirilmesinde Uyulacak Usul ve Esaslar Hakkında Tebliğ uyarınca, kişisel verileriniz elde edilirken sizi bilgilendirmek amacıyla hazırlanmıştır.",
        ],
    },
    {
        id: "methods",
        title: "Toplama yöntemleri",
        items: [
            "Kayıt, profil, proje, oyun motoru, yorum, oy, mesajlaşma ve geri bildirim formları üzerinden elektronik ortamda, otomatik yollarla.",
            "Google ile giriş seçildiğinde yetkilendirme sağlayıcısından.",
            "Hizmet kullanımı sırasında sunucu, güvenlik günlükleri ve hız sınırı kayıtlarından otomatik yollarla.",
            "WebRTC sesli arama sırasında geçici sinyalleşme ve ağ bağlantısı verilerinden.",
            "Tarayıcınızda çalışan araçlar (Kod Danışmanı, parola ölçer, bağlantı kontrolü, Security Bot) verileri sunucuya göndermediğinden bu araçlar yoluyla kişisel veri toplanmaz.",
        ],
    },
    {
        id: "matrix",
        title: "Veri kategorisi, amaç ve hukuki sebep",
        table: {
            head: ["Veri kategorisi", "İşleme amacı", "Hukuki sebep"],
            rows: [
                ["Kimlik ve iletişim (e-posta, kullanıcı adı, profil)", "Hesap açma, oturum, iletişim", "Sözleşmenin kurulması/ifası (m.5/2-c)"],
                ["Hesap güvenliği (parola karması, oturum)", "Kimlik doğrulama, yetkisiz erişimi önleme", "Sözleşmenin ifası; meşru menfaat (m.5/2-f)"],
                ["Kod projeleri, oyun sahneleri, C#/C++ scriptleri", "Editör ve Hanogt Engine hizmeti, bulut saklama", "Sözleşmenin ifası"],
                ["Arcade yayını (başlık, açıklama, kapak, görünen ad)", "Oyunu herkese açık sunma", "Sözleşmenin ifası; ilgili kişinin alenileştirmesi (m.5/2-d)"],
                ["Haber yorumları", "Yorumun yayımlanması, moderasyon", "Sözleşmenin ifası; meşru menfaat"],
                ["Arena oyları ve Arcade beğenileri (takma kimlik)", "Topluluk sıralaması ve sayımı, kötüye kullanım önleme", "Sözleşmenin ifası; meşru menfaat"],
                ["Mesaj, sesli mesaj, arkadaşlık, grup üyeliği", "İletişim ve iş birliği özellikleri", "Sözleşmenin ifası"],
                ["Media gönderisi, yorum, beğeni, rapor", "Topluluk paylaşımı ve moderasyon", "Sözleşmenin ifası; alenileştirme; meşru menfaat"],
                ["IP türevi anahtar, güvenlik olayları", "Kötüye kullanım ve saldırıların önlenmesi, denetim izi", "Meşru menfaat; hukuki yükümlülük (m.5/2-ç)"],
                ["Geri bildirim ve KVKK başvuruları", "Taleplerin yanıtlanması", "Hukuki yükümlülük; sözleşmenin ifası"],
                ["Security katkı programına işaretlenen proje", "Güvenlik imzalarını insan denetimli geliştirme", "Açık rıza (m.5/1) — her zaman geri alınabilir"],
            ],
        },
    },
    {
        id: "community-data",
        title: "Topluluk özelliklerine ilişkin ek bilgiler",
        items: [
            "Hanogt News yorumlarında görünen adınız, avatarınız ve yorum metniniz herkese açıktır; e-posta adresiniz yayımlanmaz ve yalnızca sahiplik kontrolü için saklanır.",
            "Yorumlar hakaret, spam ve kişisel veri (telefon, e-posta, T.C. kimlik, kart, IBAN) paylaşımına karşı otomatik olarak denetlenir; uygun olmayan yorum kaydedilmez.",
            "Yapay zeka arenası oylarında e-posta yerine tuzlanmış, geri çevrilemeyen bir takma kimlik saklanır; sıralamalar yalnızca toplu istatistiktir.",
            "Arcade'de yayımladığınız oyunun bilgileri ve oynanma/beğeni sayıları herkese açıktır; beğeniler takma kimlikle saklanır.",
            "Media'da yayımlama ve grup üyeliği sizin açık eyleminizle gerçekleşir; grup üyeleri grup içeriğine erişebilir.",
        ],
    },
    {
        id: "transfers",
        title: "Aktarılan taraflar ve aktarım amaçları",
        paragraphs: [
            "Kişisel verileriniz; barındırma, veritabanı ve dosya depolama hizmeti (Google/Firebase), seçtiğiniz kimlik sağlayıcısı (Google OAuth), yalnızca kullandığınızda yapay zeka asistanı sağlayıcısı, izole kod çalıştırma altyapısı, WebRTC bağlantı (TURN/STUN) sağlayıcıları ve isteğe bağlı parola sızıntı kontrolünde yalnızca parola özetinin ilk 5 karakteri için Have I Been Pwned hizmetine, amaçla sınırlı ve ölçülü olarak aktarılabilir.",
            "Kamu kurum ve kuruluşlarına yalnızca hukuka uygun ve bağlayıcı talep kapsamında aktarım yapılır. Verileriniz satılmaz ve reklam amacıyla üçüncü kişilerle paylaşılmaz.",
            "Yurt dışına aktarım söz konusu olduğunda 7499 sayılı Kanun ile değişik KVKK m.9 uyarınca yeterlilik kararı, standart sözleşme gibi uygun güvenceler veya kanundaki arızi aktarım hâllerinden uygun olanı esas alınır ve belgelenir.",
        ],
    },
    {
        id: "retention",
        title: "Saklama süreleri",
        items: [
            "Hesap, kod projesi, oyun projesi ve grup verileri: hesap veya üyelik sürdükçe; silme talebinde sahne ve script alt kayıtları dahil, yasal istisnalar dışında imha sürecine alınır.",
            "Haber yorumları, Arcade yayınları ve beğeniler, arena oyları: siz silene veya hesabınız silinene kadar; toplu sıralama istatistikleri anonim olarak kalabilir.",
            "Sesli mesaj: mesaj silindiğinde depolama dosyasıyla birlikte; grup silindiğinde grup ses dosyaları da silinir.",
            "WebRTC sinyalleşme: normal kapanışta silinir; beklenmeyen kopmada kısa son kullanım işaretinin ardından otomatik silinir.",
            "Hız sınırı kayıtları: güvenlik penceresi sona erdiğinde otomatik silinir; güvenlik ve rapor kayıtları ise inceleme ihtiyacına göre ölçülü süre saklanır.",
            "Süresi dolan veriler Kişisel Verilerin Silinmesi, Yok Edilmesi veya Anonim Hale Getirilmesi Hakkında Yönetmelik'e uygun olarak silinir, yok edilir veya anonimleştirilir.",
        ],
    },
    {
        id: "rights",
        title: "KVKK m.11 kapsamındaki haklarınız",
        items: [
            "Kişisel verilerinizin işlenip işlenmediğini öğrenme, işlenmişse bilgi talep etme.",
            "İşlenme amacını ve amacına uygun kullanılıp kullanılmadığını öğrenme.",
            "Yurt içinde veya yurt dışında aktarıldığı üçüncü kişileri bilme.",
            "Eksik veya yanlış işlenmişse düzeltilmesini isteme.",
            "KVKK m.7 şartları çerçevesinde silinmesini veya yok edilmesini isteme.",
            "Düzeltme, silme ve yok etme işlemlerinin aktarıldığı üçüncü kişilere bildirilmesini isteme.",
            "Münhasıran otomatik sistemlerle analiz edilmesi sonucu aleyhinize bir sonucun ortaya çıkmasına itiraz etme.",
            "Kanuna aykırı işlenmesi sebebiyle zarara uğramanız hâlinde zararın giderilmesini talep etme.",
        ],
    },
    {
        id: "application",
        title: "Başvuru kanalı ve yanıt süresi",
        paragraphs: [
            "Kimliği doğrulanmış kullanıcı, Geri Bildirim ve SSS sayfasında \"Gizlilik/KVKK\" başlığıyla başvurabilir. Veri Sorumlusuna Başvuru Usul ve Esasları Hakkında Tebliğ'de belirtilen diğer yazılı ve elektronik yöntemler (KEP, güvenli elektronik imza vb.), kesin KEP ve adres bilgileri yayımlandığında ayrıca listelenir.",
            "Başvurunuz talebin niteliğine göre en kısa sürede ve en geç 30 gün içinde ücretsiz sonuçlandırılır. Kimlik doğrulamak için yalnızca gerekli ek bilgi istenir; başvuru içeriği üçüncü kişilerle paylaşılmaz. Hesap Ayarları'ndaki \"Verilerimi indir\" ve \"Hesabı sil\" seçenekleri bazı haklarınızı anında kullanmanızı sağlar.",
        ],
    },
    {
        id: "consent",
        title: "Aydınlatma ile açık rıza ayrımı",
        paragraphs: [
            "Bu aydınlatma metninin okunması veya \"Okudum\" olarak işaretlenmesi, açık rıza gerektiren işlemlere toplu rıza anlamına gelmez. Açık rıza gerektiren işlemler (ör. Security katkı programı) için amaç bazlı, ayrı ve geri alınabilir tercih sunulur. Rızanın geri çekilmesi temel hesap işlevlerini etkilemez.",
        ],
    },
    {
        id: "security-consent",
        title: "Security katkı tercihinin kapsamı",
        paragraphs: [
            "Güvenlik katkı tercihi iki aşamalıdır: hesap düzeyindeki program tercihi ve proje düzeyindeki dahil etme kutusu. Her ikisi de etkin değilse proje güvenlik geliştirme veri setine aday gösterilmez. Rıza Media sayfasından ileriye etkili olarak geri çekilebilir; bekleyen aday kayıtlar silinir.",
            "Üretimde gerçek bir model eğitimi veya üçüncü tarafa veri seti aktarımı başlatılacaksa; alıcı, ülke, saklama süresi, anonimleştirme yöntemi ve ilgili kişi hakları işlem başlamadan önce ayrı metinde açıklanır.",
        ],
    },
];

export default function DisclosurePage() {
    return (
        <LegalPage
            current="/disclosure"
            eyebrow="KVKK m.10"
            title="Kişisel Verilerin İşlenmesine İlişkin Aydınlatma Metni"
            summary="Veri sorumlusunun kimliği, işleme amaçları, hukuki sebepler, aktarım alıcıları, toplama yöntemleri, saklama süreleri ve başvuru haklarınız hakkında katmanlı bilgilendirme."
            sections={sections}
            highlights={highlights}
            notice="Aydınlatma yükümlülüğü veriler elde edilirken yerine getirilir. Bu metin, kayıt ekranındaki kısa bilgilendirme ve amaç bazlı tercihlerle birlikte kullanılır."
        />
    );
}
