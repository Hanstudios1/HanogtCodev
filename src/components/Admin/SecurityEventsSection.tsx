"use client";

import { motion } from "framer-motion";
import { FileCode2, Fingerprint, RefreshCw, ShieldCheck, Siren } from "lucide-react";
import { useId, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { COMMON, RISK_COPY, SECURITY_ACTION_COPY } from "./copy";
import { formatNumber, useAdminPages, useDebouncedValue } from "./hooks";
import { setAdminParams } from "./navigation";
import { RISK_TONES } from "./tones";
import type { AdminSecurityEvent, AdminSecurityEventsResponse, SecurityRisk } from "./types";
import { Badge, Button, EmptyState, ErrorNotice, FilterChips, INPUT_CLASS, LoadMore, LoadingRows, Panel, RelativeTime, SearchInput, SectionHeader, cx } from "./ui";

const RISK_ORDER: SecurityRisk[] = ["critical", "high", "medium", "low", "unknown"];
const ACTION_PATTERN = /^[a-z0-9_.-]{1,60}$/;

export default function SecurityEventsSection({ params }: { params: URLSearchParams }) {
    const { tx, locale } = useI18n();
    const selectId = useId();
    // The filters live in the address (#security?risk=high), so a reload or a link keeps them.
    const rawRisk = params.get("risk");
    const risk: "all" | SecurityRisk = rawRisk && (RISK_ORDER as string[]).includes(rawRisk) ? rawRisk as SecurityRisk : "all";
    const rawAction = params.get("action");
    const action = rawAction && ACTION_PATTERN.test(rawAction) ? rawAction : "all";
    const [query, setQuery] = useState("");
    const search = useDebouncedValue(query.trim());
    const request = new URLSearchParams();
    if (risk !== "all") request.set("risk", risk);
    if (action !== "all") request.set("action", action);
    if (search) request.set("q", search);
    const events = useAdminPages<AdminSecurityEvent, AdminSecurityEventsResponse>(`/api/admin/security-events${request.size ? `?${request}` : ""}`);

    const setRisk = (next: "all" | SecurityRisk) => setAdminParams({ risk: next === "all" ? null : next });
    const setAction = (next: string) => setAdminParams({ action: next === "all" ? null : next });
    const clearFilters = () => { setQuery(""); setAdminParams({ risk: null, action: null }); };

    // An answer for earlier filters stays only while the new one loads (dimmed).
    const showRows = !events.stale || events.loading;
    const visible = showRows ? events.data?.items ?? [] : [];
    const counts = events.data?.counts ?? null;
    const filtered = risk !== "all" || action !== "all" || Boolean(search);
    // Every known kind, plus any other the loaded events carry.
    const actions = [...new Set([...Object.keys(SECURITY_ACTION_COPY), ...visible.map((event) => event.action), ...(action !== "all" ? [action] : [])])].sort();
    const actionLabel = (value: string) => (SECURITY_ACTION_COPY[value] ? tx(SECURITY_ACTION_COPY[value]) : value);

    return (
        <div>
            <SectionHeader
                title={tx({ TR: "Güvenlik Olayları", EN: "Security Events" })}
                description={tx({ TR: "Güvenlik taramasının engellediği istekler ve hesap güvenliği uyarıları (salt okunur, en yeniler önce).", EN: "Requests blocked by the security scanner and account security alerts (read-only, newest first)." })}
                actions={<Button size="sm" icon={RefreshCw} busy={events.loading && Boolean(events.data)} onClick={events.reload}>{tx(COMMON.refresh)}</Button>}
            />

            <div className="mb-4 space-y-3">
                <FilterChips
                    label={tx({ TR: "Risk filtresi", EN: "Risk filter" })}
                    value={risk}
                    onChange={setRisk}
                    options={[
                        { value: "all", label: tx(COMMON.all), count: counts?.all },
                        ...RISK_ORDER.filter((item) => !counts || counts[item] > 0 || item === risk).map((item) => ({ value: item, label: tx(RISK_COPY[item]), count: counts?.[item] })),
                    ]}
                />
                <div className="flex flex-wrap items-center gap-3">
                    <label htmlFor={selectId} className="sr-only">{tx({ TR: "Olay türü", EN: "Event type" })}</label>
                    <select id={selectId} value={action} onChange={(event) => setAction(event.target.value)} className={cx(INPUT_CLASS, "h-10 w-auto min-w-48")}>
                        <option value="all">{tx({ TR: "Tüm olay türleri", EN: "All event types" })}</option>
                        {actions.map((value) => <option key={value} value={value}>{actionLabel(value)}</option>)}
                    </select>
                    <SearchInput
                        value={query}
                        onChange={setQuery}
                        className="min-w-0 flex-1"
                        label={tx({ TR: "Olaylarda ara", EN: "Search events" })}
                        placeholder={tx({ TR: "Kullanıcı, bulgu kimliği veya kod parmak izi…", EN: "User, finding id or code fingerprint…" })}
                    />
                </div>
            </div>

            {events.error ? <ErrorNotice error={events.error} onRetry={events.reload} className="mb-4" /> : null}

            {events.error && !showRows ? null : (<Panel bodyClassName="p-0">
                {!events.data && events.loading ? (
                    <LoadingRows rows={5} className="p-4" />
                ) : visible.length === 0 ? (
                    <div className="p-4">
                        <EmptyState
                            icon={filtered ? Siren : ShieldCheck}
                            title={filtered ? tx(COMMON.noResults) : tx({ TR: "Kayıtlı güvenlik olayı yok", EN: "No security events recorded" })}
                            description={filtered ? undefined : tx({ TR: "Riskli bir kod çalıştırma isteği engellendiğinde burada listelenir.", EN: "Listed here whenever a risky code run is blocked." })}
                            action={filtered ? <Button size="sm" onClick={clearFilters}>{tx(COMMON.clearFilters)}</Button> : undefined}
                        />
                    </div>
                ) : (
                    <ul className={cx("divide-y divide-zinc-100 transition-opacity dark:divide-white/[0.06]", events.loading && events.stale && "opacity-60")}>
                        {visible.map((event, index) => (
                            <motion.li
                                key={event.id}
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                transition={{ delay: Math.min(index, 12) * 0.015 }}
                                className="grid gap-2 px-4 py-3.5 md:grid-cols-[110px_minmax(0,1fr)_auto] md:items-start"
                            >
                                <div><Badge tone={RISK_TONES[event.risk]}>{tx(RISK_COPY[event.risk])}</Badge></div>
                                <div className="min-w-0">
                                    <p className="text-sm font-bold text-zinc-900 dark:text-white">{actionLabel(event.action)}</p>
                                    <p className="truncate text-[12px] text-zinc-500" dir="ltr">{event.actor || "—"}</p>
                                    {event.findingIds.length ? (
                                        <div className="mt-1.5 flex flex-wrap gap-1">
                                            {event.findingIds.slice(0, 6).map((finding) => (
                                                <span key={finding} className="rounded-md bg-zinc-100 px-1.5 py-0.5 font-mono text-[11px] text-zinc-600 dark:bg-white/[0.06] dark:text-zinc-300">{finding}</span>
                                            ))}
                                            {event.findingIds.length > 6 ? <span className="text-[11px] text-zinc-500">{tx({ TR: "+{count} daha", EN: "+{count} more" }, { count: event.findingIds.length - 6 })}</span> : null}
                                        </div>
                                    ) : null}
                                    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-zinc-500">
                                        {event.codeLength !== null ? (
                                            <span className="inline-flex items-center gap-1"><FileCode2 className="h-3 w-3" aria-hidden="true" />{tx({ TR: "{count} karakter", EN: "{count} characters" }, { count: formatNumber(event.codeLength, locale) })}</span>
                                        ) : null}
                                        {event.fileCount !== null ? <span>{tx({ TR: "{count} dosya", EN: "{count} files" }, { count: event.fileCount })}</span> : null}
                                        {event.codeHash ? <span className="inline-flex items-center gap-1 font-mono" dir="ltr"><Fingerprint className="h-3 w-3" aria-hidden="true" />{event.codeHash}</span> : null}
                                        {event.reviewStatus ? <Badge tone={event.reviewStatus === "pending" ? "amber" : "zinc"}>{event.reviewStatus === "pending" ? tx({ TR: "İnceleme bekliyor", EN: "Pending review" }) : event.reviewStatus}</Badge> : null}
                                        {Object.entries(event.details).map(([key, value]) => (
                                            <span key={key} className="font-mono" dir="ltr">{key}: {String(value)}</span>
                                        ))}
                                    </div>
                                </div>
                                <RelativeTime iso={event.createdAt} className="text-[12px] text-zinc-500 md:text-end" />
                            </motion.li>
                        ))}
                    </ul>
                )}
            </Panel>)}
            {showRows ? <div className="mt-4"><LoadMore pages={events} shown={visible.length} total={risk === "all" && action === "all" && !search ? counts?.all : undefined} /></div> : null}
        </div>
    );
}
