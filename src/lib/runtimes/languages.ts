/**
 * Language ids the editor can run (client-safe; the server list lives in
 * src/lib/server/code-runner.ts and accepts all of these).
 */

/** Executed in the visitor's browser (WebAssembly / web worker), no sign-in needed. */
export const BROWSER_LANGUAGES = new Set(["javascript", "typescript", "python", "sql", "lua"]);

/** Everything the Run button accepts; the rest goes to /api/execute. */
export const RUNNABLE_LANGUAGES = [
    "javascript", "typescript", "python", "sql", "lua",
    "c", "cpp", "csharp", "java", "kotlin", "go", "rust", "swift", "ruby", "php", "perl",
    "scala", "haskell", "elixir", "erlang", "nim", "d", "crystal", "bash", "pascal", "ocaml",
    "zig", "julia", "r", "groovy", "lisp", "fsharp", "coffeescript",
] as const;

export const RUNNABLE_LANGUAGE_SET: ReadonlySet<string> = new Set(RUNNABLE_LANGUAGES);
