"use client";

import { useState, useEffect } from "react";
import { X, MessageSquare, Send, Pencil, Trash2, MoreVertical } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { useSession } from "next-auth/react";
import { db } from "@/lib/firebase";
import { collection, addDoc, updateDoc, deleteDoc, onSnapshot, query, orderBy, serverTimestamp, doc, getDoc } from "firebase/firestore";

interface UpdateEntry {
    id: string;
    version: string;
    date: string;
    titleKey: string;
    descKey: string;
    items: { key: string }[];
}

const UPDATES: UpdateEntry[] = [
    {
        id: "v0.0.2",
        version: "v0.0.2",
        date: "2026-03-16",
        titleKey: "update_v002_title",
        descKey: "update_v002_desc",
        items: [
            { key: "update_v002_item1" },
            { key: "update_v002_item2" },
            { key: "update_v002_item3" },
            { key: "update_v002_item4" },
            { key: "update_v002_item5" },
            { key: "update_v002_item6" },
        ],
    },
    {
        id: "v0.0.1",
        version: "v0.0.1",
        date: "2026-03-09",
        titleKey: "update_v001_title",
        descKey: "update_v001_desc",
        items: [
            { key: "update_v001_item1" },
            { key: "update_v001_item2" },
            { key: "update_v001_item3" },
            { key: "update_v001_item4" },
            { key: "update_v001_item5" },
            { key: "update_v001_item6" },
            { key: "update_v001_item7" },
            { key: "update_v001_item8" },
            { key: "update_v001_item9" },
            { key: "update_v001_item10" },
            { key: "update_v001_item11" },
            { key: "update_v001_item12" },
            { key: "update_v001_item13" },
            { key: "update_v001_item14" },
            { key: "update_v001_item15" },
            { key: "update_v001_item16" },
            { key: "update_v001_item17" },
            { key: "update_v001_item18" },
        ],
    },
];

interface Comment {
    id: string;
    text: string;
    username: string;
    email: string;
    avatarUrl?: string;
    createdAt: any;
}

export default function ChangelogModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
    const { t } = useI18n();
    const { data: session } = useSession();
    const [comments, setComments] = useState<Comment[]>([]);
    const [newComment, setNewComment] = useState("");
    const [myUsername, setMyUsername] = useState("");
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editText, setEditText] = useState("");
    const [openMenuId, setOpenMenuId] = useState<string | null>(null);

    useEffect(() => {
        if (!isOpen) return;
        const loadUser = async () => {
            if (!session?.user?.email) return;
            const snap = await getDoc(doc(db, "users", session.user.email));
            if (snap.exists()) setMyUsername(snap.data().username || session.user.name || "");
        };
        loadUser();
    }, [isOpen, session]);

    useEffect(() => {
        if (!isOpen) { setComments([]); return; }
        const q = query(collection(db, "changelog_comments", "v0.0.1", "comments"), orderBy("createdAt", "asc"));
        const unsub = onSnapshot(q, (snap) => {
            setComments(snap.docs.map(d => ({ id: d.id, ...d.data() as Omit<Comment, "id"> })));
        });
        return () => unsub();
    }, [isOpen]);

    const handleSendComment = async () => {
        if (!newComment.trim() || !session?.user?.email) return;
        await addDoc(collection(db, "changelog_comments", "v0.0.1", "comments"), {
            text: newComment.trim(),
            email: session.user.email,
            username: myUsername || session.user.name || "User",
            avatarUrl: session.user.image || "",
            createdAt: serverTimestamp(),
        });
        setNewComment("");
    };

    const handleDeleteComment = async (commentId: string) => {
        await deleteDoc(doc(db, "changelog_comments", "v0.0.1", "comments", commentId));
        setOpenMenuId(null);
    };

    const handleStartEdit = (comment: Comment) => {
        setEditingId(comment.id);
        setEditText(comment.text);
        setOpenMenuId(null);
    };

    const handleSaveEdit = async () => {
        if (!editingId || !editText.trim()) return;
        await updateDoc(doc(db, "changelog_comments", "v0.0.1", "comments", editingId), {
            text: editText.trim(),
        });
        setEditingId(null);
        setEditText("");
    };

    if (!isOpen) return null;

    const formatCommentTime = (ts: any) => {
        if (!ts) return "";
        const d = ts.toDate ? ts.toDate() : new Date(ts);
        return d.toLocaleString([], { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
    };

    return (
        <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
            <div
                className="bg-white dark:bg-zinc-900 w-full max-w-xl rounded-2xl shadow-2xl border border-zinc-200 dark:border-zinc-800 max-h-[85vh] flex flex-col"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-200 dark:border-zinc-800">
                    <h2 className="font-bold text-lg text-zinc-900 dark:text-white">
                        {t("changelog_log_title") || "Güncellemeler/İyileştirmeler Günlüğü"}
                    </h2>
                    <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors">
                        <X className="w-5 h-5 text-zinc-500" />
                    </button>
                </div>

                {/* Scrollable Content */}
                <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
                    {UPDATES.map((upd) => (
                        <div key={upd.id}>
                            <div className="flex items-baseline justify-between mb-2">
                                <h3 className="text-xl font-bold text-zinc-900 dark:text-white">{upd.version}</h3>
                                <span className="text-sm text-zinc-400">{upd.date}</span>
                            </div>
                            <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-3">
                                {t(upd.descKey) || upd.descKey}
                            </p>
                            <ul className="space-y-1.5">
                                {upd.items.map((item, i) => (
                                    <li key={i} className="flex items-start gap-2 text-sm text-zinc-600 dark:text-zinc-400">
                                        <span className="text-zinc-400 mt-0.5 select-none">-</span>
                                        <span>{t(item.key) || item.key}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    ))}

                    <div className="border-t border-zinc-200 dark:border-zinc-700" />

                    {/* Comments Section */}
                    <div>
                        <h4 className="text-sm font-bold text-zinc-600 dark:text-zinc-400 flex items-center gap-2 mb-3">
                            <MessageSquare className="w-4 h-4" />
                            {t("comments") || "Yorumlar"} ({comments.length})
                        </h4>
                        <div className="space-y-2 max-h-64 overflow-y-auto">
                            {comments.length === 0 && (
                                <p className="text-xs text-zinc-400 text-center py-3">{t("no_comments") || "Henüz yorum yok."}</p>
                            )}
                            {comments.map((c) => (
                                <div key={c.id} className="flex items-start gap-2 p-2.5 rounded-lg bg-zinc-50 dark:bg-zinc-800/60 group relative">
                                    {c.avatarUrl ? (
                                        <img src={c.avatarUrl} className="w-7 h-7 rounded-full object-cover flex-shrink-0" referrerPolicy="no-referrer" />
                                    ) : (
                                        <div className="w-7 h-7 rounded-full bg-blue-500 flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0">{c.username?.charAt(0)}</div>
                                    )}
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">{c.username}</span>
                                            <span className="text-[10px] text-zinc-400">{formatCommentTime(c.createdAt)}</span>
                                        </div>
                                        {editingId === c.id ? (
                                            <div className="flex items-center gap-1 mt-1">
                                                <input
                                                    type="text"
                                                    value={editText}
                                                    onChange={(e) => setEditText(e.target.value)}
                                                    onKeyDown={(e) => e.key === "Enter" && handleSaveEdit()}
                                                    className="flex-1 px-2 py-1 rounded text-xs bg-white dark:bg-zinc-700 border border-zinc-300 dark:border-zinc-600 focus:outline-none focus:ring-1 focus:ring-blue-500 text-zinc-900 dark:text-white"
                                                    autoFocus
                                                />
                                                <button onClick={handleSaveEdit} className="text-[10px] text-blue-500 font-semibold hover:text-blue-600">{t("save") || "Kaydet"}</button>
                                                <button onClick={() => setEditingId(null)} className="text-[10px] text-zinc-400 hover:text-zinc-600">{t("cancel") || "İptal"}</button>
                                            </div>
                                        ) : (
                                            <p className="text-xs text-zinc-600 dark:text-zinc-400 break-words">{c.text}</p>
                                        )}
                                    </div>
                                    {/* Actions menu for own comments */}
                                    {session?.user?.email === c.email && editingId !== c.id && (
                                        <div className="relative">
                                            <button
                                                onClick={() => setOpenMenuId(openMenuId === c.id ? null : c.id)}
                                                className="p-1 rounded hover:bg-zinc-200 dark:hover:bg-zinc-700 opacity-0 group-hover:opacity-100 transition-opacity"
                                            >
                                                <MoreVertical className="w-3.5 h-3.5 text-zinc-400" />
                                            </button>
                                            {openMenuId === c.id && (
                                                <div className="absolute right-0 top-full mt-1 w-28 bg-white dark:bg-zinc-800 rounded-lg shadow-xl border border-zinc-200 dark:border-zinc-700 overflow-hidden z-10">
                                                    <button
                                                        onClick={() => handleStartEdit(c)}
                                                        className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-zinc-100 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300"
                                                    >
                                                        <Pencil className="w-3 h-3" /> {t("edit") || "Düzenle"}
                                                    </button>
                                                    <button
                                                        onClick={() => handleDeleteComment(c.id)}
                                                        className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500"
                                                    >
                                                        <Trash2 className="w-3 h-3" /> {t("delete") || "Sil"}
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    )}
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
                                    className="flex-1 px-3 py-2 rounded-lg bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-sm text-zinc-900 dark:text-white placeholder:text-zinc-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                />
                                <button onClick={handleSendComment} className="p-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors" disabled={!newComment.trim()}>
                                    <Send className="w-4 h-4" />
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
