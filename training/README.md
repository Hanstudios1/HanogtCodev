# Hanogt AI'ı eğitmek: veri seti v2 ve Qwen3 ince ayarı

Bu klasör Hanogt AI'ın kendi modelini üretir. Hat beş adımdır:

1. izinli kaynaklardan veri toplanır;
2. veri temizlenip karıştırılır;
3. bir Qwen3 modeli LoRA/QLoRA ile eğitilir;
4. model sunulur;
5. Hanogt AI'a bağlanır.

Hedef **140.000+ benzersiz örnek**. Güncel sayılar `ai/reports/finetune-dataset-v2.md` içindedir; veri setinin kendisi depoya girmez.

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
  - başka modelleri eğitmeyi yasaklayan kapalı modellerin çıktısıyla üretilmiş veri (OpenAI, Gemini, Claude);
  - değerlendirme setleri (code-bench, HumanEval, GSM8K test bölümü).
- **Claude ile eğitim verisi üretilmez.**

| Kaynak | Lisans | Durum | Ne verir |
| --- | --- | --- | --- |
| Hanogt'un kendi içeriği | — | allowed | Bilgi tabanı, SSS, kılavuz, ajan işlemleri, kavramlar, hata açıklamaları, çok turlu sohbet |
| Exercism (61 dil izi) | MIT | allowed | Alıştırma ve örnek çözüm, konu anlatımları; Python ve JS çözümleri burada testleriyle çalıştırılır |
| TheAlgorithms/Python | MIT | allowed | Doctest'leri burada geçen algoritmalar |
| GSM8K (train) | MIT | allowed | İnsan yazımı adım adım matematik çözümleri (%70'i düşünme biçiminde) |
| Aya Dataset | Apache-2.0 | allowed | İnsan yazımı TR/EN soru-yanıt |
| OpenAssistant oasst2 | Apache-2.0 | allowed | İnsan yazımı sohbetler (en iyi dal) |
| self-oss-instruct-sc2 | ODC-BY | allowed | Açık modelle üretilmiş, çalıştırılarak elenmiş Python |
| OpenCodeInstruct | CC BY 4.0 | allowed | Açık Qwen-Coder ile üretilmiş, testten ≥ 0,9 almış kod |
| OpenThoughts-114k | Apache-2.0 | allowed | DeepSeek-R1 düşünme izleri (kısa olanlar) |
| turkish-chat-max-25k, Turkish-SFT, Türkçe Atlas, smoltalk2 | Apache/MIT/? | review | Türkçe sohbet ve düşünme; üretim kaynağı kontrol edilecek |

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

- **Dönüştürücüler:** her kaynağın kendi dönüştürücüsü vardır. Aya'dan Türkçe ve İngilizce satırlar alınır; oasst2'de her ağacın en iyi dalı; OpenCodeInstruct'ta test puanı ≥ 0,9 olanlar; OpenThoughts'ta düşünme izi olanlar.
- **Genel dönüştürücü:** bilinmeyen biçimler için `messages`, `conversations`, `instruction/output`, `prompt/response` gibi yaygın düzenleri tanır.
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

İki model önayarı vardır:
- **`--preset small`:** Qwen3-8B; ilk eğitim için önerilir.
- **`--preset 27b`:** Qwen3.6-27B; 80 GB GPU ister.

İkisi de Apache-2.0 lisanslıdır; türetilmiş modeli ticari olarak kullanabilirsin.

**Hugging Face Jobs** (PRO hesap ya da Team/Enterprise organizasyon ve kredi gerekir):

```bash
HF_TOKEN=... python3 training/hf_job.py upload --dataset-repo HanStudios/hanogt-sft-v2
python3 training/hf_job.py plan --preset small --flavor a100-large     # süre ve maliyet tahmini
HF_TOKEN=... python3 training/hf_job.py launch --dataset-repo HanStudios/hanogt-sft-v2 \
  --model-repo HanStudios/hanogt-ai-qwen3-8b-lora --preset small --flavor a100-large --confirm
```

`launch`, `--confirm` olmadan hiçbir şey başlatmaz, yalnızca planı yazar; çünkü GPU süresi dakikayla ücretlendirilir.

**Google Colab:** `training/colab/hanogt_train.ipynb`. GPU çalışma zamanını seç, Gizli anahtarlar'a `HF_TOKEN` ekle ve hücreleri sırayla çalıştır.

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
python training/merge_and_export.py --adapter training/output/hanogt-qwen3-8b/adapter
python training/merge_and_export.py --adapter … --llama-cpp ~/llama.cpp --gguf-type q8_0 --quantize Q4_K_M
```

Birleştirme modelin iki katı kadar RAM ister; GPU şart değildir. `--llama-cpp` ile GGUF dosyası ve Ollama `Modelfile`'ı da yazılır.

## 6. Sun

vLLM (OpenAI uyumlu). Düşünmeyi ayrı alanda (`reasoning_content`) döndürmek için düşünme ayrıştırıcısını aç:

```bash
vllm serve training/output/hanogt-qwen3-8b/merged --served-model-name hanogt-ai \
  --max-model-len 32768 --reasoning-parser qwen3 --enable-auto-tool-choice --tool-call-parser hermes \
  --api-key GUCLU_BIR_ANAHTAR
# ya da birleştirmeden:
vllm serve Qwen/Qwen3-8B --enable-lora --max-lora-rank 16 --lora-modules hanogt-ai=training/output/hanogt-qwen3-8b/adapter --reasoning-parser qwen3
```

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
| `train_lora.py` | LoRA / QLoRA eğitimi, `--push-to-hub` |
| `hf_job.py`, `colab/hanogt_train.ipynb` | Hugging Face Jobs ve Colab |
| `merge_and_export.py` | Birleştirme, GGUF, Ollama |
