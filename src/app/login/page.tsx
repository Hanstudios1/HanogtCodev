"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useId, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AlertCircle, ArrowLeft, Ban, CheckCircle2, Eye, EyeOff, KeyRound, LoaderCircle, Lock, Mail, Send, ShieldCheck } from "lucide-react";
import { useI18n, type Copy } from "@/lib/i18n";
import AuthShell, { Divider, GoogleButton, inputClass } from "@/components/auth/AuthShell";
import { useRawSession } from "@/components/Provider";
import {
    ACCOUNT_SUSPENDED,
    APPEAL_LIMITS,
    AUTH_NETWORK_ERROR,
    completeSignIn,
    consumeAuthErrorDetail,
    handoffPath,
    normalizeAppealMessage,
    readAuthError,
    safeCallbackPath,
    signInWithPassword,
    startGoogleSignIn,
    submitSuspensionAppeal,
    type AppealFailure,
} from "@/lib/auth-client";

const SUSPENDED_COPY = {
    title: { TR: "Hesabınız askıya alındı", EN: "Your account is suspended" },
    body: {
        TR: "Bu hesapla şu anda giriş yapılamıyor. Kararın hatalı olduğunu düşünüyorsanız ekibe itiraz edebilirsiniz; her itirazı bir ekip üyesi inceler.",
        EN: "You can't sign in with this account right now. If you think the decision is wrong, you can appeal to the team; a staff member reviews every appeal.",
    },
    verify: {
        TR: "İtiraz formunu açmak için önce hesabın size ait olduğunu doğrulayın: aşağıdan şifrenizle ya da Google ile yeniden giriş yapmayı deneyin. Bilgileriniz doğruysa itiraz formu burada açılır.",
        EN: "To open the appeal form, first confirm that the account is yours: sign in again below with your password or with Google. If your details are correct, the appeal form opens here.",
    },
    expired: {
        TR: "Doğrulamanın süresi doldu. İtirazınızı göndermek için aşağıdan yeniden giriş yapın.",
        EN: "Your verification has expired. Sign in again below to send your appeal.",
    },
    label: { TR: "İtirazınız", EN: "Your appeal" },
    placeholder: {
        TR: "Kararın neden hatalı olduğunu düşündüğünüzü ve ekibin bilmesi gerekenleri yazın…",
        EN: "Explain why you think the decision is wrong and anything else the team should know…",
    },
    hint: {
        TR: "En az {min} karakter. Şifre gibi gizli bilgiler eklemeyin. Güvenliğiniz için bu form 30 dakika açık kalır.",
        EN: "At least {min} characters. Don't include secrets such as passwords. For your security, this form stays open for 30 minutes.",
    },
    submit: { TR: "İtirazı gönder", EN: "Send appeal" },
    sent: {
        TR: "İtirazınız alındı. Ekip inceledikten sonra hesabınız yeniden açılırsa, giriş yapıp yanıtı Geri Bildirim sayfasındaki “Taleplerim” bölümünde görebilirsiniz.",
        EN: "Your appeal was received. If your account is reinstated after the review, sign in to find the team's reply under “My tickets” on the Feedback page.",
    },
    otherAccount: { TR: "Başka bir hesapla giriş yap", EN: "Sign in with another account" },
    backToLogin: { TR: "Giriş ekranına dön", EN: "Back to sign-in" },
} satisfies Record<string, Copy>;

const APPEAL_ERROR_COPY: Record<AppealFailure["code"], Copy> = {
    invalid_token: SUSPENDED_COPY.expired,
    bad_origin: { TR: "İtiraz güvenlik denetiminden geçemedi. Lütfen tekrar deneyin.", EN: "The appeal failed a security check. Please try again." },
    rate_limited: { TR: "Kısa sürede çok fazla itiraz denemesi yapıldı. Lütfen daha sonra tekrar deneyin.", EN: "Too many appeal attempts in a short time. Please try again later." },
    invalid_body: { TR: "İtiraz okunamadı. Lütfen tekrar deneyin.", EN: "The appeal couldn't be read. Please try again." },
    message_required: { TR: "İtirazınızı yazın.", EN: "Write your appeal." },
    message_too_short: { TR: "İtiraz en az {min} karakter olmalı.", EN: "The appeal needs at least {min} characters.", vars: { min: APPEAL_LIMITS.messageMin } },
    message_too_long: { TR: "İtiraz en fazla {max} karakter olabilir.", EN: "The appeal can have at most {max} characters.", vars: { max: APPEAL_LIMITS.message } },
    unavailable: { TR: "Hizmete şu anda ulaşılamıyor. Biraz sonra tekrar deneyin.", EN: "The service is unavailable right now. Please try again shortly." },
    [AUTH_NETWORK_ERROR]: { TR: "Sunucuya bağlanılamadı. İnternet bağlantınızı kontrol edip tekrar deneyin.", EN: "Couldn't reach the server. Check your internet connection and try again." },
    unknown: { TR: "İtiraz gönderilemedi. Lütfen tekrar deneyin.", EN: "The appeal couldn't be sent. Please try again." },
};

const textareaClass = "block w-full resize-y rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm leading-6 text-zinc-900 shadow-sm outline-none transition placeholder:text-zinc-400 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/15 dark:border-zinc-800 dark:bg-zinc-900 dark:text-white";

function useAuthErrorMessage() {
    const { t, tx } = useI18n();
    return (code: string | null) => {
        if (!code) return "";
        if (code.startsWith("RateLimited:")) {
            return t("auth_error_rate_limited").replace("{minutes}", code.slice("RateLimited:".length) || "15");
        }
        switch (code) {
            case AUTH_NETWORK_ERROR:
                return t("auth_error_network");
            case "CredentialsSignin":
                return t("auth_error_credentials") || "E-posta veya şifre hatalı. Google ile kayıt olduysanız “Google ile devam et” seçeneğini kullanın.";
            case "OAuthSignin":
            case "OAuthCallback":
            case "HandoffFailed":
            case "OAuthCreateAccount":
            case "Callback":
                return t("auth_error_oauth") || "Google ile giriş tamamlanamadı. Lütfen tekrar deneyin.";
            case "OAuthAccountNotLinked":
                return t("auth_error_not_linked") || "Bu e-posta başka bir giriş yöntemiyle kayıtlı. O yöntemle giriş yapın.";
            case "AccessDenied":
                return t("auth_error_denied") || "Giriş izni verilmedi.";
            case "TwoFactorRequired":
                return tx({ TR: "Bu hesapta iki adımlı doğrulama açık. Doğrulama uygulamanızdaki kodu girin.", EN: "This account uses two-step verification. Enter the code from your authenticator app." });
            case "TwoFactorInvalid":
                return tx({ TR: "Doğrulama kodu hatalı, süresi dolmuş ya da zaten kullanılmış. Uygulamadaki güncel kodu girin.", EN: "The verification code is wrong, expired or already used. Enter the current code from your app." });
            case ACCOUNT_SUSPENDED:
                return tx(SUSPENDED_COPY.title);
            case "ServiceUnavailable":
            case "Configuration":
                return t("auth_error_config") || "Giriş hizmeti şu anda yapılandırılmamış. Lütfen daha sonra tekrar deneyin.";
            case "SessionRequired":
                return t("auth_error_session") || "Bu sayfayı görmek için giriş yapın.";
            default:
                // Messages thrown by our own authorize() (rate limits, outages) are sentences and
                // arrive verbatim; unknown NextAuth codes ("Default", "undefined"…) get the generic text.
                return /\s/.test(code) && code.length <= 220 ? code : (t("auth_error_generic") || "Giriş sırasında bir sorun oluştu. Lütfen tekrar deneyin.");
        }
    };
}

/**
 * A suspended account: the explanation, and the appeal form once a sign-in
 * proved ownership (`token`). Without a token, how to verify first. The draft
 * lives in LoginForm, so it survives signing in again with the password after
 * the token expired.
 */
function SuspendedAccount({ token, expired, message, onMessageChange, onExpired, onClose }: {
    token: string | null;
    expired: boolean;
    message: string;
    onMessageChange: (value: string) => void;
    onExpired: () => void;
    onClose: () => void;
}) {
    const { tx } = useI18n();
    const uid = useId();
    const [sending, setSending] = useState(false);
    const [sent, setSent] = useState(false);
    const [failure, setFailure] = useState<AppealFailure | null>(null);
    const length = normalizeAppealMessage(message).length;
    const tooLong = length > APPEAL_LIMITS.message;
    const ready = length >= APPEAL_LIMITS.messageMin && !tooLong;

    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!token || !ready || sending) return;
        setSending(true);
        setFailure(null);
        const result = await submitSuspensionAppeal(token, message);
        setSending(false);
        if (result.ok) {
            setSent(true);
            onMessageChange("");
        } else if (result.code === "invalid_token") {
            onExpired();
        } else {
            setFailure(result);
        }
    };

    return (
        <section aria-labelledby={`${uid}-title`} className="mb-6 space-y-4">
            <div role="alert" className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-3.5 text-sm leading-5 text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">
                <Ban className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
                <span>
                    <strong id={`${uid}-title`} className="block">{tx(SUSPENDED_COPY.title)}</strong>
                    {tx(SUSPENDED_COPY.body)}
                </span>
            </div>

            {sent ? (
                <div role="status" className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-3.5 text-sm leading-5 text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200">
                    <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
                    <span>{tx(SUSPENDED_COPY.sent)}</span>
                </div>
            ) : token ? (
                <form onSubmit={submit} className="space-y-3">
                    <div className="flex items-center justify-between gap-3">
                        <label htmlFor={`${uid}-message`} className="text-sm font-semibold">{tx(SUSPENDED_COPY.label)}</label>
                        <span
                            className={`shrink-0 text-xs tabular-nums ${tooLong ? "font-bold text-red-600 dark:text-red-400" : ready ? "text-emerald-600 dark:text-emerald-400" : "text-zinc-500"}`}
                            dir="ltr"
                        >
                            {length}/{APPEAL_LIMITS.message}
                        </span>
                    </div>
                    <textarea
                        id={`${uid}-message`}
                        value={message}
                        onChange={(event) => { onMessageChange(event.target.value); if (failure) setFailure(null); }}
                        rows={6}
                        required
                        maxLength={APPEAL_LIMITS.message + 500}
                        dir="auto"
                        aria-invalid={tooLong || undefined}
                        aria-describedby={`${uid}-hint`}
                        placeholder={tx(SUSPENDED_COPY.placeholder)}
                        className={textareaClass}
                    />
                    <p id={`${uid}-hint`} className="text-xs leading-5 text-zinc-500 dark:text-zinc-400">{tx(SUSPENDED_COPY.hint, { min: APPEAL_LIMITS.messageMin })}</p>
                    {failure ? (
                        <p role="alert" className="flex items-start gap-2 text-sm font-medium text-red-600 dark:text-red-400">
                            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                            {tx(APPEAL_ERROR_COPY[failure.code])}
                        </p>
                    ) : null}
                    <button type="submit" disabled={!ready || sending} aria-busy={sending || undefined} className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-indigo-600 to-violet-600 text-sm font-bold text-white shadow-lg shadow-indigo-500/25 transition hover:brightness-110 disabled:opacity-60">
                        {sending ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Send className="h-4 w-4" aria-hidden="true" />}
                        {tx(SUSPENDED_COPY.submit)}
                    </button>
                </form>
            ) : (
                <div className="flex items-start gap-3 rounded-2xl border border-indigo-200 bg-indigo-50 p-3.5 text-sm leading-5 text-indigo-900 dark:border-indigo-900/60 dark:bg-indigo-950/30 dark:text-indigo-200">
                    <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
                    <span>{tx(expired ? SUSPENDED_COPY.expired : SUSPENDED_COPY.verify)}</span>
                </div>
            )}

            {token ? (
                <button type="button" onClick={onClose} className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200">
                    <ArrowLeft className="h-4 w-4 rtl:rotate-180" aria-hidden="true" /> {tx(sent ? SUSPENDED_COPY.backToLogin : SUSPENDED_COPY.otherAccount)}
                </button>
            ) : null}
        </section>
    );
}

function LoginForm() {
    const searchParams = useSearchParams();
    const { t, tx } = useI18n();
    const describeError = useAuthErrorMessage();
    const callbackPath = safeCallbackPath(searchParams.get("callbackUrl") || searchParams.get("next"));
    const auth = useRawSession();
    const hasErrorParam = Boolean(searchParams.get("error"));
    // During a sign-in moved here from another of our sites, finish by handing
    // the session back to that site instead of staying on this host.
    const destination = useCallback(
        () => handoffPath(searchParams.get("handoff"), searchParams.get("nonce"), callbackPath) ?? callbackPath,
        [callbackPath, searchParams],
    );
    const [loading, setLoading] = useState(false);
    const [googleLoading, setGoogleLoading] = useState(false);
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    // Second step for accounts with two-step verification.
    const [otpStep, setOtpStep] = useState(false);
    const [otp, setOtp] = useState("");
    const [useRecoveryCode, setUseRecoveryCode] = useState(false);
    // Store the code, not the text, so the message follows language changes. A suspended
    // account's code may carry an appeal token, which is kept apart and never displayed.
    const [initialError] = useState(() => {
        const code = searchParams.get("error");
        // NextAuth's bare error route forwards a missing code as the literal "undefined".
        return readAuthError(code === "undefined" || code === "null" ? "Default" : code, searchParams.get("appeal"));
    });
    const [errorCode, setErrorCode] = useState<string | null>(initialError.code);
    const [appealToken, setAppealToken] = useState<string | null>(initialError.appealToken);
    const [appealExpired, setAppealExpired] = useState(false);
    const [appealMessage, setAppealMessage] = useState("");
    const suspended = errorCode === ACCOUNT_SUSPENDED;
    // A verified suspended account sees the appeal form instead of the sign-in options.
    const appealOpen = suspended && Boolean(appealToken);
    const error = suspended ? "" : describeError(errorCode);
    // Server-side reason for this browser's last failed sign-in (e.g. why Google's callback failed).
    const [errorDetail, setErrorDetail] = useState<string | null>(null);

    const showError = useCallback((code: string | null) => {
        const parsed = readAuthError(code);
        setErrorCode(parsed.code);
        setAppealToken(parsed.appealToken);
        setAppealExpired(false);
    }, []);

    useEffect(() => {
        const timer = window.setTimeout(() => setErrorDetail(consumeAuthErrorDetail()), 0);
        return () => window.clearTimeout(timer);
    }, []);

    // After Google the appeal token sits in the address bar; keep it out of the
    // history and of copied links (it is already in state).
    useEffect(() => {
        const url = new URL(window.location.href);
        const code = url.searchParams.get("error");
        const tokenInCode = Boolean(code?.startsWith(`${ACCOUNT_SUSPENDED}:`));
        if (!tokenInCode && !url.searchParams.has("appeal")) return;
        url.searchParams.delete("appeal");
        if (tokenInCode) url.searchParams.set("error", ACCOUNT_SUSPENDED);
        window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
    }, []);

    const handleCredentialsLogin = async (event: React.FormEvent) => {
        event.preventDefault();
        setLoading(true);
        showError(null);
        setErrorDetail(null);
        const code = await signInWithPassword(email.trim(), password, callbackPath, otpStep ? otp.trim() : undefined);
        if (code === "TwoFactorRequired" && !otpStep) {
            // Password accepted: ask for the authenticator code instead of showing an error.
            consumeAuthErrorDetail();
            setOtpStep(true);
            setLoading(false);
            return;
        }
        if (code) {
            setErrorDetail(consumeAuthErrorDetail());
            showError(code);
            if (code === "TwoFactorInvalid") setOtp("");
            if (readAuthError(code).code === ACCOUNT_SUSPENDED) {
                // The password (and second factor) proved ownership: leave the sign-in steps for the appeal.
                setOtpStep(false);
                setOtp("");
                setUseRecoveryCode(false);
                setPassword("");
            }
            setLoading(false);
            return;
        }
        // Keep the button busy until the full page load replaces this screen.
        completeSignIn(destination());
    };

    const handleGoogleLogin = useCallback(async (canonicalHop = false) => {
        setGoogleLoading(true);
        showError(null);
        setErrorDetail(null);
        const code = await startGoogleSignIn(destination(), { canonicalHop });
        if (code) {
            setErrorDetail(consumeAuthErrorDetail());
            showError(code);
            setGoogleLoading(false);
        }
    }, [destination, showError]);

    // Someone who is already signed in continues straight to where they were going.
    const continued = useRef(false);
    useEffect(() => {
        if (auth.status !== "authenticated" || hasErrorParam || continued.current) return;
        continued.current = true;
        completeSignIn(destination());
    }, [auth.status, destination, hasErrorParam]);

    // `/login?provider=google` continues a Google sign-in that was moved to the
    // host Google returns to (see startGoogleSignIn).
    const autoGoogle = searchParams.get("provider") === "google" && !searchParams.get("error");
    const autoStarted = useRef(false);
    useEffect(() => {
        if (!autoGoogle || auth.status !== "unauthenticated") return;
        const timer = window.setTimeout(() => {
            if (autoStarted.current) return;
            autoStarted.current = true;
            void handleGoogleLogin(true);
        }, 0);
        return () => window.clearTimeout(timer);
    }, [autoGoogle, auth.status, handleGoogleLogin]);

    return (
        <AuthShell
            title={t("login") || "Giriş Yap"}
            subtitle={t("auth_login_subtitle")}
            footer={<>{t("no_account") || "Hesabın yok mu?"} <Link href={`/signup${callbackPath !== "/dashboard" ? `?callbackUrl=${encodeURIComponent(callbackPath)}` : ""}`} className="font-semibold text-indigo-600 hover:underline dark:text-indigo-400">{t("signup_now") || "Hemen Üye Ol"}</Link></>}
        >
            {suspended ? (
                <SuspendedAccount
                    // A new token (or none) starts a fresh form; the draft is kept here.
                    key={appealToken ?? "verify"}
                    token={appealToken}
                    expired={appealExpired}
                    message={appealMessage}
                    onMessageChange={setAppealMessage}
                    onExpired={() => { setAppealToken(null); setAppealExpired(true); }}
                    onClose={() => { showError(null); setAppealMessage(""); }}
                />
            ) : null}

            {appealOpen ? null : (
                <>
                    <GoogleButton label={t("login_google") || "Google ile Oturum Aç"} onClick={() => void handleGoogleLogin()} disabled={googleLoading} />
                    <Divider label={t("or") || "veya"} />
                </>
            )}

            {error && (
                <div role="alert" className="mb-5 flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-3.5 text-sm leading-5 text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>
                        {error}
                        {/* The raw code makes support reports precise ("Network", "OAuthCallback"…). */}
                        {errorCode && !/\s/.test(errorCode) ? <span className="mt-1 block font-mono text-[11px] opacity-70">{errorCode}</span> : null}
                        {errorDetail ? <span className="mt-0.5 block break-words font-mono text-[11px] opacity-70" dir="ltr">{errorDetail}</span> : null}
                    </span>
                </div>
            )}

            {appealOpen ? null : otpStep ? (
                <form onSubmit={handleCredentialsLogin} className="space-y-4">
                    <div className="flex items-start gap-3 rounded-2xl border border-indigo-200 bg-indigo-50 p-3.5 text-sm leading-5 text-indigo-900 dark:border-indigo-900/60 dark:bg-indigo-950/30 dark:text-indigo-200">
                        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" />
                        <span>
                            <strong className="block">{tx({ TR: "İki adımlı doğrulama", EN: "Two-step verification" })}</strong>
                            {useRecoveryCode
                                ? tx({ TR: "Hesabınızı kurarken kaydettiğiniz kurtarma kodlarından birini girin. Her kod yalnızca bir kez kullanılabilir.", EN: "Enter one of the recovery codes you saved during setup. Each code works only once." })
                                : tx({ TR: "Doğrulama uygulamanızdaki (Google Authenticator, Microsoft Authenticator, 1Password…) 6 haneli kodu girin.", EN: "Enter the 6-digit code from your authenticator app (Google Authenticator, Microsoft Authenticator, 1Password…)." })}
                        </span>
                    </div>
                    <label className="block">
                        <span className="mb-1.5 block text-sm font-semibold">{useRecoveryCode ? tx({ TR: "Kurtarma kodu", EN: "Recovery code" }) : tx({ TR: "Doğrulama kodu", EN: "Verification code" })}</span>
                        <span className="relative block">
                            <KeyRound className="pointer-events-none absolute start-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-zinc-400" />
                            <input
                                key={useRecoveryCode ? "recovery" : "totp"}
                                value={otp}
                                onChange={(event) => setOtp(useRecoveryCode ? event.target.value.toUpperCase().slice(0, 20) : event.target.value.replace(/[^\d]/g, "").slice(0, 6))}
                                required
                                autoFocus
                                dir="ltr"
                                autoComplete="one-time-code"
                                inputMode={useRecoveryCode ? "text" : "numeric"}
                                pattern={useRecoveryCode ? undefined : "\\d{6}"}
                                className={`${inputClass} font-mono text-base tracking-[0.3em]`}
                                placeholder={useRecoveryCode ? "XXXX-XXXX-XXXX" : "000000"}
                                aria-describedby="otp-help"
                            />
                        </span>
                    </label>
                    <button type="submit" disabled={loading || (!useRecoveryCode && otp.length !== 6) || (useRecoveryCode && otp.replace(/[^A-Z0-9]/g, "").length !== 12)} className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-indigo-600 to-violet-600 text-sm font-bold text-white shadow-lg shadow-indigo-500/25 transition hover:brightness-110 disabled:opacity-60">
                        {loading && <LoaderCircle className="h-4 w-4 animate-spin" />}
                        {tx({ TR: "Doğrula ve giriş yap", EN: "Verify and sign in" })}
                    </button>
                    <div id="otp-help" className="flex flex-wrap items-center justify-between gap-2 text-sm">
                        <button type="button" onClick={() => { setUseRecoveryCode((value) => !value); setOtp(""); showError(null); }} className="font-semibold text-indigo-600 hover:underline dark:text-indigo-400">
                            {useRecoveryCode ? tx({ TR: "Doğrulama uygulamasını kullan", EN: "Use the authenticator app" }) : tx({ TR: "Telefonuma erişemiyorum: kurtarma kodu kullan", EN: "Can't reach my phone: use a recovery code" })}
                        </button>
                        <button type="button" onClick={() => { setOtpStep(false); setOtp(""); setPassword(""); setUseRecoveryCode(false); showError(null); }} className="inline-flex items-center gap-1 text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200">
                            <ArrowLeft className="h-4 w-4 rtl:rotate-180" /> {tx({ TR: "Geri", EN: "Back" })}
                        </button>
                    </div>
                </form>
            ) : (
            <form onSubmit={handleCredentialsLogin} className="space-y-4" noValidate={false}>
                <label className="block">
                    <span className="mb-1.5 block text-sm font-semibold">{t("email") || "E-posta"}</span>
                    <span className="relative block">
                        <Mail className="pointer-events-none absolute start-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-zinc-400" />
                        <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="email" inputMode="email" className={inputClass} placeholder={tx({ TR: "ornek@eposta.com", EN: "you@example.com" })} />
                    </span>
                </label>
                <label className="block">
                    <span className="mb-1.5 block text-sm font-semibold">{t("password") || "Şifre"}</span>
                    <span className="relative block">
                        <Lock className="pointer-events-none absolute start-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-zinc-400" />
                        <input type={showPassword ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} required autoComplete="current-password" className={`${inputClass} pe-12`} placeholder="••••••••••" />
                        <button type="button" onClick={() => setShowPassword((value) => !value)} className="absolute end-2 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-xl text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200" aria-label={showPassword ? (t("auth_hide_password") || "Şifreyi gizle") : (t("auth_show_password") || "Şifreyi göster")}>
                            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                    </span>
                </label>
                <button type="submit" disabled={loading} className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-indigo-600 to-violet-600 text-sm font-bold text-white shadow-lg shadow-indigo-500/25 transition hover:brightness-110 disabled:opacity-60">
                    {loading && <LoaderCircle className="h-4 w-4 animate-spin" />}
                    {loading ? (t("logging_in") || "Giriş Yapılıyor...") : (t("login") || "Giriş Yap")}
                </button>
            </form>
            )}
            <p className="mt-6 text-center text-xs leading-5 text-zinc-400">
                {t("auth_terms_notice") || "Devam ederek Kullanım Şartları ve Gizlilik Politikası'nı kabul etmiş olursunuz."}{" "}
                <Link href="/terms-of-use" className="underline hover:text-zinc-600 dark:hover:text-zinc-200">{t("terms_of_use") || "Kullanım Şartları"}</Link> · <Link href="/privacy-policy" className="underline hover:text-zinc-600 dark:hover:text-zinc-200">{t("privacy_policy") || "Gizlilik Politikası"}</Link>
            </p>
        </AuthShell>
    );
}

export default function LoginPage() {
    return (
        <Suspense fallback={<div className="min-h-dvh bg-background" />}>
            <LoginForm />
        </Suspense>
    );
}
