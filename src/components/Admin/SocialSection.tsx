"use client";

import { FileStack, Flag, MessagesSquare, Mic, RefreshCw, ShieldBan, UsersRound } from "lucide-react";
import { useState } from "react";
import ProductLogo from "@/components/ProductLogo";
import { useI18n } from "@/lib/i18n";
import { AUTOMOD_RULE_COPY, type AutoModRule } from "@/lib/social/automod-config";
import { formatBytes } from "@/lib/social/attachments";
import { BarList } from "./charts";
import { COMMON } from "./copy";
import { formatNumber, useAdminResource } from "./hooks";
import type { AdminSocialResponse, StatCount } from "./types";
import { Button, EmptyState, ErrorNotice, Notice, Panel, SectionHeader, cx } from "./ui";

/*
 * Hanogt Social in numbers. Group reports (/report) and AutoMod records belong
 * to each group's own moderators: staff see how many there are, per rule and
 * per group, never the messages, who reported or who was reported.
 */

function Count({ value }: { value: StatCount }) {
    const { tx, locale } = useI18n();
    if (!value) return <span title={tx(COMMON.unavailable)}>—</span>;
    return <>{formatNumber(value.count, locale)}{value.capped ? "+" : ""}</>;
}

export default function SocialSection() {
    const { tx, locale } = useI18n();
    const [fresh, setFresh] = useState(0);
    const social = useAdminResource<AdminSocialResponse>(`/api/admin/social${fresh ? `?fresh=1&n=${fresh}` : ""}`);
    const data = social.data;
    const ruleLabel = (rule: string) => (rule in AUTOMOD_RULE_COPY ? tx(AUTOMOD_RULE_COPY[rule as AutoModRule]) : rule);

    const tiles = data ? [
        { key: "groups", icon: UsersRound, label: tx({ TR: "Gruplar", EN: "Groups" }), value: <Count value={data.counts.groups} /> },
        { key: "chats", icon: MessagesSquare, label: tx({ TR: "Birebir sohbetler", EN: "Direct chats" }), value: <Count value={data.counts.directChats} /> },
        { key: "voice", icon: Mic, label: tx({ TR: "Şu an açık sesli kanallar", EN: "Voice channels live now" }), value: <Count value={data.counts.voiceChannelsLive} /> },
        {
            key: "reports",
            icon: Flag,
            label: tx({ TR: "Açık grup raporları", EN: "Open group reports" }),
            value: <Count value={data.counts.reportsOpen} />,
            note: data.counts.reportsTotal ? tx({ TR: "Toplam {count} (180 gün saklanır)", EN: "{count} in all (kept 180 days)" }, { count: formatNumber(data.counts.reportsTotal.count, locale) }) : null,
        },
        { key: "automod", icon: ShieldBan, label: tx({ TR: "AutoMod'un durdurduğu mesajlar", EN: "Messages AutoMod stopped" }), value: <Count value={data.counts.automodStops} />, note: tx({ TR: "Son 90 gün", EN: "Last 90 days" }) },
        {
            key: "files",
            icon: FileStack,
            label: tx({ TR: "Mesajlardaki dosyalar", EN: "Files in messages" }),
            value: <Count value={data.counts.files} />,
            note: data.fileBytes !== null ? tx({ TR: "Toplam {size} (Firestore'da)", EN: "{size} in all (in Firestore)" }, { size: formatBytes(data.fileBytes, locale.startsWith("tr") ? "TR" : "EN") }) : null,
        },
    ] : [];

    return (
        <div>
            <SectionHeader
                title="Hanogt Social"
                description={tx({ TR: "Gruplar, sesli kanallar, raporlar, AutoMod ve dosyalar: yalnızca sayılar.", EN: "Groups, voice channels, reports, AutoMod and files: numbers only." })}
                actions={<Button size="sm" icon={RefreshCw} busy={social.loading && Boolean(data)} onClick={() => setFresh((value) => value + 1)}>{tx(COMMON.refresh)}</Button>}
            />

            <Notice tone="info" className="mb-4">
                {tx({ TR: "Grup raporları ve AutoMod kayıtları grupların kendi moderatörlerine aittir. Burada yalnızca sayılar görünür; mesajlar, raporlayan ve raporlanan kişiler gösterilmez.", EN: "Group reports and AutoMod records belong to each group's own moderators. Only the numbers show here; no message, reporter or reported person is shown." })}
            </Notice>

            {social.error && !data ? <ErrorNotice error={social.error} onRetry={social.reload} className="mb-4" /> : null}

            {data ? (
                <div className={cx("space-y-4 transition-opacity", social.loading && "opacity-60")}>
                    <div className="grid grid-cols-1 gap-3 min-[460px]:grid-cols-2 xl:grid-cols-3">
                        {tiles.map((tile) => {
                            const Icon = tile.icon;
                            return (
                                <div key={tile.key} className="min-w-0 rounded-2xl border border-zinc-200 bg-white p-4 dark:border-white/10 dark:bg-zinc-900/70">
                                    <p className="flex items-center gap-2 text-[12px] font-semibold text-zinc-600 dark:text-zinc-300">
                                        <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                                        <span className="truncate">{tile.label}</span>
                                    </p>
                                    <p className="mt-2 text-2xl font-black tracking-tight text-zinc-900 dark:text-white">{tile.value}</p>
                                    {tile.note ? <p className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">{tile.note}</p> : null}
                                </div>
                            );
                        })}
                    </div>

                    <div className="grid gap-4 lg:grid-cols-2">
                        <Panel icon={ShieldBan} title={tx({ TR: "AutoMod kurallarına göre", EN: "By AutoMod rule" })} description={tx({ TR: "Son 90 günde durdurulan mesajlar", EN: "Messages stopped in the last 90 days" })} bodyClassName="p-4">
                            {data.automodByRule ? (
                                <BarList
                                    emptyText={tx({ TR: "AutoMod son 90 günde mesaj durdurmadı.", EN: "AutoMod stopped no messages in the last 90 days." })}
                                    items={data.automodByRule.map((row) => ({ key: row.rule, label: ruleLabel(row.rule), value: row.count }))}
                                />
                            ) : <p className="py-6 text-center text-sm text-zinc-500">{tx(COMMON.unavailable)}</p>}
                        </Panel>
                        <Panel icon={Flag} title={tx({ TR: "En çok rapor alan gruplar", EN: "Groups with the most reports" })} description={tx({ TR: "Açık /rapor kayıtları", EN: "Open /report records" })} bodyClassName="p-4">
                            {data.reportedGroups === null ? (
                                <p className="py-6 text-center text-sm text-zinc-500">{tx(COMMON.unavailable)}</p>
                            ) : data.reportedGroups.length === 0 ? (
                                <EmptyState icon={Flag} title={tx({ TR: "Açık grup raporu yok", EN: "No open group reports" })} />
                            ) : (
                                <BarList
                                    emptyText=""
                                    items={data.reportedGroups.map((group) => ({ key: group.id, label: group.name, hint: `${group.name} · ${group.id}`, value: group.open }))}
                                />
                            )}
                        </Panel>
                    </div>

                    <p className="flex items-center gap-2 text-[11px] text-zinc-500 dark:text-zinc-400">
                        <ProductLogo product="social" size={16} />
                        {tx({ TR: "Sayılar bir dakikalığına önbellekte tutulur; Yenile yeniden sayar.", EN: "Numbers are cached for a minute; Refresh counts again." })}
                    </p>
                </div>
            ) : !social.error ? (
                <div className="h-[360px] animate-pulse rounded-3xl bg-zinc-100 dark:bg-white/[0.04]" aria-hidden="true" />
            ) : null}
        </div>
    );
}
