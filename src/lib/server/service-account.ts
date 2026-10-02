import "server-only";

import { createPrivateKey } from "node:crypto";

/**
 * Reads the Firebase service account from the deployment's environment.
 *
 * People paste the key in many shapes, so every reasonable one is accepted:
 * the downloaded JSON file, the same JSON base64-encoded, wrapped in quotes,
 * encoded twice ("{\"type\":…}"), nested ({"serviceAccount": {…}}), with
 * camelCase names (projectId, clientEmail, privateKey), copied as a .env line
 * (NAME={…}), or split into FIREBASE_PROJECT_ID + FIREBASE_CLIENT_EMAIL +
 * FIREBASE_PRIVATE_KEY. The private key's PEM is rebuilt from its base64 body,
 * so lost or literal "\n" line breaks don't matter.
 *
 * Every variable that is set is tried in order and the first one that holds
 * a usable key wins. When none does, the error names the variable and says
 * what it holds instead (a web-app config, google-services.json, an OAuth
 * client…). It is short because the sign-in page shows the first 180
 * characters of the error, and it never contains key material.
 */

export type ServiceAccount = { client_email: string; private_key: string; project_id: string };
export type ServerCredentialLayout = "json" | "base64" | "split" | "emulator";
export type CredentialSource = { layout: Exclude<ServerCredentialLayout, "emulator">; variable: string; value: string };

/** Variables that hold the whole key, in the order they are tried. BASE64 is the documented base64 name; BASE came from older docs. */
const WHOLE_KEY_VARIABLES: ReadonlyArray<{ variable: string; layout: "json" | "base64" }> = [
    { variable: "FIREBASE_SERVICE_ACCOUNT_JSON", layout: "json" },
    { variable: "FIREBASE_SERVICE_ACCOUNT_BASE64", layout: "base64" },
    { variable: "FIREBASE_SERVICE_ACCOUNT_BASE", layout: "base64" },
    { variable: "FIREBASE_SERVICE_ACCOUNT", layout: "json" },
    { variable: "FIREBASE_SERVICE_ACCOUNT_KEY", layout: "json" },
    { variable: "FIREBASE_ADMIN_CREDENTIALS", layout: "json" },
    { variable: "GOOGLE_APPLICATION_CREDENTIALS_JSON", layout: "json" },
    { variable: "GOOGLE_CREDENTIALS", layout: "json" },
    // Usually a file path, which can't work on Vercel; only pasted JSON is read from it.
    { variable: "GOOGLE_APPLICATION_CREDENTIALS", layout: "json" },
];

/** The three-variable layouts used by most Firebase Admin guides. */
const SPLIT_LAYOUTS = [
    { email: "FIREBASE_CLIENT_EMAIL", key: "FIREBASE_PRIVATE_KEY", project: "FIREBASE_PROJECT_ID" },
    { email: "FIREBASE_ADMIN_CLIENT_EMAIL", key: "FIREBASE_ADMIN_PRIVATE_KEY", project: "FIREBASE_ADMIN_PROJECT_ID" },
] as const;

/** Every variable whose value can change the result (for caching). */
export const CREDENTIAL_VARIABLES: readonly string[] = [
    ...WHOLE_KEY_VARIABLES.map((entry) => entry.variable),
    ...SPLIT_LAYOUTS.flatMap((entry) => [entry.email, entry.key, entry.project]),
    "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
];

const SETTINGS_HINT = "Firebase → Proje ayarları → Hizmet hesapları";

type Env = Record<string, string | undefined>;

/** The credential variables that are set, in the order they are tried. */
export function credentialSources(env: Env = process.env): CredentialSource[] {
    const sources: CredentialSource[] = [];
    for (const { variable, layout } of WHOLE_KEY_VARIABLES) {
        const value = env[variable]?.trim();
        if (!value) continue;
        if (variable === "GOOGLE_APPLICATION_CREDENTIALS" && !value.startsWith("{")) continue;
        sources.push({ layout, variable, value });
    }
    for (const split of SPLIT_LAYOUTS) {
        const key = env[split.key]?.trim();
        // The whole JSON pasted into the private key variable is read like the JSON variable.
        if (key?.startsWith("{")) sources.push({ layout: "json", variable: split.key, value: key });
        else if (key && env[split.email]?.trim()) sources.push({ layout: "split", variable: `${split.project} + ${split.email} + ${split.key}`, value: "" });
    }
    return sources;
}

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

/** "firebase-adminsdk-x@PROJECT.iam.gserviceaccount.com" names its project. */
export function projectFromServiceEmail(email: string) {
    const match = /@([a-z][a-z0-9-]{4,28}[a-z0-9])\.iam\.gserviceaccount\.com$/i.exec(email.trim());
    return match ? match[1].toLowerCase() : "";
}

/**
 * Rebuilds the PEM from its base64 body: literal "\n", spaces instead of
 * line breaks, quotes and Windows line ends are all repaired. A bare base64
 * body is taken as a PKCS#8 key. Returns "" when nothing key-like is left.
 */
export function normalizePrivateKey(raw: string) {
    // Escaped line breaks first, so the "n" of a literal "\n" never ends up in the base64 body.
    const text = raw.trim().replace(/^["'`]+|["'`]+$/g, "").replace(/\\r\\n|\\r|\\n/g, "\n");
    const pem = /-----BEGIN ([A-Z ]*PRIVATE KEY)-----([\s\S]*?)-----END \1-----/.exec(text);
    let label = "PRIVATE KEY";
    let body: string;
    if (pem) {
        label = pem[1];
        body = pem[2].replace(/[^A-Za-z0-9+/=]/g, "");
    } else {
        body = text.replace(/\s+/g, "");
        if (!/^[A-Za-z0-9+/]+={0,2}$/.test(body)) return "";
    }
    if (body.length < 100) return "";
    return `-----BEGIN ${label}-----\n${(body.match(/.{1,64}/g) ?? []).join("\n")}\n-----END ${label}-----\n`;
}

function isUsableKey(pem: string) {
    if (!pem) return false;
    try {
        createPrivateKey(pem);
        return true;
    } catch {
        return false;
    }
}

const FIELDS = {
    clientEmail: ["client_email", "clientEmail"],
    privateKey: ["private_key", "privateKey"],
    projectId: ["project_id", "projectId"],
} as const;

function field(record: Record<string, unknown>, names: readonly string[]) {
    for (const name of names) {
        const value = record[name];
        if (typeof value === "string" && value.trim()) return value.trim();
    }
    return "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/** JSON text, base64 of it, a .env line or backslash-escaped JSON → the parsed value (undefined if none parses). */
export function decodeCredentialText(text: string): unknown {
    let value = text.trim();
    const assignment = /^(?:export\s+)?[A-Z][A-Z0-9_]*\s*=\s*([\s\S]+)$/.exec(value);
    if (assignment && !value.startsWith("{")) value = assignment[1].trim();
    if (/^(['`])[\s\S]*\1$/.test(value)) value = value.slice(1, -1).trim();
    const attempts = [value];
    const compact = value.replace(/\s+/g, "");
    if (!value.startsWith("{") && !value.startsWith("\"") && compact.length >= 40 && /^[A-Za-z0-9+/_-]+=*$/.test(compact)) {
        attempts.push(Buffer.from(compact.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8").trim());
    }
    if (value.startsWith("{\\\"")) attempts.push(value.replace(/\\"/g, "\""));
    for (const attempt of attempts) {
        try {
            return JSON.parse(attempt);
        } catch {
            // Try the next reading.
        }
    }
    return undefined;
}

/** The object holding the key, wherever it sits: top level, a JSON string inside, or nested a few levels down. */
function findAccountRecord(value: unknown, depth = 0): Record<string, unknown> | null {
    if (depth > 4) return null;
    if (typeof value === "string") {
        const text = value.trim();
        return text.startsWith("{") || text.startsWith("\"") ? findAccountRecord(decodeCredentialText(text), depth + 1) : null;
    }
    if (Array.isArray(value)) {
        for (const item of value) {
            const found = findAccountRecord(item, depth + 1);
            if (found) return found;
        }
        return null;
    }
    if (!isRecord(value)) return null;
    if (field(value, FIELDS.privateKey) && field(value, FIELDS.clientEmail)) return value;
    for (const nested of Object.values(value)) {
        if (typeof nested !== "object" && typeof nested !== "string") continue;
        const found = findAccountRecord(nested, depth + 1);
        if (found) return found;
    }
    return null;
}

/** What a pasted value that holds no service account is instead, in a few words. */
function describeMistake(value: unknown): string {
    if (value === undefined) return "geçerli bir JSON değil. Hizmet hesabı JSON dosyasının tamamını olduğu gibi yapıştırın.";
    if (!isRecord(value)) return "bir JSON nesnesi değil. Hizmet hesabı JSON dosyasının tamamını yapıştırın.";
    const wrong = (what: string) => `${what} var; hizmet hesabı anahtarı gerekli (${SETTINGS_HINT}).`;
    if ("apiKey" in value || "authDomain" in value || "appId" in value) return wrong("web uygulaması yapılandırması (apiKey)");
    if ("project_info" in value || Array.isArray(value.client)) return wrong("Android google-services.json");
    if (isRecord(value.web) || isRecord(value.installed)) return wrong("Google OAuth istemci dosyası");
    if (value.type === "authorized_user" || "refresh_token" in value) return wrong("kullanıcı kimliği (refresh_token)");
    if (value.type === "external_account") return wrong("dış kimlik (external_account)");
    const missing = [
        field(value, FIELDS.clientEmail) ? "" : "client_email",
        field(value, FIELDS.privateKey) ? "" : "private_key",
    ].filter(Boolean);
    return `eksik alan: ${missing.join(", ")}. Dosyanın tamamını yapıştırın (${SETTINGS_HINT}).`;
}

function account(clientEmail: string, privateKey: string, projectId: string, variable: string, env: Env): ServiceAccount {
    const project = projectId || projectFromServiceEmail(clientEmail) || (env.FIREBASE_PROJECT_ID || env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "").trim();
    if (!project) throw new Error(`${variable}: project_id bulunamadı; FIREBASE_PROJECT_ID ekleyin.`);
    const key = normalizePrivateKey(privateKey);
    if (!isUsableKey(key)) throw new Error(`${variable}: private_key okunamadı; anahtar eksik ya da bozuk kopyalanmış (${SETTINGS_HINT}).`);
    return { client_email: clientEmail, private_key: key, project_id: project };
}

/** The service account in one source, or an Error saying what is wrong with it. */
export function readCredentialSource(source: CredentialSource, env: Env = process.env): ServiceAccount {
    if (source.layout === "split") {
        const split = SPLIT_LAYOUTS.find((entry) => source.variable.endsWith(entry.key))!;
        return account(env[split.email]!.trim(), env[split.key]!, (env[split.project] || "").trim(), source.variable, env);
    }
    const decoded = decodeCredentialText(source.value);
    const record = findAccountRecord(decoded);
    if (!record) throw new Error(`${source.variable}: ${describeMistake(decoded)}`);
    return account(field(record, FIELDS.clientEmail), field(record, FIELDS.privateKey), field(record, FIELDS.projectId), source.variable, env);
}

export type CredentialResolution = {
    account: ServiceAccount | null;
    /** The source the account came from. */
    source: CredentialSource | null;
    /** Every source tried, in order, with its problem (null when it worked). */
    tried: Array<{ variable: string; layout: CredentialSource["layout"]; error: string | null }>;
};

/** Tries every configured source and keeps the first usable one. */
export function resolveServiceAccount(env: Env = process.env): CredentialResolution {
    const tried: CredentialResolution["tried"] = [];
    for (const source of credentialSources(env)) {
        try {
            const found = readCredentialSource(source, env);
            tried.push({ variable: source.variable, layout: source.layout, error: null });
            return { account: found, source, tried };
        } catch (error) {
            tried.push({ variable: source.variable, layout: source.layout, error: error instanceof Error ? error.message : String(error) });
        }
    }
    return { account: null, source: null, tried };
}

export const MISSING_CREDENTIALS_MESSAGE = "Firebase sunucu kimliği yapılandırılmamış: Vercel'e FIREBASE_SERVICE_ACCOUNT_JSON ekleyin.";
