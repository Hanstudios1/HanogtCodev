"use client";

import { AnimatePresence } from "framer-motion";
import { ArrowDownUp, Code2, Filter, LoaderCircle, Search, ShieldCheck, Sparkles, TrendingUp, Upload, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Header from "@/components/Header";
import { MediaApiError, mediaAction } from "@/components/Editor/media-api";
import { isMediaPostId, mediaPostPath } from "@/components/Editor/media-publish";
import { openFilesInEditor } from "@/lib/editor-bridge";
import { useI18n, type Copy } from "@/lib/i18n";
import { languageDisplayName } from "@/lib/runtimes/languages";
import { COMMON_LANGUAGES, EDITOR_ERRORS, M, SORT_LABELS } from "./copy";
import { errorMessage, fetchMedia, setPostParam } from "./helpers";
import PostCard, { panel } from "./PostCard";
import PostModal from "./PostModal";
import PublishProjectDialog from "./PublishProjectDialog";
import type { Banner, Detail, MediaFeedPage, MediaSortOption, Post, PostComment, PostFields } from "./types";

type FeedQuery = { sort: MediaSortOption; language: string; tag: string | null; q: string };
type Feed = { key: string; posts: Post[]; top: Post[]; nextCursor: string | null; error: unknown };

const SORTS: MediaSortOption[] = ["likes", "newest", "downloads"];

function feedUrl(query: FeedQuery, cursor: string | null) {
    const params = new URLSearchParams({ sort: query.sort });
    if (query.language !== "all") params.set("language", query.language);
    if (query.tag) params.set("tag", query.tag);
    if (query.q) params.set("q", query.q);
    if (cursor) params.set("cursor", cursor);
    return `/api/media?${params.toString()}`;
}

/** Posts of a new page that aren't on the list yet (a post can move between pages while someone reads). */
function appendPosts(current: Post[], next: Post[]) {
    const seen = new Set(current.map((post) => post.id));
    return [...current, ...next.filter((post) => !seen.has(post.id))];
}

export default function MediaGallery() {
    const { data: session } = useSession();
    const router = useRouter();
    const { tx, language: uiLanguage } = useI18n();
    const [sort, setSort] = useState<MediaSortOption>("likes");
    const [language, setLanguage] = useState("all");
    const [tag, setTag] = useState<string | null>(null);
    const [search, setSearch] = useState("");
    const [q, setQ] = useState("");
    const [refresh, setRefresh] = useState(0);
    const [feed, setFeed] = useState<Feed | null>(null);
    const [loadingMore, setLoadingMore] = useState(false);
    const [busy, setBusy] = useState(false);
    const [banner, setBanner] = useState<Banner | null>(null);
    const [showPublish, setShowPublish] = useState(false);
    const [selected, setSelected] = useState<Detail | null>(null);
    const [consent, setConsent] = useState(false);
    const signedIn = Boolean(session?.user);
    const fail = useCallback((failure: unknown, fallback: Copy) => setBanner({ tone: "error", text: errorMessage(failure, fallback, tx, uiLanguage) }), [tx, uiLanguage]);
    const notify = useCallback((text: string) => setBanner({ tone: "success", text }), []);

    // The search box waits for a pause in typing.
    useEffect(() => {
        const timer = window.setTimeout(() => setQ(search.trim()), 350);
        return () => window.clearTimeout(timer);
    }, [search]);

    const queryKey = JSON.stringify([sort, language, tag, q, refresh]);
    useEffect(() => {
        const controller = new AbortController();
        fetchMedia<MediaFeedPage>(feedUrl({ sort, language, tag, q }, null), controller.signal)
            .then((data) => {
                setFeed({ key: queryKey, posts: data.posts ?? [], top: data.top ?? [], nextCursor: data.nextCursor ?? null, error: null });
                setConsent(Boolean(data.viewer?.securityResearchConsent));
            })
            .catch((loadError: unknown) => {
                if (controller.signal.aborted) return;
                console.warn("Media could not be loaded:", loadError);
                setFeed({ key: queryKey, posts: [], top: [], nextCursor: null, error: loadError });
            });
        return () => controller.abort();
    }, [queryKey, sort, language, tag, q]);

    const loading = !feed || feed.key !== queryKey;
    const posts = useMemo(() => feed?.posts ?? [], [feed]);
    const top = feed && !loading ? feed.top : [];

    const loadMore = async () => {
        if (!feed || loading || !feed.nextCursor || loadingMore) return;
        const { key, nextCursor } = feed;
        setLoadingMore(true);
        try {
            const data = await fetchMedia<MediaFeedPage>(feedUrl({ sort, language, tag, q }, nextCursor));
            setFeed((current) => (current && current.key === key ? { ...current, posts: appendPosts(current.posts, data.posts ?? []), nextCursor: data.nextCursor ?? null } : current));
        } catch (moreError) {
            fail(moreError, M.loadMoreFailed);
        } finally {
            setLoadingMore(false);
        }
    };

    /** Changes a post wherever it is shown (the list, the most liked row). */
    const patchPost = useCallback((id: string, change: (post: Post) => Post | null) => {
        setFeed((current) => {
            if (!current) return current;
            const apply = (list: Post[]) => list.flatMap((post) => {
                if (post.id !== id) return [post];
                const next = change(post);
                return next ? [next] : [];
            });
            return { ...current, posts: apply(current.posts), top: apply(current.top) };
        });
    }, []);

    const openPost = useCallback(async (id: string) => {
        setBusy(true);
        try {
            const data = await fetchMedia<Detail>(`/api/media?id=${encodeURIComponent(id)}`);
            setSelected(data);
            setBanner(null);
            setPostParam(id);
        } catch (openError) {
            fail(openError, M.openFailed);
            setPostParam(null);
        } finally {
            setBusy(false);
        }
    }, [fail]);

    const openPostRef = useRef(openPost);
    useEffect(() => {
        openPostRef.current = openPost;
    }, [openPost]);

    useEffect(() => {
        // /media?post=<id> opens that post (links from the editor and shared links).
        const timer = window.setTimeout(() => {
            const linked = new URLSearchParams(window.location.search).get("post");
            if (isMediaPostId(linked)) void openPostRef.current(linked);
        }, 0);
        return () => window.clearTimeout(timer);
    }, []);

    const closePost = useCallback(() => {
        setSelected(null);
        setPostParam(null);
    }, []);

    const languages = useMemo(() => {
        const all = new Set([...COMMON_LANGUAGES, ...posts.flatMap((post) => post.languages)]);
        if (language !== "all") all.add(language);
        return [...all].filter((item) => item && item !== "text").sort((a, b) => languageDisplayName(a).localeCompare(languageDisplayName(b)));
    }, [posts, language]);

    const filtered = language !== "all" || Boolean(tag) || Boolean(q);
    const clearFilters = () => {
        setLanguage("all");
        setTag(null);
        setSearch("");
        setQ("");
    };

    const chooseTag = (next: string) => {
        setTag((current) => (current === next ? null : next));
        if (selected) closePost();
        window.scrollTo({ top: 0, behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    };

    const openPublish = () => {
        if (!signedIn) {
            setBanner({ tone: "error", text: tx(M.signInToPublish) });
            return;
        }
        setShowPublish(true);
    };

    const toggleLike = async (post: Post) => {
        if (!signedIn) {
            setBanner({ tone: "error", text: tx(M.signInToLike) });
            return;
        }
        const flip = (item: Post) => ({ ...item, liked: !post.liked, likeCount: Math.max(0, post.likeCount + (post.liked ? -1 : 1)) });
        patchPost(post.id, flip);
        try {
            await mediaAction({ action: "like", postId: post.id });
        } catch (likeError) {
            patchPost(post.id, (item) => ({ ...item, liked: post.liked, likeCount: post.likeCount }));
            fail(likeError, M.likeFailed);
        }
    };

    const toggleConsent = async () => {
        if (!signedIn) {
            setBanner({ tone: "error", text: tx(M.signInToConsent) });
            return;
        }
        setBusy(true);
        try {
            const next = !consent;
            await mediaAction({ action: "consent", enabled: next });
            setConsent(next);
        } catch (consentError) {
            fail(consentError, M.consentFailed);
        } finally {
            setBusy(false);
        }
    };

    const reloadPost = async (id: string) => {
        const data = await fetchMedia<Detail>(`/api/media?id=${encodeURIComponent(id)}`).catch(() => null);
        if (!data?.post) return;
        setSelected(data);
        patchPost(id, () => data.post);
    };

    const sendComment = async (text: string) => {
        if (!selected || !text.trim()) return false;
        const postId = selected.post.id;
        setBusy(true);
        try {
            const result = await mediaAction<{ comment?: PostComment }>({ action: "comment", postId, text });
            const added = result.comment;
            if (added) {
                setSelected((current) => (current && current.post.id === postId ? { ...current, comments: [...current.comments, added], post: { ...current.post, commentCount: current.post.commentCount + 1 } } : current));
                patchPost(postId, (post) => ({ ...post, commentCount: post.commentCount + 1 }));
            } else {
                await reloadPost(postId);
            }
            return true;
        } catch (commentError) {
            fail(commentError, M.commentFailed);
            return false;
        } finally {
            setBusy(false);
        }
    };

    const deleteComment = async (comment: PostComment) => {
        if (!selected) return false;
        const postId = selected.post.id;
        try {
            await mediaAction({ action: "deleteComment", postId, commentId: comment.id });
            setSelected((current) => (current && current.post.id === postId ? { ...current, comments: current.comments.filter((item) => item.id !== comment.id), post: { ...current.post, commentCount: Math.max(0, current.post.commentCount - 1) } } : current));
            patchPost(postId, (post) => ({ ...post, commentCount: Math.max(0, post.commentCount - 1) }));
            notify(tx(M.commentDeleted));
            return true;
        } catch (deleteError) {
            fail(deleteError, M.commentDeleteFailed);
            if (deleteError instanceof MediaApiError && deleteError.code === "comment_not_found") await reloadPost(postId);
            return false;
        }
    };

    const sendReport = async (category: string, reason: string) => {
        if (!selected || !reason.trim()) return false;
        setBusy(true);
        try {
            await mediaAction({ action: "report", postId: selected.post.id, category, reason });
            notify(tx(M.reportQueued));
            return true;
        } catch (reportError) {
            fail(reportError, M.reportFailed);
            return false;
        } finally {
            setBusy(false);
        }
    };

    const updatePost = async (fields: PostFields) => {
        if (!selected?.post.owned) return false;
        setBusy(true);
        try {
            await mediaAction({ action: "update", postId: selected.post.id, ...fields });
            await reloadPost(selected.post.id);
            notify(tx(M.updated));
            return true;
        } catch (updateError) {
            fail(updateError, M.updateFailed);
            return false;
        } finally {
            setBusy(false);
        }
    };

    const deletePost = async (post: Post) => {
        if (!post.owned || !window.confirm(tx(M.deleteConfirm, { title: post.title }))) return;
        setBusy(true);
        try {
            await mediaAction({ action: "delete", postId: post.id });
            if (selected?.post.id === post.id) closePost();
            patchPost(post.id, () => null);
        } catch (deleteError) {
            fail(deleteError, M.deleteFailed);
        } finally {
            setBusy(false);
        }
    };

    const openInEditor = () => {
        if (!selected) return;
        const { post, files } = selected;
        const result = openFilesInEditor({
            files: files.map((file) => ({ name: file.name, language: file.lang, code: file.code })),
            title: post.title,
            // The owner can keep editing the same post from the editor ("Update the post").
            mediaPostId: post.owned ? post.id : undefined,
        }, { navigate: (href) => router.push(href) });
        if (!result.ok) setBanner({ tone: "error", text: tx(EDITOR_ERRORS[result.error]) });
    };

    const copyLink = async () => {
        if (!selected) return;
        try {
            await navigator.clipboard.writeText(new URL(mediaPostPath(selected.post.id), window.location.origin).href);
            notify(tx(M.linkCopied));
        } catch {
            setBanner({ tone: "error", text: tx(M.copyFailed) });
        }
    };

    const loadError = feed && !loading && feed.error ? errorMessage(feed.error, M.loadFailed, tx, uiLanguage) : null;
    const pageBanner = !selected ? banner : null;

    return (
        <main className="min-h-screen overflow-x-hidden bg-zinc-50 text-zinc-950 dark:bg-zinc-950 dark:text-white">
            <Header />
            <section className="border-b border-zinc-200/70 pb-12 pt-28 sm:pb-16 sm:pt-32 dark:border-zinc-800">
                <div className="mx-auto max-w-7xl px-4 sm:px-6">
                    <div className="grid gap-8 lg:grid-cols-[1fr_380px] lg:items-end">
                        <div>
                            <span className="mb-5 inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700 dark:border-blue-900 dark:bg-blue-950/50 dark:text-blue-300"><Sparkles className="h-3.5 w-3.5" aria-hidden /> {tx({ TR: "Topluluk kod vitrini", EN: "Community code showcase" })}</span>
                            <h1 className="max-w-3xl text-4xl font-black tracking-tight sm:text-6xl">Hanogt <span className="text-blue-600 dark:text-blue-400">Media</span></h1>
                            <p className="mt-5 max-w-2xl text-lg leading-8 text-zinc-600 dark:text-zinc-400">{tx({ TR: "Projeleri keşfedin, kaynak dosyalarını inceleyin, indirin ve geliştiricilere geri bildirim verin. Yayınlar güvenlik kontrolünden geçirilir; sahip e-postaları herkese açılmaz.", EN: "Discover projects, read their source files, download them and give developers feedback. Posts go through a security check, and owners' e-mail addresses are never shown." })}</p>
                        </div>
                        <div className={`${panel} rounded-3xl p-5`}>
                            <div className="flex items-start gap-3">
                                <ShieldCheck className="mt-0.5 h-6 w-6 shrink-0 text-emerald-500" aria-hidden />
                                <div>
                                    <h2 className="font-bold">{tx({ TR: "Hanogt Security katkı programı", EN: "Hanogt Security contribution program" })}</h2>
                                    <p className="mt-1 text-sm leading-6 text-zinc-500">{tx({ TR: "Paylaştığınız kodların, insan denetimli güvenlik iyileştirmelerinde kullanılmasına izin vermek ister misiniz? Tercih varsayılan kapalıdır ve geri çekildiğinde bekleyen katkı kayıtları silinir.", EN: "Would you like the code you share to help human-reviewed security improvements? It's off by default, and pending contributions are deleted when you withdraw." })}</p>
                                </div>
                            </div>
                            <button type="button" disabled={busy} onClick={() => void toggleConsent()} aria-pressed={consent} className={`mt-4 w-full rounded-2xl px-4 py-3 text-sm font-bold transition ${consent ? "bg-emerald-600 text-white hover:bg-emerald-700" : "bg-zinc-900 text-white hover:bg-zinc-800 dark:bg-white dark:text-zinc-950"}`}>{consent ? tx({ TR: "Katkı izni açık · Kapat", EN: "Contribution on · Turn off" }) : tx({ TR: "İsteğe bağlı katkı iznini aç", EN: "Turn on optional contribution" })}</button>
                        </div>
                    </div>
                </div>
            </section>

            <section className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-10">
                <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-center">
                    <label className={`${panel} flex flex-1 items-center gap-3 rounded-2xl px-4 py-3 transition focus-within:ring-2 focus-within:ring-blue-500/40`}>
                        <Search className="h-5 w-5 shrink-0 text-zinc-400" aria-hidden />
                        <input type="search" value={search} maxLength={80} onChange={(event) => setSearch(event.target.value)} placeholder={tx(M.search)} aria-label={tx(M.search)} className="w-full min-w-0 bg-transparent outline-none placeholder:text-zinc-400" />
                    </label>
                    <div className="flex flex-wrap gap-2 sm:gap-3">
                        <label className={`${panel} flex min-w-0 flex-1 items-center gap-2 rounded-2xl px-3 transition focus-within:ring-2 focus-within:ring-blue-500/40 sm:flex-none`}>
                            <Filter className="h-4 w-4 shrink-0 text-zinc-400" aria-hidden />
                            <select value={language} onChange={(event) => setLanguage(event.target.value)} aria-label={tx(M.allLanguages)} className="h-12 min-w-0 flex-1 bg-transparent text-sm outline-none">
                                <option value="all">{tx(M.allLanguages)}</option>
                                {languages.map((item) => <option key={item} value={item}>{languageDisplayName(item)}</option>)}
                            </select>
                        </label>
                        <label className={`${panel} flex min-w-0 flex-1 items-center gap-2 rounded-2xl px-3 transition focus-within:ring-2 focus-within:ring-blue-500/40 sm:flex-none`}>
                            <ArrowDownUp className="h-4 w-4 shrink-0 text-zinc-400" aria-hidden />
                            <select value={sort} onChange={(event) => setSort(event.target.value as MediaSortOption)} aria-label={tx(M.sort)} className="h-12 min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none">
                                {SORTS.map((item) => <option key={item} value={item}>{tx(SORT_LABELS[item])}</option>)}
                            </select>
                        </label>
                        <button type="button" onClick={openPublish} className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-zinc-950 px-5 text-sm font-bold text-white transition hover:bg-zinc-800 sm:w-auto dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-200"><Upload className="h-4 w-4" aria-hidden />{tx(M.publish)}</button>
                    </div>
                </div>

                {(tag || filtered) && (
                    <div className="mb-6 flex flex-wrap items-center gap-2">
                        {tag && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-blue-600 py-1 ps-3 pe-1 text-sm font-semibold text-white">
                                <span dir="ltr">{tx(M.tagFilter, { tag: `#${tag}` })}</span>
                                <button type="button" onClick={() => setTag(null)} className="rounded-full p-1 hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white" aria-label={tx(M.clearTag)}><X className="h-3.5 w-3.5" aria-hidden /></button>
                            </span>
                        )}
                        <button type="button" onClick={clearFilters} className="rounded-full px-3 py-1 text-sm font-semibold text-zinc-600 hover:bg-zinc-200 dark:text-zinc-300 dark:hover:bg-zinc-800">{tx(M.clearFilters)}</button>
                    </div>
                )}

                {pageBanner && (
                    <div role={pageBanner.tone === "error" ? "alert" : "status"} className={`mb-6 flex w-full items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-sm ${pageBanner.tone === "error" ? "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200" : "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200"}`}>
                        <span>{pageBanner.text}</span>
                        <button type="button" onClick={() => setBanner(null)} className="shrink-0 rounded-lg p-1 hover:bg-black/5 dark:hover:bg-white/10" aria-label={tx(M.close)}>
                            <X className="h-4 w-4" aria-hidden />
                        </button>
                    </div>
                )}

                {top.length > 0 && (
                    <div className="mb-10">
                        <div className="mb-4 flex items-center gap-2"><TrendingUp className="h-5 w-5 text-blue-600 dark:text-blue-400" aria-hidden /><h2 className="text-xl font-black">{tx(M.mostLiked)}</h2></div>
                        <div className="grid gap-4 md:grid-cols-3">
                            {top.map((post, index) => (
                                <button key={post.id} type="button" onClick={() => void openPost(post.id)} className={`${panel} group rounded-3xl p-5 text-start transition hover:border-blue-300 dark:hover:border-blue-900`}>
                                    <span className="text-xs font-black text-blue-600 dark:text-blue-400">#{index + 1} · {post.likeCount} {tx(M.likes)}</span>
                                    <h3 className="mt-2 truncate text-lg font-bold" dir="auto">{post.title}</h3>
                                    <p className="mt-2 line-clamp-2 text-sm text-zinc-500" dir="auto">{post.description || tx({ TR: "Topluluğa açık kaynak proje", EN: "An open-source community project" })}</p>
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {loadError ? (
                    <div role="alert" className={`${panel} rounded-3xl py-16 text-center`}>
                        <Code2 className="mx-auto h-10 w-10 text-zinc-400" aria-hidden />
                        <p className="mt-4 font-semibold">{loadError}</p>
                        <button type="button" onClick={() => setRefresh((value) => value + 1)} className="mt-4 rounded-xl bg-zinc-900 px-4 py-2 text-sm font-semibold text-white dark:bg-white dark:text-zinc-900">{tx({ TR: "Tekrar dene", EN: "Try again" })}</button>
                    </div>
                ) : loading && posts.length === 0 ? (
                    <div className="flex min-h-72 items-center justify-center" role="status"><LoaderCircle className="h-7 w-7 animate-spin text-blue-500" aria-hidden /><span className="sr-only">{tx(M.loading)}</span></div>
                ) : posts.length === 0 ? (
                    <div className={`${panel} rounded-3xl px-6 py-20 text-center`}>
                        <Code2 className="mx-auto h-10 w-10 text-zinc-400" aria-hidden />
                        <h2 className="mt-4 text-xl font-bold">{tx(M.noMatches)}</h2>
                        <p className="mt-2 text-zinc-500">{tx(M.noMatchesHint)}</p>
                        {filtered && <button type="button" onClick={clearFilters} className="mt-5 rounded-xl border border-zinc-200 px-4 py-2 text-sm font-semibold hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800">{tx(M.clearFilters)}</button>}
                    </div>
                ) : (
                    <>
                        <div className={`grid gap-5 transition-opacity md:grid-cols-2 xl:grid-cols-3 ${loading ? "opacity-50" : ""}`} aria-busy={loading}>
                            {posts.map((post, index) => (
                                <PostCard key={post.id} post={post} index={index % 24} activeTag={tag} onOpen={() => void openPost(post.id)} onLike={() => void toggleLike(post)} onDelete={() => void deletePost(post)} onTag={chooseTag} />
                            ))}
                        </div>
                        <div className="mt-8 flex flex-col items-center gap-2">
                            <p className="text-xs text-zinc-500" aria-live="polite">{tx(M.shown, { count: posts.length })}</p>
                            {feed?.nextCursor && !loading && (
                                <button type="button" onClick={() => void loadMore()} disabled={loadingMore} className="inline-flex h-11 items-center gap-2 rounded-2xl border border-zinc-200 bg-white px-6 text-sm font-bold transition hover:bg-zinc-100 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800">
                                    {loadingMore && <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden />}
                                    {tx(M.loadMore)}
                                </button>
                            )}
                        </div>
                    </>
                )}
            </section>

            <AnimatePresence>
                {showPublish && (
                    <PublishProjectDialog
                        consent={consent}
                        mutate={(body) => mediaAction(body)}
                        onClose={() => setShowPublish(false)}
                        onPublished={() => {
                            setShowPublish(false);
                            setRefresh((value) => value + 1);
                        }}
                    />
                )}
            </AnimatePresence>

            <AnimatePresence>
                {selected && (
                    <PostModal
                        key={selected.post.id}
                        detail={selected}
                        signedIn={signedIn}
                        busy={busy}
                        banner={banner}
                        activeTag={tag}
                        onDismissBanner={() => setBanner(null)}
                        onClose={closePost}
                        onDelete={() => void deletePost(selected.post)}
                        onComment={sendComment}
                        onDeleteComment={deleteComment}
                        onReport={sendReport}
                        onUpdate={updatePost}
                        onOpenInEditor={openInEditor}
                        onCopyLink={() => void copyLink()}
                        onTag={chooseTag}
                    />
                )}
            </AnimatePresence>

            {busy && !selected && <div role="status" className="pointer-events-none fixed bottom-6 left-1/2 z-[80] -translate-x-1/2 rounded-full bg-zinc-950 px-4 py-2 text-sm text-white shadow-xl"><LoaderCircle className="me-2 inline h-4 w-4 animate-spin" aria-hidden />{tx(M.working)}</div>}
        </main>
    );
}
