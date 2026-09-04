import { randomInt } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { commitServerPatches, getServerDocument } from "@/lib/server/firebase-rest";
import { hashPassword, validatePassword } from "@/lib/server/password";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { getClientKey, isSameOrigin, jsonSecurityHeaders } from "@/lib/server/request-security";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: NextRequest) {
    try {
        if (!isSameOrigin(req)) return NextResponse.json({ error: "Geçersiz istek kaynağı." }, { status: 403 });
        const rate = await enforceRateLimit(`signup:${getClientKey(req)}`, 5, 60 * 60_000);
        if (!rate.allowed) {
            return NextResponse.json({ error: "Çok fazla kayıt denemesi. Daha sonra tekrar deneyin." }, {
                status: 429,
                headers: jsonSecurityHeaders({ "Retry-After": String(rate.retryAfterSeconds) }),
            });
        }

        const body = await req.json() as { email?: unknown; password?: unknown; username?: unknown };
        const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
        const password = typeof body.password === "string" ? body.password : "";
        const username = typeof body.username === "string" ? body.username.trim() : "";
        const passwordError = validatePassword(password);
        if (!EMAIL_PATTERN.test(email) || email.length > 254) {
            return NextResponse.json({ error: "Geçerli bir e-posta adresi girin." }, { status: 400 });
        }
        if (passwordError) return NextResponse.json({ error: passwordError }, { status: 400 });
        if (username.length > 40) return NextResponse.json({ error: "Kullanıcı adı en fazla 40 karakter olabilir." }, { status: 400 });
        if (await getServerDocument(`users/${email}`)) {
            return NextResponse.json({ error: "Bu e-posta ile kayıtlı bir hesap zaten var." }, { status: 409 });
        }

        const passwordHash = await hashPassword(password);
        const nicknameTag = String(randomInt(1000, 10000));
        await commitServerPatches([
            { path: `credentials/${email}`, data: { passwordHash, createdAt: new Date() }, exists: false },
            { path: `users/${email}`, data: {
                email,
                username: username || email.split("@")[0],
                nickname: username || email.split("@")[0],
                nicknameTag,
                avatarUrl: "",
                friends: [],
                blockedUsers: [],
                hasPassword: true,
                createdAt: new Date(),
                provider: "credentials",
            }, exists: false },
            { path: `public_profiles/${email}`, data: {
                email,
                username: username || email.split("@")[0],
                nickname: username || email.split("@")[0],
                nicknameTag,
                avatarUrl: "",
                isOnline: false,
                publicProfile: true,
                publicProjects: true,
                updatedAt: new Date(),
            }, exists: false },
        ]);

        return NextResponse.json({ success: true, message: "Hesap başarıyla oluşturuldu." }, {
            status: 201,
            headers: jsonSecurityHeaders(),
        });
    } catch {
        return NextResponse.json({ error: "Kayıt işlemi şu anda tamamlanamadı." }, {
            status: 503,
            headers: jsonSecurityHeaders(),
        });
    }
}
