# Hanogt Codev / nodal-perigee bağlamı

Bu belge, projenin mevcut teknik durumunu NotebookLM'e kaynak olarak aktarabilmek için hazırlanmıştır. Gizli anahtar, kullanıcı verisi veya kimlik doğrulama bilgisi içermez.

## Ürün hedefi

Hanogt Codev; web tabanlı kod düzenleme/çalıştırma, arkadaşlar ve gruplar, bire bir sesli iletişim, kod paylaşım topluluğu (Hanogt Media) ve tarayıcı tabanlı 2D/3D oyun projesi düzenleme yeteneklerini tek üründe birleştiren Next.js/Firebase uygulamasıdır. Arayüz geliştirmelerinde mevcut koyu tema, tipografi ve marka dili korunmalıdır.

## Öncelikli güvenlik kararları

- Düz metin parola saklama kaldırıldı. Yeni parolalar scrypt ile tuzlanıp hashlenir; eski kayıtlar başarılı oturum açmada güvenli biçime taşınır.
- Yetkilendirme yalnız istemci kontrollerine bırakılmaz. Kod çalıştırma, yapay zekâ, arkadaş, grup, medya, çağrı ve oyun projesi işlemleri sunucu oturumu, aynı-origin kontrolü, giriş doğrulama, hız sınırı ve kaynak sahipliği denetimi uygular.
- Kod çalıştırma güvenliği regex tabanlı bir tarayıcı iddiası değildir. `/api/execute`, izole çalıştırıcıya yönlendirme için `CODE_RUNNER_URL` ve sunucu tarafı politika katmanı kullanır. Üçüncü taraf çalıştırıcılar üretim güvenlik sınırı olarak tanımlanmaz.
- Firestore ve Storage kuralları repoda sürümlenir. Oyun projeleri dahil hassas koleksiyonlarda doğrudan istemci yazımı engellenir; yazma işlemleri yetkili sunucu uçlarından geçer.
- `/api/ai` kimlik doğrulamalı ve hız sınırlıdır. Sunucu sırları istemci paketine gönderilmez.
- Güvenlik botuna kod katkısı açık rıza/opt-in ile alınır; kod otomatik ve denetimsiz biçimde modeli “kendi kendine eğitmez”. Katkı inceleme adayı olarak kaydedilir ve silme/geri çekme süreçlerine tabidir.
- Sahte kurulum dosyası ile yinelenen APK artefaktları kaldırıldı. Dağıtım düğmeleri yalnız doğrulanmış sürüm artefaktlarına bağlanmalıdır.

## Kimlik, veri ve hesap yaşam döngüsü

- NextAuth oturumları aktif kullanıcı ve parola sürümü kontrolleriyle desteklenir.
- Firebase istemci erişimi için kısa ömürlü özel token köprüsü kullanılır.
- Hesap verisi dışa aktarma ve silme uçları arkadaşlıklar, mesajlar, çağrı verileri, medya ve oyun projeleri gibi ilişkili kayıtları kapsar.
- Gerçek üretim ortamında Firebase Admin kimlik bilgileri, runner adresi, TURN bilgileri ve diğer sırlar yalnız sunucu ortam değişkenlerinde tutulmalıdır.

## Arkadaşlar, gruplar ve WebRTC

- Arkadaş listesi çevrimiçi durumu, konuşma erişimi, çağrı ve sesli mesaj eylemlerini Discord benzeri fakat mevcut temayla uyumlu bir düzende sunar.
- Çağrılarda yalnız katılımcılar çağrı/sinyal verisini okuyabilir ve değiştirebilir.
- STUN/TURN yapılandırması desteklenir; güvenilir NAT geçişi için üretimde `TURN_SERVER_URL` ve `TURN_SHARED_SECRET` zorunludur.
- Çağrı bittiğinde sinyalleşme/ICE belgeleri ve geçici çağrı kayıtları temizlenir. Yarım kalan kayıtlar için sunucu temizleme ucu vardır.
- Sesli mesajlar boyut ve süre sınırlarına tabidir; sahiplik/katılımcı kontrolüyle saklanır ve silinebilir.
- Mevcut sürüm bire bir WebRTC çağrısını kapsar. Gerçek grup konferansı/SFU altyapısı henüz tamamlanmış sayılmamalıdır.

## Hanogt Media

- Kullanıcılar kod projelerini yayımlayabilir, dil ve üretici bilgisini görebilir, indirebilir, beğenebilir, yorumlayabilir ve bildirebilir.
- En çok beğenilen projeler için sıralama görünümü vardır.
- Görünen ad paylaşımı kullanıcının tercihine bağlıdır.
- İndirme ve etkileşim işlemleri yetkili API uçlarından geçer; sayaçlar istemci tarafından keyfi yazılamaz.

## Kod editörü

- Monaco tabanlı editör çoklu dosya/sekmeyi ve birden fazla desteklenen dilin tek çalıştırma eyleminde paralel yürütülmesini destekler.
- Her dilin çıktısı ayrı gösterilir; indirme sırasında oluşturulan geçici Blob URL'leri serbest bırakılır.
- Oyun projesi scriptleri C# veya C++ olarak oluşturulur. Editör güvenli `returnTo` parametresiyle oyun motoruna geri döner.
- C#/C++ derleme/çalıştırma izole harici toolchain gerektirir; tarayıcı içinde yerel ikili derleme yaptığı iddia edilmez.

## Tarayıcı tabanlı oyun motoru MVP'si

- Gösterge paneli Kod Projeleri ve Oyun Projeleri olarak ayrılmıştır.
- Oyun projesi oluştururken 2D/3D türü seçilir ve şimdilik yalnız C# ile C++ script desteği açıkça bildirilir.
- Nesne/bileşen tabanlı sahne modeli; Transform, Sprite/Mesh, Camera, Light, Collider, Rigidbody ve Script bileşenlerini destekler.
- Hierarchy, Inspector, Assets/Console panelleri; seçme, taşıma, döndürme, ölçekleme, grid/zoom ve geri alma geçmişi vardır.
- Play/pause/step/stop akışı gerçek `EngineLoop` ve basit fizik/dünya sınırı simülasyonuna bağlıdır.
- Sahne verisi şema doğrulaması, boyut sınırı, sahiplik kontrolü ve revision tabanlı çakışma korumasıyla Firestore'a kaydedilir.
- Yeni scriptte C# veya C++ seçilir, kod editörü açılır ve kullanıcı oyun motoruna dönebilir.
- 3D görünüm WebGL/Unity eşdeğeri değil, Canvas üzerinde izometrik bir MVP'dir. Native build/export, tam asset pipeline, ECS, gerçek zamanlı C#/C++ oyun içi VM/WASM yürütümü ve çok kullanıcılı canlı sahne düzenleme sonraki fazlardır.

## Arayüz, performans ve yerelleştirme

- Mevcut tema ve fontlar korunarak kartlar, paneller, boş durumlar, geri bildirim/SSS ve yasal sayfalar modernleştirildi.
- Yerel görseller Next Image üzerinden; kullanıcı kaynaklı dış görseller güvenli lazy-loading ile gösterilir. Geniş ve kontrolsüz uzak görsel allowlist'i açılmaz.
- Kullanılan 449 çeviri anahtarı 20 dil dosyasında tamamlandı ve otomatik denetim scripti eklendi.
- Büyük i18n gövdesi dil bazlı JSON dosyalarına ayrıldı.

## Hukuki metin durumu

- Gizlilik Politikası, KVKK Aydınlatma Metni ve Kullanım Şartları; veri kategorileri, amaçlar, hukuki sebepler, aktarım, saklama, ilgili kişi hakları, çocuklar, güvenlik sınırları, içerik ve oyun projesi hükümleriyle genişletildi.
- Metinlerde gerçeğe aykırı “tam güvenlik” veya yapılmayan düzenli denetim iddiası kullanılmaz.
- Bunlar teknik taslaktır. Yayından önce veri sorumlusunun gerçek ticari unvanı, adresi, MERSİS/VKN, KEP/e-posta, saklama süreleri, alt işleyenler ve yurtdışı aktarım mekanizması doldurulmalı; güncel resmi mevzuat ve bir Türkiye hukukçusu tarafından onaylanmalıdır.

## Doğrulamalar

- `npm run lint`: geçti, uyarı yok.
- `npm run i18n:check`: 20 dilde kullanılan 449 anahtarın tamamı geçti.
- `npx tsc --noEmit`: geçti.
- `npm run build`: Next.js production build geçti; 32 sayfa/API rotası üretildi.
- Dağıtım öncesinde ayrıca Firebase rules emulator testleri, gerçek mikrofon/WebRTC/TURN akışları, Storage silme akışı ve izole runner entegrasyonu canlı ortamda test edilmelidir.

## Operatör kontrol listesi

1. Firestore/Storage kurallarını hedef Firebase projesine deploy et.
2. `CODE_RUNNER_URL`, runner kimliği, TURN ve Firebase Admin sırlarını sunucu secret store'una ekle.
3. Güvenlik botu katkı saklama/silme politikasını ve moderasyon iş akışını işlet.
4. WebRTC çağrı başlatma, reddetme, bağlantı kopması, bitirme ve eski kayıt temizliğini iki gerçek ağda test et.
5. Yasal metinlerdeki kuruluş alanlarını doldur ve hukuk incelemesini tamamla.
6. Oyun motorunu “MVP” olarak konumlandır; Unity ile özellik eşitliği iddiası kullanma.

## Değişiklik kaydı

Önemli tamamlamalar kökteki `CHANGELOG.md` ve uygulama içi Güncellemeler/İyileştirmeler penceresine işlendi. Bu belge teknik bağlam aktarımı içindir; değişikliklerin kaynak doğrusu kod, test çıktıları ve sürümlenmiş changelog'dur.
