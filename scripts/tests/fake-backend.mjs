// In-memory stand-ins for the Firestore, Auth and Storage REST APIs used by
// the server helpers in tests: point them at "emulators" on loopback
// addresses (see setFakeEmulatorEnv) and replace fetch with backend.fetch.
// Requests to other hosts go to options.route(url, init) when given.
import assert from "node:assert/strict";

/** The environment the fake backend answers to. */
export function setFakeEmulatorEnv() {
    process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
    process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099";
    process.env.FIREBASE_STORAGE_EMULATOR_HOST = "127.0.0.1:9199";
    process.env.FIREBASE_STORAGE_BUCKET = "demo-hanogt.appspot.com";
    process.env.FIREBASE_PROJECT_ID = "demo-hanogt";
    process.env.RATE_LIMIT_SALT = "test-salt";
}

// ---------------------------------------------------------------------------

const DOCUMENTS_PREFIX = "/v1/projects/demo-hanogt/databases/(default)/documents";
const NAME_PREFIX = "projects/demo-hanogt/databases/(default)/documents/";

export function encode(value) {
    if (value === null || value === undefined) return { nullValue: null };
    if (typeof value === "boolean") return { booleanValue: value };
    if (typeof value === "number") return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
    if (typeof value === "string") return { stringValue: value };
    if (value instanceof Date) return { timestampValue: value.toISOString() };
    // Bytes (a Uint8Array or Buffer) travel as base64, like the REST API.
    if (value instanceof Uint8Array) return { bytesValue: Buffer.from(value.buffer, value.byteOffset, value.byteLength).toString("base64") };
    if (Array.isArray(value)) return { arrayValue: { values: value.map(encode) } };
    return { mapValue: { fields: encodeFields(value) } };
}

export function encodeFields(data) {
    return Object.fromEntries(Object.entries(data).map(([key, value]) => [key, encode(value)]));
}

export function decode(value) {
    if ("nullValue" in value) return null;
    if ("booleanValue" in value) return value.booleanValue;
    if ("integerValue" in value) return Number(value.integerValue);
    if ("doubleValue" in value) return value.doubleValue;
    if ("timestampValue" in value) return value.timestampValue;
    if ("stringValue" in value) return value.stringValue;
    if ("bytesValue" in value) return Buffer.from(value.bytesValue, "base64");
    if ("arrayValue" in value) return (value.arrayValue.values || []).map(decode);
    if ("mapValue" in value) return decodeFields(value.mapValue.fields || {});
    throw new Error(`Unknown Firestore value ${JSON.stringify(value)}`);
}

export function decodeFields(fields) {
    return Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, decode(value)]));
}

export const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** A field by its path ("replyTo.id" reads a nested field), and whether it is there. */
export function lookup(data, fieldPath) {
    let value = data;
    for (const key of fieldPath.split(".")) {
        if (!value || typeof value !== "object" || !(key in value)) return { found: false, value: undefined };
        value = value[key];
    }
    return { found: true, value };
}

export function json(status, payload) {
    return new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json" } });
}

export function failure(status, reason) {
    return json(status, { error: { code: status, status: reason, message: reason } });
}

class Precondition extends Error {
    constructor(status, reason) {
        super(reason);
        this.status = status;
        this.reason = reason;
    }
}

/** The parts of a multipart/related upload (Cloud Storage JSON API): [{ headers, data }]. */
function multipartParts(body, contentType) {
    const boundary = /boundary=([^;]+)/.exec(contentType || "")?.[1];
    assert.ok(boundary, "multipart upload without a boundary");
    const buffer = Buffer.from(body);
    const delimiter = Buffer.from(`--${boundary}`);
    const parts = [];
    let start = buffer.indexOf(delimiter);
    while (start >= 0) {
        const next = buffer.indexOf(delimiter, start + delimiter.length);
        if (next < 0) break;
        const part = buffer.subarray(start + delimiter.length + 2, next - 2);
        const split = part.indexOf("\r\n\r\n");
        parts.push({ headers: part.subarray(0, split).toString("utf8"), data: part.subarray(split + 4) });
        start = next;
    }
    return parts;
}

export function createBackend(seed, options = {}) {
    const docs = new Map();
    let clock = 0;
    const stamp = () => `2026-10-01T00:00:00.${String(++clock).padStart(6, "0")}Z`;
    for (const [path, data] of Object.entries(seed)) docs.set(path, { data: structuredClone(data), updateTime: stamp() });
    const authDeleted = [];
    const storageDeleted = [];
    /** Storage objects: path → { contentType, data (Buffer), metadata }; seeded from options.storage. */
    const objects = new Map(Object.entries(options.storage || {}).map(([path, object]) => [path, { contentType: object.contentType, data: Buffer.from(object.data), metadata: object.metadata || {} }]));
    const storageUploads = [];

    const documentJson = (path) => ({ name: NAME_PREFIX + path, fields: encodeFields(docs.get(path).data), updateTime: docs.get(path).updateTime });
    const pathOf = (name) => name.slice(NAME_PREFIX.length);

    function check(path, precondition) {
        if (!precondition) return;
        const current = docs.get(path);
        if (precondition.exists === true && !current) throw new Precondition(404, "NOT_FOUND");
        if (precondition.exists === false && current) throw new Precondition(409, "ALREADY_EXISTS");
        if (precondition.updateTime && (!current || current.updateTime !== precondition.updateTime)) throw new Precondition(400, "FAILED_PRECONDITION");
    }

    function applyUpdate(path, fields, mask) {
        const next = mask ? structuredClone(docs.get(path)?.data ?? {}) : {};
        const values = decodeFields(fields || {});
        // A mask entry may name a nested field ("replyTo.text"): only that field changes, or goes when it has no value.
        for (const key of mask ?? Object.keys(values)) {
            const found = lookup(values, key);
            const keys = key.split(".");
            let node = next;
            for (const part of keys.slice(0, -1)) {
                if (!node[part] || typeof node[part] !== "object" || Array.isArray(node[part])) {
                    if (!found.found) break;
                    node[part] = {};
                }
                node = node[part];
            }
            const last = keys.at(-1);
            if (found.found) node[last] = found.value;
            else if (node && typeof node === "object") delete node[last];
        }
        docs.set(path, { data: next, updateTime: stamp() });
    }

    function commit(writes) {
        options.onCommit?.(writes);
        const results = writes.map(() => ({}));
        // Atomic: every precondition is checked before anything changes.
        for (const write of writes) {
            if (write.delete) check(pathOf(write.delete), write.currentDocument);
            if (write.update) check(pathOf(write.update.name), write.currentDocument);
            if (write.transform) check(pathOf(write.transform.document), write.currentDocument);
        }
        writes.forEach((write, index) => {
            if (write.delete) docs.delete(pathOf(write.delete));
            else if (write.update) applyUpdate(pathOf(write.update.name), write.update.fields, write.updateMask?.fieldPaths);
            else if (write.transform) {
                const path = pathOf(write.transform.document);
                const data = { ...(docs.get(path)?.data ?? {}) };
                // Like the REST API, a transform reports the values it produced.
                results[index].transformResults = write.transform.fieldTransforms.map((transform) => {
                    if (transform.appendMissingElements) {
                        // arrayUnion: values the array doesn't hold yet are appended.
                        const list = Array.isArray(data[transform.fieldPath]) ? [...data[transform.fieldPath]] : [];
                        for (const value of (transform.appendMissingElements.values || []).map(decode)) if (!list.some((entry) => same(entry, value))) list.push(value);
                        data[transform.fieldPath] = list;
                        return { nullValue: null };
                    }
                    data[transform.fieldPath] = Number(data[transform.fieldPath] || 0) + decode(transform.increment);
                    return encode(data[transform.fieldPath]);
                });
                docs.set(path, { data, updateTime: stamp() });
            }
        });
        return { writeResults: results.map((result) => ({ ...result, updateTime: stamp() })), commitTime: stamp() };
    }

    /**
     * The two sides of a range filter, or null when Firestore wouldn't compare
     * them: only values of one type are compared. A timestamp filter matches
     * times (a seeded Date, or the ISO text a write leaves here); a string or
     * number filter matches strings or numbers.
     */
    function comparable(actual, raw) {
        if ("timestampValue" in raw) {
            const time = actual instanceof Date ? actual.getTime() : typeof actual === "string" && /^\d{4}-\d\d-\d\dT/.test(actual) ? Date.parse(actual) : Number.NaN;
            return Number.isFinite(time) ? [time, Date.parse(raw.timestampValue)] : null;
        }
        if ("stringValue" in raw) return typeof actual === "string" ? [actual, raw.stringValue] : null;
        if ("integerValue" in raw || "doubleValue" in raw) return typeof actual === "number" ? [actual, decode(raw)] : null;
        return null;
    }

    const RANGE = {
        LESS_THAN: (a, b) => a < b,
        LESS_THAN_OR_EQUAL: (a, b) => a <= b,
        GREATER_THAN: (a, b) => a > b,
        GREATER_THAN_OR_EQUAL: (a, b) => a >= b,
    };

    function matches(data, where) {
        if (!where) return true;
        if (where.compositeFilter) return where.compositeFilter.filters.every((filter) => matches(data, filter));
        const { field, op, value } = where.fieldFilter;
        const actual = lookup(data, field.fieldPath).value;
        const expected = decode(value);
        if (op === "EQUAL") return actual !== undefined && same(actual, expected);
        if (op === "ARRAY_CONTAINS") return Array.isArray(actual) && actual.some((entry) => same(entry, expected));
        if (op === "IN") return actual !== undefined && expected.some((entry) => same(actual, entry));
        if (op in RANGE) {
            const sides = actual === undefined ? null : comparable(actual, value);
            return Boolean(sides) && RANGE[op](sides[0], sides[1]);
        }
        throw new Error(`Unsupported operator ${op}`);
    }

    function runQuery(parent, query) {
        const { collectionId, allDescendants } = query.from[0];
        const status = options.failQuery?.({ collectionId, allDescendants: Boolean(allDescendants), parent });
        if (status) return failure(status, "FAILED_PRECONDITION");
        const prefix = parent ? `${parent}/` : "";
        let found = [...docs.keys()].filter((path) => {
            if (!path.startsWith(prefix)) return false;
            const segments = path.slice(prefix.length).split("/");
            return allDescendants ? segments.length >= 2 && segments.length % 2 === 0 && segments[segments.length - 2] === collectionId : segments.length === 2 && segments[0] === collectionId;
        }).filter((path) => matches(docs.get(path).data, query.where)).sort();
        // orderBy, like Firestore: by each field in turn (numbers before strings; "__name__" is the
        // document path), then by path in the direction of the last ordering.
        const orders = query.orderBy ?? [];
        const rank = (value) => (value === undefined || value === null ? 0 : typeof value === "boolean" ? 1 : typeof value === "number" ? 2 : 3);
        const compare = (x, y) => rank(x) - rank(y) || (x < y ? -1 : x > y ? 1 : 0);
        const valueAt = (path, fieldPath) => (fieldPath === "__name__" ? path : lookup(docs.get(path).data, fieldPath).value);
        if (orders.length) {
            const lastDescending = orders[orders.length - 1].direction === "DESCENDING";
            found.sort((a, b) => {
                for (const order of orders) {
                    const difference = compare(valueAt(a, order.field.fieldPath), valueAt(b, order.field.fieldPath));
                    if (difference) return order.direction === "DESCENDING" ? -difference : difference;
                }
                const byPath = a < b ? -1 : a > b ? 1 : 0;
                return lastDescending ? -byPath : byPath;
            });
        }
        // startAt: a cursor over the orderBy fields; before: false starts just after it.
        if (query.startAt?.values?.length) {
            const cursor = query.startAt.values.map((value) => ("referenceValue" in value ? value.referenceValue.split("/documents/")[1] : decode(value)));
            const position = (path) => {
                for (let index = 0; index < cursor.length && index < orders.length; index += 1) {
                    const order = orders[index];
                    const difference = compare(valueAt(path, order.field.fieldPath), cursor[index]);
                    if (difference) return order.direction === "DESCENDING" ? -difference : difference;
                }
                return 0;
            };
            found = found.filter((path) => (query.startAt.before ? position(path) >= 0 : position(path) > 0));
        }
        // select: only the named fields come back (the document name always does).
        const fields = query.select?.fields?.map((field) => field.fieldPath);
        const project = (path) => {
            const document = documentJson(path);
            if (!fields) return document;
            return { ...document, fields: Object.fromEntries(Object.entries(document.fields).filter(([key]) => fields.includes(key))) };
        };
        return json(200, found.slice(0, query.limit ?? found.length).map((path) => ({ document: project(path) })));
    }

    function headerOf(init, name) {
        const headers = init.headers || {};
        if (typeof headers.get === "function") return headers.get(name) || "";
        const key = Object.keys(headers).find((entry) => entry.toLowerCase() === name.toLowerCase());
        return key ? String(headers[key]) : "";
    }

    function storageRequest(url, method, init) {
        if (method === "POST" && url.pathname.startsWith("/upload/storage/v1/b/")) {
            assert.equal(url.searchParams.get("uploadType"), "multipart");
            const [meta, media] = multipartParts(init.body, headerOf(init, "content-type"));
            const metadata = JSON.parse(meta.data.toString("utf8"));
            const status = options.failUpload?.(metadata.name);
            if (status) return failure(status, "UNAVAILABLE");
            objects.set(metadata.name, { contentType: metadata.contentType, data: Buffer.from(media.data), metadata: metadata.metadata || {} });
            storageUploads.push(metadata.name);
            return json(200, { name: metadata.name, contentType: metadata.contentType, size: String(media.data.length) });
        }
        const object = decodeURIComponent(url.pathname.split("/o/")[1]);
        if (method === "GET" && url.searchParams.get("alt") === "media") {
            const refused = options.failDownload?.(object);
            if (refused) return failure(refused, "PERMISSION_DENIED");
            const stored = objects.get(object);
            if (!stored) return failure(404, "NOT_FOUND");
            const range = /^bytes=(\d+)-(\d*)$/.exec(headerOf(init, "range"));
            if (range) {
                const from = Number(range[1]);
                const to = range[2] ? Math.min(Number(range[2]), stored.data.length - 1) : stored.data.length - 1;
                return new Response(stored.data.subarray(from, to + 1), {
                    status: 206,
                    headers: { "Content-Type": stored.contentType, "Content-Length": String(to - from + 1), "Content-Range": `bytes ${from}-${to}/${stored.data.length}` },
                });
            }
            return new Response(stored.data, { status: 200, headers: { "Content-Type": stored.contentType, "Content-Length": String(stored.data.length) } });
        }
        const status = options.failStorage?.(object);
        if (status) return failure(status, "UNAVAILABLE");
        storageDeleted.push(object);
        objects.delete(object);
        return new Response(null, { status: 204 });
    }

    async function fetchStub(input, init = {}) {
        const url = new URL(typeof input === "string" ? input : input.url);
        const method = (init.method || "GET").toUpperCase();
        if (url.host === "127.0.0.1:9199") return storageRequest(url, method, init);
        const body = init.body ? JSON.parse(init.body) : null;
        if (url.host === "127.0.0.1:9099") {
            authDeleted.push(...body.localIds);
            return json(200, {});
        }
        if (url.host !== "127.0.0.1:8080" && options.route) return options.route(url, init);
        assert.equal(url.host, "127.0.0.1:8080", `unexpected request to ${url.href}`);
        assert.ok(url.pathname.startsWith(DOCUMENTS_PREFIX), url.pathname);
        const rest = url.pathname.slice(DOCUMENTS_PREFIX.length);
        try {
            if (rest === ":commit") {
                const result = commit(body.writes);
                // Throwing here loses the response of a commit that was applied (e.g. a dropped connection).
                options.afterCommit?.(body.writes);
                return json(200, result);
            }
            if (rest.endsWith(":runQuery")) {
                const parent = rest.slice(0, -":runQuery".length).split("/").filter(Boolean).map(decodeURIComponent).join("/");
                return runQuery(parent, body.structuredQuery);
            }
            if (rest.endsWith(":runAggregationQuery")) {
                // count() with an optional upTo, or sum() of a field.
                const parent = rest.slice(0, -":runAggregationQuery".length).split("/").filter(Boolean).map(decodeURIComponent).join("/");
                const { structuredQuery, aggregations } = body.structuredAggregationQuery;
                const listed = await runQuery(parent, { ...structuredQuery, limit: undefined }).json();
                if (!Array.isArray(listed)) return failure(400, "FAILED_PRECONDITION");
                const [aggregation] = aggregations;
                if (aggregation.sum) {
                    // sum() over a field, like sumServerQuery sends it: non-numbers count as nothing.
                    let total = 0;
                    for (const item of listed) {
                        const value = item.document?.fields?.[aggregation.sum.field.fieldPath];
                        const number = value ? decode(value) : null;
                        if (typeof number === "number" && Number.isFinite(number)) total += number;
                    }
                    const encoded = Number.isInteger(total) ? { integerValue: String(total) } : { doubleValue: total };
                    return json(200, [{ result: { aggregateFields: { [aggregation.alias]: encoded } } }]);
                }
                const upTo = aggregation.count?.upTo ? Number(aggregation.count.upTo) : Infinity;
                return json(200, [{ result: { aggregateFields: { [aggregation.alias]: { integerValue: String(Math.min(listed.length, upTo)) } } } }]);
            }
        } catch (error) {
            if (error instanceof Precondition) return failure(error.status, error.reason);
            throw error;
        }
        const path = rest.split("/").filter(Boolean).map(decodeURIComponent).join("/");
        const isCollection = path.split("/").length % 2 === 1;
        if (method === "GET" && isCollection) {
            const children = [...docs.keys()].filter((key) => key.startsWith(`${path}/`) && key.split("/").length === path.split("/").length + 1).sort();
            return json(200, { documents: children.map(documentJson) });
        }
        if (method === "GET") return docs.has(path) ? json(200, documentJson(path)) : failure(404, "NOT_FOUND");
        if (method === "DELETE") {
            docs.delete(path);
            return json(200, {});
        }
        if (method === "PATCH") {
            const exists = url.searchParams.get("currentDocument.exists");
            if (exists === "true" && !docs.has(path)) return failure(404, "NOT_FOUND");
            const mask = url.searchParams.getAll("updateMask.fieldPaths");
            applyUpdate(path, body.fields, mask.length ? mask : null);
            return json(200, documentJson(path));
        }
        throw new Error(`Unsupported request ${method} ${url.href}`);
    }

    return {
        fetch: fetchStub,
        get: (path) => docs.get(path)?.data ?? null,
        has: (path) => docs.has(path),
        paths: () => [...docs.keys()],
        authDeleted,
        storageDeleted,
        storageUploads,
        /** A stored object ({ contentType, data, metadata }) or null. */
        object: (path) => objects.get(path) ?? null,
        objectPaths: () => [...objects.keys()],
    };
}

export async function withBackend(seed, options, run) {
    const backend = createBackend(seed, options);
    const original = globalThis.fetch;
    globalThis.fetch = backend.fetch;
    try {
        return await run(backend);
    } finally {
        globalThis.fetch = original;
    }
}

