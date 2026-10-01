# Hanogt AI

Hanogt AI is the assistant built into Hanogt Codev. It replaces the earlier
rule-based "Security Bot chat" with a real language model, backed by the
platform's own knowledge base and a set of offline tools, and it keeps working
without any server configuration thanks to a trained in-browser core.

There are two answer engines:

| Engine | When it answers | Where it runs |
| --- | --- | --- |
| **Language model (LLM)** | Signed-in users, when a model is configured | Server route `/api/ai`, streamed to the browser |
| **Hanogt AI Core** | Signed-out users, or whenever the LLM is unavailable | Entirely in the browser (no network) |

The UI shows which engine produced each reply (an "LLM" or "Core" label), so
the degradation is always honest and visible.

## Language model (`/api/ai`)

`src/app/api/ai/route.ts` is an OpenAI-compatible chat proxy. It:

1. **Retrieves knowledge** from the platform's own curated base
   (`src/lib/ai/knowledge.ts`) with a BM25 search (`src/lib/ai/retrieval.ts`)
   and adds the top passages to the system prompt (RAG).
2. **Runs offline tools** on the user's message and adds their results as
   notes: the phishing link checker (`src/lib/security/links.ts`), the runtime
   error explainer (`src/lib/ai/errors.ts`) and the static code advisor
   (`src/lib/security/advisor.ts`).
3. **Streams** the model's answer back as plain text.

### Modes

The composer offers three modes, which change the system instruction:

- **General** – everyday help, explanations, Hanogt Codev questions.
- **Code** – focused on writing/fixing code and errors.
- **Security** – reviews links, code and security questions.

### Configuration

The route works with any OpenAI-compatible endpoint. All variables are optional;
if no API key is set, the route reports `not_configured` and the browser falls
back to the Core engine.

| Variable | Default | Meaning |
| --- | --- | --- |
| `HANOGT_AI_API_KEY` | – | API key (falls back to `GROQ_API_KEY`) |
| `HANOGT_AI_BASE_URL` | `https://api.groq.com/openai/v1` | OpenAI-compatible base URL |
| `HANOGT_AI_MODEL` | `llama-3.3-70b-versatile` | Model id (falls back to `GROQ_MODEL`) |

`HANOGT_AI_BASE_URL` must be **https**, except that plain **http** is allowed
only to a loopback address (`127.0.0.1`, `localhost`, `[::1]`) so a self-hosted
model such as [Ollama](https://ollama.com) or LM Studio can be used in
development.

### Limits

Per signed-in user: **12 requests/minute** and **250 requests/day**. When the
database is unreachable the limiter falls back to a per-instance in-memory
window, so a database outage slows abuse instead of disabling the feature. On a
limit, the browser answers with the Core engine and shows a short notice.

## Hanogt AI Core (offline)

`src/lib/ai/local-engine.ts` answers entirely in the browser. It combines:

- **A trained intent model** – a softmax regression over hashed n-gram
  features (`src/lib/ai/nlp.mjs`), shipped as
  `public/ai/hanogt-intent-model.json` and loaded on demand. It recognises
  **41 intents** and routes each question to the right knowledge entry.
- **The same curated knowledge base** used for RAG.
- **Code snippets** for common tasks (`src/lib/ai/snippets.ts`).
- **A runtime error explainer** (`src/lib/ai/errors.ts`).
- **A safe calculator** (`src/lib/ai/calc.ts`) with no `eval`.

Because the Core answers without a network call, signed-out visitors still get
useful help, and signed-in users never see a hard failure when the model is
rate-limited, misconfigured or unreachable — the Core takes over with a notice.

### Training

The intent model is trained offline and committed, so no build step needs
network access.

```bash
npm run ai:train
```

- Dataset: `ai/dataset/intents.json`
- Trainer: `scripts/train-hanogt-ai.mjs` (deterministic seed; hashed n-gram
  features, AdaGrad, early stopping, int8 quantization of the shipped model)
- Report: `ai/reports/intent-training-report.md`
- Output: `public/ai/hanogt-intent-model.json` and `src/lib/ai/model-meta.json`

Add or edit examples in the dataset and re-run `npm run ai:train` to retrain.
The report lists per-intent precision/recall and the quantized test accuracy
that the Core displays in its footer.

## File map

| Area | Files |
| --- | --- |
| Server route | `src/app/api/ai/route.ts` |
| Knowledge base + retrieval | `src/lib/ai/knowledge.ts`, `src/lib/ai/retrieval.ts` |
| Offline engine | `src/lib/ai/local-engine.ts`, `nlp.mjs`, `snippets.ts`, `errors.ts`, `calc.ts` |
| Client streaming | `src/lib/ai/client.ts` |
| UI | `src/components/HanogtAI/*`, `src/app/ai/*` |
| Tools shared with Security Center | `src/lib/security/links.ts`, `advisor.ts` |
