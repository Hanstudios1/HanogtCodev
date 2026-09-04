"use client";

import OptimizedImage from "@/components/OptimizedImage";

import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, Suspense } from "react";
import Sidebar from "@/components/Editor/Sidebar";
import CodeEditor from "@/components/Editor/CodeEditor";
import Console from "@/components/Editor/Console";
import TestPreview from "@/components/Editor/TestPreview";
import AIAssistant from "@/components/Editor/AIAssistant";
import { Play, Plus, X, MoreVertical, Pencil, Clock } from "lucide-react";
import { executeCodeSecure, executeProjectSecure } from "@/services/piston";
import { useSession } from "next-auth/react";
import { saveProject, saveProjectToCloud, getProjects, getProjectsFromCloud } from "@/lib/storage";
import { useI18n } from "@/lib/i18n";

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

// Normalize language key: convert any form (ext, display name) to internal key
// Used for consistent TEMPLATES lookup, Piston API calls, and CodeEditor language prop
const normalizeLang = (lang: string): string => {
    const lower = lang.toLowerCase().trim();
    const langNormMap: Record<string, string> = {
        // Display names → internal keys
        "c++": "cpp",
        "c#": "csharp",
        // Extensions → internal keys (template/piston compatible)
        "py": "python",
        "js": "javascript",
        "ts": "typescript",
        "cs": "csharp",
        "rb": "ruby",
        "rs": "rust",
        "kt": "kotlin",
    };
    return langNormMap[lower] || lower;
};

// Check if language is a web language (for preview mode)
const isWebLang = (lang: string): boolean => {
    const normalized = normalizeLang(lang);
    return ["html", "css", "javascript", "typescript"].includes(normalized);
};

// Get display name from extension or lang
const getDisplayName = (lang: string): string => {
    const normalized = normalizeLang(lang);
    const found = LANGUAGES.find(l => l.ext === lang || l.name.toLowerCase() === normalized || normalizeLang(l.ext) === normalized);
    return found?.name || lang.charAt(0).toUpperCase() + lang.slice(1);
};

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

type StoredTab = Pick<Tab, "name" | "lang" | "code">;
type GameScriptResponse = {
    id: string;
    name: string;
    language: "csharp" | "cpp";
    content: string;
    revision?: string | null;
};

function EditorContent() {
    const searchParams = useSearchParams();
    const initialLang = searchParams.get("lang") || "javascript";
    const projectId = searchParams.get("id");
    const gameProjectId = searchParams.get("gameProject") || searchParams.get("gameProjectId");
    const requestedGameScriptId = searchParams.get("gameScript") || searchParams.get("scriptId");
    const requestedGameScriptName = searchParams.get("scriptName") || "";
    const requestedReturn = searchParams.get("returnTo") || "";
    const backHref = requestedReturn.startsWith("/game-engine") ? requestedReturn : "/dashboard";
    const { data: session } = useSession();
    const { t } = useI18n();

    // Multi-tab state
    const [tabs, setTabs] = useState<Tab[]>([]);
    const [activeTabId, setActiveTabId] = useState<string>("");
    const [showLangModal, setShowLangModal] = useState(false);
    const [currentProjectId, setCurrentProjectId] = useState<number | null>(null);
    const [currentProjectName, setCurrentProjectName] = useState<string>("");
    const [currentGameScriptId, setCurrentGameScriptId] = useState<string | null>(requestedGameScriptId);
    const [gameScriptRevision, setGameScriptRevision] = useState<string | null>(null);

    // Save modal state
    const [showSaveModal, setShowSaveModal] = useState(false);
    const [saveModalDefaultName, setSaveModalDefaultName] = useState("");
    const [saveModalInputName, setSaveModalInputName] = useState("");

    // Tab menu state
    const [openTabMenuId, setOpenTabMenuId] = useState<string | null>(null);

    // Output panel tab state (console or test preview)
    const [outputTab, setOutputTab] = useState<"console" | "test">("console");

    // Execution history
    const [executionHistory, setExecutionHistory] = useState<{lang: string; time: string; status: string}[]>([]);
    const [showHistory, setShowHistory] = useState(false);
    const [projectOutput, setProjectOutput] = useState<string[]>([]);
    const [isProjectRunning, setIsProjectRunning] = useState(false);
    const shortcutActions = useRef<{ save: () => void; run: () => void | Promise<void> }>({ save: () => undefined, run: () => undefined });

    // Keyboard shortcuts
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                e.preventDefault();
                shortcutActions.current.save();
            }
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                e.preventDefault();
                shortcutActions.current.run();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    // Initialize first tab
    useEffect(() => {
        const loadProject = async () => {
            if (gameProjectId && session?.user?.email) {
                try {
                    if (requestedGameScriptId) {
                        const response = await fetch(`/api/game-projects/${encodeURIComponent(gameProjectId)}/scripts/${encodeURIComponent(requestedGameScriptId)}`, { cache: "no-store" });
                        const payload = await response.json() as { script?: GameScriptResponse; error?: string };
                        if (!response.ok || !payload.script) throw new Error(payload.error || "Oyun scripti yüklenemedi.");
                        const script = payload.script;
                        const tab: Tab = { id: `game-script-${script.id}`, name: script.name, lang: script.language, code: script.content, output: [], isRunning: false, isSaved: true };
                        setTabs([tab]);
                        setActiveTabId(tab.id);
                        setCurrentProjectName(script.name);
                        setCurrentGameScriptId(script.id);
                        setGameScriptRevision(script.revision || null);
                        setWasOriginallyMultiTab(false);
                        return;
                    }
                    const language = normalizeLang(initialLang) === "cpp" ? "cpp" : "csharp";
                    const requestedName = requestedGameScriptName || (language === "cpp" ? "GameScript.cpp" : "GameScript.cs");
                    const tab: Tab = { id: `game-script-${Date.now()}`, name: requestedName, lang: language, code: TEMPLATES[language], output: [], isRunning: false, isSaved: false };
                    setTabs([tab]);
                    setActiveTabId(tab.id);
                    setCurrentProjectName(requestedName);
                    setWasOriginallyMultiTab(false);
                    return;
                } catch (error) {
                    alert(error instanceof Error ? error.message : "Oyun scripti yüklenemedi.");
                }
            }
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
                        if (project.files?.length) {
                            const loadedTabs: Tab[] = project.files.map((file, index) => ({
                                id: `tab-${Date.now()}-${index}`,
                                name: file.name,
                                lang: file.lang,
                                code: file.code,
                                output: [],
                                isRunning: false,
                                isSaved: true,
                            }));
                            setTabs(loadedTabs);
                            setActiveTabId(loadedTabs[0].id);
                            setCurrentProjectId(Number(project.id));
                            setCurrentProjectName(project.name);
                            setWasOriginallyMultiTab(loadedTabs.length > 1);
                            return;
                        }
                        // Check if it's a multi-tab project
                        if (project.isMultiTab || project.lang === "multi") {
                            try {
                                const parsedTabs = JSON.parse(project.code);
                                const loadedTabs: Tab[] = (parsedTabs as StoredTab[]).map((storedTab, i) => ({
                                    id: `tab-${Date.now()}-${i}`,
                                    name: storedTab.name,
                                    lang: storedTab.lang,
                                    code: storedTab.code,
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
                    if (project.files?.length) {
                        const loadedTabs: Tab[] = project.files.map((file, index) => ({
                            id: `tab-${Date.now()}-${index}`,
                            name: file.name,
                            lang: file.lang,
                            code: file.code,
                            output: [],
                            isRunning: false,
                            isSaved: true,
                        }));
                        setTabs(loadedTabs);
                        setActiveTabId(loadedTabs[0].id);
                        setCurrentProjectId(project.id);
                        setCurrentProjectName(project.name);
                        setWasOriginallyMultiTab(loadedTabs.length > 1);
                        return;
                    }
                    // Check if it's a multi-tab project
                    if (project.isMultiTab || project.lang === "multi") {
                        try {
                            const parsedTabs = JSON.parse(project.code);
                            const loadedTabs: Tab[] = (parsedTabs as StoredTab[]).map((storedTab, i) => ({
                                id: `tab-${Date.now()}-${i}`,
                                name: storedTab.name,
                                lang: storedTab.lang,
                                code: storedTab.code,
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
            const langNorm = normalizeLang(initialLang);
            const newTab: Tab = {
                id: `tab-${Date.now()}`,
                name: `${getDisplayName(langNorm)} Projesi`,
                lang: langNorm,
                code: TEMPLATES[langNorm] || TEMPLATES["default"],
                output: [],
                isRunning: false,
                isSaved: false,
            };
            setTabs([newTab]);
            setActiveTabId(newTab.id);
        };

        loadProject();
    }, [initialLang, projectId, gameProjectId, requestedGameScriptId, requestedGameScriptName, session]);

    // Save unsaved tabs to localStorage
    useEffect(() => {
        const timer = window.setTimeout(() => {
            if (tabs.length === 0) return;
            const unsavedTabs = tabs.filter(t => !t.isSaved);
            if (unsavedTabs.length > 0) {
                const recoverable = tabs.map(({ id, name, lang, code, isSaved }) => ({ id, name, lang, code, output: [], isRunning: false, isSaved }));
                const serialized = JSON.stringify(recoverable);
                if (serialized.length <= 1_000_000) localStorage.setItem("hanogt_unsaved_tabs", serialized);
                else localStorage.removeItem("hanogt_unsaved_tabs");
            } else {
                localStorage.removeItem("hanogt_unsaved_tabs");
            }
        }, 500);
        return () => window.clearTimeout(timer);
    }, [tabs]);

    // Get active tab
    const activeTab = tabs.find(t => t.id === activeTabId);


    // Add new tab
    const handleAddTab = (langName: string, langExt?: string) => {
        const langKey = normalizeLang(langExt || langName);
        const newTab: Tab = {
            id: `tab-${Date.now()}`,
            name: `${langName} Dosya`,
            lang: langKey,
            code: TEMPLATES[langKey] || TEMPLATES["default"],
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
        const supported = new Set(["python", "javascript", "typescript", "csharp", "c", "cpp", "java", "php", "go", "swift", "ruby", "rust", "kotlin", "sql", "lua"]);
        const runnableTabs = tabs.filter((tab) => supported.has(normalizeLang(tab.lang)) && tab.code.trim());
        const activeLang = normalizeLang(activeTab.lang);

        if (!runnableTabs.length && isWebLang(activeLang)) {
            setOutputTab("test");
            return;
        }
        if (!runnableTabs.length) return;

        setProjectOutput([]);
        setIsProjectRunning(true);
        setTabs(prevTabs => prevTabs.map(t =>
            runnableTabs.some((candidate) => candidate.id === t.id)
                ? { ...t, isRunning: true, output: [] }
                : t
        ));

        try {
            const secureResult = runnableTabs.length === 1
                ? await executeCodeSecure(normalizeLang(runnableTabs[0].lang), runnableTabs[0].code)
                : await executeProjectSecure(runnableTabs.map((tab) => ({ name: tab.name, language: normalizeLang(tab.lang), code: tab.code })));

            if (secureResult.blocked && secureResult.securityCheck) {
                const { findings, risk } = secureResult.securityCheck;
                const securityMessages = [
                    `🛡️ Hanogt Security Bot · ${t("execution_blocked") || "Çalıştırma engellendi"}`,
                    ``,
                    ...findings.map((finding) => `⚠️ ${finding.message}`),
                    `📊 ${t("threat_level") || "Risk seviyesi"}: ${risk.toUpperCase()}`,
                    ``,
                    `${t("security_review_note") || "Bu bir otomatik kötü amaçlı yazılım hükmü değildir. Yanlış engelleme olduğunu düşünüyorsanız geri bildirim sayfasından inceleme isteyebilirsiniz."}`
                ];

                setProjectOutput(securityMessages);
                setTabs(prevTabs => prevTabs.map(tab => ({ ...tab, isRunning: false })));
                setOutputTab("console");
                return;
            }

            if (secureResult.response) {
                const result = secureResult.response;
                const jobs = result.jobs?.length ? result.jobs : [{ name: runnableTabs[0].name, language: result.language, version: result.version, run: result.run }];
                const outputs = jobs.map((job) => {
                    const lines = [`> ${job.name} · ${getDisplayName(job.language)} (${job.version})`];
                    if (job.run.stdout?.trim()) lines.push(...job.run.stdout.split("\n"));
                    if (job.run.stderr?.trim()) lines.push(`Error: ${job.run.stderr}`);
                    if (!job.run.stdout?.trim() && !job.run.stderr?.trim()) lines.push("(Çıktı yok)");
                    lines.push(`> ${job.run.code} çıkış koduyla tamamlandı`);
                    return lines;
                });
                setProjectOutput(jobs.length > 1 ? ["> Proje çalıştırması · bağımsız dil işleri", "", ...outputs.flatMap((lines, index) => index ? ["", ...lines] : lines)] : []);
                setTabs((current) => current.map((tab) => {
                    const index = runnableTabs.findIndex((candidate) => candidate.id === tab.id);
                    return index >= 0 ? { ...tab, isRunning: false, output: outputs[index] || [] } : tab;
                }));
                setExecutionHistory((previous) => [
                    ...jobs.map((job) => ({ lang: getDisplayName(job.language), time: new Date().toLocaleTimeString(), status: job.run.code === 0 ? "✅" : "❌" })),
                    ...previous,
                ].slice(0, 50));
            }
            setOutputTab("console");
        } catch (error: unknown) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            setProjectOutput(["> Proje çalıştırması", "", `Error: ${errorMsg}`, "", "> Çalıştırma başarısız oldu. Kodunuzu ve çalıştırıcı yapılandırmasını kontrol edin."]);
            setTabs(prevTabs => prevTabs.map(t => ({ ...t, isRunning: false })));
            setExecutionHistory(prev => [{
                lang: runnableTabs.length > 1 ? `${runnableTabs.length} dosya` : getDisplayName(activeTab.lang),
                time: new Date().toLocaleTimeString(),
                status: "❌"
            }, ...prev].slice(0, 50));
            setOutputTab("console");
        } finally {
            setIsProjectRunning(false);
        }
    };

    // Track if project was originally single-tab
    const [wasOriginallyMultiTab, setWasOriginallyMultiTab] = useState<boolean | null>(null);

    // Complete save with given name
    const completeSave = async (projectName: string, projectIdToUse: number | null) => {
        if (!session?.user?.email) return;

        if (gameProjectId) {
            const scriptTab = tabs[0];
            if (!scriptTab || !["csharp", "cpp"].includes(scriptTab.lang)) {
                alert("Oyun scriptleri yalnızca C# veya C++ olabilir.");
                return;
            }
            const endpoint = currentGameScriptId
                ? `/api/game-projects/${encodeURIComponent(gameProjectId)}/scripts/${encodeURIComponent(currentGameScriptId)}`
                : `/api/game-projects/${encodeURIComponent(gameProjectId)}/scripts`;
            const response = await fetch(endpoint, {
                method: currentGameScriptId ? "PATCH" : "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: scriptTab.name || projectName,
                    language: scriptTab.lang,
                    content: scriptTab.code,
                    ...(currentGameScriptId && gameScriptRevision ? { revision: gameScriptRevision } : {}),
                }),
            });
            const payload = await response.json() as { script?: GameScriptResponse; error?: string };
            if (!response.ok || !payload.script) {
                alert(payload.error || "Oyun scripti kaydedilemedi; değişiklikler açık sekmede korunuyor.");
                return;
            }
            setCurrentGameScriptId(payload.script.id);
            setGameScriptRevision(payload.script.revision || null);
            setCurrentProjectName(payload.script.name);
            setTabs((current) => current.map((tab, index) => index === 0 ? { ...tab, name: payload.script!.name, isSaved: true } : tab));
            localStorage.removeItem("hanogt_unsaved_tabs");
            const url = new URL(window.location.href);
            url.searchParams.set("gameScript", payload.script.id);
            window.history.replaceState(null, "", url);
            alert("Oyun scripti güvenli proje alanına kaydedildi.");
            return;
        }

        const finalProjectId = projectIdToUse || Date.now();

        const projectData = {
            id: finalProjectId,
            name: projectName,
            lang: tabs.length === 1 ? tabs[0].lang : "multi",
            code: tabs[0]?.code || "",
            date: new Date().toLocaleDateString("tr-TR", { hour: '2-digit', minute: '2-digit' }),
            isMultiTab: tabs.length > 1,
            files: tabs.map((tab, order) => ({ name: tab.name, lang: tab.lang, code: tab.code, order })),
        };

        const cloudSaved = await saveProjectToCloud(session.user.email, {
            ...projectData,
            id: String(projectData.id),
        });
        if (!cloudSaved) {
            alert(t("save_error") || "Proje buluta kaydedilemedi. Değişiklikleriniz açık sekmelerde korunuyor.");
            return;
        }
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

        if (gameProjectId) {
            void completeSave(currentProjectName || tabs[0]?.name || "GameScript", null);
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
        void completeSave(currentProjectName, currentProjectId);
    };

    // Handle save modal confirm
    const handleSaveModalConfirm = (keepSameName: boolean) => {
        const nameToUse = keepSameName ? currentProjectName : saveModalInputName;
        setShowSaveModal(false);
        void completeSave(nameToUse, currentProjectId);
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
            const objectUrl = URL.createObjectURL(file);
            element.href = objectUrl;
            element.download = fileName;
            document.body.appendChild(element);
            element.click();
            document.body.removeChild(element);
            URL.revokeObjectURL(objectUrl);
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
                const objectUrl = URL.createObjectURL(content);
                element.href = objectUrl;
                element.download = `${currentProjectName || "project"}.zip`;
                document.body.appendChild(element);
                element.click();
                document.body.removeChild(element);
                URL.revokeObjectURL(objectUrl);
            } catch {
                // Fallback: download each file separately
                tabs.forEach((tab, index) => {
                    const ext = extensions[tab.lang.toLowerCase()] || "txt";
                    const fileName = `${index + 1}_${tab.name.replace(/[^a-zA-Z0-9]/g, "_")}.${ext}`;
                    const element = document.createElement("a");
                    const file = new Blob([tab.code], { type: 'text/plain' });
                    const objectUrl = URL.createObjectURL(file);
                    element.href = objectUrl;
                    element.download = fileName;
                    document.body.appendChild(element);
                    element.click();
                    document.body.removeChild(element);
                    URL.revokeObjectURL(objectUrl);
                });
            }
        }
    };

    // Clear output
    const handleClearOutput = () => {
        setProjectOutput([]);
        setTabs(tabs.map(t =>
            t.id === activeTabId
                ? { ...t, output: [] }
                : t
        ));
    };

    useEffect(() => {
        shortcutActions.current = { save: handleSave, run: handleRun };
    });

    return (
        <div className="flex h-screen w-full bg-zinc-50 dark:bg-black text-zinc-900 dark:text-white transition-colors overflow-hidden">
            {/* Sidebar */}
            <Sidebar
                onSave={handleSave}
                onDownload={handleDownload}
                backHref={backHref}
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

                            <OptimizedImage
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
                    {!gameProjectId && (
                        <button
                            onClick={() => setShowLangModal(true)}
                            className="flex items-center gap-1 px-3 h-full bg-zinc-900 dark:bg-white text-white dark:text-black hover:bg-zinc-800 dark:hover:bg-zinc-100 transition-colors"
                        >
                            <Plus className="w-4 h-4" />
                            <span className="text-sm font-medium">{t("new_tab") || "Yeni Sekme"}</span>
                        </button>
                    )}
                </div>

                {/* Top Bar for Run Button */}
                <div className="h-14 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between px-6 bg-white dark:bg-zinc-950">
                    <h2 className="font-bold text-lg capitalize flex items-center gap-2">
                        <OptimizedImage
                            src={`/languages/${activeTab?.lang.toLowerCase()}.png`}
                            alt={activeTab?.lang}
                            className="w-6 h-6 object-contain"
                            onError={(e) => { e.currentTarget.style.display = 'none'; }}
                        />
                        {activeTab?.name || "Project"}
                        {gameProjectId && <span className="rounded-full bg-fuchsia-500/10 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-fuchsia-500">Oyun scripti</span>}
                    </h2>

                    <div className="flex items-center gap-3">
                        {/* Keyboard shortcut hints */}
                        <div className="hidden md:flex items-center gap-2 text-xs text-zinc-400">
                            <kbd className="px-1.5 py-0.5 bg-zinc-100 dark:bg-zinc-800 rounded border border-zinc-300 dark:border-zinc-600 font-mono">Ctrl+S</kbd>
                            <span>{t("save") || "Kaydet"}</span>
                            <span className="mx-1">|</span>
                            <kbd className="px-1.5 py-0.5 bg-zinc-100 dark:bg-zinc-800 rounded border border-zinc-300 dark:border-zinc-600 font-mono">Ctrl+Enter</kbd>
                            <span>{t("run") || "Çalıştır"}</span>
                        </div>
                        {/* History button */}
                        <button
                            onClick={() => setShowHistory(!showHistory)}
                            className="p-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors relative"
                            title={t("execution_history") || "Çalıştırma Geçmişi"}
                        >
                            <Clock className="w-4 h-4" />
                            {executionHistory.length > 0 && (
                                <span className="absolute -top-1 -right-1 w-4 h-4 bg-blue-600 text-white text-[9px] rounded-full flex items-center justify-center">{executionHistory.length}</span>
                            )}
                        </button>
                        <button
                            onClick={handleRun}
                            disabled={isProjectRunning}
                            className="px-6 py-2 bg-green-600 hover:bg-green-700 disabled:bg-green-800 text-white rounded-2xl font-bold flex items-center gap-2 shadow-lg hover:shadow-green-500/30 transition-all"
                        >
                            <Play className="w-4 h-4 fill-current" />
                            {isProjectRunning ? "Çalışıyor…" : tabs.filter((tab) => !["html", "css"].includes(normalizeLang(tab.lang))).length > 1 ? "TÜMÜNÜ ÇALIŞTIR" : "RUN"}
                        </button>
                    </div>
                </div>

                {/* Editor & Console Split */}
                <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
                    {/* Editor Area */}
                    <div className="flex-1 h-[60%] lg:h-full p-2 lg:p-4">
                        {activeTab && (
                            <CodeEditor
                                language={normalizeLang(activeTab.lang)}
                                theme="dark"
                                value={activeTab.code}
                                onChange={(val) => handleCodeChange(val || "")}
                            />
                        )}
                    </div>

                    {/* Console Area (Right Side) */}
                    <div className="h-[40%] lg:h-full lg:w-[400px] border-t lg:border-t-0 lg:border-l border-zinc-200 dark:border-zinc-800 bg-zinc-900 flex flex-col">
                        {/* Show Test tab only for web languages */}
                        {isWebLang(activeTab?.lang || "") ? (
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
                                                output={projectOutput.length ? projectOutput : (activeTab?.output || [])}
                                                isRunning={isProjectRunning || activeTab?.isRunning || false}
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
                                    output={projectOutput.length ? projectOutput : (activeTab?.output || [])}
                                    isRunning={isProjectRunning || activeTab?.isRunning || false}
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
                                    onClick={() => handleAddTab(lang.name, lang.ext)}
                                    className="flex flex-col items-center justify-center p-6 rounded-2xl bg-zinc-50 dark:bg-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-700 border-2 border-transparent hover:border-blue-500 transition-all gap-3"
                                >
                                    <div className="w-12 h-12 rounded-full overflow-hidden bg-white dark:bg-zinc-900 shadow-md flex items-center justify-center p-2">
                                        <OptimizedImage
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

            {/* Execution History Panel */}
            {showHistory && (
                <div className="fixed right-4 top-20 z-[70] w-72 bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl border border-zinc-200 dark:border-zinc-800 max-h-[60vh] flex flex-col">
                    <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-200 dark:border-zinc-800">
                        <h3 className="font-bold text-sm flex items-center gap-2">
                            <Clock className="w-4 h-4" />
                            {t("execution_history") || "Çalıştırma Geçmişi"}
                        </h3>
                        <button onClick={() => setShowHistory(false)} className="p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg">
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                    <div className="flex-1 overflow-y-auto p-2">
                        {executionHistory.length === 0 ? (
                            <p className="text-xs text-zinc-400 text-center py-4">{t("no_history") || "Henüz çalıştırma yok."}</p>
                        ) : (
                            executionHistory.map((h, i) => (
                                <div key={i} className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800 text-xs">
                                    <span>{h.status}</span>
                                    <span className="font-medium text-zinc-700 dark:text-zinc-300">{h.lang}</span>
                                    <span className="ml-auto text-zinc-400">{h.time}</span>
                                </div>
                            ))
                        )}
                    </div>
                    {executionHistory.length > 0 && (
                        <button onClick={() => setExecutionHistory([])} className="m-2 px-3 py-1.5 text-xs bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-lg transition-colors">
                            {t("clear_history") || "Geçmişi Temizle"}
                        </button>
                    )}
                </div>
            )}

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
