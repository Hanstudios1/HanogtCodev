# Hanogt Codev

Hanogt Codev; Next.js, Monaco Editor, NextAuth ve Firebase tabanlı çevrim içi kod editörü, tarayıcıda çalışan 2D/3D oyun motoru, canlı teknoloji haberleri ve topluluk/iletişim uygulamasıdır.

## Özellikler

- Monaco tabanlı çok sekmeli ve gerçek çoklu dosya proje editörü
- Yapılandırılmış, izole ve Piston uyumlu bir runner üzerinden kod çalıştırma
- Sunucu tarafı kod kötüye kullanım taraması ve Firestore destekli dağıtık oran sınırlama
- Arkadaşlık, engelleme, güncel çevrim içi durumu ve gerçek zamanlı mesajlaşma
- WebRTC sesli arama ve Firebase Storage tabanlı, süre/boyut sınırlı sesli mesajlar
- Hanogt Media'da proje yayımlama, lisans seçimi, indirme, beğeni, yorum, bildirim ve popüler proje keşfi
- Davet/rol yönetimli grup çalışma alanı, ortak dosyalar, gerçek zamanlı sohbet, bire bir WebRTC araması ve sesli mesaj
- Tek Çalıştır komutuyla en fazla sekiz farklı dildeki dosyayı bağımsız işler olarak paralel çalıştırma
- Hanogt Engine v2: Unity benzeri editör (hiyerarşi, Inspector, Proje paneli, Konsol), three.js tabanlı WebGL render, OBB/SAT fiziği, C#/C++ scriptleri tarayıcıda yorumlayan HanogtScript sanal makinesi, hazır şablonlar ve tek dosya HTML dışa aktarma
- Hanogt Arcade: motorla yapılan oyunları yayınlama, tarayıcıda oynama, beğeni, oynanma sayacı ve remiks
- Hanogt News: 20'yi aşkın kaynaktan canlı yapay zeka, yazılım, oyun ve uygulama haberleri; animasyonlu akış, yorumlar ve topluluk oylarıyla (Elo) yapay zeka arenası
- Güvenlik Merkezi: tarayıcıda çalışan Kod Danışmanı, Parola Laboratuvarı (k-anonim sızıntı kontrolü), Bağlantı Kontrolü ve Security Bot v6
- Minecraft kitabı tarzında etkileşimli kullanım kılavuzu (`/guide`)
- Gösterge panelinde Kod Projeleri/Oyun Projeleri, proje arama ve sıralama
- AI kod yardımcısı, geri bildirim merkezi, SSS ve sağdan sola Arapça dahil 30 dil için gecikmeli yüklenen yerelleştirme paketleri
- Web, Electron ve Capacitor hedefleri

## Güvenlik modeli

- Parolalar düz metin olarak saklanmaz. Her parola benzersiz salt ile `scrypt` kullanılarak özetlenir ve sabit zamanlı karşılaştırma yapılır.
- Tarayıcı, Firestore'a NextAuth oturumuna bağlı kısa ömürlü Firebase custom token ile erişir. `firestore.rules` ve `storage.rules` katılımcı/iyelik denetimi uygular.
- `/api/execute`, `/api/ai`, arkadaşlık, geri bildirim ve hesap işlemleri oturum, aynı kaynak ve sunucu tarafı oran sınırı denetimlerinden geçer.
- Hanogt Security Bot bir savunma katmanıdır; antivirüs veya tam yalıtım garantisi değildir. Asıl güven sınırı; ağı kapalı, salt okunur kök dosya sistemli, kaynak/zaman limitli ve her çalıştırmadan sonra yok edilen harici runner olmalıdır.
- Aramalar kaydedilmez. Firestore'daki WebRTC sinyal belgeleri ve ICE adayları arama kapandığında silinir.
- Media güvenlik katkısı varsayılan olarak kapalıdır. Yalnız hesap ve proje düzeyinde ayrı ayrı izin verildiğinde inceleme adayı oluşturulur; sistem kendiliğinden model eğitmez.
- Oyun proje belgeleri ve C#/C++ kaynakları yalnız sahiplik kontrollü sunucu API'sinden geçer; Firestore istemci kuralları bu koleksiyonları tamamen kapatır. Sahne başına 1000 nesne, proje içeriği 900 KB ve script başına 160 KB sınırı vardır; revizyon çakışmaları sessizce üzerine yazılmaz. Arcade'de yayınlanan oyunlar derleme ve güvenlik taramasından geçer.
- Haber yorumları giriş, hız sınırı ve küfür/spam/kişisel veri filtresinden geçer. Parola sızıntı kontrolü k-anonimlik kullanır: tarayıcıdan yalnız SHA-1 özetinin ilk 5 karakteri gönderilir.

### Kod çalıştırma

- JavaScript, TypeScript, Python (Pyodide), SQL (sql.js) ve Lua (wasmoon) ziyaretçinin tarayıcısında, ayrı bir Web Worker içinde WebAssembly ile çalışır. Kod hiçbir sunucuya gönderilmez, giriş gerekmez; zaman aşımında worker tamamen sonlandırılır. Çalışma zamanları `npm run prepare:assets` ile `public/runtimes` altına kopyalanır (CDN kullanılmaz).
- Derlenen diller (C, C++, C#, Java, Go, Rust, Swift, Ruby, PHP ve diğerleri) `/api/execute` üzerinden oturum, aynı kaynak, hız sınırı (dakikada 20) ve Hanogt Security Bot taramasından geçer; ardından kod **bizim sunucumuzda değil**, izole bir çalıştırıcıda yürütülür:
  1. `CODE_RUNNER_URL` tanımlıysa kendi barındırdığınız Piston uyumlu çalıştırıcı (önerilen; `CODE_RUNNER_TOKEN` isteğe bağlı).
  2. Tanımlı değilse anahtarsız, herkese açık [Wandbox](https://wandbox.org) derleyicisi (`WANDBOX_URL` ile kendi Wandbox kurulumunuza yönlendirilebilir). Kotlin, JetBrains'in herkese açık Kotlin Playground derleyicisiyle çalışır.
- Program girdisi (stdin) editördeki **Girdi** sekmesinden verilir (en fazla 10.000 karakter).

> Uyarı: Regex/statik tarama tek başına güvenli kod çalıştırma sağlamaz. Güvenlik sınırı, kodun Hanogt sunucularında hiç çalıştırılmamasıdır: tarayıcı dilleri ziyaretçinin kendi cihazında, derlenen diller üçüncü taraf ya da size ait izole çalıştırıcıda yürür. Herkese açık çalıştırıcılar kullanılabilirlik garantisi vermez; üretimde yoğun kullanım için kendi `CODE_RUNNER_URL` hizmetinizi kurun.

## Yerel kurulum

Gereksinimler: Node.js 20+, npm ve bir Firebase projesi.

```bash
git clone https://github.com/Hanstudios1/HanogtCodev.git
cd HanogtCodev
npm install
copy .env.example .env.local
npm run dev
```

Ardından `http://localhost:3000` adresini açın. `.env.example` içindeki tarayıcı Firebase yapılandırmasını, sunucu servis hesabını, `NEXTAUTH_SECRET` ve `RATE_LIMIT_SALT` değerlerini doldurun. Servis hesabı JSON'unu asla `NEXT_PUBLIC_` değişkeninde veya Git deposunda tutmayın.

Firebase kuralları ve indeksleri:

```bash
firebase deploy --only firestore:rules,firestore:indexes,storage
```

`npm run i18n:check`, arayüzde kullanılan çeviri anahtarlarının 30 dil paketinin hepsinde bulunduğunu doğrular. Kod çalıştırma API'si tek dosyayı veya en fazla sekiz dosyalık bir listeyi kabul eder; farklı diller aynı istek içinde bağımsız runner işleri olarak çalışır, diller arasında süreç içi bellek/IPC paylaşılmaz.

## Hanogt Engine kapsamı

Hanogt Engine v2 tarayıcıda çalışan, nesne-bileşen tabanlı bir 2D/3D oyun motoru ve editörüdür; Unity'nin yerine geçtiği iddia edilmez. C# ve C++ scriptleri `eval` veya `new Function` ile çalıştırılmaz: HanogtScript sanal makinesi kaynağı ayrıştırır ve yalnız motor API'lerine erişebilen, kare başına komut bütçeli bir yorumlayıcıda çalıştırır (sonsuz döngüler durdurulur, hatalar satır numarasıyla gösterilir). Desteklenen alt küme; sınıflar, kalıtım, özellikler, lambda, LINQ, koleksiyonlar, coroutine, `ref/out`, `std::vector`/`std::cout` ve Unity benzeri yaşam döngüsü ile API'leri (Input, Physics, Time, PlayerPrefs, SceneManager vb.) kapsar. Tam .NET/STL, dosya sistemi, ağ, yansıma ve işaretçi aritmetiği desteklenmez. Oyunlar tek dosya HTML olarak dışa aktarılabilir veya Arcade'de yayınlanabilir; yerel/mağaza derlemesi ayrı araç zinciri gerektirir.

WebRTC'nin kurumsal ağlarda güvenilir çalışması için `TURN_SERVER_URL` ve `TURN_SHARED_SECRET` ile coturn TURN REST kimlik bilgilerini tanımlayın. STUN tek başına her NAT yapısında yeterli değildir.

## Üretim kontrol listesi

- `npm run lint` ve `npm run build`
- Firestore/Storage kurallarını emülatör testleriyle doğrulama
- Runner için CPU, bellek, PID, disk, ağ ve duvar saati limitleri
- Firebase App Check, merkezi log/uyarı ve saklama/TTL politikaları
- Media moderasyonu, rapor kuyruğu, telif kaldırma başvuruları ve kötüye kullanım operasyonu için yetkili ekip/iş akışı
- Grup düzenlemesinde mevcut son-yazan-kazan modelinden CRDT/OT tabanlı çakışma çözümüne geçiş (eşzamanlı imleç ve satır-birleştirme gerekiyorsa)
- Gerçek veri sorumlusu unvanı, adresi, iletişim/KEP bilgileri ve saklama süreleriyle hukukçu onaylı KVKK metinleri
- İmzalanmış ve zararlı yazılım taramasından geçmiş masaüstü/mobil sürümlerinin yalnızca GitHub Releases gibi sürüm kaynağından yayınlanması

## Teknolojiler

Next.js 16, React 19, TypeScript, Tailwind CSS 4, Framer Motion, three.js, Monaco Editor, NextAuth 4, Firebase 12, WebRTC, Electron ve Capacitor.

## Lisans

[MIT](./LICENSE) — geliştirici: Oğuz Han Guluzade / HanStudios.
