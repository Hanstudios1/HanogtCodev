import { loader } from "@monaco-editor/react";

let configured = false;

/**
 * Serves Monaco from our own origin (copied by scripts/copy-monaco.mjs).
 * The default jsDelivr CDN is blocked by the site's CSP, which left every
 * code editor on an endless loading screen in production.
 */
export function configureMonaco() {
    if (configured || typeof window === "undefined") return;
    configured = true;
    loader.config({ paths: { vs: "/monaco/vs" } });
}
