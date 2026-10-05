import { initializeApp, getApps } from "firebase/app";
import { browserLocalPersistence, browserSessionPersistence, connectAuthEmulator, getAuth, indexedDBLocalPersistence, initializeAuth, type Auth } from "firebase/auth";
import { connectFirestoreEmulator, getFirestore } from "firebase/firestore";
import { connectStorageEmulator, getStorage } from "firebase/storage";

// Values pasted into hosting dashboards frequently carry trailing spaces or
// newlines, which made the strict API-key check below fail and disabled all
// cloud features for signed-in users.
const env = (value: string | undefined) => (value || "").trim();

/** The public Firebase web config (none of these values is secret). */
export type FirebaseWebConfig = Record<"apiKey" | "authDomain" | "projectId" | "storageBucket" | "messagingSenderId" | "appId", string>;

/**
 * Where the config in use came from: /api/firebase/config at runtime (the
 * deployment's variables read at request time, or the project's web-app
 * config read from Firebase) or the values baked into this bundle at build
 * time; "none" when neither is usable.
 */
export type FirebaseConfigSource = "runtime-env" | "runtime-management-api" | "build" | "none";

declare global {
    interface Window {
        /** Set by /api/firebase/config, which src/app/layout.tsx loads before the app starts. */
        __HANOGT_FIREBASE__?: unknown;
    }
}

const CONFIG_FIELDS = ["apiKey", "authDomain", "projectId", "storageBucket", "messagingSenderId", "appId"] as const;

/** The rule behind hasFirebaseClientConfig: API key, project and app IDs present and the key well formed. */
export function isUsableFirebaseConfig(config: Partial<FirebaseWebConfig> | null | undefined): boolean {
    return Boolean(config && config.projectId && config.appId && typeof config.apiKey === "string" && /^AIza[\w-]{35}$/.test(config.apiKey));
}

/**
 * Prefers the config the server sent at runtime over the build-time one:
 * NEXT_PUBLIC_* values are inlined when the bundle is built, so values added
 * or fixed later only reach the bundle with a redeploy.
 */
export function chooseFirebaseClientConfig(buildTime: FirebaseWebConfig, runtime: unknown): { config: FirebaseWebConfig; source: FirebaseConfigSource } {
    if (runtime && typeof runtime === "object" && !Array.isArray(runtime)) {
        const record = runtime as Record<string, unknown>;
        const config = Object.fromEntries(CONFIG_FIELDS.map((field) => {
            const value = record[field];
            return [field, typeof value === "string" ? value.trim() : ""];
        })) as FirebaseWebConfig;
        if (isUsableFirebaseConfig(config)) return { config, source: record.source === "management-api" ? "runtime-management-api" : "runtime-env" };
    }
    return { config: buildTime, source: isUsableFirebaseConfig(buildTime) ? "build" : "none" };
}

const buildTimeConfig: FirebaseWebConfig = {
    apiKey: env(process.env.NEXT_PUBLIC_FIREBASE_API_KEY),
    authDomain: env(process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN),
    projectId: env(process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID),
    storageBucket: env(process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET),
    messagingSenderId: env(process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID),
    appId: env(process.env.NEXT_PUBLIC_FIREBASE_APP_ID),
};

// Server rendering always uses the build-time values; the browser takes the
// runtime config when the script delivered a usable one.
const chosenConfig = chooseFirebaseClientConfig(buildTimeConfig, typeof window === "undefined" ? undefined : window.__HANOGT_FIREBASE__);
const firebaseConfig = chosenConfig.config;

/** Which config this page initialised Firebase with (reported by the connection banner and Cloud Health). */
export const firebaseConfigSource: FirebaseConfigSource = chosenConfig.source;

const missingClientVariables = [
    ["NEXT_PUBLIC_FIREBASE_API_KEY", firebaseConfig.apiKey],
    ["NEXT_PUBLIC_FIREBASE_PROJECT_ID", firebaseConfig.projectId],
    ["NEXT_PUBLIC_FIREBASE_APP_ID", firebaseConfig.appId],
].filter(([, value]) => !value).map(([name]) => name);
const apiKeyWellFormed = /^AIza[\w-]{35}$/.test(firebaseConfig.apiKey);

export const hasFirebaseClientConfig = isUsableFirebaseConfig(firebaseConfig);

export type FirebaseClientConfigIssue = "missing" | "invalid_api_key" | null;

/**
 * The config this page uses, for the connection banner and the owner's Cloud
 * Health panel. Web API keys are not secret, but only a prefix is exposed
 * here anyway.
 */
export const firebaseClientDiagnostics: {
    issue: FirebaseClientConfigIssue;
    missing: string[];
    source: FirebaseConfigSource;
    projectId: string | null;
    /** The project baked into this bundle at build time (may differ from the runtime one). */
    buildProjectId: string | null;
    authDomain: string | null;
    storageBucket: string | null;
    apiKeyPrefix: string | null;
    appIdPresent: boolean;
} = {
    issue: missingClientVariables.length ? "missing" : apiKeyWellFormed ? null : "invalid_api_key",
    missing: missingClientVariables,
    source: firebaseConfigSource,
    projectId: firebaseConfig.projectId || null,
    buildProjectId: buildTimeConfig.projectId || null,
    authDomain: firebaseConfig.authDomain || null,
    storageBucket: firebaseConfig.storageBucket || null,
    apiKeyPrefix: firebaseConfig.apiKey ? firebaseConfig.apiKey.slice(0, 8) : null,
    appIdPresent: Boolean(firebaseConfig.appId),
};

/**
 * Firebase Auth as getAuth() makes it, but without the popup/redirect helper:
 * the site signs in with custom tokens only, and on phones and Safari that
 * helper loads a Google script up front, which the CSP rightly blocks.
 */
function createAuth(): Auth {
    try {
        return initializeAuth(app, { persistence: [indexedDBLocalPersistence, browserLocalPersistence, browserSessionPersistence] });
    } catch {
        // Already set up (a hot reload): the same instance.
        return getAuth(app);
    }
}

// Firestore/Storage handles are safe to construct during SSR. Firebase Auth is
// browser-only; constructing it while prerendering also makes builds depend on
// local environment secrets and turns a configuration issue into a hard crash.
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
const db = getFirestore(app);
const auth: Auth | null = typeof window !== "undefined" && hasFirebaseClientConfig ? createAuth() : null;
const storage = getStorage(app);

// Local development and end-to-end tests against the Firebase Emulator Suite
// (`firebase emulators:start`). Only loopback hosts are accepted, so a stray
// variable can never redirect production traffic.
const emulatorHost = env(process.env.NEXT_PUBLIC_FIREBASE_EMULATOR_HOST);
if (emulatorHost && typeof window !== "undefined" && /^(?:127\.0\.0\.1|localhost)$/.test(emulatorHost)) {
    const flag = window as typeof window & { __hanogtEmulators?: boolean };
    if (!flag.__hanogtEmulators) {
        flag.__hanogtEmulators = true;
        connectFirestoreEmulator(db, emulatorHost, 8080);
        connectStorageEmulator(storage, emulatorHost, 9199);
        if (auth) connectAuthEmulator(auth, `http://${emulatorHost}:9099`, { disableWarnings: true });
    }
}

export { app, auth, db, storage };
