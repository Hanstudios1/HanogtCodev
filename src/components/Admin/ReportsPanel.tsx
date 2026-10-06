"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Check, Code2, Download, FileWarning, Flag, Heart, MessageCircle, RefreshCw, RotateCcw, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useI18n, type Copy } from "@/lib/i18n";
import { adminPost, adminRequest, type ApiFailure } from "./api";
import { CATEGORY_COPY, COMMON } from "./copy";
import { useCounters } from "./counters";
import { useAdminPages } from "./hooks";
import {
    MODERATOR_NOTE_MAX, type AdminReport, type AdminReportActionResponse, type AdminReportPostFiles, type AdminReportsResponse, type ReportCategory,
} from "./types";
import {
    Badge, Button, ConfirmDialog, Dialog, EmptyState, ErrorNotice, FilterChips, LoadMore, LoadingRows, RelativeTime, Spinner, TextArea,
    cx, useErrorText, useToast,
} from "./ui";
import { CATEGORY_TONES } from "./tones";

const CATEGORIES: ReportCategory[] = ["malware", "copyright", "personal_data", "spam", "other"];

const RESOLUTION_COPY: Record<string, Copy> = {
    resolved: { TR: "Çözüldü", EN: "Resolved" },
    dismissed: { TR: "Reddedildi", EN: "Dismissed" },
    content_removed: { TR: "İçerik kaldırıldı", EN: "Content removed" },
};

const POST_STATUS_COPY: Record<string, Copy> = {
    published: { TR: "Yayında", EN: "Published" },
    hidden: { TR: "Gizli", EN: "Hidden" },
    draft: { TR: "Taslak", EN: "Draft" },
};

function byNewest(a: AdminReport, b: AdminReport) {
    return String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? ""));
}

/** Read-only view of the reported post's files, whatever its status (staff endpoint). */
function CodeViewer({ report, onClose }: { report: AdminReport | null; onClose: () => void }) {
    const { tx } = useI18n();
    const [state, setState] = useState<{ postId: string; post: AdminReportPostFiles | null; error: ApiFailure | null } | null>(null);
    const [active, setActive] = useState(0);
    const postId = report?.postId ?? null;

    useEffect(() => {
        if (!postId) return;
        const controller = new AbortController();
        void adminRequest<AdminReportPostFiles>(`/api/admin/reports?post=${encodeURIComponent(postId)}`, { signal: controller.signal }).then((result) => {
            if (controller.signal.aborted) return;
            setActive(0);
            setState(result.ok ? { postId, post: result.data, error: null } : { postId, post: null, error: result });
        });
        return () => controller.abort();
    }, [postId]);

    const current = state && state.postId === postId ? state : null;
    const files = current?.post?.files ?? [];
    const file = files[active];

    return (
        <Dialog
            open={Boolean(report)}
            onClose={onClose}
            size="lg"
            icon={Code2}
            title={report?.post?.title || tx({ TR: "Gönderi kodu", EN: "Post code" })}
            description={current?.post
                ? `${tx({ TR: "Bildirilen gönderinin dosyaları (salt okunur).", EN: "Files of the reported post (read-only)." })} ${tx(POST_STATUS_COPY[current.post.status] ?? { TR: current.post.status, EN: current.post.status })}`
                : tx({ TR: "Bildirilen gönderinin dosyaları (salt okunur).", EN: "Files of the reported post (read-only)." })}
            footer={<Button variant="ghost" onClick={onClose}>{tx(COMMON.close)}</Button>}
        >
            {!current ? (
                <Spinner label={tx(COMMON.loading)} />
            ) : current.error ? (
                <ErrorNotice error={current.error} />
            ) : !files.length ? (
                <EmptyState icon={FileWarning} title={tx({ TR: "Dosya bulunamadı", EN: "No files found" })} />
            ) : (
                <div className="space-y-3">
                    <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-thin" role="tablist" aria-label={tx({ TR: "Dosyalar", EN: "Files" })}>
                        {files.map((item, index) => (
                            <button
                                key={`${item.name || "file"}-${index}`}
                                type="button"
                                role="tab"
                                aria-selected={index === active}
                                onClick={() => setActive(index)}
                                className={cx(
                                    "shrink-0 rounded-lg px-2.5 py-1 font-mono text-[12px] transition",
                                    index === active ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900" : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-white/[0.06] dark:text-zinc-300",
                                )}
                            >
                                {item.name || `file-${index + 1}`}
                            </button>
                        ))}
                    </div>
                    <pre dir="ltr" className="max-h-[55dvh] overflow-auto rounded-2xl bg-zinc-950 p-4 font-mono text-[12px] leading-relaxed text-zinc-100 scrollbar-thin" role="tabpanel">
                        <code>{file?.code ?? ""}</code>
                    </pre>
                    {file?.truncated ? <p className="text-[12px] text-zinc-500">{tx({ TR: "Dosyanın yalnızca başı gösteriliyor.", EN: "Only the start of the file is shown." })}</p> : null}
                </div>
            )}
        </Dialog>
    );
}

function ReportCard({ report, closedView, busy, onResolve, onDismiss, onRemove, onReopen, onViewCode }: {
    report: AdminReport;
    closedView: boolean;
    busy: boolean;
    onResolve: () => void;
    onDismiss: () => void;
    onRemove: () => void;
    onReopen: () => void;
    onViewCode: () => void;
}) {
    const { tx } = useI18n();
    const post = report.post;
    return (
        <motion.li
            layout
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, x: -16 }}
            className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-zinc-900/60"
        >
            <div className="flex flex-wrap items-center gap-2 text-[12px] text-zinc-500">
                <Badge tone={CATEGORY_TONES[report.category]} icon={Flag}>{tx(CATEGORY_COPY[report.category])}</Badge>
                {report.postReportCount > 1 ? (
                    <Badge tone="amber">{closedView
                        ? tx({ TR: "Bu gönderiye toplam {count} bildirim", EN: "{count} reports on this post in all" }, { count: report.postReportCount })
                        : tx({ TR: "Bu gönderiye {count} açık bildirim", EN: "{count} open reports on this post" }, { count: report.postReportCount })}
                    </Badge>
                ) : null}
                <RelativeTime iso={report.createdAt} />
                <span aria-hidden="true">·</span>
                <span className="truncate" dir="ltr">{report.reporterEmail || "—"}</span>
            </div>
            <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed text-zinc-800 dark:text-zinc-200" dir="auto">{report.reason}</p>

            <div className="mt-3 rounded-xl border border-zinc-100 bg-zinc-50 p-3 dark:border-white/[0.06] dark:bg-white/[0.03]">
                {post ? (
                    <>
                        <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">{tx({ TR: "Bildirilen gönderi", EN: "Reported post" })}</p>
                        <p className="mt-1 truncate text-sm font-black text-zinc-900 dark:text-white" dir="auto">{post.title || tx({ TR: "İsimsiz proje", EN: "Untitled project" })}</p>
                        {post.description ? <p className="mt-0.5 line-clamp-2 text-[12px] text-zinc-500" dir="auto">{post.description}</p> : null}
                        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-zinc-500">
                            <span>{post.ownerName || "—"} <span dir="ltr">({post.ownerEmail || "—"})</span></span>
                            <span>{post.language} · {tx({ TR: "{count} dosya", EN: "{count} files" }, { count: post.fileCount })}</span>
                            <span className="inline-flex items-center gap-1"><Heart className="h-3 w-3" aria-hidden="true" />{post.likeCount}</span>
                            <span className="inline-flex items-center gap-1"><MessageCircle className="h-3 w-3" aria-hidden="true" />{post.commentCount}</span>
                        </div>
                    </>
                ) : (
                    <p className="flex items-center gap-2 text-[13px] text-zinc-500"><FileWarning className="h-4 w-4" aria-hidden="true" />{tx({ TR: "Gönderi artık mevcut değil.", EN: "The post no longer exists." })}</p>
                )}
            </div>

            {closedView ? (
                <div className="mt-3 flex flex-wrap items-center gap-2 text-[12px] text-zinc-500">
                    <Badge tone={report.resolution === "dismissed" ? "zinc" : report.resolution === "content_removed" ? "red" : "emerald"}>
                        {tx(RESOLUTION_COPY[report.resolution ?? report.status] ?? RESOLUTION_COPY.resolved)}
                    </Badge>
                    <RelativeTime iso={report.resolvedAt} />
                    {report.resolvedBy ? <span dir="ltr">· {report.resolvedBy}</span> : null}
                    <span className="flex-1" />
                    {post ? <Button size="sm" variant="ghost" icon={Code2} onClick={onViewCode}>{tx({ TR: "Kodu incele", EN: "Inspect code" })}</Button> : null}
                    {report.resolution !== "content_removed" ? (
                        <Button size="sm" variant="ghost" icon={RotateCcw} disabled={busy} onClick={onReopen}>{tx({ TR: "Yeniden aç", EN: "Reopen" })}</Button>
                    ) : null}
                    {report.moderatorNote ? <p className="w-full italic" dir="auto">“{report.moderatorNote}”</p> : null}
                </div>
            ) : (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                    {post ? <Button size="sm" variant="ghost" icon={Code2} onClick={onViewCode}>{tx({ TR: "Kodu incele", EN: "Inspect code" })}</Button> : null}
                    {post ? (
                        <a
                            href={`/api/media/${encodeURIComponent(report.postId)}/download`}
                            className="inline-flex h-8 items-center gap-2 rounded-xl px-3 text-[13px] font-semibold text-zinc-600 transition hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-white/[0.06]"
                        >
                            <Download className="h-4 w-4" aria-hidden="true" />{tx({ TR: "İndir", EN: "Download" })}
                        </a>
                    ) : null}
                    <span className="flex-1" />
                    <Button size="sm" variant="ghost" icon={X} disabled={busy} onClick={onDismiss}>{tx({ TR: "Reddet", EN: "Dismiss" })}</Button>
                    <Button size="sm" variant="success" icon={Check} disabled={busy} onClick={onResolve}>{tx({ TR: "Çözüldü", EN: "Resolve" })}</Button>
                    <Button size="sm" variant="danger" icon={Trash2} disabled={busy} onClick={onRemove}>{tx({ TR: "İçeriği kaldır", EN: "Remove content" })}</Button>
                </div>
            )}
        </motion.li>
    );
}

export default function ReportsPanel({ view, onViewChange }: { view: "open" | "closed"; onViewChange: (view: "open" | "closed") => void }) {
    const { tx } = useI18n();
    const toast = useToast();
    const errorText = useErrorText();
    const { refresh: refreshCounters } = useCounters();
    const [category, setCategory] = useState<"all" | ReportCategory>("all");
    const reports = useAdminPages<AdminReport, AdminReportsResponse>(`/api/admin/reports?status=${view}`);
    const [busyIds, setBusyIds] = useState<readonly string[]>([]);
    const [removal, setRemoval] = useState<AdminReport | null>(null);
    const [note, setNote] = useState("");
    const [removing, setRemoving] = useState(false);
    const [removalError, setRemovalError] = useState<ApiFailure | null>(null);
    const [codeFor, setCodeFor] = useState<AdminReport | null>(null);

    // Rows of an earlier query are only shown (dimmed) while the new one loads, never next to its error.
    const showRows = !reports.stale || reports.loading;
    const list = useMemo(() => (showRows ? reports.data?.items ?? [] : []), [reports.data, showRows]);
    const counts = useMemo(() => {
        const result: Record<ReportCategory, number> = { malware: 0, copyright: 0, personal_data: 0, spam: 0, other: 0 };
        for (const report of list) result[report.category] += 1;
        return result;
    }, [list]);
    const visible = category === "all" ? list : list.filter((report) => report.category === category);
    const tabCounts = reports.data && !reports.stale ? reports.data.counts : null;

    /** Reopens a report just closed from this tab and puts it back in the list. */
    const undo = async (report: AdminReport) => {
        const result = await adminPost<AdminReportActionResponse>("/api/admin/reports", { action: "reopen", reportId: report.id });
        if (!result.ok) {
            toast("error", errorText(result));
            return;
        }
        refreshCounters();
        reports.reload();
        toast("info", tx({ TR: "Geri alındı: bildirim yeniden açık.", EN: "Undone: the report is open again." }));
    };

    const setStatus = async (report: AdminReport, action: "resolve" | "dismiss" | "reopen") => {
        const forKey = reports.dataKey;
        setBusyIds((ids) => [...ids, report.id]);
        // Optimistic: the report leaves this tab at once and comes back if the server refuses.
        reports.mutate((current) => ({ ...current, items: current.items.filter((item) => item.id !== report.id) }), forKey);
        const result = await adminPost<AdminReportActionResponse>("/api/admin/reports", { action, reportId: report.id });
        setBusyIds((ids) => ids.filter((id) => id !== report.id));
        if (result.ok) {
            refreshCounters();
            if (action === "reopen") {
                toast("success", tx({ TR: "Bildirim yeniden açıldı ve kuyruğa döndü.", EN: "Report reopened and back in the queue." }));
                return;
            }
            toast(
                "success",
                action === "resolve" ? tx({ TR: "Bildirim çözüldü olarak kapatıldı.", EN: "Report closed as resolved." }) : tx({ TR: "Bildirim reddedildi.", EN: "Report dismissed." }),
                { label: tx({ TR: "Geri al", EN: "Undo" }), onClick: () => void undo(report) },
            );
            return;
        }
        if (result.code !== "already_handled" && result.code !== "not_found") {
            reports.mutate((current) => ({ ...current, items: [...current.items.filter((item) => item.id !== report.id), report].sort(byNewest) }), forKey);
        }
        toast("error", errorText(result));
    };

    const openRemoval = (report: AdminReport) => {
        setRemoval(report);
        setNote("");
        setRemovalError(null);
    };

    const confirmRemoval = async () => {
        if (!removal) return;
        setRemoving(true);
        setRemovalError(null);
        const result = await adminPost<AdminReportActionResponse>("/api/admin/reports", {
            action: "removeContent",
            reportId: removal.id,
            ...(note.trim() ? { note: note.trim() } : {}),
        });
        setRemoving(false);
        if (!result.ok) {
            setRemovalError(result);
            return;
        }
        const closed = new Set(result.data.closedReportIds);
        reports.mutate((current) => ({ ...current, items: current.items.filter((item) => !closed.has(item.id) && item.postId !== removal.postId) }));
        refreshCounters();
        setRemoval(null);
        toast(result.data.cleanup === "partial" ? "info" : "success", result.data.cleanup === "partial"
            ? tx({ TR: "Gönderi kaldırıldı; bazı yorum ve beğeniler sonra temizlenecek.", EN: "Post removed; some comments and likes will be cleaned up later." })
            : tx({ TR: "Gönderi kaldırıldı ve {count} bildirim kapatıldı.", EN: "Post removed and {count} reports closed." }, { count: result.data.closedReportIds.length }));
    };

    const count = (value: number | null | undefined) => (typeof value === "number" ? value : undefined);

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <FilterChips
                    label={tx({ TR: "Bildirim durumu", EN: "Report status" })}
                    value={view}
                    onChange={(next) => { onViewChange(next); setCategory("all"); }}
                    options={[
                        { value: "open", label: tx({ TR: "Açık", EN: "Open" }), count: count(tabCounts?.open) },
                        { value: "closed", label: tx({ TR: "Kapatılanlar", EN: "Closed" }), count: count(tabCounts?.closed) },
                    ]}
                />
                <div className="flex flex-wrap items-center gap-2">
                    <FilterChips
                        label={tx({ TR: "Kategori (yüklenenler)", EN: "Category (loaded)" })}
                        value={category}
                        onChange={setCategory}
                        options={[
                            { value: "all", label: tx(COMMON.all), count: list.length },
                            ...CATEGORIES.filter((item) => counts[item] > 0).map((item) => ({ value: item, label: tx(CATEGORY_COPY[item]), count: counts[item] })),
                        ]}
                    />
                    <Button size="sm" icon={RefreshCw} busy={reports.loading && Boolean(reports.data)} onClick={() => { reports.reload(); refreshCounters(); }}>{tx(COMMON.refresh)}</Button>
                </div>
            </div>

            {reports.error ? <ErrorNotice error={reports.error} onRetry={reports.reload} /> : null}

            {!reports.data && reports.loading ? (
                <LoadingRows rows={3} />
            ) : reports.error && !showRows ? null : visible.length === 0 ? (
                <EmptyState
                    icon={Flag}
                    title={view === "open" ? tx({ TR: "Kuyruk temiz", EN: "The queue is clear" }) : tx({ TR: "Kapatılmış bildirim yok", EN: "No closed reports" })}
                    description={view === "open" ? tx({ TR: "Açık Media bildirimi yok. Yeni bildirimler burada görünür.", EN: "There are no open Media reports. New ones will appear here." }) : undefined}
                />
            ) : (
                <ul className={cx("space-y-3 transition-opacity", reports.loading && "opacity-60")}>
                    <AnimatePresence initial={false}>
                        {visible.map((report) => (
                            <ReportCard
                                key={report.id}
                                report={report}
                                closedView={view === "closed"}
                                busy={busyIds.includes(report.id)}
                                onResolve={() => void setStatus(report, "resolve")}
                                onDismiss={() => void setStatus(report, "dismiss")}
                                onReopen={() => void setStatus(report, "reopen")}
                                onRemove={() => openRemoval(report)}
                                onViewCode={() => setCodeFor(report)}
                            />
                        ))}
                    </AnimatePresence>
                </ul>
            )}

            {showRows ? (
                <LoadMore
                    pages={reports}
                    shown={list.length}
                    total={tabCounts ? (view === "open" ? tabCounts.open : tabCounts.closed) : null}
                />
            ) : null}

            <ConfirmDialog
                open={Boolean(removal)}
                onClose={() => { if (!removing) setRemoval(null); }}
                onConfirm={() => void confirmRemoval()}
                busy={removing}
                error={removalError}
                icon={Trash2}
                title={tx({ TR: "İçerik kaldırılsın mı?", EN: "Remove this content?" })}
                description={removal?.post
                    ? tx({ TR: "\"{title}\" gönderisi, dosyaları, yorumları ve beğenileri kalıcı olarak silinir. Bu gönderiye ait tüm açık bildirimler kapatılır.", EN: "The post \"{title}\" and its files, comments and likes are deleted permanently. All open reports on it are closed." }, { title: removal.post.title || "—" })
                    : tx({ TR: "Gönderi zaten silinmiş; açık bildirimleri kapatılır.", EN: "The post is already gone; its open reports will be closed." })}
                confirmLabel={tx({ TR: "Kalıcı olarak kaldır", EN: "Remove permanently" })}
                confirmDisabled={note.length > MODERATOR_NOTE_MAX}
            >
                <TextArea
                    label={tx({ TR: "Moderatör notu", EN: "Moderator note" })}
                    optional
                    value={note}
                    onChange={setNote}
                    max={MODERATOR_NOTE_MAX}
                    rows={2}
                    hint={tx({ TR: "Yalnızca ekip görür.", EN: "Visible to staff only." })}
                />
            </ConfirmDialog>

            <CodeViewer report={codeFor} onClose={() => setCodeFor(null)} />
        </div>
    );
}
