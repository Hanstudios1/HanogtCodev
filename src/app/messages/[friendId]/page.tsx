"use client";

import { useState, useEffect, useRef } from "react";
import { useSession } from "next-auth/react";
import { useRouter, useParams } from "next/navigation";
import { ArrowLeft, Send, Smile, Mic, MicOff, Phone, MoreVertical, Check, CheckCheck, Trash2, Edit3, Reply, Ban, Play, Pause, X } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { db } from "@/lib/firebase";
import { doc, setDoc, getDoc, collection, query, orderBy, onSnapshot, addDoc, serverTimestamp, deleteDoc, updateDoc } from "firebase/firestore";
import ProfileModal from "@/components/ProfileModal";
import type { UserProfile } from "@/components/ProfileModal";

type Message = {
    id: string;
    fromEmail: string;
    text: string;
    type: "text" | "sticker" | "voice" | "image";
    stickerUrl?: string;
    voiceDuration?: number;
    voiceUrl?: string;
    createdAt: any;
    read: boolean;
    replyTo?: { id: string; text: string; fromEmail: string };
    edited?: boolean;
    deleted?: boolean;
};

const STICKERS = [
    "😀", "😂", "🤣", "😍", "🥰", "😎", "🤩", "😤",
    "😭", "🥺", "😱", "🤔", "💀", "🔥", "❤️", "💯",
    "👋", "👍", "👎", "🙌", "🎉", "🎊", "✨", "💪",
    "🚀", "⭐", "🌟", "💡", "🎮", "💻", "📱", "🎵",
    "☕", "🍕", "🎂", "🌈", "🐱", "🐶", "🦊", "🐼",
];

export default function ChatPage() {
    const { data: session } = useSession();
    const router = useRouter();
    const params = useParams();
    const { t } = useI18n();
    const friendEmail = decodeURIComponent(params.friendId as string);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const audioChunksRef = useRef<Blob[]>([]);

    const [messages, setMessages] = useState<Message[]>([]);
    const [newMessage, setNewMessage] = useState("");
    const [friendData, setFriendData] = useState<any>(null);
    const [myData, setMyData] = useState<any>(null);
    const [showStickers, setShowStickers] = useState(false);
    const [isRecording, setIsRecording] = useState(false);
    const [recordingTime, setRecordingTime] = useState(0);
    const [showMenu, setShowMenu] = useState(false);
    const [selectedMsg, setSelectedMsg] = useState<Message | null>(null);
    const [showMsgMenu, setShowMsgMenu] = useState<string | null>(null);
    const [editingMsg, setEditingMsg] = useState<Message | null>(null);
    const [editText, setEditText] = useState("");
    const [replyTo, setReplyTo] = useState<Message | null>(null);
    const [playingAudio, setPlayingAudio] = useState<string | null>(null);
    const [showProfile, setShowProfile] = useState(false);
    const recordingInterval = useRef<NodeJS.Timeout | null>(null);
    const audioRef = useRef<HTMLAudioElement | null>(null);

    const chatId = [session?.user?.email, friendEmail].sort().join("_");

    useEffect(() => {
        if (!session?.user?.email) { router.push("/login"); return; }
        loadFriendData();
        loadMyData();
        const q = query(collection(db, "chats", chatId, "messages"), orderBy("createdAt", "asc"));
        const unsub = onSnapshot(q, (snapshot) => {
            const msgs: Message[] = snapshot.docs.map(d => ({ id: d.id, ...d.data() as Omit<Message, "id"> }));
            setMessages(msgs);
            setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
            // Mark unread messages as read
            msgs.forEach(m => {
                if (!m.read && m.fromEmail === friendEmail && session?.user?.email) {
                    updateDoc(doc(db, "chats", chatId, "messages", m.id), { read: true });
                }
            });
        });
        return () => unsub();
    }, [session, chatId]);

    const loadFriendData = async () => {
        const friendDoc = await getDoc(doc(db, "users", friendEmail));
        if (friendDoc.exists()) setFriendData(friendDoc.data());
    };

    const loadMyData = async () => {
        if (!session?.user?.email) return;
        const myDoc = await getDoc(doc(db, "users", session.user.email));
        if (myDoc.exists()) setMyData(myDoc.data());
    };

    const sendMessage = async (text: string, type: "text" | "sticker" | "voice" = "text", extra?: any) => {
        if (!session?.user?.email || (!text.trim() && type === "text")) return;
        const msgData: any = {
            fromEmail: session.user.email,
            text,
            type,
            ...extra,
            createdAt: serverTimestamp(),
            read: false,
        };
        if (replyTo) {
            msgData.replyTo = { id: replyTo.id, text: replyTo.text.substring(0, 100), fromEmail: replyTo.fromEmail };
        }
        await addDoc(collection(db, "chats", chatId, "messages"), msgData);
        await setDoc(doc(db, "chats", chatId), {
            participants: [session.user.email, friendEmail],
            lastMessage: type === "sticker" ? "🎭 Sticker" : type === "voice" ? "🎤 " + (t("voice_message") || "Sesli Mesaj") : text,
            lastMessageAt: serverTimestamp(),
            lastSender: session.user.email,
        }, { merge: true });
        setNewMessage("");
        setShowStickers(false);
        setReplyTo(null);
    };

    const handleSend = () => sendMessage(newMessage);
    const handleSticker = (emoji: string) => sendMessage(emoji, "sticker");

    // Delete message
    const handleDeleteMsg = async (msgId: string) => {
        await updateDoc(doc(db, "chats", chatId, "messages", msgId), { deleted: true, text: t("message_deleted") || "Bu mesaj silindi" });
        setShowMsgMenu(null);
    };

    // Edit message
    const handleStartEdit = (msg: Message) => {
        setEditingMsg(msg);
        setEditText(msg.text);
        setShowMsgMenu(null);
    };
    const handleSaveEdit = async () => {
        if (!editingMsg || !editText.trim()) return;
        await updateDoc(doc(db, "chats", chatId, "messages", editingMsg.id), { text: editText, edited: true });
        setEditingMsg(null);
        setEditText("");
    };

    // Reply
    const handleReply = (msg: Message) => {
        setReplyTo(msg);
        setShowMsgMenu(null);
        inputRef.current?.focus();
    };

    // Voice recording with real audio
    const startRecording = async () => {
        if (!myData?.phoneVerified) {
            alert(t("phone_required_voice") || "Sesli özellikler için telefon numaranızı doğrulamanız gerekiyor.");
            return;
        }
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const mediaRecorder = new MediaRecorder(stream);
            mediaRecorderRef.current = mediaRecorder;
            audioChunksRef.current = [];
            mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
            mediaRecorder.start();
            setIsRecording(true);
            setRecordingTime(0);
            recordingInterval.current = setInterval(() => setRecordingTime(p => p + 1), 1000);
        } catch {
            alert(t("mic_permission_denied") || "Mikrofon izni verilmedi.");
        }
    };

    const stopRecording = () => {
        setIsRecording(false);
        if (recordingInterval.current) clearInterval(recordingInterval.current);
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
            mediaRecorderRef.current.onstop = () => {
                const blob = new Blob(audioChunksRef.current, { type: "audio/webm" });
                const reader = new FileReader();
                reader.onloadend = () => {
                    const base64 = reader.result as string;
                    if (recordingTime > 0) {
                        sendMessage(`🎤 ${t("voice_message") || "Sesli Mesaj"} (${formatTime(recordingTime)})`, "voice", { voiceDuration: recordingTime, voiceUrl: base64 });
                    }
                };
                reader.readAsDataURL(blob);
                mediaRecorderRef.current?.stream.getTracks().forEach(t => t.stop());
            };
            mediaRecorderRef.current.stop();
        }
        setRecordingTime(0);
    };

    // Play voice message
    const playVoice = (msgId: string, voiceUrl?: string) => {
        if (!voiceUrl) return;
        if (playingAudio === msgId) {
            audioRef.current?.pause();
            setPlayingAudio(null);
            return;
        }
        if (audioRef.current) audioRef.current.pause();
        const audio = new Audio(voiceUrl);
        audioRef.current = audio;
        audio.onended = () => setPlayingAudio(null);
        audio.play();
        setPlayingAudio(msgId);
    };

    // Block user
    const handleBlockUser = async () => {
        if (!session?.user?.email) return;
        const myDoc = await getDoc(doc(db, "users", session.user.email));
        const blocked: string[] = myDoc.data()?.blockedUsers || [];
        await setDoc(doc(db, "users", session.user.email), { blockedUsers: [...blocked, friendEmail] }, { merge: true });
        setShowMenu(false);
        router.push("/friends");
    };

    const formatTime = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;
    const formatMessageTime = (ts: any) => {
        if (!ts) return "";
        const date = ts.toDate ? ts.toDate() : new Date(ts);
        return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    };

    if (!session?.user) return null;

    return (
        <div className="h-screen flex flex-col bg-zinc-50 dark:bg-zinc-950">
            {/* Header */}
            <div className="bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 px-4 py-3 flex items-center gap-3 z-10">
                <button onClick={() => router.push("/friends")} className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800">
                    <ArrowLeft className="w-5 h-5" />
                </button>

                {/* Friend Avatar + Info — clickable for profile */}
                <button onClick={() => setShowProfile(true)} className="flex items-center gap-3 flex-1 min-w-0 text-left">
                    <div className="relative">
                        {friendData?.avatarUrl ? (
                            <img src={friendData.avatarUrl} alt="" className="w-10 h-10 rounded-full object-cover" referrerPolicy="no-referrer" />
                        ) : (
                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold">
                                {friendData?.username?.charAt(0) || "?"}
                            </div>
                        )}
                        {/* Fixed online indicator: centered dot + colored ring */}
                        <div className={`absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full border-2 border-white dark:border-zinc-900 flex items-center justify-center ${friendData?.isOnline ? "bg-green-500" : "bg-zinc-400"}`}>
                            <div className="w-1.5 h-1.5 rounded-full bg-black/30" />
                        </div>
                    </div>
                    <div className="min-w-0">
                        <h2 className="font-semibold truncate">
                            {friendData?.username || friendEmail}
                            {friendData?.nickname && <span className="text-xs text-zinc-400 ml-1.5">{friendData.nickname}#{friendData.nicknameTag}</span>}
                        </h2>
                        <p className="text-xs text-zinc-500">
                            {friendData?.isOnline ? (t("online") || "Çevrimiçi") : (t("offline") || "Çevrimdışı")}
                        </p>
                    </div>
                </button>

                {/* Call Button — only if phone verified */}
                <button
                    onClick={() => {
                        if (!myData?.phoneVerified) { alert(t("phone_required_voice") || "Sesli arama için telefon doğrulama gerekli."); return; }
                        router.push(`/call/${encodeURIComponent(friendEmail)}`);
                    }}
                    className="p-2.5 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                    title={t("voice_call") || "Sesli Arama"}
                >
                    <Phone className="w-5 h-5 text-green-500" />
                </button>

                {/* Menu with Block */}
                <div className="relative">
                    <button onClick={() => setShowMenu(!showMenu)} className="p-2.5 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800">
                        <MoreVertical className="w-5 h-5 text-zinc-500" />
                    </button>
                    {showMenu && (
                        <div className="absolute right-0 top-12 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl shadow-xl p-1 min-w-[160px] z-20">
                            <button onClick={() => { router.push("/friends"); setShowMenu(false); }} className="w-full text-left px-3 py-2 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-700 rounded-lg">
                                {t("friends") || "Arkadaşlar"}
                            </button>
                            <button onClick={handleBlockUser} className="w-full text-left px-3 py-2 text-sm hover:bg-red-50 dark:hover:bg-red-900/20 text-red-600 rounded-lg flex items-center gap-2">
                                <Ban className="w-4 h-4" /> {t("block_user") || "Engelle"}
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* Edit bar */}
            {editingMsg && (
                <div className="bg-amber-50 dark:bg-amber-900/20 border-b border-amber-200 dark:border-amber-800 px-4 py-2 flex items-center gap-2">
                    <Edit3 className="w-4 h-4 text-amber-600" />
                    <input value={editText} onChange={(e) => setEditText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleSaveEdit()} className="flex-1 bg-transparent outline-none text-sm" autoFocus />
                    <button onClick={handleSaveEdit} className="text-amber-600 text-sm font-bold">{t("save") || "Kaydet"}</button>
                    <button onClick={() => setEditingMsg(null)} className="text-zinc-400"><X className="w-4 h-4" /></button>
                </div>
            )}

            {/* Reply bar */}
            {replyTo && (
                <div className="bg-blue-50 dark:bg-blue-900/20 border-b border-blue-200 dark:border-blue-800 px-4 py-2 flex items-center gap-2">
                    <Reply className="w-4 h-4 text-blue-600" />
                    <div className="flex-1 text-xs truncate">
                        <span className="font-semibold text-blue-600">{replyTo.fromEmail === session.user?.email ? (t("you") || "Sen") : friendData?.username}</span>
                        <span className="text-zinc-500 ml-1">{replyTo.text.substring(0, 60)}</span>
                    </div>
                    <button onClick={() => setReplyTo(null)} className="text-zinc-400"><X className="w-4 h-4" /></button>
                </div>
            )}

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2">
                {messages.length === 0 && (
                    <div className="text-center py-16">
                        <p className="text-zinc-400">{t("no_messages") || "Henüz mesaj yok. İlk mesajı gönderin!"}</p>
                    </div>
                )}
                {messages.map((msg) => {
                    const isMine = msg.fromEmail === session.user?.email;
                    return (
                        <div key={msg.id} className={`flex ${isMine ? "justify-end" : "justify-start"} group`}>
                            <div
                                className={`max-w-[75%] rounded-2xl px-4 py-2.5 relative ${msg.deleted
                                    ? "bg-zinc-200 dark:bg-zinc-800 italic text-zinc-500"
                                    : isMine ? "bg-blue-600 text-white rounded-br-md" : "bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-bl-md"
                                    }`}
                                onContextMenu={(e) => { if (!msg.deleted) { e.preventDefault(); setShowMsgMenu(showMsgMenu === msg.id ? null : msg.id); } }}
                                onClick={() => { if (!msg.deleted && window.innerWidth <= 768) setShowMsgMenu(showMsgMenu === msg.id ? null : msg.id); }}
                            >
                                {/* Reply reference */}
                                {msg.replyTo && (
                                    <div className={`text-xs mb-1.5 px-2 py-1 rounded-lg border-l-2 ${isMine ? "bg-blue-700/50 border-blue-300" : "bg-zinc-100 dark:bg-zinc-700 border-blue-500"}`}>
                                        <span className="font-semibold">{msg.replyTo.fromEmail === session.user?.email ? (t("you") || "Sen") : friendData?.username}</span>
                                        <p className="truncate opacity-80">{msg.replyTo.text.substring(0, 50)}</p>
                                    </div>
                                )}

                                {msg.deleted ? (
                                    <p className="text-sm">🚫 {msg.text}</p>
                                ) : msg.type === "sticker" ? (
                                    <span className="text-4xl">{msg.text}</span>
                                ) : msg.type === "voice" ? (
                                    <div className="flex items-center gap-2">
                                        <button onClick={() => playVoice(msg.id, msg.voiceUrl)} className="p-1 rounded-full hover:bg-white/20">
                                            {playingAudio === msg.id ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                                        </button>
                                        <div className="flex-1 h-1 rounded bg-white/30 dark:bg-zinc-600">
                                            <div className={`h-1 rounded ${isMine ? "bg-white/70" : "bg-blue-500"} ${playingAudio === msg.id ? "animate-pulse" : ""}`} style={{ width: playingAudio === msg.id ? "60%" : "0%" }} />
                                        </div>
                                        <span className="text-xs opacity-70">{msg.voiceDuration ? formatTime(msg.voiceDuration) : ""}</span>
                                    </div>
                                ) : (
                                    <p className="text-sm whitespace-pre-wrap break-words">{msg.text}</p>
                                )}
                                <div className={`flex items-center gap-1 mt-1 ${isMine ? "justify-end" : "justify-start"}`}>
                                    <span className={`text-[10px] ${isMine ? "text-white/60" : "text-zinc-400"}`}>
                                        {formatMessageTime(msg.createdAt)}
                                    </span>
                                    {msg.edited && <span className={`text-[9px] ${isMine ? "text-white/40" : "text-zinc-400"}`}>({t("edited") || "düzenlendi"})</span>}
                                    {isMine && !msg.deleted && (
                                        msg.read ? <CheckCheck className="w-3 h-3 text-blue-200" /> : <Check className="w-3 h-3 text-white/50" />
                                    )}
                                </div>

                                {/* Context menu */}
                                {showMsgMenu === msg.id && !msg.deleted && (
                                    <div className={`absolute z-30 ${isMine ? "right-0" : "left-0"} top-full mt-1 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl shadow-xl p-1 min-w-[140px]`}>
                                        <button onClick={() => handleReply(msg)} className="w-full text-left px-3 py-2 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-700 rounded-lg flex items-center gap-2 text-zinc-700 dark:text-zinc-300">
                                            <Reply className="w-3.5 h-3.5" /> {t("reply") || "Yanıtla"}
                                        </button>
                                        {isMine && msg.type === "text" && (
                                            <button onClick={() => handleStartEdit(msg)} className="w-full text-left px-3 py-2 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-700 rounded-lg flex items-center gap-2 text-zinc-700 dark:text-zinc-300">
                                                <Edit3 className="w-3.5 h-3.5" /> {t("edit") || "Düzenle"}
                                            </button>
                                        )}
                                        {isMine && (
                                            <button onClick={() => handleDeleteMsg(msg.id)} className="w-full text-left px-3 py-2 text-sm hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg flex items-center gap-2 text-red-600">
                                                <Trash2 className="w-3.5 h-3.5" /> {t("delete") || "Sil"}
                                            </button>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}
                <div ref={messagesEndRef} />
            </div>

            {/* Sticker Picker */}
            {showStickers && (
                <div className="bg-white dark:bg-zinc-900 border-t border-zinc-200 dark:border-zinc-800 p-3">
                    <div className="grid grid-cols-8 gap-2 max-h-40 overflow-y-auto">
                        {STICKERS.map((s, i) => (
                            <button key={i} onClick={() => handleSticker(s)} className="text-2xl p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors">
                                {s}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* Input Bar */}
            <div className="bg-white dark:bg-zinc-900 border-t border-zinc-200 dark:border-zinc-800 px-4 py-3">
                {isRecording ? (
                    <div className="flex items-center gap-3">
                        <div className="flex-1 flex items-center gap-3 bg-red-50 dark:bg-red-900/20 rounded-xl px-4 py-3">
                            <div className="w-3 h-3 rounded-full bg-red-500 animate-pulse" />
                            <span className="text-red-600 dark:text-red-400 font-mono font-bold">{formatTime(recordingTime)}</span>
                            <span className="text-sm text-red-500">{t("recording") || "Kaydediliyor..."}</span>
                        </div>
                        <button onClick={stopRecording} className="p-3 rounded-full bg-red-500 text-white hover:bg-red-600 transition-colors">
                            <MicOff className="w-5 h-5" />
                        </button>
                    </div>
                ) : (
                    <div className="flex items-center gap-2">
                        <button onClick={() => setShowStickers(!showStickers)} className="p-2.5 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors">
                            <Smile className={`w-5 h-5 ${showStickers ? "text-blue-500" : "text-zinc-400"}`} />
                        </button>
                        <input
                            ref={inputRef}
                            type="text"
                            value={newMessage}
                            onChange={(e) => setNewMessage(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && handleSend()}
                            placeholder={t("type_message") || "Mesaj yazın..."}
                            className="flex-1 px-4 py-2.5 rounded-xl bg-zinc-100 dark:bg-zinc-800 border-none focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                        />
                        {newMessage.trim() ? (
                            <button onClick={handleSend} className="p-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white transition-colors">
                                <Send className="w-5 h-5" />
                            </button>
                        ) : (
                            <button onMouseDown={startRecording} className="p-2.5 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors">
                                <Mic className="w-5 h-5 text-zinc-400" />
                            </button>
                        )}
                    </div>
                )}
            </div>

            {/* Profile Modal */}
            {showProfile && friendData && (
                <ProfileModal
                    user={{
                        ...friendData,
                        email: friendEmail,
                    } as UserProfile}
                    isOpen={showProfile}
                    onClose={() => setShowProfile(false)}
                />
            )}

            {/* Click outside to close menus */}
            {(showMsgMenu || showMenu) && (
                <div className="fixed inset-0 z-10" onClick={() => { setShowMsgMenu(null); setShowMenu(false); }} />
            )}
        </div>
    );
}
