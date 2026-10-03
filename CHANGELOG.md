# Değişiklik Günlüğü

## 0.3.1 — 2026-10-03

### Sesli arama: ses iki yönde de gidiyor

- Arama her zaman mikrofon ve ses açık başlıyor. Hanogt Social'da daha önce
  kapatılıp unutulan mikrofon/kulaklık düğmesi aramaları sessiz başlatıyordu
  (kulaklık düğmesi mikrofonu da kapatır).
- Karşı tarafın sesi, ses izi akışa eklendikten sonra bağlanıyor ve "Ara" /
  "Yanıtla" tıklamasında ses kilidi açılıyor; tarayıcı yine de engellerse
  arama çubuğunda "Sesi başlat" çıkıyor.
- Bağlantı ancak şifreleme el sıkışması (DTLS) da bitince "bağlandı" sayılıyor
  (`connectionState`); önceden yalnızca ICE'a bakılıyordu.
- Arama çubuğu sessizliğin nedenini söylüyor: mikrofonun ya da sesin kapalı,
  karşı taraf mikrofonunu kapattı (sessize alma artık karşıya iletiliyor),
  ses verisi gelmiyor, mikrofondan hiç ses gelmiyor; bağlantı türü (doğrudan /
  TURN) `getStats` ile gösteriliyor.
- Ses ayarları: mikrofon ve hoparlör seçimi, mikrofon testi, test sesi;
  aramalarda ve sesli mesajlarda kullanılıyor, görüşme sırasında da
  değiştirilebiliyor.
- TURN: Cloudflare Realtime TURN (`CLOUDFLARE_TURN_KEY_ID`,
  `CLOUDFLARE_TURN_KEY_API_TOKEN`; ayda 1.000 GB ücretsiz), coturn REST ya da
  sabit kimlik bilgileri (`src/lib/server/turn.ts`). Bulut Sağlığı TURN'ü
  denetliyor ve tarayıcıdan aktarım testi yapıyor.

### Sesli mesajlar Firestore'da

- Kayıtlar mesajla aynı commit'te sunucuya özel `voice_clips` koleksiyonuna
  yazılıyor (700 KB üstü parçalara bölünüyor). Cloud Storage Blaze planı
  istediği için Spark projelerinde sesli mesaj gönderilemiyordu.
- Dinleme Firestore'dan (eski kayıtlar Storage'dan), bayt aralığı destekli;
  silme akışları kaydı da siliyor. Kayıt mono 32 kbit/s.
- Sosyal paneldeki sessize alma artık sesli mesaj kaydını engellemiyor;
  mikrofon hataları ayrı ayrı açıklanıyor.

### Paddle ödeme ekranı

- Paddle.js güncel sürümün adıyla (`window.PaddleBillingV1`) bulunuyor ve
  Paddle'ın kendi yükleyicisi gibi başlatılıyor; önceden yalnızca
  `window.Paddle` arandığı ve her hata tek mesaja düştüğü için ödeme ekranı
  "yüklenemedi" diyordu.
- Hata aşamasıyla gösteriliyor (yüklenemedi, başlatılamadı, açılamadı,
  Paddle'ın `checkout.error` ayrıntısı) ve kimliksiz olarak ekibe
  bildiriliyor; Yönetici Paneli › Abonelikler › Paddle son 10 hatayı ve
  istemci tarafı jetonun Paddle hesabındaki durumunu gösteriyor.
- CSP Paddle'ın tüm alt alan adlarına ve Retain'e izin veriyor.

## 0.3.0 — 2026-10-02

### Planlar: Paddle ile abonelik

- Plus (aylık 20 $, yıllık 200 $) ve Pro (aylık 100 $, yıllık 1.000 $) Paddle
  üzerinden satılıyor; Paddle.com Kayıtlı Satıcı (Merchant of Record). Kart
  bilgisi Hanogt Codev'e ulaşmıyor.
- Sunucu: `src/lib/server/paddle.ts` (API istemcisi, imzalı webhook, eşitleme),
  `src/lib/server/paddle-config.ts` (değişkenler; sandbox/canlı anahtar
  öneklerinden), `/api/paddle/{webhook,checkout,subscription}`. Ödeme ekranı
  sunucuda hesabın kendi Paddle müşterisi ve imzalı custom data ile açılıyor;
  webhook yalnızca Paddle'ın `/ips` adreslerinden gelen ve imzası doğru
  bildirimleri işliyor, aboneliği API'den tazeleyerek okuyor.
- Kişinin planı, ekip tarafından tanımlanan plan ile ödenen plandan yüksek
  olanı; `past_due` sırasında avantajlar sürüyor; sandbox ve canlı verisi
  birbirine karışmıyor.
- Planlar sayfası: aylık/yıllık, ülkeye göre fiyat (pricing-preview), Paddle.js
  overlay ödeme, plan değişikliği önizlemesi, müşteri portalı, planlanmış
  iptalden vazgeçme, Retain için `pwCustomer`. Satışlar sahibi açana kadar
  yalnızca ekip ve `PADDLE_TESTER_EMAILS` için açık.
- Yönetici Paneli > Abonelikler > Paddle: bağlantı durumu, kopyalanabilir
  adresler, tek tıkla katalog oluşturma (yalnızca eksikleri ekler), fiyat
  eşleme ve fiyat kontrolü, satışları açma, eşleşmeyen abonelikler, işletme
  bilgileri, kuponların Paddle indirimlerine aktarılması.
- Hesap silme aboneliği hemen iptal ediyor ve müşteri kaydını e-postasız bir
  iz olarak bırakıyor. Bildirimler: plan etkin, değişti, iptal planlandı,
  ödeme alınamadı, sona erdi.
- CSP ve Permissions-Policy Paddle ödeme penceresine ve Apple Pay/Google
  Pay'e izin veriyor. `.env.example` eklendi; `docs/ENVIRONMENT.md` kurulum ve
  canlıya geçiş adımlarını anlatıyor.

### Abonelere yeni özellikler

- Hanogt AI'ya kendi API anahtarınla yapay zekâ bağlama (Plus 2, Pro 5
  bağlantı): OpenAI, Anthropic Claude, Google Gemini, Groq, Mistral,
  OpenRouter, DeepSeek, xAI ve Together. Anahtarlar AES-256-GCM ile şifreli
  saklanıyor ve bir daha gösterilmiyor.
- Proje hakları: Ücretsiz 10 kod + 10 oyun projesi, Plus 40 + 40, Pro
  sınırsız. Hanogt Social'da grup açma: Ücretsiz 3, Plus 10, Pro sınırsız
  (`PLAN_GROUP_LIMITS`, `/api/groups`). Yeni kod projelerini artık sunucu oluşturuyor (`/api/projects`);
  bu, yeni projelerin buluta kaydedilememesine yol açan kural sorununu da
  gideriyor. Güvenlik kurallarının yeniden yayımlanması gerekiyor (Bulut
  Sağlığı).

### Yasal

- Yasal metinler 4.4: İade Politikası sayfası, ödemeler ve Paddle,
  yapay zekâ bağlantıları; işletme bilgileri Yönetici Paneli'nden girilince
  metinlerde görünüyor. Yeni İletişim sayfası.

## 0.2.2 — 2026-10-02

### Kılavuz (Minecraft kitabı)

- Kitap bugünkü siteyi anlatıyor: 10 bölüm ve 43 sayfa. Yeni bölümler
  **Hanogt AI** (modlar, kod paneli, ajan modu, sınırlar) ve **Hanogt Social
  ve Media** (arkadaşlar, direkt mesajlar, gruplar, durum noktaları, sesli
  arama); yeni sayfalar Panel, ekiple düzenleme, V3 blokları, ilk oyun, remiks
  kuralları, piyasa bandı, iki adımlı doğrulama, destek ve Planlar (yakında).
  Eskimiş bilgiler (180 haber sınırı, kod çalıştırma, şablonlar, Parola
  Ölçer) düzeltildi; sayılar ilgili modüllerden okunuyor.
- Kitapta arama (Türkçe, İngilizce ya da arayüz dilinde); sonuç sayfası
  parlayarak açılıyor. Kaldığın sayfa ve açtığın bölümler bu tarayıcıda
  hatırlanıyor: "Kaldığın yerden devam et" düğmesi, XP çubuğu (seviye = açılan
  bölüm sayısı), hotbar'da açılmamış bölüm işareti ve **Kâşif** başarımı.
- Hotbar 10 yuvalı ve telefona sığıyor (1–9 ve 0 tuşları); düz metin
  görünümünde hotbar ilgili bölüme kaydırıyor. Eski `#media` bağlantısı
  Social bölümünü açıyor. Ana sayfadaki kitap önizlemesi sayfa sayısını
  kitaptan alıyor.

### Motor belgeleri

- **İlk oyunun: adım adım**: motorun gerçek menüleriyle 10 dakikada coin
  toplanan bir platform oyunu. Adımlar ve kod
  `scripts/tests/engine-docs.test.mjs` ile editör işlemleri kullanılarak
  kurulup oynatılıyor; motor değişirse test bozulur.
- **Sık karşılaşılan sorunlar** tablosu (derleme hataları, tetikleyiciler,
  NullReference, sonsuz döngü, tuşlar, yayınlama, kayıt çakışması).
- Kod bloklarında Kopyala düğmesi, içindekilerde metin araması, okunan
  bölümün vurgulanması ve telefonda açılır içindekiler. Türkçe yayınlama
  bölümü remiks iznini anlatıyor.
- Oluştur menüsündeki Sprite (Kare/Daire) İngilizce arayüzde Sprite
  (Square/Circle) olarak görünüyor.

## 0.2.1 — 2026-10-02

### Arcade: remiks izni

- Yayınlama penceresine **Remikslemelere izin ver** anahtarı eklendi; açık
  değilse Remix düğmesi görünmüyor ve sunucu kopyalamayı reddediyor
  (`POST /api/arcade/{id}/remix`). Yeniden yayınlarken son seçim korunuyor.
- Remikslenen oyunlar orijinal oyunun adını ve yapımcısını atıf olarak
  taşıyor; oyun sayfasında "… tarafından yapılan … oyununun remiksi"
  bağlantısı, Arcade kartlarında "remikslenebilir" rozeti var.

### Planlar (Yakında)

- Yeni **Planlar** sayfası (`/plans`): Ücretsiz, Plus ve Pro. Ödeme alınmıyor;
  "Açılınca haber ver" ile bekleme listesine katılınabiliyor. Giriş yapanlar
  planını ve günlük Hanogt AI kullanımını görüyor.
- Hanogt AI sınırları plana göre: Ücretsiz günde 250, Plus 750, Pro 2.000
  mesaj. Plus ve Pro'nun yeni destek talepleri yüksek öncelikle açılıyor.
- Yönetici Paneli > **Abonelikler**: plan fiyatları ve indirimleri (fiyat
  geçmişiyle), kuponlar, kişiye elle plan tanımlama, süre, engelleme ve
  kaldırma, Hanogt AI sayacını sıfırlama ve ek günlük mesaj hakkı. Her işlem
  denetim kaydına yazılıyor.
- Abonelik ve bekleme kayıtları hesap dışa aktarımına dahil, hesap
  silindiğinde siliniyor. Yasal metinler 4.3.

## 0.2.0 — 2026-10-02

Topluluk, yapay zekâ ve editör güncellemesi: arkadaşlar, mesajlar ve gruplar
Hanogt Social'da birleşti; Hanogt AI izinle işlem yapan bir ajana dönüştü;
kod editörü 122 dile ulaştı ve ekiple canlı düzenlemeyi öğrendi. Bu sürüm,
main'deki 0.1.3 çalışmasını da içerir.

### Hanogt Social

- `/social`: solda grup rayı, ikinci sütunda direkt mesajlar ya da grubun
  kanalları, ortada sohbet, sağda rol ve duruma göre üye listesi; telefonda
  çekmeceler, Ctrl/⌘+K hızlı geçiş. Eski `/friends`, `/messages` ve
  `/groups` adresleri yönlendiriliyor.
- Firebase tarayıcı bağlantısı kurulamazsa arkadaşlar, direkt mesajlar ve
  grup sohbeti sunucu API'leriyle çalışmayı sürdürüyor.

### Durum ve Hesap Ayarları

- Discord tarzı durum (Çevrimiçi, Boşta, Rahatsız Etmeyin, Görünmez) ve özel
  durum; 5 dakika etkileşimsizlikte otomatik Boşta, birden çok sekme ya da
  cihazda en etkin olanı geçerli. Durum sunucudan yazılıyor (`/api/presence`);
  0.1.3'te seçilen durum (`presenceChoice`) okunmaya devam ediyor.
  Rahatsız Etmeyin'de gelen sesli aramalar çalmıyor.
- Hesap Ayarları kategori menüsü ve canlı profil kartıyla yeniden
  tasarlandı; profil sunucudan okunup yazılıyor. Editör Ayarları'na
  Kaydet/Vazgeç ve hesaba kaydetme eklendi.

### Hanogt AI

- Claude benzeri arayüz: geçmiş kenar çubuğu, büyüyen yazma alanı,
  kopyala/yeniden üret/düzenle, kod blokları için "Editörde aç" ve web
  önizlemeli yan panel; yüzen panel aynı sohbeti tam ekranda açabiliyor.
- İzinli ajan modu: profilimi oku, grup oluştur, kodu editörde aç, oyun
  oluştur, sayfaya git, sitede ara. Her işlem izin kartıyla onaylanır;
  silme, şifre, 2FA, yönetim ve başkalarına mesaj hiçbir zaman yapılmaz.
  Araç adları ve argümanları sunucuda yeniden denetlenir.
- Çevrimdışı çekirdek yeniden eğitildi: 52 niyet, 10.135 örnek; test
  doğruluğu %67,2 → %89,9 (makro-F1 %90,6), kör testte %95,9. Model artık
  ikili dosya (`public/ai/hanogt-intent-model.bin`). Ayrıntılar:
  `docs/HANOGT_AI.md`, `ai/reports/intent-training-report.md`.

### Kod editörü

- 122 dil, 57'si çalışıyor ya da önizleniyor. Tarayıcıda yeni: Prolog,
  Forth, BASIC, Befunge-93, Whitespace ve MIPS. Doğrulayıcılar: YAML, TOML,
  XML, INI, .env, .properties, CSV/TSV. Önizleme: SVG, Mermaid, LaTeX
  (KaTeX). 46 yeni düzenleme dili ve sözdizimi grameri, 57 yeni simge.
- "Ekiple düzenle": arkadaşlarla en fazla 5 kişilik canlı oturum (Yjs),
  renkli imleçler, ekip paneli ve takip, sohbet, herkesin katıldığı sesli
  görüşme, salt okunur mod, bitişte kopyayı saklama. Yazmalar yalnızca
  `/api/collab` üzerinden; süresi dolan oturumlar kendiliğinden siliniyor.
- Editörden doğrudan Media'da yayınlama ve Düzenle menüsü; web önizlemesinde
  localStorage kullanan sayfalar artık çalışıyor.

### Hanogt Engine V3

- Tilemap boyama ve karo çarpışmaları, UI Button/Panel/Progress Bar,
  Animation, Tween ve Timer, sis/bloom/vinyet, üç yeni şablon; şema v3 ve
  eski projelerin kayıpsız taşınması.

### Destek, yönetim ve bulut

- Destek talepleri altı kategoride (Şikayet, İstek, Güvenlik Açığı, Ban
  Kaldırma İsteği, Soru, Geri Bildirim) ve kategoriye özel alanlarla; yeni
  talep ve yanıtlarda ekibe bildirim, gönderen sicili. Ban itirazı kimliği
  canlıdaki verilerle uyumlu olarak `ban_appeal`.
- Askıya alınan hesaplar için doğrulanmış itiraz ve iki adımlı doğrulamayı
  kaybedenler için kurtarma talebi.
- Yönetici Paneli: kurucu rozeti, kullanıcı verisi silme, Bulut Sağlığı ve
  tek tıkla kural yayımlama. Bildirim zili ve KVKK dışa aktarımı.
- Firebase web yapılandırması çalışma anında `/api/firebase/config`'ten
  okunuyor; bağlantı kurulamazsa kopyalanabilir hata kodu gösteriliyor.

### Hanogt News

- Finans & Ekonomi kategorisi; piyasa şeridinde TCMB kurları (önceki güne
  göre değişim), gram ve ons altın, BIST 100, S&P 500 ve Bitcoin. Haber
  arşivi ve "Daha eski haberleri yükle".

### Yasal metinler

- Gizlilik Politikası, KVKK Aydınlatma Metni ve Kullanım Şartları 4.2:
  Hanogt Social, durumlar, ekiple düzenleme, piyasa verisi kaynakları,
  2FA kurtarma talebi ve yeni tarayıcı depolama anahtarları; TURN kullanıcı
  adının tuzlu takma kimlik taşıdığı düzeltildi.

### Operatör notları

- `firestore.rules` yeniden yayımlanmalı (Yönetici Paneli > Bulut Sağlığı >
  "Güvenlik kurallarını yayımla"): durum alanları yalnızca sunucudan
  yazılıyor, `collab_sessions` yalnızca katılımcılara okunur.
- İsteğe bağlı: `collab_sessions`, `live`, `snapshots`, `updates`,
  `presence`, `chat`, `signals` koleksiyon grupları için `purgeAt` alanında
  Firestore TTL kuralı.

## 0.1.3 — 2026-10-01

### Durum (Discord tarzı)

- Profil menüsünden durum seçilebiliyor: **Çevrimiçi** (yeşil nokta),
  **Boşta** (sarı hilal), **Rahatsız Etmeyin** (kırmızı daire, beyaz çizgi)
  ve **Görünmez** (gri halka, çevrimdışı görünürsün). 10 dakika işlem
  yapılmazsa durum kendiliğinden Boşta'ya geçiyor.
- Durum artık tarayıcının Firebase bağlantısına bağlı değil: açık sekmeler
  45 saniyede bir `/api/presence` ile sunucuya bildiriyor; sekme kapanınca
  çevrimdışına düşülüyor. Başlıkta, profil kartlarında ve grup üyelerinde
  aynı rozet görünüyor.
- Rahatsız Etmeyin açıkken gelen sesli aramalar çalmıyor. Durum, Hesap
  Ayarları'ndaki "Durumun" bölümünden de değiştirilebiliyor.

### Destek talepleri

- Talep konuları altıya indi: **Şikayet, İstek, Güvenlik Açığı, Ban Kaldırma
  İsteği, Soru, Geri Bildirim**. Ban itirazları doğrudan "Ban Kaldırma
  İsteği" olarak açılıyor ve yüksek öncelik alıyor; KVKK hak talepleri
  "İstek" konusunda. Eski talepler kendi konularıyla görünmeye devam ediyor.
  Yönetici her talebe panelden yanıt verebiliyor.

### Hanogt News

- Yeni **Ekonomi & Finans** kategorisi: BBC Business, CNBC, MarketWatch,
  Yahoo Finance, The Guardian, BloombergHT, AA, NTV, Habertürk, Hürriyet ve
  Paraanaliz kaynakları.
- Haberlerin üstünde döviz (dolar, euro, sterlin), gram/ons altın, BIST 100,
  S&P 500 ve Bitcoin şeridi; 5 dakikada bir yenileniyor.
- Akış 180 haberde takılmıyor: canlı akış 240 habere çıktı, eski haberler
  arşivleniyor ve "Daha eski haberleri yükle" ile sınırsız geriye gidilebiliyor.

### Site

- Ana sayfadaki "Bir sonraki projen burada başlıyor" bölümü bir başlangıç
  paneline dönüştü: Python, web sitesi, oyun, Hanogt AI, ekip ve Arcade için
  tek tıkla başlama kutuları.
- Hakkımızda sayfası yenilendi: güncel ürünler (Hanogt AI ve Hanogt Social
  dahil), canlı kullanıcı/proje/oyun/gönderi sayıları (`/api/stats/public`),
  sürüm yolculuğu ve "Sırada ne var?".
- Alt bilgideki dil seçici artık ekranın kenarında kesilmiyor; menü yer yoksa
  yukarı açılıyor ve sayfa kaydırılınca kapanıyor.
- Giriş ve kayıt sayfalarının metinleri güncellendi (Engine V3, Hanogt AI,
  Hanogt Social, iki adımlı doğrulama).
- İlk ziyarette arayüz dili ülkeye ve tarayıcı diline göre seçiliyor; elle
  seçilen dil her zaman önce geliyor.
- Yeni metinler 50 arayüz dilinin hepsine çevrildi.

## 0.1.2 — 2026-10-01

Güvenlik, yapay zeka ve topluluk güncellemesi: iki adımlı doğrulama, dil
modeline dönüşen Hanogt AI, yönetici paneli, yenilenen Gruplar ve 65 dilli
kod editörü.

### Hanogt AI (eski Güvenlik Botu sohbeti)

- Kural tabanlı sohbet yerine gerçek bir dil modeli: `/api/ai` üzerinden
  OpenAI uyumlu herhangi bir modele bağlanır (varsayılan Groq), yanıtı
  platformun kendi bilgi tabanından RAG ile zenginleştirir ve akışla
  iletir. Genel, Kod ve Güvenlik modları var.
- Çevrimdışı "Hanogt AI Çekirdeği": tarayıcıda çalışan, 41 niyet için
  eğitilmiş bir model (hash'lenmiş n-gram, softmaks). Giriş yapılmamışsa ya
  da dil modeline ulaşılamıyorsa (sınır, yapılandırma, ağ) yanıtı çekirdek
  verir; her yanıt "LLM" veya "Çekirdek" olarak etiketlenir.
- Bağlantı oltalama denetimi, çalıştırma hatası açıklayıcı ve statik kod
  danışmanı yanıtlara araç notu olarak eklenir. Belgeler: `docs/HANOGT_AI.md`.
- Eğitim çevrimdışı ve depoda: `npm run ai:train`.

### İki adımlı doğrulama (2FA)

- E-posta/şifre girişine zaman tabanlı tek kullanımlık kod (TOTP, RFC 6238)
  ve tek kullanımlık kurtarma kodları eklendi. Giriş sayfasında ikinci adım,
  Hesap Ayarları > Güvenlik'te QR kodla kurulum, kurtarma kodu indirme ve
  kapatma akışı var.
- Gizli anahtarlar AES-256-GCM ile şifreli, kurtarma kodları HMAC özetiyle
  yalnızca sunucudaki `credentials` belgesinde saklanır; aynı kod iki kez
  kullanılamaz.
- Yönetici Paneli'nde kilitlenen kullanıcı için gerekçeli "2FA sıfırla".

### Yönetici Paneli (/admin)

- Owner/admin/moderator rolleri (owner'lar `ADMIN_EMAILS` ile), sunucu
  tarafında korunan API'ler ve denetim kaydı.
- Genel bakış istatistikleri, kullanıcı arama/askıya alma/rol yönetimi,
  bildirim ve içerik moderasyonu, güvenlik olayları, Arcade yönetimi ve
  site duyuruları (başlıkta duyuru bandı).

### Gruplar

- 3 adımlı oluşturma sihirbazı ve 6 şablon (Boş, Çalışma grubu, Oyun
  geliştirme, Açık kaynak, Sınıf, Hackathon): başlangıç dosyaları, kurallar,
  konular ve sabitlenmiş hoş geldin mesajı sunucuda hazırlanır.
- Süreli/kullanım sınırlı, iptal edilebilir davet bağlantıları
  (`/groups/join/<token>`), sahip/yöneticiler için başlangıç kontrol listesi.
- Sohbet: sabitleme, tepkiler, @bahsetme, arama, #konu filtreleri, eski
  mesajları yükleme (uzun sohbetlerde yeni mesajların görünmemesi düzeltildi).
- Dosyalar: yeniden adlandırma, şablonlar, ZIP indirme, editörde açma;
  kaydedilmemiş yazı gelen değişikliklerle ezilmiyor.

### Kod editörü ve diller

- 65 dil tek kaynaktan yönetiliyor. Tarayıcıda çalışan 8 dil (JavaScript,
  TypeScript, Python, SQL, Lua ve yeni Scheme, Brainfuck, JSON); HTML/CSS/JS,
  CSS ve Markdown için güvenli önizleme; 30 dil sunucuda, 24 dil yalnızca
  düzenleme.
- Ctrl/⌘+K komut paleti, kısayol yardımı, sekme yönetimi, durum çubuğu,
  şablon galerisi, ZIP yükleme/indirme, parçacık paylaşımı; dosya başına
  çıktı ve tıklanabilir `dosya:satır` bağlantılı konsol, stdin ve geçmiş.
- Editör Ayarları (/settings) baştan yazıldı: canlı önizleme, 10 tema,
  arama, sıfırlama ve JSON dışa/içe aktarma.

### Güvenlik

- Hanogt Security Bot imzaları için etiketli değerlendirme aracı
  (`npm run security:eval`): `rm -rf ./node_modules`, `rm -rf build/` gibi
  en sık temizlik komutlarını yanlışlıkla engelleyen "kök silme" imzası
  düzeltildi; ağdan indirip süreç başlatma artık engellemiyor, yalnızca
  bilgilendiriyor.
- Kendine arkadaş ekleme, depolama yolu aşımı ve dosya silme açıkları
  kapatıldı; Firestore kuralları sıkılaştırıldı ve gerileme testleriyle
  (emülatör) doğrulandı.
- Sürüm koşullu belge yazmaları artık `:commit` ile yapılıyor; eşzamanlı
  isteklerde çakışmalar hata yerine yeniden deneniyor/409 dönüyor.

### Çeviriler

- 50 arayüz dili. Arapça, Çekçe, Macarca, Endonezce, İtalyanca, Portekizce,
  Romence, Ukraynaca, Özbekçe ve Vietnamca ana sözlükleri tamamlandı;
  Gürcüce, Kırgızca, Litvanca, Tamilce, Türkmence ve Arnavutça ana
  sözlükleri eklendi. Çevrilmemiş metinler İngilizceye düşerek çalışır.

## 0.1.1 — 2026-09-30

### Kod çalıştırma

- Kod çalıştırma artık hiçbir sunucu ayarı gerektirmiyor. JavaScript, TypeScript, Python 3.14, SQL (SQLite) ve Lua 5.4 doğrudan tarayıcıda, ayrı bir Web Worker içinde WebAssembly ile çalışıyor; giriş gerekmiyor ve kod sunucuya gönderilmiyor. Sonsuz döngüler 15 saniyede durduruluyor.
- C, C++, C#, Java, Kotlin, Go, Rust, Swift, Ruby, PHP, Perl, Scala, Haskell, Elixir, Erlang, Nim, D, Crystal, Bash, Pascal, OCaml, Zig, Julia, R, Groovy, Lisp, F# ve CoffeeScript, `CODE_RUNNER_URL` tanımlı değilse Hanogt Security Bot taramasından sonra herkese açık Wandbox derleyicisinde (Kotlin için JetBrains Kotlin Playground) çalışıyor. Java'da `public class Main` gibi dosya adına bağlı sınıflar da çalışıyor.
- Editöre **Girdi** sekmesi eklendi: `input()`, `Scanner`, `cin`, `io.read()` gibi okumalar bu alandan besleniyor. Python ilk yüklenirken çıktı alanında ilerleme gösteriliyor.
- Hata mesajları gerçek yorumlayıcılardaki gibi `main.py`, `main.js`, `main.ts`, `main.lua` dosya adı ve satır numarasıyla gösteriliyor; Python'da `if __name__ == "__main__":` bloğu çalışıyor.
- Firebase sunucu kimliği eksik ya da veritabanına geçici olarak ulaşılamıyorsa kod çalıştırma kapanmıyor: imzalı oturum kimliği kullanılıyor ve hız sınırı sunucu belleğine düşüyor.

### Oturum

- Giriş yapan kullanıcı artık çıkış yapana kadar oturumda kalıyor: oturum 90 gün geçerli ve her ziyarette yenileniyor. Sayfa yenilenince üst menü birkaç saniye "Giriş Yap" gösteriyordu, kullanıcılar da tekrar giriş yapıyordu. Artık hesap simgesi hemen görünüyor ve veri bağlantısı arka planda hazırlanıyor.
- www.hanogtcodev.com'da Google ile giriş yapanlar Google'ın döndüğü hanogtcodev.vercel.app adresinde kalıyor ve www'ye dönünce çıkış yapmış görünüyordu. Google adımından sonra oturum, yalnızca girişi başlatan tarayıcının kullanabileceği 2 dakikalık imzalı bir anahtarla başlangıç sitesine geri taşınıyor (`/api/auth/handoff`).
- Zaten giriş yapmış biri giriş veya kayıt sayfasını açınca form gösterilmeden gideceği sayfaya yönleniyor. Google ile girişten sonra istenen sayfa (ör. editör) açılıyor; daha önce ana sayfaya düşülüyordu.
- Masaüstü uygulaması www.hanogtcodev.com, hanogtcodev.com ve hanogtcodev.vercel.app arasında geçişi uygulama içinde tutuyor.

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
