import "server-only";

import { randomInt, timingSafeEqual } from "node:crypto";
import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import CredentialsProvider from "next-auth/providers/credentials";
import { ACCOUNT_SUSPENDED, GOOGLE_EMAIL_UNVERIFIED, TWO_FACTOR_RECOVERY, authRedirectTarget } from "@/lib/auth-client";
import { issueAppealToken, issueTwoFactorRecoveryToken } from "@/lib/server/appeal-token";
import { recordAuthError } from "@/lib/server/auth-diagnostics";
import { cachedAuthVersion, revokeDataSessions } from "@/lib/server/auth-version";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { clientIpFromHeaders } from "@/lib/server/request-security";
import { normalizeEmail } from "@/lib/server/validate";
import { commitServerPatches, createServerDocument, getServerDocument, patchServerDocument } from "@/lib/server/firebase-rest";
import { hashPassword, verifyPassword } from "@/lib/server/password";
import { TWO_FACTOR_FIELDS, verifySecondFactor, type CredentialRecord, type SecondFactorResult } from "@/lib/server/two-factor";
import { SESSION_TOKEN_VERSION, isStaleAuthVersion, readStepUpClaim, sessionStepUpOf, stepUpForSignIn, type CredentialFacts } from "@/lib/step-up";

// Codes thrown from authorize()/signIn end up in redirect URLs and HTTP
// headers, so they must be plain ASCII; /login translates them.
const AUTH_SERVICE_UNAVAILABLE = "ServiceUnavailable";

/** 90 days, renewed on every visit. */
export const SESSION_MAX_AGE = 90 * 24 * 60 * 60;

function normalizedEmail(value: string) {
    return value.trim().toLowerCase();
}

let dummyHash: Promise<string> | null = null;

/**
 * Spends the same scrypt work as a real password check. Without it, unknown
 * addresses answered noticeably faster, which told anyone timing the form
 * whether an account exists.
 */
async function burnPasswordCheck(password: string) {
    dummyHash ??= hashPassword(`unused-${randomInt(1_000_000_000)}`);
    await verifyPassword(password, await dummyHash).catch(() => false);
}

function legacyPasswordMatches(supplied: string, stored: string) {
    const left = Buffer.from(supplied);
    const right = Buffer.from(stored);
    return left.length === right.length && timingSafeEqual(left, right);
}

/**
 * Whether `password` is the account's: its stored hash, or a password from
 * the old plaintext implementation, which a match migrates (hashed, the clear
 * value deleted) since it proves ownership. Unknown accounts and accounts
 * without a password spend the same work, so timing tells nothing.
 */
export async function checkAccountPassword(email: string, password: string, user: { password?: unknown } | null, credential: CredentialRecord | null) {
    if (credential?.passwordHash && await verifyPassword(password, credential.passwordHash)) return true;
    if (!credential?.passwordHash) await burnPasswordCheck(password);
    if (typeof user?.password !== "string" || !legacyPasswordMatches(password, user.password)) return false;
    await patchServerDocument(`credentials/${email}`, {
        passwordHash: await hashPassword(password),
        updatedAt: new Date(),
        migratedFromLegacy: true,
    });
    await patchServerDocument(`users/${email}`, {
        hasPassword: true,
        credentialMigratedAt: new Date(),
    }, { updateFields: ["hasPassword", "credentialMigratedAt", "password", "passwordHash"] });
    return true;
}

/**
 * Suspended accounts can't sign in to open a support ticket, so once the
 * person has proven they own the account, the suspension is reported together
 * with a short-lived token that lets /login file an appeal
 * (/api/support/appeal). The token is base64url, so the code stays ASCII.
 */
function suspendedCode(email: string) {
    const token = issueAppealToken(email);
    return token ? `${ACCOUNT_SUSPENDED}:${token}` : ACCOUNT_SUSPENDED;
}

/**
 * The password was right, but the authenticator and the recovery codes are
 * both lost: a short-lived token lets /login ask the team to reset two-step
 * verification (/api/support/two-factor-recovery). It never signs anyone in.
 */
function twoFactorRecoveryCode(email: string) {
    const token = issueTwoFactorRecoveryToken(email);
    return token ? `${TWO_FACTOR_RECOVERY}:${token}` : AUTH_SERVICE_UNAVAILABLE;
}

/** What the session token records about an account when it signs in (src/lib/step-up.ts). */
export async function credentialFacts(email: string): Promise<CredentialFacts> {
    const [user, credential] = await Promise.all([
        getServerDocument<{ password?: unknown; authVersion?: unknown }>(`users/${email}`),
        getServerDocument<CredentialRecord>(`credentials/${email}`),
    ]);
    return {
        hasPassword: Boolean(credential?.passwordHash) || typeof user?.password === "string",
        twoFactor: Boolean(credential?.totpEnabled && credential.totpSecretEnc),
        authVersion: typeof user?.authVersion === "number" && Number.isFinite(user.authVersion) ? user.authVersion : 0,
    };
}

/**
 * Closes a pre-account takeover: anyone could sign up with someone else's
 * address and a password (sign-up doesn't verify the address), wait for the
 * owner to arrive with Google and keep a way in. So the first Google sign-in
 * that confirms the address of an account created with a password removes
 * that unverified password and any two-step verification set up with it,
 * signs every other session out (authVersion) and tells the owner, who can
 * set a password of their own afterwards.
 */
async function removeUnverifiedPassword(email: string, existing: { authVersion?: unknown }) {
    const now = new Date();
    const authVersion = (typeof existing.authVersion === "number" && Number.isFinite(existing.authVersion) ? existing.authVersion : 0) + 1;
    await commitServerPatches([
        // Every listed field is removed (none is in the data).
        { path: `credentials/${email}`, data: {}, updateFields: ["passwordHash", ...TWO_FACTOR_FIELDS] },
        {
            path: `users/${email}`,
            data: { hasPassword: false, twoFactorEnabled: false, authVersion, unverifiedPasswordRemovedAt: now },
            updateFields: ["hasPassword", "twoFactorEnabled", "authVersion", "unverifiedPasswordRemovedAt", "password", "passwordHash"],
            exists: true,
        },
        {
            path: `notifications/${email}/items/security_unverified_password`,
            data: {
                type: "security",
                title: "Hesabındaki doğrulanmamış şifre kaldırıldı",
                body: "Google ile ilk girişin bu e-posta adresinin senin olduğunu doğruladı. Hesap daha önce doğrulanmamış bir şifreyle açıldığı için o şifre ve iki adımlı doğrulama kaldırıldı, diğer oturumlar kapatıldı. İstersen Hesap Ayarları'ndan yeni bir şifre belirleyebilirsin.",
                actionUrl: "/account-settings",
                read: false,
                createdAt: now,
            },
        },
    ]);
    // Whoever set that password may still hold a Firestore connection.
    await revokeDataSessions(email);
    await createServerDocument("security_events", { actor: email, action: "unverified_password_removed", risk: "medium", createdAt: now, reviewStatus: "none" }).catch(() => undefined);
}

/**
 * Server-side part of every sign-in: blocks suspended accounts and creates or
 * completes the Firestore profile of Google users. Throws when Firestore is
 * unreachable or not configured; the signIn callback turns that into a code.
 */
async function completeSignIn(email: string, user: { name?: string | null; image?: string | null }, provider: string | undefined, emailVerified = false): Promise<true | string> {
    const existing = await getServerDocument<{ suspended?: boolean; banned?: boolean; role?: unknown; emailVerifiedAt?: unknown; provider?: unknown; hasPassword?: unknown; password?: unknown; authVersion?: unknown }>(`users/${email}`);
    if (existing?.suspended || existing?.banned) {
        // The provider (Google) or authorize() has verified the address, so the person may appeal.
        const token = issueAppealToken(email);
        return `/login?error=${ACCOUNT_SUSPENDED}${token ? `&appeal=${encodeURIComponent(token)}` : ""}`;
    }
    // The public profile after the Google branch below; undefined when it was not read.
    let knownProfile: Record<string, unknown> | undefined;
    if (provider === "google") {
        // An account opened with a password whose address nobody had verified yet: see removeUnverifiedPassword.
        if (existing && emailVerified && !existing.emailVerifiedAt && existing.provider === "credentials" && (existing.hasPassword === true || typeof existing.password === "string")) {
            await removeUnverifiedPassword(email, existing);
        }
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
            // Google confirmed the address: billing may link a Paddle customer that already has it (ensureCustomer).
            emailVerifiedAt: emailVerified && !existing?.emailVerifiedAt ? new Date() : undefined,
            lastLoginAt: new Date(),
            createdAt: existing ? undefined : new Date(),
        });
        knownProfile = existingProfile ?? {};
    }
    await syncStaffBadge(email, existing?.role, knownProfile);
    return true;
}

/**
 * Staff badge on the public profile (owners are configured, not stored, so
 * a new deployment labels them at their next sign-in). Best effort: a failed
 * write never blocks signing in. admin.ts is loaded lazily because it imports
 * this module through active-session.ts.
 */
async function syncStaffBadge(email: string, storedRole: unknown, knownProfile: Record<string, unknown> | undefined) {
    try {
        const { staffBadgeFor, syncStaffRoleBadge } = await import("@/lib/server/admin");
        const role = staffBadgeFor(email, storedRole);
        // Without a staff role there is at most a stale badge to remove; only
        // look for one when the profile has been read anyway.
        if (role || knownProfile) await syncStaffRoleBadge(email, role, knownProfile);
    } catch (error) {
        console.warn("[auth] staff badge sync failed:", error instanceof Error ? error.message : error);
    }
}

/** Second-factor guesses an account may make in a day, on top of 6 per 15 minutes. */
const SECOND_FACTOR_ATTEMPTS_PER_DAY = 20;

/**
 * Counts one second-factor attempt (sign-in and the step-up after Google share
 * it): 6 per 15 minutes and 20 a day per account. When the day's attempts
 * run out, the owner is warned once that day: someone who knows the password
 * may be guessing codes.
 */
export async function secondFactorAttempt(email: string) {
    const short = await enforceRateLimit(`login-2fa:${email}`, 6, 15 * 60_000);
    if (!short.allowed) return short;
    const day = await enforceRateLimit(`login-2fa-day:${email}`, SECOND_FACTOR_ATTEMPTS_PER_DAY, 24 * 60 * 60_000);
    if (!day.allowed) {
        const now = new Date();
        const id = `security_2fa_attempts_${now.toISOString().slice(0, 10)}`;
        await Promise.all([
            patchServerDocument(`notifications/${email}/items/${id}`, {
                type: "security",
                title: "Çok sayıda hatalı doğrulama kodu denendi",
                body: "Bugün hesabında iki adımlı doğrulama kodu çok kez yanlış girildi, bu yüzden kod girişi 24 saat durduruldu. Bunu sen yapmadıysan şifreni değiştir ve diğer oturumları kapat.",
                actionUrl: "/account-settings",
                read: false,
                createdAt: now,
            }),
            createServerDocument("security_events", { actor: email, action: "two_factor_attempts_exceeded", risk: "high", createdAt: now, reviewStatus: "pending" }),
        ]).catch(() => undefined);
    }
    return day;
}

export const authOptions: NextAuthOptions = {
    providers: [
        GoogleProvider({
            // Pasted dashboard values often carry a trailing newline, which
            // Google rejects as invalid_client at the token exchange.
            clientId: (process.env.GOOGLE_CLIENT_ID || "").trim(),
            clientSecret: (process.env.GOOGLE_CLIENT_SECRET || "").trim(),
            // The callback makes three calls to Google (discovery, token, keys).
            // openid-client's 3.5 s default was regularly exceeded on cold
            // serverless starts and surfaced as "OAuthCallback".
            httpOptions: { timeout: 15_000 },
        }),
        CredentialsProvider({
            name: "E-posta ve şifre",
            credentials: {
                email: { label: "E-posta", type: "email" },
                password: { label: "Şifre", type: "password" },
                // Authenticator or recovery code; asked for after "TwoFactorRequired".
                otp: { label: "Doğrulama kodu", type: "text" },
                // "1" when both are lost: ask for a 2FA recovery token instead of checking a code.
                twoFactorRecovery: { label: "2FA kurtarma", type: "text" },
            },
            async authorize(credentials, req) {
                if (!credentials?.email || !credentials.password) return null;
                // E-mails are document ids: reject anything with path characters.
                const email = normalizeEmail(credentials.email);
                if (!email || credentials.password.length > 1_024) return null;
                let rate: Awaited<ReturnType<typeof enforceRateLimit>>;
                let ipRate: Awaited<ReturnType<typeof enforceRateLimit>>;
                try {
                    // Per account (guessing one password) and per address (trying one
                    // password against many accounts, i.e. password spraying).
                    [rate, ipRate] = await Promise.all([
                        enforceRateLimit(`login:${email}`, 10, 15 * 60_000),
                        enforceRateLimit(`login-ip:${clientIpFromHeaders(req?.headers)}`, 60, 15 * 60_000),
                    ]);
                } catch (error) {
                    // A configuration outage must not look like a wrong password.
                    recordAuthError("CALLBACK_CREDENTIALS_HANDLER_ERROR", error);
                    throw new Error(AUTH_SERVICE_UNAVAILABLE);
                }
                if (!rate.allowed || !ipRate.allowed) {
                    const wait = Math.max(rate.allowed ? 0 : rate.retryAfterSeconds, ipRate.allowed ? 0 : ipRate.retryAfterSeconds);
                    throw new Error(`RateLimited:${Math.ceil(wait / 60)}`);
                }

                let user: {
                    username?: string;
                    avatarUrl?: string;
                    suspended?: boolean;
                    banned?: boolean;
                    password?: string;
                } | null;
                let credential: CredentialRecord | null;
                try {
                    [user, credential] = await Promise.all([
                        getServerDocument<NonNullable<typeof user>>(`users/${email}`),
                        getServerDocument<CredentialRecord>(`credentials/${email}`),
                    ]);
                } catch (error) {
                    recordAuthError("CALLBACK_CREDENTIALS_HANDLER_ERROR", error);
                    throw new Error(AUTH_SERVICE_UNAVAILABLE);
                }
                if (!user) {
                    await burnPasswordCheck(credentials.password);
                    return null;
                }
                // Suspended accounts are checked only after the password and the
                // second factor: until then they answer exactly like any other
                // account, so the form never tells strangers which addresses are suspended.

                if (!(await checkAccountPassword(email, credentials.password, user, credential))) return null;

                // Two-step verification: the password was right, now the second factor.
                // The codes below are ASCII so they survive the redirect URL (see top).
                if (credential?.totpEnabled && credential.totpSecretEnc) {
                    // No second factor at hand at all: the password alone earns a recovery
                    // token, never a session. Like every answer before the second factor,
                    // it says nothing about a suspension.
                    if (credentials.twoFactorRecovery === "1") throw new Error(twoFactorRecoveryCode(email));
                    const otp = typeof credentials.otp === "string" ? credentials.otp.trim() : "";
                    if (!otp) throw new Error("TwoFactorRequired");
                    let otpRate: Awaited<ReturnType<typeof enforceRateLimit>>;
                    let check: SecondFactorResult;
                    try {
                        otpRate = await secondFactorAttempt(email);
                        check = otpRate.allowed ? await verifySecondFactor(email, credential, otp) : { ok: false };
                    } catch (error) {
                        recordAuthError("CALLBACK_CREDENTIALS_HANDLER_ERROR", error);
                        throw new Error(AUTH_SERVICE_UNAVAILABLE);
                    }
                    if (!otpRate.allowed) throw new Error(`RateLimited:${Math.ceil(otpRate.retryAfterSeconds / 60)}`);
                    if (!check.ok) throw new Error("TwoFactorInvalid");
                }

                // Ownership is proven: report the suspension with an appeal token.
                if (user.suspended || user.banned) throw new Error(suspendedCode(email));
                // Best effort: shown in Account Settings and to the team.
                await patchServerDocument(`users/${email}`, { lastLoginAt: new Date() }).catch(() => undefined);

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
    logger: {
        error: recordAuthError,
        warn: (code) => console.warn(`[next-auth][warn][${code}]`),
    },
    // Rolling: every visit extends the session, so people stay signed in until they sign out.
    session: { strategy: "jwt", maxAge: SESSION_MAX_AGE, updateAge: 24 * 60 * 60 },
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
        async signIn({ user, account, profile }) {
            if (!user.email) return false;
            const email = normalizedEmail(user.email);
            user.email = email;
            // Google's ID token says whether it has verified the address (the email_verified claim).
            const emailVerified = account?.provider === "google" && (profile as { email_verified?: unknown } | undefined)?.email_verified === true;
            // An unverified Google address proves nothing about the account it names.
            if (account?.provider === "google" && !emailVerified) return `/login?error=${GOOGLE_EMAIL_UNVERIFIED}`;
            try {
                return await completeSignIn(email, user, account?.provider, emailVerified);
            } catch (error) {
                // NextAuth puts a thrown message into a redirect URL without
                // encoding it; Turkish characters there crashed the request
                // with an empty HTTP 500. Report a plain code instead.
                recordAuthError("SIGNIN_CALLBACK_ERROR", error);
                return `/login?error=${AUTH_SERVICE_UNAVAILABLE}`;
            }
        },
        // The `session` an update() call sends is never read here: nothing in the
        // browser can change these fields (a pending step-up above all).
        async jwt({ token, user, account }) {
            if (user) token.id = user.id || user.email;
            // Firestore rules compare against the lower-cased e-mail carried by
            // the Firebase token; mixed-case Google addresses used to make every
            // client write fail with permission-denied.
            if (typeof token.email === "string") token.email = normalizedEmail(token.email);
            const email = typeof token.email === "string" ? token.email : null;
            if (account && email) {
                // A new sign-in: what it proved, and whether a step-up is still needed (src/lib/step-up.ts).
                const now = Date.now();
                const facts = await credentialFacts(email);
                token.sv = SESSION_TOKEN_VERSION;
                token.authTime = now;
                token.provider = account.provider;
                token.authVersion = facts.authVersion;
                const stepUp = stepUpForSignIn(account.provider, facts, now);
                if (stepUp) token.stepUp = stepUp;
                else delete token.stepUp;
            } else if (email && token.sv !== SESSION_TOKEN_VERSION) {
                // A session from before step-ups: an account with a password proves it once more.
                // Unreadable now: left as it is and tried again next time.
                const facts = await credentialFacts(email).catch(() => null);
                if (facts) {
                    token.sv = SESSION_TOKEN_VERSION;
                    // When it signed in is unknown (iat is renewed on every visit): never "recent".
                    token.authTime = 0;
                    token.authVersion = facts.authVersion;
                    const stepUp = stepUpForSignIn(undefined, facts, Date.now());
                    if (stepUp) token.stepUp = stepUp;
                }
            } else if (email && !token.revoked) {
                // Signed out everywhere (or the password changed) since: the server already refuses
                // the session (active-session.ts); from here on the browser sees it signed out too.
                const current = await cachedAuthVersion(email);
                if (current !== null && isStaleAuthVersion(current, token.authVersion)) token.revoked = true;
            }
            return token;
        },
        async session({ session, token }) {
            // An empty session is "signed out" to NextAuth's client and to getServerSession.
            if (token.revoked) return {} as typeof session;
            if (session.user) {
                (session.user as typeof session.user & { id?: string }).id = String(token.id || token.sub || "");
                if (session.user.email) session.user.email = normalizedEmail(session.user.email);
            }
            const stepUp = readStepUpClaim(token.stepUp);
            if (stepUp) session.stepUp = sessionStepUpOf(stepUp);
            session.authTime = typeof token.authTime === "number" ? token.authTime : null;
            session.authVersion = typeof token.authVersion === "number" ? token.authVersion : 0;
            return session;
        },
        async redirect({ url, baseUrl }) {
            // Relative paths from the login screen, or an address on our own origin (src/lib/auth-client.ts).
            return authRedirectTarget(url, baseUrl);
        },
    },
    secret: process.env.NEXTAUTH_SECRET,
};
