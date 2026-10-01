/**
 * Tokeniser shared by the C# and C++ front-ends of the Hanogt script VM.
 * It understands C# verbatim/interpolated strings, C++ preprocessor lines
 * (object-like #define macros are expanded) and numeric suffixes.
 */

export type ScriptDialect = "csharp" | "cpp";

export type TokenKind = "ident" | "keyword" | "number" | "string" | "char" | "interp" | "punct" | "eof";

export interface InterpolationPart {
    text?: string;
    code?: string;
    format?: string;
    line: number;
    col: number;
}

export interface Token {
    kind: TokenKind;
    value: string;
    line: number;
    col: number;
    /** Numeric value for number tokens. */
    num?: number;
    /** True when the literal is a floating point literal (has '.', exponent or f/d/m suffix). */
    isFloat?: boolean;
    parts?: InterpolationPart[];
    /** Set on tokens produced by macro expansion. */
    macro?: string;
}

export class ScriptSyntaxError extends Error {
    readonly line: number;
    readonly col: number;
    constructor(message: string, line: number, col: number) {
        super(message);
        this.line = line;
        this.col = col;
        this.name = "ScriptSyntaxError";
    }
}

const KEYWORDS = new Set([
    "class", "struct", "enum", "namespace", "using", "public", "private", "protected", "internal",
    "static", "const", "readonly", "virtual", "override", "abstract", "sealed", "new", "return",
    "if", "else", "for", "foreach", "while", "do", "switch", "case", "default", "break", "continue",
    "true", "false", "null", "nullptr", "this", "base", "void", "in", "out", "ref", "is", "as",
    "try", "catch", "finally", "throw", "interface", "inline", "constexpr", "typename", "template",
    "unsigned", "signed", "mutable", "volatile", "delete", "operator", "goto", "extern", "friend",
    "explicit", "implicit", "params", "typeof", "sizeof", "event", "delegate", "partial",
]);

// Longest first so that e.g. "<<=" wins over "<<" and "<".
const PUNCTUATORS = [
    "<<=", ">>=", "??=", "->*", "...",
    "::", "->", "=>", "++", "--", "&&", "||", "==", "!=", "<=", ">=", "+=", "-=", "*=", "/=", "%=",
    "&=", "|=", "^=", "<<", ">>", "??", "?.",
    "+", "-", "*", "/", "%", "=", "<", ">", "!", "~", "&", "|", "^", "?", ":", ";", ",", ".",
    "(", ")", "[", "]", "{", "}", "@", "$", "#",
];

const isIdentStart = (char: string) => /[\p{L}_]/u.test(char);
const isIdentPart = (char: string) => /[\p{L}\p{N}_]/u.test(char);
const isDigit = (char: string) => char >= "0" && char <= "9";

export function tokenize(source: string, dialect: ScriptDialect): Token[] {
    const tokens: Token[] = [];
    const macros = new Map<string, Token[]>();
    let index = 0;
    let line = 1;
    let col = 1;
    let atLineStart = true;
    const length = source.length;

    const peek = (offset = 0) => source[index + offset] ?? "";
    const advance = (count = 1) => {
        for (let step = 0; step < count; step += 1) {
            const char = source[index];
            index += 1;
            if (char === "\n") {
                line += 1;
                col = 1;
                atLineStart = true;
            } else {
                col += 1;
            }
        }
    };
    const error = (message: string, errorLine = line, errorCol = col): never => {
        throw new ScriptSyntaxError(message, errorLine, errorCol);
    };

    const readEscape = (): string => {
        const char = peek();
        advance();
        switch (char) {
            case "n": return "\n";
            case "t": return "\t";
            case "r": return "\r";
            case "0": return "\0";
            case "a": return "\u0007";
            case "b": return "\b";
            case "f": return "\f";
            case "v": return "\v";
            case "\\": return "\\";
            case "\"": return "\"";
            case "'": return "'";
            case "u": {
                const hex = source.slice(index, index + 4);
                if (!/^[0-9a-fA-F]{4}$/.test(hex)) error("Geçersiz \\u kaçış dizisi.");
                advance(4);
                return String.fromCharCode(parseInt(hex, 16));
            }
            case "x": {
                const match = /^[0-9a-fA-F]{1,4}/.exec(source.slice(index));
                if (!match) error("Geçersiz \\x kaçış dizisi.");
                advance(match![0].length);
                return String.fromCharCode(parseInt(match![0], 16));
            }
            default:
                return char;
        }
    };

    const readQuoted = (verbatim: boolean, startLine: number, startCol: number): string => {
        let value = "";
        while (true) {
            if (index >= length) error("Kapanmamış metin (string) ifadesi.", startLine, startCol);
            const char = peek();
            if (verbatim) {
                if (char === "\"") {
                    if (peek(1) === "\"") { value += "\""; advance(2); continue; }
                    advance();
                    return value;
                }
                value += char;
                advance();
                continue;
            }
            if (char === "\n") error("Metin ifadesi satır sonunda kapanmadı.", startLine, startCol);
            if (char === "\\") { advance(); value += readEscape(); continue; }
            if (char === "\"") { advance(); return value; }
            value += char;
            advance();
        }
    };

    const readInterpolated = (verbatim: boolean, startLine: number, startCol: number): InterpolationPart[] => {
        const parts: InterpolationPart[] = [];
        let textBuffer = "";
        const flush = () => {
            if (textBuffer) parts.push({ text: textBuffer, line, col });
            textBuffer = "";
        };
        while (true) {
            if (index >= length) error("Kapanmamış enterpolasyonlu metin.", startLine, startCol);
            const char = peek();
            if (char === "\"") {
                if (verbatim && peek(1) === "\"") { textBuffer += "\""; advance(2); continue; }
                advance();
                flush();
                return parts;
            }
            if (!verbatim && char === "\n") error("Metin ifadesi satır sonunda kapanmadı.", startLine, startCol);
            if (!verbatim && char === "\\") { advance(); textBuffer += readEscape(); continue; }
            if (char === "{") {
                if (peek(1) === "{") { textBuffer += "{"; advance(2); continue; }
                flush();
                advance();
                const codeLine = line;
                const codeCol = col;
                let depth = 0;
                let code = "";
                let format: string | undefined;
                while (true) {
                    if (index >= length) error("Enterpolasyon ifadesi kapanmadı.", codeLine, codeCol);
                    const inner = peek();
                    if (inner === "\"" || inner === "'") {
                        // Skip over nested literals verbatim.
                        const quote = inner;
                        code += inner;
                        advance();
                        while (index < length && peek() !== quote) {
                            if (peek() === "\\") { code += peek(); advance(); }
                            code += peek();
                            advance();
                        }
                        code += peek();
                        advance();
                        continue;
                    }
                    if (inner === "(" || inner === "[" || inner === "{") depth += 1;
                    if (inner === ")" || inner === "]") depth -= 1;
                    if (inner === "}") {
                        if (depth === 0) { advance(); break; }
                        depth -= 1;
                    }
                    if (inner === ":" && depth === 0 && peek(1) !== ":" && source[index - 1] !== ":") {
                        advance();
                        format = "";
                        while (index < length && peek() !== "}") { format += peek(); advance(); }
                        advance();
                        break;
                    }
                    code += inner;
                    advance();
                }
                if (!code.trim()) error("Boş enterpolasyon ifadesi.", codeLine, codeCol);
                parts.push({ code, format, line: codeLine, col: codeCol });
                continue;
            }
            if (char === "}") {
                if (peek(1) === "}") { textBuffer += "}"; advance(2); continue; }
                error("Enterpolasyonlu metinde tek '}' kullanılamaz; '}}' yazın.");
            }
            textBuffer += char;
            advance();
        }
    };

    const pushToken = (token: Token) => {
        if (token.kind === "ident" && macros.has(token.value) && !token.macro) {
            for (const expanded of macros.get(token.value)!) {
                tokens.push({ ...expanded, line: token.line, col: token.col, macro: token.value });
            }
            return;
        }
        tokens.push(token);
    };

    while (index < length) {
        const char = peek();

        if (char === "\n" || char === " " || char === "\t" || char === "\r" || char === "\f" || char === "\v" || char === "﻿") {
            advance();
            continue;
        }

        if (char === "/" && peek(1) === "/") {
            while (index < length && peek() !== "\n") advance();
            continue;
        }
        if (char === "/" && peek(1) === "*") {
            const startLine = line, startCol = col;
            advance(2);
            while (index < length && !(peek() === "*" && peek(1) === "/")) advance();
            if (index >= length) error("Kapanmamış /* yorum */ bloğu.", startLine, startCol);
            advance(2);
            continue;
        }

        // Preprocessor directives (C++ #include/#define/#pragma, C# #region).
        if (char === "#" && atLineStart) {
            const directiveLine = line;
            let directive = "";
            while (index < length && peek() !== "\n") {
                if (peek() === "\\" && peek(1) === "\n") { advance(2); directive += " "; continue; }
                directive += peek();
                advance();
            }
            const match = /^#\s*define\s+([A-Za-z_][A-Za-z0-9_]*)(\s+(.*))?$/.exec(directive.trim());
            if (match && !directive.trim().match(/^#\s*define\s+[A-Za-z_][A-Za-z0-9_]*\(/)) {
                const body = (match[3] ?? "").replace(/\/\/.*$/, "").trim();
                try {
                    const expanded = body ? tokenize(body, dialect).filter((token) => token.kind !== "eof") : [];
                    macros.set(match[1], expanded);
                } catch {
                    error(`#define ${match[1]} değeri çözümlenemedi.`, directiveLine, 1);
                }
            } else if (/^#\s*define\s+[A-Za-z_][A-Za-z0-9_]*\(/.test(directive.trim())) {
                error("Parametreli #define makroları desteklenmiyor; sabit veya fonksiyon kullanın.", directiveLine, 1);
            }
            continue;
        }
        atLineStart = false;

        const startLine = line;
        const startCol = col;

        // String prefixes: @"", $"", $@"", @$"", L"", u8"", R"(...)"
        if ((char === "@" || char === "$") && (peek(1) === "\"" || ((peek(1) === "@" || peek(1) === "$") && peek(2) === "\""))) {
            const interpolated = char === "$" || peek(1) === "$";
            const verbatim = char === "@" || peek(1) === "@";
            advance(peek(1) === "\"" ? 2 : 3);
            if (interpolated) {
                tokens.push({ kind: "interp", value: "", parts: readInterpolated(verbatim, startLine, startCol), line: startLine, col: startCol });
            } else {
                tokens.push({ kind: "string", value: readQuoted(true, startLine, startCol), line: startLine, col: startCol });
            }
            continue;
        }
        if (dialect === "cpp" && char === "R" && peek(1) === "\"" && peek(2) === "(") {
            advance(3);
            const end = source.indexOf(")\"", index);
            if (end < 0) error("Kapanmamış ham metin R\"(...)\".", startLine, startCol);
            const value = source.slice(index, end);
            advance(end - index + 2);
            tokens.push({ kind: "string", value, line: startLine, col: startCol });
            continue;
        }
        if (dialect === "cpp" && (char === "L" || char === "u" || char === "U") && (peek(1) === "\"" || (char === "u" && peek(1) === "8" && peek(2) === "\""))) {
            advance(char === "u" && peek(1) === "8" ? 3 : 2);
            tokens.push({ kind: "string", value: readQuoted(false, startLine, startCol), line: startLine, col: startCol });
            continue;
        }

        if (char === "\"") {
            advance();
            tokens.push({ kind: "string", value: readQuoted(false, startLine, startCol), line: startLine, col: startCol });
            continue;
        }

        if (char === "'") {
            advance();
            let value = "";
            if (peek() === "\\") { advance(); value = readEscape(); } else { value = peek(); advance(); }
            if (peek() !== "'") error("Karakter ifadesi tek bir karakter içermeli ve ' ile kapanmalıdır.", startLine, startCol);
            advance();
            tokens.push({ kind: "char", value, line: startLine, col: startCol });
            continue;
        }

        if (isDigit(char) || (char === "." && isDigit(peek(1)))) {
            let raw = "";
            let isFloat = false;
            if (char === "0" && (peek(1) === "x" || peek(1) === "X")) {
                advance(2);
                while (/[0-9a-fA-F_]/.test(peek())) { raw += peek(); advance(); }
                const value = parseInt(raw.replace(/_/g, ""), 16);
                while (/[uUlL]/.test(peek())) advance();
                tokens.push({ kind: "number", value: `0x${raw}`, num: value, isFloat: false, line: startLine, col: startCol });
                continue;
            }
            if (char === "0" && (peek(1) === "b" || peek(1) === "B")) {
                advance(2);
                while (/[01_]/.test(peek())) { raw += peek(); advance(); }
                while (/[uUlL]/.test(peek())) advance();
                tokens.push({ kind: "number", value: `0b${raw}`, num: parseInt(raw.replace(/_/g, ""), 2), isFloat: false, line: startLine, col: startCol });
                continue;
            }
            while (isDigit(peek()) || peek() === "_" || (dialect === "cpp" && peek() === "'" && isDigit(peek(1)))) { if (peek() !== "_" && peek() !== "'") raw += peek(); advance(); }
            if (peek() === "." && isDigit(peek(1))) {
                isFloat = true;
                raw += ".";
                advance();
                while (isDigit(peek()) || peek() === "_") { if (peek() !== "_") raw += peek(); advance(); }
            } else if (peek() === "." && dialect === "cpp" && (peek(1) === "f" || peek(1) === "F")) {
                // C++ allows "1.f"
                isFloat = true;
                advance();
            }
            if ((peek() === "e" || peek() === "E") && (isDigit(peek(1)) || ((peek(1) === "+" || peek(1) === "-") && isDigit(peek(2))))) {
                isFloat = true;
                raw += "e";
                advance();
                if (peek() === "+" || peek() === "-") { raw += peek(); advance(); }
                while (isDigit(peek())) { raw += peek(); advance(); }
            }
            while (/[fFdDmMuUlL]/.test(peek())) {
                if (/[fFdDmM]/.test(peek())) isFloat = true;
                advance();
            }
            if (isIdentStart(peek())) error("Sayının hemen ardından geçersiz karakter.", line, col);
            tokens.push({ kind: "number", value: raw, num: Number(raw), isFloat, line: startLine, col: startCol });
            continue;
        }

        if (isIdentStart(char) || (char === "@" && isIdentStart(peek(1)))) {
            let value = "";
            if (char === "@") advance(); // C# @keyword identifiers
            while (index < length && isIdentPart(peek())) { value += peek(); advance(); }
            const kind: TokenKind = char !== "@" && KEYWORDS.has(value) ? "keyword" : "ident";
            pushToken({ kind, value, line: startLine, col: startCol });
            continue;
        }

        const punct = PUNCTUATORS.find((candidate) => source.startsWith(candidate, index));
        if (punct) {
            advance(punct.length);
            tokens.push({ kind: "punct", value: punct, line: startLine, col: startCol });
            continue;
        }

        error(`Beklenmeyen karakter: '${char}'`, startLine, startCol);
    }

    tokens.push({ kind: "eof", value: "", line, col });
    return tokens;
}
