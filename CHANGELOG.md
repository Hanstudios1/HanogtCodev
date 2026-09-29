# Değişiklik Günlüğü

## 0.1.0 — 2026-09-28

Şimdiye kadarki en büyük güncelleme: canlı teknoloji haberleri, topluluk Arcade'i, baştan yazılan oyun motoru, yenilenen site arayüzü ve 30 dil.

### Hanogt News

- 23 kaynaktan RSS/Atom toplayan sunucu tarafı akış: önbellek, zaman aşımı, yinelenen haber temizliği ve kaynak durumu göstergesi.
- Animasyonlu canlı akış: yeni haberler 75 saniyede bir düşer, son dakika bandı, kategori/dil filtreleri, arama (`/` kısayolu), gündem konuları ve "sonra oku" listesi.
- Haber yorumları: giriş zorunlu, hız sınırlı; küfür, spam, bağlantı yığını ve kişisel veri (e-posta, telefon, T.C. kimlik no.) filtresi.
- Yapay Zeka Arenası: asistanlar arasında ikili oylama; sıralama yalnızca gerçek topluluk oylarından Elo ile hesaplanır, dış sıralamalar kaynağıyla bağlantılanır.
- Akış isteklerini bozan ASCII dışı User-Agent başlığı düzeltildi.

### Hanogt Engine v2 ve Arcade

- Şema v2 (sahneler, prefablar, dokular, script varlıkları, proje ayarları); v1 projeler otomatik taşınır.
- HanogtScript sanal makinesi: C# ve C++ alt kümelerini tarayıcıda güvenli biçimde yorumlar (sınıflar, kalıtım, lambda, LINQ, coroutine, `std::vector`, komut bütçesiyle sonsuz döngü koruması, satır numaralı hatalar).
- Unity benzeri yaşam döngüsü ve API'ler (Awake/Start/Update/FixedUpdate, coroutine, Instantiate/Destroy, Input, Physics, PlayerPrefs, SceneManager), OBB/SAT fiziği, raycast ve tetikleyiciler.
- three.js tabanlı WebGL render: gölgeler, ışıklar, sis, parçacıklar, dönüşüm gizmoları; dokunmatik kontrollü oyun oynatıcısı.
- Editör baştan yazıldı: hiyerarşi, Inspector, Proje/Asset paneli, Konsol, Monaco script editörü (canlı derleme hataları, API tamamlama), geri al/yinele, otomatik kayıt ve tek dosya HTML dışa aktarma.
- Hazır şablonlar: 2D Platform, 3D Roll-a-Ball, Uzay Nişancısı, Tuğla Kırma.
- Hanogt Arcade: oyun yayınlama (derleme ve güvenlik taraması), oynatma, tam ekran, beğeni, oynanma sayacı ve remiks; 17 bölümlük motor belgeleri.

### Site arayüzü

- Cam efektli sabit başlık, aktif sayfa göstergesi, kaydırma ilerleme çubuğu, mobil menü ve ortak alt bilgi.
- Ana sayfa baştan tasarlandı: yazılan C# kodu, oynanabilir mini oyun, spot ışıklı kartlar, canlı haber önizlemesi.
- Panel yenilendi: karşılama alanı, proje sayıları, Keşfet kısayolları, proje arama/sıralama; tüm metinler dile göre gösteriliyor ve sağdan sola dillerde aynalanıyor.
- Kullanım kılavuzu etkileşimli Minecraft kitabına dönüştü: 9 bölüm, 25 sayfa, 3B sayfa çevirme, hotbar ile bölüm geçişi (1-9), başarım bildirimi; Hanogt News'in çalışma biçimi ayrıntılı anlatılıyor.

### Hanogt Security

- Güvenlik Merkezi (`/security`): tarayıcıda çalışan Kod Danışmanı (65+ kural, puan ve düzeltme önerileri), Parola Laboratuvarı (kırılma süresi tahmini, k-anonimlikle sızıntı kontrolü, güçlü parola üretici), Bağlantı Kontrolü (punycode/Kiril taklidi, sahte alan adları, kısaltıcılar) ve güvenlik kontrol listesi.
- Security Bot v6: konu tanıma, yapıştırılan bağlantı ve kodun anında analizi, gizli anahtar uyarısı, öneri çipleri.
- Sunucu korumasına disk silme, jeton hırsızı, yetki yükseltme, keylogger ve DoS aracı imzaları eklendi.

### Diller

- 10 yeni arayüz dili: Arapça (sağdan sola), Portekizce, İtalyanca, Ukraynaca, Endonezce, Vietnamca, Çekçe, Rumence, Macarca ve Özbekçe (toplam 30).
- Aranabilir, bayraklı dil seçici; `<html lang>` ve `dir` seçilen dile göre ayarlanıyor.
- Oyun motoru, motor belgeleri, Arcade, Hanogt Media, Gruplar, Geri Bildirim/SSS, panel, kod editörü, sesli arama ve gizlilik bildirimi Türkçe ve İngilizce kullanılabilir; önceden yalnızca Türkçe olan ~400 arayüz metni çevrildi.
- Hesap Ayarları'ndaki dil seçici 30 dilin tamamını gösteriyor; yasal metinlerin Türkçe sürümünün bağlayıcı olduğu diğer dillerde belirtiliyor.
- Ana sayfa, menüler, alt bilgi, dil seçici ve Hakkında sayfası 30 dilin tamamında; Almanca, Fransızca, Felemenkçe, Flamanca, Lehçe, İsveççe, Norveççe, Fince, Yunanca ve Hintçede İngilizce kalmış ~3.500 metin (ayarlar, arkadaşlar, mesajlar, editör, sürüm notları) çevrildi.
- Profil rozetlerinin adları 30 dilde gösteriliyor; editörün varsayılan proje adı her dilin kelime sırasına uyuyor; giriş ve kayıt formları sağdan sola dillerde doğru hizalanıyor.

### Yasal metinler 3.0

- Gizlilik Politikası, KVKK Aydınlatma Metni ve Kullanım Şartları; Hanogt News, yapay zeka arenası, Arcade ve Güvenlik Merkezi dahil ayrıntılandırıldı.
- Veri-amaç-hukuki sebep matrisi, alıcılar, çerez/depolama ve saklama süresi tabloları; sürüm geçmişi ve değişikliklerin kullanıcıya gösterilmesi.
- Hesap dışa aktarma ve silme; Arcade beğenilerini, haber yorumlarını ve arena oy kayıtlarını da kapsıyor.

### Düzeltmeler

- Giriş kilidine yol açan oturum köprüsü sorunu, Google girişinde büyük harfli e-posta sorunu ve Hanogt Media yayımlama penceresi düzeltildi.
- Giriş sırasında Firebase'e ulaşılamadığında oluşan Türkçe hata mesajı NextAuth tarafından kodlanmadan yönlendirme başlığına yazılıyor ve istek boş bir HTTP 500 ile çöküyordu. Giriş artık ASCII hata kodları kullanıyor (`ServiceUnavailable`, `RateLimited:N`, `AccountSuspended`), `/api/auth/error` doğrudan giriş ekranına kodlanmış olarak yönleniyor ve kimlik doğrulama rotası hiçbir durumda boş 500 döndürmüyor. Firebase sunucu kimliği `FIREBASE_SERVICE_ACCOUNT_JSON` / `_BASE64` yanında `FIREBASE_CLIENT_EMAIL` + `FIREBASE_PRIVATE_KEY` + `FIREBASE_PROJECT_ID` ile de okunuyor; eksikse giriş ekranı hangi ayarın gerektiğini söylüyor.
- Google dönüşünde (`OAuthCallback`) Google'a yapılan istekler için bekleme süresi 3,5 saniyeden 15 saniyeye çıkarıldı (soğuk başlatmada zaman aşımına düşüyordu), Google anahtarlarındaki boşluklar temizleniyor ve girişin sunucudaki gerçek hata nedeni yalnızca o tarayıcıya kısa ömürlü bir çerezle giriş ekranına taşınıyor.
- Google girişi, ziyaretçi Google'ın geri döneceği alan adından farklı bir adresteyse (www / www'suz / vercel.app) girişi önce o alan adına taşıyor; böylece dönüşte durum çerezleri kaybolmuyor. Giriş hatalarının altında teknik hata kodu gösteriliyor ve `/api/health/auth` giriş için gereken ayarları gizli bilgi göstermeden denetliyor.
- Giriş ve kayıt artık NextAuth'un ön sağlayıcı kontrolüne bağlı değil: `/api/auth/providers` bir an bile yanıt vermediğinde kullanıcı NextAuth'un "Error" sayfasına düşüyordu. İstekler doğrudan CSRF belirteciyle gönderiliyor, geçici ağ hataları bir kez yeniden deneniyor ve her hata giriş formunda kendi dilinde gösteriliyor.
- Monaco editörü CSP'ye takılmadan kendi alan adından yükleniyor; oturum yenilemesinde editör sekmelerinin sıfırlanması giderildi.
- Panelde tüm dillerde görünen sabit Türkçe metinler kaldırıldı.
- Hesap Ayarları, Arkadaşlar ve Mesajlar sayfası yenilendiğinde oturum yüklenirken kullanıcıyı giriş sayfasına atma hatası giderildi.
- Çevrimiçi durum tüm sayfalarda (editör, sohbet, oyun motoru dahil) korunuyor; sohbetten çıkınca kullanıcı çevrimdışı görünmüyor.
- Her sayfa kendi sekme başlığını gösteriyor; giriş gerektiren sayfalar arama motorlarında dizinlenmiyor.

### Bağımlılıklar

- Next.js 16.3, React 19.3, Firebase 12.19, Tailwind CSS 4.3 ve Monaco 0.57'ye güncellendi; `npm audit` bulguları 36'dan 5'e indi (kalanlar yalnızca masaüstü/mobil geliştirme araçlarında).

## 0.0.5 — 2026-09-04

### Hanogt Engine ve proje akışı

- Gösterge paneli Kod Projeleri ve Oyun Projeleri olarak ikiye ayrıldı; yeni proje akışı 2D/3D seçimini ve oyun scriptlerinin yalnızca C# ile C++ olduğunu açıkça bildiriyor.
- Bileşen tabanlı sahne nesneleri, hiyerarşi, Inspector, Transform düzenleme, 2D ve üç eksenli izometrik 3D Canvas görünümü, taşıma/döndürme/ölçekleme araçları, odaklama, ızgara ve yakınlaştırma eklendi.
- Düzenle/oynat/duraklat/tek-adım/durdur yaşam döngüsü, sabit zaman adımlı yerçekimi, rigid-body, AABB çarpışma, dünya sınırları ve oynatma değişikliklerini atma davranışı eklendi.
- Sahne geçmişi ve undo/redo, güvenli JSON serileştirme, döngüsel hiyerarşi reddi, 500 nesne ve 512 KB sahne limitleriyle yeni oyun motoru çekirdeği oluşturuldu.
- Oyun projeleri ve C#/C++ scriptleri için sahiplik, aynı kaynak, etkin oturum, dağıtık oran sınırı, şema doğrulama ve iyimser eşzamanlılık kontrollü sunucu API'leri eklendi; istemciden doğrudan Firestore erişimi kapatıldı.
- Yeni script akışı C# veya C++ seçildikten sonra Monaco editörünü açıyor; kaydetme sonrası aynı oyun motoru projesine dönülebiliyor. Kaynaklar tarayıcı içinde çalıştırılmaz ve yerel/üretim derlemesi için yapılandırılmış harici araç zinciri gerekir.
- Oyun motoru, sahne ve script verileri hesap dışa aktarma/silme kapsamına; işleme ve saklama açıklamaları KVKK metinlerine eklendi.

### Doğruluk ve güvenlik iyileştirmeleri

- Oyun proje revizyonları kayıtta korunarak sessiz üzerine yazma ve otomatik kayıt döngüsü engellendi; sunucu çakışmaları 409 yanıtıyla bildiriliyor.
- Scriptler sahne nesnesine bağlanmasa da Assets alanında görünür ve yeniden açılabilir hâle getirildi.
- Gösterge panelindeki dil simgesi geri dönüşünde HTML enjeksiyonu kaldırıldı; kullanıcı kaynaklı dil/proje parametreleri URL için kodlanıyor.
- Güvenlik tanıtım metinleri 20 dilde gerçek teknik sınırlarla uyumlu hâle getirildi; Security Bot'un antivirüs veya kusursuz koruma garantisi olmadığı açıklandı.

## 0.0.4 — 2026-09-03

### Güvenlik

- Düz metin parola yazma/karşılaştırma kaldırıldı; scrypt, benzersiz salt ve sabit zamanlı doğrulama eklendi. Eski hesaplar başarılı girişte otomatik olarak taşınır.
- NextAuth oturumları Firebase custom token ile Firestore kimliğine bağlandı. Firestore ve Storage kuralları en az yetki ilkesiyle eklendi.
- Kod çalıştırma ve AI endpointleri oturum, aynı kaynak, girdi/cevap boyutu, zaman aşımı ve dağıtık oran sınırı ile korundu.
- Hanogt Security Bot v5 sunucu tarafına taşındı; istemci tarafı kalıcı yasaklama kaldırıldı, konumlu bulgular, birleşik risk sinyalleri ve botun sınırlarını açıklayan rehber eklendi.
- Herkese açık Piston/Wandbox geri dönüşleri kaldırıldı. Üretimde yapılandırılmış izole runner zorunlu hale getirildi.
- CSP ve temel tarayıcı güvenlik başlıkları eklendi. Sahte SMS doğrulaması kaldırıldı.

### Arkadaşlar ve iletişim

- Arkadaş yönetimi karşılıklı ve sunucu tarafı yetkili işlemlere dönüştürüldü.
- Discord benzeri arkadaş kartları, çevrim içi avatar şeridi ve taze presence göstergeleri eklendi.
- WebRTC sesli arama; gelen/giden arama ekranı, susturma, süre, ICE/TURN yapılandırması ve kapanışta sinyal temizliğiyle eklendi. Ses kaydı tutulmaz.
- Sesli mesajlar base64/Firestore yerine yetkili Firebase Storage nesneleri olarak saklanır; 60 saniye ve 3 MB sınırları ile yerel nesne URL'si temizliği eklendi.

### Ürün ve hukuk

- Geri bildirim mutasyonları sunucuya taşındı; arama, sekmeler, sahiplik denetimli düzenleme/silme ve genişletilmiş SSS arayüzü eklendi.
- Gizlilik politikası, KVKK aydınlatma metni ve kullanım koşulları gerçek veri işleme akışlarını ve teknik sınırları anlatacak şekilde yeniden yazıldı. Ticari yayın öncesi kurum bilgileri ve hukukçu onayı için açık TODO bırakıldı.
- Projeler gerçek dosya alt koleksiyonlarıyla kaydediliyor; hesap dışa aktarma ve kapsamı genişletilmiş hesap silme sunucu tarafında çalışıyor.
- Sahte Windows kurulum dosyası ve yinelenen APK kaldırıldı; rakip marka karşılaştırması nötrleştirildi ve MIT lisansı eklendi.
- Eksik yerelleştirme anahtarları için İngilizce/Türkçe geri dönüşü eklendi; ham anahtarların arayüzde görünmesi engellendi.

### Hanogt Media ve gruplar

- Proje anlık görüntülerini lisans, etiket, dil ve isteğe bağlı profil bilgisiyle yayımlayan Hanogt Media eklendi. Beğeniler, yorumlar, raporlar ve indirmeler ayrı, ölçeklenebilir kayıtlarla çalışır.
- Popüler/yeni proje keşfi, kod önizleme, tek dosya veya ZIP indirme, sahip silme ve açık lisans bildirimi eklendi.
- Security Bot geliştirme katkısı iki aşamalı ve geri alınabilir rıza olarak tasarlandı; bekleyen katkılar rıza geri alındığında silinir, otomatik/kontrolsüz model eğitimi yapılmaz.
- Arkadaş davetiyle açılan, sahip/yönetici/üye rollü grup çalışma alanları eklendi. Ortak dosya düzenleme, otomatik kaydetme, mesaj, sesli mesaj, üye yönetimi ve bire bir WebRTC araması desteklenir.

### Editör, performans ve erişilebilirlik

- Tek Çalıştır düğmesi, farklı dillerde en fazla sekiz dosyayı bağımsız ve paralel runner işleri olarak çalıştırıp birleşik sonucu gösterir.
- Yerel taslak yazımları geciktirildi ve boyutlandırıldı; bulut dosyaları paralel okunur, kayıt tamamlanmadan başarı bildirimi gösterilmez.
- Büyük tek parça çeviri kaynağı 20 gecikmeli JSON paketine ayrıldı; kullanılan anahtarları doğrulayan `npm run i18n:check` eklendi.
- Hukuk sayfalarına okuma ilerlemesi, görünüm animasyonları, yazdırma düzeni, klavye odak stilleri ve azaltılmış hareket desteği eklendi.
