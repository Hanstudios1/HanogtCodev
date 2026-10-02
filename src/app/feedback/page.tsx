"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
    AlertTriangle, ArrowLeft, Bug, Check, CheckCircle2, ChevronDown, ClipboardList, Edit3, Gavel, HelpCircle, Inbox, LifeBuoy, LoaderCircle, Lock, LogIn,
    MessageCircle, MessageSquareText, MessageSquareWarning, MessagesSquare, Monitor, Plus, RefreshCw, Reply, RotateCcw, Search, Send, ShieldAlert,
    ShieldCheck, Sparkles, ThumbsUp, Trash2, UserCog, X, type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import { adminRequest, type ApiFailure } from "@/components/Admin/api";
import { FEEDBACK_STATUS_COPY } from "@/components/Admin/copy";
import { useAdminResource, type AdminResource } from "@/components/Admin/hooks";
import { Avatar, Badge, ConfirmDialog, RelativeTime, cx, type Tone } from "@/components/Admin/ui";
import Header from "@/components/Header";
import ProfileModal, { type UserProfile } from "@/components/ProfileModal";
import { useRawSession } from "@/components/Provider";
import SiteFooter from "@/components/SiteFooter";
import StaffBadge, { parseStaffRole } from "@/components/StaffBadge";
import { FAQS, FAQ_CATEGORIES } from "@/lib/faq";
import { useI18n, type Copy } from "@/lib/i18n";
import {
    BAN_SCOPES,
    BAN_SCOPE_COPY,
    BOARD_LIMITS,
    COMPLAINT_SUBJECTS,
    COMPLAINT_SUBJECT_COPY,
    KVKK_REQUEST_HINT,
    RATE_LIMIT_MINUTES,
    SUPPORT_ERROR_COPY,
    TEAM_NAME,
    TICKET_CATEGORIES,
    TICKET_CATEGORY_COPY,
    TICKET_LIMITS,
    TICKET_SEVERITIES,
    TICKET_SEVERITY_COPY,
    TICKET_STATUS_COPY,
    canUserClose,
    canUserReopen,
    isTicketId,
    matchesSearch,
    validateTicketDraft,
    validateTicketMessage,
    type BanScope,
    type BoardAuthor,
    type BoardComment,
    type BoardItem,
    type BoardResponse,
    type ComplaintSubject,
    type SupportErrorCode,
    type SupportListResponse,
    type SupportTicketMessage,
    type SupportTicketResponse,
    type SupportTicketSummary,
    type SupportTicketView,
    type TicketCategory,
    type TicketCategoryIcon,
    type TicketField,
    type TicketSeverity,
    type TicketStatus,
} from "@/lib/support";

// ---------------------------------------------------------------------------
// Shared pieces
// ---------------------------------------------------------------------------

const FOCUS = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-zinc-950";
const INPUT = "w-full rounded-xl border border-zinc-300 bg-white px-3.5 py-2.5 text-sm text-zinc-900 outline-none transition placeholder:text-zinc-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/15 disabled:opacity-60 aria-[invalid=true]:border-red-400 dark:border-zinc-700 dark:bg-zinc-950 dark:text-white";
const CARD = "rounded-3xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900/70";
const PRIMARY_BUTTON = "inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50";
const SECONDARY_BUTTON = "inline-flex items-center justify-center gap-2 rounded-xl border border-zinc-200 bg-white px-3.5 py-2 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800";
const GHOST_BUTTON = "inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[13px] font-semibold text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-900 disabled:opacity-50 dark:hover:bg-zinc-800 dark:hover:text-white";

/** Components for the icon names in TICKET_CATEGORY_COPY. */
const CATEGORY_ICONS: Record<TicketCategoryIcon, LucideIcon> = { MessageSquareWarning, ClipboardList, ShieldAlert, Gavel, HelpCircle, MessageSquareText, Bug, UserCog, LifeBuoy };

const STATUS_TONES: Record<TicketStatus, Tone> = { open: "sky", in_progress: "amber", answered: "violet", resolved: "emerald", closed: "zinc" };

const SEVERITY_TONES: Record<TicketSeverity, Tone> = { low: "zinc", medium: "sky", high: "amber", critical: "red" };

const BOARD_PAGE = 20;

function errorCopy(code: string): Copy {
    return Object.prototype.hasOwnProperty.call(SUPPORT_ERROR_COPY, code)
        ? SUPPORT_ERROR_COPY[code as keyof typeof SUPPORT_ERROR_COPY]
        : SUPPORT_ERROR_COPY.unknown;
}

function useErrorText() {
    const { tx } = useI18n();
    return useCallback((error: ApiFailure) => (error.code === "rate_limited" && error.retryAfter
        ? tx(RATE_LIMIT_MINUTES, { minutes: Math.max(1, Math.ceil(error.retryAfter / 60)) })
        : tx(errorCopy(error.code))), [tx]);
}

function post<T>(path: string, body: Record<string, unknown>) {
    return adminRequest<T>(path, { method: "POST", body });
}

function scrollToId(id: string, focusSelector?: string) {
    window.requestAnimationFrame(() => {
        const element = document.getElementById(id);
        element?.scrollIntoView({ behavior: "smooth", block: "start" });
        if (focusSelector) element?.querySelector<HTMLElement>(focusSelector)?.focus({ preventScroll: true });
    });
}

// The opened ticket lives in the URL (/feedback?ticket=<id>), so notifications and reloads land on it.
function subscribeLocation(callback: () => void) {
    window.addEventListener("popstate", callback);
    return () => window.removeEventListener("popstate", callback);
}

function ticketFromLocation() {
    const id = new URLSearchParams(window.location.search).get("ticket");
    return id && isTicketId(id) ? id : null;
}

function noTicket() {
    return null;
}

function summaryOf(ticket: SupportTicketView): SupportTicketSummary {
    return {
        id: ticket.id,
        reference: ticket.reference,
        category: ticket.category,
        title: ticket.title,
        status: ticket.status,
        createdAt: ticket.createdAt,
        updatedAt: ticket.updatedAt,
        lastMessageAt: ticket.lastMessageAt,
        lastMessageFrom: ticket.lastMessageFrom,
        messageCount: ticket.messageCount,
        unread: ticket.unread,
    };
}

function Notice({ tone, children, action, className }: { tone: "error" | "success" | "info" | "warning"; children: ReactNode; action?: ReactNode; className?: string }) {
    const styles = {
        error: "border-red-200 bg-red-50 text-red-900 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-100",
        success: "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-100",
        info: "border-blue-200 bg-blue-50 text-blue-900 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-100",
        warning: "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100",
    }[tone];
    const Icon = tone === "error" || tone === "warning" ? AlertTriangle : tone === "success" ? CheckCircle2 : ShieldCheck;
    return (
        <div role={tone === "error" ? "alert" : "status"} className={cx("flex flex-wrap items-start gap-3 rounded-2xl border px-4 py-3 text-sm leading-relaxed", styles, className)}>
            <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <div className="min-w-0 flex-1">{children}</div>
            {action}
        </div>
    );
}

function SignInCard({ title, description, callbackUrl }: { title: string; description: string; callbackUrl: string }) {
    const { tx } = useI18n();
    return (
        <div className="flex flex-col items-start gap-4 rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 p-5 sm:flex-row sm:items-center dark:border-zinc-700 dark:bg-zinc-900/50">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-blue-600/10 text-blue-600 dark:text-blue-300">
                <Lock className="h-5 w-5" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
                <p className="font-bold">{title}</p>
                <p className="mt-0.5 text-sm text-zinc-600 dark:text-zinc-400">{description}</p>
            </div>
            <Link href={`/login?callbackUrl=${encodeURIComponent(callbackUrl)}`} className={cx(PRIMARY_BUTTON, FOCUS)}>
                <LogIn className="h-4 w-4" aria-hidden="true" />{tx({ TR: "Giriş yap", EN: "Sign in" })}
            </Link>
        </div>
    );
}

function Counter({ value, max }: { value: number; max: number }) {
    return <span className={cx("shrink-0 tabular-nums", value > max && "font-bold text-red-600 dark:text-red-400")} dir="ltr">{value}/{max}</span>;
}

function SectionHeading({ id, icon: Icon, eyebrow, title, description, actions }: { id: string; icon: LucideIcon; eyebrow: string; title: string; description: string; actions?: ReactNode }) {
    return (
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
            <div className="min-w-0">
                <p className="flex items-center gap-2 text-[12px] font-bold uppercase tracking-widest text-blue-600 dark:text-blue-300">
                    <Icon className="h-4 w-4" aria-hidden="true" />{eyebrow}
                </p>
                <h2 id={id} className="mt-1.5 text-2xl font-black tracking-tight sm:text-3xl">{title}</h2>
                <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">{description}</p>
            </div>
            {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
        </div>
    );
}

// ---------------------------------------------------------------------------
// FAQ
// ---------------------------------------------------------------------------

function FaqSection({ query, onAsk }: { query: string; onAsk: (title: string) => void }) {
    const { tx } = useI18n();
    const [category, setCategory] = useState("all");
    const [open, setOpen] = useState<string | null>(null);
    const matches = FAQS.filter((faq) => matchesSearch(
        [tx(faq.category), tx(faq.question), tx(faq.answer), faq.category.TR, faq.category.EN, faq.question.TR, faq.question.EN, faq.answer.TR, faq.answer.EN].join(" "),
        query,
    ));
    const visible = matches.filter((faq) => category === "all" || faq.category.EN === category);
    const searching = Boolean(query.trim());

    return (
        <section aria-labelledby="sss-title" id="sss" className="scroll-mt-24">
            <SectionHeading
                id="sss-title"
                icon={HelpCircle}
                eyebrow={tx({ TR: "Hazır yanıtlar", EN: "Quick answers" })}
                title={tx({ TR: "Sıkça sorulan sorular", EN: "Frequently asked questions" })}
                description={searching
                    ? tx({ TR: "Aramanızla eşleşen yanıtlar: {count}", EN: "Answers matching your search: {count}" }, { count: matches.length })
                    : tx({ TR: "Hesap, kod editörü, Hanogt AI, oyun motoru, gizlilik ve destek hakkında kısa yanıtlar.", EN: "Short answers about your account, the code editor, Hanogt AI, the game engine, privacy and support." })}
            />
            <div role="group" aria-label={tx({ TR: "Kategori filtresi", EN: "Category filter" })} className="-mx-1 mb-5 flex gap-1.5 overflow-x-auto px-1 pb-1">
                {[{ key: "all", label: tx({ TR: "Tümü", EN: "All" }), count: matches.length }, ...FAQ_CATEGORIES.map((item) => ({
                    key: item.EN,
                    label: tx(item),
                    count: matches.filter((faq) => faq.category.EN === item.EN).length,
                }))].map((chip) => {
                    const active = chip.key === category;
                    return (
                        <button
                            key={chip.key}
                            type="button"
                            aria-pressed={active}
                            onClick={() => setCategory(chip.key)}
                            className={cx(
                                "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-semibold transition",
                                active ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900" : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700",
                                FOCUS,
                            )}
                        >
                            {chip.label}
                            <span className={cx("rounded-full px-1.5 text-[11px] tabular-nums", active ? "bg-white/20 dark:bg-zinc-900/15" : "bg-zinc-200 dark:bg-zinc-700")}>{chip.count}</span>
                        </button>
                    );
                })}
            </div>

            {visible.length ? (
                <div className="grid gap-3 md:grid-cols-2">
                    {visible.map((faq) => {
                        const expanded = open === faq.id;
                        return (
                            <article key={faq.id} className="self-start overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900/70">
                                <h3>
                                    <button
                                        type="button"
                                        id={`faq-${faq.id}-button`}
                                        aria-expanded={expanded}
                                        aria-controls={`faq-${faq.id}-panel`}
                                        onClick={() => setOpen(expanded ? null : faq.id)}
                                        className={cx("flex w-full items-start gap-3 p-4 text-start sm:p-5", FOCUS)}
                                    >
                                        <span className="min-w-0 flex-1">
                                            <span className="mb-1.5 inline-block rounded-full bg-blue-50 px-2.5 py-0.5 text-[11px] font-bold text-blue-700 dark:bg-blue-500/10 dark:text-blue-300">{tx(faq.category)}</span>
                                            <span className="block font-semibold leading-snug">{tx(faq.question)}</span>
                                        </span>
                                        <ChevronDown className={cx("mt-1 h-5 w-5 shrink-0 text-zinc-400 transition", expanded && "rotate-180")} aria-hidden="true" />
                                    </button>
                                </h3>
                                {expanded ? (
                                    <div id={`faq-${faq.id}-panel`} role="region" aria-labelledby={`faq-${faq.id}-button`} className="border-t border-zinc-100 px-4 py-4 text-sm leading-6 text-zinc-600 sm:px-5 dark:border-zinc-800 dark:text-zinc-300">
                                        {tx(faq.answer)}
                                    </div>
                                ) : null}
                            </article>
                        );
                    })}
                </div>
            ) : (
                <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-zinc-300 px-6 py-10 text-center dark:border-zinc-700">
                    <Search className="h-6 w-6 text-zinc-400" aria-hidden="true" />
                    <p className="text-sm text-zinc-600 dark:text-zinc-400">
                        {tx({ TR: "Bu aramayla eşleşen hazır yanıt yok. Sorunuzu doğrudan ekibe iletebilirsiniz.", EN: "No ready answer matches this search. You can send your question straight to the team." })}
                    </p>
                    <button type="button" onClick={() => onAsk(query.trim())} className={cx(PRIMARY_BUTTON, FOCUS)}>
                        <Send className="h-4 w-4" aria-hidden="true" />{tx({ TR: "Ekibe sor", EN: "Ask the team" })}
                    </button>
                </div>
            )}
        </section>
    );
}

// ---------------------------------------------------------------------------
// Support tickets: composer
// ---------------------------------------------------------------------------

type TicketDraftState = {
    category: TicketCategory | null;
    title: string;
    description: string;
    severity: TicketSeverity | "";
    complaintSubject: ComplaintSubject | "";
    reportedUser: string;
    contentUrl: string;
    banScope: BanScope | "";
    banReference: string;
    technical: boolean;
    technicalInfo: { userAgent: string; page: string } | null;
};

const EMPTY_DRAFT: TicketDraftState = {
    category: null,
    title: "",
    description: "",
    severity: "",
    complaintSubject: "",
    reportedUser: "",
    contentUrl: "",
    banScope: "",
    banReference: "",
    technical: false,
    technicalInfo: null,
};

const DESCRIPTION_PLACEHOLDERS: Record<TicketCategory, Copy> = {
    complaint: { TR: "Neyi şikayet ediyorsunuz? Ne zaman ve nerede oldu?", EN: "What is the complaint about? When and where did it happen?" },
    request: { TR: "Ne istiyorsunuz ve neden? KVKK başvurularında hangi hakkınızı kullanmak istediğinizi yazın.", EN: "What would you like and why? For KVKK requests, say which right you want to exercise." },
    security: { TR: "Açık nerede, etkisi ne? Kimlik bilgisi veya başkasının verisini eklemeyin.", EN: "Where is the issue and what is its impact? Don't include credentials or other people's data." },
    ban_appeal: { TR: "Yasağın neden kaldırılması gerektiğini düşündüğünüzü açıklayın.", EN: "Explain why you think the ban should be lifted." },
    question: { TR: "Sorunuzu ayrıntılarıyla yazın…", EN: "Write your question in detail…" },
    feedback: { TR: "Görüşünüzü ya da önerinizi yazın…", EN: "Share your opinion or idea…" },
};

const OPTIONAL: Copy = { TR: "(isteğe bağlı)", EN: "(optional)" };

/** Browser and the page the visitor came from (same site only), shown before it is sent. */
function readTechnicalInfo() {
    let page = window.location.pathname + window.location.search;
    try {
        const referrer = document.referrer ? new URL(document.referrer) : null;
        if (referrer && referrer.origin === window.location.origin && referrer.pathname !== window.location.pathname) page = referrer.pathname + referrer.search;
    } catch {
        // An unreadable referrer leaves the current page.
    }
    return { userAgent: navigator.userAgent.slice(0, TICKET_LIMITS.userAgent), page: page.slice(0, TICKET_LIMITS.pageUrl) };
}

function FieldError({ id, code }: { id: string; code: SupportErrorCode | undefined }) {
    const { tx } = useI18n();
    if (!code) return null;
    return <p id={id} className="mt-1.5 text-[12px] font-semibold text-red-600 dark:text-red-400">{tx(errorCopy(code))}</p>;
}

/** Radio cards of a category-specific choice; the legend takes focus when the choice is missing. */
function ChoiceField<T extends string>({ id, legend, optional = false, options, value, onChange, error, columns = 2 }: {
    id: string;
    legend: string;
    optional?: boolean;
    options: readonly { value: T; label: string; hint?: string }[];
    value: T | "";
    onChange: (value: T) => void;
    error: SupportErrorCode | undefined;
    columns?: 2 | 3;
}) {
    const { tx } = useI18n();
    // Short options sit two to a row on phones; ones with a hint get the full width.
    const compact = options.every((option) => !option.hint);
    return (
        <fieldset className="mt-4" aria-describedby={error ? `${id}-error` : undefined}>
            <legend id={id} tabIndex={-1} className="mb-2 text-[13px] font-bold text-zinc-700 outline-none dark:text-zinc-200">
                {legend}{optional ? <span className="ms-1 font-normal text-zinc-400">{tx(OPTIONAL)}</span> : null}
            </legend>
            <div className={cx("grid gap-2", compact && "grid-cols-2", columns === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2")}>
                {options.map((option) => {
                    const checked = value === option.value;
                    return (
                        <label
                            key={option.value}
                            className={cx(
                                "flex cursor-pointer items-start gap-2.5 rounded-xl border p-2.5 transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-blue-500",
                                checked ? "border-blue-500 bg-blue-50 dark:border-blue-400/60 dark:bg-blue-500/10" : "border-zinc-200 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-800/50",
                            )}
                        >
                            <input type="radio" name={`${id}-input`} value={option.value} checked={checked} onChange={() => onChange(option.value)} className="mt-0.5 h-4 w-4 shrink-0 accent-blue-600" />
                            <span className="min-w-0">
                                <span className="block text-sm font-bold">{option.label}</span>
                                {option.hint ? <span className="block text-[11.5px] leading-snug text-zinc-500 dark:text-zinc-400">{option.hint}</span> : null}
                            </span>
                        </label>
                    );
                })}
            </div>
            <FieldError id={`${id}-error`} code={error} />
        </fieldset>
    );
}

/** One-line category-specific text with a counter. */
function LineField({ id, label, optional = false, value, max, onChange, error, placeholder, url = false }: {
    id: string;
    label: string;
    optional?: boolean;
    value: string;
    max: number;
    onChange: (value: string) => void;
    error: SupportErrorCode | undefined;
    placeholder: string;
    /** Addresses are typed left to right and get the URL keyboard. */
    url?: boolean;
}) {
    const { tx } = useI18n();
    return (
        <div className="mt-4">
            <div className="mb-1.5 flex items-center justify-between gap-3 text-[13px]">
                <label htmlFor={id} className="font-bold text-zinc-700 dark:text-zinc-200">
                    {label}{optional ? <span className="ms-1 font-normal text-zinc-400">{tx(OPTIONAL)}</span> : null}
                </label>
                <span className="text-[11px] text-zinc-500"><Counter value={value.length} max={max} /></span>
            </div>
            <input
                id={id}
                value={value}
                onChange={(event) => onChange(event.target.value)}
                maxLength={max + 20}
                autoComplete="off"
                inputMode={url ? "url" : undefined}
                dir={url ? "ltr" : "auto"}
                aria-required={!optional || undefined}
                aria-invalid={Boolean(error) || undefined}
                aria-describedby={error ? `${id}-error` : undefined}
                placeholder={placeholder}
                className={INPUT}
            />
            <FieldError id={`${id}-error`} code={error} />
        </div>
    );
}

function TicketComposer({ draft, setDraft, onCreated }: {
    draft: TicketDraftState;
    setDraft: (update: (draft: TicketDraftState) => TicketDraftState) => void;
    onCreated: (ticket: SupportTicketView) => void;
}) {
    const { tx } = useI18n();
    const errorText = useErrorText();
    const uid = useId();
    const [errors, setErrors] = useState<Partial<Record<TicketField, SupportErrorCode>>>({});
    const [failure, setFailure] = useState<ApiFailure | null>(null);
    const [sending, setSending] = useState(false);
    const [created, setCreated] = useState<SupportTicketView | null>(null);
    // Every field's element id is `${uid}-<field>`, so a validation error can focus it.
    const fieldId = (field: TicketField) => `${uid}-${field}`;
    const technicalId = `${uid}-technical`;

    const update = (patch: Partial<TicketDraftState>) => {
        setDraft((current) => ({ ...current, ...patch }));
        setCreated(null);
        if (failure) setFailure(null);
        const touched = Object.keys(patch) as TicketField[];
        // Fields that disappear with the change take their errors with them.
        if ("category" in patch) touched.push("severity", "complaintSubject", "reportedUser", "contentUrl", "banScope", "banReference");
        if ("banScope" in patch) touched.push("banReference");
        if (touched.some((field) => errors[field])) setErrors((current) => Object.fromEntries(Object.entries(current).filter(([field]) => !touched.includes(field as TicketField))));
    };

    const submit = async (event: FormEvent) => {
        event.preventDefault();
        // Only the fields of the chosen category are sent.
        const category = draft.category;
        const input = {
            category,
            title: draft.title,
            description: draft.description,
            severity: category === "security" && draft.severity ? draft.severity : undefined,
            complaintSubject: category === "complaint" && draft.complaintSubject ? draft.complaintSubject : undefined,
            reportedUser: category === "complaint" ? draft.reportedUser : undefined,
            contentUrl: category === "complaint" ? draft.contentUrl : undefined,
            banScope: category === "ban_appeal" && draft.banScope ? draft.banScope : undefined,
            banReference: category === "ban_appeal" && draft.banScope !== "account" ? draft.banReference : undefined,
        };
        const checked = validateTicketDraft(input);
        if (!checked.ok) {
            setErrors(Object.fromEntries(checked.errors.map((error) => [error.field, error.code])));
            const first = checked.errors[0]?.field;
            if (first) document.getElementById(fieldId(first))?.focus();
            return;
        }
        setSending(true);
        setFailure(null);
        const result = await post<SupportTicketResponse>("/api/support", {
            action: "create",
            ...input,
            technical: draft.technical,
            technicalPage: draft.technical ? draft.technicalInfo?.page : undefined,
        });
        setSending(false);
        if (!result.ok) {
            setFailure(result);
            return;
        }
        setErrors({});
        setDraft((current) => ({ ...EMPTY_DRAFT, technical: current.technical, technicalInfo: current.technicalInfo }));
        setCreated(result.data.ticket);
        onCreated(result.data.ticket);
    };

    const category = draft.category;
    return (
        <form id="talep-olustur" onSubmit={(event) => void submit(event)} noValidate className={cx(CARD, "scroll-mt-24 p-5 sm:p-6")} aria-labelledby={`${uid}-heading`}>
            <div className="flex items-start gap-3">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-blue-600 to-violet-600 text-white shadow-lg shadow-blue-600/20">
                    <Plus className="h-5 w-5" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                    <h3 id={`${uid}-heading`} className="text-lg font-black">{tx({ TR: "Talep oluştur", EN: "Create a ticket" })}</h3>
                    <p className="text-sm text-zinc-600 dark:text-zinc-400">{tx({ TR: "Yalnızca siz ve Hanogt ekibi görürsünüz.", EN: "Only you and the Hanogt team can see it." })}</p>
                </div>
            </div>

            <fieldset className="mt-5">
                <legend id={fieldId("category")} tabIndex={-1} className="mb-2 text-[13px] font-bold text-zinc-700 outline-none dark:text-zinc-200">{tx({ TR: "Kategori", EN: "Category" })}</legend>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3" aria-describedby={errors.category ? `${uid}-category-error` : undefined}>
                    {TICKET_CATEGORIES.map((value) => {
                        const Icon = CATEGORY_ICONS[TICKET_CATEGORY_COPY[value].icon];
                        const checked = category === value;
                        return (
                            <label
                                key={value}
                                className={cx(
                                    "relative flex min-h-[5.25rem] cursor-pointer flex-col gap-1 rounded-2xl border p-3 transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-blue-500",
                                    checked
                                        ? "border-blue-500 bg-blue-50 dark:border-blue-400/60 dark:bg-blue-500/10"
                                        : "border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:border-zinc-700 dark:hover:bg-zinc-800/50",
                                )}
                            >
                                <input type="radio" name={`${uid}-category-input`} value={value} checked={checked} onChange={() => update({ category: value })} className="sr-only" />
                                <span className="flex items-center gap-2 pe-5 text-sm font-bold">
                                    <Icon className={cx("h-4 w-4 shrink-0", value === "security" ? "text-red-500" : "text-blue-600 dark:text-blue-300")} aria-hidden="true" />
                                    <span className="min-w-0">{tx(TICKET_CATEGORY_COPY[value].label)}</span>
                                </span>
                                <span className="text-[11.5px] leading-snug text-zinc-500 dark:text-zinc-400">{tx(TICKET_CATEGORY_COPY[value].hint)}</span>
                                {value === "request" ? <span className="text-[11.5px] font-semibold leading-snug text-blue-700 dark:text-blue-300">{tx(KVKK_REQUEST_HINT)}</span> : null}
                                {checked ? <Check className="absolute end-2.5 top-2.5 h-4 w-4 text-blue-600 dark:text-blue-300" aria-hidden="true" /> : null}
                            </label>
                        );
                    })}
                </div>
                <FieldError id={`${uid}-category-error`} code={errors.category} />
            </fieldset>

            {category === "security" ? (
                <Notice tone="warning" className="mt-4">
                    <p className="font-bold">{tx({ TR: "Sorumlu açıklama", EN: "Responsible disclosure" })}</p>
                    <p className="mt-1">
                        {tx({
                            TR: "Ayrıntıları herkese açık panoda, sosyal medyada ya da başka bir yerde paylaşmayın; size bu talep üzerinden özel olarak yanıt veririz. Yalnızca kendi hesabınızla test edin, başkalarının verilerine erişmeyin ve hizmeti aksatacak denemeler (DoS, spam) yapmayın. Gerçek parola, API anahtarı veya kişisel veri yerine yeniden üretme adımlarını yazın.",
                            EN: "Don't share the details on the public board, social media or anywhere else; we'll answer you privately in this ticket. Test only with your own account, don't access other people's data and don't run tests that disrupt the service (DoS, spam). Write the steps to reproduce instead of real passwords, API keys or personal data.",
                        })}
                    </p>
                </Notice>
            ) : category === "request" ? (
                <Notice tone="info" className="mt-4">
                    {tx({
                        TR: "KVKK başvurularında hangi hakkınızı kullanmak istediğinizi yazın. Başvurunuzu hesabınızın e-posta adresiyle doğrular, en geç 30 gün içinde ücretsiz yanıtlarız.",
                        EN: "For KVKK requests, say which right you want to exercise. We verify the request with your account's e-mail address and answer free of charge within 30 days.",
                    })}
                </Notice>
            ) : category === "ban_appeal" ? (
                <Notice tone="info" className="mt-4">
                    {tx({
                        TR: "Hesabınız askıya alındıysa itirazınızı giriş sayfasından gönderin: hesabınızla giriş yapmayı denediğinizde itiraz formu açılır. Bu form, giriş yapabildiğiniz hâlde uygulanan yasaklar (ör. bir gruptan yasaklanma) içindir.",
                        EN: "If your account is suspended, send your appeal from the sign-in page: the appeal form opens when you try to sign in with your account. This form is for bans that still let you sign in (e.g. a ban from a group).",
                    })}
                </Notice>
            ) : null}

            {category === "complaint" ? (
                <>
                    <ChoiceField
                        id={fieldId("complaintSubject")}
                        legend={tx({ TR: "Şikayet konusu", EN: "What is it about?" })}
                        optional
                        columns={3}
                        options={COMPLAINT_SUBJECTS.map((value) => ({ value, label: tx(COMPLAINT_SUBJECT_COPY[value]) }))}
                        value={draft.complaintSubject}
                        onChange={(value) => update({ complaintSubject: value })}
                        error={errors.complaintSubject}
                    />
                    <LineField
                        id={fieldId("reportedUser")}
                        label={tx({ TR: "Şikayet ettiğiniz kullanıcı", EN: "User you're complaining about" })}
                        optional
                        value={draft.reportedUser}
                        max={TICKET_LIMITS.reportedUser}
                        onChange={(value) => update({ reportedUser: value })}
                        error={errors.reportedUser}
                        placeholder={tx({ TR: "Kullanıcı adı ya da takmaad#etiket", EN: "User name or nickname#tag" })}
                    />
                    <LineField
                        id={fieldId("contentUrl")}
                        label={tx({ TR: "İçerik bağlantısı", EN: "Link to the content" })}
                        optional
                        url
                        value={draft.contentUrl}
                        max={TICKET_LIMITS.pageUrl}
                        onChange={(value) => update({ contentUrl: value })}
                        error={errors.contentUrl}
                        placeholder="https://hanogtcodev.com/…"
                    />
                </>
            ) : null}

            {category === "ban_appeal" ? (
                <>
                    <ChoiceField
                        id={fieldId("banScope")}
                        legend={tx({ TR: "Neyden yasaklandınız?", EN: "What were you banned from?" })}
                        columns={3}
                        options={BAN_SCOPES.map((value) => ({ value, label: tx(BAN_SCOPE_COPY[value].label), hint: tx(BAN_SCOPE_COPY[value].hint) }))}
                        value={draft.banScope}
                        onChange={(value) => update({ banScope: value })}
                        error={errors.banScope}
                    />
                    {draft.banScope === "group" || draft.banScope === "other" ? (
                        <LineField
                            id={fieldId("banReference")}
                            label={draft.banScope === "group" ? tx({ TR: "Grup adı", EN: "Group name" }) : tx({ TR: "Yasağın olduğu yer", EN: "Where the ban applies" })}
                            optional={draft.banScope !== "group"}
                            value={draft.banReference}
                            max={TICKET_LIMITS.banReference}
                            onChange={(value) => update({ banReference: value })}
                            error={errors.banReference}
                            placeholder={draft.banScope === "group" ? tx({ TR: "Yasaklandığınız grubun adı", EN: "Name of the group that banned you" }) : tx({ TR: "Ör. bir özellik ya da sayfa", EN: "E.g. a feature or a page" })}
                        />
                    ) : null}
                </>
            ) : null}

            <div className="mt-4">
                <div className="mb-1.5 flex items-center justify-between gap-3 text-[13px]">
                    <label htmlFor={fieldId("title")} className="font-bold text-zinc-700 dark:text-zinc-200">{tx({ TR: "Başlık", EN: "Title" })}</label>
                    <span className="text-[11px] text-zinc-500"><Counter value={draft.title.length} max={TICKET_LIMITS.title} /></span>
                </div>
                <input
                    id={fieldId("title")}
                    name="title"
                    value={draft.title}
                    onChange={(event) => update({ title: event.target.value })}
                    maxLength={TICKET_LIMITS.title + 20}
                    aria-required="true"
                    aria-invalid={Boolean(errors.title) || undefined}
                    aria-describedby={errors.title ? `${fieldId("title")}-error` : undefined}
                    placeholder={tx({ TR: "Kısaca konu, ör. \"Editörde kaydet düğmesi çalışmıyor\"", EN: "The topic in a few words, e.g. \"Save button doesn't work in the editor\"" })}
                    className={INPUT}
                />
                <FieldError id={`${fieldId("title")}-error`} code={errors.title} />
            </div>

            <div className="mt-4">
                <div className="mb-1.5 flex items-center justify-between gap-3 text-[13px]">
                    <label htmlFor={fieldId("description")} className="font-bold text-zinc-700 dark:text-zinc-200">
                        {category === "ban_appeal" ? tx({ TR: "Açıklamanız", EN: "Your explanation" }) : tx({ TR: "Açıklama", EN: "Description" })}
                    </label>
                    <span className="text-[11px] text-zinc-500"><Counter value={draft.description.length} max={TICKET_LIMITS.description} /></span>
                </div>
                <textarea
                    id={fieldId("description")}
                    value={draft.description}
                    onChange={(event) => update({ description: event.target.value })}
                    rows={5}
                    aria-required="true"
                    aria-invalid={Boolean(errors.description) || undefined}
                    aria-describedby={errors.description ? `${fieldId("description")}-error` : undefined}
                    placeholder={category ? tx(DESCRIPTION_PLACEHOLDERS[category]) : tx({ TR: "Ayrıntıları yazın…", EN: "Write the details…" })}
                    className={cx(INPUT, "resize-y leading-relaxed")}
                />
                <FieldError id={`${fieldId("description")}-error`} code={errors.description} />
            </div>

            {category === "security" ? (
                <ChoiceField
                    id={fieldId("severity")}
                    legend={tx({ TR: "Önem derecesi", EN: "Severity" })}
                    optional
                    options={TICKET_SEVERITIES.map((value) => ({ value, label: tx(TICKET_SEVERITY_COPY[value].label), hint: tx(TICKET_SEVERITY_COPY[value].hint) }))}
                    value={draft.severity}
                    onChange={(value) => update({ severity: value })}
                    error={errors.severity}
                />
            ) : null}

            <div className="mt-4 rounded-2xl border border-zinc-200 bg-zinc-50 p-3.5 dark:border-zinc-800 dark:bg-zinc-950/40">
                <label htmlFor={technicalId} className="flex cursor-pointer items-start gap-3">
                    <input
                        id={technicalId}
                        type="checkbox"
                        checked={draft.technical}
                        onChange={(event) => update({ technical: event.target.checked, technicalInfo: event.target.checked ? readTechnicalInfo() : null })}
                        className="mt-0.5 h-4 w-4 shrink-0 accent-blue-600"
                    />
                    <span className="min-w-0 text-sm">
                        <span className="flex items-center gap-1.5 font-bold"><Monitor className="h-4 w-4 text-zinc-500" aria-hidden="true" />{tx({ TR: "Teknik bilgileri ekle", EN: "Add technical details" })}</span>
                        <span className="mt-0.5 block text-[12px] text-zinc-500 dark:text-zinc-400">{tx({ TR: "Tarayıcı bilginiz ve geldiğiniz sayfa talebe eklenir; yalnızca ekip görür. Bir hatayı bildirirken işe yarar.", EN: "Your browser information and the page you came from are attached; only the team sees them. Useful when you report a bug." })}</span>
                    </span>
                </label>
                {draft.technical && draft.technicalInfo ? (
                    <dl className="mt-3 space-y-1.5 border-t border-zinc-200 pt-3 text-[12px] dark:border-zinc-800">
                        <div className="flex flex-wrap gap-x-2">
                            <dt className="font-bold text-zinc-600 dark:text-zinc-300">{tx({ TR: "Sayfa", EN: "Page" })}</dt>
                            <dd className="min-w-0 break-all text-zinc-500" dir="ltr">{draft.technicalInfo.page}</dd>
                        </div>
                        <div className="flex flex-wrap gap-x-2">
                            <dt className="font-bold text-zinc-600 dark:text-zinc-300">{tx({ TR: "Tarayıcı", EN: "Browser" })}</dt>
                            <dd className="min-w-0 break-all text-zinc-500" dir="ltr">{draft.technicalInfo.userAgent}</dd>
                        </div>
                    </dl>
                ) : null}
            </div>

            <p className="mt-4 flex items-start gap-2 text-[12px] leading-relaxed text-zinc-500 dark:text-zinc-400">
                <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                {tx({ TR: "Parola, API anahtarı veya kart bilgisi gibi gizli bilgileri hiçbir talebe eklemeyin. Ekip bunları asla istemez.", EN: "Never add secrets such as passwords, API keys or card details to a ticket. The team will never ask for them." })}
            </p>

            {failure ? <Notice tone="error" className="mt-4">{errorText(failure)}</Notice> : null}
            {created ? (
                <Notice tone="success" className="mt-4">
                    {tx({ TR: "Talebiniz alındı (#{ref}). Yanıtları Taleplerim bölümünde görebilirsiniz.", EN: "Your ticket was received (#{ref}). You'll find the replies under My tickets." }, { ref: created.reference })}
                </Notice>
            ) : null}

            <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
                <button type="submit" disabled={sending} aria-busy={sending || undefined} className={cx(PRIMARY_BUTTON, FOCUS, "w-full sm:w-auto")}>
                    {sending ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Send className="h-4 w-4" aria-hidden="true" />}
                    {tx({ TR: "Talebi gönder", EN: "Send ticket" })}
                </button>
            </div>
        </form>
    );
}

// ---------------------------------------------------------------------------
// Support tickets: list and conversation
// ---------------------------------------------------------------------------

function TicketStatusBadge({ status }: { status: TicketStatus }) {
    const { tx } = useI18n();
    return <Badge tone={STATUS_TONES[status]}>{tx(TICKET_STATUS_COPY[status].label)}</Badge>;
}

function TicketList({ resource, onSelect }: { resource: AdminResource<SupportListResponse>; onSelect: (id: string) => void }) {
    const { tx } = useI18n();
    const errorText = useErrorText();
    const tickets = resource.data?.tickets ?? [];

    if (!resource.data && resource.loading) {
        return (
            <div role="status" className="space-y-2.5">
                <span className="sr-only">{tx({ TR: "Talepler yükleniyor…", EN: "Loading tickets…" })}</span>
                {[0, 1, 2].map((index) => <div key={index} className="h-20 animate-pulse rounded-2xl bg-zinc-100 dark:bg-zinc-800/60" />)}
            </div>
        );
    }
    return (
        <div className="space-y-3">
            {resource.error ? (
                <Notice tone="error" action={<button type="button" onClick={resource.reload} className={cx(GHOST_BUTTON, FOCUS)}><RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />{tx({ TR: "Tekrar dene", EN: "Try again" })}</button>}>
                    {errorText(resource.error)}
                </Notice>
            ) : null}
            {tickets.length === 0 && !resource.error ? (
                <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-zinc-300 px-6 py-10 text-center dark:border-zinc-700">
                    <Inbox className="h-7 w-7 text-zinc-400" aria-hidden="true" />
                    <p className="font-bold">{tx({ TR: "Henüz talebiniz yok", EN: "No tickets yet" })}</p>
                    <p className="max-w-xs text-sm text-zinc-500 dark:text-zinc-400">{tx({ TR: "Gönderdiğiniz talepler ve ekibin yanıtları burada görünür.", EN: "Tickets you send and the team's replies appear here." })}</p>
                </div>
            ) : (
                <ul className="space-y-2" aria-label={tx({ TR: "Taleplerim", EN: "My tickets" })}>
                    {tickets.map((ticket) => {
                        const Icon = CATEGORY_ICONS[TICKET_CATEGORY_COPY[ticket.category].icon];
                        return (
                            <li key={ticket.id}>
                                <button
                                    type="button"
                                    onClick={() => onSelect(ticket.id)}
                                    className={cx(
                                        "w-full rounded-2xl border p-3.5 text-start transition hover:shadow-sm",
                                        ticket.unread ? "border-violet-300 bg-violet-50/70 dark:border-violet-500/40 dark:bg-violet-500/10" : "border-zinc-200 bg-white hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-900/60 dark:hover:border-zinc-700",
                                        FOCUS,
                                    )}
                                >
                                    <span className="flex flex-wrap items-center gap-1.5 text-[11.5px] text-zinc-500">
                                        <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                                        <span className="font-semibold">{tx(TICKET_CATEGORY_COPY[ticket.category].label)}</span>
                                        <span aria-hidden="true">·</span>
                                        <span className="font-mono" dir="ltr">#{ticket.reference}</span>
                                        <span className="ms-auto"><TicketStatusBadge status={ticket.status} /></span>
                                    </span>
                                    <span className="mt-1.5 flex items-start gap-2">
                                        {ticket.unread ? <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-violet-500" aria-hidden="true" /> : null}
                                        <span className="line-clamp-2 min-w-0 break-words text-sm font-bold text-zinc-900 dark:text-white" dir="auto">{ticket.title}</span>
                                    </span>
                                    <span className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-zinc-500">
                                        {ticket.unread ? <span className="font-bold text-violet-700 dark:text-violet-300">{tx({ TR: "Yeni yanıt", EN: "New reply" })}</span> : null}
                                        <RelativeTime iso={ticket.lastMessageAt} />
                                        <span className="inline-flex items-center gap-1"><MessageCircle className="h-3 w-3" aria-hidden="true" />{ticket.messageCount}</span>
                                    </span>
                                </button>
                            </li>
                        );
                    })}
                </ul>
            )}
        </div>
    );
}

function MessageBubble({ message, mine }: { message: Pick<SupportTicketMessage, "from" | "text" | "createdAt">; mine: boolean }) {
    const { tx } = useI18n();
    const staff = message.from === "staff";
    return (
        <li className={cx("flex", mine ? "justify-end" : "justify-start")}>
            <div className={cx(
                "max-w-[92%] rounded-2xl px-3.5 py-2.5 sm:max-w-[85%]",
                staff ? "rounded-ss-md border border-violet-200 bg-violet-50 dark:border-violet-500/30 dark:bg-violet-500/10" : "rounded-se-md bg-blue-600 text-white",
            )}>
                <p className={cx("mb-1 flex flex-wrap items-center gap-1.5 text-[11.5px]", staff ? "text-violet-700 dark:text-violet-300" : "text-blue-100")}>
                    {staff ? <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" /> : null}
                    <span className="font-bold">{staff ? tx(TEAM_NAME) : tx({ TR: "Siz", EN: "You" })}</span>
                    <span aria-hidden="true">·</span>
                    <RelativeTime iso={message.createdAt} />
                </p>
                <p className={cx("whitespace-pre-wrap break-words text-sm leading-relaxed", staff && "text-zinc-800 dark:text-zinc-100")} dir="auto">{message.text}</p>
            </div>
        </li>
    );
}

function TicketThread({ id, onBack, onChange }: { id: string; onBack: () => void; onChange: (ticket: SupportTicketView) => void }) {
    const { tx } = useI18n();
    const errorText = useErrorText();
    const uid = useId();
    const detail = useAdminResource<SupportTicketResponse>(`/api/support?id=${id}`);
    const ticket = detail.data?.ticket.id === id ? detail.data.ticket : null;
    const [reply, setReply] = useState("");
    const [busy, setBusy] = useState<"reply" | "close" | "reopen" | null>(null);
    const [failure, setFailure] = useState<ApiFailure | null>(null);
    const markedRead = useRef<string | null>(null);
    const { mutate } = detail;

    const apply = useCallback((next: SupportTicketView) => {
        mutate(() => ({ ticket: next }));
        onChange(next);
    }, [mutate, onChange]);

    // Opening a ticket with a new team reply marks it as read.
    useEffect(() => {
        if (!ticket?.unread || markedRead.current === ticket.id) return;
        markedRead.current = ticket.id;
        void post<SupportTicketResponse>("/api/support", { action: "markRead", id: ticket.id }).then((result) => {
            if (result.ok) apply(result.data.ticket);
        });
    }, [apply, ticket]);

    const act = async (action: "reply" | "close" | "reopen") => {
        if (!ticket) return;
        let text = "";
        if (action === "reply") {
            const checked = validateTicketMessage(reply);
            if (!checked.ok) {
                setFailure({ ok: false, status: 400, code: checked.code, retryAfter: null });
                return;
            }
            text = checked.text;
        }
        setBusy(action);
        setFailure(null);
        const result = await post<SupportTicketResponse>("/api/support", action === "reply" ? { action, id: ticket.id, text } : { action, id: ticket.id });
        setBusy(null);
        if (!result.ok) {
            setFailure(result);
            return;
        }
        if (action === "reply") setReply("");
        apply(result.data.ticket);
    };

    const onReplyKey = (event: KeyboardEvent<HTMLTextAreaElement>) => {
        if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
            event.preventDefault();
            void act("reply");
        }
    };

    const back = (
        <button type="button" onClick={onBack} className={cx(GHOST_BUTTON, FOCUS, "-ms-2")}>
            <ArrowLeft className="h-4 w-4 rtl:rotate-180" aria-hidden="true" />{tx({ TR: "Taleplerim", EN: "My tickets" })}
        </button>
    );

    if (!ticket) {
        return (
            <div className="space-y-4">
                {back}
                {detail.error ? (
                    <Notice tone="error" action={detail.error.status === 404 || detail.error.code === "invalid_id" ? undefined : <button type="button" onClick={detail.reload} className={cx(GHOST_BUTTON, FOCUS)}><RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />{tx({ TR: "Tekrar dene", EN: "Try again" })}</button>}>
                        {detail.error.status === 404 || detail.error.code === "invalid_id"
                            ? tx({ TR: "Talep bulunamadı. Silinmiş olabilir ya da başka bir hesaba ait olabilir.", EN: "The ticket wasn't found. It may have been deleted or belong to another account." })
                            : errorText(detail.error)}
                    </Notice>
                ) : (
                    <div role="status" className="space-y-3">
                        <span className="sr-only">{tx({ TR: "Talep yükleniyor…", EN: "Loading the ticket…" })}</span>
                        <div className="h-6 w-2/3 animate-pulse rounded-full bg-zinc-100 dark:bg-zinc-800/60" />
                        <div className="h-28 animate-pulse rounded-2xl bg-zinc-100 dark:bg-zinc-800/60" />
                    </div>
                )}
            </div>
        );
    }

    const Icon = CATEGORY_ICONS[TICKET_CATEGORY_COPY[ticket.category].icon];
    const closed = ticket.status === "closed";
    const meta = ticket.meta;
    const hasMeta = Boolean(meta.appeal || meta.severity || meta.complaintSubject || meta.reportedUser || meta.contentUrl || meta.banScope || meta.banReference
        || meta.steps || meta.pageUrl || meta.userAgent);
    return (
        <article aria-labelledby={`${uid}-title`} className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
                {back}
                <button type="button" onClick={detail.reload} disabled={detail.loading} className={cx(GHOST_BUTTON, FOCUS)}>
                    <RefreshCw className={cx("h-3.5 w-3.5", detail.loading && "animate-spin")} aria-hidden="true" />{tx({ TR: "Yenile", EN: "Refresh" })}
                </button>
            </div>
            <header>
                <p className="flex flex-wrap items-center gap-1.5 text-[12px] text-zinc-500">
                    <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                    <span className="font-semibold">{tx(TICKET_CATEGORY_COPY[ticket.category].label)}</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono" dir="ltr">#{ticket.reference}</span>
                    <span aria-hidden="true">·</span>
                    <RelativeTime iso={ticket.createdAt} />
                </p>
                <h3 id={`${uid}-title`} className="mt-1.5 break-words text-lg font-black leading-snug" dir="auto">{ticket.title}</h3>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                    <TicketStatusBadge status={ticket.status} />
                    <span className="text-[12px] text-zinc-500 dark:text-zinc-400">{tx(TICKET_STATUS_COPY[ticket.status].hint)}</span>
                </div>
            </header>

            {hasMeta ? (
                <details className="group rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm dark:border-zinc-800 dark:bg-zinc-950/40">
                    <summary className={cx("flex cursor-pointer list-none items-center justify-between gap-2 font-bold", FOCUS)}>
                        {tx({ TR: "Gönderdiğiniz ayrıntılar", EN: "Details you sent" })}
                        <ChevronDown className="h-4 w-4 text-zinc-400 transition group-open:rotate-180" aria-hidden="true" />
                    </summary>
                    <dl className="mt-3 space-y-2 text-[13px]">
                        {meta.appeal ? (
                            <div>
                                <dt className="font-semibold text-zinc-600 dark:text-zinc-300">{tx({ TR: "Gönderildiği yer", EN: "Sent from" })}</dt>
                                <dd className="mt-0.5 text-zinc-700 dark:text-zinc-300">{tx({ TR: "Giriş sayfasındaki askıya alma itirazı formu", EN: "The suspension appeal form on the sign-in page" })}</dd>
                            </div>
                        ) : null}
                        {meta.complaintSubject ? (
                            <div className="flex flex-wrap items-center gap-2">
                                <dt className="font-semibold text-zinc-600 dark:text-zinc-300">{tx({ TR: "Şikayet konusu", EN: "Complaint about" })}</dt>
                                <dd><Badge tone="fuchsia">{tx(COMPLAINT_SUBJECT_COPY[meta.complaintSubject])}</Badge></dd>
                            </div>
                        ) : null}
                        {meta.reportedUser ? (
                            <div>
                                <dt className="font-semibold text-zinc-600 dark:text-zinc-300">{tx({ TR: "Şikayet ettiğiniz kullanıcı", EN: "User you complained about" })}</dt>
                                <dd className="mt-0.5 break-words text-zinc-700 dark:text-zinc-300" dir="auto">{meta.reportedUser}</dd>
                            </div>
                        ) : null}
                        {meta.contentUrl ? (
                            <div>
                                <dt className="font-semibold text-zinc-600 dark:text-zinc-300">{tx({ TR: "İçerik bağlantısı", EN: "Link to the content" })}</dt>
                                <dd className="mt-0.5 break-all text-zinc-600 dark:text-zinc-400" dir="ltr">{meta.contentUrl}</dd>
                            </div>
                        ) : null}
                        {meta.banScope ? (
                            <div className="flex flex-wrap items-center gap-2">
                                <dt className="font-semibold text-zinc-600 dark:text-zinc-300">{tx({ TR: "Yasak türü", EN: "Type of ban" })}</dt>
                                <dd><Badge tone="amber">{tx(BAN_SCOPE_COPY[meta.banScope].label)}</Badge></dd>
                            </div>
                        ) : null}
                        {meta.banReference ? (
                            <div>
                                <dt className="font-semibold text-zinc-600 dark:text-zinc-300">{meta.banScope === "group" ? tx({ TR: "Grup adı", EN: "Group name" }) : tx({ TR: "Yasağın olduğu yer", EN: "Where the ban applies" })}</dt>
                                <dd className="mt-0.5 break-words text-zinc-700 dark:text-zinc-300" dir="auto">{meta.banReference}</dd>
                            </div>
                        ) : null}
                        {meta.severity ? (
                            <div className="flex flex-wrap items-center gap-2">
                                <dt className="font-semibold text-zinc-600 dark:text-zinc-300">{tx({ TR: "Önem derecesi", EN: "Severity" })}</dt>
                                <dd><Badge tone={SEVERITY_TONES[meta.severity]}>{tx(TICKET_SEVERITY_COPY[meta.severity].label)}</Badge></dd>
                            </div>
                        ) : null}
                        {meta.steps ? (
                            <div>
                                <dt className="font-semibold text-zinc-600 dark:text-zinc-300">{tx({ TR: "Adımlar", EN: "Steps" })}</dt>
                                <dd className="mt-1 whitespace-pre-wrap break-words text-zinc-700 dark:text-zinc-300" dir="auto">{meta.steps}</dd>
                            </div>
                        ) : null}
                        {meta.pageUrl ? (
                            <div>
                                <dt className="font-semibold text-zinc-600 dark:text-zinc-300">{tx({ TR: "Sayfa", EN: "Page" })}</dt>
                                <dd className="mt-0.5 break-all text-zinc-600 dark:text-zinc-400" dir="ltr">{meta.pageUrl}</dd>
                            </div>
                        ) : null}
                        {meta.userAgent ? (
                            <div>
                                <dt className="font-semibold text-zinc-600 dark:text-zinc-300">{tx({ TR: "Tarayıcı", EN: "Browser" })}</dt>
                                <dd className="mt-0.5 break-all text-zinc-600 dark:text-zinc-400" dir="ltr">{meta.userAgent}</dd>
                            </div>
                        ) : null}
                    </dl>
                </details>
            ) : null}

            <ol className="space-y-3" aria-label={tx({ TR: "Konuşma", EN: "Conversation" })}>
                <MessageBubble message={{ from: "user", text: ticket.description, createdAt: ticket.createdAt }} mine />
                {ticket.messages.map((message) => <MessageBubble key={message.id} message={message} mine={message.from === "user"} />)}
            </ol>
            {ticket.messages.length === 0 ? (
                <p className="text-center text-[12px] text-zinc-500">{tx({ TR: "Ekip talebinizi gördüğünde yanıtı burada görünecek.", EN: "The team's reply will appear here once they've seen your ticket." })}</p>
            ) : null}

            {failure ? <Notice tone="error">{errorText(failure)}</Notice> : null}

            {closed ? (
                <Notice tone="info" action={(
                    <button type="button" onClick={() => void act("reopen")} disabled={busy !== null} className={cx(SECONDARY_BUTTON, FOCUS)}>
                        {busy === "reopen" ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : <RotateCcw className="h-4 w-4" aria-hidden="true" />}
                        {tx({ TR: "Yeniden aç", EN: "Reopen" })}
                    </button>
                )}>
                    {tx({ TR: "Bu talep kapatıldı. Yeniden açarak yazmaya devam edebilirsiniz.", EN: "This ticket is closed. Reopen it to keep writing." })}
                </Notice>
            ) : (
                <form onSubmit={(event) => { event.preventDefault(); void act("reply"); }} className="space-y-2">
                    <div className="flex items-center justify-between gap-3 text-[13px]">
                        <label htmlFor={`${uid}-reply`} className="font-bold text-zinc-700 dark:text-zinc-200">{tx({ TR: "Mesaj yazın", EN: "Write a message" })}</label>
                        <span className="text-[11px] text-zinc-500"><Counter value={reply.length} max={TICKET_LIMITS.message} /></span>
                    </div>
                    <textarea
                        id={`${uid}-reply`}
                        value={reply}
                        onChange={(event) => { setReply(event.target.value); if (failure) setFailure(null); }}
                        onKeyDown={onReplyKey}
                        rows={3}
                        disabled={busy !== null}
                        placeholder={tx({ TR: "Ek bilgi veya soru… (Ctrl+Enter ile gönderin)", EN: "More details or a question… (send with Ctrl+Enter)" })}
                        className={cx(INPUT, "resize-y leading-relaxed")}
                    />
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap gap-2">
                            {canUserReopen(ticket.status) ? (
                                <button type="button" onClick={() => void act("reopen")} disabled={busy !== null} className={cx(SECONDARY_BUTTON, FOCUS)}>
                                    {busy === "reopen" ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : <RotateCcw className="h-4 w-4" aria-hidden="true" />}
                                    {tx({ TR: "Yeniden aç", EN: "Reopen" })}
                                </button>
                            ) : null}
                            {canUserClose(ticket.status) ? (
                                <button type="button" onClick={() => void act("close")} disabled={busy !== null} className={cx(SECONDARY_BUTTON, FOCUS)}>
                                    {busy === "close" ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Check className="h-4 w-4" aria-hidden="true" />}
                                    {tx({ TR: "Talebi kapat", EN: "Close ticket" })}
                                </button>
                            ) : null}
                        </div>
                        <button type="submit" disabled={busy !== null || !reply.trim()} className={cx(PRIMARY_BUTTON, FOCUS)}>
                            {busy === "reply" ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Send className="h-4 w-4" aria-hidden="true" />}
                            {tx({ TR: "Gönder", EN: "Send" })}
                        </button>
                    </div>
                </form>
            )}
        </article>
    );
}

function SupportSection({ signedIn, authPending, tickets, activeTicket, linkedTicket, draft, setDraft, onSelect, onBack, onTicket }: {
    signedIn: boolean;
    authPending: boolean;
    tickets: AdminResource<SupportListResponse>;
    activeTicket: string | null;
    linkedTicket: string | null;
    draft: TicketDraftState;
    setDraft: (update: (draft: TicketDraftState) => TicketDraftState) => void;
    onSelect: (id: string) => void;
    onBack: () => void;
    onTicket: (ticket: SupportTicketView, select?: boolean) => void;
}) {
    const { tx } = useI18n();
    const count = tickets.data?.tickets.length ?? 0;
    return (
        <section aria-labelledby="destek-title" id="destek" className="scroll-mt-24">
            <SectionHeading
                id="destek-title"
                icon={LifeBuoy}
                eyebrow={tx({ TR: "Özel kanal", EN: "Private channel" })}
                title={tx({ TR: "Destek talepleri", EN: "Support tickets" })}
                description={tx({ TR: "Şikayetler, istekler (KVKK başvuruları dahil), güvenlik açıkları, ban kaldırma istekleri, sorular ve geri bildirimler doğrudan Hanogt ekibine gider. Talepleriniz herkese açık panoda görünmez.", EN: "Complaints, requests (including KVKK requests), security reports, unban requests, questions and feedback go straight to the Hanogt team. Your tickets never appear on the public board." })}
            />
            {authPending ? (
                <div role="status" className="grid gap-6 lg:grid-cols-2">
                    <span className="sr-only">{tx({ TR: "Yükleniyor…", EN: "Loading…" })}</span>
                    <div className="h-80 animate-pulse rounded-3xl bg-zinc-100 dark:bg-zinc-900" />
                    <div className="h-80 animate-pulse rounded-3xl bg-zinc-100 dark:bg-zinc-900" />
                </div>
            ) : !signedIn ? (
                <SignInCard
                    title={linkedTicket ? tx({ TR: "Bu talebi görmek için giriş yapın", EN: "Sign in to see this ticket" }) : tx({ TR: "Talep oluşturmak için giriş yapın", EN: "Sign in to create a ticket" })}
                    description={tx({ TR: "Talepler hesabınıza bağlıdır; böylece ekip size özel olarak yanıt verebilir ve yanıtları Taleplerim'de görürsünüz.", EN: "Tickets belong to your account, so the team can answer you privately and you'll see the replies under My tickets." })}
                    callbackUrl={linkedTicket ? `/feedback?ticket=${linkedTicket}` : "/feedback#destek"}
                />
            ) : (
                <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
                    <TicketComposer draft={draft} setDraft={setDraft} onCreated={(ticket) => onTicket(ticket, true)} />
                    <div id="taleplerim" className={cx(CARD, "scroll-mt-24 p-5 sm:p-6")}>
                        {activeTicket ? (
                            <TicketThread key={activeTicket} id={activeTicket} onBack={onBack} onChange={(ticket) => onTicket(ticket)} />
                        ) : (
                            <>
                                <div className="mb-4 flex items-center justify-between gap-3">
                                    <h3 className="flex items-center gap-2 text-lg font-black">
                                        <Inbox className="h-5 w-5 text-blue-600 dark:text-blue-300" aria-hidden="true" />
                                        {tx({ TR: "Taleplerim", EN: "My tickets" })}
                                        {count ? <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[12px] font-bold tabular-nums text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">{count}</span> : null}
                                    </h3>
                                    <button type="button" onClick={tickets.reload} disabled={tickets.loading} className={cx(GHOST_BUTTON, FOCUS)} aria-label={tx({ TR: "Talepleri yenile", EN: "Refresh tickets" })}>
                                        <RefreshCw className={cx("h-4 w-4", tickets.loading && "animate-spin")} aria-hidden="true" />
                                    </button>
                                </div>
                                <TicketList resource={tickets} onSelect={onSelect} />
                            </>
                        )}
                    </div>
                </div>
            )}
        </section>
    );
}

// ---------------------------------------------------------------------------
// Community board
// ---------------------------------------------------------------------------

type BoardType = BoardItem["type"];
type DeleteTarget = { itemId: string; commentId: string | null; excerpt: string };

function AuthorName({ author, onOpen, size = "md" }: { author: BoardAuthor | undefined; onOpen: (author: BoardAuthor) => void; size?: "sm" | "md" }) {
    const { tx } = useI18n();
    const name = author?.name || tx({ TR: "Hanogt kullanıcısı", EN: "Hanogt user" });
    const label = (
        <>
            <span className={cx("truncate font-bold text-zinc-800 dark:text-zinc-100", size === "sm" ? "text-[13px]" : "text-sm")}>{name}</span>
            {author?.nickname && author.nicknameTag ? <span className="hidden shrink-0 text-[11.5px] text-zinc-400 sm:inline" dir="ltr">{author.nickname}#{author.nicknameTag}</span> : null}
        </>
    );
    return (
        <span className="flex min-w-0 items-center gap-2">
            <Avatar src={author?.avatarUrl ?? null} name={name} size={size === "sm" ? 24 : 32} />
            {author?.profile ? (
                <button type="button" onClick={() => onOpen(author)} className={cx("flex min-w-0 items-center gap-1.5 rounded-md hover:underline", FOCUS)} title={tx({ TR: "Profili aç", EN: "Open profile" })}>
                    {label}
                </button>
            ) : (
                <span className="flex min-w-0 items-center gap-1.5">{label}</span>
            )}
            <StaffBadge role={parseStaffRole(author?.staffRole)} size="sm" compactOnMobile />
        </span>
    );
}

function BoardCommentView({ comment, author, signedIn, busy, onReply, onEdit, onDelete, onOpenAuthor }: {
    comment: BoardComment;
    author: BoardAuthor | undefined;
    signedIn: boolean;
    busy: boolean;
    onReply: () => void;
    onEdit: (content: string) => Promise<boolean>;
    onDelete: () => void;
    onOpenAuthor: (author: BoardAuthor) => void;
}) {
    const { tx } = useI18n();
    const [editing, setEditing] = useState(false);
    const [text, setText] = useState(comment.content);
    const save = async () => {
        if (await onEdit(text)) setEditing(false);
    };
    return (
        <li className={cx(
            "rounded-2xl border p-3",
            comment.official ? "border-violet-200 bg-violet-50/70 dark:border-violet-500/30 dark:bg-violet-500/10" : "border-zinc-100 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950/40",
        )}>
            <div className="flex flex-wrap items-center justify-between gap-2">
                {comment.official ? (
                    <span className="flex items-center gap-1.5 text-[13px] font-bold text-violet-700 dark:text-violet-300">
                        <ShieldCheck className="h-4 w-4" aria-hidden="true" />{tx(TEAM_NAME)}
                        <Badge tone="violet">{tx({ TR: "Resmî yanıt", EN: "Official reply" })}</Badge>
                    </span>
                ) : (
                    <AuthorName author={author} onOpen={onOpenAuthor} size="sm" />
                )}
                <span className="flex items-center gap-0.5">
                    <span className="me-1 text-[11.5px] text-zinc-400">
                        <RelativeTime iso={comment.createdAt} />
                        {comment.editedAt ? <span>{" · "}{tx({ TR: "düzenlendi", EN: "edited" })}</span> : null}
                    </span>
                    {signedIn ? (
                        <button type="button" onClick={onReply} className={cx("rounded-md p-1.5 text-zinc-400 transition hover:bg-zinc-200/60 hover:text-emerald-600 dark:hover:bg-zinc-800", FOCUS)} aria-label={tx({ TR: "Yanıtla", EN: "Reply" })} title={tx({ TR: "Yanıtla", EN: "Reply" })}>
                            <Reply className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                    ) : null}
                    {comment.own ? (
                        <>
                            <button type="button" onClick={() => { setText(comment.content); setEditing(true); }} disabled={busy} className={cx("rounded-md p-1.5 text-zinc-400 transition hover:bg-zinc-200/60 hover:text-blue-600 dark:hover:bg-zinc-800", FOCUS)} aria-label={tx({ TR: "Yorumu düzenle", EN: "Edit comment" })} title={tx({ TR: "Düzenle", EN: "Edit" })}>
                                <Edit3 className="h-3.5 w-3.5" aria-hidden="true" />
                            </button>
                            <button type="button" onClick={onDelete} disabled={busy} className={cx("rounded-md p-1.5 text-zinc-400 transition hover:bg-zinc-200/60 hover:text-red-600 dark:hover:bg-zinc-800", FOCUS)} aria-label={tx({ TR: "Yorumu sil", EN: "Delete comment" })} title={tx({ TR: "Sil", EN: "Delete" })}>
                                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                            </button>
                        </>
                    ) : null}
                </span>
            </div>
            {comment.replyToContent ? (
                <blockquote className="mt-2 border-s-2 border-emerald-500 ps-2 text-[12px] text-zinc-500 dark:text-zinc-400">
                    <span className="font-semibold">{comment.replyToAuthor || tx(TEAM_NAME)}</span>
                    <span className="line-clamp-2 break-words" dir="auto">{comment.replyToContent}</span>
                </blockquote>
            ) : null}
            {editing ? (
                <div className="mt-2 space-y-2">
                    <textarea value={text} onChange={(event) => setText(event.target.value)} rows={2} className={cx(INPUT, "resize-y")} aria-label={tx({ TR: "Yorumu düzenle", EN: "Edit comment" })} />
                    <div className="flex justify-end gap-2">
                        <button type="button" onClick={() => setEditing(false)} disabled={busy} className={cx(SECONDARY_BUTTON, FOCUS)}><X className="h-4 w-4" aria-hidden="true" />{tx({ TR: "Vazgeç", EN: "Cancel" })}</button>
                        <button type="button" onClick={() => void save()} disabled={busy || !text.trim() || text.length > BOARD_LIMITS.comment} className={cx(PRIMARY_BUTTON, FOCUS)}>
                            {busy ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Check className="h-4 w-4" aria-hidden="true" />}
                            {tx({ TR: "Kaydet", EN: "Save" })}
                        </button>
                    </div>
                </div>
            ) : (
                <p className="mt-1.5 whitespace-pre-wrap break-words text-sm leading-relaxed text-zinc-700 dark:text-zinc-300" dir="auto">{comment.content}</p>
            )}
        </li>
    );
}

function BoardPost({ item, authors, signedIn, onMutate, onDelete, onOpenAuthor }: {
    item: BoardItem;
    authors: Record<string, BoardAuthor>;
    signedIn: boolean;
    onMutate: (payload: Record<string, unknown>) => Promise<ApiFailure | null>;
    onDelete: (target: DeleteTarget) => void;
    onOpenAuthor: (author: BoardAuthor) => void;
}) {
    const { tx } = useI18n();
    const errorText = useErrorText();
    const uid = useId();
    const [showComments, setShowComments] = useState(false);
    const [editing, setEditing] = useState(false);
    const [content, setContent] = useState(item.content);
    const [description, setDescription] = useState(item.description ?? "");
    const [comment, setComment] = useState("");
    const [replyTo, setReplyTo] = useState<BoardComment | null>(null);
    const [busy, setBusy] = useState(false);
    const [failure, setFailure] = useState<ApiFailure | null>(null);
    const author = authors[item.authorId];

    const run = async (payload: Record<string, unknown>) => {
        setBusy(true);
        setFailure(null);
        const error = await onMutate({ itemId: item.id, ...payload });
        setBusy(false);
        if (error) setFailure(error);
        return !error;
    };

    const sendComment = async () => {
        if (!comment.trim()) return;
        if (await run({ action: "comment", content: comment, replyTo: replyTo?.id ?? null })) {
            setComment("");
            setReplyTo(null);
        }
    };

    const saveEdit = async () => {
        if (await run({ action: "edit", content, description })) setEditing(false);
    };

    const replyAuthor = (target: BoardComment) => (target.official ? tx(TEAM_NAME) : authors[target.authorId ?? ""]?.name || tx({ TR: "Hanogt kullanıcısı", EN: "Hanogt user" }));

    return (
        <article className={cx(CARD, "p-4 sm:p-5")} aria-labelledby={`${uid}-content`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
                <AuthorName author={author} onOpen={onOpenAuthor} />
                <div className="flex flex-wrap items-center gap-1.5">
                    {item.status !== "open" ? <Badge tone={item.status === "done" ? "emerald" : item.status === "closed" ? "zinc" : item.status === "planned" ? "violet" : "amber"}>{tx(FEEDBACK_STATUS_COPY[item.status])}</Badge> : null}
                    <span className="text-[12px] text-zinc-400">
                        <RelativeTime iso={item.createdAt} />
                        {item.editedAt ? <span>{" · "}{tx({ TR: "düzenlendi", EN: "edited" })}</span> : null}
                    </span>
                </div>
            </div>

            {editing ? (
                <div className="mt-3 space-y-2">
                    <textarea value={content} onChange={(event) => setContent(event.target.value)} rows={3} className={cx(INPUT, "resize-y")} aria-label={tx({ TR: "İçerik", EN: "Content" })} />
                    <textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={2} className={cx(INPUT, "resize-y text-[13px]")} aria-label={tx({ TR: "Açıklama (isteğe bağlı)", EN: "Description (optional)" })} placeholder={tx({ TR: "Açıklama (isteğe bağlı)", EN: "Description (optional)" })} />
                    <div className="flex justify-end gap-2">
                        <button type="button" onClick={() => { setEditing(false); setContent(item.content); setDescription(item.description ?? ""); }} disabled={busy} className={cx(SECONDARY_BUTTON, FOCUS)}><X className="h-4 w-4" aria-hidden="true" />{tx({ TR: "Vazgeç", EN: "Cancel" })}</button>
                        <button type="button" onClick={() => void saveEdit()} disabled={busy || !content.trim() || content.length > BOARD_LIMITS.content || description.length > BOARD_LIMITS.description} className={cx(PRIMARY_BUTTON, FOCUS)}>
                            {busy ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Check className="h-4 w-4" aria-hidden="true" />}
                            {tx({ TR: "Kaydet", EN: "Save" })}
                        </button>
                    </div>
                </div>
            ) : (
                <>
                    <p id={`${uid}-content`} className="mt-3 whitespace-pre-wrap break-words font-semibold leading-relaxed text-zinc-900 dark:text-zinc-100" dir="auto">{item.content}</p>
                    {item.description ? (
                        <p className="mt-2 whitespace-pre-wrap break-words rounded-xl border-s-4 border-blue-500 bg-zinc-50 px-3 py-2 text-sm leading-relaxed text-zinc-600 dark:bg-zinc-950/40 dark:text-zinc-400" dir="auto">{item.description}</p>
                    ) : null}
                </>
            )}

            {failure ? <Notice tone="error" className="mt-3">{errorText(failure)}</Notice> : null}

            <div className="mt-3 flex flex-wrap items-center gap-2">
                {signedIn ? (
                    <button
                        type="button"
                        aria-pressed={item.likedByMe}
                        onClick={() => void run({ action: "like" })}
                        disabled={busy}
                        className={cx(
                            "inline-flex h-9 items-center gap-1.5 rounded-xl px-3 text-sm font-semibold transition disabled:opacity-60",
                            item.likedByMe ? "bg-blue-600 text-white" : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700",
                            FOCUS,
                        )}
                    >
                        <ThumbsUp className="h-4 w-4" aria-hidden="true" />
                        <span className="sr-only">{item.likedByMe ? tx({ TR: "Beğeniyi geri al", EN: "Remove like" }) : tx({ TR: "Beğen", EN: "Like" })}</span>
                        <span className="tabular-nums">{item.likeCount}</span>
                    </button>
                ) : (
                    <Link
                        href={`/login?callbackUrl=${encodeURIComponent("/feedback#topluluk")}`}
                        className={cx("inline-flex h-9 items-center gap-1.5 rounded-xl bg-zinc-100 px-3 text-sm font-semibold text-zinc-600 transition hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700", FOCUS)}
                        title={tx({ TR: "Beğenmek için giriş yapın", EN: "Sign in to like" })}
                    >
                        <ThumbsUp className="h-4 w-4" aria-hidden="true" />
                        <span className="sr-only">{tx({ TR: "Beğenmek için giriş yapın", EN: "Sign in to like" })}</span>
                        <span className="tabular-nums">{item.likeCount}</span>
                    </Link>
                )}
                <button
                    type="button"
                    aria-expanded={showComments}
                    aria-controls={`${uid}-comments`}
                    onClick={() => setShowComments((value) => !value)}
                    className={cx("inline-flex h-9 items-center gap-1.5 rounded-xl bg-zinc-100 px-3 text-sm font-semibold text-zinc-600 transition hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700", FOCUS)}
                >
                    <MessageCircle className="h-4 w-4" aria-hidden="true" />
                    <span>{tx({ TR: "Yorumlar ({count})", EN: "Comments ({count})" }, { count: item.comments.length })}</span>
                </button>
                {item.comments.some((entry) => entry.official) ? <Badge tone="violet" icon={ShieldCheck}>{tx({ TR: "Ekip yanıtladı", EN: "Team replied" })}</Badge> : null}
                {item.own && !editing ? (
                    <span className="ms-auto flex items-center gap-1">
                        <button type="button" onClick={() => { setContent(item.content); setDescription(item.description ?? ""); setEditing(true); }} disabled={busy} className={cx(GHOST_BUTTON, FOCUS)}>
                            <Edit3 className="h-3.5 w-3.5" aria-hidden="true" />{tx({ TR: "Düzenle", EN: "Edit" })}
                        </button>
                        <button type="button" onClick={() => onDelete({ itemId: item.id, commentId: null, excerpt: item.content })} disabled={busy} className={cx(GHOST_BUTTON, FOCUS, "hover:text-red-600")}>
                            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />{tx({ TR: "Sil", EN: "Delete" })}
                        </button>
                    </span>
                ) : null}
            </div>

            {showComments ? (
                <div id={`${uid}-comments`} className="mt-4 border-t border-zinc-100 pt-4 dark:border-zinc-800">
                    {item.comments.length ? (
                        <ul className="space-y-2.5">
                            {item.comments.map((entry) => (
                                <BoardCommentView
                                    key={entry.id}
                                    comment={entry}
                                    author={entry.authorId ? authors[entry.authorId] : undefined}
                                    signedIn={signedIn}
                                    busy={busy}
                                    onReply={() => { setReplyTo(entry); document.getElementById(`${uid}-comment-input`)?.focus(); }}
                                    onEdit={(text) => run({ action: "edit-comment", commentId: entry.id, content: text })}
                                    onDelete={() => onDelete({ itemId: item.id, commentId: entry.id, excerpt: entry.content })}
                                    onOpenAuthor={onOpenAuthor}
                                />
                            ))}
                        </ul>
                    ) : (
                        <p className="text-sm text-zinc-500">{tx({ TR: "Henüz yorum yok.", EN: "No comments yet." })}</p>
                    )}

                    {signedIn ? (
                        <form onSubmit={(event) => { event.preventDefault(); void sendComment(); }} className="mt-3">
                            {replyTo ? (
                                <div className="mb-2 flex items-start justify-between gap-2 rounded-xl border-s-4 border-emerald-500 bg-emerald-50 px-3 py-2 dark:bg-emerald-500/10">
                                    <p className="min-w-0 text-[12px]">
                                        <span className="font-bold text-emerald-700 dark:text-emerald-300">{tx({ TR: "Yanıtlanıyor: {name}", EN: "Replying to {name}" }, { name: replyAuthor(replyTo) })}</span>
                                        <span className="line-clamp-1 break-words text-zinc-500 dark:text-zinc-400" dir="auto">{replyTo.content}</span>
                                    </p>
                                    <button type="button" onClick={() => setReplyTo(null)} className={cx("rounded-md p-1 text-zinc-500 hover:text-zinc-900 dark:hover:text-white", FOCUS)} aria-label={tx({ TR: "Yanıtı iptal et", EN: "Cancel reply" })}>
                                        <X className="h-4 w-4" aria-hidden="true" />
                                    </button>
                                </div>
                            ) : null}
                            <div className="flex items-end gap-2">
                                <label htmlFor={`${uid}-comment-input`} className="sr-only">{tx({ TR: "Yorum yazın", EN: "Write a comment" })}</label>
                                <textarea
                                    id={`${uid}-comment-input`}
                                    value={comment}
                                    onChange={(event) => setComment(event.target.value)}
                                    onKeyDown={(event) => {
                                        if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
                                            event.preventDefault();
                                            void sendComment();
                                        }
                                    }}
                                    rows={1}
                                    maxLength={BOARD_LIMITS.comment + 50}
                                    placeholder={tx({ TR: "Yorum yazın…", EN: "Write a comment…" })}
                                    className={cx(INPUT, "min-h-10 resize-y")}
                                />
                                <button type="submit" disabled={busy || !comment.trim() || comment.length > BOARD_LIMITS.comment} className={cx(PRIMARY_BUTTON, FOCUS, "h-10 shrink-0 px-3")} aria-label={tx({ TR: "Yorumu gönder", EN: "Send comment" })}>
                                    {busy ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Send className="h-4 w-4" aria-hidden="true" />}
                                </button>
                            </div>
                        </form>
                    ) : (
                        <p className="mt-3 text-[13px] text-zinc-500">
                            <Link href={`/login?callbackUrl=${encodeURIComponent("/feedback#topluluk")}`} className="font-semibold text-blue-600 hover:underline dark:text-blue-400">{tx({ TR: "Giriş yapın", EN: "Sign in" })}</Link>
                            {" "}{tx({ TR: "ve yoruma katılın.", EN: "to join the conversation." })}
                        </p>
                    )}
                </div>
            ) : null}
        </article>
    );
}

function BoardComposer({ type, onPosted, onPrivate }: { type: BoardType; onPosted: () => void; onPrivate: () => void }) {
    const { tx } = useI18n();
    const errorText = useErrorText();
    const uid = useId();
    const [content, setContent] = useState("");
    const [description, setDescription] = useState("");
    const [withDescription, setWithDescription] = useState(false);
    const [sending, setSending] = useState(false);
    const [failure, setFailure] = useState<ApiFailure | null>(null);
    const [posted, setPosted] = useState(false);
    const tooLong = content.length > BOARD_LIMITS.content || description.length > BOARD_LIMITS.description;

    const submit = async (event: FormEvent) => {
        event.preventDefault();
        if (!content.trim() || tooLong) return;
        setSending(true);
        setFailure(null);
        const result = await post<{ success: boolean }>("/api/feedback", { action: "create", type, content, description: withDescription ? description : "" });
        setSending(false);
        if (!result.ok) {
            setFailure(result);
            return;
        }
        setContent("");
        setDescription("");
        setWithDescription(false);
        setPosted(true);
        onPosted();
    };

    return (
        <form onSubmit={(event) => void submit(event)} className={cx(CARD, "p-4 sm:p-5")}>
            <label htmlFor={`${uid}-content`} className="mb-2 block text-sm font-bold">
                {type === "question" ? tx({ TR: "Topluluğa bir soru sorun", EN: "Ask the community a question" }) : tx({ TR: "Bir fikir veya geri bildirim paylaşın", EN: "Share an idea or feedback" })}
            </label>
            <textarea
                id={`${uid}-content`}
                value={content}
                onChange={(event) => { setContent(event.target.value); setPosted(false); if (failure) setFailure(null); }}
                rows={3}
                placeholder={type === "question" ? tx({ TR: "Sorunuzu yazın…", EN: "Write your question…" }) : tx({ TR: "Geri bildiriminizi yazın…", EN: "Write your feedback…" })}
                className={cx(INPUT, "resize-y leading-relaxed")}
            />
            {withDescription ? (
                <div className="mt-2">
                    <label htmlFor={`${uid}-description`} className="sr-only">{tx({ TR: "Açıklama", EN: "Description" })}</label>
                    <textarea
                        id={`${uid}-description`}
                        value={description}
                        onChange={(event) => setDescription(event.target.value)}
                        rows={3}
                        placeholder={tx({ TR: "Ayrıntılı açıklama (isteğe bağlı)…", EN: "A detailed description (optional)…" })}
                        className={cx(INPUT, "resize-y text-[13px] leading-relaxed")}
                    />
                </div>
            ) : null}
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[12px] text-zinc-500">
                <button type="button" onClick={() => setWithDescription((value) => !value)} className={cx(GHOST_BUTTON, FOCUS, "-ms-2")} aria-expanded={withDescription}>
                    {withDescription ? <X className="h-3.5 w-3.5" aria-hidden="true" /> : <Plus className="h-3.5 w-3.5" aria-hidden="true" />}
                    {withDescription ? tx({ TR: "Açıklamayı kaldır", EN: "Remove description" }) : tx({ TR: "Açıklama ekle", EN: "Add a description" })}
                </button>
                <Counter value={content.length} max={BOARD_LIMITS.content} />
            </div>
            <p className="mt-2 flex flex-wrap items-center gap-x-1 text-[12px] leading-relaxed text-zinc-500 dark:text-zinc-400">
                <ShieldAlert className="h-3.5 w-3.5 shrink-0 text-amber-500" aria-hidden="true" />
                {tx({ TR: "Herkese açıktır: kişisel bilgi, hesap sorunu veya güvenlik açığı paylaşmayın.", EN: "This is public: don't share personal information, account problems or security issues." })}
                <button type="button" onClick={onPrivate} className="font-semibold text-blue-600 hover:underline dark:text-blue-400">{tx({ TR: "Özel destek talebi açın.", EN: "Open a private ticket instead." })}</button>
            </p>
            {failure ? <Notice tone="error" className="mt-3">{errorText(failure)}</Notice> : null}
            {posted ? <Notice tone="success" className="mt-3">{tx({ TR: "Paylaşıldı. Teşekkürler!", EN: "Posted. Thank you!" })}</Notice> : null}
            <div className="mt-3 flex justify-end">
                <button type="submit" disabled={sending || !content.trim() || tooLong} className={cx(PRIMARY_BUTTON, FOCUS, "w-full sm:w-auto")}>
                    {sending ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Send className="h-4 w-4" aria-hidden="true" />}
                    {type === "question" ? tx({ TR: "Soruyu paylaş", EN: "Post question" }) : tx({ TR: "Geri bildirimi paylaş", EN: "Post feedback" })}
                </button>
            </div>
        </form>
    );
}

function CommunityBoard({ board, signedIn, authPending, onOpenAuthor, onPrivate }: {
    board: AdminResource<BoardResponse>;
    signedIn: boolean;
    authPending: boolean;
    onOpenAuthor: (author: BoardAuthor) => void;
    onPrivate: () => void;
}) {
    const { tx } = useI18n();
    const errorText = useErrorText();
    const [tab, setTab] = useState<BoardType>("question");
    const [sort, setSort] = useState<"top" | "new">("top");
    const [limit, setLimit] = useState(BOARD_PAGE);
    const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
    const [deleting, setDeleting] = useState(false);
    const [deleteFailure, setDeleteFailure] = useState<ApiFailure | null>(null);
    const { mutate, reload } = board;
    const items = useMemo(() => board.data?.items ?? [], [board.data]);
    const authors = board.data?.authors ?? {};
    const counts = { question: items.filter((item) => item.type === "question").length, feedback: items.filter((item) => item.type === "feedback").length };
    const visible = useMemo(() => {
        const list = items.filter((item) => item.type === tab);
        if (sort === "new") list.sort((a, b) => (Date.parse(b.createdAt ?? "") || 0) - (Date.parse(a.createdAt ?? "") || 0));
        return list;
    }, [items, sort, tab]);

    const mutateBoard = useCallback(async (payload: Record<string, unknown>) => {
        if (payload.action === "like") {
            // Shown at once; the reload that follows brings the real count and order.
            mutate((current) => ({
                ...current,
                items: current.items.map((item) => (item.id === payload.itemId
                    ? { ...item, likedByMe: !item.likedByMe, likeCount: Math.max(0, item.likeCount + (item.likedByMe ? -1 : 1)) }
                    : item)),
            }));
        }
        const result = await post<{ success: boolean }>("/api/feedback", payload);
        reload();
        return result.ok ? null : result;
    }, [mutate, reload]);

    const confirmDelete = async () => {
        if (!deleteTarget) return;
        setDeleting(true);
        setDeleteFailure(null);
        const result = await post<{ success: boolean }>("/api/feedback", deleteTarget.commentId
            ? { action: "delete-comment", itemId: deleteTarget.itemId, commentId: deleteTarget.commentId }
            : { action: "delete", itemId: deleteTarget.itemId });
        setDeleting(false);
        if (!result.ok && result.code !== "not_found" && result.code !== "comment_not_found") {
            setDeleteFailure(result);
            return;
        }
        setDeleteTarget(null);
        reload();
    };

    const tabs: Array<{ value: BoardType; label: string; icon: LucideIcon }> = [
        { value: "question", label: tx({ TR: "Sorular", EN: "Questions" }), icon: HelpCircle },
        { value: "feedback", label: tx({ TR: "Geri bildirimler", EN: "Feedback" }), icon: MessageSquareText },
    ];

    return (
        <section aria-labelledby="topluluk-title" id="topluluk" className="scroll-mt-24">
            <SectionHeading
                id="topluluk-title"
                icon={MessagesSquare}
                eyebrow={tx({ TR: "Herkese açık", EN: "Public" })}
                title={tx({ TR: "Topluluk panosu", EN: "Community board" })}
                description={tx({ TR: "Soruları ve önerileri herkes okuyabilir; giriş yapan kullanıcılar beğenip yorum yazabilir, ekip resmî yanıt verir.", EN: "Anyone can read the questions and ideas; signed-in users can like and comment, and the team replies officially." })}
                actions={(
                    <button type="button" onClick={reload} disabled={board.loading} className={cx(SECONDARY_BUTTON, FOCUS)}>
                        <RefreshCw className={cx("h-4 w-4", board.loading && board.data && "animate-spin")} aria-hidden="true" />{tx({ TR: "Yenile", EN: "Refresh" })}
                    </button>
                )}
            />

            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                <div role="tablist" aria-label={tx({ TR: "Pano türü", EN: "Board type" })} className="flex rounded-2xl bg-zinc-100 p-1 dark:bg-zinc-900">
                    {tabs.map((entry) => {
                        const active = entry.value === tab;
                        const Icon = entry.icon;
                        return (
                            <button
                                key={entry.value}
                                id={`topluluk-tab-${entry.value}`}
                                type="button"
                                role="tab"
                                aria-selected={active}
                                aria-controls="topluluk-panel"
                                onClick={() => { setTab(entry.value); setLimit(BOARD_PAGE); }}
                                className={cx(
                                    "inline-flex h-9 items-center gap-2 rounded-xl px-3.5 text-sm font-semibold transition",
                                    active ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-800 dark:text-white" : "text-zinc-500 hover:text-zinc-900 dark:hover:text-white",
                                    FOCUS,
                                )}
                            >
                                <Icon className="h-4 w-4" aria-hidden="true" />{entry.label}
                                <span className="rounded-full bg-zinc-200 px-1.5 text-[11px] tabular-nums dark:bg-zinc-700">{counts[entry.value]}</span>
                            </button>
                        );
                    })}
                </div>
                <label className="flex items-center gap-2 text-[13px] text-zinc-500">
                    {tx({ TR: "Sırala", EN: "Sort" })}
                    <select value={sort} onChange={(event) => setSort(event.target.value === "new" ? "new" : "top")} className={cx("rounded-xl border border-zinc-200 bg-white px-2.5 py-1.5 text-[13px] font-semibold text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200", FOCUS)}>
                        <option value="top">{tx({ TR: "Öne çıkanlar", EN: "Top" })}</option>
                        <option value="new">{tx({ TR: "En yeniler", EN: "Newest" })}</option>
                    </select>
                </label>
            </div>

            <div id="topluluk-panel" role="tabpanel" aria-labelledby={`topluluk-tab-${tab}`} className="space-y-4">
                {authPending ? null : signedIn ? (
                    <BoardComposer key={tab} type={tab} onPosted={reload} onPrivate={onPrivate} />
                ) : (
                    <SignInCard
                        title={tx({ TR: "Paylaşmak için giriş yapın", EN: "Sign in to post" })}
                        description={tx({ TR: "Panoyu herkes okuyabilir. Soru sormak, beğenmek ve yorum yazmak için giriş yapın.", EN: "Anyone can read the board. Sign in to ask, like and comment." })}
                        callbackUrl="/feedback#topluluk"
                    />
                )}

                {board.error ? (
                    <Notice tone="error" action={<button type="button" onClick={reload} className={cx(GHOST_BUTTON, FOCUS)}><RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />{tx({ TR: "Tekrar dene", EN: "Try again" })}</button>}>
                        {tx({ TR: "Pano yüklenemedi.", EN: "The board couldn't be loaded." })} {errorText(board.error)}
                    </Notice>
                ) : null}

                {!board.data && board.loading ? (
                    <div role="status" className="space-y-3">
                        <span className="sr-only">{tx({ TR: "Pano yükleniyor…", EN: "Loading the board…" })}</span>
                        {[0, 1, 2].map((index) => <div key={index} className="h-36 animate-pulse rounded-3xl bg-zinc-100 dark:bg-zinc-900" />)}
                    </div>
                ) : board.data && visible.length === 0 ? (
                    <div className="flex flex-col items-center gap-2 rounded-3xl border border-dashed border-zinc-300 px-6 py-12 text-center dark:border-zinc-700">
                        <MessagesSquare className="h-7 w-7 text-zinc-400" aria-hidden="true" />
                        <p className="font-bold">{tab === "question" ? tx({ TR: "Henüz soru yok", EN: "No questions yet" }) : tx({ TR: "Henüz geri bildirim yok", EN: "No feedback yet" })}</p>
                        <p className="text-sm text-zinc-500">{tab === "question" ? tx({ TR: "İlk soruyu siz sorun!", EN: "Be the first to ask!" }) : tx({ TR: "İlk geri bildirimi siz paylaşın!", EN: "Be the first to share!" })}</p>
                    </div>
                ) : (
                    <>
                        <AnimatePresence initial={false}>
                            {visible.slice(0, limit).map((item) => (
                                <motion.div key={item.id} layout="position" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                                    <BoardPost item={item} authors={authors} signedIn={signedIn} onMutate={mutateBoard} onDelete={(target) => { setDeleteTarget(target); setDeleteFailure(null); }} onOpenAuthor={onOpenAuthor} />
                                </motion.div>
                            ))}
                        </AnimatePresence>
                        {visible.length > limit ? (
                            <div className="flex justify-center">
                                <button type="button" onClick={() => setLimit((value) => value + BOARD_PAGE)} className={cx(SECONDARY_BUTTON, FOCUS)}>
                                    {tx({ TR: "Daha fazla göster ({count})", EN: "Show more ({count})" }, { count: visible.length - limit })}
                                </button>
                            </div>
                        ) : null}
                    </>
                )}
            </div>

            <ConfirmDialog
                open={Boolean(deleteTarget)}
                onClose={() => { if (!deleting) setDeleteTarget(null); }}
                onConfirm={() => void confirmDelete()}
                busy={deleting}
                icon={Trash2}
                title={deleteTarget?.commentId ? tx({ TR: "Yorum silinsin mi?", EN: "Delete this comment?" }) : tx({ TR: "Gönderi silinsin mi?", EN: "Delete this post?" })}
                description={deleteTarget?.commentId
                    ? tx({ TR: "Yorum kalıcı olarak silinir.", EN: "The comment is deleted permanently." })
                    : tx({ TR: "Gönderi, yorumları ve beğenileriyle birlikte kalıcı olarak silinir.", EN: "The post is deleted permanently together with its comments and likes." })}
                confirmLabel={tx({ TR: "Sil", EN: "Delete" })}
            >
                {deleteTarget ? (
                    <div className="space-y-3">
                        <blockquote className="line-clamp-4 break-words rounded-xl border-s-4 border-zinc-300 bg-zinc-50 px-3 py-2 text-sm text-zinc-700 dark:border-zinc-600 dark:bg-zinc-950/40 dark:text-zinc-300" dir="auto">{deleteTarget.excerpt}</blockquote>
                        {deleteFailure ? <Notice tone="error">{errorText(deleteFailure)}</Notice> : null}
                    </div>
                ) : null}
            </ConfirmDialog>
        </section>
    );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function FeedbackPage() {
    const { tx } = useI18n();
    const auth = useRawSession();
    const email = auth.data?.user?.email?.toLowerCase() ?? null;
    const signedIn = auth.status === "authenticated" && Boolean(email);
    const authPending = auth.status === "loading";
    const board = useAdminResource<BoardResponse>("/api/feedback");
    const tickets = useAdminResource<SupportListResponse>(signedIn ? "/api/support" : null);
    const linkedTicket = useSyncExternalStore(subscribeLocation, ticketFromLocation, noTicket);
    const [selectedTicket, setSelectedTicket] = useState<string | null>(null);
    const [faqQuery, setFaqQuery] = useState("");
    const [draft, setDraft] = useState<TicketDraftState>(EMPTY_DRAFT);
    const [profile, setProfile] = useState<UserProfile | null>(null);
    const deepLinkHandled = useRef(false);
    const activeTicket = selectedTicket ?? linkedTicket;
    const unread = tickets.data?.tickets.filter((ticket) => ticket.unread).length ?? 0;
    const { mutate: mutateTickets, reload: reloadTickets } = tickets;
    const { reload: reloadBoard } = board;

    // A notification link (/feedback?ticket=<id>) scrolls to the conversation once.
    useEffect(() => {
        if (!linkedTicket || deepLinkHandled.current || authPending) return;
        const timer = window.setTimeout(() => {
            deepLinkHandled.current = true;
            document.getElementById(signedIn ? "taleplerim" : "destek")?.scrollIntoView({ behavior: "smooth", block: "start" });
        }, 150);
        return () => window.clearTimeout(timer);
    }, [authPending, linkedTicket, signedIn]);

    // Team replies may arrive while the tab is in the background.
    useEffect(() => {
        const onVisible = () => {
            if (document.visibilityState !== "visible") return;
            reloadBoard();
            if (signedIn) reloadTickets();
        };
        document.addEventListener("visibilitychange", onVisible);
        return () => document.removeEventListener("visibilitychange", onVisible);
    }, [reloadBoard, reloadTickets, signedIn]);

    const selectTicket = useCallback((id: string) => {
        window.history.replaceState(null, "", `/feedback?ticket=${id}`);
        setSelectedTicket(id);
        scrollToId("taleplerim");
    }, []);

    const closeTicket = useCallback(() => {
        window.history.replaceState(null, "", "/feedback");
        setSelectedTicket(null);
        reloadTickets();
    }, [reloadTickets]);

    const upsertTicket = useCallback((ticket: SupportTicketView, select = false) => {
        const summary = summaryOf(ticket);
        const time = (value: SupportTicketSummary) => Date.parse(value.lastMessageAt ?? "") || 0;
        mutateTickets((current) => ({
            tickets: [summary, ...current.tickets.filter((item) => item.id !== ticket.id)].sort((a, b) => time(b) - time(a)),
        }));
        if (select) selectTicket(ticket.id);
    }, [mutateTickets, selectTicket]);

    const startTicket = useCallback((category: TicketCategory | null, title = "") => {
        setDraft((current) => ({ ...current, category: category ?? current.category, title: current.title || title.slice(0, TICKET_LIMITS.title) }));
        // With a category chosen the title comes next; otherwise the category picker.
        scrollToId(signedIn ? "talep-olustur" : "destek", signedIn ? (category ? "input[name=title]" : "input[type=radio]") : undefined);
    }, [signedIn]);

    const openAuthor = useCallback((author: BoardAuthor) => {
        if (!author.profile) return;
        // ProfileModal's projects tab reads by e-mail, which the board never exposes, so it stays hidden.
        const user: UserProfile & { staffRole?: BoardAuthor["staffRole"] } = { ...author.profile, publicProjects: false, staffRole: author.staffRole };
        setProfile(user);
    }, []);

    return (
        <div className="min-h-screen bg-white text-zinc-900 transition-colors dark:bg-zinc-950 dark:text-white">
            <Header />

            <main id="main-content" className="mx-auto max-w-6xl space-y-16 px-4 pb-16 pt-24 sm:px-6">
                <section className="relative overflow-hidden rounded-3xl border border-zinc-200 bg-zinc-950 p-6 text-white shadow-xl sm:p-10 dark:border-zinc-800">
                    <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_15%,rgba(59,130,246,.25),transparent_45%),radial-gradient(circle_at_85%_0%,rgba(139,92,246,.22),transparent_40%)]" />
                    <div className="relative">
                        <p className="flex items-center gap-2 text-sm font-semibold text-blue-300"><Sparkles className="h-4 w-4" aria-hidden="true" />{tx({ TR: "Yardım merkezi", EN: "Help center" })}</p>
                        <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-5xl">{tx({ TR: "Geri Bildirim ve SSS", EN: "Feedback & FAQ" })}</h1>
                        <p className="mt-4 max-w-2xl text-zinc-300">
                            {tx({ TR: "Hazır yanıtları arayın, ekibe özel destek talebi açın ya da toplulukla fikir paylaşın.", EN: "Search the ready answers, open a private ticket with the team or share ideas with the community." })}
                        </p>
                        <div className="relative mt-7 max-w-2xl">
                            <label htmlFor="faq-search" className="sr-only">{tx({ TR: "Sık sorulan sorularda ara", EN: "Search the FAQ" })}</label>
                            <Search className="pointer-events-none absolute start-4 top-1/2 h-5 w-5 -translate-y-1/2 text-zinc-500" aria-hidden="true" />
                            <input
                                id="faq-search"
                                type="search"
                                value={faqQuery}
                                maxLength={120}
                                onChange={(event) => setFaqQuery(event.target.value)}
                                onKeyDown={(event) => { if (event.key === "Enter") scrollToId("sss"); }}
                                placeholder={tx({ TR: "Bir konu, özellik veya hata ara…", EN: "Search a topic, feature or bug…" })}
                                className="w-full rounded-2xl border border-zinc-700 bg-zinc-900 py-3.5 pe-4 ps-12 text-sm text-white outline-none transition placeholder:text-zinc-500 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/20"
                            />
                        </div>
                        <div className="mt-6 flex flex-wrap gap-2">
                            <button type="button" onClick={() => startTicket(null)} className={cx(PRIMARY_BUTTON, "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white")}>
                                <Plus className="h-4 w-4" aria-hidden="true" />{tx({ TR: "Talep oluştur", EN: "Create a ticket" })}
                            </button>
                            {signedIn ? (
                                <a href="#taleplerim" className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">
                                    <Inbox className="h-4 w-4" aria-hidden="true" />{tx({ TR: "Taleplerim", EN: "My tickets" })}
                                    {unread ? (
                                        <>
                                            <span className="rounded-full bg-violet-500 px-1.5 text-[11px] font-black tabular-nums" aria-hidden="true">{unread}</span>
                                            <span className="sr-only">{tx({ TR: "Yeni yanıt: {count}", EN: "New replies: {count}" }, { count: unread })}</span>
                                        </>
                                    ) : null}
                                </a>
                            ) : null}
                            <a href="#topluluk" className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">
                                <MessagesSquare className="h-4 w-4" aria-hidden="true" />{tx({ TR: "Topluluk panosu", EN: "Community board" })}
                            </a>
                        </div>
                    </div>
                </section>

                <div className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-200">
                    <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
                    <p>
                        {tx({ TR: "Güvenlik açıklarını herkese açık panoya yazmayın: Talep oluştur > Güvenlik Açığı ile yalnızca ekibe bildirin. Hassas anahtar, gerçek parola veya kişisel veri eklemeyin; mümkünse yeniden üretme adımlarını paylaşın.", EN: "Don't post security issues on the public board: report them to the team only via Create a ticket > Security vulnerability. Don't include secret keys, real passwords or personal data; share steps to reproduce where you can." })}
                        {" "}
                        <button type="button" onClick={() => startTicket("security")} className="font-bold underline underline-offset-2 hover:no-underline">{tx({ TR: "Güvenlik bildirimi yap", EN: "Report a security issue" })}</button>
                    </p>
                </div>

                <FaqSection query={faqQuery} onAsk={(title) => startTicket("question", title)} />

                <SupportSection
                    signedIn={signedIn}
                    authPending={authPending}
                    tickets={tickets}
                    activeTicket={signedIn ? activeTicket : null}
                    linkedTicket={linkedTicket}
                    draft={draft}
                    setDraft={setDraft}
                    onSelect={selectTicket}
                    onBack={closeTicket}
                    onTicket={upsertTicket}
                />

                <CommunityBoard board={board} signedIn={signedIn} authPending={authPending} onOpenAuthor={openAuthor} onPrivate={() => startTicket(null)} />
            </main>

            <SiteFooter />

            {profile ? <ProfileModal user={profile} isOpen onClose={() => setProfile(null)} /> : null}
        </div>
    );
}
