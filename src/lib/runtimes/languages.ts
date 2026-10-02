/**
 * The single source of truth for every programming language Hanogt Codev knows.
 *
 * Client-safe and dependency-free (no imports), so it is shared by the editor,
 * the dashboard, the server runner (src/lib/server/code-runner.ts), the
 * /api/execute route and the plain-Node tests in scripts/tests.
 *
 * - `engine: "browser"`  runs in the visitor's browser (src/lib/runtimes/worker.ts);
 *                        `tool: "validator"` languages are checked and formatted instead of executed.
 * - `engine: "server"`   runs through /api/execute (CODE_RUNNER_URL, Wandbox or Kotlin Playground).
 * - `engine: "preview"`  is rendered in the live preview panel (HTML, CSS, Markdown, SVG, Mermaid, LaTeX).
 * - `engine: "none"`     is edit-only: syntax highlighting without a Run button.
 */

/** A translatable text pair; structurally compatible with `Copy` from "@/lib/i18n". */
export type LanguageText = { TR: string; EN: string };

export type LanguageEngine = "browser" | "server" | "preview" | "none";

export type LanguageCategory =
    | "general" | "web" | "systems" | "jvm" | "dotnet" | "functional"
    | "scripting" | "data" | "config" | "docs" | "templates" | "assembly"
    | "hardware" | "esoteric" | "other";

export interface WandboxMapping {
    /** Wandbox `language` values (compared in lower case). */
    names: readonly string[];
    /** Compiler name prefixes in order of preference (e.g. "gcc", "clang"). */
    prefer: readonly string[];
}

export interface LanguageInfo {
    /** Stable id stored in projects (≤ 30 characters, lower case). */
    id: string;
    /** Display name (a proper noun, not translated). */
    name: string;
    /** Monaco language id used for syntax highlighting. */
    monaco: string;
    /** File extensions in lower case without the dot; the first one is the default. */
    extensions: readonly string[];
    /** Exact file names that belong to this language (e.g. "Dockerfile"). */
    fileNames?: readonly string[];
    /** Other spellings accepted by {@link normalizeLanguageId} (URLs, APIs, old data). */
    aliases?: readonly string[];
    engine: LanguageEngine;
    /** Accepted by /api/execute. Browser languages with a server fallback set this too. */
    server?: boolean;
    /** Public Wandbox compiler mapping (server languages without CODE_RUNNER_URL). */
    wandbox?: WandboxMapping;
    /** Language name sent to a Piston-compatible CODE_RUNNER_URL when it differs from `id`. */
    piston?: string;
    /** "validator": Run checks and formats the file instead of executing a program. */
    tool?: "validator";
    category: LanguageCategory;
    /** Shown first in pickers. */
    popular?: boolean;
    /** Brand colour used for badges. */
    color: string;
    /** Icon under /public. */
    icon: string;
    defaultFileName: string;
    /** Starter "hello world" code. */
    template: string;
}

const png = (id: string) => `/languages/${id}.png`;
const svg = (id: string) => `/languages/${id}.svg`;

export const LANGUAGES: readonly LanguageInfo[] = [
    // ------------------------------------------------------------ browser
    {
        id: "javascript", name: "JavaScript", monaco: "javascript", extensions: ["js", "mjs", "cjs", "jsx"],
        aliases: ["js", "node", "nodejs", "ecmascript"], engine: "browser", server: true,
        wandbox: { names: ["javascript"], prefer: ["nodejs", "spidermonkey"] },
        category: "general", popular: true, color: "#F7DF1E", icon: png("javascript"), defaultFileName: "main.js",
        template: "// Hanogt Codev · JavaScript\nconst name = \"Hanogt\";\nconsole.log(`Hello World from ${name}!`);\n",
    },
    {
        id: "typescript", name: "TypeScript", monaco: "typescript", extensions: ["ts", "mts", "cts", "tsx"],
        aliases: ["ts"], engine: "browser", server: true,
        wandbox: { names: ["typescript"], prefer: ["typescript"] },
        category: "general", popular: true, color: "#3178C6", icon: png("typescript"), defaultFileName: "main.ts",
        template: "// Hanogt Codev · TypeScript\nconst greeting: string = \"Hello World from Hanogt!\";\nconsole.log(greeting);\n",
    },
    {
        id: "python", name: "Python", monaco: "python", extensions: ["py", "pyw"],
        aliases: ["py", "python3", "py3", "cpython"], engine: "browser", server: true,
        wandbox: { names: ["python"], prefer: ["cpython", "pypy"] },
        category: "general", popular: true, color: "#3776AB", icon: png("python"), defaultFileName: "main.py",
        template: "def main():\n    print(\"Hello World from Hanogt!\")\n\n\nif __name__ == \"__main__\":\n    main()\n",
    },
    {
        id: "sql", name: "SQL (SQLite)", monaco: "sql", extensions: ["sql"],
        aliases: ["sqlite", "sqlite3"], engine: "browser", server: true, piston: "sqlite3",
        wandbox: { names: ["sql"], prefer: ["sqlite"] },
        category: "data", popular: true, color: "#0F80CC", icon: png("sql"), defaultFileName: "query.sql",
        template: "CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT NOT NULL);\nINSERT INTO users (name) VALUES ('Ada'), ('Linus'), ('Grace');\n\nSELECT 'Hello World from Hanogt!' AS message;\nSELECT id, name FROM users ORDER BY name;\n",
    },
    {
        id: "lua", name: "Lua", monaco: "lua", extensions: ["lua"],
        engine: "browser", server: true,
        wandbox: { names: ["lua"], prefer: ["lua", "luajit"] },
        category: "scripting", color: "#2C2D72", icon: png("lua"), defaultFileName: "main.lua",
        template: "local name = \"Hanogt\"\nprint(\"Hello World from \" .. name .. \"!\")\n",
    },
    {
        id: "scheme", name: "Scheme", monaco: "scheme", extensions: ["scm", "ss", "sld"],
        aliases: ["r7rs"], engine: "browser",
        category: "functional", color: "#B91C1C", icon: svg("scheme"), defaultFileName: "main.scm",
        template: ";; Hanogt Codev · Scheme (R7RS subset)\n(define (greet name)\n  (string-append \"Hello World from \" name \"!\"))\n\n(display (greet \"Hanogt\"))\n(newline)\n\n(define (factorial n)\n  (if (= n 0) 1 (* n (factorial (- n 1)))))\n\n(factorial 20)\n",
    },
    {
        id: "brainfuck", name: "Brainfuck", monaco: "brainfuck", extensions: ["bf", "b"],
        aliases: ["bf"], engine: "browser",
        category: "esoteric", color: "#27272A", icon: svg("brainfuck"), defaultFileName: "main.bf",
        // Comment text must not contain any of the eight commands: + - < > . , [ ]
        template: "Hanogt Codev Brainfuck\nPrints Hello World followed by a newline\n\n++++++++[>++++[>++>+++>+++>+<<<<-]>+>+>->>+[<]<-]>>.>---.+++++++..+++.>>.<-.<.+++.------.--------.>>+.>++.\n",
    },
    {
        id: "json", name: "JSON", monaco: "json", extensions: ["json", "webmanifest", "har"],
        engine: "browser", tool: "validator",
        category: "data", color: "#1E293B", icon: svg("json"), defaultFileName: "data.json",
        template: "{\n  \"name\": \"Hanogt Codev\",\n  \"message\": \"Hello World from Hanogt!\",\n  \"languages\": [\"JavaScript\", \"Python\", \"Scheme\"],\n  \"version\": 1,\n  \"openSource\": true\n}\n",
    },

    {
        id: "prolog", name: "Prolog", monaco: "prolog", extensions: ["pro", "prolog"],
        aliases: ["swipl", "swi-prolog", "tau-prolog", "tauprolog"], engine: "browser",
        category: "functional", color: "#BE1E2D", icon: svg("prolog"), defaultFileName: "main.pro",
        template: "% Hanogt Codev · Prolog (Tau Prolog)\nparent(ada, byron).\nparent(byron, lovelace).\n\ngrandparent(X, Z) :- parent(X, Y), parent(Y, Z).\n\n:- initialization(main).\n\nmain :-\n    format(\"Hello World from ~w!~n\", ['Hanogt']),\n    grandparent(ada, Who),\n    format(\"ada is a grandparent of ~w~n\", [Who]).\n",
    },
    {
        id: "forth", name: "Forth", monaco: "forth", extensions: ["fth", "4th", "forth", "frt"],
        aliases: ["gforth"], engine: "browser",
        category: "other", color: "#C2410C", icon: svg("forth"), defaultFileName: "main.fth",
        template: "\\ Hanogt Codev · Forth\n: greet ( -- )  .\" Hello World from Hanogt!\" cr ;\ngreet\n\n\\ Squares of 1..5 with a DO loop\n: squares ( n -- )  1+ 1 do i dup * . loop cr ;\n5 squares\n",
    },
    {
        id: "basic", name: "BASIC", monaco: "basic", extensions: ["bas", "basic", "qb"],
        aliases: ["qbasic", "quickbasic", "gwbasic", "gw-basic", "freebasic"], engine: "browser",
        category: "general", color: "#1D4ED8", icon: svg("basic"), defaultFileName: "main.bas",
        template: "REM Hanogt Codev · BASIC\nname$ = \"Hanogt\"\nPRINT \"Hello World from \"; name$; \"!\"\n\nFOR i = 1 TO 3\n    PRINT \"Line\"; i\nNEXT i\n",
    },
    {
        id: "befunge", name: "Befunge-93", monaco: "befunge", extensions: ["b93", "befunge", "bf93"],
        aliases: ["befunge93", "befunge-93"], engine: "browser",
        category: "esoteric", color: "#0E7490", icon: svg("befunge"), defaultFileName: "main.b93",
        // Only the first line runs; the instruction pointer never reaches the text below it.
        template: "55+\"!tgonaH morf dlroW olleH\">:#,_@\nThe line above pushes a newline (5 5 +) and the message backwards,\nthen prints characters until the stack is empty.\n",
    },
    {
        id: "whitespace", name: "Whitespace", monaco: "whitespace", extensions: ["ws"],
        aliases: ["wspace"], engine: "browser",
        category: "esoteric", color: "#52525B", icon: svg("whitespace"), defaultFileName: "main.ws",
        // Only spaces, tabs and line feeds are code; the visible S/T/L letters and words are comments.
        template: "Hanogt·Codev·Whitespacepush0 S S SL\npush\\n S S S\tT S\tT SL\npush! S S S\tT S S S S\tTL\npusht S S S\tT\tT\tT S\tT S SL\npushg S S S\tT\tT S S\tT\tT\tTL\npusho S S S\tT\tT S\tT\tT\tT\tTL\npushn S S S\tT\tT S\tT\tT\tT SL\npusha S S S\tT\tT S S S S\tTL\npushH S S S\tT S S\tT S S SL\npush_ S S S\tT S S S S SL\npushm S S S\tT\tT S\tT\tT S\tTL\npusho S S S\tT\tT S\tT\tT\tT\tTL\npushr S S S\tT\tT\tT S S\tT SL\npushf S S S\tT\tT S S\tT\tT SL\npush_ S S S\tT S S S S SL\npushd S S S\tT\tT S S\tT S SL\npushl S S S\tT\tT S\tT\tT S SL\npushr S S S\tT\tT\tT S S\tT SL\npusho S S S\tT\tT S\tT\tT\tT\tTL\npushW S S S\tT S\tT S\tT\tT\tTL\npush_ S S S\tT S S S S SL\npusho S S S\tT\tT S\tT\tT\tT\tTL\npushl S S S\tT\tT S\tT\tT S SL\npushl S S S\tT\tT S\tT\tT S SL\npushe S S S\tT\tT S S\tT S\tTL\npushH S S S\tT S S\tT S S SL\nloop:L\n S S SL\ndup SL\n Sjz->endL\n\tT S\tTL\nprintc\tTL\n S Sjump->loopL\n SL\n SL\nend:L\n S S\tTL\nendL\nL\nL\n",
    },
    {
        id: "mips", name: "MIPS Assembly", monaco: "mips", extensions: ["mips", "asm", "s"],
        aliases: ["asm", "assembly", "mars", "spim"], engine: "browser",
        category: "assembly", color: "#6E4A7E", icon: svg("mips"), defaultFileName: "main.asm",
        template: "# Hanogt Codev · MIPS (MARS-style syscalls)\n        .data\nmsg:    .asciiz \"Hello World from Hanogt!\\n\"\n\n        .text\nmain:   li   $v0, 4          # print_string\n        la   $a0, msg\n        syscall\n        li   $v0, 10         # exit\n        syscall\n",
    },
    {
        id: "yaml", name: "YAML", monaco: "yaml", extensions: ["yaml", "yml"],
        aliases: ["yml"], engine: "browser", tool: "validator", category: "config", color: "#CB171E", icon: svg("yaml"), defaultFileName: "config.yaml",
        template: "name: Hanogt Codev\nmessage: Hello World from Hanogt!\nlanguages:\n  - JavaScript\n  - Python\n  - Scheme\nfeatures:\n  browserRuntime: true\n  maxFiles: 8\n",
    },
    {
        id: "toml", name: "TOML", monaco: "toml", extensions: ["toml"],
        engine: "browser", tool: "validator", category: "config", color: "#9C4121", icon: svg("toml"), defaultFileName: "config.toml",
        template: "title = \"Hanogt Codev\"\n\n[greeting]\ntext = \"Hello World from Hanogt!\"\nlanguages = [\"JavaScript\", \"Python\"]\n",
    },
    {
        id: "xml", name: "XML", monaco: "xml", extensions: ["xml", "xsd", "xsl", "xslt", "plist", "rss", "atom", "csproj", "xaml"],
        engine: "browser", tool: "validator", category: "data", color: "#0060AC", icon: svg("xml"), defaultFileName: "data.xml",
        template: "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<greeting lang=\"en\">\n  <text>Hello World from Hanogt!</text>\n</greeting>\n",
    },
    {
        id: "ini", name: "INI", monaco: "ini", extensions: ["ini", "cfg", "conf", "inf"],
        fileNames: [".editorconfig", ".gitconfig"], engine: "browser", tool: "validator",
        category: "config", color: "#6D6D6D", icon: svg("ini"), defaultFileName: "settings.ini",
        template: "; Hanogt Codev\n[greeting]\ntext=Hello World from Hanogt!\nenabled=true\n",
    },
    {
        id: "dotenv", name: "Dotenv", monaco: "dotenv", extensions: ["env"],
        fileNames: [".env", ".env.local", ".env.development", ".env.production", ".env.test", ".env.example", ".env.sample"],
        aliases: ["env", ".env", "dot-env"], engine: "browser", tool: "validator",
        category: "config", color: "#ECD53F", icon: svg("dotenv"), defaultFileName: ".env",
        template: "# Hanogt Codev · .env\nAPP_NAME=Hanogt\nGREETING=\"Hello World from Hanogt!\"\nPORT=3000\n",
    },
    {
        id: "properties", name: "Java Properties", monaco: "ini", extensions: ["properties"],
        aliases: ["java properties"], engine: "browser", tool: "validator",
        category: "config", color: "#B07219", icon: svg("properties"), defaultFileName: "app.properties",
        template: "# Hanogt Codev · .properties\napp.name=Hanogt\ngreeting=Hello World from Hanogt!\nserver.port=8080\n",
    },
    {
        id: "csv", name: "CSV", monaco: "csv", extensions: ["csv", "tsv"],
        aliases: ["tsv", "comma-separated values"], engine: "browser", tool: "validator",
        category: "data", color: "#237346", icon: svg("csv"), defaultFileName: "data.csv",
        template: "language,runs in,since\nPython,browser,1991\nJavaScript,browser,1995\n\"Hello, World\",Hanogt,2026\n",
    },

    // ------------------------------------------------------------ preview
    {
        id: "html", name: "HTML", monaco: "html", extensions: ["html", "htm", "xhtml"],
        engine: "preview", category: "web", popular: true, color: "#E34F26", icon: png("html"), defaultFileName: "index.html",
        template: "<!DOCTYPE html>\n<html lang=\"en\">\n<head>\n  <meta charset=\"UTF-8\">\n  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">\n  <title>Hanogt</title>\n  <style>\n    body { font-family: system-ui, sans-serif; display: grid; place-items: center; min-height: 100vh; margin: 0; }\n    button { font-size: 1.25rem; padding: .5rem 1.25rem; border-radius: .75rem; }\n  </style>\n</head>\n<body>\n  <main>\n    <h1>Hello World from Hanogt!</h1>\n    <button id=\"counter\" type=\"button\">0</button>\n  </main>\n  <script>\n    const button = document.getElementById(\"counter\");\n    button.addEventListener(\"click\", () => {\n      button.textContent = String(Number(button.textContent) + 1);\n      console.log(\"Clicked\", button.textContent, \"times\");\n    });\n  </script>\n</body>\n</html>\n",
    },
    {
        id: "css", name: "CSS", monaco: "css", extensions: ["css"],
        engine: "preview", category: "web", color: "#1572B6", icon: png("css"), defaultFileName: "style.css",
        template: "body {\n  font-family: system-ui, sans-serif;\n  background: #0f172a;\n  color: #f8fafc;\n  padding: 2rem;\n}\n\nh1 {\n  color: #a5b4fc;\n}\n\nbutton {\n  background: linear-gradient(90deg, #6366f1, #d946ef);\n  border: 0;\n  border-radius: 0.75rem;\n  color: white;\n  padding: 0.5rem 1rem;\n}\n",
    },
    {
        id: "markdown", name: "Markdown", monaco: "markdown", extensions: ["md", "markdown", "mdown", "mkd"],
        aliases: ["md"], engine: "preview", category: "docs", color: "#083FA1", icon: svg("markdown"), defaultFileName: "README.md",
        template: "# Hello World from Hanogt!\n\nThis is a **Markdown** file. The *Preview* panel renders it live.\n\n## Features\n\n- [x] Headings, lists and task lists\n- [x] `inline code` and fenced code blocks\n- [ ] Your next idea\n\n```python\nprint(\"Hello World from Hanogt!\")\n```\n\n| Language | Runs in |\n| --- | --- |\n| Python | Browser |\n| Rust | Server |\n\n> Tip: press Ctrl+K for quick actions.\n",
    },

    {
        id: "svg", name: "SVG", monaco: "xml", extensions: ["svg"],
        engine: "preview", category: "web", color: "#FFB13B", icon: svg("svg"), defaultFileName: "image.svg",
        template: "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"320\" height=\"160\" viewBox=\"0 0 320 160\">\n  <defs>\n    <linearGradient id=\"bg\" x1=\"0\" x2=\"1\">\n      <stop offset=\"0\" stop-color=\"#6366f1\"/>\n      <stop offset=\"1\" stop-color=\"#d946ef\"/>\n    </linearGradient>\n  </defs>\n  <rect width=\"320\" height=\"160\" rx=\"24\" fill=\"url(#bg)\"/>\n  <circle cx=\"60\" cy=\"80\" r=\"28\" fill=\"#fff\" opacity=\"0.9\"/>\n  <text x=\"104\" y=\"88\" font-family=\"system-ui, sans-serif\" font-size=\"20\" fill=\"#fff\">Hello World from Hanogt!</text>\n</svg>\n",
    },
    {
        id: "mermaid", name: "Mermaid", monaco: "mermaid", extensions: ["mmd", "mermaid"],
        engine: "preview", category: "docs", color: "#FF3670", icon: svg("mermaid"), defaultFileName: "diagram.mmd",
        template: "flowchart LR\n    A[Hello World from Hanogt!] --> B{Run or preview?}\n    B -->|Run| C[Console]\n    B -->|Preview| D[Live preview]\n    C --> E((Done))\n    D --> E\n",
    },
    {
        id: "latex", name: "LaTeX", monaco: "latex", extensions: ["tex", "latex", "ltx"],
        aliases: ["tex", "katex"], engine: "preview", category: "docs", color: "#008080", icon: svg("latex"), defaultFileName: "document.tex",
        template: "\\documentclass{article}\n\\title{Hello World from Hanogt!}\n\\begin{document}\n\\maketitle\n\n\\section{Formulas}\nThe roots of $ax^2 + bx + c = 0$ are\n\\[\n  x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}.\n\\]\n\n\\begin{itemize}\n  \\item Euler: $e^{i\\pi} + 1 = 0$\n  \\item Sum: $\\sum_{k=1}^{n} k = \\frac{n(n+1)}{2}$\n\\end{itemize}\n\\end{document}\n",
    },

    // ------------------------------------------------------------ server
    {
        id: "c", name: "C", monaco: "c", extensions: ["c", "h"],
        engine: "server", server: true, wandbox: { names: ["c"], prefer: ["gcc", "clang"] },
        category: "systems", popular: true, color: "#3949AB", icon: svg("c"), defaultFileName: "main.c",
        template: "#include <stdio.h>\n\nint main(void) {\n    printf(\"Hello World from Hanogt!\\n\");\n    return 0;\n}\n",
    },
    {
        id: "cpp", name: "C++", monaco: "cpp", extensions: ["cpp", "cc", "cxx", "c++", "hpp", "hh", "hxx"],
        aliases: ["c++", "cplusplus", "g++"], engine: "server", server: true, piston: "c++",
        wandbox: { names: ["c++"], prefer: ["gcc", "clang"] },
        category: "systems", popular: true, color: "#00599C", icon: png("cpp"), defaultFileName: "main.cpp",
        template: "#include <iostream>\n\nint main() {\n    std::cout << \"Hello World from Hanogt!\" << std::endl;\n    return 0;\n}\n",
    },
    {
        id: "csharp", name: "C#", monaco: "csharp", extensions: ["cs", "csx"],
        aliases: ["c#", "cs", "csharp.net"], engine: "server", server: true,
        wandbox: { names: ["c#"], prefer: ["mono", "dotnet"] },
        category: "dotnet", popular: true, color: "#68217A", icon: png("csharp"), defaultFileName: "Program.cs",
        template: "using System;\n\nclass Program\n{\n    static void Main()\n    {\n        Console.WriteLine(\"Hello World from Hanogt!\");\n    }\n}\n",
    },
    {
        id: "java", name: "Java", monaco: "java", extensions: ["java"],
        engine: "server", server: true, wandbox: { names: ["java"], prefer: ["openjdk"] },
        category: "jvm", popular: true, color: "#E76F00", icon: png("java"), defaultFileName: "Main.java",
        template: "public class Main {\n    public static void main(String[] args) {\n        System.out.println(\"Hello World from Hanogt!\");\n    }\n}\n",
    },
    {
        id: "kotlin", name: "Kotlin", monaco: "kotlin", extensions: ["kt", "kts"],
        aliases: ["kt"], engine: "server", server: true,
        category: "jvm", popular: true, color: "#7F52FF", icon: png("kotlin"), defaultFileName: "Main.kt",
        template: "fun main() {\n    println(\"Hello World from Hanogt!\")\n}\n",
    },
    {
        id: "go", name: "Go", monaco: "go", extensions: ["go"],
        aliases: ["golang"], engine: "server", server: true, wandbox: { names: ["go"], prefer: ["go"] },
        category: "systems", popular: true, color: "#00ADD8", icon: png("go"), defaultFileName: "main.go",
        template: "package main\n\nimport \"fmt\"\n\nfunc main() {\n\tfmt.Println(\"Hello World from Hanogt!\")\n}\n",
    },
    {
        id: "rust", name: "Rust", monaco: "rust", extensions: ["rs"],
        aliases: ["rs"], engine: "server", server: true, wandbox: { names: ["rust"], prefer: ["rust"] },
        category: "systems", popular: true, color: "#CE422B", icon: png("rust"), defaultFileName: "main.rs",
        template: "fn main() {\n    println!(\"Hello World from Hanogt!\");\n}\n",
    },
    {
        id: "swift", name: "Swift", monaco: "swift", extensions: ["swift"],
        engine: "server", server: true, wandbox: { names: ["swift"], prefer: ["swift"] },
        category: "systems", color: "#F05138", icon: png("swift"), defaultFileName: "main.swift",
        template: "print(\"Hello World from Hanogt!\")\n",
    },
    {
        id: "ruby", name: "Ruby", monaco: "ruby", extensions: ["rb", "rbw", "gemspec"],
        aliases: ["rb", "mruby"], engine: "server", server: true, wandbox: { names: ["ruby"], prefer: ["ruby", "mruby"] },
        category: "general", color: "#CC342D", icon: png("ruby"), defaultFileName: "main.rb",
        template: "name = \"Hanogt\"\nputs \"Hello World from #{name}!\"\n",
    },
    {
        id: "php", name: "PHP", monaco: "php", extensions: ["php", "phtml"],
        engine: "server", server: true, wandbox: { names: ["php"], prefer: ["php"] },
        category: "web", color: "#777BB4", icon: png("php"), defaultFileName: "index.php",
        template: "<?php\n\n$name = \"Hanogt\";\necho \"Hello World from {$name}!\\n\";\n",
    },
    {
        id: "perl", name: "Perl", monaco: "perl", extensions: ["pl", "pm"],
        aliases: ["pl"], engine: "server", server: true, wandbox: { names: ["perl"], prefer: ["perl"] },
        category: "scripting", color: "#39457E", icon: svg("perl"), defaultFileName: "main.pl",
        template: "use strict;\nuse warnings;\n\nmy $name = \"Hanogt\";\nprint \"Hello World from $name!\\n\";\n",
    },
    {
        id: "scala", name: "Scala", monaco: "scala", extensions: ["scala", "sc"],
        engine: "server", server: true, wandbox: { names: ["scala"], prefer: ["scala"] },
        category: "jvm", color: "#DC322F", icon: svg("scala"), defaultFileName: "Main.scala",
        template: "object Main {\n  def main(args: Array[String]): Unit = {\n    println(\"Hello World from Hanogt!\")\n  }\n}\n",
    },
    {
        id: "haskell", name: "Haskell", monaco: "haskell", extensions: ["hs", "lhs"],
        aliases: ["hs", "ghc"], engine: "server", server: true, wandbox: { names: ["haskell"], prefer: ["ghc"] },
        category: "functional", color: "#5E5086", icon: svg("haskell"), defaultFileName: "Main.hs",
        template: "main :: IO ()\nmain = putStrLn \"Hello World from Hanogt!\"\n",
    },
    {
        id: "elixir", name: "Elixir", monaco: "elixir", extensions: ["ex", "exs"],
        aliases: ["ex", "exs"], engine: "server", server: true, wandbox: { names: ["elixir"], prefer: ["elixir"] },
        category: "functional", color: "#4B275F", icon: svg("elixir"), defaultFileName: "main.exs",
        template: "name = \"Hanogt\"\nIO.puts(\"Hello World from #{name}!\")\n",
    },
    {
        id: "erlang", name: "Erlang", monaco: "erlang", extensions: ["erl", "hrl"],
        aliases: ["erl"], engine: "server", server: true, wandbox: { names: ["erlang"], prefer: ["erlang"] },
        category: "functional", color: "#A90533", icon: svg("erlang"), defaultFileName: "prog.erl",
        // Wandbox saves the file as prog.erl; exporting main/0 and main/1 works for both launch styles.
        template: "-module(prog).\n-export([main/0, main/1]).\n\nmain() ->\n    io:format(\"Hello World from Hanogt!~n\").\n\nmain(_Args) ->\n    main().\n",
    },
    {
        id: "nim", name: "Nim", monaco: "nim", extensions: ["nim", "nims"],
        engine: "server", server: true, wandbox: { names: ["nim"], prefer: ["nim"] },
        category: "systems", color: "#E0B400", icon: svg("nim"), defaultFileName: "main.nim",
        template: "let name = \"Hanogt\"\necho \"Hello World from \", name, \"!\"\n",
    },
    {
        id: "d", name: "D", monaco: "d", extensions: ["d"],
        aliases: ["dlang"], engine: "server", server: true, wandbox: { names: ["d"], prefer: ["dmd", "ldc", "gdc"] },
        category: "systems", color: "#B03931", icon: svg("d"), defaultFileName: "main.d",
        template: "import std.stdio;\n\nvoid main()\n{\n    writeln(\"Hello World from Hanogt!\");\n}\n",
    },
    {
        id: "crystal", name: "Crystal", monaco: "ruby", extensions: ["cr"],
        aliases: ["cr"], engine: "server", server: true, wandbox: { names: ["crystal"], prefer: ["crystal"] },
        category: "systems", color: "#2E2E2E", icon: svg("crystal"), defaultFileName: "main.cr",
        template: "name = \"Hanogt\"\nputs \"Hello World from #{name}!\"\n",
    },
    {
        id: "bash", name: "Bash", monaco: "shell", extensions: ["sh", "bash"],
        aliases: ["sh", "shell", "shell script", "bash script", "shellscript", "zsh"], engine: "server", server: true,
        wandbox: { names: ["bash script", "bash", "shell script"], prefer: ["bash"] },
        category: "scripting", color: "#4EAA25", icon: svg("bash"), defaultFileName: "script.sh",
        template: "#!/bin/bash\nname=\"Hanogt\"\necho \"Hello World from ${name}!\"\n",
    },
    {
        id: "pascal", name: "Pascal", monaco: "pascal", extensions: ["pas", "pp", "dpr"],
        aliases: ["pas", "fpc", "freepascal", "delphi"], engine: "server", server: true,
        wandbox: { names: ["pascal"], prefer: ["fpc"] },
        category: "systems", color: "#3E6FB0", icon: svg("pascal"), defaultFileName: "main.pas",
        template: "program Hello;\nbegin\n  writeln('Hello World from Hanogt!');\nend.\n",
    },
    {
        id: "ocaml", name: "OCaml", monaco: "ocaml", extensions: ["ml", "mli"],
        aliases: ["ml"], engine: "server", server: true, wandbox: { names: ["ocaml"], prefer: ["ocaml"] },
        category: "functional", color: "#EC6813", icon: svg("ocaml"), defaultFileName: "main.ml",
        template: "let () =\n  let name = \"Hanogt\" in\n  Printf.printf \"Hello World from %s!\\n\" name\n",
    },
    {
        id: "zig", name: "Zig", monaco: "zig", extensions: ["zig", "zon"],
        engine: "server", server: true, wandbox: { names: ["zig"], prefer: ["zig"] },
        category: "systems", color: "#F7A41D", icon: svg("zig"), defaultFileName: "main.zig",
        // std.debug.print is stable across Zig releases (it writes to stderr).
        template: "const std = @import(\"std\");\n\npub fn main() void {\n    std.debug.print(\"Hello World from {s}!\\n\", .{\"Hanogt\"});\n}\n",
    },
    {
        id: "julia", name: "Julia", monaco: "julia", extensions: ["jl"],
        aliases: ["jl"], engine: "server", server: true, wandbox: { names: ["julia"], prefer: ["julia"] },
        category: "data", color: "#9558B2", icon: svg("julia"), defaultFileName: "main.jl",
        template: "name = \"Hanogt\"\nprintln(\"Hello World from $name!\")\n",
    },
    {
        id: "r", name: "R", monaco: "r", extensions: ["r"],
        aliases: ["rscript", "rlang"], engine: "server", server: true, wandbox: { names: ["r"], prefer: ["r"] },
        category: "data", color: "#276DC3", icon: svg("r"), defaultFileName: "main.r",
        template: "name <- \"Hanogt\"\ncat(\"Hello World from\", paste0(name, \"!\"), \"\\n\")\n",
    },
    {
        id: "groovy", name: "Groovy", monaco: "groovy", extensions: ["groovy", "gvy", "gradle"],
        engine: "server", server: true, wandbox: { names: ["groovy"], prefer: ["groovy"] },
        category: "jvm", color: "#4298B8", icon: svg("groovy"), defaultFileName: "main.groovy",
        template: "def name = \"Hanogt\"\nprintln \"Hello World from ${name}!\"\n",
    },
    {
        id: "lisp", name: "Common Lisp", monaco: "commonlisp", extensions: ["lisp", "lsp", "cl"],
        aliases: ["common lisp", "commonlisp", "common-lisp", "sbcl", "clisp", "cl"], engine: "server", server: true,
        wandbox: { names: ["lisp", "common lisp"], prefer: ["sbcl", "clisp"] },
        category: "functional", color: "#3FB68B", icon: svg("lisp"), defaultFileName: "main.lisp",
        template: "(defun greet (name)\n  (format t \"Hello World from ~a!~%\" name))\n\n(greet \"Hanogt\")\n",
    },
    {
        id: "fsharp", name: "F#", monaco: "fsharp", extensions: ["fs", "fsx", "fsi"],
        aliases: ["f#", "fs"], engine: "server", server: true, wandbox: { names: ["f#"], prefer: ["fsharp", "dotnet"] },
        category: "dotnet", color: "#378BBA", icon: svg("fsharp"), defaultFileName: "main.fs",
        template: "let name = \"Hanogt\"\nprintfn \"Hello World from %s!\" name\n",
    },
    {
        id: "coffeescript", name: "CoffeeScript", monaco: "coffeescript", extensions: ["coffee"],
        aliases: ["coffee"], engine: "server", server: true, wandbox: { names: ["coffeescript"], prefer: ["coffeescript"] },
        category: "web", color: "#244776", icon: svg("coffeescript"), defaultFileName: "main.coffee",
        template: "name = \"Hanogt\"\nconsole.log \"Hello World from #{name}!\"\n",
    },
    {
        id: "pony", name: "Pony", monaco: "pony", extensions: ["pony"],
        aliases: ["ponylang", "ponyc"], engine: "server", server: true, wandbox: { names: ["pony"], prefer: ["pony"] },
        category: "systems", color: "#9C4D1B", icon: svg("pony"), defaultFileName: "main.pony",
        template: "actor Main\n  new create(env: Env) =>\n    env.out.print(\"Hello World from Hanogt!\")\n",
    },
    {
        id: "vim", name: "Vim script", monaco: "vimscript", extensions: ["vim"],
        fileNames: ["vimrc", ".vimrc"], aliases: ["vimscript", "viml", "vim script"], engine: "server", server: true,
        wandbox: { names: ["vim script", "vim"], prefer: ["vim"] },
        category: "scripting", color: "#019733", icon: svg("vim"), defaultFileName: "main.vim",
        template: "\" Hanogt Codev · Vim script\nlet s:name = 'Hanogt'\necho 'Hello World from ' . s:name . '!'\n",
    },

    // ------------------------------------------------------------ edit only
    {
        id: "plaintext", name: "Plain text", monaco: "plaintext", extensions: ["txt", "text", "log"],
        aliases: ["text", "txt", "plain"], engine: "none",
        category: "docs", color: "#71717A", icon: svg("plaintext"), defaultFileName: "notes.txt",
        template: "",
    },
    {
        id: "scss", name: "SCSS", monaco: "scss", extensions: ["scss"],
        aliases: ["sass"], engine: "none", category: "web", color: "#CC6699", icon: svg("scss"), defaultFileName: "style.scss",
        template: "$primary: #6366f1;\n\n.button {\n  background: $primary;\n  border-radius: 0.75rem;\n\n  &:hover {\n    background: darken($primary, 10%);\n  }\n}\n",
    },
    {
        id: "less", name: "Less", monaco: "less", extensions: ["less"],
        engine: "none", category: "web", color: "#1D365D", icon: svg("less"), defaultFileName: "style.less",
        template: "@primary: #6366f1;\n\n.button {\n  background: @primary;\n  &:hover { background: darken(@primary, 10%); }\n}\n",
    },
    {
        id: "dockerfile", name: "Dockerfile", monaco: "dockerfile", extensions: ["dockerfile"],
        fileNames: ["Dockerfile", "Containerfile"], aliases: ["docker"], engine: "none",
        category: "config", color: "#2496ED", icon: svg("dockerfile"), defaultFileName: "Dockerfile",
        template: "FROM node:22-alpine\nWORKDIR /app\nCOPY . .\nCMD [\"node\", \"main.js\"]\n",
    },
    {
        id: "hcl", name: "HCL (Terraform)", monaco: "hcl", extensions: ["tf", "tfvars", "hcl"],
        aliases: ["terraform"], engine: "none", category: "config", color: "#7B42BC", icon: svg("hcl"), defaultFileName: "main.tf",
        template: "variable \"greeting\" {\n  type    = string\n  default = \"Hello World from Hanogt!\"\n}\n\noutput \"message\" {\n  value = var.greeting\n}\n",
    },
    {
        id: "powershell", name: "PowerShell", monaco: "powershell", extensions: ["ps1", "psm1", "psd1"],
        aliases: ["ps1", "pwsh"], engine: "none", category: "scripting", color: "#5391FE", icon: svg("powershell"), defaultFileName: "script.ps1",
        template: "$name = \"Hanogt\"\nWrite-Output \"Hello World from $name!\"\n",
    },
    {
        id: "bat", name: "Batch", monaco: "bat", extensions: ["bat", "cmd"],
        aliases: ["batch", "cmd"], engine: "none", category: "scripting", color: "#4D4D4D", icon: svg("bat"), defaultFileName: "script.bat",
        template: "@echo off\nset NAME=Hanogt\necho Hello World from %NAME%!\n",
    },
    {
        id: "tcl", name: "Tcl", monaco: "tcl", extensions: ["tcl"],
        engine: "none", category: "scripting", color: "#C3A86B", icon: svg("tcl"), defaultFileName: "main.tcl",
        template: "set name \"Hanogt\"\nputs \"Hello World from $name!\"\n",
    },
    {
        id: "mysql", name: "MySQL", monaco: "mysql", extensions: ["mysql"],
        engine: "none", category: "data", color: "#4479A1", icon: svg("mysql"), defaultFileName: "query.mysql",
        template: "CREATE TABLE users (\n  id INT AUTO_INCREMENT PRIMARY KEY,\n  name VARCHAR(100) NOT NULL\n);\n\nSELECT 'Hello World from Hanogt!' AS message;\n",
    },
    {
        id: "pgsql", name: "PostgreSQL", monaco: "pgsql", extensions: ["pgsql", "psql"],
        aliases: ["postgres", "postgresql"], engine: "none", category: "data", color: "#4169E1", icon: svg("pgsql"), defaultFileName: "query.pgsql",
        template: "CREATE TABLE users (\n  id SERIAL PRIMARY KEY,\n  name TEXT NOT NULL\n);\n\nSELECT 'Hello World from Hanogt!' AS message;\n",
    },
    {
        id: "graphql", name: "GraphQL", monaco: "graphql", extensions: ["graphql", "gql"],
        aliases: ["gql"], engine: "none", category: "data", color: "#E10098", icon: svg("graphql"), defaultFileName: "query.graphql",
        template: "query Greeting {\n  greeting(name: \"Hanogt\") {\n    text\n  }\n}\n",
    },
    {
        id: "protobuf", name: "Protocol Buffers", monaco: "proto", extensions: ["proto"],
        aliases: ["proto"], engine: "none", category: "data", color: "#0F9D58", icon: svg("protobuf"), defaultFileName: "greeting.proto",
        template: "syntax = \"proto3\";\n\nmessage Greeting {\n  string text = 1;\n}\n",
    },
    {
        id: "dart", name: "Dart", monaco: "dart", extensions: ["dart"],
        engine: "none", category: "general", color: "#0175C2", icon: svg("dart"), defaultFileName: "main.dart",
        template: "void main() {\n  final name = 'Hanogt';\n  print('Hello World from $name!');\n}\n",
    },
    {
        id: "objective-c", name: "Objective-C", monaco: "objective-c", extensions: ["m", "mm"],
        aliases: ["objc", "objectivec"], engine: "none", category: "systems", color: "#438EFF", icon: svg("objective-c"), defaultFileName: "main.m",
        template: "#import <Foundation/Foundation.h>\n\nint main(int argc, const char *argv[]) {\n    @autoreleasepool {\n        NSLog(@\"Hello World from Hanogt!\");\n    }\n    return 0;\n}\n",
    },
    {
        id: "vb", name: "Visual Basic", monaco: "vb", extensions: ["vb"],
        aliases: ["vb.net", "vbnet", "visual basic"], engine: "none", category: "dotnet", color: "#945DB7", icon: svg("vb"), defaultFileName: "Program.vb",
        template: "Module Program\n    Sub Main()\n        Console.WriteLine(\"Hello World from Hanogt!\")\n    End Sub\nEnd Module\n",
    },
    {
        id: "clojure", name: "Clojure", monaco: "clojure", extensions: ["clj", "cljs", "cljc", "edn"],
        aliases: ["clj"], engine: "none", category: "functional", color: "#5881D8", icon: svg("clojure"), defaultFileName: "main.clj",
        template: "(defn greet [name]\n  (str \"Hello World from \" name \"!\"))\n\n(println (greet \"Hanogt\"))\n",
    },
    {
        id: "solidity", name: "Solidity", monaco: "sol", extensions: ["sol"],
        aliases: ["sol"], engine: "none", category: "other", color: "#363636", icon: svg("solidity"), defaultFileName: "Hello.sol",
        template: "// SPDX-License-Identifier: MIT\npragma solidity ^0.8.24;\n\ncontract Hello {\n    string public greeting = \"Hello World from Hanogt!\";\n}\n",
    },
    {
        id: "systemverilog", name: "SystemVerilog", monaco: "systemverilog", extensions: ["sv", "svh"],
        aliases: ["sverilog"], engine: "none", category: "hardware", color: "#4A6B8A", icon: svg("systemverilog"), defaultFileName: "hello.sv",
        template: "module hello;\n  initial begin\n    $display(\"Hello World from Hanogt!\");\n  end\nendmodule\n",
    },
    {
        id: "verilog", name: "Verilog", monaco: "verilog", extensions: ["v", "vh"],
        engine: "none", category: "hardware", color: "#848BF3", icon: svg("verilog"), defaultFileName: "hello.v",
        template: "module hello;\n  initial begin\n    $display(\"Hello World from Hanogt!\");\n    $finish;\n  end\nendmodule\n",
    },
    {
        id: "vhdl", name: "VHDL", monaco: "vhdl", extensions: ["vhd", "vhdl"],
        engine: "none", category: "hardware", color: "#ADB2CB", icon: svg("vhdl"), defaultFileName: "hello.vhd",
        template: "library ieee;\nuse ieee.std_logic_1164.all;\n\nentity hello is\nend entity hello;\n\narchitecture sim of hello is\nbegin\n  process\n  begin\n    report \"Hello World from Hanogt!\";\n    wait;\n  end process;\nend architecture sim;\n",
    },
    {
        id: "pla", name: "PLA", monaco: "pla", extensions: ["pla"],
        aliases: ["espresso"], engine: "none", category: "hardware", color: "#64748B", icon: svg("pla"), defaultFileName: "logic.pla",
        template: "# Hanogt Codev · PLA (Berkeley espresso format)\n.i 2\n.o 1\n.ilb a b\n.ob y\n.p 2\n10 1\n01 1\n.e\n",
    },
    {
        id: "st", name: "Structured Text", monaco: "st", extensions: ["st", "iecst"],
        aliases: ["iec 61131-3", "plc"], engine: "none", category: "hardware", color: "#E37222", icon: svg("st"), defaultFileName: "main.st",
        template: "PROGRAM Main\nVAR\n    counter : INT := 0;\n    message : STRING := 'Hello World from Hanogt!';\nEND_VAR\n\ncounter := counter + 1;\nIF counter > 10 THEN\n    counter := 0;\nEND_IF;\nEND_PROGRAM\n",
    },
    {
        id: "nasm", name: "x86 Assembly (NASM)", monaco: "nasm", extensions: ["nasm"],
        aliases: ["x86", "x86-64", "x86asm", "yasm", "intel assembly"], engine: "none", category: "assembly", color: "#6E4C13", icon: svg("nasm"), defaultFileName: "hello.nasm",
        template: "; Hanogt Codev · x86-64 Linux (NASM)\n        global  _start\n\n        section .data\nmsg:    db      \"Hello World from Hanogt!\", 10\nlen:    equ     $ - msg\n\n        section .text\n_start: mov     rax, 1          ; write\n        mov     rdi, 1          ; stdout\n        mov     rsi, msg\n        mov     rdx, len\n        syscall\n        mov     rax, 60         ; exit\n        xor     rdi, rdi\n        syscall\n",
    },
    {
        id: "fortran", name: "Fortran", monaco: "fortran", extensions: ["f90", "f95", "f03", "f08", "f", "for", "f77"],
        aliases: ["gfortran", "f90"], engine: "none", category: "systems", color: "#734F96", icon: svg("fortran"), defaultFileName: "hello.f90",
        template: "program hello\n  implicit none\n  character(len=*), parameter :: name = \"Hanogt\"\n  integer :: i\n\n  print *, \"Hello World from \", name, \"!\"\n  do i = 1, 3\n    print '(A, I0)', \"Line \", i\n  end do\nend program hello\n",
    },
    {
        id: "cobol", name: "COBOL", monaco: "cobol", extensions: ["cob", "cbl", "cpy"],
        aliases: ["gnucobol"], engine: "none", category: "other", color: "#005CA5", icon: svg("cobol"), defaultFileName: "hello.cob",
        template: "       IDENTIFICATION DIVISION.\n       PROGRAM-ID. HELLO.\n       PROCEDURE DIVISION.\n           DISPLAY \"Hello World from Hanogt!\".\n           STOP RUN.\n",
    },
    {
        id: "ada", name: "Ada", monaco: "ada", extensions: ["adb", "ads", "ada"],
        aliases: ["gnat"], engine: "none", category: "systems", color: "#02F88C", icon: svg("ada"), defaultFileName: "hello.adb",
        template: "with Ada.Text_IO; use Ada.Text_IO;\n\nprocedure Hello is\nbegin\n   Put_Line (\"Hello World from Hanogt!\");\nend Hello;\n",
    },
    {
        id: "odin", name: "Odin", monaco: "odin", extensions: ["odin"],
        engine: "none", category: "systems", color: "#3882D2", icon: svg("odin"), defaultFileName: "main.odin",
        template: "package main\n\nimport \"core:fmt\"\n\nmain :: proc() {\n\tfmt.println(\"Hello World from Hanogt!\")\n}\n",
    },
    {
        id: "vlang", name: "V (Vlang)", monaco: "vlang", extensions: ["vsh", "vv"],
        aliases: ["vlang", "v language"], engine: "none", category: "systems", color: "#5D87BF", icon: svg("vlang"), defaultFileName: "main.vsh",
        // Verilog owns the .v extension; V files here use .vsh / .vv.
        template: "fn main() {\n\tname := 'Hanogt'\n\tprintln('Hello World from ${name}!')\n}\n",
    },
    {
        id: "modula3", name: "Modula-3", monaco: "m3", extensions: ["m3", "i3", "mg", "ig"],
        aliases: ["m3", "modula3"], engine: "none", category: "systems", color: "#223388", icon: svg("modula3"), defaultFileName: "Main.m3",
        template: "MODULE Main;\nIMPORT IO;\nBEGIN\n  IO.Put(\"Hello World from Hanogt!\\n\");\nEND Main.\n",
    },
    {
        id: "elm", name: "Elm", monaco: "elm", extensions: ["elm"],
        engine: "none", category: "functional", color: "#60B5CC", icon: svg("elm"), defaultFileName: "Main.elm",
        template: "module Main exposing (main)\n\nimport Html exposing (text)\n\n\nmain =\n    text \"Hello World from Hanogt!\"\n",
    },
    {
        id: "gleam", name: "Gleam", monaco: "gleam", extensions: ["gleam"],
        engine: "none", category: "functional", color: "#FFAFF3", icon: svg("gleam"), defaultFileName: "main.gleam",
        template: "import gleam/io\n\npub fn main() {\n  io.println(\"Hello World from Hanogt!\")\n}\n",
    },
    {
        id: "ats", name: "ATS", monaco: "postiats", extensions: ["dats", "sats", "hats"],
        aliases: ["postiats", "ats2"], engine: "none", category: "functional", color: "#1AC620", icon: svg("ats"), defaultFileName: "main.dats",
        template: "implement main0 () = println! (\"Hello World from Hanogt!\")\n",
    },
    {
        id: "cameligo", name: "CameLIGO", monaco: "cameligo", extensions: ["mligo"],
        engine: "none", category: "functional", color: "#0E74FF", icon: svg("cameligo"), defaultFileName: "main.mligo",
        template: "type storage = string\n\n[@entry]\nlet greet (_ : unit) (_ : storage) : operation list * storage =\n  [], \"Hello World from Hanogt!\"\n",
    },
    {
        id: "pascaligo", name: "PascaLIGO", monaco: "pascaligo", extensions: ["ligo"],
        engine: "none", category: "other", color: "#0B5ED7", icon: svg("pascaligo"), defaultFileName: "main.ligo",
        template: "type storage is string\n\nfunction main (const _ : unit; const _ : storage) : list (operation) * storage is\n  ((nil : list (operation)), \"Hello World from Hanogt!\")\n",
    },
    {
        id: "flow9", name: "Flow9", monaco: "flow9", extensions: ["flow"],
        aliases: ["flow"], engine: "none", category: "general", color: "#2E7D32", icon: svg("flow9"), defaultFileName: "main.flow",
        template: "import runtime;\n\nmain() {\n    println(\"Hello World from Hanogt!\");\n}\n",
    },
    {
        id: "qsharp", name: "Q#", monaco: "qsharp", extensions: ["qs"],
        aliases: ["q#", "q-sharp"], engine: "none", category: "other", color: "#5C2D91", icon: svg("qsharp"), defaultFileName: "Main.qs",
        template: "namespace Hanogt {\n    @EntryPoint()\n    operation Main() : Unit {\n        Message(\"Hello World from Hanogt!\");\n        use qubit = Qubit();\n        H(qubit);\n        let result = M(qubit);\n        Message($\"Measured {result}\");\n        Reset(qubit);\n    }\n}\n",
    },
    {
        id: "abap", name: "ABAP", monaco: "abap", extensions: ["abap"],
        aliases: ["sap abap"], engine: "none", category: "other", color: "#0FAAFF", icon: svg("abap"), defaultFileName: "zhello.abap",
        template: "REPORT zhello.\n\nDATA lv_name TYPE string VALUE 'Hanogt'.\nWRITE: / 'Hello World from', lv_name.\n",
    },
    {
        id: "apex", name: "Apex", monaco: "apex", extensions: ["cls", "trigger", "apex"],
        aliases: ["salesforce apex"], engine: "none", category: "other", color: "#00A1E0", icon: svg("apex"), defaultFileName: "Hello.cls",
        template: "public class Hello {\n    public static void greet() {\n        System.debug('Hello World from Hanogt!');\n    }\n}\n",
    },
    {
        id: "sophia", name: "Sophia", monaco: "aes", extensions: ["aes"],
        engine: "none", category: "other", color: "#DE3F6B", icon: svg("sophia"), defaultFileName: "Hello.aes",
        template: "contract Hello =\n  entrypoint greet() : string = \"Hello World from Hanogt!\"\n",
    },
    {
        id: "lexon", name: "Lexon", monaco: "lexon", extensions: ["lex"],
        engine: "none", category: "other", color: "#6D28D9", icon: svg("lexon"), defaultFileName: "contract.lex",
        template: "LEX Hello World.\n\n\"Greeter\" is a person.\n\"Message\" is a text.\n\nThe Greeter fixes the Message as \"Hello World from Hanogt!\".\n",
    },
    {
        id: "ecl", name: "ECL", monaco: "ecl", extensions: ["ecl"],
        aliases: ["hpcc"], engine: "none", category: "data", color: "#2B6CB0", icon: svg("ecl"), defaultFileName: "hello.ecl",
        template: "// Hanogt Codev · ECL (HPCC Systems)\nOUTPUT('Hello World from Hanogt!');\n",
    },
    {
        id: "cypher", name: "Cypher", monaco: "cypher", extensions: ["cypher", "cyp"],
        aliases: ["opencypher", "neo4j"], engine: "none", category: "data", color: "#008CC1", icon: svg("cypher"), defaultFileName: "query.cypher",
        template: "// Hanogt Codev · Cypher (Neo4j)\nCREATE (g:Greeting {text: 'Hello World from Hanogt!'})\nRETURN g.text AS message;\n\nMATCH (p:Person)-[:KNOWS]->(friend)\nWHERE p.name = 'Ada'\nRETURN friend.name;\n",
    },
    {
        id: "sparql", name: "SPARQL", monaco: "sparql", extensions: ["rq", "sparql"],
        engine: "none", category: "data", color: "#0C479C", icon: svg("sparql"), defaultFileName: "query.rq",
        template: "PREFIX foaf: <http://xmlns.com/foaf/0.1/>\n\nSELECT ?name\nWHERE {\n  ?person a foaf:Person ;\n          foaf:name ?name .\n}\nLIMIT 10\n",
    },
    {
        id: "redis", name: "Redis", monaco: "redis", extensions: ["redis"],
        engine: "none", category: "data", color: "#DC382D", icon: svg("redis"), defaultFileName: "commands.redis",
        template: "SET greeting \"Hello World from Hanogt!\"\nGET greeting\nINCR visits\nEXPIRE greeting 3600\n",
    },
    {
        id: "redshift", name: "Amazon Redshift", monaco: "redshift", extensions: ["redshift"],
        aliases: ["aws redshift"], engine: "none", category: "data", color: "#8C4FFF", icon: svg("redshift"), defaultFileName: "query.redshift",
        template: "-- Hanogt Codev · Amazon Redshift\nCREATE TABLE greetings (id INT IDENTITY(1, 1), text VARCHAR(100)) DISTSTYLE AUTO;\nINSERT INTO greetings (text) VALUES ('Hello World from Hanogt!');\nSELECT text FROM greetings;\n",
    },
    {
        id: "dax", name: "DAX", monaco: "msdax", extensions: ["dax", "msdax"],
        aliases: ["msdax", "power bi dax"], engine: "none", category: "data", color: "#F2C811", icon: svg("dax"), defaultFileName: "measures.dax",
        template: "Greeting = \"Hello World from Hanogt!\"\n\nTotal Sales = SUM ( Sales[Amount] )\n\nSales YoY % =\nVAR LastYear = CALCULATE ( [Total Sales], SAMEPERIODLASTYEAR ( 'Date'[Date] ) )\nRETURN DIVIDE ( [Total Sales] - LastYear, LastYear )\n",
    },
    {
        id: "powerquery", name: "Power Query M", monaco: "powerquery", extensions: ["pq", "pqm"],
        aliases: ["power query", "m language"], engine: "none", category: "data", color: "#107C10", icon: svg("powerquery"), defaultFileName: "query.pq",
        template: "let\n    Source = #table({\"Message\"}, {{\"Hello World from Hanogt!\"}}),\n    Upper = Table.TransformColumns(Source, {{\"Message\", Text.Upper}})\nin\n    Upper\n",
    },
    {
        id: "typespec", name: "TypeSpec", monaco: "typespec", extensions: ["tsp"],
        engine: "none", category: "data", color: "#7C5CFF", icon: svg("typespec"), defaultFileName: "main.tsp",
        template: "import \"@typespec/http\";\nusing TypeSpec.Http;\n\nmodel Greeting {\n  message: string;\n}\n\n@route(\"/greeting\")\nop greet(): Greeting;\n",
    },
    {
        id: "prisma", name: "Prisma", monaco: "prisma", extensions: ["prisma"],
        engine: "none", category: "data", color: "#2D3748", icon: svg("prisma"), defaultFileName: "schema.prisma",
        template: "// Hanogt Codev · Prisma schema\ndatasource db {\n  provider = \"postgresql\"\n  url      = env(\"DATABASE_URL\")\n}\n\ngenerator client {\n  provider = \"prisma-client-js\"\n}\n\nmodel Greeting {\n  id        Int      @id @default(autoincrement())\n  text      String   @default(\"Hello World from Hanogt!\")\n  createdAt DateTime @default(now())\n}\n",
    },
    {
        id: "bicep", name: "Bicep", monaco: "bicep", extensions: ["bicep"],
        aliases: ["azure bicep"], engine: "none", category: "config", color: "#519ABA", icon: svg("bicep"), defaultFileName: "main.bicep",
        template: "param location string = resourceGroup().location\nparam greeting string = 'Hello World from Hanogt!'\n\nresource storage 'Microsoft.Storage/storageAccounts@2023-01-01' = {\n  name: 'hanogtstorage'\n  location: location\n  sku: {\n    name: 'Standard_LRS'\n  }\n  kind: 'StorageV2'\n}\n\noutput message string = greeting\n",
    },
    {
        id: "azcli", name: "Azure CLI", monaco: "azcli", extensions: ["azcli"],
        aliases: ["az"], engine: "none", category: "scripting", color: "#0078D4", icon: svg("azcli"), defaultFileName: "script.azcli",
        template: "# Hanogt Codev · Azure CLI\naz login\naz group create --name hanogt-rg --location westeurope\naz group list --output table\n",
    },
    {
        id: "makefile", name: "Makefile", monaco: "makefile", extensions: ["mk", "mak", "make"],
        fileNames: ["Makefile", "makefile", "GNUmakefile"], aliases: ["make", "gnu make"], engine: "none", category: "config", color: "#427819", icon: svg("makefile"), defaultFileName: "Makefile",
        template: "# Hanogt Codev · Makefile\nCC := gcc\nCFLAGS := -Wall -O2\n\nhello: main.c\n\t$(CC) $(CFLAGS) -o $@ $<\n\n.PHONY: run clean\nrun: hello\n\t./hello\n\nclean:\n\trm -f hello\n",
    },
    {
        id: "cmake", name: "CMake", monaco: "cmake", extensions: ["cmake"],
        fileNames: ["CMakeLists.txt"], engine: "none", category: "config", color: "#064F8C", icon: svg("cmake"), defaultFileName: "CMakeLists.txt",
        template: "cmake_minimum_required(VERSION 3.20)\nproject(Hello LANGUAGES CXX)\n\nset(CMAKE_CXX_STANDARD 20)\nadd_executable(hello main.cpp)\nmessage(STATUS \"Hello World from Hanogt!\")\n",
    },
    {
        id: "nginx", name: "Nginx", monaco: "nginx", extensions: ["nginx"],
        fileNames: ["nginx.conf"], aliases: ["nginx.conf"], engine: "none", category: "config", color: "#009639", icon: svg("nginx"), defaultFileName: "nginx.conf",
        template: "# Hanogt Codev · nginx\nserver {\n    listen 80;\n    server_name example.com;\n\n    location / {\n        add_header Content-Type text/plain;\n        return 200 \"Hello World from Hanogt!\\n\";\n    }\n\n    location /static/ {\n        root /var/www;\n        expires 7d;\n    }\n}\n",
    },
    {
        id: "csp", name: "Content Security Policy", monaco: "csp", extensions: ["csp"],
        aliases: ["content-security-policy"], engine: "none", category: "web", color: "#2563EB", icon: svg("csp"), defaultFileName: "policy.csp",
        template: "default-src 'self';\nscript-src 'self' 'nonce-hanogt';\nimg-src 'self' data: https:;\nobject-src 'none';\nframe-ancestors 'none'\n",
    },
    {
        id: "wgsl", name: "WGSL", monaco: "wgsl", extensions: ["wgsl"],
        aliases: ["webgpu shading language", "webgpu"], engine: "none", category: "web", color: "#005A9C", icon: svg("wgsl"), defaultFileName: "shader.wgsl",
        template: "// Hanogt Codev · WGSL (WebGPU)\n@vertex\nfn vs_main(@builtin(vertex_index) index: u32) -> @builtin(position) vec4f {\n    var positions = array<vec2f, 3>(vec2f(0.0, 0.5), vec2f(-0.5, -0.5), vec2f(0.5, -0.5));\n    return vec4f(positions[index], 0.0, 1.0);\n}\n\n@fragment\nfn fs_main() -> @location(0) vec4f {\n    return vec4f(0.39, 0.4, 0.95, 1.0);\n}\n",
    },
    {
        id: "razor", name: "Razor", monaco: "razor", extensions: ["cshtml", "razor"],
        aliases: ["cshtml", "blazor"], engine: "none", category: "dotnet", color: "#512BD4", icon: svg("razor"), defaultFileName: "Hello.cshtml",
        template: "@page \"/hello\"\n@{\n    var name = \"Hanogt\";\n}\n<h1>Hello World from @name!</h1>\n<p>Today is @DateTime.Now.ToShortDateString()</p>\n",
    },
    {
        id: "handlebars", name: "Handlebars", monaco: "handlebars", extensions: ["hbs", "handlebars", "mustache"],
        aliases: ["hbs"], engine: "none", category: "templates", color: "#F0772B", icon: svg("handlebars"), defaultFileName: "template.hbs",
        template: "{{!-- Hanogt Codev · Handlebars --}}\n<h1>Hello World from {{name}}!</h1>\n<ul>\n  {{#each languages}}\n    <li>{{this}}</li>\n  {{/each}}\n</ul>\n",
    },
    {
        id: "liquid", name: "Liquid", monaco: "liquid", extensions: ["liquid"],
        aliases: ["shopify liquid"], engine: "none", category: "templates", color: "#67B8DE", icon: svg("liquid"), defaultFileName: "page.liquid",
        template: "{% comment %} Hanogt Codev · Liquid {% endcomment %}\n{% assign name = \"Hanogt\" %}\n<h1>Hello World from {{ name }}!</h1>\n{% for language in languages %}\n  <p>{{ language | upcase }}</p>\n{% endfor %}\n",
    },
    {
        id: "twig", name: "Twig", monaco: "twig", extensions: ["twig"],
        engine: "none", category: "templates", color: "#BACF29", icon: svg("twig"), defaultFileName: "page.twig",
        template: "{# Hanogt Codev · Twig #}\n{% set name = \"Hanogt\" %}\n<h1>Hello World from {{ name }}!</h1>\n{% for language in languages %}\n  <p>{{ language|upper }}</p>\n{% endfor %}\n",
    },
    {
        id: "pug", name: "Pug", monaco: "pug", extensions: ["pug", "jade"],
        aliases: ["jade"], engine: "none", category: "templates", color: "#A86454", icon: svg("pug"), defaultFileName: "index.pug",
        template: "//- Hanogt Codev · Pug\ndoctype html\nhtml(lang=\"en\")\n  head\n    title Hanogt\n  body\n    h1 Hello World from Hanogt!\n    ul\n      each language in [\"JavaScript\", \"Python\"]\n        li= language\n",
    },
    {
        id: "freemarker", name: "FreeMarker", monaco: "freemarker2", extensions: ["ftl", "ftlh", "ftlx"],
        aliases: ["freemarker2", "ftl"], engine: "none", category: "templates", color: "#326CAC", icon: svg("freemarker"), defaultFileName: "page.ftl",
        template: "<#-- Hanogt Codev · FreeMarker -->\n<#assign name = \"Hanogt\">\n<h1>Hello World from ${name}!</h1>\n<#list [\"JavaScript\", \"Python\"] as language>\n  <p>${language}</p>\n</#list>\n",
    },
    {
        id: "mdx", name: "MDX", monaco: "mdx", extensions: ["mdx"],
        engine: "none", category: "docs", color: "#F9AC00", icon: svg("mdx"), defaultFileName: "page.mdx",
        template: "import { Chart } from './chart'\n\n# Hello World from Hanogt!\n\nMDX mixes **Markdown** with JSX components:\n\n<Chart year={2026} />\n",
    },
    {
        id: "rst", name: "reStructuredText", monaco: "restructuredtext", extensions: ["rst", "rest"],
        aliases: ["restructuredtext", "rest"], engine: "none", category: "docs", color: "#3C3C3C", icon: svg("rst"), defaultFileName: "README.rst",
        template: "Hello World from Hanogt!\n========================\n\nThis is **reStructuredText**.\n\n- Item one\n- Item two\n\n.. code-block:: python\n\n   print(\"Hello World from Hanogt!\")\n",
    },
    {
        id: "smallbasic", name: "Small Basic", monaco: "sb", extensions: ["sb", "smallbasic"],
        aliases: ["sb"], engine: "none", category: "other", color: "#0078D4", icon: svg("smallbasic"), defaultFileName: "main.sb",
        template: "name = \"Hanogt\"\nTextWindow.WriteLine(\"Hello World from \" + name + \"!\")\n",
    },
];

// ------------------------------------------------------------------ lookups
const BY_ID = new Map<string, LanguageInfo>();
const BY_ALIAS = new Map<string, LanguageInfo>();
const BY_EXTENSION = new Map<string, LanguageInfo>();
const BY_FILE_NAME = new Map<string, LanguageInfo>();

for (const language of LANGUAGES) {
    BY_ID.set(language.id, language);
    for (const extension of language.extensions) if (!BY_EXTENSION.has(extension)) BY_EXTENSION.set(extension, language);
    for (const fileName of language.fileNames ?? []) BY_FILE_NAME.set(fileName.toLowerCase(), language);
}
// Ids win over aliases, aliases over display names, display names over extensions.
for (const language of LANGUAGES) for (const alias of language.aliases ?? []) if (!BY_ID.has(alias) && !BY_ALIAS.has(alias)) BY_ALIAS.set(alias, language);
for (const language of LANGUAGES) {
    const name = language.name.toLowerCase();
    if (!BY_ID.has(name) && !BY_ALIAS.has(name)) BY_ALIAS.set(name, language);
}

export const PLAINTEXT_LANGUAGE: LanguageInfo = BY_ID.get("plaintext")!;

/** Exact id lookup. */
export function getLanguage(id: string | null | undefined): LanguageInfo | undefined {
    return id ? BY_ID.get(id) : undefined;
}

/**
 * Accepts an id, alias, display name or file extension (".py", "py", "C++",
 * "golang", "CSharp"…) and returns the canonical id, or null when unknown.
 */
export function normalizeLanguageId(value: string | null | undefined): string | null {
    if (typeof value !== "string") return null;
    const key = value.trim().toLowerCase().replace(/^\./, "");
    if (!key || key.length > 40) return null;
    const found = BY_ID.get(key) ?? BY_ALIAS.get(key) ?? BY_EXTENSION.get(key);
    return found ? found.id : null;
}

/** Like {@link normalizeLanguageId} but never fails: unknown values become plain text. */
export function resolveLanguage(value: string | null | undefined): LanguageInfo {
    return BY_ID.get(normalizeLanguageId(value) ?? "") ?? PLAINTEXT_LANGUAGE;
}

/** Detects the language of a file from its name ("main.rs", "Dockerfile"). */
export function languageFromFileName(fileName: string | null | undefined): LanguageInfo | undefined {
    if (typeof fileName !== "string") return undefined;
    const base = fileName.trim().split(/[\\/]/).pop() ?? "";
    if (!base) return undefined;
    const exact = BY_FILE_NAME.get(base.toLowerCase());
    if (exact) return exact;
    const dot = base.lastIndexOf(".");
    if (dot <= 0 || dot === base.length - 1) return undefined;
    return BY_EXTENSION.get(base.slice(dot + 1).toLowerCase());
}

/** Default file extension (without the dot) of a language; "txt" when unknown. */
export function fileExtensionFor(id: string | null | undefined): string {
    return resolveLanguage(id).extensions[0] ?? "txt";
}

/** Adds the language's default extension when the name has no known one of its own. */
export function ensureFileExtension(name: string, id: string | null | undefined): string {
    const language = resolveLanguage(id);
    const detected = languageFromFileName(name);
    if (detected || language.fileNames?.some((fileName) => fileName.toLowerCase() === name.toLowerCase())) return name;
    const extension = language.extensions[0];
    return extension ? `${name}.${extension}` : name;
}

/** Monaco language id for highlighting; unknown values fall back to plain text. */
export function monacoLanguageFor(id: string | null | undefined): string {
    return resolveLanguage(id).monaco;
}

export function languageDisplayName(id: string | null | undefined): string {
    const language = getLanguage(normalizeLanguageId(id) ?? "");
    if (language) return language.name;
    const text = typeof id === "string" ? id.trim() : "";
    return text ? text.charAt(0).toUpperCase() + text.slice(1) : PLAINTEXT_LANGUAGE.name;
}

export function isRunnableLanguage(id: string | null | undefined): boolean {
    const engine = getLanguage(id)?.engine;
    return engine === "browser" || engine === "server";
}

export function isPreviewLanguage(id: string | null | undefined): boolean {
    return getLanguage(id)?.engine === "preview";
}

/** Program languages: runnable and not a validator (these join "Run all"). */
export function isProgramLanguage(id: string | null | undefined): boolean {
    const language = getLanguage(id);
    return Boolean(language && (language.engine === "browser" || language.engine === "server") && !language.tool);
}

// ------------------------------------------------------ backwards-compatible sets
/** Executed in the visitor's browser (WebAssembly / web worker), no sign-in needed. */
export const BROWSER_LANGUAGES: ReadonlySet<string> = new Set(LANGUAGES.filter((language) => language.engine === "browser").map((language) => language.id));

/** Everything the Run button accepts (browser + server). */
export const RUNNABLE_LANGUAGES: readonly string[] = LANGUAGES.filter((language) => language.engine === "browser" || language.engine === "server").map((language) => language.id);

export const RUNNABLE_LANGUAGE_SET: ReadonlySet<string> = new Set(RUNNABLE_LANGUAGES);

/** Accepted by /api/execute. */
export const SERVER_LANGUAGE_IDS: readonly string[] = LANGUAGES.filter((language) => language.server).map((language) => language.id);

export const PREVIEW_LANGUAGES: ReadonlySet<string> = new Set(LANGUAGES.filter((language) => language.engine === "preview").map((language) => language.id));

/** A curated list for favourites and quick pickers, in display order. */
export const POPULAR_LANGUAGE_IDS: readonly string[] = LANGUAGES.filter((language) => language.popular).map((language) => language.id);

// ------------------------------------------------------------------ UI copy
export const LANGUAGE_CATEGORIES: ReadonlyArray<{ id: LanguageCategory; label: LanguageText }> = [
    { id: "general", label: { TR: "Genel amaçlı", EN: "General purpose" } },
    { id: "web", label: { TR: "Web", EN: "Web" } },
    { id: "systems", label: { TR: "Sistem programlama", EN: "Systems programming" } },
    { id: "jvm", label: { TR: "JVM", EN: "JVM" } },
    { id: "dotnet", label: { TR: ".NET", EN: ".NET" } },
    { id: "functional", label: { TR: "Fonksiyonel ve mantıksal", EN: "Functional and logic" } },
    { id: "scripting", label: { TR: "Betik ve kabuk", EN: "Scripting and shells" } },
    { id: "data", label: { TR: "Veri ve sorgu", EN: "Data and queries" } },
    { id: "config", label: { TR: "Yapılandırma ve DevOps", EN: "Configuration and DevOps" } },
    { id: "docs", label: { TR: "Doküman ve diyagram", EN: "Documents and diagrams" } },
    { id: "templates", label: { TR: "Şablon motorları", EN: "Template engines" } },
    { id: "assembly", label: { TR: "Assembly", EN: "Assembly" } },
    { id: "hardware", label: { TR: "Donanım tanımlama", EN: "Hardware description" } },
    { id: "esoteric", label: { TR: "Ezoterik", EN: "Esoteric" } },
    { id: "other", label: { TR: "Diğer", EN: "Other" } },
];

export const ENGINE_LABELS: Readonly<Record<LanguageEngine, { short: LanguageText; long: LanguageText; description: LanguageText }>> = {
    browser: {
        short: { TR: "Tarayıcı", EN: "Browser" },
        long: { TR: "Tarayıcıda çalışır", EN: "Runs in your browser" },
        description: { TR: "Kod cihazınızda, izole bir Web Worker içinde çalışır; giriş gerekmez ve hiçbir sunucuya gönderilmez.", EN: "Code runs on your device in an isolated Web Worker; no sign-in is needed and nothing is sent to a server." },
    },
    server: {
        short: { TR: "Sunucu", EN: "Server" },
        long: { TR: "Sunucuda çalışır", EN: "Runs on the server" },
        description: { TR: "Hanogt Security Bot taramasından sonra izole bir uzak derleyicide çalışır; giriş gerekir.", EN: "Runs on an isolated remote compiler after a Hanogt Security Bot scan; sign-in is required." },
    },
    preview: {
        short: { TR: "Önizleme", EN: "Preview" },
        long: { TR: "Canlı önizleme", EN: "Live preview" },
        description: { TR: "Çalıştırılmaz; korumalı önizleme panelinde canlı olarak görüntülenir.", EN: "Not executed; rendered live in the sandboxed preview panel." },
    },
    none: {
        short: { TR: "Çalıştırılamaz", EN: "Not runnable" },
        long: { TR: "Yalnızca düzenleme", EN: "Edit only" },
        description: { TR: "Sözdizimi vurgulama ve düzenleme desteklenir; bu dil tarayıcıda veya sunucuda çalıştırılamaz.", EN: "Syntax highlighting and editing are supported; this language can't be run in the browser or on the server." },
    },
};

/** Labels of languages whose Run button does something other than run a program (see `LanguageInfo.tool`). */
export const TOOL_LABELS: Readonly<Record<NonNullable<LanguageInfo["tool"]>, { short: LanguageText; description: LanguageText }>> = {
    validator: {
        short: { TR: "Doğrulayıcı", EN: "Validator" },
        description: { TR: "Çalıştır, dosyayı tarayıcınızda denetler: söz dizimi hatalarını satır ve sütun numarasıyla gösterir, ardından bir özet ve biçimlendirilmiş hâlini yazar. Hiçbir şey sunucuya gönderilmez.", EN: "Run checks the file in your browser: syntax errors are reported with line and column numbers, followed by a summary and a formatted version. Nothing is sent to a server." },
    },
};

/**
 * Counts used by marketing copy ("57 languages"), derived from the registry so
 * they never go stale. Translations of those sentences are written for the
 * current `usable` value (57) and the plural form it takes: RU "57 языков",
 * UK "57 мов", SR/HR "57 језика"/"57 jezika" (genitive plural), LT
 * "57 programavimo kalbos" (plural, as for 2–9) and RO "57 de limbaje" (20+).
 * Other numbers may need other forms (61 takes the singular, 62–64 the paucal,
 * 60 the genitive plural in LT), so re-check the keys about_purpose_text,
 * auth_feature_code, lp_hero_sub, lp_marquee and ab_editor_text in
 * src/locales/{RU,UK,SR,HR,LT,RO}.json whenever this number changes.
 */
export const LANGUAGE_STATS = {
    /** Runs in the browser or on the server, or renders in the live preview. */
    usable: LANGUAGES.filter((language) => language.engine !== "none").length,
    runnable: LANGUAGES.filter((language) => language.engine === "browser" || language.engine === "server").length,
    preview: LANGUAGES.filter((language) => language.engine === "preview").length,
    /** Every language with syntax highlighting (plain text excluded). */
    highlighted: LANGUAGES.filter((language) => language.id !== "plaintext").length,
} as const;
