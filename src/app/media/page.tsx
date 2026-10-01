"use client";

import OptimizedImage from "@/components/OptimizedImage";

import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { AnimatePresence, motion } from "framer-motion";
import {
    ArrowDownToLine, BadgeCheck, CheckCircle2, ClipboardCopy, Clock3, Code2, Eye, FileCode2, Filter, Flag,
    Heart, LoaderCircle, MessageCircle, Pencil, Search, ShieldCheck, Sparkles, TrendingUp,
    Trash2, Upload, UserRound, X,
} from "lucide-react";
import Header from "@/components/Header";
import { MEDIA_ERRORS, MediaApiError, mediaAction } from "@/components/Editor/media-api";
import { MEDIA_LICENSES, MEDIA_LIMITS, isMediaPostId, mediaPostPath, normalizeMediaLicense, splitMediaTags, type MediaLicense } from "@/components/Editor/media-publish";
import { openFilesInEditor, type EditorImportError } from "@/lib/editor-bridge";
import { useI18n, type Copy } from "@/lib/i18n";
import { languageDisplayName } from "@/lib/runtimes/languages";

type Post = {
    id: string;
    title: string;
    description: string;
    language: string;
    languages: string[];
    tags: string[];
    author: string;
    authorAvatar: string | null;
    showAuthor: boolean;
    fileCount: number;
    createdAt?: string;
    updatedAt?: string;
    likeCount: number;
    commentCount: number;
    liked: boolean;
    owned: boolean;
    contributedToSecurity: boolean;
    license: string;
};

type PostFile = { name: string; lang: string; code: string; order: number };
type PublishableProject = { id: string; name: string; lang: string; fileCount: number; updatedAt: string };
type PostComment = { id: string; author: string; authorAvatar: string | null; text: string; createdAt?: string };
type Detail = { post: Post; files: PostFile[]; comments: PostComment[] };
type PostFields = { title: string; description: string; tags: string; license: MediaLicense; showAuthor: boolean };
type Translate = (copy: Copy, vars?: Record<string, string | number>) => string;

const panel = "border border-zinc-200/80 bg-white/90 shadow-sm backdrop-blur-xl dark:border-zinc-800 dark:bg-zinc-900/85";
const field = "mt-2 w-full rounded-2xl border border-zinc-200 bg-transparent px-4 py-3 outline-none focus:border-blue-500 dark:border-zinc-700";
const darkField = "mt-1 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-white outline-none focus:border-blue-500";

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
    deleteConfirm: { TR: "“{title}” yayını ve ilişkili yorum/beğeniler silinsin mi?", EN: "Delete “{title}” and its comments and likes?" },
    working: { TR: "İşlem sürüyor", EN: "Working…" },
    close: { TR: "Kapat", EN: "Close" },
    report: { TR: "Bildir", EN: "Report" },
    edit: { TR: "Düzenle", EN: "Edit" },
    editTitle: { TR: "Yayını düzenle", EN: "Edit the post" },
    saveChanges: { TR: "Değişiklikleri kaydet", EN: "Save changes" },
    cancel: { TR: "Vazgeç", EN: "Cancel" },
    updated: { TR: "Yayın güncellendi.", EN: "The post was updated." },
    updateFailed: { TR: "Yayın güncellenemedi.", EN: "The post couldn't be updated." },
    editFilesHint: { TR: "Kodu değiştirmek için yayını editörde açın, düzenleyin ve “Yayını güncelle” ile gönderin.", EN: "To change the code, open the post in the editor, edit it and send it with “Update the post”." },
    openInEditor: { TR: "Editörde aç", EN: "Open in the editor" },
    openInEditorHint: { TR: "Dosyaların bir kopyası kod editöründe açılır.", EN: "A copy of the files opens in the code editor." },
    copyLink: { TR: "Bağlantıyı kopyala", EN: "Copy link" },
    linkCopied: { TR: "Bağlantı kopyalandı.", EN: "Link copied." },
    copyFailed: { TR: "Bağlantı kopyalanamadı.", EN: "The link couldn't be copied." },
    editorHint: { TR: "Kod editöründeki “Media'da yayınla” düğmesiyle açık dosyalarınızı, projeyi kaydetmeden de yayınlayabilirsiniz.", EN: "You can also publish your open files straight from the code editor with “Publish on Media”, without saving a project." },
    openEditor: { TR: "Kod editörünü aç", EN: "Open the code editor" },
    title: { TR: "Başlık", EN: "Title" },
    description: { TR: "Açıklama", EN: "Description" },
    tags: { TR: "Etiketler", EN: "Tags" },
    tagsHint: { TR: "(virgülle, en fazla 6)", EN: "(comma separated, up to 6)" },
    tagsPlaceholder: { TR: "web, araç, eğitim", EN: "web, tool, education" },
    license: { TR: "Paylaşım lisansı", EN: "Sharing license" },
    licenseHint: { TR: "Bir açık kaynak lisansı seçmek, alıcılara o lisansın koşullarıyla yeniden kullanım hakkı verir.", EN: "Choosing an open-source license lets others reuse the code under that license's terms." },
    showAuthor: { TR: "Profil adımı göster", EN: "Show my profile name" },
    showAuthorHint: { TR: "Kapalıysa yayın “Anonim geliştirici” adıyla görünür. E-posta hiçbir durumda yayınlanmaz.", EN: "When off, the post appears as “Anonymous developer”. Your e-mail is never published." },
    noLicense: { TR: "Lisans belirtilmedi", EN: "No license" },
    likes: { TR: "beğeni", EN: "likes" },
    like: { TR: "Beğen", EN: "Like" },
    unlike: { TR: "Beğeniyi geri al", EN: "Remove like" },
    commentsOf: { TR: "Yorumlar ({count})", EN: "Comments ({count})" },
    fileTabs: { TR: "Proje dosyaları", EN: "Project files" },
    projectOption: { TR: "{name} · {language}", EN: "{name} · {language}" },
    projectOptionMany: { TR: "{name} · {language} · {count} dosya", EN: "{name} · {language} · {count} files" },
} satisfies Record<string, Copy>;

const LICENSE_LABELS: Record<MediaLicense, Copy> = {
    "all-rights-reserved": { TR: "Lisans belirtilmedi · tüm haklar saklı", EN: "No license · all rights reserved" },
    MIT: { TR: "MIT", EN: "MIT" },
    "Apache-2.0": { TR: "Apache 2.0", EN: "Apache 2.0" },
    "GPL-3.0": { TR: "GPL 3.0", EN: "GPL 3.0" },
};

const EDITOR_ERRORS: Record<EditorImportError, Copy> = {
    invalid_payload: { TR: "Dosyalar editöre aktarılamadı.", EN: "The files couldn't be handed to the editor." },
    empty_code: { TR: "Açılacak dosya yok.", EN: "There are no files to open." },
    too_large: { TR: "Dosyalar editörde açmak için çok büyük.", EN: "The files are too large to open in the editor." },
    unsupported_language: { TR: "Dosyaların dili tanınmadı.", EN: "The files' language isn't supported." },
    storage_unavailable: { TR: "Tarayıcı depolaması kullanılamadığı için dosyalar editörde açılamadı.", EN: "The files couldn't be opened because browser storage is unavailable." },
    not_found: { TR: "Dosyalar editöre aktarılamadı.", EN: "The files couldn't be handed to the editor." },
    expired: { TR: "Dosyalar editöre aktarılamadı.", EN: "The files couldn't be handed to the editor." },
};

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

function Avatar({ post }: { post: Pick<Post, "author" | "authorAvatar"> }) {
    return post.authorAvatar
        ? <OptimizedImage src={post.authorAvatar} alt="" className="h-9 w-9 rounded-full object-cover ring-2 ring-white dark:ring-zinc-800" referrerPolicy="no-referrer" />
        : <span aria-hidden className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-violet-600 text-sm font-bold text-white">{post.author.charAt(0).toUpperCase()}</span>;
}

/** The ?post=<id> deep link, kept in sync with the open post without adding history entries. */
function setPostParam(id: string | null) {
    const url = new URL(window.location.href);
    if (id) url.searchParams.set("post", id);
    else url.searchParams.delete("post");
    window.history.replaceState(window.history.state, "", url);
}

/** Escape closes a dialog; focus moves into it and returns afterwards. */
function useDialogFocus(open: boolean, onClose: () => void) {
    const ref = useRef<HTMLDivElement>(null);
    const closeRef = useRef(onClose);
    useEffect(() => {
        closeRef.current = onClose;
    }, [onClose]);
    useEffect(() => {
        if (!open) return;
        const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        const frame = window.requestAnimationFrame(() => ref.current?.querySelector<HTMLElement>("[data-autofocus]")?.focus());
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key !== "Escape") return;
            event.preventDefault();
            closeRef.current();
        };
        document.addEventListener("keydown", onKeyDown);
        return () => {
            window.cancelAnimationFrame(frame);
            document.removeEventListener("keydown", onKeyDown);
            if (previous?.isConnected) previous.focus();
        };
    }, [open]);
    return ref;
}

function PostCard({ post, index, onOpen, onLike, onDelete }: { post: Post; index: number; onOpen: () => void; onLike: () => void; onDelete: () => void }) {
    const { tx, locale } = useI18n();
    return (
        <motion.article initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(index * 0.035, 0.3) }} className={`${panel} group flex min-h-72 flex-col rounded-3xl p-5 transition hover:-translate-y-1 hover:border-blue-300 hover:shadow-xl dark:hover:border-blue-900`}>
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <Avatar post={post} />
                    <div>
                        <p className="text-sm font-semibold">{post.author}</p>
                        <p className="text-xs text-zinc-400">{formatDate(post.createdAt, locale, tx({ TR: "Yeni", EN: "New" }))}</p>
                    </div>
                </div>
                <div className="flex items-center gap-1">
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
            <button type="button" onClick={onOpen} className="mt-5 flex-1 text-start">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-blue-500">
                    <FileCode2 className="h-4 w-4" aria-hidden />
                    {post.languages.map(languageDisplayName).join(" · ")} · {post.fileCount} {tx(M.files)}
                </div>
                <h2 className="mt-3 text-xl font-black tracking-tight transition group-hover:text-blue-600">{post.title}</h2>
                <p className="mt-2 line-clamp-3 text-sm leading-6 text-zinc-500 dark:text-zinc-400">{post.description || tx(M.noDescription)}</p>
                <div className="mt-4 flex flex-wrap gap-2">{post.tags.map((tag) => <span key={tag} className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">#{tag}</span>)}</div>
            </button>
            <div className="mt-5 flex items-center justify-between border-t border-zinc-100 pt-4 dark:border-zinc-800">
                <div className="flex gap-2">
                    <button type="button" onClick={onLike} aria-pressed={post.liked} title={tx(post.liked ? M.unlike : M.like)} className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold transition ${post.liked ? "bg-rose-50 text-rose-600 dark:bg-rose-950/40" : "hover:bg-zinc-100 dark:hover:bg-zinc-800"}`}>
                        <Heart className={`h-4 w-4 ${post.liked ? "fill-current" : ""}`} aria-hidden />
                        <span className="sr-only">{tx(post.liked ? M.unlike : M.like)}</span>
                        {post.likeCount}
                    </button>
                    <button type="button" onClick={onOpen} aria-label={tx(M.commentsOf, { count: post.commentCount })} className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800">
                        <MessageCircle className="h-4 w-4" aria-hidden />{post.commentCount}
                    </button>
                </div>
                <div className="flex items-center gap-2">
                    <span className="rounded-lg bg-zinc-100 px-2 py-1 text-[10px] font-bold text-zinc-500 dark:bg-zinc-800">{post.license === "all-rights-reserved" ? tx(M.noLicense) : post.license}</span>
                    <a href={`/api/media/${post.id}/download`} className="rounded-xl p-2.5 transition hover:bg-zinc-100 dark:hover:bg-zinc-800" title={tx({ TR: "Projeyi indir", EN: "Download project" })} aria-label={tx({ TR: "Projeyi indir", EN: "Download project" })}>
                        <ArrowDownToLine className="h-4 w-4" aria-hidden />
                    </a>
                </div>
            </div>
        </motion.article>
    );
}

/** The fields shared by the publish form and the owner's edit form. */
function PostFieldsForm({ value, onChange, dark = false }: { value: PostFields; onChange: (next: PostFields) => void; dark?: boolean }) {
    const { tx } = useI18n();
    const ids = { title: useId(), description: useId(), tags: useId(), license: useId() };
    const labelClass = dark ? "block text-xs font-semibold text-zinc-300" : "block text-sm font-semibold";
    const inputClass = dark ? darkField : field;
    return (
        <>
            <div>
                <label htmlFor={ids.title} className={labelClass}>{tx(M.title)}</label>
                <input id={ids.title} data-autofocus value={value.title} maxLength={MEDIA_LIMITS.title} required onChange={(event) => onChange({ ...value, title: event.target.value })} className={inputClass} />
            </div>
            <div>
                <label htmlFor={ids.description} className={labelClass}>{tx(M.description)}</label>
                <textarea id={ids.description} value={value.description} maxLength={MEDIA_LIMITS.description} rows={4} onChange={(event) => onChange({ ...value, description: event.target.value })} className={`${inputClass} resize-none`} />
            </div>
            <div>
                <label htmlFor={ids.tags} className={labelClass}>{tx(M.tags)} <span className="font-normal text-zinc-400">{tx(M.tagsHint)}</span></label>
                <input id={ids.tags} value={value.tags} onChange={(event) => onChange({ ...value, tags: event.target.value })} placeholder={tx(M.tagsPlaceholder)} className={inputClass} />
            </div>
            <div>
                <label htmlFor={ids.license} className={labelClass}>{tx(M.license)}</label>
                <select id={ids.license} value={value.license} aria-describedby={`${ids.license}-hint`} onChange={(event) => onChange({ ...value, license: normalizeMediaLicense(event.target.value) })} className={inputClass}>
                    {MEDIA_LICENSES.map((license) => <option key={license} value={license}>{tx(LICENSE_LABELS[license])}</option>)}
                </select>
                <span id={`${ids.license}-hint`} className="mt-1 block text-xs font-normal leading-5 text-zinc-500">{tx(M.licenseHint)}</span>
            </div>
            <label className={`flex items-start gap-3 rounded-2xl p-4 ${dark ? "bg-zinc-950/70" : "bg-zinc-100 dark:bg-zinc-800"}`}>
                <input type="checkbox" checked={value.showAuthor} onChange={(event) => onChange({ ...value, showAuthor: event.target.checked })} className="mt-1 h-4 w-4" />
                <span>
                    <strong className="block text-sm">{tx(M.showAuthor)}</strong>
                    <span className="text-xs leading-5 text-zinc-500">{tx(M.showAuthorHint)}</span>
                </span>
            </label>
        </>
    );
}

/** Publishes a project saved to the cloud from the editor ("publish" action). */
function PublishProjectDialog({ consent, onClose, onPublished, mutate }: { consent: boolean; onClose: () => void; onPublished: () => void; mutate: (body: Record<string, unknown>) => Promise<unknown> }) {
    const { tx, language } = useI18n();
    const [projects, setProjects] = useState<PublishableProject[]>([]);
    const [projectsState, setProjectsState] = useState<"loading" | "ready" | "error">("loading");
    const [projectId, setProjectId] = useState("");
    const [fields, setFields] = useState<PostFields>({ title: "", description: "", tags: "", license: "all-rights-reserved", showAuthor: true });
    const [contribute, setContribute] = useState(false);
    const [busy, setBusy] = useState(false);
    const [problem, setProblem] = useState<{ message: string; findings: string[] } | null>(null);
    const titleId = useId();
    const ref = useDialogFocus(true, onClose);

    // The project list comes from the server: a client Firestore query needs a
    // composite index and a live Firebase session, and was silently empty without them.
    useEffect(() => {
        const controller = new AbortController();
        fetch("/api/media?scope=my-projects", { cache: "no-store", signal: controller.signal })
            .then(async (response) => {
                const data = await response.json().catch(() => ({})) as { projects?: PublishableProject[] };
                if (!response.ok) throw new Error("projects");
                setProjects(data.projects || []);
                setProjectsState("ready");
            })
            .catch((projectError: unknown) => {
                if (controller.signal.aborted) return;
                console.warn("Publishable projects could not be loaded:", projectError);
                setProjectsState("error");
            });
        return () => controller.abort();
    }, []);

    const publish = async () => {
        if (!projectId || !fields.title.trim()) return;
        setBusy(true);
        setProblem(null);
        try {
            await mutate({ action: "publish", projectId, ...fields, tags: splitMediaTags(fields.tags), contribute: consent && contribute });
            onPublished();
        } catch (publishError) {
            const findings = publishError instanceof MediaApiError ? publishError.findings : [];
            setProblem({ message: errorMessage(publishError, M.publishFailed, tx, language), findings });
        } finally {
            setBusy(false);
        }
    };

    const loading = projectsState === "loading";
    return (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onMouseDown={onClose}>
            <motion.div ref={ref} role="dialog" aria-modal="true" aria-labelledby={titleId} initial={{ opacity: 0, scale: .96, y: 12 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: .96 }} onMouseDown={(event) => event.stopPropagation()} className={`${panel} max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-3xl p-6`}>
                <div className="flex items-center justify-between">
                    <div>
                        <h2 id={titleId} className="text-2xl font-black">{tx({ TR: "Projeyi Media’da yayımla", EN: "Publish a project on Media" })}</h2>
                        <p className="mt-1 text-sm text-zinc-500">{tx({ TR: "Kaynak dosyalarının anlık bir kopyası paylaşılır.", EN: "A snapshot of the source files is shared." })}</p>
                    </div>
                    <button type="button" onClick={onClose} className="rounded-xl p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800" aria-label={tx(M.close)}><X className="h-5 w-5" aria-hidden /></button>
                </div>
                <div className="mt-6 space-y-4">
                    <label className="block text-sm font-semibold">
                        {tx({ TR: "Proje", EN: "Project" })}
                        <select data-autofocus value={projectId} disabled={loading} onChange={(event) => {
                            const project = projects.find((item) => item.id === event.target.value);
                            setProjectId(event.target.value);
                            setFields((current) => ({ ...current, title: current.title || project?.name || "" }));
                        }} className={`${field} disabled:opacity-60`}>
                            <option value="">{loading ? tx({ TR: "Projeler yükleniyor…", EN: "Loading projects…" }) : projects.length ? tx({ TR: "Proje seçin", EN: "Choose a project" }) : tx({ TR: "Kayıtlı kod projeniz yok", EN: "You have no saved code projects" })}</option>
                            {projects.map((project) => (
                                <option key={project.id} value={project.id}>
                                    {tx(project.fileCount > 1 ? M.projectOptionMany : M.projectOption, { name: project.name, language: languageDisplayName(project.lang), count: project.fileCount })}
                                </option>
                            ))}
                        </select>
                        {projectsState === "error" && <span role="alert" className="mt-2 block text-xs font-normal text-red-600 dark:text-red-400">{tx(M.projectsFailed)}</span>}
                        {projectsState === "ready" && projects.length === 0 && <span className="mt-2 block text-xs font-normal leading-5 text-zinc-500">{tx({ TR: "Önce kod editöründe bir projeyi kaydedin; kaydedilen projeler burada listelenir.", EN: "Save a project in the code editor first; saved projects are listed here." })}</span>}
                    </label>
                    <p className="rounded-2xl bg-blue-50 p-3 text-xs leading-5 text-blue-900 dark:bg-blue-950/40 dark:text-blue-200">
                        {tx(M.editorHint)}{" "}
                        <Link href="/editor" className="font-semibold underline">{tx(M.openEditor)}</Link>
                    </p>
                    <PostFieldsForm value={fields} onChange={setFields} />
                    {consent && (
                        <label className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-900 dark:bg-emerald-950/30">
                            <input type="checkbox" checked={contribute} onChange={(event) => setContribute(event.target.checked)} className="mt-1 h-4 w-4" />
                            <span>
                                <strong className="block text-sm text-emerald-800 dark:text-emerald-200">{tx({ TR: "Bu projeyi güvenlik katkısına dahil et", EN: "Include this project in the security contribution" })}</strong>
                                <span className="text-xs leading-5 text-emerald-700 dark:text-emerald-300">{tx({ TR: "Otomatik eğitim yapılmaz; uygunluk ve amaç sınırı insan denetimiyle değerlendirilir.", EN: "There is no automatic training; eligibility and purpose limits are reviewed by people." })}</span>
                            </span>
                        </label>
                    )}
                    {problem && (
                        <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200">
                            <strong className="block">{problem.message}</strong>
                            {problem.findings.length > 0 && (
                                <>
                                    <ul className="mt-2 list-disc space-y-1 ps-5 text-xs leading-5">{problem.findings.map((finding) => <li key={finding}>{finding}</li>)}</ul>
                                    <p className="mt-2 text-xs opacity-80">{tx({ TR: "Yanlış bir eşleşme olduğunu düşünüyorsanız Geri Bildirim sayfasından inceleme isteyebilirsiniz.", EN: "If you think this is a false match, you can request a review from the Feedback page." })}</p>
                                </>
                            )}
                        </div>
                    )}
                    <button type="button" disabled={busy || !projectId || !fields.title.trim()} onClick={() => void publish()} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 px-5 py-3.5 font-bold text-white transition hover:bg-blue-700 disabled:opacity-50">
                        {busy ? <LoaderCircle className="h-5 w-5 animate-spin" aria-hidden /> : <Upload className="h-5 w-5" aria-hidden />}
                        {tx({ TR: "Güvenlik kontrolüyle yayımla", EN: "Publish with a security check" })}
                    </button>
                </div>
            </motion.div>
        </div>
    );
}

interface PostModalProps {
    detail: Detail;
    signedIn: boolean;
    busy: boolean;
    onClose: () => void;
    onDelete: () => void;
    onComment: (text: string) => Promise<boolean>;
    onReport: (category: string, reason: string) => Promise<boolean>;
    onUpdate: (fields: PostFields) => Promise<boolean>;
    onOpenInEditor: () => void;
    onCopyLink: () => void;
}

function PostModal({ detail, signedIn, busy, onClose, onDelete, onComment, onReport, onUpdate, onOpenInEditor, onCopyLink }: PostModalProps) {
    const { tx } = useI18n();
    const { post, files, comments } = detail;
    const [selectedFile, setSelectedFile] = useState(0);
    const [comment, setComment] = useState("");
    const [reportOpen, setReportOpen] = useState(false);
    const [reportCategory, setReportCategory] = useState("other");
    const [reportReason, setReportReason] = useState("");
    const [editing, setEditing] = useState<PostFields | null>(null);
    const titleId = useId();
    const ref = useDialogFocus(true, onClose);
    const shownFile = files[Math.min(selectedFile, Math.max(0, files.length - 1))];

    const startEdit = () => {
        setEditing({ title: post.title, description: post.description, tags: post.tags.join(", "), license: normalizeMediaLicense(post.license), showAuthor: post.showAuthor });
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

    return (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-3 backdrop-blur-sm" onMouseDown={onClose}>
            <motion.div ref={ref} role="dialog" aria-modal="true" aria-labelledby={titleId} initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 18 }} onMouseDown={(event) => event.stopPropagation()} className="grid h-[90vh] w-full max-w-6xl grid-rows-[55%_45%] overflow-hidden rounded-3xl border border-zinc-700 bg-zinc-950 text-white shadow-2xl lg:grid-cols-[1fr_360px] lg:grid-rows-1">
                <section className="flex min-w-0 flex-col">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800 px-5 py-3">
                        <div className="min-w-0">
                            <h2 id={titleId} className="truncate font-black">{post.title}</h2>
                            <p className="text-xs text-zinc-400">{post.author} · {files.length} {tx(M.files)}</p>
                        </div>
                        {actions}
                    </div>
                    <div role="tablist" aria-label={tx(M.fileTabs)} className="flex gap-1 overflow-x-auto border-b border-zinc-800 bg-zinc-900 px-3 pt-2">
                        {files.map((file, index) => (
                            <button key={`${file.name}-${index}`} type="button" role="tab" aria-selected={shownFile === file} onClick={() => setSelectedFile(index)} className={`whitespace-nowrap rounded-t-xl px-4 py-2 text-xs font-semibold ${shownFile === file ? "bg-zinc-800 text-blue-300" : "text-zinc-400 hover:text-white"}`}>{file.name}</button>
                        ))}
                    </div>
                    <pre className="min-h-0 flex-1 overflow-auto p-5 font-mono text-sm leading-6 text-zinc-300" tabIndex={0} aria-label={shownFile?.name}><code>{shownFile?.code || ""}</code></pre>
                </section>
                <aside className="flex min-h-0 flex-col border-l border-t border-zinc-800 bg-zinc-900 lg:border-t-0">
                    {editing ? (
                        <form className="min-h-0 flex-1 space-y-3 overflow-y-auto p-5" onSubmit={(event) => {
                            event.preventDefault();
                            if (!editing.title.trim()) return;
                            void onUpdate(editing).then((ok) => {
                                if (ok) setEditing(null);
                            });
                        }}>
                            <h3 className="flex items-center gap-2 text-sm font-bold"><Pencil className="h-4 w-4 text-blue-400" aria-hidden />{tx(M.editTitle)}</h3>
                            <PostFieldsForm value={editing} onChange={setEditing} dark />
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
                            <div className="border-b border-zinc-800 p-5">
                                <div className="flex items-center justify-between">
                                    <span className="flex items-center gap-2 text-sm font-bold"><Eye className="h-4 w-4 text-blue-400" aria-hidden />{tx({ TR: "Proje ayrıntıları", EN: "Project details" })}</span>
                                    <button type="button" onClick={() => setReportOpen((value) => !value)} aria-expanded={reportOpen} className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-800 hover:text-red-400" title={tx(M.report)} aria-label={tx(M.report)}><Flag className="h-4 w-4" aria-hidden /></button>
                                </div>
                                <p className="mt-3 whitespace-pre-line text-sm leading-6 text-zinc-400">{post.description || tx(M.noDescription)}</p>
                                {post.tags.length > 0 && <div className="mt-3 flex flex-wrap gap-1.5">{post.tags.map((tag) => <span key={tag} className="rounded-full bg-zinc-800 px-2 py-0.5 text-xs text-zinc-300">#{tag}</span>)}</div>}
                                {reportOpen && (
                                    <div className="mt-4 space-y-2 rounded-2xl border border-red-900/60 bg-red-950/20 p-3">
                                        <select value={reportCategory} onChange={(event) => setReportCategory(event.target.value)} aria-label={tx(M.report)} className="w-full rounded-xl bg-zinc-950 px-3 py-2 text-xs">
                                            <option value="malware">{tx({ TR: "Zararlı kod", EN: "Malicious code" })}</option>
                                            <option value="copyright">{tx({ TR: "Telif", EN: "Copyright" })}</option>
                                            <option value="personal_data">{tx({ TR: "Kişisel veri", EN: "Personal data" })}</option>
                                            <option value="spam">Spam</option>
                                            <option value="other">{tx({ TR: "Diğer", EN: "Other" })}</option>
                                        </select>
                                        <textarea value={reportReason} onChange={(event) => setReportReason(event.target.value)} placeholder={tx({ TR: "Neyi incelemeliyiz?", EN: "What should we review?" })} aria-label={tx({ TR: "Neyi incelemeliyiz?", EN: "What should we review?" })} rows={3} className="w-full resize-none rounded-xl bg-zinc-950 px-3 py-2 text-xs outline-none" />
                                        <button type="button" disabled={busy || !reportReason.trim()} onClick={() => void onReport(reportCategory, reportReason).then((ok) => {
                                            if (!ok) return;
                                            setReportOpen(false);
                                            setReportReason("");
                                        })} className="w-full rounded-xl bg-red-600 py-2 text-xs font-bold disabled:opacity-40">{tx({ TR: "Bildirimi gönder", EN: "Send report" })}</button>
                                    </div>
                                )}
                            </div>
                            <div className="min-h-0 flex-1 overflow-y-auto p-5">
                                <h3 className="flex items-center gap-2 text-sm font-bold"><MessageCircle className="h-4 w-4" aria-hidden />{tx({ TR: "Yorumlar", EN: "Comments" })} ({comments.length})</h3>
                                <div className="mt-4 space-y-4">
                                    {comments.length === 0 && <p className="text-sm text-zinc-500">{tx({ TR: "İlk yapıcı yorumu siz yazın.", EN: "Write the first constructive comment." })}</p>}
                                    {comments.map((item) => (
                                        <div key={item.id} className="rounded-2xl bg-zinc-950/70 p-3">
                                            <div className="flex items-center gap-2"><UserRound className="h-4 w-4 text-zinc-500" aria-hidden /><span className="text-xs font-bold">{item.author}</span></div>
                                            <p className="mt-2 whitespace-pre-wrap text-sm leading-5 text-zinc-300">{item.text}</p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                            <div className="border-t border-zinc-800 p-4">
                                <textarea value={comment} maxLength={1200} onChange={(event) => setComment(event.target.value)} placeholder={signedIn ? tx({ TR: "Yapıcı bir yorum yazın…", EN: "Write a constructive comment…" }) : tx({ TR: "Yorum için giriş yapın", EN: "Sign in to comment" })} aria-label={tx({ TR: "Yorumlar", EN: "Comments" })} disabled={!signedIn} rows={3} className="w-full resize-none rounded-2xl bg-zinc-950 px-3 py-2 text-sm outline-none ring-blue-500 focus:ring-1 disabled:opacity-50" />
                                <button type="button" disabled={!comment.trim() || busy || !signedIn} onClick={() => void onComment(comment).then((ok) => {
                                    if (ok) setComment("");
                                })} className="mt-2 w-full rounded-xl bg-blue-600 py-2 text-sm font-bold disabled:opacity-40">{tx({ TR: "Yorumu gönder", EN: "Send comment" })}</button>
                            </div>
                        </>
                    )}
                </aside>
            </motion.div>
        </div>
    );
}

/** Translates an error from /api/media: known codes in the visitor's language, otherwise the Turkish server message for Turkish visitors. */
function errorMessage(error: unknown, fallback: Copy, tx: Translate, uiLanguage: string) {
    if (error instanceof MediaApiError) {
        const known = MEDIA_ERRORS[error.code];
        if (known && error.code !== "failed") return tx(known, { name: error.file ?? "" });
        if (uiLanguage === "TR" && error.message && error.message !== error.code) return error.message;
    }
    return tx(fallback);
}

export default function MediaPage() {
    const { data: session } = useSession();
    const router = useRouter();
    const { tx, language: uiLanguage } = useI18n();
    const [posts, setPosts] = useState<Post[]>([]);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");
    const [search, setSearch] = useState("");
    const [language, setLanguage] = useState("all");
    const [sort, setSort] = useState<"popular" | "newest">("popular");
    const [showPublish, setShowPublish] = useState(false);
    const [selected, setSelected] = useState<Detail | null>(null);
    const [consent, setConsent] = useState(false);
    const signedIn = Boolean(session?.user);
    const fail = useCallback((failure: unknown, fallback: Copy) => setError(errorMessage(failure, fallback, tx, uiLanguage)), [tx, uiLanguage]);

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

    const openPost = useCallback(async (id: string) => {
        setBusy(true);
        try {
            const response = await fetch(`/api/media?id=${encodeURIComponent(id)}`, { cache: "no-store" });
            const data = await response.json().catch(() => ({})) as Detail & { error?: string; code?: string };
            if (!response.ok) throw new MediaApiError(data.code || "failed", response.status, data.error || "");
            setSelected(data);
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
        // Deferred to a task so the first render isn't followed by a synchronous state cascade.
        const timer = window.setTimeout(() => {
            void load();
            // /media?post=<id> opens that post (links from the editor and shared links).
            const linked = new URLSearchParams(window.location.search).get("post");
            if (isMediaPostId(linked)) void openPostRef.current(linked);
        }, 0);
        return () => window.clearTimeout(timer);
    }, [load]);

    const closePost = useCallback(() => {
        setSelected(null);
        setPostParam(null);
    }, []);

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

    const openPublish = () => {
        if (!signedIn) {
            setError(tx(M.signInToPublish));
            return;
        }
        setShowPublish(true);
    };

    const toggleLike = async (post: Post) => {
        if (!signedIn) {
            setError(tx(M.signInToLike));
            return;
        }
        setPosts((current) => current.map((item) => item.id === post.id ? { ...item, liked: !item.liked, likeCount: item.likeCount + (item.liked ? -1 : 1) } : item));
        try {
            await mediaAction({ action: "like", postId: post.id });
        } catch (likeError) {
            setPosts((current) => current.map((item) => item.id === post.id ? post : item));
            fail(likeError, M.likeFailed);
        }
    };

    const toggleConsent = async () => {
        if (!signedIn) {
            setError(tx(M.signInToConsent));
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
        const response = await fetch(`/api/media?id=${encodeURIComponent(id)}`, { cache: "no-store" });
        if (!response.ok) return;
        const data = await response.json().catch(() => null) as Detail | null;
        if (data?.post) setSelected(data);
    };

    const sendComment = async (text: string) => {
        if (!selected || !text.trim()) return false;
        setBusy(true);
        try {
            await mediaAction({ action: "comment", postId: selected.post.id, text });
            await reloadPost(selected.post.id);
            await load();
            return true;
        } catch (commentError) {
            fail(commentError, M.commentFailed);
            return false;
        } finally {
            setBusy(false);
        }
    };

    const sendReport = async (category: string, reason: string) => {
        if (!selected || !reason.trim()) return false;
        setBusy(true);
        try {
            await mediaAction({ action: "report", postId: selected.post.id, category, reason });
            setNotice(tx(M.reportQueued));
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
            await mediaAction({ action: "update", postId: selected.post.id, ...fields, tags: splitMediaTags(fields.tags) });
            await reloadPost(selected.post.id);
            await load();
            setNotice(tx(M.updated));
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
            await load();
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
        if (!result.ok) setError(tx(EDITOR_ERRORS[result.error]));
    };

    const copyLink = async () => {
        if (!selected) return;
        try {
            await navigator.clipboard.writeText(new URL(mediaPostPath(selected.post.id), window.location.origin).href);
            setNotice(tx(M.linkCopied));
        } catch {
            setError(tx(M.copyFailed));
        }
    };

    const banner = error ? (ERROR_CODES[error] ? tx(ERROR_CODES[error]) : error) : notice;
    return (
        <main className="min-h-screen overflow-hidden bg-zinc-50 text-zinc-950 dark:bg-zinc-950 dark:text-white">
            <Header />
            <section className="relative border-b border-zinc-200/70 pb-16 pt-32 dark:border-zinc-800">
                <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(59,130,246,.14),transparent_34%),radial-gradient(circle_at_80%_25%,rgba(139,92,246,.12),transparent_32%)]" />
                <div className="relative mx-auto max-w-7xl px-6">
                    <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} className="grid gap-8 lg:grid-cols-[1fr_380px] lg:items-end">
                        <div>
                            <span className="mb-5 inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700 dark:border-blue-900 dark:bg-blue-950/50 dark:text-blue-300"><Sparkles className="h-3.5 w-3.5" aria-hidden /> {tx({ TR: "Topluluk kod vitrini", EN: "Community code showcase" })}</span>
                            <h1 className="max-w-3xl text-4xl font-black tracking-tight sm:text-6xl">Hanogt <span className="bg-gradient-to-r from-blue-500 to-violet-500 bg-clip-text text-transparent">Media</span></h1>
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
                            <button type="button" disabled={busy} onClick={() => void toggleConsent()} aria-pressed={consent} className={`mt-4 w-full rounded-2xl px-4 py-3 text-sm font-bold transition ${consent ? "bg-emerald-500 text-white hover:bg-emerald-600" : "bg-zinc-900 text-white hover:bg-zinc-800 dark:bg-white dark:text-zinc-950"}`}>{consent ? tx({ TR: "Katkı izni açık · Kapat", EN: "Contribution on · Turn off" }) : tx({ TR: "İsteğe bağlı katkı iznini aç", EN: "Turn on optional contribution" })}</button>
                        </div>
                    </motion.div>
                </div>
            </section>

            <section className="mx-auto max-w-7xl px-6 py-10">
                <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-center">
                    <label className={`${panel} flex flex-1 items-center gap-3 rounded-2xl px-4 py-3`}>
                        <Search className="h-5 w-5 text-zinc-400" aria-hidden />
                        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={tx({ TR: "Proje, geliştirici veya etiket ara", EN: "Search projects, developers or tags" })} aria-label={tx({ TR: "Proje, geliştirici veya etiket ara", EN: "Search projects, developers or tags" })} className="w-full bg-transparent outline-none placeholder:text-zinc-400" />
                    </label>
                    <div className="flex flex-wrap gap-3">
                        <label className={`${panel} flex items-center gap-2 rounded-2xl px-3`}>
                            <Filter className="h-4 w-4 text-zinc-400" aria-hidden />
                            <select value={language} onChange={(event) => setLanguage(event.target.value)} aria-label={tx({ TR: "Tüm diller", EN: "All languages" })} className="h-12 bg-transparent text-sm outline-none">
                                <option value="all">{tx({ TR: "Tüm diller", EN: "All languages" })}</option>
                                {languages.map((item) => <option key={item} value={item}>{languageDisplayName(item)}</option>)}
                            </select>
                        </label>
                        <button type="button" onClick={() => setSort((value) => value === "popular" ? "newest" : "popular")} className={`${panel} flex h-12 items-center gap-2 rounded-2xl px-4 text-sm font-semibold`} title={tx({ TR: "Sıralamayı değiştir", EN: "Change sorting" })}>
                            {sort === "popular" ? <TrendingUp className="h-4 w-4" aria-hidden /> : <Clock3 className="h-4 w-4" aria-hidden />}
                            {sort === "popular" ? tx({ TR: "Popüler", EN: "Popular" }) : tx({ TR: "En yeni", EN: "Newest" })}
                        </button>
                        <button type="button" onClick={openPublish} className="flex h-12 items-center gap-2 rounded-2xl bg-zinc-950 px-5 text-sm font-bold text-white shadow-lg transition hover:-translate-y-0.5 dark:bg-white dark:text-zinc-950"><Upload className="h-4 w-4" aria-hidden />{tx({ TR: "Yayımla", EN: "Publish" })}</button>
                    </div>
                </div>

                {banner && (
                    <div role={error ? "alert" : "status"} className={`mb-6 flex w-full items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-sm ${error ? "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200" : "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200"}`}>
                        <span>{banner}</span>
                        <button type="button" onClick={() => { setError(""); setNotice(""); }} className="shrink-0 rounded-lg p-1 hover:bg-black/5 dark:hover:bg-white/10" aria-label={tx(M.close)}>
                            <X className="h-4 w-4" aria-hidden />
                        </button>
                    </div>
                )}

                {featured.length > 0 && !search && language === "all" && (
                    <div className="mb-12">
                        <div className="mb-4 flex items-center gap-2"><TrendingUp className="h-5 w-5 text-violet-500" aria-hidden /><h2 className="text-xl font-black">{tx({ TR: "En çok beğenilen projeler", EN: "Most liked projects" })}</h2></div>
                        <div className="grid gap-4 md:grid-cols-3">
                            {featured.map((post, index) => (
                                <button key={post.id} type="button" onClick={() => void openPost(post.id)} className={`${panel} group rounded-3xl p-5 text-start transition hover:-translate-y-1 hover:shadow-xl`}>
                                    <span className="text-xs font-black text-violet-500">#{index + 1} · {post.likeCount} {tx(M.likes)}</span>
                                    <h3 className="mt-2 truncate text-lg font-bold">{post.title}</h3>
                                    <p className="mt-2 line-clamp-2 text-sm text-zinc-500">{post.description || tx({ TR: "Topluluğa açık kaynak proje", EN: "An open-source community project" })}</p>
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {loading ? (
                    <div className="flex min-h-72 items-center justify-center"><LoaderCircle className="h-7 w-7 animate-spin text-blue-500" aria-hidden /></div>
                ) : filtered.length === 0 ? (
                    <div className={`${panel} rounded-3xl py-20 text-center`}>
                        <Code2 className="mx-auto h-10 w-10 text-zinc-400" aria-hidden />
                        <h2 className="mt-4 text-xl font-bold">{tx({ TR: "Henüz eşleşen proje yok", EN: "No matching projects yet" })}</h2>
                        <p className="mt-2 text-zinc-500">{tx({ TR: "İlk kaliteli projeyi siz paylaşabilirsiniz.", EN: "Be the first to share a great project." })}</p>
                    </div>
                ) : (
                    <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
                        {filtered.map((post, index) => (
                            <PostCard key={post.id} post={post} index={index} onOpen={() => void openPost(post.id)} onLike={() => void toggleLike(post)} onDelete={() => void deletePost(post)} />
                        ))}
                    </div>
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
                            void load();
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
                        onClose={closePost}
                        onDelete={() => void deletePost(selected.post)}
                        onComment={sendComment}
                        onReport={sendReport}
                        onUpdate={updatePost}
                        onOpenInEditor={openInEditor}
                        onCopyLink={() => void copyLink()}
                    />
                )}
            </AnimatePresence>

            {busy && !selected && <div role="status" className="pointer-events-none fixed bottom-6 left-1/2 z-[80] -translate-x-1/2 rounded-full bg-zinc-950 px-4 py-2 text-sm text-white shadow-xl"><LoaderCircle className="me-2 inline h-4 w-4 animate-spin" aria-hidden />{tx(M.working)}</div>}
        </main>
    );
}
