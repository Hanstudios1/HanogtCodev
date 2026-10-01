"use client";

import {
    AlertTriangle, CheckCircle2, ClipboardCopy, ExternalLink, Info, LoaderCircle, LogIn, RefreshCw, Send, ShieldAlert, ShieldCheck, Trash2,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import LanguageIcon from "@/components/Editor/LanguageIcon";
import Modal, { buttonClasses } from "@/components/Editor/Modal";
import { MediaApiError, fetchMediaViewer, mediaAction, mediaErrorText } from "@/components/Editor/media-api";
import { GUARD_TITLE, failedPrecheck, precheckKey, runPrecheck, type CheckFinding, type Precheck } from "@/components/Editor/media-precheck";
import {
    MEDIA_LICENSES, MEDIA_LIMITS, cleanMediaTags, cleanMediaTitle, fitsMediaFile, locateScanLine, mediaPostPath, normalizeMediaFiles, normalizeMediaLicense,
    splitMediaTags, type MediaLicense, type MediaPublication,
} from "@/components/Editor/media-publish";
import { useI18n, type Copy } from "@/lib/i18n";
import type { AdvisorReport, AdvisorSeverity } from "@/lib/security/advisor";

export interface PublishFile {
    id: string;
    name: string;
    lang: string;
    code: string;
}

interface PublishDialogProps {
    open: boolean;
    onClose: () => void;
    signedIn: boolean;
    signInHref: string;
    /** The open files; all of them are selected at first. */
    files: readonly PublishFile[];
    /** Suggested title for a new post (the project's name). */
    defaultTitle: string;
    /** The post this workspace was published as; the dialog then updates it. */
    publication: MediaPublication | null;
    onPublished: (publication: MediaPublication) => void;
    /** The remembered post was deleted or belongs to another account. */
    onPublicationGone: (postId: string) => void;
    /** Asks to unpublish (the editor closes this dialog and confirms first). */
    onUnpublish: () => void;
}

const C = {
    title: { TR: "Media'da yayınla", EN: "Publish on Media" },
    updateTitle: { TR: "Yayını güncelle", EN: "Update the post" },
    description: { TR: "Seçtiğiniz dosyaların anlık bir kopyası Hanogt Media'da herkese açık olarak paylaşılır.", EN: "A snapshot of the files you choose is shared publicly on Hanogt Media." },
    updateDescription: { TR: "Değişiklikler aynı yayına uygulanır; beğeniler ve yorumlar korunur.", EN: "Changes go to the same post; likes and comments are kept." },
    signInText: { TR: "Kodunuzu Media'da yayınlamak için giriş yapın. Açık sekmeleriniz bu tarayıcıda korunur.", EN: "Sign in to publish your code on Media. Your open tabs are kept in this browser." },
    signIn: { TR: "Giriş yap", EN: "Sign in" },
    cancel: { TR: "Vazgeç", EN: "Cancel" },
    close: { TR: "Kapat", EN: "Close" },
    fieldTitle: { TR: "Başlık", EN: "Title" },
    required: { TR: "(zorunlu)", EN: "(required)" },
    titlePlaceholder: { TR: "Örn. Hesap makinesi", EN: "e.g. Calculator" },
    fieldDescription: { TR: "Açıklama", EN: "Description" },
    descriptionPlaceholder: { TR: "Proje ne yapıyor, nasıl çalıştırılır?", EN: "What does the project do, and how is it run?" },
    fieldTags: { TR: "Etiketler", EN: "Tags" },
    tagsHint: { TR: "(virgülle, en fazla 6)", EN: "(comma separated, up to 6)" },
    tagsPlaceholder: { TR: "web, araç, eğitim", EN: "web, tool, education" },
    tagsDropped: { TR: "Yalnızca ilk 6 etiket kullanılır.", EN: "Only the first 6 tags are used." },
    fieldLicense: { TR: "Paylaşım lisansı", EN: "Sharing license" },
    showAuthor: { TR: "Adımı göster", EN: "Show my name" },
    showAuthorHint: { TR: "Kapalıysa yayın “Anonim geliştirici” adıyla görünür. E-posta adresiniz hiçbir durumda yayınlanmaz.", EN: "When off, the post appears as “Anonymous developer”. Your e-mail address is never published." },
    files: { TR: "Dosyalar", EN: "Files" },
    filesSummary: { TR: "{selected}/{total} dosya · {chars} karakter", EN: "{selected} of {total} files · {chars} characters" },
    selectAll: { TR: "Tümünü seç", EN: "Select all" },
    selectNone: { TR: "Hiçbirini seçme", EN: "Select none" },
    lines: { TR: "{count} satır", EN: "{count} lines" },
    fileTooLarge: { TR: "500.000 karakterden büyük", EN: "over 500,000 characters" },
    findingsBadge: { TR: "{count} bulgu", EN: "{count} findings" },
    includeFiles: { TR: "Dosyaları da güncelle", EN: "Also update the files" },
    includeFilesHint: { TR: "Kapalıysa yalnızca başlık, açıklama, etiketler, lisans ve ad tercihi değişir.", EN: "When off, only the title, description, tags, license and name setting change." },
    noneSelected: { TR: "Yayınlamak için en az bir dosya seçin.", EN: "Select at least one file to publish." },
    totalTooLarge: { TR: "Seçili dosyalar toplam 1.000.000 karakter sınırını aşıyor.", EN: "The selected files are over the 1,000,000-character total limit." },
    checkTitle: { TR: "Güvenlik ön kontrolü", EN: "Security pre-check" },
    checkRunning: { TR: "Kod tarayıcınızda inceleniyor…", EN: "Checking the code in your browser…" },
    checkClean: { TR: "Engelleyici bir sorun bulunmadı.", EN: "No blocking issues found." },
    checkFailed: { TR: "Ön kontrol yapılamadı; yayın sırasında sunucu kodu yine de tarar.", EN: "The pre-check couldn't run; the server still scans the code when you publish." },
    checkNote: { TR: "Kontrol tarayıcınızda yapılır; yayın sırasında sunucu aynı güvenlik taramasını tekrarlar.", EN: "The check runs in your browser; the server repeats the same security scan when you publish." },
    blockedTitle: { TR: "Bu kod yayınlanamaz", EN: "This code can't be published" },
    blockedText: { TR: "Hanogt güvenlik koruması aşağıdaki kalıpları herkese açık paylaşımda engeller. İlgili dosyanın seçimini kaldırın veya kodu düzeltin.", EN: "The Hanogt guard blocks the patterns below in public posts. Deselect the file or fix the code." },
    appeal: { TR: "Yanlış alarm olduğunu düşünüyorsanız Geri Bildirim sayfasından inceleme isteyebilirsiniz.", EN: "If you think this is a false alarm, you can ask for a review on the Feedback page." },
    secretsTitle: { TR: "Kodda gizli bilgi olabilir", EN: "The code may contain secrets" },
    secretsText: { TR: "Yayınlanan kodu herkes görebilir. Anahtarları ve parolaları kaldırın; sızdıysa iptal edip yenileyin.", EN: "Anyone can read published code. Remove keys and passwords, and revoke them if they have leaked." },
    secretsAck: { TR: "Gizli bilgileri kontrol ettim; yine de yayınla", EN: "I've checked for secrets; publish anyway" },
    adviceTitle: { TR: "{count} öneri", EN: "{count} suggestions" },
    adviceText: { TR: "Yayını engellemez; kodunuzu iyileştirmek için göz atın.", EN: "They don't block publishing; have a look to improve your code." },
    moreAdvice: { TR: "+{count} öneri daha", EN: "+{count} more" },
    location: { TR: "{file}, satır {line}", EN: "{file}, line {line}" },
    contribute: { TR: "Bu projeyi güvenlik katkısına dahil et", EN: "Include this project in the security contribution" },
    contributeHint: { TR: "Otomatik eğitim yapılmaz; uygunluk ve amaç sınırı insan denetimiyle değerlendirilir.", EN: "There is no automatic training; eligibility and purpose limits are reviewed by people." },
    publish: { TR: "Güvenlik kontrolüyle yayınla", EN: "Publish with a security check" },
    update: { TR: "Yayını güncelle", EN: "Update the post" },
    unpublish: { TR: "Yayından kaldır", EN: "Unpublish" },
    loadingPost: { TR: "Yayın bilgileri yükleniyor…", EN: "Loading the post…" },
    loadFailed: { TR: "Yayın bilgileri yüklenemedi. Güncellemeden önce tekrar deneyin.", EN: "The post details couldn't be loaded. Try again before updating." },
    retry: { TR: "Tekrar dene", EN: "Try again" },
    gone: { TR: "Bu çalışma alanının önceki yayını artık yok; yeni bir yayın oluşturulacak.", EN: "This workspace's earlier post no longer exists; a new post will be created." },
    linked: { TR: "Bağlı yayın: {title}", EN: "Linked post: {title}" },
    view: { TR: "Media'da görüntüle", EN: "View on Media" },
    copyLink: { TR: "Bağlantıyı kopyala", EN: "Copy link" },
    copied: { TR: "Bağlantı kopyalandı", EN: "Link copied" },
    copyFailed: { TR: "Kopyalanamadı", EN: "Couldn't copy" },
    publishedTitle: { TR: "Yayınlandı!", EN: "Published!" },
    updatedTitle: { TR: "Yayın güncellendi", EN: "Post updated" },
    publishedText: { TR: "Projeniz Hanogt Media'da herkese açık. Sonraki değişikliklerinizi “Yayını güncelle” ile aynı yayına gönderebilirsiniz.", EN: "Your project is public on Hanogt Media. Send later changes to the same post with “Update the post”." },
    serverFindings: { TR: "Sunucu taramasının bulguları", EN: "Findings of the server scan" },
    count: { TR: "{value}/{max}", EN: "{value}/{max}" },
} satisfies Record<string, Copy>;

const LICENSES: Record<MediaLicense, { label: Copy; hint: Copy }> = {
    "all-rights-reserved": {
        label: { TR: "Lisans belirtilmedi · tüm haklar saklı", EN: "No license · all rights reserved" },
        hint: { TR: "Kodu herkes okuyabilir ve indirebilir, ancak yeniden kullanma izni verilmez.", EN: "Anyone can read and download the code, but no right to reuse it is granted." },
    },
    MIT: {
        label: { TR: "MIT", EN: "MIT" },
        hint: { TR: "Telif bildirimi korunduğu sürece kod her amaçla kullanılabilir, değiştirilebilir ve dağıtılabilir.", EN: "Anyone may use, change and share the code for any purpose as long as the copyright notice is kept." },
    },
    "Apache-2.0": {
        label: { TR: "Apache 2.0", EN: "Apache 2.0" },
        hint: { TR: "MIT'e benzer; ayrıca açık bir patent izni verir ve değişikliklerin belirtilmesini ister.", EN: "Like MIT, plus an explicit patent grant; changes must be stated." },
    },
    "GPL-3.0": {
        label: { TR: "GPL 3.0", EN: "GPL 3.0" },
        hint: { TR: "Kodu kullanıp dağıtan projeler de aynı lisansla açık kaynak olmalıdır.", EN: "Projects that use and distribute the code must be open source under the same license." },
    },
};

const SEVERITY: Record<AdvisorSeverity, { label: Copy; chip: string }> = {
    critical: { label: { TR: "Kritik", EN: "Critical" }, chip: "bg-red-600 text-white" },
    high: { label: { TR: "Yüksek", EN: "High" }, chip: "bg-orange-500 text-white" },
    medium: { label: { TR: "Orta", EN: "Medium" }, chip: "bg-amber-400 text-amber-950" },
    low: { label: { TR: "Düşük", EN: "Low" }, chip: "bg-sky-500 text-white" },
    info: { label: { TR: "Bilgi", EN: "Info" }, chip: "bg-zinc-400 text-white" },
};
type FormState = { title: string; description: string; tags: string; license: MediaLicense; showAuthor: boolean; contribute: boolean };

const dangerGhost = "me-auto inline-flex items-center justify-center gap-2 rounded-2xl px-3 py-2 text-sm font-medium text-red-600 transition hover:bg-red-50 hover:text-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 disabled:cursor-not-allowed disabled:opacity-50 dark:text-red-400 dark:hover:bg-red-500/10 dark:hover:text-red-300";
const inputClass = "mt-1.5 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-2.5 text-sm text-zinc-900 outline-none transition focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 disabled:opacity-60 dark:border-white/10 dark:bg-zinc-900 dark:text-white";

export default function PublishDialog({ open, onClose, signedIn, signInHref, files, defaultTitle, publication, onPublished, onPublicationGone, onUnpublish }: PublishDialogProps) {
    const { tx, locale } = useI18n();
    const ids = { title: useId(), description: useId(), tags: useId(), license: useId(), showAuthor: useId(), files: useId(), check: useId() };
    const titleRef = useRef<HTMLInputElement>(null);
    // The editor remounts the dialog (key) every time it opens, so these start fresh.
    const [initialPostId] = useState(() => publication?.postId ?? null);
    const [mode, setMode] = useState<"publish" | "update">(initialPostId ? "update" : "publish");
    const [gone, setGone] = useState(false);
    const [remote, setRemote] = useState<{ status: "loading" | "ready" | "error"; consent: boolean }>({ status: "loading", consent: false });
    const [attempt, setAttempt] = useState(0);
    const [form, setForm] = useState<FormState>(() => ({ title: publication?.title || defaultTitle, description: "", tags: "", license: "all-rights-reserved", showAuthor: true, contribute: false }));
    const [selected, setSelected] = useState<Set<string>>(() => new Set(files.filter((file) => fitsMediaFile(file.code)).map((file) => file.id)));
    const [includeFiles, setIncludeFiles] = useState(true);
    const [acknowledged, setAcknowledged] = useState(false);
    const [check, setCheck] = useState<Precheck | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const [failure, setFailure] = useState<{ message: string; findings: CheckFinding[] } | null>(null);
    const [done, setDone] = useState<{ postId: string; mode: "publish" | "update" } | null>(null);
    const [copied, setCopied] = useState<"ok" | "failed" | null>(null);
    const reportCache = useRef(new Map<string, AdvisorReport>());
    const goneRef = useRef(onPublicationGone);
    useEffect(() => {
        goneRef.current = onPublicationGone;
    }, [onPublicationGone]);

    const number = new Intl.NumberFormat(locale);
    const fitting = useMemo(() => new Set(files.filter((file) => fitsMediaFile(file.code)).map((file) => file.id)), [files]);
    const sendsFiles = mode === "publish" || includeFiles;
    const chosenFiles = useMemo(() => files.filter((file) => selected.has(file.id) && fitting.has(file.id)), [files, selected, fitting]);
    const checkFiles = useMemo(() => (sendsFiles ? chosenFiles : []), [sendsFiles, chosenFiles]);
    const checkKey = precheckKey(checkFiles);
    const totalChars = chosenFiles.reduce((sum, file) => sum + file.code.length, 0);
    const limitError = useMemo(() => {
        if (!checkFiles.length) return null;
        const result = normalizeMediaFiles(checkFiles.map(({ name, lang, code }) => ({ name, lang, code })));
        return result.ok ? null : result.error;
    }, [checkFiles]);
    const lookupPostId = mode === "update" ? initialPostId : null;

    // The viewer's research consent and, when updating, the post's current details.
    useEffect(() => {
        if (!open || !signedIn) return;
        const controller = new AbortController();
        fetchMediaViewer(lookupPostId, controller.signal).then((data) => {
            if (lookupPostId) {
                if (data.post && !data.viewer.signedIn) {
                    // The server session lapsed: ownership can't be checked, so nothing is forgotten.
                    setRemote((current) => ({ ...current, status: "error" }));
                    return;
                }
                if (!data.post || !data.post.owned) {
                    setMode("publish");
                    setGone(true);
                    goneRef.current(lookupPostId);
                } else {
                    const post = data.post;
                    setForm((current) => ({ ...current, title: post.title, description: post.description, tags: post.tags.join(", "), license: normalizeMediaLicense(post.license), showAuthor: post.showAuthor }));
                }
            }
            setRemote({ status: "ready", consent: data.viewer.securityResearchConsent });
        }).catch(() => {
            if (!controller.signal.aborted) setRemote((current) => ({ ...current, status: "error" }));
        });
        return () => controller.abort();
    }, [open, signedIn, lookupPostId, attempt]);

    // Re-checks shortly after the selection changes; reports are cached per file.
    useEffect(() => {
        if (!open || !signedIn || !checkFiles.length) return;
        let cancelled = false;
        const timer = window.setTimeout(() => {
            runPrecheck(checkFiles, reportCache.current)
                .then((result) => {
                    if (!cancelled) setCheck(result);
                })
                .catch(() => {
                    if (!cancelled) setCheck(failedPrecheck(checkFiles));
                });
        }, 60);
        return () => {
            cancelled = true;
            window.clearTimeout(timer);
        };
    }, [open, signedIn, checkFiles]);

    const result = check && check.key === checkKey ? check : null;
    const checking = sendsFiles && checkFiles.length > 0 && !result;
    const title = cleanMediaTitle(form.title);
    const typedTags = splitMediaTags(form.tags);
    const tags = cleanMediaTags(typedTags);
    const updateNeedsDetails = mode === "update" && remote.status !== "ready";
    const filesReady = !sendsFiles || (checkFiles.length > 0 && !limitError && Boolean(result) && !result?.blocked.length && (!result?.secrets.length || acknowledged));
    const canSubmit = signedIn && !submitting && Boolean(title) && filesReady && !updateNeedsDetails;

    const toggleFile = (id: string, on: boolean) => setSelected((current) => {
        const next = new Set(current);
        if (on) next.add(id);
        else next.delete(id);
        return next;
    });

    const submit = async () => {
        if (!canSubmit) return;
        setSubmitting(true);
        setFailure(null);
        const sent = sendsFiles ? checkFiles.map(({ name, lang, code }) => ({ name, lang, code })) : null;
        const fields = { title, description: form.description, tags, license: form.license, showAuthor: form.showAuthor };
        try {
            let postId: string;
            if (mode === "update" && initialPostId) {
                await mediaAction({ action: "update", postId: initialPostId, ...fields, ...(sent ? { files: sent } : {}) });
                postId = initialPostId;
            } else {
                const data = await mediaAction<{ id: string }>({ action: "publishFiles", ...fields, files: sent ?? [], contribute: remote.consent && form.contribute });
                postId = data.id;
            }
            onPublished({ postId, title, at: new Date().toISOString() });
            setDone({ postId, mode });
        } catch (error) {
            if (mode === "update" && initialPostId && error instanceof MediaApiError && (error.code === "not_found" || error.code === "forbidden")) {
                setMode("publish");
                setGone(true);
                goneRef.current(initialPostId);
            }
            const findings = error instanceof MediaApiError && sent ? error.details.map((detail, index) => {
                const place = detail.line ? locateScanLine(sent, detail.line) : null;
                const severity: AdvisorSeverity = detail.severity === "critical" || detail.severity === "high" || detail.severity === "medium" ? detail.severity : "high";
                return { key: `server:${index}`, severity, title: GUARD_TITLE, detail: { TR: detail.message, EN: detail.message }, file: place ? sent[place.index].name : "", line: Math.max(1, place?.line ?? 1) };
            }) : [];
            setFailure({ message: mediaErrorText(error, tx), findings });
        } finally {
            setSubmitting(false);
        }
    };

    const copyLink = async (postId: string) => {
        try {
            await navigator.clipboard.writeText(new URL(mediaPostPath(postId), window.location.origin).href);
            setCopied("ok");
        } catch {
            setCopied("failed");
        }
        window.setTimeout(() => setCopied(null), 1800);
    };

    const findingRow = (finding: CheckFinding, showFix: boolean) => (
        <li key={finding.key} className="py-1.5">
            <div className="flex flex-wrap items-center gap-1.5">
                <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold ${SEVERITY[finding.severity].chip}`}>{tx(SEVERITY[finding.severity].label)}</span>
                <span className="font-semibold">{tx(finding.title)}</span>
                {finding.file && <span className="text-zinc-500 dark:text-zinc-400">· {tx(C.location, { file: finding.file, line: finding.line })}</span>}
            </div>
            <p className="mt-0.5 text-zinc-600 dark:text-zinc-300">{tx(finding.detail)}</p>
            {showFix && finding.fix && <p className="mt-0.5 text-zinc-500 dark:text-zinc-400">{tx(finding.fix)}</p>}
        </li>
    );

    // ------------------------------------------------------------------ signed out
    if (!signedIn) {
        return (
            <Modal
                open={open}
                onClose={onClose}
                size="sm"
                icon={<Send className="h-5 w-5" aria-hidden />}
                title={tx(C.title)}
                footer={(
                    <>
                        <button type="button" className={buttonClasses.ghost} onClick={onClose}>{tx(C.cancel)}</button>
                        <Link href={signInHref} className={buttonClasses.primary}>
                            <LogIn className="h-4 w-4" aria-hidden />
                            {tx(C.signIn)}
                        </Link>
                    </>
                )}
            >
                <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-300">{tx(C.signInText)}</p>
            </Modal>
        );
    }

    // ------------------------------------------------------------------ done
    if (done) {
        return (
            <Modal
                open={open}
                onClose={onClose}
                size="sm"
                icon={<CheckCircle2 className="h-5 w-5" aria-hidden />}
                title={tx(done.mode === "update" ? C.updatedTitle : C.publishedTitle)}
                footer={<button type="button" className={buttonClasses.primary} onClick={onClose}>{tx(C.close)}</button>}
            >
                <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-300">{tx(C.publishedText)}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                    <a href={mediaPostPath(done.postId)} target="_blank" rel="noopener noreferrer" className={buttonClasses.secondary}>
                        <ExternalLink className="h-4 w-4" aria-hidden />
                        {tx(C.view)}
                    </a>
                    <button type="button" className={buttonClasses.secondary} onClick={() => void copyLink(done.postId)}>
                        {copied === "ok" ? <CheckCircle2 className="h-4 w-4 text-emerald-500" aria-hidden /> : <ClipboardCopy className="h-4 w-4" aria-hidden />}
                        {tx(copied === "ok" ? C.copied : copied === "failed" ? C.copyFailed : C.copyLink)}
                    </button>
                </div>
                <p className="sr-only" aria-live="polite">{copied === "ok" ? tx(C.copied) : copied === "failed" ? tx(C.copyFailed) : ""}</p>
            </Modal>
        );
    }

    // ------------------------------------------------------------------ form
    const updating = mode === "update";
    const disabledForm = updating && remote.status !== "ready";
    const licenseHint = LICENSES[form.license].hint;
    const section = (labelId: string, label: ReactNode, children: ReactNode, extra?: ReactNode) => (
        <section aria-labelledby={labelId} className="rounded-2xl border border-zinc-200 p-3 dark:border-white/10">
            <div className="mb-2 flex flex-wrap items-center gap-2">
                <h3 id={labelId} className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">{label}</h3>
                {extra}
            </div>
            {children}
        </section>
    );

    return (
        <Modal
            open={open}
            onClose={onClose}
            size="lg"
            icon={<Send className="h-5 w-5" aria-hidden />}
            title={tx(updating ? C.updateTitle : C.title)}
            description={tx(updating ? C.updateDescription : C.description)}
            initialFocus={updating ? undefined : titleRef}
            footer={(
                <>
                    {updating && (
                        <button type="button" className={dangerGhost} onClick={onUnpublish} disabled={submitting}>
                            <Trash2 className="h-4 w-4" aria-hidden />
                            {tx(C.unpublish)}
                        </button>
                    )}
                    <button type="button" className={buttonClasses.ghost} onClick={onClose}>{tx(C.cancel)}</button>
                    <button type="button" className={buttonClasses.primary} onClick={() => void submit()} disabled={!canSubmit} aria-describedby={ids.check}>
                        {submitting ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden /> : updating ? <RefreshCw className="h-4 w-4" aria-hidden /> : <ShieldCheck className="h-4 w-4" aria-hidden />}
                        {tx(updating ? C.update : C.publish)}
                    </button>
                </>
            )}
        >
            <div className="space-y-4">
                {updating && (
                    <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-indigo-500/10 px-3 py-2 text-sm text-indigo-900 dark:text-indigo-100">
                        <Info className="h-4 w-4 shrink-0" aria-hidden />
                        <span className="min-w-0 flex-1 truncate">{tx(C.linked, { title: publication?.title || form.title })}</span>
                        {initialPostId && (
                            <a href={mediaPostPath(initialPostId)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold hover:underline">
                                {tx(C.view)}
                                <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                            </a>
                        )}
                    </div>
                )}
                {gone && <p role="status" className="flex items-start gap-2 rounded-2xl bg-amber-500/10 px-3 py-2 text-sm text-amber-900 dark:text-amber-100"><Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />{tx(C.gone)}</p>}
                {updating && remote.status === "loading" && <p role="status" className="flex items-center gap-2 text-sm text-zinc-500"><LoaderCircle className="h-4 w-4 animate-spin" aria-hidden />{tx(C.loadingPost)}</p>}
                {updating && remote.status === "error" && (
                    <div role="alert" className="flex flex-wrap items-center gap-2 rounded-2xl bg-red-500/10 px-3 py-2 text-sm text-red-800 dark:text-red-200">
                        <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
                        <span className="min-w-0 flex-1">{tx(C.loadFailed)}</span>
                        <button type="button" className="font-semibold hover:underline" onClick={() => { setRemote((current) => ({ ...current, status: "loading" })); setAttempt((value) => value + 1); }}>{tx(C.retry)}</button>
                    </div>
                )}

                <div className="grid gap-3">
                    <div>
                        <label htmlFor={ids.title} className="flex items-baseline justify-between gap-2 text-sm font-medium text-zinc-700 dark:text-zinc-200">
                            <span>{tx(C.fieldTitle)} <span className="font-normal text-zinc-400">{tx(C.required)}</span></span>
                            <span className="text-[11px] font-normal tabular-nums text-zinc-400">{tx(C.count, { value: form.title.length, max: MEDIA_LIMITS.title })}</span>
                        </label>
                        <input ref={titleRef} id={ids.title} value={form.title} maxLength={MEDIA_LIMITS.title} disabled={disabledForm} required placeholder={tx(C.titlePlaceholder)} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} className={inputClass} />
                    </div>
                    <div>
                        <label htmlFor={ids.description} className="flex items-baseline justify-between gap-2 text-sm font-medium text-zinc-700 dark:text-zinc-200">
                            <span>{tx(C.fieldDescription)}</span>
                            <span className="text-[11px] font-normal tabular-nums text-zinc-400">{tx(C.count, { value: form.description.length, max: MEDIA_LIMITS.description })}</span>
                        </label>
                        <textarea id={ids.description} value={form.description} maxLength={MEDIA_LIMITS.description} rows={3} disabled={disabledForm} placeholder={tx(C.descriptionPlaceholder)} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} className={`${inputClass} resize-y`} />
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                        <div>
                            <label htmlFor={ids.tags} className="text-sm font-medium text-zinc-700 dark:text-zinc-200">{tx(C.fieldTags)} <span className="font-normal text-zinc-400">{tx(C.tagsHint)}</span></label>
                            <input id={ids.tags} value={form.tags} maxLength={300} disabled={disabledForm} placeholder={tx(C.tagsPlaceholder)} onChange={(event) => setForm((current) => ({ ...current, tags: event.target.value }))} className={inputClass} />
                            {tags.length > 0 && (
                                <ul className="mt-1.5 flex flex-wrap gap-1" aria-label={tx(C.fieldTags)}>
                                    {tags.map((tag) => <li key={tag} className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600 dark:bg-white/10 dark:text-zinc-300">#{tag}</li>)}
                                </ul>
                            )}
                            {typedTags.length > MEDIA_LIMITS.tags && <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">{tx(C.tagsDropped)}</p>}
                        </div>
                        <div>
                            <label htmlFor={ids.license} className="text-sm font-medium text-zinc-700 dark:text-zinc-200">{tx(C.fieldLicense)}</label>
                            <select id={ids.license} value={form.license} disabled={disabledForm} aria-describedby={`${ids.license}-hint`} onChange={(event) => setForm((current) => ({ ...current, license: normalizeMediaLicense(event.target.value) }))} className={inputClass}>
                                {MEDIA_LICENSES.map((license) => <option key={license} value={license}>{tx(LICENSES[license].label)}</option>)}
                            </select>
                            <p id={`${ids.license}-hint`} className="mt-1 text-xs leading-5 text-zinc-500 dark:text-zinc-400">{tx(licenseHint)}</p>
                        </div>
                    </div>
                    <label htmlFor={ids.showAuthor} className="flex cursor-pointer items-start gap-3 rounded-2xl bg-zinc-50 p-3 dark:bg-white/5">
                        <input id={ids.showAuthor} type="checkbox" role="switch" checked={form.showAuthor} disabled={disabledForm} onChange={(event) => setForm((current) => ({ ...current, showAuthor: event.target.checked }))} className="mt-0.5 h-4 w-4 accent-indigo-600" />
                        <span>
                            <span className="block text-sm font-semibold text-zinc-800 dark:text-zinc-100">{tx(C.showAuthor)}</span>
                            <span className="text-xs leading-5 text-zinc-500 dark:text-zinc-400">{tx(C.showAuthorHint)}</span>
                        </span>
                    </label>
                </div>

                {section(ids.files, tx(C.files), (
                    <>
                        {updating && (
                            <label className="mb-2 flex cursor-pointer items-start gap-3 text-sm">
                                <input type="checkbox" checked={includeFiles} onChange={(event) => setIncludeFiles(event.target.checked)} className="mt-0.5 h-4 w-4 accent-indigo-600" />
                                <span>
                                    <span className="block font-medium text-zinc-800 dark:text-zinc-100">{tx(C.includeFiles)}</span>
                                    <span className="text-xs text-zinc-500 dark:text-zinc-400">{tx(C.includeFilesHint)}</span>
                                </span>
                            </label>
                        )}
                        <ul className={`max-h-52 divide-y divide-zinc-100 overflow-y-auto rounded-xl border border-zinc-100 [scrollbar-width:thin] dark:divide-white/5 dark:border-white/5 ${sendsFiles ? "" : "opacity-50"}`}>
                            {files.map((file) => {
                                const fits = fitting.has(file.id);
                                const findings = result?.perFile[file.id];
                                return (
                                    <li key={file.id}>
                                        <label className={`flex items-center gap-2.5 px-3 py-2 text-sm ${fits && sendsFiles ? "cursor-pointer hover:bg-zinc-50 dark:hover:bg-white/5" : "cursor-not-allowed"}`}>
                                            <input type="checkbox" checked={fits && selected.has(file.id)} disabled={!fits || !sendsFiles} onChange={(event) => toggleFile(file.id, event.target.checked)} className="h-4 w-4 shrink-0 accent-indigo-600" />
                                            <LanguageIcon language={file.lang} size={16} />
                                            <span className="min-w-0 flex-1 truncate font-medium text-zinc-800 dark:text-zinc-100">{file.name}</span>
                                            {findings && selected.has(file.id) && (
                                                <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-bold ${SEVERITY[findings.worst].chip}`}>{tx(C.findingsBadge, { count: findings.count })}</span>
                                            )}
                                            <span className="hidden shrink-0 text-xs tabular-nums text-zinc-400 min-[420px]:inline">{fits ? tx(C.lines, { count: number.format(file.code.split("\n").length) }) : tx(C.fileTooLarge)}</span>
                                        </label>
                                    </li>
                                );
                            })}
                        </ul>
                        {sendsFiles && !checkFiles.length && <p className="mt-2 text-xs font-medium text-red-600 dark:text-red-400">{tx(C.noneSelected)}</p>}
                        {limitError === "total_too_large" && <p className="mt-2 text-xs font-medium text-red-600 dark:text-red-400">{tx(C.totalTooLarge)}</p>}
                    </>
                ), (
                    <>
                        <span className="text-xs tabular-nums text-zinc-500 dark:text-zinc-400">{tx(C.filesSummary, { selected: chosenFiles.length, total: files.length, chars: number.format(totalChars) })}</span>
                        <span className="ms-auto flex gap-1">
                            <button type="button" disabled={!sendsFiles} onClick={() => setSelected(new Set(fitting))} className="rounded-lg px-2 py-1 text-xs font-semibold text-indigo-600 hover:bg-indigo-500/10 disabled:opacity-40 dark:text-indigo-300">{tx(C.selectAll)}</button>
                            <button type="button" disabled={!sendsFiles} onClick={() => setSelected(new Set())} className="rounded-lg px-2 py-1 text-xs font-semibold text-zinc-500 hover:bg-zinc-100 disabled:opacity-40 dark:text-zinc-400 dark:hover:bg-white/10">{tx(C.selectNone)}</button>
                        </span>
                    </>
                ))}

                {sendsFiles && checkFiles.length > 0 && section(ids.check, tx(C.checkTitle), (
                    <div aria-live="polite" className="space-y-3 text-sm">
                        {checking && <p className="flex items-center gap-2 text-zinc-500"><LoaderCircle className="h-4 w-4 animate-spin" aria-hidden />{tx(C.checkRunning)}</p>}
                        {result?.failed && <p className="flex items-start gap-2 text-zinc-600 dark:text-zinc-300"><Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />{tx(C.checkFailed)}</p>}
                        {result && !result.failed && !result.blocked.length && !result.secrets.length && (
                            <p className="flex items-center gap-2 font-medium text-emerald-700 dark:text-emerald-300"><ShieldCheck className="h-4 w-4" aria-hidden />{tx(C.checkClean)}</p>
                        )}
                        {result && result.blocked.length > 0 && (
                            <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-900 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-100">
                                <p className="flex items-center gap-2 text-sm font-bold"><ShieldAlert className="h-4 w-4" aria-hidden />{tx(C.blockedTitle)}</p>
                                <p className="mt-1">{tx(C.blockedText)}</p>
                                <ul className="mt-1 divide-y divide-red-200/60 dark:divide-red-900/40">{result.blocked.map((finding) => findingRow(finding, false))}</ul>
                                <p className="mt-1 opacity-80">{tx(C.appeal)}</p>
                            </div>
                        )}
                        {result && result.secrets.length > 0 && (
                            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100">
                                <p className="flex items-center gap-2 text-sm font-bold"><AlertTriangle className="h-4 w-4" aria-hidden />{tx(C.secretsTitle)}</p>
                                <p className="mt-1">{tx(C.secretsText)}</p>
                                <ul className="mt-1 divide-y divide-amber-200/60 dark:divide-amber-900/40">{result.secrets.map((finding) => findingRow(finding, true))}</ul>
                                <label className="mt-2 flex cursor-pointer items-center gap-2 text-sm font-semibold">
                                    <input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} className="h-4 w-4 accent-amber-600" />
                                    {tx(C.secretsAck)}
                                </label>
                            </div>
                        )}
                        {result && result.advice.length > 0 && (
                            <details className="rounded-xl border border-zinc-200 p-3 text-xs dark:border-white/10">
                                <summary className="cursor-pointer text-sm font-semibold text-zinc-700 dark:text-zinc-200">
                                    {tx(C.adviceTitle, { count: result.advice.length })} <span className="font-normal text-zinc-500 dark:text-zinc-400">· {tx(C.adviceText)}</span>
                                </summary>
                                <ul className="mt-1 divide-y divide-zinc-100 dark:divide-white/5">{result.advice.slice(0, 20).map((finding) => findingRow(finding, true))}</ul>
                                {result.advice.length > 20 && <p className="mt-1 text-zinc-500">{tx(C.moreAdvice, { count: result.advice.length - 20 })}</p>}
                            </details>
                        )}
                        <p className="text-xs text-zinc-500 dark:text-zinc-400">{tx(C.checkNote)}</p>
                    </div>
                ))}

                {!updating && remote.consent && (
                    <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-900 dark:bg-emerald-950/30">
                        <input type="checkbox" checked={form.contribute} onChange={(event) => setForm((current) => ({ ...current, contribute: event.target.checked }))} className="mt-0.5 h-4 w-4 accent-emerald-600" />
                        <span>
                            <span className="block text-sm font-semibold text-emerald-900 dark:text-emerald-100">{tx(C.contribute)}</span>
                            <span className="text-xs leading-5 text-emerald-800 dark:text-emerald-200">{tx(C.contributeHint)}</span>
                        </span>
                    </label>
                )}

                {failure && (
                    <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-900 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-100">
                        <p className="flex items-start gap-2 font-semibold"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />{failure.message}</p>
                        {failure.findings.length > 0 && (
                            <>
                                <p className="mt-2 text-xs font-semibold">{tx(C.serverFindings)}</p>
                                <ul className="text-xs">{failure.findings.map((finding) => findingRow(finding, false))}</ul>
                                <p className="mt-1 text-xs opacity-80">{tx(C.appeal)}</p>
                            </>
                        )}
                    </div>
                )}
                <p id={ids.check} className="sr-only">{result?.blocked.length ? tx(C.blockedTitle) : result?.secrets.length && !acknowledged ? tx(C.secretsTitle) : ""}</p>
            </div>
        </Modal>
    );
}
