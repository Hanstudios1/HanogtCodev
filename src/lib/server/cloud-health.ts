import "server-only";

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
    createFirebaseCustomToken,
    describeServerCredentials,
    getGoogleAccessToken,
    isFirebaseEmulator,
    probeServerDocument,
    type ServerCredentialInfo,
} from "./firebase-rest";
import { checkTurn } from "./turn";

/*
 * Cloud Health: the owner's end-to-end diagnosis of the Firebase setup
 * (Admin Panel → Cloud Health, /api/admin/cloud). Every check returns a
 * status, a machine `reason` and a `fix` id that the UI turns into translated
 * text and steps, plus a short technical detail that never contains secrets.
 * The browser-connection check repeats exactly what the browser does
 * (signInWithCustomToken with the site's Referer), so Google's own error is
 * visible here even though it only happens in visitors' browsers.
 */

export type CloudCheckStatus = "ok" | "warn" | "fail" | "skip";

export type CloudCheckId =
    | "clientConfig"
    | "serverCredentials"
    | "projectMatch"
    | "browserConfig"
    | "accessToken"
    | "firestoreRead"
    | "authConfig"
    | "browserSignIn"
    | "rulesSelfRead"
    | "firestoreRules"
    | "storageRules"
    | "storageBucket"
    | "turnServer";

/** Remedies the UI renders as translated steps. */
export type CloudFixId =
    | "addClientConfig"
    | "fixClientConfig"
    | "fixAuthDomain"
    | "fixStorageBucket"
    | "addServerCredentials"
    | "fixServerCredentials"
    | "rotateServiceAccountKey"
    | "alignProjects"
    | "enableFirestore"
    | "createFirestoreDatabase"
    | "grantServiceAccountRoles"
    | "initAuth"
    | "enableIdentityToolkit"
    | "fixApiKey"
    | "apiKeyReferrer"
    | "apiKeyApis"
    | "enableAuthUser"
    | "deployRules"
    | "grantRulesAdmin"
    | "enableRulesApi"
    | "initStorage"
    | "redeploy"
    | "redeployClientConfig"
    | "checkNetwork"
    | "setupTurn";

/** Machine-readable outcome of a check; the UI shows a translated sentence for each. */
export type CloudReason =
    | "skipped"
    | "emulator"
    | "client_ok"
    | "client_missing"
    | "client_api_key_format"
    | "client_project_id_format"
    | "client_app_id"
    | "client_auth_domain"
    | "client_bucket"
    | "client_sender_mismatch"
    | "creds_ok"
    | "creds_emulator"
    | "creds_missing"
    | "creds_invalid"
    | "creds_key_invalid"
    | "creds_multiple"
    | "projects_match"
    | "projects_differ"
    | "projects_unknown"
    | "browser_config_env"
    | "browser_config_stale"
    | "browser_config_firebase"
    | "browser_config_mismatch"
    | "browser_config_none"
    | "token_ok"
    | "token_admin_failed"
    | "token_rejected"
    | "token_failed"
    | "firestore_ok"
    | "firestore_no_database"
    | "firestore_api_disabled"
    | "firestore_datastore_mode"
    | "firestore_permission"
    | "firestore_failed"
    | "auth_ok"
    | "auth_not_initialized"
    | "auth_api_disabled"
    | "auth_permission"
    | "auth_failed"
    | "signin_ok"
    | "signin_no_api_key"
    | "signin_invalid_token"
    | "signin_mismatch"
    | "signin_not_initialized"
    | "signin_referrer"
    | "signin_api_restricted"
    | "signin_api_key_invalid"
    | "signin_api_disabled"
    | "signin_user_disabled"
    | "signin_throttled"
    | "signin_failed"
    | "rules_read_ok"
    | "rules_read_denied"
    | "rules_read_failed"
    | "rules_same"
    | "rules_differ"
    | "rules_never_deployed"
    | "rules_permission"
    | "rules_api_disabled"
    | "rules_bundle_missing"
    | "rules_no_bucket"
    | "rules_failed"
    | "bucket_ok"
    | "bucket_missing"
    | "bucket_not_found"
    | "bucket_permission"
    | "bucket_failed"
    | "turn_ok"
    | "turn_missing"
    | "turn_credentials_missing"
    | "turn_failed";

export type CloudCheck = {
    id: CloudCheckId;
    status: CloudCheckStatus;
    reason: CloudReason;
    /** Short technical detail (Google's message, variable names); never a secret. */
    detail: string;
    fix: CloudFixId | null;
    /** Values for the translated sentence and the UI (project ids, masked key, times…). */
    facts: Record<string, string>;
};

export const CLIENT_CONFIG_VARIABLES = [
    "NEXT_PUBLIC_FIREBASE_API_KEY",
    "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
    "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
    "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET",
    "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID",
    "NEXT_PUBLIC_FIREBASE_APP_ID",
] as const;

export type ClientConfigVariable = (typeof CLIENT_CONFIG_VARIABLES)[number];

/** The project's web-app config as Firebase reports it, to paste into Vercel. */
export type SuggestedClientConfig = {
    appId: string;
    displayName: string | null;
    values: Record<ClientConfigVariable, string>;
    /** Variables whose deployed value is missing or different. */
    differs: ClientConfigVariable[];
};

export type CloudHealthReport = {
    checkedAt: string;
    /** The site origin used as Referer for the browser simulation. */
    origin: string;
    deployment: { env: string | null; commit: string | null };
    projectIds: { client: string | null; server: string | null };
    /** What /api/firebase/config gives the browser (see the browserConfig check). */
    browserConfigSource: PublicConfigSource | null;
    serviceAccount: string | null;
    checks: CloudCheck[];
    suggestedClientConfig: SuggestedClientConfig | null;
    /** Why the suggested config is missing ("no_web_app" or Google's error). */
    suggestedClientConfigError: string | null;
    summary: Record<CloudCheckStatus, number>;
};

export type RulesFile = "firestore.rules" | "storage.rules";

export type RulesDeployReason = "deployed" | "unchanged" | "no_bucket" | "bundle_missing" | "permission" | "api_disabled" | "invalid_rules" | "failed";

export type RulesDeployResult = {
    file: RulesFile;
    release: string;
    status: "deployed" | "unchanged" | "skipped" | "failed";
    reason: RulesDeployReason;
    detail: string;
    fix: CloudFixId | null;
};

export type CloudDeployResponse = { projectId: string; results: RulesDeployResult[] };

const RULES_API = "https://firebaserules.googleapis.com/v1";
const REQUEST_TIMEOUT_MS = 12_000;

// ---------------------------------------------------------------------------
// Google API helpers
// ---------------------------------------------------------------------------

type GoogleError = { status: number; code: string; reason: string; message: string };

type GoogleResult<T> = { ok: true; data: T } | { ok: false; error: GoogleError };

async function googleRequest<T>(url: string, options: { token?: string; method?: string; body?: unknown; headers?: Record<string, string>; timeoutMs?: number } = {}): Promise<GoogleResult<T>> {
    let response: Response;
    try {
        response = await fetch(url, {
            method: options.method ?? "GET",
            headers: {
                ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
                ...(options.body === undefined ? {} : { "Content-Type": "application/json" }),
                ...options.headers,
            },
            body: options.body === undefined ? undefined : JSON.stringify(options.body),
            cache: "no-store",
            signal: AbortSignal.timeout(options.timeoutMs ?? REQUEST_TIMEOUT_MS),
        });
    } catch (error) {
        return { ok: false, error: { status: 0, code: "NETWORK", reason: "", message: error instanceof Error ? error.message.slice(0, 200) : "fetch failed" } };
    }
    const payload = await response.json().catch(() => null) as unknown;
    if (response.ok) return { ok: true, data: (payload ?? {}) as T };
    const error = (payload && typeof payload === "object" ? (payload as { error?: unknown }).error : null) as {
        status?: unknown;
        message?: unknown;
        details?: Array<{ reason?: unknown }>;
    } | null;
    const reason = Array.isArray(error?.details) ? error.details.find((detail) => typeof detail?.reason === "string")?.reason : undefined;
    return {
        ok: false,
        error: {
            status: response.status,
            code: typeof error?.status === "string" ? error.status : "",
            reason: typeof reason === "string" ? reason : "",
            message: typeof error?.message === "string" ? error.message.slice(0, 400) : "",
        },
    };
}

function describeError(error: GoogleError) {
    return [error.status ? `HTTP ${error.status}` : "", error.code, error.reason, error.message].filter(Boolean).join(" · ");
}

const isServiceDisabled = (error: GoogleError) => error.reason === "SERVICE_DISABLED" || /has not been used in project|it is disabled|SERVICE_DISABLED/i.test(error.message);

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error)).slice(0, 300);

// ---------------------------------------------------------------------------
// Configuration readers
// ---------------------------------------------------------------------------

type ClientEnv = Record<"apiKey" | "authDomain" | "projectId" | "storageBucket" | "messagingSenderId" | "appId", string>;

function readClientEnv(): ClientEnv {
    // The same (build-time) values the browser bundle got; trimmed like src/lib/firebase.ts.
    const value = (raw: string | undefined) => (raw || "").trim();
    return {
        apiKey: value(process.env.NEXT_PUBLIC_FIREBASE_API_KEY),
        authDomain: value(process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN),
        projectId: value(process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID),
        storageBucket: value(process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET),
        messagingSenderId: value(process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID),
        appId: value(process.env.NEXT_PUBLIC_FIREBASE_APP_ID),
    };
}

const ENV_NAMES: Record<keyof ClientEnv, ClientConfigVariable> = {
    apiKey: "NEXT_PUBLIC_FIREBASE_API_KEY",
    authDomain: "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
    projectId: "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
    storageBucket: "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET",
    messagingSenderId: "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID",
    appId: "NEXT_PUBLIC_FIREBASE_APP_ID",
};

/** Only a prefix of the web API key is ever shown. */
function maskKey(key: string) {
    return key ? `${key.slice(0, 8)}…` : "";
}

/** Bucket used for voice messages (server variable first), without gs:// and only when well formed. */
function storageBucket(): { name: string | null; raw: string } {
    const raw = (process.env.FIREBASE_STORAGE_BUCKET || process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "").trim();
    const name = raw.replace(/^gs:\/\//, "").replace(/\/+$/, "");
    return { name: /^[a-z0-9][a-z0-9._-]{1,220}[a-z0-9]$/.test(name) ? name : null, raw };
}

function releaseOf(kind: "firestore" | "storage", project: string, bucket: string | null) {
    const name = kind === "firestore" ? `projects/${project}/releases/cloud.firestore` : `projects/${project}/releases/firebase.storage/${bucket}`;
    const url = kind === "firestore"
        ? `${RULES_API}/projects/${encodeURIComponent(project)}/releases/cloud.firestore`
        : `${RULES_API}/projects/${encodeURIComponent(project)}/releases/firebase.storage/${encodeURIComponent(bucket ?? "")}`;
    return { name, url };
}

/**
 * The repository's rule files. The literal paths let build tracing include
 * them; next.config.ts also lists them in outputFileTracingIncludes.
 */
async function readBundledRules(file: RulesFile) {
    return file === "firestore.rules"
        ? readFile(path.join(process.cwd(), "firestore.rules"), "utf8")
        : readFile(path.join(process.cwd(), "storage.rules"), "utf8");
}

function rulesHash(source: string) {
    const normalized = source.replace(/\r\n?/g, "\n").replace(/[ \t]+$/gm, "").trim();
    return createHash("sha256").update(normalized).digest("hex");
}

function rulesetSource(ruleset: { source?: { files?: Array<{ content?: unknown }> } }) {
    return (ruleset.source?.files ?? []).map((file) => (typeof file.content === "string" ? file.content : "")).join("\n");
}

const shortName = (name: string) => name.split("/").pop() || name;

// ---------------------------------------------------------------------------
// Public web config for the browser (/api/firebase/config)
// ---------------------------------------------------------------------------

/** The Firebase web config the browser initialises with. Every value is public. */
export type PublicFirebaseConfig = Record<"apiKey" | "authDomain" | "projectId" | "storageBucket" | "messagingSenderId" | "appId", string>;

export const PUBLIC_CONFIG_FIELDS = ["apiKey", "authDomain", "projectId", "storageBucket", "messagingSenderId", "appId"] as const;

/** Where the served config comes from; "none" when nothing usable exists. */
export type PublicConfigSource = "env" | "management-api" | "none";

/** Why the deployment's own NEXT_PUBLIC_FIREBASE_* values were not used as they are. */
export type PublicConfigIssue = "missing" | "invalid" | "project_mismatch";

/** The six public fields as trimmed strings; anything else is dropped. */
export function sanitizePublicConfig(input: unknown): PublicFirebaseConfig {
    const record = input && typeof input === "object" && !Array.isArray(input) ? input as Record<string, unknown> : {};
    const text = (value: unknown) => (typeof value === "string" ? value.trim().slice(0, 300) : "");
    return {
        apiKey: text(record.apiKey),
        authDomain: text(record.authDomain),
        projectId: text(record.projectId),
        storageBucket: text(record.storageBucket),
        messagingSenderId: text(record.messagingSenderId),
        appId: text(record.appId),
    };
}

/** Mirrors hasFirebaseClientConfig in src/lib/firebase.ts (a test keeps the two in step). */
export function isUsablePublicConfig(config: PublicFirebaseConfig | null | undefined): config is PublicFirebaseConfig {
    return Boolean(config && config.projectId && config.appId && /^AIza[\w-]{35}$/.test(config.apiKey));
}

export function publicConfigIssue(env: PublicFirebaseConfig, serverProjectId: string | null): PublicConfigIssue | null {
    if (!env.apiKey || !env.projectId || !env.appId) return "missing";
    if (!isUsablePublicConfig(env)) return "invalid";
    if (serverProjectId && env.projectId !== serverProjectId) return "project_mismatch";
    return null;
}

/**
 * The config to give the browser: the deployment's own values when they are
 * complete and belong to the service account's project, otherwise the
 * project's web-app config read from Firebase. Values of another project are
 * still served when Firebase can't be asked: the bundle has them anyway.
 */
export function selectPublicFirebaseConfig(input: { env: PublicFirebaseConfig; serverProjectId: string | null; fromFirebase: PublicFirebaseConfig | null }): { source: PublicConfigSource; config: PublicFirebaseConfig | null; issue: PublicConfigIssue | null } {
    const issue = publicConfigIssue(input.env, input.serverProjectId);
    if (!issue) return { source: "env", config: input.env, issue };
    const { fromFirebase, serverProjectId } = input;
    if (isUsablePublicConfig(fromFirebase) && (!serverProjectId || fromFirebase.projectId === serverProjectId)) return { source: "management-api", config: fromFirebase, issue };
    if (issue === "project_mismatch") return { source: "env", config: input.env, issue };
    return { source: "none", config: null, issue };
}

/**
 * NEXT_PUBLIC_FIREBASE_* as configured right now. Looked up by a computed
 * name on purpose: a literal `process.env.NEXT_PUBLIC_…` is replaced with its
 * build-time value in server bundles as well.
 */
export function readRuntimePublicEnv(): PublicFirebaseConfig {
    const read = (name: string) => (process.env[name] || "").trim();
    return sanitizePublicConfig(Object.fromEntries(PUBLIC_CONFIG_FIELDS.map((field) => [field, read(ENV_NAMES[field])])));
}

type WebAppLookup = { at: number; project: string; preferredAppId: string; config: PublicFirebaseConfig | null; error: string | null };

// Per server instance; the route's CDN cache keeps lookups rarer still.
let webAppLookup: WebAppLookup | null = null;
const LOOKUP_TTL_MS = 60 * 60_000;
const LOOKUP_FAILURE_TTL_MS = 5 * 60_000;

function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`timed out after ${ms} ms`)), ms);
    });
    return Promise.race([work, timeout]).finally(() => clearTimeout(timer));
}

async function lookupWebAppConfig(project: string, preferredAppId: string, options: { fresh?: boolean; budgetMs?: number }): Promise<WebAppLookup> {
    const cached = webAppLookup;
    if (!options.fresh && cached && cached.project === project && cached.preferredAppId === preferredAppId
        && Date.now() - cached.at < (cached.config ? LOOKUP_TTL_MS : LOOKUP_FAILURE_TTL_MS)) {
        return cached;
    }
    const budgetMs = options.budgetMs ?? REQUEST_TIMEOUT_MS;
    let lookup: WebAppLookup;
    try {
        const fetched = await withTimeout((async () => fetchWebAppConfig(project, await getGoogleAccessToken("admin"), preferredAppId, budgetMs))(), budgetMs);
        const config = fetched.app && isUsablePublicConfig(fetched.app.config) ? fetched.app.config : null;
        lookup = { at: Date.now(), project, preferredAppId, config, error: config ? null : fetched.error ?? "incomplete_web_app_config" };
    } catch (error) {
        lookup = { at: Date.now(), project, preferredAppId, config: null, error: errorText(error) };
    }
    webAppLookup = lookup;
    return lookup;
}

export type ResolvedPublicConfig = {
    source: PublicConfigSource;
    config: PublicFirebaseConfig | null;
    issue: PublicConfigIssue | null;
    serverProjectId: string | null;
    /** Why the Firebase lookup failed, when one was needed (Google's error or a short code). */
    lookupError: string | null;
};

/**
 * What /api/firebase/config serves: the request-time NEXT_PUBLIC_FIREBASE_*
 * values, or, when they are missing, invalid or belong to another project
 * than the service account, the web-app config read from Firebase (cached
 * for an hour, failures for five minutes). `budgetMs` caps the lookup.
 */
export async function resolvePublicFirebaseConfig(options: { fresh?: boolean; budgetMs?: number } = {}): Promise<ResolvedPublicConfig> {
    const env = readRuntimePublicEnv();
    const credentials = describeServerCredentials();
    const serverProjectId = credentials.projectId;
    if (!publicConfigIssue(env, serverProjectId)) return { source: "env", config: env, issue: null, serverProjectId, lookupError: null };
    if (!serverProjectId || !credentials.privateKeyValid || isFirebaseEmulator()) {
        return { ...selectPublicFirebaseConfig({ env, serverProjectId, fromFirebase: null }), serverProjectId, lookupError: "no_server_credentials" };
    }
    const lookup = await lookupWebAppConfig(serverProjectId, env.appId, options);
    return { ...selectPublicFirebaseConfig({ env, serverProjectId, fromFirebase: lookup.config }), serverProjectId, lookupError: lookup.error };
}

// ---------------------------------------------------------------------------
// Checks
// ---------------------------------------------------------------------------

function check(id: CloudCheckId, status: CloudCheckStatus, reason: CloudReason, detail = "", fix: CloudFixId | null = null, facts: Record<string, string> = {}): CloudCheck {
    return { id, status, reason, detail, fix, facts };
}

function skipped(id: CloudCheckId, reason: CloudReason = "skipped") {
    return check(id, "skip", reason);
}

function checkClientConfig(env: ClientEnv): CloudCheck {
    const facts = {
        projectId: env.projectId || "—",
        apiKey: maskKey(env.apiKey) || "—",
        authDomain: env.authDomain || "—",
        storageBucket: env.storageBucket || "—",
    };
    const missing = (["apiKey", "projectId", "appId"] as const).filter((key) => !env[key]).map((key) => ENV_NAMES[key]);
    if (missing.length) return check("clientConfig", "fail", "client_missing", missing.join(", "), "addClientConfig", { ...facts, missing: missing.join(", ") });
    if (!/^AIza[\w-]{35}$/.test(env.apiKey)) return check("clientConfig", "fail", "client_api_key_format", `${ENV_NAMES.apiKey} = ${maskKey(env.apiKey)}`, "fixClientConfig", facts);

    const warnings: Array<{ reason: CloudReason; variable: ClientConfigVariable; fix: CloudFixId }> = [];
    if (!/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(env.projectId)) warnings.push({ reason: "client_project_id_format", variable: ENV_NAMES.projectId, fix: "fixClientConfig" });
    const app = /^1:(\d+):(web|android|ios):[0-9a-f]+$/i.exec(env.appId);
    if (!app || app[2].toLowerCase() !== "web") warnings.push({ reason: "client_app_id", variable: ENV_NAMES.appId, fix: "fixClientConfig" });
    if (!env.authDomain || /[/:\s]/.test(env.authDomain)) warnings.push({ reason: "client_auth_domain", variable: ENV_NAMES.authDomain, fix: "fixAuthDomain" });
    if (!env.storageBucket || /^gs:\/\/|[/\s]/.test(env.storageBucket)) warnings.push({ reason: "client_bucket", variable: ENV_NAMES.storageBucket, fix: "fixStorageBucket" });
    if (app && env.messagingSenderId && app[1] !== env.messagingSenderId) warnings.push({ reason: "client_sender_mismatch", variable: ENV_NAMES.messagingSenderId, fix: "fixClientConfig" });
    if (warnings.length) return check("clientConfig", "warn", warnings[0].reason, warnings.map((warning) => warning.variable).join(", "), warnings[0].fix, facts);
    return check("clientConfig", "ok", "client_ok", `${env.projectId} · ${maskKey(env.apiKey)}`, null, facts);
}

function checkServerCredentials(info: ServerCredentialInfo): CloudCheck {
    const facts = { variable: info.variable ?? "—", projectId: info.projectId ?? "—", account: info.clientEmail ?? "—" };
    if (info.layout === "emulator") return check("serverCredentials", "ok", "creds_emulator", "FIRESTORE_EMULATOR_HOST", null, facts);
    if (!info.layout) return check("serverCredentials", "fail", "creds_missing", "FIREBASE_SERVICE_ACCOUNT_JSON | FIREBASE_SERVICE_ACCOUNT_BASE64 | FIREBASE_PROJECT_ID + FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY", "addServerCredentials", facts);
    if (!info.projectId) return check("serverCredentials", "fail", "creds_invalid", `${info.variable}: ${info.error ?? ""}`, "fixServerCredentials", facts);
    if (!info.privateKeyValid) return check("serverCredentials", "fail", "creds_key_invalid", `${info.variable}: ${info.error ?? ""}`, "fixServerCredentials", facts);
    if (info.ignored.length) return check("serverCredentials", "warn", "creds_multiple", `${info.variable} > ${info.ignored.join(", ")}`, null, { ...facts, ignored: info.ignored.join(", ") });
    return check("serverCredentials", "ok", "creds_ok", `${info.variable} · ${info.projectId}`, null, facts);
}

function checkProjectMatch(client: string, server: string | null): CloudCheck {
    if (!client || !server) return check("projectMatch", "skip", "projects_unknown", "", null, { client: client || "—", server: server ?? "—" });
    if (client === server) return check("projectMatch", "ok", "projects_match", client, null, { projectId: client });
    return check("projectMatch", "fail", "projects_differ", `${client} ≠ ${server}`, "alignProjects", { client, server });
}

/**
 * Which config /api/firebase/config hands the browser (it overrides the
 * bundle's build-time values before the app starts), and whether the
 * NEXT_PUBLIC_* values changed after this deployment was built.
 */
async function checkBrowserConfig(buildEnv: ClientEnv): Promise<{ result: CloudCheck; resolved: ResolvedPublicConfig }> {
    const resolved = await resolvePublicFirebaseConfig({ fresh: true });
    const runtimeEnv = readRuntimePublicEnv();
    const stale = PUBLIC_CONFIG_FIELDS.some((field) => runtimeEnv[field] !== buildEnv[field]);
    const facts: Record<string, string> = {
        source: resolved.source,
        projectId: resolved.config?.projectId || "—",
        apiKey: maskKey(resolved.config?.apiKey ?? "") || "—",
        buildProjectId: buildEnv.projectId || "—",
        runtimeProjectId: runtimeEnv.projectId || "—",
        issue: resolved.issue ?? "",
    };
    const detail = [`/api/firebase/config → ${resolved.source}`, resolved.issue ? `NEXT_PUBLIC_FIREBASE_*: ${resolved.issue}` : "", resolved.lookupError ? `Firebase: ${resolved.lookupError}` : ""].filter(Boolean).join(" · ");
    const result = (status: CloudCheckStatus, reason: CloudReason, fix: CloudFixId | null) => ({ result: check("browserConfig", status, reason, detail, fix, facts), resolved });
    if (resolved.source === "env" && !resolved.issue) return stale ? result("warn", "browser_config_stale", "redeployClientConfig") : result("ok", "browser_config_env", null);
    if (resolved.source === "management-api") {
        return result("warn", "browser_config_firebase", resolved.issue === "project_mismatch" ? "alignProjects" : resolved.issue === "missing" ? "addClientConfig" : "fixClientConfig");
    }
    if (resolved.source === "env") return result("fail", "browser_config_mismatch", "alignProjects");
    return result("fail", "browser_config_none", resolved.issue === "invalid" ? "fixClientConfig" : "addClientConfig");
}

async function checkAccessToken() {
    try {
        const dataToken = await getGoogleAccessToken("data");
        let adminToken: string | null = null;
        let adminError = "";
        try {
            adminToken = await getGoogleAccessToken("admin");
        } catch (error) {
            adminError = errorText(error);
        }
        return {
            result: adminToken
                ? check("accessToken", "ok", "token_ok", "datastore · identitytoolkit · cloud-platform")
                : check("accessToken", "warn", "token_admin_failed", adminError, "grantServiceAccountRoles"),
            dataToken,
            adminToken,
        };
    } catch (error) {
        const message = errorText(error);
        const rejected = /invalid_grant|invalid_client|unauthorized_client/i.test(message);
        return {
            result: check("accessToken", "fail", rejected ? "token_rejected" : "token_failed", message, rejected ? "rotateServiceAccountKey" : "checkNetwork"),
            dataToken: null,
            adminToken: null,
        };
    }
}

async function checkFirestoreRead(): Promise<CloudCheck> {
    try {
        const probe = await probeServerDocument("security_health/ping");
        const message = probe.message ?? "";
        // "Document … not found" still proves that the database answers; a missing
        // database reads "The database (default) does not exist for project …".
        const noDatabase = probe.status === 404 && /database[^"]*does not exist/i.test(message);
        if (probe.status === 200 || (probe.status === 404 && !noDatabase)) return check("firestoreRead", "ok", "firestore_ok", `HTTP ${probe.status}`);
        const detail = [`HTTP ${probe.status}`, probe.reason, message].filter(Boolean).join(" · ");
        if (noDatabase) return check("firestoreRead", "fail", "firestore_no_database", detail, "createFirestoreDatabase");
        if (/has not been used|it is disabled|SERVICE_DISABLED/i.test(message)) return check("firestoreRead", "fail", "firestore_api_disabled", detail, "enableFirestore");
        if (/datastore mode/i.test(message)) return check("firestoreRead", "fail", "firestore_datastore_mode", detail, "createFirestoreDatabase");
        if (probe.status === 401 || probe.status === 403) return check("firestoreRead", "fail", "firestore_permission", detail, "grantServiceAccountRoles");
        return check("firestoreRead", "fail", "firestore_failed", detail);
    } catch (error) {
        return check("firestoreRead", "fail", "firestore_failed", errorText(error), "checkNetwork");
    }
}

async function checkAuthConfig(project: string, token: string, siteHost: string): Promise<CloudCheck> {
    const result = await googleRequest<{ authorizedDomains?: unknown }>(`https://identitytoolkit.googleapis.com/admin/v2/projects/${encodeURIComponent(project)}/config`, { token });
    if (result.ok) {
        const domains = Array.isArray(result.data.authorizedDomains) ? result.data.authorizedDomains.filter((domain): domain is string => typeof domain === "string") : [];
        return check("authConfig", "ok", "auth_ok", domains.length ? `authorizedDomains: ${domains.slice(0, 8).join(", ")}` : "", null, {
            authorizedDomains: String(domains.length),
            siteAuthorized: domains.includes(siteHost) ? "yes" : "no",
        });
    }
    const { error } = result;
    if (error.code === "CONFIGURATION_NOT_FOUND" || /CONFIGURATION_NOT_FOUND/i.test(error.message) || error.status === 404) return check("authConfig", "fail", "auth_not_initialized", describeError(error), "initAuth");
    if (isServiceDisabled(error)) return check("authConfig", "fail", "auth_api_disabled", describeError(error), "enableIdentityToolkit");
    if (error.status === 401 || error.status === 403) return check("authConfig", "warn", "auth_permission", describeError(error), "grantServiceAccountRoles");
    return check("authConfig", "warn", "auth_failed", describeError(error), error.status === 0 ? "checkNetwork" : null);
}

/**
 * Exactly the browser's request: a custom token for the owner, exchanged with
 * the client API key and the site's Referer/Origin. The ID token stays here.
 */
async function checkBrowserSignIn(env: ClientEnv, ownerEmail: string, origin: string, projectsDiffer: boolean): Promise<{ result: CloudCheck; idToken: string | null }> {
    if (!env.apiKey) return { result: skipped("browserSignIn", "signin_no_api_key"), idToken: null };
    let customToken: string;
    try {
        customToken = await createFirebaseCustomToken(ownerEmail);
    } catch (error) {
        return { result: check("browserSignIn", "fail", "signin_failed", errorText(error), "fixServerCredentials"), idToken: null };
    }
    const exchange = await googleRequest<{ idToken?: unknown }>(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${encodeURIComponent(env.apiKey)}`, {
        method: "POST",
        headers: { Referer: `${origin}/`, Origin: origin },
        body: { token: customToken, returnSecureToken: true },
    });
    const facts = { origin };
    if (exchange.ok) {
        const idToken = typeof exchange.data.idToken === "string" ? exchange.data.idToken : null;
        return { result: check("browserSignIn", idToken ? "ok" : "warn", idToken ? "signin_ok" : "signin_failed", "accounts:signInWithCustomToken", null, facts), idToken };
    }
    const { error } = exchange;
    const detail = describeError(error);
    const text = `${error.message} ${error.reason}`;
    const outcome = (reason: CloudReason, fix: CloudFixId | null, status: CloudCheckStatus = "fail") => ({ result: check("browserSignIn", status, reason, detail, fix, facts), idToken: null });
    if (/INVALID_CUSTOM_TOKEN/.test(text)) return outcome("signin_invalid_token", projectsDiffer ? "alignProjects" : "rotateServiceAccountKey");
    if (/CREDENTIAL_MISMATCH/.test(text)) return outcome("signin_mismatch", "alignProjects");
    if (/CONFIGURATION_NOT_FOUND/.test(text)) return outcome("signin_not_initialized", "initAuth");
    if (error.reason === "API_KEY_SERVICE_BLOCKED" || /Requests to this API .* are blocked/i.test(error.message)) return outcome("signin_api_restricted", "apiKeyApis");
    // Website (referrer) restrictions, and also Android/iOS/IP application restrictions on the web key.
    if (/^API_KEY_.+_BLOCKED$/.test(error.reason) || /referer|referrer/i.test(error.message)) return outcome("signin_referrer", "apiKeyReferrer");
    if (error.reason === "API_KEY_INVALID" || /API key not valid|API_KEY_INVALID/i.test(text)) return outcome("signin_api_key_invalid", "fixApiKey");
    if (isServiceDisabled(error)) return outcome("signin_api_disabled", "enableIdentityToolkit");
    if (/USER_DISABLED/.test(text)) return outcome("signin_user_disabled", "enableAuthUser");
    if (/TOO_MANY_ATTEMPTS|QUOTA_EXCEEDED|RESOURCE_EXHAUSTED/i.test(`${text} ${error.code}`)) return outcome("signin_throttled", null, "warn");
    return outcome("signin_failed", error.status === 0 ? "checkNetwork" : null);
}

/** Reads users/{owner} as the signed-in owner: the deployed rules decide. */
async function checkRulesSelfRead(ownerEmail: string, idToken: string): Promise<CloudCheck> {
    try {
        const probe = await probeServerDocument(`users/${ownerEmail}`, idToken);
        if (probe.status === 200 || probe.status === 404) return check("rulesSelfRead", "ok", "rules_read_ok", `GET users/{email} → ${probe.status}`);
        const detail = [`HTTP ${probe.status}`, probe.reason, probe.message].filter(Boolean).join(" · ");
        if (probe.status === 403) return check("rulesSelfRead", "fail", "rules_read_denied", detail, "deployRules");
        return check("rulesSelfRead", "fail", "rules_read_failed", detail);
    } catch (error) {
        return check("rulesSelfRead", "fail", "rules_read_failed", errorText(error), "checkNetwork");
    }
}

function rulesError(id: CloudCheckId, error: GoogleError): CloudCheck {
    if (isServiceDisabled(error)) return check(id, "warn", "rules_api_disabled", describeError(error), "enableRulesApi");
    if (error.status === 401 || error.status === 403) return check(id, "warn", "rules_permission", describeError(error), "grantRulesAdmin");
    return check(id, "warn", "rules_failed", describeError(error), error.status === 0 ? "checkNetwork" : null);
}

/** Compares the deployed release with the repository's rule file. */
async function checkRulesRelease(kind: "firestore" | "storage", project: string, token: string, bucket: string | null): Promise<CloudCheck> {
    const id: CloudCheckId = kind === "firestore" ? "firestoreRules" : "storageRules";
    const file: RulesFile = kind === "firestore" ? "firestore.rules" : "storage.rules";
    if (kind === "storage" && !bucket) return check(id, "skip", "rules_no_bucket", "", "fixStorageBucket", { file });
    const release = releaseOf(kind, project, bucket);
    const deployed = await googleRequest<{ rulesetName?: unknown; updateTime?: unknown }>(release.url, { token });
    if (!deployed.ok) {
        if (deployed.error.status === 404) return check(id, "fail", "rules_never_deployed", release.name, "deployRules", { file });
        return rulesError(id, deployed.error);
    }
    const rulesetName = typeof deployed.data.rulesetName === "string" ? deployed.data.rulesetName : "";
    if (!rulesetName) return check(id, "fail", "rules_never_deployed", release.name, "deployRules", { file });
    const facts: Record<string, string> = { file, ruleset: shortName(rulesetName) };
    if (typeof deployed.data.updateTime === "string") facts.deployedAt = deployed.data.updateTime;
    const ruleset = await googleRequest<{ source?: { files?: Array<{ content?: unknown }> } }>(`${RULES_API}/${rulesetName.split("/").map(encodeURIComponent).join("/")}`, { token });
    if (!ruleset.ok) return rulesError(id, ruleset.error);
    let bundled: string;
    try {
        bundled = await readBundledRules(file);
    } catch (error) {
        return check(id, "warn", "rules_bundle_missing", errorText(error), "redeploy", facts);
    }
    const deployedHash = rulesHash(rulesetSource(ruleset.data));
    const bundledHash = rulesHash(bundled);
    const hashes = `deployed ${deployedHash.slice(0, 12)} · repository ${bundledHash.slice(0, 12)}`;
    if (deployedHash === bundledHash) return check(id, "ok", "rules_same", hashes, null, facts);
    return check(id, "warn", "rules_differ", hashes, "deployRules", facts);
}

/**
 * Voice messages are kept in Firestore now; the bucket only serves older
 * recordings, so a missing one (Storage needs the Blaze plan) isn't an error.
 */
async function checkStorageBucket(bucket: { name: string | null; raw: string }, token: string | null): Promise<CloudCheck> {
    if (!bucket.name) return check("storageBucket", "skip", "bucket_missing", bucket.raw ? `"${bucket.raw.slice(0, 80)}"` : "FIREBASE_STORAGE_BUCKET / NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET");
    if (!token) return skipped("storageBucket");
    const result = await googleRequest<{ location?: unknown }>(`https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(bucket.name)}`, { token });
    const facts = { bucket: bucket.name };
    if (result.ok) return check("storageBucket", "ok", "bucket_ok", typeof result.data.location === "string" ? `${bucket.name} · ${result.data.location}` : bucket.name, null, facts);
    if (result.error.status === 404 || result.error.status === 402) return check("storageBucket", "warn", "bucket_not_found", describeError(result.error), "initStorage", facts);
    if (result.error.status === 401 || result.error.status === 403) return check("storageBucket", "warn", "bucket_permission", describeError(result.error), "grantServiceAccountRoles", facts);
    return check("storageBucket", "warn", "bucket_failed", describeError(result.error), result.error.status === 0 ? "checkNetwork" : null, facts);
}

/** Voice calls: is a TURN relay configured, and does it hand out credentials? */
async function checkTurnServer(): Promise<CloudCheck> {
    const result = await checkTurn().catch(() => ({ provider: "none" as const, ok: false, problem: "turn_failed", urls: [] as string[] }));
    const facts = { provider: result.provider, problem: result.problem ?? "" };
    if (result.ok) return check("turnServer", "ok", "turn_ok", result.urls.slice(0, 4).join(" · "), null, facts);
    if (result.problem === "turn_missing") return check("turnServer", "warn", "turn_missing", "CLOUDFLARE_TURN_KEY_ID · CLOUDFLARE_TURN_KEY_API_TOKEN", "setupTurn", facts);
    if (result.problem === "turn_credentials_missing") return check("turnServer", "warn", "turn_credentials_missing", "TURN_SHARED_SECRET · TURN_USERNAME + TURN_CREDENTIAL", "setupTurn", facts);
    return check("turnServer", "fail", "turn_failed", result.problem ?? "", "setupTurn", facts);
}

type WebApp = { appId: string; displayName: string | null; config: PublicFirebaseConfig };

/**
 * The project's web app (the one with `preferredAppId` when it exists, else
 * the first active one) and its public config, from the Firebase Management
 * API. Needs a token with the firebase or cloud-platform scope.
 */
async function fetchWebAppConfig(project: string, token: string, preferredAppId: string, timeoutMs?: number): Promise<{ app: WebApp | null; error: string | null }> {
    const base = `https://firebase.googleapis.com/v1beta1/projects/${encodeURIComponent(project)}/webApps`;
    const apps = await googleRequest<{ apps?: Array<{ appId?: unknown; displayName?: unknown; state?: unknown }> }>(`${base}?pageSize=100`, { token, timeoutMs });
    if (!apps.ok) return { app: null, error: describeError(apps.error) };
    const list = (apps.data.apps ?? []).filter((app): app is { appId: string; displayName?: unknown; state?: unknown } => typeof app.appId === "string");
    if (!list.length) return { app: null, error: "no_web_app" };
    const chosen = list.find((app) => app.appId === preferredAppId) ?? list.find((app) => app.state === "ACTIVE") ?? list[0];
    const config = await googleRequest<Record<string, unknown>>(`${base}/${encodeURIComponent(chosen.appId)}/config`, { token, timeoutMs });
    if (!config.ok) return { app: null, error: describeError(config.error) };
    const values = sanitizePublicConfig(config.data);
    return {
        app: {
            appId: chosen.appId,
            displayName: typeof chosen.displayName === "string" ? chosen.displayName : null,
            config: { ...values, projectId: values.projectId || project, appId: values.appId || chosen.appId },
        },
        error: null,
    };
}

/** Best effort: the web app's real config from the Firebase Management API, by variable name. */
async function suggestClientConfig(project: string, token: string, env: ClientEnv): Promise<{ config: SuggestedClientConfig | null; error: string | null }> {
    const { app, error } = await fetchWebAppConfig(project, token, env.appId);
    if (!app) return { config: null, error };
    const values = Object.fromEntries(PUBLIC_CONFIG_FIELDS.map((field) => [ENV_NAMES[field], app.config[field]])) as Record<ClientConfigVariable, string>;
    const current: Record<ClientConfigVariable, string> = {
        NEXT_PUBLIC_FIREBASE_API_KEY: env.apiKey,
        NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: env.authDomain,
        NEXT_PUBLIC_FIREBASE_PROJECT_ID: env.projectId,
        NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: env.storageBucket,
        NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: env.messagingSenderId,
        NEXT_PUBLIC_FIREBASE_APP_ID: env.appId,
    };
    const differs = CLIENT_CONFIG_VARIABLES.filter((variable) => values[variable] && values[variable] !== current[variable]);
    return { config: { appId: app.appId, displayName: app.displayName, values, differs }, error: null };
}

/** Runs every check; `ownerEmail` is the signed-in owner, `origin` the site address the browser uses. */
export async function runCloudHealthChecks(options: { ownerEmail: string; origin: string }): Promise<CloudHealthReport> {
    const env = readClientEnv();
    const credentials = describeServerCredentials();
    const emulator = isFirebaseEmulator();
    const bucket = storageBucket();
    const serverProject = credentials.projectId;
    const usable = Boolean(credentials.layout && serverProject && credentials.privateKeyValid);
    let siteHost = "";
    try {
        siteHost = new URL(options.origin).hostname;
    } catch {
        siteHost = "";
    }

    // Independent of Firebase: runs alongside everything else.
    const turnServer = checkTurnServer();
    const browser = await checkBrowserConfig(env);
    // Build-time values the runtime config already replaces still need fixing,
    // but they no longer break the browser: report them as warnings.
    const coveredAtRuntime = (item: CloudCheck): CloudCheck => (browser.resolved.source === "management-api" && item.status === "fail" ? { ...item, status: "warn" } : item);
    const clientConfig = coveredAtRuntime(checkClientConfig(env));
    const serverCredentials = checkServerCredentials(credentials);
    const projectMatch = coveredAtRuntime(checkProjectMatch(env.projectId, serverProject));
    // The sign-in simulation uses the config the browser will really have.
    const browserEnv: ClientEnv = browser.resolved.config ?? env;

    let checks: CloudCheck[];
    let suggestion: { config: SuggestedClientConfig | null; error: string | null } = { config: null, error: null };
    if (emulator || !usable || !serverProject) {
        const reason: CloudReason = emulator ? "emulator" : "skipped";
        const rest: CloudCheckId[] = ["accessToken", "firestoreRead", "authConfig", "browserSignIn", "rulesSelfRead", "firestoreRules", "storageRules", "storageBucket"];
        const firestoreRead = emulator ? await checkFirestoreRead() : null;
        checks = [clientConfig, serverCredentials, projectMatch, browser.result, ...rest.map((id) => (id === "firestoreRead" && firestoreRead ? firestoreRead : skipped(id, reason)))];
    } else {
        const token = await checkAccessToken();
        const { dataToken, adminToken } = token;
        const browserChain = async (): Promise<[CloudCheck, CloudCheck]> => {
            if (!dataToken) return [skipped("browserSignIn"), skipped("rulesSelfRead")];
            const signIn = await checkBrowserSignIn(browserEnv, options.ownerEmail, options.origin, browserEnv.projectId !== serverProject);
            return [signIn.result, signIn.idToken ? await checkRulesSelfRead(options.ownerEmail, signIn.idToken) : skipped("rulesSelfRead")];
        };
        const [firestoreRead, authConfig, [browserSignIn, rulesSelfRead], firestoreRules, storageRules, storageBucketCheck, suggested] = await Promise.all([
            dataToken ? checkFirestoreRead() : Promise.resolve(skipped("firestoreRead")),
            adminToken ? checkAuthConfig(serverProject, adminToken, siteHost) : Promise.resolve(skipped("authConfig")),
            browserChain(),
            adminToken ? checkRulesRelease("firestore", serverProject, adminToken, bucket.name) : Promise.resolve(skipped("firestoreRules")),
            adminToken ? checkRulesRelease("storage", serverProject, adminToken, bucket.name) : Promise.resolve(skipped("storageRules")),
            checkStorageBucket(bucket, dataToken),
            adminToken ? suggestClientConfig(serverProject, adminToken, env) : Promise.resolve({ config: null, error: null }),
        ]);
        suggestion = suggested;
        checks = [clientConfig, serverCredentials, projectMatch, browser.result, token.result, firestoreRead, authConfig, browserSignIn, rulesSelfRead, firestoreRules, storageRules, storageBucketCheck];
    }
    checks.push(await turnServer);

    const summary: Record<CloudCheckStatus, number> = { ok: 0, warn: 0, fail: 0, skip: 0 };
    for (const item of checks) summary[item.status] += 1;
    return {
        checkedAt: new Date().toISOString(),
        origin: options.origin,
        deployment: {
            env: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? null,
            commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
        },
        projectIds: { client: env.projectId || null, server: serverProject },
        browserConfigSource: browser.resolved.source,
        serviceAccount: credentials.clientEmail,
        checks,
        suggestedClientConfig: suggestion.config,
        suggestedClientConfigError: suggestion.error,
        summary,
    };
}

// ---------------------------------------------------------------------------
// Rules deployment
// ---------------------------------------------------------------------------

function deployFailure(base: Pick<RulesDeployResult, "file" | "release">, error: GoogleError): RulesDeployResult {
    const detail = describeError(error);
    if (isServiceDisabled(error)) return { ...base, status: "failed", reason: "api_disabled", detail, fix: "enableRulesApi" };
    if (error.status === 401 || error.status === 403) return { ...base, status: "failed", reason: "permission", detail, fix: "grantRulesAdmin" };
    if (error.status === 400) return { ...base, status: "failed", reason: "invalid_rules", detail, fix: null };
    return { ...base, status: "failed", reason: "failed", detail, fix: error.status === 0 ? "checkNetwork" : null };
}

async function deployRulesFile(kind: "firestore" | "storage", project: string, token: string, bucket: string | null): Promise<RulesDeployResult> {
    const file: RulesFile = kind === "firestore" ? "firestore.rules" : "storage.rules";
    const release = releaseOf(kind, project, bucket);
    const base = { file, release: release.name };
    let content: string;
    try {
        content = await readBundledRules(file);
    } catch (error) {
        return { ...base, status: "failed", reason: "bundle_missing", detail: errorText(error), fix: "redeploy" };
    }

    // Identical rules are not deployed again: every deploy adds a ruleset and projects keep at most 2,500.
    const current = await googleRequest<{ rulesetName?: unknown }>(release.url, { token });
    if (current.ok && typeof current.data.rulesetName === "string") {
        const currentName = current.data.rulesetName;
        const existing = await googleRequest<{ source?: { files?: Array<{ content?: unknown }> } }>(`${RULES_API}/${currentName.split("/").map(encodeURIComponent).join("/")}`, { token });
        if (existing.ok && rulesHash(rulesetSource(existing.data)) === rulesHash(content)) {
            return { ...base, status: "unchanged", reason: "unchanged", detail: shortName(currentName), fix: null };
        }
    } else if (!current.ok && current.error.status !== 404) {
        return deployFailure(base, current.error);
    }

    const created = await googleRequest<{ name?: unknown }>(`${RULES_API}/projects/${encodeURIComponent(project)}/rulesets`, {
        token,
        method: "POST",
        body: { source: { files: [{ name: file, content }] } },
    });
    if (!created.ok) return deployFailure(base, created.error);
    const rulesetName = typeof created.data.name === "string" ? created.data.name : "";
    if (!rulesetName) return { ...base, status: "failed", reason: "failed", detail: "ruleset name missing", fix: null };

    const updated = await googleRequest(release.url, { token, method: "PATCH", body: { release: { name: release.name, rulesetName } } });
    if (!updated.ok) {
        if (updated.error.status !== 404) return deployFailure(base, updated.error);
        const createdRelease = await googleRequest(`${RULES_API}/projects/${encodeURIComponent(project)}/releases`, { token, method: "POST", body: { name: release.name, rulesetName } });
        if (!createdRelease.ok) return deployFailure(base, createdRelease.error);
    }
    return { ...base, status: "deployed", reason: "deployed", detail: shortName(rulesetName), fix: null };
}

/**
 * Deploys the repository's firestore.rules and storage.rules like
 * `firebase deploy --only firestore:rules,storage`: a new ruleset per file,
 * then the release is pointed at it. Needs the Firebase Rules Admin role.
 */
export async function deployBundledRules(): Promise<CloudDeployResponse> {
    const credentials = describeServerCredentials();
    if (!credentials.projectId || !credentials.privateKeyValid) throw new Error(credentials.error || "Firebase sunucu kimliği yapılandırılmamış.");
    const project = credentials.projectId;
    const token = await getGoogleAccessToken("admin");
    const bucket = storageBucket().name;
    const firestore = await deployRulesFile("firestore", project, token, bucket);
    const storage: RulesDeployResult = bucket
        ? await deployRulesFile("storage", project, token, bucket)
        : { file: "storage.rules", release: `projects/${project}/releases/firebase.storage`, status: "skipped", reason: "no_bucket", detail: "", fix: "fixStorageBucket" };
    return { projectId: project, results: [firestore, storage] };
}
