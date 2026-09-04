import { NextRequest, NextResponse } from "next/server";
import { getActiveSession } from "@/lib/server/active-session";
import { getServerDocument, patchServerDocument } from "@/lib/server/firebase-rest";
import { hashPassword, validatePassword, verifyPassword } from "@/lib/server/password";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { isSameOrigin, jsonSecurityHeaders } from "@/lib/server/request-security";

export async function POST(request: NextRequest) {
    if (!isSameOrigin(request)) return NextResponse.json({ error: "Geçersiz istek kaynağı." }, { status: 403 });
    const activeSession = await getActiveSession();
    if (!activeSession) return NextResponse.json({ error: "Etkin oturum gerekli." }, { status: 401 });
    const { email } = activeSession;
    const rate = await enforceRateLimit(`password-change:${email}`, 5, 60 * 60_000);
    if (!rate.allowed) return NextResponse.json({ error: "Çok fazla deneme. Daha sonra tekrar deneyin." }, { status: 429 });

    const body = await request.json() as { currentPassword?: unknown; newPassword?: unknown };
    const currentPassword = typeof body.currentPassword === "string" ? body.currentPassword : "";
    const newPassword = typeof body.newPassword === "string" ? body.newPassword : "";
    const validationError = validatePassword(newPassword);
    if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });

    const credential = await getServerDocument<{ passwordHash?: string }>(`credentials/${email}`);
    if (credential?.passwordHash && !(await verifyPassword(currentPassword, credential.passwordHash))) {
        return NextResponse.json({ error: "Mevcut şifre yanlış." }, { status: 403 });
    }

    await patchServerDocument(`credentials/${email}`, {
        passwordHash: await hashPassword(newPassword),
        updatedAt: new Date(),
    });
    await patchServerDocument(`users/${email}`, { hasPassword: true, passwordUpdatedAt: new Date() }, {
        updateFields: ["hasPassword", "passwordUpdatedAt", "password", "passwordHash"],
    });
    return NextResponse.json({ success: true }, { headers: jsonSecurityHeaders() });
}
