"use client";

import { useState, useEffect } from "react";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { User, Trash2, Camera, ArrowLeft, Save, Bell, Globe, Shield, Database, Download, Clock, Eye, EyeOff, Mail, Megaphone, LogOut, Link2, Github, Linkedin, Twitter, Globe2, Hash, Palette, Heart, Image, MessageCircle, Star, Phone, Lock, Volume2, Paintbrush, Monitor, Snowflake } from "lucide-react";
import Header from "@/components/Header";
import { useI18n } from "@/lib/i18n";
import { db } from "@/lib/firebase";
import { doc, setDoc, getDoc, deleteDoc, collection, query, where, getDocs } from "firebase/firestore";

const PROGRAMMING_LANGUAGES = [
    "JavaScript", "TypeScript", "Python", "Java", "C++", "C#", "Go", "Rust",
    "Ruby", "PHP", "Swift", "Kotlin", "Dart", "Scala", "R", "SQL",
    "HTML", "CSS", "React", "Vue", "Angular", "Node.js", "Next.js", "Flutter"
];

const ACCENT_COLORS = [
    "#3B82F6", "#8B5CF6", "#EC4899", "#EF4444", "#F97316", "#EAB308",
    "#22C55E", "#06B6D4", "#6366F1", "#D946EF", "#14B8A6", "#F43F5E"
];

export default function AccountSettingsPage() {
    const { data: session } = useSession();
    const router = useRouter();
    const { t, language, setLanguage } = useI18n();

    const [username, setUsername] = useState("");
    const [avatarUrl, setAvatarUrl] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [message, setMessage] = useState("");
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

    // Existing settings state
    const [emailNotifications, setEmailNotifications] = useState(true);
    const [newFeatureAlerts, setNewFeatureAlerts] = useState(true);
    const [publicProfile, setPublicProfile] = useState(true);
    const [showOnlineStatus, setShowOnlineStatus] = useState(true);
    const [timezone, setTimezone] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone);
    const [bio, setBio] = useState("");

    // NEW Phase 2 states
    const [nickname, setNickname] = useState("");
    const [nicknameTag, setNicknameTag] = useState("");
    const [customStatus, setCustomStatus] = useState("");
    const [statusEmoji, setStatusEmoji] = useState("😊");
    const [bannerUrl, setBannerUrl] = useState("");
    const [accentColor, setAccentColor] = useState("#3B82F6");
    const [favoriteLangs, setFavoriteLangs] = useState<string[]>([]);
    const [socialGithub, setSocialGithub] = useState("");
    const [socialLinkedin, setSocialLinkedin] = useState("");
    const [socialTwitter, setSocialTwitter] = useState("");
    const [socialWebsite, setSocialWebsite] = useState("");
    const [socialYoutube, setSocialYoutube] = useState("");
    const [socialTiktok, setSocialTiktok] = useState("");
    const [socialInstagram, setSocialInstagram] = useState("");
    const [socialFacebook, setSocialFacebook] = useState("");
    const [lastLoginDate, setLastLoginDate] = useState("");

    // §7 Password Management
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [hasPassword, setHasPassword] = useState(false);

    // §5 Phone Verification
    const [phoneNumber, setPhoneNumber] = useState("");
    const [phoneVerified, setPhoneVerified] = useState(false);
    const [verificationCode, setVerificationCode] = useState("");
    const [showVerifyInput, setShowVerifyInput] = useState(false);
    const [generatedCode, setGeneratedCode] = useState("");

    // §8 Messaging Settings
    const [typingIndicator, setTypingIndicator] = useState(true);
    const [readReceipts, setReadReceipts] = useState(true);
    const [msgFontSize, setMsgFontSize] = useState("medium");
    const [chatBackground, setChatBackground] = useState("default");
    const [voiceMsgQuality, setVoiceMsgQuality] = useState("normal");
    const [linkPreview, setLinkPreview] = useState(true);
    const [gifAutoplay, setGifAutoplay] = useState(true);
    const [enterToSend, setEnterToSend] = useState(true);
    const [stickerSuggestions, setStickerSuggestions] = useState(true);

    // §8 Privacy Settings
    const [whoCanAdd, setWhoCanAdd] = useState("everyone");
    const [hideFriendList, setHideFriendList] = useState(false);
    const [showLastSeen, setShowLastSeen] = useState(true);
    const [photoVisibility, setPhotoVisibility] = useState("everyone");
    const [bioVisibility, setBioVisibility] = useState("everyone");
    const [publicProjects, setPublicProjects] = useState(true);

    // §8 Notification Settings
    const [msgNotifications, setMsgNotifications] = useState(true);
    const [callNotifications, setCallNotifications] = useState(true);
    const [friendReqNotifications, setFriendReqNotifications] = useState(true);
    const [likeNotifications, setLikeNotifications] = useState(true);
    const [notifSound, setNotifSound] = useState(true);
    const [dndMode, setDndMode] = useState(false);
    const [dndSchedule, setDndSchedule] = useState("");

    // §8 Appearance Settings
    const [bubbleColor, setBubbleColor] = useState("#3B82F6");
    const [compactMode, setCompactMode] = useState(false);
    const [reduceAnimations, setReduceAnimations] = useState(false);
    const [highContrast, setHighContrast] = useState(false);
    const [uiFontSize, setUiFontSize] = useState("medium");
    const [emojiStyle, setEmojiStyle] = useState("native");

    // §8 Security Settings
    const [freezeAccount, setFreezeAccount] = useState(false);

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
                // Load existing settings
                setEmailNotifications(data.emailNotifications ?? true);
                setNewFeatureAlerts(data.newFeatureAlerts ?? true);
                setPublicProfile(data.publicProfile ?? true);
                setShowOnlineStatus(data.showOnlineStatus ?? true);
                setTimezone(data.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone);
                setBio(data.bio || "");
                // Load new Phase 2 settings
                setNickname(data.nickname || "");
                setNicknameTag(data.nicknameTag || generateTag());
                setCustomStatus(data.customStatus || "");
                setStatusEmoji(data.statusEmoji || "😊");
                setBannerUrl(data.bannerUrl || "");
                setAccentColor(data.accentColor || "#3B82F6");
                setFavoriteLangs(data.favoriteLangs || []);
                setSocialGithub(data.socialGithub || "");
                setSocialLinkedin(data.socialLinkedin || "");
                setSocialTwitter(data.socialTwitter || "");
                setSocialWebsite(data.socialWebsite || "");
                setSocialYoutube(data.socialYoutube || "");
                setSocialTiktok(data.socialTiktok || "");
                setSocialInstagram(data.socialInstagram || "");
                setSocialFacebook(data.socialFacebook || "");
                setLastLoginDate(data.lastLoginDate || new Date().toISOString());
                // §7 Password
                setHasPassword(data.hasPassword || false);
                // §5 Phone
                setPhoneNumber(data.phoneNumber || "");
                setPhoneVerified(data.phoneVerified || false);
                // §8 Messaging
                setTypingIndicator(data.typingIndicator ?? true);
                setReadReceipts(data.readReceipts ?? true);
                setMsgFontSize(data.msgFontSize || "medium");
                setChatBackground(data.chatBackground || "default");
                setVoiceMsgQuality(data.voiceMsgQuality || "normal");
                setLinkPreview(data.linkPreview ?? true);
                setGifAutoplay(data.gifAutoplay ?? true);
                setEnterToSend(data.enterToSend ?? true);
                setStickerSuggestions(data.stickerSuggestions ?? true);
                // §8 Privacy
                setWhoCanAdd(data.whoCanAdd || "everyone");
                setHideFriendList(data.hideFriendList ?? false);
                setShowLastSeen(data.showLastSeen ?? true);
                setPhotoVisibility(data.photoVisibility || "everyone");
                setBioVisibility(data.bioVisibility || "everyone");
                setPublicProjects(data.publicProjects ?? true);
                // §8 Notifications
                setMsgNotifications(data.msgNotifications ?? true);
                setCallNotifications(data.callNotifications ?? true);
                setFriendReqNotifications(data.friendReqNotifications ?? true);
                setLikeNotifications(data.likeNotifications ?? true);
                setNotifSound(data.notifSound ?? true);
                setDndMode(data.dndMode ?? false);
                setDndSchedule(data.dndSchedule || "");
                // §8 Appearance
                setBubbleColor(data.bubbleColor || "#3B82F6");
                setCompactMode(data.compactMode ?? false);
                setReduceAnimations(data.reduceAnimations ?? false);
                setHighContrast(data.highContrast ?? false);
                setUiFontSize(data.uiFontSize || "medium");
                setEmojiStyle(data.emojiStyle || "native");
                // §8 Security
                setFreezeAccount(data.freezeAccount ?? false);
            } else {
                setUsername(session.user.name || "");
                setAvatarUrl(session.user.image || "");
                setNicknameTag(generateTag());
            }
        } catch (error) {
            console.error("Error loading user data:", error);
        }
    };

    const generateTag = () => {
        return String(Math.floor(1000 + Math.random() * 9000));
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
                // New Phase 2 fields
                nickname,
                nicknameTag,
                customStatus,
                statusEmoji,
                bannerUrl,
                accentColor,
                favoriteLangs,
                socialGithub,
                socialLinkedin,
                socialTwitter,
                socialWebsite,
                socialYoutube,
                socialTiktok,
                socialInstagram,
                socialFacebook,
                lastLoginDate: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                // §5 Phone
                phoneNumber,
                phoneVerified,
                // §8 Messaging
                typingIndicator,
                readReceipts,
                msgFontSize,
                chatBackground,
                voiceMsgQuality,
                linkPreview,
                gifAutoplay,
                enterToSend,
                stickerSuggestions,
                // §8 Privacy
                whoCanAdd,
                hideFriendList,
                showLastSeen,
                photoVisibility,
                bioVisibility,
                publicProjects,
                // §8 Notifications
                msgNotifications,
                callNotifications,
                friendReqNotifications,
                likeNotifications,
                notifSound,
                dndMode,
                dndSchedule,
                // §8 Appearance
                bubbleColor,
                compactMode,
                reduceAnimations,
                highContrast,
                uiFontSize,
                emojiStyle,
                // §8 Security
                freezeAccount,
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
            const projectsQuery = query(collection(db, "projects"), where("email", "==", session.user.email));
            const projectsSnapshot = await getDocs(projectsQuery);
            for (const projectDoc of projectsSnapshot.docs) {
                await deleteDoc(projectDoc.ref);
            }
            await deleteDoc(doc(db, "users", session.user.email));
            localStorage.clear();
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

    const handleSetPassword = async () => {
        if (newPassword.length < 6) {
            setMessage(t("password_min_length") || "Şifre en az 6 karakter olmalı!");
            setTimeout(() => setMessage(""), 3000);
            return;
        }
        if (newPassword !== confirmPassword) {
            setMessage(t("passwords_not_match") || "Şifreler eşleşmiyor!");
            setTimeout(() => setMessage(""), 3000);
            return;
        }
        if (!session?.user?.email) return;
        setIsLoading(true);
        try {
            await setDoc(doc(db, "users", session.user.email), {
                hasPassword: true,
                passwordHash: btoa(newPassword), // Demo: in production use proper hashing
            }, { merge: true });
            setHasPassword(true);
            setNewPassword("");
            setConfirmPassword("");
            setMessage(t("password_set_success") || "Şifre başarıyla oluşturuldu!");
            setTimeout(() => setMessage(""), 3000);
        } catch (error) {
            setMessage(t("error_occurred") || "Hata oluştu!");
        } finally {
            setIsLoading(false);
        }
    };

    const handleSendVerification = async () => {
        if (!phoneNumber || phoneNumber.length < 10) {
            setMessage(t("invalid_phone") || "Geçersiz telefon numarası!");
            setTimeout(() => setMessage(""), 3000);
            return;
        }
        // Generate random 6-digit SMS code
        const code = Math.floor(100000 + Math.random() * 900000).toString();
        setGeneratedCode(code);
        setShowVerifyInput(true);
        setMessage(`${t("verification_sent") || "Doğrulama kodu gönderildi!"} (SMS Kodu: ${code})`);
        setTimeout(() => setMessage(""), 8000);
    };

    const handleVerifyCode = async () => {
        if (verificationCode === generatedCode && verificationCode.length === 6) {
            if (!session?.user?.email) return;
            await setDoc(doc(db, "users", session.user.email), {
                phoneVerified: true,
            }, { merge: true });
            setPhoneVerified(true);
            setShowVerifyInput(false);
            setMessage(t("phone_verified") || "Telefon numarası doğrulandı!");
            setTimeout(() => setMessage(""), 3000);
        } else {
            setMessage(t("invalid_code") || "Geçersiz doğrulama kodu!");
            setTimeout(() => setMessage(""), 3000);
        }
    };

    const handleFreezeAccount = async () => {
        if (!session?.user?.email) return;
        await setDoc(doc(db, "users", session.user.email), {
            freezeAccount: !freezeAccount,
        }, { merge: true });
        setFreezeAccount(!freezeAccount);
        setMessage(!freezeAccount ? (t("account_frozen") || "Hesap donduruldu.") : (t("account_unfrozen") || "Hesap aktifleştirildi."));
        setTimeout(() => setMessage(""), 3000);
    };

    const toggleFavoriteLang = (lang: string) => {
        setFavoriteLangs(prev =>
            prev.includes(lang)
                ? prev.filter(l => l !== lang)
                : prev.length < 5
                    ? [...prev, lang]
                    : prev
        );
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
        "Europe/Istanbul", "Europe/London", "Europe/Berlin", "Europe/Moscow",
        "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles",
        "Asia/Tokyo", "Asia/Shanghai", "Asia/Dubai", "Asia/Kolkata",
        "Australia/Sydney", "Pacific/Auckland"
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

    const statusEmojis = ["😊", "🎯", "💻", "🎮", "🎵", "📚", "🔥", "💤", "🏠", "✈️", "🎉", "❤️", "⚡", "🌙", "☕", "🤔"];

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

                {/* ===== PROFILE SECTION ===== */}
                <section className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden mb-6">
                    {/* Profile Banner Preview */}
                    <div
                        className="h-32 relative"
                        style={{
                            background: bannerUrl
                                ? `url(${bannerUrl}) center/cover no-repeat`
                                : `linear-gradient(135deg, ${accentColor}40, ${accentColor}20)`
                        }}
                    >
                        <div className="absolute inset-0 bg-gradient-to-b from-transparent to-black/20" />
                    </div>

                    <div className="p-6 relative">
                        {/* Profil Title - above avatar */}
                        <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
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
                                        className="w-20 h-20 rounded-full object-cover border-4"
                                        style={{ borderColor: accentColor }}
                                        referrerPolicy="no-referrer"
                                    />
                                ) : (
                                    <div
                                        className="w-20 h-20 rounded-full flex items-center justify-center text-white font-bold text-2xl border-4"
                                        style={{ background: `linear-gradient(135deg, ${accentColor}, ${accentColor}80)`, borderColor: accentColor }}
                                    >
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

                        {/* Nickname + Tag */}
                        <div className="mb-6">
                            <label className="block text-sm font-medium text-zinc-500 mb-1">
                                <Hash className="w-3.5 h-3.5 inline mr-1" />
                                {t("nickname_tag") || "Takma Ad & Etiket"}
                            </label>
                            <p className="text-xs text-zinc-400 mb-2">{t("nickname_tag_desc") || "Arkadaş eklemek için kullanılır (ör: Oyuncu#1234)"}</p>
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    value={nickname}
                                    onChange={(e) => setNickname(e.target.value.replace(/[^a-zA-Z0-9_çğıöşüÇĞİÖŞÜ]/g, ""))}
                                    placeholder={t("nickname") || "Takma Ad"}
                                    maxLength={20}
                                    className="flex-1 px-4 py-3 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                                <div className="flex items-center gap-1 px-4 py-3 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800 text-zinc-500 font-mono">
                                    <span>#</span>
                                    <span>{nicknameTag || "0000"}</span>
                                </div>
                            </div>
                        </div>

                        {/* Custom Status */}
                        <div className="mb-6">
                            <label className="block text-sm font-medium text-zinc-500 mb-1">
                                <MessageCircle className="w-3.5 h-3.5 inline mr-1" />
                                {t("custom_status") || "Özel Durum"}
                            </label>
                            <div className="flex gap-2">
                                <div className="relative">
                                    <button
                                        className="w-12 h-12 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 flex items-center justify-center text-xl hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors"
                                        onClick={() => {
                                            const idx = statusEmojis.indexOf(statusEmoji);
                                            setStatusEmoji(statusEmojis[(idx + 1) % statusEmojis.length]);
                                        }}
                                    >
                                        {statusEmoji}
                                    </button>
                                </div>
                                <input
                                    type="text"
                                    value={customStatus}
                                    onChange={(e) => setCustomStatus(e.target.value)}
                                    placeholder={t("status_placeholder") || "Ne yapıyorsun?"}
                                    maxLength={50}
                                    className="flex-1 px-4 py-3 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                            </div>
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

                        {/* Banner URL */}
                        <div className="mb-6">
                            <label className="block text-sm font-medium text-zinc-500 mb-1">
                                <Image className="w-3.5 h-3.5 inline mr-1" />
                                {t("banner_url") || "Banner URL"}
                            </label>
                            <input
                                type="url"
                                value={bannerUrl}
                                onChange={(e) => setBannerUrl(e.target.value)}
                                placeholder="https://example.com/banner.jpg"
                                className="w-full px-4 py-3 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                        </div>

                        {/* Accent Color */}
                        <div className="mb-6">
                            <label className="block text-sm font-medium text-zinc-500 mb-2">
                                <Palette className="w-3.5 h-3.5 inline mr-1" />
                                {t("accent_color") || "Profil Vurgu Rengi"}
                            </label>
                            <div className="flex gap-2 flex-wrap">
                                {ACCENT_COLORS.map(color => (
                                    <button
                                        key={color}
                                        onClick={() => setAccentColor(color)}
                                        className={`w-8 h-8 rounded-full transition-all ${accentColor === color ? "ring-2 ring-offset-2 ring-offset-white dark:ring-offset-zinc-900 scale-110" : "hover:scale-110"}`}
                                        style={{ backgroundColor: color }}
                                    />
                                ))}
                            </div>
                        </div>

                        {/* Favorite Languages */}
                        <div className="mb-6">
                            <label className="block text-sm font-medium text-zinc-500 mb-1">
                                <Star className="w-3.5 h-3.5 inline mr-1" />
                                {t("favorite_langs") || "Favori Diller"} ({favoriteLangs.length}/5)
                            </label>
                            <p className="text-xs text-zinc-400 mb-2">{t("favorite_langs_desc") || "Profilinizde gösterilecek en fazla 5 programlama dili seçin"}</p>
                            <div className="flex gap-2 flex-wrap">
                                {PROGRAMMING_LANGUAGES.map(lang => (
                                    <button
                                        key={lang}
                                        onClick={() => toggleFavoriteLang(lang)}
                                        className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${favoriteLangs.includes(lang)
                                            ? "text-white shadow-md"
                                            : "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700"
                                            } ${favoriteLangs.length >= 5 && !favoriteLangs.includes(lang) ? "opacity-40 cursor-not-allowed" : ""}`}
                                        style={favoriteLangs.includes(lang) ? { backgroundColor: accentColor } : {}}
                                        disabled={favoriteLangs.length >= 5 && !favoriteLangs.includes(lang)}
                                    >
                                        {lang}
                                    </button>
                                ))}
                            </div>
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
                    </div>
                </section>

                {/* ===== SOCIAL LINKS (Discord Connections Style) ===== */}
                <section className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-6 mb-6">
                    <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
                        <Link2 className="w-5 h-5 text-purple-500" />
                        {t("social_links") || "Bağlantılar"}
                    </h2>
                    <p className="text-sm text-zinc-500 mb-4">{t("social_links_desc") || "Sosyal medya hesaplarınızı profilinize ekleyin"}</p>

                    <div className="space-y-4">
                        {/* GitHub */}
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-lg bg-zinc-900 dark:bg-white flex items-center justify-center flex-shrink-0">
                                <Github className="w-5 h-5 text-white dark:text-zinc-900" />
                            </div>
                            <div className="flex-1">
                                <label className="block text-xs font-medium text-zinc-500 mb-0.5">GitHub</label>
                                <input
                                    type="text"
                                    value={socialGithub}
                                    onChange={(e) => setSocialGithub(e.target.value)}
                                    placeholder="github.com/kullaniciadi"
                                    className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm"
                                />
                            </div>
                        </div>

                        {/* LinkedIn */}
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-lg bg-blue-700 flex items-center justify-center flex-shrink-0">
                                <Linkedin className="w-5 h-5 text-white" />
                            </div>
                            <div className="flex-1">
                                <label className="block text-xs font-medium text-zinc-500 mb-0.5">LinkedIn</label>
                                <input
                                    type="text"
                                    value={socialLinkedin}
                                    onChange={(e) => setSocialLinkedin(e.target.value)}
                                    placeholder="linkedin.com/in/kullaniciadi"
                                    className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm"
                                />
                            </div>
                        </div>

                        {/* Twitter/X */}
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-lg bg-black flex items-center justify-center flex-shrink-0">
                                <Twitter className="w-5 h-5 text-white" />
                            </div>
                            <div className="flex-1">
                                <label className="block text-xs font-medium text-zinc-500 mb-0.5">Twitter / X</label>
                                <input
                                    type="text"
                                    value={socialTwitter}
                                    onChange={(e) => setSocialTwitter(e.target.value)}
                                    placeholder="x.com/kullaniciadi"
                                    className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm"
                                />
                            </div>
                        </div>

                        {/* Website */}
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-lg bg-emerald-600 flex items-center justify-center flex-shrink-0">
                                <Globe2 className="w-5 h-5 text-white" />
                            </div>
                            <div className="flex-1">
                                <label className="block text-xs font-medium text-zinc-500 mb-0.5">{t("website") || "Web Sitesi"}</label>
                                <input
                                    type="url"
                                    value={socialWebsite}
                                    onChange={(e) => setSocialWebsite(e.target.value)}
                                    placeholder="https://example.com"
                                    className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm"
                                />
                            </div>
                        </div>
                        {/* YouTube */}
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-lg bg-red-600 flex items-center justify-center flex-shrink-0">
                                <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="currentColor"><path d="M23.499 6.203a3.008 3.008 0 00-2.089-2.089C19.518 3.5 12 3.5 12 3.5s-7.518 0-9.41.614A3.008 3.008 0 00.501 6.203C0 8.08 0 12 0 12s0 3.92.501 5.797a3.008 3.008 0 002.089 2.089c1.892.614 9.41.614 9.41.614s7.518 0 9.41-.614a3.008 3.008 0 002.089-2.089C24 15.92 24 12 24 12s0-3.92-.501-5.797zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>
                            </div>
                            <div className="flex-1">
                                <label className="block text-xs font-medium text-zinc-500 mb-0.5">YouTube</label>
                                <input type="text" value={socialYoutube} onChange={(e) => setSocialYoutube(e.target.value)} placeholder="youtube.com/@kanaliniz" className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm" />
                            </div>
                        </div>

                        {/* TikTok */}
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-lg bg-black flex items-center justify-center flex-shrink-0">
                                <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="currentColor"><path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/></svg>
                            </div>
                            <div className="flex-1">
                                <label className="block text-xs font-medium text-zinc-500 mb-0.5">TikTok</label>
                                <input type="text" value={socialTiktok} onChange={(e) => setSocialTiktok(e.target.value)} placeholder="tiktok.com/@kullaniciadi" className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm" />
                            </div>
                        </div>

                        {/* Instagram */}
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-purple-600 via-pink-500 to-orange-400 flex items-center justify-center flex-shrink-0">
                                <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>
                            </div>
                            <div className="flex-1">
                                <label className="block text-xs font-medium text-zinc-500 mb-0.5">Instagram</label>
                                <input type="text" value={socialInstagram} onChange={(e) => setSocialInstagram(e.target.value)} placeholder="instagram.com/kullaniciadi" className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm" />
                            </div>
                        </div>

                        {/* Facebook */}
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-lg bg-blue-600 flex items-center justify-center flex-shrink-0">
                                <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
                            </div>
                            <div className="flex-1">
                                <label className="block text-xs font-medium text-zinc-500 mb-0.5">Facebook</label>
                                <input type="text" value={socialFacebook} onChange={(e) => setSocialFacebook(e.target.value)} placeholder="facebook.com/kullaniciadi" className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm" />
                            </div>
                        </div>
                    </div>
                </section>

                {/* ===== NOTIFICATION PREFERENCES ===== */}
                <section className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-6 mb-6">
                    <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
                        <Bell className="w-5 h-5 text-yellow-500" />
                        {t("notification_prefs") || "Bildirim Tercihleri"}
                    </h2>

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

                    <div className="py-4 border-b border-zinc-100 dark:border-zinc-800">
                        <div className="mb-3">
                            <span className="block">{t("app_language") || "Uygulama Dili"}</span>
                            <span className="text-sm text-zinc-500">{t("app_language_desc") || "Arayüz dilini değiştir"}</span>
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                            {([
                                { code: "TR" as const, flag: "🇹🇷", label: "Türkçe" },
                                { code: "EN" as const, flag: "🇬🇧", label: "English" },
                                { code: "RU" as const, flag: "🇷🇺", label: "Русский" },
                                { code: "AZ" as const, flag: "🇦🇿", label: "Azərbaycan" },
                                { code: "ES" as const, flag: "🇪🇸", label: "Español" },
                                { code: "KZ" as const, flag: "🇰🇿", label: "Қазақ" },
                                { code: "JP" as const, flag: "🇯🇵", label: "日本語" },
                                { code: "CN" as const, flag: "🇨🇳", label: "中文" },
                                { code: "KR" as const, flag: "🇰🇷", label: "한국어" },
                            ]).map((lang) => (
                                <button
                                    key={lang.code}
                                    onClick={() => setLanguage(lang.code)}
                                    className={`px-3 py-2 rounded-lg font-medium transition-all flex items-center gap-2 text-sm ${language === lang.code ? "bg-blue-600 text-white shadow-md" : "bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700"}`}
                                >
                                    <span className="text-base">{lang.flag}</span>
                                    {lang.label}
                                </button>
                            ))}
                        </div>
                    </div>

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
                            {lastLoginDate && (
                                <div className="flex items-center justify-between text-sm">
                                    <span className="text-zinc-500">{t("last_login") || "Son Giriş"}</span>
                                    <span className="font-medium">{new Date(lastLoginDate).toLocaleDateString(language === "TR" ? "tr-TR" : language === "EN" ? "en-US" : undefined, { year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                                </div>
                            )}
                        </div>
                    </div>
                </section>

                {/* ===== DATA MANAGEMENT ===== */}
                <section className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-6 mb-6">
                    <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
                        <Database className="w-5 h-5 text-cyan-500" />
                        {t("data_management") || "Veri Yönetimi"}
                    </h2>

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

                {/* ===== §7 PASSWORD MANAGEMENT ===== */}
                <section className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-6">
                    <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                        <Lock className="w-5 h-5 text-amber-500" />
                        {t("password_management") || "Şifre Yönetimi"}
                    </h2>
                    {hasPassword ? (
                        <p className="text-green-600 dark:text-green-400 text-sm font-medium">✅ {t("password_already_set") || "Şifre oluşturulmuş. Değiştirmek için aşağıdaki alanları kullanın."}</p>
                    ) : (
                        <p className="text-zinc-500 text-sm mb-3">{t("password_google_info") || "Google ile giriş yaptınız. İsteğe bağlı olarak bir şifre belirleyebilirsiniz."}</p>
                    )}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
                        <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder={t("new_password") || "Yeni Şifre"} className="px-4 py-3 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                        <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder={t("confirm_password") || "Şifre Tekrar"} className="px-4 py-3 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                    <button onClick={handleSetPassword} disabled={isLoading} className="mt-3 px-5 py-2.5 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl transition-all text-sm">
                        {hasPassword ? (t("change_password") || "Şifreyi Değiştir") : (t("set_password") || "Şifre Oluştur")}
                    </button>
                </section>

                {/* ===== §5 PHONE VERIFICATION ===== */}
                <section className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-6">
                    <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                        <Phone className="w-5 h-5 text-green-500" />
                        {t("phone_verification") || "Telefon Doğrulama"}
                    </h2>
                    <p className="text-zinc-500 text-sm mb-3">{t("phone_info") || "Telefon numaranızı doğrulamak sesli özellikler için gereklidir."}</p>
                    <div className="flex gap-2">
                        <input type="tel" value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} placeholder="+90 5XX XXX XX XX" disabled={phoneVerified} className="flex-1 px-4 py-3 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-green-500 disabled:opacity-50" />
                        {!phoneVerified && (
                            <button onClick={handleSendVerification} className="px-4 py-3 bg-green-600 hover:bg-green-700 text-white font-bold rounded-xl text-sm transition-all">
                                {t("send_code") || "Kod Gönder"}
                            </button>
                        )}
                    </div>
                    {phoneVerified && <p className="text-green-500 text-sm mt-2">✅ {t("phone_verified") || "Telefon numarası doğrulandı"}</p>}
                    {showVerifyInput && !phoneVerified && (
                        <div className="flex gap-2 mt-3">
                            <input type="text" value={verificationCode} onChange={(e) => setVerificationCode(e.target.value)} placeholder={t("enter_code") || "Doğrulama kodu"} maxLength={6} className="flex-1 px-4 py-3 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-green-500 font-mono text-center tracking-widest" />
                            <button onClick={handleVerifyCode} className="px-4 py-3 bg-green-600 hover:bg-green-700 text-white font-bold rounded-xl text-sm">
                                {t("verify") || "Doğrula"}
                            </button>
                        </div>
                    )}
                </section>

                {/* ===== §8 MESSAGING SETTINGS ===== */}
                <section className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-6">
                    <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                        <MessageCircle className="w-5 h-5 text-blue-500" />
                        {t("messaging_settings") || "Mesajlaşma Ayarları"}
                    </h2>
                    <div className="space-y-4">
                        <div className="flex items-center justify-between"><span>{t("typing_indicator") || "Yazıyor göstergesi"}</span><ToggleSwitch enabled={typingIndicator} onToggle={() => setTypingIndicator(!typingIndicator)} /></div>
                        <div className="flex items-center justify-between"><span>{t("read_receipts_setting") || "Okundu bilgisi"}</span><ToggleSwitch enabled={readReceipts} onToggle={() => setReadReceipts(!readReceipts)} /></div>
                        <div className="flex items-center justify-between"><span>{t("link_preview_setting") || "Bağlantı önizleme"}</span><ToggleSwitch enabled={linkPreview} onToggle={() => setLinkPreview(!linkPreview)} /></div>
                        <div className="flex items-center justify-between"><span>{t("gif_autoplay") || "GIF otomatik oynat"}</span><ToggleSwitch enabled={gifAutoplay} onToggle={() => setGifAutoplay(!gifAutoplay)} /></div>
                        <div className="flex items-center justify-between"><span>{t("enter_to_send") || "Enter ile gönder"}</span><ToggleSwitch enabled={enterToSend} onToggle={() => setEnterToSend(!enterToSend)} /></div>
                        <div className="flex items-center justify-between"><span>{t("sticker_suggestions") || "Sticker önerileri"}</span><ToggleSwitch enabled={stickerSuggestions} onToggle={() => setStickerSuggestions(!stickerSuggestions)} /></div>
                        <div className="flex items-center justify-between">
                            <span>{t("msg_font_size") || "Mesaj yazı boyutu"}</span>
                            <select value={msgFontSize} onChange={(e) => setMsgFontSize(e.target.value)} className="px-3 py-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-sm">
                                <option value="small">{t("small") || "Küçük"}</option>
                                <option value="medium">{t("medium") || "Orta"}</option>
                                <option value="large">{t("large") || "Büyük"}</option>
                            </select>
                        </div>
                        <div className="flex items-center justify-between">
                            <span>{t("voice_msg_quality") || "Sesli mesaj kalitesi"}</span>
                            <select value={voiceMsgQuality} onChange={(e) => setVoiceMsgQuality(e.target.value)} className="px-3 py-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-sm">
                                <option value="low">{t("low") || "Düşük"}</option>
                                <option value="normal">{t("normal_quality") || "Normal"}</option>
                                <option value="high">{t("high") || "Yüksek"}</option>
                            </select>
                        </div>
                        <div className="flex items-center justify-between">
                            <span>{t("chat_background") || "Sohbet arkaplanı"}</span>
                            <select value={chatBackground} onChange={(e) => setChatBackground(e.target.value)} className="px-3 py-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-sm">
                                <option value="default">{t("default_bg") || "Varsayılan"}</option>
                                <option value="dark">{t("dark_bg") || "Koyu"}</option>
                                <option value="gradient">{t("gradient_bg") || "Gradient"}</option>
                                <option value="pattern">{t("pattern_bg") || "Desenli"}</option>
                            </select>
                        </div>
                    </div>
                </section>

                {/* ===== §8 PRIVACY SETTINGS ===== */}
                <section className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-6">
                    <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                        <Eye className="w-5 h-5 text-indigo-500" />
                        {t("privacy_settings") || "Gizlilik Ayarları"}
                    </h2>
                    <div className="space-y-4">
                        <div className="flex items-center justify-between"><span>{t("hide_friend_list") || "Arkadaş listemi gizle"}</span><ToggleSwitch enabled={hideFriendList} onToggle={() => setHideFriendList(!hideFriendList)} /></div>
                        <div className="flex items-center justify-between"><span>{t("show_last_seen") || "Son görülme"}</span><ToggleSwitch enabled={showLastSeen} onToggle={() => setShowLastSeen(!showLastSeen)} /></div>
                        <div className="flex items-center justify-between"><span>{t("public_projects_setting") || "Projelerim herkese açık"}</span><ToggleSwitch enabled={publicProjects} onToggle={() => setPublicProjects(!publicProjects)} /></div>
                        <div className="flex items-center justify-between">
                            <span>{t("who_can_add") || "Kimler arkadaş ekleyebilir"}</span>
                            <select value={whoCanAdd} onChange={(e) => setWhoCanAdd(e.target.value)} className="px-3 py-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-sm">
                                <option value="everyone">{t("everyone") || "Herkes"}</option>
                                <option value="friends_of_friends">{t("friends_of_friends") || "Arkadaşların arkadaşları"}</option>
                                <option value="nobody">{t("nobody") || "Hiç kimse"}</option>
                            </select>
                        </div>
                        <div className="flex items-center justify-between">
                            <span>{t("photo_visibility") || "Fotoğraf görünürlüğü"}</span>
                            <select value={photoVisibility} onChange={(e) => setPhotoVisibility(e.target.value)} className="px-3 py-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-sm">
                                <option value="everyone">{t("everyone") || "Herkes"}</option>
                                <option value="friends">{t("friends_only") || "Sadece arkadaşlar"}</option>
                                <option value="nobody">{t("nobody") || "Hiç kimse"}</option>
                            </select>
                        </div>
                        <div className="flex items-center justify-between">
                            <span>{t("bio_visibility") || "Bio görünürlüğü"}</span>
                            <select value={bioVisibility} onChange={(e) => setBioVisibility(e.target.value)} className="px-3 py-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-sm">
                                <option value="everyone">{t("everyone") || "Herkes"}</option>
                                <option value="friends">{t("friends_only") || "Sadece arkadaşlar"}</option>
                                <option value="nobody">{t("nobody") || "Hiç kimse"}</option>
                            </select>
                        </div>
                    </div>
                </section>

                {/* ===== §8 NOTIFICATION SETTINGS ===== */}
                <section className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-6">
                    <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                        <Bell className="w-5 h-5 text-rose-500" />
                        {t("notification_settings") || "Bildirim Ayarları"}
                    </h2>
                    <div className="space-y-4">
                        <div className="flex items-center justify-between"><span>{t("msg_notification") || "Mesaj bildirimleri"}</span><ToggleSwitch enabled={msgNotifications} onToggle={() => setMsgNotifications(!msgNotifications)} /></div>
                        <div className="flex items-center justify-between"><span>{t("call_notification") || "Arama bildirimleri"}</span><ToggleSwitch enabled={callNotifications} onToggle={() => setCallNotifications(!callNotifications)} /></div>
                        <div className="flex items-center justify-between"><span>{t("friend_req_notification") || "Arkadaşlık isteği bildirimleri"}</span><ToggleSwitch enabled={friendReqNotifications} onToggle={() => setFriendReqNotifications(!friendReqNotifications)} /></div>
                        <div className="flex items-center justify-between"><span>{t("like_notification") || "Beğeni bildirimleri"}</span><ToggleSwitch enabled={likeNotifications} onToggle={() => setLikeNotifications(!likeNotifications)} /></div>
                        <div className="flex items-center justify-between"><span>{t("notification_sound") || "Bildirim sesi"}</span><ToggleSwitch enabled={notifSound} onToggle={() => setNotifSound(!notifSound)} /></div>
                        <div className="flex items-center justify-between"><span>{t("dnd_mode") || "Rahatsız Etmeyin modu"}</span><ToggleSwitch enabled={dndMode} onToggle={() => setDndMode(!dndMode)} /></div>
                        {dndMode && (
                            <div className="flex items-center justify-between">
                                <span>{t("dnd_schedule") || "DND zamanlama"}</span>
                                <input type="text" value={dndSchedule} onChange={(e) => setDndSchedule(e.target.value)} placeholder="22:00 - 08:00" className="px-3 py-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-sm w-32 text-center" />
                            </div>
                        )}
                    </div>
                </section>

                {/* ===== §8 APPEARANCE & ACCESSIBILITY ===== */}
                <section className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-6">
                    <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                        <Paintbrush className="w-5 h-5 text-pink-500" />
                        {t("appearance_settings") || "Görünüm & Erişilebilirlik"}
                    </h2>
                    <div className="space-y-4">
                        <div className="flex items-center justify-between"><span>{t("compact_mode") || "Kompakt mod"}</span><ToggleSwitch enabled={compactMode} onToggle={() => setCompactMode(!compactMode)} /></div>
                        <div className="flex items-center justify-between"><span>{t("reduce_animations") || "Animasyonları azalt"}</span><ToggleSwitch enabled={reduceAnimations} onToggle={() => setReduceAnimations(!reduceAnimations)} /></div>
                        <div className="flex items-center justify-between"><span>{t("high_contrast") || "Yüksek kontrast"}</span><ToggleSwitch enabled={highContrast} onToggle={() => setHighContrast(!highContrast)} /></div>
                        <div className="flex items-center justify-between">
                            <span>{t("bubble_color") || "Baloncuk rengi"}</span>
                            <div className="flex gap-1.5">
                                {["#3B82F6", "#22C55E", "#EF4444", "#F97316", "#8B5CF6", "#EC4899"].map(c => (
                                    <button key={c} onClick={() => setBubbleColor(c)} className={`w-7 h-7 rounded-full transition-all ${bubbleColor === c ? "ring-2 ring-offset-2 ring-offset-white dark:ring-offset-zinc-900 ring-blue-500 scale-110" : ""}`} style={{ backgroundColor: c }} />
                                ))}
                            </div>
                        </div>
                        <div className="flex items-center justify-between">
                            <span>{t("ui_font_size") || "Yazı boyutu"}</span>
                            <select value={uiFontSize} onChange={(e) => setUiFontSize(e.target.value)} className="px-3 py-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-sm">
                                <option value="small">{t("small") || "Küçük"}</option>
                                <option value="medium">{t("medium") || "Orta"}</option>
                                <option value="large">{t("large") || "Büyük"}</option>
                            </select>
                        </div>
                        <div className="flex items-center justify-between">
                            <span>{t("emoji_style") || "Emoji stili"}</span>
                            <select value={emojiStyle} onChange={(e) => setEmojiStyle(e.target.value)} className="px-3 py-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-sm">
                                <option value="native">{t("native") || "Yerel"}</option>
                                <option value="twemoji">Twemoji</option>
                                <option value="noto">Noto</option>
                            </select>
                        </div>
                    </div>
                </section>

                {/* ===== §8 SECURITY ===== */}
                <section className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-6">
                    <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                        <Shield className="w-5 h-5 text-cyan-500" />
                        {t("security_settings") || "Güvenlik Ayarları"}
                    </h2>
                    <div className="space-y-4">
                        <div className="flex items-center justify-between py-3 border-b border-zinc-100 dark:border-zinc-800">
                            <div>
                                <span className="block">{t("last_login") || "Son giriş tarihi"}</span>
                                <span className="text-sm text-zinc-500">{lastLoginDate ? new Date(lastLoginDate).toLocaleString() : "—"}</span>
                            </div>
                        </div>
                        <div className="flex items-center justify-between">
                            <div>
                                <span className="block">{t("freeze_account") || "Hesabı Dondur"}</span>
                                <span className="text-xs text-zinc-500">{t("freeze_account_desc") || "Hesabınız geçici olarak devre dışı bırakılır"}</span>
                            </div>
                            <button onClick={handleFreezeAccount} className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${freezeAccount ? "bg-blue-600 hover:bg-blue-700 text-white" : "bg-zinc-200 dark:bg-zinc-700 hover:bg-zinc-300 dark:hover:bg-zinc-600"}`}>
                                {freezeAccount ? (t("unfreeze") || "Dondurma Kaldır") : (t("freeze") || "Dondur")}
                            </button>
                        </div>
                    </div>
                </section>

                {/* ===== DANGER ZONE ===== */}
                <section className="bg-white dark:bg-zinc-900 rounded-2xl border border-red-200 dark:border-red-900/50 p-6">
                    <h2 className="text-xl font-bold mb-4 flex items-center gap-2 text-red-600">
                        <Trash2 className="w-5 h-5" />
                        {t("danger_zone") || "Tehlikeli Bölge"}
                    </h2>

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
