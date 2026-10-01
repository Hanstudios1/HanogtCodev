/**
 * Wandbox saves Java code as prog.java and runs `java prog`, so a
 * `public class Main` would not compile there. These helpers rewrite a
 * single-file program without moving any line (dependency-free; used by
 * src/lib/server/code-runner.ts and tested in scripts/tests).
 */

/** Replaces comments and string literals with spaces, keeping every index in place. */
export function blankJavaLiterals(code: string): string {
    return code.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*|"""[\s\S]*?"""|"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'/g, (match) => match.replace(/[^\n]/g, " "));
}

/** Name of the top-level type that declares `static void main(` in code without literals. */
export function javaMainClassOf(blanked: string): string | null {
    const mainIndex = blanked.search(/\bstatic\s+void\s+main\s*\(/);
    if (mainIndex < 0) return null;
    const declaration = /^(?:class|interface|enum|record)\s+([A-Za-z_$][\w$]*)/;
    let depth = 0;
    let pending: string | null = null;
    let current: string | null = null;
    for (let index = 0; index < mainIndex; index += 1) {
        const char = blanked[index];
        if (char === "{") {
            if (depth === 0) current = pending;
            depth += 1;
        } else if (char === "}") {
            depth = Math.max(0, depth - 1);
            if (depth === 0) current = null;
        } else if (depth === 0 && (char === "c" || char === "i" || char === "e" || char === "r") && !/[\w$]/.test(blanked[index - 1] || "")) {
            const match = declaration.exec(blanked.slice(index, index + 160));
            if (match) pending = match[1];
        }
    }
    return depth > 0 ? current : null;
}

export function javaMainClass(code: string): string | null {
    return javaMainClassOf(blankJavaLiterals(code));
}

/**
 * Top-level types lose `public`, the package statement is blanked out and a
 * `prog` launcher class is appended after the user's code, which hands over
 * to the user's own main method. Edits never add or remove line breaks before
 * the user's code ends, so compiler errors keep pointing at the right lines.
 */
export function prepareJava(code: string): string {
    const blanked = blankJavaLiterals(code);
    const mainClass = javaMainClassOf(blanked);
    const edits: Array<{ start: number; end: number; text: string }> = [];
    const packageLine = /^[ \t]*package\s+[\w.]+\s*;/m.exec(blanked);
    if (packageLine) edits.push({ start: packageLine.index, end: packageLine.index + packageLine[0].length, text: "" });
    for (const match of blanked.matchAll(/\bpublic\s+(?=(?:(?:final|abstract|sealed|non-sealed|strictfp)\s+)*(?:class|interface|enum|record)\s)/g)) {
        // Only top-level declarations matter for the file name rule; nested public types are fine.
        if (depthAt(blanked, match.index) === 0) edits.push({ start: match.index, end: match.index + match[0].length, text: "" });
    }
    edits.sort((a, b) => b.start - a.start);
    let prepared = edits.reduce((source, edit) => `${source.slice(0, edit.start)}${edit.text}${source.slice(edit.end)}`, code);
    if (mainClass && mainClass !== "prog") {
        // A trailing line comment must not swallow the launcher.
        prepared += `\nclass prog { public static void main(String[] args) throws Exception { ${mainClass}.main(args); } }\n`;
    }
    return prepared;
}

function depthAt(blanked: string, position: number) {
    let depth = 0;
    for (let index = 0; index < position; index += 1) {
        if (blanked[index] === "{") depth += 1;
        else if (blanked[index] === "}") depth = Math.max(0, depth - 1);
    }
    return depth;
}
