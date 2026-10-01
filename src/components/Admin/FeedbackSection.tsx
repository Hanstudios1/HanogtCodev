"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, HelpCircle, Inbox, MessageCircle, MessageSquareText, RefreshCw, Send, ShieldCheck, ThumbsUp, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { adminPost, type ApiFailure } from "./api";
import { COMMON, FEEDBACK_STATUS_COPY } from "./copy";
import { useAdminResource } from "./hooks";
import {
    FEEDBACK_REPLY_MAX,
    FEEDBACK_STATUSES,
    OFFICIAL_AUTHOR,
    type AdminFeedbackActionResponse,
    type AdminFeedbackItem,
    type AdminFeedbackResponse,
    type FeedbackStatus,
} from "./types";
import {
    Avatar, Badge, Button, ConfirmDialog, EmptyState, ErrorNotice, FOCUS_RING, FilterChips, LoadingRows, Panel, RelativeTime, SearchInput, SectionHeader,
    TextArea, cx, useErrorText, useToast,
} from "./ui";
import { FEEDBACK_STATUS_TONES as STATUS_TONES } from "./tones";

type TypeFilter = "all" | "feedback" | "question";

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

export default function FeedbackSection() {
    const { tx, locale } = useI18n();
    const toast = useToast();
    const errorText = useErrorText();
    const feedback = useAdminResource<AdminFeedbackResponse>("/api/admin/feedback");
    const [status, setStatus] = useState<"all" | FeedbackStatus>("open");
    const [type, setType] = useState<TypeFilter>("all");
    const [query, setQuery] = useState("");
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [statusBusy, setStatusBusy] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState<AdminFeedbackItem | null>(null);
    const [deleting, setDeleting] = useState(false);
    const [deleteError, setDeleteError] = useState<ApiFailure | null>(null);

    const items = useMemo(() => feedback.data?.items ?? [], [feedback.data]);
    const counts = useMemo(() => {
        const result: Record<FeedbackStatus, number> = { open: 0, planned: 0, "in-progress": 0, done: 0, closed: 0 };
        for (const item of items) result[item.status] += 1;
        return result;
    }, [items]);
    const needle = query.trim().toLocaleLowerCase(locale);
    const visible = items.filter((item) => (status === "all" || item.status === status)
        && (type === "all" || item.type === type)
        && (!needle || `${item.content} ${item.description ?? ""} ${item.author} ${item.authorEmail}`.toLocaleLowerCase(locale).includes(needle)));
    const selected = items.find((item) => item.id === selectedId) ?? null;

    const replaceItem = (next: AdminFeedbackItem) => feedback.mutate((current) => ({ items: current.items.map((item) => (item.id === next.id ? next : item)) }));

    const changeStatus = async (item: AdminFeedbackItem, next: FeedbackStatus) => {
        setStatusBusy(true);
        replaceItem({ ...item, status: next });
        const result = await adminPost<AdminFeedbackActionResponse>("/api/admin/feedback", { action: "setStatus", id: item.id, status: next });
        setStatusBusy(false);
        if (!result.ok) {
            replaceItem(item);
            toast("error", errorText(result));
            return;
        }
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
        const removedId = deleteTarget.id;
        feedback.mutate((current) => ({ items: current.items.filter((item) => item.id !== removedId) }));
        setSelectedId(null);
        setDeleteTarget(null);
        toast("success", tx({ TR: "Kayıt silindi.", EN: "Item deleted." }));
    };

    return (
        <div>
            <SectionHeader
                title={tx({ TR: "Geri Bildirim", EN: "Feedback" })}
                description={tx({ TR: "Kullanıcı önerileri ve soruları: durum belirleyin, resmî yanıt verin.", EN: "User suggestions and questions: set a status and reply officially." })}
                actions={<Button size="sm" icon={RefreshCw} busy={feedback.loading && Boolean(feedback.data)} onClick={feedback.reload}>{tx(COMMON.refresh)}</Button>}
            />

            <div className="mb-4 space-y-3">
                <FilterChips
                    label={tx({ TR: "Durum filtresi", EN: "Status filter" })}
                    value={status}
                    onChange={setStatus}
                    options={[
                        { value: "all", label: tx(COMMON.all), count: items.length },
                        ...FEEDBACK_STATUSES.map((value) => ({ value, label: tx(FEEDBACK_STATUS_COPY[value]), count: counts[value] })),
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
                        className="min-w-0 flex-1"
                        label={tx({ TR: "Geri bildirimlerde ara", EN: "Search feedback" })}
                        placeholder={tx({ TR: "İçerik, yazar veya e-posta…", EN: "Content, author or e-mail…" })}
                    />
                </div>
            </div>

            {feedback.error ? <ErrorNotice error={feedback.error} onRetry={feedback.reload} className="mb-4" /> : null}

            {!feedback.data && feedback.loading ? (
                <LoadingRows rows={5} />
            ) : (
                <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]">
                    <div className={cx(selected && "hidden lg:block")}>
                        {visible.length === 0 ? (
                            <EmptyState
                                icon={Inbox}
                                title={items.length ? tx(COMMON.noResults) : tx({ TR: "Gelen kutusu boş", EN: "The inbox is empty" })}
                                action={items.length ? <Button size="sm" onClick={() => { setStatus("all"); setType("all"); setQuery(""); }}>{tx(COMMON.clearFilters)}</Button> : undefined}
                            />
                        ) : (
                            <ul className="space-y-2" aria-label={tx({ TR: "Geri bildirim listesi", EN: "Feedback list" })}>
                                <AnimatePresence initial={false}>
                                    {visible.map((item) => {
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
                    </div>

                    <div className={cx(!selected && "hidden lg:block")}>
                        {selected ? (
                            <div className="lg:sticky lg:top-24">
                                <FeedbackDetail
                                    key={selected.id}
                                    item={selected}
                                    statusBusy={statusBusy}
                                    onStatus={(next) => void changeStatus(selected, next)}
                                    onReplied={replaceItem}
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
