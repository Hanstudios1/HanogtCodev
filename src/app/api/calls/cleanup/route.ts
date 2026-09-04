import { NextRequest, NextResponse } from "next/server";
import { getActiveSession } from "@/lib/server/active-session";
import { deleteServerDocument, getServerDocument, listServerCollection } from "@/lib/server/firebase-rest";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { isSameOrigin, jsonSecurityHeaders } from "@/lib/server/request-security";

type CallRecord = { participants?: string[] };

export async function POST(request: NextRequest) {
    if (!isSameOrigin(request)) return NextResponse.json({ error: "Geçersiz istek kaynağı." }, { status: 403 });
    const activeSession = await getActiveSession();
    if (!activeSession) return NextResponse.json({ error: "Etkin oturum gerekli." }, { status: 401 });
    const { email } = activeSession;
    const rate = await enforceRateLimit(`call-cleanup:${email}`, 40, 60 * 60_000);
    if (!rate.allowed) return NextResponse.json({ error: "İstek sınırı aşıldı." }, { status: 429 });

    let body: { callId?: unknown } = {};
    try {
        body = JSON.parse(await request.text()) as { callId?: unknown };
    } catch {
        return NextResponse.json({ error: "Geçersiz istek." }, { status: 400 });
    }
    const callId = typeof body.callId === "string" && /^[a-f0-9-]{20,50}$/i.test(body.callId) ? body.callId : "";
    if (!callId) return NextResponse.json({ error: "Geçersiz arama kimliği." }, { status: 400 });

    const call = await getServerDocument<CallRecord>(`calls/${callId}`);
    if (!call) return NextResponse.json({ success: true }, { headers: jsonSecurityHeaders() });
    if (!call.participants?.includes(email)) return NextResponse.json({ error: "Yetkiniz yok." }, { status: 403 });

    for (const collectionName of ["callerCandidates", "calleeCandidates"]) {
        const candidates = await listServerCollection<Record<string, unknown>>(`calls/${callId}/${collectionName}`);
        for (const candidate of candidates) await deleteServerDocument(candidate._path);
    }
    await deleteServerDocument(`calls/${callId}`);
    return NextResponse.json({ success: true }, { headers: jsonSecurityHeaders() });
}
