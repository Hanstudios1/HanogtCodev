"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { useEffect, useState, Suspense } from "react";
import Sidebar from "@/components/Editor/Sidebar";
import CodeEditor from "@/components/Editor/CodeEditor";
import Console from "@/components/Editor/Console";
import TestPreview from "@/components/Editor/TestPreview";
import AIAssistant from "@/components/Editor/AIAssistant";
import { Play, Plus, X, MoreVertical, Pencil, ShieldAlert } from "lucide-react";
import { executeCode, executeCodeSecure } from "@/services/piston";
import { isUserBanned, banUser, logSecurityEvent } from "@/lib/hanogtBot";
import { useSession, signOut } from "next-auth/react";
import { saveProject, getProjects, getProjectsFromCloud } from "@/lib/storage";
import { useI18n } from "@/lib/i18n";
import BannedModal from "@/components/BannedModal";

// Default code templates
const TEMPLATES: Record<string, string> = {
    python: "def main():\n    print('Hello World from Hanogt!')\n\nif __name__ == '__main__':\n    main()",
    javascript: "console.log('Hello World from Hanogt!');",
    typescript: "const greeting: string = 'Hello World from Hanogt!';\nconsole.log(greeting);",
    csharp: "using System;\n\nclass Program {\n    static void Main() {\n        Console.WriteLine(\"Hello World\");\n    }\n}",
    cpp: "#include <iostream>\n\nint main() {\n    std::cout << \"Hello World\";\n    return 0;\n}",
    java: "public class Main {\n    public static void main(String[] args) {\n        System.out.println(\"Hello World\");\n    }\n}",
    html: "<html>\n<body>\n    <h1>Hello World</h1>\n</body>\n</html>",
    css: "body {\n    background-color: #1a1a1a;\n    color: white;\n    font-family: Arial, sans-serif;\n}",
    php: "<?php\necho 'Hello World from Hanogt!';\n?>",
    go: "package main\n\nimport \"fmt\"\n\nfunc main() {\n    fmt.Println(\"Hello World from Hanogt!\")\n}",
    swift: "import Foundation\n\nprint(\"Hello World from Hanogt!\")",
    ruby: "puts 'Hello World from Hanogt!'",
    rust: "fn main() {\n    println!(\"Hello World from Hanogt!\");\n}",
    kotlin: "fun main() {\n    println(\"Hello World from Hanogt!\")\n}",
    sql: "SELECT 'Hello World from Hanogt!' AS message;",
    lua: "print('Hello World from Hanogt!')",
    default: "// Start coding here...",
};

// Language list for modal
const LANGUAGES = [
    { name: "Python", ext: "py", logo: "/languages/python.png" },
    { name: "JavaScript", ext: "js", logo: "/languages/javascript.png" },
    { name: "TypeScript", ext: "ts", logo: "/languages/typescript.png" },
    { name: "CSharp", ext: "cs", logo: "/languages/csharp.png" },
    { name: "C++", ext: "cpp", logo: "/languages/cpp.png" },
    { name: "Java", ext: "java", logo: "/languages/java.png" },
    { name: "HTML", ext: "html", logo: "/languages/html.png" },
    { name: "CSS", ext: "css", logo: "/languages/css.png" },
    { name: "PHP", ext: "php", logo: "/languages/php.png" },
    { name: "Go", ext: "go", logo: "/languages/go.png" },
    { name: "Swift", ext: "swift", logo: "/languages/swift.png" },
    { name: "Ruby", ext: "rb", logo: "/languages/ruby.png" },
    { name: "Rust", ext: "rs", logo: "/languages/rust.png" },
    { name: "Kotlin", ext: "kt", logo: "/languages/kotlin.png" },
    { name: "SQL", ext: "sql", logo: "/languages/sql.png" },
    { name: "Lua", ext: "lua", logo: "/languages/lua.png" },
];

// Tab interface
interface Tab {
    id: string;
    name: string;
    lang: string;
    code: string;
    output: string[];
    isRunning: boolean;
    isSaved: boolean;
}

function EditorContent() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const initialLang = searchParams.get("lang") || "javascript";
    const projectId = searchParams.get("id");
    const { data: session } = useSession();
    const { t } = useI18n();

    // Multi-tab state
    const [tabs, setTabs] = useState<Tab[]>([]);
    const [activeTabId, setActiveTabId] = useState<string>("");
    const [showLangModal, setShowLangModal] = useState(false);
    const [currentProjectId, setCurrentProjectId] = useState<number | null>(null);
    const [currentProjectName, setCurrentProjectName] = useState<string>("");

    // Save modal state
    const [showSaveModal, setShowSaveModal] = useState(false);
    const [saveModalDefaultName, setSaveModalDefaultName] = useState("");
    const [saveModalInputName, setSaveModalInputName] = useState("");
    const [pendingSaveCallback, setPendingSaveCallback] = useState<((name: string | null) => void) | null>(null);

    // Tab menu state
    const [openTabMenuId, setOpenTabMenuId] = useState<string | null>(null);

    // Output panel tab state (console or test preview)
    const [outputTab, setOutputTab] = useState<"console" | "test">("console");

    // Ban state
    const [isBanned, setIsBanned] = useState(false);
    const [banReason, setBanReason] = useState<string>("");
    const [showBanModal, setShowBanModal] = useState(false);

    // Check if user is banned on page load
    useEffect(() => {
        const checkBanStatus = async () => {
            if (session?.user?.email) {
                const banStatus = await isUserBanned(session.user.email);
                if (banStatus.banned) {
                    setIsBanned(true);
                    setBanReason(banStatus.reason || "Zararlı kod aktivitesi");
                    setShowBanModal(true);
                    // Sign out the banned user
                    await signOut({ redirect: false });
                }
            }
        };
        checkBanStatus();
    }, [session?.user?.email]);

    // Initialize first tab
    useEffect(() => {
        const loadProject = async () => {
            // Check for unsaved tabs in localStorage ONLY if no specific lang/project is requested
            const savedTabs = localStorage.getItem("hanogt_unsaved_tabs");
            const urlHasLang = new URLSearchParams(window.location.search).has("lang");

            if (savedTabs && !projectId && !urlHasLang) {
                try {
                    const parsedTabs = JSON.parse(savedTabs);
                    if (parsedTabs.length > 0) {
                        setTabs(parsedTabs);
                        setActiveTabId(parsedTabs[0].id);
                        return;
                    }
                } catch (e) {
                    console.error("Error loading saved tabs:", e);
                }
            }

            // Load existing project
            if (projectId && session?.user?.email) {
                try {
                    const cloudProjects = await getProjectsFromCloud(session.user.email);
                    const project = cloudProjects.find(p => String(p.id) === projectId);
                    if (project) {
                        // Check if it's a multi-tab project
                        if (project.isMultiTab || project.lang === "multi") {
                            try {
                                const parsedTabs = JSON.parse(project.code);
                                const loadedTabs: Tab[] = parsedTabs.map((t: any, i: number) => ({
                                    id: `tab-${Date.now()}-${i}`,
                                    name: t.name,
                                    lang: t.lang,
                                    code: t.code,
                                    output: [],
                                    isRunning: false,
                                    isSaved: true,
                                }));
                                setTabs(loadedTabs);
                                setActiveTabId(loadedTabs[0].id);
                                setCurrentProjectId(Number(project.id));
                                setCurrentProjectName(project.name);
                                return;
                            } catch (e) {
                                console.error("Error parsing multi-tab project:", e);
                            }
                        }

                        // Single tab project
                        const newTab: Tab = {
                            id: `tab-${Date.now()}`,
                            name: project.name,
                            lang: project.lang,
                            code: project.code,
                            output: [],
                            isRunning: false,
                            isSaved: true,
                        };
                        setTabs([newTab]);
                        setActiveTabId(newTab.id);
                        setCurrentProjectId(Number(project.id));
                        setCurrentProjectName(project.name);
                        return;
                    }
                } catch (error) {
                    console.error("Error loading from cloud:", error);
                }

                const localProjects = getProjects(session.user.email);
                const project = localProjects.find(p => String(p.id) === projectId);
                if (project) {
                    // Check if it's a multi-tab project
                    if (project.isMultiTab || project.lang === "multi") {
                        try {
                            const parsedTabs = JSON.parse(project.code);
                            const loadedTabs: Tab[] = parsedTabs.map((t: any, i: number) => ({
                                id: `tab-${Date.now()}-${i}`,
                                name: t.name,
                                lang: t.lang,
                                code: t.code,
                                output: [],
                                isRunning: false,
                                isSaved: true,
                            }));
                            setTabs(loadedTabs);
                            setActiveTabId(loadedTabs[0].id);
                            setCurrentProjectId(project.id);
                            setCurrentProjectName(project.name);
                            return;
                        } catch (e) {
                            console.error("Error parsing multi-tab project:", e);
                        }
                    }

                    // Single tab project
                    const newTab: Tab = {
                        id: `tab-${Date.now()}`,
                        name: project.name,
                        lang: project.lang,
                        code: project.code,
                        output: [],
                        isRunning: false,
                        isSaved: true,
                    };
                    setTabs([newTab]);
                    setActiveTabId(newTab.id);
                    setCurrentProjectId(project.id);
                    setCurrentProjectName(project.name);
                    return;
                }
            }

            // New project - create first tab
            const langLower = initialLang.toLowerCase();
            const newTab: Tab = {
                id: `tab-${Date.now()}`,
                name: `${langLower.charAt(0).toUpperCase() + langLower.slice(1)} ${t("my_lang_project_suffix") || "Projem"}`,
                lang: langLower,
                code: TEMPLATES[langLower] || TEMPLATES["default"],
                output: [],
                isRunning: false,
                isSaved: false,
            };
            setTabs([newTab]);
            setActiveTabId(newTab.id);
        };

        loadProject();
    }, [initialLang, projectId, session]);

    // Save unsaved tabs to localStorage
    useEffect(() => {
        if (tabs.length > 0) {
            const unsavedTabs = tabs.filter(t => !t.isSaved);
            if (unsavedTabs.length > 0) {
                localStorage.setItem("hanogt_unsaved_tabs", JSON.stringify(tabs));
            } else {
                localStorage.removeItem("hanogt_unsaved_tabs");
            }
        }
    }, [tabs]);

    // Get active tab
    const activeTab = tabs.find(t => t.id === activeTabId);

    // Add new tab
    const handleAddTab = (langName: string) => {
        const langLower = langName.toLowerCase();
        const newTab: Tab = {
            id: `tab-${Date.now()}`,
            name: `${langName} Dosya`,
            lang: langLower,
            code: TEMPLATES[langLower] || TEMPLATES["default"],
            output: [],
            isRunning: false,
            isSaved: false,
        };
        setTabs([...tabs, newTab]);
        setActiveTabId(newTab.id);
        setShowLangModal(false);
    };

    // Close tab
    const handleCloseTab = (tabId: string) => {
        const tabToClose = tabs.find(t => t.id === tabId);
        if (tabToClose && !tabToClose.isSaved) {
            if (!confirm(t("unsaved_close_warning") || "Bu sekme kaydedilmedi. Kapatmak istediğinize emin misiniz?")) {
                return;
            }
        }

        const newTabs = tabs.filter(t => t.id !== tabId);
        if (newTabs.length === 0) {
            // Don't allow closing last tab
            return;
        }
        setTabs(newTabs);
        if (activeTabId === tabId) {
            setActiveTabId(newTabs[0].id);
        }
    };

    // Rename tab
    const handleRenameTab = (tabId: string) => {
        const tab = tabs.find(t => t.id === tabId);
        if (!tab) return;

        const newName = prompt(t("rename_tab_prompt") || "Sekme adını girin:", tab.name);
        if (!newName || newName === tab.name) {
            setOpenTabMenuId(null);
            return;
        }

        setTabs(tabs.map(t =>
            t.id === tabId ? { ...t, name: newName, isSaved: false } : t
        ));
        setOpenTabMenuId(null);
    };

    // Update tab code
    const handleCodeChange = (newCode: string) => {
        setTabs(tabs.map(t =>
            t.id === activeTabId
                ? { ...t, code: newCode, isSaved: false }
                : t
        ));
    };

    // Run code
    const handleRun = async () => {
        if (!activeTab) return;

        const lang = activeTab.lang.toLowerCase();

        // For web content (HTML/CSS/JS), just switch to Test tab for live preview
        if (["html", "css", "javascript", "typescript"].includes(lang)) {
            setOutputTab("test");
            return;
        }

        // For other languages, run via Piston API with security check
        setTabs(prevTabs => prevTabs.map(t =>
            t.id === activeTabId
                ? { ...t, isRunning: true, output: [] }
                : t
        ));

        try {
            // Use secure execution with malicious code check
            const secureResult = await executeCodeSecure(activeTab.lang, activeTab.code, session?.user?.email || undefined);

            if (secureResult.blocked && secureResult.securityCheck) {
                const { threats, severity, shouldBan } = secureResult.securityCheck;

                // Log security event
                if (session?.user?.email) {
                    await logSecurityEvent(
                        session.user.email,
                        "ban", // Always ban for any malicious code
                        secureResult.securityCheck,
                        activeTab.code
                    );

                    // ALWAYS ban user for malicious code - Zero tolerance
                    const banSuccess = await banUser(
                        session.user.email,
                        `Zararlı kod tespit edildi: ${threats.join(", ")}`,
                        activeTab.code
                    );

                    if (banSuccess) {
                        // Show ban modal
                        setIsBanned(true);
                        setBanReason(`Zararlı kod tespit edildi: ${threats.join(", ")}`);
                        setShowBanModal(true);
                        // Sign out the user
                        await signOut({ redirect: false });
                    }
                }

                // Pre-build security messages
                const securityMessages = [
                    `🛡️ [Hanogt Security Bot] ${t("malicious_code_detected") || "Zararlı kod tespit edildi!"}`,
                    ``,
                    `⚠️ ${t("detected_threats") || "Tespit edilen tehditler"}: ${threats.join(", ")}`,
                    `📊 ${t("threat_level") || "Tehdit seviyesi"}: ${severity.toUpperCase()}`,
                    ``,
                    `🚫 ${t("account_banned") || "Hesabınız güvenlik nedeniyle SONSUZA DEK engellenmiştir."}`,
                    ``,
                    `${t("security_warning") || "Zararlı kod çalıştırmak yasaktır ve hesap engellemeye yol açar."}`
                ];

                setTabs(prevTabs => prevTabs.map(tab =>
                    tab.id === activeTabId
                        ? {
                            ...tab,
                            isRunning: false,
                            output: securityMessages
                        }
                        : tab
                ));
                setOutputTab("test");
                return;
            }

            // Code is safe, show execution result
            if (secureResult.response) {
                const result = secureResult.response;
                setTabs(prevTabs => prevTabs.map(t =>
                    t.id === activeTabId
                        ? {
                            ...t,
                            isRunning: false,
                            output: [
                                `> Executing ${activeTab.lang} script...`,
                                ...(result.run.stdout ? result.run.stdout.split('\n') : []),
                                ...(result.run.stderr ? [`Error: ${result.run.stderr}`] : []),
                                `> Process finished with exit code ${result.run.code}`
                            ]
                        }
                        : t
                ));
            }
            // Switch to Test tab to show output
            setOutputTab("test");
        } catch (error) {
            setTabs(prevTabs => prevTabs.map(t =>
                t.id === activeTabId
                    ? { ...t, isRunning: false, output: [`> Execution failed:`, String(error)] }
                    : t
            ));
            setOutputTab("test");
        }
    };

    // Track if project was originally single-tab
    const [wasOriginallyMultiTab, setWasOriginallyMultiTab] = useState<boolean | null>(null);

    // Complete save with given name
    const completeSave = (projectName: string, projectIdToUse: number | null) => {
        if (!session?.user?.email) return;

        const finalProjectId = projectIdToUse || Date.now();

        const projectData = {
            id: finalProjectId,
            name: projectName,
            lang: tabs.length === 1 ? tabs[0].lang : "multi",
            code: tabs.length === 1 ? tabs[0].code : JSON.stringify(tabs.map(t => ({ name: t.name, lang: t.lang, code: t.code }))),
            date: new Date().toLocaleDateString("tr-TR", { hour: '2-digit', minute: '2-digit' }),
            isMultiTab: tabs.length > 1,
        };

        saveProject(session.user.email, projectData);
        setWasOriginallyMultiTab(tabs.length > 1);
        setTabs(tabs.map(t => ({ ...t, isSaved: true })));
        localStorage.removeItem("hanogt_unsaved_tabs");
        setCurrentProjectId(finalProjectId);
        setCurrentProjectName(projectName);
        alert(t("project_saved") || "Proje başarıyla kaydedildi! Dashboard'da görebilirsiniz.");
    };

    // Save project
    const handleSave = () => {
        if (!session?.user?.email) {
            alert(t("please_login_first") || "Lütfen önce giriş yapın!");
            return;
        }

        const isNowMultiTab = tabs.length > 1;
        const isConvertingToMultiTab = wasOriginallyMultiTab === false && isNowMultiTab;

        // Ask for name if: new project OR single-tab became multi-tab
        const shouldAskName = !currentProjectId || isConvertingToMultiTab;

        if (shouldAskName) {
            let defaultName: string;
            if (isNowMultiTab) {
                defaultName = t("general_project") || "Genel Projem";
            } else {
                defaultName = `${t("my_lang_project_prefix") || "Benim"} ${activeTab?.lang.charAt(0).toUpperCase()}${activeTab?.lang.slice(1)} ${t("my_lang_project_suffix") || "Projem"}`;
            }

            // Show custom modal
            setSaveModalDefaultName(defaultName);
            setSaveModalInputName(defaultName);
            setShowSaveModal(true);
            return;
        }

        // Direct save without asking name
        completeSave(currentProjectName, currentProjectId);
    };

    // Handle save modal confirm
    const handleSaveModalConfirm = (keepSameName: boolean) => {
        const nameToUse = keepSameName ? currentProjectName : saveModalInputName;
        setShowSaveModal(false);
        completeSave(nameToUse, currentProjectId);
    };

    // Download
    const handleDownload = async () => {
        if (!activeTab) return;

        const extensions: Record<string, string> = {
            python: "py", javascript: "js", typescript: "ts", csharp: "cs",
            cpp: "cpp", java: "java", html: "html", css: "css",
            php: "php", go: "go", swift: "swift", ruby: "rb",
            rust: "rs", kotlin: "kt", sql: "sql", lua: "lua",
        };

        if (tabs.length === 1) {
            // Single tab - download as file
            const ext = extensions[activeTab.lang.toLowerCase()] || "txt";
            const fileName = `${activeTab.name.replace(/[^a-zA-Z0-9]/g, "_")}.${ext}`;

            const element = document.createElement("a");
            const file = new Blob([activeTab.code], { type: 'text/plain' });
            element.href = URL.createObjectURL(file);
            element.download = fileName;
            document.body.appendChild(element);
            element.click();
            document.body.removeChild(element);
        } else {
            // Multi-tab - download as ZIP
            // Using JSZip dynamically
            try {
                const JSZip = (await import('jszip')).default;
                const zip = new JSZip();

                tabs.forEach((tab, index) => {
                    const ext = extensions[tab.lang.toLowerCase()] || "txt";
                    const fileName = `${index + 1}_${tab.name.replace(/[^a-zA-Z0-9]/g, "_")}.${ext}`;
                    zip.file(fileName, tab.code);
                });

                const content = await zip.generateAsync({ type: 'blob' });
                const element = document.createElement("a");
                element.href = URL.createObjectURL(content);
                element.download = `${currentProjectName || "project"}.zip`;
                document.body.appendChild(element);
                element.click();
                document.body.removeChild(element);
            } catch (error) {
                // Fallback: download each file separately
                tabs.forEach((tab, index) => {
                    const ext = extensions[tab.lang.toLowerCase()] || "txt";
                    const fileName = `${index + 1}_${tab.name.replace(/[^a-zA-Z0-9]/g, "_")}.${ext}`;
                    const element = document.createElement("a");
                    const file = new Blob([tab.code], { type: 'text/plain' });
                    element.href = URL.createObjectURL(file);
                    element.download = fileName;
                    document.body.appendChild(element);
                    element.click();
                    document.body.removeChild(element);
                });
            }
        }
    };

    // Clear output
    const handleClearOutput = () => {
        setTabs(tabs.map(t =>
            t.id === activeTabId
                ? { ...t, output: [] }
                : t
        ));
    };

    return (
        <div className="flex h-screen w-full bg-zinc-50 dark:bg-black text-zinc-900 dark:text-white transition-colors overflow-hidden">
            {/* Sidebar */}
            <Sidebar
                onSave={handleSave}
                onDownload={handleDownload}
            />

            {/* Main Content */}
            <div className="flex-1 flex flex-col h-full relative">
                {/* Tab Bar */}
                <div className="h-12 border-b border-zinc-200 dark:border-zinc-800 flex items-center bg-white dark:bg-zinc-950 overflow-visible">
                    {tabs.map((tab) => (
                        <div
                            key={tab.id}
                            className={`relative flex items-center gap-2 px-4 h-full border-r border-zinc-200 dark:border-zinc-800 cursor-pointer transition-colors ${activeTabId === tab.id
                                ? "bg-zinc-100 dark:bg-zinc-900"
                                : "hover:bg-zinc-50 dark:hover:bg-zinc-900/50"
                                }`}
                            onClick={() => setActiveTabId(tab.id)}
                        >
                            {/* 3-dot menu */}
                            <div className="relative">
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setOpenTabMenuId(openTabMenuId === tab.id ? null : tab.id);
                                    }}
                                    className="p-0.5 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded"
                                >
                                    <MoreVertical className="w-3 h-3" />
                                </button>

                                {openTabMenuId === tab.id && (
                                    <div className="absolute left-0 top-full mt-1 w-40 bg-white dark:bg-zinc-800 rounded-lg shadow-xl border border-zinc-200 dark:border-zinc-700 overflow-hidden z-50">
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleRenameTab(tab.id);
                                            }}
                                            className="w-full flex items-center gap-2 px-3 py-2 hover:bg-zinc-100 dark:hover:bg-zinc-700 text-sm text-zinc-700 dark:text-zinc-300"
                                        >
                                            <Pencil className="w-3 h-3" />
                                            {t("rename_tab") || "İsmini Değiştir"}
                                        </button>
                                    </div>
                                )}
                            </div>

                            <img
                                src={`/languages/${tab.lang.toLowerCase()}.png`}
                                alt={tab.lang}
                                className="w-4 h-4 object-contain"
                                onError={(e) => { e.currentTarget.style.display = 'none'; }}
                            />
                            <span className="text-sm font-medium truncate max-w-[120px]">
                                {tab.name}
                                {!tab.isSaved && <span className="text-orange-500 ml-1">•</span>}
                            </span>
                            {tabs.length > 1 && (
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handleCloseTab(tab.id);
                                    }}
                                    className="p-0.5 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded"
                                >
                                    <X className="w-3 h-3" />
                                </button>
                            )}
                        </div>
                    ))}

                    {/* New Tab Button */}
                    <button
                        onClick={() => setShowLangModal(true)}
                        className="flex items-center gap-1 px-3 h-full bg-zinc-900 dark:bg-white text-white dark:text-black hover:bg-zinc-800 dark:hover:bg-zinc-100 transition-colors"
                    >
                        <Plus className="w-4 h-4" />
                        <span className="text-sm font-medium">{t("new_tab") || "Yeni Sekme"}</span>
                    </button>
                </div>

                {/* Top Bar for Run Button */}
                <div className="h-14 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between px-6 bg-white dark:bg-zinc-950">
                    <h2 className="font-bold text-lg capitalize flex items-center gap-2">
                        <img
                            src={`/languages/${activeTab?.lang.toLowerCase()}.png`}
                            alt={activeTab?.lang}
                            className="w-6 h-6 object-contain"
                            onError={(e) => { e.currentTarget.style.display = 'none'; }}
                        />
                        {activeTab?.name || "Project"}
                    </h2>

                    <div className="flex items-center gap-3">
                        <button
                            onClick={handleRun}
                            disabled={activeTab?.isRunning}
                            className="px-6 py-2 bg-green-600 hover:bg-green-700 disabled:bg-green-800 text-white rounded-full font-bold flex items-center gap-2 shadow-lg hover:shadow-green-500/30 transition-all"
                        >
                            <Play className="w-4 h-4 fill-current" />
                            {activeTab?.isRunning ? "Running..." : "RUN"}
                        </button>
                    </div>
                </div>

                {/* Editor & Console Split */}
                <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
                    {/* Editor Area */}
                    <div className="flex-1 h-[60%] lg:h-full p-2 lg:p-4">
                        {activeTab && (
                            <CodeEditor
                                language={activeTab.lang === 'c++' ? 'cpp' : activeTab.lang}
                                theme="dark"
                                value={activeTab.code}
                                onChange={(val) => handleCodeChange(val || "")}
                            />
                        )}
                    </div>

                    {/* Console Area (Right Side) */}
                    <div className="h-[40%] lg:h-full lg:w-[400px] border-t lg:border-t-0 lg:border-l border-zinc-200 dark:border-zinc-800 bg-zinc-900 flex flex-col">
                        {/* Show Test tab only for web languages */}
                        {["html", "css", "javascript", "typescript"].includes(activeTab?.lang?.toLowerCase() || "") ? (
                            <>
                                {/* Tab Switcher */}
                                <div className="flex border-b border-zinc-700">
                                    <button
                                        onClick={() => setOutputTab("console")}
                                        className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${outputTab === "console"
                                            ? "bg-zinc-800 text-white border-b-2 border-blue-500"
                                            : "text-zinc-400 hover:text-white hover:bg-zinc-800/50"
                                            }`}
                                    >
                                        Çıktı
                                    </button>
                                    <button
                                        onClick={() => setOutputTab("test")}
                                        className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${outputTab === "test"
                                            ? "bg-zinc-800 text-white border-b-2 border-green-500"
                                            : "text-zinc-400 hover:text-white hover:bg-zinc-800/50"
                                            }`}
                                    >
                                        Önizleme
                                    </button>
                                </div>

                                {/* Tab Content */}
                                <div className="flex-1 overflow-hidden">
                                    {outputTab === "console" ? (
                                        <div className="h-full p-2 lg:p-4">
                                            <Console
                                                output={activeTab?.output || []}
                                                isRunning={activeTab?.isRunning || false}
                                                onClear={handleClearOutput}
                                            />
                                        </div>
                                    ) : (
                                        <TestPreview
                                            code={activeTab?.code || ""}
                                            language={activeTab?.lang || "javascript"}
                                        />
                                    )}
                                </div>
                            </>
                        ) : (
                            /* For non-web languages, just show Console */
                            <div className="h-full p-2 lg:p-4">
                                <Console
                                    output={activeTab?.output || []}
                                    isRunning={activeTab?.isRunning || false}
                                    onClear={handleClearOutput}
                                />
                            </div>
                        )}
                    </div>
                </div>

                {/* AI Asistan */}
                <AIAssistant />
            </div>

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
                                <X className="w-6 h-6" />
                            </button>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                            {LANGUAGES.map((lang) => (
                                <button
                                    key={lang.name}
                                    onClick={() => handleAddTab(lang.name)}
                                    className="flex flex-col items-center justify-center p-6 rounded-2xl bg-zinc-50 dark:bg-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-700 border-2 border-transparent hover:border-blue-500 transition-all gap-3"
                                >
                                    <div className="w-12 h-12 rounded-full overflow-hidden bg-white dark:bg-zinc-900 shadow-md flex items-center justify-center p-2">
                                        <img
                                            src={lang.logo}
                                            alt={`${lang.name} logo`}
                                            className="w-full h-full object-contain"
                                        />
                                    </div>
                                    <span className="font-semibold text-zinc-700 dark:text-zinc-200">{lang.name}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* Save Name Modal */}
            {showSaveModal && (
                <div className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-white dark:bg-zinc-900 rounded-2xl p-6 max-w-md w-full shadow-2xl border border-zinc-200 dark:border-zinc-800">
                        <h2 className="text-xl font-bold mb-4">{t("give_project_name") || "Projenize bir isim verin"}</h2>

                        <input
                            type="text"
                            value={saveModalInputName}
                            onChange={(e) => setSaveModalInputName(e.target.value)}
                            className="w-full px-4 py-3 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-white mb-4 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            placeholder={saveModalDefaultName}
                            autoFocus
                        />

                        <div className="flex flex-col gap-2">
                            {currentProjectName && (
                                <button
                                    onClick={() => handleSaveModalConfirm(true)}
                                    className="w-full px-4 py-3 bg-zinc-200 dark:bg-zinc-700 hover:bg-zinc-300 dark:hover:bg-zinc-600 text-zinc-800 dark:text-white rounded-xl font-medium transition-colors"
                                >
                                    {t("keep_same_name") || "İsmimi Koru"} ({currentProjectName})
                                </button>
                            )}
                            <button
                                onClick={() => handleSaveModalConfirm(false)}
                                disabled={!saveModalInputName.trim()}
                                className="w-full px-4 py-3 bg-green-600 hover:bg-green-700 disabled:bg-green-800 text-white rounded-xl font-bold transition-colors"
                            >
                                {t("save") || "Kaydet"}
                            </button>
                            <button
                                onClick={() => setShowSaveModal(false)}
                                className="w-full px-4 py-2 text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors"
                            >
                                {t("cancel") || "Vazgeç"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Ban Modal */}
            <BannedModal
                isOpen={showBanModal}
                reason={banReason}
                onClose={() => setShowBanModal(false)}
            />
        </div>
    );
}

export default function EditorPage() {
    return (
        <Suspense fallback={<div className="flex h-screen items-center justify-center bg-zinc-950 text-white">Loading Editor...</div>}>
            <EditorContent />
        </Suspense>
    );
}
