"use client";

import OptimizedImage from "@/components/OptimizedImage";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { AnimatePresence, motion } from "framer-motion";
import {
    ArrowDownToLine, BadgeCheck, Clock3, Code2, Eye, FileCode2, Filter, Flag,
    Heart, LoaderCircle, MessageCircle, Search, ShieldCheck, Sparkles, TrendingUp,
    Trash2, Upload, UserRound, X,
} from "lucide-react";
import Header from "@/components/Header";
import { useI18n, type Copy } from "@/lib/i18n";

type Post = {
    id: string;
    title: string;
    description: string;
    language: string;
    languages: string[];
    tags: string[];
    author: string;
    authorAvatar: string | null;
    fileCount: number;
    createdAt?: string;
    likeCount: number;
    commentCount: number;
    liked: boolean;
    owned: boolean;
    contributedToSecurity: boolean;
    license: string;
};

type PostFile = { name: string; lang: string; code: string; order: number };
type PublishableProject = { id: string; name: string; lang: string; fileCount: number; updatedAt: string };

class MediaRequestError extends Error {
    constructor(message: string, readonly findings: string[] = []) {
        super(message);
    }
}
type PostComment = { id: string; author: string; authorAvatar: string | null; text: string; createdAt?: string };
type Detail = { post: Post; files: PostFile[]; comments: PostComment[] };

const panel = "border border-zinc-200/80 bg-white/90 shadow-sm backdrop-blur-xl dark:border-zinc-800 dark:bg-zinc-900/85";

const M = {
    loadFailed: { TR: "Media yüklenemedi.", EN: "Media couldn't be loaded." },
    projectsFailed: { TR: "Projeleriniz yüklenemedi.", EN: "Your projects couldn't be loaded." },
    signInToPublish: { TR: "Proje yayımlamak için giriş yapın.", EN: "Sign in to publish a project." },
    actionFailed: { TR: "İşlem tamamlanamadı.", EN: "The action couldn't be completed." },
    openFailed: { TR: "Proje açılamadı.", EN: "The project couldn't be opened." },
    signInToLike: { TR: "Beğenmek için giriş yapın.", EN: "Sign in to like projects." },
    likeFailed: { TR: "Beğeni kaydedilemedi.", EN: "Your like couldn't be saved." },
    publishFailed: { TR: "Proje yayımlanamadı.", EN: "The project couldn't be published." },
    signInToConsent: { TR: "Katkı tercihini değiştirmek için giriş yapın.", EN: "Sign in to change your contribution preference." },
    consentFailed: { TR: "Tercih kaydedilemedi.", EN: "Your preference couldn't be saved." },
    commentFailed: { TR: "Yorum gönderilemedi.", EN: "The comment couldn't be sent." },
    reportQueued: { TR: "Bildiriminiz güvenlik ve moderasyon kuyruğuna alındı.", EN: "Your report was added to the security and moderation queue." },
    reportFailed: { TR: "Bildirim gönderilemedi.", EN: "The report couldn't be sent." },
    deleteFailed: { TR: "Yayın silinemedi.", EN: "The post couldn't be deleted." },
    noDescription: { TR: "Açıklama eklenmemiş.", EN: "No description yet." },
    files: { TR: "dosya", EN: "files" },
    deletePost: { TR: "Yayını sil", EN: "Delete post" },
    download: { TR: "İndir", EN: "Download" },
} satisfies Record<string, Copy>;

/** Error codes set by memoized loaders; they are translated while rendering. */
const ERROR_CODES: Record<string, Copy> = { "media:load": M.loadFailed, "media:projects": M.projectsFailed };

function formatDate(value: string | undefined, locale: string, fallback: string) {
    if (!value) return fallback;
    try {
        return new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(value));
    } catch {
        return fallback;
    }
}

function avatar(post: Pick<Post, "author" | "authorAvatar">) {
    return post.authorAvatar
        ? <OptimizedImage src={post.authorAvatar} alt="" className="h-9 w-9 rounded-full object-cover ring-2 ring-white dark:ring-zinc-800" referrerPolicy="no-referrer" />
        : <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-violet-600 text-sm font-bold text-white">{post.author.charAt(0).toUpperCase()}</span>;
}

export default function MediaPage() {
    const { data: session } = useSession();
    const { tx, locale, language: uiLanguage } = useI18n();
    // Server messages are written in Turkish; other languages get the localized fallback.
    const serverText = (message: string | undefined, fallback: Copy) => (uiLanguage === "TR" && message ? message : tx(fallback));
    const [posts, setPosts] = useState<Post[]>([]);
    const [projects, setProjects] = useState<PublishableProject[]>([]);
    const [projectsLoading, setProjectsLoading] = useState(false);
    const [findings, setFindings] = useState<string[]>([]);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [search, setSearch] = useState("");
    const [language, setLanguage] = useState("all");
    const [sort, setSort] = useState<"popular" | "newest">("popular");
    const [showPublish, setShowPublish] = useState(false);
    const [selected, setSelected] = useState<Detail | null>(null);
    const [selectedFile, setSelectedFile] = useState(0);
    const [comment, setComment] = useState("");
    const [reportOpen, setReportOpen] = useState(false);
    const [reportReason, setReportReason] = useState("");
    const [reportCategory, setReportCategory] = useState("other");
    const [consent, setConsent] = useState(false);
    const [form, setForm] = useState({ projectId: "", title: "", description: "", tags: "", license: "all-rights-reserved", showAuthor: true, contribute: false });

    const load = useCallback(async () => {
        setLoading(true);
        setError("");
        try {
            const response = await fetch("/api/media", { cache: "no-store" });
            const data = await response.json() as { posts?: Post[]; viewer?: { securityResearchConsent?: boolean }; error?: string };
            if (!response.ok) throw new Error(data.error || "");
            setPosts(data.posts || []);
            setConsent(Boolean(data.viewer?.securityResearchConsent));
        } catch (loadError) {
            console.warn("Media could not be loaded:", loadError);
            setError("media:load");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        // Deferred to a task so the first render isn't followed by a synchronous state cascade.
        const timer = window.setTimeout(() => { void load(); }, 0);
        return () => window.clearTimeout(timer);
    }, [load]);

    // The publish dialog used to read projects with a client Firestore query
    // that needs a composite index and a live Firebase session; when either
    // was missing the list was silently empty and nothing could be published.
    const loadPublishableProjects = useCallback(async () => {
        setProjectsLoading(true);
        try {
            const response = await fetch("/api/media?scope=my-projects", { cache: "no-store" });
            const data = await response.json().catch(() => ({})) as { projects?: PublishableProject[]; error?: string };
            if (!response.ok) throw new Error(data.error || "");
            setProjects(data.projects || []);
        } catch (projectError) {
            console.warn("Publishable projects could not be loaded:", projectError);
            setError("media:projects");
        } finally {
            setProjectsLoading(false);
        }
    }, []);

    const openPublish = () => {
        if (!session?.user) { setError(tx(M.signInToPublish)); return; }
        setFindings([]);
        setShowPublish(true);
        void loadPublishableProjects();
    };

    const languages = useMemo(() => [...new Set(posts.flatMap((post) => post.languages))].sort(), [posts]);
    const filtered = useMemo(() => {
        const needle = search.trim().toLocaleLowerCase("tr-TR");
        return posts
            .filter((post) => language === "all" || post.languages.includes(language))
            .filter((post) => !needle || `${post.title} ${post.description} ${post.author} ${post.tags.join(" ")}`.toLocaleLowerCase("tr-TR").includes(needle))
            .sort((a, b) => sort === "popular"
                ? (b.likeCount - a.likeCount) || (b.commentCount - a.commentCount)
                : String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
    }, [language, posts, search, sort]);
    const featured = useMemo(() => [...posts].sort((a, b) => b.likeCount - a.likeCount).slice(0, 3), [posts]);

    const mutate = async (body: Record<string, unknown>) => {
        const response = await fetch("/api/media", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
        const data = await response.json().catch(() => ({})) as { error?: string; id?: string; liked?: boolean; findings?: string[] };
        if (!response.ok) throw new MediaRequestError(serverText(data.error, M.actionFailed), Array.isArray(data.findings) ? data.findings : []);
        return data;
    };

    const openPost = async (id: string) => {
        setBusy(true);
        try {
            const response = await fetch(`/api/media?id=${encodeURIComponent(id)}`, { cache: "no-store" });
            const data = await response.json() as Detail & { error?: string };
            if (!response.ok) throw new Error(serverText(data.error, M.openFailed));
            setSelected(data);
            setSelectedFile(0);
        } catch (openError) {
            setError(openError instanceof Error && openError.message ? openError.message : tx(M.openFailed));
        } finally {
            setBusy(false);
        }
    };

    const toggleLike = async (post: Post) => {
        if (!session?.user) { setError(tx(M.signInToLike)); return; }
        setPosts((current) => current.map((item) => item.id === post.id ? { ...item, liked: !item.liked, likeCount: item.likeCount + (item.liked ? -1 : 1) } : item));
        try {
            await mutate({ action: "like", postId: post.id });
        } catch (likeError) {
            setPosts((current) => current.map((item) => item.id === post.id ? post : item));
            setError(likeError instanceof Error && likeError.message ? likeError.message : tx(M.likeFailed));
        }
    };

    const publish = async () => {
        if (!form.projectId || !form.title.trim()) return;
        setBusy(true);
        setFindings([]);
        try {
            await mutate({
                action: "publish",
                ...form,
                tags: form.tags.split(",").map((tag) => tag.trim()).filter(Boolean),
                contribute: consent && form.contribute,
            });
            setShowPublish(false);
            setForm({ projectId: "", title: "", description: "", tags: "", license: "all-rights-reserved", showAuthor: true, contribute: false });
            await load();
        } catch (publishError) {
            if (publishError instanceof MediaRequestError && publishError.findings.length) {
                setFindings([publishError.message, ...publishError.findings]);
            } else {
                setError(publishError instanceof Error && publishError.message ? publishError.message : tx(M.publishFailed));
            }
        } finally {
            setBusy(false);
        }
    };

    const toggleConsent = async () => {
        if (!session?.user) { setError(tx(M.signInToConsent)); return; }
        setBusy(true);
        try {
            const next = !consent;
            await mutate({ action: "consent", enabled: next });
            setConsent(next);
            if (!next) setForm((current) => ({ ...current, contribute: false }));
        } catch (consentError) {
            setError(consentError instanceof Error && consentError.message ? consentError.message : tx(M.consentFailed));
        } finally {
            setBusy(false);
        }
    };

    const sendComment = async () => {
        if (!selected || !comment.trim()) return;
        setBusy(true);
        try {
            await mutate({ action: "comment", postId: selected.post.id, text: comment });
            setComment("");
            await openPost(selected.post.id);
            await load();
        } catch (commentError) {
            setError(commentError instanceof Error && commentError.message ? commentError.message : tx(M.commentFailed));
        } finally {
            setBusy(false);
        }
    };

    const sendReport = async () => {
        if (!selected || !reportReason.trim()) return;
        setBusy(true);
        try {
            await mutate({ action: "report", postId: selected.post.id, category: reportCategory, reason: reportReason });
            setReportOpen(false);
            setReportReason("");
            setError(tx(M.reportQueued));
        } catch (reportError) {
            setError(reportError instanceof Error && reportError.message ? reportError.message : tx(M.reportFailed));
        } finally {
            setBusy(false);
        }
    };

    const deletePost = async (post: Post) => {
        if (!post.owned || !confirm(tx({ TR: "“{title}” yayını ve ilişkili yorum/beğeniler silinsin mi?", EN: "Delete “{title}” and its comments and likes?" }, { title: post.title }))) return;
        setBusy(true);
        try {
            await mutate({ action: "delete", postId: post.id });
            setSelected(null);
            await load();
        } catch (deleteError) {
            setError(deleteError instanceof Error && deleteError.message ? deleteError.message : tx(M.deleteFailed));
        } finally {
            setBusy(false);
        }
    };

    return (
        <main className="min-h-screen overflow-hidden bg-zinc-50 text-zinc-950 dark:bg-zinc-950 dark:text-white">
            <Header />
            <section className="relative border-b border-zinc-200/70 pb-16 pt-32 dark:border-zinc-800">
                <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(59,130,246,.14),transparent_34%),radial-gradient(circle_at_80%_25%,rgba(139,92,246,.12),transparent_32%)]" />
                <div className="relative mx-auto max-w-7xl px-6">
                    <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} className="grid gap-8 lg:grid-cols-[1fr_380px] lg:items-end">
                        <div>
                            <span className="mb-5 inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700 dark:border-blue-900 dark:bg-blue-950/50 dark:text-blue-300"><Sparkles className="h-3.5 w-3.5" /> {tx({ TR: "Topluluk kod vitrini", EN: "Community code showcase" })}</span>
                            <h1 className="max-w-3xl text-4xl font-black tracking-tight sm:text-6xl">Hanogt <span className="bg-gradient-to-r from-blue-500 to-violet-500 bg-clip-text text-transparent">Media</span></h1>
                            <p className="mt-5 max-w-2xl text-lg leading-8 text-zinc-600 dark:text-zinc-400">{tx({ TR: "Projeleri keşfedin, kaynak dosyalarını inceleyin, indirin ve geliştiricilere geri bildirim verin. Yayınlar güvenlik kontrolünden geçirilir; sahip e-postaları herkese açılmaz.", EN: "Discover projects, read their source files, download them and give developers feedback. Posts go through a security check, and owners' e-mail addresses are never shown." })}</p>
                        </div>
                        <div className={`${panel} rounded-3xl p-5`}>
                            <div className="flex items-start gap-3"><ShieldCheck className="mt-0.5 h-6 w-6 text-emerald-500" /><div><h2 className="font-bold">{tx({ TR: "Hanogt Security katkı programı", EN: "Hanogt Security contribution program" })}</h2><p className="mt-1 text-sm leading-6 text-zinc-500">{tx({ TR: "Paylaştığınız kodların, insan denetimli güvenlik iyileştirmelerinde kullanılmasına izin vermek ister misiniz? Tercih varsayılan kapalıdır ve geri çekildiğinde bekleyen katkı kayıtları silinir.", EN: "Would you like the code you share to help human-reviewed security improvements? It's off by default, and pending contributions are deleted when you withdraw." })}</p></div></div>
                            <button disabled={busy} onClick={toggleConsent} className={`mt-4 w-full rounded-2xl px-4 py-3 text-sm font-bold transition ${consent ? "bg-emerald-500 text-white hover:bg-emerald-600" : "bg-zinc-900 text-white hover:bg-zinc-800 dark:bg-white dark:text-zinc-950"}`}>{consent ? tx({ TR: "Katkı izni açık · Kapat", EN: "Contribution on · Turn off" }) : tx({ TR: "İsteğe bağlı katkı iznini aç", EN: "Turn on optional contribution" })}</button>
                        </div>
                    </motion.div>
                </div>
            </section>

            <section className="mx-auto max-w-7xl px-6 py-10">
                <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-center">
                    <label className={`${panel} flex flex-1 items-center gap-3 rounded-2xl px-4 py-3`}><Search className="h-5 w-5 text-zinc-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={tx({ TR: "Proje, geliştirici veya etiket ara", EN: "Search projects, developers or tags" })} className="w-full bg-transparent outline-none placeholder:text-zinc-400" /></label>
                    <div className="flex gap-3">
                        <label className={`${panel} flex items-center gap-2 rounded-2xl px-3`}><Filter className="h-4 w-4 text-zinc-400" /><select value={language} onChange={(event) => setLanguage(event.target.value)} className="h-12 bg-transparent text-sm outline-none"><option value="all">{tx({ TR: "Tüm diller", EN: "All languages" })}</option>{languages.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
                        <button onClick={() => setSort((value) => value === "popular" ? "newest" : "popular")} className={`${panel} flex h-12 items-center gap-2 rounded-2xl px-4 text-sm font-semibold`} title={tx({ TR: "Sıralamayı değiştir", EN: "Change sorting" })}>{sort === "popular" ? <TrendingUp className="h-4 w-4" /> : <Clock3 className="h-4 w-4" />}{sort === "popular" ? tx({ TR: "Popüler", EN: "Popular" }) : tx({ TR: "En yeni", EN: "Newest" })}</button>
                        <button onClick={openPublish} className="flex h-12 items-center gap-2 rounded-2xl bg-zinc-950 px-5 text-sm font-bold text-white shadow-lg transition hover:-translate-y-0.5 dark:bg-white dark:text-zinc-950"><Upload className="h-4 w-4" />{tx({ TR: "Yayımla", EN: "Publish" })}</button>
                    </div>
                </div>

                {error && <button onClick={() => setError("")} className="mb-6 flex w-full items-center justify-between rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-start text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200"><span>{ERROR_CODES[error] ? tx(ERROR_CODES[error]) : error}</span><X className="h-4 w-4" /></button>}

                {featured.length > 0 && !search && language === "all" && (
                    <div className="mb-12">
                        <div className="mb-4 flex items-center gap-2"><TrendingUp className="h-5 w-5 text-violet-500" /><h2 className="text-xl font-black">{tx({ TR: "En çok beğenilen projeler", EN: "Most liked projects" })}</h2></div>
                        <div className="grid gap-4 md:grid-cols-3">{featured.map((post, index) => <button key={post.id} onClick={() => openPost(post.id)} className={`${panel} group rounded-3xl p-5 text-start transition hover:-translate-y-1 hover:shadow-xl`}><span className="text-xs font-black text-violet-500">#{index + 1} · {post.likeCount} {tx({ TR: "beğeni", EN: "likes" })}</span><h3 className="mt-2 truncate text-lg font-bold">{post.title}</h3><p className="mt-2 line-clamp-2 text-sm text-zinc-500">{post.description || tx({ TR: "Topluluğa açık kaynak proje", EN: "An open-source community project" })}</p></button>)}</div>
                    </div>
                )}

                {loading ? <div className="flex min-h-72 items-center justify-center"><LoaderCircle className="h-7 w-7 animate-spin text-blue-500" /></div> : filtered.length === 0 ? <div className={`${panel} rounded-3xl py-20 text-center`}><Code2 className="mx-auto h-10 w-10 text-zinc-400" /><h2 className="mt-4 text-xl font-bold">{tx({ TR: "Henüz eşleşen proje yok", EN: "No matching projects yet" })}</h2><p className="mt-2 text-zinc-500">{tx({ TR: "İlk kaliteli projeyi siz paylaşabilirsiniz.", EN: "Be the first to share a great project." })}</p></div> : (
                    <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
                        {filtered.map((post, index) => (
                            <motion.article key={post.id} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(index * 0.035, 0.3) }} className={`${panel} group flex min-h-72 flex-col rounded-3xl p-5 transition hover:-translate-y-1 hover:border-blue-300 hover:shadow-xl dark:hover:border-blue-900`}>
                                <div className="flex items-center justify-between"><div className="flex items-center gap-3">{avatar(post)}<div><p className="text-sm font-semibold">{post.author}</p><p className="text-xs text-zinc-400">{formatDate(post.createdAt, locale, tx({ TR: "Yeni", EN: "New" }))}</p></div></div><div className="flex items-center gap-1">{post.contributedToSecurity && <span title={tx({ TR: "Güvenlik katkı programına dahil", EN: "Part of the security contribution program" })} className="rounded-full bg-emerald-50 p-2 text-emerald-600 dark:bg-emerald-950/50"><BadgeCheck className="h-4 w-4" /></span>}{post.owned && <button onClick={() => deletePost(post)} className="rounded-full p-2 text-zinc-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950" title={tx(M.deletePost)}><Trash2 className="h-4 w-4" /></button>}</div></div>
                                <button onClick={() => openPost(post.id)} className="mt-5 flex-1 text-start"><div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-blue-500"><FileCode2 className="h-4 w-4" />{post.languages.join(" · ")} · {post.fileCount} {tx(M.files)}</div><h2 className="mt-3 text-xl font-black tracking-tight transition group-hover:text-blue-600">{post.title}</h2><p className="mt-2 line-clamp-3 text-sm leading-6 text-zinc-500 dark:text-zinc-400">{post.description || tx(M.noDescription)}</p><div className="mt-4 flex flex-wrap gap-2">{post.tags.map((tag) => <span key={tag} className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">#{tag}</span>)}</div></button>
                                <div className="mt-5 flex items-center justify-between border-t border-zinc-100 pt-4 dark:border-zinc-800"><div className="flex gap-2"><button onClick={() => toggleLike(post)} className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold transition ${post.liked ? "bg-rose-50 text-rose-600 dark:bg-rose-950/40" : "hover:bg-zinc-100 dark:hover:bg-zinc-800"}`}><Heart className={`h-4 w-4 ${post.liked ? "fill-current" : ""}`} />{post.likeCount}</button><button onClick={() => openPost(post.id)} className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800"><MessageCircle className="h-4 w-4" />{post.commentCount}</button></div><div className="flex items-center gap-2"><span className="rounded-lg bg-zinc-100 px-2 py-1 text-[10px] font-bold text-zinc-500 dark:bg-zinc-800">{post.license === "all-rights-reserved" ? tx({ TR: "Lisans belirtilmedi", EN: "No license" }) : post.license}</span><a href={`/api/media/${post.id}/download`} className="rounded-xl p-2.5 transition hover:bg-zinc-100 dark:hover:bg-zinc-800" title={tx({ TR: "Projeyi indir", EN: "Download project" })}><ArrowDownToLine className="h-4 w-4" /></a></div></div>
                            </motion.article>
                        ))}
                    </div>
                )}
            </section>

            <AnimatePresence>
                {showPublish && <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onMouseDown={() => setShowPublish(false)}><motion.div initial={{ opacity: 0, scale: .96, y: 12 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: .96 }} onMouseDown={(event) => event.stopPropagation()} className={`${panel} max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-3xl p-6`}><div className="flex items-center justify-between"><div><h2 className="text-2xl font-black">{tx({ TR: "Projeyi Media’da yayımla", EN: "Publish a project on Media" })}</h2><p className="mt-1 text-sm text-zinc-500">{tx({ TR: "Kaynak dosyalarının anlık bir kopyası paylaşılır.", EN: "A snapshot of the source files is shared." })}</p></div><button onClick={() => setShowPublish(false)} className="rounded-xl p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800"><X className="h-5 w-5" /></button></div><div className="mt-6 space-y-4"><label className="block text-sm font-semibold">{tx({ TR: "Proje", EN: "Project" })}<select value={form.projectId} disabled={projectsLoading} onChange={(event) => { const project = projects.find((item) => item.id === event.target.value); setForm((current) => ({ ...current, projectId: event.target.value, title: current.title || project?.name || "" })); }} className="mt-2 w-full rounded-2xl border border-zinc-200 bg-transparent px-4 py-3 outline-none focus:border-blue-500 disabled:opacity-60 dark:border-zinc-700"><option value="">{projectsLoading ? tx({ TR: "Projeler yükleniyor…", EN: "Loading projects…" }) : projects.length ? tx({ TR: "Proje seçin", EN: "Choose a project" }) : tx({ TR: "Kayıtlı kod projeniz yok", EN: "You have no saved code projects" })}</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name} · {project.lang}{project.fileCount > 1 ? ` · ${project.fileCount} ${tx(M.files)}` : ""}</option>)}</select>{!projectsLoading && projects.length === 0 && <span className="mt-2 block text-xs font-normal leading-5 text-zinc-500">{tx({ TR: "Önce kod editöründe bir projeyi kaydedin; kaydedilen projeler burada listelenir.", EN: "Save a project in the code editor first; saved projects are listed here." })}</span>}</label><label className="block text-sm font-semibold">{tx({ TR: "Başlık", EN: "Title" })}<input value={form.title} maxLength={100} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} className="mt-2 w-full rounded-2xl border border-zinc-200 bg-transparent px-4 py-3 outline-none focus:border-blue-500 dark:border-zinc-700" /></label><label className="block text-sm font-semibold">{tx({ TR: "Açıklama", EN: "Description" })}<textarea value={form.description} maxLength={1200} rows={4} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} className="mt-2 w-full resize-none rounded-2xl border border-zinc-200 bg-transparent px-4 py-3 outline-none focus:border-blue-500 dark:border-zinc-700" /></label><label className="block text-sm font-semibold">{tx({ TR: "Etiketler", EN: "Tags" })} <span className="font-normal text-zinc-400">{tx({ TR: "(virgülle, en fazla 6)", EN: "(comma separated, up to 6)" })}</span><input value={form.tags} onChange={(event) => setForm((current) => ({ ...current, tags: event.target.value }))} placeholder={tx({ TR: "web, araç, eğitim", EN: "web, tool, education" })} className="mt-2 w-full rounded-2xl border border-zinc-200 bg-transparent px-4 py-3 outline-none focus:border-blue-500 dark:border-zinc-700" /></label><label className="block text-sm font-semibold">{tx({ TR: "Paylaşım lisansı", EN: "Sharing license" })}<select value={form.license} onChange={(event) => setForm((current) => ({ ...current, license: event.target.value }))} className="mt-2 w-full rounded-2xl border border-zinc-200 bg-transparent px-4 py-3 outline-none dark:border-zinc-700"><option value="all-rights-reserved">{tx({ TR: "Lisans belirtilmedi · tüm haklar saklı", EN: "No license · all rights reserved" })}</option><option value="MIT">MIT</option><option value="Apache-2.0">Apache 2.0</option><option value="GPL-3.0">GPL 3.0</option></select><span className="mt-1 block text-xs font-normal leading-5 text-zinc-500">{tx({ TR: "Bir açık kaynak lisansı seçmek, alıcılara o lisansın koşullarıyla yeniden kullanım hakkı verir.", EN: "Choosing an open-source license lets others reuse the code under that license's terms." })}</span></label><label className="flex items-start gap-3 rounded-2xl bg-zinc-100 p-4 dark:bg-zinc-800"><input type="checkbox" checked={form.showAuthor} onChange={(event) => setForm((current) => ({ ...current, showAuthor: event.target.checked }))} className="mt-1 h-4 w-4" /><span><strong className="block text-sm">{tx({ TR: "Profil adımı göster", EN: "Show my profile name" })}</strong><span className="text-xs leading-5 text-zinc-500">{tx({ TR: "Kapalıysa yayın “Anonim geliştirici” adıyla görünür. E-posta hiçbir durumda yayınlanmaz.", EN: "When off, the post appears as “Anonymous developer”. Your e-mail is never published." })}</span></span></label>{consent && <label className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-900 dark:bg-emerald-950/30"><input type="checkbox" checked={form.contribute} onChange={(event) => setForm((current) => ({ ...current, contribute: event.target.checked }))} className="mt-1 h-4 w-4" /><span><strong className="block text-sm text-emerald-800 dark:text-emerald-200">{tx({ TR: "Bu projeyi güvenlik katkısına dahil et", EN: "Include this project in the security contribution" })}</strong><span className="text-xs leading-5 text-emerald-700 dark:text-emerald-300">{tx({ TR: "Otomatik eğitim yapılmaz; uygunluk ve amaç sınırı insan denetimiyle değerlendirilir.", EN: "There is no automatic training; eligibility and purpose limits are reviewed by people." })}</span></span></label>}{findings.length > 0 && <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200"><strong className="block">{findings[0]}</strong><ul className="mt-2 list-disc space-y-1 ps-5 text-xs leading-5">{findings.slice(1).map((finding) => <li key={finding}>{finding}</li>)}</ul><p className="mt-2 text-xs opacity-80">{tx({ TR: "Yanlış bir eşleşme olduğunu düşünüyorsanız Geri Bildirim sayfasından inceleme isteyebilirsiniz.", EN: "If you think this is a false match, you can request a review from the Feedback page." })}</p></div>}<button disabled={busy || !form.projectId || !form.title.trim()} onClick={publish} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 px-5 py-3.5 font-bold text-white transition hover:bg-blue-700 disabled:opacity-50">{busy ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <Upload className="h-5 w-5" />}{tx({ TR: "Güvenlik kontrolüyle yayımla", EN: "Publish with a security check" })}</button></div></motion.div></div>}
            </AnimatePresence>

            <AnimatePresence>
                {selected && <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-3 backdrop-blur-sm" onMouseDown={() => setSelected(null)}><motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 18 }} onMouseDown={(event) => event.stopPropagation()} className="grid h-[90vh] w-full max-w-6xl grid-rows-[55%_45%] overflow-hidden rounded-3xl border border-zinc-700 bg-zinc-950 text-white shadow-2xl lg:grid-cols-[1fr_360px] lg:grid-rows-1"><section className="flex min-w-0 flex-col"><div className="flex items-center justify-between border-b border-zinc-800 px-5 py-4"><div><h2 className="font-black">{selected.post.title}</h2><p className="text-xs text-zinc-400">{selected.post.author} · {selected.files.length} {tx(M.files)}</p></div><div className="flex gap-1">{selected.post.owned && <button onClick={() => deletePost(selected.post)} className="rounded-xl p-2 text-red-400 hover:bg-red-950" title={tx(M.deletePost)}><Trash2 className="h-5 w-5" /></button>}<a href={`/api/media/${selected.post.id}/download`} className="rounded-xl p-2 hover:bg-zinc-800" title={tx(M.download)}><ArrowDownToLine className="h-5 w-5" /></a><button onClick={() => setSelected(null)} className="rounded-xl p-2 hover:bg-zinc-800"><X className="h-5 w-5" /></button></div></div><div className="flex gap-1 overflow-x-auto border-b border-zinc-800 bg-zinc-900 px-3 pt-2">{selected.files.map((file, index) => <button key={`${file.name}-${index}`} onClick={() => setSelectedFile(index)} className={`whitespace-nowrap rounded-t-xl px-4 py-2 text-xs font-semibold ${selectedFile === index ? "bg-zinc-800 text-blue-300" : "text-zinc-400 hover:text-white"}`}>{file.name}</button>)}</div><pre className="min-h-0 flex-1 overflow-auto p-5 font-mono text-sm leading-6 text-zinc-300"><code>{selected.files[selectedFile]?.code || ""}</code></pre></section><aside className="flex min-h-0 flex-col border-l border-t border-zinc-800 bg-zinc-900 lg:border-t-0"><div className="border-b border-zinc-800 p-5"><div className="flex items-center justify-between"><span className="flex items-center gap-2 text-sm font-bold"><Eye className="h-4 w-4 text-blue-400" />{tx({ TR: "Proje ayrıntıları", EN: "Project details" })}</span><button onClick={() => setReportOpen((value) => !value)} className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-800 hover:text-red-400" title={tx({ TR: "Bildir", EN: "Report" })}><Flag className="h-4 w-4" /></button></div><p className="mt-3 text-sm leading-6 text-zinc-400">{selected.post.description || tx(M.noDescription)}</p>{reportOpen && <div className="mt-4 space-y-2 rounded-2xl border border-red-900/60 bg-red-950/20 p-3"><select value={reportCategory} onChange={(event) => setReportCategory(event.target.value)} className="w-full rounded-xl bg-zinc-950 px-3 py-2 text-xs"><option value="malware">{tx({ TR: "Zararlı kod", EN: "Malicious code" })}</option><option value="copyright">{tx({ TR: "Telif", EN: "Copyright" })}</option><option value="personal_data">{tx({ TR: "Kişisel veri", EN: "Personal data" })}</option><option value="spam">Spam</option><option value="other">{tx({ TR: "Diğer", EN: "Other" })}</option></select><textarea value={reportReason} onChange={(event) => setReportReason(event.target.value)} placeholder={tx({ TR: "Neyi incelemeliyiz?", EN: "What should we review?" })} rows={3} className="w-full resize-none rounded-xl bg-zinc-950 px-3 py-2 text-xs outline-none" /><button onClick={sendReport} className="w-full rounded-xl bg-red-600 py-2 text-xs font-bold">{tx({ TR: "Bildirimi gönder", EN: "Send report" })}</button></div>}</div><div className="min-h-0 flex-1 overflow-y-auto p-5"><h3 className="flex items-center gap-2 text-sm font-bold"><MessageCircle className="h-4 w-4" />{tx({ TR: "Yorumlar", EN: "Comments" })} ({selected.comments.length})</h3><div className="mt-4 space-y-4">{selected.comments.length === 0 && <p className="text-sm text-zinc-500">{tx({ TR: "İlk yapıcı yorumu siz yazın.", EN: "Write the first constructive comment." })}</p>}{selected.comments.map((item) => <div key={item.id} className="rounded-2xl bg-zinc-950/70 p-3"><div className="flex items-center gap-2"><UserRound className="h-4 w-4 text-zinc-500" /><span className="text-xs font-bold">{item.author}</span></div><p className="mt-2 whitespace-pre-wrap text-sm leading-5 text-zinc-300">{item.text}</p></div>)}</div></div><div className="border-t border-zinc-800 p-4"><textarea value={comment} maxLength={1200} onChange={(event) => setComment(event.target.value)} placeholder={session?.user ? tx({ TR: "Yapıcı bir yorum yazın…", EN: "Write a constructive comment…" }) : tx({ TR: "Yorum için giriş yapın", EN: "Sign in to comment" })} disabled={!session?.user} rows={3} className="w-full resize-none rounded-2xl bg-zinc-950 px-3 py-2 text-sm outline-none ring-blue-500 focus:ring-1 disabled:opacity-50" /><button disabled={!comment.trim() || busy || !session?.user} onClick={sendComment} className="mt-2 w-full rounded-xl bg-blue-600 py-2 text-sm font-bold disabled:opacity-40">{tx({ TR: "Yorumu gönder", EN: "Send comment" })}</button></div></aside></motion.div></div>}
            </AnimatePresence>

            {busy && !selected && <div className="pointer-events-none fixed bottom-6 left-1/2 z-[80] -translate-x-1/2 rounded-full bg-zinc-950 px-4 py-2 text-sm text-white shadow-xl"><LoaderCircle className="me-2 inline h-4 w-4 animate-spin" />{tx({ TR: "İşlem sürüyor", EN: "Working…" })}</div>}
        </main>
    );
}
