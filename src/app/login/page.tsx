"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AlertCircle, Eye, EyeOff, LoaderCircle, Lock, Mail } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import AuthShell, { Divider, GoogleButton, inputClass } from "@/components/auth/AuthShell";
import { AUTH_NETWORK_ERROR, completeSignIn, consumeAuthErrorDetail, safeCallbackPath, signInWithPassword, startGoogleSignIn } from "@/lib/auth-client";

function useAuthErrorMessage() {
    const { t } = useI18n();
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
            case "OAuthCreateAccount":
            case "Callback":
                return t("auth_error_oauth") || "Google ile giriş tamamlanamadı. Lütfen tekrar deneyin.";
            case "OAuthAccountNotLinked":
                return t("auth_error_not_linked") || "Bu e-posta başka bir giriş yöntemiyle kayıtlı. O yöntemle giriş yapın.";
            case "AccessDenied":
                return t("auth_error_denied") || "Giriş izni verilmedi.";
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
    const [loading, setLoading] = useState(false);
    const [googleLoading, setGoogleLoading] = useState(false);
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
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
        const code = await signInWithPassword(email.trim(), password, callbackPath);
        if (code) {
            setErrorDetail(consumeAuthErrorDetail());
            setErrorCode(code);
            setLoading(false);
            return;
        }
        // Keep the button busy until the full page load replaces this screen.
        completeSignIn(callbackPath);
    };

    const handleGoogleLogin = useCallback(async (canonicalHop = false) => {
        setGoogleLoading(true);
        setErrorCode(null);
        setErrorDetail(null);
        const code = await startGoogleSignIn(callbackPath, { canonicalHop });
        if (code) {
            setErrorDetail(consumeAuthErrorDetail());
            setErrorCode(code);
            setGoogleLoading(false);
        }
    }, [callbackPath]);

    // `/login?provider=google` continues a Google sign-in that was moved to the
    // host Google returns to (see startGoogleSignIn).
    const autoGoogle = searchParams.get("provider") === "google" && !searchParams.get("error");
    const autoStarted = useRef(false);
    useEffect(() => {
        if (!autoGoogle) return;
        const timer = window.setTimeout(() => {
            if (autoStarted.current) return;
            autoStarted.current = true;
            void handleGoogleLogin(true);
        }, 0);
        return () => window.clearTimeout(timer);
    }, [autoGoogle, handleGoogleLogin]);

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
