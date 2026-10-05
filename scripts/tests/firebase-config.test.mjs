// Run: node --test scripts/tests/
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { register } from "node:module";
import test from "node:test";
import vm from "node:vm";
import { load } from "./setup.mjs";

// src/lib/firebase.ts initialises the Firebase SDK on import; small stand-ins
// keep this test fast and record the config it was initialised with.
const FIREBASE_STUBS = {
    "firebase/app": "export const getApps = () => []; export function initializeApp(options) { globalThis.__firebaseInitOptions = options; return { options }; }",
    "firebase/auth": "export const getAuth = (app) => ({ app }); export function initializeAuth(app, options) { globalThis.__firebaseAuthOptions = options; return { app, options }; } export const indexedDBLocalPersistence = 'indexedDB'; export const browserLocalPersistence = 'local'; export const browserSessionPersistence = 'session'; export const connectAuthEmulator = () => {};",
    "firebase/firestore": "export const getFirestore = (app) => ({ app }); export const connectFirestoreEmulator = () => {};",
    "firebase/storage": "export const getStorage = (app) => ({ app }); export const connectStorageEmulator = () => {};",
};
register(`data:text/javascript,${encodeURIComponent(`const STUBS = ${JSON.stringify(FIREBASE_STUBS)};
export async function resolve(specifier, context, next) {
    if (Object.hasOwn(STUBS, specifier)) return { url: "data:text/javascript," + encodeURIComponent(STUBS[specifier]), shortCircuit: true };
    return next(specifier, context);
}`)}`);

const health = await load("lib/server/cloud-health.ts");
const { isUsablePublicConfig, publicConfigIssue, readRuntimePublicEnv, sanitizePublicConfig, selectPublicFirebaseConfig } = health;

const KEY = "AIzaSyA1234567890abcdefghijklmnopqrstuv";
const OTHER_KEY = "AIzaSyB0987654321zyxwvutsrqponmlkjihgfe";
const config = (overrides = {}) => ({
    apiKey: KEY,
    authDomain: "hanogt.firebaseapp.com",
    projectId: "hanogt",
    storageBucket: "hanogt.appspot.com",
    messagingSenderId: "111",
    appId: "1:111:web:aaa",
    ...overrides,
});
const EMPTY = config({ apiKey: "", authDomain: "", projectId: "", storageBucket: "", messagingSenderId: "", appId: "" });

const ENV_NAMES = {
    apiKey: "NEXT_PUBLIC_FIREBASE_API_KEY",
    authDomain: "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
    projectId: "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
    storageBucket: "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET",
    messagingSenderId: "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID",
    appId: "NEXT_PUBLIC_FIREBASE_APP_ID",
};
function setEnv(values) {
    for (const [field, name] of Object.entries(ENV_NAMES)) {
        if (values && values[field] !== undefined) process.env[name] = values[field];
        else delete process.env[name];
    }
}

test("usable configs and why the deployment's values are not used", () => {
    assert.ok(isUsablePublicConfig(config()));
    assert.equal(isUsablePublicConfig(config({ apiKey: "AIza-short" })), false);
    assert.equal(isUsablePublicConfig(config({ appId: "" })), false);
    assert.equal(isUsablePublicConfig(null), false);

    assert.equal(publicConfigIssue(config(), "hanogt"), null);
    assert.equal(publicConfigIssue(config(), null), null, "unknown server project: nothing to compare");
    assert.equal(publicConfigIssue(config({ projectId: "" }), "hanogt"), "missing");
    assert.equal(publicConfigIssue(EMPTY, "hanogt"), "missing");
    assert.equal(publicConfigIssue(config({ apiKey: "not-a-key" }), "hanogt"), "invalid");
    assert.equal(publicConfigIssue(config({ projectId: "old-project" }), "hanogt"), "project_mismatch");
});

test("selection between the deployment's values and the config read from Firebase", () => {
    const fromFirebase = config({ apiKey: OTHER_KEY, appId: "1:111:web:bbb" });
    assert.deepEqual(selectPublicFirebaseConfig({ env: config(), serverProjectId: "hanogt", fromFirebase }), { source: "env", config: config(), issue: null });
    assert.deepEqual(selectPublicFirebaseConfig({ env: EMPTY, serverProjectId: "hanogt", fromFirebase }), { source: "management-api", config: fromFirebase, issue: "missing" });
    assert.deepEqual(selectPublicFirebaseConfig({ env: config({ projectId: "old" }), serverProjectId: "hanogt", fromFirebase }), { source: "management-api", config: fromFirebase, issue: "project_mismatch" });
    // Firebase's answer must belong to the service account's project too.
    assert.deepEqual(selectPublicFirebaseConfig({ env: EMPTY, serverProjectId: "hanogt", fromFirebase: config({ projectId: "else" }) }), { source: "none", config: null, issue: "missing" });
    // Values of another project are still better than nothing (the bundle has them anyway).
    assert.deepEqual(selectPublicFirebaseConfig({ env: config({ projectId: "old" }), serverProjectId: "hanogt", fromFirebase: null }), { source: "env", config: config({ projectId: "old" }), issue: "project_mismatch" });
    assert.deepEqual(selectPublicFirebaseConfig({ env: config({ apiKey: "bad" }), serverProjectId: "hanogt", fromFirebase: config({ apiKey: "bad" }) }), { source: "none", config: null, issue: "invalid" });
});

test("only the six public fields survive", () => {
    const clean = sanitizePublicConfig({ ...config({ projectId: "  hanogt \n" }), databaseURL: "https://x.firebaseio.com", private_key: "-----BEGIN PRIVATE KEY-----", measurementId: "G-1", appId: 42 });
    assert.deepEqual(Object.keys(clean).sort(), ["apiKey", "appId", "authDomain", "messagingSenderId", "projectId", "storageBucket"]);
    assert.equal(clean.projectId, "hanogt");
    assert.equal(clean.appId, "");
    assert.deepEqual(sanitizePublicConfig(null), EMPTY);
    assert.deepEqual(sanitizePublicConfig(["x"]), EMPTY);
});

test("NEXT_PUBLIC_FIREBASE_* are read when asked, not when the module loaded", () => {
    setEnv(config());
    assert.equal(readRuntimePublicEnv().projectId, "hanogt");
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = "  changed-later  ";
    assert.equal(readRuntimePublicEnv().projectId, "changed-later");
    setEnv(null);
    assert.deepEqual(readRuntimePublicEnv(), EMPTY);
});

// ------------------------------------------------------------------ the route
const route = await load("app/api/firebase/config/route.ts");

async function served() {
    const response = await route.GET();
    const body = await response.text();
    const context = { window: {} };
    vm.runInNewContext(body, context);
    return { response, body, value: context.window.__HANOGT_FIREBASE__ };
}

test("the route serves null when nothing is configured", async () => {
    setEnv(null);
    delete process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    const { response, body, value } = await served();
    assert.equal(response.status, 200);
    assert.equal(body, "window.__HANOGT_FIREBASE__ = null;\n");
    assert.equal(value, null);
    assert.match(response.headers.get("content-type"), /^application\/javascript/);
    assert.equal(response.headers.get("cache-control"), "public, max-age=300, s-maxage=300");
});

const privateKey = generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey.export({ type: "pkcs8", format: "pem" }).toString();
const serviceAccount = JSON.stringify({ client_email: "firebase-adminsdk-x@hanogt.iam.gserviceaccount.com", private_key: privateKey, project_id: "hanogt" });

test("the route serves the deployment's values when they fit the service account", async () => {
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON = serviceAccount;
    // authDomain isn't validated, so the escaping is what keeps a hostile value inert.
    setEnv(config({ authDomain: "x</script><script>alert(1)</script>" }));
    const realFetch = globalThis.fetch;
    globalThis.fetch = async (url) => assert.fail(`no network call expected, got ${url}`);
    try {
        const { body, value } = await served();
        assert.equal(value.source, "env");
        assert.equal(value.projectId, "hanogt");
        assert.equal(value.authDomain, "x</script><script>alert(1)</script>");
        assert.equal(/[<>]/.test(body), false, "angle brackets are escaped");
        assert.deepEqual(Object.keys(value).sort(), ["apiKey", "appId", "authDomain", "messagingSenderId", "projectId", "source", "storageBucket"]);
        assert.equal(/private|client_email|BEGIN/.test(body), false, "no credentials in the script");
    } finally {
        globalThis.fetch = realFetch;
    }
});

test("the route falls back to Firebase's web-app config and caches it", async () => {
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON = serviceAccount;
    setEnv(config({ projectId: "stale-project" }));
    const calls = [];
    const realFetch = globalThis.fetch;
    const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
    globalThis.fetch = async (url) => {
        const address = String(url);
        calls.push(address);
        if (address === "https://oauth2.googleapis.com/token") return json({ access_token: "admin-token", expires_in: 3600 });
        if (address === "https://firebase.googleapis.com/v1beta1/projects/hanogt/webApps?pageSize=100") return json({ apps: [{ appId: "1:111:web:bbb", displayName: "Web", state: "ACTIVE" }] });
        if (address === "https://firebase.googleapis.com/v1beta1/projects/hanogt/webApps/1%3A111%3Aweb%3Abbb/config") {
            return json({ ...config({ apiKey: OTHER_KEY, appId: "1:111:web:bbb" }), databaseURL: "https://hanogt.firebaseio.com", measurementId: "G-1" });
        }
        return json({ error: { code: 404, message: `unexpected ${address}` } }, 404);
    };
    try {
        const first = await served();
        assert.equal(first.value.source, "management-api");
        assert.equal(first.value.apiKey, OTHER_KEY);
        assert.equal(first.value.projectId, "hanogt");
        assert.equal("databaseURL" in first.value, false);
        const lookups = calls.length;
        assert.ok(lookups >= 2);
        const second = await served();
        assert.equal(second.value.source, "management-api");
        assert.equal(calls.length, lookups, "served from the in-memory cache");
    } finally {
        globalThis.fetch = realFetch;
        setEnv(null);
        delete process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    }
});

// ------------------------------------------------------------------ the browser side
const browser = await load("lib/firebase.ts?case=pure");
const { chooseFirebaseClientConfig, isUsableFirebaseConfig } = browser;

test("the browser prefers a usable runtime config over the build-time values", () => {
    const build = config({ projectId: "built", appId: "1:222:web:ccc" });
    assert.deepEqual(chooseFirebaseClientConfig(build, { ...config(), source: "management-api" }), { config: config(), source: "runtime-management-api" });
    assert.deepEqual(chooseFirebaseClientConfig(build, { ...config(), source: "env", extra: "ignored" }), { config: config(), source: "runtime-env" });
    assert.deepEqual(chooseFirebaseClientConfig(build, { ...config(), apiKey: "broken" }), { config: build, source: "build" });
    assert.deepEqual(chooseFirebaseClientConfig(build, null), { config: build, source: "build" });
    assert.deepEqual(chooseFirebaseClientConfig(build, "window.__HANOGT_FIREBASE__"), { config: build, source: "build" });
    assert.deepEqual(chooseFirebaseClientConfig(EMPTY, undefined), { config: EMPTY, source: "none" });
    assert.equal(chooseFirebaseClientConfig(EMPTY, { ...config(), apiKey: ` ${KEY} ` }).config.apiKey, KEY, "values are trimmed");
});

test("browser and server agree on what a usable config is", () => {
    const samples = [config(), EMPTY, config({ apiKey: "AIza" }), config({ apiKey: `${KEY}x` }), config({ projectId: "" }), config({ appId: "" }), config({ authDomain: "", storageBucket: "" })];
    for (const sample of samples) assert.equal(isUsableFirebaseConfig(sample), isUsablePublicConfig(sample), JSON.stringify(sample));
});

test("on import, firebase.ts initialises with the runtime config and reports its source", async () => {
    setEnv(config({ projectId: "built-project" }));
    globalThis.window = { __HANOGT_FIREBASE__: { ...config(), source: "management-api" } };
    try {
        const runtimeModule = await load("lib/firebase.ts?case=runtime");
        assert.equal(runtimeModule.firebaseConfigSource, "runtime-management-api");
        assert.equal(runtimeModule.hasFirebaseClientConfig, true);
        assert.equal(runtimeModule.firebaseClientDiagnostics.projectId, "hanogt");
        assert.equal(runtimeModule.firebaseClientDiagnostics.buildProjectId, "built-project");
        assert.equal(runtimeModule.firebaseClientDiagnostics.source, "runtime-management-api");
        assert.equal(globalThis.__firebaseInitOptions.projectId, "hanogt");
        assert.ok(runtimeModule.auth, "Firebase Auth is created in the browser");
        // Without a popup/redirect resolver: phones and Safari don't try to load Google's iframe script (the CSP blocks it).
        assert.deepEqual(globalThis.__firebaseAuthOptions, { persistence: ["indexedDB", "local", "session"] });
    } finally {
        delete globalThis.window;
        setEnv(null);
    }
    const serverSide = await load("lib/firebase.ts?case=server");
    assert.equal(serverSide.firebaseConfigSource, "none");
    assert.equal(serverSide.hasFirebaseClientConfig, false);
    assert.deepEqual(serverSide.firebaseClientDiagnostics.missing, ["NEXT_PUBLIC_FIREBASE_API_KEY", "NEXT_PUBLIC_FIREBASE_PROJECT_ID", "NEXT_PUBLIC_FIREBASE_APP_ID"]);
    assert.equal(serverSide.auth, null, "no Firebase Auth outside the browser");
});
