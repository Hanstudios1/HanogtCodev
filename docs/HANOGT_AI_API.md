# Hanogt AI API

An OpenAI-compatible subset of the chat completions API, so apps, bots and
scripts can call Hanogt AI with a key. Keys are made on **/ai/api** (the 🔑
button above the chat). The page also holds the person's own provider
connections ("Your own keys"), which are a different thing: those send chat
messages with the person's key to OpenAI, Anthropic Claude, Google Gemini,
Mistral AI, OpenRouter, DeepSeek, xAI Grok or Together AI. Groq is no longer
supported there: Groq connections made earlier are listed as *No longer
supported* and can only be deleted (they don't count toward the plan's
connections). Messages through those connections use the same Hanogt AI
allowance as the chat and this API (no separate limit since 0.3.24).

The API is behind the `ai_api` feature (Admin › Subscriptions › Features and
early access), open to everyone by default: every Plus and Pro account can
make keys. The team can narrow it to early access or staff, or switch it off;
then `/api/v1` answers 403 `feature_unavailable` and the page says the API
isn't on for the account. The rules for using it are in the Terms of Use
(`/terms-of-use#ai-api`, legal 4.5; the shared allowance since 4.7).

## Plans

| | Free | Plus | Pro |
| --- | --- | --- | --- |
| Keys | – | 2 | 5 |
| Messages a minute (chat and API together) | – | 20 | 30 |
| Messages in the window (chat and API together) | – | 750 in 14 days | 2,000 in 7 days |
| Longest answer (`max_tokens`) | – | 3,000 | 4,000 |
| Thinking budget on top of it | – | 2,000 | 3,000 |

The API has no quota of its own any more. Every `POST /chat/completions` is
one Hanogt AI message (source `api`), counted per account (all keys together)
in the same minute guard and plan window as the chat (`ai:{email}` /
`ai-window:{email}`); the window opens with the first message and a staff
grant adds to it. A request the model couldn't answer at all (unreachable,
too slow, an error, an empty answer) is given back while the same window is
still open. Only `POST /chat/completions` counts. After a downgrade the oldest
keys within the new allowance keep working; the others answer `key_inactive`
until the person revokes some or upgrades. The values live in
`PLAN_AI_LIMITS` and `PLAN_AI_FEATURES` (`src/lib/plans.ts`).

## Requests

Base URL: `https://hanogtcodev.com/api/v1`. Every request sends
`Authorization: Bearer hnk_…`. Session cookies are ignored, and there are no
CORS headers: the key belongs on a server, not in a browser or a mobile app.

```bash
curl https://hanogtcodev.com/api/v1/chat/completions \
  -H "Authorization: Bearer $HANOGT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"hanogt-ai","messages":[{"role":"user","content":"Merhaba!"}]}'
```

```js
import OpenAI from "openai";

const client = new OpenAI({ apiKey: process.env.HANOGT_API_KEY, baseURL: "https://hanogtcodev.com/api/v1" });
const stream = await client.chat.completions.create({ model: "hanogt-ai", messages: [{ role: "user", content: "Merhaba!" }], stream: true });
for await (const chunk of stream) process.stdout.write(chunk.choices[0]?.delta?.content ?? "");
```

| Endpoint | |
| --- | --- |
| `POST /chat/completions` | A chat answer (`chat.completion`), or with `stream: true` server-sent `chat.completion.chunk` events ending with `data: [DONE]`. |
| `GET /models`, `GET /models/hanogt-ai` | The one model. |
| `GET /usage` | The account's Hanogt AI messages in the current minute and in the plan's window (chat and API together), and its key count. Not counted itself. |

```json
{
  "object": "usage",
  "plan": "plus",
  "requests": {
    "minute": { "limit": 20, "used": 1, "remaining": 19, "resets_at": "2026-10-05T10:01:00.000Z" },
    "window": { "limit": 750, "used": 42, "remaining": 708, "resets_at": "2026-10-12T09:30:00.000Z", "days": 14 }
  },
  "keys": { "used": 1, "limit": 2 }
}
```

`resets_at` is null while no window is open.

`POST /chat/completions` accepts:

- `model`: optional, `"hanogt-ai"` only (anything else: 404 `model_not_found`).
- `messages`: `system`, `developer`, `user` and `assistant` messages with
  text content (a string or text parts), at most 50 messages and 100,000
  characters, ending with the user. System and developer texts are joined
  (at most 4,000 characters) and go into the prompt after Hanogt AI's own
  rules, as data inside `<developer_instructions>`: they can't change the
  rules, the identity or the safety limits.
- `stream`, `temperature` (0–2), `top_p` (0–1), `stop` (up to 4 strings),
  `max_tokens` or `max_completion_tokens` (never more than the plan's).
- Hanogt extras: `mode` (`general`, `code`, `security`) and `language` (a
  two-letter code for the answer's language; default `en`).
- `include_reasoning: true` (or `reasoning: true`, or a `reasoning` object
  without `exclude: true`): the model thinks first and its thinking comes back
  as `message.reasoning_content`, or as `delta.reasoning_content` chunks
  before the text when streaming. Without it the model still thinks in `code`
  and `security` mode and for long messages (400 characters or more), but the
  thinking isn't returned. A thinking request uses `temperature` 0.6 and
  `top_p` 0.95 unless the request sets them, and gets the plan's thinking
  budget on top of `max_tokens`. Thinking sent back in later requests (a
  leading `<think>…</think>` block in an assistant message) is removed.
- Refused with 400 `unsupported_parameter`: `tools`, `functions`,
  `function_call`, `tool_choice` other than `"none"`, `n` > 1, audio,
  images, `response_format` other than text. Other OpenAI parameters
  (`user`, `seed`, penalties, `stream_options`…) are ignored.

Answers never carry the provider's ids or model name. Every answer after the
request was counted has `x-ratelimit-limit-requests`,
`x-ratelimit-remaining-requests`, `x-ratelimit-reset-requests` (the minute,
e.g. `42s`) and `x-hanogt-ratelimit-limit-window`,
`x-hanogt-ratelimit-remaining-window`, `x-hanogt-ratelimit-reset-window` (ISO
time the window starts afresh) and `x-hanogt-ratelimit-window-days` (7 or 14):
the plan's window, shared with the chat. They replace the old
`x-hanogt-ratelimit-*-day` headers. A 429 has `Retry-After`.

## Errors

OpenAI's shape: `{ "error": { "message", "type", "code", "param" } }`.

| Status | `code` | |
| --- | --- | --- |
| 401 | `missing_api_key`, `invalid_api_key` | No key, a malformed, unknown or revoked key, or a deleted account. |
| 403 | `account_suspended`, `plan_required`, `key_inactive`, `feature_unavailable` | |
| 400 | `invalid_request`, `unsupported_parameter` | `param` names the field. |
| 404 | `model_not_found` | |
| 413 | `context_length_exceeded` | Messages or the system text too long. |
| 429 | `rate_limit_exceeded` | The minute guard or the plan's window (both shared with the chat), one address sending more than 300 requests a minute, or the model's host is busy (`Retry-After: 5`). |
| 424 | `upstream_error` | The model failed or sent an empty answer (never 502/504: Cloudflare would replace the body). |
| 503 | `service_unavailable` | The database or the model can't be reached, the model took too long, or Hanogt AI isn't configured (`HANOGT_AI_*`, checked before counting). |

A counted request the model didn't answer (a 424 or 503, a busy host's 429,
or a stream without any text) is given back to the window.

A stream that fails midway ends with an error event and `data: [DONE]`.

## Keys

- Format: `hnk_` + 32 random bytes in URL-safe base64 (47 characters). Shown
  once when made; only its SHA-256 is stored.
- `ai_api_keys/{email}` = `{ items: [{ id, name, hash, start, last4, createdAt }] }`
  and `ai_api_key_index/{sha256}` = `{ email, id, createdAt, lastUsedAt }`.
  Making and revoking write both in one commit; the list is written with an
  update-time precondition, so two tabs can't go past the allowance.
  `lastUsedAt` is written at most every ten minutes, only while the entry
  exists. Both collections are closed to browsers (`firestore.rules`).
- A request is checked cheapest first: the header's form (nothing is read
  for a malformed key), 300 requests a minute per address, the index entry,
  then the account (gone: 401, suspended: 403), its plan, the key within the
  allowance and the `ai_api` feature for the account. The body is checked
  before the request is counted.
- `/api/ai/keys` (session, same origin, 20 changes a minute): `GET` the
  state, `POST { action: "create", name? }` (the key in the answer, once),
  `POST { action: "revoke", id }`.
- Staff see the key count on Admin › Subscriptions › person and can revoke
  all of them (`ai_api.revoke_all` in the audit log). Deleting the account
  removes the keys and every index entry naming it; the data export lists
  names, the first and last characters and dates, never a key or a hash.

## Files

| File | |
| --- | --- |
| `src/lib/ai/api-keys.ts` | Shared types, limits and error codes (client-safe). |
| `src/lib/server/ai-api-keys.ts` | Keys: make, list, revoke, find, note use, export, delete. |
| `src/lib/server/hanogt-ai-api.ts` | Who is calling, the request body, counting, OpenAI's answer and stream shapes. |
| `src/lib/server/ai-usage.ts` | The minute guard and window shared with the chat, and giving a message back. |
| `src/lib/ai/thinking.ts` | Splitting the thinking from the answer (shared with the chat). |
| `src/app/api/v1/**` | The routes (thin). |
| `src/app/api/ai/keys/route.ts` | Key management for the signed-in account. |
| `src/components/HanogtAI/AiApiPage.tsx`, `ApiKeysPanel.tsx`, `ApiDocs.tsx`, `ConnectionsManager.tsx` | The /ai/api page. |
| `src/lib/server/api-reachability.ts` | Cloud Health's outside check through Cloudflare. |
| `scripts/tests/ai-api.test.mjs`, `scripts/tests/api-reachability.test.mjs` | Unit tests. |

## Cloudflare

Cloudflare's WAF and bot protection can answer requests that don't come from
a browser with a challenge page; API clients then never reach `/api/v1`, even
though the site works in a browser. Admin › Cloud Health checks this ("Outside
access to the Hanogt AI API", `src/lib/server/api-reachability.ts`): the
server asks its own public `/api/v1/models` without a key, like an API client
(no redirects followed), and expects our 401 `missing_api_key`. A
`cf-mitigated` header or a Cloudflare HTML page is a failure; a redirect or
another page is a warning.

The fix, in the Cloudflare dashboard:

- The free plan's **Bot Fight Mode** can't be skipped for a path (it doesn't
  run on the Ruleset Engine); if it is on, turn it off (Security › Bots).
  **Super Bot Fight Mode** on paid plans can stay on and be skipped.
- Security › WAF › Custom rules: `URI Path` starts with `/api/v1/` → **Skip**
  the remaining custom rules, rate limiting rules, managed rules, Super Bot
  Fight Mode rules and Browser Integrity Check; put it at the top. The same
  rule can cover `/api/paddle/webhook`.

The API keeps its own checks either way (key, plan, per-address and
per-account limits).
