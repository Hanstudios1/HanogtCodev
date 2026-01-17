"use client";

import { useI18n } from "@/lib/i18n";
import Link from "next/link";
import { useState, useEffect } from "react";
import { ArrowLeft, MessageSquare, HelpCircle, ThumbsUp, Send, MessageCircle, User, Edit3, Trash2, Reply, X, Check, PlusCircle } from "lucide-react";
import { useSession } from "next-auth/react";
import { db } from "@/lib/firebase";
import { collection, addDoc, getDocs, updateDoc, doc, query, orderBy, serverTimestamp, arrayUnion, arrayRemove, deleteDoc } from "firebase/firestore";

interface FeedbackItem {
    id: string;
    type: "question" | "feedback";
    content: string;
    description?: string;
    author: string;
    authorEmail: string;
    createdAt: Date;
    likes: string[];
    comments: Comment[];
}

interface Comment {
    id: string;
    author: string;
    authorEmail: string;
    content: string;
    replyTo?: string;
    replyToContent?: string;
    createdAt: Date;
}

export default function FeedbackPage() {
    const { t } = useI18n();
    const { data: session } = useSession();
    const [activeTab, setActiveTab] = useState<"questions" | "feedback">("questions");
    const [message, setMessage] = useState("");
    const [description, setDescription] = useState("");
    const [showDescriptionInput, setShowDescriptionInput] = useState(false);
    const [items, setItems] = useState<FeedbackItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [commentText, setCommentText] = useState<{ [key: string]: string }>({});
    const [showComments, setShowComments] = useState<{ [key: string]: boolean }>({});

    // Edit states
    const [editingItemId, setEditingItemId] = useState<string | null>(null);
    const [editContent, setEditContent] = useState("");
    const [editDescription, setEditDescription] = useState("");
    const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
    const [editCommentContent, setEditCommentContent] = useState("");

    // Reply states (WhatsApp style)
    const [replyingTo, setReplyingTo] = useState<{ itemId: string; commentId: string; author: string; content: string } | null>(null);

    // Fetch items from Firebase
    useEffect(() => {
        fetchItems();
    }, []);

    const fetchItems = async () => {
        try {
            const q = query(collection(db, "feedback"), orderBy("createdAt", "desc"));
            const snapshot = await getDocs(q);
            const fetchedItems: FeedbackItem[] = snapshot.docs.map(docSnap => ({
                id: docSnap.id,
                ...docSnap.data(),
                createdAt: docSnap.data().createdAt?.toDate() || new Date(),
                likes: docSnap.data().likes || [],
                comments: (docSnap.data().comments || []).map((c: Comment, idx: number) => ({
                    ...c,
                    id: c.id || `comment_${idx}`
                }))
            })) as FeedbackItem[];

            // Sort by likes count
            fetchedItems.sort((a, b) => b.likes.length - a.likes.length);
            setItems(fetchedItems);
        } catch (error) {
            console.error("Error fetching feedback:", error);
        } finally {
            setLoading(false);
        }
    };

    const handleSubmit = async (type: "question" | "feedback") => {
        if (!session?.user?.email || !message.trim()) return;

        setSubmitting(true);
        try {
            await addDoc(collection(db, "feedback"), {
                type,
                content: message.trim(),
                description: description.trim() || null,
                author: session.user.name || session.user.email.split("@")[0],
                authorEmail: session.user.email,
                createdAt: serverTimestamp(),
                likes: [],
                comments: []
            });
            setMessage("");
            setDescription("");
            setShowDescriptionInput(false);
            fetchItems();
        } catch (error) {
            console.error("Error submitting feedback:", error);
        } finally {
            setSubmitting(false);
        }
    };

    const handleLike = async (itemId: string) => {
        if (!session?.user?.email) return;

        const item = items.find(i => i.id === itemId);
        if (!item) return;

        const docRef = doc(db, "feedback", itemId);
        const isLiked = item.likes.includes(session.user.email);

        try {
            await updateDoc(docRef, {
                likes: isLiked
                    ? arrayRemove(session.user.email)
                    : arrayUnion(session.user.email)
            });
            fetchItems();
        } catch (error) {
            console.error("Error updating like:", error);
        }
    };

    // Delete item
    const handleDeleteItem = async (itemId: string) => {
        if (!session?.user?.email) return;

        const item = items.find(i => i.id === itemId);
        if (!item || item.authorEmail !== session.user.email) return;

        if (!confirm("Bu içeriği silmek istediğinize emin misiniz?")) return;

        try {
            await deleteDoc(doc(db, "feedback", itemId));
            fetchItems();
        } catch (error) {
            console.error("Error deleting item:", error);
        }
    };

    // Edit item
    const handleStartEditItem = (item: FeedbackItem) => {
        setEditingItemId(item.id);
        setEditContent(item.content);
        setEditDescription(item.description || "");
    };

    const handleSaveEditItem = async (itemId: string) => {
        if (!editContent.trim()) return;

        try {
            await updateDoc(doc(db, "feedback", itemId), {
                content: editContent.trim(),
                description: editDescription.trim() || null
            });
            setEditingItemId(null);
            setEditContent("");
            setEditDescription("");
            fetchItems();
        } catch (error) {
            console.error("Error updating item:", error);
        }
    };

    const handleComment = async (itemId: string) => {
        if (!session?.user?.email || !commentText[itemId]?.trim()) return;

        const item = items.find(i => i.id === itemId);
        if (!item) return;

        const newComment: Comment = {
            id: `comment_${Date.now()}`,
            author: session.user.name || session.user.email.split("@")[0],
            authorEmail: session.user.email,
            content: commentText[itemId].trim(),
            replyTo: replyingTo?.commentId || undefined,
            replyToContent: replyingTo?.content || undefined,
            createdAt: new Date()
        };

        try {
            await updateDoc(doc(db, "feedback", itemId), {
                comments: arrayUnion(newComment)
            });
            setCommentText(prev => ({ ...prev, [itemId]: "" }));
            setReplyingTo(null);
            fetchItems();
        } catch (error) {
            console.error("Error adding comment:", error);
        }
    };

    // Delete comment
    const handleDeleteComment = async (itemId: string, comment: Comment) => {
        if (!session?.user?.email || comment.authorEmail !== session.user.email) return;

        const item = items.find(i => i.id === itemId);
        if (!item) return;

        try {
            const updatedComments = item.comments.filter(c => c.id !== comment.id);
            await updateDoc(doc(db, "feedback", itemId), {
                comments: updatedComments
            });
            fetchItems();
        } catch (error) {
            console.error("Error deleting comment:", error);
        }
    };

    // Edit comment
    const handleStartEditComment = (comment: Comment) => {
        setEditingCommentId(comment.id);
        setEditCommentContent(comment.content);
    };

    const handleSaveEditComment = async (itemId: string, commentId: string) => {
        if (!editCommentContent.trim()) return;

        const item = items.find(i => i.id === itemId);
        if (!item) return;

        try {
            const updatedComments = item.comments.map(c =>
                c.id === commentId ? { ...c, content: editCommentContent.trim() } : c
            );
            await updateDoc(doc(db, "feedback", itemId), {
                comments: updatedComments
            });
            setEditingCommentId(null);
            setEditCommentContent("");
            fetchItems();
        } catch (error) {
            console.error("Error updating comment:", error);
        }
    };

    const filteredItems = items.filter(item =>
        activeTab === "questions" ? item.type === "question" : item.type === "feedback"
    );

    return (
        <div className="min-h-screen bg-white dark:bg-black text-zinc-900 dark:text-white transition-colors">
            {/* Header */}
            <header className="py-6 border-b border-zinc-200 dark:border-zinc-800">
                <div className="max-w-4xl mx-auto px-6 flex items-center justify-between">
                    <Link href="/" className="flex items-center gap-2 text-zinc-600 dark:text-zinc-400 hover:text-blue-500 dark:hover:text-blue-400 transition-colors">
                        <ArrowLeft className="w-5 h-5" />
                        <span>{t("back_button") || "Geri"}</span>
                    </Link>
                    <Link href="/" className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-600">
                        Hanogt Codev
                    </Link>
                    <div className="w-16"></div>
                </div>
            </header>

            {/* Content */}
            <main className="max-w-4xl mx-auto px-6 py-12">
                <h1 className="text-3xl md:text-4xl font-bold text-center mb-6">
                    {t("feedback_title") || "Geri Bildirim & SSS"}
                </h1>
                <p className="text-center text-zinc-600 dark:text-zinc-400 mb-10">
                    {t("feedback_subtitle") || "Sorularınızı sorun, geri bildirimlerinizi paylaşın"}
                </p>

                {/* Tabs */}
                <div className="flex justify-center gap-4 mb-8">
                    <button
                        onClick={() => setActiveTab("questions")}
                        className={`flex items-center gap-2 px-6 py-3 rounded-xl font-medium transition-all ${activeTab === "questions"
                            ? "bg-blue-600 text-white shadow-lg shadow-blue-500/30"
                            : "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700"
                            }`}
                    >
                        <HelpCircle className="w-5 h-5" />
                        {t("feedback_questions_tab") || "Sıkça Sorulan Sorular"}
                    </button>
                    <button
                        onClick={() => setActiveTab("feedback")}
                        className={`flex items-center gap-2 px-6 py-3 rounded-xl font-medium transition-all ${activeTab === "feedback"
                            ? "bg-purple-600 text-white shadow-lg shadow-purple-500/30"
                            : "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700"
                            }`}
                    >
                        <MessageSquare className="w-5 h-5" />
                        {t("feedback_feedback_tab") || "Geri Bildirimler"}
                    </button>
                </div>

                {/* Submit Form */}
                {session?.user ? (
                    <div className="bg-zinc-100 dark:bg-zinc-900 rounded-2xl p-6 mb-8 border border-zinc-200 dark:border-zinc-800">
                        <textarea
                            value={message}
                            onChange={(e) => setMessage(e.target.value)}
                            placeholder={activeTab === "questions"
                                ? (t("feedback_question_placeholder") || "Sorunuzu yazın...")
                                : (t("feedback_feedback_placeholder") || "Geri bildiriminizi yazın...")
                            }
                            className="w-full h-24 p-4 bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-xl resize-none focus:ring-2 focus:ring-blue-500 outline-none text-zinc-900 dark:text-white"
                        />

                        {/* Add Description Section */}
                        {!showDescriptionInput ? (
                            <button
                                onClick={() => setShowDescriptionInput(true)}
                                className="flex items-center gap-2 mt-3 text-sm text-blue-600 dark:text-blue-400 hover:underline"
                            >
                                <PlusCircle className="w-4 h-4" />
                                {t("add_description") || "Açıklama Ekle"}
                            </button>
                        ) : (
                            <div className="mt-3">
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-sm font-medium text-zinc-600 dark:text-zinc-400">
                                        {t("add_description") || "Açıklama Ekle"}
                                    </span>
                                    <button
                                        onClick={() => { setShowDescriptionInput(false); setDescription(""); }}
                                        className="text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
                                    >
                                        <X className="w-4 h-4" />
                                    </button>
                                </div>
                                <textarea
                                    value={description}
                                    onChange={(e) => setDescription(e.target.value)}
                                    placeholder={t("description_placeholder") || "Detaylı açıklama yazın..."}
                                    className="w-full h-24 p-4 bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-xl resize-none focus:ring-2 focus:ring-blue-500 outline-none text-zinc-900 dark:text-white text-sm"
                                />
                            </div>
                        )}

                        <div className="flex gap-3 mt-4">
                            <button
                                onClick={() => handleSubmit("question")}
                                disabled={submitting || !message.trim()}
                                className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:opacity-50 text-white rounded-xl font-medium transition-colors"
                            >
                                <HelpCircle className="w-5 h-5" />
                                {t("feedback_submit_question") || "Soru Olarak Gönder"}
                            </button>
                            <button
                                onClick={() => handleSubmit("feedback")}
                                disabled={submitting || !message.trim()}
                                className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-800 disabled:opacity-50 text-white rounded-xl font-medium transition-colors"
                            >
                                <MessageSquare className="w-5 h-5" />
                                {t("feedback_submit_feedback") || "Geri Bildirim Olarak Gönder"}
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className="bg-yellow-100 dark:bg-yellow-900/30 border border-yellow-300 dark:border-yellow-700 rounded-xl p-6 mb-8 text-center">
                        <p className="text-yellow-700 dark:text-yellow-400 mb-4">
                            {t("feedback_login_required") || "Soru veya geri bildirim göndermek için giriş yapmalısınız."}
                        </p>
                        <Link href="/login" className="inline-block px-6 py-2 bg-yellow-600 hover:bg-yellow-700 text-white rounded-lg font-medium transition-colors">
                            {t("login") || "Giriş Yap"}
                        </Link>
                    </div>
                )}

                {/* Items List */}
                <div className="space-y-4">
                    {loading ? (
                        <div className="text-center py-12 text-zinc-500">
                            {t("loading") || "Yükleniyor..."}
                        </div>
                    ) : filteredItems.length === 0 ? (
                        <div className="text-center py-12 text-zinc-500">
                            {activeTab === "questions"
                                ? (t("feedback_no_questions") || "Henüz soru yok. İlk soruyu siz sorun!")
                                : (t("feedback_no_feedback") || "Henüz geri bildirim yok. İlk geri bildirimi siz gönderin!")
                            }
                        </div>
                    ) : (
                        filteredItems.map(item => (
                            <div key={item.id} className="bg-zinc-50 dark:bg-zinc-900 rounded-xl p-6 border border-zinc-200 dark:border-zinc-800">
                                {/* Author, Type, and Actions */}
                                <div className="flex items-center justify-between mb-3">
                                    <div className="flex items-center gap-2">
                                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                                            <User className="w-4 h-4 text-white" />
                                        </div>
                                        <span className="font-medium text-zinc-700 dark:text-zinc-300">{item.author}</span>
                                        <span className={`px-2 py-0.5 rounded-full text-xs ${item.type === "question"
                                            ? "bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400"
                                            : "bg-purple-100 dark:bg-purple-900/50 text-purple-600 dark:text-purple-400"
                                            }`}>
                                            {item.type === "question" ? (t("question") || "Soru") : (t("feedback_label") || "Geri Bildirim")}
                                        </span>
                                    </div>

                                    {/* Edit/Delete buttons for owner */}
                                    {session?.user?.email === item.authorEmail && (
                                        <div className="flex items-center gap-2">
                                            <button
                                                onClick={() => handleStartEditItem(item)}
                                                className="p-2 text-zinc-500 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-lg transition-colors"
                                                title={t("edit") || "Düzenle"}
                                            >
                                                <Edit3 className="w-4 h-4" />
                                            </button>
                                            <button
                                                onClick={() => handleDeleteItem(item.id)}
                                                className="p-2 text-zinc-500 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors"
                                                title={t("delete_item") || "Sil"}
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    )}
                                </div>

                                {/* Content - Edit Mode or Display Mode */}
                                {editingItemId === item.id ? (
                                    <div className="mb-4">
                                        <textarea
                                            value={editContent}
                                            onChange={(e) => setEditContent(e.target.value)}
                                            className="w-full h-24 p-3 bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-lg resize-none focus:ring-2 focus:ring-blue-500 outline-none text-zinc-900 dark:text-white"
                                        />
                                        <textarea
                                            value={editDescription}
                                            onChange={(e) => setEditDescription(e.target.value)}
                                            placeholder={t("description_placeholder") || "Detaylı açıklama yazın..."}
                                            className="w-full h-16 p-3 mt-2 bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-lg resize-none focus:ring-2 focus:ring-blue-500 outline-none text-zinc-900 dark:text-white text-sm"
                                        />
                                        <div className="flex gap-2 mt-2">
                                            <button
                                                onClick={() => handleSaveEditItem(item.id)}
                                                className="flex items-center gap-1 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-sm rounded-lg transition-colors"
                                            >
                                                <Check className="w-4 h-4" />
                                                {t("save_changes") || "Değişiklikleri Kaydet"}
                                            </button>
                                            <button
                                                onClick={() => { setEditingItemId(null); setEditContent(""); setEditDescription(""); }}
                                                className="flex items-center gap-1 px-3 py-1.5 bg-zinc-500 hover:bg-zinc-600 text-white text-sm rounded-lg transition-colors"
                                            >
                                                <X className="w-4 h-4" />
                                                {t("cancel") || "Vazgeç"}
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <>
                                        <p className="text-zinc-700 dark:text-zinc-300 mb-2">{item.content}</p>
                                        {/* Description Section */}
                                        {item.description && (
                                            <div className="bg-zinc-100 dark:bg-zinc-800 rounded-lg p-3 mb-4 border-l-4 border-blue-500">
                                                <p className="text-sm text-zinc-600 dark:text-zinc-400">{item.description}</p>
                                            </div>
                                        )}
                                    </>
                                )}

                                {/* Actions */}
                                <div className="flex items-center gap-4">
                                    <button
                                        onClick={() => handleLike(item.id)}
                                        disabled={!session?.user}
                                        className={`flex items-center gap-1 px-3 py-1.5 rounded-lg transition-colors ${session?.user?.email && item.likes.includes(session.user.email)
                                            ? "bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400"
                                            : "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700"
                                            }`}
                                    >
                                        <ThumbsUp className="w-4 h-4" />
                                        <span>{item.likes.length}</span>
                                    </button>
                                    <button
                                        onClick={() => setShowComments(prev => ({ ...prev, [item.id]: !prev[item.id] }))}
                                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
                                    >
                                        <MessageCircle className="w-4 h-4" />
                                        <span>{item.comments.length}</span>
                                    </button>
                                </div>

                                {/* Comments Section */}
                                {showComments[item.id] && (
                                    <div className="mt-4 pt-4 border-t border-zinc-200 dark:border-zinc-700">
                                        {/* Existing Comments */}
                                        {item.comments.length > 0 && (
                                            <div className="space-y-3 mb-4">
                                                {item.comments.map((comment) => (
                                                    <div key={comment.id} className="bg-zinc-100 dark:bg-zinc-800 rounded-lg p-3">
                                                        {/* Reply Quote (WhatsApp style) */}
                                                        {comment.replyToContent && (
                                                            <div className="bg-zinc-200 dark:bg-zinc-700 rounded-lg p-2 mb-2 border-l-4 border-green-500">
                                                                <p className="text-xs text-zinc-500 dark:text-zinc-400 line-clamp-2">
                                                                    {comment.replyToContent}
                                                                </p>
                                                            </div>
                                                        )}

                                                        <div className="flex items-center justify-between">
                                                            <span className="font-medium text-sm text-zinc-700 dark:text-zinc-300">{comment.author}</span>

                                                            {/* Comment actions */}
                                                            <div className="flex items-center gap-1">
                                                                {session?.user && (
                                                                    <button
                                                                        onClick={() => {
                                                                            setReplyingTo({
                                                                                itemId: item.id,
                                                                                commentId: comment.id,
                                                                                author: comment.author,
                                                                                content: comment.content
                                                                            });
                                                                        }}
                                                                        className="p-1 text-zinc-400 hover:text-green-500 transition-colors"
                                                                        title={t("reply") || "Yanıtla"}
                                                                    >
                                                                        <Reply className="w-3 h-3" />
                                                                    </button>
                                                                )}
                                                                {session?.user?.email === comment.authorEmail && (
                                                                    <>
                                                                        <button
                                                                            onClick={() => handleStartEditComment(comment)}
                                                                            className="p-1 text-zinc-400 hover:text-blue-500 transition-colors"
                                                                            title={t("edit") || "Düzenle"}
                                                                        >
                                                                            <Edit3 className="w-3 h-3" />
                                                                        </button>
                                                                        <button
                                                                            onClick={() => handleDeleteComment(item.id, comment)}
                                                                            className="p-1 text-zinc-400 hover:text-red-500 transition-colors"
                                                                            title={t("delete_item") || "Sil"}
                                                                        >
                                                                            <Trash2 className="w-3 h-3" />
                                                                        </button>
                                                                    </>
                                                                )}
                                                            </div>
                                                        </div>

                                                        {/* Edit comment mode */}
                                                        {editingCommentId === comment.id ? (
                                                            <div className="mt-2">
                                                                <input
                                                                    type="text"
                                                                    value={editCommentContent}
                                                                    onChange={(e) => setEditCommentContent(e.target.value)}
                                                                    className="w-full px-3 py-1.5 bg-white dark:bg-zinc-700 border border-zinc-300 dark:border-zinc-600 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                                                                />
                                                                <div className="flex gap-2 mt-2">
                                                                    <button
                                                                        onClick={() => handleSaveEditComment(item.id, comment.id)}
                                                                        className="px-2 py-1 bg-green-600 text-white text-xs rounded transition-colors"
                                                                    >
                                                                        <Check className="w-3 h-3" />
                                                                    </button>
                                                                    <button
                                                                        onClick={() => { setEditingCommentId(null); setEditCommentContent(""); }}
                                                                        className="px-2 py-1 bg-zinc-500 text-white text-xs rounded transition-colors"
                                                                    >
                                                                        <X className="w-3 h-3" />
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        ) : (
                                                            <p className="text-sm text-zinc-600 dark:text-zinc-400">{comment.content}</p>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        )}

                                        {/* Add Comment */}
                                        {session?.user && (
                                            <div>
                                                {/* Reply indicator (WhatsApp style) */}
                                                {replyingTo && replyingTo.itemId === item.id && (
                                                    <div className="flex items-center justify-between bg-green-50 dark:bg-green-900/30 rounded-t-lg p-2 border-l-4 border-green-500">
                                                        <div>
                                                            <span className="text-xs text-green-600 dark:text-green-400 font-medium">
                                                                {t("replying_to") || "Yanıtlanıyor:"} {replyingTo.author}
                                                            </span>
                                                            <p className="text-xs text-zinc-500 dark:text-zinc-400 line-clamp-1">
                                                                {replyingTo.content}
                                                            </p>
                                                        </div>
                                                        <button
                                                            onClick={() => setReplyingTo(null)}
                                                            className="text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
                                                        >
                                                            <X className="w-4 h-4" />
                                                        </button>
                                                    </div>
                                                )}
                                                <div className={`flex gap-2 ${replyingTo && replyingTo.itemId === item.id ? 'rounded-b-lg' : ''}`}>
                                                    <input
                                                        type="text"
                                                        value={commentText[item.id] || ""}
                                                        onChange={(e) => setCommentText(prev => ({ ...prev, [item.id]: e.target.value }))}
                                                        placeholder={t("feedback_comment_placeholder") || "Yorum yazın..."}
                                                        className="flex-1 px-4 py-2 bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-600 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                                                    />
                                                    <button
                                                        onClick={() => handleComment(item.id)}
                                                        disabled={!commentText[item.id]?.trim()}
                                                        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg transition-colors"
                                                    >
                                                        <Send className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        ))
                    )}
                </div>

                {/* Back to Home */}
                <div className="mt-12 text-center">
                    <Link
                        href="/"
                        className="inline-block px-8 py-4 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-full transition-all shadow-lg"
                    >
                        {t("back_to_home") || "Ana Sayfaya Dön"}
                    </Link>
                </div>
            </main>

            {/* Footer */}
            <footer className="py-8 border-t border-zinc-200 dark:border-zinc-800 mt-12">
                <div className="max-w-4xl mx-auto px-6 text-center text-zinc-500">
                    <p>© 2026 Hanogt Codev. {t("all_rights_reserved") || "Tüm hakları saklıdır."}</p>
                </div>
            </footer>
        </div>
    );
}
