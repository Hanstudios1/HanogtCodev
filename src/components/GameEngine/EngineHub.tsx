"use client";

import {
    ArrowLeft,
    BookOpen,
    Cloud,
    Download,
    Gamepad2,
    Globe,
    HardDrive,
    LoaderCircle,
    Plus,
    Rocket,
    Search,
    Sparkles,
    Trash2,
    Upload,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { useI18n } from "@/lib/i18n";
import { createProjectFromTemplate, PROJECT_TEMPLATES, type TemplateInfo } from "@/lib/game-engine/templates";
import { createEngineId } from "@/lib/game-engine/ids";
import type { GameProjectDocument } from "@/lib/game-engine/types";
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
    saveLocalProject,
    type ProjectSummary,
} from "./editor/persistence";
import { engineLocale, useEngineText } from "./editor/text";
import { Button, Modal, Toasts, cx, inputClass, useToasts } from "./editor/ui";

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

function TemplateCard({ template, locale, onPick, index }: { template: TemplateInfo; locale: "tr" | "en"; onPick: () => void; index: number }) {
    return (
        <button
            type="button"
            onClick={onPick}
            className="group relative flex flex-col overflow-hidden rounded-2xl border border-white/[0.08] bg-zinc-900/70 text-left transition duration-300 hover:-translate-y-1 hover:border-white/20 hover:shadow-2xl hover:shadow-indigo-500/10 animate-fade-up"
            style={{ animationDelay: `${index * 60}ms` }}
        >
            <div className="relative h-32 overflow-hidden" style={{ background: `linear-gradient(135deg, ${template.gradient[0]}, ${template.gradient[1]})` }}>
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,.35),transparent_45%)]" />
                <span className="absolute left-4 top-3 text-5xl drop-shadow-lg transition duration-500 group-hover:scale-110 group-hover:-rotate-6">{template.emoji}</span>
                <span className="absolute right-3 top-3 rounded-full bg-black/35 px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wider text-white backdrop-blur">{template.dimension}</span>
                <div className="absolute bottom-3 right-3 flex gap-1">
                    {template.languages.map((language) => <span key={language} className="rounded-md bg-black/40 px-1.5 py-0.5 text-[10px] font-black text-white backdrop-blur">{language}</span>)}
                </div>
            </div>
            <div className="flex flex-1 flex-col p-4">
                <h3 className="text-[15px] font-bold text-white">{template.name[locale]}</h3>
                <p className="mt-1 flex-1 text-[12.5px] leading-relaxed text-zinc-400">{template.description[locale]}</p>
                <span className="mt-3 inline-flex items-center gap-1 text-[12px] font-semibold text-indigo-300 transition group-hover:gap-2">
                    <Plus className="h-3.5 w-3.5" />{locale === "tr" ? "Bu şablonla başla" : "Start with this template"}
                </span>
            </div>
        </button>
    );
}

export default function EngineHub({ onOpen }: { onOpen: (id: string, source: "cloud" | "local") => void }) {
    const t = useEngineText();
    const { language } = useI18n();
    const locale = engineLocale(language);
    const { data: session, status } = useSession();
    const signedIn = Boolean(session?.user?.email);
    const { toasts, push: toast, dismiss } = useToasts();
    const [projects, setProjects] = useState<ProjectSummary[]>([]);
    const [loading, setLoading] = useState(true);
    const [query, setQuery] = useState("");
    const [pending, setPending] = useState<TemplateInfo | null>(null);
    const [name, setName] = useState("");
    const [creating, setCreating] = useState(false);
    const importInput = useRef<HTMLInputElement | null>(null);

    const refresh = useCallback(async () => {
        setLoading(true);
        const local = await listLocalProjects();
        let cloud: ProjectSummary[] = [];
        if (signedIn) {
            try {
                cloud = await listCloudProjects();
            } catch (error) {
                toast(error instanceof Error ? error.message : "Bulut projeleri yüklenemedi.", "error");
            }
        }
        setProjects([...cloud, ...local].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
        setLoading(false);
    }, [signedIn, toast]);

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
            toast(error instanceof Error ? error.message : "Proje oluşturulamadı.", "error");
            setCreating(false);
        }
    };

    const remove = async (item: ProjectSummary) => {
        if (!window.confirm(`"${item.name}": ${t("confirmDeleteProject")}`)) return;
        try {
            if (item.source === "cloud") await deleteCloudProject(item.id);
            else await deleteLocalProject(item.id);
            setProjects((current) => current.filter((project) => !(project.id === item.id && project.source === item.source)));
        } catch (error) {
            toast(error instanceof Error ? error.message : "Silinemedi.", "error");
        }
    };

    const download = async (item: ProjectSummary) => {
        try {
            const project = item.source === "cloud" ? (await loadCloudProject(item.id)).project : await loadLocalProject(item.id);
            if (project) exportProjectJson(project);
        } catch (error) {
            toast(error instanceof Error ? error.message : "İndirilemedi.", "error");
        }
    };

    const filtered = useMemo(() => {
        const needle = query.trim().toLocaleLowerCase();
        return needle ? projects.filter((item) => item.name.toLocaleLowerCase().includes(needle)) : projects;
    }, [projects, query]);

    return (
        <div className="min-h-dvh bg-zinc-950 text-zinc-100 [color-scheme:dark]">
            <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_at_top,rgba(99,102,241,0.18),transparent_55%),radial-gradient(ellipse_at_bottom_right,rgba(236,72,153,0.12),transparent_50%)]" />
            <header className="sticky top-0 z-30 border-b border-white/[0.06] bg-zinc-950/80 backdrop-blur-xl">
                <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4">
                    <Link href="/" className="grid h-9 w-9 place-items-center rounded-xl text-zinc-400 transition hover:bg-white/5 hover:text-white" aria-label="Ana sayfa"><ArrowLeft className="h-4 w-4" /></Link>
                    <div className="flex items-center gap-2">
                        <div className="grid h-8 w-8 place-items-center rounded-xl bg-gradient-to-br from-indigo-500 to-fuchsia-500 shadow-lg shadow-indigo-500/30"><Gamepad2 className="h-4 w-4" /></div>
                        <span className="text-[15px] font-black tracking-tight">Hanogt Engine</span>
                        <span className="rounded-full bg-indigo-500/15 px-2 py-0.5 text-[10px] font-bold text-indigo-200">v2</span>
                    </div>
                    <div className="flex-1" />
                    <Link href="/arcade" className="hidden items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-semibold text-zinc-300 transition hover:bg-white/5 hover:text-white sm:inline-flex"><Globe className="h-4 w-4" />{t("arcade")}</Link>
                    <Link href="/game-engine/docs" className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-semibold text-zinc-300 transition hover:bg-white/5 hover:text-white"><BookOpen className="h-4 w-4" />{t("docs")}</Link>
                </div>
            </header>

            <main className="relative mx-auto max-w-7xl px-4 pb-24 pt-10">
                <section className="mb-12 grid items-center gap-8 lg:grid-cols-[1.2fr_1fr]">
                    <div className="animate-fade-up">
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-indigo-400/30 bg-indigo-500/10 px-3 py-1 text-[12px] font-semibold text-indigo-200"><Sparkles className="h-3.5 w-3.5" />C# · C++ · 2D · 3D · WebGL</span>
                        <h1 className="mt-4 text-4xl font-black leading-[1.05] tracking-tight sm:text-5xl">{t("welcomeTitle")}</h1>
                        <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-zinc-400">{t("welcomeText")}</p>
                        <div className="mt-6 flex flex-wrap gap-2">
                            <Button variant="primary" className="h-10 px-5 text-[13px]" onClick={() => { setPending(PROJECT_TEMPLATES[0]); setName(""); }}><Plus className="h-4 w-4" />{t("newProject")}</Button>
                            <Button className="h-10 px-4 text-[13px]" onClick={() => importInput.current?.click()}><Upload className="h-4 w-4" />{t("importProject")}</Button>
                            <Link href="/arcade" className="inline-flex h-10 items-center gap-1.5 rounded-lg px-4 text-[13px] font-semibold text-zinc-300 transition hover:bg-white/5"><Rocket className="h-4 w-4" />{t("arcade")}</Link>
                        </div>
                        {!signedIn && status !== "loading" ? <p className="mt-4 max-w-xl rounded-xl border border-amber-500/20 bg-amber-500/[0.07] px-3 py-2 text-[12.5px] leading-relaxed text-amber-100/90">{t("signInForCloud")} <Link href="/login?callbackUrl=/game-engine" className="font-semibold underline underline-offset-2">Giriş yap</Link></p> : null}
                    </div>
                    <div className="relative hidden animate-fade-up lg:block" style={{ animationDelay: "120ms" }}>
                        <div className="grid grid-cols-3 gap-3 [perspective:900px]">
                            {["🏃", "🚀", "🎱", "🧱", "🧊", "🟦"].map((emoji, index) => (
                                <div key={emoji} className="grid aspect-square place-items-center rounded-2xl border border-white/10 bg-gradient-to-br from-zinc-800/80 to-zinc-900/80 text-4xl shadow-2xl animate-float" style={{ animationDelay: `${index * 0.5}s`, transform: `rotateX(${index % 2 ? 8 : -6}deg) rotateY(${index % 3 ? -10 : 8}deg)` }}>{emoji}</div>
                            ))}
                        </div>
                    </div>
                </section>

                <section className="mb-12">
                    <div className="mb-4 flex items-end justify-between gap-3">
                        <h2 className="text-xl font-bold">{t("templates")}</h2>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        {PROJECT_TEMPLATES.map((template, index) => (
                            <TemplateCard key={template.id} template={template} locale={locale} index={index} onPick={() => { setPending(template); setName(""); }} />
                        ))}
                    </div>
                </section>

                <section>
                    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
                        <h2 className="text-xl font-bold">{t("myProjects")}</h2>
                        <div className="relative w-full max-w-xs">
                            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("search")} className={cx(inputClass, "h-9 pl-8 text-[13px]")} />
                        </div>
                    </div>
                    {loading ? (
                        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                            {Array.from({ length: 4 }, (_, index) => <div key={index} className="h-44 animate-pulse rounded-2xl bg-white/[0.04]" />)}
                        </div>
                    ) : filtered.length ? (
                        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                            {filtered.map((item, index) => (
                                <article key={`${item.source}:${item.id}`} className="group overflow-hidden rounded-2xl border border-white/[0.07] bg-zinc-900/70 transition hover:border-white/20 animate-fade-up" style={{ animationDelay: `${Math.min(index, 12) * 40}ms` }}>
                                    <button type="button" onClick={() => onOpen(item.id, item.source)} className="block w-full text-left">
                                        <div className="relative aspect-video overflow-hidden bg-gradient-to-br from-zinc-800 to-zinc-900">
                                            {item.thumbnail ? (
                                                // eslint-disable-next-line @next/next/no-img-element
                                                <img src={item.thumbnail} alt="" className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
                                            ) : <div className="grid h-full place-items-center text-4xl opacity-60">{item.dimension === "2d" ? "🟦" : "🧊"}</div>}
                                            <span className="absolute left-2 top-2 rounded-md bg-black/55 px-1.5 py-0.5 text-[10px] font-bold uppercase text-white backdrop-blur">{item.dimension}</span>
                                            <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-md bg-black/55 px-1.5 py-0.5 text-[10px] font-semibold text-white backdrop-blur">
                                                {item.source === "cloud" ? <Cloud className="h-3 w-3" /> : <HardDrive className="h-3 w-3" />}{item.source === "cloud" ? t("cloud") : t("local")}
                                            </span>
                                            {item.arcadeId ? <span className="absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-md bg-emerald-500/85 px-1.5 py-0.5 text-[10px] font-bold text-white"><Globe className="h-3 w-3" />Arcade</span> : null}
                                        </div>
                                        <div className="p-3">
                                            <h3 className="truncate text-[14px] font-bold text-white">{item.name}</h3>
                                            <p className="mt-0.5 text-[11.5px] text-zinc-500">{relativeTime(item.updatedAt, locale)} · {item.objectCount} {t("objects")} · {item.scriptCount} script</p>
                                        </div>
                                    </button>
                                    <div className="flex items-center gap-1 border-t border-white/[0.05] px-2 py-1.5">
                                        <button type="button" onClick={() => onOpen(item.id, item.source)} className="flex-1 rounded-md px-2 py-1 text-left text-[12px] font-semibold text-indigo-300 hover:bg-white/5">{t("open")}</button>
                                        <button type="button" onClick={() => void download(item)} className="grid h-7 w-7 place-items-center rounded-md text-zinc-500 hover:bg-white/5 hover:text-zinc-200" title={t("exportJson")} aria-label={t("exportJson")}><Download className="h-3.5 w-3.5" /></button>
                                        <button type="button" onClick={() => void remove(item)} className="grid h-7 w-7 place-items-center rounded-md text-zinc-500 hover:bg-red-500/10 hover:text-red-300" title={t("deleteLabel")} aria-label={t("deleteLabel")}><Trash2 className="h-3.5 w-3.5" /></button>
                                    </div>
                                </article>
                            ))}
                        </div>
                    ) : (
                        <div className="rounded-2xl border border-dashed border-white/10 p-10 text-center text-[13px] text-zinc-500">{t("noProjects")}</div>
                    )}
                </section>
            </main>

            <input ref={importInput} type="file" accept=".json,application/json" hidden onChange={async (event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (!file) return;
                try {
                    const imported = await importProjectFile(file);
                    await createFrom({ ...imported, id: createEngineId("game") });
                } catch (error) {
                    toast(error instanceof Error ? error.message : "İçe aktarılamadı.", "error");
                }
            }} />

            <Modal
                open={pending !== null}
                onClose={() => !creating && setPending(null)}
                title={t("newProject")}
                icon={Plus}
                footer={(
                    <>
                        <Button variant="ghost" disabled={creating} onClick={() => setPending(null)}>{t("cancel")}</Button>
                        <Button variant="primary" disabled={creating || !pending} onClick={() => pending && void createFrom(createProjectFromTemplate(pending.id, name.trim() || pending.name[locale]))}>
                            {creating ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}{t("createProject")}
                        </Button>
                    </>
                )}
            >
                <div className="space-y-4">
                    <label className="block">
                        <span className="mb-1.5 block text-[12px] font-semibold text-zinc-400">{t("projectName")}</span>
                        <input autoFocus value={name} maxLength={80} placeholder={pending?.name[locale]} onChange={(event) => setName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && pending && !creating) void createFrom(createProjectFromTemplate(pending.id, name.trim() || pending.name[locale])); }} className={cx(inputClass, "h-10 text-[14px]")} />
                    </label>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                        {PROJECT_TEMPLATES.map((template) => (
                            <button key={template.id} type="button" onClick={() => setPending(template)} className={cx("rounded-xl border p-2.5 text-left transition", pending?.id === template.id ? "border-indigo-400/60 bg-indigo-500/15" : "border-white/[0.07] bg-white/[0.02] hover:bg-white/[0.05]")}>
                                <span className="text-xl">{template.emoji}</span>
                                <span className="mt-1 block truncate text-[12px] font-semibold text-zinc-100">{template.name[locale]}</span>
                                <span className="text-[10.5px] uppercase text-zinc-500">{template.dimension} · {template.languages.join(" ")}</span>
                            </button>
                        ))}
                    </div>
                    <p className="flex items-center gap-1.5 text-[12px] text-zinc-500">{signedIn ? <><Cloud className="h-3.5 w-3.5" />Proje hesabınıza (bulut) kaydedilecek.</> : <><HardDrive className="h-3.5 w-3.5" />Proje bu tarayıcıya kaydedilecek.</>}</p>
                </div>
            </Modal>
            <Toasts toasts={toasts} onDismiss={dismiss} />
        </div>
    );
}
