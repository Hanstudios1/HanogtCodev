import { randomInt } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { isOwnerEmail } from "@/lib/server/admin";
import { commitServerPatches, getServerDocument } from "@/lib/server/firebase-rest";
import { hashPassword, validatePassword } from "@/lib/server/password";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { getClientKey, isSameOrigin, jsonSecurityHeaders } from "@/lib/server/request-security";
import { normalizeEmail, readJsonBody } from "@/lib/server/validate";

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

        const body = await readJsonBody<{ email?: unknown; password?: unknown; username?: unknown }>(req, 8_000);
        if (!body) return NextResponse.json({ error: "Geçersiz istek gövdesi.", code: "bad_request" }, { status: 400 });
        // The e-mail becomes a document id, so it must not contain "/" or other path characters.
        const email = normalizeEmail(body.email);
        const password = typeof body.password === "string" ? body.password : "";
        const username = typeof body.username === "string" ? body.username.trim() : "";
        const passwordError = validatePassword(password);
        if (!email) {
            return NextResponse.json({ error: "Geçerli bir e-posta adresi girin." }, { status: 400 });
        }
        // Owner addresses carry full admin rights. A password sign-up does not
        // prove that the address belongs to the person, Google sign-in does.
        if (isOwnerEmail(email)) {
            return NextResponse.json({
                code: "reserved_email",
                error: "Bu e-posta adresiyle şifreli hesap oluşturulamaz. Lütfen Google ile giriş yapın.",
            }, { status: 403, headers: jsonSecurityHeaders() });
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
