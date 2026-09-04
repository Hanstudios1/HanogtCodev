# Hanogt Codev

Hanogt Codev; Next.js, Monaco Editor, NextAuth ve Firebase tabanlı çevrim içi kod editörü, topluluk/iletişim uygulaması ve web oyun geliştirme çalışma alanıdır.

## Özellikler

- Monaco tabanlı çok sekmeli ve gerçek çoklu dosya proje editörü
- Yapılandırılmış, izole ve Piston uyumlu bir runner üzerinden kod çalıştırma
- Sunucu tarafı kod kötüye kullanım taraması ve Firestore destekli dağıtık oran sınırlama
- Arkadaşlık, engelleme, güncel çevrim içi durumu ve gerçek zamanlı mesajlaşma
- WebRTC sesli arama ve Firebase Storage tabanlı, süre/boyut sınırlı sesli mesajlar
- Hanogt Media'da proje yayımlama, lisans seçimi, indirme, beğeni, yorum, bildirim ve popüler proje keşfi
- Davet/rol yönetimli grup çalışma alanı, ortak dosyalar, gerçek zamanlı sohbet, bire bir WebRTC araması ve sesli mesaj
- Tek Çalıştır komutuyla en fazla sekiz farklı dildeki dosyayı bağımsız işler olarak paralel çalıştırma
- Hanogt Engine ile bileşen tabanlı 2D ve üç eksenli izometrik 3D Canvas sahneleri, nesne hiyerarşisi, Inspector, Transform araçları, undo/redo ve fizik önizlemesi
- Gösterge panelinde ayrı Kod Projeleri/Oyun Projeleri; C# veya C++ script oluşturma, Monaco'da düzenleme ve aynı sahneye dönüş akışı
- AI kod yardımcısı, geri bildirim merkezi, SSS ve 20 dil için gecikmeli yüklenen yerelleştirme paketleri
- Web, Electron ve Capacitor hedefleri

## Güvenlik modeli

- Parolalar düz metin olarak saklanmaz. Her parola benzersiz salt ile `scrypt` kullanılarak özetlenir ve sabit zamanlı karşılaştırma yapılır.
- Tarayıcı, Firestore'a NextAuth oturumuna bağlı kısa ömürlü Firebase custom token ile erişir. `firestore.rules` ve `storage.rules` katılımcı/iyelik denetimi uygular.
- `/api/execute`, `/api/ai`, arkadaşlık, geri bildirim ve hesap işlemleri oturum, aynı kaynak ve sunucu tarafı oran sınırı denetimlerinden geçer.
- Hanogt Security Bot bir savunma katmanıdır; antivirüs veya tam yalıtım garantisi değildir. Asıl güven sınırı; ağı kapalı, salt okunur kök dosya sistemli, kaynak/zaman limitli ve her çalıştırmadan sonra yok edilen harici runner olmalıdır.
- Aramalar kaydedilmez. Firestore'daki WebRTC sinyal belgeleri ve ICE adayları arama kapandığında silinir.
- Media güvenlik katkısı varsayılan olarak kapalıdır. Yalnız hesap ve proje düzeyinde ayrı ayrı izin verildiğinde inceleme adayı oluşturulur; sistem kendiliğinden model eğitmez.
- Oyun proje belgeleri ve C#/C++ kaynakları yalnız sahiplik kontrollü sunucu API'sinden geçer; Firestore istemci kuralları bu koleksiyonları tamamen kapatır. Sahne 500 nesne/512 KB, script 160 KB ile sınırlıdır ve revizyon çakışmaları sessizce üzerine yazılmaz.

> Uyarı: Regex/statik tarama tek başına güvenli kod çalıştırma sağlamaz. `CODE_RUNNER_URL` tanımlı değilse endpoint güvenli biçimde hizmet dışı kalır; herkese açık Piston/Wandbox geri dönüşü yoktur.

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

`npm run i18n:check`, arayüzde kullanılan çeviri anahtarlarının 20 dil paketinde de bulunduğunu doğrular. Kod çalıştırma API'si tek dosyayı veya en fazla sekiz dosyalık bir listeyi kabul eder; farklı diller aynı istek içinde bağımsız runner işleri olarak çalışır, diller arasında süreç içi bellek/IPC paylaşılmaz.

## Hanogt Engine kapsamı

Hanogt Engine bu sürümde Unity'nin yerine geçtiği iddia edilmeyen, web tabanlı bir oyun editörü MVP'sidir. Sahne modeli nesne-bileşen yaklaşımını, 2D ve üç eksenli izometrik 3D önizlemeyi, Transform düzenlemeyi, basit rigid-body/AABB fiziğini ve C#/C++ kaynak yönetimini kapsar. C# ve C++ kodu tarayıcı sayfasında `eval` edilmez. Editördeki çalıştırma/test isteği, yalnız operatörün yapılandırdığı izole runner'a bağımsız bir iş gönderir; scriptlerin canlı sahne çalışma zamanına bağlanması ve yerel/mağaza çıktısı üretmek ayrı derleme araç zinciri gerektirir.

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

Next.js 16, React 19, TypeScript, Tailwind CSS 4, Monaco Editor, NextAuth 4, Firebase 12, WebRTC, Electron ve Capacitor.

## Lisans

[MIT](./LICENSE) — geliştirici: Oğuz Han Guluzade / HanStudios.
