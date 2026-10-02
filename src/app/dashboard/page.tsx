"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
    AlertTriangle, ArrowRight, ArrowUpDown, Box, Boxes, Code2, Download, FileCode, FolderOpen, Gamepad2,
    Loader2, MoreVertical, Pencil, Plus, Search, Sparkles, Trash2, X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useEffect, useState, type ReactNode } from "react";
import DeleteProjectModal from "@/components/DeleteProjectModal";
import Header, { NAV_ICONS, useStaffRole } from "@/components/Header";
import OptimizedImage from "@/components/OptimizedImage";
import PrivacyPolicyModal, { legalNoticePending, legalNoticeUpdated } from "@/components/PrivacyPolicyModal";
import { useRawSession } from "@/components/Provider";
import SiteFooter from "@/components/SiteFooter";
import { useI18n, type Copy } from "@/lib/i18n";
import { ADMIN_NAV, NAV_LABELS, PRIMARY_NAV, SECONDARY_NAV, type NavItem } from "@/lib/nav";
import { ENGINE_LABELS, LANGUAGES, fileExtensionFor, getLanguage, normalizeLanguageId } from "@/lib/runtimes/languages";
import { getProjects, getProjectsFromCloud, deleteProjectFromCloud, deleteProject, renameProject, type LegacyProject, type Project, type ProjectFile } from "@/lib/storage";

type DashboardProject = Project | LegacyProject;
type LegacyTab = Pick<ProjectFile, "name" | "lang" | "code">;
type GameProjectSummary = {
    id: string;
    name: string;
    description?: string;
    dimension: "2d" | "3d";
    scriptCount?: number;
    objectCount?: number;
    updatedAt?: string;
    createdAt?: string;
};
type SortMode = "recent" | "name";

// Single source of truth for languages lives in src/lib/runtimes/languages.ts.
// Popular ones first, then the rest; game-only "none" engines are excluded.
const CODE_LANGUAGES = LANGUAGES
    .filter((language) => language.engine !== "none")
    .slice()
    .sort((a, b) => Number(Boolean(b.popular)) - Number(Boolean(a.popular)));

const EXPLORE: NavItem[] = ["/ai", "/news", "/arcade", "/guide", "/security", "/social"]
    .map((href) => [...PRIMARY_NAV, ...SECONDARY_NAV].find((item) => item.href === href))
    .filter((item): item is NavItem => Boolean(item));

const C = {
    welcome: { TR: "Tekrar hoş geldin", EN: "Welcome back" },
    codeStat: { TR: "kod projesi", EN: "code projects" },
    gameStat: { TR: "oyun projesi", EN: "game projects" },
    codeCard: { TR: "Kod projesi", EN: "Code project" },
    codeCardDesc: { TR: "{count} dil, çoklu dosya ve tek tuşla paralel çalıştırma", EN: "{count} languages, multiple files and one-click parallel runs", vars: { count: CODE_LANGUAGES.length } },
    gameCard: { TR: "Oyun projesi", EN: "Game project" },
    gameCardDesc: { TR: "C#/C++ scriptli, nesne-bileşen tabanlı 2D/3D motor", EN: "Object-component 2D/3D engine scripted in C#/C++" },
    codeProjects: { TR: "Kod projeleri", EN: "Code projects" },
    gameProjects: { TR: "Oyun projeleri", EN: "Game projects" },
    newGame: { TR: "Yeni oyun projesi", EN: "New game project" },
    engineHub: { TR: "Motor merkezi ve şablonlar", EN: "Engine hub & templates" },
    loadingCode: { TR: "Kod projeleri yükleniyor", EN: "Loading code projects" },
    loadingGame: { TR: "Oyun projeleri yükleniyor", EN: "Loading game projects" },
    firstScene: { TR: "İlk oyun sahneni oluştur", EN: "Create your first game scene" },
    firstSceneDesc: { TR: "2D veya 3D çalışma alanını seç; nesneleri, bileşenleri ve C#/C++ scriptlerini tek yerde yönet.", EN: "Pick a 2D or 3D workspace and manage objects, components and C#/C++ scripts in one place." },
    search: { TR: "Projelerde ara…", EN: "Search projects…" },
    searchLabel: { TR: "Projelerde ara", EN: "Search projects" },
    sortRecent: { TR: "Son düzenlenen", EN: "Recently edited" },
    sortName: { TR: "Ada göre (A–Z)", EN: "By name (A–Z)" },
    noMatch: { TR: "Aramanla eşleşen proje yok.", EN: "No projects match your search." },
    objects: { TR: "nesne", EN: "objects" },
    scripts: { TR: "script", EN: "scripts" },
    updated: { TR: "Güncellendi", EN: "Updated" },
    newWorkspace: { TR: "Yeni çalışma alanı", EN: "New workspace" },
    chooseType: { TR: "Proje türünü seç", EN: "Choose a project type" },
    close: { TR: "Kapat", EN: "Close" },
    codeTypeDesc: { TR: "Bir programlama dili seç ve Monaco kod editörünü aç.", EN: "Pick a programming language and open the Monaco code editor." },
    gameTypeDesc: { TR: "2D/3D sahne, nesne hiyerarşisi ve bileşenlerle motoru aç.", EN: "Open the engine with a 2D/3D scene, object hierarchy and components." },
    createGame: { TR: "Oyun projesi oluştur", EN: "Create a game project" },
    scriptNote: { TR: "Oyun scriptleri C# veya C++ ile yazılır, motorun içindeki script editöründe düzenlenir ve Oynat ile anında test edilir.", EN: "Game scripts are written in C# or C++, edited in the engine's built-in script editor and tested instantly with Play." },
    projectName: { TR: "Proje adı", EN: "Project name" },
    projectNamePlaceholder: { TR: "Örn. Uzay Macerası", EN: "e.g. Space Adventure" },
    shortDesc: { TR: "Kısa açıklama", EN: "Short description" },
    optional: { TR: "(isteğe bağlı)", EN: "(optional)" },
    descPlaceholder: { TR: "Oyunun fikrini ve hedefini yazın…", EN: "Describe the idea and goal of your game…" },
    sceneType: { TR: "Sahne türü", EN: "Scene type" },
    cancel: { TR: "Vazgeç", EN: "Cancel" },
    creating: { TR: "Oluşturuluyor…", EN: "Creating…" },
    openEngine: { TR: "Motoru aç", EN: "Open the engine" },
    templatesHint: { TR: "Hazır şablonla başlamak mı istersin?", EN: "Prefer to start from a template?" },
    nameTooShort: { TR: "Oyun projesi adı en az 2 karakter olmalıdır.", EN: "The game project name needs at least 2 characters." },
    loadFailed: { TR: "Oyun projeleri yüklenemedi.", EN: "Game projects couldn't be loaded." },
    createFailed: { TR: "Oyun projesi oluşturulamadı.", EN: "The game project couldn't be created." },
    deleteFailed: { TR: "Oyun projesi silinemedi.", EN: "The game project couldn't be deleted." },
    zipFailed: { TR: "ZIP dosyası oluşturulamadı.", EN: "The ZIP file couldn't be created." },
    projectMenu: { TR: "Proje menüsü", EN: "Project menu" },
} satisfies Record<string, Copy>;

function formatDate(iso: string | undefined, locale: string) {
    if (!iso) return "";
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return "";
    try {
        return new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(date);
    } catch {
        return date.toLocaleDateString();
    }
}

function saveBlob(blob: Blob, fileName: string) {
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(objectUrl);
}

function safeFileName(name: string) {
    return name.replace(/[^a-zA-Z0-9]/g, "_") || "project";
}

function Dialog({ labelledBy, onClose, wide = false, children }: { labelledBy: string; onClose: () => void; wide?: boolean; children: ReactNode }) {
    return (
        <motion.div
            className="fixed inset-0 z-[70] flex items-center justify-center bg-zinc-950/70 p-4 backdrop-blur-md"
            role="dialog"
            aria-modal="true"
            aria-labelledby={labelledBy}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onPointerDown={(event) => { if (event.target === event.currentTarget) onClose(); }}
        >
            <motion.div
                initial={{ opacity: 0, y: 18, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.98 }}
                transition={{ type: "spring", stiffness: 380, damping: 32 }}
                className={`max-h-[90dvh] w-full overflow-y-auto rounded-3xl border border-zinc-200 bg-white p-6 shadow-2xl dark:border-white/10 dark:bg-zinc-900 sm:p-8 ${wide ? "max-w-4xl" : "max-w-xl"}`}
            >
                {children}
            </motion.div>
        </motion.div>
    );
}

function CloseButton({ label, onClick }: { label: string; onClick: () => void }) {
    return (
        <button type="button" onClick={onClick} className="rounded-full p-2 text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-white" aria-label={label}>
            <X className="h-5 w-5" />
        </button>
    );
}

export default function DashboardPage() {
    const router = useRouter();
    const { data: session } = useSession();
    // Staff get the Admin Panel as the first Explore card (decided by the raw session, not the Firebase bridge).
    const staffRole = useStaffRole(useRawSession().data?.user?.email?.toLowerCase() || null);
    const explore = staffRole ? [ADMIN_NAV, ...EXPLORE] : EXPLORE;
    const { t, tx, language, locale } = useI18n();

    const [showLangModal, setShowLangModal] = useState(false);
    const [showProjectTypeModal, setShowProjectTypeModal] = useState(false);
    const [showGameModal, setShowGameModal] = useState(false);
    const [projects, setProjects] = useState<DashboardProject[]>([]);
    const [gameProjects, setGameProjects] = useState<GameProjectSummary[]>([]);
    const [showPrivacyModal, setShowPrivacyModal] = useState(false);
    const [privacyUpdated, setPrivacyUpdated] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [isGameLoading, setIsGameLoading] = useState(true);
    const [isCreatingGame, setIsCreatingGame] = useState(false);
    const [gameName, setGameName] = useState("");
    const [gameDescription, setGameDescription] = useState("");
    const [gameDimension, setGameDimension] = useState<"2d" | "3d">("3d");
    const [gameError, setGameError] = useState("");
    const [openMenuId, setOpenMenuId] = useState<string | null>(null);
    const [projectToDelete, setProjectToDelete] = useState<DashboardProject | null>(null);
    const [query, setQuery] = useState("");
    const [sort, setSort] = useState<SortMode>("recent");

    const email = session?.user?.email ?? null;
    const firstName = session?.user?.name?.trim().split(/\s+/)[0] ?? "";
    // Server messages are written in Turkish; other languages get the localized fallback.
    const apiMessage = (serverMessage: string | undefined, fallback: Copy) => (language === "TR" && serverMessage ? serverMessage : tx(fallback));

    useEffect(() => {
        // Show the legal notice until the current version has been acknowledged in this browser.
        if (!session?.user || !legalNoticePending()) return;
        const timer = window.setTimeout(() => {
            setPrivacyUpdated(legalNoticeUpdated());
            setShowPrivacyModal(true);
        }, 0);
        return () => window.clearTimeout(timer);
    }, [session]);

    useEffect(() => {
        let cancelled = false;
        const loadProjects = async () => {
            if (!email) {
                if (!cancelled) {
                    setProjects([]);
                    setIsLoading(false);
                }
                return;
            }
            setIsLoading(true);
            try {
                // Cloud copies win; the browser copy is the offline fallback.
                const cloudProjects = await getProjectsFromCloud(email);
                if (!cancelled) setProjects(cloudProjects.length > 0 ? cloudProjects : getProjects(email));
            } catch (error) {
                console.error("Error loading projects:", error);
                if (!cancelled) setProjects(getProjects(email));
            } finally {
                if (!cancelled) setIsLoading(false);
            }
        };
        void loadProjects();
        return () => { cancelled = true; };
    }, [email]);

    useEffect(() => {
        let cancelled = false;
        const loadGames = async () => {
            if (!email) {
                if (!cancelled) {
                    setGameProjects([]);
                    setIsGameLoading(false);
                }
                return;
            }
            setIsGameLoading(true);
            try {
                const response = await fetch("/api/game-projects", { cache: "no-store" });
                const payload = await response.json().catch(() => ({})) as { projects?: GameProjectSummary[] };
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                if (!cancelled) setGameProjects(payload.projects || []);
            } catch (error) {
                console.error("Error loading game projects:", error);
                // "load" is replaced with the localized message while rendering.
                if (!cancelled) setGameError("load");
            } finally {
                if (!cancelled) setIsGameLoading(false);
            }
        };
        void loadGames();
        return () => { cancelled = true; };
    }, [email]);

    // Close the project menu on outside clicks and Escape.
    useEffect(() => {
        if (!openMenuId) return;
        const onPointer = (event: PointerEvent) => {
            if (!(event.target instanceof Element) || !event.target.closest("[data-project-menu]")) setOpenMenuId(null);
        };
        const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setOpenMenuId(null); };
        document.addEventListener("pointerdown", onPointer);
        document.addEventListener("keydown", onKey);
        return () => {
            document.removeEventListener("pointerdown", onPointer);
            document.removeEventListener("keydown", onKey);
        };
    }, [openMenuId]);

    const anyDialog = showLangModal || showProjectTypeModal || showGameModal;
    useEffect(() => {
        if (!anyDialog) return;
        const onKey = (event: KeyboardEvent) => {
            if (event.key !== "Escape") return;
            setShowLangModal(false);
            setShowProjectTypeModal(false);
            setShowGameModal(false);
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [anyDialog]);

    const openGameModal = () => {
        setGameError("");
        setShowProjectTypeModal(false);
        setShowGameModal(true);
    };

    const handleCreateScript = (lang: { id: string }) => {
        router.push(`/editor?lang=${encodeURIComponent(lang.id)}`);
    };

    const handleCreateGameProject = async () => {
        const name = gameName.trim();
        if (name.length < 2) {
            setGameError(tx(C.nameTooShort));
            return;
        }
        setIsCreatingGame(true);
        setGameError("");
        try {
            const response = await fetch("/api/game-projects", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name, description: gameDescription.trim(), dimension: gameDimension }),
            });
            const payload = await response.json().catch(() => ({})) as { project?: GameProjectSummary; error?: string };
            if (!response.ok || !payload.project) throw new Error(apiMessage(payload.error, C.createFailed));
            const created = payload.project;
            setGameProjects((current) => [created, ...current]);
            setShowGameModal(false);
            setGameName("");
            setGameDescription("");
            router.push(`/game-engine?id=${encodeURIComponent(created.id)}`);
        } catch (error) {
            setGameError(error instanceof Error && error.message ? error.message : tx(C.createFailed));
        } finally {
            setIsCreatingGame(false);
        }
    };

    const handleDeleteGameProject = async (project: GameProjectSummary) => {
        const question = tx({
            TR: "“{name}” oyun projesi ve scriptleri kalıcı olarak silinsin mi?",
            EN: "Permanently delete the game project “{name}” and its scripts?",
        }, { name: project.name });
        if (!window.confirm(question)) return;
        try {
            const response = await fetch(`/api/game-projects/${encodeURIComponent(project.id)}`, { method: "DELETE" });
            const payload = await response.json().catch(() => ({})) as { error?: string };
            if (!response.ok) throw new Error(apiMessage(payload.error, C.deleteFailed));
            setGameProjects((current) => current.filter((item) => item.id !== project.id));
        } catch (error) {
            setGameError(error instanceof Error && error.message ? error.message : tx(C.deleteFailed));
        }
    };

    const handleDownloadProject = async (project: DashboardProject) => {
        setOpenMenuId(null);
        if (project.isMultiTab || project.lang === "multi") {
            // Multi-file project: download as a ZIP archive.
            try {
                const JSZip = (await import("jszip")).default;
                const zip = new JSZip();
                const tabs: LegacyTab[] = project.files?.length ? project.files : JSON.parse(project.code) as LegacyTab[];
                tabs.forEach((tab, index) => {
                    const ext = fileExtensionFor(tab.lang);
                    zip.file(`${index + 1}_${safeFileName(tab.name)}.${ext}`, tab.code);
                });
                saveBlob(await zip.generateAsync({ type: "blob" }), `${safeFileName(project.name)}.zip`);
            } catch (error) {
                console.error("Error creating ZIP:", error);
                alert(tx(C.zipFailed));
            }
            return;
        }
        const ext = fileExtensionFor(project.lang);
        saveBlob(new Blob([project.code || "// Empty project"], { type: "text/plain" }), `${safeFileName(project.name)}.${ext}`);
    };

    const handleDeleteProject = async (selectedProject = projectToDelete) => {
        if (!selectedProject || !email) return;
        try {
            const deleted = await deleteProjectFromCloud(String(selectedProject.id));
            deleteProject(email, selectedProject.id);
            if (!deleted) console.warn("Cloud copy could not be deleted; the local copy was removed.");
            setProjects((current) => current.filter((p) => String(p.id) !== String(selectedProject.id)));
        } catch (error) {
            console.error("Error deleting project:", error);
        }
        setProjectToDelete(null);
    };

    const handleRenameProject = async (project: DashboardProject) => {
        setOpenMenuId(null);
        const newName = prompt(t("rename_project_prompt"), project.name)?.trim();
        if (!newName || newName === project.name || !email) return;
        await renameProject(email, project.id, newName);
        setProjects((current) => current.map((p) => (p.id === project.id ? { ...p, name: newName } : p)));
    };

    const openDeleteModal = (project: DashboardProject) => {
        setOpenMenuId(null);
        let skipConfirm = false;
        try {
            skipConfirm = localStorage.getItem("hanogt_skip_delete_confirm") === "true";
        } catch {
            skipConfirm = false;
        }
        if (skipConfirm) void handleDeleteProject(project);
        else setProjectToDelete(project);
    };

    const openCodeProject = (project: DashboardProject) => {
        router.push(`/editor?lang=${encodeURIComponent(project.lang)}&id=${encodeURIComponent(String(project.id))}`);
    };

    const needle = query.trim().toLocaleLowerCase(locale);
    const matches = (name: string) => !needle || name.toLocaleLowerCase(locale).includes(needle);
    const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, locale);
    const visibleProjects = projects.filter((p) => matches(p.name));
    const visibleGames = gameProjects.filter((p) => matches(p.name));
    if (sort === "name") {
        visibleProjects.sort(byName);
        visibleGames.sort(byName);
    }
    const visibleGameError = gameError === "load" ? tx(C.loadFailed) : gameError;
    const hasAnyProject = projects.length + gameProjects.length > 0;

    return (
        <div className="min-h-dvh overflow-x-clip bg-zinc-50 text-zinc-900 transition-colors dark:bg-zinc-950 dark:text-white">
            {showPrivacyModal && <PrivacyPolicyModal updated={privacyUpdated} onAccept={() => setShowPrivacyModal(false)} />}

            <Header />

            <main className="mx-auto max-w-7xl px-4 pb-24 pt-24 sm:px-6">
                {/* Hero */}
                <motion.section
                    initial={{ opacity: 0, y: 14 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.45, ease: "easeOut" }}
                    className="relative mb-8 overflow-hidden rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-zinc-900/60 sm:p-8"
                >
                    <div className="pointer-events-none absolute -top-24 end-0 h-64 w-64 rounded-full bg-indigo-500/15 blur-3xl" aria-hidden />
                    <div className="pointer-events-none absolute -bottom-24 start-1/3 h-56 w-56 rounded-full bg-fuchsia-500/10 blur-3xl" aria-hidden />
                    <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
                        <div className="min-w-0">
                            <p className="mb-2 inline-flex items-center gap-2 text-sm font-semibold text-indigo-600 dark:text-indigo-300">
                                <Sparkles className="h-4 w-4" aria-hidden />
                                {tx(C.welcome)}{firstName ? `, ${firstName}` : ""}
                            </p>
                            <h1 className="text-3xl font-black tracking-tight sm:text-4xl">{t("dashboard_title")}</h1>
                            <p className="mt-2 max-w-xl text-zinc-500 dark:text-zinc-400">{t("dashboard_desc")}</p>
                        </div>
                        <div className="flex flex-wrap items-center gap-3">
                            <div className="flex items-center gap-2 rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm dark:border-white/10 dark:bg-white/5">
                                <Code2 className="h-4 w-4 text-blue-500" aria-hidden />
                                <strong className="tabular-nums">{isLoading ? "–" : projects.length}</strong>
                                <span className="text-zinc-500 dark:text-zinc-400">{tx(C.codeStat)}</span>
                            </div>
                            <div className="flex items-center gap-2 rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm dark:border-white/10 dark:bg-white/5">
                                <Gamepad2 className="h-4 w-4 text-fuchsia-500" aria-hidden />
                                <strong className="tabular-nums">{isGameLoading ? "–" : gameProjects.length}</strong>
                                <span className="text-zinc-500 dark:text-zinc-400">{tx(C.gameStat)}</span>
                            </div>
                            <button
                                type="button"
                                onClick={() => setShowProjectTypeModal(true)}
                                className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-indigo-600 to-blue-600 px-5 py-3 font-bold text-white shadow-lg shadow-indigo-600/25 transition hover:-translate-y-0.5 hover:shadow-xl hover:shadow-indigo-600/30 active:translate-y-0"
                            >
                                <Plus className="h-5 w-5" aria-hidden />
                                {t("create_project")}
                            </button>
                        </div>
                    </div>
                </motion.section>

                {/* Quick start */}
                <div className="mb-8 grid gap-4 md:grid-cols-2">
                    {[
                        { key: "code", icon: Code2, title: tx(C.codeCard), desc: tx(C.codeCardDesc), onClick: () => setShowLangModal(true), tone: "border-blue-500/20 from-blue-500/10 to-cyan-500/5 hover:border-blue-500/50 hover:shadow-blue-500/10", badge: "bg-blue-600 shadow-blue-600/25", arrow: "text-blue-500" },
                        { key: "game", icon: Gamepad2, title: tx(C.gameCard), desc: tx(C.gameCardDesc), onClick: openGameModal, tone: "border-fuchsia-500/20 from-fuchsia-500/10 to-violet-500/5 hover:border-fuchsia-500/50 hover:shadow-fuchsia-500/10", badge: "bg-gradient-to-br from-fuchsia-600 to-violet-600 shadow-fuchsia-600/25", arrow: "text-fuchsia-500" },
                    ].map((card, index) => {
                        const Icon = card.icon;
                        return (
                            <motion.button
                                key={card.key}
                                type="button"
                                onClick={card.onClick}
                                initial={{ opacity: 0, y: 12 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.08 + index * 0.06, duration: 0.4 }}
                                className={`group flex items-center gap-4 rounded-2xl border bg-gradient-to-br p-5 text-start transition hover:-translate-y-0.5 hover:shadow-lg ${card.tone}`}
                            >
                                <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-white shadow-lg ${card.badge}`}><Icon className="h-6 w-6" aria-hidden /></span>
                                <span className="min-w-0">
                                    <strong className="block text-lg">{card.title}</strong>
                                    <span className="text-sm text-zinc-500 dark:text-zinc-400">{card.desc}</span>
                                </span>
                                <ArrowRight className={`ms-auto h-5 w-5 shrink-0 transition group-hover:translate-x-1 rtl:rotate-180 rtl:group-hover:-translate-x-1 ${card.arrow}`} aria-hidden />
                            </motion.button>
                        );
                    })}
                </div>

                {/* Explore */}
                <section className="mb-10" aria-labelledby="explore-title">
                    <h2 id="explore-title" className="mb-3 text-sm font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">{tx(NAV_LABELS.explore)}</h2>
                    <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
                        {explore.map((item) => {
                            const Icon = NAV_ICONS[item.icon];
                            return (
                                <Link key={item.href} href={item.href} className="group relative flex items-start gap-3 rounded-2xl border border-zinc-200 bg-white p-4 transition hover:-translate-y-0.5 hover:border-indigo-500/40 hover:shadow-md dark:border-white/10 dark:bg-zinc-900/60 dark:hover:border-indigo-400/40">
                                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-zinc-100 text-zinc-700 transition group-hover:bg-indigo-500/10 group-hover:text-indigo-600 dark:bg-white/5 dark:text-zinc-200 dark:group-hover:text-indigo-300"><Icon className="h-5 w-5" aria-hidden /></span>
                                    <span className="min-w-0">
                                        <span className="flex items-center gap-2 font-semibold">
                                            {tx(item.label)}
                                            {item.live && <span className="relative flex h-2 w-2" aria-hidden><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-500 opacity-60" /><span className="relative inline-flex h-2 w-2 rounded-full bg-rose-500" /></span>}
                                        </span>
                                        <span className="mt-0.5 line-clamp-2 text-xs text-zinc-500 dark:text-zinc-400">{item.desc ? tx(item.desc) : item.descKey ? t(item.descKey) : ""}</span>
                                    </span>
                                </Link>
                            );
                        })}
                    </div>
                </section>

                {/* Toolbar */}
                {hasAnyProject && (
                    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center">
                        <label className="relative flex-1">
                            <span className="sr-only">{tx(C.searchLabel)}</span>
                            <Search className="pointer-events-none absolute start-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" aria-hidden />
                            <input
                                type="search"
                                value={query}
                                onChange={(event) => setQuery(event.target.value)}
                                placeholder={tx(C.search)}
                                className="w-full rounded-2xl border border-zinc-200 bg-white py-2.5 pe-4 ps-10 text-sm outline-none transition focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 dark:border-white/10 dark:bg-zinc-900"
                            />
                        </label>
                        <div className="inline-flex items-center gap-1 rounded-2xl border border-zinc-200 bg-white p-1 text-sm dark:border-white/10 dark:bg-zinc-900" role="group" aria-label={tx({ TR: "Sıralama", EN: "Sort" })}>
                            <ArrowUpDown className="mx-2 h-4 w-4 text-zinc-400" aria-hidden />
                            {(["recent", "name"] as const).map((mode) => (
                                <button
                                    key={mode}
                                    type="button"
                                    onClick={() => setSort(mode)}
                                    aria-pressed={sort === mode}
                                    className={`rounded-xl px-3 py-1.5 font-medium transition ${sort === mode ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900" : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white"}`}
                                >
                                    {tx(mode === "recent" ? C.sortRecent : C.sortName)}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* Code projects */}
                <section aria-labelledby="code-projects-title">
                    <h2 id="code-projects-title" className="mb-4 flex items-center gap-2 text-xl font-semibold">
                        <Code2 className="h-5 w-5 text-blue-500" aria-hidden />
                        {tx(C.codeProjects)}
                    </h2>

                    {isLoading ? (
                        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3" aria-busy="true" aria-label={tx(C.loadingCode)}>
                            {[0, 1, 2].map((item) => <div key={item} className="h-36 animate-pulse rounded-2xl border border-zinc-200 bg-white dark:border-white/10 dark:bg-zinc-900" />)}
                        </div>
                    ) : projects.length === 0 ? (
                        <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-zinc-300 bg-white p-10 text-center dark:border-zinc-700 dark:bg-zinc-900/60">
                            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-500/10 text-blue-500">
                                <FileCode className="h-8 w-8" aria-hidden />
                            </div>
                            <h3 className="text-lg font-bold text-zinc-800 dark:text-zinc-100">{t("no_projects")}</h3>
                            <p className="mb-6 max-w-sm text-zinc-500 dark:text-zinc-400">{t("start_coding")}</p>
                            <button type="button" onClick={() => setShowLangModal(true)} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 font-bold text-white transition hover:bg-blue-700">
                                <Plus className="h-4 w-4" aria-hidden />
                                {t("first_project")}
                            </button>
                        </div>
                    ) : visibleProjects.length === 0 ? (
                        <p className="rounded-2xl border border-dashed border-zinc-300 p-6 text-center text-sm text-zinc-500 dark:border-zinc-700">{tx(C.noMatch)}</p>
                    ) : (
                        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                            {visibleProjects.map((p, index) => {
                                const id = String(p.id);
                                const multi = p.isMultiTab || p.lang === "multi";
                                const logo = getLanguage(normalizeLanguageId(p.lang) ?? "")?.icon ?? "/languages/plaintext.svg";
                                return (
                                    <motion.div
                                        key={id}
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: Math.min(index, 8) * 0.04, duration: 0.3 }}
                                        className={`group relative rounded-2xl border border-zinc-200 bg-white p-5 transition hover:-translate-y-0.5 hover:border-blue-500/60 hover:shadow-lg hover:shadow-blue-500/5 dark:border-white/10 dark:bg-zinc-900 ${openMenuId === id ? "z-30" : ""}`}
                                    >
                                        <div className="mb-4 flex items-start justify-between">
                                            <button type="button" onClick={() => openCodeProject(p)} className="relative flex h-11 w-11 items-center justify-center overflow-hidden rounded-xl bg-zinc-100 dark:bg-zinc-800" aria-label={p.name}>
                                                {multi ? (
                                                    <FolderOpen className="h-6 w-6 text-blue-500" aria-hidden />
                                                ) : (
                                                    <>
                                                        <span className="text-xs font-bold uppercase text-blue-600 dark:text-blue-400">{p.lang.substring(0, 2)}</span>
                                                        <OptimizedImage
                                                            src={logo}
                                                            alt=""
                                                            className="absolute h-7 w-7 bg-zinc-100 object-contain dark:bg-zinc-800"
                                                            onError={(event) => { event.currentTarget.style.display = "none"; }}
                                                        />
                                                    </>
                                                )}
                                            </button>

                                            <div className="relative" data-project-menu>
                                                <button
                                                    type="button"
                                                    onClick={() => setOpenMenuId(openMenuId === id ? null : id)}
                                                    className="rounded-full p-1.5 text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
                                                    aria-label={tx(C.projectMenu)}
                                                    aria-haspopup="menu"
                                                    aria-expanded={openMenuId === id}
                                                >
                                                    <MoreVertical className="h-4 w-4" aria-hidden />
                                                </button>
                                                <AnimatePresence>
                                                    {openMenuId === id && (
                                                        <motion.div
                                                            role="menu"
                                                            initial={{ opacity: 0, y: -4, scale: 0.97 }}
                                                            animate={{ opacity: 1, y: 0, scale: 1 }}
                                                            exit={{ opacity: 0, y: -4, scale: 0.97 }}
                                                            transition={{ duration: 0.12 }}
                                                            className="absolute end-0 top-full z-50 mt-1 w-52 overflow-hidden rounded-xl border border-zinc-200 bg-white py-1 shadow-2xl dark:border-zinc-700 dark:bg-zinc-800"
                                                        >
                                                            <button type="button" role="menuitem" onClick={() => void handleDownloadProject(p)} className="flex w-full items-center gap-3 px-4 py-2.5 text-start text-sm text-zinc-700 transition hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-700">
                                                                <Download className="h-4 w-4" aria-hidden />
                                                                {t("download_project")}
                                                            </button>
                                                            <button type="button" role="menuitem" onClick={() => void handleRenameProject(p)} className="flex w-full items-center gap-3 px-4 py-2.5 text-start text-sm text-zinc-700 transition hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-700">
                                                                <Pencil className="h-4 w-4" aria-hidden />
                                                                {t("rename_project")}
                                                            </button>
                                                            <button type="button" role="menuitem" onClick={() => openDeleteModal(p)} className="flex w-full items-center gap-3 px-4 py-2.5 text-start text-sm text-red-600 transition hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10">
                                                                <Trash2 className="h-4 w-4" aria-hidden />
                                                                {t("delete_project")}
                                                            </button>
                                                        </motion.div>
                                                    )}
                                                </AnimatePresence>
                                            </div>
                                        </div>
                                        <button type="button" onClick={() => openCodeProject(p)} className="block w-full text-start">
                                            <h3 className="mb-1 truncate text-lg font-bold transition group-hover:text-blue-500">{p.name}</h3>
                                            <p className="text-sm text-zinc-500 dark:text-zinc-400">{t("edited")} {p.date}</p>
                                        </button>
                                    </motion.div>
                                );
                            })}
                        </div>
                    )}
                </section>

                {/* Game projects */}
                <section className="pt-12" aria-labelledby="game-projects-title">
                    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                        <h2 id="game-projects-title" className="flex items-center gap-2 text-xl font-semibold"><Gamepad2 className="h-5 w-5 text-fuchsia-500" aria-hidden />{tx(C.gameProjects)}</h2>
                        <div className="flex flex-wrap items-center gap-2">
                            <Link href="/game-engine" className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-zinc-600 transition hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-white/5">
                                <Boxes className="h-4 w-4" aria-hidden />
                                {tx(C.engineHub)}
                            </Link>
                            <button type="button" onClick={openGameModal} className="inline-flex items-center gap-2 rounded-xl border border-fuchsia-500/30 px-4 py-2 text-sm font-semibold text-fuchsia-600 transition hover:bg-fuchsia-500/10 dark:text-fuchsia-300"><Plus className="h-4 w-4" aria-hidden />{tx(C.newGame)}</button>
                        </div>
                    </div>
                    {visibleGameError && !showGameModal && (
                        <div className="mb-4 flex items-start gap-2 rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-600 dark:text-red-300" role="alert">
                            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                            <span className="flex-1">{visibleGameError}</span>
                            <button type="button" onClick={() => setGameError("")} className="rounded p-0.5 hover:bg-red-500/10" aria-label={tx(C.close)}><X className="h-4 w-4" aria-hidden /></button>
                        </div>
                    )}
                    {isGameLoading ? (
                        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3" aria-busy="true" aria-label={tx(C.loadingGame)}>
                            {[0, 1, 2].map((item) => <div key={item} className="h-44 animate-pulse rounded-2xl border border-zinc-200 bg-white dark:border-white/10 dark:bg-zinc-900" />)}
                        </div>
                    ) : gameProjects.length === 0 ? (
                        <button type="button" onClick={openGameModal} className="group flex w-full flex-col items-center justify-center rounded-3xl border border-dashed border-fuchsia-500/30 bg-gradient-to-br from-fuchsia-500/5 to-violet-500/5 p-10 text-center transition hover:border-fuchsia-500/60">
                            <span className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-fuchsia-500/10 text-fuchsia-500 transition group-hover:scale-105"><Boxes className="h-8 w-8" aria-hidden /></span>
                            <strong className="text-lg">{tx(C.firstScene)}</strong>
                            <span className="mt-2 max-w-lg text-sm text-zinc-500 dark:text-zinc-400">{tx(C.firstSceneDesc)}</span>
                        </button>
                    ) : visibleGames.length === 0 ? (
                        <p className="rounded-2xl border border-dashed border-zinc-300 p-6 text-center text-sm text-zinc-500 dark:border-zinc-700">{tx(C.noMatch)}</p>
                    ) : (
                        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                            {visibleGames.map((project, index) => {
                                const updated = formatDate(project.updatedAt ?? project.createdAt, locale);
                                const openProject = () => router.push(`/game-engine?id=${encodeURIComponent(project.id)}`);
                                return (
                                    <motion.article
                                        key={project.id}
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: Math.min(index, 8) * 0.04, duration: 0.3 }}
                                        className="group relative overflow-hidden rounded-2xl border border-zinc-200 bg-white p-5 transition hover:-translate-y-0.5 hover:border-fuchsia-500/50 hover:shadow-xl hover:shadow-fuchsia-500/10 dark:border-white/10 dark:bg-zinc-900"
                                    >
                                        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-fuchsia-500 via-violet-500 to-blue-500 opacity-70" />
                                        <div className="mb-5 flex items-start justify-between">
                                            <button type="button" onClick={openProject} className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-fuchsia-500/15 to-violet-500/15 text-fuchsia-500" aria-label={tx({ TR: "{name} projesini oyun motorunda aç", EN: "Open {name} in the game engine" }, { name: project.name })}>
                                                {project.dimension === "2d" ? <Box className="h-6 w-6" aria-hidden /> : <Boxes className="h-6 w-6" aria-hidden />}
                                            </button>
                                            <button type="button" onClick={() => void handleDeleteGameProject(project)} className="rounded-lg p-2 text-zinc-400 transition hover:bg-red-500/10 hover:text-red-500" aria-label={tx({ TR: "{name} projesini sil", EN: "Delete {name}" }, { name: project.name })}><Trash2 className="h-4 w-4" aria-hidden /></button>
                                        </div>
                                        <button type="button" onClick={openProject} className="block w-full text-start">
                                            <h3 className="truncate text-lg font-bold transition group-hover:text-fuchsia-500">{project.name}</h3>
                                            <p className="mt-1 line-clamp-2 min-h-10 text-sm text-zinc-500 dark:text-zinc-400">{project.description || tx({ TR: "{dimension} Hanogt oyun sahnesi", EN: "{dimension} Hanogt game scene" }, { dimension: project.dimension.toUpperCase() })}</p>
                                            <div className="mt-5 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                                                <span className="rounded-full bg-fuchsia-500/10 px-2.5 py-1 font-semibold text-fuchsia-600 dark:text-fuchsia-300">{project.dimension.toUpperCase()}</span>
                                                <span>{project.objectCount ?? 0} {tx(C.objects)}</span>
                                                <span aria-hidden>•</span>
                                                <span>{project.scriptCount ?? 0} {tx(C.scripts)}</span>
                                                {updated && <span className="ms-auto">{tx(C.updated)} {updated}</span>}
                                            </div>
                                        </button>
                                    </motion.article>
                                );
                            })}
                        </div>
                    )}
                </section>
            </main>

            <SiteFooter />

            <AnimatePresence>
                {showProjectTypeModal && (
                    <Dialog key="type" labelledBy="project-type-title" onClose={() => setShowProjectTypeModal(false)}>
                        <div className="mb-6 flex items-start justify-between gap-4">
                            <div>
                                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-blue-500">{tx(C.newWorkspace)}</p>
                                <h2 id="project-type-title" className="mt-1 text-2xl font-bold">{tx(C.chooseType)}</h2>
                            </div>
                            <CloseButton label={tx(C.close)} onClick={() => setShowProjectTypeModal(false)} />
                        </div>
                        <div className="grid gap-4 sm:grid-cols-2">
                            <button type="button" onClick={() => { setShowProjectTypeModal(false); setShowLangModal(true); }} className="group rounded-2xl border border-zinc-200 p-5 text-start transition hover:-translate-y-0.5 hover:border-blue-500 hover:bg-blue-500/5 dark:border-zinc-700">
                                <Code2 className="mb-4 h-8 w-8 text-blue-500" aria-hidden />
                                <strong className="block text-lg">{tx(C.codeCard)}</strong>
                                <span className="mt-2 block text-sm leading-6 text-zinc-500">{tx(C.codeTypeDesc)}</span>
                            </button>
                            <button type="button" onClick={openGameModal} className="group rounded-2xl border border-zinc-200 p-5 text-start transition hover:-translate-y-0.5 hover:border-fuchsia-500 hover:bg-fuchsia-500/5 dark:border-zinc-700">
                                <Gamepad2 className="mb-4 h-8 w-8 text-fuchsia-500" aria-hidden />
                                <strong className="block text-lg">{tx(C.gameCard)}</strong>
                                <span className="mt-2 block text-sm leading-6 text-zinc-500">{tx(C.gameTypeDesc)}</span>
                            </button>
                        </div>
                    </Dialog>
                )}

                {showGameModal && (
                    <Dialog key="game" labelledBy="game-project-title" onClose={() => setShowGameModal(false)}>
                        <div className="mb-6 flex items-start justify-between">
                            <div>
                                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-fuchsia-500">Hanogt Engine</p>
                                <h2 id="game-project-title" className="mt-1 text-2xl font-bold">{tx(C.createGame)}</h2>
                            </div>
                            <CloseButton label={tx(C.close)} onClick={() => setShowGameModal(false)} />
                        </div>
                        <div className="mb-5 flex gap-3 rounded-2xl border border-fuchsia-500/20 bg-fuchsia-500/5 p-4 text-sm leading-6 text-zinc-700 dark:text-zinc-300">
                            <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-fuchsia-500" aria-hidden />
                            <p>{tx(C.scriptNote)}</p>
                        </div>
                        <form onSubmit={(event) => { event.preventDefault(); void handleCreateGameProject(); }}>
                            <label className="mb-4 block">
                                <span className="mb-2 block text-sm font-semibold">{tx(C.projectName)}</span>
                                <input value={gameName} onChange={(event) => setGameName(event.target.value)} maxLength={80} autoFocus placeholder={tx(C.projectNamePlaceholder)} className="w-full rounded-xl border border-zinc-300 bg-zinc-50 px-4 py-3 outline-none transition focus:border-fuchsia-500 focus:ring-4 focus:ring-fuchsia-500/10 dark:border-zinc-700 dark:bg-zinc-800" />
                            </label>
                            <label className="mb-5 block">
                                <span className="mb-2 block text-sm font-semibold">{tx(C.shortDesc)} <span className="font-normal text-zinc-400">{tx(C.optional)}</span></span>
                                <textarea value={gameDescription} onChange={(event) => setGameDescription(event.target.value)} maxLength={300} rows={3} placeholder={tx(C.descPlaceholder)} className="w-full resize-none rounded-xl border border-zinc-300 bg-zinc-50 px-4 py-3 outline-none transition focus:border-fuchsia-500 focus:ring-4 focus:ring-fuchsia-500/10 dark:border-zinc-700 dark:bg-zinc-800" />
                            </label>
                            <fieldset className="mb-5">
                                <legend className="mb-2 text-sm font-semibold">{tx(C.sceneType)}</legend>
                                <div className="grid grid-cols-2 gap-3">
                                    {(["2d", "3d"] as const).map((dimension) => (
                                        <button type="button" key={dimension} onClick={() => setGameDimension(dimension)} aria-pressed={gameDimension === dimension} className={`flex items-center justify-center gap-2 rounded-xl border px-4 py-3 font-bold uppercase transition ${gameDimension === dimension ? "border-fuchsia-500 bg-fuchsia-500/10 text-fuchsia-600 dark:text-fuchsia-300" : "border-zinc-300 hover:border-zinc-400 dark:border-zinc-700"}`}>
                                            {dimension === "2d" ? <Box className="h-5 w-5" aria-hidden /> : <Boxes className="h-5 w-5" aria-hidden />}
                                            {dimension}
                                        </button>
                                    ))}
                                </div>
                            </fieldset>
                            {visibleGameError && <p className="mb-4 rounded-xl bg-red-500/10 p-3 text-sm text-red-600 dark:text-red-300" role="alert">{visibleGameError}</p>}
                            <div className="flex flex-col-reverse items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
                                <Link href="/game-engine" className="text-center text-sm font-medium text-zinc-500 underline-offset-4 transition hover:text-fuchsia-500 hover:underline sm:text-start">{tx(C.templatesHint)}</Link>
                                <div className="flex flex-col-reverse gap-3 sm:flex-row">
                                    <button type="button" onClick={() => setShowGameModal(false)} className="rounded-xl px-5 py-3 font-semibold text-zinc-500 transition hover:bg-zinc-100 dark:hover:bg-zinc-800">{tx(C.cancel)}</button>
                                    <button type="submit" disabled={isCreatingGame || gameName.trim().length < 2} className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-fuchsia-600 to-violet-600 px-6 py-3 font-bold text-white shadow-lg shadow-fuchsia-500/20 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50">
                                        {isCreatingGame ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> : <Gamepad2 className="h-5 w-5" aria-hidden />}
                                        {isCreatingGame ? tx(C.creating) : tx(C.openEngine)}
                                    </button>
                                </div>
                            </div>
                        </form>
                    </Dialog>
                )}

                {showLangModal && (
                    <Dialog key="lang" labelledBy="language-title" onClose={() => setShowLangModal(false)} wide>
                        <div className="mb-6 flex items-center justify-between">
                            <h2 id="language-title" className="text-2xl font-bold">{t("select_language")}</h2>
                            <CloseButton label={tx(C.close)} onClick={() => setShowLangModal(false)} />
                        </div>
                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                            {CODE_LANGUAGES.map((lang) => (
                                <button
                                    type="button"
                                    key={lang.id}
                                    onClick={() => handleCreateScript(lang)}
                                    className="flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-transparent bg-zinc-50 p-5 transition hover:-translate-y-0.5 hover:border-blue-500 hover:bg-zinc-100 dark:bg-zinc-800 dark:hover:bg-zinc-700"
                                >
                                    <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-full bg-white p-2 shadow-md dark:bg-zinc-900">
                                        <OptimizedImage src={lang.icon} alt="" className="h-full w-full object-contain" />
                                    </div>
                                    <span className="font-semibold text-zinc-700 dark:text-zinc-200">{lang.name}</span>
                                    <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-400 dark:bg-zinc-900">{tx(ENGINE_LABELS[lang.engine].short)}</span>
                                </button>
                            ))}
                        </div>
                    </Dialog>
                )}
            </AnimatePresence>

            {projectToDelete && (
                <DeleteProjectModal
                    projectName={projectToDelete.name}
                    onConfirm={() => void handleDeleteProject()}
                    onCancel={() => setProjectToDelete(null)}
                />
            )}
        </div>
    );
}
