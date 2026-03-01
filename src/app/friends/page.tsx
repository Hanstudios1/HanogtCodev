"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { ArrowLeft, UserPlus, Users, Clock, Ban, Search, Check, X, MessageCircle, UserX, Hash } from "lucide-react";
import Header from "@/components/Header";
import { useI18n } from "@/lib/i18n";
import { db } from "@/lib/firebase";
import { doc, setDoc, getDoc, deleteDoc, collection, query, where, getDocs, onSnapshot, serverTimestamp } from "firebase/firestore";
import ProfileModal from "@/components/ProfileModal";
import type { UserProfile } from "@/components/ProfileModal";

type FriendRequest = {
    id: string;
    fromEmail: string;
    fromUsername: string;
    fromAvatar: string;
    fromNickname: string;
    fromTag: string;
    toEmail: string;
    status: "pending" | "accepted" | "rejected";
    createdAt: string;
};

type Friend = {
    email: string;
    username: string;
    avatarUrl: string;
    nickname: string;
    nicknameTag: string;
    isOnline: boolean;
    customStatus?: string;
    statusEmoji?: string;
    bio?: string;
    accentColor?: string;
    bannerUrl?: string;
    favoriteLangs?: string[];
    socialGithub?: string;
    socialLinkedin?: string;
    socialTwitter?: string;
    socialWebsite?: string;
    publicProfile?: boolean;
    publicProjects?: boolean;
    badges?: string[];
};

type Tab = "all" | "pending" | "add" | "blocked";

export default function FriendsPage() {
    const { data: session } = useSession();
    const router = useRouter();
    const { t } = useI18n();

    const [activeTab, setActiveTab] = useState<Tab>("all");
    const [friends, setFriends] = useState<Friend[]>([]);
    const [pendingRequests, setPendingRequests] = useState<FriendRequest[]>([]);
    const [sentRequests, setSentRequests] = useState<FriendRequest[]>([]);
    const [blockedUsers, setBlockedUsers] = useState<string[]>([]);
    const [searchQuery, setSearchQuery] = useState("");
    const [addInput, setAddInput] = useState("");
    const [message, setMessage] = useState("");
    const [messageType, setMessageType] = useState<"success" | "error">("success");
    const [selectedProfile, setSelectedProfile] = useState<UserProfile | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        if (!session?.user) {
            router.push("/login");
            return;
        }
        loadFriendsData();
    }, [session]);

    const loadFriendsData = async () => {
        if (!session?.user?.email) return;
        try {
            // Load friends list
            const friendsDoc = await getDoc(doc(db, "users", session.user.email));
            if (friendsDoc.exists()) {
                const data = friendsDoc.data();
                const friendEmails: string[] = data.friends || [];
                setBlockedUsers(data.blockedUsers || []);

                // Load friend profiles
                const friendProfiles: Friend[] = [];
                for (const email of friendEmails) {
                    const userDoc = await getDoc(doc(db, "users", email));
                    if (userDoc.exists()) {
                        const userData = userDoc.data();
                        friendProfiles.push({
                            email,
                            username: userData.username || "",
                            avatarUrl: userData.avatarUrl || "",
                            nickname: userData.nickname || "",
                            nicknameTag: userData.nicknameTag || "0000",
                            isOnline: userData.isOnline || false,
                            customStatus: userData.customStatus,
                            statusEmoji: userData.statusEmoji,
                            bio: userData.bio,
                            accentColor: userData.accentColor,
                            bannerUrl: userData.bannerUrl,
                            favoriteLangs: userData.favoriteLangs,
                            socialGithub: userData.socialGithub,
                            socialLinkedin: userData.socialLinkedin,
                            socialTwitter: userData.socialTwitter,
                            socialWebsite: userData.socialWebsite,
                            publicProfile: userData.publicProfile,
                            publicProjects: userData.publicProjects,
                            badges: userData.badges,
                        });
                    }
                }
                setFriends(friendProfiles);
            }

            // Load pending friend requests (received)
            const receivedQuery = query(
                collection(db, "friendRequests"),
                where("toEmail", "==", session.user.email),
                where("status", "==", "pending")
            );
            const receivedSnapshot = await getDocs(receivedQuery);
            const received: FriendRequest[] = receivedSnapshot.docs.map(d => ({
                id: d.id,
                ...d.data() as Omit<FriendRequest, "id">
            }));
            setPendingRequests(received);

            // Load sent requests
            const sentQuery = query(
                collection(db, "friendRequests"),
                where("fromEmail", "==", session.user.email),
                where("status", "==", "pending")
            );
            const sentSnapshot = await getDocs(sentQuery);
            const sent: FriendRequest[] = sentSnapshot.docs.map(d => ({
                id: d.id,
                ...d.data() as Omit<FriendRequest, "id">
            }));
            setSentRequests(sent);
        } catch (error) {
            console.error("Error loading friends data:", error);
        }
    };

    const showMessage = (text: string, type: "success" | "error" = "success") => {
        setMessage(text);
        setMessageType(type);
        setTimeout(() => setMessage(""), 4000);
    };

    const handleSendRequest = async () => {
        if (!session?.user?.email || !addInput.includes("#")) {
            showMessage(t("invalid_tag_format") || "Geçersiz format! Örnek: Oyuncu#1234", "error");
            return;
        }

        const [nickname, tag] = addInput.split("#");
        if (!nickname || !tag || tag.length !== 4) {
            showMessage(t("invalid_tag_format") || "Geçersiz format! Örnek: Oyuncu#1234", "error");
            return;
        }

        setIsLoading(true);
        try {
            // Find user by nickname#tag
            const usersQuery = query(
                collection(db, "users"),
                where("nickname", "==", nickname),
                where("nicknameTag", "==", tag)
            );
            const usersSnapshot = await getDocs(usersQuery);

            if (usersSnapshot.empty) {
                showMessage(t("user_not_found") || "Kullanıcı bulunamadı!", "error");
                setIsLoading(false);
                return;
            }

            const targetUser = usersSnapshot.docs[0];
            const targetEmail = targetUser.data().email;

            // Don't add yourself
            if (targetEmail === session.user.email) {
                showMessage(t("cannot_add_self") || "Kendinizi arkadaş olarak ekleyemezsiniz!", "error");
                setIsLoading(false);
                return;
            }

            // Check if already friends
            const myDoc = await getDoc(doc(db, "users", session.user.email));
            const myFriends: string[] = myDoc.data()?.friends || [];
            if (myFriends.includes(targetEmail)) {
                showMessage(t("already_friends") || "Bu kullanıcı zaten arkadaşınız!", "error");
                setIsLoading(false);
                return;
            }

            // Check for existing request
            const existingQuery = query(
                collection(db, "friendRequests"),
                where("fromEmail", "==", session.user.email),
                where("toEmail", "==", targetEmail),
                where("status", "==", "pending")
            );
            const existingSnapshot = await getDocs(existingQuery);
            if (!existingSnapshot.empty) {
                showMessage(t("request_already_sent") || "Zaten bir istek gönderilmiş!", "error");
                setIsLoading(false);
                return;
            }

            // Send friend request
            const requestId = `${session.user.email}_${targetEmail}_${Date.now()}`;
            await setDoc(doc(db, "friendRequests", requestId), {
                fromEmail: session.user.email,
                fromUsername: myDoc.data()?.username || session.user.name || "",
                fromAvatar: myDoc.data()?.avatarUrl || session.user.image || "",
                fromNickname: myDoc.data()?.nickname || "",
                fromTag: myDoc.data()?.nicknameTag || "",
                toEmail: targetEmail,
                status: "pending",
                createdAt: new Date().toISOString(),
            });

            showMessage(t("request_sent") || "Arkadaşlık isteği gönderildi!", "success");
            setAddInput("");
            loadFriendsData();
        } catch (error) {
            console.error("Error sending friend request:", error);
            showMessage(t("error_occurred") || "Hata oluştu!", "error");
        } finally {
            setIsLoading(false);
        }
    };

    const handleAcceptRequest = async (request: FriendRequest) => {
        if (!session?.user?.email) return;
        try {
            // Add each other as friends
            const myDoc = await getDoc(doc(db, "users", session.user.email));
            const myFriends: string[] = myDoc.data()?.friends || [];

            const theirDoc = await getDoc(doc(db, "users", request.fromEmail));
            const theirFriends: string[] = theirDoc.data()?.friends || [];

            await setDoc(doc(db, "users", session.user.email), {
                friends: [...new Set([...myFriends, request.fromEmail])]
            }, { merge: true });

            await setDoc(doc(db, "users", request.fromEmail), {
                friends: [...new Set([...theirFriends, session.user.email])]
            }, { merge: true });

            // Update request status
            await setDoc(doc(db, "friendRequests", request.id), {
                status: "accepted"
            }, { merge: true });

            showMessage(t("request_accepted") || "Arkadaşlık isteği kabul edildi!");
            loadFriendsData();
        } catch (error) {
            console.error("Error accepting request:", error);
            showMessage(t("error_occurred") || "Hata oluştu!", "error");
        }
    };

    const handleRejectRequest = async (request: FriendRequest) => {
        try {
            await setDoc(doc(db, "friendRequests", request.id), {
                status: "rejected"
            }, { merge: true });

            showMessage(t("request_rejected") || "Arkadaşlık isteği reddedildi.");
            loadFriendsData();
        } catch (error) {
            console.error("Error rejecting request:", error);
        }
    };

    const handleRemoveFriend = async (friendEmail: string) => {
        if (!session?.user?.email) return;
        try {
            const myDoc = await getDoc(doc(db, "users", session.user.email));
            const myFriends: string[] = (myDoc.data()?.friends || []).filter((e: string) => e !== friendEmail);

            const theirDoc = await getDoc(doc(db, "users", friendEmail));
            const theirFriends: string[] = (theirDoc.data()?.friends || []).filter((e: string) => e !== session.user?.email);

            await setDoc(doc(db, "users", session.user.email), { friends: myFriends }, { merge: true });
            await setDoc(doc(db, "users", friendEmail), { friends: theirFriends }, { merge: true });

            showMessage(t("friend_removed") || "Arkadaş silindi.");
            loadFriendsData();
        } catch (error) {
            console.error("Error removing friend:", error);
        }
    };

    const handleBlockUser = async (email: string) => {
        if (!session?.user?.email) return;
        try {
            const newBlocked = [...new Set([...blockedUsers, email])];
            await setDoc(doc(db, "users", session.user.email), { blockedUsers: newBlocked }, { merge: true });
            // Also remove from friends
            await handleRemoveFriend(email);
            setBlockedUsers(newBlocked);
            showMessage(t("user_blocked") || "Kullanıcı engellendi.");
        } catch (error) {
            console.error("Error blocking user:", error);
        }
    };

    const handleUnblockUser = async (email: string) => {
        if (!session?.user?.email) return;
        try {
            const newBlocked = blockedUsers.filter(e => e !== email);
            await setDoc(doc(db, "users", session.user.email), { blockedUsers: newBlocked }, { merge: true });
            setBlockedUsers(newBlocked);
            showMessage(t("user_unblocked") || "Kullanıcı engeli kaldırıldı.");
        } catch (error) {
            console.error("Error unblocking user:", error);
        }
    };

    const filteredFriends = friends.filter(f =>
        f.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
        f.nickname.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const onlineFriends = filteredFriends.filter(f => f.isOnline);
    const offlineFriends = filteredFriends.filter(f => !f.isOnline);

    if (!session?.user) return null;

    const tabs: { id: Tab; icon: React.ElementType; label: string; count?: number }[] = [
        { id: "all", icon: Users, label: t("all_friends") || "Tüm Arkadaşlar", count: friends.length },
        { id: "pending", icon: Clock, label: t("pending_requests") || "Bekleyen", count: pendingRequests.length },
        { id: "add", icon: UserPlus, label: t("add_friend") || "Arkadaş Ekle" },
        { id: "blocked", icon: Ban, label: t("blocked_users") || "Engellenenler", count: blockedUsers.length },
    ];

    return (
        <div className="min-h-screen bg-zinc-50 dark:bg-black text-zinc-900 dark:text-white">
            <Header />

            <main className="pt-24 px-6 max-w-2xl mx-auto pb-12">
                <button
                    onClick={() => router.back()}
                    className="flex items-center gap-2 text-zinc-500 hover:text-zinc-900 dark:hover:text-white mb-6 transition-colors"
                >
                    <ArrowLeft className="w-5 h-5" />
                    {t("back") || "Geri"}
                </button>

                <h1 className="text-3xl font-bold mb-2">{t("friends") || "Arkadaşlar"}</h1>
                <p className="text-zinc-500 mb-6">{t("friends_desc") || "Arkadaşlarınızı yönetin ve yeni arkadaşlar ekleyin"}</p>

                {/* Message */}
                {message && (
                    <div className={`mb-6 p-4 rounded-xl text-sm font-medium ${messageType === "success"
                        ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400"
                        : "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400"
                        }`}>
                        {message}
                    </div>
                )}

                {/* Tabs */}
                <div className="flex gap-1 mb-6 bg-white dark:bg-zinc-900 rounded-xl p-1.5 border border-zinc-200 dark:border-zinc-800">
                    {tabs.map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all ${activeTab === tab.id
                                ? "bg-blue-600 text-white shadow-md"
                                : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800"
                                }`}
                        >
                            <tab.icon className="w-4 h-4" />
                            <span className="hidden sm:inline">{tab.label}</span>
                            {tab.count !== undefined && tab.count > 0 && (
                                <span className={`text-xs px-1.5 py-0.5 rounded-full ${activeTab === tab.id ? "bg-white/20" : "bg-zinc-200 dark:bg-zinc-700"
                                    }`}>
                                    {tab.count}
                                </span>
                            )}
                        </button>
                    ))}
                </div>

                {/* ===== ALL FRIENDS TAB ===== */}
                {activeTab === "all" && (
                    <div>
                        {/* Search */}
                        <div className="relative mb-4">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder={t("search_friends") || "Arkadaş ara..."}
                                className="w-full pl-10 pr-4 py-3 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                        </div>

                        {friends.length === 0 ? (
                            <div className="text-center py-16">
                                <Users className="w-16 h-16 text-zinc-300 dark:text-zinc-700 mx-auto mb-4" />
                                <p className="text-zinc-500 text-lg font-medium">{t("no_friends_yet") || "Henüz arkadaşınız yok"}</p>
                                <p className="text-zinc-400 text-sm mt-1">{t("no_friends_desc") || "Arkadaş Ekle sekmesinden yeni arkadaşlar bulun!"}</p>
                                <button
                                    onClick={() => setActiveTab("add")}
                                    className="mt-4 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-xl transition-all"
                                >
                                    <UserPlus className="w-4 h-4 inline mr-2" />
                                    {t("add_friend") || "Arkadaş Ekle"}
                                </button>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {/* Online friends */}
                                {onlineFriends.length > 0 && (
                                    <>
                                        <p className="text-xs font-bold text-zinc-500 uppercase px-1">
                                            {t("online") || "Çevrimiçi"} — {onlineFriends.length}
                                        </p>
                                        {onlineFriends.map(friend => (
                                            <FriendCard key={friend.email} friend={friend} onProfile={setSelectedProfile} onRemove={handleRemoveFriend} onBlock={handleBlockUser} onMessage={() => router.push(`/messages/${encodeURIComponent(friend.email)}`)} t={t} />
                                        ))}
                                    </>
                                )}

                                {/* Offline friends */}
                                {offlineFriends.length > 0 && (
                                    <>
                                        <p className="text-xs font-bold text-zinc-500 uppercase px-1 mt-4">
                                            {t("offline") || "Çevrimdışı"} — {offlineFriends.length}
                                        </p>
                                        {offlineFriends.map(friend => (
                                            <FriendCard key={friend.email} friend={friend} onProfile={setSelectedProfile} onRemove={handleRemoveFriend} onBlock={handleBlockUser} onMessage={() => router.push(`/messages/${encodeURIComponent(friend.email)}`)} t={t} />
                                        ))}
                                    </>
                                )}
                            </div>
                        )}
                    </div>
                )}

                {/* ===== PENDING REQUESTS TAB ===== */}
                {activeTab === "pending" && (
                    <div className="space-y-3">
                        {/* Received */}
                        <h3 className="text-sm font-bold text-zinc-500 uppercase">{t("received_requests") || "Gelen İstekler"} ({pendingRequests.length})</h3>
                        {pendingRequests.length === 0 ? (
                            <p className="text-zinc-400 text-sm py-4 text-center">{t("no_pending") || "Bekleyen istek yok"}</p>
                        ) : (
                            pendingRequests.map(req => (
                                <div key={req.id} className="flex items-center gap-3 p-4 bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800">
                                    {req.fromAvatar ? (
                                        <img src={req.fromAvatar} alt="" className="w-10 h-10 rounded-full object-cover" referrerPolicy="no-referrer" />
                                    ) : (
                                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold">
                                            {req.fromUsername?.charAt(0) || "?"}
                                        </div>
                                    )}
                                    <div className="flex-1 min-w-0">
                                        <p className="font-semibold truncate">{req.fromUsername}</p>
                                        {req.fromNickname && (
                                            <p className="text-xs text-zinc-500 font-mono">{req.fromNickname}#{req.fromTag}</p>
                                        )}
                                    </div>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => handleAcceptRequest(req)}
                                            className="p-2 rounded-lg bg-green-100 dark:bg-green-900/30 text-green-600 hover:bg-green-200 dark:hover:bg-green-900/50 transition-colors"
                                            title={t("accept") || "Kabul Et"}
                                        >
                                            <Check className="w-5 h-5" />
                                        </button>
                                        <button
                                            onClick={() => handleRejectRequest(req)}
                                            className="p-2 rounded-lg bg-red-100 dark:bg-red-900/30 text-red-600 hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors"
                                            title={t("reject") || "Reddet"}
                                        >
                                            <X className="w-5 h-5" />
                                        </button>
                                    </div>
                                </div>
                            ))
                        )}

                        {/* Sent */}
                        <h3 className="text-sm font-bold text-zinc-500 uppercase mt-6">{t("sent_requests") || "Gönderilen İstekler"} ({sentRequests.length})</h3>
                        {sentRequests.length === 0 ? (
                            <p className="text-zinc-400 text-sm py-4 text-center">{t("no_sent") || "Gönderilen istek yok"}</p>
                        ) : (
                            sentRequests.map(req => (
                                <div key={req.id} className="flex items-center gap-3 p-4 bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 opacity-70">
                                    <div className="w-10 h-10 rounded-full bg-zinc-200 dark:bg-zinc-700 flex items-center justify-center">
                                        <Clock className="w-5 h-5 text-zinc-400" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="font-medium truncate text-zinc-500">{t("sent_to") || "Gönderildi"}: {req.toEmail}</p>
                                        <p className="text-xs text-zinc-400">{t("waiting_response") || "Yanıt bekleniyor..."}</p>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                )}

                {/* ===== ADD FRIEND TAB ===== */}
                {activeTab === "add" && (
                    <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-6">
                        <div className="text-center mb-6">
                            <div className="w-16 h-16 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center mx-auto mb-4">
                                <UserPlus className="w-8 h-8 text-blue-500" />
                            </div>
                            <h3 className="text-xl font-bold">{t("add_friend") || "Arkadaş Ekle"}</h3>
                            <p className="text-zinc-500 text-sm mt-1">{t("add_friend_desc") || "Takma Ad ve etiket ile arkadaşlık isteği gönderin"}</p>
                        </div>

                        <div className="flex gap-2">
                            <div className="flex-1 relative">
                                <Hash className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                                <input
                                    type="text"
                                    value={addInput}
                                    onChange={(e) => {
                                        let val = e.target.value;
                                        // Auto-add # after nickname if user types without it
                                        if (val.length >= 1 && !val.includes("#") && /\d/.test(val.slice(-1)) && val.length >= 2) {
                                            // If last char is digit and no # exists, try to insert #
                                            const lastLetterIdx = val.split("").reduce((acc, c, i) => /[a-zA-ZğüşöçıİĞÜŞÖÇ]/.test(c) ? i : acc, -1);
                                            if (lastLetterIdx >= 0 && lastLetterIdx < val.length - 1) {
                                                val = val.substring(0, lastLetterIdx + 1) + "#" + val.substring(lastLetterIdx + 1);
                                            }
                                        }
                                        setAddInput(val);
                                    }}
                                    placeholder={t("tag_placeholder") || "Oyuncu#1234"}
                                    className="w-full pl-10 pr-4 py-3 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                                    onKeyDown={(e) => e.key === "Enter" && handleSendRequest()}
                                />
                            </div>
                            <button
                                onClick={handleSendRequest}
                                disabled={isLoading || !addInput.includes("#")}
                                className="px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold rounded-xl transition-all flex items-center gap-2"
                            >
                                {isLoading ? "..." : (t("send_request") || "Gönder")}
                            </button>
                        </div>

                        <div className="mt-4 p-3 bg-zinc-50 dark:bg-zinc-800/50 rounded-lg">
                            <p className="text-xs text-zinc-500">
                                💡 {t("add_friend_tip") || "Kendi Takma Adınızı ve etiketinizi Hesap Ayarları'ndan görebilirsiniz."}
                            </p>
                        </div>
                    </div>
                )}

                {/* ===== BLOCKED USERS TAB ===== */}
                {activeTab === "blocked" && (
                    <div>
                        {blockedUsers.length === 0 ? (
                            <div className="text-center py-16">
                                <Ban className="w-16 h-16 text-zinc-300 dark:text-zinc-700 mx-auto mb-4" />
                                <p className="text-zinc-500">{t("no_blocked") || "Engellenen kullanıcı yok"}</p>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {blockedUsers.map(email => (
                                    <div key={email} className="flex items-center gap-3 p-4 bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800">
                                        <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                                            <Ban className="w-5 h-5 text-red-500" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="font-medium truncate">{email}</p>
                                        </div>
                                        <button
                                            onClick={() => handleUnblockUser(email)}
                                            className="px-3 py-1.5 text-sm bg-zinc-200 dark:bg-zinc-700 hover:bg-zinc-300 dark:hover:bg-zinc-600 rounded-lg transition-colors"
                                        >
                                            {t("unblock") || "Engeli Kaldır"}
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </main>

            {/* Profile Modal */}
            {selectedProfile && (
                <ProfileModal
                    user={selectedProfile}
                    isOpen={!!selectedProfile}
                    onClose={() => setSelectedProfile(null)}
                />
            )}
        </div>
    );
}

// Friend Card Component
function FriendCard({ friend, onProfile, onRemove, onBlock, onMessage, t }: {
    friend: Friend;
    onProfile: (p: UserProfile) => void;
    onRemove: (email: string) => void;
    onBlock: (email: string) => void;
    onMessage: () => void;
    t: (key: string) => string;
}) {
    const [showMenu, setShowMenu] = useState(false);

    return (
        <div className="flex items-center gap-3 p-3 bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors group">
            {/* Avatar + Online Status */}
            <button onClick={() => onProfile(friend as UserProfile)} className="relative flex-shrink-0">
                {friend.avatarUrl ? (
                    <img src={friend.avatarUrl} alt="" className="w-10 h-10 rounded-full object-cover" referrerPolicy="no-referrer" />
                ) : (
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold">
                        {friend.username?.charAt(0) || "?"}
                    </div>
                )}
                <div className={`absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full border-2 border-white dark:border-zinc-900 flex items-center justify-center ${friend.isOnline ? "bg-green-500" : "bg-zinc-400"}`}>
                    <div className="w-1.5 h-1.5 rounded-full bg-black/30" />
                </div>
            </button>

            {/* Info */}
            <button onClick={() => onProfile(friend as UserProfile)} className="flex-1 min-w-0 text-left">
                <p className="font-semibold truncate">{friend.username} {friend.nickname && <span className="text-xs text-zinc-400 font-normal">{friend.nickname}#{friend.nicknameTag}</span>}</p>
                <p className="text-xs text-zinc-500 truncate">
                    {friend.customStatus
                        ? `${friend.statusEmoji || ""} ${friend.customStatus}`
                        : friend.isOnline
                            ? (t("online") || "Çevrimiçi")
                            : (t("offline") || "Çevrimdışı")
                    }
                </p>
            </button>

            {/* Actions */}
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                    onClick={onMessage}
                    className="p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                    title={t("send_message") || "Mesaj Gönder"}
                >
                    <MessageCircle className="w-4 h-4 text-zinc-500" />
                </button>
                <div className="relative">
                    <button
                        onClick={() => setShowMenu(!showMenu)}
                        className="p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                    >
                        <UserX className="w-4 h-4 text-zinc-500" />
                    </button>
                    {showMenu && (
                        <div className="absolute right-0 top-10 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl shadow-xl p-1 min-w-[160px] z-10">
                            <button
                                onClick={() => { onRemove(friend.email); setShowMenu(false); }}
                                className="w-full text-left px-3 py-2 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-700 rounded-lg text-red-500"
                            >
                                {t("remove_friend") || "Arkadaşı Sil"}
                            </button>
                            <button
                                onClick={() => { onBlock(friend.email); setShowMenu(false); }}
                                className="w-full text-left px-3 py-2 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-700 rounded-lg text-red-600"
                            >
                                {t("block_user") || "Engelle"}
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
