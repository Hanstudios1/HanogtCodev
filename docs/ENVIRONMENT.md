# Environment variables

Every variable below is read on the server unless its name starts with
`NEXT_PUBLIC_`, which is exposed to the browser. The app is designed to degrade
gracefully: with none of these set, code still runs in the browser and Hanogt
AI answers with its offline Core; features that need a backend simply report
that they are not configured.

## Authentication (NextAuth)

| Variable | Required | Meaning |
| --- | --- | --- |
| `NEXTAUTH_SECRET` | yes (prod) | Signs session cookies and tokens. Also the default key for rate-limit hashing and 2FA secret encryption. |
| `NEXTAUTH_URL` | yes (prod) | Canonical site URL used by the OAuth callback. |
| `AUTH_SECRET` | optional | Accepted as a fallback for `NEXTAUTH_SECRET`. |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | optional | Enables "Sign in with Google". Leading/trailing whitespace is trimmed. |

## Two-factor authentication

| Variable | Required | Meaning |
| --- | --- | --- |
| `TOTP_ENCRYPTION_KEY` | optional | Key material for encrypting TOTP secrets at rest (AES-256-GCM) and hashing recovery codes (HMAC-SHA256). Falls back to `NEXTAUTH_SECRET`/`AUTH_SECRET`. Set a dedicated value in production so rotating the auth secret does not invalidate everyone's authenticator. |

See [two-step verification](#) in Account Settings → Security. Secrets and
recovery-code hashes live only in the server-only `credentials/{email}`
document; the browser never receives them.

## Firebase — client (browser)

Enables Firestore reads/writes under the security rules. Without these, the app
runs in a local-only mode. Copy the values from Firebase Console → Project
settings → General → Your apps → (web app) → `firebaseConfig`; the owner's
Cloud Health panel also shows them (see below).

| Variable | Notes |
| --- | --- |
| `NEXT_PUBLIC_FIREBASE_API_KEY` | Web API key (`AIza…`, 39 characters). Not a secret, but its HTTP-referrer/API restrictions must allow the site and the Identity Toolkit API. |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | `<project>.firebaseapp.com`, without `https://` or `/`. |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | Must be the same project as the server service account. |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | Web app ID (`1:<number>:web:<hash>`). |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | Bucket name without `gs://`. |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | Optional; the project number. |

### Build time vs. runtime

`NEXT_PUBLIC_*` values are inlined into the browser bundle **at build time**.
Vercel also keeps a separate set of variables per environment
(**Production**, **Preview**, **Development**): a value set only for
Production is missing in Preview deployments, and a value added or changed
later is not in any deployment built before. After every change, redeploy
(Deployments → … → Redeploy) and make sure the variable is ticked for the
environment you open.

To keep the site working until then, the root layout loads
`/api/firebase/config` before the app starts (`next/script`,
`beforeInteractive`; not in the Electron static export). The route returns
`window.__HANOGT_FIREBASE__ = {…}` with only the six public fields above and a
`source`:

- `env`: the `NEXT_PUBLIC_FIREBASE_*` values read **at request time** (by name,
  so the build-time inlining doesn't apply);
- `management-api`: used when those values are missing, invalid or belong to
  another project than the server service account; the project's web-app
  config is then read from the Firebase Management API with the service
  account (cached per server instance for an hour, failures for five minutes);
- `null` when neither is available.

The response is cacheable (`public, max-age=300, s-maxage=300`) and never
contains secrets. `src/lib/firebase.ts` prefers a usable runtime config over
the build-time values and exposes which one it used (`firebaseConfigSource`).
The fallback needs the service account to read the project's web apps; if
Cloud Health reports a permission error for this step, grant the service
account *Firebase Viewer* (or *Firebase Admin*) in Google Cloud IAM. It is a
safety net: still fix the Vercel values and redeploy, because server rendering
and the Electron build use the build-time values.

### When the browser can't connect

The browser signs in to Firebase with a custom token from
`/api/auth/firebase-token` (minted with the server service account). Account
Settings, Editor Settings sync and Hanogt AI's account answers go through API
routes instead, so they keep working when that browser connection fails. The
warning shown in that case gives everyone a short **error code** with a copy
button (for example `config-missing`, `token-503`,
`auth/configuration-not-found`, `auth/invalid-custom-token`,
`firestore/permission-denied`) plus details (the technical message, the
configuration source and project); staff also see the exact cause and owners a
link to Cloud Health.

## Firebase — server (Admin REST)

Used for server-side reads/writes and for minting the custom tokens that bridge
a NextAuth session to Firebase. Provide the service account in any one form:

| Variable | Meaning |
| --- | --- |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Full service-account JSON (string). Tried first. |
| `FIREBASE_SERVICE_ACCOUNT_BASE64` | The same JSON, base64-encoded on one line (`base64 -w0 service-account.json`). The older name `FIREBASE_SERVICE_ACCOUNT_BASE` is still accepted. |
| `FIREBASE_PROJECT_ID` + `FIREBASE_CLIENT_EMAIL` + `FIREBASE_PRIVATE_KEY` | The three fields individually (`\n` escapes in the key are handled; the project id can also come from the service-account e-mail). `FIREBASE_ADMIN_*` names work too. |
| `FIREBASE_STORAGE_BUCKET` | Optional Storage bucket (older voice messages; falls back to `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`). |

Every variable that is set is tried in order and the first usable key wins,
so a broken variable doesn't hide a working one. Pasting is forgiving
(`src/lib/server/service-account.ts`): the JSON may be wrapped in quotes,
encoded twice, base64-encoded, nested (`{"serviceAccount": {…}}`), use
camelCase names (`projectId`, `clientEmail`, `privateKey`) or come from a
`.env` line; the key's PEM is rebuilt, so lost line breaks don't matter. The
names `FIREBASE_SERVICE_ACCOUNT`, `FIREBASE_SERVICE_ACCOUNT_KEY`,
`FIREBASE_ADMIN_CREDENTIALS`, `GOOGLE_APPLICATION_CREDENTIALS_JSON`,
`GOOGLE_CREDENTIALS` and pasted JSON in `GOOGLE_APPLICATION_CREDENTIALS` are
read as well. When nothing works, the sign-in page and Cloud Health say what
the variable holds instead: a web-app config (`apiKey`), Android
`google-services.json`, an OAuth client file, user credentials or which
fields are missing.

Create the key in Firebase Console → Project settings → Service accounts →
Generate new private key. The default `firebase-adminsdk-…` account already has
the roles the site needs; one-click rules deployment (below) additionally needs
**Firebase Rules Admin**.

## Diagnostics: Cloud Health (owners)

Admin Panel → **Cloud Health** (`/admin#cloud`, owners only;
`GET /api/admin/cloud`) checks the whole chain and shows, for every failing
step, what to change and where:

1. client config (`NEXT_PUBLIC_FIREBASE_*` present and well formed; only a key prefix is shown),
2. server credentials (which variable layout is used, project id, service-account e-mail),
3. client project = service-account project,
4. the configuration the browser will use (what `/api/firebase/config` serves: the deployment's variables or the config read from Firebase), and whether the `NEXT_PUBLIC_*` values changed after the build,
5. Google OAuth token,
6. Firestore REST read (also detects a missing database or disabled API),
7. Firebase Authentication initialised (`CONFIGURATION_NOT_FOUND` → Firebase Console → Authentication → Get started),
8. an end-to-end copy of the browser's `signInWithCustomToken` request with the site's `Referer` and the configuration from step 4, so Google's own error (`INVALID_CUSTOM_TOKEN`, `CREDENTIAL_MISMATCH`, `API_KEY_HTTP_REFERRER_BLOCKED`, …) is visible,
9. the deployed security rules letting a user read `users/{email}`,
10. deployed vs. repository `firestore.rules` / `storage.rules` (SHA-256),
11. the storage bucket.

When the client config is missing or wrong it also lists the correct values
from the Firebase Management API, ready to paste into Vercel. `/api/health/auth`
remains as a lightweight, secret-free sign-in check (details for owners or with
`?token=HEALTH_CHECK_TOKEN`).

## Security rules deployment

`firestore.rules` and `storage.rules` are not deployed by Vercel. Deploy them
after every change, either

- with **Cloud Health → Deploy security rules** (owner only, written to the
  audit log; identical files are skipped; the service account needs the
  *Firebase Rules Admin* role), or
- from a computer: `firebase deploy --only firestore:rules,storage`.

Voice messages no longer depend on Cloud Storage or `storage.rules`:
browsers upload and play them through `/api/social/voice`, which checks the
friendship or group membership and keeps the recording in the server-only
Firestore collection `voice_clips` (Cloud Storage needs Firebase's Blaze
plan). Recordings made before that are still played from the bucket when one
is configured.

## Hanogt Social: voice calls and voice messages

A TURN relay lets calls connect on networks that block direct connections.
The first configured option is used (`src/lib/server/turn.ts`):

| Variable | Meaning |
| --- | --- |
| `CLOUDFLARE_TURN_KEY_ID`, `CLOUDFLARE_TURN_KEY_API_TOKEN` | **Secret.** Cloudflare Realtime TURN (Cloudflare dashboard → Realtime → TURN Server → Create; 1,000 GB a month free). Credentials valid for an hour are generated per call. |
| `TURN_SERVER_URL` | Your own relay's URL(s), comma separated (e.g. `turn:turn.example.com:3478,turns:turn.example.com:5349?transport=tcp`). |
| `TURN_SHARED_SECRET` | **Secret.** coturn's TURN REST secret (`use-auth-secret` + `static-auth-secret`); the username is an opaque hash, never the e-mail address. |
| `TURN_USERNAME`, `TURN_CREDENTIAL` | **Secret.** Fixed credentials of a TURN provider (with `TURN_SERVER_URL`). |
| `FIREBASE_STORAGE_BUCKET` | Optional: only for playing voice messages recorded before they moved to Firestore. |

Admin Panel → Cloud Health shows whether TURN is set up and can test the
relay from the owner's browser.

Call signalling goes through `/api/calls` (the server writes `calls/{id}` after
checking the friendship), so calls work even when the browser's Firebase
bridge fails; with the bridge, browsers only add realtime listeners (ringing
and call updates), otherwise they poll. Audio is peer to peer (DTLS-SRTP, also
through a relay). Without TURN only public STUN servers are used: calls
connect on most home networks but fail between symmetric NATs (many mobile
carriers, company and school networks), and the call bar says so. A call
always starts with the microphone and sound on; the call bar names the reason
when nobody can be heard (microphone off, the other side muted, playback
blocked, no audio arriving, a silent microphone).

## Hanogt AI

See [docs/HANOGT_AI.md](./HANOGT_AI.md) for the full picture.

| Variable | Default | Meaning |
| --- | --- | --- |
| `HANOGT_AI_API_KEY` | – | API key (falls back to `GROQ_API_KEY`). |
| `HANOGT_AI_BASE_URL` | `https://api.groq.com/openai/v1` | OpenAI-compatible endpoint. http allowed only to loopback. |
| `HANOGT_AI_MODEL` | `llama-3.3-70b-versatile` | Model id (falls back to `GROQ_MODEL`). |
| `AI_KEYS_ENCRYPTION_KEY` | – | **Secret.** Encrypts (AES-256-GCM) the API keys Plus/Pro members connect in Hanogt AI (`ai_connections/{email}`; Plus 2, Pro 5 connections). Falls back to `TOTP_ENCRYPTION_KEY`, then `NEXTAUTH_SECRET`/`AUTH_SECRET`. Set a dedicated value before launch and don't change it: stored keys become unreadable and people have to add their connections again. |

## Payments (Paddle Billing)

Plus ($20/month, $200/year) and Pro ($100/month, $1,000/year) are sold through
[Paddle](https://www.paddle.com/), the Merchant of Record: Paddle runs the
checkout, takes the payment, issues invoices, handles taxes and refunds. Card
details never reach Hanogt Codev. Code: `src/lib/paddle.ts` (shared),
`src/lib/server/paddle.ts` (API client, webhook, sync), `src/lib/server/paddle-config.ts`
(variables), `/api/paddle/*` routes, the Plans page (`src/app/plans`) and
Admin Panel > Subscriptions > Paddle.

| Variable | Secret | Meaning |
| --- | --- | --- |
| `PADDLE_API_KEY` | **yes** | Server API key (`pdl_sdbx_apikey_…` sandbox, `pdl_live_apikey_…` live). Paddle > Developer tools > Authentication > API keys. Permissions: write for Customers, Transactions, Subscriptions, Discounts, Customer portal sessions and Products/Prices (only needed for the "create catalog" button); read for the rest, including Client-side tokens (`client_token.read`), which lets the Paddle card check that `NEXT_PUBLIC_PADDLE_CLIENT_TOKEN` belongs to the same account. Never put it in a `NEXT_PUBLIC_` variable. |
| `NEXT_PUBLIC_PADDLE_CLIENT_TOKEN` | no | Client-side token for Paddle.js (`test_…` sandbox, `live_…` live). Developer tools > Authentication > Client-side tokens. `PADDLE_CLIENT_TOKEN` works too. |
| `PADDLE_WEBHOOK_SECRET` | **yes** | Secret key (`pdl_ntfset_…`) of the notification destination below. `PADDLE_NOTIFICATION_WEBHOOK_SECRET` works too. |
| `NEXT_PUBLIC_PADDLE_ENV` | no | Only for keys created before May 2025 (no prefix): `sandbox` or `production`. Otherwise the environment follows the key prefixes and a conflicting value is reported in the Admin Panel. |
| `PADDLE_TESTER_EMAILS` | no | Comma-separated accounts that may buy while sales are closed (staff always can). |
| `PADDLE_LINK_SECRET` | yes | Optional key for signing checkout custom data (defaults to `NEXTAUTH_SECRET`). |
| `PADDLE_API_BASE_URL` | no | Tests only: a loopback address of a fake Paddle API. Anything else is ignored. |

Sandbox and live are separate Paddle accounts with different ids. The price
mapping, Paddle customers and subscriptions are stored per environment, so
switching the three variables from sandbox to live values never lets a sandbox
test purchase unlock anything in live.

### Setting it up (sandbox first, then live)

1. **Vercel** > Project > Settings > Environment Variables: add the variables
   above (Production; Preview too if you test there) and redeploy.
2. **Notifications**: Paddle > Developer tools > Notifications > New destination,
   URL `https://<your domain>/api/paddle/webhook`, events `subscription.*` and
   `transaction.completed`. Copy its secret key into `PADDLE_WEBHOOK_SECRET`.
   Reuse an existing destination; recreating one rotates the secret.
3. **Default payment link**: Paddle > Checkout > Checkout settings >
   `https://<your domain>/plans` (must be an approved domain, not localhost).
4. **Catalog**: Admin Panel > Subscriptions > Paddle > "Paddle kataloğunu oluştur"
   creates the Plus/Pro products and the four USD prices in the configured
   environment (only what is missing; it never changes or archives anything)
   and maps them. Or create them in Paddle > Catalog and pick them in the card.
5. **Test**: sales are closed by default, so only staff and
   `PADDLE_TESTER_EMAILS` can buy. In sandbox use a Paddle test card
   (4242 4242 4242 4242, any future date, CVC 100). Within seconds the plan is
   active on the Plans page, "Aboneliği yönet" opens Paddle's portal and the
   card shows the last webhook.
6. **Go live**: create the live API key, client-side token and notification
   destination in the live account, replace the three variables, redeploy,
   create/map the live catalog in the card, request domain approval
   (Paddle > Checkout > Request domain approval), add payment methods
   (Checkout > Checkout settings > Payment methods) and payout details
   (Business account > Payouts), then open sales in the card once verification
   is approved.

### Webhook security

`/api/paddle/webhook` accepts a delivery only if it comes from one of
Paddle's published addresses (`GET https://api.paddle.com/ips`, or the sandbox
API, `data.ipv4_cidrs`, cached for an hour; requests are refused while the list
can't be fetched) **and** carries a valid `Paddle-Signature`
(HMAC-SHA256 of `ts:raw body`, ±5 minutes). Subscriptions are then re-read
from the API, so the order of deliveries doesn't matter. Paddle retries on any
non-2xx answer. If Paddle's dashboard shows failed deliveries with 403, check
that nothing (a proxy, Vercel's firewall) replaces the client address.

### Troubleshooting

- Admin Panel > Subscriptions > Paddle lists missing variables, wrong formats,
  a sandbox key with a live token (or the other way round), secrets in
  `NEXT_PUBLIC_` variables, API errors with Paddle's error code and the last
  accepted/refused webhook.
- A subscription Paddle reports for a customer we don't know appears under
  "Eşleşmeyen abonelikler" and can be linked to an account there.
- Deleting an account cancels its subscription immediately; if Paddle can't be
  reached the deletion report says so and the subscription is listed in
  `paddle_cleanup`.
- If the Plans page says the checkout couldn't load, start or open, the browser
  reports why (`POST /api/paddle/client-error`: blocked, missing, init, open,
  or Paddle's `checkout.error`/`checkout.failed`/`checkout.payment.error`, with
  the refused address, the browser and the environment, never the account).
  The Paddle card lists the newest ten under "Son ödeme ekranı hataları" and
  checks that the client-side token exists in the API key's account
  (`missing` = another Paddle account or the other environment). The team,
  testers and sandbox visitors also see the technical detail on the page. The
  CSP allows `https://*.paddle.com` and Paddle Retain (`public.profitwell.com`,
  `*.profitwell.com`).
- If the Plans page says a checkout (or another subscription action) failed,
  the notice ends with an error code line, e.g.
  `Hata kodu: unavailable/database_error · HTTP 503 · subscription · 2.1 s`:
  the route's error and code, the HTTP status, Paddle's status when Paddle was
  called, the step (`catalog`, `settings`, `subscription`, `customer`,
  `transaction`, `portal`, `preview`, `change`, `keep`) and how long it took.
  The routes log the same line (`[paddle:checkout]` in the Vercel logs) and
  keep the newest ten under "Son sunucu hataları" in the Paddle card, with
  Paddle's explanation or our error message (never the account). Codes:
  `timeout`/`network_error` (Paddle didn't answer in 8 s / couldn't be
  reached), `unexpected_response` (Paddle's answer wasn't JSON), Paddle's own
  codes (e.g. `forbidden`: the API key lacks a permission),
  `database_error` (a Firestore read or write failed: quota, permissions or an
  outage; see Cloud Health) and `internal_error` (look the time up in the
  Vercel logs). When no answer from our code arrives at all (`timeout · HTTP
  504` is Vercel's time limit, `network` a dropped connection or a browser
  extension), the browser reports it as stage `request` under "Son ödeme
  ekranı hataları". Failures on the way (no answer, 5xx, a Paddle timeout) are
  retried once by the page before anything is shown; the checkout route allows
  10 attempts a minute per account and the billing routes may run 60 seconds
  (`maxDuration`).

## Administration

| Variable | Meaning |
| --- | --- |
| `ADMIN_EMAILS` | Comma/semicolon/space-separated list of **owner** e-mails. Owners get the full Admin Panel (`/admin`) and can grant the `admin`/`moderator` roles (stored server-side in `users/{email}.role`, never writable by clients). |
| `HEALTH_CHECK_TOKEN` | If set (≥16 chars), `/api/health/auth?token=…` returns the full auth diagnostics. Signed-in owners (built-in or `ADMIN_EMAILS`) can also see it. Without either, the endpoint returns only a bare ok/not-ok. Owners get the complete diagnosis in Admin Panel → Cloud Health. |

## Code runner (optional)

| Variable | Meaning |
| --- | --- |
| `CODE_RUNNER_URL` | Self-hosted runner for the compiled languages. If unset, those languages use the public Wandbox compiler after the Hanogt Security Bot scan. Browser languages (JS/TS/Python/SQL/Lua and more) never need it. |
| `RATE_LIMIT_SALT` | Extra salt for rate-limit key hashing (falls back to `NEXTAUTH_SECRET`). |

## Local development with the Firebase Emulator Suite

Set these to point the server at a local emulator (loopback only — production
can never be redirected). The client reads `NEXT_PUBLIC_FIREBASE_EMULATOR_HOST`.

| Variable | Example |
| --- | --- |
| `FIRESTORE_EMULATOR_HOST` | `127.0.0.1:8080` |
| `FIREBASE_AUTH_EMULATOR_HOST` | `127.0.0.1:9099` |
| `FIREBASE_STORAGE_EMULATOR_HOST` | `127.0.0.1:9199` |
| `NEXT_PUBLIC_FIREBASE_EMULATOR_HOST` | `127.0.0.1` |

With the emulators running, `npm run test:rules` exercises `firestore.rules`
(needs Java 17+ and the `@firebase/rules-unit-testing` dev dependency).
