# Environment variables

Every variable below is read on the server unless its name starts with
`NEXT_PUBLIC_`, which is exposed to the browser. The app is designed to degrade
gracefully: with none of these set, code still runs in the browser and Hanogt
AI answers signed-in people with its offline Core; features that need a
backend simply report that they are not configured.

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
document; the browser never receives them. Codes are limited to 6 tries per
15 minutes and 20 a day per account; past the daily limit the owner of the
account gets a security notification and a `two_factor_attempts_exceeded`
security event is written.

## Sign-in security (no extra variables)

- **Password after Google.** When an account has a password (also one added
  later to a Google account), every Google sign-in is "pending" until the
  password, and the code when 2FA is on, is entered at `/login/verify`
  (`src/lib/step-up.ts`, `/api/auth/step-up`). A pending session is treated
  as signed out by every API route and expires after 15 minutes.
- **Forgotten password.** `/login/verify` files a high-priority "Şifre
  şartını kaldırma talebi" ticket (Tickets shows a "Şifre kurtarma" badge).
  Once you are sure the account is the sender's, remove the password in
  Admin Panel → Users → "Şifreyi kaldır" (needs a reason; audit log
  `user.remove_password`); a Google sign-in is then enough again.
- **Sessions.** `users/{email}.authVersion` signs earlier sessions out when it
  goes up: "Sign out all other sessions" in Account Settings, a password
  change and the first verified Google sign-in to an account whose address
  was never verified (which also removes that unverified password and 2FA).
  These also delete the Firebase Auth user, which ends every browser's
  realtime connection; signed-in browsers get a new one automatically.
  Setting the first password and deleting the account need a sign-in within
  the last 30 minutes.
- **Google accounts** whose address Google hasn't verified can't sign in.

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

Since 0.3.19 browsers can no longer write `users` or `public_profiles` (the
server writes both), list `public_profiles` or create `friendRequests`. The
app works with the older rules too, but deploy the new ones to close these.

Since 0.3.22 browsers can no longer write Hanogt Social messages
(`chats/*/messages`, `groups/*/messages`): every message goes through
`/api/social/dm` or `/api/groups/chat`, where friendship, membership, mutes,
slow mode and AutoMod are checked. **Deploy the rules after updating**; until
then the app works, but the old rules still let a browser write messages
directly and skip those checks. The new collections `message_stars`,
`group_mutes`, `group_warnings`, `group_reports`, `automod_events` and
`group_automod` are server-only.

Deploy `firestore.indexes.json` too (`firebase deploy --only firestore:indexes`,
or Firebase console → Firestore → TTL policies): it holds the TTL policies on
`expiresAt` that remove expired records automatically, now also for
`group_mutes` (when the mute ends), `group_warnings` and `group_reports`
(180 days) and `automod_events` (90 days). Without them these records stay
until someone deletes them, which the Privacy Policy doesn't allow.

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

**Screen sharing (1:1 calls, since 0.3.28).** The offer and the answer each
reserve a video track that carries nothing until someone shares; sharing
swaps the screen in with `replaceTrack`, so no renegotiation is needed, and
`POST /api/calls { action: "share" }` records who is sharing. Only the picture
goes (at most 1080p and 30 fps; 2.5 Mbit/s directly, 1.2 Mbit/s through TURN),
never the computer's sound. Phones have no screen capture, so they don't show
the button. The desktop app (`electron/main.js`) gives the microphone and
screen capture only to our own origins and shows a picker for the screen or
window; the Android (`RECORD_AUDIO`) and iOS (`NSMicrophoneUsageDescription`)
apps declare the microphone, so **rebuild the desktop and mobile apps** to
ship these.

**Group voice channels (since 0.3.28).** Every group has a voice channel for
up to 5 people, everyone connected to everyone (WebRTC mesh, the same TURN
settings). `/api/groups/voice` (`join`, `heartbeat`, `leave`, `signal`) keeps
who is in the channel in `group_voice/{groupId}` and passes offers, answers
and candidates through `group_voice/{groupId}/signals`, which only the
recipient can read; members follow both with Firestore listeners (polling
without the bridge) and only the server writes. Signals carry `expiresAt`:
the existing TTL policy on the `signals` collection group in
`firestore.indexes.json` removes the ones nobody read. A tab that stops
checking in for 30 seconds is dropped; leaving or being removed from the
group, a mute, account deletion and group deletion take people out.

## Hanogt Social: files in messages

Since 0.3.28 direct messages and group chats can carry one file each
(`POST /api/social/files`, served by `GET /api/social/files/{id}` to people
who can see the message). Files are stored in **Firestore**, not Cloud
Storage: `message_files/{id}` holds the file (in `parts/{n}` of 700 KB when
it is bigger) and `message_file_usage/{email}` each sender's total, both
server-only. Plans allow 2 / 4 / 4 MB a file and 25 MB / 250 MB / 1 GB in all
(Free / Plus / Pro, `PLAN_ATTACHMENT_LIMITS`).

- **Storage:** these files count towards the Firestore database's stored
  data. The Spark (free) plan includes 1 GiB for the whole database; beyond
  that the project needs Blaze, where storage is billed per GiB. Watch
  Firestore usage in the Firebase console as people start sending files.
- **Deploy the rules and indexes:** the rules close `message_files` and
  `message_file_usage`; `firestore.indexes.json` turns off indexing of the
  `data` field of `message_files` (index entries can't hold large byte
  values).
- Deleting a message, a chat, a group or an account deletes its files and
  gives the space back; “Download my data” lists the files a person sent.

## Hanogt Social: GIFs, bots and AutoMod

GIF search goes through `/api/social/gifs` (`src/lib/server/gifs.ts`), so the
key stays on the server and only the search text, page, language and content
rating reach the provider. Results are cached in memory for 10 minutes
(trending for 30) and only images on the provider's media hosts are accepted
in messages. Tenor's API was shut down on 30 June 2026, so it isn't offered.

| Variable | Meaning |
| --- | --- |
| `KLIPY_API_KEY` | **Secret.** KLIPY API key (klipy.com, free). Preferred when both keys are set. |
| `GIPHY_API_KEY` | **Secret.** GIPHY API key (developers.giphy.com → Create an App → API, not SDK). |
| `GIF_PROVIDER` | Optional: `klipy` or `giphy`, when both keys are set. |
| `GIF_RATING` | Optional content rating: `g`, `pg` (default) or `pg-13`. |

Without a key the GIF tab says GIF search isn't set up; emoji and stickers work
regardless. The picker shows "Powered by KLIPY/GIPHY" as the providers require.

Hanogt Security Bot, AutoMod and the slash commands need no variables. The
Hanogt AI group bot (`/ai`, `@Hanogt AI`) uses the same `HANOGT_AI_*` settings
as Hanogt AI (below); without them it answers that Hanogt AI isn't available
here. Its answer is written after the response, so `/api/groups/chat` declares
`maxDuration = 60`.

## Hanogt AI

See [docs/HANOGT_AI.md](./HANOGT_AI.md) for the full picture. Hanogt AI's
language model is the owner's own OpenAI-compatible endpoint, set only by the
three required `HANOGT_AI_*` variables below: there are no defaults and no
fallbacks.

| Variable | Default | Meaning |
| --- | --- | --- |
| `HANOGT_AI_BASE_URL` | – (required) | OpenAI-compatible base URL of Hanogt AI's own model: the Hugging Face router (`https://router.huggingface.co/v1`), a Hugging Face Inference Endpoint or your own vLLM server. https; plain http only to this machine (`localhost`, `127.0.0.1`, `[::1]`). |
| `HANOGT_AI_MODEL` | – (required) | Model id at that endpoint. On the Hugging Face router it must pin a provider, e.g. `Qwen/Qwen3-…:<provider>`; routing policies (`:fastest`, `:cheapest`, `:preferred`, `:auto`) and `:groq` are refused. |
| `HANOGT_AI_API_KEY` | – (required) | **Secret.** The endpoint's key (for Hugging Face, an access token that may call it). |
| `HANOGT_AI_EXTRA_BODY` | – | Optional JSON object (at most 4,000 characters) added to every request to Hanogt AI's own model (chat and `/api/v1`), for options your server understands, e.g. `{"top_k":20}`. The request's own fields (model, messages, tools, max_tokens, temperature…) always win; Hanogt AI sets Qwen3's `chat_template_kwargs.enable_thinking` itself and keeps any other `chat_template_kwargs` from here. An invalid value is ignored. |
| `HANOGT_AI_THINKING` | – | `preopened` when the model's chat template opens the `<think>` block itself: answers then start inside it and the thinking ends at `</think>` (an answer that ends normally without it was the answer, not thinking). Leave it unset otherwise. |
| `AI_KEYS_ENCRYPTION_KEY` | – | **Secret.** Encrypts (AES-256-GCM) the API keys Plus/Pro members connect in Hanogt AI (`ai_connections/{email}`; Plus 2, Pro 5 connections). Falls back to `TOTP_ENCRYPTION_KEY`, then `NEXTAUTH_SECRET`/`AUTH_SECRET`. Set a dedicated value before launch and don't change it: stored keys become unreadable and people have to add their connections again. |

Groq and Anthropic hosts (`groq.com`, `anthropic.com`) are refused as Hanogt
AI's model, and so is a model ending in `:groq`. When the variables are
missing or refused, `/api/ai` answers `503 not_configured` without counting
anything and the browser's Hanogt AI Core answers signed-in people; `/api/v1`
answers `503 service_unavailable`. Training and serving your own model:
[training/README.md](../training/README.md).

**No longer read — delete them from Vercel** (Settings → Environment
Variables): `GROQ_API_KEY` and `GROQ_MODEL` (the old fallbacks),
`ANTHROPIC_API_KEY` (it only switched on the removed advanced code engine;
people's own Anthropic keys are stored encrypted per account, not in a
variable), `HANOGT_AI_CLAUDE_MODEL`, `HANOGT_AI_CLAUDE_EFFORT` and
`ANTHROPIC_BASE_URL`.

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
| `PADDLE_API_KEY` | **yes** | Server API key (`pdl_sdbx_apikey_…` sandbox, `pdl_live_apikey_…` live). Paddle > Developer tools > Authentication > API keys. Permissions: write for Customers, Transactions, Subscriptions, Discounts, Customer portal sessions and Products/Prices (only needed for the "create catalog" button); read for the rest, including Client-side tokens (`client_token.read`), which lets the Paddle card check that `NEXT_PUBLIC_PADDLE_CLIENT_TOKEN` belongs to the same account, and Notification settings / Notifications (`notification_setting.read`, `notification.read`) for the card's "Bildirimleri kontrol et". Transactions and Subscriptions must be readable (`transaction.read`, `subscription.read`): a completed checkout is confirmed with them. Never put it in a `NEXT_PUBLIC_` variable. |
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

The sender's address (also used by every per-address rate limit) comes from
Vercel's `x-vercel-forwarded-for` (then `x-real-ip`, then the first hop of
`x-forwarded-for`). hanogtcodev.com is served through Cloudflare, so that
address is one of Cloudflare's edges; when it is inside Cloudflare's published
ranges (`CLOUDFLARE_CIDRS` in `src/lib/server/request-security.ts`, from
https://www.cloudflare.com/ips/), `CF-Connecting-IP` names the visitor (here:
Paddle). From anywhere else `CF-Connecting-IP` is ignored. If Cloudflare ever
publishes new ranges, add them there.

### A paid plan without waiting for the webhook

The webhook is the normal path, but a completed checkout must not depend on
it (a missing or misconfigured destination, a refused or late delivery; in
the sandbox Paddle retries a failed delivery only a few times). So:

- The checkout route remembers the transaction it opened
  (`subscriptions/{email}.paddleCheckout`: transaction, environment, time).
- After Paddle.js reports `checkout.completed`, the Plans page asks
  `POST /api/paddle/sync` (no body; 20 a minute per account) every few seconds
  for up to two minutes. The server reads that transaction
  (`GET /transactions/{id}`) and, once it has its subscription, the
  subscription, and stores it exactly as the webhook would; without a
  remembered checkout it reads the customer's subscriptions. Only the
  account's own Paddle customer counts (one linked to another or a deleted
  account is never touched), and only copies Paddle's API just returned are
  stored. `pending`: paid within the last hour, subscription still being
  made.
- `GET /api/plans` does the same once every ten minutes at most when the
  account has a Paddle customer but no subscription that unlocks a plan
  (never stored, or a checkout in the last seven days): someone who closed the
  page right after paying sees the plan the next time, and so do purchases
  from before this existed. The page also offers "Ödememi kontrol et".
- Every checkout first lists the customer's subscriptions at Paddle,
  whatever is stored (step `check`): a live one (active, trialing, past due)
  answers `already_subscribed`, a paused one `subscription_paused` (the Plans
  page offers "Aboneliği sürdür", `POST /api/paddle/subscription
  { action: "resume" }`: within a paid period nothing is charged, otherwise
  Paddle starts a new period and bills it at once), a payment still being
  processed `payment_pending`. If Paddle can't be asked, nothing is sold
  (424, the page retries once), so nobody pays twice while a notification is
  missing. The sync and the admin "Paddle'dan yeniden eşitle" try every
  subscription that could unlock a plan, the higher plan first, and always
  re-read the stored one.

### Linking a Paddle customer that already exists

Paddle keeps one customer per e-mail address. When an account checks out and
Paddle already has a customer with its address that no account is linked to
(a payment link, a subscription made in Paddle's dashboard, or the customer
left by a deleted account), the customer is linked only if the account's
address is verified: it signed in with Google (`users/{email}.emailVerifiedAt`
is written at a Google sign-in whose ID token says `email_verified`). A
password sign-up proves nothing about the address, so it gets
`customer_unverified` ("sign in with Google once, or open a support ticket");
staff can link the subscription by hand under "Eşleşmeyen abonelikler". A
customer linked to another account answers `customer_conflict`; a known
customer id is used only while `paddle_customers` links it to the account.

### Other billing answers

- A plan change while the subscription is in its free trial is sent with
  `proration_billing_mode: "do_not_bill"` (Paddle refuses anything else then);
  the first payment is at the trial's end, at the new price.
- A declined card on an upgrade answers 402 `payment_declined` with an
  "Ödeme yöntemini güncelle" button; a database that doesn't answer during a
  billing request answers 503 (`database_error`), not "signed out".
- Account deletion cancels every subscription of the customer that isn't
  over yet (not only the stored one) before the customer becomes a tombstone.
- Prices for the Plans page use the visitor's country from Cloudflare
  (`CF-IPCountry`, believed only when the request came from a Cloudflare
  address); behind Cloudflare, Vercel's `x-vercel-ip-country` is the country
  of Cloudflare's server. Keep Cloudflare › Network › IP Geolocation on (the
  default).

Renewals, cancellations, failed payments and plan changes made in Paddle
still come through the webhook, so it still has to work: see "Bildirimleri
kontrol et" below.

### Prices: one per checkout

Paddle's default price quantity lets one checkout buy up to 100, which shows a
quantity stepper in the checkout. "Paddle kataloğunu oluştur" creates prices
with `quantity: { minimum: 1, maximum: 1 }`; for prices made earlier (or in
Paddle's dashboard), the Paddle card shows "Ödeme ekranında adet
seçilebiliyor" with "Adedi 1'e sabitle" (owners only), which sets only the
quantity of the mapped prices of the configured environment.

### Coupons

Coupons are made under Admin Panel > Subscriptions > Coupons (code, percent,
plan, uses, expiry and "Geçerli ödemeler": the first payment, every payment or
the first 2–24). With Paddle connected each coupon is also a Paddle discount
with the same code (letters and digits only; `recur` /
`maximum_recurring_intervals` from "Geçerli ödemeler"). People enter the code
on the Pricing page ("Kupon kodun var mı?", checked by
`POST /api/paddle/coupon`, ten checks a minute per account) or with "Add
discount" in Paddle's checkout. With a code applied on the page, the checkout's
transaction carries the discount (`discount_id`): a coupon without a discount
in the configured environment gets one then, an archived one is switched back
on, and one that doesn't cover the price yet is widened to the mapped prices.
Saving the price mapping (or creating the catalog) widens every active
coupon's discount to the newly mapped prices, so codes typed in Paddle's
checkout keep working too. A link to `/plans?coupon=CODE` applies the code
once the visitor is signed in (the sign-in links carry it back to the page).

Deleting a coupon removes it and archives its Paddle discount, but the
`coupon.delete` audit entry keeps the whole coupon (terms, note, discount,
environment, creator); for coupons deleted before that, the terms come from
their `coupon.create` entry. They are listed under "Silinen kuponlar" (newest
fifty, codes in use again left out) and "Geri yükle" writes the coupon again
(`restoreCoupon`, audit `coupon.restore`): its discount is reopened with the
coupon's limit, end date and the prices mapped now, or, when it's gone, in
the other environment or Paddle won't reopen it, a new one is made. An end
date that has passed or a limit Paddle has used up has to be replaced in the
restore dialog (`coupon_restore_expired`, `coupon_restore_used_up`).

Paddle takes letters and digits only and gives each code to one discount,
archived ones included. A coupon from before Paddle with `-` or `_`, or one
whose code another Paddle discount already has (made in Paddle by hand, or a
deleted coupon's), gets a discount with a code Paddle makes up the first time
it's used at checkout: the Pricing page applies it by id, only typing the code
into Paddle's own checkout doesn't. Creating a coupon in the admin panel with a
code Paddle already has is refused ("Bu kod Paddle'da başka bir indirime
ait"). Coupons apply to new subscriptions only: plan changes don't carry them,
so subscribers see a note instead of coupon prices.

### Troubleshooting

- Admin Panel > Subscriptions > Paddle lists missing variables, wrong formats,
  a sandbox key with a live token (or the other way round), secrets in
  `NEXT_PUBLIC_` variables, API errors with Paddle's error code and the last
  accepted/refused webhook. The last accepted one shows how it was processed
  (`lastEventResult`: stored, kept, unlinked, ignored or `failed:<code>`;
  written after processing, so a delivery that arrived but failed doesn't look
  fine). Refusals are noted once a minute per reason (anyone can post to the
  webhook); `ip_list_unavailable` means Paddle's address list couldn't be read.
- "Bildirimleri kontrol et" (same card) reads, without changing anything, the
  environment's notification destinations (`GET /notification-settings`) and
  recent deliveries (`GET /notifications`, then the newest failed one's
  `/logs`) and says what to fix: no destination for `/api/paddle/webhook`,
  switched off, simulation-only traffic, missing events, another host (www or
  vercel.app: Paddle doesn't follow redirects), a secret that isn't
  `PADDLE_WEBHOOK_SECRET` (compared on the server, never sent to the browser),
  and why the last delivery failed from the answer Paddle got: our signature,
  address or configuration refusals, a Cloudflare page (allow
  `/api/paddle/webhook` or use DNS only), Vercel protection, a redirect, 404 or
  5xx. Notification payloads (customer details) are never read into it.
- A subscription Paddle reports for a customer we don't know appears under
  "Eşleşmeyen abonelikler" and can be linked to an account there.
- Deleting an account cancels its subscription immediately; if Paddle can't be
  reached the deletion report says so and the subscription is listed in
  `paddle_cleanup`.
- If the Plans page says the checkout couldn't load, start or open, the browser
  reports why (`POST /api/paddle/client-error`: blocked, missing, init, open,
  or Paddle's `checkout.error`/`checkout.failed`/`checkout.payment.error` (a
  validation error lists the refused fields, `errors[].field: message`, and
  Paddle's own "Something went wrong" overlay is closed so the page's notice
  shows them), with
  the refused address, the browser and the environment, never the account).
  The Paddle card lists the newest ten under "Son ödeme ekranı hataları" and
  checks that the client-side token exists in the API key's account
  (`missing` = another Paddle account or the other environment). The team,
  testers and sandbox visitors also see the technical detail on the page. The
  CSP allows `https://*.paddle.com` and Paddle Retain (`public.profitwell.com`,
  `*.profitwell.com`).
- The site is served through Cloudflare, which replaces 502 and 504 answers
  from Vercel with its own error page (the JSON with the reason is lost). The
  API routes therefore never send 502/504: a failure of a service we depend on
  (Paddle, an AI provider, the Vercel deploy hook) is 424, our own failure
  500, a timeout 503 with `code: "timeout"`. A non-JSON 502/504 on the page
  (`Hata kodu: unavailable · HTTP 502`) now means the function itself crashed
  or timed out on Vercel; look it up in the Vercel logs.
- If the Plans page says a checkout (or another subscription action) failed,
  the notice ends with an error code line, e.g.
  `Hata kodu: unavailable/database_error · HTTP 500 · subscription · 2.1 s`:
  the route's error and code, the HTTP status (424: Paddle refused, 500: our
  side), Paddle's status when Paddle was
  called, the step (`catalog`, `settings`, `subscription`, `customer`,
  `transaction`, `portal`, `preview`, `change`, `keep`) and how long it took.
  The routes log the same line (`[paddle:checkout]` in the Vercel logs) and
  keep the newest ten under "Son sunucu hataları" in the Paddle card, with
  Paddle's explanation or our error message (never the account). Codes:
  `timeout`/`network_error` (Paddle didn't answer in 8 s / couldn't be
  reached), `unexpected_response` (Paddle's answer wasn't JSON), Paddle's own
  codes (e.g. `forbidden`: the API key lacks a permission;
  `transaction_default_checkout_url_not_set`: set Paddle › Checkout › Checkout
  settings › Default payment link to the Plans page address, in sandbox and
  live separately; the Plans page tells the team what to fix for these),
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
