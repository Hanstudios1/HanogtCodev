# Hanogt AI'ı Qwen ile ince ayarlama (fine-tuning)

Bu klasör, Hanogt AI'ın standart motoru için kendi modelini eğitmene yarar:
veri setini depodan üretir, bir Qwen modelini LoRA/QLoRA ile eğitir, sonucu
birleştirip dışa aktarır. Eğitim GPU ister; bu yüzden adımları sen kendi
GPU'nda ya da kiralık bir bulut GPU'sunda çalıştırırsın.

## Önce: "Qwen 2.7" adında bir model yok

Qwen ailesinde 2.7 sürümü yayımlanmadı. Düzenek modeli parametre olarak
alır; iki hazır ayar var:

| Ayar | Model | Lisans | Açıklama |
| --- | --- | --- | --- |
| `--preset 27b` (varsayılan) | `Qwen/Qwen3.6-27B` (Nisan 2026) | Apache-2.0 | 27 milyar parametre, metin + görsel, Gated DeltaNet + dikkat (attention) katmanlarından oluşan karma mimari, 262K bağlam |
| `--preset small` | `Qwen/Qwen3-8B` | Apache-2.0 | 8 milyar parametre, yalnızca metin; ucuz ve hızlı deneme için |

Başka bir model istersen `--base-model` ile ver (ChatML şablonlu bir Qwen
modeli, ör. `Qwen/Qwen2.5-7B-Instruct`). Şablonu ChatML olmayan modellerde
`--assistant-start` / `--assistant-end` ile asistan sırasının işaretlerini
belirtmen gerekir.

## Ne beklemelisin?

- **Öğrettikleri:** Hanogt'un sayfaları ve özellikleri, SSS ve kılavuz;
  ajan araçlarının doğru kullanımı (onay kartı, reddedilen işlemi asla
  yapılmış saymamak, Ajan modu kapalıyken yolu anlatmak); Hanogt AI
  Çekirdeği'nin programlama kavramları, çalıştırılarak denetlenen kod
  örnekleri ve hata açıklamaları; Türkçe ve İngilizce yanıt üslubu.
- **Öğretmedikleri:** Yaklaşık 2.000 örnekle bir modelin genel kod becerisi
  Claude seviyesine çıkmaz. Kod sorularında en iyi sonuç için **gelişmiş kod
  motoru** (sunucuda `ANTHROPIC_API_KEY`) açık kalmalı. İnce ayarlı model
  standart motorun yerine geçer: genel ve site soruları, ajan işlemleri,
  daha düşük maliyet ve verinin kendi sunucunda kalması.
- **Ölçmeden karar verme:** 7. adımdaki code-bench'i hem temel modelle hem
  ince ayarlı modelle çalıştır.

## 1. Veri setini üret

```bash
node training/build-dataset.mjs
```

Çıktı `training/data/` klasörüne yazılır (depoya girmez): `train.jsonl`,
`eval.jsonl` ve `stats.json`. Yaklaşık 2.100 örnek ve 3 milyon token olur;
tokenların çoğu, üretimde gönderilen sistem istemidir. Node 22.18 ya da daha
yenisi gerekir (birim testleri gibi).

Kaynaklar:

- bilgi tabanı, SSS ve kılavuz sayfaları; yanıtlar, sohbet rotasının sistem
  istemine eklediği bilgi notlarıyla birlikte üretilir;
- `ai/dataset/intents.json`'daki gerçek kullanıcı ifadeleri (yalnızca soru,
  bilgi tabanında gerçekten o konuya denk geliyorsa);
- programlama kavramları, kod örnekleri, programlar ve hata açıklamaları;
- ajan işlemleri: sitenin kendi araç şemalarıyla araç çağrısı, tarayıcının
  döndürdüğü sonuç ve son yanıt (reddedilen işlemler ve Ajan modu kapalıyken
  verilen yanıtlar dahil);
- Hanogt AI'ın kimse için yapmadığı işlemlerin (silme, parola, iki adımlı
  doğrulama, yönetici yetkisi, başkası adına mesaj) nazikçe reddi.

Kullanıcı verisi yoktur; her şey bu depodan gelir. code-bench görevleri
(`scripts/ai-eval/bench-tasks.mjs`) veri setine girmez, böylece ölçüm dürüst
kalır. Birim testi (`scripts/tests/training-dataset.test.mjs`) biçimi, araç
çağrılarını, sızıntıyı, gizli anahtar ve e-posta olmadığını denetler.

## 2. GPU ortamını hazırla

| | 27B, QLoRA (4-bit) | 8B, QLoRA (4-bit) |
| --- | --- | --- |
| GPU | 1× 80 GB (H100 ya da A100 80 GB) | 1× 24 GB (RTX 4090, L4, A10) |
| İndirme | ≈ 55 GB | ≈ 16 GB |
| Süre (2 epoch) | kabaca 2–4 saat | kabaca 1 saat |
| Bulut maliyeti | kabaca 10–25 $ | kabaca 1–5 $ |

Süre ve maliyet; sağlayıcıya, GPU'ya, dizi uzunluğuna ve hızlı çekirdeklerin
kurulu olup olmamasına göre değişir. Bunları yalnızca kaba tahmin olarak al.

RunPod, Lambda ya da vast.ai'de hazır bir PyTorch imajıyla:

```bash
git clone https://github.com/Hanstudios1/HanogtCodev.git && cd HanogtCodev
pip install -r training/requirements.txt
# Qwen3.6 için isteğe bağlı ama çok daha hızlı (CUDA):
pip install flash-linear-attention causal-conv1d
```

Google Colab'da 8B modeli L4 ile eğitebilirsin; 27B model için A100 80 GB
gerekir. Veri setini kendi bilgisayarında üretip `training/data/` klasörünü
yükleyebilir ya da Node'u orada kurabilirsin.

## 3. Eğit

```bash
python training/train_lora.py --preset 27b --dry-run   # yalnızca token sayıları, GPU gerekmez
python training/train_lora.py --preset 27b
python training/train_lora.py --preset small --epochs 3
```

- Yalnızca asistanın yazdıkları öğrenilir; sistem istemi, kullanıcı ve araç
  sonuçları bağlamdır.
- Sohbet şablonu düşünmesiz modda işlenir (Hanogt yanıtları böyle). Düşünme
  modunda eğitmek için `--enable-thinking` ekle.
- Qwen3.6 görsel-dil modelidir: LoRA yalnızca dil katmanlarına uygulanır
  (dikkat, Gated DeltaNet ve MLP izdüşümleri); görsel kule olduğu gibi kalır.
  Daha az bellek için `--text-only` ile yalnızca dil modelini yükleyebilirsin.
- Önemli ayarlar: `--lr`, `--epochs`, `--lora-r` (16), `--lora-alpha` (32),
  `--max-seq-len` (8192; daha uzun örnekler kesilmez, dışarıda bırakılır),
  `--grad-accum`, `--no-4bit` (bellek yetiyorsa bf16 LoRA), `--resume`.

Çıktı: `training/output/hanogt-qwen3.6-27b/adapter/` (LoRA ağırlıkları ve
ayarlarla ölçümleri içeren `hanogt-training.json`).

Yönetilen ince ayar servisleri (ör. Together AI) de `messages` biçimindeki
JSONL dosyalarını kabul eder. Seçtiğin modelin listede olup olmadığını ve
araç çağrısı (`tools`) desteğini servisin belgelerinden kontrol et.

## 4. Birleştir ve dışa aktar

```bash
python training/merge_and_export.py --adapter training/output/hanogt-qwen3.6-27b/adapter
# GGUF (llama.cpp / Ollama) ve 4-bit nicemleme için:
python training/merge_and_export.py --adapter training/output/hanogt-qwen3.6-27b/adapter \
  --llama-cpp ~/llama.cpp --gguf-type q8_0 --quantize Q4_K_M
```

Birleştirme temel modeli bf16 yükler; kayıpsız birleştirme için modelin
iki katı kadar RAM gerekir (27B için ≈ 60 GB; GPU şart değildir). Sonuç
`merged/` klasörüne yazılır; `--llama-cpp` verirsen GGUF dosyası ve bir
Ollama `Modelfile` da oluşur. GGUF dönüşümü, kullandığın llama.cpp
sürümünün bu mimariyi desteklemesine bağlıdır.

## 5. Sun (serve)

vLLM ile (OpenAI uyumlu):

```bash
vllm serve training/output/hanogt-qwen3.6-27b/merged \
  --served-model-name hanogt-ai --max-model-len 32768 --api-key GUCLU_BIR_ANAHTAR
```

Ajan araçlarının çalışması için vLLM'in araç çağrısı ayrıştırıcısı gerekir.
Qwen3 modelleri için genellikle `--enable-auto-tool-choice --tool-call-parser hermes`
eklenir; Qwen3.6 için modelin Hugging Face kartındaki güncel vLLM komutunu
(araç ve düşünme ayrıştırıcısı bayraklarıyla) kullan.

Birleştirmeden, LoRA ağırlıklarıyla da sunabilirsin:

```bash
vllm serve Qwen/Qwen3.6-27B --enable-lora --max-lora-rank 16 \
  --lora-modules hanogt-ai=training/output/hanogt-qwen3.6-27b/adapter
```

Ollama ile: `cd training/output/hanogt-qwen3.6-27b/merged && ollama create hanogt-ai -f Modelfile`.

## 6. Hanogt AI'a bağla

Vercel → Settings → Environment Variables (gizli değerler; hiçbiri
`NEXT_PUBLIC_` ile başlamaz):

| Değişken | Değer |
| --- | --- |
| `HANOGT_AI_BASE_URL` | `https://sunucun.ornek/v1` (https zorunlu; düz http yalnızca aynı makinede) |
| `HANOGT_AI_API_KEY` | vLLM'e `--api-key` ile verdiğin anahtar |
| `HANOGT_AI_MODEL` | `hanogt-ai` |
| `HANOGT_AI_EXTRA_BODY` | `{"chat_template_kwargs":{"enable_thinking":false}}`: Qwen'in düşünme modunu kapatır; yanıtlar daha hızlı gelir ve eğitimdeki biçimde olur |

Sunucunu anahtarsız bırakma. Kod ve güvenlik soruları, `ANTHROPIC_API_KEY`
tanımlıysa yine gelişmiş kod motoruna gider; kendi modelin diğer her şeyi
yanıtlar.

## 7. Ölç

```bash
# İnce ayarlı model
node scripts/ai-eval/code-bench.mjs --engine openai --base-url https://sunucun.ornek/v1 \
  --model hanogt-ai --api-key-env HANOGT_AI_API_KEY
# Karşılaştırma: aynı komutu temel modelle (ayrı sunulmuş) çalıştır, sonra
node scripts/ai-eval/code-bench.mjs --compare   # → ai/reports/code-bench.md
```

Ayrıca `hanogt-training.json`'daki değerlendirme kaybına bak ve sitede birkaç
soru ile ajan işlemi dene (grup kur, sayfa aç, profilimi özetle; bir işlemi
reddet ve modelin bunu yapılmış saymadığını gör).

## Burada doğrulananlar

- Veri seti üretimi ve şeması birim testleriyle denetlenir.
- `train_lora.py` ve `merge_and_export.py`, aynı mimarilerdeki küçük, rastgele
  ağırlıklı modellerle (Qwen3 ile, görsel kulesi ve Gated DeltaNet katmanları
  olan Qwen3.5/3.6) CPU'da baştan sona çalıştırıldı: LoRA hedefleri, yalnızca
  asistanı öğrenen etiketler, ara kayıt, adaptörün kaydı, birleştirme (görsel
  kule değişmeden) ve metin üretimi çalışıyor.
- Gerçek bir GPU eğitimi bu ortamda yapılmadı (GPU yok); ilk çalıştırmada
  `--dry-run` ve kısa bir `--max-steps 20` denemesiyle başla.

## Güvenlik ve lisans

- Veri yalnızca bu depodan gelir; kullanıcı sohbetleri ya da kişisel veri
  kullanılmaz.
- Qwen3.6-27B ve Qwen3-8B Apache-2.0 lisanslıdır: türetilmiş modeli ticari
  olarak da kullanabilirsin; modelle gelen LICENSE ve NOTICE dosyalarını koru.
- Model sunucunu internete açarken mutlaka API anahtarı kullan ve erişimi
  yalnızca Hanogt sunucusuna verecek biçimde sınırla.

## Dosyalar

| Dosya | Görevi |
| --- | --- |
| `build-dataset.mjs` | Veri setini üretir (JSONL, train/eval ayrımı, istatistik) |
| `train_lora.py` | LoRA / QLoRA eğitimi |
| `merge_and_export.py` | Birleştirme, GGUF, Ollama Modelfile |
| `requirements.txt` | Python bağımlılıkları |
