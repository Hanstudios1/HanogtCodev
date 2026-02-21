"use client";

import { useState, useEffect } from "react";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { User, Trash2, Camera, ArrowLeft, Save } from "lucide-react";
import Header from "@/components/Header";
import { useI18n } from "@/lib/i18n";
import { db } from "@/lib/firebase";
import { doc, setDoc, getDoc, deleteDoc, collection, query, where, getDocs } from "firebase/firestore";

export default function AccountSettingsPage() {
    const { data: session } = useSession();
    const router = useRouter();
    const { t } = useI18n();

    const [username, setUsername] = useState("");
    const [avatarUrl, setAvatarUrl] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [message, setMessage] = useState("");
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

    useEffect(() => {
        if (!session?.user) {
            router.push("/login");
            return;
        }
        loadUserData();
    }, [session]);

    const loadUserData = async () => {
        if (!session?.user?.email) return;
        try {
            const userDoc = await getDoc(doc(db, "users", session.user.email));
            if (userDoc.exists()) {
                const data = userDoc.data();
                setUsername(data.username || session.user.name || "");
                setAvatarUrl(data.avatarUrl || session.user.image || "");
            } else {
                setUsername(session.user.name || "");
                setAvatarUrl(session.user.image || "");
            }
        } catch (error) {
            console.error("Error loading user data:", error);
        }
    };

    const handleSaveProfile = async () => {
        if (!session?.user?.email) return;
        setIsLoading(true);
        try {
            await setDoc(doc(db, "users", session.user.email), {
                email: session.user.email,
                username,
                avatarUrl,
                updatedAt: new Date().toISOString(),
            }, { merge: true });
            setMessage(t("save_success") || "Başarıyla kaydedildi!");
            setTimeout(() => setMessage(""), 3000);
        } catch (error) {
            console.error("Error saving profile:", error);
            setMessage(t("error_occurred") || "Hata oluştu!");
        } finally {
            setIsLoading(false);
        }
    };

    const handleDeleteAccount = async () => {
        if (!session?.user?.email) return;
        setIsLoading(true);
        try {
            // Delete user's projects
            const projectsQuery = query(collection(db, "projects"), where("email", "==", session.user.email));
            const projectsSnapshot = await getDocs(projectsQuery);
            for (const projectDoc of projectsSnapshot.docs) {
                await deleteDoc(projectDoc.ref);
            }

            // Delete user document
            await deleteDoc(doc(db, "users", session.user.email));

            // Clear localStorage
            localStorage.clear();

            // Sign out and redirect to home
            await signOut({ redirect: false });
            router.push("/");
        } catch (error) {
            console.error("Error deleting account:", error);
            setMessage(t("delete_error") || "Hesap silinirken hata oluştu!");
        } finally {
            setIsLoading(false);
        }
    };

    if (!session?.user) {
        return null;
    }

    return (
        <div className="min-h-screen bg-zinc-50 dark:bg-black text-zinc-900 dark:text-white">
            <Header />

            <main className="pt-24 px-6 max-w-2xl mx-auto pb-12">
                {/* Back Button */}
                <button
                    onClick={() => router.back()}
                    className="flex items-center gap-2 text-zinc-500 hover:text-zinc-900 dark:hover:text-white mb-6 transition-colors"
                >
                    <ArrowLeft className="w-5 h-5" />
                    {t("back") || "Geri"}
                </button>

                <h1 className="text-3xl font-bold mb-8">{t("account_settings") || "Hesap Ayarları"}</h1>

                {/* Success/Error Message */}
                {message && (
                    <div className={`mb-6 p-4 rounded-xl ${message.includes("Hata") || message.includes("error") ? "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400" : "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400"}`}>
                        {message}
                    </div>
                )}

                {/* Profile Section */}
                <section className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-6 mb-6">
                    <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
                        <User className="w-5 h-5" />
                        {t("profile") || "Profil"}
                    </h2>

                    {/* Avatar */}
                    <div className="flex items-center gap-4 mb-6">
                        <div className="relative">
                            {avatarUrl ? (
                                <img
                                    src={avatarUrl}
                                    alt="Avatar"
                                    className="w-20 h-20 rounded-full object-cover border-4 border-zinc-200 dark:border-zinc-700"
                                />
                            ) : (
                                <div className="w-20 h-20 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold text-2xl">
                                    {username?.charAt(0) || "U"}
                                </div>
                            )}
                            <label className="absolute bottom-0 right-0 w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center cursor-pointer hover:bg-blue-700 transition-colors">
                                <Camera className="w-4 h-4 text-white" />
                            </label>
                        </div>
                        <div className="flex-1">
                            <label className="block text-sm font-medium text-zinc-500 mb-1">
                                {t("avatar_url") || "Profil Resmi URL"}
                            </label>
                            <input
                                type="url"
                                value={avatarUrl}
                                onChange={(e) => setAvatarUrl(e.target.value)}
                                placeholder="https://example.com/avatar.jpg"
                                className="w-full px-4 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                        </div>
                    </div>

                    {/* Username */}
                    <div className="mb-6">
                        <label className="block text-sm font-medium text-zinc-500 mb-1">
                            {t("username") || "Kullanıcı Adı"}
                        </label>
                        <input
                            type="text"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            className="w-full px-4 py-3 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                    </div>

                    {/* Email (Read Only) */}
                    <div className="mb-6">
                        <label className="block text-sm font-medium text-zinc-500 mb-1">
                            {t("email") || "E-posta"}
                        </label>
                        <input
                            type="email"
                            value={session.user.email || ""}
                            disabled
                            className="w-full px-4 py-3 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800 text-zinc-500 cursor-not-allowed"
                        />
                    </div>

                    {/* Save Button */}
                    <button
                        onClick={handleSaveProfile}
                        disabled={isLoading}
                        className="w-full px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold rounded-2xl transition-all flex items-center justify-center gap-2"
                    >
                        <Save className="w-5 h-5" />
                        {isLoading ? "..." : (t("save") || "Kaydet")}
                    </button>
                </section>

                {/* Danger Zone */}
                <section className="bg-white dark:bg-zinc-900 rounded-2xl border border-red-200 dark:border-red-900/50 p-6">
                    <h2 className="text-xl font-bold mb-4 flex items-center gap-2 text-red-600">
                        <Trash2 className="w-5 h-5" />
                        {t("danger_zone") || "Tehlikeli Bölge"}
                    </h2>
                    <p className="text-zinc-500 mb-4">
                        {t("delete_account_warning") || "Hesabınızı sildiğinizde tüm projeleriniz ve verileriniz kalıcı olarak silinecektir."}
                    </p>
                    <button
                        onClick={() => setShowDeleteConfirm(true)}
                        className="px-6 py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-2xl transition-all"
                    >
                        {t("delete_account") || "Hesabımı Sil"}
                    </button>
                </section>

                {/* Delete Confirmation Modal */}
                {showDeleteConfirm && (
                    <div className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-4">
                        <div className="bg-white dark:bg-zinc-900 rounded-2xl max-w-md w-full p-6 border border-zinc-200 dark:border-zinc-700">
                            <h3 className="text-xl font-bold text-red-600 mb-4">
                                {t("confirm_delete_account") || "Hesabınızı silmek istediğinize emin misiniz?"}
                            </h3>
                            <p className="text-zinc-500 mb-6">
                                {t("delete_account_permanent") || "Bu işlem geri alınamaz. Tüm verileriniz sunucularımızdan kalıcı olarak silinecektir."}
                            </p>
                            <div className="flex flex-col gap-3">
                                <button
                                    onClick={() => setShowDeleteConfirm(false)}
                                    className="w-full px-6 py-3 bg-white dark:bg-zinc-800 text-black dark:text-white font-bold rounded-2xl border border-zinc-300 dark:border-zinc-600 transition-all"
                                >
                                    {t("cancel") || "Vazgeç"}
                                </button>
                                <button
                                    onClick={handleDeleteAccount}
                                    disabled={isLoading}
                                    className="w-full px-6 py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-2xl transition-all"
                                >
                                    {isLoading ? "..." : (t("confirm_delete") || "Evet, Hesabımı Sil")}
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
}
