# Hanogt Codev / nodal-perigee bağlamı

Bu belge, projenin mevcut teknik durumunu NotebookLM'e kaynak olarak aktarabilmek için hazırlanmıştır. Gizli anahtar, kullanıcı verisi veya kimlik doğrulama bilgisi içermez.

## Ürün hedefi

Hanogt Codev; web tabanlı kod düzenleme/çalıştırma, arkadaşlar ve gruplar, bire bir sesli iletişim, kod paylaşım topluluğu (Hanogt Media) ve tarayıcı tabanlı 2D/3D oyun projesi düzenleme yeteneklerini tek üründe birleştiren Next.js/Firebase uygulamasıdır. Arayüz geliştirmelerinde mevcut koyu tema, tipografi ve marka dili korunmalıdır.

## Öncelikli güvenlik kararları

- Düz metin parola saklama kaldırıldı. Yeni parolalar scrypt ile tuzlanıp hashlenir; eski kayıtlar başarılı oturum açmada güvenli biçime taşınır.
- Yetkilendirme yalnız istemci kontrollerine bırakılmaz. Kod çalıştırma, yapay zekâ, arkadaş, grup, medya, çağrı ve oyun projesi işlemleri sunucu oturumu, aynı-origin kontrolü, giriş doğrulama, hız sınırı ve kaynak sahipliği denetimi uygular.
- Kod çalıştırma güvenliği regex tabanlı bir tarayıcı iddiası değildir. JavaScript, TypeScript, Python, SQL ve Lua ziyaretçinin tarayıcısında WebAssembly ile çalışır. Derlenen diller `/api/execute` üzerinden sunucu tarafı politika katmanından geçip `CODE_RUNNER_URL` (tanımlıysa) ya da herkese açık Wandbox / Kotlin Playground derleyicisinde yürütülür; kod hiçbir zaman Hanogt sunucularında çalıştırılmaz.
- Firestore ve Storage kuralları repoda sürümlenir. Oyun projeleri dahil hassas koleksiyonlarda doğrudan istemci yazımı engellenir; yazma işlemleri yetkili sunucu uçlarından geçer. `users` ve `public_profiles` yalnızca sunucudan yazılır, `public_profiles` listelenemez (yalnızca adresle tek tek okunur), arkadaşlık istekleri yalnızca `/api/friends` ile oluşur.
- `/api/ai` kimlik doğrulamalı ve hız sınırlıdır. Sunucu sırları istemci paketine gönderilmez.
- Güvenlik botuna kod katkısı açık rıza/opt-in ile alınır; kod otomatik ve denetimsiz biçimde modeli “kendi kendine eğitmez”. Katkı inceleme adayı olarak kaydedilir ve silme/geri çekme süreçlerine tabidir.
- Sahte kurulum dosyası ile yinelenen APK artefaktları kaldırıldı. Dağıtım düğmeleri yalnız doğrulanmış sürüm artefaktlarına bağlanmalıdır.

## Kimlik, veri ve hesap yaşam döngüsü

- Son girişler (0.3.21): her başarılı girişte `users/{email}.loginHistory` son 10 kaydı tutar (zaman, yöntem, tarayıcı ve sistem türü, ülke; IP adresi yok). Yalnızca hesap sahibine `/api/account/security` ile döner; dışa aktarımda yer alır, hesap silinince silinir.
- Görünüm: "Animasyonları azalt" ve "Yüksek kontrast" `<html>` niteliği olarak her sayfada uygulanır (`src/lib/appearance.tsx`); işlevsiz sıkı görünüm, arayüz yazı boyutu, saat dilimi ve emoji stili emekli edildi.

- NextAuth oturumları aktif kullanıcı ve oturum sürümü (`users/{email}.authVersion`) kontrolleriyle desteklenir. "Diğer tüm oturumları kapat", şifre değişikliği ve doğrulanmamış şifrenin kaldırılması bu sürümü artırır; eski sürümlü oturumlar her istekte reddedilir ve Firebase oturumları da kapatılır.
- Hesapta şifre varsa Google ile her girişten sonra `/login/verify`'da şifre (2FA açıksa kod) istenir; o zamana kadar oturum sunucuda kapalı sayılır ve 15 dakikada düşer (`src/lib/step-up.ts`). Şifresini unutan talep açar; yönetici "Şifreyi kaldır" ile şartı kaldırır.
- Google `email_verified` olmadan giriş yapılamaz; doğrulanmamış şifreli hesaba ilk doğrulanmış Google girişi o şifreyi ve 2FA'yı siler (önceden ele geçirme koruması). İlk şifreyi koymak ve hesabı silmek son 30 dakikada giriş ister.
- Security sayfasındaki "Hesabının güvenliği" kartı `GET /api/account/security`'den gelir: şifre ve 2FA var mı, kaç kurtarma kodu kaldı, son giriş ve bu oturumun doğrulandığı zaman. Gizli değer, karma ya da kod dönmez; öneriler `src/lib/account-security.ts`.
- Firebase istemci erişimi için kısa ömürlü özel token köprüsü kullanılır.
- Hesap verisi dışa aktarma ve silme uçları arkadaşlıklar, mesajlar, çağrı verileri, medya ve oyun projeleri gibi ilişkili kayıtları kapsar.
- Gerçek üretim ortamında Firebase Admin kimlik bilgileri, runner adresi, TURN bilgileri ve diğer sırlar yalnız sunucu ortam değişkenlerinde tutulmalıdır.

## Hanogt Social, durum ve WebRTC

- Arkadaşlar, direkt mesajlar ve gruplar `/social` altında Discord benzeri tek ekranda birleşti (grup rayı, kanallar, üye listesi). Firebase tarayıcı köprüsü kurulamazsa sohbetler `/api/social/*` ile sunucu üzerinden okunup gönderilir.
- Durum (Çevrimiçi, Boşta, Rahatsız Etmeyin, Görünmez + yalnızca metin olan özel durum; emoji kaldırıldı) `/api/presence` ile yalnız sunucudan yazılır; sekme başına rastgele kimlik, 5 dakikada otomatik Boşta, birden çok sekmede en etkin olanı geçerli. Rahatsız Etmeyin'de gelen aramalar çalmaz.
- Çağrılarda yalnız katılımcılar çağrı/sinyal verisini okuyabilir ve değiştirebilir.
- STUN/TURN yapılandırması desteklenir; güvenilir NAT geçişi için üretimde `TURN_SERVER_URL` ve `TURN_SHARED_SECRET` zorunludur.
- Çağrı bittiğinde sinyalleşme/ICE belgeleri ve geçici çağrı kayıtları temizlenir. Yarım kalan kayıtlar için sunucu temizleme ucu vardır.
- Sesli mesajlar boyut ve süre sınırlarına tabidir; sahiplik/katılımcı kontrolüyle saklanır ve silinebilir.
- Bire bir aramaların yanında, kod editöründeki "Ekiple düzenle" oturumlarında en fazla 5 kişilik mesh sesli görüşme vardır. Büyük gruplar için SFU altyapısı yoktur.

## Hanogt Media

- Kullanıcılar kod projelerini yayımlayabilir, dil ve üretici bilgisini görebilir, indirebilir, beğenebilir, yorumlayabilir ve bildirebilir.
- En çok beğenilen projeler için sıralama görünümü vardır.
- Görünen ad paylaşımı kullanıcının tercihine bağlıdır.
- İndirme ve etkileşim işlemleri yetkili API uçlarından geçer; sayaçlar istemci tarafından keyfi yazılamaz.

## Kod editörü

- Dil kaydı (`src/lib/runtimes/languages.ts`) 122 dil içerir; 57'si çalışır ya da önizlenir. Tarayıcıda (Web Worker/WebAssembly): JavaScript, TypeScript, Python (Pyodide), SQL (sql.js), Lua, Scheme, Brainfuck, Prolog, Forth, BASIC, Befunge, Whitespace, MIPS; YAML, TOML, XML, INI, .env, .properties, CSV ve JSON doğrulayıcıları; SVG, Mermaid ve LaTeX önizlemesi.
- "Ekiple düzenle": Yjs tabanlı canlı ortak düzenleme (en fazla 5 arkadaş), renkli imleçler, sohbet ve ses; tüm yazmalar `/api/collab` üzerinden, Firestore kuralları yalnızca katılımcılara okuma verir, süresi dolan oturumlar silinir.
- Editörden doğrudan Hanogt Media'da yayınlama, Düzenle menüsü ve komut paleti.
- Monaco tabanlı editör çoklu dosya/sekmeyi ve birden fazla desteklenen dilin tek çalıştırma eyleminde paralel yürütülmesini destekler.
- Her dilin çıktısı ayrı gösterilir; indirme sırasında oluşturulan geçici Blob URL'leri serbest bırakılır.
- Oyun projesi scriptleri C# veya C++ olarak oluşturulur. Editör güvenli `returnTo` parametresiyle oyun motoruna geri döner.
- C#/C++ derleme/çalıştırma izole harici toolchain gerektirir; tarayıcı içinde yerel ikili derleme yaptığı iddia edilmez.

## Hanogt AI

- `/api/ai`, Hanogt AI'ın kendi OpenAI uyumlu dil modeline platform bilgi tabanıyla RAG yapar ve akışla (NDJSON, akış protokolü v2) yanıtlar. Model yalnızca `HANOGT_AI_BASE_URL`, `HANOGT_AI_MODEL` ve `HANOGT_AI_API_KEY` ile ayarlanır; varsayılan ya da Groq yedeği yoktur, Groq ve Anthropic adresleri reddedilir (ör. Hugging Face router'da sağlayıcısı sabitlenmiş bir Qwen3 modeli, bir Inference Endpoint ya da ince ayarlı modeli sunan vLLM). Yapılandırılmamışsa hiçbir şey sayılmadan Çekirdek yanıtlar. İsteğe bağlı gelişmiş kod motoru (Claude) kaldırıldı.
- Hanogt AI yalnızca giriş yapmış kişilere açıktır: oturumsuz istek 401 `auth_required` alır, arayüz giriş/kayıt kapısı gösterir. Mesaj hakları ilk mesajla başlayan plan penceresinde sayılır: Ücretsiz dakikada 5 ve 7 günde 50, Plus dakikada 20 ve 14 günde 750, Pro dakikada 30 ve 7 günde 2.000. Sohbet ve geliştirici API'si aynı haktan düşer; model hiç yanıt veremezse mesaj geri verilir. Kendi API anahtarı bağlantılarının günlük sınırı ayrıdır ve Groq bu bağlantılardan kaldırılmıştır.
- Düşünme: model zor sorularda yanıt vermeden önce düşünebilir; düşünme yanıtın üstündeki panelde gösterilir, yalnızca tarayıcıda saklanır ve modele geri gönderilmez.
- Çevrimdışı Hanogt AI Çekirdeği, dil modeli yanıt veremediğinde giriş yapmış kişilere yanıt verir; tarayıcıda çalışan, 52 niyet ve 10.135 örnekle eğitilmiş bir sınıflandırıcıdır (test doğruluğu %89,9, kör test %95,9).
- Arayüz (0.3.21): kâğıt ve mürekkep tema, Sohbetler/Görevler sekmeli kenar çubuğu, Çalışma adımları, açık dosya için Değişiklikler kartı ve "Editöre uygula" (aynı sayfadaki editöre eşzamanlı olayla, tek düzenleme, Ctrl+Z ile geri alınır). Ayarlara göre modele son çalıştırmanın hata çıktısı (≤ 3.000 karakter) ve projedeki diğer dosyaların adları da gider; kod tercihleri (uzmanlık, yorum dili, kod stili, tercih edilen diller, tam dosya ya da fark) isteme eklenir.
- Ajan modu: profil okuma, grup oluşturma, kodu editörde açma, oyun oluşturma, gezinme ve arama. Her işlem kullanıcının izin kartıyla ve kendi oturumuyla mevcut API'lerden yapılır; araç adları/argümanları sunucuda yeniden denetlenir. Silme, şifre, 2FA, yönetim ve başkalarına mesaj yapılmaz.

- Eğitim: `train_lora.py` ara kayıtları özel model deposuna yükler (`--hub-checkpoints`), süre sınırında durur ve sonraki oturumda sürer; `training/kaggle/hanogt_train_kaggle.ipynb` Kaggle'ın ücretsiz GPU'suyla eğitir.

## Tarayıcı tabanlı oyun motoru (Hanogt Engine V3)

- V3: tilemap boyama ve karo çarpışmaları, UI bileşenleri, Animation/Tween/Timer, sis/bloom/vinyet ve yeni şablonlar; şema v3 ve eski projelerin kayıpsız taşınması.
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
- Arayüz 50 dilde. Ana sözlük anahtarları (`src/locales/<LANG>.json`) tüm dillerde tamamdır ve `npm run i18n:check` ile denetlenir. Satır içi TR/EN metinler (`{ TR, EN }`) İngilizce metnin özetiyle anahtarlanan çeviri paketlerinden (`src/locales/copy/<LANG>.json`, kaynak `npm run i18n:extract`) gelir; paketi eksik dillerde İngilizce gösterilir.
- Büyük i18n gövdesi dil bazlı JSON dosyalarına ayrıldı.
- Marka: ürün logoları sahibin çizimlerinden (`brand/source`) `node scripts/brand-assets.mjs` ile `public/brand` altına üretilir (64–512 px, PNG ve WebP; site simgesi, uygulama simgeleri ve paylaşım görseli dahil). Ürünler ve logo adresleri `src/lib/products.ts`, çizimi `ProductLogo`; renkler `--brand-*` jetonları. Renk geçişli kutu, bulanık küre, parıltı ve ağır emoji kullanılmaz.
- İndirmeler `GET /api/download` üzerinden: son GitHub sürümünün dosyaları uzantıya göre bulunur (15 dakika önbellek), `?platform=` dosyaya yönlendirir.

## Hukuki metin durumu

- Gizlilik Politikası, KVKK Aydınlatma Metni ve Kullanım Şartları; veri kategorileri, amaçlar, hukuki sebepler, aktarım, saklama, ilgili kişi hakları, çocuklar, güvenlik sınırları, içerik ve oyun projesi hükümleriyle genişletildi.
- Metinlerde gerçeğe aykırı “tam güvenlik” veya yapılmayan düzenli denetim iddiası kullanılmaz.
- Bunlar teknik taslaktır. Yayından önce veri sorumlusunun gerçek ticari unvanı, adresi, MERSİS/VKN, KEP/e-posta, saklama süreleri, alt işleyenler ve yurtdışı aktarım mekanizması doldurulmalı; güncel resmi mevzuat ve bir Türkiye hukukçusu tarafından onaylanmalıdır.

## Doğrulamalar

- `npx eslint` (değişen dosyalar) ve `npx tsc --noEmit`: geçti.
- `npm test`: 353 birim testi geçti (diller, Hanogt AI, ekiple düzenleme, destek, durum, haberler ve piyasalar dahil).
- `npm run build`: Next.js production build geçti (71 sayfa); yerel sunucuda başlıca sayfalar tarayıcıda hatasız açıldı.
- Dağıtım öncesinde ayrıca Firebase rules emulator testleri, gerçek mikrofon/WebRTC/TURN akışları, Storage silme akışı ve izole runner entegrasyonu canlı ortamda test edilmelidir.

## Operatör kontrol listesi

1. Firestore/Storage kurallarını hedef Firebase projesine deploy et (Yönetici Paneli > Bulut Sağlığı > "Güvenlik kurallarını yayımla" ya da Firebase CLI). İsteğe bağlı: ekiple düzenleme koleksiyonları için `purgeAt` alanında Firestore TTL kuralı.
2. Firebase Admin (`FIREBASE_SERVICE_ACCOUNT_JSON`) ve TURN sırlarını sunucu secret store'una ekle; yoğun kullanım için kendi `CODE_RUNNER_URL` çalıştırıcını kur (tanımlı değilse herkese açık Wandbox kullanılır).
3. Güvenlik botu katkı saklama/silme politikasını ve moderasyon iş akışını işlet.
4. WebRTC çağrı başlatma, reddetme, bağlantı kopması, bitirme ve eski kayıt temizliğini iki gerçek ağda test et.
5. Yasal metinlerdeki kuruluş alanlarını doldur ve hukuk incelemesini tamamla.
6. Oyun motorunu “MVP” olarak konumlandır; Unity ile özellik eşitliği iddiası kullanma.

## Değişiklik kaydı

Önemli tamamlamalar kökteki `CHANGELOG.md` ve uygulama içi Güncellemeler/İyileştirmeler penceresine işlendi. Bu belge teknik bağlam aktarımı içindir; değişikliklerin kaynak doğrusu kod, test çıktıları ve sürümlenmiş changelog'dur.
