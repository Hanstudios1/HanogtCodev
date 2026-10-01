import type { Metadata } from "next";
import LegalPage, { type LegalHighlight, type LegalSection } from "@/components/LegalPage";

export const metadata: Metadata = {
    title: "Kullanım Şartları",
    description: "Hanogt Codev hesabı, içerik ve fikrî haklar, Hanogt Engine, Arcade, Hanogt News, Media, güvenlik, yaptırım ve uyuşmazlık kuralları.",
    alternates: { canonical: "/terms-of-use" },
};

const highlights: LegalHighlight[] = [
    { title: "İçerik sizindir", text: "Kodunuzun ve oyunlarınızın mülkiyeti sizde kalır; yalnızca hizmeti sunmak için sınırlı bir teknik izin verirsiniz." },
    { title: "Saygılı topluluk", text: "Taciz, spam, zararlı kod, kişisel veri paylaşımı ve oy manipülasyonu yasaktır." },
    { title: "Orantılı yaptırım", text: "Otomatik tespitler tek başına kalıcı ceza doğurmaz; itiraz ve insan incelemesi yolu açıktır." },
    { title: "Emredici haklar saklı", text: "Tüketici hakları ve kanundan doğan sorumluluklar bu şartlarla kaldırılamaz." },
];

const sections: LegalSection[] = [
    {
        id: "contract",
        title: "Sözleşmenin kapsamı ve kabul",
        paragraphs: [
            "Bu şartlar; Hanogt Codev web sitesi, masaüstü ve mobil uygulamaları ile kod editörü, Hanogt Engine, Hanogt Arcade, Hanogt News, Hanogt Media, gruplar, mesajlaşma, Güvenlik Merkezi, Hanogt AI ve Security Bot hizmetlerinin kullanımını düzenler. Hesap açarak veya hizmeti kullanarak şartların o tarihteki sürümünü kabul edersiniz.",
            "Hizmeti kullanmak için en az 13 yaşında olmanız gerekir. Reşit olmayan kullanıcılar için uygulanabilir hukuk uyarınca veli veya vasi onayı gerekebilir.",
            "İşletmecinin kesin ticari unvanı, adresi, MERSİS/VKN ve iletişim kanalı üretim öncesinde yayımlanır. Ücretli hizmet başlatılırsa mesafeli sözleşme ön bilgilendirmesi, fiyat, cayma hakkı ve dijital içerik istisnaları ayrıca sunulur.",
        ],
    },
    {
        id: "service",
        title: "Hizmetin niteliği",
        paragraphs: [
            "Hanogt Codev; kod düzenleme ve (yapılandırıldığında) izole ortamda kod çalıştırma, tarayıcıda çalışan 2D/3D oyun motoru, oyun yayınlama ve oynama, canlı teknoloji haberleri ve yapay zeka sıralamaları, mesajlaşma, sesli mesaj, eşler arası sesli arama, topluluk paylaşımları ve güvenlik araçları sunar.",
            "Hizmet mevcut hâliyle ve süregelen geliştirme sürecinde sunulur; kesintisiz veya hatasız çalışma garantisi verilmez. Planlı bakım, güvenlik müdahalesi veya üçüncü taraf altyapı sorunları nedeniyle özellikler geçici olarak kullanılamayabilir. Beta aşamasındaki özellikler değişebilir veya kaldırılabilir.",
        ],
    },
    {
        id: "account",
        title: "Hesap ve güvenlik",
        items: [
            "Doğru ve güncel bilgi sağlamak, güçlü ve benzersiz bir parola kullanmak ve oturum bilgilerinizi korumak sizin sorumluluğunuzdadır.",
            "Hesap kişiseldir ve devredilemez; şüpheli bir erişim fark ederseniz parolanızı değiştirip derhâl bildirmelisiniz.",
            "Otomasyonla hesap açma, başkasının kimliğine bürünme, hız sınırlarını veya güvenlik önlemlerini aşma girişimi yasaktır.",
            "Hanogt ekibi sizden asla parola veya doğrulama kodu istemez.",
        ],
    },
    {
        id: "content",
        title: "Kullanıcı içeriği ve fikrî haklar",
        paragraphs: [
            "Yüklediğiniz kod, oyun, görsel, yorum ve diğer içeriklerin hak sahibi olduğunuzu veya gerekli izinlere sahip bulunduğunuzu taahhüt edersiniz. İçeriğin mülkiyeti sizde kalır. Hizmetin çalışması, saklanması, yedeklenmesi, görüntülenmesi ve sizin talebinizle çalıştırılması için Hanogt'a sınırlı, münhasır olmayan, geri alınabilir ve hizmet süresiyle bağlı bir teknik izin verirsiniz.",
            "5846 sayılı Fikir ve Sanat Eserleri Kanunu kapsamındaki haklar ile üçüncü kişilerin marka, patent, ticari sır ve kişilik hakları ihlal edilemez. Usulüne uygun ihlal bildirimleri incelenir; gerektiğinde içerik erişimi geçici olarak sınırlandırılır.",
            "Hizmetin arayüzü, logoları, Hanogt Engine yazılımı, şablonlar ve belgeler Hanogt'a veya lisans verenlerine aittir. Şablonlardan ürettiğiniz oyunlar ve yazdığınız kodlar sizindir.",
        ],
    },
    {
        id: "game-engine",
        title: "Hanogt Engine projeleri",
        paragraphs: [
            "Hanogt Engine, Unity'ye benzeyen ancak ondan bağımsız, tarayıcıda çalışan bir oyun motorudur; Unity'nin veya herhangi bir ticari motorun resmî bir ürünü değildir ve tam uyumluluk garantisi verilmez. C# ve C++ scriptler Hanogt'un script sanal makinesinde yorumlanır; yerel bir derleyiciyle derlenmez ve tüm dil özellikleri desteklenmeyebilir.",
            "Giriş yapmadan oluşturulan projeler yalnızca tarayıcınızda saklanır; tarayıcı verilerinin silinmesiyle kaybolabilir. Önemli projelerinizi dışa aktarmanızı ve yedeklemenizi öneririz. Tarayıcı, ekran kartı ve WebGL desteği performansı ve görünümü etkileyebilir.",
        ],
    },
    {
        id: "arcade",
        title: "Hanogt Arcade yayın ve remiks kuralları",
        paragraphs: [
            "Bir oyunu Arcade'de yayımladığınızda, oyunun ve kaynak scriptlerinin herkese açık olarak oynanmasına ve görüntülenmesine izin verirsiniz. Ayrıca diğer kullanıcılara oyunu platform içinde kendi projelerine kopyalayıp değiştirme (remiks) izni vermiş olursunuz. Remiks yapan kullanıcı, remiksini yeniden yayımlarken orijinal yazara atıf yapmalı ve orijinal oyunun belirtilen lisans koşullarına uymalıdır.",
            "Yayından önce scriptler güvenlik denetiminden geçer; yüksek riskli kod içeren oyunlar yayımlanmaz. Yayını istediğiniz zaman kaldırabilirsiniz; ancak başkalarının daha önce oluşturduğu remikslerin veya dışa aktarılmış kopyaların uzaktan silinmesi teknik olarak mümkün olmayabilir.",
        ],
        items: [
            "Başkasına ait oyunu izinsiz kendi eserinizmiş gibi yayımlamak yasaktır.",
            "Yanıltıcı başlık/kapak, reklam amaçlı spam oyunlar ve oynanma/beğeni sayılarını yapay olarak artırma girişimleri yasaktır.",
            "Oyun içinde kişisel veri toplamak, kullanıcıları dolandırmak veya zararlı içerik sunmak yasaktır.",
            "Beğeni ve oynanma sıralaması kalite veya güvenlik garantisi değildir.",
        ],
    },
    {
        id: "news",
        title: "Hanogt News, üçüncü taraf içerikler ve yorumlar",
        paragraphs: [
            "Hanogt News, yayıncıların herkese açık RSS/Atom akışlarından derlenen başlıkları, kısa özetleri ve orijinal habere bağlantıları gösterir. Haberlerin içeriği, doğruluğu ve hakları ilgili yayıncılara aittir; Hanogt haberleri düzenlemez, onaylamaz ve içeriklerinden sorumlu tutulamaz. Bir yayıncı içeriğinin gösterilmesini istemiyorsa Geri Bildirim'den bize ulaşabilir; akıştan çıkarılır.",
            "Yapay zeka sıralamalarındaki topluluk arenası puanları yalnızca Hanogt kullanıcılarının oylarından hesaplanır ve resmî bir benchmark değildir. Dış kaynaklı sıralamalar ilgili kaynağa atfedilerek gösterilir.",
        ],
        items: [
            "Yorumlar saygılı olmalı; hakaret, nefret söylemi, taciz, spam ve kişisel veri paylaşımı yasaktır ve otomatik olarak engellenebilir.",
            "Birden fazla hesap, bot veya koordineli davranışla oy manipülasyonu yapmak yasaktır; bu tür oylar geçersiz sayılabilir.",
            "Yorumlarınızdan siz sorumlusunuz; yorumlar herkese açıktır ve silene kadar yayında kalır.",
        ],
    },
    {
        id: "media-license",
        title: "Hanogt Media yayın ve indirme kuralları",
        paragraphs: [
            "Media'ya yayımlama, kaynak dosyalarını internetten görüntülenebilir ve indirilebilir hâle getirir. Bu tek başına açık kaynak lisansı seçildiği anlamına gelmez; yeniden kullanım koşullarını proje açıklamasında veya lisans dosyasında belirtmelisiniz. Lisans belirtilmemiş içerik yalnızca platform işlevi kapsamında görüntülenip kişisel inceleme için indirilebilir.",
            "Yayımlamadan önce kodunuzda kişisel veri, sır, erişim anahtarı veya izinsiz üçüncü kişi içeriği bulunmadığını kontrol etmelisiniz (Güvenlik Merkezi'ndeki Kod Danışmanı yardımcı olur). İndiren kullanıcı ise kodu, bağımlılıkları ve lisansı kendi ortamında doğrulamadan çalıştırmamalıdır.",
        ],
    },
    {
        id: "groups",
        title: "Grup ve ortak çalışma kuralları",
        paragraphs: [
            "Grup üyeleri, grup içinde gördükleri profil, kod, mesaj ve sesli mesajları grup amacı dışında kullanamaz veya izinsiz yayımlayamaz. Ortak editör anlık eşitleme sunar ancak tam bir sürüm kontrol sistemi değildir; eş zamanlı yazmalarda son kayıt baskın olabilir. Kritik projeler için sürüm kontrolü ve yedek kullanmalısınız.",
        ],
    },
    {
        id: "security-program",
        title: "Security katkı programı",
        paragraphs: [
            "Program varsayılan olarak kapalıdır ve temel hizmetin şartı değildir. Yalnızca ayrıca seçtiğiniz yayımlanmış projeler insan denetimli güvenlik değerlendirmesine aday gösterilir. İzninizi istediğiniz zaman geri çekebilirsiniz; ayrıntılar Gizlilik Politikası'ndadır.",
        ],
    },
    {
        id: "acceptable-use",
        title: "Kabul edilebilir kullanım",
        items: [
            "Zararlı yazılım yaymak, kimlik bilgisi toplamak, ters kabuk açmak, kaynak tüketmek, kripto para kazmak veya üçüncü sistemlere saldırmak amacıyla hizmet kullanılamaz.",
            "Taciz, nefret, tehdit, dolandırıcılık, müstehcen veya hukuka aykırı içerik gönderilemez.",
            "Başkalarının gizliliği ihlal edilemez; başkalarına ait kişisel veriler izinsiz paylaşılamaz. Sesli arama kaydı yapılacaksa tarafların bilgisi ve rızası alınmalıdır; Hanogt aramaları kaydetmez.",
            "Hizmetin kaynak kodunu tersine mühendislikle kötüye kullanmak, otomatik araçlarla aşırı yük oluşturmak veya içerikleri toplu olarak kazımak (scraping) yasaktır.",
            "Güvenlik araştırması yalnızca sorumlu bildirim ilkelerine uygun ve başkalarının verisine erişmeden yapılmalıdır.",
        ],
    },
    {
        id: "moderation",
        title: "İhlal, inceleme ve itiraz",
        paragraphs: [
            "Riskli bir istek anlık olarak engellenebilir ve asgari bir denetim kaydı oluşturulabilir. Hesap kısıtlaması; ihlalin niteliği, tekrar durumu, zararın ağırlığı ve açıklamanız değerlendirilerek orantılı biçimde uygulanır. Acil risk dışında size sebep ve itiraz kanalı bildirilir.",
            "Geri Bildirim sayfasından güvenlik itirazı gönderebilir ve insan incelemesi talep edebilirsiniz. Açık hata hâlinde kayıt düzeltilir ve kısıtlama kaldırılır.",
        ],
    },
    {
        id: "platform-law",
        title: "İçerik bildirimi ve platform yükümlülükleri",
        paragraphs: [
            "Hanogt Codev'in 5651 sayılı Kanun bakımından hangi hizmet sağlayıcı sıfatına girdiği faaliyet modeli kesinleştiğinde ayrıca değerlendirilir. Uygulanabildiği ölçüde yetkili makam kararları ve hukuka uygun içerik çıkarma bildirimleri kayıt altına alınır, kapsamıyla sınırlı uygulanır ve kanunen yasak değilse içerik sahibine bilgi verilir.",
            "Telif veya kişilik hakkı bildiriminde ilgili bağlantı, hak sahipliği dayanağı, iletişim bilgisi ve gerekçe istenir. Kötüye kullanılan bildirimler kabul edilmez; karşı açıklama ve insan incelemesi yolu korunur.",
        ],
    },
    {
        id: "third-parties",
        title: "Üçüncü taraf hizmetleri",
        paragraphs: [
            "Google/Firebase, Google OAuth, yapay zeka sağlayıcısı, TURN/STUN, kod çalıştırıcı, haber yayıncıları, OpenRouter gibi veri kaynakları ve Have I Been Pwned kendi koşul ve kullanılabilirliklerine tabidir. Hanogt bu hizmetlere olan bağımlılıklarını açıklar ve üçüncü taraf altyapısını kendisine aitmiş gibi sunmaz. Yapay zekaya veya çalıştırıcıya gönderdiğiniz kodda gizli anahtar bulunmamalıdır.",
        ],
    },
    {
        id: "liability",
        title: "Sorumluluk ve tüketici hakları",
        paragraphs: [
            "Hizmet \"olduğu gibi\" sunulsa da 6098 sayılı Türk Borçlar Kanunu ve diğer emredici hükümler uyarınca tüketici hukuku, ayıplı hizmet, kişisel veri ve kast/ağır kusurdan doğan sorumluluk bu şartlarla kaldırılamaz. Kod çıktılarını üretim ortamında kullanmadan önce test etmek ve yedek almak sizin sorumluluğunuzdadır.",
            "Güvenlik Merkezi araçları ve Security Bot bilgilendirme amaçlıdır; bir kodun, parolanın veya bağlantının kesin olarak güvenli olduğunu garanti etmez.",
            "Hanogt AI'ın yanıtları yapay zeka tarafından üretilir ve hatalı, eksik veya güncel olmayan bilgi içerebilir; profesyonel danışmanlık yerine geçmez. Ürettiği kodu çalıştırmadan veya yayımlamadan önce kontrol etmek sizin sorumluluğunuzdadır. Hanogt AI'ı zararlı yazılım, kimlik avı, başkalarının sistemlerine izinsiz erişim veya kişilere zarar verecek içerik üretmek için kullanamazsınız.",
            "Ücretli sürüm sunulursa 6502 sayılı Tüketicinin Korunması Hakkında Kanun ve Mesafeli Sözleşmeler Yönetmeliği kapsamındaki bilgiler siparişten önce gösterilir. Ticari elektronik ileti gönderilirse 6563 sayılı Kanun kapsamındaki onay ve ret süreçleri işletilir.",
        ],
    },
    {
        id: "termination",
        title: "Fesih, veri alma ve silme",
        paragraphs: [
            "Hesabınızı dilediğiniz zaman Hesap Ayarları'ndan kapatabilir, önce verilerinizin bir kopyasını indirebilirsiniz. Silme; yasal saklama zorunlulukları ve diğer kullanıcıların meşru iletişim kayıtları dikkate alınarak uygulanır. Şartların ağır veya tekrarlanan ihlali hâlinde hesap, orantılılık ilkesi ve itiraz hakkı gözetilerek askıya alınabilir veya kapatılabilir.",
        ],
    },
    {
        id: "changes",
        title: "Değişiklikler, sürümleme ve bölünebilirlik",
        paragraphs: [
            "Şartlarda aleyhinize esaslı bir değişiklik yapılırsa yürürlükten önce anlaşılır bir bildirim sunulur; gerekiyorsa yeniden kabul veya ayrı rıza alınır. Değişikliği kabul etmezseniz verilerinizi dışa aktarıp hesabınızı kapatabilirsiniz.",
            "Bir hükmün geçersiz olması diğer hükümleri etkilemez. Türkçe metin ile çeviriler arasında çelişki olursa, emredici hükümler ve tüketici aleyhine yorum yasağı saklı kalmak kaydıyla Türkçe metin esas alınır.",
        ],
    },
    {
        id: "law",
        title: "Uygulanacak hukuk ve uyuşmazlık",
        paragraphs: [
            "Türkiye Cumhuriyeti hukuku uygulanır. Tüketici sıfatı bulunan kullanıcıların tüketici hakem heyeti, tüketici mahkemesi ve yerleşim yeri yetkileri saklıdır. Diğer uyuşmazlıklarda, emredici yetki kuralları saklı kalmak kaydıyla işletmecinin merkezinin bulunduğu yer mahkemeleri yetkilidir.",
        ],
    },
];

export default function TermsOfUsePage() {
    return (
        <LegalPage
            current="/terms-of-use"
            eyebrow="Hizmet koşulları"
            title="Kullanım Şartları"
            summary="Hesap, içerik ve fikrî haklar, oyun motoru ve Arcade, haberler ve yorumlar, güvenlik, yaptırım ve uyuşmazlık kurallarını açık ve dengeli biçimde belirler."
            sections={sections}
            highlights={highlights}
            notice="Bu metin genel bir çerçevedir; işletme kimliği, satış modeli ve hedef kullanıcı kitlesi netleştiğinde Türkiye'de yetkili bir hukukçu tarafından üretim öncesinde doğrulanmalıdır."
        />
    );
}
