import { initializeApp, getApps } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

// Values pasted into hosting dashboards frequently carry trailing spaces or
// newlines, which made the strict API-key check below fail and disabled all
// cloud features for signed-in users.
const env = (value: string | undefined) => (value || "").trim();

const firebaseConfig = {
    apiKey: env(process.env.NEXT_PUBLIC_FIREBASE_API_KEY),
    authDomain: env(process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN),
    projectId: env(process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID),
    storageBucket: env(process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET),
    messagingSenderId: env(process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID),
    appId: env(process.env.NEXT_PUBLIC_FIREBASE_APP_ID),
};

export const hasFirebaseClientConfig = Boolean(
    firebaseConfig.apiKey
    && firebaseConfig.projectId
    && firebaseConfig.appId
    && /^AIza[\w-]{35}$/.test(firebaseConfig.apiKey),
);

// Firestore/Storage handles are safe to construct during SSR. Firebase Auth is
// browser-only; constructing it while prerendering also makes builds depend on
// local environment secrets and turns a configuration issue into a hard crash.
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
const db = getFirestore(app);
const auth: Auth | null = typeof window !== "undefined" && hasFirebaseClientConfig
    ? getAuth(app)
    : null;
const storage = getStorage(app);

export { app, auth, db, storage };
