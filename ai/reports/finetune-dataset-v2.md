# Hanogt SFT v2: dataset build

Built 2026-10-05 by `node training/mix.mjs` (seed 20261005). The data stays out of the repository (`training/data/v2`); this report and `training/sources.json` describe it.

## Size

- **17,662 samples** (train 17,411, eval 251), about 13.2 million tokens.
- Target 140,000: 17,662 so far (13%).
- Languages: TR 5,068, EN 12,594. With thinking: 5,039. Multi-turn: 156.

| Family | Samples |
|---|---:|
| math-reasoning | 7,331 |
| code-solve | 5,624 |
| site | 2,750 |
| code-algorithm | 717 |
| code-explain | 677 |
| agent | 563 |

## How answers were checked

| Check | Samples |
|---|---:|
| human | 8,008 |
| upstream-ci | 5,355 |
| knowledge | 3,313 |
| doctest | 717 |
| executed | 269 |

`executed`: run against the exercise's own tests here; `doctest`: its doctests pass here; `upstream-ci`: the source's own pipeline checked it (Exercism tracks' CI, execution-filtered datasets); `human`: written by people (Exercism concept documents, GSM8K solutions, Aya, OpenAssistant); `knowledge`: Hanogt's own knowledge base and agent schemas.

## Sources

| Source | License | Samples |
|---|---|---:|
| `gsm8k-train` | MIT | 7,331 |
| Exercism (59 languages) | MIT | 6,301 |
| `hanogt-site` | Proprietary (Hanogt Codev) | 3,313 |
| `thealgorithms-python` | MIT | 717 |

Not imported yet (training/import_hf.py needs network access to huggingface.co and `HF_TOKEN`): `CohereLabs/aya_dataset` (allowed), `OpenAssistant/oasst2` (allowed), `bigcode/self-oss-instruct-sc2-exec-filter-50k` (allowed), `nvidia/OpenCodeInstruct` (allowed), `open-thoughts/OpenThoughts-114k` (allowed), `cisimcik/turkish-chat-max-25k` (review), `AlicanKiraz0/Turkish-SFT-Dataset-v1.0` (review), `AlicanKiraz0/Turkce-Atlas-Instruct` (review), `HuggingFaceTB/smoltalk2` (review).

## Dropped

| Reason | Samples |
|---|---:|
| benchmark | 260 |
| near_duplicate | 74 |
| duplicate | 7 |
| pii_email | 7 |

Benchmarks kept out: code-bench (scripts/ai-eval), HumanEval and GSM8K's test split (64,574 prompt runs, 41 function names).
