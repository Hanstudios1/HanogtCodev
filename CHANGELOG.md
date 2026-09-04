# Değişiklik Günlüğü

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
