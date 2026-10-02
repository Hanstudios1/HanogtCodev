"use client";

import { motion } from "framer-motion";
import {
    ArrowRight, ArrowUpRight, Bot, Boxes, Code, Gamepad2, Github, Globe2, LifeBuoy, MessagesSquare, Newspaper, Radio, Scale, ShieldCheck,
    Sparkles, type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useState } from "react";
import ChangelogModal, { UPDATES, type EntryText } from "@/components/ChangelogModal";
import Header from "@/components/Header";
import { CountUp, PUBLIC_STAT_KEYS, formatCount, usePublicStats, type PublicStatKey } from "@/components/PublicStats";
import SiteFooter from "@/components/SiteFooter";
import { LANGUAGES, formatCopy, useI18n, type Copy } from "@/lib/i18n";
import { LEGAL_VERSION } from "@/lib/legal";
import { NAV_LABELS } from "@/lib/nav";
import { LANGUAGE_STATS } from "@/lib/runtimes/languages";
import { GITHUB_URL, RELEASES_URL } from "@/lib/site";

const C = {
    lead: {
        TR: "Hanogt Codev; kod yazmayı, oyun yapmayı ve ürettiklerini paylaşmayı tek hesapta buluşturan, tarayıcıda çalışan bir platform. HanStudios olarak yazılım geliştirmeyi herkes için erişilebilir kılmaya çalışıyoruz.",
        EN: "Hanogt Codev is a browser-based platform that brings writing code, building games and sharing what you make together in one account. At HanStudios, we work to make software development accessible to everyone.",
    },
    statsTitle: { TR: "Rakamlarla Hanogt Codev", EN: "Hanogt Codev in numbers" },
    statsNote: {
        TR: "Topluluk rakamları yaklaşık 10 dakikada bir güncellenir. Son güncelleme: {time}.",
        EN: "Community numbers refresh about every 10 minutes. Last updated: {time}.",
    },
    statsNoteNoTime: {
        TR: "Topluluk rakamları yaklaşık 10 dakikada bir güncellenir.",
        EN: "Community numbers refresh about every 10 minutes.",
    },
    live: { TR: "Canlı", EN: "Live" },
    factLanguages: { TR: "Programlama dili", EN: "Programming languages" },
    factInterface: { TR: "Arayüz dili", EN: "Interface languages" },
    factReleases: { TR: "Yayınlanan sürüm", EN: "Releases" },
    productsLead: { TR: "Kod, oyun, haber ve topluluk: hepsi aynı hesapla.", EN: "Code, games, news and community: all with the same account." },
    missionLabel: { TR: "Misyonumuz", EN: "Our mission" },
    mission: {
        TR: "Yazılım geliştirmeyi herkes için erişilebilir kılmak: kurulum yok, ücret yok, dil engeli yok.",
        EN: "Making software development accessible to everyone: no setup, no cost, no language barrier.",
    },
    valuesTitle: { TR: "Değerlerimiz", EN: "What we value" },
    timelineTitle: { TR: "Sürüm yolculuğu", EN: "Release timeline" },
    timelineLead: {
        TR: "İlk sürümden bugüne {count} sürüm; her biri yeni özellikler ve düzeltmelerle geldi.",
        EN: "{count} releases since the first one, each with new features and fixes.",
    },
    upNext: { TR: "Sırada", EN: "Up next" },
    nextSocial: { TR: "Hanogt Social: arkadaşlar, gruplar ve mesajlar tek çatı altında.", EN: "Hanogt Social: friends, groups and messages under one roof." },
    nextFinance: { TR: "Hanogt News'e finans haberleri.", EN: "Finance news for Hanogt News." },
    latest: { TR: "En yeni", EN: "Latest" },
    detailedNotes: { TR: "Ayrıntılı sürüm notları", EN: "Detailed release notes" },
    openSourceTitle: { TR: "Açık kaynak", EN: "Open source" },
    openSourceText: {
        TR: "Hanogt Codev'in kaynak kodu GitHub'da, MIT lisansıyla açık. Kodu inceleyebilir, hata bildirebilir ve katkıda bulunabilirsin.",
        EN: "Hanogt Codev's source code is on GitHub under the MIT licence. You can read the code, report bugs and contribute.",
    },
    viewOnGithub: { TR: "GitHub'da görüntüle", EN: "View on GitHub" },
    contactTitle: { TR: "Bize ulaş", EN: "Get in touch" },
    contactText: {
        TR: "Bir sorun, öneri ya da başvurun mu var? Destek talebi aç; ekibin yanıtını Taleplerim'de görürsün.",
        EN: "Have a problem, suggestion or request? Open a support ticket and you'll see the team's reply under My tickets.",
    },
    contactLink: { TR: "Destek talebi aç", EN: "Open a support ticket" },
} satisfies Record<string, Copy>;

type Product = { icon: LucideIcon; href: string; title: Copy; text: Copy; gradient: string; badge?: Copy };

const PRODUCTS: Product[] = [
    {
        icon: Code,
        href: "/editor",
        title: NAV_LABELS.editor,
        text: {
            TR: "{count} dilde yaz, çalıştır ve önizle. JavaScript, Python, SQL ve Lua gibi diller doğrudan tarayıcıda çalışır; kurulum gerekmez.",
            EN: "Write, run and preview code in {count} languages. JavaScript, Python, SQL, Lua and more run right in your browser; nothing to install.",
        },
        gradient: "from-sky-500 to-indigo-500",
    },
    {
        icon: Boxes,
        href: "/game-engine",
        title: { TR: "Hanogt Engine V3", EN: "Hanogt Engine V3" },
        text: {
            TR: "Tarayıcıda çalışan, Unity benzeri 2D/3D oyun motoru. V3 ile tilemap, arayüz bileşenleri ve animasyon geldi; C# ve C++ ile script yazarsın.",
            EN: "A Unity-like 2D/3D game engine that runs in your browser. V3 adds tilemaps, UI components and animation; you script in C# and C++.",
        },
        gradient: "from-violet-500 to-fuchsia-500",
    },
    {
        icon: Gamepad2,
        href: "/arcade",
        title: NAV_LABELS.arcade,
        text: {
            TR: "Motorla yaptığın oyunları yayınla; topluluğun oyunlarını oyna, beğen ve izin verilenleri remiksle.",
            EN: "Publish the games you make with the engine; play and like the community's games and remix those that allow it.",
        },
        gradient: "from-amber-400 to-orange-500",
    },
    {
        icon: Radio,
        href: "/media",
        title: { TR: "Hanogt Media", EN: "Hanogt Media" },
        text: {
            TR: "Kod projelerini lisansla yayınla; başkalarının projelerini incele, indir, beğen ve yorumla.",
            EN: "Publish your code projects with a licence; browse, download, like and comment on other people's projects.",
        },
        gradient: "from-indigo-500 to-violet-500",
    },
    {
        icon: Newspaper,
        href: "/news",
        title: { TR: "Hanogt News", EN: "Hanogt News" },
        text: {
            TR: "Canlı teknoloji haberleri ve topluluk oylarıyla işleyen yapay zeka arenası. Finans haberleri de yolda.",
            EN: "Live tech news and an AI arena driven by community votes. Finance news is on its way.",
        },
        gradient: "from-rose-500 to-red-500",
        badge: { TR: "Finans yakında", EN: "Finance soon" },
    },
    {
        icon: Bot,
        href: "/ai",
        title: { TR: "Hanogt AI", EN: "Hanogt AI" },
        text: {
            TR: "Kod, oyun ve güvenlik sorularında yanında. Ajan modu yalnızca senin izninle işlem yapar: grup açar, oyun projesi oluşturur, kodu editörde açar.",
            EN: "Your assistant for code, games and security. Agent mode only acts with your permission: it creates groups, starts game projects and opens code in the editor.",
        },
        gradient: "from-fuchsia-500 to-pink-500",
        badge: { TR: "Ajan modu", EN: "Agent mode" },
    },
    {
        icon: MessagesSquare,
        href: "/social",
        title: { TR: "Hanogt Social", EN: "Hanogt Social" },
        text: {
            TR: "Arkadaşlar, gruplar ve mesajlar Discord benzeri tek bir yerde; durumunuz herkese canlı görünür.",
            EN: "Friends, groups and messages together in one Discord-like place, with live status for everyone.",
        },
        gradient: "from-emerald-500 to-teal-500",
        badge: { TR: "Yeni", EN: "New" },
    },
    {
        icon: ShieldCheck,
        href: "/security",
        title: { TR: "Hanogt Security", EN: "Hanogt Security" },
        text: {
            TR: "Güvenlik Merkezi: kod danışmanı, parola laboratuvarı ve bağlantı kontrolü. Hesabını iki adımlı doğrulamayla da koruyabilirsin.",
            EN: "Security Center: a code advisor, password lab and link checker. You can also protect your account with two-step verification.",
        },
        gradient: "from-emerald-500 to-green-600",
    },
    {
        icon: LifeBuoy,
        href: "/feedback",
        title: { TR: "Destek ve yönetim", EN: "Support and admin" },
        text: {
            TR: "Destek talepleriyle ekibe ulaş, yanıtları Taleplerim'de gör. Ekip talepleri, moderasyonu ve duyuruları rol tabanlı bir yönetici panelinden yürütür.",
            EN: "Reach the team with support tickets and read replies under My tickets. The team handles tickets, moderation and announcements from a role-based admin panel.",
        },
        gradient: "from-cyan-500 to-sky-500",
    },
];

const VALUES: Array<{ icon: LucideIcon; tone: string; title: Copy; text: Copy }> = [
    {
        icon: Globe2,
        tone: "text-sky-500",
        title: { TR: "Herkes için", EN: "For everyone" },
        text: {
            TR: "{count} arayüz dili, sağdan sola diller için ayna düzen, klavye odak stilleri ve azaltılmış hareket desteği. Ücretsiz ve kurulumsuz.",
            EN: "{count} interface languages, mirrored layouts for right-to-left languages, keyboard focus styles and reduced-motion support. Free, with nothing to install.",
        },
    },
    {
        icon: ShieldCheck,
        tone: "text-emerald-500",
        title: { TR: "Güvenlik ve gizlilik", EN: "Security and privacy" },
        text: {
            TR: "İki adımlı doğrulama, sunucu tarafı yetki denetimleri ve hız sınırları. Kodun Hanogt sunucularında çalıştırılmaz. Yasal metinler sürüm {version}.",
            EN: "Two-step verification, server-side permission checks and rate limits. Your code never runs on Hanogt servers. The legal texts are at version {version}.",
        },
    },
    {
        icon: Scale,
        tone: "text-amber-500",
        title: { TR: "Dürüst sınırlar", EN: "Honest limits" },
        text: {
            TR: "Yapabildiklerimizi olduğu gibi, yapamadıklarımızı da açıkça yazarız: Security Bot bir ön elemedir, antivirüs değildir; motorumuz Unity'nin yerini almaz.",
            EN: "We say what we can do as plainly as what we can't: Security Bot is a pre-screen, not antivirus, and our engine doesn't replace Unity.",
        },
    },
    {
        icon: Sparkles,
        tone: "text-fuchsia-500",
        title: { TR: "Topluluğunla birlikte", EN: "Together with you" },
        text: {
            TR: "Geri bildirimlerin ve destek talepleriyle şekilleniyoruz. Her sürümde ne değiştiğini açıkça yazıyoruz.",
            EN: "Your feedback and support tickets shape what we build, and every release says plainly what changed.",
        },
    },
];

const STAT_KEYS = PUBLIC_STAT_KEYS;
const STAT_LABELS: Record<PublicStatKey, Copy> = {
    users: { TR: "Üye", EN: "Members" },
    projects: { TR: "Kod projesi", EN: "Code projects" },
    gameProjects: { TR: "Oyun projesi", EN: "Game projects" },
    arcadeGames: { TR: "Arcade oyunu", EN: "Arcade games" },
    mediaPosts: { TR: "Media yayını", EN: "Media posts" },
    groups: { TR: "Grup", EN: "Groups" },
};
function StatTile({ label, className = "", children }: { label: string; className?: string; children: React.ReactNode }) {
    return (
        <div className={`flex flex-col rounded-2xl border border-zinc-200 bg-white px-4 py-4 text-center dark:border-white/[0.08] dark:bg-zinc-900/60 ${className}`}>
            <dt className="order-2 mt-1.5 text-[12px] font-semibold text-zinc-500 dark:text-zinc-400">{label}</dt>
            <dd className="order-1 bg-gradient-to-r from-indigo-500 to-fuchsia-500 bg-clip-text text-3xl font-black leading-none text-transparent">{children}</dd>
        </div>
    );
}

export default function AboutPage() {
    const { t, tx, locale } = useI18n();
    const stats = usePublicStats();
    const [changelogOpen, setChangelogOpen] = useState(false);
    const closeChangelog = useCallback(() => setChangelogOpen(false), []);

    const entryText = (entry: EntryText) => ("key" in entry ? t(entry.key) || entry.key : tx(entry));
    const formatDate = (iso: string) => {
        const date = new Date(`${iso}T12:00:00Z`);
        return Number.isNaN(date.getTime()) ? iso : new Intl.DateTimeFormat(locale, { day: "numeric", month: "long", year: "numeric" }).format(date);
    };
    const updatedAt = (() => {
        const date = stats?.generatedAt ? new Date(stats.generatedAt) : null;
        return date && !Number.isNaN(date.getTime()) ? new Intl.DateTimeFormat(locale, { timeStyle: "short" }).format(date) : null;
    })();

    // A zero (or a missing count) is left out rather than shown as a number nobody can check.
    const liveKeys = stats ? STAT_KEYS.filter((key) => (stats[key] ?? 0) > 0) : [];
    const highlights = [t("f_free"), t("f_no_ads"), t("f_setup"), formatCopy(t("lp_ui_languages"), { count: LANGUAGES.length })].filter(Boolean);
    const facts: Array<{ label: Copy; value: number }> = [
        { label: C.factLanguages, value: LANGUAGE_STATS.usable },
        { label: C.factInterface, value: LANGUAGES.length },
        { label: C.factReleases, value: UPDATES.length },
    ];

    return (
        <div className="min-h-dvh bg-white text-zinc-900 dark:bg-zinc-950 dark:text-white">
            <Header />
            <main id="main-content">
                <section className="relative overflow-hidden">
                    <div className="absolute inset-0 bg-grid opacity-60 mask-fade-b" />
                    <div className="absolute -right-24 top-10 h-80 w-80 rounded-full bg-indigo-500/20 blur-3xl animate-float" />
                    <div className="relative mx-auto max-w-5xl px-4 pb-14 pt-32 text-center sm:px-6">
                        <p className="inline-flex items-center gap-1.5 rounded-full border border-indigo-500/20 bg-indigo-500/10 px-3 py-1 text-[12px] font-bold text-indigo-600 dark:text-indigo-300 animate-fade-up">HanStudios</p>
                        <h1 className="mt-5 text-5xl font-black tracking-tight sm:text-6xl animate-fade-up" style={{ animationDelay: "60ms" }}>{t("about_title")}</h1>
                        <p className="mx-auto mt-5 max-w-2xl text-[17px] leading-relaxed text-zinc-600 dark:text-zinc-400 animate-fade-up" style={{ animationDelay: "120ms" }}>{tx(C.lead)}</p>
                        <ul className="mx-auto mt-6 flex max-w-2xl flex-wrap justify-center gap-2 animate-fade-up" style={{ animationDelay: "180ms" }}>
                            {highlights.map((item) => (
                                <li key={item} className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white/70 px-3.5 py-1.5 text-[13.5px] font-medium text-zinc-700 backdrop-blur dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-zinc-300">
                                    <span className="text-emerald-500" aria-hidden="true">✓</span>{item}
                                </li>
                            ))}
                        </ul>
                    </div>
                </section>

                <section aria-labelledby="about-stats" className="mx-auto max-w-6xl px-4 pb-6 sm:px-6">
                    <div className="rounded-3xl border border-zinc-200 bg-zinc-50 p-5 sm:p-8 dark:border-white/[0.08] dark:bg-white/[0.03]">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <h2 id="about-stats" className="text-2xl font-black tracking-tight">{tx(C.statsTitle)}</h2>
                            {liveKeys.length ? (
                                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-[11px] font-black uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" aria-hidden="true" />{tx(C.live)}
                                </span>
                            ) : null}
                        </div>
                        <dl className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
                            {facts.map(({ label, value }, index) => (
                                <StatTile key={label.EN} label={tx(label)} className={index === facts.length - 1 ? "col-span-2 sm:col-span-1" : ""}>{formatCount(value, locale, false)}</StatTile>
                            ))}
                        </dl>
                        {stats === undefined ? (
                            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6" aria-hidden="true">
                                {STAT_KEYS.map((key) => (
                                    <div key={key} className="rounded-2xl border border-zinc-200 bg-white px-4 py-4 dark:border-white/[0.08] dark:bg-zinc-900/60">
                                        <div className="mx-auto h-8 w-16 animate-pulse rounded-lg bg-zinc-200 dark:bg-white/10" />
                                        <div className="mx-auto mt-2.5 h-3 w-20 animate-pulse rounded bg-zinc-200/70 dark:bg-white/[0.07]" />
                                    </div>
                                ))}
                            </div>
                        ) : liveKeys.length ? (
                            <>
                                <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                                    {liveKeys.map((key) => (
                                        <StatTile key={key} label={tx(STAT_LABELS[key])}><CountUp value={stats?.[key] ?? 0} locale={locale} /></StatTile>
                                    ))}
                                </dl>
                                <p className="mt-4 text-center text-[12.5px] text-zinc-500 dark:text-zinc-400">
                                    {updatedAt ? tx(C.statsNote, { time: updatedAt }) : tx(C.statsNoteNoTime)}
                                </p>
                            </>
                        ) : null}
                    </div>
                </section>

                <section aria-labelledby="about-products" className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
                    <h2 id="about-products" className="text-center text-3xl font-black tracking-tight">{t("ab_products")}</h2>
                    <p className="mx-auto mt-3 max-w-xl text-center text-[15px] text-zinc-600 dark:text-zinc-400">{tx(C.productsLead)}</p>
                    <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        {PRODUCTS.map((product, index) => (
                            <motion.div key={product.href} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: (index % 3) * 0.06 }}>
                                <Link href={product.href} className="group flex h-full flex-col rounded-3xl border border-zinc-200 bg-white p-6 transition hover:-translate-y-1 hover:shadow-xl hover:shadow-indigo-500/10 dark:border-white/[0.08] dark:bg-zinc-900/60">
                                    <span className="flex items-start justify-between gap-3">
                                        <span className={`grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br ${product.gradient} text-white shadow-lg`}><product.icon className="h-5 w-5" aria-hidden="true" /></span>
                                        {product.badge ? <span className="rounded-full bg-indigo-500/10 px-2.5 py-1 text-[11px] font-bold text-indigo-700 dark:text-indigo-300">{tx(product.badge)}</span> : null}
                                    </span>
                                    <h3 className="mt-4 text-lg font-black">{tx(product.title)}</h3>
                                    <p className="mt-1.5 flex-1 text-[14px] leading-relaxed text-zinc-600 dark:text-zinc-400">{tx(product.text, { count: LANGUAGE_STATS.usable })}</p>
                                    <span className="mt-4 inline-flex items-center gap-1 text-[13px] font-bold text-indigo-600 transition group-hover:gap-2 dark:text-indigo-300">{tx(NAV_LABELS.explore)}<ArrowRight className="h-4 w-4 rtl:rotate-180" aria-hidden="true" /></span>
                                </Link>
                            </motion.div>
                        ))}
                    </div>
                </section>

                <section aria-labelledby="about-values" className="mx-auto max-w-5xl px-4 pb-14 sm:px-6">
                    <motion.figure
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        className="relative overflow-hidden rounded-3xl bg-zinc-950 px-6 py-10 text-center text-white sm:px-12"
                    >
                        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(99,102,241,.5),transparent_50%),radial-gradient(circle_at_85%_80%,rgba(236,72,153,.35),transparent_50%)]" aria-hidden="true" />
                        <figcaption className="relative text-[12px] font-bold uppercase tracking-[0.2em] text-indigo-200">{tx(C.missionLabel)}</figcaption>
                        <blockquote className="relative mx-auto mt-3 max-w-2xl text-2xl font-black leading-snug tracking-tight sm:text-3xl">{tx(C.mission)}</blockquote>
                    </motion.figure>

                    <h2 id="about-values" className="mt-14 text-center text-3xl font-black tracking-tight">{tx(C.valuesTitle)}</h2>
                    <div className="mt-8 grid gap-4 md:grid-cols-2">
                        {VALUES.map((value, index) => (
                            <motion.article key={value.title.EN} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: (index % 2) * 0.06 }} className="rounded-3xl border border-zinc-200 bg-zinc-50 p-6 dark:border-white/[0.08] dark:bg-white/[0.03]">
                                <h3 className="flex items-center gap-2.5 text-xl font-black"><value.icon className={`h-6 w-6 ${value.tone}`} aria-hidden="true" />{tx(value.title)}</h3>
                                <p className="mt-3 text-[14.5px] leading-relaxed text-zinc-600 dark:text-zinc-400">{tx(value.text, { count: LANGUAGES.length, version: LEGAL_VERSION })}</p>
                            </motion.article>
                        ))}
                    </div>
                </section>

                <section aria-labelledby="about-timeline" className="mx-auto max-w-3xl px-4 pb-14 sm:px-6">
                    <h2 id="about-timeline" className="text-center text-3xl font-black tracking-tight">{tx(C.timelineTitle)}</h2>
                    <p className="mx-auto mt-3 max-w-xl text-center text-[15px] text-zinc-600 dark:text-zinc-400">{tx(C.timelineLead, { count: UPDATES.length })}</p>

                    <ol className="relative ms-3 mt-10 border-s-2 border-zinc-200 dark:border-white/10">
                        <li className="relative pb-8 ps-8">
                            <span className="absolute -start-[9px] top-1 grid h-4 w-4 place-items-center rounded-full border-2 border-dashed border-indigo-400 bg-white dark:bg-zinc-950" aria-hidden="true" />
                            <p className="text-[12px] font-black uppercase tracking-[0.18em] text-indigo-600 dark:text-indigo-300">{tx(C.upNext)}</p>
                            <ul className="mt-2 space-y-1.5 text-[14.5px] text-zinc-700 dark:text-zinc-300">
                                {[C.nextSocial, C.nextFinance].map((item) => (
                                    <li key={item.EN} className="flex items-start gap-2">
                                        <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-fuchsia-500" aria-hidden="true" />{tx(item)}
                                    </li>
                                ))}
                            </ul>
                        </li>
                        {UPDATES.map((entry, index) => (
                            <motion.li
                                key={entry.id}
                                initial={{ opacity: 0, y: 16 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true, margin: "-30px" }}
                                className="relative pb-8 ps-8 last:pb-0"
                            >
                                <span className={`absolute -start-[9px] top-1 h-4 w-4 rounded-full border-2 border-white dark:border-zinc-950 ${index === 0 ? "bg-indigo-500 ring-4 ring-indigo-500/20" : "bg-zinc-300 dark:bg-zinc-600"}`} aria-hidden="true" />
                                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                                    <h3 className="font-mono text-lg font-black">{entry.version}</h3>
                                    {index === 0 ? <span className="rounded-full bg-indigo-600 px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide text-white">{tx(C.latest)}</span> : null}
                                    <time dateTime={entry.date} className="text-[12.5px] text-zinc-500 dark:text-zinc-400">{formatDate(entry.date)}</time>
                                </div>
                                <p className="mt-1 text-[14.5px] font-bold text-indigo-700 dark:text-indigo-300">{entryText(entry.title)}</p>
                                <p className="mt-1 line-clamp-2 text-[14px] leading-relaxed text-zinc-600 dark:text-zinc-400">{entryText(entry.desc)}</p>
                            </motion.li>
                        ))}
                    </ol>
                    <div className="mt-8 text-center">
                        <button type="button" onClick={() => setChangelogOpen(true)} className="inline-flex h-11 items-center gap-2 rounded-xl border border-zinc-200 bg-white px-4 text-[14px] font-bold text-zinc-800 transition hover:-translate-y-0.5 hover:border-indigo-400 dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-100">
                            <Sparkles className="h-4 w-4 text-indigo-500" aria-hidden="true" />{tx(C.detailedNotes)}
                        </button>
                    </div>
                </section>

                <section className="mx-auto max-w-5xl px-4 pb-20 sm:px-6">
                    <div className="grid gap-4 md:grid-cols-2">
                        <article className="rounded-3xl border border-zinc-200 bg-zinc-50 p-6 dark:border-white/[0.08] dark:bg-white/[0.03]">
                            <h2 className="flex items-center gap-2.5 text-xl font-black"><Github className="h-6 w-6" aria-hidden="true" />{tx(C.openSourceTitle)}</h2>
                            <p className="mt-3 text-[14.5px] leading-relaxed text-zinc-600 dark:text-zinc-400">{tx(C.openSourceText)}</p>
                            <div className="mt-5 flex flex-wrap gap-2">
                                <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer" className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-zinc-900 px-4 text-[13.5px] font-bold text-white transition hover:-translate-y-0.5 dark:bg-white dark:text-zinc-900">
                                    {tx(C.viewOnGithub)}<ArrowUpRight className="h-4 w-4" aria-hidden="true" />
                                </a>
                                <a href={RELEASES_URL} target="_blank" rel="noopener noreferrer" className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-zinc-300 px-4 text-[13.5px] font-bold text-zinc-800 transition hover:-translate-y-0.5 dark:border-white/15 dark:text-zinc-100">
                                    {t("sf_desktop")}<ArrowUpRight className="h-4 w-4" aria-hidden="true" />
                                </a>
                            </div>
                        </article>
                        <article className="rounded-3xl border border-zinc-200 bg-gradient-to-br from-indigo-500/[0.06] to-fuchsia-500/[0.06] p-6 dark:border-white/[0.08]">
                            <h2 className="flex items-center gap-2.5 text-xl font-black"><LifeBuoy className="h-6 w-6 text-sky-500" aria-hidden="true" />{tx(C.contactTitle)}</h2>
                            <p className="mt-3 text-[14.5px] leading-relaxed text-zinc-600 dark:text-zinc-400">{tx(C.contactText)}</p>
                            <Link href="/feedback" className="mt-5 inline-flex items-center gap-1 text-[14.5px] font-bold text-indigo-600 hover:underline dark:text-indigo-300">
                                {tx(C.contactLink)}<ArrowRight className="h-4 w-4 rtl:rotate-180" aria-hidden="true" />
                            </Link>
                        </article>
                    </div>
                </section>
            </main>
            <SiteFooter />
            <ChangelogModal isOpen={changelogOpen} onClose={closeChangelog} />
        </div>
    );
}
