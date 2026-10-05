# Hanogt AI

Hanogt AI is the assistant built into Hanogt Codev. It answers questions about
code, games, security and the site, and — in **agent mode**, with the user's
explicit permission — it can do things on the site for them: summarise their
profile, create a group, write code and open it in the Code Editor, start a
Hanogt Engine game, open pages and search the site's knowledge base.

There are two answer engines, both for signed-in people only:

| Engine | When it answers | Where it runs |
| --- | --- | --- |
| **Language model (LLM)** | Hanogt AI's own model, when it is configured (`HANOGT_AI_*`, see [Configuration and limits](#configuration-and-limits)) | Server route `/api/ai`, streamed to the browser |
| **Hanogt AI Core** | Whenever the LLM can't answer: not configured, a limit reached, an error | Entirely in the browser (no network) |

Every answer shows which engine produced it ("LLM" or "Core"), so a fallback is
always visible. Both engines propose actions through the same permission cards.

## Sign-in

Hanogt AI is open to signed-in people only. `/api/ai` answers `401
auth_required` to a request without an active session (signed out, or a
banned or suspended account) before anything is read or counted. The chat
(`HanogtAIChat`) shows a sign-in gate instead (`SignInGate`, in the floating
panel and on `/ai`): *Sign in* and *Sign up* with a `callbackUrl` back to the
page, the Free plan's allowance and a link to the plans. The Core doesn't
answer signed-out visitors either, and nothing is sent while the session is
still loading (the text stays in the box). If the session ends on the server
mid-chat, the answer is a notice with a *Sign in* link, not a Core answer.

## The chat

The full page **`/ai`** mixes Claude.ai and Codex on a paper-and-ink theme
(`--ai-paper`, `--ai-ink`, … in `globals.css`; answers in Source Serif 4):

- **Sidebar** – New chat, search (titles and message text) and two tabs:
  **Chats**, the history grouped by date (Today, Yesterday, Previous 7 days,
  Older) with rename and delete, and **Tasks**, the conversations about a file
  in the editor with where they stand (Ready +a −b, Applied, Dismissed,
  Answered, Working; `src/components/HanogtAI/proposals.ts`). It can be hidden
  on desktop and becomes a drawer on phones.
- **Conversation** – a calm centered column: questions in a soft bubble,
  answers as plain text without a bubble or an avatar, with a quiet action
  row (copy, 👍/👎 stored locally, regenerate the last answer; the logo marks
  the newest answer) and the work steps and thinking above them
  ([Thinking](#thinking)). The last question can be edited and re-sent. An
  answer that was cut (its length, the time limit or a dropped connection)
  says so and offers *Continue* ([Answer stream](#answer-stream-wire-protocol-v2)).
- **Composer** – a large rounded box with an auto-growing text area (Enter
  sends, Shift+Enter adds a line, Escape stops), a stop button while
  streaming, the answer mode (Genel / Kod / Güvenlik), the **Agent** menu and a
  paperclip to attach a code file (≤ 200 KB) as context. On the editor page the
  open file goes with questions while *attach the open file* is on: the code
  editor publishes it (name, language, code) 300 ms after typing stops
  (`publishAiContext`, `src/lib/ai/context-store.ts`) and clears it when you
  leave the editor; the server reads up to the plan's length.
- **Welcome screen** – a serif time-of-day greeting with the user's first name
  in the accent gradient, the composer in the middle and suggestion chips for
  the current mode, arriving one after another.
- **Changes card** – when a question carried the open editor file, the answer's
  change to it (a whole-file block or a `diff` block, `src/lib/ai/file-edit.ts`)
  is shown as a line diff (`src/lib/ai/diff.ts`, Myers) with *Apply to editor*.
  The chat asks the editor on the same page through a synchronous window event
  (`src/lib/ai/editor-apply.ts`); the editor applies it as one edit (Ctrl+Z
  undoes it) or answers "changed" when the file differs from what Hanogt AI read
  (the card then asks before applying anyway). The file as it was asked about is
  kept on the three newest such answers (`AiEdit`, ≤ 40,000 characters each).
  Without an editor on the page the change opens in a new editor tab. With the
  *codeOutput* setting on "diff" the model answers with a unified diff, which
  is applied by its context lines.
- **Context from the editor** – besides the open file, the editor publishes the
  error output of the file's last failed run and the names of the project's
  other tabs; they reach the model as `<console_output>` data (≤ 3,000
  characters) and a file list (≤ 50 names) when the settings allow it
  (*attachConsoleErrors* on by default, *attachProjectTree* off).
- **Code** – fenced code blocks show the language, Copy and *Editörde aç*.
  Long code (24+ lines) and whole web pages become **artifact cards** that open
  a side panel with line numbers, Copy, *Editörde aç* and, for HTML, a live
  **preview** in a sandboxed frame (the editor's own preview builder: opaque
  origin, strict CSP, no network, no access to the site's storage).

The floating panel (**`HanogtAIDock`**, opened from anywhere with
`openHanogtAI()`) is the compact version of the same chat; its title opens a
list of recent chats to switch to (`RecentChats.tsx`). It shares the
conversations (they live in `localStorage`, never on the server) and its
*Tam ekranda aç* button opens the same conversation on `/ai`. The panel's code
is a separate chunk that loads on first open or when the browser is idle.

## Thinking

Hanogt AI's own model can think before it answers (`src/lib/ai/thinking.ts`).

- **Settings** (`/ai/settings` › *Düşünme*, stored with the other AI
  settings): `thinking` is `auto` (the default: Code and Security mode, and a
  latest message of 400 characters or more; `wantsThinking`), `on` or `off`;
  `showThinking` (on by default) shows the thinking and the steps above the
  answer.
- **The request**: a thinking request gets the plan's thinking budget on top
  of its answer length (`PLAN_AI_FEATURES.thinkingTokens`: Free 1,000, Plus
  2,000, Pro 3,000) and Qwen3's recommended sampling (`temperature` 0.6,
  `top_p` 0.95). Qwen3's switch `chat_template_kwargs.enable_thinking` (true
  or false) is merged with any `chat_template_kwargs` from
  `HANOGT_AI_EXTRA_BODY` (`hanogtRequestBody`). A server that answers 400 gets
  the request once more without the switch and then, in agent mode, without
  tools. Own connections aren't told to think; thinking their model streams
  is shown the same way.
- **Reading it**: from the `reasoning_content` or `reasoning` field of the
  streamed delta (vLLM with a reasoning parser, most providers) or from a
  `<think>…</think>` block at the start of the text (a tag split across chunks
  is held back until it is complete). With `HANOGT_AI_THINKING=preopened` (a
  chat template that opens `<think>` itself) the text starts inside the block
  and the thinking ends at `</think>`. Until then it is only tentative: a
  separate reasoning field shows that the text is the answer, and an answer
  that ends normally without `</think>` didn't think at all, so what was sent
  as thinking is the answer (`think_reset` in the stream).
- **Never sent back**: a leading `<think>` block is removed from assistant
  turns of the history (chat and developer API), and the browser never puts
  thinking into the history. It is kept only in this browser with the
  conversation (`AiMessage.thinking`: the text up to `THINKING_STORED_MAX`,
  6,000 characters, the seconds measured in the browser and the steps).
- **The panel** (`ThinkingPanel.tsx`): *Thinking…* (open, streaming) while the
  model thinks, then a folded *Thought for N s* that can be opened. It lists the
  server's steps (the knowledge looked up, with titles; the link check, error
  explainer or code advisor that ran; the open file read; agent tools ready or
  unsupported) and, for a Core answer, the intent it recognized and how sure it
  was. Answers carry `X-Hanogt-AI-Thinking: on | off`; a non-streamed answer
  (`stream: false`) has a `thinking` field when it is shown.

## Answer stream (wire protocol v2)

Browsers ask for version 2 with `wire: 2` in the request body (`WIRE_VERSION`,
`src/lib/ai/stream-protocol.ts`). The answer then has `X-Hanogt-AI-Wire: 2`
(`WIRE_HEADER`) and `Content-Type: application/x-ndjson; charset=utf-8`
(`WIRE_CONTENT_TYPE`): one JSON event per line (`chatOutputStream`,
`src/lib/server/hanogt-ai-stream.ts`).

| Event | Meaning |
| --- | --- |
| `{"t":"step","step":{…}}` | A step the server took before the answer, sent first (only when the person shows the thinking) |
| `{"t":"think","d":"…"}` | A piece of the model's thinking (only when shown) |
| `{"t":"think_reset"}` | What came as thinking was the answer after all (a block the template opened never closed); it follows as `text` |
| `{"t":"text","d":"…"}` | A piece of the answer |
| `{"t":"tools","calls":[…]}` | Agent tool calls, already validated against the registry |
| `{"t":"end","reason":"stop"}` | How the answer ended: `stop`, `length` (it reached the plan's length), `timeout` (the route's 55 seconds) or `error` |
| `{"t":"error","code":"…","refunded":true}` | The model answered nothing (`timeout` or `empty_answer`); `refunded` says whether the message was given back ([Refunds](#refunds)). An `end` with `error` follows. |

Unknown events are ignored (`readWireEvent`), so the server can add new ones.
A request without `wire: 2` (a tab opened before 0.3.18) gets the old
plain-text stream with the agent trailer and no thinking.

An answer that ends with `length`, `timeout` or `error` after some text, or
whose connection dropped, is kept with `cut` and says so. On the last answer
*Continue* (*Devam et*) sends the conversation with the partial answer (its
last 6,000 characters) and a hidden request to go on where it stopped, and
adds the new text to the same message. It counts as one message.

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
questions (“hesabımı nasıl silerim?”) are answered normally.

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
2. Text streams as before. If the model calls tools, the version 2 stream
   sends them as a `tools` event before `end`
   ([Answer stream](#answer-stream-wire-protocol-v2)); a tab without `wire: 2`
   gets them as a **trailer** at the end of the text:
   `U+001E HANOGT_AGENT U+001E` + JSON `{ toolCalls }`
   (`encodeAgentTrailer()` / `splitAgentStream()` in
   `src/lib/ai/agent-protocol.ts`). Clients from before agent mode never
   request it, so they see neither.
3. The chat shows the cards, runs approved calls and, once every card of the
   message is settled, sends a follow-up with the assistant `tool_calls` and one
   `role: "tool"` message per call (`tool_call_id`, a small JSON result).
   Denied or unanswered calls report that nothing was done.
4. At most **4 tool rounds** per question; the last round sets
   `agentFinal: true` (`tool_choice: "none"`) so the model answers in text.
5. If the provider still rejects the request (HTTP 400) after the retry
   without the thinking switch ([Thinking](#thinking)), the route retries
   without tools and sets `X-Hanogt-AI-Agent: unsupported`; the browser then
   lets the Core's intent model propose the action (`proposeActionsLocally()`).

## Hanogt AI Core (offline)

The Core answers signed-in people whenever the language model can't (see the
table at the top); while thinking is shown, the thinking panel names the
intent it recognized and how sure it was. `src/lib/ai/local-engine.ts`
answers entirely in the browser, in this order:

1. Secrets in the message are never repeated (key/token detection).
2. Quoted passwords are measured locally (Password Lab rules).
3. Links are checked structurally (no request is made).
4. Error messages and stack traces are explained (`errors.ts`).
5. Pasted code gets the Code Advisor security scan.
6. Arithmetic is calculated without `eval` (`calc.ts`).
7. Sensitive requests are refused (see above).
8. The **trained intent model** classifies the message (53 intents).
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
11. **Programming concepts** (`code_concept`): *“özyineleme nedir”*, *“what is
    a closure”*, *“SQL ile NoSQL farkı”* are answered from
    `src/lib/ai/concepts.ts` (50 concepts, Turkish and English, most with a
    short example that opens in the editor; loaded on demand). A definition
    question the model isn't sure about (*“… nedir / ne demek / nasıl
    çalışır”*, *“what is / explain / how does …”*) gets a concept only when the
    match is strong, and a how-to question without a ready example gets one
    too (*“event loop nasıl işler”*).

The Python and JavaScript examples of `snippets.ts` are run by
`scripts/tests/snippets-run.test.mjs`, and the concepts' JavaScript examples
are parsed by `scripts/tests/core-concepts.test.mjs`.

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

- **Dataset**: `ai/dataset/intents.json` — 53 intents, 10,495 examples in
  Turkish, English and 20+ other languages, with paraphrases, typos, text
  without Turkish characters and mixed TR/EN.
- **Blind holdout**: `ai/dataset/holdout.json` — 343 natural requests written
  after the dataset and never used for training, selection or error analysis
  (25 of them, for `code_concept`, were added with that intent).
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
| Feature version 4, 2 October 2026 | 52 | 10,135 | 90.1% | 90.7% | 89.9% / 90.6% F1 | 1402.7 KB binary |
| Now, with `code_concept` | 53 | 10,495 | 90.7% | 91.3% | 90.4% / 91.0% F1 | 1449.1 KB binary |

| Other measurements of the current model | Accuracy | Macro-F1 |
| --- | --- | --- |
| 5-fold cross-validation (every example tested once, quantized) | 89.9% | 90.3% |
| Blind holdout, shipped model (343 sentences) | 94.8% | 94.6% |
| … the 318 sentences of the previous holdout | 95.6% (before: 95.9%) | |
| … the 25 new `code_concept` sentences | 84% | |

The test sentences include deliberately hard cases (one-word messages in other
languages, ambiguous wording); the blind holdout of ordinary requests is closer
to everyday use. To improve the model, add examples to the dataset (never to
the holdout), keep labels consistent, and re-run `npm run ai:train -- --cv`.

## Measuring code quality (code-bench)

`scripts/ai-eval/code-bench.mjs` measures how well an engine writes code:
pass@1 on 40 tasks (20 JavaScript, 20 Python) with hidden tests
(`scripts/ai-eval/bench-tasks.mjs`, written for this benchmark and kept out of
any training data). The answer's code block runs in a child process with a
time and memory limit, no inherited environment (no API keys), Node's
permission model for JavaScript (no writes, no processes) and audit hooks for
Python (no sockets, processes or writes outside its folder); results are
classified as pass, wrong answer, syntax/runtime error, timeout, missing
function, no code or refusal.

```bash
node scripts/ai-eval/code-bench.mjs --self-check     # every reference passes, every stub fails
node scripts/ai-eval/code-bench.mjs --engine hanogt --api-key-env HANOGT_API_KEY   # through the developer API
node scripts/ai-eval/code-bench.mjs --engine openai --base-url "$HANOGT_AI_BASE_URL" --model "$HANOGT_AI_MODEL" --api-key-env HANOGT_AI_API_KEY
node scripts/ai-eval/code-bench.mjs --compare        # → ai/reports/code-bench.md
```

`--engine openai` takes any OpenAI-compatible endpoint: Hanogt AI's own model
directly (as above), vLLM, Ollama with `/v1`. A thinking model's `<think>`
block is removed first, so only the answer is graded (`answerText`).
Runs are saved under `ai/reports/code-bench/`. Prompts are Turkish by default
(`--lang en` for English). Model-written code runs on the machine that runs
the benchmark: use a throwaway VM or container for untrusted models. The
harness is tested with fake engines (`scripts/tests/code-bench.test.mjs`);
measuring real engines needs their keys, so the owner runs it.

## Fine-tuning your own model (Qwen)

`training/` builds a supervised fine-tuning set from this repository (no user
data; the code-bench stays out), trains a LoRA/QLoRA adapter on a Qwen model
(default `Qwen/Qwen3.6-27B`, smaller preset `Qwen/Qwen3-8B`; the model is a
parameter) and merges/exports it for vLLM or Ollama. A self-hosted model
becomes Hanogt AI's model with `HANOGT_AI_BASE_URL`, `HANOGT_AI_API_KEY` and
`HANOGT_AI_MODEL` ([Configuration and limits](#configuration-and-limits));
options the server understands go in `HANOGT_AI_EXTRA_BODY` (Hanogt AI sets
Qwen3's thinking switch itself, see [Thinking](#thinking)). Steps, hardware,
cost and serving: see [training/README.md](../training/README.md) (Turkish).

## Knowledge base

`src/lib/ai/knowledge.ts` holds curated entries (TR/EN) used for retrieval by
the LLM (RAG) and for Core answers: account and profile, 2FA, security center,
support tickets (six categories: Şikayet, İstek, Güvenlik Açığı, Ban Kaldırma
İsteği, Soru, Geri Bildirim; staff are notified and reply from the Admin
Panel), Admin Panel roles, publishing to Media from the editor, Hanogt Engine
V3, Arcade, News, groups and templates, agent mode, a site map, and the
language counts from `LANGUAGE_STATS` (`src/lib/runtimes/languages.ts`).

## Configuration and limits

Hanogt AI's language model is the owner's own OpenAI-compatible endpoint
(`providerConfig()` in `src/lib/server/hanogt-ai.ts`). There are no defaults
and no fallbacks: the three required variables must all be set.

| Variable | Required | Meaning |
| --- | --- | --- |
| `HANOGT_AI_BASE_URL` | yes | OpenAI-compatible base URL (https; plain http only to this machine: `localhost`, `127.0.0.1`, `[::1]`) |
| `HANOGT_AI_MODEL` | yes | Model id at that endpoint; on the Hugging Face router it names its provider (`model:provider`). Agent mode needs a model with function calling, otherwise the Core proposes actions |
| `HANOGT_AI_API_KEY` | yes | **Secret.** The endpoint's key |
| `HANOGT_AI_EXTRA_BODY` | no | A JSON object (at most 4,000 characters) merged into every request to the model (chat and `/api/v1`), e.g. `{"top_k":20}`. The request's own fields (`model`, `messages`, `stream`, `tools`, `max_tokens`, `temperature`, `top_p`…) always win; other `chat_template_kwargs` are kept next to the thinking switch; an invalid value is ignored (logged once) |
| `HANOGT_AI_THINKING` | no | `preopened` when the model's chat template opens `<think>` itself, so answers start inside the thinking block ([Thinking](#thinking)) |

Refused (the configuration then counts as missing; a warning is logged once):
hosts on `groq.com` or `anthropic.com`, a model ending in `:groq`, and on
`router.huggingface.co` a model that doesn't pin a provider (no `:provider`
suffix, or a routing policy such as `:fastest`, `:cheapest`, `:preferred` or
`:auto`, which could pick a refused provider). Typical setups: a Qwen3 model on
the Hugging Face router with a pinned provider
(`https://router.huggingface.co/v1`, `Qwen/Qwen3-…:<provider>`), a Hugging Face
Inference Endpoint, or vLLM serving the fine-tuned model
([training/README.md](../training/README.md)). The legal texts (version 4.7,
5 October 2026) name Hugging Face, Inc. (USA) and the inference provider
selected through it as the recipient of Hanogt AI's messages; hosting the
model elsewhere means updating them.

When the model isn't configured (or is refused), `/api/ai` answers `503
not_configured` without counting anything and the browser's Core answers the
signed-in person; `/api/v1` answers `503 service_unavailable`. Answers never
name the upstream model: `X-Hanogt-AI-Model` is `hanogt-ai` (an own connection
shows its own model).

The optional advanced code engine (Claude through `@anthropic-ai/sdk`) was
removed in 0.3.18 with its admin card (`site_config/ai_engine` is no longer
read). Its variables `ANTHROPIC_API_KEY`, `HANOGT_AI_CLAUDE_MODEL`,
`HANOGT_AI_CLAUDE_EFFORT` and `ANTHROPIC_BASE_URL`, like the old fallbacks
`GROQ_API_KEY` and `GROQ_MODEL`, are no longer read and can be deleted from
Vercel.

### Limits

Per signed-in person, by plan (`src/lib/plans.ts` `PLAN_AI_LIMITS`,
`aiLimitsFor`): a guard per minute and an allowance for a window that opens
with the first message.

| | Free | Plus | Pro |
| --- | --- | --- | --- |
| Messages a minute | 5 | 20 | 30 |
| Messages in the window | 50 | 750 | 2,000 |
| Window | 7 days | 14 days | 7 days |

A staff grant adds messages to the window until it ends (stored as
`aiBonusDaily` for historical reasons). The chat, the developer API (source
`api`) and, once it ships, Hanogt AI in Social groups (source `group`) share
this one allowance. Each tool follow-up round and each *Continue* is one
message. On a limit the Core answers with a notice (when the window renews,
or the seconds to wait); a purchase Paddle hasn't reported yet is looked up
first (`src/lib/server/entitlements.ts`). Messages through the person's own
connections have their own per-day limits (`PLAN_AI_FEATURES.ownKey`, below)
and never use the window.

### Refunds

A message the model couldn't answer at all (the provider unreachable or
failing, the time limit before any text, an empty answer, a stream that ended
without text or tool calls) is given back: `refundHanogtAi` →
`releaseFromWindow` (`src/lib/server/rate-limit.ts`) takes one count off the
window that counted it, only while that same window is still open (same
start), never below zero, in Firestore or in the in-memory fallback. It is
best effort; the minute guard and own connections are not refunded. JSON
failures carry `refunded: true | false` and the version 2 stream an `error`
event with `refunded`; the browser then reads the usage again. The developer
API gives messages back the same way.

### What grows with the plan

`src/lib/plans.ts` `PLAN_AI_FEATURES` (one table, used by the chat route, the
browser, the settings and the API):

| | Free | Plus | Pro |
| --- | --- | --- | --- |
| Longest answer of Hanogt AI's model (`max_tokens`) | 1,800 | 3,000 | 4,000 |
| Thinking budget on top of it (`thinkingTokens`) | 1,000 | 2,000 | 3,000 |
| Open editor file read (characters) | 12,000 | 24,000 | 40,000 |
| Each personal instruction (Hanogt AI settings) | 500 | 1,500 | 3,000 |
| Messages through own connections (day / minute) | – | 3,000 / 30 | 10,000 / 60 |
| Developer API keys (requests count in the window above) | – | 2 | 5 |

The browser sends at most the plan's share of the file and the server clips it
again once the message is counted under the plan. Answers through the person's
own connection use their own token budget (`ownKeyRequestParams`).

The prompt lives in `src/lib/server/hanogt-ai.ts` (`systemPrompt`): the rules
first, then the agent's rules (chat), then the person's own preferences or a
developer's system text (API) as tagged data that can't change the rules, and
last the knowledge notes, analyzer results and the open file.

### API and connections (`/ai/api`)

The 🔑 button above the chat opens `/ai/api`: the developer API (keys, the
window's messages shared with the chat, docs with samples) and, in a second
tab, the person's own provider connections (`ConnectionsManager`, the same
component as the chat's dialog). The API itself is described in
[HANOGT_AI_API.md](HANOGT_AI_API.md).

Groq is retired as an own-key provider (`RETIRED_PROVIDER_IDS` in
`src/lib/ai/connections.ts`): Groq connections made earlier are listed as
*No longer supported*, are never active or offered in the model picker, don't
count toward the plan's connections, can't be edited and can be deleted.

### Settings (`/ai/settings`)

The account's settings live in `users/{email}.aiSettings`
(`src/lib/ai/ai-settings.ts`), written only by `PUT /api/ai/settings` (same
origin, 20 saves a minute, `exists: true` so a deleted account never comes
back; browsers can't write the field, `firestore.rules`). They hold the
person's own instructions ("about me" and "how to answer", each cut to the
plan's length), tone, answer length, a fixed answer language, thinking
(`thinking` and `showThinking`, see [Thinking](#thinking)) and the defaults a
device starts with: answer mode, model (Hanogt AI or a connection), agent
mode, attaching the open file. Since 0.3.21 they also hold the person's
experience level, the language of code comments, code style, up to five
preferred languages and whether file changes come whole or as a diff (all
added to the prompt), the send shortcut (Enter or Ctrl/Cmd+Enter), the answer
font (serif or sans), opening long code in the side panel automatically,
attaching the last run's errors and the project's file names, the dictation
language, the answer voice and its speed, and how many days chats stay in this
browser (0, 7, 30 or 90; older ones are pruned). The chat reads them from
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

`src/lib/server/ai-usage.ts` counts every message (`enforceHanogtAi`): the
minute guard first, then the plan's window, so a refused burst never uses up
the window; a request that fails validation counts nothing. The counters are
`ai:<email>` (minute) and `ai-window:<email>` (window) (`AI_LIMIT_KEYS` in
`src/lib/server/plans.ts`) in `security_rate_limits`, whose document ids are
salted SHA-256 hashes of the keys; while Firestore can't be reached, each
server instance counts in memory. Messages through the person's own
connections have their own windows (`ai-own:` / `ai-own-day:`,
`enforceOwnKeys`) and never touch Hanogt AI's window. Staff "reset Hanogt AI
limit" resets both.

Every answer of `/api/ai` (also a failed one that was counted) reports the
window it counted in (`QUOTA_HEADERS` in `src/lib/ai/usage.ts`). These headers
replace the old `X-Hanogt-AI-Day-*` ones:

| Header | Meaning |
| --- | --- |
| `X-Hanogt-AI-Quota` | `hanogt` (Hanogt AI's window) or `own` (own connections, a day) |
| `X-Hanogt-AI-Window-Limit` | Messages in the window, a staff grant included |
| `X-Hanogt-AI-Window-Remaining` | Left in the current window |
| `X-Hanogt-AI-Window-Reset` | ISO time the window starts afresh |
| `X-Hanogt-AI-Window-Days` | How many days the window lasts (7 or 14; 1 for own connections) |

A refused message is `429` with `{ error, code, quota, plan, limit, used,
resetsAt, windowDays, upgrade }` (`code`: `rate_limited`, `usage_limit` or
`connection_daily_limit`; `upgrade`: the plan that raises it, or null on Pro)
and `Retry-After`. The browser still understands the `daily_limit` code of
servers from before 0.3.18.

`GET /api/ai/usage` (signed in, `no-store`, a per-instance guard instead of a
database write) returns the plan, Hanogt AI's window and minute (`limit`,
`used`, `remaining`, `resetsAt`) with `windowDays` and the staff grant
(`bonus`), and the own connections' day and minute (null on Free). It looks
up a purchase Paddle never reported (throttled), so someone who pays and comes
straight to Hanogt AI sees the new plan. The meter (`UsageMeter.tsx`,
`usage-store.ts`) sits in the /ai top bar and the floating panel's header
("This week 12 / 50", "These 2 weeks …"): amber from 80 %, red at the limit;
its card shows when the count renews, the minute limit, the grant, the own
connections and a way to a bigger plan. `GET /api/plans` returns the same
plus projects, games, groups and connections as `usage` for the Plans page
(`/plans#usage`).

## File map

| Area | Files |
| --- | --- |
| Server route | `src/app/api/ai/route.ts`, `src/app/api/ai/usage/route.ts` |
| Limits, usage and refunds | `src/lib/server/ai-usage.ts`, `src/lib/ai/usage.ts`, `src/lib/server/plans.ts` (`AI_LIMIT_KEYS`), `src/lib/server/rate-limit.ts` (`releaseFromWindow`), `src/lib/plans.ts` (`PLAN_AI_LIMITS`, `PLAN_AI_FEATURES`) |
| Prompt, provider, knowledge notes | `src/lib/server/hanogt-ai.ts` (`providerConfig`, `hanogtRequestBody`) |
| Thinking | `src/lib/ai/thinking.ts`, `src/components/HanogtAI/ThinkingPanel.tsx` |
| Answer stream (version 2) | `src/lib/ai/stream-protocol.ts`, `src/lib/server/hanogt-ai-stream.ts` |
| Settings | `src/lib/ai/ai-settings.ts`, `src/app/api/ai/settings/route.ts`, `src/components/HanogtAI/AiSettingsPage.tsx`, `ai-settings-store.ts`, `src/lib/ai/sign-out.ts`, `src/app/ai/settings/*` |
| Developer API, own connections page | `src/lib/ai/api-keys.ts`, `src/lib/server/ai-api-keys.ts`, `src/lib/server/hanogt-ai-api.ts`, `src/app/api/v1/**`, `src/app/api/ai/keys/route.ts`, `src/components/HanogtAI/AiApiPage.tsx`, `ApiKeysPanel.tsx`, `ApiDocs.tsx`, `ConnectionsManager.tsx`, `src/app/ai/api/*` (see [HANOGT_AI_API.md](HANOGT_AI_API.md)) |
| Feature audiences | `src/lib/features.ts`, `src/lib/server/features.ts`, `src/app/api/features/route.ts`, `src/components/Admin/FeaturesCard.tsx`, `src/components/HanogtAI/features-store.ts` |
| Voice | `src/lib/ai/voice.ts`, `src/components/HanogtAI/voice.ts` |
| Agent registry, validation, permissions, refusals | `src/lib/ai/agent-tools.ts` |
| Agent protocol (trailer for old tabs, history) | `src/lib/ai/agent-protocol.ts` |
| Core intent → action mapping | `src/lib/ai/agent-intents.ts`, `src/lib/ai/programs.ts` |
| Browser executors, settings | `src/lib/ai/agent-client.ts`, `src/lib/ai/agent-settings.ts` |
| Offline engine | `src/lib/ai/local-engine.ts`, `nlp.mjs`, `snippets.ts`, `concepts.ts`, `errors.ts`, `calc.ts` |
| Knowledge base + retrieval | `src/lib/ai/knowledge.ts`, `src/lib/ai/retrieval.ts` |
| Client streaming, conversations | `src/lib/ai/client.ts`, `src/lib/ai/conversations.ts` |
| The open editor file | `src/lib/ai/context-store.ts` (`publishAiContext`), `src/app/editor/page.tsx` |
| UI | `src/components/HanogtAI/*` (`HanogtAIChat`, `useHanogtChat`, `ChatSidebar`, `ChatComposer`, `ChatMessage`, `AgentCard`, `ArtifactPanel`, `WelcomeScreen`, `Markdown`, `HanogtAIDock`, `UsageMeter`, `usage-store`, `ThinkingPanel`, `SignInGate`), `src/app/ai/*` |
| Training | `ai/dataset/*`, `scripts/train-hanogt-ai.mjs`, `ai/reports/intent-training-report.md` |
| Code benchmark | `scripts/ai-eval/code-bench.mjs`, `bench-lib.mjs`, `bench-tasks.mjs`, `ai/reports/code-bench*` |
| Fine-tuning | `training/build-dataset.mjs`, `train_lora.py`, `merge_and_export.py`, `requirements.txt`, `README.md` |
| Tests | `scripts/tests/ai-agent.test.mjs`, `scripts/tests/ai-model.test.mjs`, `scripts/tests/ai-usage.test.mjs`, `scripts/tests/hanogt-ai.test.mjs`, `scripts/tests/features.test.mjs`, `scripts/tests/ai-settings.test.mjs`, `scripts/tests/ai-api.test.mjs`, `scripts/tests/voice.test.mjs`, `scripts/tests/core-concepts.test.mjs`, `scripts/tests/snippets-run.test.mjs`, `scripts/tests/code-bench.test.mjs`, `scripts/tests/training-dataset.test.mjs` (`npm test`) |
