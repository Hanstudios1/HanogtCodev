"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState, Suspense } from "react";
import Sidebar from "@/components/Editor/Sidebar";
import CodeEditor from "@/components/Editor/CodeEditor";
import Console from "@/components/Editor/Console";
import AIAssistant from "@/components/Editor/AIAssistant";
import { Play } from "lucide-react";
import { executeCode } from "@/services/piston";
import Header from "@/components/Header";
import { useSession } from "next-auth/react";
import { saveProject, getProjects, getProjectsFromCloud } from "@/lib/storage";
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
    // Fallback
    default: "// Start coding here...",
};

function EditorContent() {
    const searchParams = useSearchParams();
    const lang = searchParams.get("lang") || "javascript";
    const projectId = searchParams.get("id"); // Get project ID from URL
    const { data: session } = useSession();
    const { t } = useI18n();

    const [code, setCode] = useState("");
    const [output, setOutput] = useState<string[]>([]);
    const [isRunning, setIsRunning] = useState(false);
    const [currentProjectId, setCurrentProjectId] = useState<number | null>(null);
    const [currentProjectName, setCurrentProjectName] = useState<string>("");

    // Load existing project or set template
    useEffect(() => {
        const loadProject = async () => {
            if (projectId && session?.user?.email) {
                // Try to load from cloud first
                try {
                    const cloudProjects = await getProjectsFromCloud(session.user.email);
                    const project = cloudProjects.find(p => String(p.id) === projectId);
                    if (project) {
                        setCode(project.code);
                        setCurrentProjectId(Number(project.id));
                        setCurrentProjectName(project.name);
                        return;
                    }
                } catch (error) {
                    console.error("Error loading from cloud:", error);
                }

                // Fallback to localStorage
                const localProjects = getProjects(session.user.email);
                const project = localProjects.find(p => String(p.id) === projectId);
                if (project) {
                    setCode(project.code);
                    setCurrentProjectId(project.id);
                    setCurrentProjectName(project.name);
                    return;
                }
            }

            // No existing project, use template
            setCode(TEMPLATES[lang] || TEMPLATES["default"]);
            setCurrentProjectId(null);
            setCurrentProjectName("");
        };

        loadProject();
    }, [lang, projectId, session]);

    const handleRun = async () => {
        setIsRunning(true);
        setOutput([]);

        try {
            const result = await executeCode(lang, code);
            setOutput([
                `> Executing ${lang} script...`,
                ...(result.run.stdout ? result.run.stdout.split('\n') : []),
                ...(result.run.stderr ? [`Error: ${result.run.stderr}`] : []),
                `> Process finished with exit code ${result.run.code}`
            ]);
        } catch (error) {
            setOutput([`> Execution failed:`, String(error)]);
        } finally {
            setIsRunning(false);
        }
    };

    const handleSave = () => {
        if (!session?.user?.email) {
            alert(t("please_login_first") || "Lütfen önce giriş yapın!");
            return;
        }

        let projectName = currentProjectName;
        let projectIdToUse = currentProjectId;

        // If this is a new project, ask for name
        if (!projectIdToUse) {
            const defaultName = `${t("my_lang_project_prefix") || "Benim"} ${lang.charAt(0).toUpperCase() + lang.slice(1)} ${t("my_lang_project_suffix") || "Projem"}`;
            const name = prompt(t("give_project_name") || "Projenize bir isim verin:", defaultName);
            if (!name) return;

            projectName = name;
            projectIdToUse = Date.now();
            setCurrentProjectId(projectIdToUse);
            setCurrentProjectName(name);
        }

        saveProject(session.user.email, {
            id: projectIdToUse,
            name: projectName,
            lang,
            code,
            date: new Date().toLocaleDateString("tr-TR", { hour: '2-digit', minute: '2-digit' })
        });

        alert(t("project_saved") || "Proje başarıyla kaydedildi! Dashboard'da görebilirsiniz.");
    };

    const handleDownload = () => {
        // File extensions for each language
        const extensions: Record<string, string> = {
            python: "py",
            javascript: "js",
            csharp: "cs",
            cpp: "cpp",
            java: "java",
            html: "html",
            css: "css",
            php: "php",
            go: "go",
            swift: "swift",
            sql: "sql",
            lua: "lua",
            typescript: "ts",
            ruby: "rb",
            rust: "rs",
            kotlin: "kt",
        };

        const ext = extensions[lang.toLowerCase()] || "txt";
        const fileName = currentProjectName
            ? `${currentProjectName.replace(/[^a-zA-Z0-9]/g, "_")}.${ext}`
            : `script.${ext}`;

        const element = document.createElement("a");
        const file = new Blob([code], { type: 'text/plain' });
        element.href = URL.createObjectURL(file);
        element.download = fileName;
        document.body.appendChild(element);
        element.click();
        document.body.removeChild(element);
    };

    return (
        <div className="flex h-screen w-full bg-zinc-50 dark:bg-black text-zinc-900 dark:text-white transition-colors overflow-hidden">
            {/* Sidebar */}
            <Sidebar onSave={handleSave} onDownload={handleDownload} />

            {/* Main Content */}
            <div className="flex-1 flex flex-col h-full relative">
                {/* Top Bar for Run Button */}
                <div className="h-16 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between px-6 bg-white dark:bg-zinc-950">
                    <h2 className="font-bold text-lg capitalize flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full bg-green-500"></span>
                        {currentProjectName || `${lang} Project`}
                    </h2>

                    <div className="flex items-center gap-3">
                        <button
                            onClick={handleRun}
                            className="px-6 py-2 bg-green-600 hover:bg-green-700 text-white rounded-full font-bold flex items-center gap-2 shadow-lg hover:shadow-green-500/30 transition-all"
                        >
                            <Play className="w-4 h-4 fill-current" />
                            RUN
                        </button>
                    </div>
                </div>

                {/* Editor & Console Split */}
                <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
                    {/* Editor Area */}
                    <div className="flex-1 h-[60%] lg:h-full p-2 lg:p-4">
                        <CodeEditor
                            language={lang === 'c++' ? 'cpp' : lang}
                            theme="dark" // Default to dark for editor
                            value={code}
                            onChange={(val) => setCode(val || "")}
                        />
                    </div>

                    {/* Console Area (Right Side) */}
                    <div className="h-[40%] lg:h-full lg:w-[400px] border-t lg:border-t-0 lg:border-l border-zinc-200 dark:border-zinc-800 bg-zinc-900 p-2 lg:p-4">
                        <Console output={output} isRunning={isRunning} onClear={() => setOutput([])} />
                    </div>
                </div>

                {/* AI Overlay */}
                <AIAssistant />
            </div>
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
