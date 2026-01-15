"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Plus, Code, FileCode, Clock, MoreVertical, Download, Trash2, FolderOpen, Pencil } from "lucide-react";
import Header from "@/components/Header";
import PrivacyPolicyModal from "@/components/PrivacyPolicyModal";
import DeleteProjectModal from "@/components/DeleteProjectModal";
import { useSession } from "next-auth/react";
import { useI18n } from "@/lib/i18n";
import { getProjects, getProjectsFromCloud, deleteProjectFromCloud, deleteProject, renameProject } from "@/lib/storage";

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
    const [projects, setProjects] = useState<any[]>([]);
    const [showPrivacyModal, setShowPrivacyModal] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [openMenuId, setOpenMenuId] = useState<string | null>(null);
    const [projectToDelete, setProjectToDelete] = useState<any>(null);

    const { data: session } = useSession();
    const { t } = useI18n();

    useEffect(() => {
        // Check if privacy policy was accepted
        const privacyAccepted = localStorage.getItem("hanogt_privacy_accepted");
        if (!privacyAccepted && session?.user) {
            setShowPrivacyModal(true);
        }
    }, [session]);

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

    const handleCreateScript = (lang: string) => {
        // Navigate to editor with selected language
        router.push(`/editor?lang=${lang.toLowerCase()}`);
    };

    const handleDownloadProject = async (project: any) => {
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
                const tabsData = JSON.parse(project.code);

                tabsData.forEach((tab: any, index: number) => {
                    const ext = extensions[tab.lang.toLowerCase()] || "txt";
                    const fileName = `${index + 1}_${tab.name.replace(/[^a-zA-Z0-9]/g, "_")}.${ext}`;
                    zip.file(fileName, tab.code);
                });

                const content = await zip.generateAsync({ type: 'blob' });
                const element = document.createElement("a");
                element.href = URL.createObjectURL(content);
                element.download = `${project.name.replace(/[^a-zA-Z0-9]/g, "_")}.zip`;
                document.body.appendChild(element);
                element.click();
                document.body.removeChild(element);
            } catch (error) {
                console.error("Error creating ZIP:", error);
                alert("ZIP oluşturulamadı");
            }
        } else {
            // Single-tab project - download as file
            const ext = extensions[project.lang.toLowerCase()] || "txt";
            const element = document.createElement("a");
            const file = new Blob([project.code || "// Empty project"], { type: "text/plain" });
            element.href = URL.createObjectURL(file);
            element.download = `${project.name.replace(/[^a-zA-Z0-9]/g, "_")}.${ext}`;
            document.body.appendChild(element);
            element.click();
            document.body.removeChild(element);
        }
        setOpenMenuId(null);
    };

    const handleDeleteProject = async () => {
        if (!projectToDelete || !session?.user?.email) return;

        try {
            await deleteProjectFromCloud(String(projectToDelete.id));
            deleteProject(session.user.email, Number(projectToDelete.id));
            setProjects(projects.filter(p => p.id !== projectToDelete.id));
        } catch (error) {
            console.error("Error deleting project:", error);
        }
        setProjectToDelete(null);
    };

    const handleRenameProject = async (project: any) => {
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

    const openDeleteModal = (project: any) => {
        const skipConfirm = localStorage.getItem("hanogt_skip_delete_confirm");
        if (skipConfirm === "true") {
            setProjectToDelete(project);
            handleDeleteProject();
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
                        onClick={() => setShowLangModal(true)}
                        className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-full font-bold shadow-lg flex items-center gap-2 transition-all"
                    >
                        <Plus className="w-5 h-5" />
                        {t("create_project")}
                    </button>
                </div>

                {/* Recent Scripts (Empty State) */}
                <section>
                    <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                        <Clock className="w-5 h-5 text-zinc-500" />
                        {t("recent_projects")}
                    </h2>

                    {projects.length === 0 ? (
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
                            {projects.map((p: any) => (
                                <div
                                    key={p.id}
                                    className="bg-white dark:bg-zinc-900 p-5 rounded-2xl border border-zinc-200 dark:border-zinc-800 hover:border-blue-500 dark:hover:border-blue-500 transition-all group relative"
                                >
                                    <div className="flex justify-between items-start mb-4">
                                        <div
                                            className="w-10 h-10 rounded-lg bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center cursor-pointer overflow-hidden"
                                            onClick={() => router.push(`/editor?lang=${p.lang}&id=${p.id}`)}
                                        >
                                            {p.isMultiTab || p.lang === "multi" ? (
                                                <FolderOpen className="w-6 h-6 text-blue-500" />
                                            ) : (
                                                <img
                                                    src={LANGUAGES.find(l => l.name.toLowerCase() === p.lang.toLowerCase())?.logo || `/languages/${p.lang.toLowerCase()}.png`}
                                                    alt={p.lang}
                                                    className="w-7 h-7 object-contain"
                                                    onError={(e) => {
                                                        // Fallback to text if image fails
                                                        e.currentTarget.style.display = 'none';
                                                        e.currentTarget.parentElement!.innerHTML = `<span class="text-blue-600 dark:text-blue-400 font-bold uppercase text-xs">${p.lang.substring(0, 2)}</span>`;
                                                    }}
                                                />
                                            )}
                                        </div>

                                        {/* Three Dots Menu */}
                                        <div className="relative">
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setOpenMenuId(openMenuId === p.id ? null : p.id);
                                                }}
                                                className="p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full"
                                            >
                                                <MoreVertical className="w-4 h-4 text-zinc-400" />
                                            </button>

                                            {/* Dropdown Menu */}
                                            {openMenuId === p.id && (
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
                                    <div onClick={() => router.push(`/editor?lang=${p.lang}&id=${p.id}`)} className="cursor-pointer">
                                        <h3 className="font-bold text-lg mb-1 group-hover:text-blue-500 transition-colors truncate">{p.name}</h3>
                                        <p className="text-sm text-zinc-500 dark:text-zinc-400">{t("edited") || "Düzenlendi"} {p.date}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </section>
            </main>

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
                                    onClick={() => handleCreateScript(lang.name)}
                                    className="flex flex-col items-center justify-center p-6 rounded-2xl bg-zinc-50 dark:bg-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-700 border-2 border-transparent hover:border-blue-500 transition-all gap-3"
                                >
                                    {/* Logo or Extension Circle */}
                                    {(lang as any).logo ? (
                                        <div className="w-12 h-12 rounded-full overflow-hidden bg-white dark:bg-zinc-900 shadow-md flex items-center justify-center p-2">
                                            <img
                                                src={(lang as any).logo}
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
