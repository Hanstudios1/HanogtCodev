"use client";

import { motion } from "framer-motion";
import { RefreshCw, ScrollText } from "lucide-react";
import { useId, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { AUDIT_ACTION_COPY, COMMON, DETAIL_KEY_COPY } from "./copy";
import { useAdminPages, useDebouncedValue } from "./hooks";
import { setAdminParams } from "./navigation";
import type { AdminAuditAction, AdminAuditEntry, AdminAuditResponse, AuditDetailValue } from "./types";
import { Badge, Button, EmptyState, ErrorNotice, INPUT_CLASS, LoadMore, LoadingRows, Panel, RelativeTime, SearchInput, SectionHeader, cx, type Tone } from "./ui";

const ACTION_PATTERN = /^[a-z0-9_.-]{1,60}$/;
const KNOWN_ACTIONS = Object.keys(AUDIT_ACTION_COPY).sort();

function actionTone(action: string): Tone {
    if (action.startsWith("user.")) return "violet";
    if (action.startsWith("report.") || action.startsWith("media.")) return "amber";
    if (action.startsWith("news_comment.")) return "sky";
    if (action.startsWith("arcade.")) return "emerald";
    if (action.startsWith("feedback.")) return "fuchsia";
    if (action.startsWith("announcement.")) return "indigo";
    return "zinc";
}

function isKnownAction(action: string): action is AdminAuditAction {
    return action in AUDIT_ACTION_COPY;
}

export default function AuditLogSection({ params }: { params: URLSearchParams }) {
    const { tx } = useI18n();
    const selectId = useId();
    // The kind filter lives in the address (#audit?action=user.suspend), so a reload or a link keeps it.
    const rawAction = params.get("action");
    const action = rawAction && ACTION_PATTERN.test(rawAction) ? rawAction : "all";
    const [query, setQuery] = useState("");
    const search = useDebouncedValue(query.trim());
    const request = new URLSearchParams();
    if (action !== "all") request.set("action", action);
    if (search) request.set("q", search);
    const audit = useAdminPages<AdminAuditEntry, AdminAuditResponse>(`/api/admin/audit${request.size ? `?${request}` : ""}`);

    const setAction = (next: string) => setAdminParams({ action: next === "all" ? null : next });
    const clearFilters = () => { setQuery(""); setAdminParams({ action: null }); };

    // An answer for earlier filters stays only while the new one loads (dimmed).
    const showRows = !audit.stale || audit.loading;
    const visible = showRows ? audit.data?.items ?? [] : [];
    const filtered = action !== "all" || Boolean(search);
    const actions = action === "all" || KNOWN_ACTIONS.includes(action) ? KNOWN_ACTIONS : [...KNOWN_ACTIONS, action];
    const actionLabel = (value: string) => (isKnownAction(value) ? tx(AUDIT_ACTION_COPY[value]) : value);
    const detailValue = (value: AuditDetailValue) => {
        if (value === null) return "—";
        if (typeof value === "boolean") return value ? tx({ TR: "evet", EN: "yes" }) : tx({ TR: "hayır", EN: "no" });
        return String(value);
    };

    return (
        <div>
            <SectionHeader
                title={tx({ TR: "Denetim Kaydı", EN: "Audit Log" })}
                description={tx({ TR: "Ekibin yaptığı her değişiklik: kim, ne zaman, neyi değiştirdi (en yeniler önce).", EN: "Every change made by staff: who changed what, and when (newest first)." })}
                actions={<Button size="sm" icon={RefreshCw} busy={audit.loading && Boolean(audit.data)} onClick={audit.reload}>{tx(COMMON.refresh)}</Button>}
            />

            <div className="mb-4 flex flex-wrap items-center gap-3">
                <label htmlFor={selectId} className="sr-only">{tx({ TR: "İşlem türü", EN: "Action type" })}</label>
                <select id={selectId} value={action} onChange={(event) => setAction(event.target.value)} className={cx(INPUT_CLASS, "h-10 w-auto min-w-52")}>
                    <option value="all">{tx({ TR: "Tüm işlemler", EN: "All actions" })}</option>
                    {actions.map((value) => <option key={value} value={value}>{actionLabel(value)}</option>)}
                </select>
                <SearchInput
                    value={query}
                    onChange={setQuery}
                    className="min-w-0 flex-1"
                    label={tx({ TR: "Denetim kaydında ara", EN: "Search the audit log" })}
                    placeholder={tx({ TR: "Ekip üyesi, hedef veya ayrıntı…", EN: "Staff member, target or detail…" })}
                />
            </div>

            {audit.error ? <ErrorNotice error={audit.error} onRetry={audit.reload} className="mb-4" /> : null}

            {audit.error && !showRows ? null : (<Panel bodyClassName="p-0">
                {!audit.data && audit.loading ? (
                    <LoadingRows rows={5} className="p-4" />
                ) : visible.length === 0 ? (
                    <div className="p-4">
                        <EmptyState
                            icon={ScrollText}
                            title={filtered ? tx(COMMON.noResults) : tx({ TR: "Henüz kayıt yok", EN: "No entries yet" })}
                            description={filtered ? undefined : tx({ TR: "Panelden yapılan her değişiklik burada kalıcı olarak listelenir.", EN: "Every change made from the panel is listed here permanently." })}
                            action={filtered ? <Button size="sm" onClick={clearFilters}>{tx(COMMON.clearFilters)}</Button> : undefined}
                        />
                    </div>
                ) : (
                    <ol className={cx("relative space-y-0 py-2 transition-opacity", audit.loading && audit.stale && "opacity-60")}>
                        {visible.map((entry, index) => {
                            const details = Object.entries(entry.details);
                            return (
                                <motion.li
                                    key={entry.id}
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    transition={{ delay: Math.min(index, 12) * 0.015 }}
                                    className="relative flex gap-3 px-4 py-3"
                                >
                                    <span className="relative flex w-3 shrink-0 justify-center" aria-hidden="true">
                                        <span className="mt-1.5 h-2.5 w-2.5 rounded-full bg-gradient-to-br from-indigo-500 to-fuchsia-500 ring-4 ring-white dark:ring-zinc-900" />
                                        {index < visible.length - 1 ? <span className="absolute top-5 bottom-[-12px] w-px bg-zinc-200 dark:bg-white/10" /> : null}
                                    </span>
                                    <div className="min-w-0 flex-1">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <Badge tone={actionTone(entry.action)}>{actionLabel(entry.action)}</Badge>
                                            <span className="truncate text-[13px] font-bold text-zinc-900 dark:text-white" dir="ltr">{entry.actor || "—"}</span>
                                            <RelativeTime iso={entry.createdAt} className="ms-auto text-[12px] text-zinc-500" />
                                        </div>
                                        <p className="mt-1 truncate font-mono text-[12px] text-zinc-500" dir="ltr">{entry.target}</p>
                                        {details.length ? (
                                            <dl className="mt-1.5 flex flex-wrap gap-1.5">
                                                {details.map(([key, value]) => (
                                                    <div key={key} className="flex max-w-full items-center gap-1 rounded-lg bg-zinc-100 px-2 py-0.5 text-[11px] dark:bg-white/[0.06]">
                                                        <dt className="shrink-0 font-bold text-zinc-500">{DETAIL_KEY_COPY[key] ? tx(DETAIL_KEY_COPY[key]) : key}</dt>
                                                        <dd className="truncate text-zinc-700 dark:text-zinc-300" dir="auto">{detailValue(value)}</dd>
                                                    </div>
                                                ))}
                                            </dl>
                                        ) : null}
                                    </div>
                                </motion.li>
                            );
                        })}
                    </ol>
                )}
            </Panel>)}
            {showRows ? <div className="mt-4"><LoadMore pages={audit} shown={visible.length} /></div> : null}
        </div>
    );
}
