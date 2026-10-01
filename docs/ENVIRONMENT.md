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

`NEXT_PUBLIC_*` values are inlined into the browser bundle **at build time**:
after adding or changing one in Vercel, redeploy (Deployments → … → Redeploy),
otherwise the browser keeps the old values.

The browser signs in to Firebase with a custom token from
`/api/auth/firebase-token` (minted with the server service account). Account
Settings, Editor Settings sync and Hanogt AI's account answers go through API
routes instead, so they keep working when that browser connection fails; the
banner shown in that case tells staff the exact cause.

## Firebase — server (Admin REST)

Used for server-side reads/writes and for minting the custom tokens that bridge
a NextAuth session to Firebase. Provide the service account in any one form:

| Variable | Meaning |
| --- | --- |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Full service-account JSON (string). Wins when several forms are set. |
| `FIREBASE_SERVICE_ACCOUNT_BASE64` | The same JSON, base64-encoded on one line (`base64 -w0 service-account.json`). The older name `FIREBASE_SERVICE_ACCOUNT_BASE` is still accepted. |
| `FIREBASE_PROJECT_ID` + `FIREBASE_CLIENT_EMAIL` + `FIREBASE_PRIVATE_KEY` | The three fields individually (`\n` escapes in the key are handled). |
| `FIREBASE_STORAGE_BUCKET` | Storage bucket for voice messages and uploads (falls back to `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`). |

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
4. Google OAuth token,
5. Firestore REST read (also detects a missing database or disabled API),
6. Firebase Authentication initialised (`CONFIGURATION_NOT_FOUND` → Firebase Console → Authentication → Get started),
7. an end-to-end copy of the browser's `signInWithCustomToken` request with the site's `Referer`, so Google's own error (`INVALID_CUSTOM_TOKEN`, `CREDENTIAL_MISMATCH`, `API_KEY_HTTP_REFERRER_BLOCKED`, …) is visible,
8. the deployed security rules letting a user read `users/{email}`,
9. deployed vs. repository `firestore.rules` / `storage.rules` (SHA-256),
10. the storage bucket.

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

`storage.rules` reads chat/group membership from Firestore. If voice-message
uploads fail with permission errors after an API deployment, accept the
cross-service permission prompt in Firebase Console → Storage → Rules (or run
`firebase deploy --only storage` once).

## Hanogt AI

See [docs/HANOGT_AI.md](./HANOGT_AI.md) for the full picture.

| Variable | Default | Meaning |
| --- | --- | --- |
| `HANOGT_AI_API_KEY` | – | API key (falls back to `GROQ_API_KEY`). |
| `HANOGT_AI_BASE_URL` | `https://api.groq.com/openai/v1` | OpenAI-compatible endpoint. http allowed only to loopback. |
| `HANOGT_AI_MODEL` | `llama-3.3-70b-versatile` | Model id (falls back to `GROQ_MODEL`). |

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
