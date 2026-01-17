"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Mail, ShieldAlert } from "lucide-react";
import { signIn } from "next-auth/react";
import { useI18n } from "@/lib/i18n";
import { isUserBanned } from "@/lib/hanogtBot";
import BannedModal from "@/components/BannedModal";

export default function LoginPage() {
    const router = useRouter();
    const { t } = useI18n();
    const [loading, setLoading] = useState(false);
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [showBanModal, setShowBanModal] = useState(false);
    const [banReason, setBanReason] = useState("");

    const handleCredentialsLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError("");

        try {
            // Check if user is banned BEFORE attempting login
            const banStatus = await isUserBanned(email);
            if (banStatus.banned) {
                setBanReason(banStatus.reason || "Zararlı kod aktivitesi");
                setShowBanModal(true);
                setLoading(false);
                return;
            }

            const result = await signIn("credentials", {
                email,
                password,
                redirect: false,
            });

            if (result?.error) {
                setError(t("login_error") || "E-posta veya şifre hatalı");
            } else {
                router.push("/dashboard");
            }
        } catch (err) {
            setError(t("login_error") || "Bir hata oluştu");
        } finally {
            setLoading(false);
        }
    };

    const handleGoogleLogin = async () => {
        // For Google login, we check ban after authentication in session callback
        // But we can show a warning about security policy
        signIn("google", { callbackUrl: "/dashboard" });
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-black transition-colors px-4">
            <div className="w-full max-w-md bg-white dark:bg-zinc-900 rounded-2xl shadow-xl p-8 border border-zinc-200 dark:border-zinc-800">
                <div className="text-center mb-8">
                    <h1 className="text-2xl font-bold text-zinc-900 dark:text-white">
                        {t("login") || "Giriş Yap"}
                    </h1>
                    <p className="text-zinc-500 dark:text-zinc-400 mt-2">
                        {t("welcome_back") || "Hanogt Codev'e Hoşgeldiniz"}
                    </p>
                </div>

                {/* Security Badge */}
                <div className="flex items-center justify-center gap-2 mb-6 p-2 bg-green-100 dark:bg-green-900/20 rounded-xl">
                    <ShieldAlert className="w-4 h-4 text-green-600 dark:text-green-400" />
                    <span className="text-xs text-green-700 dark:text-green-400">
                        {t("protected_by_hanogt_bot") || "Hanogt Security Bot ile korunuyor"}
                    </span>
                </div>

                {/* Google Login */}
                <button
                    onClick={handleGoogleLogin}
                    className="w-full h-12 flex items-center justify-center gap-3 bg-white dark:bg-zinc-800 hover:bg-gray-50 dark:hover:bg-zinc-700 border border-zinc-300 dark:border-zinc-600 rounded-xl transition-all text-zinc-900 dark:text-white font-medium mb-4"
                >
                    <img src="/google-logo.png" alt="Google" className="w-5 h-5" />
                    {t("login_google") || "Google ile Oturum Aç"}
                </button>

                <div className="relative flex py-5 items-center">
                    <div className="flex-grow border-t border-zinc-300 dark:border-zinc-700"></div>
                    <span className="flex-shrink mx-4 text-zinc-400 text-sm">{t("or") || "veya"}</span>
                    <div className="flex-grow border-t border-zinc-300 dark:border-zinc-700"></div>
                </div>

                {/* Error Message */}
                {error && (
                    <div className="mb-4 p-3 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-xl text-sm text-center">
                        {error}
                    </div>
                )}

                {/* Email/Password Login */}
                <form onSubmit={handleCredentialsLogin} className="space-y-4">
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
                            {t("password") || "Şifre"}
                        </label>
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                            className="w-full px-4 py-3 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-transparent text-zinc-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                            placeholder="••••••••"
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full h-12 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold transition-all shadow-lg hover:shadow-blue-500/30 disabled:opacity-50"
                    >
                        {loading ? (t("logging_in") || "Giriş Yapılıyor...") : (t("login") || "Giriş Yap")}
                    </button>
                </form>

                <p className="mt-6 text-center text-sm text-zinc-600 dark:text-zinc-400">
                    {t("no_account") || "Hesabın yok mu?"}{" "}
                    <Link href="/signup" className="text-blue-500 hover:underline font-medium">
                        {t("signup_now") || "Hemen Üye Ol"}
                    </Link>
                </p>
            </div>

            {/* Ban Modal */}
            <BannedModal
                isOpen={showBanModal}
                reason={banReason}
                onClose={() => setShowBanModal(false)}
            />
        </div>
    );
}
