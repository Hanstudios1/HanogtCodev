# Hanogt AI'ı eğitmek: veri havuzu v3, sürekli eğitim ve Qwen ince ayarı

Bu klasör Hanogt AI'ın kendi modelini üretir. Hat şöyle işler:

1. izinli kaynaklardan veri toplanır (Hanogt'un kendi bilgisi, GitHub, Hugging Face);
2. veri temizlenip tek bir **havuzda** karıştırılır;
3. model havuzdan seçilen **turlarla** eğitilir: her tur yeni veriyi, unutmamak için eskilerden bir tekrarı ve Hanogt'un kendi örneklerini içerir, bir önceki turun üzerine devam eder;
4. model sunulur ve Hanogt AI'a bağlanır.

**En kolay yol: Kaggle** (`kaggle/hanogt_train_kaggle.ipynb`, aşağıda "Sürekli eğitim"). Defter her çalıştırmada en güncel kodu ve kaynak kaydını GitHub'dan alır; kayda yeni bir veri seti eklendiğinde yalnızca o indirilir, havuz güncellenir ve sonraki turlar onu da öğrenir.

**Diller:** Türkçe, İngilizce, Almanca, Azerbaycanca ve Rusça (`lib/common.mjs` → `LANGS`). Bir turun yeni örnekleri dillere ağırlıkla dağıtılır: TR %32, EN %36, DE %11, AZ %10, RU %11.

**Konular** (aile, `FAMILIES`): sohbet ve talimat, düşünerek problem çözme, matematik, fen (fizik, kimya, biyoloji), genel kültür (tarih, coğrafya, din, toplum bilgisi), kod (birçok programlama dili), araç kullanan ajan görevleri (`tool-use`), savunma odaklı siber güvenlik, yanıtları puanlama ve sıralama (`judge`), Hanogt'un kendi bilgisi ve ajan işlemleri.

## Kurallar: hangi veri girer?

`training/sources.json` her kaynağı lisansı, kaynağı (provenance) ve durumuyla listeler. İçe aktarıcılar yalnızca bu kayda bakar.

- **Durumlar:**
  - **allowed:** alınır.
  - **review:** kartındaki üretim bilgisi okunup bu dosyaya yazılmadan alınmaz.
  - **excluded:** hiç alınmaz.
- **İzinli lisanslar:** MIT, Apache-2.0, BSD-2/3, CC0, CC BY 4.0, ODC-BY. CC BY ve ODC-BY atıf ister; `ATTRIBUTION.md` veriyle birlikte üretilir.
- **Alınmayan veri:**
  - ticari olmayan (NC) ya da paylaşımda aynı lisansı şart koşan (SA) lisanslar;
  - lisansı belirsiz veri;
  - kapalı modellerin (OpenAI, Anthropic, Google Gemini/Gemma, xAI, Cohere) ya da Llama modellerinin ürettiği veri. Bu modellerin yazdığı **sorular** da onların çıktısı sayılır; insanların yazdığı sorular sorun değildir;
  - üreticisi belirtilmeyen veri (kartı netleşene kadar `review`);
  - değerlendirme setleri (code-bench, HumanEval, GSM8K ve MATH test bölümleri, Aya test bölümü).
- **Karar bekleyen:** OpenAI'ın açık ağırlıklı `gpt-oss` modellerinin ürettiği veri (Apache-2.0) şimdilik `review`'dadır; sahibi karar verince açılır.
- **Claude ile eğitim verisi üretilmez.**

İzinli kaynaklar (kayıt v3; üst sınır her kaynağın havuza girebilecek en çok örneğidir):

| Konu | Kaynak | Dil | Lisans | Ne verir |
| --- | --- | --- | --- | --- |
| Hanogt | Hanogt'un kendi içeriği | TR, EN | — | Bilgi tabanı, SSS, kılavuz, ajan işlemleri, kavramlar, hata açıklamaları, çok turlu sohbet |
| Sohbet | Aya Dataset | TR, EN, DE, RU | Apache-2.0 | İnsan yazımı soru-yanıt (train bölümü) |
| Sohbet | OpenAssistant oasst2 | TR, EN, DE, RU | Apache-2.0 | İnsan yazımı sohbetler, her ağacın en iyi dalı |
| Sohbet | EagleSFT | RU | CC0 | İnsanların sorduğu okul ve üniversite soruları, Mistral-Small-3.1 yanıtları |
| Talimat | turkish-reasoning-distilled-sft (`ifeval_verified`) | TR | Apache-2.0 | Doğrulanabilir kısıtlı Türkçe talimatlar, düşünmeli yanıtlar |
| Matematik | GSM8K (train) | EN | MIT | İnsan yazımı adım adım çözümler |
| Matematik | turkish-reasoning-distilled-sft (`dapo_math`) | TR | Apache-2.0 | Yarışma matematiği; yalnızca referansla eşleşen çözümler |
| Matematik | ReasonXL, Almanca | DE | Apache-2.0 | OpenMathReasoning problemlerine DeepSeek-R1 çözümlerinin Qwen3-32B çevirisi; döngüye giren çeviriler atılır |
| Matematik | Gromov-Max | RU | Apache-2.0 | İki bağımsız yanıtı aynı çıkan çözümler |
| Matematik | mathematics_dataset (RU) | RU | Apache-2.0 | Kural tabanlı üretici; yalnızca eğitim kategorileri |
| Matematik | OpenR1-Math-220k | EN | Apache-2.0 | Math-Verify'ın doğruladığı en kısa DeepSeek-R1 izi |
| Matematik | OpenMathReasoning | EN | CC BY 4.0 | AoPS problemleri, beklenen yanıta ulaşan R1/QwQ çözümleri |
| Matematik | Nemotron Post-Training v1 (`math`) | EN | CC BY 4.0 | DeepSeek-R1-0528 çözümleri, problem başına bir |
| Matematik | MATH (train) | EN | MIT | İnsan yazımı yarışma çözümleri |
| Fen | OpenScience (`OS-Q3-235B-4`, `OS-Q2.5-32B-4`) | EN | CC BY 4.0 | Qwen3-235B ve Qwen2.5-32B'nin yazdığı fen soruları, DeepSeek-R1'in düşünmeli yanıtları |
| Fen | QASC (train) | EN | CC BY 4.0 | İki bilgiyi birleştirerek yanıtlanan fen soruları (insan yazımı) |
| Genel kültür | Cosmopedia (OpenStax, Stanford, Khan Academy) | EN | Apache-2.0 | Tarih, toplum, ekonomi, felsefe ve fen ders metinleri (Mixtral-8x7B) |
| Kod | Exercism (61 dil izi) | — | MIT | Alıştırma ve örnek çözüm; Python ve JS çözümleri testleriyle çalıştırılır |
| Kod | TheAlgorithms/Python | — | MIT | Doctest'leri geçen algoritmalar |
| Kod | self-oss-instruct-sc2 | EN | ODC-BY | Çalıştırılarak elenmiş Python |
| Kod | OpenCodeInstruct | EN | CC BY 4.0 | Qwen2.5-Coder ile üretilmiş, testten ≥ 0,9 almış kod |
| Kod | Nemotron Post-Training v1 (`code`) | EN | CC BY 4.0 | DeepSeek-R1-0528 çözümleri, problem başına bir |
| Kod | CodeForces-CoTs | EN | CC BY 4.0 | Python ve C++ yarışma çözümleri (temizlenmiş bölümler) |
| Kod | SQaLe | EN | MIT | Gerçek şemalarda SQL, çalıştırılarak doğrulanmış |
| Kod | Bash Instruct III | EN | MIT | Linux'ta çalıştırılarak doğrulanmış Bash |
| Düşünme | OpenThoughts-114k | EN | Apache-2.0 | Matematik ve kod için DeepSeek-R1 izleri (fen ve bulmaca kısmı çıkarıldı) |
| Ajan / araç kullanma | Nemotron-Agentic-v1 (`tool_calling`) | EN | CC BY 4.0 | Araç tanımları, araç çağrıları ve sonuçlarıyla çok turlu görevler (Qwen3-235B-2507) |
| Ajan / araç kullanma | Nemotron Post-Training v1 (`tool_calling`) | EN | CC BY 4.0 | Tek ve çok adımlı araç çağırma (DeepSeek-R1-0528, Qwen3-235B) |
| Kod | OpenCodeReasoning (`split_0`) | EN | CC BY 4.0 | Yarışma sorularına DeepSeek-R1 çözümleri, soru başına bir |
| Siber güvenlik | CVE→CWE Consensus | EN | CC BY 4.0 | NVD ile CNA'nın uzlaştığı zayıflık (CWE) etiketleri |
| Siber güvenlik | CIRCL vulnerability-scores | EN, TR | CC BY 4.0 | Açıklamadan önem derecesi (CVSS) tahmini |
| Puanlama | HelpSteer2 | EN, TR | CC BY 4.0 | İnsan puanları: yardımseverlik, doğruluk, tutarlılık, karmaşıklık, ayrıntı |
| Sıralama | HelpSteer3 (`preference`) | EN (DE/RU bağlamlar dahil) | CC BY 4.0 | İki yanıt arasında insan tercihi ve gerekçesi |

- **İncelemede (review):** T-Wix (RU), GrandMaster-Qwen3 (RU), resh.edu.ru dersleri (RU, dönüştürücü bekliyor), SYNTHETIC-1, Dolci-Think, Nemotron v2 (kapılı), gpt-oss ile üretilmiş setler, Türkçe ve Azerbaycanca bilgi setleri (üretici belirtilmemiş), Arena tercihleri, Türkçe Atlas, smoltalk2. Her birinin eksiği `sources.json`'da yazılıdır.
- **Dışlananlar:** gerekçeleriyle kayıtta (`excluded`); örneğin OpenThoughts3 (Llama/Gemini/GPT kaynaklı sorular), WildChat (GPT yanıtları), MetaMathQA, Magicoder, UltraFeedback, InstrucTurca (SA), Aya Collection çevirileri (NC çeviri modeli), Wikipedia (SA).
- **Azerbaycanca:** kuralların tümünü geçen bir veri seti bulunamadı (Aya'da da yok). Şimdilik model Azerbaycancayı Türkçe ve kendi bilgisinden öğrenir; sonraki adım izinli Türkçe/İngilizce verinin açık bir modelle çevrilmesi.
- **Görsel:** varsayılan taban Qwen3.5-4B görsel ve video anlar; eğitim yalnızca metinle yapılır ve görme kısmına dokunmaz. Yedek Qwen3-8B ise yalnızca metin anlar.

## Sürekli eğitim (Kaggle)

`kaggle/hanogt_train_kaggle.ipynb` yalnızca bir başlatıcıdır: depoyu GitHub'dan klonlar ve `kaggle_run.py`'yi çalıştırır.

**Taban model:** varsayılan **Qwen3.5-4B** (Apache-2.0; metin, görsel ve video anlar). Defterdeki `BASE_MODEL` ile değişir:
- `Qwen/Qwen3.5-9B`: daha büyük (güncel endekste 4B'den yüksek değil); T4'lerde iki GPU'ya bölünerek, daha yavaş eğitilir.
- `Qwen/Qwen3.8-27B`: en güçlüsü; ücretli 80 GB GPU ister, Kaggle'da olmaz.

İlk turdan önce çalıştırıcı modeli birkaç adımlık bir denemeyle sınar ve en hızlı yolu seçer:
1. her GPU'da bir kopya (16-bit LoRA);
2. olmazsa model iki GPU'ya bölünür;
3. o da olmazsa 4-bit QLoRA.

Hızlı Gated DeltaNet çekirdekleri (`flash-linear-attention`) çalışmazsa onlarsız yeniden denenir. Hiçbiri olmazsa eğitim Qwen3-8B ile sürer. Her tabanın kendi model deposu vardır (`HanStudios/hanogt-ai-<taban>-lora`), çünkü bağdaştırıcılar tabanlar arasında taşınmaz.

Her çalıştırma sırasıyla şunları yapar:

1. **Veri** (`kaggle_run.py` → `prepare_data`):
   - GitHub kaynakları, kayıttaki girdileri ya da içe aktarıcı değiştiyse yeniden alınır.
   - Hugging Face'ten yalnızca kayıt girdisi değişen, yeni eklenen ya da geçen sefer hata veren kaynaklar indirilir (`import_hf.py --only …`); kayıttan çıkan kaynak havuzdan da çıkar.
   - Havuz (`mix.mjs`), içe aktarımlardan biri, sitenin bilgisi ya da karıştırma kodu değiştiyse yeniden kurulur. Eğitim bağlamına sığmayan örnekler (`--max-seq-len` × 3,2 karakterden uzun) havuza hiç girmez.
   - İçe aktarımlar (`raw/`) ve havuz (`pool/`) özel veri deposuna (`HanStudios/hanogt-sft-pool`) yüklenir.
   - GPU'suz çalıştırma bu adımda biter: veri, GPU kotası harcanmadan hazırlanır.
2. **Eğitim** (GPU varsa, `train`):
   - Yarım kalan tur varsa son ara kayıttan sürer (`--resume-from-hub`).
   - Yoksa sıradaki tur seçilir (`select_round.py`). Tur, şu üç kısımdan oluşur:
     - henüz öğrenilmemiş örnekler: dillere ve konulara dengeli dağılır, her kaynaktan sırayla alınır;
     - %15 tekrar: daha önce öğrenilmiş örneklerden;
     - %15 Hanogt'un kendi örnekleri.
   - Tur bir önceki turun bağdaştırıcısından başlar (`--init-adapter`). Öğrenme oranı ilk turda 1e-4, sonraki turlarda 5e-5'tir. Oran düşük tutulur, çünkü taban model zaten güçlüdür ve bu yeteneği bozmamak gerekir.
   - Oturumun süresi bitene kadar turlar arka arkaya çalışır.
   - Durum özel model deposunda tutulur:
     - `state/rounds.json`: biten turlar, ölçümleri ve süren tur;
     - `state/seen.txt.gz`: öğrenilen örnekler;
     - bağdaştırıcı deponun kökünde, her turun kopyası `rounds/round-00N/` altında.
   - Havuzda yeni örnek kalmadıysa eğitim durur ve bunu yazar; kayda yeni kaynak eklenince yeni turlar başlar.

**Bir tur ne kadar sürer?** Varsayılan tur 20.000 örnektir. v3'te düşünmeli örnekler uzun olduğundan örnek başına kabaca 1.000–1.500 token düşer, yani tur 20–30 milyon token eder. 2× T4'te bu kabaca 10–20 saattir; tur birden çok oturuma bölünür ve her oturum son ara kayıttan sürer. Kaggle haftada ~30 saat GPU verir: haftada yaklaşık bir-iki tur. Gerçek süre ilk turun kaydında (`state/rounds.json`) görünür.

**Artificial Analysis puanı:** Artificial Analysis yalnızca herkese açık modelleri ölçer; özel ince ayarlı modelimizin resmi puanı olmaz. Bu yüzden puanı belirleyen asıl şey taban modeldir:
- **Endeksin içeriği:** endeksin üçte biri ajan görevleri (araç kullanma, terminal), kalanı kodlama, ileri bilim ve uzun bağlamdır. Sohbet verisiyle yapılan ince ayar bunları az kımıldatır.
- **Taban modellerin puanları** (endeks sürüm sürüm zorlaşır; aynı güncel ölçekte karşılaştırma):
  - Qwen3-8B: 7.
  - Qwen3.5-4B: 13; Qwen3.5-9B: 11. Çıktıklarında kullanılan ölçekte 27 ve 32 almışlardı.
  - Qwen3.6-27B: 37; Qwen3.8-27B: 43–52 (düşünme düzeyine göre). Güncel ölçekte 25'i geçen açık modeller bu sınıftadır; ücretli 80 GB GPU ister (`--preset 27b`).
- **Eğitimin hedefi:** taban yeteneği korumak, Türkçe ve site bilgisini eklemek. Araç kullanma verisi (Nemotron-Agentic) ajan kategorisine yöneliktir.

**Yeni veri seti eklemek:**
1. `sources.json`'a bir girdi eklenir: lisans, üretim kaynağı (`provenance`), atıf, üst sınır (`cap`) ve nasıl okunacağı (`hf` bloğu).
2. `hf` bloğu dönüştürücüyü, alanları, filtreleri ve dili belirtir; ayrıntılar `import_hf.py`'nin başında. Çoğu veri seti için kod yazmak gerekmez.
3. Testler çalıştırılır, değişiklik `main`'e gönderilir.
4. Kaggle'da bir sonraki çalıştırma yeni kaynağı indirir ve öğrenir.

## 1. GitHub kaynakları

```bash
pip install pytest   # Python alıştırmalarının testleri için
node training/import-github.mjs                      # hepsi (~1 dk)
node training/import-github.mjs --only exercism-python,gsm8k-train
```

- **Klonlama:** depolar `training/cache/github` altına sığ klonlanır. Lisans dosyası kayıttaki lisansla eşleşmezse kaynak alınmaz.
- **Doğrulama:**
  - Python ve JavaScript örnek çözümleri, alıştırmanın kendi testleriyle burada çalıştırılır. Jest yerine küçük bir uyumlu katman kullanılır: `lib/jest-lite.mjs`.
  - Testten geçemeyen çözüm alınmaz.
  - Diğer dillerin çözümleri Exercism'in kendi CI'ı tarafından doğrulanmıştır.
- **Çıktılar** (`training/data/github/`):
  - kaynak başına `<kaynak>.jsonl`;
  - `manifest.json`: commit, lisans, sayılar, doğrulama;
  - `fingerprints.json`: değerlendirme setleri.

## 2. Hugging Face kaynakları

Bu konteyner `huggingface.co`'ya ulaşamıyorsa önce ortam ayarlarından ağ izni (`huggingface.co`, `*.huggingface.co`, `hf.co`, `*.hf.co`) ve `HF_TOKEN` eklenmeli.

```bash
pip install datasets huggingface_hub
HF_TOKEN=... python3 training/import_hf.py                    # yalnızca "allowed"
HF_TOKEN=... python3 training/import_hf.py --include-review   # kartı okunup kayda yazıldıktan sonra
python3 -m unittest discover -s training/tests               # dönüştürücüler, ağ gerekmez
```

- **Kayıt nasıl okunur:** her kaynağın `hf` bloğu yapılandırmayı, bölümü, satır süzgeçlerini (`where`), dili ve dönüştürücüyü söyler; yeni bir veri seti çoğu zaman kod gerektirmez, yalnızca kayıt girdisi ister.
- **Dönüştürücüler:**
  - `messages`, `fields`: hazır sohbetler ve soru/yanıt sütunları (düşünme sütunu `reasoning_content` olur);
  - `template`: satırı dile göre şablonla soruya ve yanıta çevirir (SQL, QASC, Rusça matematik);
  - `verified-generation`: birden çok üretilmiş yanıttan doğrulamaların hepsini geçen en kısasını seçer (OpenR1-Math);
  - `cvss`: güvenlik açığı açıklamasından önem derecesi sorusu (TR/EN);
  - `helpsteer`, `helpsteer3`: insan puanları ve iki yanıt arasındaki tercih;
  - `aya`, `oasst` ve eski kaynakların kendi dönüştürücüleri.
- **Seçenekler:** `configs` (sırayla okunan yapılandırmalar, üst sınır paylaşılır), `uniqueBy` (problem başına bir örnek), `dropSystem`, `wrapAnswer`, `minUserChars`, `maxChars` (eğitim bağlamına sığmayanlar alınmaz), `format` + `dataFiles` (yükleme betiği olan depolarda dosyayı doğrudan okur).
- **Döngü süzgeci:** aynı kelimeyi otuz kez üst üste yazan ya da döngü gibi sıkışan yanıtlar her kaynakta atılır (çeviride takılan izler gibi).
- **Okuma sırası:** veri setinin dosyaları tohumlu bir sırayla okunur; üst sınırlı bir kaynak böylece tek bir dosyadan değil, tüm veri setinden örnek alır.
- **Çıktılar:** `training/data/hf/<kaynak>.jsonl` ve `manifest.json` (satır sayısı, revizyon).

## 3. Karıştır

```bash
node training/mix.mjs
```

**Girdiler:** sitenin kendi örnekleri, GitHub ve HF.

**Her örnekte yapılanlar:**
1. Düşünme metni (`<think>`, `<|begin_of_thought|>`) son asistan mesajının `reasoning_content` alanına taşınır. Qwen3'ün sohbet şablonu onu `<think>` bloğu olarak yazar.
2. Dil denetlenir; yalnızca Türkçe ve İngilizce kalır.
3. Dışarıdan gelen veride şunlar atılır:
   - kişisel veri: e-posta, telefon, IBAN, TC kimlik numarası (sağlama haneli), kart numarası;
   - başka bir modelin kimliğini iddia eden yanıtlar;
   - "Üzgünüm, yapamam" ile başlayan aşırı retler.
4. Uzunluk sınırı uygulanır.
5. Değerlendirme setleriyle örtüşen örnekler atılır.
6. Tekrarlar atılır: birebir aynı olanlar her kaynakta; neredeyse aynı yanıtlar (MinHash, ≥ %90) yalnızca dışarıdan gelen veride.
7. Kaynak başına üst sınır uygulanır.

**Bölme ve sistem istemi:**
- Dışarıdan gelen örneklerin yarısına kısa bir "Sen Hanogt AI'sın" sistem istemi eklenir.
- Bölme gruba göredir: bir alıştırmanın bütün dilleri aynı tarafta kalır.

**Çıktılar** (`training/data/v2/`):
- `train.jsonl` ve `eval.jsonl`;
- `manifest.json`;
- `ATTRIBUTION.md`;
- `README.md` (veri seti kartı);
- depoya giren rapor: `ai/reports/finetune-dataset-v2.md`.

## 4. Eğit

Üç model önayarı vardır:
- **`--preset 4b`:** Qwen3.5-4B; Kaggle'da varsayılan. Görsel de anlar; 16-bit LoRA ile T4'e sığar.
- **`--preset small`:** Qwen3-8B; Qwen3.5 bir GPU'da eğitilemezse yedek.
- **`--preset 27b`:** Qwen3.8-27B; en güçlüsü, 16-bit LoRA için 80 GB GPU ister (ücretli).

Hepsi Apache-2.0 lisanslıdır; türetilmiş modeli ticari olarak kullanabilirsin.

- **Qwen3.5 ailesi** (Qwen3.5, 3.6, 3.8) 16-bit LoRA ile eğitilir: 4-bit QLoRA bu mimarinin çıktısını alışılmıştan çok kaydırır (`--force-4bit` ile yine de seçilebilir).
- **Kayıp yalnızca öğrenilen yanıt token'larında hesaplanır:** 248 bin kelimelik sözlüğün logit'leri istemin tamamı için üretilmez; 16 GB'lık bir GPU'ya sığmanın farkı budur.

**Hugging Face Jobs** (PRO hesap ya da Team/Enterprise organizasyon ve kredi gerekir):

```bash
HF_TOKEN=... python3 training/hf_job.py upload --dataset-repo HanStudios/hanogt-sft-v2
python3 training/hf_job.py plan --preset small --flavor a100-large     # süre ve maliyet tahmini
HF_TOKEN=... python3 training/hf_job.py launch --dataset-repo HanStudios/hanogt-sft-v2 \
  --model-repo HanStudios/hanogt-ai-qwen3-8b-lora --preset small --flavor a100-large --confirm
```

`launch`, `--confirm` olmadan hiçbir şey başlatmaz, yalnızca planı yazar; çünkü GPU süresi dakikayla ücretlendirilir.

**Google Colab:** `training/colab/hanogt_train.ipynb`. GPU çalışma zamanını seç, Gizli anahtarlar'a `HF_TOKEN` ekle ve hücreleri sırayla çalıştır.

**Kaggle (ücretsiz):** `training/kaggle/hanogt_train_kaggle.ipynb`. Veri hazırlığını ve tur tur eğitimi kendisi yapar; ayrıntılar yukarıda, "Sürekli eğitim (Kaggle)" bölümünde.
- **Ne verir:** haftada yaklaşık 30 saat GPU (2× T4). Bir oturum en fazla 12 saat sürer.
- **Hazırlık:**
  1. Telefon doğrulaması yap.
  2. *Session options* panelinde *Internet: On* seç.
  3. *Add-ons → Secrets* altına `HF_TOKEN` (Write) ekle.
- **Çalıştırma:**
  - İlk sefer *Accelerator: None* ile *Save & Run All*: veri hazırlanır.
  - Sonra *GPU T4 x2* ile *Save & Run All*: eğitim başlar.
- **Kesintiye dayanıklıdır:**
  - Her ara kayıt model deposunun `last-checkpoint` klasörüne yüklenir.
  - Oturum süresine göre kendisi durur.
  - Sonraki çalıştırma aynı turu kaldığı yerden sürdürür.

**Kendi GPU'n ya da RunPod / Lambda / vast.ai:**

```bash
pip install -r training/requirements.txt
python training/train_lora.py --preset small --dry-run                  # yalnızca token sayıları
python training/train_lora.py --preset small --epochs 1 --push-to-hub HanStudios/hanogt-ai-qwen3-8b-lora
```

- Yalnızca asistanın yazdıkları öğrenilir.
- Düşünmeli örneklerde `<think>` bloğu da öğrenilir; düşünmesizlerde boş blok öğrenilmez.
- `--max-seq-len` (8192) üstündeki örnekler kesilmez, dışarıda bırakılır.

Kaba maliyet: tam set ~140 bin örnek ve ~170 milyon token olduğunda Qwen3-8B'nin bir epoch'u A100'de yaklaşık 13 saat (~35 $) ya da H100'de ~5 saat sürer. Kesin tahmini `hf_job.py plan` güncel manifest'ten hesaplar.

## 5. Birleştir ve dışa aktar

```bash
python training/merge_and_export.py --adapter training/output/hanogt-qwen3.5-4b/adapter
python training/merge_and_export.py --adapter … --llama-cpp ~/llama.cpp --gguf-type q8_0 --quantize Q4_K_M
```

Kaggle'da eğitilen bağdaştırıcı `HanStudios/hanogt-ai-qwen3.5-4b-lora` deposundadır (yedek tabanla eğitildiyse `…-qwen3-8b-lora`).

Birleştirme modelin iki katı kadar RAM ister; GPU şart değildir. `--llama-cpp` ile GGUF dosyası ve Ollama `Modelfile`'ı da yazılır.

## 6. Sun

vLLM (OpenAI uyumlu). Düşünmeyi ayrı alanda (`reasoning_content`) döndürmek için düşünme ayrıştırıcısını aç:

```bash
vllm serve training/output/hanogt-qwen3.5-4b/merged --served-model-name hanogt-ai \
  --max-model-len 32768 --reasoning-parser qwen3 --enable-auto-tool-choice --tool-call-parser qwen3_coder \
  --api-key GUCLU_BIR_ANAHTAR
# ya da birleştirmeden (bağdaştırıcı doğrudan Hugging Face'ten):
vllm serve Qwen/Qwen3.5-4B --enable-lora --max-lora-rank 16 --lora-modules hanogt-ai=HanStudios/hanogt-ai-qwen3.5-4b-lora --reasoning-parser qwen3
```

Qwen3.5 araç çağrılarını XML biçiminde yazar (`<tool_call><function=…>`), bu yüzden `qwen3_coder` ayrıştırıcısı kullanılır. Yedek Qwen3-8B JSON biçimi kullanır; onunla `--tool-call-parser hermes` seçilir.

Hugging Face'te barındırmak için iki yol var:
- **Inference Endpoints:** modeli özel bir uç noktada açar (saatlik ücret).
- **Inference Providers (`https://router.huggingface.co/v1`):** desteklenen açık modellerle çalışır; sağlayıcıyı model adında sabitle, ör. `Qwen/Qwen3-32B:cerebras`.

## 7. Hanogt AI'a bağla

Vercel → Settings → Environment Variables. Bunlar gizli değerlerdir; hiçbiri `NEXT_PUBLIC_` ile başlamaz.

| Değişken | Değer |
| --- | --- |
| `HANOGT_AI_BASE_URL` | `https://sunucun.ornek/v1` (https zorunlu) |
| `HANOGT_AI_API_KEY` | Sunucunun anahtarı (HF için "Make calls to Inference Providers" izinli token) |
| `HANOGT_AI_MODEL` | `hanogt-ai` (ya da HF'teki model kimliği) |
| `HANOGT_AI_EXTRA_BODY` | İsteğe bağlı, ör. `{"chat_template_kwargs":{"enable_thinking":true}}` |

## 8. Ölç

```bash
node scripts/ai-eval/code-bench.mjs --engine openai --base-url https://sunucun.ornek/v1 \
  --model hanogt-ai --api-key-env HANOGT_AI_API_KEY
node scripts/ai-eval/code-bench.mjs --compare   # → ai/reports/code-bench.md
```

Temel modeli ve ince ayarlı modeli aynı komutla, düşünme açık ve kapalı olarak karşılaştır. Ayrıca `hanogt-training.json`'daki değerlendirme kaybına bak.

## Burada doğrulananlar

- **Birim testleri:** veri hattının bütün parçaları test edilir (`scripts/tests/training-pipeline.test.mjs`, `training-dataset.test.mjs`, `training/tests/test_import_hf.py`): dil, kişisel veri, kimlik ve ret filtreleri, düşünmenin taşınması, tekrarlar, değerlendirme seti örtüşmesi, kaynak üst sınırları, gruba göre bölme, lisans kaydı, Jest katmanı, HF dönüştürücüleri.
- **Çalıştırma:** GitHub içe aktarımı ve karışım burada çalıştırıldı (sayılar raporda).
- **CPU'da denenen:** `train_lora.py` ve `merge_and_export.py` küçük, rastgele ağırlıklı modellerle CPU'da baştan sona denenmişti (9b).
- **Yapılmayanlar:**
  - Bu ortamda GPU yok; gerçek eğitim HF Jobs, Colab ya da kendi GPU'nda yapılır.
  - `hf_job.py`'nin gerçek iş başlatması burada denenemedi (HF erişimi yok). İlk çalıştırmada `plan` ve kısa bir `--max-steps 20` denemesiyle başla.

## Dosyalar

| Dosya | Görevi |
| --- | --- |
| `sources.json` | Kaynak kaydı: lisans, durum, kaynak, üst sınır, atıf |
| `import-github.mjs` | Exercism, TheAlgorithms, GSM8K ve değerlendirme parmak izleri |
| `import_hf.py` | Hugging Face veri setleri |
| `build-dataset.mjs` | Sitenin kendi örnekleri (üretimdeki sistem istemiyle) |
| `mix.mjs` | Temizleme, tekrar ayıklama, karışım, bölme, rapor |
| `lib/common.mjs` | Ortak şema ve filtreler |
| `lib/jest-lite.mjs`, `lib/thealgorithms.py` | Doğrulama yardımcıları |
| `train_lora.py` | LoRA / QLoRA eğitimi, `--push-to-hub`, `--init-adapter` (önceki turdan devam), `--status-file` |
| `select_round.py` | Sıradaki turun örnekleri: yeni veri (dil ve konuya göre dengeli), tekrar ve Hanogt'un kendi örnekleri |
| `kaggle_run.py`, `kaggle/hanogt_train_kaggle.ipynb` | Kaggle'da veri hazırlığı ve tur tur sürekli eğitim |
| `hf_job.py`, `colab/hanogt_train.ipynb` | Hugging Face Jobs ve Colab |
| `merge_and_export.py` | Birleştirme, GGUF, Ollama |
