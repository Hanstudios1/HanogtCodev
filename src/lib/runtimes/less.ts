/**
 * Less in the browser: the Less compiler's core (Apache-2.0), loaded on first
 * use, without its browser bootstrap (which needs a page). Run compiles the
 * file and prints the CSS; there are no other files to @import, and @plugin
 * and inline JavaScript are off.
 */
import createLess from "less/lib/less/index.js";
import AbstractPluginLoader from "less/lib/less/environment/abstract-plugin-loader.js";

/** The installed compiler's version (scripts/tests/less.test.mjs compares it with node_modules). */
export const LESS_VERSION = "4.9.1";

export interface LessRunOptions {
    /** Shown in error locations, e.g. "style.less". */
    fileName?: string;
}

export interface LessRunResult {
    css: string;
    version: string;
    error?: { message: string; line?: number; column?: number };
}

type LessCompiler = ReturnType<typeof createLess>;

let compiler: LessCompiler | null = null;

function getCompiler(): LessCompiler {
    if (compiler) return compiler;
    const less = createLess(undefined, undefined, LESS_VERSION);
    // @plugin would load JavaScript from another file; a single-file run has none.
    function PluginLoader(this: { less: unknown }, instance: unknown) {
        this.less = instance;
    }
    PluginLoader.prototype = Object.assign(new AbstractPluginLoader(), {
        loadPlugin: () => Promise.reject(new Error("@plugin is not supported")),
    });
    less.PluginLoader = PluginLoader;
    compiler = less;
    return less;
}

/** Compiles Less source to CSS; errors carry Less's own message and a 1-based line and column. */
export async function compileLess(source: string, options: LessRunOptions = {}): Promise<LessRunResult> {
    const less = getCompiler();
    const version = `Less ${LESS_VERSION}`;
    try {
        const output = await less.render(source, { filename: options.fileName || "style.less", javascriptEnabled: false });
        return { css: output.css, version };
    } catch (error) {
        const details = error as { message?: string; type?: string; line?: number | null; column?: number | null };
        const message = details.message || String(error);
        const kind = details.type ? `${details.type}Error` : "Error";
        const line = typeof details.line === "number" ? details.line : undefined;
        // Less counts columns from 0.
        const column = typeof details.column === "number" ? details.column + 1 : undefined;
        return { css: "", version, error: { message: `${kind}: ${message}`, line, column } };
    }
}
