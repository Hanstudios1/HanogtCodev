"use client";

import { motion } from "framer-motion";
import { ArrowDownToLine, BadgeCheck, FileCode2, Heart, MessageCircle, Trash2 } from "lucide-react";
import OptimizedImage from "@/components/OptimizedImage";
import { useI18n } from "@/lib/i18n";
import { languageDisplayName } from "@/lib/runtimes/languages";
import { M } from "./copy";
import { formatCount, formatDate } from "./helpers";
import type { Post } from "./types";

export const panel = "border border-zinc-200/80 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900";

export function Avatar({ post, size = "md" }: { post: Pick<Post, "author" | "authorAvatar">; size?: "sm" | "md" }) {
    const box = size === "sm" ? "h-6 w-6 text-[11px]" : "h-9 w-9 text-sm";
    return post.authorAvatar
        ? <OptimizedImage src={post.authorAvatar} alt="" className={`${box} rounded-full object-cover ring-2 ring-white dark:ring-zinc-800`} referrerPolicy="no-referrer" />
        : <span aria-hidden className={`flex ${box} shrink-0 items-center justify-center rounded-full bg-blue-600 font-bold text-white`}>{post.author.charAt(0).toUpperCase()}</span>;
}

/** A tag that filters the gallery when pressed. */
export function TagChip({ tag, active = false, onSelect, dark = false }: { tag: string; active?: boolean; onSelect: (tag: string) => void; dark?: boolean }) {
    const { tx } = useI18n();
    const tone = active
        ? "bg-blue-600 text-white"
        : dark ? "bg-zinc-800 text-zinc-300 hover:bg-zinc-700" : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700";
    return (
        <button type="button" onClick={() => onSelect(tag)} aria-pressed={active} title={tx(M.filterByTag, { tag })} className={`rounded-full px-2.5 py-1 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${tone}`}>
            <span dir="ltr">#{tag}</span>
        </button>
    );
}

export default function PostCard({ post, index, activeTag, onOpen, onLike, onDelete, onTag }: {
    post: Post;
    index: number;
    activeTag: string | null;
    onOpen: () => void;
    onLike: () => void;
    onDelete: () => void;
    onTag: (tag: string) => void;
}) {
    const { tx, locale } = useI18n();
    return (
        <motion.article initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(index * 0.03, 0.25) }} className={`${panel} group flex min-h-72 flex-col rounded-3xl p-5 transition hover:border-blue-300 dark:hover:border-blue-900`}>
            <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-3">
                    <Avatar post={post} />
                    <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">{post.author}</p>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400">{formatDate(post.createdAt, locale, tx({ TR: "Yeni", EN: "New" }))}</p>
                    </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                    {post.contributedToSecurity && (
                        <span title={tx({ TR: "Güvenlik katkı programına dahil", EN: "Part of the security contribution program" })} className="rounded-full bg-emerald-50 p-2 text-emerald-600 dark:bg-emerald-950/50">
                            <BadgeCheck className="h-4 w-4" aria-hidden />
                            <span className="sr-only">{tx({ TR: "Güvenlik katkı programına dahil", EN: "Part of the security contribution program" })}</span>
                        </span>
                    )}
                    {post.owned && (
                        <button type="button" onClick={onDelete} className="rounded-full p-2 text-zinc-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950" title={tx(M.deletePost)} aria-label={tx(M.deletePost)}>
                            <Trash2 className="h-4 w-4" aria-hidden />
                        </button>
                    )}
                </div>
            </div>
            <button type="button" onClick={onOpen} className="mt-5 flex-1 rounded-xl text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
                <span className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">
                    <FileCode2 className="h-4 w-4 shrink-0" aria-hidden />
                    <span className="truncate">{post.languages.map(languageDisplayName).join(" · ")} · {post.fileCount} {tx(M.files)}</span>
                </span>
                <h2 className="mt-3 break-words text-xl font-black tracking-tight transition group-hover:text-blue-600" dir="auto">{post.title}</h2>
                <p className="mt-2 line-clamp-3 break-words text-sm leading-6 text-zinc-500 dark:text-zinc-400" dir="auto">{post.description || tx(M.noDescription)}</p>
            </button>
            {post.tags.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-1.5">
                    {post.tags.map((tag) => <TagChip key={tag} tag={tag} active={tag === activeTag} onSelect={onTag} />)}
                </div>
            )}
            <div className="mt-5 flex items-center justify-between gap-2 border-t border-zinc-100 pt-4 dark:border-zinc-800">
                <div className="flex gap-1">
                    <button type="button" onClick={onLike} aria-pressed={post.liked} title={tx(post.liked ? M.unlike : M.like)} className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold transition ${post.liked ? "bg-rose-50 text-rose-600 dark:bg-rose-950/40" : "hover:bg-zinc-100 dark:hover:bg-zinc-800"}`}>
                        <Heart className={`h-4 w-4 ${post.liked ? "fill-current" : ""}`} aria-hidden />
                        <span className="sr-only">{tx(post.liked ? M.unlike : M.like)}</span>
                        {formatCount(post.likeCount, locale)}
                    </button>
                    <button type="button" onClick={onOpen} aria-label={tx(M.commentsOf, { count: post.commentCount })} className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800">
                        <MessageCircle className="h-4 w-4" aria-hidden />{formatCount(post.commentCount, locale)}
                    </button>
                </div>
                <div className="flex min-w-0 items-center gap-2">
                    <span className="truncate rounded-lg bg-zinc-100 px-2 py-1 text-[10px] font-bold text-zinc-500 dark:bg-zinc-800">{post.license === "all-rights-reserved" ? tx(M.noLicense) : post.license}</span>
                    <a href={`/api/media/${post.id}/download`} className="flex shrink-0 items-center gap-1 rounded-xl px-2.5 py-2 text-sm transition hover:bg-zinc-100 dark:hover:bg-zinc-800" title={tx(M.downloadProject)}>
                        <ArrowDownToLine className="h-4 w-4" aria-hidden />
                        <span aria-hidden>{formatCount(post.downloadCount, locale)}</span>
                        <span className="sr-only">{tx(M.downloadProject)} · {tx(M.downloads, { count: post.downloadCount })}</span>
                    </a>
                </div>
            </div>
        </motion.article>
    );
}
