/**
 * Safe calculator for Hanogt AI Core. A small recursive-descent parser (no
 * eval) for + − × ÷ ^ % !, parentheses, common functions and constants, plus
 * Turkish/English phrasing ("12 çarpı 7", "square root of 2", "20% of 150").
 */

/** Word pattern with Unicode-aware boundaries (JS \\b is ASCII-only, so "çarpı" never matched). */
function word(source: string, flags = "giu") {
    return new RegExp(`(?<![\\p{L}\\p{N}])(?:${source})(?![\\p{L}\\p{N}])`, flags);
}

const WORDS: Array<[RegExp, string]> = [
    [word("karekök(?:ü)?|kare kökü|square root of|sqrt of|root of"), "sqrt "],
    [word("küpkök(?:ü)?|cube root of"), "cbrt "],
    [word("çarpı|kere|times|multiplied by|x"), "*"],
    [word("bölü|divided by|over"), "/"],
    [word("artı|plus|and"), "+"],
    [word("eksi|minus"), "-"],
    [word("üssü|üzeri|to the power of|power of|raised to"), "^"],
    [word("mod|modulo"), "%"],
    [/(?<![\p{L}\p{N}])(?:faktöriyel(?:i)?|factorial(?: of)?)\s*\(?\s*(\d+)\s*\)?/giu, "$1!"],
    [/(\d+)\s*faktöriyel/giu, "$1!"],
    [/π/g, "pi"],
    [/×/g, "*"],
    [/÷/g, "/"],
    [/√\s*/g, "sqrt "],
];

const NOISE = new RegExp(`${word("kaç(?:tır)?|kaç eder|eder|hesapla|hesaplar mısın|sonucu|sonuç|nedir|ne|what's|what is|what|calculate|compute|evaluate|equals?|please|lütfen|the|of").source}|[=?]`, "giu");

type Token = { type: "num"; value: number } | { type: "op"; value: string } | { type: "id"; value: string } | { type: "(" } | { type: ")" } | { type: "," };

const FUNCTIONS: Record<string, (...args: number[]) => number> = {
    sqrt: Math.sqrt,
    cbrt: Math.cbrt,
    abs: Math.abs,
    sin: (x) => Math.sin((x * Math.PI) / 180),
    cos: (x) => Math.cos((x * Math.PI) / 180),
    tan: (x) => Math.tan((x * Math.PI) / 180),
    asin: (x) => (Math.asin(x) * 180) / Math.PI,
    acos: (x) => (Math.acos(x) * 180) / Math.PI,
    atan: (x) => (Math.atan(x) * 180) / Math.PI,
    ln: Math.log,
    log: Math.log10,
    log2: Math.log2,
    exp: Math.exp,
    round: Math.round,
    floor: Math.floor,
    ceil: Math.ceil,
    min: (...values) => Math.min(...values),
    max: (...values) => Math.max(...values),
    pow: (a, b) => a ** b,
};

const CONSTANTS: Record<string, number> = { pi: Math.PI, e: Math.E, tau: Math.PI * 2 };

function tokenize(source: string): Token[] | null {
    const tokens: Token[] = [];
    let index = 0;
    while (index < source.length) {
        const char = source[index];
        if (/\s/.test(char)) { index += 1; continue; }
        const number = /^(?:\d+(?:\.\d+)?|\.\d+)(?:e[+-]?\d+)?/i.exec(source.slice(index));
        if (number) { tokens.push({ type: "num", value: Number(number[0]) }); index += number[0].length; continue; }
        const identifier = /^[a-z][a-z0-9]*/i.exec(source.slice(index));
        if (identifier) { tokens.push({ type: "id", value: identifier[0].toLowerCase() }); index += identifier[0].length; continue; }
        if ("+-*/^%!".includes(char)) { tokens.push({ type: "op", value: char }); index += 1; continue; }
        if (char === "(") { tokens.push({ type: "(" }); index += 1; continue; }
        if (char === ")") { tokens.push({ type: ")" }); index += 1; continue; }
        if (char === ",") { tokens.push({ type: "," }); index += 1; continue; }
        return null;
    }
    return tokens;
}

function factorial(value: number) {
    if (!Number.isInteger(value) || value < 0 || value > 170) throw new Error("factorial");
    let result = 1;
    for (let step = 2; step <= value; step += 1) result *= step;
    return result;
}

function parse(tokens: Token[]) {
    let position = 0;
    let depth = 0;
    const peek = () => tokens[position];
    const take = () => tokens[position++];
    const expectClose = () => {
        if (peek()?.type !== ")") throw new Error("paren");
        take();
    };

    // expression := term (("+" | "-") term)*
    const expression = (): number => {
        if (++depth > 64) throw new Error("depth");
        let value = term();
        for (let token = peek(); token?.type === "op" && (token.value === "+" || token.value === "-"); token = peek()) {
            take();
            value = token.value === "+" ? value + term() : value - term();
        }
        depth -= 1;
        return value;
    };
    // term := power (("*" | "/" | "%") power | implicit power)*
    const term = (): number => {
        let value = power();
        for (;;) {
            const token = peek();
            if (token?.type === "op" && (token.value === "*" || token.value === "/" || token.value === "%")) {
                take();
                const right = power();
                if ((token.value === "/" || token.value === "%") && right === 0) throw new Error("zero");
                value = token.value === "*" ? value * right : token.value === "/" ? value / right : value % right;
            } else if (token && (token.type === "(" || token.type === "id" || token.type === "num")) {
                value *= power(); // implicit multiplication: 2pi, 3(4+1)
            } else {
                return value;
            }
        }
    };
    // power := unary ("^" power)?
    const power = (): number => {
        const base = unary();
        if (peek()?.type === "op" && (peek() as { value: string }).value === "^") {
            take();
            return base ** power();
        }
        return base;
    };
    const unary = (): number => {
        const token = peek();
        if (token?.type === "op" && (token.value === "-" || token.value === "+")) {
            take();
            const value = unary();
            return token.value === "-" ? -value : value;
        }
        return postfix();
    };
    const postfix = (): number => {
        let value = primary();
        while (peek()?.type === "op" && (peek() as { value: string }).value === "!") {
            take();
            value = factorial(value);
        }
        // "20%" followed by nothing or an operator means percent.
        return value;
    };
    const primary = (): number => {
        const token = take();
        if (!token) throw new Error("end");
        if (token.type === "num") return token.value;
        if (token.type === "(") {
            const value = expression();
            expectClose();
            return value;
        }
        if (token.type === "id") {
            if (token.value in CONSTANTS) return CONSTANTS[token.value];
            const fn = FUNCTIONS[token.value];
            if (!fn) throw new Error("unknown");
            const args: number[] = [];
            if (peek()?.type === "(") {
                take();
                if (peek()?.type !== ")") {
                    args.push(expression());
                    while (peek()?.type === ",") { take(); args.push(expression()); }
                }
                expectClose();
            } else {
                args.push(power());
            }
            return fn(...args);
        }
        throw new Error("syntax");
    };

    const value = expression();
    if (position !== tokens.length) throw new Error("trailing");
    return value;
}

/** Turns a chat message into a bare arithmetic expression, or null if it isn't one. */
export function extractExpression(message: string): string | null {
    let text = message.toLocaleLowerCase("tr").replace(/\s+/g, " ").trim();
    if (text.length > 200) return null;
    // "20% of 150", "150'nin %20'si", "yüzde 20 150"
    const percentOf = /(\d+(?:[.,]\d+)?)\s*%\s*(?:of|x)?\s*(\d+(?:[.,]\d+)?)/.exec(text) ?? null;
    const turkishPercent = /(\d+(?:[.,]\d+)?)\s*'?(?:n[iı]n|un|ün|in|ın)?\s*%\s*(\d+(?:[.,]\d+)?)\s*'?\s*(?:s[iı]|u|ü|i|ı)?/.exec(text);
    const yuzde = /yüzde\s*(\d+(?:[.,]\d+)?)\s*(?:'?(?:si|sı|i|ı)?\s*)?(?:of)?\s*(\d+(?:[.,]\d+)?)?/.exec(text);
    if (percentOf && /%\s*(?:of)/.test(text)) return `${percentOf[1].replace(",", ".")}/100*${percentOf[2].replace(",", ".")}`;
    if (turkishPercent && /'?n[iı]n|un|ün|in|ın/.test(text) && text.includes("%") && !/[+\-*/^]/.test(text)) return `${turkishPercent[2].replace(",", ".")}/100*${turkishPercent[1].replace(",", ".")}`;
    if (yuzde && yuzde[2]) return `${yuzde[1].replace(",", ".")}/100*${yuzde[2].replace(",", ".")}`;
    for (const [pattern, replacement] of WORDS) text = text.replace(pattern, replacement);
    text = text.replace(NOISE, " ");
    // Turkish decimal comma inside a number when no function call uses commas.
    if (!text.includes("(")) text = text.replace(/(\d),(\d)/g, "$1.$2");
    text = text.replace(/[^0-9a-z.+\-*/^%!(), ]/gi, " ").replace(/\s+/g, " ").trim();
    if (!text || !/\d|pi|\be\b/.test(text)) return null;
    // Must contain an operator or a function: a lone number is not a calculation.
    if (!/[+\-*/^%!]|\b(?:sqrt|cbrt|abs|sin|cos|tan|asin|acos|atan|ln|log|log2|exp|round|floor|ceil|min|max|pow)\b/.test(text)) return null;
    const leftovers = text.replace(/\b(?:sqrt|cbrt|abs|sin|cos|tan|asin|acos|atan|ln|log|log2|exp|round|floor|ceil|min|max|pow|pi|tau|e)\b/g, "").replace(/[0-9.+\-*/^%!(), ]/g, "");
    if (leftovers.length > 0) return null;
    return text;
}

export function calculate(message: string): { expression: string; value: number } | null {
    const expression = extractExpression(message);
    if (!expression) return null;
    const tokens = tokenize(expression);
    if (!tokens?.length || tokens.length > 120) return null;
    try {
        const value = parse(tokens);
        if (!Number.isFinite(value)) return null;
        return { expression, value };
    } catch {
        return null;
    }
}

export function formatNumber(value: number, locale: string) {
    if (Number.isInteger(value) && Math.abs(value) < 1e21) return value.toLocaleString(locale);
    const rounded = Number(value.toPrecision(12));
    return Math.abs(rounded) >= 1e-6 && Math.abs(rounded) < 1e15
        ? rounded.toLocaleString(locale, { maximumFractionDigits: 10 })
        : rounded.toExponential(6);
}
