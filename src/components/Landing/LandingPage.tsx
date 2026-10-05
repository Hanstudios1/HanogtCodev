"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Check, Code2, FlaskConical, Gamepad2, LogIn, Play, Radio, Rocket, UsersRound, X, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import Comparison from "@/components/Comparison";
import Header from "@/components/Header";
import { CountUp, formatCount, usePublicStats, type PublicStatKey } from "@/components/PublicStats";
import ProductLogo from "@/components/ProductLogo";
import SiteFooter from "@/components/SiteFooter";
import LanguageIcon from "@/components/Editor/LanguageIcon";
import { LANGUAGES, formatCopy, useI18n, type Copy } from "@/lib/i18n";
import { PLAN_AI_LIMITS } from "@/lib/plans";
import { PRODUCTS, type LogoId } from "@/lib/products";
import { LANGUAGE_STATS, LANGUAGES as CODE_LANGUAGE_REGISTRY } from "@/lib/runtimes/languages";
import CodeShowcase from "./CodeShowcase";
import DownloadMenu from "./DownloadMenu";
import GuideTeaser from "./GuideTeaser";
import LiveNewsMini from "./LiveNewsMini";
import { AiPreview, EditorPreview, EnginePreview, SecurityPreview, SocialPreview } from "./ProductPreviews";

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
    whatKicker: { TR: "Hanogt'ta neler var", EN: "What's in Hanogt" },
    whatTitle: { TR: "Tek hesap, hepsi bir arada", EN: "One account, all of it" },
    whatSub: { TR: "Kod yazmaktan oyun yayınlamaya, arkadaşlarla konuşmaktan hesabını korumaya kadar her şey aynı yerde.", EN: "From writing code to publishing games, from talking with friends to protecting your account, it's all in one place." },
    editorName: { TR: "Kod Editörü", EN: "Code Editor" },
    editorTagline: { TR: "Kurulum olmadan, tarayıcında kod yaz ve çalıştır", EN: "Write and run code in your browser, nothing to install" },
    tryIt: { TR: "Hemen dene", EN: "Try it now" },
    arcadeTitle: { TR: "Arcade ve Media", EN: "Arcade and Media" },
    arcadeText: { TR: "Topluluğun oyunlarını oyna, beğen ve remiksle; kodunu Media'da paylaş, yorumları oku.", EN: "Play, like and remix the community's games; share your code on Media and read the comments." },
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

type Row = {
    logo: LogoId | null;
    icon?: LucideIcon;
    name: Copy | string;
    tagline: Copy;
    points: Copy[];
    href: string;
    preview: React.ReactNode;
};

function rows(languageCount: number): Row[] {
    const free = PLAN_AI_LIMITS.free;
    return [
        {
            logo: "hanogt",
            name: COPY.editorName,
            tagline: COPY.editorTagline,
            points: [
                { TR: "{count} dili tek tıkla çalıştır", EN: "Run {count} languages in one click", vars: { count: languageCount } },
                { TR: "Monaco, sekmeler, projeler ve ekiple düzenleme", EN: "Monaco, tabs, projects and editing together" },
                { TR: "Kodunu Media'da yayınla", EN: "Publish your code to Media" },
            ],
            href: "/editor",
            preview: <EditorPreview />,
        },
        {
            logo: "ai",
            name: PRODUCTS.ai.name,
            tagline: PRODUCTS.ai.tagline,
            points: [
                { TR: "Zor sorularda yanıtlamadan önce düşünür", EN: "Thinks before answering hard questions" },
                { TR: "Editörde açık dosyanı görür, kodunu düzeltir", EN: "Sees the file open in your editor and fixes your code" },
                { TR: "Ücretsiz planda {days} günde {count} mesaj", EN: "{count} messages per {days} days on Free", vars: { count: free.perWindow, days: free.windowDays } },
            ],
            href: PRODUCTS.ai.href,
            preview: <AiPreview />,
        },
        {
            logo: "engine",
            name: PRODUCTS.engine.name,
            tagline: PRODUCTS.engine.tagline,
            points: [
                { TR: "Hiyerarşi, Inspector, sahne ve oyun görünümü", EN: "Hierarchy, Inspector, scene and game views" },
                { TR: "Fizik, parçacıklar, ses ve WebGL", EN: "Physics, particles, sound and WebGL" },
                { TR: "Tek dosya HTML olarak dışa aktar, Arcade'de yayınla", EN: "Export one HTML file, publish it to Arcade" },
            ],
            href: PRODUCTS.engine.href,
            preview: <EnginePreview />,
        },
        {
            logo: "social",
            name: PRODUCTS.social.name,
            tagline: PRODUCTS.social.tagline,
            points: [
                { TR: "Arkadaşlar, direkt mesajlar ve gruplar", EN: "Friends, direct messages and groups" },
                { TR: "Sesli arama ve sesli mesaj", EN: "Voice calls and voice messages" },
                { TR: "Çevrimiçi durumu ve özel durum", EN: "Online status and a custom status" },
            ],
            href: PRODUCTS.social.href,
            preview: <SocialPreview />,
        },
        {
            logo: "news",
            name: PRODUCTS.news.name,
            tagline: PRODUCTS.news.tagline,
            points: [
                { TR: "Yapay zekâ, yazılım, oyun ve piyasalar", EN: "AI, software, gaming and markets" },
                { TR: "Yorumlar ve yapay zekâ arenası", EN: "Comments and the AI arena" },
                { TR: "Dakika dakika güncellenir", EN: "Updated by the minute" },
            ],
            href: PRODUCTS.news.href,
            preview: (
                <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-zinc-900">
                    <LiveNewsMini />
                </div>
            ),
        },
        {
            logo: "security",
            name: PRODUCTS.security.name,
            tagline: PRODUCTS.security.tagline,
            points: [
                { TR: "Google ile girişten sonra şifre adımı", EN: "A password step after a Google sign-in" },
                { TR: "İki adımlı doğrulama ve her yerden çıkış", EN: "Two-step verification and signing out everywhere" },
                { TR: "Kod çalıştırılmadan önce güvenlik taraması", EN: "A security scan before code runs" },
            ],
            href: PRODUCTS.security.href,
            preview: <SecurityPreview />,
        },
    ];
}

function RotatingWord() {
    const { t } = useI18n();
    const words = [t("lp_rot_code"), t("lp_rot_games"), t("lp_rot_publish"), t("lp_rot_news")];
    const count = words.length;
    const [index, setIndex] = useState(0);
    useEffect(() => {
        if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
        const timer = window.setInterval(() => setIndex((value) => (value + 1) % count), 2600);
        return () => window.clearInterval(timer);
    }, [count]);
    return (
        <span className="relative inline-grid align-bottom">
            <AnimatePresence mode="popLayout" initial={false}>
                <motion.span
                    key={index}
                    initial={{ y: "40%", opacity: 0 }}
                    animate={{ y: "0%", opacity: 1 }}
                    exit={{ y: "-40%", opacity: 0 }}
                    transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                    className="whitespace-nowrap pb-2 text-brand-green"
                >
                    {words[index]}
                </motion.span>
            </AnimatePresence>
        </span>
    );
}

function ProductRow({ row, index }: { row: Row; index: number }) {
    const { tx } = useI18n();
    const name = typeof row.name === "string" ? row.name : tx(row.name);
    const flip = index % 2 === 1;
    return (
        <article className="grid items-center gap-8 border-t border-zinc-200 py-14 first:border-t-0 lg:grid-cols-2 lg:gap-16 dark:border-white/[0.08]">
            <div className={flip ? "lg:order-2" : ""}>
                <div className="flex items-center gap-3">
                    {row.logo ? <ProductLogo product={row.logo} size={44} /> : null}
                    <h3 className="text-2xl font-black tracking-tight sm:text-3xl">{name}</h3>
                </div>
                <p className="mt-3 text-[17px] leading-relaxed text-zinc-600 dark:text-zinc-400">{tx(row.tagline)}</p>
                <ul className="mt-5 space-y-2.5">
                    {row.points.map((point) => (
                        <li key={point.EN} className="flex items-start gap-2.5 text-[15px] text-zinc-700 dark:text-zinc-300">
                            <Check className="mt-0.5 h-4.5 w-4.5 shrink-0 text-brand-green" strokeWidth={2.5} aria-hidden="true" />{tx(point)}
                        </li>
                    ))}
                </ul>
                <Link href={row.href} aria-label={`${name}: ${tx(COPY.tryIt)}`} className="mt-6 inline-flex items-center gap-1.5 text-[15px] font-bold text-zinc-900 underline decoration-zinc-300 decoration-2 underline-offset-4 transition hover:decoration-brand-green dark:text-white dark:decoration-zinc-600">
                    {tx(COPY.tryIt)}<ArrowRight className="h-4 w-4 rtl:rotate-180" aria-hidden="true" />
                </Link>
            </div>
            <div className={`min-w-0 ${flip ? "lg:order-1" : ""}`}>{row.preview}</div>
        </article>
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
        { label: COPY.factEngine, value: "V3" },
    ];

    const tileClass = "flex flex-col rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3.5 text-center";
    const labelClass = "order-2 mt-1 text-[11.5px] font-semibold uppercase tracking-wider text-zinc-400";
    const valueClass = "order-1 text-3xl font-black leading-none text-white";

    return (
        <section aria-labelledby="final-cta-title" className="px-4 py-24 sm:px-6">
            <div className="mx-auto max-w-6xl rounded-[2rem] bg-zinc-950 px-5 py-14 text-white sm:px-10 lg:px-14 lg:py-16 dark:border dark:border-white/10">
                <div className="mx-auto max-w-3xl text-center">
                    <span className="inline-flex items-center gap-2 rounded-full border border-white/15 px-3.5 py-1.5 text-[12.5px] font-bold text-zinc-200">
                        <Rocket className="h-3.5 w-3.5 text-brand-crescent" aria-hidden="true" />{tx(COPY.cta)}
                    </span>
                    <h2 id="final-cta-title" className="mt-5 text-balance text-4xl font-black leading-[1.08] tracking-tight sm:text-5xl">{tx(COPY.ctaTitle)}</h2>
                    <p className="mx-auto mt-4 max-w-2xl text-[16px] leading-relaxed text-zinc-300">{tx(COPY.ctaSub, { count: languageCount })}</p>
                </div>

                <ul className="mt-10 grid gap-3 md:grid-cols-3" aria-label={tx(COPY.quickStart)}>
                    {QUICK_START.map(({ href, icon: Icon, title, text }) => (
                        <li key={href}>
                            <Link href={href} className="group flex h-full items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.04] p-4 transition hover:border-white/30 hover:bg-white/[0.07] md:flex-col md:items-start md:gap-3 md:p-5">
                                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white/10"><Icon className="h-5 w-5 text-brand-crescent" aria-hidden="true" /></span>
                                <span className="min-w-0 flex-1">
                                    <span className="block text-lg font-black leading-tight">{tx(title)}</span>
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
                    <Link href={signedIn ? "/dashboard" : "/signup"} className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-white px-6 text-[15px] font-bold text-zinc-900 transition hover:bg-zinc-100">
                        <Rocket className="h-4.5 w-4.5" aria-hidden="true" />{signedIn ? t("go_to_dashboard") : t("lp_start_free")}
                    </Link>
                    <Link href={signedIn ? "/arcade" : "/login"} className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-white/25 px-6 text-[15px] font-bold text-white transition hover:bg-white/10">
                        {signedIn ? <Gamepad2 className="h-4.5 w-4.5" aria-hidden="true" /> : <LogIn className="h-4.5 w-4.5" aria-hidden="true" />}
                        {signedIn ? t("lp_browse_arcade") : t("login")}
                    </Link>
                </div>
            </div>
        </section>
    );
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
                <section className="pt-16">
                    <div className="mx-auto grid max-w-7xl grid-cols-1 items-center gap-12 px-4 pb-16 pt-12 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:pb-24 lg:pt-20">
                        <div className="min-w-0">
                            <Link href="/news" className="group inline-flex items-center gap-2 rounded-full border border-zinc-200 py-1 pe-3 ps-1 text-[12.5px] font-semibold text-zinc-700 transition hover:border-zinc-400 dark:border-white/10 dark:text-zinc-200 dark:hover:border-white/30">
                                <span className="inline-flex items-center gap-1 rounded-full bg-red-600 px-2 py-0.5 text-[10.5px] font-black uppercase tracking-wider text-white">
                                    <Radio className="h-3 w-3" aria-hidden="true" />{t("lp_new")}
                                </span>
                                {t("lp_news_live")}
                                <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5 rtl:rotate-180 rtl:group-hover:-translate-x-0.5" aria-hidden="true" />
                            </Link>

                            <h1 className="mt-6 text-[2.6rem] font-black leading-[1.05] tracking-tight sm:text-6xl lg:text-[4rem]">
                                <span className="sr-only">{t("lp_hero_sr")}</span>
                                <span aria-hidden="true">
                                    {t("lp_hero_prefix")}
                                    <br />
                                    <RotatingWord />
                                </span>
                            </h1>

                            <p className="mt-5 max-w-xl text-[17px] leading-relaxed text-zinc-600 dark:text-zinc-400">
                                {formatCopy(t("lp_hero_sub"), { count: languageCount })}
                            </p>

                            {/* z-10: the download menu opens over the showcase below on narrow screens. */}
                            <div className="relative z-10 mt-8 flex flex-wrap items-center gap-3">
                                <Link href={signedIn ? "/dashboard" : "/signup"} className="inline-flex h-12 items-center gap-2 rounded-2xl bg-zinc-900 px-6 text-[15px] font-bold text-white transition hover:bg-zinc-700 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200">
                                    <Rocket className="h-4.5 w-4.5" aria-hidden="true" />
                                    {signedIn ? t("go_to_dashboard") : t("lp_start_free")}
                                </Link>
                                <DownloadMenu />
                            </div>

                            <ul className="mt-8 flex flex-wrap gap-x-5 gap-y-2 text-[13.5px] font-medium text-zinc-600 dark:text-zinc-400">
                                {trust.map((item) => (
                                    <li key={item} className="inline-flex items-center gap-1.5"><Check className="h-4 w-4 text-brand-green" strokeWidth={3} aria-hidden="true" />{item}</li>
                                ))}
                            </ul>
                        </div>

                        <div className="min-w-0">
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

                {/* ------------------------------------------------------------ What's in Hanogt */}
                <section aria-labelledby="products-title" className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
                    <div className="max-w-2xl">
                        <p className="text-[13px] font-bold uppercase tracking-[0.18em] text-brand-green">{tx(COPY.whatKicker)}</p>
                        <h2 id="products-title" className="mt-3 text-4xl font-black tracking-tight sm:text-5xl">{tx(COPY.whatTitle)}</h2>
                        <p className="mt-4 text-[17px] leading-relaxed text-zinc-600 dark:text-zinc-400">{tx(COPY.whatSub)}</p>
                    </div>
                    <div className="mt-6">
                        {rows(languageCount).map((row, index) => <ProductRow key={row.href} row={row} index={index} />)}
                    </div>
                    <div className="mt-2 grid gap-4 border-t border-zinc-200 pt-10 sm:grid-cols-[1fr_auto] sm:items-center dark:border-white/[0.08]">
                        <div>
                            <h3 className="text-xl font-black">{tx(COPY.arcadeTitle)}</h3>
                            <p className="mt-1.5 max-w-2xl text-[15px] leading-relaxed text-zinc-600 dark:text-zinc-400">{tx(COPY.arcadeText)}</p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <Link href="/arcade" className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-zinc-300 px-4 text-[14px] font-bold transition hover:border-zinc-500 dark:border-white/15 dark:hover:border-white/40"><Play className="h-4 w-4" aria-hidden="true" />Arcade</Link>
                            <Link href="/media" className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-zinc-300 px-4 text-[14px] font-bold transition hover:border-zinc-500 dark:border-white/15 dark:hover:border-white/40">Media</Link>
                        </div>
                    </div>
                </section>

                <GuideTeaser />

                {/* ------------------------------------------------------------ Comparison */}
                <section className="bg-zinc-50 py-24 dark:bg-white/[0.02]">
                    <div className="mx-auto mb-10 max-w-2xl px-4 text-center">
                        <h2 className="text-3xl font-black tracking-tight sm:text-4xl">{t("why_hanogt")}</h2>
                        <p className="mt-3 text-[15px] text-zinc-600 dark:text-zinc-400">{t("comparison_quote")}</p>
                    </div>
                    <div className="px-4"><Comparison /></div>
                </section>

                <FinalCta signedIn={signedIn} />
            </main>

            <SiteFooter />
        </div>
    );
}
