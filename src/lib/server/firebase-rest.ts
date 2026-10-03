import "server-only";

import { createSign, createHash, generateKeyPairSync } from "node:crypto";
import { CREDENTIAL_VARIABLES, credentialSources, MISSING_CREDENTIALS_MESSAGE, resolveServiceAccount, type CredentialResolution, type ServerCredentialLayout, type ServiceAccount } from "./service-account";

/** Where the service account came from (Cloud Health shows it; never the key itself). */
export type { ServerCredentialLayout };

type FirestoreValue =
    | { nullValue: null }
    | { booleanValue: boolean }
    | { integerValue: string }
    | { doubleValue: number }
    | { timestampValue: string }
    | { stringValue: string }
    /** Base64 in the REST API; a Uint8Array (or Buffer) is written as bytes and read back as a Buffer. */
    | { bytesValue: string }
    | { arrayValue: { values?: FirestoreValue[] } }
    | { mapValue: { fields?: Record<string, FirestoreValue> } };

type FirestoreDocument = {
    name: string;
    fields?: Record<string, FirestoreValue>;
    createTime?: string;
    updateTime?: string;
};

/**
 * OAuth scope sets of the service-account access token. "data" covers
 * Firestore, Firebase Auth users and Storage objects (every regular route);
 * "admin" adds the Firebase Rules, Management and Auth-config APIs used by
 * the owner's Cloud Health panel. Each set has its own cached token.
 */
const TOKEN_SCOPES = {
    data: "https://www.googleapis.com/auth/datastore https://www.googleapis.com/auth/identitytoolkit https://www.googleapis.com/auth/devstorage.full_control",
    admin: "https://www.googleapis.com/auth/cloud-platform https://www.googleapis.com/auth/firebase",
} as const;

export type GoogleTokenScope = keyof typeof TOKEN_SCOPES;

const cachedTokens = new Map<GoogleTokenScope, { value: string; expiresAt: number }>();

/**
 * Firebase Emulator Suite support for local development and end-to-end tests,
 * following the Admin SDK's FIRESTORE_EMULATOR_HOST convention. Only loopback
 * addresses are honored, so production can never be pointed elsewhere.
 */
function emulator(variable: "FIRESTORE_EMULATOR_HOST" | "FIREBASE_AUTH_EMULATOR_HOST" | "FIREBASE_STORAGE_EMULATOR_HOST") {
    const value = process.env[variable]?.trim();
    return value && /^(?:127\.0\.0\.1|localhost):\d{2,5}$/.test(value) ? value : null;
}

let emulatorKey: string | null = null;

function emulatorServiceAccount(): ServiceAccount {
    if (!emulatorKey) emulatorKey = generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    return {
        client_email: "emulator@hanogt.local",
        private_key: emulatorKey,
        project_id: (process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "demo-hanogt").trim(),
    };
}

const firestoreBase = () => (emulator("FIRESTORE_EMULATOR_HOST") ? `http://${emulator("FIRESTORE_EMULATOR_HOST")}/v1` : "https://firestore.googleapis.com/v1");

function base64Url(value: string | Buffer) {
    return Buffer.from(value).toString("base64url");
}

// The service account read from the environment (src/lib/server/service-account.ts
// accepts every common way of pasting it). Environment values don't change while
// the process runs, but tests and dev reloads set them, so the cache follows them.
let resolvedCredentials: { key: string; result: CredentialResolution } | null = null;

function credentialResolution(): CredentialResolution {
    const key = CREDENTIAL_VARIABLES.map((name) => process.env[name] ?? "").join("\u0000");
    if (resolvedCredentials?.key !== key) resolvedCredentials = { key, result: resolveServiceAccount() };
    return resolvedCredentials.result;
}

function getServiceAccount(): ServiceAccount {
    if (emulator("FIRESTORE_EMULATOR_HOST")) return emulatorServiceAccount();
    const result = credentialResolution();
    if (result.account) return result.account;
    // The first variable that is set is the one the owner meant; its problem is the useful one.
    throw new Error(result.tried[0]?.error ?? MISSING_CREDENTIALS_MESSAGE);
}

export function getFirebaseProjectId() {
    return getServiceAccount().project_id;
}

/** True when server credentials are present; it does not prove that they work. */
export function isFirebaseServerConfigured() {
    try {
        getServiceAccount();
        return true;
    } catch {
        return false;
    }
}

/** True while the server talks to the local Firebase Emulator Suite. */
export function isFirebaseEmulator() {
    return Boolean(emulator("FIRESTORE_EMULATOR_HOST"));
}

export type ServerCredentialInfo = {
    layout: ServerCredentialLayout | null;
    /** The variable(s) the credentials were read from. */
    variable: string | null;
    /** Other credential variables that are set but ignored because `variable` wins. */
    ignored: string[];
    projectId: string | null;
    /** Service-account e-mail (an identifier, not a secret): IAM roles are granted to it. */
    clientEmail: string | null;
    privateKeyValid: boolean;
    /** Why the credentials could not be used (never contains key material). */
    error: string | null;
};

/** Secret-free description of the configured service account for diagnostics. */
export function describeServerCredentials(): ServerCredentialInfo {
    if (emulator("FIRESTORE_EMULATOR_HOST")) {
        return { layout: "emulator", variable: "FIRESTORE_EMULATOR_HOST", ignored: [], projectId: emulatorServiceAccount().project_id, clientEmail: null, privateKeyValid: true, error: null };
    }
    const result = credentialResolution();
    const used = result.source ?? result.tried[0] ?? null;
    const variable = used?.variable ?? null;
    const info: ServerCredentialInfo = {
        layout: used?.layout ?? null,
        variable,
        ignored: credentialSources().map((entry) => entry.variable).filter((name) => name !== variable),
        projectId: result.account?.project_id ?? null,
        clientEmail: result.account?.client_email ?? null,
        // resolveServiceAccount only accepts keys that Node can load.
        privateKeyValid: Boolean(result.account),
        error: null,
    };
    if (!result.account) {
        const message = result.tried[0]?.error ?? MISSING_CREDENTIALS_MESSAGE;
        // Cloud Health prints the variable itself, so it isn't repeated here.
        info.error = variable && message.startsWith(`${variable}: `) ? message.slice(variable.length + 2) : message;
    }
    return info;
}

async function getAccessToken(scope: GoogleTokenScope = "data") {
    // The emulators accept the special "owner" token, which bypasses security rules like a service account.
    if (emulator("FIRESTORE_EMULATOR_HOST")) return "owner";
    const cached = cachedTokens.get(scope);
    if (cached && cached.expiresAt > Date.now() + 60_000) {
        return cached.value;
    }

    const account = getServiceAccount();
    const now = Math.floor(Date.now() / 1000);
    const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
    const claims = base64Url(JSON.stringify({
        iss: account.client_email,
        sub: account.client_email,
        aud: "https://oauth2.googleapis.com/token",
        scope: TOKEN_SCOPES[scope],
        iat: now,
        exp: now + 3600,
    }));
    const unsigned = `${header}.${claims}`;
    const signer = createSign("RSA-SHA256");
    signer.update(unsigned);
    signer.end();
    const assertion = `${unsigned}.${signer.sign(account.private_key).toString("base64url")}`;

    const response = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
            grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
            assertion,
        }),
        cache: "no-store",
    });
    const result = await response.json().catch(() => ({})) as { access_token?: string; expires_in?: number; error?: string; error_description?: string };
    if (!response.ok || !result.access_token) {
        // Google's code (e.g. "invalid_grant: Invalid JWT Signature.") tells a deleted key from a wrong clock.
        const reason = [result.error, result.error_description].filter(Boolean).join(": ");
        throw new Error(reason ? `Firebase erişim belirteci alınamadı (${reason})` : `Firebase erişim belirteci alınamadı (HTTP ${response.status}).`);
    }
    cachedTokens.set(scope, {
        value: result.access_token,
        expiresAt: Date.now() + (result.expires_in || 3600) * 1000,
    });
    return result.access_token;
}

/** Service-account OAuth token; "admin" is for the Firebase Rules/Management/Auth-config APIs. */
export function getGoogleAccessToken(scope: GoogleTokenScope = "data") {
    return getAccessToken(scope);
}

/**
 * Rejects document paths with empty, "." or ".." segments or control
 * characters. Paths are built from ids inside API routes; `new URL` would
 * resolve "../" and let a crafted id address another collection, so this is a
 * last line of defense behind the per-route id validation.
 */
function assertSafePath(path: string) {
    if (!path) return;
    if (path.length > 6_000 || /[\u0000-\u001f\u007f]/.test(path)) throw new Error("Geçersiz belge yolu.");
    for (const segment of path.split("/")) {
        if (!segment || segment === "." || segment === ".." || segment.length > 1_500) throw new Error("Geçersiz belge yolu.");
    }
}

function encodeDocumentPath(path: string) {
    assertSafePath(path);
    return path.split("/").map(encodeURIComponent).join("/");
}

function documentUrl(path: string) {
    const projectId = getFirebaseProjectId();
    return `${firestoreBase()}/projects/${encodeURIComponent(projectId)}/databases/(default)/documents/${encodeDocumentPath(path)}`;
}

function documentName(path: string) {
    assertSafePath(path);
    const projectId = getFirebaseProjectId();
    return `projects/${projectId}/databases/(default)/documents/${path}`;
}

function databaseDocumentsUrl(path = "") {
    const projectId = getFirebaseProjectId();
    const suffix = path ? `/${encodeDocumentPath(path)}` : "";
    return `${firestoreBase()}/projects/${encodeURIComponent(projectId)}/databases/(default)/documents${suffix}`;
}

function decodeDocument<T extends Record<string, unknown>>(document: FirestoreDocument) {
    const path = document.name.split("/documents/")[1] || "";
    return {
        ...decodeFields(document.fields || {}) as T,
        _id: path.split("/").pop() || "",
        _path: path,
        _updateTime: document.updateTime,
    };
}

function toFirestoreValue(value: unknown): FirestoreValue {
    if (value === null || value === undefined) return { nullValue: null };
    if (typeof value === "boolean") return { booleanValue: value };
    if (typeof value === "number") {
        return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
    }
    if (typeof value === "string") return { stringValue: value };
    if (value instanceof Date) return { timestampValue: value.toISOString() };
    if (value instanceof Uint8Array) return { bytesValue: Buffer.from(value.buffer, value.byteOffset, value.byteLength).toString("base64") };
    if (Array.isArray(value)) return { arrayValue: { values: value.map(toFirestoreValue) } };
    if (typeof value === "object") {
        return { mapValue: { fields: encodeFields(value as Record<string, unknown>) } };
    }
    return { stringValue: String(value) };
}

function fromFirestoreValue(value: FirestoreValue): unknown {
    if ("nullValue" in value) return null;
    if ("booleanValue" in value) return value.booleanValue;
    if ("integerValue" in value) return Number(value.integerValue);
    if ("doubleValue" in value) return value.doubleValue;
    if ("timestampValue" in value) return value.timestampValue;
    if ("stringValue" in value) return value.stringValue;
    if ("bytesValue" in value) return Buffer.from(value.bytesValue, "base64");
    if ("arrayValue" in value) return (value.arrayValue.values || []).map(fromFirestoreValue);
    if ("mapValue" in value) return decodeFields(value.mapValue.fields || {});
    return null;
}

function encodeFields(data: Record<string, unknown>) {
    return Object.fromEntries(
        Object.entries(data)
            .filter(([, value]) => value !== undefined)
            .map(([key, value]) => [key, toFirestoreValue(value)]),
    );
}

function decodeFields(fields: Record<string, FirestoreValue>) {
    return Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, fromFirestoreValue(value)]));
}

async function firestoreFetch(url: string, init: RequestInit = {}) {
    const token = await getAccessToken();
    return fetch(url, {
        ...init,
        headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
            ...(init.headers || {}),
        },
        cache: "no-store",
    });
}

export async function getServerDocument<T extends Record<string, unknown>>(path: string): Promise<(T & { _updateTime?: string }) | null> {
    const response = await firestoreFetch(documentUrl(path));
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`Firestore okuma hatası (${response.status}).`);
    const document = await response.json() as FirestoreDocument;
    return decodeDocument<T>(document);
}

export type FirestoreProbe = { status: number; reason: string | null; message: string | null };

/**
 * Diagnostic GET of one document that keeps Google's error status and message
 * (getServerDocument maps 404 to null, which also hides a missing database).
 * With `idToken` the read runs as that Firebase user, so security rules apply.
 */
export async function probeServerDocument(path: string, idToken?: string): Promise<FirestoreProbe> {
    const token = idToken ?? await getAccessToken();
    const response = await fetch(documentUrl(path), { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
    if (response.ok) return { status: response.status, reason: null, message: null };
    const payload = await response.json().catch(() => null) as { error?: { status?: unknown; message?: unknown } } | null;
    return {
        status: response.status,
        reason: typeof payload?.error?.status === "string" ? payload.error.status : null,
        message: typeof payload?.error?.message === "string" ? payload.error.message.slice(0, 400) : null,
    };
}

export async function listServerCollection<T extends Record<string, unknown>>(collectionPath: string, pageSize = 300) {
    const results: Array<T & { _id: string; _path: string; _updateTime?: string }> = [];
    let pageToken = "";
    do {
        const url = new URL(databaseDocumentsUrl(collectionPath));
        url.searchParams.set("pageSize", String(Math.min(Math.max(pageSize, 1), 1000)));
        if (pageToken) url.searchParams.set("pageToken", pageToken);
        const response = await firestoreFetch(url.toString());
        if (response.status === 404) return results;
        if (!response.ok) throw new Error(`Firestore koleksiyon okuma hatası (${response.status}).`);
        const payload = await response.json() as { documents?: FirestoreDocument[]; nextPageToken?: string };
        results.push(...(payload.documents || []).map((document) => decodeDocument<T>(document)));
        pageToken = payload.nextPageToken || "";
    } while (pageToken);
    return results;
}

type FirestoreQueryOperator = "EQUAL" | "ARRAY_CONTAINS";

export async function queryServerCollection<T extends Record<string, unknown>>(
    collectionId: string,
    fieldPath: string,
    op: FirestoreQueryOperator,
    value: unknown,
    options: { parentPath?: string; allDescendants?: boolean; limit?: number } = {},
) {
    const parentPath = options.parentPath || "";
    if (collectionId.includes("/")) throw new Error("Geçersiz koleksiyon kimliği.");
    const url = `${databaseDocumentsUrl(parentPath)}:runQuery`;
    const response = await firestoreFetch(url, {
        method: "POST",
        body: JSON.stringify({
            structuredQuery: {
                from: [{ collectionId, allDescendants: options.allDescendants || false }],
                where: {
                    fieldFilter: {
                        field: { fieldPath },
                        op,
                        value: toFirestoreValue(value),
                    },
                },
                limit: Math.min(Math.max(options.limit || 300, 1), 1000),
            },
        }),
    });
    if (!response.ok) throw new Error(`Firestore sorgu hatası (${response.status}).`);
    const payload = await response.json() as Array<{ document?: FirestoreDocument }>;
    return payload
        .filter((item): item is { document: FirestoreDocument } => Boolean(item.document))
        .map((item) => decodeDocument<T>(item.document));
}

type QueryFilter = { field: string; op: "EQUAL" | "ARRAY_CONTAINS" | "IN" | "GREATER_THAN" | "LESS_THAN" | "GREATER_THAN_OR_EQUAL" | "LESS_THAN_OR_EQUAL"; value: unknown };

/**
 * General structured query with optional field projection (`select`), filters
 * and ordering. Projections keep list endpoints small when documents carry
 * large payloads (e.g. game content).
 */
export async function runServerQuery<T extends Record<string, unknown>>(options: {
    collectionId: string;
    parentPath?: string;
    where?: QueryFilter[];
    orderBy?: Array<{ field: string; direction?: "ASCENDING" | "DESCENDING" }>;
    select?: string[];
    limit?: number;
}) {
    const url = `${databaseDocumentsUrl(options.parentPath || "")}:runQuery`;
    const filters = (options.where || []).map((filter) => ({
        fieldFilter: { field: { fieldPath: filter.field }, op: filter.op, value: toFirestoreValue(filter.value) },
    }));
    const structuredQuery: Record<string, unknown> = {
        from: [{ collectionId: options.collectionId }],
        limit: Math.min(Math.max(options.limit || 100, 1), 1000),
    };
    if (filters.length === 1) structuredQuery.where = filters[0];
    if (filters.length > 1) structuredQuery.where = { compositeFilter: { op: "AND", filters } };
    if (options.orderBy?.length) structuredQuery.orderBy = options.orderBy.map((order) => ({ field: { fieldPath: order.field }, direction: order.direction || "ASCENDING" }));
    if (options.select?.length) structuredQuery.select = { fields: options.select.map((fieldPath) => ({ fieldPath })) };
    const response = await firestoreFetch(url, { method: "POST", body: JSON.stringify({ structuredQuery }) });
    if (!response.ok) {
        const error = new Error(`Firestore sorgu hatası (${response.status}).`) as Error & { status?: number };
        error.status = response.status;
        throw error;
    }
    const payload = await response.json() as Array<{ document?: FirestoreDocument }>;
    return payload
        .filter((item): item is { document: FirestoreDocument } => Boolean(item.document))
        .map((item) => decodeDocument<T>(item.document));
}

/**
 * COUNT() aggregation (billed per 1000 index entries); `upTo` stops early.
 * Used by the admin dashboard instead of reading document ids.
 */
export async function countServerQuery(options: { collectionId: string; where?: QueryFilter[]; upTo?: number }) {
    const filters = (options.where || []).map((filter) => ({
        fieldFilter: { field: { fieldPath: filter.field }, op: filter.op, value: toFirestoreValue(filter.value) },
    }));
    const structuredQuery: Record<string, unknown> = { from: [{ collectionId: options.collectionId }] };
    if (filters.length === 1) structuredQuery.where = filters[0];
    if (filters.length > 1) structuredQuery.where = { compositeFilter: { op: "AND", filters } };
    const response = await firestoreFetch(`${databaseDocumentsUrl()}:runAggregationQuery`, {
        method: "POST",
        body: JSON.stringify({
            structuredAggregationQuery: {
                structuredQuery,
                aggregations: [{ alias: "total", count: options.upTo ? { upTo: String(options.upTo) } : {} }],
            },
        }),
    });
    if (!response.ok) {
        const error = new Error(`Firestore sayım hatası (${response.status}).`) as Error & { status?: number };
        error.status = response.status;
        throw error;
    }
    const payload = await response.json() as Array<{ result?: { aggregateFields?: Record<string, { integerValue?: string }> } }>;
    return Number(payload[0]?.result?.aggregateFields?.total?.integerValue ?? 0);
}

type FirestoreHttpError = Error & { status?: number; reason?: string };

/** Error of a failed Firestore REST call with its HTTP status and canonical code (e.g. FAILED_PRECONDITION). */
async function firestoreHttpError(response: Response, label: string) {
    const payload = await response.json().catch(() => null) as { error?: { status?: unknown } } | null;
    const error = new Error(`${label} (${response.status}).`) as FirestoreHttpError;
    error.status = response.status;
    if (typeof payload?.error?.status === "string") error.reason = payload.error.status;
    return error;
}

/** True when a write that required an existing document (`exists: true`) found none. */
export function isMissingDocument(error: unknown) {
    if (!(error instanceof Error)) return false;
    const { status, reason } = error as FirestoreHttpError;
    return reason ? reason === "NOT_FOUND" : status === 404;
}

/**
 * True when a conditional write lost a race: a stale `updateTime` (HTTP 400
 * FAILED_PRECONDITION), a document that already exists (409) or an aborted commit.
 */
export function isWriteConflict(error: unknown) {
    if (!(error instanceof Error)) return false;
    const { status, reason } = error as FirestoreHttpError;
    if (reason) return reason === "FAILED_PRECONDITION" || reason === "ALREADY_EXISTS" || reason === "ABORTED";
    return status === 409 || status === 412;
}

export async function patchServerDocument(
    path: string,
    data: Record<string, unknown>,
    options: { updateFields?: string[]; updateTime?: string; exists?: boolean } = {},
) {
    const fields = options.updateFields || Object.entries(data).filter(([, value]) => value !== undefined).map(([key]) => key);
    if (options.updateTime) {
        // Version-checked writes go through :commit. The Firestore emulator reads a
        // `currentDocument.updateTime` query parameter as version 0 and rejects every
        // such PATCH; in a commit body the precondition works everywhere.
        const { writeResults } = await commitServerMutations([{ type: "update", path, data, updateFields: fields, updateTime: options.updateTime }]);
        return { name: documentName(path), fields: encodeFields(data), updateTime: writeResults[0]?.updateTime } satisfies FirestoreDocument;
    }
    const url = new URL(documentUrl(path));
    for (const field of fields) url.searchParams.append("updateMask.fieldPaths", field);
    if (typeof options.exists === "boolean") url.searchParams.set("currentDocument.exists", String(options.exists));

    const response = await firestoreFetch(url.toString(), {
        method: "PATCH",
        body: JSON.stringify({ fields: encodeFields(data) }),
    });
    if (!response.ok) throw await firestoreHttpError(response, "Firestore yazma hatası");
    return response.json() as Promise<FirestoreDocument>;
}

export async function commitServerPatches(writes: Array<{
    path: string;
    data: Record<string, unknown>;
    updateFields?: string[];
    updateTime?: string;
    exists?: boolean;
}>) {
    if (!writes.length) return;
    const projectId = getFirebaseProjectId();
    const response = await firestoreFetch(
        `${firestoreBase()}/projects/${encodeURIComponent(projectId)}/databases/(default)/documents:commit`,
        {
            method: "POST",
            body: JSON.stringify({
                writes: writes.map((write) => ({
                    update: { name: documentName(write.path), fields: encodeFields(write.data) },
                    updateMask: { fieldPaths: write.updateFields || Object.entries(write.data).filter(([, value]) => value !== undefined).map(([key]) => key) },
                    ...(write.updateTime
                        ? { currentDocument: { updateTime: write.updateTime } }
                        : typeof write.exists === "boolean" ? { currentDocument: { exists: write.exists } } : {}),
                })),
            }),
        },
    );
    if (!response.ok) throw await firestoreHttpError(response, "Firestore atomik yazma hatası");
}

type ServerMutation =
    | { type: "create" | "update"; path: string; data: Record<string, unknown>; updateFields?: string[]; updateTime?: string }
    | { type: "delete"; path: string; updateTime?: string }
    | { type: "increment"; path: string; fields: Record<string, number> }
    /** arrayUnion: appends the values a field doesn't hold yet (the document must exist). */
    | { type: "append"; path: string; fields: Record<string, unknown[]> };

export async function commitServerMutations(mutations: ServerMutation[]): Promise<{ writeResults: Array<{ updateTime?: string }>; commitTime: string | null }> {
    if (!mutations.length) return { writeResults: [], commitTime: null };
    const projectId = getFirebaseProjectId();
    const writes = mutations.map((mutation) => {
        if (mutation.type === "delete") {
            return {
                delete: documentName(mutation.path),
                ...(mutation.updateTime ? { currentDocument: { updateTime: mutation.updateTime } } : {}),
            };
        }
        if (mutation.type === "increment") {
            return {
                transform: {
                    document: documentName(mutation.path),
                    fieldTransforms: Object.entries(mutation.fields).map(([fieldPath, amount]) => ({
                        fieldPath,
                        increment: toFirestoreValue(amount),
                    })),
                },
            };
        }
        if (mutation.type === "append") {
            return {
                transform: {
                    document: documentName(mutation.path),
                    fieldTransforms: Object.entries(mutation.fields).map(([fieldPath, values]) => ({
                        fieldPath,
                        appendMissingElements: { values: values.map(toFirestoreValue) },
                    })),
                },
                // A deleted document must not come back as a stub holding only these values.
                currentDocument: { exists: true },
            };
        }
        return {
            update: { name: documentName(mutation.path), fields: encodeFields(mutation.data) },
            updateMask: { fieldPaths: mutation.updateFields || Object.keys(mutation.data) },
            ...(mutation.type === "create"
                ? { currentDocument: { exists: false } }
                : mutation.updateTime ? { currentDocument: { updateTime: mutation.updateTime } } : {}),
        };
    });
    const response = await firestoreFetch(
        `${firestoreBase()}/projects/${encodeURIComponent(projectId)}/databases/(default)/documents:commit`,
        { method: "POST", body: JSON.stringify({ writes }) },
    );
    if (!response.ok) throw await firestoreHttpError(response, "Firestore atomik işlem hatası");
    const result = await response.json().catch(() => ({})) as { writeResults?: Array<{ updateTime?: string }>; commitTime?: string };
    return { writeResults: result.writeResults || [], commitTime: result.commitTime || null };
}

export async function deleteServerDocument(path: string) {
    const response = await firestoreFetch(documentUrl(path), { method: "DELETE" });
    if (!response.ok && response.status !== 404) {
        throw new Error(`Firestore silme hatası (${response.status}).`);
    }
}

export async function createServerDocument(collectionPath: string, data: Record<string, unknown>, documentId?: string) {
    assertSafePath(collectionPath);
    if (documentId !== undefined) assertSafePath(documentId);
    const segments = collectionPath.split("/");
    const collectionId = segments.pop();
    if (!collectionId) throw new Error("Geçersiz koleksiyon yolu.");
    const parent = segments.length ? `/${encodeDocumentPath(segments.join("/"))}` : "";
    const projectId = getFirebaseProjectId();
    const url = new URL(`${firestoreBase()}/projects/${encodeURIComponent(projectId)}/databases/(default)/documents${parent}/${encodeURIComponent(collectionId)}`);
    if (documentId) url.searchParams.set("documentId", documentId);
    const response = await firestoreFetch(url.toString(), {
        method: "POST",
        body: JSON.stringify({ fields: encodeFields(data) }),
    });
    if (!response.ok) throw new Error(`Firestore belge oluşturma hatası (${response.status}).`);
    return response.json() as Promise<FirestoreDocument>;
}

/**
 * Unlike production, the Auth emulator drops an `email` developer claim from
 * custom tokens and fills `email` from the user record instead. Giving that
 * record the address makes its ID tokens match production, so the security
 * rules see the same `request.auth.token.email`. Emulator only.
 */
async function syncEmulatorAuthEmail(uid: string, email: string) {
    const host = emulator("FIREBASE_AUTH_EMULATOR_HOST");
    if (!host) return;
    const base = `http://${host}/identitytoolkit.googleapis.com/v1/projects/${encodeURIComponent(getFirebaseProjectId())}/accounts`;
    const init = (body: Record<string, unknown>) => ({
        method: "POST",
        headers: { Authorization: "Bearer owner", "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
    const created = await fetch(base, init({ localId: uid, email, emailVerified: true }));
    if (!created.ok) await fetch(`${base}:update`, init({ localId: uid, email, emailVerified: true }));
}

export async function createFirebaseCustomToken(email: string) {
    const account = getServiceAccount();
    const now = Math.floor(Date.now() / 1000);
    const uid = createHash("sha256").update(email.toLowerCase()).digest("hex").slice(0, 64);
    await syncEmulatorAuthEmail(uid, email.toLowerCase());
    const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
    const claims = base64Url(JSON.stringify({
        iss: account.client_email,
        sub: account.client_email,
        aud: "https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit",
        iat: now,
        exp: now + 3600,
        uid,
        claims: { email: email.toLowerCase(), app: "hanogt-codev" },
    }));
    const unsigned = `${header}.${claims}`;
    const signer = createSign("RSA-SHA256");
    signer.update(unsigned);
    signer.end();
    return `${unsigned}.${signer.sign(account.private_key).toString("base64url")}`;
}

export async function deleteFirebaseAuthUser(email: string) {
    const projectId = getFirebaseProjectId();
    const localId = createHash("sha256").update(email.toLowerCase()).digest("hex").slice(0, 64);
    const authEmulator = emulator("FIREBASE_AUTH_EMULATOR_HOST");
    const response = await firestoreFetch(
        `${authEmulator ? `http://${authEmulator}/identitytoolkit.googleapis.com` : "https://identitytoolkit.googleapis.com"}/v1/projects/${encodeURIComponent(projectId)}/accounts:batchDelete`,
        { method: "POST", body: JSON.stringify({ localIds: [localId], force: true }) },
    );
    if (!response.ok && response.status !== 404) {
        throw new Error(`Firebase Auth kullanıcı silme hatası (${response.status}).`);
    }
}

/**
 * The Storage bucket of voice messages (server variable first), without a
 * pasted "gs://" prefix or trailing slash; "" when none is configured.
 */
export function serverStorageBucket() {
    return (process.env.FIREBASE_STORAGE_BUCKET || process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "").trim().replace(/^gs:\/\//, "").replace(/\/+$/, "");
}

function storageBase() {
    const storageEmulator = emulator("FIREBASE_STORAGE_EMULATOR_HOST");
    return storageEmulator ? `http://${storageEmulator}` : "https://storage.googleapis.com";
}

function storageObjectUrl(bucket: string, objectPath: string) {
    return `${storageBase()}/storage/v1/b/${encodeURIComponent(bucket)}/o/${encodeURIComponent(objectPath)}`;
}

export async function deleteServerStorageObject(objectPath: string) {
    const bucket = serverStorageBucket();
    if (!bucket || !objectPath) return;
    assertSafePath(objectPath);
    const response = await firestoreFetch(storageObjectUrl(bucket, objectPath), { method: "DELETE" });
    if (!response.ok && response.status !== 404) {
        throw new Error(`Depolama nesnesi silme hatası (${response.status}).`);
    }
}

/**
 * Uploads one object with the service account (Cloud Storage JSON API,
 * multipart: metadata and data in one request). Storage security rules don't
 * apply; callers check access themselves.
 */
export async function uploadServerStorageObject(objectPath: string, data: Uint8Array, contentType: string, metadata: Record<string, string> = {}) {
    const bucket = serverStorageBucket();
    if (!bucket) throw new Error("Depolama kovası yapılandırılmamış (FIREBASE_STORAGE_BUCKET).");
    assertSafePath(objectPath);
    if (!/^[a-z]+\/[a-z0-9.+-]+$/i.test(contentType)) throw new Error("Geçersiz içerik türü.");
    const boundary = `hanogt-${createHash("sha256").update(`${objectPath}:${Date.now()}:${Math.random()}`).digest("hex").slice(0, 32)}`;
    const head = Buffer.from(
        `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name: objectPath, contentType, metadata })}\r\n`
        + `--${boundary}\r\nContent-Type: ${contentType}\r\n\r\n`,
        "utf8",
    );
    const tail = Buffer.from(`\r\n--${boundary}--\r\n`, "utf8");
    const token = await getAccessToken();
    const response = await fetch(`${storageBase()}/upload/storage/v1/b/${encodeURIComponent(bucket)}/o?uploadType=multipart`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": `multipart/related; boundary=${boundary}` },
        body: Buffer.concat([head, Buffer.from(data.buffer, data.byteOffset, data.byteLength), tail]),
        cache: "no-store",
    });
    if (!response.ok) throw new Error(`Depolama yükleme hatası (${response.status}).`);
    return response.json().catch(() => ({})) as Promise<{ name?: string; size?: string; contentType?: string }>;
}

/**
 * Downloads one object (optionally a byte range) with the service account;
 * null when it doesn't exist. The caller streams the response body on.
 */
export async function downloadServerStorageObject(objectPath: string, range?: string | null) {
    const bucket = serverStorageBucket();
    if (!bucket) throw new Error("Depolama kovası yapılandırılmamış (FIREBASE_STORAGE_BUCKET).");
    assertSafePath(objectPath);
    const token = await getAccessToken();
    const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
    if (range && /^bytes=\d{0,12}-\d{0,12}$/.test(range)) headers.Range = range;
    const response = await fetch(`${storageObjectUrl(bucket, objectPath)}?alt=media`, { headers, cache: "no-store" });
    if (response.status === 404) return null;
    if (!response.ok && response.status !== 206) throw new Error(`Depolama okuma hatası (${response.status}).`);
    return response;
}
