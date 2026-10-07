/**
 * SCSS in the browser: Dart Sass compiled to JavaScript (sass, MIT). It is the
 * largest runtime chunk, so the worker loads it only when an .scss file first
 * runs. Run compiles the file and prints the CSS; @warn, @debug and
 * deprecation notices are reported with their line numbers. Built-in modules
 * (sass:math, sass:color…) work; there are no other files to @use or @import.
 */
import * as sass from "sass";

export interface ScssNotice {
    kind: "warning" | "deprecation" | "debug";
    message: string;
    line?: number;
    column?: number;
}

export interface ScssRunResult {
    css: string;
    version: string;
    notices: ScssNotice[];
    /** `frame` is Sass's own code frame (the line with a ^^^ marker under the mistake). */
    error?: { message: string; frame?: string; line?: number; column?: number };
}

type Span = { start: { line: number; column: number } } | undefined;

const at = (span: Span) => (span ? { line: span.start.line + 1, column: span.start.column + 1 } : {});

/** "dart-sass\t1.105.1\t(Sass Compiler)…" → "Dart Sass 1.105.1". */
function versionLabel() {
    const version = /dart-sass\s+([\d.]+\S*)/.exec(String(sass.info))?.[1];
    return version ? `Dart Sass ${version}` : "Dart Sass";
}

/** Sass's formatted message without its first line and the trailing "- 1:13  root stylesheet". */
function codeFrame(formatted: string) {
    return formatted.split("\n").slice(1).filter((line) => !/^\s+- \d+:\d+\s/.test(line) && line.trim() !== "").join("\n");
}

/** Compiles SCSS source to CSS. */
export function compileScss(source: string): ScssRunResult {
    const notices: ScssNotice[] = [];
    const version = versionLabel();
    try {
        const result = sass.compileString(source, {
            syntax: "scss",
            style: "expanded",
            logger: {
                warn(message, options) {
                    notices.push({ kind: options.deprecation ? "deprecation" : "warning", message: message.trim(), ...at(options.span as Span) });
                },
                debug(message, options) {
                    notices.push({ kind: "debug", message: message.trim(), ...at(options.span as Span) });
                },
            },
        });
        return { css: result.css ? `${result.css}\n` : "", version, notices };
    } catch (error) {
        const details = error as { sassMessage?: string; message?: string; span?: Span };
        const message = details.sassMessage ?? details.message ?? String(error);
        const frame = details.message && details.sassMessage ? codeFrame(details.message) : "";
        return { css: "", version, notices, error: { message: `Error: ${message}`, ...(frame ? { frame } : {}), ...at(details.span) } };
    }
}
