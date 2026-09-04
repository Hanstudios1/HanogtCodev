import "server-only";

import { createSign, createHash } from "node:crypto";

type ServiceAccount = {
    client_email: string;
    private_key: string;
    project_id: string;
};

type FirestoreValue =
    | { nullValue: null }
    | { booleanValue: boolean }
    | { integerValue: string }
    | { doubleValue: number }
    | { timestampValue: string }
    | { stringValue: string }
    | { arrayValue: { values?: FirestoreValue[] } }
    | { mapValue: { fields?: Record<string, FirestoreValue> } };

type FirestoreDocument = {
    name: string;
    fields?: Record<string, FirestoreValue>;
    createTime?: string;
    updateTime?: string;
};

let cachedToken: { value: string; expiresAt: number } | null = null;

function base64Url(value: string | Buffer) {
    return Buffer.from(value).toString("base64url");
}

function getServiceAccount(): ServiceAccount {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    const encoded = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
    if (!raw && !encoded) {
        throw new Error("Firebase sunucu kimliği yapılandırılmamış.");
    }

    let parsed: ServiceAccount;
    try {
        const json = raw || Buffer.from(encoded!, "base64").toString("utf8");
        parsed = JSON.parse(json) as ServiceAccount;
    } catch {
        throw new Error("Firebase sunucu kimliği geçersiz JSON içeriyor.");
    }

    if (!parsed.client_email || !parsed.private_key || !parsed.project_id) {
        throw new Error("Firebase sunucu kimliği gerekli alanları içermiyor.");
    }
    parsed.private_key = parsed.private_key.replace(/\\n/g, "\n");
    return parsed;
}

export function getFirebaseProjectId() {
    return getServiceAccount().project_id;
}

async function getAccessToken() {
    if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
        return cachedToken.value;
    }

    const account = getServiceAccount();
    const now = Math.floor(Date.now() / 1000);
    const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
    const claims = base64Url(JSON.stringify({
        iss: account.client_email,
        sub: account.client_email,
        aud: "https://oauth2.googleapis.com/token",
        scope: "https://www.googleapis.com/auth/datastore https://www.googleapis.com/auth/identitytoolkit https://www.googleapis.com/auth/devstorage.full_control",
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
    const result = await response.json() as { access_token?: string; expires_in?: number; error_description?: string };
    if (!response.ok || !result.access_token) {
        throw new Error(result.error_description || "Firebase erişim belirteci alınamadı.");
    }
    cachedToken = {
        value: result.access_token,
        expiresAt: Date.now() + (result.expires_in || 3600) * 1000,
    };
    return result.access_token;
}

function encodeDocumentPath(path: string) {
    return path.split("/").map(encodeURIComponent).join("/");
}

function documentUrl(path: string) {
    const projectId = getFirebaseProjectId();
    return `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents/${encodeDocumentPath(path)}`;
}

function documentName(path: string) {
    const projectId = getFirebaseProjectId();
    return `projects/${projectId}/databases/(default)/documents/${path}`;
}

function databaseDocumentsUrl(path = "") {
    const projectId = getFirebaseProjectId();
    const suffix = path ? `/${encodeDocumentPath(path)}` : "";
    return `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents${suffix}`;
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

export async function patchServerDocument(
    path: string,
    data: Record<string, unknown>,
    options: { updateFields?: string[]; updateTime?: string; exists?: boolean } = {},
) {
    const fields = options.updateFields || Object.entries(data).filter(([, value]) => value !== undefined).map(([key]) => key);
    const url = new URL(documentUrl(path));
    for (const field of fields) url.searchParams.append("updateMask.fieldPaths", field);
    if (options.updateTime) url.searchParams.set("currentDocument.updateTime", options.updateTime);
    if (typeof options.exists === "boolean") url.searchParams.set("currentDocument.exists", String(options.exists));

    const response = await firestoreFetch(url.toString(), {
        method: "PATCH",
        body: JSON.stringify({ fields: encodeFields(data) }),
    });
    if (!response.ok) {
        const error = new Error(`Firestore yazma hatası (${response.status}).`) as Error & { status?: number };
        error.status = response.status;
        throw error;
    }
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
        `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents:commit`,
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
    if (!response.ok) {
        const error = new Error(`Firestore atomik yazma hatası (${response.status}).`) as Error & { status?: number };
        error.status = response.status;
        throw error;
    }
}

type ServerMutation =
    | { type: "create" | "update"; path: string; data: Record<string, unknown>; updateFields?: string[]; updateTime?: string }
    | { type: "delete"; path: string; updateTime?: string }
    | { type: "increment"; path: string; fields: Record<string, number> };

export async function commitServerMutations(mutations: ServerMutation[]) {
    if (!mutations.length) return;
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
        return {
            update: { name: documentName(mutation.path), fields: encodeFields(mutation.data) },
            updateMask: { fieldPaths: mutation.updateFields || Object.keys(mutation.data) },
            ...(mutation.type === "create"
                ? { currentDocument: { exists: false } }
                : mutation.updateTime ? { currentDocument: { updateTime: mutation.updateTime } } : {}),
        };
    });
    const response = await firestoreFetch(
        `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents:commit`,
        { method: "POST", body: JSON.stringify({ writes }) },
    );
    if (!response.ok) {
        const error = new Error(`Firestore atomik işlem hatası (${response.status}).`) as Error & { status?: number };
        error.status = response.status;
        throw error;
    }
}

export async function deleteServerDocument(path: string) {
    const response = await firestoreFetch(documentUrl(path), { method: "DELETE" });
    if (!response.ok && response.status !== 404) {
        throw new Error(`Firestore silme hatası (${response.status}).`);
    }
}

export async function createServerDocument(collectionPath: string, data: Record<string, unknown>, documentId?: string) {
    const segments = collectionPath.split("/");
    const collectionId = segments.pop();
    if (!collectionId) throw new Error("Geçersiz koleksiyon yolu.");
    const parent = segments.length ? `/${encodeDocumentPath(segments.join("/"))}` : "";
    const projectId = getFirebaseProjectId();
    const url = new URL(`https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents${parent}/${encodeURIComponent(collectionId)}`);
    if (documentId) url.searchParams.set("documentId", documentId);
    const response = await firestoreFetch(url.toString(), {
        method: "POST",
        body: JSON.stringify({ fields: encodeFields(data) }),
    });
    if (!response.ok) throw new Error(`Firestore belge oluşturma hatası (${response.status}).`);
    return response.json() as Promise<FirestoreDocument>;
}

export async function createFirebaseCustomToken(email: string) {
    const account = getServiceAccount();
    const now = Math.floor(Date.now() / 1000);
    const uid = createHash("sha256").update(email.toLowerCase()).digest("hex").slice(0, 64);
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
    const response = await firestoreFetch(
        `https://identitytoolkit.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/accounts:batchDelete`,
        { method: "POST", body: JSON.stringify({ localIds: [localId], force: true }) },
    );
    if (!response.ok && response.status !== 404) {
        throw new Error(`Firebase Auth kullanıcı silme hatası (${response.status}).`);
    }
}

export async function deleteServerStorageObject(objectPath: string) {
    const bucket = process.env.FIREBASE_STORAGE_BUCKET || process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
    if (!bucket || !objectPath) return;
    const response = await firestoreFetch(
        `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(bucket)}/o/${encodeURIComponent(objectPath)}`,
        { method: "DELETE" },
    );
    if (!response.ok && response.status !== 404) {
        throw new Error(`Depolama nesnesi silme hatası (${response.status}).`);
    }
}
