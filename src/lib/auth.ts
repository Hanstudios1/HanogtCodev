import "server-only";

import { randomInt, timingSafeEqual } from "node:crypto";
import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import CredentialsProvider from "next-auth/providers/credentials";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { getServerDocument, patchServerDocument } from "@/lib/server/firebase-rest";
import { hashPassword, verifyPassword } from "@/lib/server/password";

const AUTH_SERVICE_UNAVAILABLE = "Giriş hizmetine şu anda ulaşılamıyor. Lütfen biraz sonra tekrar deneyin.";

function normalizedEmail(value: string) {
    return value.trim().toLowerCase();
}

function legacyPasswordMatches(supplied: string, stored: string) {
    const left = Buffer.from(supplied);
    const right = Buffer.from(stored);
    return left.length === right.length && timingSafeEqual(left, right);
}

export const authOptions: NextAuthOptions = {
    providers: [
        GoogleProvider({
            clientId: process.env.GOOGLE_CLIENT_ID || "",
            clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
        }),
        CredentialsProvider({
            name: "E-posta ve şifre",
            credentials: {
                email: { label: "E-posta", type: "email" },
                password: { label: "Şifre", type: "password" },
            },
            async authorize(credentials) {
                if (!credentials?.email || !credentials.password) return null;
                const email = normalizedEmail(credentials.email);
                let rate: Awaited<ReturnType<typeof enforceRateLimit>>;
                try {
                    rate = await enforceRateLimit(`login:${email}`, 10, 15 * 60_000);
                } catch {
                    // Thrown messages are forwarded to the login page as `?error=`,
                    // so a configuration outage no longer looks like a wrong password.
                    throw new Error(AUTH_SERVICE_UNAVAILABLE);
                }
                if (!rate.allowed) {
                    throw new Error(`Çok fazla giriş denemesi. Lütfen ${Math.ceil(rate.retryAfterSeconds / 60)} dakika sonra tekrar deneyin.`);
                }

                let user: {
                    username?: string;
                    avatarUrl?: string;
                    suspended?: boolean;
                    banned?: boolean;
                    password?: string;
                } | null;
                let credential: { passwordHash?: string } | null;
                try {
                    [user, credential] = await Promise.all([
                        getServerDocument<NonNullable<typeof user>>(`users/${email}`),
                        getServerDocument<{ passwordHash?: string }>(`credentials/${email}`),
                    ]);
                } catch {
                    throw new Error(AUTH_SERVICE_UNAVAILABLE);
                }
                if (!user) return null;
                if (user.suspended || user.banned) throw new Error("Bu hesap askıya alınmış. Ayrıntılar için Geri Bildirim sayfasından itiraz edebilirsiniz.");

                let valid = credential?.passwordHash
                    ? await verifyPassword(credentials.password, credential.passwordHash)
                    : false;

                // One-time migration for accounts created by the legacy
                // plaintext implementation. The clear value is deleted as
                // soon as a valid login proves ownership.
                if (!valid && typeof user.password === "string" && legacyPasswordMatches(credentials.password, user.password)) {
                    await patchServerDocument(`credentials/${email}`, {
                        passwordHash: await hashPassword(credentials.password),
                        updatedAt: new Date(),
                        migratedFromLegacy: true,
                    });
                    await patchServerDocument(`users/${email}`, {
                        hasPassword: true,
                        credentialMigratedAt: new Date(),
                    }, { updateFields: ["hasPassword", "credentialMigratedAt", "password", "passwordHash"] });
                    valid = true;
                }

                if (!valid) return null;
                return {
                    id: email,
                    email,
                    name: user.username || email.split("@")[0],
                    image: user.avatarUrl || null,
                };
            },
        }),
    ],
    // Errors (OAuth callback failures, suspended accounts…) are rendered by
    // the login page instead of NextAuth's unstyled default error screen.
    pages: { signIn: "/login", error: "/login" },
    session: { strategy: "jwt", maxAge: 30 * 24 * 60 * 60, updateAge: 24 * 60 * 60 },
    cookies: {
        sessionToken: {
            name: `${process.env.NODE_ENV === "production" ? "__Secure-" : ""}hanogt.session-token`,
            options: {
                httpOnly: true,
                sameSite: "lax",
                path: "/",
                secure: process.env.NODE_ENV === "production",
            },
        },
    },
    callbacks: {
        async signIn({ user, account }) {
            if (!user.email) return false;
            const email = normalizedEmail(user.email);
            user.email = email;
            const existing = await getServerDocument<{ suspended?: boolean; banned?: boolean }>(`users/${email}`);
            if (existing?.suspended || existing?.banned) return "/login?error=AccountSuspended";
            if (account?.provider === "google") {
                const existingProfile = await getServerDocument<Record<string, unknown>>(`public_profiles/${email}`);
                const fallbackName = user.name || email.split("@")[0];
                // Only fill profile fields that are still empty: previously every
                // Google sign-in overwrote the username/avatar chosen in settings.
                const missing = (key: string) => !existingProfile || !existingProfile[key];
                const profile = {
                    email,
                    username: missing("username") ? fallbackName : undefined,
                    avatarUrl: missing("avatarUrl") ? (user.image || "") : undefined,
                    nickname: missing("nickname") ? fallbackName : undefined,
                    nicknameTag: missing("nicknameTag") ? String(randomInt(1000, 10000)) : undefined,
                    publicProfile: existingProfile ? undefined : true,
                    publicProjects: existingProfile ? undefined : true,
                    updatedAt: new Date(),
                };
                await patchServerDocument(`public_profiles/${email}`, profile);
                await patchServerDocument(`users/${email}`, {
                    ...profile,
                    provider: existing ? undefined : "google",
                    lastLoginAt: new Date(),
                    createdAt: existing ? undefined : new Date(),
                });
            }
            return true;
        },
        async jwt({ token, user }) {
            if (user) token.id = user.id || user.email;
            // Firestore rules compare against the lower-cased e-mail carried by
            // the Firebase token; mixed-case Google addresses used to make every
            // client write fail with permission-denied.
            if (typeof token.email === "string") token.email = normalizedEmail(token.email);
            return token;
        },
        async session({ session, token }) {
            if (session.user) {
                (session.user as typeof session.user & { id?: string }).id = String(token.id || token.sub || "");
                if (session.user.email) session.user.email = normalizedEmail(session.user.email);
            }
            return session;
        },
        async redirect({ url, baseUrl }) {
            if (url.includes("/login") || url.includes("/signup") || url === baseUrl) return `${baseUrl}/dashboard`;
            return url.startsWith(baseUrl) ? url : baseUrl;
        },
    },
    secret: process.env.NEXTAUTH_SECRET,
};
