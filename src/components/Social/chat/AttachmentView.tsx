"use client";

import { Download, FileArchive, FileAudio, FileText, FileVideo, ImageOff, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cx } from "@/components/Groups/ui";
import { useI18n, type Copy } from "@/lib/i18n";
import { attachmentUrl, formatBytes, type MessageAttachment } from "@/lib/social/attachments";
import type { MessageUpload } from "@/lib/social/model";

const C = {
    open: { TR: "{name} görselini büyüt", EN: "Open the picture {name}" },
    download: { TR: "{name} dosyasını indir", EN: "Download {name}" },
    downloadShort: { TR: "İndir", EN: "Download" },
    close: { TR: "Kapat", EN: "Close" },
    viewer: { TR: "Görsel: {name}", EN: "Picture: {name}" },
    sending: { TR: "Gönderiliyor %{percent}", EN: "Sending {percent}%" },
    preview: { TR: "Önizle", EN: "Preview" },
    hidePreview: { TR: "Önizlemeyi gizle", EN: "Hide preview" },
    previewLoading: { TR: "Yükleniyor…", EN: "Loading…" },
    previewFailed: { TR: "Önizleme açılamadı.", EN: "The preview couldn't be opened." },
    previewCut: { TR: "İlk {lines} satır gösteriliyor; tamamı için dosyayı indir.", EN: "Showing the first {lines} lines; download the file for all of it." },
    unavailable: { TR: "Dosya açılamadı veya silinmiş.", EN: "The file couldn't be opened or was deleted." },
    kindPdf: { TR: "PDF", EN: "PDF" },
    kindArchive: { TR: "Arşiv", EN: "Archive" },
    kindText: { TR: "Metin", EN: "Text" },
    kindAudio: { TR: "Ses", EN: "Audio" },
    kindVideo: { TR: "Video", EN: "Video" },
    kindImage: { TR: "Görsel", EN: "Picture" },
} satisfies Record<string, Copy>;

const KIND_LABEL = { pdf: C.kindPdf, archive: C.kindArchive, text: C.kindText, audio: C.kindAudio, video: C.kindVideo, image: C.kindImage } as const;
/** Lines a text preview shows. */
const PREVIEW_LINES = 300;
/** Bytes a text preview reads at most. */
const PREVIEW_BYTES = 200_000;

/** The size a picture takes in the chat: at most 360 × 320, its proportions kept. */
function shownSize(file: MessageAttachment) {
    if (!file.width || !file.height) return null;
    const scale = Math.min(1, 360 / file.width, 320 / file.height);
    return { width: Math.max(48, Math.round(file.width * scale)), height: Math.max(48, Math.round(file.height * scale)) };
}

/**
 * A file in a message: pictures in the chat (a click opens them big),
 * video and sound with the browser's player, anything else as a card with
 * its name, size and a download button, where text and code files can also
 * be previewed. While it goes up, a progress bar shows how far it got.
 */
export default function AttachmentView({ file, upload, className }: { file: MessageAttachment; upload?: MessageUpload | null; className?: string }) {
    const sending = Boolean(upload);
    if (file.kind === "image") return <ImageAttachment file={file} upload={upload ?? null} className={className} />;
    if (!sending && file.kind === "video") {
        return (
            <div className={cx("max-w-[360px]", className)}>
                <video controls preload="metadata" playsInline src={attachmentUrl(file.id)} className="max-h-80 w-full rounded-lg bg-black" aria-label={file.name} />
                <FileLine file={file} />
            </div>
        );
    }
    if (!sending && file.kind === "audio") {
        return (
            <div className={cx("w-80 max-w-full rounded-xl border border-zinc-200 bg-white p-2.5 dark:border-white/10 dark:bg-zinc-900", className)}>
                <FileLine file={file} />
                <audio controls preload="none" src={attachmentUrl(file.id)} className="mt-2 w-full" aria-label={file.name} />
            </div>
        );
    }
    return <FileCard file={file} upload={upload ?? null} className={className} />;
}

function ProgressBar({ upload }: { upload: MessageUpload }) {
    const { tx } = useI18n();
    const percent = Math.round(upload.progress * 100);
    return (
        <div className="w-full" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-label={tx(C.sending, { percent })}>
            <div className="h-1.5 overflow-hidden rounded-full bg-zinc-200 dark:bg-white/10">
                <div className="h-full rounded-full bg-indigo-500 transition-[width] duration-200" style={{ width: `${Math.max(4, percent)}%` }} />
            </div>
            <p className="mt-1 text-[11px] tabular-nums text-zinc-500 dark:text-zinc-400">{tx(C.sending, { percent })}</p>
        </div>
    );
}

function FileLine({ file }: { file: MessageAttachment }) {
    const { tx, language } = useI18n();
    return (
        <p className="mt-1 flex min-w-0 items-center gap-1.5 text-[12px] text-zinc-500 dark:text-zinc-400">
            <span className="min-w-0 truncate font-medium text-zinc-700 dark:text-zinc-200" title={file.name}>{file.name}</span>
            <span className="shrink-0 tabular-nums">· {formatBytes(file.size, language)}</span>
            <a href={attachmentUrl(file.id, true)} download={file.name} className="ms-auto shrink-0 rounded p-0.5 text-zinc-500 transition hover:text-indigo-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:hover:text-indigo-300" aria-label={tx(C.download, { name: file.name })} title={tx(C.downloadShort)}>
                <Download className="h-4 w-4" aria-hidden />
            </a>
        </p>
    );
}

function ImageAttachment({ file, upload, className }: { file: MessageAttachment; upload: MessageUpload | null; className?: string }) {
    const { tx } = useI18n();
    const [state, setState] = useState<"loading" | "ready" | "failed">("loading");
    const [open, setOpen] = useState(false);
    const buttonRef = useRef<HTMLButtonElement | null>(null);
    const size = shownSize(file);
    const source = upload?.preview ?? (upload ? null : attachmentUrl(file.id));
    if (state === "failed" || !source) {
        return upload ? <FileCard file={file} upload={upload} className={className} /> : (
            <p className={cx("inline-flex items-center gap-2 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-500 dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-400", className)}>
                <ImageOff className="h-4 w-4" aria-hidden />{tx(C.unavailable)}
            </p>
        );
    }
    return (
        <div className={cx("relative max-w-full", className)} style={size ? { width: size.width } : { maxWidth: 360 }}>
            <button
                ref={buttonRef}
                type="button"
                onClick={() => !upload && setOpen(true)}
                disabled={Boolean(upload)}
                aria-label={tx(C.open, { name: file.name })}
                className="group block w-full overflow-hidden rounded-xl bg-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:bg-zinc-800"
                style={size ? { aspectRatio: `${size.width} / ${size.height}` } : { minHeight: 120 }}
            >
                {/* eslint-disable-next-line @next/next/no-img-element -- served by /api/social/files after an access check (or a local blob: picture while sending) */}
                <img
                    src={source}
                    alt={file.name}
                    loading="lazy"
                    decoding="async"
                    onLoad={() => setState("ready")}
                    onError={() => setState("failed")}
                    className={cx("h-full w-full object-cover transition duration-300 group-hover:brightness-95", state === "ready" ? "opacity-100" : "opacity-0")}
                />
                {state === "loading" && <span className="absolute inset-0 animate-pulse rounded-xl bg-zinc-200 dark:bg-zinc-800" aria-hidden />}
            </button>
            {upload && (
                <div className="absolute inset-x-2 bottom-2 rounded-lg bg-white/90 px-2 py-1.5 shadow dark:bg-zinc-900/90">
                    <ProgressBar upload={upload} />
                </div>
            )}
            {open && <ImageViewer file={file} onClose={() => {
                setOpen(false);
                buttonRef.current?.focus();
            }} />}
        </div>
    );
}

/** The picture big, over everything (Escape or a click outside closes it). */
function ImageViewer({ file, onClose }: { file: MessageAttachment; onClose: () => void }) {
    const { tx, language } = useI18n();
    const closeRef = useRef<HTMLButtonElement | null>(null);
    useEffect(() => {
        closeRef.current?.focus();
        const onKey = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                event.stopPropagation();
                onClose();
            }
        };
        document.addEventListener("keydown", onKey);
        const overflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => {
            document.removeEventListener("keydown", onKey);
            document.body.style.overflow = overflow;
        };
    }, [onClose]);
    return createPortal(
        <div role="dialog" aria-modal="true" aria-label={tx(C.viewer, { name: file.name })} className="fixed inset-0 z-[160] flex flex-col bg-zinc-950/95 text-white" onClick={onClose}>
            <div className="flex items-center gap-3 px-4 py-3" onClick={(event) => event.stopPropagation()}>
                <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{file.name}</span>
                    <span className="block text-xs tabular-nums text-zinc-400">{formatBytes(file.size, language)}{file.width && file.height ? ` · ${file.width}×${file.height}` : ""}</span>
                </span>
                <a href={attachmentUrl(file.id, true)} download={file.name} className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-sm font-semibold transition hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60">
                    <Download className="h-4 w-4" aria-hidden />{tx(C.downloadShort)}
                </a>
                <button ref={closeRef} type="button" onClick={onClose} className="rounded-full p-2 transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60" aria-label={tx(C.close)} title={tx(C.close)}>
                    <X className="h-5 w-5" aria-hidden />
                </button>
            </div>
            <div className="flex min-h-0 flex-1 items-center justify-center p-4 pt-0">
                {/* eslint-disable-next-line @next/next/no-img-element -- served by /api/social/files after an access check */}
                <img src={attachmentUrl(file.id)} alt={file.name} className="max-h-full max-w-full rounded-lg object-contain shadow-2xl motion-safe:animate-rise" onClick={(event) => event.stopPropagation()} />
            </div>
        </div>,
        document.body,
    );
}

function FileCard({ file, upload, className }: { file: MessageAttachment; upload: MessageUpload | null; className?: string }) {
    const { tx, language } = useI18n();
    const [preview, setPreview] = useState<{ open: boolean; text: string | null; cut: boolean; failed: boolean }>({ open: false, text: null, cut: false, failed: false });
    const Icon = file.kind === "video" ? FileVideo : file.kind === "audio" ? FileAudio : file.kind === "archive" ? FileArchive : FileText;
    const canPreview = file.kind === "text" && !upload;

    const togglePreview = async () => {
        if (preview.open) {
            setPreview((current) => ({ ...current, open: false }));
            return;
        }
        setPreview((current) => ({ ...current, open: true }));
        if (preview.text !== null) return;
        try {
            const response = await fetch(attachmentUrl(file.id), { headers: { Range: `bytes=0-${PREVIEW_BYTES - 1}` }, credentials: "same-origin" });
            if (!response.ok) throw new Error(String(response.status));
            const text = new TextDecoder("utf-8").decode(await response.arrayBuffer());
            const lines = text.split(/\r?\n/);
            setPreview({ open: true, text: lines.slice(0, PREVIEW_LINES).join("\n"), cut: lines.length > PREVIEW_LINES || file.size > PREVIEW_BYTES, failed: false });
        } catch {
            setPreview({ open: true, text: null, cut: false, failed: true });
        }
    };

    return (
        <div className={cx("w-80 max-w-full rounded-xl border border-zinc-200 bg-white dark:border-white/10 dark:bg-zinc-900", className)}>
            <div className="flex items-center gap-3 p-2.5">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-300"><Icon className="h-5 w-5" aria-hidden /></span>
                <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100" title={file.name}>{file.name}</span>
                    <span className="block text-[12px] tabular-nums text-zinc-500 dark:text-zinc-400">{formatBytes(file.size, language)} · {tx(KIND_LABEL[file.kind])}</span>
                </span>
                {!upload && (
                    <a href={attachmentUrl(file.id, true)} download={file.name} className="shrink-0 rounded-lg p-2 text-zinc-500 transition hover:bg-zinc-100 hover:text-indigo-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:text-zinc-400 dark:hover:bg-white/10 dark:hover:text-indigo-300" aria-label={tx(C.download, { name: file.name })} title={tx(C.downloadShort)}>
                        <Download className="h-5 w-5" aria-hidden />
                    </a>
                )}
            </div>
            {upload && <div className="px-2.5 pb-2.5"><ProgressBar upload={upload} /></div>}
            {canPreview && (
                <div className="border-t border-zinc-100 px-2.5 py-1.5 dark:border-white/[0.06]">
                    <button type="button" onClick={() => void togglePreview()} aria-expanded={preview.open} className="text-[12px] font-semibold text-indigo-600 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:text-indigo-300">
                        {tx(preview.open ? C.hidePreview : C.preview)}
                    </button>
                    {preview.open && (
                        preview.failed ? <p className="mt-1 text-[12px] text-red-600 dark:text-red-400">{tx(C.previewFailed)}</p>
                            : preview.text === null ? <p className="mt-1 text-[12px] text-zinc-500">{tx(C.previewLoading)}</p>
                                : (
                                    <>
                                        <pre className="scrollbar-thin mt-1.5 max-h-72 overflow-auto rounded-lg bg-zinc-950 p-2.5 font-mono text-[12px] leading-5 text-zinc-100" dir="ltr"><code>{preview.text}</code></pre>
                                        {preview.cut && <p className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">{tx(C.previewCut, { lines: PREVIEW_LINES })}</p>}
                                    </>
                                )
                    )}
                </div>
            )}
        </div>
    );
}
