/**
 * CoffeeScript in the browser: the CoffeeScript 2 compiler (MIT), loaded on
 * first use, compiles the file to JavaScript (`bare`, so top-level variables
 * stay visible) together with a source map. The worker then runs the result
 * with its JavaScript runner (console.log, prompt/input for the Input tab,
 * top-level await) and uses the map to name CoffeeScript lines in errors.
 */
import { VERSION, compile } from "coffeescript/lib/coffeescript-browser-compiler-modern/coffeescript.js";

export interface CoffeeCompileResult {
    /** The compiled JavaScript ("" when the file does not compile). */
    js: string;
    version: string;
    /** Maps a 1-based line and column of `js` to the CoffeeScript file (null when unknown). */
    sourceLocation: (line: number, column: number) => { line: number; column: number } | null;
    error?: { message: string; line?: number; column?: number };
}

const none = () => null;

export function compileCoffeeScript(source: string): CoffeeCompileResult {
    const version = `CoffeeScript ${VERSION}`;
    try {
        const { js, sourceMap } = compile(source, { bare: true, sourceMap: true });
        const sourceLocation = (line: number, column: number) => {
            const found = sourceMap.sourceLocation([line - 1, Math.max(0, column - 1)]);
            return found ? { line: found[0] + 1, column: found[1] + 1 } : null;
        };
        return { js, version, sourceLocation };
    } catch (error) {
        const details = error as { message?: string; location?: { first_line?: number; first_column?: number } };
        const location = details.location;
        return {
            js: "",
            version,
            sourceLocation: none,
            error: {
                message: details.message || String(error),
                ...(location && typeof location.first_line === "number" ? { line: location.first_line + 1, column: (location.first_column ?? 0) + 1 } : {}),
            },
        };
    }
}
