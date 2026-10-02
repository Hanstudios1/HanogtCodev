import { resolvePublicFirebaseConfig, type PublicConfigSource, type PublicFirebaseConfig } from "@/lib/server/cloud-health";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/*
 * The public Firebase web config as a script, loaded before the app starts
 * (src/app/layout.tsx → window.__HANOGT_FIREBASE__, read by src/lib/firebase.ts).
 * NEXT_PUBLIC_FIREBASE_* are inlined into the bundle at build time, so values
 * added or fixed later — or set only for another Vercel environment — never
 * reached the browser without a redeploy. This route reads them at request
 * time and, when they are missing, invalid or belong to another project than
 * the service account, serves the project's web-app config read from
 * Firebase instead. Only the six public fields are ever sent.
 */

// Keeps a slow Firebase lookup from holding up the page start for long.
const LOOKUP_BUDGET_MS = 4_000;

type Payload = PublicFirebaseConfig & { source: Exclude<PublicConfigSource, "none"> };

/** JSON is valid JavaScript; <, >, & and the line separators are escaped so the text stays inert anywhere. */
function script(payload: Payload | null) {
    const json = JSON.stringify(payload).replace(/[<>&\u2028\u2029]/g, (character) => `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`);
    return `window.__HANOGT_FIREBASE__ = ${json};\n`;
}

export async function GET() {
    let payload: Payload | null = null;
    try {
        const resolved = await resolvePublicFirebaseConfig({ budgetMs: LOOKUP_BUDGET_MS });
        if (resolved.config && resolved.source !== "none") payload = { ...resolved.config, source: resolved.source };
    } catch (error) {
        console.warn("[firebase-config]", error instanceof Error ? error.message : error);
    }
    return new Response(script(payload), {
        status: 200,
        headers: {
            "Content-Type": "application/javascript; charset=utf-8",
            // Public values: shared caches may keep them for five minutes.
            "Cache-Control": "public, max-age=300, s-maxage=300",
            "X-Content-Type-Options": "nosniff",
        },
    });
}
