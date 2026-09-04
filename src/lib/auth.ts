import "server-only";

import { randomInt, timingSafeEqual } from "node:crypto";
import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import CredentialsProvider from "next-auth/providers/credentials";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { getServerDocument, patchServerDocument } from "@/lib/server/firebase-rest";
import { hashPassword, verifyPassword } from "@/lib/server/password";

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
                const rate = await enforceRateLimit(`login:${email}`, 10, 15 * 60_000);
                if (!rate.allowed) return null;

                const user = await getServerDocument<{
                    username?: string;
                    avatarUrl?: string;
                    suspended?: boolean;
                    banned?: boolean;
                    password?: string;
                }>(`users/${email}`);
                if (!user || user.suspended || user.banned) return null;

                const credential = await getServerDocument<{ passwordHash?: string }>(`credentials/${email}`);
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
    pages: { signIn: "/login" },
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
            const existing = await getServerDocument<{ suspended?: boolean; banned?: boolean }>(`users/${email}`);
            if (existing?.suspended || existing?.banned) return false;
            if (account?.provider === "google") {
                const existingProfile = await getServerDocument<Record<string, unknown>>(`public_profiles/${email}`);
                const profile = {
                    email,
                    username: user.name || email.split("@")[0],
                    avatarUrl: user.image || "",
                    nickname: user.name || email.split("@")[0],
                    nicknameTag: existingProfile ? undefined : String(randomInt(1000, 10000)),
                    publicProfile: existingProfile ? undefined : true,
                    publicProjects: existingProfile ? undefined : true,
                    updatedAt: new Date(),
                };
                await patchServerDocument(`public_profiles/${email}`, profile);
                await patchServerDocument(`users/${email}`, {
                    ...profile,
                    provider: "google",
                    lastLoginAt: new Date(),
                    createdAt: existing ? undefined : new Date(),
                });
            }
            return true;
        },
        async jwt({ token, user }) {
            if (user) token.id = user.id || user.email;
            return token;
        },
        async session({ session, token }) {
            if (session.user) (session.user as typeof session.user & { id?: string }).id = String(token.id || token.sub || "");
            return session;
        },
        async redirect({ url, baseUrl }) {
            if (url.includes("/login") || url.includes("/signup") || url === baseUrl) return `${baseUrl}/dashboard`;
            return url.startsWith(baseUrl) ? url : baseUrl;
        },
    },
    secret: process.env.NEXTAUTH_SECRET,
};
