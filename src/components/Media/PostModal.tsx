"use client";

import { motion } from "framer-motion";
import { ArrowDownToLine, CheckCircle2, ClipboardCopy, Code2, Eye, Flag, LoaderCircle, MessageCircle, Pencil, Trash2, X } from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import { MEDIA_LIMITS, mediaTagSuggestions, normalizeMediaLicense } from "@/components/Editor/media-publish";
import { REPORT_CATEGORIES } from "@/lib/reports";
import { useI18n } from "@/lib/i18n";
import { M, REPORT_REASON_LABELS } from "./copy";
import { formatDate, useDialogFocus } from "./helpers";
import { Avatar, TagChip } from "./PostCard";
import PostFieldsForm from "./PostFieldsForm";
import type { Banner, Detail, PostComment, PostFields } from "./types";

interface PostModalProps {
    detail: Detail;
    signedIn: boolean;
    busy: boolean;
    banner: Banner | null;
    activeTag: string | null;
    onDismissBanner: () => void;
    onClose: () => void;
    onDelete: () => void;
    onComment: (text: string) => Promise<boolean>;
    onDeleteComment: (comment: PostComment) => Promise<boolean>;
    onReport: (category: string, reason: string) => Promise<boolean>;
    onUpdate: (fields: PostFields) => Promise<boolean>;
    onOpenInEditor: () => void;
    onCopyLink: () => void;
    onTag: (tag: string) => void;
}

/** One comment; its author and the post's owner see a delete button that asks first. */
function CommentItem({ comment, busy, onDelete }: { comment: PostComment; busy: boolean; onDelete: () => Promise<boolean> }) {
    const { tx, locale } = useI18n();
    const [confirming, setConfirming] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const confirmId = useId();
    const remove = async () => {
        setDeleting(true);
        const ok = await onDelete();
        // A deleted comment leaves the list; one that failed stays with the question closed.
        if (!ok) {
            setDeleting(false);
            setConfirming(false);
        }
    };
    return (
        <li className={`rounded-2xl p-3 ${comment.mine ? "bg-blue-950/40" : "bg-zinc-950/70"}`}>
            <div className="flex items-center gap-2">
                <Avatar post={{ author: comment.author, authorAvatar: comment.authorAvatar }} size="sm" />
                <span className="min-w-0 truncate text-xs font-bold" dir="auto">{comment.author}</span>
                {comment.mine && <span className="shrink-0 rounded-full bg-blue-600/30 px-1.5 py-0.5 text-[10px] font-semibold text-blue-200">{tx(M.yourComment)}</span>}
                <span className="ms-auto shrink-0 text-[11px] text-zinc-500">{formatDate(comment.createdAt, locale, "")}</span>
                {comment.canDelete && !confirming && (
                    <button type="button" disabled={busy || deleting} onClick={() => setConfirming(true)} className="shrink-0 rounded-lg p-1 text-zinc-500 transition hover:bg-zinc-800 hover:text-red-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 disabled:opacity-40" title={tx(M.deleteComment)} aria-label={tx(M.deleteComment)}>
                        <Trash2 className="h-3.5 w-3.5" aria-hidden />
                    </button>
                )}
            </div>
            <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-5 text-zinc-300" dir="auto">{comment.text}</p>
            {confirming && (
                <div role="group" aria-labelledby={confirmId} className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-red-900/60 bg-red-950/30 p-2">
                    <span id={confirmId} className="flex-1 text-xs text-red-200">{tx(M.deleteCommentConfirm)}</span>
                    <button type="button" disabled={deleting} onClick={() => setConfirming(false)} className="rounded-lg px-2.5 py-1 text-xs font-semibold text-zinc-300 hover:bg-zinc-800">{tx(M.cancel)}</button>
                    <button type="button" autoFocus disabled={deleting} onClick={() => void remove()} className="inline-flex items-center gap-1 rounded-lg bg-red-600 px-2.5 py-1 text-xs font-bold text-white hover:bg-red-700 disabled:opacity-60">
                        {deleting ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Trash2 className="h-3.5 w-3.5" aria-hidden />}
                        {tx(M.delete)}
                    </button>
                </div>
            )}
        </li>
    );
}

export default function PostModal({ detail, signedIn, busy, banner, activeTag, onDismissBanner, onClose, onDelete, onComment, onDeleteComment, onReport, onUpdate, onOpenInEditor, onCopyLink, onTag }: PostModalProps) {
    const { tx } = useI18n();
    const { post, files, comments } = detail;
    const [selectedFile, setSelectedFile] = useState(0);
    const [comment, setComment] = useState("");
    const [reportOpen, setReportOpen] = useState(false);
    const [reportCategory, setReportCategory] = useState("other");
    const [reportReason, setReportReason] = useState("");
    const [editing, setEditing] = useState<PostFields | null>(null);
    const titleId = useId();
    const commentId = useId();
    const ref = useDialogFocus(true, onClose);
    const shownFile = files[Math.min(selectedFile, Math.max(0, files.length - 1))];
    const commentsFull = post.commentCount >= MEDIA_LIMITS.commentsPerPost;

    const startEdit = () => {
        setEditing({ title: post.title, description: post.description, tags: post.tags, license: normalizeMediaLicense(post.license), showAuthor: post.showAuthor });
        window.requestAnimationFrame(() => ref.current?.querySelector<HTMLInputElement>("form input")?.focus());
    };
    const iconButton = "rounded-xl p-2 transition hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500";

    const actions: ReactNode = (
        <div className="flex flex-wrap justify-end gap-1">
            <button type="button" onClick={onOpenInEditor} disabled={!files.length} className={`${iconButton} flex items-center gap-1.5 text-sm font-semibold disabled:opacity-40`} title={tx(M.openInEditorHint)}>
                <Code2 className="h-5 w-5" aria-hidden />
                <span className="hidden sm:inline">{tx(M.openInEditor)}</span>
                <span className="sr-only sm:hidden">{tx(M.openInEditor)}</span>
            </button>
            {post.owned && (
                <button type="button" onClick={editing ? () => setEditing(null) : startEdit} aria-pressed={Boolean(editing)} className={`${iconButton} ${editing ? "bg-zinc-800 text-blue-300" : ""}`} title={tx(M.editTitle)} aria-label={tx(M.editTitle)}>
                    <Pencil className="h-5 w-5" aria-hidden />
                </button>
            )}
            <button type="button" onClick={onCopyLink} className={iconButton} title={tx(M.copyLink)} aria-label={tx(M.copyLink)}><ClipboardCopy className="h-5 w-5" aria-hidden /></button>
            {post.owned && <button type="button" onClick={onDelete} className={`${iconButton} text-red-400 hover:bg-red-950`} title={tx(M.deletePost)} aria-label={tx(M.deletePost)}><Trash2 className="h-5 w-5" aria-hidden /></button>}
            <a href={`/api/media/${post.id}/download`} className={iconButton} title={tx(M.download)} aria-label={tx(M.download)}><ArrowDownToLine className="h-5 w-5" aria-hidden /></a>
            <button type="button" data-autofocus onClick={onClose} className={iconButton} aria-label={tx(M.close)}><X className="h-5 w-5" aria-hidden /></button>
        </div>
    );

    const bannerBox = banner ? (
        <div role={banner.tone === "error" ? "alert" : "status"} className={`flex items-start justify-between gap-2 border-b px-4 py-2.5 text-sm ${banner.tone === "error" ? "border-amber-900/60 bg-amber-950/40 text-amber-100" : "border-emerald-900/60 bg-emerald-950/40 text-emerald-100"}`}>
            <span>{banner.text}</span>
            <button type="button" onClick={onDismissBanner} className="shrink-0 rounded-lg p-1 hover:bg-white/10" aria-label={tx(M.close)}><X className="h-4 w-4" aria-hidden /></button>
        </div>
    ) : null;

    return (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-2 sm:p-3" onMouseDown={onClose}>
            <motion.div ref={ref} role="dialog" aria-modal="true" aria-labelledby={titleId} initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 18 }} onMouseDown={(event) => event.stopPropagation()} className="grid h-[92vh] w-full max-w-6xl grid-rows-[50%_50%] overflow-hidden rounded-3xl border border-zinc-700 bg-zinc-950 text-white shadow-2xl lg:grid-cols-[1fr_360px] lg:grid-rows-1">
                <section className="flex min-w-0 flex-col">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800 px-4 py-3 sm:px-5">
                        <div className="min-w-0">
                            <h2 id={titleId} className="truncate font-black" dir="auto">{post.title}</h2>
                            <p className="text-xs text-zinc-400">{post.author} · {files.length} {tx(M.files)}</p>
                        </div>
                        {actions}
                    </div>
                    <div role="tablist" aria-label={tx(M.fileTabs)} className="flex gap-1 overflow-x-auto border-b border-zinc-800 bg-zinc-900 px-3 pt-2">
                        {files.map((file, index) => (
                            <button key={`${file.name}-${index}`} type="button" role="tab" aria-selected={shownFile === file} onClick={() => setSelectedFile(index)} className={`whitespace-nowrap rounded-t-xl px-4 py-2 text-xs font-semibold ${shownFile === file ? "bg-zinc-800 text-blue-300" : "text-zinc-400 hover:text-white"}`}>{file.name}</button>
                        ))}
                    </div>
                    <pre dir="ltr" className="min-h-0 flex-1 overflow-auto p-4 font-mono text-sm leading-6 text-zinc-300 sm:p-5" tabIndex={0} aria-label={shownFile?.name}><code>{shownFile?.code || ""}</code></pre>
                </section>
                <aside className="flex min-h-0 flex-col border-t border-zinc-800 bg-zinc-900 lg:border-s lg:border-t-0">
                    {bannerBox}
                    {editing ? (
                        <form className="min-h-0 flex-1 space-y-3 overflow-y-auto p-5" onSubmit={(event) => {
                            event.preventDefault();
                            if (!editing.title.trim()) return;
                            void onUpdate(editing).then((ok) => {
                                if (ok) setEditing(null);
                            });
                        }}>
                            <h3 className="flex items-center gap-2 text-sm font-bold"><Pencil className="h-4 w-4 text-blue-400" aria-hidden />{tx(M.editTitle)}</h3>
                            <PostFieldsForm value={editing} onChange={setEditing} tagSuggestions={mediaTagSuggestions(post.languages)} dark />
                            <p className="text-xs leading-5 text-zinc-400">{tx(M.editFilesHint)}</p>
                            <div className="flex gap-2">
                                <button type="button" onClick={() => setEditing(null)} className="flex-1 rounded-xl border border-zinc-700 py-2 text-sm font-semibold hover:bg-zinc-800">{tx(M.cancel)}</button>
                                <button type="submit" disabled={busy || !editing.title.trim()} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-blue-600 py-2 text-sm font-bold disabled:opacity-40">
                                    {busy ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden /> : <CheckCircle2 className="h-4 w-4" aria-hidden />}
                                    {tx(M.saveChanges)}
                                </button>
                            </div>
                        </form>
                    ) : (
                        <>
                            <div className="max-h-[45%] overflow-y-auto border-b border-zinc-800 p-5">
                                <div className="flex items-center justify-between">
                                    <span className="flex items-center gap-2 text-sm font-bold"><Eye className="h-4 w-4 text-blue-400" aria-hidden />{tx({ TR: "Proje ayrıntıları", EN: "Project details" })}</span>
                                    <button type="button" onClick={() => setReportOpen((value) => !value)} aria-expanded={reportOpen} className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-800 hover:text-red-400" title={tx(M.report)} aria-label={tx(M.report)}><Flag className="h-4 w-4" aria-hidden /></button>
                                </div>
                                <p className="mt-3 whitespace-pre-line break-words text-sm leading-6 text-zinc-400" dir="auto">{post.description || tx(M.noDescription)}</p>
                                {post.tags.length > 0 && <div className="mt-3 flex flex-wrap gap-1.5">{post.tags.map((tag) => <TagChip key={tag} tag={tag} active={tag === activeTag} onSelect={onTag} dark />)}</div>}
                                {reportOpen && (
                                    <div className="mt-4 space-y-2 rounded-2xl border border-red-900/60 bg-red-950/20 p-3">
                                        <select value={reportCategory} onChange={(event) => setReportCategory(event.target.value)} aria-label={tx({ TR: "Bildirim nedeni", EN: "Reason for the report" })} className="w-full rounded-xl bg-zinc-950 px-3 py-2 text-xs">
                                            {REPORT_CATEGORIES.map((category) => <option key={category} value={category}>{tx(REPORT_REASON_LABELS[category])}</option>)}
                                        </select>
                                        <textarea value={reportReason} maxLength={1200} onChange={(event) => setReportReason(event.target.value)} placeholder={tx({ TR: "Neyi incelemeliyiz?", EN: "What should we review?" })} aria-label={tx({ TR: "Neyi incelemeliyiz?", EN: "What should we review?" })} rows={3} className="w-full resize-none rounded-xl bg-zinc-950 px-3 py-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-red-400/50" />
                                        <button type="button" disabled={busy || !reportReason.trim()} onClick={() => void onReport(reportCategory, reportReason).then((ok) => {
                                            if (!ok) return;
                                            setReportOpen(false);
                                            setReportReason("");
                                        })} className="w-full rounded-xl bg-red-600 py-2 text-xs font-bold disabled:opacity-40">{tx({ TR: "Bildirimi gönder", EN: "Send report" })}</button>
                                    </div>
                                )}
                            </div>
                            <div className="min-h-0 flex-1 overflow-y-auto p-5">
                                <h3 className="flex items-center gap-2 text-sm font-bold"><MessageCircle className="h-4 w-4" aria-hidden />{tx(M.commentsOf, { count: comments.length })}</h3>
                                {comments.length === 0
                                    ? <p className="mt-4 text-sm text-zinc-500">{tx(M.noComments)}</p>
                                    : (
                                        <ul className="mt-4 space-y-3" aria-label={tx(M.comments)}>
                                            {comments.map((item) => <CommentItem key={item.id} comment={item} busy={busy} onDelete={() => onDeleteComment(item)} />)}
                                        </ul>
                                    )}
                            </div>
                            <div className="border-t border-zinc-800 p-4">
                                {commentsFull ? (
                                    <p className="rounded-xl bg-zinc-950 p-3 text-xs text-zinc-400">{tx(M.commentLimitReached, { max: MEDIA_LIMITS.commentsPerPost })}</p>
                                ) : (
                                    <>
                                        <label htmlFor={commentId} className="sr-only">{tx(M.comments)}</label>
                                        <textarea id={commentId} value={comment} maxLength={MEDIA_LIMITS.comment} onChange={(event) => setComment(event.target.value)} placeholder={signedIn ? tx(M.commentPlaceholder) : tx(M.commentSignIn)} disabled={!signedIn} rows={3} aria-describedby={`${commentId}-rules`} className="w-full resize-none rounded-2xl bg-zinc-950 px-3 py-2 text-sm outline-none ring-blue-500 focus:ring-1 disabled:opacity-50" />
                                        <div id={`${commentId}-rules`} className="mt-1 flex items-start justify-between gap-3 text-[11px] leading-4 text-zinc-500">
                                            <span>{tx(M.commentRules)}</span>
                                            <span className="shrink-0 tabular-nums">{tx(M.commentCounter, { count: comment.length, max: MEDIA_LIMITS.comment })}</span>
                                        </div>
                                        <button type="button" disabled={comment.trim().length < 2 || busy || !signedIn} onClick={() => void onComment(comment).then((ok) => {
                                            if (ok) setComment("");
                                        })} className="mt-2 w-full rounded-xl bg-blue-600 py-2 text-sm font-bold disabled:opacity-40">{tx(M.commentSend)}</button>
                                    </>
                                )}
                            </div>
                        </>
                    )}
                </aside>
            </motion.div>
        </div>
    );
}
