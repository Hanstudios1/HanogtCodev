import { createHash, createHmac } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getActiveSession } from "@/lib/server/active-session";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { isSameOrigin, jsonSecurityHeaders } from "@/lib/server/request-security";

/**
 * Opaque, stable id of a person for TURN usernames. The username travels in
 * clear text in STUN/TURN messages and lands in the TURN server's logs, so it
 * must not be the e-mail address. The salt is a server secret the TURN
 * operator doesn't have (not TURN_SHARED_SECRET), so the id can't be matched
 * against a list of known addresses either.
 */
function turnUserId(email: string) {
    const salt = process.env.RATE_LIMIT_SALT || process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET || "hanogt";
    return createHash("sha256").update(`${salt}:turn-user:${email}`).digest("hex").slice(0, 24);
}

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
        // TURN REST API: username "<expiry>:<user id>", password base64(HMAC-SHA1(secret, username)).
        const expires = Math.floor(Date.now() / 1000) + 3600;
        const username = `${expires}:${turnUserId(email)}`;
        const credential = createHmac("sha1", sharedSecret).update(username).digest("base64");
        iceServers.push({ urls: turnUrl.split(",").map((url) => url.trim()), username, credential });
    }

    return NextResponse.json({ iceServers, turnConfigured: Boolean(turnUrl && sharedSecret) }, { headers: jsonSecurityHeaders() });
}
