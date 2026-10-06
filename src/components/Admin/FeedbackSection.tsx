"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, HelpCircle, Inbox, MessageCircle, MessageSquareText, RefreshCw, Send, ShieldCheck, ThumbsUp, Trash2 } from "lucide-react";
import { useState } from "react";
import { useI18n } from "@/lib/i18n";
import { adminPost, type ApiFailure } from "./api";
import { COMMON, FEEDBACK_STATUS_COPY } from "./copy";
import { useCounters } from "./counters";
import { useAdminPages, useDebouncedValue } from "./hooks";
import { setAdminParams } from "./navigation";
import {
    FEEDBACK_REPLY_MAX,
    FEEDBACK_STATUSES,
    OFFICIAL_AUTHOR,
    type AdminFeedbackActionResponse,
    type AdminFeedbackItem,
    type AdminFeedbackResponse,
    type FeedbackCounts,
    type FeedbackStatus,
} from "./types";
import {
    Avatar, Badge, Button, ConfirmDialog, EmptyState, ErrorNotice, FOCUS_RING, FilterChips, LoadMore, LoadingRows, Panel, RelativeTime, SearchInput,
    SectionHeader, TextArea, cx, useErrorText, useToast,
} from "./ui";
import { FEEDBACK_STATUS_TONES as STATUS_TONES } from "./tones";

type TypeFilter = "all" | "feedback" | "question";
type StatusFilter = "all" | FeedbackStatus;

const isStatusFilter = (value: string | null): value is StatusFilter => value === "all" || (FEEDBACK_STATUSES as readonly (string | null)[]).includes(value);
const isTypeFilter = (value: string | null): value is TypeFilter => value === "all" || value === "feedback" || value === "question";

/** Moves one item between the status counts (or out of them, with `next` null). */
function recount(counts: FeedbackCounts | null, from: FeedbackStatus, next: FeedbackStatus | null): FeedbackCounts | null {
    if (!counts) return counts;
    const result = { ...counts, [from]: Math.max(0, counts[from] - 1) };
    if (next) result[next] += 1;
    else result.all = Math.max(0, result.all - 1);
    return result;
}

function FeedbackDetail({ item, onStatus, onReplied, onDelete, onBack, statusBusy }: {
    item: AdminFeedbackItem;
    onStatus: (status: FeedbackStatus) => void;
    onReplied: (item: AdminFeedbackItem) => void;
    onDelete: () => void;
    onBack: () => void;
    statusBusy: boolean;
}) {
    const { tx } = useI18n();
    const toast = useToast();
    const [reply, setReply] = useState("");
    const [sending, setSending] = useState(false);
    const [error, setError] = useState<ApiFailure | null>(null);
    const tooLong = reply.length > FEEDBACK_REPLY_MAX;

    const send = async () => {
        const text = reply.trim();
        if (!text || tooLong) return;
        setSending(true);
        setError(null);
        const result = await adminPost<AdminFeedbackActionResponse>("/api/admin/feedback", { action: "reply", id: item.id, text });
        setSending(false);
        if (!result.ok) {
            setError(result);
            return;
        }
        const comment = result.data.comment;
        if (comment) onReplied({ ...item, comments: [...item.comments, comment] });
        setReply("");
        toast("success", tx({ TR: "Resmî yanıt yayınlandı.", EN: "Official reply published." }));
    };

    return (
        <Panel bodyClassName="p-0">
            <div className="border-b border-zinc-100 p-5 dark:border-white/[0.06]">
                <button type="button" onClick={onBack} className={cx("mb-3 inline-flex items-center gap-1.5 rounded-lg text-[13px] font-semibold text-zinc-500 hover:text-zinc-900 lg:hidden dark:hover:text-white", FOCUS_RING)}>
                    <ArrowLeft className="h-4 w-4 rtl:rotate-180" aria-hidden="true" />{tx({ TR: "Listeye dön", EN: "Back to list" })}
                </button>
                <div className="flex flex-wrap items-center gap-2 text-[12px] text-zinc-500">
                    <Badge tone={item.type === "question" ? "indigo" : "fuchsia"} icon={item.type === "question" ? HelpCircle : MessageSquareText}>
                        {item.type === "question" ? tx({ TR: "Soru", EN: "Question" }) : tx({ TR: "Geri bildirim", EN: "Feedback" })}
                    </Badge>
                    <Badge tone={STATUS_TONES[item.status]}>{tx(FEEDBACK_STATUS_COPY[item.status])}</Badge>
                    <RelativeTime iso={item.createdAt} />
                    <span className="inline-flex items-center gap-1"><ThumbsUp className="h-3.5 w-3.5" aria-hidden="true" />{item.likeCount}</span>
                </div>
                <h3 className="mt-3 whitespace-pre-wrap break-words text-lg font-black leading-snug text-zinc-900 dark:text-white" dir="auto">{item.content}</h3>
                {item.description ? <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed text-zinc-600 dark:text-zinc-300" dir="auto">{item.description}</p> : null}
                <div className="mt-4 flex items-center gap-3">
                    <Avatar src={item.authorPhoto} name={item.author || item.authorEmail} size={32} />
                    <div className="min-w-0">
                        <p className="truncate text-sm font-bold">{item.author || "—"}</p>
                        <p className="truncate text-[12px] text-zinc-500" dir="ltr">{item.authorEmail}</p>
                    </div>
                </div>
            </div>

            <div className="border-b border-zinc-100 p-5 dark:border-white/[0.06]">
                <p className="mb-2 text-[12px] font-bold uppercase tracking-wider text-zinc-400">{tx({ TR: "Durum", EN: "Status" })}</p>
                <div role="group" aria-label={tx({ TR: "Durum", EN: "Status" })} className="flex flex-wrap gap-1.5">
                    {FEEDBACK_STATUSES.map((status) => {
                        const active = item.status === status;
                        return (
                            <button
                                key={status}
                                type="button"
                                aria-pressed={active}
                                disabled={statusBusy}
                                onClick={() => { if (!active) onStatus(status); }}
                                className={cx(
                                    "h-8 rounded-full px-3 text-[12px] font-bold transition disabled:opacity-60",
                                    active ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900" : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-white/[0.06] dark:text-zinc-300 dark:hover:bg-white/[0.1]",
                                    FOCUS_RING,
                                )}
                            >
                                {tx(FEEDBACK_STATUS_COPY[status])}
                            </button>
                        );
                    })}
                </div>
            </div>

            <div className="p-5">
                <p className="mb-3 text-[12px] font-bold uppercase tracking-wider text-zinc-400">
                    {tx({ TR: "Yorumlar ({count})", EN: "Comments ({count})" }, { count: item.comments.length })}
                </p>
                {item.comments.length ? (
                    <ul className="space-y-2.5">
                        {item.comments.map((comment) => (
                            <li
                                key={comment.id}
                                className={cx(
                                    "rounded-2xl border p-3",
                                    comment.official ? "border-indigo-200 bg-indigo-50/70 dark:border-indigo-500/30 dark:bg-indigo-500/10" : "border-zinc-100 bg-zinc-50 dark:border-white/[0.06] dark:bg-white/[0.03]",
                                )}
                            >
                                <div className="flex flex-wrap items-center gap-2 text-[12px] text-zinc-500">
                                    <span className="font-bold text-zinc-800 dark:text-zinc-100">{comment.official ? OFFICIAL_AUTHOR : comment.author || "—"}</span>
                                    {comment.official ? <Badge tone="indigo" icon={ShieldCheck}>{tx({ TR: "Resmî yanıt", EN: "Official reply" })}</Badge> : null}
                                    <RelativeTime iso={comment.createdAt} />
                                </div>
                                {comment.replyToContent ? <p className="mt-1.5 line-clamp-2 border-s-2 border-zinc-300 ps-2 text-[12px] text-zinc-500 dark:border-white/20" dir="auto">{comment.replyToContent}</p> : null}
                                <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed text-zinc-800 dark:text-zinc-200" dir="auto">{comment.content}</p>
                            </li>
                        ))}
                    </ul>
                ) : (
                    <p className="text-sm text-zinc-500">{tx({ TR: "Henüz yorum yok.", EN: "No comments yet." })}</p>
                )}

                <div className="mt-5 space-y-3">
                    <TextArea
                        label={tx({ TR: "Resmî yanıt", EN: "Official reply" })}
                        value={reply}
                        onChange={setReply}
                        max={FEEDBACK_REPLY_MAX}
                        rows={3}
                        disabled={sending}
                        placeholder={tx({ TR: "Kullanıcıya ekip adına yanıt yazın…", EN: "Write a reply on behalf of the team…" })}
                        hint={tx({ TR: "\"{name}\" adıyla, giriş yapmış herkese görünür.", EN: "Shown as \"{name}\" to everyone who is signed in." }, { name: OFFICIAL_AUTHOR })}
                    />
                    {error ? <ErrorNotice error={error} /> : null}
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <Button size="sm" variant="ghost" icon={Trash2} className="text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10" onClick={onDelete}>
                            {tx({ TR: "Kaydı sil", EN: "Delete item" })}
                        </Button>
                        <Button variant="primary" icon={Send} busy={sending} disabled={!reply.trim() || tooLong} onClick={() => void send()}>
                            {tx({ TR: "Yanıtı gönder", EN: "Send reply" })}
                        </Button>
                    </div>
                </div>
            </div>
        </Panel>
    );
}

export default function FeedbackSection({ params }: { params: URLSearchParams }) {
    const { tx } = useI18n();
    const toast = useToast();
    const errorText = useErrorText();
    const { refresh: refreshCounters } = useCounters();
    // The filters live in the address (#feedback?status=done&type=question), so a reload or a link keeps them.
    const rawStatus = params.get("status");
    const status: StatusFilter = isStatusFilter(rawStatus) ? rawStatus : "open";
    const rawType = params.get("type");
    const type: TypeFilter = isTypeFilter(rawType) ? rawType : "all";
    const [query, setQuery] = useState("");
    const search = useDebouncedValue(query.trim());
    const request = new URLSearchParams({ status });
    if (type !== "all") request.set("type", type);
    if (search) request.set("q", search);
    const feedback = useAdminPages<AdminFeedbackItem, AdminFeedbackResponse>(`/api/admin/feedback?${request}`);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [statusBusy, setStatusBusy] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState<AdminFeedbackItem | null>(null);
    const [deleting, setDeleting] = useState(false);
    const [deleteError, setDeleteError] = useState<ApiFailure | null>(null);

    const setStatus = (next: StatusFilter) => { setSelectedId(null); setAdminParams({ status: next === "open" ? null : next }); };
    const setType = (next: TypeFilter) => { setSelectedId(null); setAdminParams({ type: next === "all" ? null : next }); };
    const clearFilters = () => { setQuery(""); setSelectedId(null); setAdminParams({ status: "all", type: null }); };

    // An answer for earlier filters stays only while the new one loads (dimmed).
    const showRows = !feedback.stale || feedback.loading;
    const items = showRows ? feedback.data?.items ?? [] : [];
    const counts = feedback.data?.counts ?? null;
    const filtered = status !== "all" || type !== "all" || Boolean(search);
    const selected = items.find((item) => item.id === selectedId) ?? null;

    // A changed item stays in view until the next refresh, even if it no longer matches the filter.
    const replaceItem = (next: AdminFeedbackItem, previous?: AdminFeedbackItem) => feedback.mutate((current) => ({
        ...current,
        items: current.items.map((item) => (item.id === next.id ? next : item)),
        counts: previous && previous.status !== next.status ? recount(current.counts, previous.status, next.status) : current.counts,
    }));

    const changeStatus = async (item: AdminFeedbackItem, next: FeedbackStatus) => {
        setStatusBusy(true);
        const changed = { ...item, status: next };
        replaceItem(changed, item);
        const result = await adminPost<AdminFeedbackActionResponse>("/api/admin/feedback", { action: "setStatus", id: item.id, status: next });
        setStatusBusy(false);
        if (!result.ok) {
            replaceItem(item, changed);
            toast("error", errorText(result));
            return;
        }
        refreshCounters();
        toast("success", tx({ TR: "Durum: {status}", EN: "Status: {status}" }, { status: tx(FEEDBACK_STATUS_COPY[next]) }));
    };

    const confirmDelete = async () => {
        if (!deleteTarget) return;
        setDeleting(true);
        setDeleteError(null);
        const result = await adminPost<AdminFeedbackActionResponse>("/api/admin/feedback", { action: "delete", id: deleteTarget.id });
        setDeleting(false);
        if (!result.ok && result.code !== "not_found") {
            setDeleteError(result);
            return;
        }
        const removed = deleteTarget;
        feedback.mutate((current) => ({
            ...current,
            items: current.items.filter((item) => item.id !== removed.id),
            counts: recount(current.counts, removed.status, null),
        }));
        setSelectedId(null);
        setDeleteTarget(null);
        refreshCounters();
        toast("success", tx({ TR: "Kayıt silindi.", EN: "Item deleted." }));
    };

    return (
        <div>
            <SectionHeader
                title={tx({ TR: "Geri Bildirim", EN: "Feedback" })}
                description={tx({ TR: "Kullanıcı önerileri ve soruları: durum belirleyin, resmî yanıt verin.", EN: "User suggestions and questions: set a status and reply officially." })}
                actions={<Button size="sm" icon={RefreshCw} busy={feedback.loading && Boolean(feedback.data)} onClick={() => { feedback.reload(); refreshCounters(); }}>{tx(COMMON.refresh)}</Button>}
            />

            <div className="mb-4 space-y-3">
                <FilterChips
                    label={tx({ TR: "Durum filtresi", EN: "Status filter" })}
                    value={status}
                    onChange={setStatus}
                    options={[
                        { value: "all", label: tx(COMMON.all), count: counts?.all },
                        ...FEEDBACK_STATUSES.map((value) => ({ value, label: tx(FEEDBACK_STATUS_COPY[value]), count: counts?.[value] })),
                    ]}
                />
                <div className="flex flex-wrap items-center gap-3">
                    <FilterChips
                        label={tx({ TR: "Tür filtresi", EN: "Type filter" })}
                        value={type}
                        onChange={setType}
                        options={[
                            { value: "all", label: tx(COMMON.all) },
                            { value: "feedback", label: tx({ TR: "Geri bildirim", EN: "Feedback" }) },
                            { value: "question", label: tx({ TR: "Soru", EN: "Question" }) },
                        ]}
                    />
                    <SearchInput
                        value={query}
                        onChange={setQuery}
                        className="min-w-48 flex-1"
                        label={tx({ TR: "Geri bildirimlerde ara", EN: "Search feedback" })}
                        placeholder={tx({ TR: "İçerik, yazar veya e-posta…", EN: "Content, author or e-mail…" })}
                    />
                </div>
            </div>

            {feedback.error ? <ErrorNotice error={feedback.error} onRetry={feedback.reload} className="mb-4" /> : null}

            {!feedback.data && feedback.loading ? (
                <LoadingRows rows={5} />
            ) : feedback.error && !showRows ? null : (
                <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]">
                    <div className={cx(selected && "hidden lg:block")}>
                        {items.length === 0 ? (
                            <EmptyState
                                icon={Inbox}
                                title={filtered ? tx(COMMON.noResults) : tx({ TR: "Gelen kutusu boş", EN: "The inbox is empty" })}
                                action={filtered ? <Button size="sm" onClick={clearFilters}>{tx(COMMON.clearFilters)}</Button> : undefined}
                            />
                        ) : (
                            <ul className={cx("space-y-2 transition-opacity", feedback.loading && feedback.stale && "opacity-60")} aria-label={tx({ TR: "Geri bildirim listesi", EN: "Feedback list" })}>
                                <AnimatePresence initial={false}>
                                    {items.map((item) => {
                                        const active = item.id === selectedId;
                                        const answered = item.comments.some((comment) => comment.official);
                                        return (
                                            <motion.li key={item.id} layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                                                <button
                                                    type="button"
                                                    aria-current={active || undefined}
                                                    onClick={() => setSelectedId(item.id)}
                                                    className={cx(
                                                        "w-full rounded-2xl border p-3.5 text-start transition",
                                                        active
                                                            ? "border-indigo-400 bg-indigo-50/70 shadow-md dark:border-indigo-400/50 dark:bg-indigo-500/10"
                                                            : "border-zinc-200 bg-white hover:border-zinc-300 hover:shadow-sm dark:border-white/10 dark:bg-zinc-900/60 dark:hover:border-white/20",
                                                        FOCUS_RING,
                                                    )}
                                                >
                                                    <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-zinc-500">
                                                        {item.type === "question"
                                                            ? <HelpCircle className="h-3.5 w-3.5 text-indigo-500" role="img" aria-label={tx({ TR: "Soru", EN: "Question" })} />
                                                            : <MessageSquareText className="h-3.5 w-3.5 text-fuchsia-500" role="img" aria-label={tx({ TR: "Geri bildirim", EN: "Feedback" })} />}
                                                        <Badge tone={STATUS_TONES[item.status]}>{tx(FEEDBACK_STATUS_COPY[item.status])}</Badge>
                                                        {answered ? <Badge tone="indigo" icon={ShieldCheck}>{tx({ TR: "Yanıtlandı", EN: "Answered" })}</Badge> : null}
                                                        <span className="ms-auto"><RelativeTime iso={item.createdAt} /></span>
                                                    </div>
                                                    <p className="mt-1.5 line-clamp-2 text-sm font-bold text-zinc-900 dark:text-white" dir="auto">{item.content}</p>
                                                    <div className="mt-1.5 flex items-center gap-3 text-[12px] text-zinc-500">
                                                        <span className="truncate">{item.author || item.authorEmail}</span>
                                                        <span className="inline-flex shrink-0 items-center gap-1"><ThumbsUp className="h-3 w-3" aria-hidden="true" />{item.likeCount}</span>
                                                        <span className="inline-flex shrink-0 items-center gap-1"><MessageCircle className="h-3 w-3" aria-hidden="true" />{item.comments.length}</span>
                                                    </div>
                                                </button>
                                            </motion.li>
                                        );
                                    })}
                                </AnimatePresence>
                            </ul>
                        )}
                        <LoadMore pages={feedback} shown={items.length} />
                    </div>

                    <div className={cx(!selected && "hidden lg:block")}>
                        {selected ? (
                            <div className="lg:sticky lg:top-24">
                                <FeedbackDetail
                                    key={selected.id}
                                    item={selected}
                                    statusBusy={statusBusy}
                                    onStatus={(next) => void changeStatus(selected, next)}
                                    onReplied={(next) => replaceItem(next)}
                                    onDelete={() => { setDeleteTarget(selected); setDeleteError(null); }}
                                    onBack={() => setSelectedId(null)}
                                />
                            </div>
                        ) : (
                            <EmptyState icon={MessageSquareText} title={tx({ TR: "Bir kayıt seçin", EN: "Select an item" })} description={tx({ TR: "Ayrıntıları, yorumları ve yanıt alanını görmek için listeden seçin.", EN: "Pick one from the list to see details, comments and the reply box." })} />
                        )}
                    </div>
                </div>
            )}

            <ConfirmDialog
                open={Boolean(deleteTarget)}
                onClose={() => { if (!deleting) setDeleteTarget(null); }}
                onConfirm={() => void confirmDelete()}
                busy={deleting}
                error={deleteError}
                icon={Trash2}
                title={tx({ TR: "Kayıt silinsin mi?", EN: "Delete this item?" })}
                description={tx({ TR: "Geri bildirim, yorumları ve beğenileriyle birlikte kalıcı olarak silinir.", EN: "The item is deleted permanently together with its comments and likes." })}
                confirmLabel={tx(COMMON.delete)}
            >
                {deleteTarget ? (
                    <blockquote className="rounded-xl border-s-4 border-zinc-300 bg-zinc-50 px-3 py-2 text-sm text-zinc-700 dark:border-white/20 dark:bg-white/[0.03] dark:text-zinc-300" dir="auto">
                        {deleteTarget.content}
                    </blockquote>
                ) : null}
            </ConfirmDialog>
        </div>
    );
}
