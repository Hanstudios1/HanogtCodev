import { initializeApp, getApps } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "",
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "",
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "",
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "",
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "",
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "",
};

export const hasFirebaseClientConfig = Boolean(
    firebaseConfig.apiKey
    && firebaseConfig.authDomain
    && firebaseConfig.projectId
    && firebaseConfig.storageBucket
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
