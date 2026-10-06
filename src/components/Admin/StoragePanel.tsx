"use client";

import { Database, Eraser, Newspaper, RefreshCw } from "lucide-react";
import { useState } from "react";
import { useI18n, type Copy } from "@/lib/i18n";
import type { NewsPurgeResult } from "@/lib/server/news-retention";
import type { ExpiredPurgeResult, StorageGroup, StorageReport, StorageRow } from "@/lib/server/storage-report";
import { adminPost, type ApiFailure } from "./api";
import { useAdminResource } from "./hooks";
import { Button, ConfirmDialog, ErrorNotice, LoadingRows, Notice, Panel, RelativeTime, cx, useToast } from "./ui";

const T = {
    title: { TR: "Depolama", EN: "Storage" },
    description: { TR: "Firestore'da en çok yer kaplayan koleksiyonlar", EN: "The Firestore collections that take the most space" },
    quota: {
        TR: "Site Vercel'in depolamasını kullanmaz: bütün veriler (dosyalar dahil) Firestore'dadır. Spark (ücretsiz) planında veritabanının tamamı için 1 GiB vardır; tam boyutu Firebase konsolu → Firestore → Kullanım bölümünde görürsünüz.",
        EN: "The site doesn't use Vercel's storage: all data (files included) is in Firestore. The Spark (free) plan has 1 GiB for the whole database; Firebase console → Firestore → Usage shows the exact size.",
    },
    newsRule: {
        TR: "Hanogt News yalnızca son 24 saatin haberlerini tutar. Eski haber arşivi artık yazılmaz; arşivde kalanlar, bir günden eski yorumlar ve sayaçları her haber yenilemesinde parça parça silinir.",
        EN: "Hanogt News keeps only the last 24 hours. The old news archive is no longer written; what is left of it, comments older than a day and their counters are deleted bit by bit on every feed refresh.",
    },
    refresh: { TR: "Yenile", EN: "Refresh" },
    collection: { TR: "Koleksiyon", EN: "Collection" },
    documents: { TR: "Belge", EN: "Documents" },
    size: { TR: "Boyut", EN: "Size" },
    expired: { TR: "Süresi dolan", EN: "Expired" },
    ttl: { TR: "Firestore siliyor", EN: "Firestore deletes" },
    ttlHint: { TR: "Sayılamadı: TTL kuralı yüklüyse bu kayıtları Firestore kendisi siler.", EN: "Couldn't be counted: if the TTL policy is deployed, Firestore deletes these itself." },
    countFailed: { TR: "Sayılamadı", EN: "Couldn't count" },
    purgeNews: { TR: "Eski haberleri şimdi temizle", EN: "Clean up old news now" },
    purgeExpired: { TR: "Süresi dolan kayıtları sil", EN: "Delete expired records" },
    purgeNewsTitle: { TR: "Eski haberler temizlensin mi?", EN: "Clean up old news?" },
    purgeNewsText: {
        TR: "Eski haber arşivi, bir günden eski haber yorumları ve sayaçları silinir (bir seferde en çok 2.000 belge). Son 24 saatin haberleri ve yorumları kalır. Bu işlem geri alınamaz.",
        EN: "The old news archive, news comments older than a day and their counters are deleted (at most 2,000 documents at a time). The last 24 hours of stories and comments stay. This can't be undone.",
    },
    purgeExpiredTitle: { TR: "Süresi dolan kayıtlar silinsin mi?", EN: "Delete expired records?" },
    purgeExpiredText: {
        TR: "Süresi geçmiş hız sınırı pencereleri, arama kayıtları, davetler, susturmalar, uyarılar, bildirimler, AutoMod olayları ve günlük AI kullanım kayıtları silinir (bir seferde en çok 2.000 belge). Firestore'un TTL kuralı yüklüyse bunları zaten kendisi siler. Bu işlem geri alınamaz.",
        EN: "Expired rate-limit windows, call records, invites, mutes, warnings, reports, AutoMod events and daily AI usage records are deleted (at most 2,000 documents at a time). If Firestore's TTL policy is deployed it deletes these itself anyway. This can't be undone.",
    },
    confirm: { TR: "Sil", EN: "Delete" },
    newsDone: { TR: "{archive} arşiv belgesi, {comments} yorum ve {counters} sayaç silindi.", EN: "Deleted {archive} archive documents, {comments} comments and {counters} counters." },
    expiredDone: { TR: "Süresi dolan {count} kayıt silindi.", EN: "Deleted {count} expired records." },
    more: { TR: "Silinecek daha çok belge var; düğmeye yeniden basın ya da otomatik temizliği bekleyin.", EN: "There is more to delete; press the button again or let the automatic cleanup continue." },
    skipped: { TR: "Sorgulanamayan koleksiyonlar (TTL kuralı yüklü olabilir): {list}", EN: "Collections that couldn't be queried (their TTL policy may be deployed): {list}" },
    generated: { TR: "Sayım", EN: "Counted" },
} satisfies Record<string, Copy>;

const GROUPS: Record<StorageGroup, Copy> = {
    news: { TR: "Hanogt News", EN: "Hanogt News" },
    files: { TR: "Dosyalar", EN: "Files" },
    content: { TR: "İçerik", EN: "Content" },
    expiring: { TR: "Süresi dolan kayıtlar", EN: "Expiring records" },
};

const NAMES: Record<string, Copy> = {
    news_items: { TR: "Eski haber arşivi (artık tutulmuyor)", EN: "Old news archive (no longer kept)" },
    news_comments: { TR: "Haber yorumları", EN: "News comments" },
    news_meta: { TR: "Yorum sayaçları", EN: "Comment counters" },
    message_files: { TR: "Mesaj dosyaları", EN: "Message files" },
    voice_clips: { TR: "Sesli mesajlar", EN: "Voice messages" },
    game_assets: { TR: "Oyun sesleri ve modelleri", EN: "Game sounds and models" },
    projects: { TR: "Kod projeleri", EN: "Code projects" },
    game_projects: { TR: "Oyun projeleri", EN: "Game projects" },
    arcade_games: { TR: "Arcade oyunları", EN: "Arcade games" },
    media_posts: { TR: "Media gönderileri", EN: "Media posts" },
    security_rate_limits: { TR: "Hız sınırı pencereleri", EN: "Rate-limit windows" },
    calls: { TR: "Arama kayıtları", EN: "Call records" },
    ai_usage_daily: { TR: "Günlük Hanogt AI kullanımı", EN: "Daily Hanogt AI usage" },
    automod_events: { TR: "AutoMod olayları", EN: "AutoMod events" },
    group_reports: { TR: "Grup bildirimleri", EN: "Group reports" },
    group_warnings: { TR: "Grup uyarıları", EN: "Group warnings" },
    group_mutes: { TR: "Susturmalar", EN: "Mutes" },
    group_invites: { TR: "Grup davetleri", EN: "Group invites" },
    group_invite_links: { TR: "Davet bağlantıları", EN: "Invite links" },
};

export function formatBytes(bytes: number, locale: string) {
    const units = ["B", "KB", "MB", "GB"];
    let value = bytes;
    let unit = 0;
    while (value >= 1024 && unit < units.length - 1) {
        value /= 1024;
        unit += 1;
    }
    return `${new Intl.NumberFormat(locale, { maximumFractionDigits: unit ? 1 : 0 }).format(value)} ${units[unit]}`;
}

type CleanupAnswer = { action: "purgeNews"; news: NewsPurgeResult } | { action: "purgeExpired"; expired: ExpiredPurgeResult };

function Row({ row, locale }: { row: StorageRow; locale: string }) {
    const { tx } = useI18n();
    const number = (value: number) => new Intl.NumberFormat(locale).format(value);
    const name = NAMES[row.id] ? tx(NAMES[row.id]) : row.id;
    return (
        <li className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 px-4 py-2.5 sm:grid-cols-[minmax(0,1fr)_7rem_7rem_8rem]">
            <div className="min-w-0">
                <p className="truncate text-[13px] font-semibold text-zinc-800 dark:text-zinc-100">{name}</p>
                <code className="text-[11px] text-zinc-500">{row.id}</code>
            </div>
            <p className="text-end text-[13px] tabular-nums text-zinc-800 dark:text-zinc-100">
                <span className="sr-only sm:hidden">{tx(T.documents)}: </span>
                {row.count === null ? <span className="text-zinc-500">{tx(T.countFailed)}</span> : `${number(row.count)}${row.capped ? "+" : ""}`}
            </p>
            <p className="col-start-2 text-end text-[12px] tabular-nums text-zinc-500 sm:col-start-auto sm:text-[13px] sm:text-zinc-700 dark:sm:text-zinc-300">
                <span className="sm:hidden">{tx(T.size)}: </span>
                {row.bytes === null ? "—" : formatBytes(row.bytes, locale)}
            </p>
            <p className="col-start-2 text-end text-[12px] tabular-nums sm:col-start-auto sm:text-[13px]">
                {row.group !== "expiring" ? <span className="text-zinc-400">—</span> : row.expired === null ? (
                    <span className="text-zinc-500" title={tx(T.ttlHint)}>{tx(T.ttl)}</span>
                ) : (
                    <span className={cx(row.expired > 0 ? "font-bold text-amber-600 dark:text-amber-300" : "text-zinc-500")}>
                        <span className="sm:hidden">{tx(T.expired)}: </span>{number(row.expired)}
                    </span>
                )}
            </p>
        </li>
    );
}

export default function StoragePanel() {
    const { tx, locale } = useI18n();
    const toast = useToast();
    const report = useAdminResource<StorageReport>("/api/admin/storage");
    const [confirm, setConfirm] = useState<"purgeNews" | "purgeExpired" | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<ApiFailure | null>(null);
    const [last, setLast] = useState<CleanupAnswer | null>(null);

    const run = async (action: "purgeNews" | "purgeExpired") => {
        setBusy(true);
        setError(null);
        const result = await adminPost<CleanupAnswer>("/api/admin/storage", { action });
        setBusy(false);
        if (!result.ok) {
            setError(result);
            return;
        }
        setConfirm(null);
        setLast(result.data);
        if (result.data.action === "purgeNews") {
            toast("success", tx(T.newsDone, { archive: result.data.news.archive, comments: result.data.news.comments, counters: result.data.news.counters }));
        } else {
            const total = Object.values(result.data.expired.deleted).reduce((sum, value) => sum + value, 0);
            toast("success", tx(T.expiredDone, { count: total }));
        }
        report.reload();
    };

    const groups = (["news", "files", "content", "expiring"] as const).map((group) => ({ group, rows: report.data?.rows.filter((row) => row.group === group) ?? [] }));
    const lastDone = last ? (last.action === "purgeNews" ? last.news.done : last.expired.done) : true;
    const skipped = last?.action === "purgeExpired" ? last.expired.skipped : [];

    return (
        <Panel
            title={tx(T.title)}
            description={tx(T.description)}
            icon={Database}
            bodyClassName="p-0"
            actions={<Button size="sm" icon={RefreshCw} busy={report.loading && Boolean(report.data)} onClick={report.reload}>{tx(T.refresh)}</Button>}
        >
            <div className="space-y-3 px-4 pt-4">
                <p className="text-[13px] leading-relaxed text-zinc-600 dark:text-zinc-300">{tx(T.quota)}</p>
                <Notice tone="info">{tx(T.newsRule)}</Notice>
                <div className="flex flex-wrap gap-2">
                    <Button variant="primary" icon={Newspaper} onClick={() => { setError(null); setConfirm("purgeNews"); }}>{tx(T.purgeNews)}</Button>
                    <Button icon={Eraser} onClick={() => { setError(null); setConfirm("purgeExpired"); }}>{tx(T.purgeExpired)}</Button>
                </div>
                {last && !lastDone ? <Notice tone="warning">{tx(T.more)}</Notice> : null}
                {skipped.length ? <p className="text-[12px] text-zinc-500">{tx(T.skipped, { list: skipped.join(", ") })}</p> : null}
                {report.error ? <ErrorNotice error={report.error} onRetry={report.reload} /> : null}
            </div>
            {!report.data && report.loading ? <div className="p-4"><LoadingRows rows={6} /></div> : null}
            {report.data ? (
                <div className="mt-3 border-t border-zinc-100 dark:border-white/[0.06]">
                    <div className="hidden grid-cols-[minmax(0,1fr)_7rem_7rem_8rem] gap-x-4 px-4 py-2 text-[11px] font-bold uppercase tracking-wide text-zinc-500 sm:grid">
                        <span>{tx(T.collection)}</span>
                        <span className="text-end">{tx(T.documents)}</span>
                        <span className="text-end">{tx(T.size)}</span>
                        <span className="text-end">{tx(T.expired)}</span>
                    </div>
                    {groups.filter((entry) => entry.rows.length).map((entry) => (
                        <section key={entry.group} aria-label={tx(GROUPS[entry.group])}>
                            <h3 className="bg-zinc-50 px-4 py-1.5 text-[11px] font-black uppercase tracking-wide text-zinc-600 dark:bg-white/[0.03] dark:text-zinc-300">{tx(GROUPS[entry.group])}</h3>
                            <ul className="divide-y divide-zinc-100 dark:divide-white/[0.06]">
                                {entry.rows.map((row) => <Row key={row.id} row={row} locale={locale} />)}
                            </ul>
                        </section>
                    ))}
                    <p className="px-4 py-3 text-[11px] text-zinc-500">{tx(T.generated)}: <RelativeTime iso={report.data.generatedAt} /></p>
                </div>
            ) : null}
            <ConfirmDialog
                open={confirm !== null}
                onClose={() => {
                    if (!busy) setConfirm(null);
                }}
                onConfirm={() => {
                    if (confirm) void run(confirm);
                }}
                title={tx(confirm === "purgeExpired" ? T.purgeExpiredTitle : T.purgeNewsTitle)}
                description={tx(confirm === "purgeExpired" ? T.purgeExpiredText : T.purgeNewsText)}
                confirmLabel={tx(T.confirm)}
                icon={confirm === "purgeExpired" ? Eraser : Newspaper}
                busy={busy}
                error={error}
            />
        </Panel>
    );
}
