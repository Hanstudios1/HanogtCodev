"use client";

import { ArrowDownRight, ArrowUpRight, CalendarDays, CircleAlert, Gauge, MessageSquare, RefreshCw, Sigma } from "lucide-react";
import { useState, type ReactNode } from "react";
import ProductLogo from "@/components/ProductLogo";
import { useI18n, type Copy } from "@/lib/i18n";
import { BarList, ColumnChart, type ChartPoint } from "./charts";
import { COMMON } from "./copy";
import { formatNumber, useAdminResource } from "./hooks";
import type { ActivityRange, AdminAiUsageResponse, AiUsagePlanKey, AiUsageSourceKey } from "./types";
import { Button, ErrorNotice, FilterChips, Notice, Panel, SectionHeader, cx } from "./ui";

/*
 * Hanogt AI in numbers: messages per day (Türkiye time) from the daily totals,
 * how many the model couldn't answer (given back), where they came from and
 * on which plan, the model's connection and the plans' limits. Totals only:
 * nothing here says who sent a message or what it said.
 */

const RANGE_COPY: Record<ActivityRange, Copy> = {
    7: { TR: "Son 7 gün", EN: "Last 7 days" },
    30: { TR: "Son 30 gün", EN: "Last 30 days" },
    90: { TR: "Son 13 hafta", EN: "Last 13 weeks" },
};

const SOURCE_COPY: Record<AiUsageSourceKey, Copy> = {
    chat: { TR: "Sohbet", EN: "Chat" },
    own: { TR: "Kendi bağlantılar", EN: "Own connections" },
    api: { TR: "Geliştirici API'si", EN: "Developer API" },
    group: { TR: "Gruplardaki bot", EN: "Bot in groups" },
};

const PLAN_COPY: Record<AiUsagePlanKey, Copy> = {
    free: { TR: "Ücretsiz", EN: "Free" },
    plus: { TR: "Plus", EN: "Plus" },
    pro: { TR: "Pro", EN: "Pro" },
};

function pointsOf(data: AdminAiUsageResponse, locale: string): ChartPoint[] {
    const axis = new Intl.DateTimeFormat(locale, { timeZone: "Europe/Istanbul", day: "numeric", month: "short" });
    const day = new Intl.DateTimeFormat(locale, { timeZone: "Europe/Istanbul", weekday: "long", day: "numeric", month: "long", year: "numeric" });
    return data.buckets.map((bucket) => {
        const start = new Date(bucket.start);
        const last = new Date(Date.parse(bucket.end) - 1);
        return {
            label: axis.format(start),
            title: data.unit === "week" ? `${axis.format(start)} – ${axis.format(last)}` : day.format(start),
            value: bucket.messages,
        };
    });
}

function Tile({ icon: Icon, label, value, note }: { icon: typeof MessageSquare; label: string; value: string; note?: ReactNode }) {
    return (
        <div className="min-w-0 rounded-2xl border border-zinc-200 bg-white p-4 dark:border-white/10 dark:bg-zinc-900/70">
            <p className="flex items-center gap-2 text-[12px] font-semibold text-zinc-600 dark:text-zinc-300">
                <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span className="truncate">{label}</span>
            </p>
            <p className="mt-2 text-2xl font-black tracking-tight text-zinc-900 dark:text-white">{value}</p>
            {note ? <div className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">{note}</div> : null}
        </div>
    );
}

export default function AiUsageSection() {
    const { tx, locale } = useI18n();
    const [range, setRange] = useState<ActivityRange>(30);
    const [fresh, setFresh] = useState(0);
    const usage = useAdminResource<AdminAiUsageResponse>(`/api/admin/ai-usage?range=${range}${fresh ? `&fresh=1&n=${fresh}` : ""}`);
    const data = usage.data;
    const days = data ? (data.range === 90 ? 91 : data.range) : 1;
    const peak = data?.buckets.reduce((best, bucket) => (bucket.messages > best.messages ? bucket : best), data.buckets[0]);
    const change = data && data.previous.messages > 0 ? (data.totals.messages - data.previous.messages) / data.previous.messages : null;
    const dayFormat = new Intl.DateTimeFormat(locale, { timeZone: "Europe/Istanbul", day: "numeric", month: "long" });

    return (
        <div>
            <SectionHeader
                title="Hanogt AI"
                description={tx({ TR: "Mesaj sayıları, yanıt verilemeyenler, kaynaklar ve planlar. Yalnızca toplamlar tutulur.", EN: "Message counts, unanswered messages, sources and plans. Only totals are kept." })}
                actions={<Button size="sm" icon={RefreshCw} busy={usage.loading && Boolean(data)} onClick={() => setFresh((value) => value + 1)}>{tx(COMMON.refresh)}</Button>}
            />

            <div className="mb-4 flex flex-wrap items-center gap-3">
                <FilterChips<`${ActivityRange}`>
                    label={tx({ TR: "Zaman aralığı", EN: "Time range" })}
                    value={`${range}`}
                    onChange={(value) => setRange(Number(value) as ActivityRange)}
                    options={([7, 30, 90] as const).map((value) => ({ value: `${value}`, label: tx(RANGE_COPY[value]) }))}
                />
                <span className="text-[11px] text-zinc-500 dark:text-zinc-400">{tx({ TR: "Günler Türkiye saatine göre", EN: "Days in Türkiye time" })}</span>
            </div>

            {usage.error && !data ? <ErrorNotice error={usage.error} onRetry={usage.reload} className="mb-4" /> : null}

            {data ? (
                <div className={cx("space-y-4 transition-opacity", usage.loading && "opacity-60")}>
                    <div className="flex items-center gap-3 rounded-2xl border border-zinc-200 bg-white p-4 dark:border-white/10 dark:bg-zinc-900/70">
                        <ProductLogo product="ai" size={36} />
                        <div className="min-w-0 flex-1">
                            {data.model.configured ? (
                                <>
                                    <p className="text-sm font-bold text-zinc-900 dark:text-white">{tx({ TR: "Hanogt AI modeli bağlı", EN: "Hanogt AI's model is connected" })}</p>
                                    <p className="truncate text-[12px] text-zinc-500 dark:text-zinc-400" dir="ltr">{data.model.name}</p>
                                </>
                            ) : (
                                <>
                                    <p className="flex items-center gap-1.5 text-sm font-bold text-zinc-900 dark:text-white"><CircleAlert className="h-4 w-4 text-amber-500" aria-hidden="true" />{tx({ TR: "Model bağlı değil", EN: "No model connected" })}</p>
                                    <p className="text-[12px] text-zinc-500 dark:text-zinc-400">{tx({ TR: "HANOGT_AI_* ayarlanana kadar giriş yapan kişilere tarayıcıdaki Çekirdek yanıt veriyor; bu yanıtlar sayılmaz.", EN: "Until HANOGT_AI_* is set, the Core in the browser answers signed-in people; those answers aren't counted." })}</p>
                                </>
                            )}
                        </div>
                    </div>

                    {!data.firstDay ? (
                        <Notice tone="info">{tx({ TR: "Günlük toplamlar bu sürümle tutulmaya başladı; ilk mesajlarla burada görünecek.", EN: "Daily totals started with this release; they will show up here with the first messages." })}</Notice>
                    ) : null}

                    <div className="grid grid-cols-1 gap-3 min-[460px]:grid-cols-2 xl:grid-cols-4">
                        <Tile
                            icon={MessageSquare}
                            label={tx({ TR: "Mesajlar", EN: "Messages" })}
                            value={formatNumber(data.totals.messages, locale)}
                            note={change === null ? tx({ TR: "Önceki dönemde mesaj yok", EN: "No messages in the period before" }) : (
                                <span className="inline-flex items-center gap-1">
                                    {change >= 0 ? <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" /> : <ArrowDownRight className="h-3.5 w-3.5" aria-hidden="true" />}
                                    <span className="font-bold tabular-nums">{change >= 0 ? "+" : "−"}{new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(Math.abs(change * 100))}%</span>
                                    {tx({ TR: "önceki döneme göre", EN: "vs the period before" })}
                                </span>
                            )}
                        />
                        <Tile
                            icon={CircleAlert}
                            label={tx({ TR: "Yanıt verilemeyen", EN: "Couldn't be answered" })}
                            value={formatNumber(data.totals.refunds, locale)}
                            note={data.totals.messages > 0
                                ? tx({ TR: "Mesajların %{rate}'i; hakları geri verildi", EN: "{rate}% of messages; given back" }, { rate: new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format((data.totals.refunds / data.totals.messages) * 100) })
                                : tx({ TR: "Hakları geri verilir", EN: "They are given back" })}
                        />
                        <Tile icon={Sigma} label={tx({ TR: "Günlük ortalama", EN: "Daily average" })} value={new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(data.totals.messages / days)} />
                        <Tile
                            icon={CalendarDays}
                            label={tx(data.unit === "week" ? { TR: "En yoğun hafta", EN: "Busiest week" } : { TR: "En yoğun gün", EN: "Busiest day" })}
                            value={peak && peak.messages > 0 ? formatNumber(peak.messages, locale) : "—"}
                            note={peak && peak.messages > 0 ? dayFormat.format(new Date(peak.start)) : undefined}
                        />
                    </div>

                    <Panel icon={MessageSquare} title={tx({ TR: "Mesajlar", EN: "Messages" })} description={tx(RANGE_COPY[data.range])} bodyClassName="p-4">
                        <ColumnChart
                            points={pointsOf(data, locale)}
                            seriesLabel={tx({ TR: "Mesajlar", EN: "Messages" })}
                            busy={usage.loading}
                            caption={tx({ TR: "Sohbet, kendi bağlantılar, API ve gruplardaki bot birlikte.", EN: "Chat, own connections, the API and the bot in groups together." })}
                        />
                    </Panel>

                    <div className="grid gap-4 lg:grid-cols-2">
                        <Panel icon={Gauge} title={tx({ TR: "Kaynaklara göre", EN: "By source" })} description={tx(RANGE_COPY[data.range])} bodyClassName="p-4">
                            <BarList
                                emptyText={tx({ TR: "Bu dönemde mesaj yok.", EN: "No messages in this period." })}
                                items={(Object.keys(SOURCE_COPY) as AiUsageSourceKey[]).map((key) => ({ key, label: tx(SOURCE_COPY[key]), value: data.totals.sources[key] }))}
                            />
                        </Panel>
                        <Panel icon={Gauge} title={tx({ TR: "Planlara göre", EN: "By plan" })} description={tx(RANGE_COPY[data.range])} bodyClassName="p-4">
                            <BarList
                                emptyText={tx({ TR: "Bu dönemde mesaj yok.", EN: "No messages in this period." })}
                                items={(Object.keys(PLAN_COPY) as AiUsagePlanKey[]).map((key) => ({ key, label: tx(PLAN_COPY[key]), value: data.totals.plans[key] }))}
                            />
                        </Panel>
                    </div>

                    <Panel icon={Gauge} title={tx({ TR: "Plan sınırları", EN: "Plan limits" })} description={tx({ TR: "Sohbet, kendi bağlantılar, API ve gruplar aynı haktan düşer.", EN: "The chat, own connections, the API and groups share one allowance." })} bodyClassName="p-0">
                        <div className="overflow-x-auto">
                            <table className="w-full min-w-[420px] text-[13px]">
                                <thead className="text-[12px] text-zinc-500 dark:text-zinc-400">
                                    <tr className="border-b border-zinc-100 dark:border-white/[0.06]">
                                        <th scope="col" className="px-5 py-2.5 text-start font-semibold">{tx({ TR: "Plan", EN: "Plan" })}</th>
                                        <th scope="col" className="px-5 py-2.5 text-end font-semibold">{tx({ TR: "Mesaj hakkı", EN: "Messages" })}</th>
                                        <th scope="col" className="px-5 py-2.5 text-end font-semibold">{tx({ TR: "Süre", EN: "Window" })}</th>
                                        <th scope="col" className="px-5 py-2.5 text-end font-semibold">{tx({ TR: "Dakikada", EN: "Per minute" })}</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-zinc-100 dark:divide-white/[0.06]">
                                    {(Object.keys(PLAN_COPY) as AiUsagePlanKey[]).map((key) => (
                                        <tr key={key}>
                                            <th scope="row" className="px-5 py-2.5 text-start font-bold text-zinc-900 dark:text-white">{tx(PLAN_COPY[key])}</th>
                                            <td className="px-5 py-2.5 text-end tabular-nums">{formatNumber(data.limits[key].perWindow, locale)}</td>
                                            <td className="px-5 py-2.5 text-end tabular-nums">{tx({ TR: "{days} gün", EN: "{days} days" }, { days: data.limits[key].windowDays })}</td>
                                            <td className="px-5 py-2.5 text-end tabular-nums">{formatNumber(data.limits[key].perMinute, locale)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </Panel>
                </div>
            ) : !usage.error ? (
                <div className="h-[420px] animate-pulse rounded-3xl bg-zinc-100 dark:bg-white/[0.04]" aria-hidden="true" />
            ) : null}
        </div>
    );
}
