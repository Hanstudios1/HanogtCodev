import { createHmac } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getActiveSession } from "@/lib/server/active-session";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { isSameOrigin, jsonSecurityHeaders } from "@/lib/server/request-security";

export async function POST(request: NextRequest) {
    if (!isSameOrigin(request)) return NextResponse.json({ error: "Geçersiz istek kaynağı." }, { status: 403 });
    const activeSession = await getActiveSession();
    if (!activeSession) return NextResponse.json({ error: "Etkin oturum gerekli." }, { status: 401 });
    const { email } = activeSession;
    const rate = await enforceRateLimit(`call-ice:${email}`, 30, 60 * 60_000);
    if (!rate.allowed) return NextResponse.json({ error: "Çok fazla istek." }, { status: 429 });

    const iceServers: RTCIceServer[] = [{ urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] }];
    const turnUrl = process.env.TURN_SERVER_URL;
    const sharedSecret = process.env.TURN_SHARED_SECRET;
    if (turnUrl && sharedSecret) {
        const expires = Math.floor(Date.now() / 1000) + 3600;
        const username = `${expires}:${email}`;
        const credential = createHmac("sha1", sharedSecret).update(username).digest("base64");
        iceServers.push({ urls: turnUrl.split(",").map((url) => url.trim()), username, credential });
    }

    return NextResponse.json({ iceServers, turnConfigured: Boolean(turnUrl && sharedSecret) }, { headers: jsonSecurityHeaders() });
}
