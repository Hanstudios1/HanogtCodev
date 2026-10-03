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
Per signed-in user, by plan (`src/lib/plans.ts` `PLAN_AI_LIMITS`): Free **12
requests/minute and 250/day**, Plus 20 and 750, Pro 30 and 2,000, plus any
staff grant; the day is a rolling 24 hours from the first message. Each tool
follow-up round is one request. On a limit the Core answers with a notice; a
purchase Paddle hasn't reported yet is looked up first
(`src/lib/server/entitlements.ts`).

### What grows with the plan

`src/lib/plans.ts` `PLAN_AI_FEATURES` (one table, used by the chat route, the
browser, the settings and the API):

| | Free | Plus | Pro |
| --- | --- | --- | --- |
| Longest answer of Hanogt AI's model (`max_tokens`) | 1,800 | 3,000 | 4,000 |
| Open editor file read (characters) | 12,000 | 24,000 | 40,000 |
| Each personal instruction (Hanogt AI settings) | 500 | 1,500 | 3,000 |
| Messages through own connections (day / minute) | – | 3,000 / 30 | 10,000 / 60 |
| Developer API keys / requests (day / minute) | – | 2 / 250 / 10 | 5 / 1,000 / 30 |

The browser sends at most the plan's share of the file and the server clips it
again once the message is counted under the plan. Answers through the person's
own connection use their own token budget (`ownKeyRequestParams`).

The prompt lives in `src/lib/server/hanogt-ai.ts` (`systemPrompt`): the rules
first, then the agent's rules (chat), then the person's own preferences or a
developer's system text (API) as tagged data that can't change the rules, and
last the knowledge notes, analyzer results and the open file.

### API and connections (`/ai/api`)

The 🔑 button above the chat opens `/ai/api`: the developer API (keys,
today's requests, docs with samples) and, in a second tab, the person's own
provider connections (`ConnectionsManager`, the same component as the chat's
dialog). The API itself is described in [HANOGT_AI_API.md](HANOGT_AI_API.md).

### Settings (`/ai/settings`)

The account's settings live in `users/{email}.aiSettings`
(`src/lib/ai/ai-settings.ts`), written only by `PUT /api/ai/settings` (same
origin, 20 saves a minute, `exists: true` so a deleted account never comes
back; browsers can't write the field, `firestore.rules`). They hold the
person's own instructions ("about me" and "how to answer", each cut to the
plan's length), tone, answer length, a fixed answer language, and the
defaults a device starts with: answer mode, model (Hanogt AI or a
connection), agent mode, attaching the open file. The chat reads them from
the user document the session check already loaded (no extra read); the
instructions go into the prompt after the rules as tagged data. The
developer API never uses them. A choice made on a device (agent mode, model)
wins over the account default; "delete this device's chats when I sign out"
is a device setting that every sign-out button applies (`src/lib/ai/sign-out.ts`).
The page also exports this browser's chats as JSON, deletes them, shows the
plan's usage (`GET /api/ai/usage?full=1`) and the features open to the person.

### Features opened step by step

`src/lib/features.ts` lists features with an audience: `off`, `staff`,
`early` (early access: Pro subscribers and staff) or `all`. With no
`site_config/features` document the defaults below apply; the team changes
them in Admin › Subscriptions › Features and early access (audit entry
`feature.set`, applies within a minute). `GET /api/features` tells the browser which are open to the signed-in
person; the routes behind a feature check again themselves.

| Feature | Default | What it opens |
| --- | --- | --- |
| `ai_api` | `all` (Plus and Pro, by plan) | Developer API keys and `/api/v1` |
| `plan_badge` | `all` (Plus and Pro, by plan) | Plus and Pro badges on profiles |
| `ai_voice` | `early` | Dictation and reading answers aloud |

`plan_badge` is decided by the profile's owner: only the server writes
`public_profiles/{email}.planBadge = { plan, until }` (firestore.rules keep
browsers out), after Paddle stores a subscription, after staff change a plan,
when the subscriber hides or shows it (Pricing and Account Settings ›
Profile; `subscriptions/{email}.planBadgeHidden`) and, at most every ten
minutes, when they open Pricing or Account Settings. Readers ignore a badge
whose `until` has passed (the paid period plus the payment grace, or the end
of a staff grant), so an ended plan loses its badge without a write.

### Advanced code engine (Claude)

Optional: with `ANTHROPIC_API_KEY` on the server, chat messages about code go
to Claude through the official SDK (`@anthropic-ai/sdk`,
`src/lib/server/claude-engine.ts`); everything else, own connections and the
developer API stay on the standard engine. Without the key nothing changes.

- **Which messages** (`wantsAdvancedEngine`, `src/lib/ai/engine.ts`): with the
  default `code` scope, Code and Security mode, an attached or open editor
  file, and a message with a code block, an error trace, several lines of code
  or programming words (Turkish and English; words with an everyday meaning
  such as "dizi", "sınıf" or "program" don't count). The `all` scope sends
  every message.
- **Allowance**: answers in a 24-hour window per account
  (`ai-engine-day:{email}`), by plan (default Free 3, Plus 25, Pro 100;
  `enforceEngineQuota`). The message still counts toward the plan's daily
  Hanogt AI messages. Past the allowance, or when Claude refuses the request
  before answering (key, rate limit, outage), the standard engine answers and
  the answer says why (`X-Hanogt-AI-Engine-Note: quota | unavailable`).
  Staff "reset Hanogt AI limit" resets this window too.
- **Settings**: Admin › Subscriptions › Hanogt AI engine
  (`site_config/ai_engine`, audit `ai_engine.set`, cached a minute): on/off,
  model (default `HANOGT_AI_CLAUDE_MODEL` or `DEFAULT_ENGINE_MODEL`), effort
  (default `HANOGT_AI_CLAUDE_EFFORT` or `medium`), scope and each plan's
  allowance. The card says whether the server has a key.
- **The request**: streamed; thinking is adaptive (always on for the default
  model, so no `thinking` field and no sampling parameters) and its depth
  follows `output_config.effort`; `max_tokens` is four times the plan's answer
  length (thinking counts toward it), at least 4,096. A safety decline is
  retried server-side on the model Anthropic recommends for its category
  (`fallbacks: "default"`, beta `server-side-fallback-2026-07-01`); if the
  whole chain declines, the answer says so and no tool runs. The system
  prompt is two blocks: the stable rules (`systemPromptParts().stable`, with
  `cache_control`, cached together with the tools) and what changes with each
  message (the page, knowledge notes, analyses, the open file, preferences).
- **Agent tools** are Claude tools (`eager_input_streaming`), held back until
  the answer ends with `tool_use` or `end_turn` (never after a refusal or
  `max_tokens`), then validated by the registry like the standard engine's.
  The browser runs them and sends the results back; earlier tool rounds reach
  Claude as text notes (`<hanogt_action_result>`) and no thinking block is
  ever sent back, so the conversation never depends on replaying Claude's own
  blocks. `agentFinal` sends `tool_choice: none`.
- **Answers** carry `X-Hanogt-AI-Engine: advanced | standard` and, after an
  advanced answer, `X-Hanogt-AI-Engine-Limit / -Remaining / -Reset`. The chat
  marks them with an "Advanced code engine" label; the usage meter, the usage
  list and the Pricing page cards show the allowance while the engine is on.
- Claude's failures are logged without request content; the route's deadline
  (55 seconds) ends a long answer where it is, as with the standard engine.

### Voice (`ai_voice`, early access)

Dictation and reading answers aloud use the browser's Web Speech API; nothing
goes to Hanogt's servers and nothing costs anything on the server.
`src/components/HanogtAI/voice.ts` has the hooks: `useVoice()` says which of
the two the person may use (the `ai_voice` audience from `/api/features`,
through `features-store.ts`) and the browser supports; each button is hidden
on its own when unsupported (Firefox has speech synthesis but no
recognition).

- **Dictation** (the microphone button in the composer, `useDictation`):
  `SpeechRecognition` in the site's language (`speechLangOf`, e.g. TR →
  `tr-TR`), one phrase at a time (`continuous: false`, final results only);
  the text is appended to the message box (`appendDictation`) and sent only
  when the person sends it. A refused microphone shows its own message;
  silence and aborts are ignored.
- **Read aloud** (the speaker button under an answer, `useSpeech`):
  `speechSynthesis` reads `speechTextOf(answer)`: code blocks are announced
  ("Kod bloğu.") rather than read, links keep their text, Markdown marks go
  and answers over 4,000 characters are cut at a sentence. One answer is read
  at a time; a new chat or leaving the chat stops it (`stopSpeaking`).

Browsers may use their vendor's speech service for this (Chrome: Google,
Safari: Apple); the Privacy Policy says so (legal 4.5).

### Usage meter

`src/lib/server/ai-usage.ts` counts every message: the minute window first,
then the day, so a refused burst never uses up the day; a request that fails
validation counts nothing. Messages through the person's own connections have
their own windows (`ai-own:` / `ai-own-day:`) and never touch the Hanogt AI
day.

Every answer of `/api/ai` (also a failed one that was counted) reports the day
window it counted in:

| Header | Meaning |
| --- | --- |
| `X-Hanogt-AI-Quota` | `hanogt` (Hanogt AI's daily messages) or `own` (own connections) |
| `X-Hanogt-AI-Day-Limit` | Messages a day, a staff grant included |
| `X-Hanogt-AI-Day-Remaining` | Left in the current window |
| `X-Hanogt-AI-Day-Reset` | ISO time the window starts afresh |

A refused message is `429` with `{ error, code, plan, limit, used, resetsAt,
upgrade }` (`code`: `rate_limited`, `daily_limit` or `connection_daily_limit`;
`upgrade`: the plan that raises it, or null on Pro) and `Retry-After`.

`GET /api/ai/usage` (signed in, `no-store`, a per-instance guard instead of a
database write) returns the plan, the Hanogt AI day and minute windows
(`limit`, `used`, `remaining`, `resetsAt`), the staff grant (`bonus`) and the
own-connection windows (null on Free). It looks up a purchase Paddle never
reported (throttled), so someone who pays and comes straight to Hanogt AI sees
the new plan. The meter (`UsageMeter.tsx`, `usage-store.ts`) sits in the /ai
top bar and the floating panel's header: amber from 80 %, red at the limit;
its card shows when the count renews, the minute limit, the grant, the own
connections and a way to a bigger plan. `GET /api/plans` returns the same
plus projects, games, groups and connections as `usage` for the Plans page
(`/plans#usage`).

## File map

| Area | Files |
| --- | --- |
| Server route | `src/app/api/ai/route.ts`, `src/app/api/ai/usage/route.ts` |
| Limits and usage | `src/lib/server/ai-usage.ts`, `src/lib/ai/usage.ts` |
| Prompt, provider, knowledge notes | `src/lib/server/hanogt-ai.ts` |
| Settings | `src/lib/ai/ai-settings.ts`, `src/app/api/ai/settings/route.ts`, `src/components/HanogtAI/AiSettingsPage.tsx`, `ai-settings-store.ts`, `src/lib/ai/sign-out.ts`, `src/app/ai/settings/*` |
| Developer API, own connections page | `src/lib/ai/api-keys.ts`, `src/lib/server/ai-api-keys.ts`, `src/lib/server/hanogt-ai-api.ts`, `src/app/api/v1/**`, `src/app/api/ai/keys/route.ts`, `src/components/HanogtAI/AiApiPage.tsx`, `ApiKeysPanel.tsx`, `ApiDocs.tsx`, `ConnectionsManager.tsx`, `src/app/ai/api/*` (see [HANOGT_AI_API.md](HANOGT_AI_API.md)) |
| Feature audiences | `src/lib/features.ts`, `src/lib/server/features.ts`, `src/app/api/features/route.ts`, `src/components/Admin/FeaturesCard.tsx`, `src/components/HanogtAI/features-store.ts` |
| Voice | `src/lib/ai/voice.ts`, `src/components/HanogtAI/voice.ts` |
| Advanced code engine | `src/lib/ai/engine.ts`, `src/lib/server/ai-engine.ts`, `src/lib/server/claude-engine.ts`, `src/components/Admin/AiEngineCard.tsx` |
| Agent registry, validation, permissions, refusals | `src/lib/ai/agent-tools.ts` |
| Wire protocol (trailer, history) | `src/lib/ai/agent-protocol.ts` |
| Core intent → action mapping | `src/lib/ai/agent-intents.ts`, `src/lib/ai/programs.ts` |
| Browser executors, settings | `src/lib/ai/agent-client.ts`, `src/lib/ai/agent-settings.ts` |
| Offline engine | `src/lib/ai/local-engine.ts`, `nlp.mjs`, `snippets.ts`, `errors.ts`, `calc.ts` |
| Knowledge base + retrieval | `src/lib/ai/knowledge.ts`, `src/lib/ai/retrieval.ts` |
| Client streaming, conversations | `src/lib/ai/client.ts`, `src/lib/ai/conversations.ts` |
| UI | `src/components/HanogtAI/*` (`HanogtAIChat`, `useHanogtChat`, `ChatSidebar`, `ChatComposer`, `ChatMessage`, `AgentCard`, `ArtifactPanel`, `WelcomeScreen`, `Markdown`, `HanogtAIDock`, `UsageMeter`, `usage-store`), `src/app/ai/*` |
| Training | `ai/dataset/*`, `scripts/train-hanogt-ai.mjs`, `ai/reports/intent-training-report.md` |
| Tests | `scripts/tests/ai-agent.test.mjs`, `scripts/tests/ai-model.test.mjs`, `scripts/tests/ai-usage.test.mjs`, `scripts/tests/hanogt-ai.test.mjs`, `scripts/tests/features.test.mjs`, `scripts/tests/ai-settings.test.mjs`, `scripts/tests/ai-api.test.mjs`, `scripts/tests/voice.test.mjs`, `scripts/tests/ai-engine.test.mjs` (`npm test`) |
