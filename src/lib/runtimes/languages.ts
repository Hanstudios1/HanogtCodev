/**
 * The single source of truth for every programming language Hanogt Codev knows.
 *
 * Client-safe and dependency-free (no imports), so it is shared by the editor,
 * the dashboard, the server runner (src/lib/server/code-runner.ts), the
 * /api/execute route and the plain-Node tests in scripts/tests.
 *
 * - `engine: "browser"`  runs in the visitor's browser (src/lib/runtimes/worker.ts).
 * - `engine: "server"`   runs through /api/execute (CODE_RUNNER_URL, Wandbox or Kotlin Playground).
 * - `engine: "preview"`  is rendered in the live preview panel (HTML, CSS, Markdown).
 * - `engine: "none"`     is edit-only: syntax highlighting without a Run button.
 */

/** A translatable text pair; structurally compatible with `Copy` from "@/lib/i18n". */
export type LanguageText = { TR: string; EN: string };

export type LanguageEngine = "browser" | "server" | "preview" | "none";

export type LanguageCategory =
    | "general" | "web" | "systems" | "jvm" | "dotnet" | "functional"
    | "scripting" | "data" | "config" | "docs" | "other";

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
        category: "other", color: "#27272A", icon: svg("brainfuck"), defaultFileName: "main.bf",
        // Comment text must not contain any of the eight commands: + - < > . , [ ]
        template: "Hanogt Codev Brainfuck\nPrints Hello World followed by a newline\n\n++++++++[>++++[>++>+++>+++>+<<<<-]>+>+>->>+[<]<-]>>.>---.+++++++..+++.>>.<-.<.+++.------.--------.>>+.>++.\n",
    },
    {
        id: "json", name: "JSON", monaco: "json", extensions: ["json", "webmanifest", "har"],
        engine: "browser", tool: "validator",
        category: "data", color: "#1E293B", icon: svg("json"), defaultFileName: "data.json",
        template: "{\n  \"name\": \"Hanogt Codev\",\n  \"message\": \"Hello World from Hanogt!\",\n  \"languages\": [\"JavaScript\", \"Python\", \"Scheme\"],\n  \"version\": 1,\n  \"openSource\": true\n}\n",
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
        id: "xml", name: "XML", monaco: "xml", extensions: ["xml", "svg", "xsd", "xsl", "xslt", "plist", "rss", "csproj"],
        engine: "none", category: "data", color: "#0060AC", icon: svg("xml"), defaultFileName: "data.xml",
        template: "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<greeting lang=\"en\">\n  <text>Hello World from Hanogt!</text>\n</greeting>\n",
    },
    {
        id: "yaml", name: "YAML", monaco: "yaml", extensions: ["yaml", "yml"],
        aliases: ["yml"], engine: "none", category: "config", color: "#CB171E", icon: svg("yaml"), defaultFileName: "config.yaml",
        template: "name: Hanogt Codev\nmessage: Hello World from Hanogt!\nlanguages:\n  - JavaScript\n  - Python\n  - Scheme\nfeatures:\n  browserRuntime: true\n  maxFiles: 8\n",
    },
    {
        id: "toml", name: "TOML", monaco: "ini", extensions: ["toml"],
        engine: "none", category: "config", color: "#9C4121", icon: svg("toml"), defaultFileName: "config.toml",
        template: "title = \"Hanogt Codev\"\n\n[greeting]\ntext = \"Hello World from Hanogt!\"\nlanguages = [\"JavaScript\", \"Python\"]\n",
    },
    {
        id: "ini", name: "INI", monaco: "ini", extensions: ["ini", "cfg", "conf", "properties", "env"],
        engine: "none", category: "config", color: "#6D6D6D", icon: svg("ini"), defaultFileName: "settings.ini",
        template: "; Hanogt Codev\n[greeting]\ntext=Hello World from Hanogt!\nenabled=true\n",
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
        aliases: ["verilog"], engine: "none", category: "other", color: "#4A6B8A", icon: svg("systemverilog"), defaultFileName: "hello.sv",
        template: "module hello;\n  initial begin\n    $display(\"Hello World from Hanogt!\");\n  end\nendmodule\n",
    },
    {
        id: "mips", name: "MIPS Assembly", monaco: "mips", extensions: ["mips", "asm", "s"],
        aliases: ["asm", "assembly"], engine: "none", category: "other", color: "#6E4A7E", icon: svg("mips"), defaultFileName: "main.asm",
        template: "        .data\nmsg:    .asciiz \"Hello World from Hanogt!\\n\"\n\n        .text\nmain:   li   $v0, 4\n        la   $a0, msg\n        syscall\n        li   $v0, 10\n        syscall\n",
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
    { id: "functional", label: { TR: "Fonksiyonel", EN: "Functional" } },
    { id: "scripting", label: { TR: "Betik ve kabuk", EN: "Scripting and shells" } },
    { id: "data", label: { TR: "Veri ve sorgu", EN: "Data and queries" } },
    { id: "config", label: { TR: "Yapılandırma ve DevOps", EN: "Configuration and DevOps" } },
    { id: "docs", label: { TR: "Doküman", EN: "Documents" } },
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
