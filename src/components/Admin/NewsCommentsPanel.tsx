"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ExternalLink, MessagesSquare, Trash2 } from "lucide-react";
import { useState } from "react";
import { useI18n } from "@/lib/i18n";
import { adminPost, type ApiFailure } from "./api";
import { COMMON } from "./copy";
import { useAdminResource } from "./hooks";
import type { AdminNewsComment, AdminNewsCommentsResponse } from "./types";
import { Avatar, Button, ConfirmDialog, EmptyState, ErrorNotice, IconButton, LoadingRows, RelativeTime, SearchInput, cx, useToast } from "./ui";

export default function NewsCommentsPanel() {
    const { tx, locale } = useI18n();
    const toast = useToast();
    const comments = useAdminResource<AdminNewsCommentsResponse>("/api/admin/news-comments");
    const [filter, setFilter] = useState("");
    const [target, setTarget] = useState<AdminNewsComment | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<ApiFailure | null>(null);

    const needle = filter.trim().toLocaleLowerCase(locale);
    const list = comments.data?.comments ?? [];
    const visible = needle
        ? list.filter((comment) => `${comment.text} ${comment.authorName} ${comment.authorEmail} ${comment.newsTitle}`.toLocaleLowerCase(locale).includes(needle))
        : list;

    const confirmDelete = async () => {
        if (!target) return;
        setBusy(true);
        setError(null);
        const result = await adminPost<{ id: string; deleted: boolean }>("/api/admin/news-comments", { action: "delete", id: target.id });
        setBusy(false);
        if (!result.ok && result.code !== "not_found") {
            setError(result);
            return;
        }
        const removedId = target.id;
        comments.mutate((current) => ({ comments: current.comments.filter((comment) => comment.id !== removedId) }));
        setTarget(null);
        toast(result.ok ? "success" : "info", result.ok
            ? tx({ TR: "Yorum silindi.", EN: "Comment deleted." })
            : tx({ TR: "Yorum zaten silinmişti.", EN: "The comment had already been deleted." }));
    };

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
                <SearchInput
                    value={filter}
                    onChange={setFilter}
                    className="min-w-0 flex-1"
                    label={tx({ TR: "Yorumlarda ara", EN: "Search comments" })}
                    placeholder={tx({ TR: "Metin, yazar veya haber başlığı…", EN: "Text, author or headline…" })}
                />
                <p className="text-[12px] text-zinc-500">{tx({ TR: "En yeni 100 yorum", EN: "The 100 newest comments" })}</p>
            </div>

            {comments.error ? <ErrorNotice error={comments.error} onRetry={comments.reload} /> : null}

            {!comments.data && comments.loading ? (
                <LoadingRows rows={4} />
            ) : visible.length === 0 ? (
                <EmptyState
                    icon={MessagesSquare}
                    title={needle ? tx(COMMON.noResults) : tx({ TR: "Henüz haber yorumu yok", EN: "No news comments yet" })}
                    action={needle ? <Button size="sm" onClick={() => setFilter("")}>{tx(COMMON.clearFilters)}</Button> : undefined}
                />
            ) : (
                <ul className={cx("space-y-2.5 transition-opacity", comments.loading && "opacity-60")}>
                    <AnimatePresence initial={false}>
                        {visible.map((comment) => (
                            <motion.li
                                key={comment.id}
                                layout
                                initial={{ opacity: 0, y: 8 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, x: -16 }}
                                className="flex gap-3 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-zinc-900/60"
                            >
                                <Avatar src={null} name={comment.authorName || comment.authorEmail} />
                                <div className="min-w-0 flex-1">
                                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px] text-zinc-500">
                                        <span className="font-bold text-zinc-900 dark:text-white">{comment.authorName || "—"}</span>
                                        <span className="truncate" dir="ltr">{comment.authorEmail}</span>
                                        <span aria-hidden="true">·</span>
                                        <RelativeTime iso={comment.createdAt} />
                                    </div>
                                    <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed text-zinc-800 dark:text-zinc-200" dir="auto">{comment.text}</p>
                                    {comment.newsTitle ? (
                                        comment.newsLink ? (
                                            <a href={comment.newsLink} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex max-w-full items-center gap-1.5 text-[12px] font-semibold text-indigo-600 hover:underline dark:text-indigo-300">
                                                <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                                                <span className="truncate" dir="auto">{comment.newsTitle}</span>
                                            </a>
                                        ) : (
                                            <p className="mt-2 truncate text-[12px] text-zinc-500" dir="auto">{comment.newsTitle}</p>
                                        )
                                    ) : null}
                                </div>
                                <IconButton label={tx({ TR: "Yorumu sil", EN: "Delete comment" })} icon={Trash2} tone="danger" onClick={() => { setTarget(comment); setError(null); }} />
                            </motion.li>
                        ))}
                    </AnimatePresence>
                </ul>
            )}

            <ConfirmDialog
                open={Boolean(target)}
                onClose={() => { if (!busy) setTarget(null); }}
                onConfirm={() => void confirmDelete()}
                busy={busy}
                error={error}
                icon={Trash2}
                title={tx({ TR: "Yorum silinsin mi?", EN: "Delete this comment?" })}
                description={tx({ TR: "Yorum kalıcı olarak silinir ve haberin yorum sayısı güncellenir.", EN: "The comment is deleted permanently and the story's comment count is updated." })}
                confirmLabel={tx(COMMON.delete)}
            >
                {target ? (
                    <blockquote className="rounded-xl border-s-4 border-zinc-300 bg-zinc-50 px-3 py-2 text-sm text-zinc-700 dark:border-white/20 dark:bg-white/[0.03] dark:text-zinc-300" dir="auto">
                        {target.text}
                    </blockquote>
                ) : null}
            </ConfirmDialog>
        </div>
    );
}
