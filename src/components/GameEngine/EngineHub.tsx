"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
    ArrowRight,
    BookOpen,
    Cloud,
    Download,
    Eye,
    Globe,
    HardDrive,
    LoaderCircle,
    Plus,
    Rocket,
    Search,
    Sparkles,
    Trash2,
    Upload,
    X,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useSession } from "next-auth/react";
import GridBackdrop from "@/components/GridBackdrop";
import Header from "@/components/Header";
import { Reveal } from "@/components/Landing/motion";
import { CountUp } from "@/components/PublicStats";
import ProductLogo from "@/components/ProductLogo";
import SiteFooter from "@/components/SiteFooter";
import { useI18n, type Copy } from "@/lib/i18n";
import { createProjectFromTemplate, PROJECT_TEMPLATES, type TemplateId, type TemplateInfo } from "@/lib/game-engine/templates";
import { createEngineId } from "@/lib/game-engine/ids";
import { ENGINE_VERSION, ENGINE_VERSION_LABEL, type GameProjectDocument } from "@/lib/game-engine/types";
import {
    createCloudProject,
    deleteCloudProject,
    deleteLocalProject,
    exportProjectJson,
    importProjectFile,
    listCloudProjects,
    listLocalProjects,
    loadCloudProject,
    loadLocalProject,
    PersistenceError,
    saveLocalProject,
    type ProjectSummary,
} from "./editor/persistence";
import { engineLocale, useEngineText } from "./editor/text";
import { Toasts, useToasts } from "./editor/ui";
import LivePreview from "./hub/LivePreview";
import SceneSketch from "./hub/SceneSketch";
import { DIFFICULTY_LABEL, TemplateBadges } from "./hub/TemplateBadges";
import TemplateDrawer from "./hub/TemplateDrawer";
import { TEMPLATE_UPDATE, V3_FEATURES } from "./whats-new";

/*
 * Hanogt Engine's home: a hero with a game running live in the real engine,
 * the template gallery (filters, a details drawer with a playable preview),
 * what's new, and the visitor's projects. Template cards are drawn from the
 * scene data as SVG, so the page holds at most one WebGL context.
 */

const C = {
    kicker: { TR: "{version} · C# · C++ · 2D · 3D", EN: "{version} · C# · C++ · 2D · 3D" },
    titleStart: { TR: "Oyununu tarayıcıda yap,", EN: "Build your game in the browser," },
    titleAccent: { TR: "hemen oyna.", EN: "play it right away." },
    heroText: {
        TR: "Unity'ye benzeyen editör, C# ve C++ betikleri, fizik, tilemap, animasyon ve arayüz bileşenleri. Hazır bir oyunla başla, değiştir ve Arcade'de herkesle paylaş. Kurulum yok.",
        EN: "A Unity-like editor, C# and C++ scripts, physics, tilemaps, animation and UI components. Start from a ready game, change it and share it with everyone on the Arcade. Nothing to install.",
    },
    browse: { TR: "Şablonları gör", EN: "Browse templates" },
    statTemplates: { TR: "oynanabilir şablon", EN: "playable templates" },
    statLanguages: { TR: "betik dili", EN: "scripting languages" },
    statDimensions: { TR: "2D ve 3D", EN: "2D and 3D" },
    statPublishValue: { TR: "1 tık", EN: "1 click" },
    statPublish: { TR: "ile Arcade'de yayınla", EN: "to publish on the Arcade" },
    showcase: { TR: "Canlı önizlemede gösterilen oyun", EN: "Game shown in the live preview" },
    continueTitle: { TR: "Kaldığın yerden devam et", EN: "Pick up where you left off" },
    continueMeta: { TR: "{time} düzenlendi · {objects} nesne · {scripts} betik", EN: "Edited {time} · {objects} objects · {scripts} scripts" },
    open: { TR: "Aç", EN: "Open" },
    allProjects: { TR: "Tüm projelerim", EN: "All my projects" },
    galleryKicker: { TR: "{count} şablon", EN: "{count} templates" },
    galleryTitle: { TR: "Bir oyunla başla", EN: "Start from a game" },
    galleryText: {
        TR: "Her şablon baştan sona oynanabilir bir oyundur ve kodu yorum satırlarıyla açıklanmıştır. Önizle, beğendiğini aç ve kendi oyununa dönüştür.",
        EN: "Every template is a game you can play end to end, with its code explained in comments. Preview one, open the one you like and make it your own.",
    },
    all: { TR: "Tümü", EN: "All" },
    newOnly: { TR: "Yeniler", EN: "New" },
    searchTemplates: { TR: "Şablon ara…", EN: "Search templates…" },
    dimension: { TR: "Boyut", EN: "Dimension" },
    language: { TR: "Dil", EN: "Language" },
    difficulty: { TR: "Zorluk", EN: "Difficulty" },
    results: { TR: "{count} sonuç", EN: "{count} results" },
    clear: { TR: "Filtreleri temizle", EN: "Clear filters" },
    noMatch: { TR: "Bu filtrelerle eşleşen şablon yok.", EN: "No template matches these filters." },
    preview: { TR: "Önizle", EN: "Preview" },
    start: { TR: "Başla", EN: "Start" },
    previewOf: { TR: "{name} önizlemesi", EN: "{name} preview" },
    newsTitle: { TR: "Yenilikler", EN: "What's new" },
    newsUpdate: { TR: "Ekim güncellemesi", EN: "October update" },
    newsV3: { TR: "V3 ile gelenler", EN: "Shipped with V3" },
    projectsText: { TR: "Bulutta ve bu tarayıcıda kayıtlı oyun projelerin.", EN: "Your game projects in the cloud and in this browser." },
    sortRecent: { TR: "Son düzenlenen", EN: "Recently edited" },
    sortName: { TR: "Ada göre", EN: "By name" },
    sortLabel: { TR: "Sırala", EN: "Sort" },
    template: { TR: "Şablon", EN: "Template" },
    limitReached: { TR: "Planının oyun projesi sınırına ulaştın ({limit} proje). Yer açmak için eski bir projeyi sil ya da planını yükselt.", EN: "You've reached your plan's game project limit ({limit} projects). Delete an old project to make room, or upgrade your plan." },
    pricing: { TR: "Fiyatlandırma", EN: "Pricing" },
    deleteFailed: { TR: "Silinemedi.", EN: "Couldn't delete." },
    close: { TR: "Kapat", EN: "Close" },
} satisfies Record<string, Copy>;

/** Games shown live in the hero, chosen because they look alive without input. */
const SHOWCASE: TemplateId[] = ["obstacle-course-3d", "tower-defense-2d", "rpg-topdown-2d", "flappy-2d"];
const SHOWCASE_SECONDS = 14;

/** One shared copy per template for sketches, facts and previews (never saved). */
const projectCache = new Map<TemplateId, GameProjectDocument>();
function templateProject(id: TemplateId) {
    let project = projectCache.get(id);
    if (!project) {
        project = createProjectFromTemplate(id);
        projectCache.set(id, project);
    }
    return project;
}

function relativeTime(iso: string, locale: "tr" | "en") {
    const time = Date.parse(iso);
    if (!Number.isFinite(time)) return "";
    const seconds = Math.round((time - Date.now()) / 1000);
    const format = new Intl.RelativeTimeFormat(locale === "tr" ? "tr" : "en", { numeric: "auto" });
    const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [["year", 31536000], ["month", 2592000], ["week", 604800], ["day", 86400], ["hour", 3600], ["minute", 60]];
    for (const [unit, size] of units) {
        if (Math.abs(seconds) >= size) return format.format(Math.round(seconds / size), unit);
    }
    return format.format(seconds, "second");
}

const primaryButton = "inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-zinc-900 px-5 text-[15px] font-bold text-white transition hover:bg-zinc-700 disabled:opacity-60 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200";
const secondaryButton = "inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-zinc-300 px-5 text-[15px] font-bold transition hover:border-zinc-400 dark:border-white/15 dark:hover:border-white/30";
const chipClass = (active: boolean) => `inline-flex h-9 shrink-0 items-center rounded-xl border px-3 text-[13px] font-bold transition ${active ? "border-zinc-900 bg-zinc-900 text-white dark:border-white dark:bg-white dark:text-zinc-900" : "border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300 hover:text-zinc-900 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-300 dark:hover:border-white/20 dark:hover:text-white"}`;

// ---------------------------------------------------------------------------
// Hero
// ---------------------------------------------------------------------------

/**
 * The hero demo plays by itself only where it's cheap and wanted: not with
 * reduced motion, data saving or on phone-sized screens (there it waits for "Play").
 */
function useDemoAutoplay() {
    const reduceMotion = useReducedMotion();
    const [allowed, setAllowed] = useState(false);
    useEffect(() => {
        const small = window.matchMedia("(max-width: 639px)");
        const saveData = Boolean((navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData);
        const update = () => setAllowed(!small.matches && !saveData);
        update();
        small.addEventListener("change", update);
        return () => small.removeEventListener("change", update);
    }, []);
    return allowed && !reduceMotion;
}

function Showcase({ paused, locale }: { paused: boolean; locale: "tr" | "en" }) {
    const { tx } = useI18n();
    const autoplay = useDemoAutoplay();
    const [index, setIndex] = useState(0);
    const [hovered, setHovered] = useState(false);
    const id = SHOWCASE[index];
    const info = PROJECT_TEMPLATES.find((template) => template.id === id) as TemplateInfo;

    useEffect(() => {
        if (!autoplay || paused || hovered) return;
        const timer = window.setTimeout(() => setIndex((current) => (current + 1) % SHOWCASE.length), SHOWCASE_SECONDS * 1000);
        return () => window.clearTimeout(timer);
    }, [index, autoplay, paused, hovered]);

    return (
        <div onPointerEnter={() => setHovered(true)} onPointerLeave={() => setHovered(false)} onFocusCapture={() => setHovered(true)} onBlurCapture={() => setHovered(false)}>
            {paused ? (
                <div className="relative aspect-video overflow-hidden rounded-2xl border border-zinc-200 dark:border-white/10"><SceneSketch project={templateProject(id)} className="h-full w-full" /></div>
            ) : (
                <LivePreview key={`${id}:${autoplay}`} project={templateProject(id)} label={info.name[locale]} controls={info.controls[locale]} autoPlay={autoplay} touch />
            )}
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4" role="tablist" aria-label={tx(C.showcase)}>
                {SHOWCASE.map((templateId, position) => {
                    const template = PROJECT_TEMPLATES.find((item) => item.id === templateId) as TemplateInfo;
                    const active = position === index;
                    return (
                        <button
                            key={templateId}
                            type="button"
                            role="tab"
                            aria-selected={active}
                            onClick={() => setIndex(position)}
                            className={`group relative overflow-hidden rounded-xl border p-1.5 text-start transition ${active ? "border-zinc-900 dark:border-white" : "border-zinc-200 hover:border-zinc-300 dark:border-white/10 dark:hover:border-white/25"}`}
                        >
                            <span className="block overflow-hidden rounded-lg"><SceneSketch project={templateProject(templateId)} className="aspect-video w-full transition duration-500 group-hover:scale-105 motion-reduce:transition-none" /></span>
                            <span className="mt-1.5 block truncate px-0.5 text-[12px] font-bold">{template.name[locale]}</span>
                            {active && autoplay && !paused && !hovered ? (
                                <motion.span key={`progress-${index}`} className="absolute inset-x-0 bottom-0 h-0.5 origin-left bg-gradient-to-r from-violet-500 via-pink-500 to-amber-400 rtl:origin-right" initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: SHOWCASE_SECONDS, ease: "linear" }} />
                            ) : null}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

function Stat({ value, label }: { value: number | string; label: string }) {
    const { locale } = useI18n();
    return (
        <div className="flex min-w-0 flex-col">
            <dt className="order-2 mt-0.5 text-[12.5px] font-semibold text-zinc-500 dark:text-zinc-400">{label}</dt>
            <dd className="text-2xl font-black tracking-tight sm:text-3xl"><span className="text-gradient">{typeof value === "number" ? <CountUp value={value} locale={locale} /> : value}</span></dd>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Template gallery
// ---------------------------------------------------------------------------

type Filters = { dimension: "all" | "2d" | "3d"; language: "all" | "C#" | "C++"; difficulty: "all" | TemplateInfo["difficulty"]; newOnly: boolean; query: string };
const NO_FILTERS: Filters = { dimension: "all", language: "all", difficulty: "all", newOnly: false, query: "" };

function TemplateCard({ template, locale, onPreview, onStart }: { template: TemplateInfo; locale: "tr" | "en"; onPreview: () => void; onStart: () => void }) {
    const { tx } = useI18n();
    const reduceMotion = useReducedMotion();
    return (
        <motion.article
            layout={!reduceMotion}
            initial={reduceMotion ? false : { opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.96 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            className="group flex flex-col overflow-hidden rounded-3xl border border-zinc-200 bg-white transition-[border-color,box-shadow,transform] duration-300 hover:-translate-y-1 hover:border-zinc-300 hover:shadow-xl hover:shadow-zinc-900/[0.06] motion-reduce:hover:translate-y-0 dark:border-white/10 dark:bg-zinc-900/60 dark:hover:border-white/20 dark:hover:shadow-black/30"
            data-template={template.id}
        >
            <button type="button" onClick={onPreview} className="relative block overflow-hidden text-start" aria-label={tx(C.previewOf, { name: template.name[locale] })}>
                <SceneSketch project={templateProject(template.id)} className="aspect-video w-full transition duration-700 ease-out group-hover:scale-[1.04] motion-reduce:transition-none" />
                <span className="absolute inset-0 grid place-items-center bg-zinc-950/0 transition group-hover:bg-zinc-950/25">
                    <span className="inline-flex translate-y-2 items-center gap-1.5 rounded-full bg-white px-3.5 py-2 text-[13px] font-bold text-zinc-900 opacity-0 shadow-lg transition group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:opacity-100">
                        <Eye className="h-4 w-4" aria-hidden />{tx(C.preview)}
                    </span>
                </span>
            </button>
            <div className="flex flex-1 flex-col p-5">
                <TemplateBadges template={template} locale={locale} />
                <h3 className="mt-3 text-[17px] font-black tracking-tight">{template.name[locale]}</h3>
                <p className="mt-1.5 line-clamp-3 flex-1 text-[13.5px] leading-relaxed text-zinc-600 dark:text-zinc-400">{template.description[locale]}</p>
                <div className="mt-4 flex gap-2">
                    <button type="button" onClick={onPreview} className="inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl border border-zinc-200 text-[13px] font-bold transition hover:border-zinc-300 dark:border-white/10 dark:hover:border-white/25"><Eye className="h-4 w-4" aria-hidden />{tx(C.preview)}</button>
                    <button type="button" onClick={onStart} className="inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl bg-zinc-900 text-[13px] font-bold text-white transition hover:bg-zinc-700 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"><Plus className="h-4 w-4" aria-hidden />{tx(C.start)}</button>
                </div>
            </div>
        </motion.article>
    );
}

function TemplateGallery({ locale, onPreview, onStart }: { locale: "tr" | "en"; onPreview: (template: TemplateInfo) => void; onStart: (template: TemplateInfo) => void }) {
    const { tx } = useI18n();
    const [filters, setFilters] = useState<Filters>(NO_FILTERS);
    const set = <K extends keyof Filters>(key: K, value: Filters[K]) => setFilters((current) => ({ ...current, [key]: value }));
    const visible = useMemo(() => {
        const needle = filters.query.trim().toLocaleLowerCase(locale === "tr" ? "tr" : "en");
        return PROJECT_TEMPLATES.filter((template) => {
            if (filters.dimension !== "all" && template.dimension !== filters.dimension) return false;
            if (filters.language !== "all" && !template.languages.includes(filters.language)) return false;
            if (filters.difficulty !== "all" && template.difficulty !== filters.difficulty) return false;
            if (filters.newOnly && !template.isNew) return false;
            if (!needle) return true;
            const haystack = `${template.name.tr} ${template.name.en} ${template.description[locale]} ${template.id}`.toLocaleLowerCase(locale === "tr" ? "tr" : "en");
            return haystack.includes(needle);
        });
    }, [filters, locale]);
    const filtered = JSON.stringify(filters) !== JSON.stringify(NO_FILTERS);
    const playable = PROJECT_TEMPLATES.filter((template) => !template.id.startsWith("empty")).length;

    return (
        <section id="templates" aria-labelledby="templates-title" className="scroll-mt-24">
            <Reveal>
                <p className="text-[13px] font-black uppercase tracking-wider text-zinc-500">{tx(C.galleryKicker, { count: playable })}</p>
                <h2 id="templates-title" className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">{tx(C.galleryTitle)}</h2>
                <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-zinc-600 dark:text-zinc-400">{tx(C.galleryText)}</p>
            </Reveal>

            <div className="mt-8 flex flex-col gap-3 lg:flex-row lg:items-center">
                <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0">
                    <div className="flex shrink-0 gap-1.5" role="group" aria-label={tx(C.dimension)}>
                        {(["all", "2d", "3d"] as const).map((value) => <button key={value} type="button" aria-pressed={filters.dimension === value} onClick={() => set("dimension", value)} className={chipClass(filters.dimension === value)}>{value === "all" ? tx(C.all) : value.toUpperCase()}</button>)}
                    </div>
                    <span className="mx-1 hidden w-px shrink-0 bg-zinc-200 sm:block dark:bg-white/10" aria-hidden />
                    <div className="flex shrink-0 gap-1.5" role="group" aria-label={tx(C.language)}>
                        {(["C#", "C++"] as const).map((value) => <button key={value} type="button" aria-pressed={filters.language === value} onClick={() => set("language", filters.language === value ? "all" : value)} className={chipClass(filters.language === value)} dir="ltr">{value}</button>)}
                    </div>
                    <span className="mx-1 hidden w-px shrink-0 bg-zinc-200 sm:block dark:bg-white/10" aria-hidden />
                    <div className="flex shrink-0 gap-1.5" role="group" aria-label={tx(C.difficulty)}>
                        {(["starter", "easy", "medium"] as const).map((value) => <button key={value} type="button" aria-pressed={filters.difficulty === value} onClick={() => set("difficulty", filters.difficulty === value ? "all" : value)} className={chipClass(filters.difficulty === value)}>{tx(DIFFICULTY_LABEL[value])}</button>)}
                    </div>
                    <span className="mx-1 hidden w-px shrink-0 bg-zinc-200 sm:block dark:bg-white/10" aria-hidden />
                    <button type="button" aria-pressed={filters.newOnly} onClick={() => set("newOnly", !filters.newOnly)} className={chipClass(filters.newOnly)}><Sparkles className="me-1 h-3.5 w-3.5" aria-hidden />{tx(C.newOnly)}</button>
                </div>
                <label className="relative w-full lg:ms-auto lg:w-64">
                    <span className="sr-only">{tx(C.searchTemplates)}</span>
                    <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" aria-hidden />
                    <input value={filters.query} onChange={(event) => set("query", event.target.value)} placeholder={tx(C.searchTemplates)} className="h-10 w-full rounded-xl border border-zinc-200 bg-white pe-3 ps-9 text-[14px] outline-none transition focus:border-violet-400 focus:ring-4 focus:ring-violet-500/10 dark:border-white/10 dark:bg-zinc-950" />
                </label>
            </div>
            <p className="mt-3 flex items-center gap-3 text-[13px] text-zinc-500" aria-live="polite">
                {tx(C.results, { count: visible.length })}
                {filtered ? <button type="button" onClick={() => setFilters(NO_FILTERS)} className="inline-flex items-center gap-1 font-bold text-zinc-700 underline-offset-2 hover:underline dark:text-zinc-300"><X className="h-3.5 w-3.5" aria-hidden />{tx(C.clear)}</button> : null}
            </p>

            <motion.div layout className="mt-5 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
                <AnimatePresence mode="popLayout">
                    {visible.map((template) => (
                        <TemplateCard key={template.id} template={template} locale={locale} onPreview={() => onPreview(template)} onStart={() => onStart(template)} />
                    ))}
                </AnimatePresence>
            </motion.div>
            {!visible.length ? (
                <div className="mt-5 rounded-3xl border border-dashed border-zinc-300 p-10 text-center dark:border-white/15">
                    <p className="text-[14px] text-zinc-500">{tx(C.noMatch)}</p>
                    <button type="button" onClick={() => setFilters(NO_FILTERS)} className="mt-3 text-[13px] font-bold underline underline-offset-2">{tx(C.clear)}</button>
                </div>
            ) : null}
        </section>
    );
}

// ---------------------------------------------------------------------------
// What's new
// ---------------------------------------------------------------------------

function WhatsNew() {
    const { tx } = useI18n();
    const t = useEngineText();
    const item = (feature: (typeof V3_FEATURES)[number], index: number, highlight: boolean) => {
        const Icon = feature.icon;
        return (
            <Reveal key={feature.section + feature.title.EN} delay={Math.min(index, 8) * 0.04} y={16}>
                <Link href={`/game-engine/docs#${feature.section}`} className={`group flex h-full gap-3 rounded-2xl border p-4 transition hover:-translate-y-0.5 motion-reduce:hover:translate-y-0 ${highlight ? "border-zinc-900/10 bg-white hover:border-zinc-900/25 dark:border-white/15 dark:bg-white/[0.04] dark:hover:border-white/30" : "border-zinc-200 bg-white/60 hover:border-zinc-300 dark:border-white/10 dark:bg-white/[0.02] dark:hover:border-white/20"}`}>
                    <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${highlight ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900" : "bg-zinc-100 text-zinc-700 dark:bg-white/[0.06] dark:text-zinc-200"}`}><Icon className="h-5 w-5" aria-hidden /></span>
                    <span className="min-w-0">
                        <span className="block text-[14.5px] font-bold">{tx(feature.title)}</span>
                        <span className="mt-1 block text-[13px] leading-relaxed text-zinc-600 dark:text-zinc-400">{tx(feature.text)}</span>
                        <span className="mt-2 inline-flex items-center gap-1 text-[12.5px] font-bold text-zinc-500 transition group-hover:gap-1.5 group-hover:text-zinc-900 dark:group-hover:text-white">{t("docs")}<ArrowRight className="h-3.5 w-3.5 rtl:rotate-180" aria-hidden /></span>
                    </span>
                </Link>
            </Reveal>
        );
    };
    return (
        <section aria-labelledby="whats-new-title">
            <Reveal className="flex flex-wrap items-end justify-between gap-3">
                <h2 id="whats-new-title" className="text-3xl font-black tracking-tight sm:text-4xl">{tx(C.newsTitle)}</h2>
                <Link href="/game-engine/docs#yenilikler" className="inline-flex items-center gap-1.5 text-[14px] font-bold text-zinc-600 transition hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-white"><BookOpen className="h-4 w-4" aria-hidden />{t("docs")}</Link>
            </Reveal>
            <h3 className="mt-8 flex items-center gap-2 text-[13px] font-black uppercase tracking-wider text-zinc-500"><Sparkles className="h-4 w-4" aria-hidden />{tx(C.newsUpdate)}</h3>
            <div className="mt-3 grid gap-3 md:grid-cols-2">{TEMPLATE_UPDATE.map((feature, index) => item(feature, index, true))}</div>
            <h3 className="mt-8 text-[13px] font-black uppercase tracking-wider text-zinc-500">{tx(C.newsV3)}</h3>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{V3_FEATURES.map((feature, index) => item(feature, index, false))}</div>
        </section>
    );
}

// ---------------------------------------------------------------------------
// Create dialog
// ---------------------------------------------------------------------------

function CreateDialog({ template, locale, signedIn, creating, onPick, onCreate, onClose }: {
    template: TemplateInfo | null;
    locale: "tr" | "en";
    signedIn: boolean;
    creating: boolean;
    onPick: (template: TemplateInfo) => void;
    onCreate: (template: TemplateInfo, name: string) => void;
    onClose: () => void;
}) {
    const t = useEngineText();
    const { tx } = useI18n();
    const [name, setName] = useState("");
    const inputRef = useRef<HTMLInputElement | null>(null);
    const open = template !== null;

    useEffect(() => {
        if (!open) return;
        const previous = document.activeElement as HTMLElement | null;
        const frame = requestAnimationFrame(() => inputRef.current?.focus());
        const onKey = (event: KeyboardEvent) => {
            if (event.key === "Escape" && !creating) onClose();
        };
        window.addEventListener("keydown", onKey);
        return () => {
            cancelAnimationFrame(frame);
            window.removeEventListener("keydown", onKey);
            previous?.focus?.({ preventScroll: true });
        };
    }, [open, creating, onClose]);

    if (typeof document === "undefined") return null;
    const submit = () => {
        if (template && !creating) onCreate(template, name.trim() || template.name[locale]);
    };
    return createPortal(
        <AnimatePresence onExitComplete={() => setName("")}>
            {template ? (
                <motion.div key="create" className="fixed inset-0 z-[150] grid place-items-end bg-zinc-950/55 p-0 backdrop-blur-[2px] sm:place-items-center sm:p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onPointerDown={(event) => { if (event.target === event.currentTarget && !creating) onClose(); }}>
                    <motion.form
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="create-project-title"
                        onSubmit={(event) => { event.preventDefault(); submit(); }}
                        className="w-full max-w-lg overflow-hidden rounded-t-3xl border border-zinc-200 bg-white text-zinc-900 shadow-2xl sm:rounded-3xl dark:border-white/10 dark:bg-zinc-950 dark:text-white"
                        initial={{ opacity: 0, y: 24 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 24 }}
                        transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                    >
                        <div className="relative">
                            <SceneSketch project={templateProject(template.id)} className="aspect-[21/9] w-full" />
                            <button type="button" onClick={onClose} disabled={creating} className="absolute end-3 top-3 grid h-9 w-9 place-items-center rounded-xl bg-white/90 text-zinc-700 shadow transition hover:bg-white" aria-label={tx(C.close)}><X className="h-4.5 w-4.5" aria-hidden /></button>
                        </div>
                        <div className="space-y-4 p-5">
                            <div>
                                <TemplateBadges template={template} locale={locale} compact />
                                <h2 id="create-project-title" className="mt-2 text-xl font-black tracking-tight">{t("newProject")}</h2>
                            </div>
                            <label className="block">
                                <span className="mb-1.5 block text-[13px] font-bold text-zinc-600 dark:text-zinc-300">{t("projectName")}</span>
                                <input ref={inputRef} value={name} maxLength={80} placeholder={template.name[locale]} onChange={(event) => setName(event.target.value)} className="h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 text-[15px] outline-none transition focus:border-violet-400 focus:ring-4 focus:ring-violet-500/10 dark:border-white/10 dark:bg-zinc-900" />
                            </label>
                            <label className="block">
                                <span className="mb-1.5 block text-[13px] font-bold text-zinc-600 dark:text-zinc-300">{tx(C.template)}</span>
                                <select value={template.id} onChange={(event) => onPick(PROJECT_TEMPLATES.find((item) => item.id === event.target.value) ?? template)} className="h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 text-[14px] outline-none transition focus:border-violet-400 focus:ring-4 focus:ring-violet-500/10 dark:border-white/10 dark:bg-zinc-900">
                                    {PROJECT_TEMPLATES.map((item) => <option key={item.id} value={item.id}>{item.name[locale]} · {item.dimension.toUpperCase()} · {item.languages.join(" + ")}</option>)}
                                </select>
                            </label>
                            <p className="flex items-center gap-1.5 text-[12.5px] text-zinc-500">{signedIn ? <><Cloud className="h-3.5 w-3.5" aria-hidden />{t("savesToCloud")}</> : <><HardDrive className="h-3.5 w-3.5" aria-hidden />{t("savesToBrowser")}</>}</p>
                        </div>
                        <div className="flex justify-end gap-2 border-t border-zinc-200 px-5 py-3 dark:border-white/10">
                            <button type="button" onClick={onClose} disabled={creating} className="h-11 rounded-xl px-4 text-[14px] font-bold text-zinc-600 transition hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-white/5">{t("cancel")}</button>
                            <button type="submit" disabled={creating} className="inline-flex h-11 items-center gap-2 rounded-xl bg-zinc-900 px-5 text-[14px] font-bold text-white transition hover:bg-zinc-700 disabled:opacity-60 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200">
                                {creating ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden /> : <Plus className="h-4 w-4" aria-hidden />}{t("createProject")}
                            </button>
                        </div>
                    </motion.form>
                </motion.div>
            ) : null}
        </AnimatePresence>,
        document.body,
    );
}

// ---------------------------------------------------------------------------
// Hub
// ---------------------------------------------------------------------------

export default function EngineHub({ onOpen }: { onOpen: (id: string, source: "cloud" | "local") => void }) {
    const t = useEngineText();
    const { language, tx } = useI18n();
    const locale = engineLocale(language);
    const { data: session, status } = useSession();
    const signedIn = Boolean(session?.user?.email);
    const { toasts, push: toast, dismiss } = useToasts();
    const [projects, setProjects] = useState<ProjectSummary[]>([]);
    const [loading, setLoading] = useState(true);
    const [query, setQuery] = useState("");
    const [sort, setSort] = useState<"recent" | "name">("recent");
    const [creatingFrom, setCreatingFrom] = useState<TemplateInfo | null>(null);
    const [creating, setCreating] = useState(false);
    const [previewing, setPreviewing] = useState<TemplateInfo | null>(null);
    const [limitReached, setLimitReached] = useState<number | null>(null);
    const importInput = useRef<HTMLInputElement | null>(null);

    const refresh = useCallback(async () => {
        setLoading(true);
        const local = await listLocalProjects();
        let cloud: ProjectSummary[] = [];
        if (signedIn) {
            try {
                cloud = await listCloudProjects();
            } catch (error) {
                toast(error instanceof Error ? error.message : t("cloudLoadFailed"), "error");
            }
        }
        setProjects([...cloud, ...local].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
        setLoading(false);
    }, [signedIn, t, toast]);

    useEffect(() => {
        if (status === "loading") return;
        const frame = requestAnimationFrame(() => void refresh());
        return () => cancelAnimationFrame(frame);
    }, [status, refresh]);

    const createFrom = async (project: GameProjectDocument) => {
        setCreating(true);
        try {
            if (signedIn) {
                const created = await createCloudProject(project);
                onOpen(created.id, "cloud");
            } else {
                await saveLocalProject(project);
                onOpen(project.id, "local");
            }
        } catch (error) {
            setCreating(false);
            if (error instanceof PersistenceError && error.code === "game_limit") {
                setCreatingFrom(null);
                setLimitReached(error.limit ?? 0);
                return;
            }
            toast(error instanceof Error ? error.message : t("createFailed"), "error");
        }
    };

    const remove = async (item: ProjectSummary) => {
        if (!window.confirm(`"${item.name}": ${t("confirmDeleteProject")}`)) return;
        try {
            if (item.source === "cloud") await deleteCloudProject(item.id);
            else await deleteLocalProject(item.id);
            setProjects((current) => current.filter((project) => !(project.id === item.id && project.source === item.source)));
        } catch (error) {
            toast(error instanceof Error ? error.message : tx(C.deleteFailed), "error");
        }
    };

    const download = async (item: ProjectSummary) => {
        try {
            const project = item.source === "cloud" ? (await loadCloudProject(item.id)).project : await loadLocalProject(item.id);
            if (project) exportProjectJson(project);
        } catch (error) {
            toast(error instanceof Error ? error.message : t("downloadFailed"), "error");
        }
    };

    const shown = useMemo(() => {
        const needle = query.trim().toLocaleLowerCase();
        const list = needle ? projects.filter((item) => item.name.toLocaleLowerCase().includes(needle)) : projects;
        return sort === "name" ? [...list].sort((a, b) => a.name.localeCompare(b.name, locale)) : list;
    }, [projects, query, sort, locale]);
    const latest = projects[0] ?? null;
    const closePreview = useCallback(() => setPreviewing(null), []);
    const closeCreate = useCallback(() => setCreatingFrom(null), []);
    const startFrom = (template: TemplateInfo) => {
        setPreviewing(null);
        setCreatingFrom(template);
    };
    const playable = PROJECT_TEMPLATES.filter((template) => !template.id.startsWith("empty")).length;

    return (
        <div className="min-h-dvh bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-white">
            <Header />
            <main id="main-content">
                <section className="relative isolate overflow-hidden border-b border-zinc-200/70 bg-white dark:border-white/[0.06] dark:bg-zinc-950">
                    <GridBackdrop fade="bottom" />
                    <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 pb-16 pt-28 sm:px-6 lg:grid-cols-[1fr_1.08fr] lg:pt-32">
                        <div className="min-w-0">
                            <header className="flex flex-wrap items-center gap-3 animate-fade-up">
                                <ProductLogo product="engine" size={52} priority />
                                <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-300 px-3 py-1 text-[12px] font-bold text-zinc-600 dark:border-white/15 dark:text-zinc-300" title={ENGINE_VERSION_LABEL}>
                                    <span className="h-1.5 w-1.5 rounded-full bg-gradient-to-r from-violet-500 to-pink-500" aria-hidden />{tx(C.kicker, { version: `Hanogt Engine V${ENGINE_VERSION}` })}
                                </span>
                            </header>
                            <h1 className="mt-6 text-4xl font-black leading-[1.05] tracking-tight animate-fade-up sm:text-5xl lg:text-6xl" style={{ animationDelay: "60ms" }}>
                                {tx(C.titleStart)}{" "}<span className="text-gradient animate-gradient">{tx(C.titleAccent)}</span>
                            </h1>
                            <p className="mt-5 max-w-xl text-[17px] leading-relaxed text-zinc-600 animate-fade-up dark:text-zinc-400" style={{ animationDelay: "120ms" }}>{tx(C.heroText)}</p>
                            <div className="mt-7 flex flex-wrap gap-3 animate-fade-up" style={{ animationDelay: "180ms" }}>
                                <button type="button" onClick={() => setCreatingFrom(PROJECT_TEMPLATES[0])} className={primaryButton}><Plus className="h-4.5 w-4.5" aria-hidden />{t("newProject")}</button>
                                <a href="#templates" onClick={(event) => { event.preventDefault(); document.getElementById("templates")?.scrollIntoView({ behavior: "smooth" }); }} className={secondaryButton}>{tx(C.browse)}<ArrowRight className="h-4 w-4 rtl:rotate-180" aria-hidden /></a>
                                <button type="button" onClick={() => importInput.current?.click()} className="inline-flex h-12 items-center gap-2 rounded-2xl px-3 text-[15px] font-bold text-zinc-700 transition hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-white/5"><Upload className="h-4.5 w-4.5" aria-hidden />{t("importProject")}</button>
                            </div>
                            {!signedIn && status !== "loading" ? (
                                <p className="mt-5 max-w-xl rounded-2xl border border-amber-500/25 bg-amber-500/[0.07] px-4 py-3 text-[13px] leading-relaxed text-amber-900 dark:text-amber-100/90">{t("signInForCloud")} <Link href="/login?callbackUrl=/game-engine" className="font-bold underline underline-offset-2">{t("signIn")}</Link></p>
                            ) : null}
                            {limitReached !== null ? (
                                <p role="alert" data-game-limit className="mt-5 max-w-xl rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-[13px] leading-relaxed text-rose-900 dark:text-rose-100">
                                    {tx(C.limitReached, { limit: limitReached })}{" "}
                                    <Link href="/plans" className="font-bold underline underline-offset-2">{tx(C.pricing)}</Link>
                                </p>
                            ) : null}
                            <dl className="mt-9 grid max-w-xl grid-cols-2 gap-x-6 gap-y-5 animate-fade-up sm:grid-cols-4" style={{ animationDelay: "240ms" }}>
                                <Stat value={playable} label={tx(C.statTemplates)} />
                                <Stat value={2} label={tx(C.statLanguages)} />
                                <Stat value="2D·3D" label={tx(C.statDimensions)} />
                                <Stat value={tx(C.statPublishValue)} label={tx(C.statPublish)} />
                            </dl>
                        </div>
                        <div className="min-w-0 animate-fade-up" style={{ animationDelay: "160ms" }}>
                            <Showcase paused={previewing !== null} locale={locale} />
                        </div>
                    </div>
                </section>

                <div className="mx-auto max-w-7xl space-y-24 px-4 py-16 sm:px-6">
                    {latest && !loading ? (
                        <Reveal>
                            <section aria-labelledby="continue-title" className="grid items-center gap-6 overflow-hidden rounded-3xl border border-zinc-200 bg-white p-4 sm:grid-cols-[minmax(0,280px)_1fr_auto] sm:p-5 dark:border-white/10 dark:bg-zinc-900/60">
                                <button type="button" onClick={() => onOpen(latest.id, latest.source)} className="group relative block aspect-video overflow-hidden rounded-2xl bg-zinc-100 dark:bg-zinc-800" aria-label={latest.name}>
                                    {latest.thumbnail ? (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img src={latest.thumbnail} alt="" className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
                                    ) : <span className="grid h-full place-items-center text-[13px] font-black uppercase text-zinc-400">{latest.dimension}</span>}
                                </button>
                                <div className="min-w-0">
                                    <p id="continue-title" className="text-[13px] font-black uppercase tracking-wider text-zinc-500">{tx(C.continueTitle)}</p>
                                    <h2 className="mt-1 truncate text-2xl font-black tracking-tight">{latest.name}</h2>
                                    <p className="mt-1 text-[13.5px] text-zinc-500 dark:text-zinc-400">{tx(C.continueMeta, { time: relativeTime(latest.updatedAt, locale), objects: latest.objectCount, scripts: latest.scriptCount })}</p>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    <button type="button" onClick={() => onOpen(latest.id, latest.source)} className={primaryButton}>{tx(C.open)}<ArrowRight className="h-4 w-4 rtl:rotate-180" aria-hidden /></button>
                                    <a href="#projects" onClick={(event) => { event.preventDefault(); document.getElementById("projects")?.scrollIntoView({ behavior: "smooth" }); }} className={secondaryButton}>{tx(C.allProjects)}</a>
                                </div>
                            </section>
                        </Reveal>
                    ) : null}

                    <TemplateGallery locale={locale} onPreview={setPreviewing} onStart={startFrom} />

                    <WhatsNew />

                    <section id="projects" aria-labelledby="projects-title" className="scroll-mt-24">
                        <Reveal className="flex flex-wrap items-end justify-between gap-4">
                            <div>
                                <h2 id="projects-title" className="text-3xl font-black tracking-tight sm:text-4xl">{t("myProjects")}</h2>
                                <p className="mt-2 text-[15px] text-zinc-600 dark:text-zinc-400">{tx(C.projectsText)}</p>
                            </div>
                            <div className="flex w-full flex-wrap gap-2 sm:w-auto">
                                <label className="relative min-w-0 flex-1 sm:w-64 sm:flex-none">
                                    <span className="sr-only">{t("search")}</span>
                                    <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" aria-hidden />
                                    <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("search")} className="h-10 w-full rounded-xl border border-zinc-200 bg-white pe-3 ps-9 text-[14px] outline-none transition focus:border-violet-400 focus:ring-4 focus:ring-violet-500/10 dark:border-white/10 dark:bg-zinc-950" />
                                </label>
                                <label className="shrink-0">
                                    <span className="sr-only">{tx(C.sortLabel)}</span>
                                    <select value={sort} onChange={(event) => setSort(event.target.value === "name" ? "name" : "recent")} className="h-10 rounded-xl border border-zinc-200 bg-white px-3 text-[13.5px] font-semibold outline-none transition focus:border-violet-400 dark:border-white/10 dark:bg-zinc-950">
                                        <option value="recent">{tx(C.sortRecent)}</option>
                                        <option value="name">{tx(C.sortName)}</option>
                                    </select>
                                </label>
                            </div>
                        </Reveal>
                        {loading ? (
                            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                                {Array.from({ length: 4 }, (_, index) => <div key={index} className="h-52 animate-pulse rounded-3xl bg-zinc-200/70 dark:bg-white/[0.04]" />)}
                            </div>
                        ) : shown.length ? (
                            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                                {shown.map((item, index) => (
                                    <Reveal key={`${item.source}:${item.id}`} delay={Math.min(index, 8) * 0.04} y={14}>
                                        <article className="group h-full overflow-hidden rounded-3xl border border-zinc-200 bg-white transition hover:border-zinc-300 dark:border-white/10 dark:bg-zinc-900/60 dark:hover:border-white/20">
                                            <button type="button" onClick={() => onOpen(item.id, item.source)} className="block w-full text-start">
                                                <div className="relative aspect-video overflow-hidden bg-zinc-100 dark:bg-zinc-800">
                                                    {item.thumbnail ? (
                                                        // eslint-disable-next-line @next/next/no-img-element
                                                        <img src={item.thumbnail} alt="" className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
                                                    ) : <div className="grid h-full place-items-center text-[13px] font-black uppercase text-zinc-400">{item.dimension}</div>}
                                                    <span className="absolute start-2 top-2 rounded-md bg-black/55 px-1.5 py-0.5 text-[10.5px] font-bold uppercase text-white">{item.dimension}</span>
                                                    <span className="absolute end-2 top-2 inline-flex items-center gap-1 rounded-md bg-black/55 px-1.5 py-0.5 text-[10.5px] font-semibold text-white">
                                                        {item.source === "cloud" ? <Cloud className="h-3 w-3" aria-hidden /> : <HardDrive className="h-3 w-3" aria-hidden />}{item.source === "cloud" ? t("cloud") : t("local")}
                                                    </span>
                                                    {item.arcadeId ? <span className="absolute bottom-2 start-2 inline-flex items-center gap-1 rounded-md bg-emerald-600 px-1.5 py-0.5 text-[10.5px] font-bold text-white"><Globe className="h-3 w-3" aria-hidden />Arcade</span> : null}
                                                </div>
                                                <div className="p-4">
                                                    <h3 className="truncate text-[15px] font-bold">{item.name}</h3>
                                                    <p className="mt-0.5 text-[12px] text-zinc-500">{relativeTime(item.updatedAt, locale)} · {item.objectCount} {t("objects")} · {item.scriptCount} script</p>
                                                </div>
                                            </button>
                                            <div className="flex items-center gap-1 border-t border-zinc-100 px-2 py-1.5 dark:border-white/[0.06]">
                                                <button type="button" onClick={() => onOpen(item.id, item.source)} className="flex-1 rounded-lg px-2 py-1.5 text-start text-[13px] font-bold text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-white/5">{t("open")}</button>
                                                <button type="button" onClick={() => void download(item)} className="grid h-8 w-8 place-items-center rounded-lg text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-white/5 dark:hover:text-white" title={t("exportJson")} aria-label={t("exportJson")}><Download className="h-4 w-4" aria-hidden /></button>
                                                <button type="button" onClick={() => void remove(item)} className="grid h-8 w-8 place-items-center rounded-lg text-zinc-500 hover:bg-rose-500/10 hover:text-rose-600 dark:hover:text-rose-300" title={t("deleteLabel")} aria-label={t("deleteLabel")}><Trash2 className="h-4 w-4" aria-hidden /></button>
                                            </div>
                                        </article>
                                    </Reveal>
                                ))}
                            </div>
                        ) : (
                            <div className="mt-6 rounded-3xl border border-dashed border-zinc-300 p-10 text-center dark:border-white/15">
                                <p className="text-[14px] text-zinc-500">{t("noProjects")}</p>
                                <button type="button" onClick={() => setCreatingFrom(PROJECT_TEMPLATES[0])} className="mt-4 inline-flex h-10 items-center gap-2 rounded-xl bg-zinc-900 px-4 text-[13.5px] font-bold text-white transition hover:bg-zinc-700 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"><Plus className="h-4 w-4" aria-hidden />{t("newProject")}</button>
                            </div>
                        )}
                        <p className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-[13.5px] font-semibold">
                            <Link href="/arcade" className="inline-flex items-center gap-1.5 text-zinc-600 transition hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white"><Rocket className="h-4 w-4" aria-hidden />{t("arcade")}</Link>
                            <Link href="/game-engine/docs" className="inline-flex items-center gap-1.5 text-zinc-600 transition hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white"><BookOpen className="h-4 w-4" aria-hidden />{t("docs")}</Link>
                        </p>
                    </section>
                </div>
            </main>
            <SiteFooter />

            <input ref={importInput} type="file" accept=".json,application/json" hidden onChange={async (event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (!file) return;
                try {
                    const imported = await importProjectFile(file);
                    await createFrom({ ...imported, id: createEngineId("game") });
                } catch (error) {
                    toast(error instanceof Error ? error.message : t("importFailed"), "error");
                }
            }} />

            <TemplateDrawer template={previewing} project={previewing ? templateProject(previewing.id) : null} locale={locale} onClose={closePreview} onStart={startFrom} />
            <CreateDialog
                template={creatingFrom}
                locale={locale}
                signedIn={signedIn}
                creating={creating}
                onPick={setCreatingFrom}
                onClose={closeCreate}
                onCreate={(template, name) => void createFrom(createProjectFromTemplate(template.id, name))}
            />
            <Toasts toasts={toasts} onDismiss={dismiss} />
        </div>
    );
}
