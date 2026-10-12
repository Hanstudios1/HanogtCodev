/**
 * Log points (V6): the script editor's gutter can mark a line with a message
 * that prints to the Console each time the line runs, without editing code.
 * "{expression}" parts show values read in the line's scope ("speed = {speed}",
 * "{transform.position}"); "{{" and "}}" print braces. A log point can also
 * pause the game when the frame ends (the frame always finishes, so physics
 * and scripts stay consistent). They only run in the editor's play mode.
 */
import type { Expr } from "../script/ast";
import type { CompiledLogPoint } from "../script/interpreter";
import { parseStandaloneExpression } from "../script/parser";
import type { LogPoint, ScriptAsset } from "../types";

/** Expressions that would change the game (assignments, ++/--, lambdas) can't be printed. */
function changesState(node: unknown): boolean {
    if (!node || typeof node !== "object") return false;
    if (Array.isArray(node)) return node.some(changesState);
    const record = node as Record<string, unknown>;
    if (record.type === "Assign" || record.type === "Update" || record.type === "Lambda") return true;
    return Object.values(record).some((value) => value && typeof value === "object" && changesState(value));
}

/** Splits a message into text and expressions. */
export function parseLogMessage(message: string, dialect: "csharp" | "cpp"): CompiledLogPoint["parts"] {
    const parts: CompiledLogPoint["parts"] = [];
    let text = "";
    for (let index = 0; index < message.length; index += 1) {
        const char = message[index];
        if ((char === "{" || char === "}") && message[index + 1] === char) {
            text += char;
            index += 1;
            continue;
        }
        if (char === "{") {
            const end = message.indexOf("}", index + 1);
            if (end < 0) {
                text += message.slice(index);
                break;
            }
            if (text) parts.push(text);
            text = "";
            const source = message.slice(index + 1, end).trim();
            const expr: Expr | null = source ? parseStandaloneExpression(source, dialect) : null;
            parts.push({ source, expr: expr && !changesState(expr) ? expr : null });
            index = end;
            continue;
        }
        text += char;
    }
    if (text) parts.push(text);
    return parts;
}

/** The enabled log points by "script name:line" (null when there are none). */
export function compileLogPoints(points: readonly LogPoint[], scripts: readonly ScriptAsset[]): Map<string, CompiledLogPoint> | null {
    const map = new Map<string, CompiledLogPoint>();
    for (const point of points) {
        if (!point.enabled) continue;
        const script = scripts.find((item) => item.id === point.scriptId);
        if (!script) continue;
        const message = point.message.trim() || `${script.name}:${point.line}`;
        map.set(`${script.name}:${point.line}`, { parts: parseLogMessage(message, script.language), pause: Boolean(point.pause) });
    }
    return map.size ? map : null;
}
