"use client";

import { AnimatePresence, motion, useScroll, useSpring } from "framer-motion";
import { ArrowRight, Check, Code2, FlaskConical, Gamepad2, LogIn, Radio, Rocket, UsersRound, X, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import Comparison from "@/components/Comparison";
import GridBackdrop from "@/components/GridBackdrop";
import Header from "@/components/Header";
import { CountUp, formatCount, usePublicStats, type PublicStatKey } from "@/components/PublicStats";
import SiteFooter from "@/components/SiteFooter";
import LanguageIcon from "@/components/Editor/LanguageIcon";
import { prefersReducedMotion } from "@/lib/appearance";
import { ENGINE_VERSION } from "@/lib/game-engine/types";
import { LANGUAGES, formatCopy, useI18n, type Copy } from "@/lib/i18n";
import { LANGUAGE_STATS, LANGUAGES as CODE_LANGUAGE_REGISTRY } from "@/lib/runtimes/languages";
import AllInOne from "./AllInOne";
import CodeShowcase from "./CodeShowcase";
import DownloadMenu from "./DownloadMenu";
import GuideTeaser from "./GuideTeaser";
import { Reveal } from "./motion";

// Every language that can be run or previewed (the number the copy quotes), popular ones first.
const CODE_LANGUAGES = CODE_LANGUAGE_REGISTRY
    .filter((language) => language.engine !== "none")
    .sort((a, b) => Number(Boolean(b.popular)) - Number(Boolean(a.popular)));

const COPY = {
    showcaseRuns: { TR: "Aşağıdaki oyun bu kurallarla çalışıyor", EN: "The game below runs on these rules" },
    tap: { TR: "Dokun / Space: oyna", EN: "Tap / Space: play" },
    jump: { TR: "Dokun / Space: zıpla, havada bir daha", EN: "Tap / Space: jump, again in the air" },
    play: { TR: "Oyna", EN: "Play" },
    again: { TR: "Tekrar için dokun / Space", EN: "Tap / Space to play again" },
    over: { TR: "Oyun bitti", EN: "Game over" },
    best: { TR: "En iyi", EN: "Best" },
    score: { TR: "Skor", EN: "Score" },
    cta: {
        TR: "Ücretsiz başla, kurulum yok",
        EN: "Free to start, nothing to install",
    },
    ctaTitle: { TR: "Fikrinden yayına, hepsi tek sekmede", EN: "From idea to launch, all in one tab" },
    ctaSub: {
        TR: "{count} dilde kod yaz, Hanogt Engine ile oyun yap, Arcade'de yayınla ve toplulukla paylaş. Hepsi tek hesapta.",
        EN: "Write code in {count} languages, build games with Hanogt Engine, publish them to Arcade and share with the community. All in one account.",
    },
    live: { TR: "Canlı topluluk rakamları", EN: "Live community numbers" },
    quickStart: { TR: "Hızlı başlangıç", EN: "Quick start" },
    factLanguages: { TR: "Programlama dili", EN: "Programming languages" },
    factInterface: { TR: "Arayüz dili", EN: "Interface languages" },
    factEngine: { TR: "Hanogt Engine sürümü", EN: "Hanogt Engine version" },
} satisfies Record<string, Copy>;

function RotatingWord() {
    const { t } = useI18n();
    const words = [t("lp_rot_code"), t("lp_rot_games"), t("lp_rot_publish"), t("lp_rot_news")];
    const count = words.length;
    const [index, setIndex] = useState(0);
    useEffect(() => {
        if (prefersReducedMotion()) return;
        const timer = window.setInterval(() => setIndex((value) => (value + 1) % count), 2600);
        return () => window.clearInterval(timer);
    }, [count]);
    return (
        <span className="relative inline-grid align-bottom">
            <AnimatePresence mode="popLayout" initial={false}>
                <motion.span
                    key={index}
                    initial={{ y: "55%", opacity: 0, filter: "blur(6px)" }}
                    animate={{ y: "0%", opacity: 1, filter: "blur(0px)" }}
                    exit={{ y: "-55%", opacity: 0, filter: "blur(6px)" }}
                    transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                    className="text-gradient animate-gradient whitespace-nowrap pb-2"
                >
                    {words[index]}
                </motion.span>
            </AnimatePresence>
        </span>
    );
}

// ---------------------------------------------------------------- Final call to action

type StatKey = Extract<PublicStatKey, "users" | "projects" | "gameProjects" | "arcadeGames">;

const STAT_KEYS: StatKey[] = ["users", "projects", "gameProjects", "arcadeGames"];

const QUICK_START: Array<{ href: string; icon: LucideIcon; title: Copy; text: Copy }> = [
    { href: "/editor", icon: Code2, title: { TR: "Kod yaz", EN: "Write code" }, text: { TR: "{count} dilde, kurulum olmadan çalıştır.", EN: "Run {count} languages with nothing to install." } },
    { href: "/game-engine", icon: Gamepad2, title: { TR: "Oyun yap", EN: "Build a game" }, text: { TR: "Hanogt Engine: tilemap, arayüz ve animasyon.", EN: "Hanogt Engine: tilemaps, UI and animation." } },
    { href: "/social", icon: UsersRound, title: { TR: "Topluluğa katıl", EN: "Join the community" }, text: { TR: "Arkadaşlar, gruplar ve mesajlar tek yerde.", EN: "Friends, groups and messages in one place." } },
];

const STAT_LABELS: Record<StatKey, Copy> = {
    users: { TR: "Üye", EN: "Members" },
    projects: { TR: "Kod projesi", EN: "Code projects" },
    gameProjects: { TR: "Oyun projesi", EN: "Game projects" },
    arcadeGames: { TR: "Arcade oyunu", EN: "Arcade games" },
};

function FinalCta({ signedIn }: { signedIn: boolean }) {
    const { t, tx, locale } = useI18n();
    const stats = usePublicStats();
    const languageCount = LANGUAGE_STATS.usable;

    // A zero says nothing good about the site, so only real, positive numbers are shown.
    const liveTiles = stats ? STAT_KEYS.filter((key) => (stats[key] ?? 0) > 0) : [];
    const showLive = stats !== undefined && stats !== null && liveTiles.length >= 2;
    const facts: Array<{ label: Copy; value: number | string }> = [
        { label: COPY.factLanguages, value: languageCount },
        { label: COPY.factInterface, value: LANGUAGES.length },
        { label: COPY.factEngine, value: `V${ENGINE_VERSION}` },
    ];

    const tileClass = "flex flex-col rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3.5 text-center";
    const labelClass = "order-2 mt-1 text-[11.5px] font-semibold uppercase tracking-wider text-zinc-400";
    const valueClass = "order-1 text-3xl font-black leading-none text-white";

    return (
        <section aria-labelledby="final-cta-title" className="px-4 py-24 sm:px-6">
            <Reveal className="relative isolate mx-auto max-w-6xl overflow-hidden rounded-[2rem] bg-zinc-950 px-5 py-14 text-white [--border-subtle:rgba(255,255,255,0.07)] [--grid-accent:rgba(192,132,252,0.3)] [--text-gradient:var(--text-gradient-bright)] sm:px-10 lg:px-14 lg:py-16 dark:border dark:border-white/10">
                <GridBackdrop fade="bottom" />
                <div className="mx-auto max-w-3xl text-center">
                    <span className="inline-flex items-center gap-2 rounded-full border border-white/15 px-3.5 py-1.5 text-[12.5px] font-bold text-zinc-200">
                        <Rocket className="h-3.5 w-3.5 text-brand-crescent" aria-hidden="true" />{tx(COPY.cta)}
                    </span>
                    <h2 id="final-cta-title" className="mt-5 text-balance text-4xl font-black leading-[1.08] tracking-tight sm:text-5xl"><span className="text-gradient animate-gradient">{tx(COPY.ctaTitle)}</span></h2>
                    <p className="mx-auto mt-4 max-w-2xl text-[16px] leading-relaxed text-zinc-300">{tx(COPY.ctaSub, { count: languageCount })}</p>
                </div>

                <ul className="mt-10 grid gap-3 md:grid-cols-3" aria-label={tx(COPY.quickStart)}>
                    {QUICK_START.map(({ href, icon: Icon, title, text }) => (
                        <li key={href}>
                            <Link href={href} className="group flex h-full items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.04] p-4 transition duration-300 hover:-translate-y-1 hover:border-white/30 hover:bg-white/[0.07] md:flex-col md:items-start md:gap-3 md:p-5">
                                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white/10 transition-transform duration-300 group-hover:-rotate-6 group-hover:scale-110"><Icon className="h-5 w-5 text-brand-crescent" aria-hidden="true" /></span>
                                <span className="min-w-0 flex-1">
                                    <span className="hover-text-gradient block text-lg font-black leading-tight">{tx(title)}</span>
                                    <span className="mt-1 block text-[13.5px] leading-snug text-zinc-400">{tx(text, { count: languageCount })}</span>
                                </span>
                                <ArrowRight className="h-5 w-5 shrink-0 text-zinc-500 transition group-hover:translate-x-0.5 group-hover:text-white rtl:rotate-180 md:hidden" aria-hidden="true" />
                            </Link>
                        </li>
                    ))}
                </ul>

                <div className="mt-8">
                    {showLive ? (
                        <p className="mb-3 flex items-center justify-center gap-2 text-[12px] font-bold uppercase tracking-[0.18em] text-zinc-400">
                            <span className="h-1.5 w-1.5 rounded-full bg-brand-crescent" aria-hidden="true" />{tx(COPY.live)}
                        </p>
                    ) : null}
                    {stats === undefined ? (
                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4" aria-hidden="true">
                            {STAT_KEYS.map((key) => (
                                <div key={key} className={tileClass}>
                                    <div className="mx-auto h-8 w-16 animate-pulse rounded-lg bg-white/10" />
                                    <div className="mx-auto mt-2 h-3 w-20 animate-pulse rounded bg-white/10" />
                                </div>
                            ))}
                        </div>
                    ) : showLive ? (
                        <dl className={`grid grid-cols-2 gap-3 ${liveTiles.length >= 4 ? "sm:grid-cols-4" : liveTiles.length === 3 ? "sm:grid-cols-3" : ""}`}>
                            {liveTiles.map((key) => (
                                <div key={key} className={tileClass}>
                                    <dt className={labelClass}>{tx(STAT_LABELS[key])}</dt>
                                    <dd className={valueClass}><CountUp value={stats?.[key] ?? 0} locale={locale} /></dd>
                                </div>
                            ))}
                        </dl>
                    ) : (
                        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                            {facts.map(({ label, value }, index) => (
                                <div key={label.EN} className={`${tileClass} ${index === facts.length - 1 ? "col-span-2 sm:col-span-1" : ""}`}>
                                    <dt className={labelClass}>{tx(label)}</dt>
                                    <dd className={valueClass}>{typeof value === "number" ? formatCount(value, locale, false) : value}</dd>
                                </div>
                            ))}
                        </dl>
                    )}
                </div>

                <div className="mt-10 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
                    <Link href={signedIn ? "/dashboard" : "/signup"} className="btn-sheen inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-white px-6 text-[15px] font-bold text-zinc-900 transition hover:-translate-y-0.5 hover:bg-zinc-100 [--sheen:rgba(168,85,247,0.25)]">
                        <Rocket className="h-4.5 w-4.5" aria-hidden="true" />{signedIn ? t("go_to_dashboard") : t("lp_start_free")}
                    </Link>
                    <Link href={signedIn ? "/arcade" : "/login"} className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-white/25 px-6 text-[15px] font-bold text-white transition hover:bg-white/10">
                        {signedIn ? <Gamepad2 className="h-4.5 w-4.5" aria-hidden="true" /> : <LogIn className="h-4.5 w-4.5" aria-hidden="true" />}
                        {signedIn ? t("lp_browse_arcade") : t("login")}
                    </Link>
                </div>
            </Reveal>
        </section>
    );
}

/** How far down the page the visitor is, as a thin bar in the accent gradient under the header. */
function ScrollProgress() {
    const { scrollYProgress } = useScroll();
    const scaleX = useSpring(scrollYProgress, { stiffness: 140, damping: 26, restDelta: 0.001 });
    return <motion.div aria-hidden="true" className="fixed inset-x-0 top-16 z-40 h-0.5 origin-left bg-[image:var(--text-gradient)] rtl:origin-right" style={{ scaleX }} />;
}

export default function LandingPage() {
    const { data: session } = useSession();
    const { t, tx } = useI18n();
    const [bannerVisible, setBannerVisible] = useState(false);
    const signedIn = Boolean(session?.user);
    const languageCount = LANGUAGE_STATS.usable;

    useEffect(() => {
        let closed = true;
        try {
            closed = Boolean(localStorage.getItem("hanogt_banner_closed"));
        } catch {
            closed = true;
        }
        if (closed) return;
        const timer = window.setTimeout(() => setBannerVisible(true), 600);
        return () => window.clearTimeout(timer);
    }, []);

    const closeBanner = () => {
        try {
            localStorage.setItem("hanogt_banner_closed", "true");
        } catch {
            // Ignore blocked storage.
        }
        setBannerVisible(false);
    };

    const trust: string[] = [t("f_free"), t("f_no_ads"), t("f_setup"), t("lp_ui_languages").replace("{count}", String(LANGUAGES.length))].filter(Boolean);

    return (
        <div className="min-h-dvh overflow-x-clip bg-white text-zinc-900 dark:bg-zinc-950 dark:text-white">
            <Header />
            <ScrollProgress />

            <AnimatePresence>
                {bannerVisible ? (
                    <motion.div
                        initial={{ y: 40, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        exit={{ y: 40, opacity: 0 }}
                        className="fixed bottom-4 start-4 z-40 flex max-w-sm items-start gap-3 rounded-2xl border border-amber-500/30 bg-amber-50 p-3.5 text-[13px] text-amber-900 shadow-lg dark:bg-amber-950 dark:text-amber-100"
                        role="status"
                    >
                        <FlaskConical className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                        <p className="flex-1 font-medium leading-snug">{t("banner_warning")}</p>
                        <button type="button" onClick={closeBanner} className="grid h-6 w-6 place-items-center rounded-lg hover:bg-amber-500/20" aria-label={t("ui_close")}><X className="h-4 w-4" /></button>
                    </motion.div>
                ) : null}
            </AnimatePresence>

            <main id="main-content">
                {/* ------------------------------------------------------------ Hero */}
                <section className="relative isolate pt-16">
                    <GridBackdrop />
                    <div className="mx-auto grid max-w-7xl grid-cols-1 items-center gap-12 px-4 pb-16 pt-12 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:pb-24 lg:pt-20">
                        <div className="min-w-0">
                            <Link href="/news" className="group inline-flex animate-fade-up items-center gap-2 rounded-full border border-zinc-200 py-1 pe-3 ps-1 text-[12.5px] font-semibold text-zinc-700 transition hover:border-zinc-400 dark:border-white/10 dark:text-zinc-200 dark:hover:border-white/30">
                                <span className="inline-flex items-center gap-1 rounded-full bg-red-600 px-2 py-0.5 text-[10.5px] font-black uppercase tracking-wider text-white">
                                    <Radio className="h-3 w-3" aria-hidden="true" />{t("lp_new")}
                                </span>
                                {t("lp_news_live")}
                                <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5 rtl:rotate-180 rtl:group-hover:-translate-x-0.5" aria-hidden="true" />
                            </Link>

                            <h1 className="mt-6 animate-fade-up text-[2.6rem] font-black leading-[1.05] tracking-tight sm:text-6xl lg:text-[4rem]" style={{ animationDelay: "80ms" }}>
                                <span className="sr-only">{t("lp_hero_sr")}</span>
                                <span aria-hidden="true">
                                    {t("lp_hero_prefix")}
                                    <br />
                                    <RotatingWord />
                                </span>
                            </h1>

                            <p className="mt-5 max-w-xl animate-fade-up text-[17px] leading-relaxed text-zinc-600 dark:text-zinc-400" style={{ animationDelay: "160ms" }}>
                                {formatCopy(t("lp_hero_sub"), { count: languageCount })}
                            </p>

                            {/* z-10: the download menu opens over the showcase below on narrow screens. */}
                            <div className="relative z-10 mt-8 flex animate-fade-up flex-wrap items-center gap-3" style={{ animationDelay: "240ms" }}>
                                <Link href={signedIn ? "/dashboard" : "/signup"} className="btn-sheen group inline-flex h-12 items-center gap-2 rounded-2xl bg-zinc-900 px-6 text-[15px] font-bold text-white transition hover:-translate-y-0.5 hover:bg-zinc-700 hover:shadow-lg active:translate-y-0 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200 dark:[--sheen:rgba(168,85,247,0.25)]">
                                    <Rocket className="h-4.5 w-4.5 transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5" aria-hidden="true" />
                                    {signedIn ? t("go_to_dashboard") : t("lp_start_free")}
                                </Link>
                                <DownloadMenu />
                            </div>

                            <ul className="mt-8 flex animate-fade-up flex-wrap gap-x-5 gap-y-2 text-[13.5px] font-medium text-zinc-600 dark:text-zinc-400" style={{ animationDelay: "320ms" }}>
                                {trust.map((item) => (
                                    <li key={item} className="inline-flex items-center gap-1.5"><Check className="h-4 w-4 text-brand-green" strokeWidth={3} aria-hidden="true" />{item}</li>
                                ))}
                            </ul>
                        </div>

                        <div className="min-w-0 animate-fade-up" style={{ animationDelay: "200ms" }}>
                            <CodeShowcase labels={{
                                file: "Runner.cs",
                                runs: tx(COPY.showcaseRuns),
                                hint: tx(COPY.jump),
                                tap: tx(COPY.tap),
                                play: tx(COPY.play),
                                again: tx(COPY.again),
                                over: tx(COPY.over),
                                best: tx(COPY.best),
                                score: tx(COPY.score),
                            }} />
                        </div>
                    </div>
                </section>

                {/* ------------------------------------------------------------ Languages marquee */}
                <section className="border-y border-zinc-200/70 bg-zinc-50/70 py-6 dark:border-white/[0.06] dark:bg-white/[0.02]" aria-label={t("lp_supported_langs")}>
                    <p className="mb-4 text-center text-[12px] font-bold uppercase tracking-[0.2em] text-zinc-500">{formatCopy(t("lp_marquee"), { count: languageCount })}</p>
                    <div className="mask-fade-x overflow-hidden" dir="ltr">
                        <div className="flex w-max animate-marquee gap-10 hover:[animation-play-state:paused] motion-reduce:animate-none">
                            {[...CODE_LANGUAGES, ...CODE_LANGUAGES].map((language, index) => (
                                <div key={`${language.id}-${index}`} className="flex shrink-0 items-center gap-2.5 opacity-75 grayscale transition hover:opacity-100 hover:grayscale-0" aria-hidden={index >= CODE_LANGUAGES.length ? true : undefined}>
                                    <LanguageIcon language={language.id} size={30} />
                                    <span className="text-[14px] font-bold text-zinc-600 dark:text-zinc-300">{language.name}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </section>

                {/* ------------------------------------------------------------ One account, all of it */}
                <AllInOne />

                <GuideTeaser />

                {/* ------------------------------------------------------------ Comparison */}
                <section className="bg-zinc-50 py-24 dark:bg-white/[0.02]">
                    <Reveal className="mx-auto mb-10 max-w-2xl px-4 text-center">
                        <h2 className="text-3xl font-black tracking-tight sm:text-4xl"><span className="text-gradient animate-gradient">{t("why_hanogt")}</span></h2>
                        <p className="mt-3 text-[15px] text-zinc-600 dark:text-zinc-400">{t("comparison_quote")}</p>
                    </Reveal>
                    <Reveal delay={0.08} className="px-4"><Comparison /></Reveal>
                </section>

                <FinalCta signedIn={signedIn} />
            </main>

            <SiteFooter />
        </div>
    );
}
