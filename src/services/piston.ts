export interface ExecuteResponse {
    run: {
        stdout: string;
        stderr: string;
        code: number;
        output: string;
    };
    language: string;
    version: string;
}

const PISTON_API = "https://emkc.org/api/v2/piston/execute";

export const executeCode = async (language: string, source: string): Promise<ExecuteResponse> => {
    // Map our language names to Piston API names
    const langMap: Record<string, string> = {
        python: "python",
        javascript: "javascript",
        typescript: "typescript",
        csharp: "csharp",
        cpp: "c++",
        java: "java",
        php: "php",
        go: "go",
        swift: "swift",
        ruby: "ruby",
        rust: "rust",
        kotlin: "kotlin",
        lua: "lua",
        sql: "sqlite3",
        // HTML and CSS are not executable - handled separately
    };

    const pistonLang = langMap[language];

    if (language === 'html') {
        return new Promise(resolve => {
            resolve({
                run: {
                    stdout: "HTML is running in browser preview mode (Simulation). Piston execution skipped.",
                    stderr: "",
                    code: 0,
                    output: "HTML Preview Active"
                },
                language: "html",
                version: "5"
            });
        });
    }

    if (language === 'css') {
        return new Promise(resolve => {
            resolve({
                run: {
                    stdout: "CSS is a styling language and cannot be executed directly. Use it with HTML.",
                    stderr: "",
                    code: 0,
                    output: "CSS Preview Mode"
                },
                language: "css",
                version: "3"
            });
        });
    }

    if (!pistonLang) {
        throw new Error(`Language ${language} not supported by execution engine.`);
    }

    try {
        const response = await fetch(PISTON_API, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                language: pistonLang,
                version: "*", // Use latest available
                files: [
                    {
                        content: source,
                    },
                ],
            }),
        });

        if (!response.ok) {
            throw new Error(`Execution failed: ${response.statusText}`);
        }

        return await response.json();
    } catch (error) {
        console.error("Execution error:", error);
        throw error;
    }
};
