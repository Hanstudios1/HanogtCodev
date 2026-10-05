"use client";

import { Suspense, useCallback, useEffect, useId, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { signOut } from "next-auth/react";
import { AlertCircle, CheckCircle2, Eye, EyeOff, KeyRound, LifeBuoy, LoaderCircle, Lock, LogOut, Send, ShieldCheck } from "lucide-react";
import AuthShell, { inputClass } from "@/components/auth/AuthShell";
import { useRawSession } from "@/components/Provider";
import {
    ACCOUNT_SUSPENDED,
    SIGN_IN_REQUEST_LIMITS,
    STEP_UP_EXPIRED,
    normalizeSignInRequestMessage,
    safeCallbackPath,
    submitPasswordRecovery,
    type SignInRequestFailure,
} from "@/lib/auth-client";
import { useI18n, type Copy } from "@/lib/i18n";
import { readSessionStepUp } from "@/lib/step-up";

const C = {
    title: { TR: "Hesabını doğrula", EN: "Verify it's you" },
    subtitle: { TR: "Google ile giriş yaptın. Bu hesabın bir şifresi de var; devam etmek için onu gir.", EN: "You signed in with Google. This account also has a password; enter it to continue." },
    subtitleTotp: { TR: "Google ile giriş yaptın. Bu hesabın bir şifresi ve iki adımlı doğrulaması var; devam etmek için ikisini de gir.", EN: "You signed in with Google. This account also has a password and two-step verification; enter both to continue." },
    as: { TR: "{email} olarak devam ediyorsun", EN: "Continuing as {email}" },
    why: { TR: "Hesabına sonradan şifre eklendiği için her Google girişinden sonra şifren de istenir: Google hesabını ele geçiren biri tek başına hesabına giremez.", EN: "Because a password was added to your account, it is asked for after every Google sign-in: someone who takes over your Google account still can't get into your account alone." },
    password: { TR: "Şifre", EN: "Password" },
    show: { TR: "Şifreyi göster", EN: "Show password" },
    hide: { TR: "Şifreyi gizle", EN: "Hide password" },
    code: { TR: "Doğrulama kodu", EN: "Verification code" },
    recoveryCode: { TR: "Kurtarma kodu", EN: "Recovery code" },
    codeHint: { TR: "Doğrulama uygulamandaki 6 haneli kod.", EN: "The 6-digit code from your authenticator app." },
    recoveryHint: { TR: "Kaydettiğin kurtarma kodlarından biri; her kod bir kez çalışır.", EN: "One of the recovery codes you saved; each works once." },
    useRecovery: { TR: "Kurtarma kodu kullan", EN: "Use a recovery code" },
    useApp: { TR: "Doğrulama uygulamasını kullan", EN: "Use the authenticator app" },
    submit: { TR: "Doğrula ve devam et", EN: "Verify and continue" },
    remaining: { TR: "Bu doğrulama {time} içinde sona erer.", EN: "This check ends in {time}." },
    expiredTitle: { TR: "Doğrulama süresi doldu", EN: "The check timed out" },
    expiredBody: { TR: "Güvenliğin için yeniden giriş yapman gerekiyor.", EN: "For your security, you need to sign in again." },
    signInAgain: { TR: "Yeniden giriş yap", EN: "Sign in again" },
    otherAccount: { TR: "Başka bir hesapla giriş yap", EN: "Sign in with another account" },
    forgot: { TR: "Şifremi hatırlamıyorum", EN: "I don't remember my password" },
    forgotTitle: { TR: "Şifre şartını kaldırma talebi", EN: "Ask to remove the password" },
    forgotBody: {
        TR: "Google hesabın doğrulandı, ancak hesabın şifresi doğrulanmadı. Ekip, hesabın sana ait olduğundan emin olduktan sonra şifreyi kaldırır; ardından Google ile giriş yapman yeterli olur ve istersen yeni bir şifre belirleyebilirsin.",
        EN: "Your Google account was verified, but the account's password wasn't. Once the team is sure the account is yours, they remove the password; signing in with Google is then enough, and you can set a new password if you like.",
    },
    requestLabel: { TR: "Talebin", EN: "Your request" },
    requestPlaceholder: { TR: "Şifreyi ne zaman eklediğini, hesabı en son ne zaman kullandığını ve hesabın sana ait olduğunu gösterecek ayrıntıları yaz…", EN: "Say when you added the password, when you last used the account and anything that shows the account is yours…" },
    requestHint: { TR: "En az {min} karakter. Şifreni ya da kodlarını asla yazma. Her hesap günde bir talep gönderebilir.", EN: "At least {min} characters. Never include your password or codes. Each account can send one request a day." },
    send: { TR: "Talebi gönder", EN: "Send request" },
    sent: { TR: "Talebin alındı. Ekip şifreyi kaldırırsa Google ile giriş yapman yeterli olur; yanıtı Geri Bildirim sayfasındaki “Taleplerim” bölümünde görürsün.", EN: "Your request was received. If the team removes the password, signing in with Google is enough; you'll find the reply under “My tickets” on the Feedback page." },
    back: { TR: "Doğrulamaya dön", EN: "Back to the check" },
} satisfies Record<string, Copy>;

const ERRORS: Record<string, Copy> = {
    wrong_password: { TR: "Şifre yanlış.", EN: "That password is wrong." },
    totp_required: { TR: "Doğrulama uygulamandaki kodu da gir.", EN: "Enter the code from your authenticator app too." },
    totp_invalid: { TR: "Doğrulama kodu hatalı, süresi dolmuş ya da zaten kullanılmış.", EN: "The code is wrong, expired or already used." },
    rate_limited: { TR: "Çok fazla deneme. {minutes} dakika sonra tekrar dene.", EN: "Too many tries. Try again in {minutes} minutes." },
    unavailable: { TR: "Doğrulama şu anda yapılamıyor. Biraz sonra tekrar dene.", EN: "The check isn't available right now. Try again shortly." },
    network: { TR: "Sunucuya bağlanılamadı. İnternet bağlantını kontrol edip tekrar dene.", EN: "Couldn't reach the server. Check your connection and try again." },
    bad_request: { TR: "Şifreni gir.", EN: "Enter your password." },
};

const REQUEST_ERRORS: Partial<Record<SignInRequestFailure["code"], Copy>> = {
    rate_limited: { TR: "Bu hesap için bugün zaten bir talep gönderildi ya da çok fazla deneme yapıldı.", EN: "A request was already sent for this account today, or there were too many tries." },
    message_too_short: { TR: "Talep en az {min} karakter olmalı.", EN: "The request needs at least {min} characters.", vars: { min: SIGN_IN_REQUEST_LIMITS.messageMin } },
    invalid_token: { TR: "Talep formunun süresi doldu; yeniden aç.", EN: "The request form expired; open it again." },
};
const REQUEST_ERROR_FALLBACK: Copy = { TR: "Talep gönderilemedi. Lütfen tekrar dene.", EN: "The request couldn't be sent. Please try again." };

const submitClass = "flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-indigo-600 to-violet-600 text-sm font-bold text-white shadow-lg shadow-indigo-500/25 transition hover:brightness-110 disabled:opacity-60";

function formatRemaining(ms: number) {
    const total = Math.max(0, Math.ceil(ms / 1000));
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/** The forgotten-password request: a token from the step-up endpoint, then a ticket for the team. */
function PasswordRecovery({ onClose }: { onClose: () => void }) {
    const { tx } = useI18n();
    const uid = useId();
    const [token, setToken] = useState<string | null>(null);
    const [message, setMessage] = useState("");
    const [state, setState] = useState<"idle" | "busy" | "sent">("idle");
    const [error, setError] = useState<Copy | null>(null);
    const length = normalizeSignInRequestMessage(message).length;
    const ready = length >= SIGN_IN_REQUEST_LIMITS.messageMin && length <= SIGN_IN_REQUEST_LIMITS.message;

    const send = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!ready || state === "busy") return;
        setState("busy");
        setError(null);
        let current = token;
        if (!current) {
            const response = await fetch("/api/auth/step-up", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "recovery_token" }) }).catch(() => null);
            const data = await response?.json().catch(() => null) as { token?: unknown } | null;
            current = typeof data?.token === "string" ? data.token : null;
            setToken(current);
            if (!current) {
                setState("idle");
                setError(response?.status === 429 ? REQUEST_ERRORS.rate_limited! : REQUEST_ERROR_FALLBACK);
                return;
            }
        }
        const result = await submitPasswordRecovery(current, message);
        if (result.ok) {
            setState("sent");
            setMessage("");
            return;
        }
        if (result.code === "invalid_token") setToken(null);
        setState("idle");
        setError(REQUEST_ERRORS[result.code] ?? REQUEST_ERROR_FALLBACK);
    };

    return (
        <section aria-labelledby={`${uid}-title`} className="space-y-4" data-step-up-recovery>
            <div className="flex items-start gap-3 rounded-2xl border border-indigo-200 bg-indigo-50 p-3.5 text-sm leading-5 text-indigo-900 dark:border-indigo-900/60 dark:bg-indigo-950/30 dark:text-indigo-200">
                <LifeBuoy className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
                <span>
                    <strong id={`${uid}-title`} className="block">{tx(C.forgotTitle)}</strong>
                    {tx(C.forgotBody)}
                </span>
            </div>
            {state === "sent" ? (
                <div role="status" className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-3.5 text-sm leading-5 text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200">
                    <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
                    <span>{tx(C.sent)}</span>
                </div>
            ) : (
                <form onSubmit={send} className="space-y-3">
                    <div className="flex items-center justify-between gap-3">
                        <label htmlFor={`${uid}-message`} className="text-sm font-semibold">{tx(C.requestLabel)}</label>
                        <span className="shrink-0 text-xs tabular-nums text-zinc-500" dir="ltr">{length}/{SIGN_IN_REQUEST_LIMITS.message}</span>
                    </div>
                    <textarea
                        id={`${uid}-message`}
                        value={message}
                        onChange={(event) => setMessage(event.target.value)}
                        rows={5}
                        maxLength={SIGN_IN_REQUEST_LIMITS.message + 200}
                        placeholder={tx(C.requestPlaceholder)}
                        className="block w-full resize-y rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm leading-6 text-zinc-900 shadow-sm outline-none transition placeholder:text-zinc-400 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/15 dark:border-zinc-800 dark:bg-zinc-900 dark:text-white"
                        aria-describedby={`${uid}-hint`}
                    />
                    <p id={`${uid}-hint`} className="text-xs leading-5 text-zinc-500">{tx(C.requestHint, { min: SIGN_IN_REQUEST_LIMITS.messageMin })}</p>
                    {error ? <p role="alert" className="text-sm font-semibold text-red-600 dark:text-red-400">{tx(error)}</p> : null}
                    <button type="submit" disabled={!ready || state === "busy"} className={submitClass}>
                        {state === "busy" ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Send className="h-4 w-4" aria-hidden="true" />}
                        {tx(C.send)}
                    </button>
                </form>
            )}
            <button type="button" onClick={onClose} className="text-sm font-semibold text-indigo-600 hover:underline dark:text-indigo-400">{tx(C.back)}</button>
        </section>
    );
}

function VerifyForm() {
    const { tx } = useI18n();
    const searchParams = useSearchParams();
    const callbackPath = safeCallbackPath(searchParams.get("callbackUrl"));
    const session = useRawSession();
    const stepUp = session.status === "authenticated" ? readSessionStepUp(session.data) : null;
    const email = session.data?.user?.email ?? "";
    const [password, setPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [code, setCode] = useState("");
    const [askCode, setAskCode] = useState(false);
    const [useRecoveryCode, setUseRecoveryCode] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<{ copy: Copy; minutes?: number } | null>(null);
    const [recovering, setRecovering] = useState(false);
    const [now, setNow] = useState(() => Date.now());
    const codeRef = useRef<HTMLInputElement>(null);
    const needsCode = askCode || Boolean(stepUp?.needs.includes("totp"));
    const expired = stepUp ? now >= stepUp.expiresAt : false;

    // Signed out, or nothing (left) to check: on to sign-in or to where the visitor was going.
    useEffect(() => {
        if (session.status === "unauthenticated") window.location.replace(`/login?callbackUrl=${encodeURIComponent(callbackPath)}`);
        else if (session.status === "authenticated" && !stepUp) window.location.replace(callbackPath);
    }, [callbackPath, session.status, stepUp]);

    useEffect(() => {
        const timer = window.setInterval(() => setNow(Date.now()), 1000);
        return () => window.clearInterval(timer);
    }, []);

    // Signing in again (or as someone else) still leads where this sign-in was going.
    const leave = useCallback((error?: string) => {
        const query = new URLSearchParams({ ...(error ? { error } : {}), callbackUrl: callbackPath });
        void signOut({ callbackUrl: `/login?${query}` });
    }, [callbackPath]);

    const verify = async (event: React.FormEvent) => {
        event.preventDefault();
        if (busy) return;
        setBusy(true);
        setError(null);
        let response: Response | null = null;
        try {
            response = await fetch("/api/auth/step-up", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "verify", password, ...(needsCode && code.trim() ? { code: code.trim() } : {}) }),
            });
        } catch {
            setBusy(false);
            setError({ copy: ERRORS.network });
            return;
        }
        const data = await response.json().catch(() => ({})) as { code?: string; retryAfterMinutes?: number };
        if (response.ok || data.code === "not_pending") {
            // A full load: the new session cookie, the Firebase bridge and presence all start afresh.
            window.location.assign(callbackPath);
            return;
        }
        setBusy(false);
        if (data.code === "expired") return leave(STEP_UP_EXPIRED);
        if (data.code === "suspended") return leave(ACCOUNT_SUSPENDED);
        if (data.code === "auth_required") return leave();
        if (data.code === "totp_required") {
            setAskCode(true);
            window.setTimeout(() => codeRef.current?.focus(), 0);
        }
        if (data.code === "totp_invalid") setCode("");
        setError({ copy: ERRORS[data.code ?? ""] ?? ERRORS.unavailable, minutes: data.retryAfterMinutes });
    };

    if (!stepUp) return <div className="flex min-h-dvh items-center justify-center bg-background"><LoaderCircle className="h-6 w-6 animate-spin text-indigo-500" aria-label="…" /></div>;

    return (
        <AuthShell title={tx(C.title)} subtitle={tx(needsCode ? C.subtitleTotp : C.subtitle)}>
            <div className="space-y-5" data-step-up>
                {email ? <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-200">{tx(C.as, { email })}</p> : null}
                {expired ? (
                    <div role="alert" className="space-y-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-5 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
                        <strong className="block">{tx(C.expiredTitle)}</strong>
                        <span>{tx(C.expiredBody)}</span>
                        <button type="button" onClick={() => leave(STEP_UP_EXPIRED)} className={submitClass}>{tx(C.signInAgain)}</button>
                    </div>
                ) : recovering ? (
                    <PasswordRecovery onClose={() => setRecovering(false)} />
                ) : (
                    <form onSubmit={verify} className="space-y-4">
                        <div className="flex items-start gap-3 rounded-2xl border border-indigo-200 bg-indigo-50 p-3.5 text-sm leading-5 text-indigo-900 dark:border-indigo-900/60 dark:bg-indigo-950/30 dark:text-indigo-200">
                            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
                            <span>{tx(C.why)}</span>
                        </div>
                        {error ? (
                            <div role="alert" className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-3.5 text-sm leading-5 text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">
                                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                                <span>{tx(error.copy, { minutes: error.minutes ?? 15 })}</span>
                            </div>
                        ) : null}
                        <label className="block">
                            <span className="mb-1.5 block text-sm font-semibold">{tx(C.password)}</span>
                            <span className="relative block">
                                <Lock className="pointer-events-none absolute start-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-zinc-400" aria-hidden="true" />
                                <input type={showPassword ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} required autoFocus autoComplete="current-password" className={`${inputClass} pe-12`} placeholder="••••••••••" />
                                <button type="button" onClick={() => setShowPassword((value) => !value)} className="absolute end-2 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-xl text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200" aria-label={tx(showPassword ? C.hide : C.show)}>
                                    {showPassword ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
                                </button>
                            </span>
                        </label>
                        {needsCode ? (
                            <label className="block">
                                <span className="mb-1.5 block text-sm font-semibold">{tx(useRecoveryCode ? C.recoveryCode : C.code)}</span>
                                <span className="relative block">
                                    <KeyRound className="pointer-events-none absolute start-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-zinc-400" aria-hidden="true" />
                                    <input
                                        ref={codeRef}
                                        key={useRecoveryCode ? "recovery" : "totp"}
                                        value={code}
                                        onChange={(event) => setCode(useRecoveryCode ? event.target.value.toUpperCase().slice(0, 20) : event.target.value.replace(/[^\d]/g, "").slice(0, 6))}
                                        required
                                        dir="ltr"
                                        autoComplete="one-time-code"
                                        inputMode={useRecoveryCode ? "text" : "numeric"}
                                        className={`${inputClass} font-mono text-base tracking-[0.3em]`}
                                        placeholder={useRecoveryCode ? "XXXX-XXXX-XXXX" : "000000"}
                                    />
                                </span>
                                <span className="mt-1.5 flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-500">
                                    <span>{tx(useRecoveryCode ? C.recoveryHint : C.codeHint)}</span>
                                    <button type="button" onClick={() => { setUseRecoveryCode((value) => !value); setCode(""); }} className="font-semibold text-indigo-600 hover:underline dark:text-indigo-400">{tx(useRecoveryCode ? C.useApp : C.useRecovery)}</button>
                                </span>
                            </label>
                        ) : null}
                        <button type="submit" disabled={busy || !password || (needsCode && !code.trim())} className={submitClass}>
                            {busy ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
                            {tx(C.submit)}
                        </button>
                        <p className="text-center text-xs tabular-nums text-zinc-500" aria-live="off">{tx(C.remaining, { time: formatRemaining(stepUp.expiresAt - now) })}</p>
                        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-zinc-200 pt-3 text-sm dark:border-zinc-800">
                            <button type="button" onClick={() => setRecovering(true)} className="inline-flex items-center gap-1.5 font-semibold text-zinc-600 hover:text-zinc-900 hover:underline dark:text-zinc-300 dark:hover:text-white">
                                <LifeBuoy className="h-4 w-4" aria-hidden="true" />{tx(C.forgot)}
                            </button>
                            <button type="button" onClick={() => leave()} className="inline-flex items-center gap-1.5 text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200">
                                <LogOut className="h-4 w-4 rtl:rotate-180" aria-hidden="true" />{tx(C.otherAccount)}
                            </button>
                        </div>
                    </form>
                )}
            </div>
        </AuthShell>
    );
}

export default function VerifyPage() {
    return (
        <Suspense fallback={<div className="min-h-dvh bg-background" />}>
            <VerifyForm />
        </Suspense>
    );
}
