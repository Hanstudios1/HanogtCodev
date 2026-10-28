# Hanogt AI'ı EVREN'de eğitmek

[EVREN](https://evren.ssyz.org.tr), Savunma Sanayii Başkanlığı'nın (SSB) 27 Eylül 2026'da açılan yapay zekâ platformudur. Giriş e-Devlet ile yapılır ve her kişiye bir hesap verilir. Bu klasör, Kaggle'da çalışan eğitim hattını (`training/kaggle_run.py`) EVREN gibi **Slurm + Apptainer** kullanan bir GPU kümesinde çalıştırmak içindir.

Aşağıdaki bilgiler 12 Ekim 2026'da haberlerden ve platformun tanıtım sayfalarından derlendi. Platformun belgeleri bu depodan okunamadı; kuralları değişebilir, ilk işte kendi hesabınızdan doğrulayın.

## EVREN'de ne var?

- **Donanım:** 8 düğüm × 8 NVIDIA H200 (toplam 64 GPU, 8,8 TB GPU belleği). Bir H200'ün 141 GB belleği var. Kaggle'daki T4'lerin her biri 16 GB.
- **Eğitim:** işler Slurm ile, Apptainer konteynerlerinde, doğrudan donanım üzerinde (bare-metal) çalışır. GPU'lar başlangıç ve bitiş tarihiyle **en erken 24 saat, en geç 3 ay sonrası** için ayrılır.
- **Kredi:**
  - Aylık abonelik yoktur; ilk kayıtta **1.000 kredi** verilir.
  - GPU saati, GPU başına saatte **10–35 kredi** tutar.
  - Kredi; veri seti yükleyerek, veri etiketleyerek veya eğitilmiş modeli paylaşarak kazanılır.
  - Bakiye yetmezse iş başlamaz.
- **Hazır modeller:** 11–14 açık ağırlıklı dil modeli, OpenAI uyumlu bir API üzerinden sunulur. API çağrıları **1 Kasım 2026'ya kadar** krediden düşmez. Bu muafiyet yalnızca API (LLM Çıkarımı) içindir; GPU rezervasyonları ve eğitim işleri kredi harcamaya devam eder.
- **Para:** aylık ücret ya da kart yoktur; harcanan şey kredidir. Kredi kayıtta verilir ve katkıyla kazanılır.
- **Veri:** istemler, yanıtlar ve iş verileri Türkiye'deki sunucularda işlenir.

## Bizim eğitimimiz için ne demek?

Aşağıdaki süre ve kredi rakamları tahmindir, ölçülmedi:

- **Bir tur:** yaklaşık 20 bin örnek, 20–30 milyon token. 27B tabanla tek H200'de birkaç saat sürer.
- **Kredi:** saati 10–35 krediden tur başına kabaca 30–150 kredi eder. Başlangıçtaki 1.000 kredi birkaç tura yeter.
- **Kaggle ile fark:**

  | | Kaggle (2× T4) | EVREN (H200) |
  |---|---|---|
  | Taban model | Qwen3.5-4B | Qwen3.8-27B; tek GPU'da 16-bit LoRA |
  | Bir turun süresi | 10–20 saat | birkaç saat |

  Kaggle'daki 4B tabanla 27B taban arasındaki fark büyüktür. Asıl kalite artışı buradan gelir.

## Başlamadan önce doğrulanması gerekenler

Bunlar netleşmeden ücretli ya da uzun bir iş başlatmayın:

1. **Kullanım koşulları:** Hanogt Codev gibi ticari bir ürün için eğitime ve eğitilen modelin kullanımına izin veriliyor mu?
2. **Model ağırlıkları:** eğitilen LoRA bağdaştırıcısı platformdan indirilebiliyor ya da Hugging Face'e yüklenebiliyor mu? Hanogt AI modeli kendi uç noktasından sunar (`HANOGT_AI_BASE_URL`).
3. **İnternet:** işler `huggingface.co`'ya (taban model, veri havuzu, ara kayıtlar) ve `github.com`'a ulaşabiliyor mu?
   - Ulaşamıyorsa taban model ve veri havuzu platformun veri yükleme özelliğiyle önceden konur.
   - Eğitim, `train_lora.py` ile yerel dosyalardan yapılır.
4. **Kredi:** seçilen GPU türünün saatlik kredisi ve hesaptaki bakiye.

## Çalıştırma

1. `evren.ssyz.org.tr` adresinde e-Devlet ile giriş yapın ve GPU rezervasyonu oluşturun (en az 24 saat önceden).
2. Depoyu kümeye alın ve konteyneri kurun. Platform hazır bir PyTorch (CUDA 12) konteyneri sunuyorsa ona `training/requirements.txt` kurmak yeter.

   ```bash
   git clone https://github.com/Hanstudios1/HanogtCodev.git && cd HanogtCodev
   apptainer build hanogt-train.sif training/evren/hanogt-train.def
   ```

3. Hugging Face anahtarını işin ortamına verin. Özel `HanStudios` depolarına yazabilen bir anahtar gerekir. Anahtar platformun gizli değişken özelliğiyle ya da oturumda verilir; hiçbir dosyaya yazılmaz.
4. İşi gönderin:

   ```bash
   sbatch training/evren/train.sbatch
   # başka bir taban ya da süre:
   BASE_MODEL=Qwen/Qwen3.5-9B HOURS=5.5 sbatch --time=06:00:00 training/evren/train.sbatch
   ```

- **Ne yapar?** İş Kaggle'daki hattın aynısını çalıştırır:
  - veri değiştiyse havuzu yeniden kurar;
  - sıradaki turları eğitir;
  - ilerlemeyi `HanStudios/hanogt-ai-<taban>-lora` deposuna yazar.
- **Kaggle ile ortak çalışma:** EVREN ve Kaggle aynı depolardan sürdüğü için ikisi dönüşümlü kullanılabilir. Bağdaştırıcılar tabanlar arasında taşınmaz; aynı tabanla sürdürün.
- **Birden çok GPU:** `--gres=gpu:N` verilirse çalıştırıcı her GPU'da bir kopya çalıştırır (`torchrun`).

## EVREN'in hazır modelleri Hanogt AI'da kullanılabilir mi?

Teknik olarak evet, kodda değişiklik gerekmez: Hanogt AI herhangi bir OpenAI uyumlu `https` adresini kabul eder ve yalnızca `HANOGT_AI_BASE_URL`, `HANOGT_AI_MODEL` ve `HANOGT_AI_API_KEY` ister.

Aşağıdaki adres ve model adları 28 Ekim 2026'da haberlerden ve topluluk rehberlerinden derlendi; platformun kendi sayfasından doğrulayın.

1. `evren.ssyz.org.tr` adresinde e-Devlet ile giriş yapın.
2. Üst menüden **LLM Çıkarımı**'nı açın, kullanım şartlarını okuyup onaylayın ve bir API anahtarı oluşturun (anahtarlar `evren.ssyz.org.tr/api-keys` sayfasında yönetilir). Anahtar yalnızca ortam değişkenine yazılır; koda ya da sohbete yazılmaz.
3. Model listesinden bir model seçin (`evren.ssyz.org.tr/llm/models` ya da API'nin `/models` uç noktası). Rehberlerde geçen adlar: `evren/qwen3.8-flash-next`, `evren/glm-5.3`, `evren/deepseek-v4-flash`.
4. Vercel'de **Production** ortam değişkenlerini ayarlayın ve yeniden dağıtın:
   - `HANOGT_AI_BASE_URL=https://evren-llmapi.ssyz.org.tr/v1`
   - `HANOGT_AI_MODEL=<seçilen modelin tam adı>`
   - `HANOGT_AI_API_KEY=<EVREN anahtarı>`
5. `/ai` sayfasında bir soru sorun. Uç nokta hata verirse Hanogt AI kendiliğinden tarayıcıdaki Çekirdek'e geçer; site bozulmaz.

Geçmeden önce:

- **Kullanım koşulları:** herkese açık, ticari bir hizmete izin veriyor mu?
- **1 Kasım 2026'dan sonrası:** her çağrı krediden düşer. Kredi bitince Hanogt AI Çekirdek'e geçer. Süre dolmadan ya kredili devam edilir ya da eski ayara dönülür.
- **Gizlilik Politikası:** model sağlayıcısı bölümü (şu an Hugging Face, ABD) EVREN (Savunma Sanayii Başkanlığı, Türkiye) olarak güncellenmelidir.

## Ücretsiz dönemde eğitim verisi üretmek

1 Kasım 2026'ya kadar API ücretsiz olduğu için EVREN'deki açık ağırlıklı modellerle (Qwen, DeepSeek, GLM) eğitim verisi üretmek de bir seçenektir. Üretilen veri, Kaggle'daki ücretsiz eğitimde kullanılır. Bunun için iki şart vardır:

- EVREN'in kullanım şartları çıktıların başka bir modeli eğitmek için kullanılmasına izin vermelidir;
- seçilen modelin lisansı buna izin vermelidir (Apache-2.0 ya da MIT).

Veri politikası (`training/README.md`) kapalı modellerin çıktısını dışarıda tutar; açık ağırlıklı modellerin çıktısı bu iki şartla kabul edilir. Günlük token sınırı olabilir.
