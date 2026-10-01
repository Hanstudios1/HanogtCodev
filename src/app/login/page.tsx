"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AlertCircle, ArrowLeft, Eye, EyeOff, KeyRound, LoaderCircle, Lock, Mail, ShieldCheck } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import AuthShell, { Divider, GoogleButton, inputClass } from "@/components/auth/AuthShell";
import { useRawSession } from "@/components/Provider";
import { AUTH_NETWORK_ERROR, completeSignIn, consumeAuthErrorDetail, handoffPath, safeCallbackPath, signInWithPassword, startGoogleSignIn } from "@/lib/auth-client";

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
            case "AccountSuspended":
                return t("auth_error_suspended") || "Bu hesap askıya alınmış. Geri Bildirim sayfasından itiraz edebilirsiniz.";
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
    // Store the code, not the text, so the message follows language changes.
    const [errorCode, setErrorCode] = useState<string | null>(() => {
        const code = searchParams.get("error");
        // NextAuth's bare error route forwards a missing code as the literal "undefined".
        return code === "undefined" || code === "null" ? "Default" : code;
    });
    const error = describeError(errorCode);
    // Server-side reason for this browser's last failed sign-in (e.g. why Google's callback failed).
    const [errorDetail, setErrorDetail] = useState<string | null>(null);

    useEffect(() => {
        const timer = window.setTimeout(() => setErrorDetail(consumeAuthErrorDetail()), 0);
        return () => window.clearTimeout(timer);
    }, []);

    const handleCredentialsLogin = async (event: React.FormEvent) => {
        event.preventDefault();
        setLoading(true);
        setErrorCode(null);
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
            setErrorCode(code);
            if (code === "TwoFactorInvalid") setOtp("");
            setLoading(false);
            return;
        }
        // Keep the button busy until the full page load replaces this screen.
        completeSignIn(destination());
    };

    const handleGoogleLogin = useCallback(async (canonicalHop = false) => {
        setGoogleLoading(true);
        setErrorCode(null);
        setErrorDetail(null);
        const code = await startGoogleSignIn(destination(), { canonicalHop });
        if (code) {
            setErrorDetail(consumeAuthErrorDetail());
            setErrorCode(code);
            setGoogleLoading(false);
        }
    }, [destination]);

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
            subtitle={t("welcome_back") || "Hanogt Codev'e Hoşgeldiniz"}
            footer={<>{t("no_account") || "Hesabın yok mu?"} <Link href={`/signup${callbackPath !== "/dashboard" ? `?callbackUrl=${encodeURIComponent(callbackPath)}` : ""}`} className="font-semibold text-indigo-600 hover:underline dark:text-indigo-400">{t("signup_now") || "Hemen Üye Ol"}</Link></>}
        >
            <GoogleButton label={t("login_google") || "Google ile Oturum Aç"} onClick={() => void handleGoogleLogin()} disabled={googleLoading} />
            <Divider label={t("or") || "veya"} />

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

            {otpStep ? (
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
                        <button type="button" onClick={() => { setUseRecoveryCode((value) => !value); setOtp(""); setErrorCode(null); }} className="font-semibold text-indigo-600 hover:underline dark:text-indigo-400">
                            {useRecoveryCode ? tx({ TR: "Doğrulama uygulamasını kullan", EN: "Use the authenticator app" }) : tx({ TR: "Telefonuma erişemiyorum: kurtarma kodu kullan", EN: "Can't reach my phone: use a recovery code" })}
                        </button>
                        <button type="button" onClick={() => { setOtpStep(false); setOtp(""); setPassword(""); setUseRecoveryCode(false); setErrorCode(null); }} className="inline-flex items-center gap-1 text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200">
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
