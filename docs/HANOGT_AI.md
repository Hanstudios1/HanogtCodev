# Hanogt AI

Hanogt AI is the assistant built into Hanogt Codev. It answers questions about
code, games, security and the site, and — in **agent mode**, with the user's
explicit permission — it can do things on the site for them: summarise their
profile, create a group, write code and open it in the Code Editor, start a
Hanogt Engine game, open pages and search the site's knowledge base.

There are two answer engines:

| Engine | When it answers | Where it runs |
| --- | --- | --- |
| **Language model (LLM)** | Signed-in users, when a model is configured | Server route `/api/ai`, streamed to the browser |
| **Hanogt AI Core** | Signed-out users, or whenever the LLM is unavailable | Entirely in the browser (no network) |

Every answer shows which engine produced it ("LLM" or "Core"), so a fallback is
always visible. Both engines propose actions through the same permission cards.

## The chat

The full page **`/ai`** works like Claude.ai:

- **Sidebar** – New chat, search (titles and message text), the history grouped
  by date (Today, Yesterday, Previous 7 days, Older) with rename and delete.
  It can be hidden on desktop and becomes a drawer on phones.
- **Conversation** – a calm centered column: questions in a soft bubble,
  answers as plain text with a quiet action row (copy, 👍/👎 stored locally,
  regenerate the last answer). The last question can be edited and re-sent.
- **Composer** – a large rounded box with an auto-growing text area (Enter
  sends, Shift+Enter adds a line, Escape stops), a stop button while
  streaming, the answer mode (Genel / Kod / Güvenlik), the **Agent** menu and a
  paperclip to attach a code file (≤ 200 KB) as context. On the editor page the
  open file can be attached with one click.
- **Welcome screen** – a time-of-day greeting with the user's first name, the
  composer in the middle and suggestion chips for the current mode.
- **Code** – fenced code blocks show the language, Copy and *Editörde aç*.
  Long code (24+ lines) and whole web pages become **artifact cards** that open
  a side panel with line numbers, Copy, *Editörde aç* and, for HTML, a live
  **preview** in a sandboxed frame (the editor's own preview builder: opaque
  origin, strict CSP, no network, no access to the site's storage).

The floating panel (**`HanogtAIDock`**, opened from anywhere with
`openHanogtAI()`) is the compact version of the same chat. It shares the
conversations (they live in `localStorage`, never on the server) and its
*Tam ekranda aç* button opens the same conversation on `/ai`. The panel's code
is a separate chunk that loads on first open or when the browser is idle.

## Agent mode

### What it can do

| Tool | Kind | Needs sign-in | What happens | Existing API used |
| --- | --- | --- | --- | --- |
| `get_my_profile` | read | yes | Summarises display name, nickname#tag, bio, status, favourite languages, member since, staff role and counts (projects, game projects, groups, friends, Media posts). E-mail, links and private settings are never read. | `GET /api/account/profile` |
| `create_group` | write | yes | Creates a group in Hanogt Social with a name, optional description and a starter template (blank, study, gamejam, opensource, classroom, hackathon); the card then offers *Grubu aç* (`/social/g/<id>`). | `POST /api/groups` (`action: "create"`, the same body as the *New group* wizard) |
| `open_editor_with_code` | navigate | no | Opens the code in a new, unsaved Code Editor tab (nothing is saved or run). | `openInEditor()` (`src/lib/editor-bridge.ts`) |
| `create_game` | write | yes | Creates a Hanogt Engine cloud project from one of the engine's templates (read from `PROJECT_TEMPLATES`, so new templates appear automatically) and opens `/game-engine?project=<id>&source=cloud`. | `POST /api/game-projects` via `createCloudProject()` |
| `navigate` | navigate | no | Opens one of the whitelisted pages: `/editor`, `/dashboard`, `/social` (Hanogt Social: friends, direct messages, groups; the old `/friends`, `/messages` and `/groups` map to it), `/media`, `/news`, `/arcade`, `/game-engine`, `/account-settings`, `/settings`, `/feedback`, `/guide`, `/security`, `/about`. | client-side navigation |
| `search_site` | info | no | Searches the Hanogt knowledge base and shows the matching topics. | `searchKnowledge()` (in the browser) |

### Permissions

Every action is shown as a card: **“Hanogt AI şunu yapmak istiyor: …”** with
the exact details, which the user can edit (group name, template, description,
project name, file name and code, page), and three buttons: **İzin ver**,
**Bu oturumda hep izin ver** and **Reddet**. After a decision the same card
shows progress and the result: a link to the new group or project, “editörde
açıldı”, or a translated error.

The **Agent** menu next to the message box has three modes (stored per browser):

| Mode | Behaviour |
| --- | --- |
| **Kapalı** | No actions. Hanogt AI explains how to do things and mentions that agent mode can be turned on. |
| **Her seferinde sor** (default) | Every action waits for the card. Reading the profile is asked once per session. |
| **Güvenli işlemlerde otomatik** | Opening pages and putting code in the editor run without asking; creating things still asks. |

“Always allow this session” grants live in `sessionStorage`, end with the tab
and are keyed by a hash of the account, so another account in the same tab
never inherits them. They can be reset from the Agent menu.

### What it never does

There are no tools for deleting anything, passwords, two-factor
authentication, admin or moderation work, payments, or messaging/inviting
other people. Such requests (“hesabımı sil”, “2FA'yı kapat”, “beni admin yap”,
“Ali'ye mesaj gönder”) are recognised by `detectSensitiveRequest()` and
refused with an explanation of where the user can do it themselves; how-to
questions (“hesabımı nasıl silerim?”) are answered normally. Signed-out users
are asked to sign in for account actions.

### Security

- Tools run **in the browser with the user's own session** and the site's
  existing APIs; there are no new endpoints and no extra privileges.
- The route **re-validates** every tool name and argument
  (`sanitizeAgentCall()`): unknown tools are dropped, strings are cleaned of
  control and bidirectional characters (so a card can't display something
  different from what runs), sizes are capped, ids are normalised, pages must
  be on the whitelist. The browser validates again before running, because the
  user may have edited the card (`agentArgsProblem()`).
- The system prompt treats tool results, pages and files as **untrusted data**
  (prompt-injection safe), forbids claiming an action without a tool result,
  and nothing runs without the user's approval unless the user chose the
  automatic mode for harmless actions.

### Protocol

1. The chat sends `{ agent: true }` with the history. The route adds the
   function schemas (`agentToolSchemas()`) with `tool_choice: "auto"`.
2. Text streams as before. If the model calls tools, the stream ends with a
   **trailer**: `U+001E HANOGT_AGENT U+001E` + JSON `{ toolCalls }`
   (`encodeAgentTrailer()` / `splitAgentStream()` in
   `src/lib/ai/agent-protocol.ts`). Older clients never request agent mode, so
   they never see it.
3. The chat shows the cards, runs approved calls and, once every card of the
   message is settled, sends a follow-up with the assistant `tool_calls` and one
   `role: "tool"` message per call (`tool_call_id`, a small JSON result).
   Denied or unanswered calls report that nothing was done.
4. At most **4 tool rounds** per question; the last round sets
   `agentFinal: true` (`tool_choice: "none"`) so the model answers in text.
5. If the provider rejects tools (HTTP 400), the route retries without them and
   sets `X-Hanogt-AI-Agent: unsupported`; the browser then lets the Core's
   intent model propose the action (`proposeActionsLocally()`).

## Hanogt AI Core (offline)

`src/lib/ai/local-engine.ts` answers entirely in the browser, in this order:

1. Secrets in the message are never repeated (key/token detection).
2. Quoted passwords are measured locally (Password Lab rules).
3. Links are checked structurally (no request is made).
4. Error messages and stack traces are explained (`errors.ts`).
5. Pasted code gets the Code Advisor security scan.
6. Arithmetic is calculated without `eval` (`calc.ts`).
7. Sensitive requests are refused (see above).
8. The **trained intent model** classifies the message (52 intents).
9. Action intents (`create_group`, `my_profile`, `write_code`, `open_editor`,
   `make_game`, `navigate`) become the same tool calls the LLM makes
   (`src/lib/ai/agent-intents.ts`): e.g. *“React çalışma grubu kur”* →
   `create_group { name: "React çalışma grubu", template: "study" }`,
   *“bana bir platform oyunu yap”* → `create_game { template: "platformer-2d" }`,
   *“Python ile hesap makinesi yaz ve editörde aç”* → the calculator program →
   `open_editor_with_code`, *“mesajlar sayfasına git”* → `navigate /social`.
10. Other intents are answered from the curated knowledge base, code snippets
    (`snippets.ts`) or retrieval; anything else gets an honest “outside my
    offline knowledge” answer.

**Offline programs** (`src/lib/ai/programs.ts`, loaded on demand): calculator,
number guessing game, to-do list, temperature converter, rock-paper-scissors,
multiplication table, countdown timer, password generator, dice roller, BMI
calculator, quiz, snake, pong, tic-tac-toe, clicker and a personal web page —
in Python, JavaScript, C#, C++, Java and/or single-file HTML. Console programs
read the editor's **Input** tab; HTML programs work in the sandboxed preview
(they fall back to memory when `localStorage` is unavailable).

## Training

The intent model is trained offline and committed, so builds need no network.

```bash
npm run ai:train            # grid search, test, holdout, export (~15 min)
npm run ai:train -- --cv    # also 5-fold cross-validation (~30 min)
npm run ai:train -- --quick # first grid configuration only
```

- **Dataset**: `ai/dataset/intents.json` — 52 intents, 10,135 examples in
  Turkish, English and 20+ other languages, with paraphrases, typos, text
  without Turkish characters and mixed TR/EN.
- **Blind holdout**: `ai/dataset/holdout.json` — 318 natural requests written
  after the dataset and never used for training, selection or error analysis.
- **Features** (`src/lib/ai/nlp.mjs`, feature version 4): words, 5-character
  stems, stem bigrams, in-word character trigrams, first/last stem, a
  multilingual **concept lexicon** (e.g. *kur / create / создай* → `create`,
  *grup / team / группа* → `group`, plus everyday topics such as weather or
  prices that signal “outside Hanogt”) with concept pairs, and script/shape
  features, hashed into 2^19 buckets.
- **Trainer** (`scripts/train-hanogt-ai.mjs`): near-duplicate groups never
  cross splits; augmentation (typos, keyboard slips, dropped/swapped/joined
  words, fillers) only on training items; class-balanced softmax regression
  with AdaGrad, L2, feature dropout and weight averaging; configuration and
  epoch chosen on validation macro-F1 with early stopping; test scores from the
  chosen configuration retrained on train + validation; the test and shipped
  models are the weight average of 3 runs (still one linear model); rows keep
  the strongest classes per feature (up to 24, as the 1.5 MB budget allows),
  quantized to int8 with per-row scales.
- **Model**: `public/ai/hanogt-intent-model.bin` (binary format 3: a JSON
  header, then varint bucket deltas, a label bitmask and a scale per row and one
  byte per weight; loaded with a content-hash URL so a new model never mixes
  with a cached old one) and `src/lib/ai/model-meta.json`.
- **Report**: `ai/reports/intent-training-report.md` (per-intent scores,
  confusions, every test and holdout mistake, learning curve).

### Results

| | Intents | Examples | Test accuracy | Test macro-F1 | After int8 quantization | Model |
| --- | --- | --- | --- | --- | --- | --- |
| Before (feature version 2) | 41 | 1,528 | 67.2% | 68.3% | 66.4% | 396.8 KB JSON |
| Now (feature version 4) | 52 | 10,135 | 90.1% | 90.7% | 89.9% / 90.6% F1 | 1402.7 KB binary |

| Other measurements of the current model | Accuracy | Macro-F1 |
| --- | --- | --- |
| 5-fold cross-validation (every example tested once, quantized) | 89.9% | 90.3% |
| Blind holdout, shipped model (318 sentences) | 95.9% | 95.6% |

The test sentences include deliberately hard cases (one-word messages in other
languages, ambiguous wording); the blind holdout of ordinary requests is closer
to everyday use. To improve the model, add examples to the dataset (never to
the holdout), keep labels consistent, and re-run `npm run ai:train -- --cv`.

## Knowledge base

`src/lib/ai/knowledge.ts` holds curated entries (TR/EN) used for retrieval by
the LLM (RAG) and for Core answers: account and profile, 2FA, security center,
support tickets (six categories: Şikayet, İstek, Güvenlik Açığı, Ban Kaldırma
İsteği, Soru, Geri Bildirim; staff are notified and reply from the Admin
Panel), Admin Panel roles, publishing to Media from the editor, Hanogt Engine
V3, Arcade, News, groups and templates, agent mode, a site map, and the
language counts from `LANGUAGE_STATS` (`src/lib/runtimes/languages.ts`).

## Configuration and limits

| Variable | Default | Meaning |
| --- | --- | --- |
| `HANOGT_AI_API_KEY` | – | API key (falls back to `GROQ_API_KEY`) |
| `HANOGT_AI_BASE_URL` | `https://api.groq.com/openai/v1` | OpenAI-compatible base URL (https; plain http only to loopback for local models) |
| `HANOGT_AI_MODEL` | `llama-3.3-70b-versatile` | Model id (falls back to `GROQ_MODEL`); agent mode needs a model with function calling, otherwise the Core proposes actions |

Without an API key the route reports `not_configured` and the Core answers.
Per signed-in user: **12 requests/minute** and **250 requests/day**; each tool
follow-up round is one request. On a limit the Core answers with a notice.

## File map

| Area | Files |
| --- | --- |
| Server route | `src/app/api/ai/route.ts` |
| Agent registry, validation, permissions, refusals | `src/lib/ai/agent-tools.ts` |
| Wire protocol (trailer, history) | `src/lib/ai/agent-protocol.ts` |
| Core intent → action mapping | `src/lib/ai/agent-intents.ts`, `src/lib/ai/programs.ts` |
| Browser executors, settings | `src/lib/ai/agent-client.ts`, `src/lib/ai/agent-settings.ts` |
| Offline engine | `src/lib/ai/local-engine.ts`, `nlp.mjs`, `snippets.ts`, `errors.ts`, `calc.ts` |
| Knowledge base + retrieval | `src/lib/ai/knowledge.ts`, `src/lib/ai/retrieval.ts` |
| Client streaming, conversations | `src/lib/ai/client.ts`, `src/lib/ai/conversations.ts` |
| UI | `src/components/HanogtAI/*` (`HanogtAIChat`, `useHanogtChat`, `ChatSidebar`, `ChatComposer`, `ChatMessage`, `AgentCard`, `ArtifactPanel`, `WelcomeScreen`, `Markdown`, `HanogtAIDock`), `src/app/ai/*` |
| Training | `ai/dataset/*`, `scripts/train-hanogt-ai.mjs`, `ai/reports/intent-training-report.md` |
| Tests | `scripts/tests/ai-agent.test.mjs`, `scripts/tests/ai-model.test.mjs` (`npm test`) |
