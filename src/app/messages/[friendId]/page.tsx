"use client";

import { useState, useEffect, useRef } from "react";
import { useSession } from "next-auth/react";
import { useRouter, useParams } from "next/navigation";
import { ArrowLeft, Send, Smile, Mic, MicOff, Phone, Image, Paperclip, MoreVertical, Check, CheckCheck } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { db } from "@/lib/firebase";
import { doc, setDoc, getDoc, collection, query, where, orderBy, onSnapshot, addDoc, serverTimestamp, Timestamp } from "firebase/firestore";

type Message = {
    id: string;
    fromEmail: string;
    text: string;
    type: "text" | "sticker" | "voice" | "image";
    stickerUrl?: string;
    voiceDuration?: number;
    createdAt: any;
    read: boolean;
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

    const [messages, setMessages] = useState<Message[]>([]);
    const [newMessage, setNewMessage] = useState("");
    const [friendData, setFriendData] = useState<any>(null);
    const [showStickers, setShowStickers] = useState(false);
    const [isRecording, setIsRecording] = useState(false);
    const [recordingTime, setRecordingTime] = useState(0);
    const [showMenu, setShowMenu] = useState(false);
    const recordingInterval = useRef<NodeJS.Timeout | null>(null);

    const chatId = [session?.user?.email, friendEmail].sort().join("_");

    useEffect(() => {
        if (!session?.user?.email) { router.push("/login"); return; }
        loadFriendData();
        const q = query(
            collection(db, "chats", chatId, "messages"),
            orderBy("createdAt", "asc")
        );
        const unsub = onSnapshot(q, (snapshot) => {
            const msgs: Message[] = snapshot.docs.map(d => ({ id: d.id, ...d.data() as Omit<Message, "id"> }));
            setMessages(msgs);
            setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
        });
        return () => unsub();
    }, [session, chatId]);

    const loadFriendData = async () => {
        const friendDoc = await getDoc(doc(db, "users", friendEmail));
        if (friendDoc.exists()) setFriendData(friendDoc.data());
    };

    const sendMessage = async (text: string, type: "text" | "sticker" | "voice" = "text", extra?: any) => {
        if (!session?.user?.email || (!text.trim() && type === "text")) return;
        await addDoc(collection(db, "chats", chatId, "messages"), {
            fromEmail: session.user.email,
            text,
            type,
            ...extra,
            createdAt: serverTimestamp(),
            read: false,
        });
        await setDoc(doc(db, "chats", chatId), {
            participants: [session.user.email, friendEmail],
            lastMessage: type === "sticker" ? "🎭 Sticker" : type === "voice" ? "🎤 " + (t("voice_message") || "Sesli Mesaj") : text,
            lastMessageAt: serverTimestamp(),
            lastSender: session.user.email,
        }, { merge: true });
        setNewMessage("");
        setShowStickers(false);
    };

    const handleSend = () => sendMessage(newMessage);
    const handleSticker = (emoji: string) => sendMessage(emoji, "sticker");

    const startRecording = () => {
        setIsRecording(true);
        setRecordingTime(0);
        recordingInterval.current = setInterval(() => setRecordingTime(p => p + 1), 1000);
    };

    const stopRecording = () => {
        setIsRecording(false);
        if (recordingInterval.current) clearInterval(recordingInterval.current);
        if (recordingTime > 0) {
            sendMessage(`🎤 ${t("voice_message") || "Sesli Mesaj"} (${formatTime(recordingTime)})`, "voice", { voiceDuration: recordingTime });
        }
        setRecordingTime(0);
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

                {/* Friend Avatar + Info */}
                <div className="relative">
                    {friendData?.avatarUrl ? (
                        <img src={friendData.avatarUrl} alt="" className="w-10 h-10 rounded-full object-cover" referrerPolicy="no-referrer" />
                    ) : (
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold">
                            {friendData?.username?.charAt(0) || "?"}
                        </div>
                    )}
                    <div className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-white dark:border-zinc-900 ${friendData?.isOnline ? "bg-green-500" : "bg-zinc-400"}`} />
                </div>

                <div className="flex-1 min-w-0">
                    <h2 className="font-semibold truncate">{friendData?.username || friendEmail}</h2>
                    <p className="text-xs text-zinc-500">
                        {friendData?.isOnline ? (t("online") || "Çevrimiçi") : (t("offline") || "Çevrimdışı")}
                    </p>
                </div>

                {/* Call Button */}
                <button
                    onClick={() => router.push(`/call/${encodeURIComponent(friendEmail)}`)}
                    className="p-2.5 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                    title={t("voice_call") || "Sesli Arama"}
                >
                    <Phone className="w-5 h-5 text-green-500" />
                </button>

                {/* Menu */}
                <div className="relative">
                    <button onClick={() => setShowMenu(!showMenu)} className="p-2.5 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800">
                        <MoreVertical className="w-5 h-5 text-zinc-500" />
                    </button>
                    {showMenu && (
                        <div className="absolute right-0 top-12 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl shadow-xl p-1 min-w-[150px] z-20">
                            <button onClick={() => { router.push("/friends"); setShowMenu(false); }} className="w-full text-left px-3 py-2 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-700 rounded-lg">
                                {t("friends") || "Arkadaşlar"}
                            </button>
                        </div>
                    )}
                </div>
            </div>

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
                        <div key={msg.id} className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
                            <div className={`max-w-[75%] rounded-2xl px-4 py-2.5 ${isMine
                                    ? "bg-blue-600 text-white rounded-br-md"
                                    : "bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-bl-md"
                                }`}>
                                {msg.type === "sticker" ? (
                                    <span className="text-4xl">{msg.text}</span>
                                ) : msg.type === "voice" ? (
                                    <div className="flex items-center gap-2">
                                        <Mic className="w-4 h-4" />
                                        <span className="text-sm">{msg.text}</span>
                                    </div>
                                ) : (
                                    <p className="text-sm whitespace-pre-wrap break-words">{msg.text}</p>
                                )}
                                <div className={`flex items-center gap-1 mt-1 ${isMine ? "justify-end" : "justify-start"}`}>
                                    <span className={`text-[10px] ${isMine ? "text-white/60" : "text-zinc-400"}`}>
                                        {formatMessageTime(msg.createdAt)}
                                    </span>
                                    {isMine && (
                                        msg.read
                                            ? <CheckCheck className="w-3 h-3 text-blue-200" />
                                            : <Check className="w-3 h-3 text-white/50" />
                                    )}
                                </div>
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
        </div>
    );
}
