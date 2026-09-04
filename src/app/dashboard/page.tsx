"use client";

import OptimizedImage from "@/components/OptimizedImage";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Plus, FileCode, Clock, MoreVertical, Download, Trash2, FolderOpen, Pencil, Gamepad2, Code2, Box, Boxes, Loader2, AlertTriangle, ArrowRight } from "lucide-react";
import Header from "@/components/Header";
import PrivacyPolicyModal from "@/components/PrivacyPolicyModal";
import DeleteProjectModal from "@/components/DeleteProjectModal";
import { useSession } from "next-auth/react";
import { useI18n } from "@/lib/i18n";
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

const LANGUAGES = [
    { name: "Python", ext: "py", color: "bg-blue-500", version: "3.12.0", logo: "/languages/python.png" },
    { name: "CSharp", ext: "cs", color: "bg-purple-600", version: ".NET 8.0", logo: "/languages/csharp.png" },
    { name: "C++", ext: "cpp", color: "bg-blue-700", version: "GCC 13.2", logo: "/languages/cpp.png" },
    { name: "Java", ext: "java", color: "bg-red-500", version: "JDK 21", logo: "/languages/java.png" },
    { name: "Javascript", ext: "js", color: "bg-yellow-400 text-black", version: "Node 20.9", logo: "/languages/javascript.png" },
    { name: "TypeScript", ext: "ts", color: "bg-blue-600", version: "5.3.0", logo: "/languages/typescript.png" },
    { name: "HTML", ext: "html", color: "bg-orange-500", version: "HTML5", logo: "/languages/html.png" },
    { name: "CSS", ext: "css", color: "bg-blue-500", version: "CSS3", logo: "/languages/css.png" },
    { name: "PHP", ext: "php", color: "bg-indigo-500", version: "8.3.0", logo: "/languages/php.png" },
    { name: "Go", ext: "go", color: "bg-cyan-500", version: "1.21.4", logo: "/languages/go.png" },
    { name: "Swift", ext: "swift", color: "bg-orange-600", version: "5.9.1", logo: "/languages/swift.png" },
    { name: "Ruby", ext: "rb", color: "bg-red-600", version: "3.2.2", logo: "/languages/ruby.png" },
    { name: "Rust", ext: "rs", color: "bg-orange-700", version: "1.74.0", logo: "/languages/rust.png" },
    { name: "Kotlin", ext: "kt", color: "bg-purple-500", version: "1.9.21", logo: "/languages/kotlin.png" },
    { name: "SQL", ext: "sql", color: "bg-teal-500", version: "Postgres 16", logo: "/languages/sql.png" },
    { name: "Lua", ext: "lua", color: "bg-blue-400", version: "5.4.6", logo: "/languages/lua.png" },
];

export default function DashboardPage() {
    const router = useRouter();
    const [showLangModal, setShowLangModal] = useState(false);
    const [showProjectTypeModal, setShowProjectTypeModal] = useState(false);
    const [showGameModal, setShowGameModal] = useState(false);
    const [projects, setProjects] = useState<DashboardProject[]>([]);
    const [gameProjects, setGameProjects] = useState<GameProjectSummary[]>([]);
    const [showPrivacyModal, setShowPrivacyModal] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [isGameLoading, setIsGameLoading] = useState(true);
    const [isCreatingGame, setIsCreatingGame] = useState(false);
    const [gameName, setGameName] = useState("");
    const [gameDescription, setGameDescription] = useState("");
    const [gameDimension, setGameDimension] = useState<"2d" | "3d">("3d");
    const [gameError, setGameError] = useState("");
    const [openMenuId, setOpenMenuId] = useState<string | null>(null);
    const [projectToDelete, setProjectToDelete] = useState<DashboardProject | null>(null);

    const { data: session } = useSession();
    const { t } = useI18n();

    useEffect(() => {
        // Check if privacy policy was accepted
        const privacyAccepted = localStorage.getItem("hanogt_privacy_accepted");
        if (!privacyAccepted && session?.user) {
            setShowPrivacyModal(true);
        }
    }, [session]);

    // Online status is now managed by Header component (always mounted)

    useEffect(() => {
        const loadProjects = async () => {
            if (session?.user?.email) {
                setIsLoading(true);
                try {
                    // Try to load from cloud first
                    const cloudProjects = await getProjectsFromCloud(session.user.email);
                    if (cloudProjects.length > 0) {
                        setProjects(cloudProjects);
                    } else {
                        // Fallback to localStorage
                        const localProjects = getProjects(session.user.email);
                        setProjects(localProjects);
                    }
                } catch (error) {
                    console.error("Error loading projects:", error);
                    // Fallback to localStorage on error
                    const localProjects = getProjects(session.user.email);
                    setProjects(localProjects);
                } finally {
                    setIsLoading(false);
                }
            } else {
                setProjects([]);
                setIsLoading(false);
            }
        };
        loadProjects();
    }, [session]);

    useEffect(() => {
        if (!session?.user?.email) {
            setGameProjects([]);
            setIsGameLoading(false);
            return;
        }
        let cancelled = false;
        setIsGameLoading(true);
        fetch("/api/game-projects", { cache: "no-store" })
            .then(async (response) => {
                const payload = await response.json() as { projects?: GameProjectSummary[]; error?: string };
                if (!response.ok) throw new Error(payload.error || "Oyun projeleri yüklenemedi.");
                if (!cancelled) setGameProjects(payload.projects || []);
            })
            .catch((error) => {
                if (!cancelled) setGameError(error instanceof Error ? error.message : "Oyun projeleri yüklenemedi.");
            })
            .finally(() => { if (!cancelled) setIsGameLoading(false); });
        return () => { cancelled = true; };
    }, [session?.user?.email]);

    const handleCreateScript = (lang: { name: string; ext: string }) => {
        // Use extension for URL to avoid + encoding issues (C++ becomes cpp)
        router.push(`/editor?lang=${lang.ext}`);
    };

    const handleCreateGameProject = async () => {
        const name = gameName.trim();
        if (name.length < 2) {
            setGameError("Oyun projesi adı en az 2 karakter olmalıdır.");
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
            const payload = await response.json() as { project?: GameProjectSummary; error?: string };
            if (!response.ok || !payload.project) throw new Error(payload.error || "Oyun projesi oluşturulamadı.");
            setGameProjects((current) => [payload.project!, ...current]);
            setShowGameModal(false);
            setGameName("");
            setGameDescription("");
            router.push(`/game-engine?id=${encodeURIComponent(payload.project.id)}`);
        } catch (error) {
            setGameError(error instanceof Error ? error.message : "Oyun projesi oluşturulamadı.");
        } finally {
            setIsCreatingGame(false);
        }
    };

    const handleDeleteGameProject = async (project: GameProjectSummary) => {
        if (!window.confirm(`“${project.name}” oyun projesi ve scriptleri kalıcı olarak silinsin mi?`)) return;
        try {
            const response = await fetch(`/api/game-projects/${encodeURIComponent(project.id)}`, { method: "DELETE" });
            const payload = await response.json().catch(() => ({})) as { error?: string };
            if (!response.ok) throw new Error(payload.error || "Oyun projesi silinemedi.");
            setGameProjects((current) => current.filter((item) => item.id !== project.id));
        } catch (error) {
            setGameError(error instanceof Error ? error.message : "Oyun projesi silinemedi.");
        }
    };

    const handleDownloadProject = async (project: DashboardProject) => {
        const extensions: Record<string, string> = {
            python: "py", javascript: "js", typescript: "ts", csharp: "cs",
            cpp: "cpp", java: "java", html: "html", css: "css",
            php: "php", go: "go", swift: "swift", ruby: "rb",
            rust: "rs", kotlin: "kt", sql: "sql", lua: "lua",
        };

        if (project.isMultiTab || project.lang === "multi") {
            // Multi-tab project - download as ZIP
            try {
                const JSZip = (await import('jszip')).default;
                const zip = new JSZip();
                const tabsData: LegacyTab[] = project.files?.length
                    ? project.files
                    : JSON.parse(project.code) as LegacyTab[];

                tabsData.forEach((tab, index) => {
                    const ext = extensions[tab.lang.toLowerCase()] || "txt";
                    const fileName = `${index + 1}_${tab.name.replace(/[^a-zA-Z0-9]/g, "_")}.${ext}`;
                    zip.file(fileName, tab.code);
                });

                const content = await zip.generateAsync({ type: 'blob' });
                const element = document.createElement("a");
                const objectUrl = URL.createObjectURL(content);
                element.href = objectUrl;
                element.download = `${project.name.replace(/[^a-zA-Z0-9]/g, "_")}.zip`;
                document.body.appendChild(element);
                element.click();
                document.body.removeChild(element);
                URL.revokeObjectURL(objectUrl);
            } catch (error) {
                console.error("Error creating ZIP:", error);
                alert("ZIP oluşturulamadı");
            }
        } else {
            // Single-tab project - download as file
            const ext = extensions[project.lang.toLowerCase()] || "txt";
            const element = document.createElement("a");
            const file = new Blob([project.code || "// Empty project"], { type: "text/plain" });
            const objectUrl = URL.createObjectURL(file);
            element.href = objectUrl;
            element.download = `${project.name.replace(/[^a-zA-Z0-9]/g, "_")}.${ext}`;
            document.body.appendChild(element);
            element.click();
            document.body.removeChild(element);
            URL.revokeObjectURL(objectUrl);
        }
        setOpenMenuId(null);
    };

    const handleDeleteProject = async (selectedProject = projectToDelete) => {
        if (!selectedProject || !session?.user?.email) return;

        try {
            await deleteProjectFromCloud(String(selectedProject.id));
            deleteProject(session.user.email, Number(selectedProject.id));
            setProjects(projects.filter(p => p.id !== selectedProject.id));
        } catch (error) {
            console.error("Error deleting project:", error);
        }
        setProjectToDelete(null);
    };

    const handleRenameProject = async (project: DashboardProject) => {
        const newName = prompt(t("rename_project_prompt") || "Yeni proje ismi girin:", project.name);
        if (!newName || newName === project.name) {
            setOpenMenuId(null);
            return;
        }

        if (session?.user?.email) {
            await renameProject(session.user.email, project.id, newName);
            // Update local state
            setProjects(projects.map(p =>
                p.id === project.id ? { ...p, name: newName } : p
            ));
        }
        setOpenMenuId(null);
    };

    const openDeleteModal = (project: DashboardProject) => {
        const skipConfirm = localStorage.getItem("hanogt_skip_delete_confirm");
        if (skipConfirm === "true") {
            void handleDeleteProject(project);
        } else {
            setProjectToDelete(project);
        }
        setOpenMenuId(null);
    };

    return (
        <div className="min-h-screen bg-zinc-50 dark:bg-black text-zinc-900 dark:text-white transition-colors">
            {/* Privacy Policy Modal */}
            {showPrivacyModal && (
                <PrivacyPolicyModal onAccept={() => setShowPrivacyModal(false)} />
            )}

            <Header />

            <main className="pt-24 px-6 max-w-7xl mx-auto">
                <div className="flex justify-between items-center mb-10">
                    <div>
                        <h1 className="text-3xl font-bold">{t("dashboard_title") || "Gösterge Paneli"}</h1>
                        <p className="text-zinc-500 dark:text-zinc-400">{t("dashboard_desc")}</p>
                    </div>
                    <button
                        onClick={() => setShowProjectTypeModal(true)}
                        className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-bold shadow-lg flex items-center gap-2 transition-all"
                    >
                        <Plus className="w-5 h-5" />
                        {t("create_project")}
                    </button>
                </div>

                <div className="mb-8 grid gap-4 md:grid-cols-2">
                    <button onClick={() => setShowLangModal(true)} className="group flex items-center gap-4 rounded-2xl border border-blue-500/20 bg-gradient-to-br from-blue-500/10 to-cyan-500/5 p-5 text-left transition hover:-translate-y-0.5 hover:border-blue-500/50 hover:shadow-lg hover:shadow-blue-500/10">
                        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-lg shadow-blue-600/20"><Code2 className="h-6 w-6" /></span>
                        <span><strong className="block text-lg">Kod projesi</strong><span className="text-sm text-zinc-500 dark:text-zinc-400">16 dil, çoklu dosya ve tek tuşla paralel çalıştırma</span></span>
                        <ArrowRight className="ml-auto h-5 w-5 text-blue-500 transition group-hover:translate-x-1" />
                    </button>
                    <button onClick={() => { setGameError(""); setShowGameModal(true); }} className="group flex items-center gap-4 rounded-2xl border border-fuchsia-500/20 bg-gradient-to-br from-fuchsia-500/10 to-violet-500/5 p-5 text-left transition hover:-translate-y-0.5 hover:border-fuchsia-500/50 hover:shadow-lg hover:shadow-fuchsia-500/10">
                        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-fuchsia-600 to-violet-600 text-white shadow-lg shadow-fuchsia-600/20"><Gamepad2 className="h-6 w-6" /></span>
                        <span><strong className="block text-lg">Oyun projesi</strong><span className="text-sm text-zinc-500 dark:text-zinc-400">Nesne-bileşen tabanlı 2D/3D sahne motoru</span></span>
                        <ArrowRight className="ml-auto h-5 w-5 text-fuchsia-500 transition group-hover:translate-x-1" />
                    </button>
                </div>

                {/* Code projects */}
                <section>
                    <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                        <Clock className="w-5 h-5 text-zinc-500" />
                        Kod Projeleri
                    </h2>

                    {isLoading ? (
                        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3" aria-label="Kod projeleri yükleniyor">
                            {[0, 1, 2].map((item) => <div key={item} className="h-36 animate-pulse rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900" />)}
                        </div>
                    ) : projects.length === 0 ? (
                        <div className="flex flex-col items-center justify-center p-10 bg-white dark:bg-zinc-900 rounded-2xl border border-dashed border-zinc-300 dark:border-zinc-700 text-center">
                            <div className="w-16 h-16 bg-zinc-100 dark:bg-zinc-800 rounded-full flex items-center justify-center mb-4">
                                <FileCode className="w-8 h-8 text-zinc-400" />
                            </div>
                            <h3 className="text-lg font-bold text-zinc-800 dark:text-zinc-200">{t("no_projects")}</h3>
                            <p className="text-zinc-500 dark:text-zinc-400 mb-6 max-w-sm">
                                {t("start_coding")}
                            </p>
                            <button
                                onClick={() => setShowLangModal(true)}
                                className="text-blue-600 hover:text-blue-700 font-bold"
                            >
                                + {t("first_project")}
                            </button>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {projects.map((p) => (
                                <div
                                    key={p.id}
                                    className="bg-white dark:bg-zinc-900 p-5 rounded-2xl border border-zinc-200 dark:border-zinc-800 hover:border-blue-500 dark:hover:border-blue-500 transition-all group relative"
                                >
                                    <div className="flex justify-between items-start mb-4">
                                        <div
                                            className="relative w-10 h-10 rounded-lg bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center cursor-pointer overflow-hidden"
                                            onClick={() => router.push(`/editor?lang=${encodeURIComponent(p.lang)}&id=${encodeURIComponent(String(p.id))}`)}
                                        >
                                            {p.isMultiTab || p.lang === "multi" ? (
                                                <FolderOpen className="w-6 h-6 text-blue-500" />
                                            ) : (
                                                <>
                                                    <span className="text-xs font-bold uppercase text-blue-600 dark:text-blue-400">{p.lang.substring(0, 2)}</span>
                                                    <OptimizedImage
                                                        src={LANGUAGES.find(l => l.name.toLowerCase() === p.lang.toLowerCase())?.logo || `/languages/${encodeURIComponent(p.lang.toLowerCase())}.png`}
                                                        alt={p.lang}
                                                        className="absolute h-7 w-7 bg-zinc-100 object-contain dark:bg-zinc-800"
                                                        onError={(event) => { event.currentTarget.style.display = "none"; }}
                                                    />
                                                </>
                                            )}
                                        </div>

                                        {/* Three Dots Menu */}
                                        <div className="relative">
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setOpenMenuId(openMenuId === String(p.id) ? null : String(p.id));
                                                }}
                                                className="p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full"
                                            >
                                                <MoreVertical className="w-4 h-4 text-zinc-400" />
                                            </button>

                                            {/* Dropdown Menu */}
                                            {openMenuId === String(p.id) && (
                                                <div className="absolute right-0 top-full mt-1 w-48 bg-white dark:bg-zinc-800 rounded-xl shadow-2xl border border-zinc-200 dark:border-zinc-700 overflow-hidden z-50">
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            handleDownloadProject(p);
                                                        }}
                                                        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors text-zinc-700 dark:text-zinc-300"
                                                    >
                                                        <Download className="w-4 h-4" />
                                                        {t("download_project") || "Projeyi İndir"}
                                                    </button>
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            handleRenameProject(p);
                                                        }}
                                                        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors text-zinc-700 dark:text-zinc-300"
                                                    >
                                                        <Pencil className="w-4 h-4" />
                                                        {t("rename_project") || "İsmini Değiştir"}
                                                    </button>
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            openDeleteModal(p);
                                                        }}
                                                        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors text-red-600"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                        {t("delete_project") || "Projeyi Sil"}
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                    <div onClick={() => router.push(`/editor?lang=${encodeURIComponent(p.lang)}&id=${encodeURIComponent(String(p.id))}`)} className="cursor-pointer">
                                        <h3 className="font-bold text-lg mb-1 group-hover:text-blue-500 transition-colors truncate">{p.name}</h3>
                                        <p className="text-sm text-zinc-500 dark:text-zinc-400">{t("edited") || "Düzenlendi"} {p.date}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </section>

                <section className="pb-28 pt-12">
                    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                        <h2 className="flex items-center gap-2 text-xl font-semibold"><Gamepad2 className="h-5 w-5 text-fuchsia-500" />Oyun Projeleri</h2>
                        <button onClick={() => { setGameError(""); setShowGameModal(true); }} className="inline-flex items-center gap-2 rounded-xl border border-fuchsia-500/30 px-4 py-2 text-sm font-semibold text-fuchsia-600 transition hover:bg-fuchsia-500/10 dark:text-fuchsia-300"><Plus className="h-4 w-4" />Yeni oyun projesi</button>
                    </div>
                    {gameError && <div className="mb-4 flex items-start gap-2 rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-600 dark:text-red-300" role="alert"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{gameError}</div>}
                    {isGameLoading ? (
                        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3" aria-label="Oyun projeleri yükleniyor">
                            {[0, 1, 2].map((item) => <div key={item} className="h-44 animate-pulse rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900" />)}
                        </div>
                    ) : gameProjects.length === 0 ? (
                        <button onClick={() => setShowGameModal(true)} className="group flex w-full flex-col items-center justify-center rounded-3xl border border-dashed border-fuchsia-500/30 bg-gradient-to-br from-fuchsia-500/5 to-violet-500/5 p-10 text-center transition hover:border-fuchsia-500/60">
                            <span className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-fuchsia-500/10 text-fuchsia-500 transition group-hover:scale-105"><Boxes className="h-8 w-8" /></span>
                            <strong className="text-lg">İlk oyun sahneni oluştur</strong>
                            <span className="mt-2 max-w-lg text-sm text-zinc-500 dark:text-zinc-400">2D veya 3D çalışma alanını seç; nesneleri, bileşenleri ve C#/C++ scriptlerini tek yerde yönet.</span>
                        </button>
                    ) : (
                        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                            {gameProjects.map((project) => (
                                <article key={project.id} className="group relative overflow-hidden rounded-2xl border border-zinc-200 bg-white p-5 transition hover:-translate-y-0.5 hover:border-fuchsia-500/50 hover:shadow-xl hover:shadow-fuchsia-500/10 dark:border-zinc-800 dark:bg-zinc-900">
                                    <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-fuchsia-500 via-violet-500 to-blue-500 opacity-70" />
                                    <div className="mb-5 flex items-start justify-between">
                                        <button onClick={() => router.push(`/game-engine?id=${encodeURIComponent(project.id)}`)} className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-fuchsia-500/15 to-violet-500/15 text-fuchsia-500" aria-label={`${project.name} oyun motorunda aç`}>
                                            {project.dimension === "2d" ? <Box className="h-6 w-6" /> : <Boxes className="h-6 w-6" />}
                                        </button>
                                        <button onClick={() => void handleDeleteGameProject(project)} className="rounded-lg p-2 text-zinc-400 transition hover:bg-red-500/10 hover:text-red-500" aria-label={`${project.name} projesini sil`}><Trash2 className="h-4 w-4" /></button>
                                    </div>
                                    <button onClick={() => router.push(`/game-engine?id=${encodeURIComponent(project.id)}`)} className="block w-full text-left">
                                        <h3 className="truncate text-lg font-bold transition group-hover:text-fuchsia-500">{project.name}</h3>
                                        <p className="mt-1 line-clamp-2 min-h-10 text-sm text-zinc-500 dark:text-zinc-400">{project.description || `${project.dimension.toUpperCase()} Hanogt oyun sahnesi`}</p>
                                        <div className="mt-5 flex items-center gap-2 text-xs text-zinc-500"><span className="rounded-full bg-fuchsia-500/10 px-2.5 py-1 font-semibold text-fuchsia-600 dark:text-fuchsia-300">{project.dimension.toUpperCase()}</span><span>{project.objectCount ?? 0} nesne</span><span>•</span><span>{project.scriptCount ?? 0} script</span></div>
                                    </button>
                                </article>
                            ))}
                        </div>
                    )}
                </section>
            </main>

            {showProjectTypeModal && (
                <div className="fixed inset-0 z-[70] flex items-center justify-center bg-zinc-950/70 p-4 backdrop-blur-md" role="dialog" aria-modal="true" aria-labelledby="project-type-title">
                    <div className="w-full max-w-2xl rounded-3xl border border-white/10 bg-white p-6 shadow-2xl dark:bg-zinc-900 sm:p-8">
                        <div className="mb-6 flex items-start justify-between gap-4"><div><p className="text-sm font-semibold uppercase tracking-[0.18em] text-blue-500">Yeni çalışma alanı</p><h2 id="project-type-title" className="mt-1 text-2xl font-bold">Proje türünü seç</h2></div><button onClick={() => setShowProjectTypeModal(false)} className="rounded-full p-2 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800" aria-label="Kapat"><Plus className="h-6 w-6 rotate-45" /></button></div>
                        <div className="grid gap-4 sm:grid-cols-2">
                            <button onClick={() => { setShowProjectTypeModal(false); setShowLangModal(true); }} className="group rounded-2xl border border-zinc-200 p-5 text-left transition hover:border-blue-500 hover:bg-blue-500/5 dark:border-zinc-700"><Code2 className="mb-4 h-8 w-8 text-blue-500" /><strong className="block text-lg">Kod Projesi</strong><span className="mt-2 block text-sm leading-6 text-zinc-500">Bir programlama dili seçerek Monaco kod editörünü aç.</span></button>
                            <button onClick={() => { setShowProjectTypeModal(false); setGameError(""); setShowGameModal(true); }} className="group rounded-2xl border border-zinc-200 p-5 text-left transition hover:border-fuchsia-500 hover:bg-fuchsia-500/5 dark:border-zinc-700"><Gamepad2 className="mb-4 h-8 w-8 text-fuchsia-500" /><strong className="block text-lg">Oyun Projesi</strong><span className="mt-2 block text-sm leading-6 text-zinc-500">2D/3D sahne, nesne hiyerarşisi ve bileşen tabanlı motoru aç.</span></button>
                        </div>
                    </div>
                </div>
            )}

            {showGameModal && (
                <div className="fixed inset-0 z-[75] flex items-center justify-center bg-zinc-950/75 p-4 backdrop-blur-md" role="dialog" aria-modal="true" aria-labelledby="game-project-title">
                    <div className="w-full max-w-xl rounded-3xl border border-white/10 bg-white p-6 shadow-2xl dark:bg-zinc-900 sm:p-8">
                        <div className="mb-6 flex items-start justify-between"><div><p className="text-sm font-semibold uppercase tracking-[0.18em] text-fuchsia-500">Hanogt Engine</p><h2 id="game-project-title" className="mt-1 text-2xl font-bold">Oyun projesi oluştur</h2></div><button onClick={() => setShowGameModal(false)} className="rounded-full p-2 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800" aria-label="Kapat"><Plus className="h-6 w-6 rotate-45" /></button></div>
                        <div className="mb-5 flex gap-3 rounded-2xl border border-amber-500/25 bg-amber-500/10 p-4 text-sm leading-6 text-amber-800 dark:text-amber-200"><AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" /><p>Oyun scriptleri şu an yalnızca <strong>C# ve C++</strong> destekler. Script düzenleme ve test işlemi kod editöründe açılır; sahneye buradan geri dönebilirsiniz.</p></div>
                        <label className="mb-4 block"><span className="mb-2 block text-sm font-semibold">Proje adı</span><input value={gameName} onChange={(event) => setGameName(event.target.value)} maxLength={80} autoFocus placeholder="Örn. Uzay Macerası" className="w-full rounded-xl border border-zinc-300 bg-zinc-50 px-4 py-3 outline-none transition focus:border-fuchsia-500 focus:ring-4 focus:ring-fuchsia-500/10 dark:border-zinc-700 dark:bg-zinc-800" /></label>
                        <label className="mb-5 block"><span className="mb-2 block text-sm font-semibold">Kısa açıklama <span className="font-normal text-zinc-400">(isteğe bağlı)</span></span><textarea value={gameDescription} onChange={(event) => setGameDescription(event.target.value)} maxLength={300} rows={3} placeholder="Oyunun fikrini ve hedefini yazın…" className="w-full resize-none rounded-xl border border-zinc-300 bg-zinc-50 px-4 py-3 outline-none transition focus:border-fuchsia-500 focus:ring-4 focus:ring-fuchsia-500/10 dark:border-zinc-700 dark:bg-zinc-800" /></label>
                        <fieldset className="mb-5"><legend className="mb-2 text-sm font-semibold">Sahne türü</legend><div className="grid grid-cols-2 gap-3">{(["2d", "3d"] as const).map((dimension) => <button type="button" key={dimension} onClick={() => setGameDimension(dimension)} className={`flex items-center justify-center gap-2 rounded-xl border px-4 py-3 font-bold uppercase transition ${gameDimension === dimension ? "border-fuchsia-500 bg-fuchsia-500/10 text-fuchsia-600 dark:text-fuchsia-300" : "border-zinc-300 hover:border-zinc-400 dark:border-zinc-700"}`}>{dimension === "2d" ? <Box className="h-5 w-5" /> : <Boxes className="h-5 w-5" />}{dimension}</button>)}</div></fieldset>
                        {gameError && <p className="mb-4 rounded-xl bg-red-500/10 p-3 text-sm text-red-600 dark:text-red-300" role="alert">{gameError}</p>}
                        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"><button onClick={() => setShowGameModal(false)} className="rounded-xl px-5 py-3 font-semibold text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800">Vazgeç</button><button onClick={() => void handleCreateGameProject()} disabled={isCreatingGame || gameName.trim().length < 2} className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-fuchsia-600 to-violet-600 px-6 py-3 font-bold text-white shadow-lg shadow-fuchsia-500/20 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50">{isCreatingGame ? <Loader2 className="h-5 w-5 animate-spin" /> : <Gamepad2 className="h-5 w-5" />}{isCreatingGame ? "Oluşturuluyor…" : "Motoru aç"}</button></div>
                    </div>
                </div>
            )}

            {/* Language Selection Modal */}
            {showLangModal && (
                <div className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-white dark:bg-zinc-900 rounded-3xl p-8 max-w-4xl w-full max-h-[90vh] overflow-y-auto shadow-2xl border border-zinc-200 dark:border-zinc-800">
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-2xl font-bold">{t("select_language") || "Bir Yazılım Dili Seç"}</h2>
                            <button
                                onClick={() => setShowLangModal(false)}
                                className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full"
                            >
                                <Plus className="w-6 h-6 rotate-45" />
                            </button>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                            {LANGUAGES.map((lang) => (
                                <button
                                    key={lang.name}
                                    onClick={() => handleCreateScript(lang)}
                                    className="flex flex-col items-center justify-center p-6 rounded-2xl bg-zinc-50 dark:bg-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-700 border-2 border-transparent hover:border-blue-500 transition-all gap-3"
                                >
                                    {/* Logo or Extension Circle */}
                                    {lang.logo ? (
                                        <div className="w-12 h-12 rounded-full overflow-hidden bg-white dark:bg-zinc-900 shadow-md flex items-center justify-center p-2">
                                            <OptimizedImage
                                                src={lang.logo}
                                                alt={`${lang.name} logo`}
                                                className="w-full h-full object-contain"
                                            />
                                        </div>
                                    ) : (
                                        <div className={`w-12 h-12 rounded-full ${lang.color} flex items-center justify-center text-white font-bold text-lg shadow-md`}>
                                            {lang.ext}
                                        </div>
                                    )}
                                    <span className="font-semibold text-zinc-700 dark:text-zinc-200">{lang.name}</span>
                                    <span className="text-xs text-zinc-400 font-mono bg-zinc-100 dark:bg-zinc-900 px-2 py-0.5 rounded-full">{lang.version}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* Delete Project Modal */}
            {projectToDelete && (
                <DeleteProjectModal
                    projectName={projectToDelete.name}
                    onConfirm={handleDeleteProject}
                    onCancel={() => setProjectToDelete(null)}
                />
            )}
        </div>
    );
}
