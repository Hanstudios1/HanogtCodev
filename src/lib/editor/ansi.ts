/**
 * Terminal output → styled text. Programs and compilers colour their output
 * with SGR escape sequences ("\x1b[1;31merror\x1b[0m"); the console shows
 * those colours and drops every other escape sequence (cursor movement,
 * window titles, OSC 8 hyperlinks…). Dependency-free (tested in scripts/tests).
 *
 * Supported SGR codes: 0 reset, 1 bold, 2 dim, 3 italic, 4 underline (also
 * "4:n"), 7 inverse, 8 hidden, 9 strike-through, 21 double underline, the
 * matching "off" codes 22-29, 30–37/90–97 and 40–47/100–107 colours,
 * 38/48 with ";5;n" (256 colours) or ";2;r;g;b" (true colour, also the colon
 * forms), 39/49 default colours.
 */

/** A palette index (0-15 follow the theme, 16-255 the xterm table) or a "#rrggbb" colour. */
export type AnsiColor = number | string;

export interface AnsiStyle {
    readonly bold?: true;
    readonly dim?: true;
    readonly italic?: true;
    readonly underline?: true;
    readonly inverse?: true;
    readonly hidden?: true;
    readonly strike?: true;
    readonly fg?: AnsiColor;
    readonly bg?: AnsiColor;
}

/** A run of text in one style; `style` is null for the default style. */
export interface AnsiSpan {
    text: string;
    style: AnsiStyle | null;
}

const ESC = 0x1b;
const CSI_C1 = 0x9b;
const BEL = 0x07;
const ST_C1 = 0x9c;

type MutableStyle = { -readonly [K in keyof AnsiStyle]: AnsiStyle[K] };

const inRange = (code: number, low: number, high: number) => code >= low && code <= high;

function byte(value: number | undefined): number | null {
    return value !== undefined && Number.isInteger(value) && value >= 0 && value <= 255 ? value : null;
}

const hex = (value: number) => value.toString(16).padStart(2, "0");

/** "#rrggbb" for one of the 256 xterm colours (16-255; 0-15 are left to the theme). */
export function xtermColor(index: number): string {
    if (index >= 232) {
        const level = 8 + (index - 232) * 10;
        return `#${hex(level)}${hex(level)}${hex(level)}`;
    }
    const cube = index - 16;
    const steps = [0, 95, 135, 175, 215, 255];
    return `#${hex(steps[Math.floor(cube / 36) % 6])}${hex(steps[Math.floor(cube / 6) % 6])}${hex(steps[cube % 6])}`;
}

/**
 * Reads an extended colour ("5;n" or "2;r;g;b") from `values` starting at
 * `start` (the item after 38/48/58). Returns the colour (null when invalid)
 * and how many items it used.
 */
function extendedColor(values: ReadonlyArray<number | undefined>, start: number, colonForm: boolean): { color: AnsiColor | null; used: number } {
    const mode = values[start];
    if (mode === 5) {
        const index = byte(values[start + 1]);
        return { color: index, used: 2 };
    }
    if (mode === 2) {
        // The colon form may carry a colour-space id first: 38:2:<id>:r:g:b.
        const offset = colonForm && values.length - start >= 5 ? start + 2 : start + 1;
        const [r, g, b] = [byte(values[offset]), byte(values[offset + 1]), byte(values[offset + 2])];
        const used = offset + 3 - start;
        return { color: r === null || g === null || b === null ? null : `#${hex(r)}${hex(g)}${hex(b)}`, used };
    }
    return { color: null, used: mode === undefined ? 0 : 1 };
}

function applyCode(style: MutableStyle, code: number) {
    if (code === 0) {
        for (const key of Object.keys(style) as Array<keyof MutableStyle>) delete style[key];
    } else if (code === 1) style.bold = true;
    else if (code === 2) style.dim = true;
    else if (code === 3) style.italic = true;
    else if (code === 4 || code === 21) style.underline = true;
    else if (code === 7) style.inverse = true;
    else if (code === 8) style.hidden = true;
    else if (code === 9) style.strike = true;
    else if (code === 22) {
        delete style.bold;
        delete style.dim;
    } else if (code === 23) delete style.italic;
    else if (code === 24) delete style.underline;
    else if (code === 27) delete style.inverse;
    else if (code === 28) delete style.hidden;
    else if (code === 29) delete style.strike;
    else if (inRange(code, 30, 37)) style.fg = code - 30;
    else if (code === 39) delete style.fg;
    else if (inRange(code, 40, 47)) style.bg = code - 40;
    else if (code === 49) delete style.bg;
    else if (inRange(code, 90, 97)) style.fg = code - 90 + 8;
    else if (inRange(code, 100, 107)) style.bg = code - 100 + 8;
    // Blink, fonts, overline, underline colour (58/59 are consumed by the caller) and the rest are ignored.
}

/** Applies the parameters of one SGR sequence ("1;31", "38;5;208", "38:2::255:0:0", "" = reset). */
function applySgr(style: MutableStyle, params: string) {
    const parts = params.split(";");
    for (let index = 0; index < parts.length; index += 1) {
        const part = parts[index];
        if (part.includes(":")) {
            const values = part.split(":").map((value) => (value === "" ? undefined : Number(value)));
            const code = values[0];
            if (code === 38 || code === 48 || code === 58) {
                const { color } = extendedColor(values, 1, true);
                if (color !== null && code !== 58) style[code === 38 ? "fg" : "bg"] = color;
            } else if (code === 4) {
                if (values[1] === 0) delete style.underline;
                else style.underline = true;
            } else if (code !== undefined && Number.isInteger(code)) {
                applyCode(style, code);
            }
            continue;
        }
        const code = part === "" ? 0 : Number(part);
        if (!Number.isInteger(code)) continue;
        if (code === 38 || code === 48 || code === 58) {
            const values = parts.map((value) => (value === "" ? undefined : Number(value)));
            const { color, used } = extendedColor(values, index + 1, false);
            if (color !== null && code !== 58) style[code === 38 ? "fg" : "bg"] = color;
            index += used;
            continue;
        }
        applyCode(style, code);
    }
}

/** A stable key for a style (equal styles have equal keys); "" is the default style. */
export function ansiStyleKey(style: AnsiStyle | null): string {
    if (!style) return "";
    const parts: string[] = [];
    if (style.bold) parts.push("bold");
    if (style.dim) parts.push("dim");
    if (style.italic) parts.push("italic");
    if (style.underline) parts.push("underline");
    if (style.inverse) parts.push("inverse");
    if (style.hidden) parts.push("hidden");
    if (style.strike) parts.push("strike");
    if (style.fg !== undefined) parts.push(`fg:${style.fg}`);
    if (style.bg !== undefined) parts.push(`bg:${style.bg}`);
    return parts.join(" ");
}

function freeze(style: MutableStyle): AnsiStyle | null {
    return Object.keys(style).length ? Object.freeze({ ...style }) : null;
}

/**
 * Where the escape sequence starting at `start` (an ESC or a C1 CSI) ends,
 * and its SGR parameters when it is one. Incomplete sequences end the text.
 */
function readEscape(text: string, start: number): { end: number; sgr: string | null } {
    const length = text.length;
    let index: number;
    if (text.charCodeAt(start) === CSI_C1) {
        index = start + 1;
    } else {
        const kind = text[start + 1];
        if (kind === undefined) return { end: length, sgr: null };
        if (kind === "[") {
            index = start + 2;
        } else if (kind === "]" || kind === "P" || kind === "X" || kind === "^" || kind === "_") {
            // OSC, DCS, SOS, PM and APC strings run until BEL or the string terminator (ESC \ or C1 ST).
            for (let cursor = start + 2; cursor < length; cursor += 1) {
                const code = text.charCodeAt(cursor);
                if (code === BEL || code === ST_C1) return { end: cursor + 1, sgr: null };
                if (code === ESC && text[cursor + 1] === "\\") return { end: cursor + 2, sgr: null };
            }
            return { end: length, sgr: null };
        } else {
            // Other escapes: ESC, optional intermediate bytes, one final byte ("ESC (B", "ESC =", "ESC 7").
            let cursor = start + 1;
            while (cursor < length && inRange(text.charCodeAt(cursor), 0x20, 0x2f)) cursor += 1;
            if (cursor < length && inRange(text.charCodeAt(cursor), 0x30, 0x7e)) cursor += 1;
            return { end: cursor, sgr: null };
        }
    }
    // Control Sequence Introducer: parameter bytes, intermediate bytes, one final byte.
    const paramsStart = index;
    while (index < length && inRange(text.charCodeAt(index), 0x30, 0x3f)) index += 1;
    const paramsEnd = index;
    while (index < length && inRange(text.charCodeAt(index), 0x20, 0x2f)) index += 1;
    if (index >= length) return { end: length, sgr: null };
    const final = text.charCodeAt(index);
    if (!inRange(final, 0x40, 0x7e)) {
        // Not a valid sequence: drop what was read and continue with the unexpected character.
        return { end: index, sgr: null };
    }
    const params = text.slice(paramsStart, paramsEnd);
    const isSgr = final === 0x6d /* m */ && paramsEnd === index && /^[0-9;:]*$/.test(params);
    return { end: index + 1, sgr: isSgr ? params : null };
}

/** Splits terminal output into styled runs; escape sequences are removed. Adjacent runs with the same style are merged. */
export function parseAnsi(text: string): AnsiSpan[] {
    const spans: AnsiSpan[] = [];
    const style: MutableStyle = {};
    let current: AnsiStyle | null = null;
    let currentKey = "";
    let lastKey: string | null = null;

    const push = (chunk: string) => {
        if (!chunk) return;
        const last = spans[spans.length - 1];
        if (last && lastKey === currentKey) {
            last.text += chunk;
            return;
        }
        spans.push({ text: chunk, style: current });
        lastKey = currentKey;
    };

    let textStart = 0;
    let index = 0;
    while (index < text.length) {
        const code = text.charCodeAt(index);
        if (code !== ESC && code !== CSI_C1) {
            index += 1;
            continue;
        }
        push(text.slice(textStart, index));
        const { end, sgr } = readEscape(text, index);
        if (sgr !== null) {
            applySgr(style, sgr);
            current = freeze(style);
            currentKey = ansiStyleKey(current);
        }
        index = end;
        textStart = end;
    }
    push(text.slice(textStart));
    return spans;
}

/** True when the text contains an escape sequence. */
export function hasAnsi(text: string): boolean {
    return /[\u001b\u009b]/.test(text);
}

/** Removes every escape sequence (colours, cursor movement, titles, hyperlinks…). */
export function stripAnsi(text: string): string {
    if (!hasAnsi(text)) return text;
    return parseAnsi(text).map((span) => span.text).join("");
}
