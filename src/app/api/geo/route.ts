import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Country of the visitor as reported by the hosting edge (Vercel sets
 * x-vercel-ip-country). Used once to pick the first-visit language; nothing is
 * stored on the server.
 */
export function GET(request: NextRequest) {
    const raw = request.headers.get("x-vercel-ip-country") || request.headers.get("cf-ipcountry") || "";
    const country = /^[A-Z]{2}$/.test(raw.toUpperCase()) && raw.toUpperCase() !== "XX" ? raw.toUpperCase() : null;
    return Response.json({ country }, { headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
}
