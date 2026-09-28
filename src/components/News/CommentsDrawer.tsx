"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ExternalLink, LoaderCircle, MessageCircle, Send, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useEffect, useRef, useState } from "react";
import { timeAgo, type NewsItemView } from "./NewsTypes";

interface CommentView {
    id: string;
    authorName: string;
    authorImage: string | null;
    text: string;
    createdAt: string | null;
    mine: boolean;
}

export default function CommentsDrawer({ item, locale, onClose, onCountChange }: {
    item: NewsItemView | null;
    locale: "tr" | "en";
    onClose: () => void;
    onCountChange: (id: string, delta: number) => void;
}) {
    const { data: session } = useSession();
    const [comments, setComments] = useState<CommentView[]>([]);
    const [loading, setLoading] = useState(false);
    const [text, setText] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [sending, setSending] = useState(false);
    const listRef = useRef<HTMLDivElement | null>(null);
    const tr = locale === "tr";

    useEffect(() => {
        if (!item) return;
        const controller = new AbortController();
        const load = async () => {
            setLoading(true);
            setError(null);
            setComments([]);
            try {
                const response = await fetch(`/api/news/comments?newsId=${item.id}`, { signal: controller.signal, cache: "no-store" });
                const payload = await response.json() as { comments?: CommentView[]; error?: string };
                if (!response.ok) throw new Error(payload.error || "Yorumlar yüklenemedi.");
                setComments(payload.comments ?? []);
            } catch (reason) {
                if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Yorumlar yüklenemedi.");
            } finally {
                if (!controller.signal.aborted) setLoading(false);
            }
        };
        void load();
        const onKey = (event: KeyboardEvent) => {
            if (event.key === "Escape") onClose();
        };
        window.addEventListener("keydown", onKey);
        return () => {
            controller.abort();
            window.removeEventListener("keydown", onKey);
        };
    }, [item, onClose]);

    const send = async () => {
        if (!item || text.trim().length < 2) return;
        setSending(true);
        setError(null);
        try {
            const response = await fetch("/api/news/comments", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ newsId: item.id, text }),
            });
            const payload = await response.json() as { comment?: CommentView; error?: string };
            if (!response.ok || !payload.comment) throw new Error(payload.error || "Yorum gönderilemedi.");
            setComments((current) => [...current, payload.comment as CommentView]);
            setText("");
            onCountChange(item.id, 1);
            requestAnimationFrame(() => listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" }));
        } catch (reason) {
            setError(reason instanceof Error ? reason.message : "Yorum gönderilemedi.");
        } finally {
            setSending(false);
        }
    };

    const remove = async (comment: CommentView) => {
        if (!item || !window.confirm(tr ? "Yorum silinsin mi?" : "Delete this comment?")) return;
        const response = await fetch(`/api/news/comments?id=${encodeURIComponent(comment.id)}`, { method: "DELETE" });
        if (response.ok) {
            setComments((current) => current.filter((entry) => entry.id !== comment.id));
            onCountChange(item.id, -1);
        }
    };

    return (
        <AnimatePresence>
            {item ? (
                <motion.div className="fixed inset-0 z-[120] flex justify-end" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                    <button type="button" aria-label={tr ? "Kapat" : "Close"} className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
                    <motion.aside
                        role="dialog"
                        aria-modal="true"
                        aria-label={tr ? "Yorumlar" : "Comments"}
                        initial={{ x: "100%" }}
                        animate={{ x: 0 }}
                        exit={{ x: "100%" }}
                        transition={{ type: "spring", stiffness: 320, damping: 34 }}
                        className="relative flex h-full w-full max-w-md flex-col bg-white shadow-2xl dark:bg-zinc-950"
                    >
                        <div className="flex items-start gap-3 border-b border-zinc-200 p-4 dark:border-white/10">
                            <MessageCircle className="mt-0.5 h-5 w-5 shrink-0 text-indigo-500" />
                            <div className="min-w-0 flex-1">
                                <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">{item.source.name}</p>
                                <h2 className="mt-0.5 line-clamp-3 text-[15px] font-bold leading-snug text-zinc-900 dark:text-white">{item.title}</h2>
                                <a href={item.link} target="_blank" rel="noopener noreferrer nofollow" className="mt-1 inline-flex items-center gap-1 text-[12px] font-semibold text-indigo-600 hover:underline dark:text-indigo-400">{tr ? "Haberi kaynağında oku" : "Read at source"}<ExternalLink className="h-3 w-3" /></a>
                            </div>
                            <button type="button" onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg text-zinc-500 hover:bg-zinc-100 dark:hover:bg-white/10" aria-label={tr ? "Kapat" : "Close"}><X className="h-4 w-4" /></button>
                        </div>
                        <div ref={listRef} className="scrollbar-thin min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
                            {loading ? <div className="grid place-items-center py-10"><LoaderCircle className="h-6 w-6 animate-spin text-zinc-400" /></div> : null}
                            {!loading && !error && !comments.length ? (
                                <div className="py-10 text-center text-[13px] text-zinc-500">
                                    <p className="text-3xl">💬</p>
                                    <p className="mt-2">{tr ? "Henüz yorum yok. İlk yorumu sen yap!" : "No comments yet. Be the first!"}</p>
                                </div>
                            ) : null}
                            <AnimatePresence initial={false}>
                                {comments.map((comment) => (
                                    <motion.div key={comment.id} layout initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: 40 }} className="group flex gap-2.5">
                                        {comment.authorImage ? (
                                            // eslint-disable-next-line @next/next/no-img-element
                                            <img src={comment.authorImage} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover" />
                                        ) : <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-gradient-to-br from-indigo-500 to-fuchsia-500 text-[12px] font-bold text-white">{comment.authorName.charAt(0).toUpperCase()}</span>}
                                        <div className="min-w-0 flex-1 rounded-2xl rounded-tl-sm bg-zinc-100 px-3 py-2 dark:bg-white/[0.06]">
                                            <div className="flex items-center gap-2">
                                                <span className="truncate text-[12.5px] font-bold text-zinc-800 dark:text-zinc-100">{comment.authorName}</span>
                                                {comment.createdAt ? <span className="text-[11px] text-zinc-400">{timeAgo(comment.createdAt, locale)}</span> : null}
                                                {comment.mine ? (
                                                    <button type="button" onClick={() => void remove(comment)} className="ml-auto text-zinc-400 opacity-0 transition hover:text-red-500 group-hover:opacity-100" aria-label={tr ? "Sil" : "Delete"}><Trash2 className="h-3.5 w-3.5" /></button>
                                                ) : null}
                                            </div>
                                            <p className="mt-0.5 whitespace-pre-wrap break-words text-[13.5px] leading-relaxed text-zinc-700 dark:text-zinc-300">{comment.text}</p>
                                        </div>
                                    </motion.div>
                                ))}
                            </AnimatePresence>
                        </div>
                        <div className="border-t border-zinc-200 p-3 dark:border-white/10">
                            {error ? <p className="mb-2 rounded-lg bg-red-500/10 px-3 py-1.5 text-[12px] text-red-600 dark:text-red-300" role="alert">{error}</p> : null}
                            {session?.user ? (
                                <div className="flex items-end gap-2">
                                    <textarea
                                        value={text}
                                        maxLength={1000}
                                        rows={2}
                                        onChange={(event) => setText(event.target.value)}
                                        onKeyDown={(event) => { if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) void send(); }}
                                        placeholder={tr ? "Düşünceni yaz… (Ctrl+Enter)" : "Share your thoughts… (Ctrl+Enter)"}
                                        className="min-h-[44px] flex-1 resize-none rounded-xl border border-zinc-200 bg-white px-3 py-2 text-[13.5px] text-zinc-800 outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10 dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-100"
                                    />
                                    <button type="button" disabled={sending || text.trim().length < 2} onClick={() => void send()} className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-indigo-500 text-white shadow-lg shadow-indigo-500/25 transition hover:bg-indigo-400 disabled:opacity-40" aria-label={tr ? "Gönder" : "Send"}>
                                        {sending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                                    </button>
                                </div>
                            ) : (
                                <Link href="/login?callbackUrl=/news" className="flex h-11 items-center justify-center rounded-xl bg-zinc-900 text-[13px] font-semibold text-white dark:bg-white dark:text-zinc-900">{tr ? "Yorum yapmak için giriş yap" : "Sign in to comment"}</Link>
                            )}
                            <p className="mt-2 text-[10.5px] leading-snug text-zinc-400">{tr ? "Saygılı olun. Hakaret, spam ve kişisel veri paylaşımı kaldırılır. Yorumlar herkese açıktır." : "Be respectful. Insults, spam and personal data are removed. Comments are public."}</p>
                        </div>
                    </motion.aside>
                </motion.div>
            ) : null}
        </AnimatePresence>
    );
}
