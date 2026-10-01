"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertCircle, Check, CheckCircle2, Eye, EyeOff, LoaderCircle, Lock, Mail, User } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { AUTH_NETWORK_ERROR, completeSignIn, safeCallbackPath, signInWithPassword, startGoogleSignIn } from "@/lib/auth-client";
import AuthShell, { Divider, GoogleButton, inputClass } from "@/components/auth/AuthShell";
import { useRawSession } from "@/components/Provider";

function passwordStrength(password: string) {
    let score = 0;
    if (password.length >= 10) score += 1;
    if (password.length >= 14) score += 1;
    if (/[a-zçğıöşü]/.test(password) && /[A-ZÇĞİÖŞÜ]/.test(password)) score += 1;
    if (/\d/.test(password)) score += 1;
    if (/[^\p{L}\p{N}]/u.test(password)) score += 1;
    return Math.min(4, score);
}

function SignupForm() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { t, tx } = useI18n();
    const callbackPath = safeCallbackPath(searchParams.get("callbackUrl") || searchParams.get("next"));
    const [loading, setLoading] = useState(false);
    const [googleLoading, setGoogleLoading] = useState(false);
    const [email, setEmail] = useState("");
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");

    // Already signed in: there is nothing to sign up for.
    const auth = useRawSession();
    const continued = useRef(false);
    useEffect(() => {
        if (auth.status !== "authenticated" || continued.current) return;
        continued.current = true;
        completeSignIn(callbackPath);
    }, [auth.status, callbackPath]);

    const rules = useMemo(() => [
        { ok: password.length >= 10, label: t("auth_rule_length") || "En az 10 karakter" },
        { ok: /[a-zA-ZçğıöşüÇĞİÖŞÜ]/.test(password), label: t("auth_rule_letter") || "En az bir harf" },
        { ok: /\d/.test(password), label: t("auth_rule_digit") || "En az bir rakam" },
    ], [password, t]);
    const strength = passwordStrength(password);
    const strengthLabel = [
        t("auth_strength_weak") || "Zayıf",
        t("auth_strength_weak") || "Zayıf",
        t("auth_strength_medium") || "Orta",
        t("auth_strength_good") || "İyi",
        t("auth_strength_strong") || "Güçlü",
    ][strength];
    const strengthColor = ["bg-red-500", "bg-red-500", "bg-amber-500", "bg-lime-500", "bg-emerald-500"][strength];
    const rulesPassed = rules.every((rule) => rule.ok);
    const mismatch = confirmPassword.length > 0 && confirmPassword !== password;

    const handleSignup = async (event: React.FormEvent) => {
        event.preventDefault();
        setError("");
        setSuccess("");
        if (password !== confirmPassword) {
            setError(t("passwords_not_match") || "Şifreler eşleşmiyor!");
            return;
        }
        if (!rulesPassed) {
            setError(t("password_too_short") || "Şifre en az 10 karakter, bir harf ve bir rakam içermelidir.");
            return;
        }
        setLoading(true);
        try {
            const response = await fetch("/api/auth/signup", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email: email.trim(), password, username: username.trim() }),
            });
            const data = await response.json().catch(() => ({})) as { error?: string; code?: string };
            if (!response.ok) {
                setError(data.code === "reserved_email"
                    ? tx({ TR: "Bu e-posta adresiyle şifreli hesap oluşturulamaz. Lütfen Google ile giriş yapın.", EN: "An account with a password can't be created for this e-mail address. Please sign in with Google." })
                    : data.error || t("signup_error") || "Hesap oluşturulamadı. Lütfen yeniden deneyin.");
                return;
            }
            setSuccess(t("signup_success") || "Hesap oluşturuldu! Giriş yapılıyor...");
            const loginError = await signInWithPassword(email.trim(), password, callbackPath);
            if (loginError) {
                // The account exists; let the login screen explain what went wrong.
                router.push(`/login?callbackUrl=${encodeURIComponent(callbackPath)}&error=${encodeURIComponent(loginError)}`);
                return;
            }
            completeSignIn(callbackPath);
        } catch {
            setError(t("signup_error") || "Hesap oluşturulamadı. Lütfen yeniden deneyin.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <AuthShell
            title={t("signup") || "Kayıt Ol"}
            subtitle={t("auth_signup_subtitle")}
            footer={<>{t("already_have_account") || "Zaten hesabın var mı?"} <Link href={`/login${callbackPath !== "/dashboard" ? `?callbackUrl=${encodeURIComponent(callbackPath)}` : ""}`} className="font-semibold text-indigo-600 hover:underline dark:text-indigo-400">{t("login") || "Giriş Yap"}</Link></>}
        >
            <GoogleButton label={t("signup_google") || "Google ile Üye Ol"} onClick={() => {
                setGoogleLoading(true);
                setError("");
                void startGoogleSignIn(callbackPath).then((code) => {
                    if (!code) return;
                    setError(code === AUTH_NETWORK_ERROR ? t("auth_error_network") : (t("auth_error_oauth") || "Google ile giriş tamamlanamadı. Lütfen tekrar deneyin."));
                    setGoogleLoading(false);
                });
            }} disabled={googleLoading} />
            <Divider label={t("or") || "veya"} />

            {error && <div role="alert" className="mb-5 flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-3.5 text-sm leading-5 text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><span>{error}</span></div>}
            {success && <div role="status" className="mb-5 flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-3.5 text-sm leading-5 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /><span>{success}</span></div>}

            <form onSubmit={handleSignup} className="space-y-4">
                <label className="block">
                    <span className="mb-1.5 block text-sm font-semibold">{t("email") || "E-posta"}</span>
                    <span className="relative block"><Mail className="pointer-events-none absolute start-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-zinc-400" /><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="email" inputMode="email" maxLength={254} className={inputClass} placeholder={tx({ TR: "ornek@eposta.com", EN: "you@example.com" })} /></span>
                </label>
                <label className="block">
                    <span className="mb-1.5 block text-sm font-semibold">{t("username") || "Kullanıcı Adı"}</span>
                    <span className="relative block"><User className="pointer-events-none absolute start-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-zinc-400" /><input type="text" value={username} onChange={(event) => setUsername(event.target.value)} required autoComplete="username" maxLength={40} className={inputClass} placeholder={tx({ TR: "kullaniciadi", EN: "username" })} /></span>
                </label>
                <label className="block">
                    <span className="mb-1.5 block text-sm font-semibold">{t("password") || "Şifre"}</span>
                    <span className="relative block">
                        <Lock className="pointer-events-none absolute start-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-zinc-400" />
                        <input type={showPassword ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} required minLength={10} maxLength={128} autoComplete="new-password" className={`${inputClass} pe-12`} placeholder="••••••••••" />
                        <button type="button" onClick={() => setShowPassword((value) => !value)} className="absolute end-2 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-xl text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200" aria-label={showPassword ? (t("auth_hide_password") || "Şifreyi gizle") : (t("auth_show_password") || "Şifreyi göster")}>{showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
                    </span>
                </label>
                {password && (
                    <div className="rounded-2xl border border-zinc-200 p-3 dark:border-zinc-800">
                        <div className="flex items-center gap-3">
                            <div className="flex flex-1 gap-1">{[1, 2, 3, 4].map((step) => <span key={step} className={`h-1.5 flex-1 rounded-full transition ${strength >= step ? strengthColor : "bg-zinc-200 dark:bg-zinc-800"}`} />)}</div>
                            <span className="text-xs font-semibold text-zinc-500">{strengthLabel}</span>
                        </div>
                        <ul className="mt-3 grid gap-1.5 sm:grid-cols-3">
                            {rules.map((rule) => <li key={rule.label} className={`flex items-center gap-1.5 text-xs ${rule.ok ? "text-emerald-600 dark:text-emerald-400" : "text-zinc-400"}`}><Check className="h-3.5 w-3.5" />{rule.label}</li>)}
                        </ul>
                    </div>
                )}
                <label className="block">
                    <span className="mb-1.5 block text-sm font-semibold">{t("confirm_password") || "Şifreyi Doğrula"}</span>
                    <span className="relative block"><Lock className="pointer-events-none absolute start-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-zinc-400" /><input type={showPassword ? "text" : "password"} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required minLength={10} maxLength={128} autoComplete="new-password" aria-invalid={mismatch} className={`${inputClass} ${mismatch ? "border-red-400 focus:border-red-500 focus:ring-red-500/15" : ""}`} placeholder="••••••••••" /></span>
                    {mismatch && <span className="mt-1.5 block text-xs text-red-500">{t("passwords_not_match") || "Şifreler eşleşmiyor!"}</span>}
                </label>
                <button type="submit" disabled={loading} className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 text-sm font-bold text-white shadow-lg shadow-emerald-500/25 transition hover:brightness-110 disabled:opacity-60">
                    {loading && <LoaderCircle className="h-4 w-4 animate-spin" />}
                    {loading ? (t("creating_account") || "Hesap Oluşturuluyor...") : (t("signup") || "Kayıt Ol")}
                </button>
            </form>
            <p className="mt-6 text-center text-xs leading-5 text-zinc-400">
                {t("auth_terms_notice") || "Devam ederek Kullanım Şartları ve Gizlilik Politikası'nı kabul etmiş olursunuz."}{" "}
                <Link href="/terms-of-use" className="underline hover:text-zinc-600 dark:hover:text-zinc-200">{t("terms_of_use") || "Kullanım Şartları"}</Link> · <Link href="/privacy-policy" className="underline hover:text-zinc-600 dark:hover:text-zinc-200">{t("privacy_policy") || "Gizlilik Politikası"}</Link>
            </p>
        </AuthShell>
    );
}

export default function SignupPage() {
    return (
        <Suspense fallback={<div className="min-h-dvh bg-background" />}>
            <SignupForm />
        </Suspense>
    );
}
