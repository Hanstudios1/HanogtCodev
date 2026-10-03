# Hanogt AI API

An OpenAI-compatible subset of the chat completions API, so apps, bots and
scripts can call Hanogt AI with a key. Keys are made on **/ai/api** (the 🔑
button above the chat). The page also holds the person's own provider
connections ("Your own keys"), which are a different thing: those send chat
messages to OpenAI, Claude, Gemini… with the person's key.

The API is behind the `ai_api` feature (Admin › Subscriptions › Features and
early access), open to everyone by default: every Plus and Pro account can
make keys. The team can narrow it to early access or staff, or switch it off;
then `/api/v1` answers 403 `feature_unavailable` and the page says the API
isn't on for the account. The rules for using it are in the Terms of Use
(`/terms-of-use#ai-api`, legal 4.5).

## Plans

| | Free | Plus | Pro |
| --- | --- | --- | --- |
| Keys | – | 2 | 5 |
| Requests a minute | – | 10 | 30 |
| Requests in 24 hours | – | 250 | 1,000 |
| Longest answer (`max_tokens`) | – | 3,000 | 4,000 |

Requests are counted per account (all keys together) in a minute window and
a 24-hour window that starts with the first request
(`ai-api:{email}` / `ai-api-day:{email}`), separately from chat messages.
Only `POST /chat/completions` counts. After a downgrade the oldest keys
within the new allowance keep working; the others answer `key_inactive`
until the person revokes some or upgrades. The values live in
`PLAN_AI_FEATURES` (`src/lib/plans.ts`).

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
| `GET /usage` | The account's requests in the current minute and 24 hours, and its key count. |

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
- Refused with 400 `unsupported_parameter`: `tools`, `functions`,
  `function_call`, `tool_choice` other than `"none"`, `n` > 1, audio,
  images, `response_format` other than text. Other OpenAI parameters
  (`user`, `seed`, penalties, `stream_options`…) are ignored.

Answers never carry the provider's ids or model name. Every answer after the
request was counted has `x-ratelimit-limit-requests`,
`x-ratelimit-remaining-requests`, `x-ratelimit-reset-requests` (the minute)
and `x-hanogt-ratelimit-limit-day`, `-remaining-day`, `-reset-day` (the 24
hours); a 429 has `Retry-After`.

## Errors

OpenAI's shape: `{ "error": { "message", "type", "code", "param" } }`.

| Status | `code` | |
| --- | --- | --- |
| 401 | `missing_api_key`, `invalid_api_key` | No key, a malformed, unknown or revoked key, or a deleted account. |
| 403 | `account_suspended`, `plan_required`, `key_inactive`, `feature_unavailable` | |
| 400 | `invalid_request`, `unsupported_parameter` | `param` names the field. |
| 404 | `model_not_found` | |
| 413 | `context_length_exceeded` | Messages or the system text too long. |
| 429 | `rate_limit_exceeded` | The minute or 24-hour window, or one address sending more than 300 requests a minute. |
| 424 | `upstream_error` | The model failed (never 502/504: Cloudflare would replace the body). |
| 503 | `service_unavailable` | The database or the model can't be reached, or Hanogt AI isn't configured. |

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
