"use client";

import { useState, useEffect } from "react";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { User, Trash2, Camera, ArrowLeft, Save, Bell, Globe, Shield, Database, Download, Clock, Eye, EyeOff, Mail, Megaphone, LogOut } from "lucide-react";
import Header from "@/components/Header";
import { useI18n } from "@/lib/i18n";
import { db } from "@/lib/firebase";
import { doc, setDoc, getDoc, deleteDoc, collection, query, where, getDocs } from "firebase/firestore";

export default function AccountSettingsPage() {
    const { data: session } = useSession();
    const router = useRouter();
    const { t, language, setLanguage } = useI18n();

    const [username, setUsername] = useState("");
    const [avatarUrl, setAvatarUrl] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [message, setMessage] = useState("");
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

    // NEW settings state
    const [emailNotifications, setEmailNotifications] = useState(true);
    const [newFeatureAlerts, setNewFeatureAlerts] = useState(true);
    const [publicProfile, setPublicProfile] = useState(true);
    const [showOnlineStatus, setShowOnlineStatus] = useState(true);
    const [timezone, setTimezone] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone);
    const [bio, setBio] = useState("");

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
                // Load new settings
                setEmailNotifications(data.emailNotifications ?? true);
                setNewFeatureAlerts(data.newFeatureAlerts ?? true);
                setPublicProfile(data.publicProfile ?? true);
                setShowOnlineStatus(data.showOnlineStatus ?? true);
                setTimezone(data.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone);
                setBio(data.bio || "");
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
                bio,
                emailNotifications,
                newFeatureAlerts,
                publicProfile,
                showOnlineStatus,
                timezone,
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

    const handleExportData = async () => {
        if (!session?.user?.email) return;
        setIsLoading(true);
        try {
            const projectsQuery = query(collection(db, "projects"), where("email", "==", session.user.email));
            const projectsSnapshot = await getDocs(projectsQuery);
            const projects = projectsSnapshot.docs.map(d => ({ id: d.id, ...d.data() }));

            const userDoc = await getDoc(doc(db, "users", session.user.email));
            const userData = userDoc.exists() ? userDoc.data() : {};

            const exportData = {
                user: userData,
                projects,
                editorSettings: JSON.parse(localStorage.getItem("hanogt_editor_settings") || "{}"),
                exportedAt: new Date().toISOString()
            };

            const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `hanogt_backup_${new Date().toISOString().slice(0, 10)}.json`;
            a.click();
            URL.revokeObjectURL(url);

            setMessage(t("export_success") || "Veriler başarıyla indirildi!");
            setTimeout(() => setMessage(""), 3000);
        } catch (error) {
            console.error("Error exporting data:", error);
            setMessage(t("error_occurred") || "Hata oluştu!");
        } finally {
            setIsLoading(false);
        }
    };

    const handleResetEditorSettings = () => {
        localStorage.removeItem("hanogt_editor_settings");
        setMessage(t("editor_settings_reset") || "Editör ayarları sıfırlandı!");
        setTimeout(() => setMessage(""), 3000);
    };

    // Toggle switch component
    const ToggleSwitch = ({ enabled, onToggle }: { enabled: boolean; onToggle: () => void }) => (
        <button
            onClick={onToggle}
            className={`w-12 h-6 rounded-full transition-all flex-shrink-0 ${enabled ? "bg-blue-600" : "bg-zinc-300 dark:bg-zinc-700"}`}
        >
            <div className={`w-5 h-5 bg-white rounded-full transition-all ${enabled ? "translate-x-6" : "translate-x-0.5"}`} />
        </button>
    );

    const timezones = [
        "Europe/Istanbul",
        "Europe/London",
        "Europe/Berlin",
        "Europe/Moscow",
        "America/New_York",
        "America/Chicago",
        "America/Denver",
        "America/Los_Angeles",
        "Asia/Tokyo",
        "Asia/Shanghai",
        "Asia/Dubai",
        "Asia/Kolkata",
        "Australia/Sydney",
        "Pacific/Auckland"
    ];

    const getTimezoneLabel = (tz: string) => {
        try {
            const now = new Date();
            const formatter = new Intl.DateTimeFormat("tr-TR", { timeZone: tz, timeZoneName: "short" });
            const parts = formatter.formatToParts(now);
            const tzName = parts.find(p => p.type === "timeZoneName")?.value || "";
            return `${tz.split("/").pop()?.replace(/_/g, " ")} (${tzName})`;
        } catch {
            return tz;
        }
    };

    if (!session?.user) {
        return null;
    }

    const memberSince = session.user.email ? new Date().toLocaleDateString("tr-TR") : "-";

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

                {/* ===== PROFILE SECTION ===== */}
                <section className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-6 mb-6">
                    <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
                        <User className="w-5 h-5 text-blue-500" />
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
                                    referrerPolicy="no-referrer"
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

                    {/* Bio */}
                    <div className="mb-6">
                        <label className="block text-sm font-medium text-zinc-500 mb-1">
                            {t("bio") || "Hakkında"}
                        </label>
                        <textarea
                            value={bio}
                            onChange={(e) => setBio(e.target.value)}
                            placeholder={t("bio_placeholder") || "Kendiniz hakkında kısa bir bilgi yazın..."}
                            maxLength={200}
                            rows={3}
                            className="w-full px-4 py-3 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                        />
                        <div className="text-right text-xs text-zinc-400 mt-1">{bio.length}/200</div>
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

                {/* ===== NOTIFICATION PREFERENCES ===== */}
                <section className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-6 mb-6">
                    <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
                        <Bell className="w-5 h-5 text-yellow-500" />
                        {t("notification_prefs") || "Bildirim Tercihleri"}
                    </h2>

                    {/* Email Notifications */}
                    <div className="flex items-center justify-between py-4 border-b border-zinc-100 dark:border-zinc-800">
                        <div className="pr-4">
                            <div className="flex items-center gap-2">
                                <Mail className="w-4 h-4 text-zinc-400" />
                                <span>{t("email_notifications") || "E-posta Bildirimleri"}</span>
                            </div>
                            <span className="text-sm text-zinc-500">{t("email_notifications_desc") || "Geri bildiriminize cevap geldiğinde e-posta al"}</span>
                        </div>
                        <ToggleSwitch enabled={emailNotifications} onToggle={() => setEmailNotifications(!emailNotifications)} />
                    </div>

                    {/* New Feature Alerts */}
                    <div className="flex items-center justify-between py-4">
                        <div className="pr-4">
                            <div className="flex items-center gap-2">
                                <Megaphone className="w-4 h-4 text-zinc-400" />
                                <span>{t("new_feature_alerts") || "Yeni Özellik Duyuruları"}</span>
                            </div>
                            <span className="text-sm text-zinc-500">{t("new_feature_alerts_desc") || "Yeni güncellemeler ve özellikler hakkında haberdar ol"}</span>
                        </div>
                        <ToggleSwitch enabled={newFeatureAlerts} onToggle={() => setNewFeatureAlerts(!newFeatureAlerts)} />
                    </div>
                </section>

                {/* ===== LANGUAGE & REGION ===== */}
                <section className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-6 mb-6">
                    <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
                        <Globe className="w-5 h-5 text-green-500" />
                        {t("language_region") || "Dil & Bölge"}
                    </h2>

                    {/* App Language */}
                    <div className="flex items-center justify-between py-4 border-b border-zinc-100 dark:border-zinc-800">
                        <div>
                            <span className="block">{t("app_language") || "Uygulama Dili"}</span>
                            <span className="text-sm text-zinc-500">{t("app_language_desc") || "Arayüz dilini değiştir"}</span>
                        </div>
                        <div className="flex gap-2">
                            <button
                                onClick={() => setLanguage("TR")}
                                className={`px-4 py-2 rounded-lg font-medium transition-all flex items-center gap-2 ${language === "TR" ? "bg-blue-600 text-white" : "bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300"}`}
                            >
                                🇹🇷 Türkçe
                            </button>
                            <button
                                onClick={() => setLanguage("EN")}
                                className={`px-4 py-2 rounded-lg font-medium transition-all flex items-center gap-2 ${language === "EN" ? "bg-blue-600 text-white" : "bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300"}`}
                            >
                                🇬🇧 English
                            </button>
                        </div>
                    </div>

                    {/* Timezone */}
                    <div className="flex items-center justify-between py-4">
                        <div className="pr-4">
                            <div className="flex items-center gap-2">
                                <Clock className="w-4 h-4 text-zinc-400" />
                                <span>{t("timezone") || "Saat Dilimi"}</span>
                            </div>
                            <span className="text-sm text-zinc-500">{t("timezone_desc") || "Tarih ve saat gösterimi için"}</span>
                        </div>
                        <select
                            value={timezone}
                            onChange={(e) => setTimezone(e.target.value)}
                            className="px-4 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm max-w-[200px]"
                        >
                            {timezones.map(tz => (
                                <option key={tz} value={tz}>{getTimezoneLabel(tz)}</option>
                            ))}
                        </select>
                    </div>
                </section>

                {/* ===== PRIVACY & SECURITY ===== */}
                <section className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-6 mb-6">
                    <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
                        <Shield className="w-5 h-5 text-indigo-500" />
                        {t("privacy_security") || "Gizlilik & Güvenlik"}
                    </h2>

                    {/* Public Profile */}
                    <div className="flex items-center justify-between py-4 border-b border-zinc-100 dark:border-zinc-800">
                        <div className="pr-4">
                            <div className="flex items-center gap-2">
                                {publicProfile ? <Eye className="w-4 h-4 text-zinc-400" /> : <EyeOff className="w-4 h-4 text-zinc-400" />}
                                <span>{t("public_profile") || "Herkese Açık Profil"}</span>
                            </div>
                            <span className="text-sm text-zinc-500">{t("public_profile_desc") || "Profilinizi diğer kullanıcıların görmesine izin verin"}</span>
                        </div>
                        <ToggleSwitch enabled={publicProfile} onToggle={() => setPublicProfile(!publicProfile)} />
                    </div>

                    {/* Show Online Status */}
                    <div className="flex items-center justify-between py-4 border-b border-zinc-100 dark:border-zinc-800">
                        <div className="pr-4">
                            <span className="block">{t("online_status") || "Çevrimiçi Durumu"}</span>
                            <span className="text-sm text-zinc-500">{t("online_status_desc") || "Diğer kullanıcılara çevrimiçi olduğunuzu gösterin"}</span>
                        </div>
                        <ToggleSwitch enabled={showOnlineStatus} onToggle={() => setShowOnlineStatus(!showOnlineStatus)} />
                    </div>

                    {/* Session Info */}
                    <div className="py-4">
                        <span className="block text-sm font-medium text-zinc-500 mb-3">{t("session_info") || "Oturum Bilgileri"}</span>
                        <div className="bg-zinc-50 dark:bg-zinc-800/50 rounded-xl p-4 space-y-2">
                            <div className="flex items-center justify-between text-sm">
                                <span className="text-zinc-500">{t("login_provider") || "Giriş Yöntemi"}</span>
                                <span className="font-medium flex items-center gap-1.5">
                                    <div className="w-2 h-2 bg-green-500 rounded-full" />
                                    Google
                                </span>
                            </div>
                            <div className="flex items-center justify-between text-sm">
                                <span className="text-zinc-500">{t("email") || "E-posta"}</span>
                                <span className="font-medium">{session.user.email}</span>
                            </div>
                            <div className="flex items-center justify-between text-sm">
                                <span className="text-zinc-500">{t("session_status") || "Oturum Durumu"}</span>
                                <span className="font-medium text-green-500">{t("active") || "Aktif"}</span>
                            </div>
                        </div>
                    </div>
                </section>

                {/* ===== DATA MANAGEMENT ===== */}
                <section className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-6 mb-6">
                    <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
                        <Database className="w-5 h-5 text-cyan-500" />
                        {t("data_management") || "Veri Yönetimi"}
                    </h2>

                    {/* Export Data */}
                    <div className="flex items-center justify-between py-4 border-b border-zinc-100 dark:border-zinc-800">
                        <div className="pr-4">
                            <span className="block">{t("export_data") || "Verileri Dışa Aktar"}</span>
                            <span className="text-sm text-zinc-500">{t("export_data_desc") || "Tüm projelerinizi ve ayarlarınızı JSON olarak indirin"}</span>
                        </div>
                        <button
                            onClick={handleExportData}
                            disabled={isLoading}
                            className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 text-white font-medium rounded-2xl transition-all flex items-center gap-2 text-sm"
                        >
                            <Download className="w-4 h-4" />
                            {t("download") || "İndir"}
                        </button>
                    </div>

                    {/* Reset Editor Settings */}
                    <div className="flex items-center justify-between py-4">
                        <div className="pr-4">
                            <span className="block">{t("reset_editor") || "Editör Ayarlarını Sıfırla"}</span>
                            <span className="text-sm text-zinc-500">{t("reset_editor_desc") || "Editör tercihlerini varsayılana döndür"}</span>
                        </div>
                        <button
                            onClick={handleResetEditorSettings}
                            className="px-4 py-2 bg-zinc-200 dark:bg-zinc-700 hover:bg-zinc-300 dark:hover:bg-zinc-600 text-zinc-700 dark:text-zinc-300 font-medium rounded-2xl transition-all text-sm"
                        >
                            {t("reset") || "Sıfırla"}
                        </button>
                    </div>
                </section>

                {/* ===== DANGER ZONE ===== */}
                <section className="bg-white dark:bg-zinc-900 rounded-2xl border border-red-200 dark:border-red-900/50 p-6">
                    <h2 className="text-xl font-bold mb-4 flex items-center gap-2 text-red-600">
                        <Trash2 className="w-5 h-5" />
                        {t("danger_zone") || "Tehlikeli Bölge"}
                    </h2>

                    {/* Sign Out */}
                    <div className="flex items-center justify-between py-4 border-b border-zinc-100 dark:border-zinc-800">
                        <div className="pr-4">
                            <span className="block">{t("sign_out") || "Oturumu Kapat"}</span>
                            <span className="text-sm text-zinc-500">{t("sign_out_desc") || "Hesabınızdan güvenli çıkış yapın"}</span>
                        </div>
                        <button
                            onClick={() => signOut({ callbackUrl: "/" })}
                            className="px-4 py-2 bg-zinc-200 dark:bg-zinc-700 hover:bg-zinc-300 dark:hover:bg-zinc-600 text-zinc-700 dark:text-zinc-300 font-medium rounded-2xl transition-all flex items-center gap-2 text-sm"
                        >
                            <LogOut className="w-4 h-4" />
                            {t("sign_out") || "Çıkış Yap"}
                        </button>
                    </div>

                    {/* Delete Account */}
                    <div className="py-4">
                        <p className="text-zinc-500 mb-4">
                            {t("delete_account_warning") || "Hesabınızı sildiğinizde tüm projeleriniz ve verileriniz kalıcı olarak silinecektir."}
                        </p>
                        <button
                            onClick={() => setShowDeleteConfirm(true)}
                            className="px-6 py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-2xl transition-all"
                        >
                            {t("delete_account") || "Hesabımı Sil"}
                        </button>
                    </div>
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
