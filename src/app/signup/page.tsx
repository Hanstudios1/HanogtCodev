"use client";

import OptimizedImage from "@/components/OptimizedImage";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Mail, User, Lock } from "lucide-react";
import { signIn } from "next-auth/react";
import { useI18n } from "@/lib/i18n";

export default function SignupPage() {
    const router = useRouter();
    const { t } = useI18n();
    const [loading, setLoading] = useState(false);
    const [email, setEmail] = useState("");
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");

    const handleSignup = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");
        setSuccess("");

        // Validation
        if (password !== confirmPassword) {
            setError(t("passwords_not_match") || "Şifreler eşleşmiyor!");
            return;
        }

        if (password.length < 10 || !/[a-zA-ZçğıöşüÇĞİÖŞÜ]/.test(password) || !/\d/.test(password)) {
            setError(t("password_too_short") || "Şifre en az 10 karakter, bir harf ve bir rakam içermelidir.");
            return;
        }

        setLoading(true);

        try {
            // Call signup API
            const response = await fetch("/api/auth/signup", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ email, password, username }),
            });

            const data = await response.json();

            if (!response.ok) {
                setError(data.error || "Bir hata oluştu");
                setLoading(false);
                return;
            }

            setSuccess(t("signup_success") || "Hesap oluşturuldu! Giriş yapılıyor...");

            // Auto login after signup
            const loginResult = await signIn("credentials", {
                email,
                password,
                redirect: false,
            });

            if (loginResult?.error) {
                // If auto login fails, redirect to login page
                router.push("/login");
            } else {
                router.push("/dashboard");
            }
        } catch {
            setError(t("signup_error") || "Bir hata oluştu. Lütfen tekrar deneyin.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-black transition-colors px-4">
            <div className="w-full max-w-md bg-white dark:bg-zinc-900 rounded-2xl shadow-xl p-8 border border-zinc-200 dark:border-zinc-800">
                <div className="text-center mb-8">
                    <h1 className="text-2xl font-bold text-zinc-900 dark:text-white">
                        {t("signup") || "Üye Ol"}
                    </h1>
                    <p className="text-zinc-500 dark:text-zinc-400 mt-2">
                        {t("create_free_account") || "Hemen ücretsiz hesabını oluştur"}
                    </p>
                </div>

                {/* Google Signup */}
                <button
                    onClick={() => signIn("google", { callbackUrl: "/dashboard" })}
                    className="w-full h-12 flex items-center justify-center gap-3 bg-white dark:bg-zinc-800 hover:bg-gray-50 dark:hover:bg-zinc-700 border border-zinc-300 dark:border-zinc-600 rounded-xl transition-all text-zinc-900 dark:text-white font-medium mb-4"
                >
                    <OptimizedImage src="/google-logo.png" alt="Google" className="w-5 h-5" />
                    {t("signup_google") || "Google ile Üye Ol"}
                </button>

                <div className="relative flex py-5 items-center">
                    <div className="flex-grow border-t border-zinc-300 dark:border-zinc-700"></div>
                    <span className="flex-shrink mx-4 text-zinc-400 text-sm">{t("or") || "veya"}</span>
                    <div className="flex-grow border-t border-zinc-300 dark:border-zinc-700"></div>
                </div>

                {/* Error/Success Messages */}
                {error && (
                    <div className="mb-4 p-3 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-xl text-sm text-center">
                        {error}
                    </div>
                )}
                {success && (
                    <div className="mb-4 p-3 bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 rounded-xl text-sm text-center">
                        {success}
                    </div>
                )}

                {/* Email/Password Signup Form */}
                <form onSubmit={handleSignup} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                            {t("email") || "E-posta"}
                        </label>
                        <div className="relative">
                            <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-400" />
                            <input
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                                className="w-full pl-12 pr-4 py-3 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-transparent text-zinc-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                                placeholder="ornek@email.com"
                            />
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                            {t("username") || "Kullanıcı Adı"}
                        </label>
                        <div className="relative">
                            <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-400" />
                            <input
                                type="text"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                required
                                className="w-full pl-12 pr-4 py-3 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-transparent text-zinc-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                                placeholder="kullaniciadi"
                            />
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                            {t("password") || "Şifre"}
                        </label>
                        <div className="relative">
                            <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-400" />
                            <input
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                                minLength={10}
                                maxLength={128}
                                autoComplete="new-password"
                                className="w-full pl-12 pr-4 py-3 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-transparent text-zinc-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                                placeholder="••••••••"
                            />
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                            {t("confirm_password") || "Şifreyi Doğrula"}
                        </label>
                        <div className="relative">
                            <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-400" />
                            <input
                                type="password"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                required
                                minLength={10}
                                maxLength={128}
                                autoComplete="new-password"
                                className="w-full pl-12 pr-4 py-3 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-transparent text-zinc-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                                placeholder="••••••••"
                            />
                        </div>
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full h-12 bg-green-600 hover:bg-green-700 text-white rounded-xl font-bold transition-all shadow-lg hover:shadow-green-500/30 disabled:opacity-50"
                    >
                        {loading ? (t("creating_account") || "Hesap Oluşturuluyor...") : (t("signup") || "Üye Ol")}
                    </button>
                </form>

                <p className="mt-6 text-center text-sm text-zinc-600 dark:text-zinc-400">
                    {t("already_have_account") || "Zaten hesabın var mı?"}{" "}
                    <Link href="/login" className="text-blue-500 hover:underline font-medium">
                        {t("login") || "Giriş Yap"}
                    </Link>
                </p>
            </div>
        </div>
    );
}
