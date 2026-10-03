import type { NextRequest } from "next/server";
import { visitorCountryFromHeaders } from "@/lib/server/request-security";

export const dynamic = "force-dynamic";

/**
 * Country of the visitor as reported by the edge: Cloudflare's CF-IPCountry
 * when the request came through Cloudflare, otherwise Vercel's
 * x-vercel-ip-country (visitorCountryFromHeaders). Used once to pick the
 * first-visit language; nothing is stored on the server.
 */
export function GET(request: NextRequest) {
    const country = visitorCountryFromHeaders(request.headers);
    return Response.json({ country }, { headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
}
