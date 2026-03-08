"use client";

import { useState, useEffect } from "react";
import { X, ChevronRight, MessageSquare, Send, Clock } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { useSession } from "next-auth/react";
import { db } from "@/lib/firebase";
import { collection, addDoc, onSnapshot, query, orderBy, serverTimestamp, doc, getDoc } from "firebase/firestore";

interface UpdateEntry {
    id: string;
    version: string;
    date: string;
    titleKey: string;
    changes: { icon: string; textKey: string }[];
}

const UPDATES: UpdateEntry[] = [
    {
        id: "v1.8.0",
        version: "1.8.0",
        date: "2026-03-09T00:03:00+03:00",
        titleKey: "update_v180_title",
        changes: [
            { icon: "ℹ️", textKey: "update_v180_changelog" },
            { icon: "🔇", textKey: "update_v180_voice" },
            { icon: "🟢", textKey: "update_v180_online" },
            { icon: "📁", textKey: "update_v180_projects" },
            { icon: "🌐", textKey: "update_v180_translations" },
            { icon: "📝", textKey: "update_v180_offline" },
        ],
    },
    {
        id: "v1.7.0",
        version: "1.7.0",
        date: "2026-03-08T22:00:00+03:00",
        titleKey: "update_v170_title",
        changes: [
            { icon: "💬", textKey: "update_v170_typing" },
            { icon: "🔴", textKey: "update_v170_dnd" },
            { icon: "🟢", textKey: "update_v170_status" },
            { icon: "🌍", textKey: "update_v170_i18n" },
        ],
    },
    {
        id: "v1.6.0",
        version: "1.6.0",
        date: "2026-03-07T18:00:00+03:00",
        titleKey: "update_v160_title",
        changes: [
            { icon: "👥", textKey: "update_v160_friends" },
            { icon: "🖼️", textKey: "update_v160_profile" },
            { icon: "🚫", textKey: "update_v160_block" },
            { icon: "🔒", textKey: "update_v160_security" },
        ],
    },
];

interface Comment {
    id: string;
    text: string;
    username: string;
    avatarUrl?: string;
    createdAt: any;
}

export default function ChangelogModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
    const { t } = useI18n();
    const { data: session } = useSession();
    const [selectedUpdate, setSelectedUpdate] = useState<UpdateEntry | null>(null);
    const [comments, setComments] = useState<Comment[]>([]);
    const [newComment, setNewComment] = useState("");
    const [myUsername, setMyUsername] = useState("");

    useEffect(() => {
        if (!isOpen) return;
        // Load username
        const loadUser = async () => {
            if (!session?.user?.email) return;
            const snap = await getDoc(doc(db, "users", session.user.email));
            if (snap.exists()) setMyUsername(snap.data().username || session.user.name || "");
        };
        loadUser();
    }, [isOpen, session]);

    // Listen for comments on the selected update
    useEffect(() => {
        if (!selectedUpdate) { setComments([]); return; }
        const q = query(collection(db, "changelog_comments", selectedUpdate.id, "comments"), orderBy("createdAt", "asc"));
        const unsub = onSnapshot(q, (snap) => {
            setComments(snap.docs.map(d => ({ id: d.id, ...d.data() as Omit<Comment, "id"> })));
        });
        return () => unsub();
    }, [selectedUpdate]);

    const handleSendComment = async () => {
        if (!newComment.trim() || !session?.user?.email || !selectedUpdate) return;
        await addDoc(collection(db, "changelog_comments", selectedUpdate.id, "comments"), {
            text: newComment.trim(),
            email: session.user.email,
            username: myUsername || session.user.name || "User",
            avatarUrl: session.user.image || "",
            createdAt: serverTimestamp(),
        });
        setNewComment("");
    };

    if (!isOpen) return null;

    const formatDate = (dateStr: string) => {
        const d = new Date(dateStr);
        const h = d.getHours().toString().padStart(2, "0");
        const m = d.getMinutes().toString().padStart(2, "0");
        const day = d.getDate().toString().padStart(2, "0");
        const month = (d.getMonth() + 1).toString().padStart(2, "0");
        return `${h}:${m} — ${day}.${month}.${d.getFullYear()}`;
    };

    const formatCommentTime = (ts: any) => {
        if (!ts) return "";
        const d = ts.toDate ? ts.toDate() : new Date(ts);
        return d.toLocaleString([], { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
    };

    return (
        <div className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm flex items-stretch justify-end" onClick={onClose}>
            <div
                className="bg-white dark:bg-zinc-900 w-full max-w-2xl flex border-l border-zinc-200 dark:border-zinc-800 shadow-2xl"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Left: Update List */}
                <div className={`${selectedUpdate ? "hidden md:flex" : "flex"} flex-col w-full md:w-72 border-r border-zinc-200 dark:border-zinc-800`}>
                    <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-200 dark:border-zinc-800">
                        <h2 className="font-bold text-sm text-zinc-900 dark:text-white">{t("changelog_log_title") || "Güncellemeler/İyileştirmeler Günlüğü"}</h2>
                        <button onClick={onClose} className="p-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800">
                            <X className="w-4 h-4 text-zinc-500" />
                        </button>
                    </div>
                    <div className="flex-1 overflow-y-auto">
                        {UPDATES.map((upd) => (
                            <button
                                key={upd.id}
                                onClick={() => setSelectedUpdate(upd)}
                                className={`w-full text-left px-4 py-3 border-b border-zinc-100 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors ${selectedUpdate?.id === upd.id ? "bg-blue-50 dark:bg-blue-900/20 border-l-2 border-l-blue-500" : ""}`}
                            >
                                <div className="flex items-center justify-between mb-1">
                                    <span className="text-xs font-bold text-blue-600 dark:text-blue-400">v{upd.version}</span>
                                    <ChevronRight className="w-3.5 h-3.5 text-zinc-400" />
                                </div>
                                <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200 mb-1">{t(upd.titleKey) || upd.titleKey}</p>
                                <div className="flex items-center gap-1 text-[10px] text-zinc-400">
                                    <Clock className="w-3 h-3" />
                                    <span>{formatDate(upd.date)}</span>
                                </div>
                            </button>
                        ))}
                    </div>
                </div>

                {/* Right: Detail View */}
                <div className={`${selectedUpdate ? "flex" : "hidden md:flex"} flex-col flex-1`}>
                    {selectedUpdate ? (
                        <>
                            {/* Detail Header */}
                            <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-200 dark:border-zinc-800">
                                <div>
                                    <button onClick={() => setSelectedUpdate(null)} className="md:hidden text-blue-500 text-xs mb-1">← {t("back") || "Geri"}</button>
                                    <h3 className="font-bold text-zinc-900 dark:text-white">{t(selectedUpdate.titleKey) || selectedUpdate.titleKey}</h3>
                                    <div className="flex items-center gap-1 text-xs text-zinc-400 mt-0.5">
                                        <Clock className="w-3 h-3" />
                                        <span>{formatDate(selectedUpdate.date)}</span>
                                    </div>
                                </div>
                                <span className="text-xs font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 px-2 py-1 rounded-full">v{selectedUpdate.version}</span>
                            </div>

                            {/* Changes List */}
                            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
                                {selectedUpdate.changes.map((ch, i) => (
                                    <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-100 dark:border-zinc-700">
                                        <span className="text-xl flex-shrink-0">{ch.icon}</span>
                                        <p className="text-sm text-zinc-700 dark:text-zinc-300">{t(ch.textKey) || ch.textKey}</p>
                                    </div>
                                ))}

                                {/* Comments Section */}
                                <div className="mt-6 pt-4 border-t border-zinc-200 dark:border-zinc-700">
                                    <h4 className="text-sm font-bold text-zinc-600 dark:text-zinc-400 flex items-center gap-2 mb-3">
                                        <MessageSquare className="w-4 h-4" />
                                        {t("comments") || "Yorumlar"} ({comments.length})
                                    </h4>
                                    <div className="space-y-2 max-h-48 overflow-y-auto">
                                        {comments.length === 0 && (
                                            <p className="text-xs text-zinc-400 text-center py-3">{t("no_comments") || "Henüz yorum yok."}</p>
                                        )}
                                        {comments.map((c) => (
                                            <div key={c.id} className="flex items-start gap-2 p-2 rounded-lg bg-zinc-100 dark:bg-zinc-800">
                                                {c.avatarUrl ? (
                                                    <img src={c.avatarUrl} className="w-6 h-6 rounded-full object-cover flex-shrink-0" referrerPolicy="no-referrer" />
                                                ) : (
                                                    <div className="w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0">{c.username?.charAt(0)}</div>
                                                )}
                                                <div className="min-w-0">
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">{c.username}</span>
                                                        <span className="text-[10px] text-zinc-400">{formatCommentTime(c.createdAt)}</span>
                                                    </div>
                                                    <p className="text-xs text-zinc-600 dark:text-zinc-400 break-words">{c.text}</p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>

                                    {/* Comment Input */}
                                    {session?.user && (
                                        <div className="flex items-center gap-2 mt-3">
                                            <input
                                                type="text"
                                                value={newComment}
                                                onChange={(e) => setNewComment(e.target.value)}
                                                onKeyDown={(e) => e.key === "Enter" && handleSendComment()}
                                                placeholder={t("write_comment") || "Yorum yaz..."}
                                                className="flex-1 px-3 py-2 rounded-lg bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                                            />
                                            <button onClick={handleSendComment} className="p-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors" disabled={!newComment.trim()}>
                                                <Send className="w-4 h-4" />
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </>
                    ) : (
                        <div className="flex-1 flex items-center justify-center text-zinc-400 text-sm">
                            {t("select_update") || "Bir güncelleme seçin"}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
