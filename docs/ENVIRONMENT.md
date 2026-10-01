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
runs in a local-only mode.

| Variable |
| --- |
| `NEXT_PUBLIC_FIREBASE_API_KEY` |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` |
| `NEXT_PUBLIC_FIREBASE_APP_ID` |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` |

## Firebase — server (Admin REST)

Used for server-side reads/writes and for minting the custom tokens that bridge
a NextAuth session to Firebase. Provide the service account in any one form:

| Variable | Meaning |
| --- | --- |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Full service-account JSON (string). |
| `FIREBASE_SERVICE_ACCOUNT_BASE` | The same JSON, base64-encoded. |
| `FIREBASE_PROJECT_ID` + `FIREBASE_CLIENT_EMAIL` + `FIREBASE_PRIVATE_KEY` | The three fields individually (`\n` escapes in the key are handled). |
| `FIREBASE_STORAGE_BUCKET` | Storage bucket for voice messages and uploads. |

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
| `HEALTH_CHECK_TOKEN` | If set (≥16 chars), `/api/health/auth?token=…` returns the full auth diagnostics. Owners listed in `ADMIN_EMAILS` can also see it while signed in. Without either, the endpoint returns only a bare ok/not-ok. |

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
