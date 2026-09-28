"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
    ArrowRight, Bot, Boxes, Check, Code2, Gamepad2, Globe2, Heart, MessageSquare, Newspaper, Play, Radio, Rocket, ShieldCheck, Sparkles,
    Trophy, UsersRound, X, Zap,
} from "lucide-react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useEffect, useRef, useState } from "react";
import Comparison from "@/components/Comparison";
import Header from "@/components/Header";
import OptimizedImage from "@/components/OptimizedImage";
import SiteFooter from "@/components/SiteFooter";
import { LANGUAGES, useI18n, type Copy } from "@/lib/i18n";
import CodeShowcase from "./CodeShowcase";
import DownloadMenu from "./DownloadMenu";
import GuideTeaser from "./GuideTeaser";
import LiveNewsMini from "./LiveNewsMini";
import SpotlightCard from "./SpotlightCard";

const ROTATING: Copy[] = [
    { TR: "kod yaz.", EN: "write code.", DE: "programmieren.", ES: "programa.", FR: "code.", RU: "пиши код." },
    { TR: "oyun yap.", EN: "build games.", DE: "Spiele bauen.", ES: "crea juegos.", FR: "crée des jeux.", RU: "делай игры." },
    { TR: "yayınla.", EN: "publish.", DE: "veröffentlichen.", ES: "publica.", FR: "publie.", RU: "публикуй." },
    { TR: "haberleri takip et.", EN: "follow the news.", DE: "News verfolgen.", ES: "sigue las noticias.", FR: "suis l'actu.", RU: "следи за новостями." },
];

const CODE_LANGUAGES = ["python", "javascript", "typescript", "csharp", "cpp", "java", "go", "rust", "kotlin", "swift", "php", "ruby", "lua", "sql", "html", "css"];

function RotatingWord() {
    const { tx } = useI18n();
    const [index, setIndex] = useState(0);
    useEffect(() => {
        if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
        const timer = window.setInterval(() => setIndex((value) => (value + 1) % ROTATING.length), 2400);
        return () => window.clearInterval(timer);
    }, []);
    return (
        <span className="relative inline-grid align-bottom">
            <AnimatePresence mode="popLayout" initial={false}>
                <motion.span
                    key={index}
                    initial={{ y: "60%", opacity: 0, filter: "blur(6px)" }}
                    animate={{ y: "0%", opacity: 1, filter: "blur(0px)" }}
                    exit={{ y: "-60%", opacity: 0, filter: "blur(6px)" }}
                    transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                    className="text-gradient animate-gradient whitespace-nowrap pb-2"
                >
                    {tx(ROTATING[index])}
                </motion.span>
            </AnimatePresence>
        </span>
    );
}

function Reveal({ children, delay = 0, className = "" }: { children: React.ReactNode; delay?: number; className?: string }) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 28 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] }}
            className={className}
        >
            {children}
        </motion.div>
    );
}

export default function LandingPage() {
    const { data: session } = useSession();
    const { t, tx } = useI18n();
    const heroRef = useRef<HTMLElement | null>(null);
    const [bannerVisible, setBannerVisible] = useState(false);
    const signedIn = Boolean(session?.user);

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

    // Interactive spotlight behind the hero follows the pointer.
    const onHeroMove = (event: React.PointerEvent<HTMLElement>) => {
        const element = heroRef.current;
        if (!element) return;
        const rect = element.getBoundingClientRect();
        element.style.setProperty("--hero-x", `${event.clientX - rect.left}px`);
        element.style.setProperty("--hero-y", `${event.clientY - rect.top}px`);
    };

    const trust: string[] = [t("f_free"), t("f_no_ads"), t("f_setup"), tx({ TR: `${LANGUAGES.length} arayüz dili`, EN: `${LANGUAGES.length} UI languages` })].filter(Boolean);

    return (
        <div className="min-h-dvh overflow-x-clip bg-white text-zinc-900 dark:bg-zinc-950 dark:text-white">
            <Header />

            <AnimatePresence>
                {bannerVisible ? (
                    <motion.div
                        initial={{ y: 40, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        exit={{ y: 40, opacity: 0 }}
                        className="fixed bottom-4 start-4 z-40 flex max-w-sm items-start gap-3 rounded-2xl border border-amber-500/30 bg-amber-50/95 p-3.5 text-[13px] text-amber-900 shadow-2xl backdrop-blur dark:bg-amber-950/80 dark:text-amber-100"
                        role="status"
                    >
                        <span className="text-lg leading-none">🧪</span>
                        <p className="flex-1 font-medium leading-snug">{t("banner_warning")}</p>
                        <button type="button" onClick={closeBanner} className="grid h-6 w-6 place-items-center rounded-lg hover:bg-amber-500/20" aria-label={tx({ TR: "Kapat", EN: "Close" })}><X className="h-4 w-4" /></button>
                    </motion.div>
                ) : null}
            </AnimatePresence>

            <main id="main-content">
                {/* ------------------------------------------------------------ Hero */}
                <section ref={heroRef} onPointerMove={onHeroMove} className="relative isolate overflow-hidden pt-16">
                    <div className="absolute inset-0 -z-10 bg-grid opacity-70 mask-radial" />
                    <div className="absolute inset-0 -z-10 opacity-80 dark:opacity-100" style={{ background: "radial-gradient(600px circle at var(--hero-x, 70%) var(--hero-y, 30%), var(--brand-glow), transparent 65%)" }} />
                    <div className="absolute -left-40 top-24 -z-10 h-[28rem] w-[28rem] rounded-full bg-indigo-500/20 blur-3xl animate-float" />
                    <div className="absolute -right-32 top-10 -z-10 h-[26rem] w-[26rem] rounded-full bg-fuchsia-500/15 blur-3xl animate-float" style={{ animationDelay: "-2.5s" }} />
                    <div className="absolute bottom-0 left-1/3 -z-10 h-72 w-72 rounded-full bg-amber-400/10 blur-3xl animate-float" style={{ animationDelay: "-5s" }} />

                    <div className="mx-auto grid max-w-7xl grid-cols-1 items-center gap-14 px-4 pb-20 pt-14 sm:px-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:pb-28 lg:pt-20">
                        <div className="min-w-0">
                            <Link href="/news" className="group inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white/70 py-1 pe-3 ps-1 text-[12.5px] font-semibold text-zinc-700 shadow-sm backdrop-blur transition hover:border-indigo-400 dark:border-white/10 dark:bg-white/[0.04] dark:text-zinc-200 animate-fade-up">
                                <span className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-red-500 to-rose-500 px-2 py-0.5 text-[10.5px] font-black uppercase tracking-wider text-white">
                                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />{tx({ TR: "Yeni", EN: "New" })}
                                </span>
                                {tx({ TR: "Hanogt News canlı yayında", EN: "Hanogt News is live" })}
                                <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" />
                            </Link>

                            <h1 className="mt-6 text-[2.6rem] font-black leading-[1.05] tracking-tight sm:text-6xl lg:text-[4.1rem] animate-fade-up" style={{ animationDelay: "80ms" }}>
                                <span className="sr-only">{tx({ TR: "Tarayıcında kod yaz, oyun yap, yayınla ve haberleri takip et.", EN: "Write code, build games, publish and follow the news in your browser." })}</span>
                                <span aria-hidden="true">
                                    {tx({ TR: "Tarayıcında", EN: "In your browser," })}
                                    <br />
                                    <RotatingWord />
                                </span>
                            </h1>

                            <p className="mt-6 max-w-xl text-[17px] leading-relaxed text-zinc-600 dark:text-zinc-400 animate-fade-up" style={{ animationDelay: "160ms" }}>
                                {tx({
                                    TR: "16 programlama dili, C# ve C++ ile çalışan gerçek bir 2D/3D oyun motoru, topluluk Arcade'i ve canlı teknoloji haberleri. Kurulum yok; hepsi tek hesapta.",
                                    EN: "16 programming languages, a real 2D/3D game engine scripted in C# and C++, a community Arcade and live tech news. No setup; all in one account.",
                                })}
                            </p>

                            <div className="mt-8 flex flex-wrap items-center gap-3 animate-fade-up" style={{ animationDelay: "240ms" }}>
                                <Link href={signedIn ? "/dashboard" : "/signup"} className="group relative inline-flex h-12 items-center gap-2 overflow-hidden rounded-2xl bg-zinc-900 px-6 text-[15px] font-bold text-white shadow-xl shadow-indigo-500/20 transition hover:-translate-y-0.5 dark:bg-white dark:text-zinc-900">
                                    <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/25 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
                                    <Rocket className="h-4.5 w-4.5" />
                                    {signedIn ? (t("go_to_dashboard") || "Panele git") : tx({ TR: "Ücretsiz başla", EN: "Start for free" })}
                                </Link>
                                <Link href="/game-engine" className="inline-flex h-12 items-center gap-2 rounded-2xl bg-gradient-to-r from-indigo-500 to-fuchsia-500 px-6 text-[15px] font-bold text-white shadow-xl shadow-fuchsia-500/25 transition hover:-translate-y-0.5 hover:brightness-110">
                                    <Gamepad2 className="h-4.5 w-4.5" />{tx({ TR: "Oyun motorunu dene", EN: "Try the game engine" })}
                                </Link>
                                <DownloadMenu />
                            </div>

                            <ul className="mt-8 flex flex-wrap gap-x-5 gap-y-2 text-[13.5px] font-medium text-zinc-600 dark:text-zinc-400 animate-fade-up" style={{ animationDelay: "320ms" }}>
                                {trust.map((item) => (
                                    <li key={item} className="inline-flex items-center gap-1.5"><span className="grid h-4.5 w-4.5 place-items-center rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"><Check className="h-3 w-3" strokeWidth={3} /></span>{item}</li>
                                ))}
                            </ul>
                        </div>

                        <div className="min-w-0 animate-fade-up" style={{ animationDelay: "200ms" }}>
                            <CodeShowcase labels={{
                                file: "Runner.cs",
                                play: tx({ TR: "Oynat", EN: "Play" }),
                                hint: tx({ TR: "Tıkla / Space: zıpla", EN: "Click / Space: jump" }),
                                compiled: tx({ TR: "Derlendi", EN: "Compiled" }),
                            }} />
                        </div>
                    </div>
                </section>

                {/* ------------------------------------------------------------ Languages marquee */}
                <section className="border-y border-zinc-200/70 bg-zinc-50/70 py-6 dark:border-white/[0.06] dark:bg-white/[0.02]" aria-label={tx({ TR: "Desteklenen diller", EN: "Supported languages" })}>
                    <p className="mb-4 text-center text-[12px] font-bold uppercase tracking-[0.2em] text-zinc-400">{tx({ TR: "16 dilde yaz, tek tıkla çalıştır", EN: "Write in 16 languages, run with one click" })}</p>
                    <div className="mask-fade-x overflow-hidden" dir="ltr">
                        <div className="flex w-max animate-marquee gap-10 hover:[animation-play-state:paused]">
                            {[...CODE_LANGUAGES, ...CODE_LANGUAGES].map((language, index) => (
                                <div key={`${language}-${index}`} className="flex shrink-0 items-center gap-2.5 opacity-70 grayscale transition hover:opacity-100 hover:grayscale-0" aria-hidden={index >= CODE_LANGUAGES.length ? true : undefined}>
                                    <OptimizedImage src={`/languages/${language}.png`} alt="" className="h-8 w-8 object-contain" />
                                    <span className="text-[14px] font-bold capitalize text-zinc-600 dark:text-zinc-300">{language === "cpp" ? "C++" : language === "csharp" ? "C#" : language === "javascript" ? "JavaScript" : language === "typescript" ? "TypeScript" : language === "sql" || language === "css" || language === "html" || language === "php" ? language.toUpperCase() : language}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </section>

                {/* ------------------------------------------------------------ Bento */}
                <section className="relative mx-auto max-w-7xl px-4 py-24 sm:px-6">
                    <Reveal className="mx-auto max-w-2xl text-center">
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-indigo-500/20 bg-indigo-500/10 px-3 py-1 text-[12px] font-bold text-indigo-600 dark:text-indigo-300"><Sparkles className="h-3.5 w-3.5" />{tx({ TR: "Tek platform, her şey", EN: "One platform, everything" })}</span>
                        <h2 className="mt-4 text-4xl font-black tracking-tight sm:text-5xl">{tx({ TR: "Üret, oyna, paylaş, öğren", EN: "Build, play, share, learn" })}</h2>
                        <p className="mt-4 text-[16px] leading-relaxed text-zinc-600 dark:text-zinc-400">{tx({ TR: "Bir editörden çok daha fazlası: oyun motoru, topluluk ve güncel teknoloji gündemi aynı yerde.", EN: "Much more than an editor: a game engine, a community and the tech agenda in one place." })}</p>
                    </Reveal>

                    <div className="mt-14 grid gap-4 md:grid-cols-6">
                        <Reveal className="md:col-span-4">
                            <SpotlightCard className="h-full p-7">
                                <div className="flex items-start justify-between gap-4">
                                    <div>
                                        <span className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-sky-500 to-indigo-500 text-white shadow-lg shadow-sky-500/25"><Code2 className="h-5 w-5" /></span>
                                        <h3 className="mt-4 text-2xl font-black">{tx({ TR: "Kod Editörü", EN: "Code Editor" })}</h3>
                                        <p className="mt-2 max-w-lg text-[14.5px] leading-relaxed text-zinc-600 dark:text-zinc-400">{tx({ TR: "VS Code'un kalbi Monaco ile otomatik tamamlama, çoklu sekme, projeler ve yapay zeka asistanı. Kodu izole çalıştırıcıda tek tıkla çalıştır.", EN: "Monaco, the heart of VS Code, with autocomplete, tabs, projects and an AI assistant. Run code in an isolated runner with one click." })}</p>
                                    </div>
                                    <Link href={signedIn ? "/dashboard" : "/signup"} className="hidden shrink-0 items-center gap-1 rounded-xl bg-zinc-900 px-3 py-2 text-[13px] font-bold text-white transition hover:gap-2 sm:inline-flex dark:bg-white dark:text-zinc-900">{tx({ TR: "Aç", EN: "Open" })}<ArrowRight className="h-4 w-4" /></Link>
                                </div>
                                <div className="mt-6 flex flex-wrap gap-1.5">
                                    {CODE_LANGUAGES.map((language) => (
                                        <span key={language} className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-zinc-50 px-2 py-1 text-[11.5px] font-semibold text-zinc-600 transition hover:-translate-y-0.5 hover:border-indigo-400 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-300">
                                            <OptimizedImage src={`/languages/${language}.png`} alt="" className="h-3.5 w-3.5 object-contain" />{language === "cpp" ? "C++" : language === "csharp" ? "C#" : language}
                                        </span>
                                    ))}
                                </div>
                            </SpotlightCard>
                        </Reveal>

                        <Reveal delay={0.08} className="md:col-span-2 md:row-span-2">
                            <SpotlightCard className="flex h-full flex-col p-6" color="rgba(244,63,94,0.16)">
                                <div className="flex items-center gap-2">
                                    <span className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-rose-500 to-orange-500 text-white shadow-lg shadow-rose-500/25"><Newspaper className="h-5 w-5" /></span>
                                    <span className="ms-auto inline-flex items-center gap-1.5 rounded-full bg-red-500/10 px-2.5 py-1 text-[11px] font-black uppercase tracking-wider text-red-600 dark:text-red-400"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" />{tx({ TR: "Canlı", EN: "Live" })}</span>
                                </div>
                                <h3 className="mt-4 text-2xl font-black">Hanogt News</h3>
                                <p className="mt-2 text-[14px] leading-relaxed text-zinc-600 dark:text-zinc-400">{tx({ TR: "Yapay zeka, yazılım, oyun ve uygulama dünyasından anlık haberler; yorumlar ve yapay zeka arenası.", EN: "Live stories from AI, software, games and apps; comments and an AI arena." })}</p>
                                <div className="mt-4 flex-1"><LiveNewsMini /></div>
                                <Link href="/news" className="mt-4 inline-flex items-center gap-1 text-[13.5px] font-bold text-rose-600 hover:gap-2 dark:text-rose-400">{tx({ TR: "Tüm haberler", EN: "All stories" })}<ArrowRight className="h-4 w-4" /></Link>
                            </SpotlightCard>
                        </Reveal>

                        <Reveal delay={0.04} className="md:col-span-4">
                            <SpotlightCard className="h-full overflow-hidden p-7" color="rgba(168,85,247,0.18)">
                                <div className="grid gap-6 sm:grid-cols-[1.2fr_1fr] sm:items-center">
                                    <div>
                                        <span className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white shadow-lg shadow-violet-500/25"><Boxes className="h-5 w-5" /></span>
                                        <h3 className="mt-4 text-2xl font-black">Hanogt Engine</h3>
                                        <p className="mt-2 text-[14.5px] leading-relaxed text-zinc-600 dark:text-zinc-400">{tx({ TR: "Unity benzeri editör, fizik, parçacıklar, ses ve WebGL render. Scriptleri C# veya C++ ile yaz, oyunu tek dosya HTML olarak dışa aktar.", EN: "A Unity-like editor with physics, particles, audio and WebGL rendering. Script in C# or C++ and export a single-file HTML game." })}</p>
                                        <Link href="/game-engine" className="mt-4 inline-flex items-center gap-1 text-[13.5px] font-bold text-violet-600 hover:gap-2 dark:text-violet-300">{tx({ TR: "Motoru aç", EN: "Open the engine" })}<ArrowRight className="h-4 w-4" /></Link>
                                    </div>
                                    <ul className="space-y-2 text-[13.5px]">
                                        {[
                                            { TR: "Hiyerarşi, Inspector, Scene & Game görünümü", EN: "Hierarchy, Inspector, Scene & Game views" },
                                            { TR: "Rigidbody, collider, raycast ve tetikleyiciler", EN: "Rigidbody, colliders, raycasts and triggers" },
                                            { TR: "Coroutine, Invoke, PlayerPrefs, prefab", EN: "Coroutines, Invoke, PlayerPrefs, prefabs" },
                                            { TR: "Hazır 2D/3D şablonlar ve Arcade'de yayın", EN: "Ready 2D/3D templates and Arcade publishing" },
                                        ].map((item, index) => (
                                            <motion.li key={item.EN} initial={{ opacity: 0, x: 16 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ delay: 0.1 + index * 0.08 }} className="flex items-start gap-2 rounded-xl bg-violet-500/[0.06] px-3 py-2 text-zinc-700 dark:text-zinc-300">
                                                <Zap className="mt-0.5 h-3.5 w-3.5 shrink-0 text-violet-500" />{tx(item)}
                                            </motion.li>
                                        ))}
                                    </ul>
                                </div>
                            </SpotlightCard>
                        </Reveal>

                        <Reveal className="md:col-span-2">
                            <SpotlightCard className="h-full p-6" color="rgba(234,179,8,0.16)">
                                <span className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 text-white shadow-lg shadow-amber-500/25"><Trophy className="h-5 w-5" /></span>
                                <h3 className="mt-4 text-xl font-black">Arcade</h3>
                                <p className="mt-2 text-[14px] leading-relaxed text-zinc-600 dark:text-zinc-400">{tx({ TR: "Topluluğun yaptığı oyunları anında oyna, beğen ve remiksle.", EN: "Play community games instantly, like and remix them." })}</p>
                                <Link href="/arcade" className="mt-4 inline-flex items-center gap-1.5 text-[13.5px] font-bold text-amber-600 hover:gap-2 dark:text-amber-400"><Play className="h-4 w-4" />{tx({ TR: "Oyna", EN: "Play" })}</Link>
                            </SpotlightCard>
                        </Reveal>
                        <Reveal delay={0.06} className="md:col-span-2">
                            <SpotlightCard className="h-full p-6" color="rgba(139,92,246,0.16)">
                                <div className="flex gap-2">
                                    <span className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-500 text-white shadow-lg"><Radio className="h-5 w-5" /></span>
                                    <span className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-500 text-white shadow-lg"><UsersRound className="h-5 w-5" /></span>
                                </div>
                                <h3 className="mt-4 text-xl font-black">{tx({ TR: "Media & Gruplar", EN: "Media & Groups" })}</h3>
                                <p className="mt-2 text-[14px] leading-relaxed text-zinc-600 dark:text-zinc-400">{tx({ TR: "Kodunu paylaş, ekibinle sohbet et, sesli ara, ortak projeler yürüt.", EN: "Share code, chat with your team, voice call and run shared projects." })}</p>
                                <div className="mt-4 flex items-center gap-3 text-[13px] font-semibold text-zinc-500">
                                    <span className="inline-flex items-center gap-1"><Heart className="h-4 w-4 text-rose-500" />{tx({ TR: "Beğeni", EN: "Likes" })}</span>
                                    <span className="inline-flex items-center gap-1"><MessageSquare className="h-4 w-4 text-sky-500" />{tx({ TR: "Sohbet", EN: "Chat" })}</span>
                                </div>
                            </SpotlightCard>
                        </Reveal>
                        <Reveal delay={0.12} className="md:col-span-2">
                            <SpotlightCard className="h-full p-6" color="rgba(16,185,129,0.16)">
                                <span className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-emerald-500 to-green-600 text-white shadow-lg shadow-emerald-500/25"><ShieldCheck className="h-5 w-5" /></span>
                                <h3 className="mt-4 text-xl font-black">{tx({ TR: "Hanogt Security", EN: "Hanogt Security" })}</h3>
                                <p className="mt-2 text-[14px] leading-relaxed text-zinc-600 dark:text-zinc-400">{tx({ TR: "Sunucu tarafı tarama, güvenlik botu ve kodunu inceleyen güvenlik danışmanı.", EN: "Server-side scanning, a security bot and an advisor that reviews your code." })}</p>
                                <Link href="/security" className="mt-4 inline-flex items-center gap-1.5 text-[13.5px] font-bold text-emerald-600 hover:gap-2 dark:text-emerald-400"><Bot className="h-4 w-4" />{tx({ TR: "Danışmana sor", EN: "Ask the advisor" })}</Link>
                            </SpotlightCard>
                        </Reveal>
                    </div>
                </section>

                <GuideTeaser />

                {/* ------------------------------------------------------------ Comparison */}
                <section className="bg-zinc-50 py-24 dark:bg-white/[0.02]">
                    <Reveal className="mx-auto mb-10 max-w-2xl px-4 text-center">
                        <h2 className="text-3xl font-black tracking-tight sm:text-4xl">{t("why_hanogt") || "Neden Hanogt Codev?"}</h2>
                        <p className="mt-3 text-[15px] text-zinc-600 dark:text-zinc-400">{t("comparison_quote")}</p>
                    </Reveal>
                    <div className="px-4"><Comparison /></div>
                </section>

                {/* ------------------------------------------------------------ Final CTA */}
                <section className="px-4 py-24 sm:px-6">
                    <Reveal>
                        <div className="relative mx-auto max-w-5xl overflow-hidden rounded-[2rem] bg-zinc-950 px-6 py-16 text-center text-white shadow-2xl sm:px-12">
                            <div className="absolute inset-0 bg-[linear-gradient(120deg,#6366f1,#a855f7,#ec4899,#f59e0b)] bg-[length:300%_300%] opacity-90 animate-gradient" />
                            <div className="absolute inset-0 bg-grid opacity-20" />
                            <div className="relative">
                                <Globe2 className="mx-auto h-10 w-10 animate-float" />
                                <h2 className="mx-auto mt-5 max-w-2xl text-4xl font-black tracking-tight sm:text-5xl">{tx({ TR: "Bir sonraki projen burada başlıyor", EN: "Your next project starts here" })}</h2>
                                <p className="mx-auto mt-4 max-w-xl text-[16px] text-white/85">{t("create_free_account") || tx({ TR: "Hemen ücretsiz hesabını oluştur", EN: "Create your free account" })}</p>
                                <div className="mt-8 flex flex-wrap justify-center gap-3">
                                    <Link href={signedIn ? "/dashboard" : "/signup"} className="inline-flex h-12 items-center gap-2 rounded-2xl bg-white px-6 text-[15px] font-bold text-zinc-900 shadow-xl transition hover:-translate-y-0.5">
                                        <Rocket className="h-4.5 w-4.5" />{signedIn ? (t("go_to_dashboard") || "Panele git") : tx({ TR: "Ücretsiz başla", EN: "Start for free" })}
                                    </Link>
                                    <Link href="/arcade" className="inline-flex h-12 items-center gap-2 rounded-2xl border border-white/40 bg-white/10 px-6 text-[15px] font-bold text-white backdrop-blur transition hover:-translate-y-0.5 hover:bg-white/20">
                                        <Gamepad2 className="h-4.5 w-4.5" />{tx({ TR: "Arcade'e göz at", EN: "Browse the Arcade" })}
                                    </Link>
                                </div>
                            </div>
                        </div>
                    </Reveal>
                </section>
            </main>

            <SiteFooter />
        </div>
    );
}
