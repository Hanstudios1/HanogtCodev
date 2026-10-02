/**
 * Prolog in the browser on top of Tau Prolog (an ISO Prolog interpreter in
 * JavaScript, BSD-3-Clause), loaded on demand.
 *
 * A program file runs like `swipl main.pro` would run it:
 *  - clauses are loaded first; declarations (dynamic, op, use_module,
 *    set_prolog_flag…) take effect while loading;
 *  - `:- Goal.` directives run once, in source order (a failing directive is a
 *    warning, like in SWI-Prolog);
 *  - `?- Goal.` queries print their answers like the top level
 *    ("X = 1 ;" … up to ten answers), which makes small experiments easy;
 *  - `:- initialization(main).` goals run after everything else, and a
 *    program without any directive runs `main/0` when it exists.
 *
 * Goals run in slices of inferences, so the time limit stops infinite loops
 * without killing the worker. Double-quoted text is an atom (SWI-like
 * printing); list predicates (append/3, member/2, nth1/3…), format/2, random
 * and a few SWI conveniences (writeln/1, print/1, tab/1, string_concat/3,
 * atom_number/2…) are always available.
 */

export type PrologLocale = "tr" | "en";

export interface PrologOptions {
    stdin?: string;
    /** Shown in error locations, e.g. "main.pro". */
    fileName?: string;
    locale?: PrologLocale;
    onOutput?: (text: string) => void;
    onError?: (text: string) => void;
    /** Polled between inference slices; returning true stops the run. */
    shouldStop?: () => boolean;
    /** Answers printed per `?-` query (default 10). */
    maxAnswers?: number;
}

export interface PrologResult {
    output: string;
    errors: string;
    exitCode: number;
    /** True when the time limit stopped the program. */
    timedOut: boolean;
}

export interface PrologClause {
    kind: "clause" | "directive" | "query";
    /** The clause without its final '.' (and without the ":-" / "?-" prefix for directives and queries). */
    body: string;
    /** Offset of the clause's first character in the source. */
    offset: number;
    /** Offset just after the terminating '.'. */
    end: number;
    line: number;
    column: number;
}

// ------------------------------------------------------------------ Tau types
type TauTerm = {
    id: string;
    args: TauTerm[];
    indicator?: string;
    value?: number;
    is_float?: boolean;
    toString(options?: { quoted?: boolean; session?: TauSession; ignore_ops?: boolean }): string;
};
type TauAnswer = { links: Record<string, TauTerm> };
type TauCallbacks = { success: (answer: TauAnswer) => void; fail: () => void; error: (error: TauTerm) => void; limit: () => void };
type TauStream = unknown;
type TauThread = { points: unknown[] };
type TauSession = {
    streams: Record<string, TauStream>;
    standard_input: TauStream; standard_output: TauStream; standard_error: TauStream;
    current_input: TauStream; current_output: TauStream;
    flag: Record<string, TauTerm>;
    thread: TauThread;
    modules: { user: { rules: Record<string, unknown> } };
    consult(program: string, options: { script: boolean; url: boolean; file: boolean; html: boolean; success: () => void; error: (error: TauTerm) => void }): void;
    query(goal: string, options: { success: () => void; error: (error: TauTerm) => void }): void;
    answer(callbacks: TauCallbacks): void;
};
type TauPredicate = (thread: TauThread, point: unknown, atom: TauTerm) => void;
type Tau = {
    create(limit?: number): TauSession;
    type: {
        Stream: new (stream: object, mode: string, alias: string, type: string, reposition: boolean, eofAction: string) => TauStream;
        Term: new (id: string, args?: TauTerm[]) => TauTerm;
        is_variable(term: unknown): boolean;
        is_integer(term: unknown): boolean;
    };
    modules: { system: { rules: Record<string, TauPredicate> } };
};

// ------------------------------------------------------------------ loading
type RunState = { halted: boolean; haltCode: number };
let current: RunState = { halted: false, haltCode: 0 };
let tauPromise: Promise<Tau> | null = null;

/** Loads Tau Prolog and its library modules once (they register themselves globally). */
export function loadTau(): Promise<Tau> {
    if (!tauPromise) {
        tauPromise = (async () => {
            // Tau Prolog reads `window` while it loads in a non-Node environment;
            // a Web Worker has no window, so lend it the global scope for that moment.
            const scope = globalThis as { window?: unknown };
            const lent = !("window" in scope);
            if (lent) scope.window = globalThis;
            try {
                const core = (await import("tau-prolog")).default as Tau;
                const [lists, charsio, format, random] = await Promise.all([
                    import("tau-prolog/modules/lists.js"),
                    import("tau-prolog/modules/charsio.js"),
                    import("tau-prolog/modules/format.js"),
                    import("tau-prolog/modules/random.js"),
                ]);
                for (const library of [lists, charsio, format, random]) library.default(core);
                // halt/0,1 end the whole run (Tau would call process.exit under Node).
                core.modules.system.rules["halt/0"] = (thread) => {
                    current.halted = true;
                    current.haltCode = 0;
                    thread.points = [];
                };
                const halt1: TauPredicate = (thread, _point, atom) => {
                    const code = atom.args[0];
                    current.halted = true;
                    current.haltCode = core.type.is_integer(code) ? Number(code.value) : 1;
                    thread.points = [];
                };
                core.modules.system.rules["halt/1"] = halt1;
                return core;
            } finally {
                if (lent) delete scope.window;
            }
        })();
        tauPromise.catch(() => {
            tauPromise = null;
        });
    }
    return tauPromise;
}

/** SWI-Prolog conveniences missing from Tau Prolog (user code may redefine them). */
const PRELUDE = `
:- use_module(library(lists)).
:- use_module(library(format)).
:- use_module(library(random)).
:- use_module(library(charsio)).
:- op(1150, fx, dynamic).
:- op(1150, fx, discontiguous).
:- op(1150, fx, multifile).
:- op(1150, fx, initialization).
:- op(1150, fx, table).
format(F) :- format(F, []).
format(F, A) :- '$hanogt_format'(F, A, Cs, As), format:format(Cs, As).
format(S, F, A) :- '$hanogt_format'(F, A, Cs, As), format:format(S, Cs, As).
'$hanogt_format'(F, A, Cs, As) :-
    ( atom(F) -> atom_chars(F, Cs)
    ; F = [C|_], integer(C) -> atom_codes(T, F), atom_chars(T, Cs)
    ; Cs = F ),
    ( is_list(A) -> As = A ; As = [A] ).
writeln(X) :- write(X), nl.
writeln(S, X) :- write(S, X), nl(S).
print(X) :- writeq(X).
tab(N) :- N =< 0, !.
tab(N) :- put_char(' '), M is N - 1, tab(M).
numlist(L, H, []) :- L > H, !.
numlist(L, H, [L|T]) :- M is L + 1, numlist(M, H, T).
sumlist(L, S) :- sum_list(L, S).
max_member(M, L) :- max_list(L, M).
min_member(M, L) :- min_list(L, M).
delete([], _, []).
delete([H|T], X, R) :- H \\= X, !, R = [H|R1], delete(T, X, R1).
delete([_|T], X, R) :- delete(T, X, R).
subtract([], _, []).
subtract([H|T], L, R) :- memberchk(H, L), !, subtract(T, L, R).
subtract([H|T], L, [H|R]) :- subtract(T, L, R).
memberchk(X, L) :- member(X, L), !.
atom_number(A, N) :- var(A), !, number(N), number_codes(N, C), atom_codes(A, C).
atom_number(A, N) :- atom(A), atom_codes(A, C), catch(number_codes(N0, C), _, fail), N = N0.
atom_string(A, S) :- atom_codes(A, C), atom_codes(S, C).
number_string(N, S) :- atom_number(S, N).
string_concat(A, B, C) :- nonvar(A), nonvar(B), !, atomic_list_concat([A, B], C).
string_concat(A, B, C) :- atom_concat(A, B, C).
string_chars(S, C) :- atom_chars(S, C).
string_codes(S, C) :- atom_codes(S, C).
string_to_atom(S, A) :- atom_codes(S, C), atom_codes(A, C).
string_length(S, L) :- atom_length(S, L).
string_lower(S, L) :- downcase_atom(S, L).
string_upper(S, U) :- upcase_atom(S, U).
term_to_atom(T, A) :- write_term_to_chars(T, [quoted(true)], C), atom_chars(A, C).
plus(X, Y, Z) :- nonvar(X), nonvar(Y), !, Z is X + Y.
plus(X, Y, Z) :- nonvar(X), nonvar(Z), !, Y is Z - X.
plus(X, Y, Z) :- X is Z - Y.
ignore(G) :- (call(G) -> true ; true).
assert(C) :- assertz(C).
aggregate_all(count, G, C) :- !, findall(x, G, L), length(L, C).
aggregate_all(sum(E), G, S) :- !, findall(E, G, L), sum_list(L, S).
aggregate_all(max(E), G, M) :- !, findall(E, G, L), L \\== [], max_list(L, M).
aggregate_all(min(E), G, M) :- !, findall(E, G, L), L \\== [], min_list(L, M).
aggregate_all(bag(E), G, L) :- !, findall(E, G, L).
aggregate_all(set(E), G, S) :- !, findall(E, G, L), sort(L, S).
`;

// ------------------------------------------------------------------ messages
const T = {
    loaded: { tr: "Program yüklendi ({clauses} cümlecik). Bir şey çalıştırmak için `:- initialization(main).` yönergesi, bir main/0 yüklemi veya `?- hedef.` biçiminde bir sorgu ekleyin.", en: "Program loaded ({clauses}). To run something, add a `:- initialization(main).` directive, a main/0 predicate or a query such as `?- goal.`." },
    directiveFailed: { tr: "Uyarı: Hedef (yönerge) başarısız oldu: {goal}", en: "Warning: Goal (directive) failed: {goal}" },
    initFailed: { tr: "Uyarı: initialization hedefi başarısız oldu: {goal}", en: "Warning: Initialization goal failed: {goal}" },
    timeLimit: { tr: "Süre sınırı aşıldı; program sonsuz bir döngüde veya çok derin bir aramada olabilir.", en: "Time limit exceeded; the program may be in an infinite loop or a very deep search." },
    moreAnswers: { tr: "… (ilk {count} yanıt gösterildi)", en: "… (stopped after {count} answers)" },
    syntax: { tr: "Sözdizimi hatası: {detail}", en: "Syntax error: {detail}" },
    unknownProcedure: { tr: "Tanımsız yüklem: {name}", en: "Unknown procedure: {name}" },
    arityHint: { tr: " (tanımlı olanlar: {list})", en: " (defined: {list})" },
    instantiation: { tr: "Argümanlar yeterince belirlenmemiş (bağlanmamış bir değişken kullanıldı)", en: "Arguments are not sufficiently instantiated (an unbound variable was used)" },
    typeError: { tr: "Tür hatası: {type} bekleniyordu, {culprit} bulundu", en: "Type error: expected {type}, found {culprit}" },
    domainError: { tr: "Tanım kümesi hatası: {culprit} geçerli bir {domain} değil", en: "Domain error: {culprit} is not a valid {domain}" },
    zeroDivisor: { tr: "Aritmetik hata: sıfıra bölme", en: "Arithmetic error: division by zero" },
    evaluation: { tr: "Aritmetik hata: {what}", en: "Arithmetic error: {what}" },
    intOverflow: { tr: "Aritmetik hata: tamsayı taşması (tamsayılar ±9007199254740991 ile sınırlıdır)", en: "Arithmetic error: integer overflow (integers are limited to ±9007199254740991)" },
    permission: { tr: "İzin hatası: {type} {culprit} için {action} yapılamaz", en: "Permission error: cannot {action} {type} {culprit}" },
    representation: { tr: "Gösterim hatası: {what}", en: "Representation error: {what}" },
    existence: { tr: "Bulunamadı: {type} {culprit}", en: "Existence error: {type} {culprit} does not exist" },
    resource: { tr: "Kaynak yetersiz: {what}", en: "Resource error: {what}" },
    uncaught: { tr: "Yakalanmamış istisna: {term}", en: "Unhandled exception: {term}" },
    inContext: { tr: " ({context} içinde)", en: " (in {context})" },
    loadFailed: { tr: "Prolog çalışma zamanı yüklenemedi: {message}. Sayfayı yenileyip tekrar deneyin.", en: "The Prolog runtime could not be loaded: {message}. Reload the page and try again." },
};

function fill(text: string, vars: Record<string, string | number>) {
    return text.replace(/\{(\w+)\}/g, (match, key: string) => (key in vars ? String(vars[key]) : match));
}

// ------------------------------------------------------------------ clauses
const SYMBOL_CHARS = "+-*/\\^<>=~:.?@#&$";

/**
 * Splits Prolog source into clauses at end tokens ('.' followed by layout, '%'
 * or the end of the file), skipping quoted text, 0'c literals and comments.
 * Text after the last end token is returned as a clause too (it is incomplete).
 */
export function splitPrologClauses(source: string): PrologClause[] {
    const clauses: PrologClause[] = [];
    let start = -1;
    let index = 0;
    const length = source.length;
    const push = (end: number) => {
        if (start < 0) return;
        const raw = source.slice(start, end);
        const text = raw.trim();
        const offset = start + raw.indexOf(text[0]);
        const before = source.slice(0, offset);
        const line = (before.match(/\n/g)?.length ?? 0) + 1;
        const column = offset - (before.lastIndexOf("\n") + 1) + 1;
        const withoutDot = text.endsWith(".") ? text.slice(0, -1) : text;
        if (withoutDot.startsWith(":-")) clauses.push({ kind: "directive", body: withoutDot.slice(2).trim(), offset, end, line, column });
        else if (withoutDot.startsWith("?-")) clauses.push({ kind: "query", body: withoutDot.slice(2).trim(), offset, end, line, column });
        else clauses.push({ kind: "clause", body: withoutDot, offset, end, line, column });
        start = -1;
    };
    while (index < length) {
        const char = source[index];
        if (char === "%") {
            while (index < length && source[index] !== "\n") index += 1;
            continue;
        }
        if (char === "/" && source[index + 1] === "*") {
            const close = source.indexOf("*/", index + 2);
            index = close < 0 ? length : close + 2;
            continue;
        }
        if (/\s/.test(char)) {
            index += 1;
            continue;
        }
        if (start < 0) start = index;
        if (char === "0" && source[index + 1] === "'" && !/[\w]/.test(source[index - 1] ?? "")) {
            // 0'c character code literal (0'' and 0'\n escapes included).
            index += source[index + 2] === "\\" ? 4 : source[index + 2] === "'" && source[index + 3] === "'" ? 4 : 3;
            continue;
        }
        if (char === "'" || char === "\"" || char === "`") {
            index += 1;
            while (index < length) {
                if (source[index] === "\\") {
                    index += 2;
                    continue;
                }
                if (source[index] === char) {
                    if (source[index + 1] === char) {
                        index += 2;
                        continue;
                    }
                    break;
                }
                index += 1;
            }
            index += 1;
            continue;
        }
        if (char === "." && !SYMBOL_CHARS.includes(source[index - 1] ?? " ") && (index + 1 >= length || /\s|%/.test(source[index + 1]))) {
            index += 1;
            push(index);
            continue;
        }
        if (SYMBOL_CHARS.includes(char)) {
            // A run of symbol characters is one token ("=..", "-->"), so a '.' inside it never ends a clause.
            while (index < length && SYMBOL_CHARS.includes(source[index])) {
                if (source[index] === "." && index > 0 && !SYMBOL_CHARS.includes(source[index - 1]) && (index + 1 >= length || /\s|%/.test(source[index + 1]))) break;
                index += 1;
            }
            continue;
        }
        index += 1;
    }
    if (start >= 0) push(length);
    return clauses;
}

const DECLARATIONS = /^(?:dynamic|discontiguous|multifile|op|use_module|ensure_loaded|module|set_prolog_flag|meta_predicate|char_conversion)\b/;
const INITIALIZATION = /^initialization(?:\s*\(([\s\S]*)\)|\s+([\s\S]+))$/;

/**
 * Tau Prolog 0.3 marks some terms built by its DCG translation as ground even
 * though they contain variables, which loses bindings (`greeting([hello, X], [])`
 * succeeded without binding X). Recomputes the flag bottom-up.
 */
function refreshGround(root: TauTerm | null | undefined) {
    if (!root) return;
    const order: TauTerm[] = [];
    const stack: TauTerm[] = [root];
    while (stack.length) {
        const term = stack.pop()!;
        if (term && Array.isArray(term.args) && term.args.length) {
            order.push(term);
            for (const arg of term.args) stack.push(arg);
        }
    }
    for (let index = order.length - 1; index >= 0; index -= 1) {
        const term = order[index] as TauTerm & { ground?: boolean };
        term.ground = term.args.every((arg) => !(Object.prototype.hasOwnProperty.call(arg, "ground") && (arg as { ground?: boolean }).ground === false));
    }
}

/** Replaces every character except line breaks with a space (keeps line and column numbers). */
function blank(text: string) {
    return text.replace(/[^\n]/g, " ");
}

/** Splits "main, main" (the arguments of initialization/2) at its top-level comma. */
function splitTopLevelComma(text: string): [string, string | null] {
    let depth = 0;
    let quote: string | null = null;
    for (let index = 0; index < text.length; index += 1) {
        const char = text[index];
        if (quote) {
            if (char === quote) quote = null;
            continue;
        }
        if (char === "'" || char === "\"") quote = char;
        else if ("([{".includes(char)) depth += 1;
        else if (")]}".includes(char)) depth -= 1;
        else if (char === "," && depth === 0) return [text.slice(0, index).trim(), text.slice(index + 1).trim()];
    }
    return [text.trim(), null];
}

// ------------------------------------------------------------------ running
type Task = { kind: "directive" | "query" | "initialization"; goal: string; line: number; column: number; halt?: boolean };

export async function runProlog(source: string, options: PrologOptions = {}): Promise<PrologResult> {
    const locale: PrologLocale = options.locale === "tr" ? "tr" : "en";
    const say = (text: { tr: string; en: string }, vars: Record<string, string | number> = {}) => fill(text[locale], vars);
    const fileName = options.fileName || "main.pro";
    let output = "";
    let errors = "";
    const out = (text: string) => {
        if (!text) return;
        output += text;
        options.onOutput?.(text);
    };
    const err = (text: string) => {
        if (!text) return;
        errors += text;
        options.onError?.(text);
    };
    let exitCode = 0;
    let timedOut = false;

    let pl: Tau;
    try {
        pl = await loadTau();
    } catch (error) {
        err(`${say(T.loadFailed, { message: error instanceof Error ? error.message : String(error) })}\n`);
        return { output, errors, exitCode: 1, timedOut };
    }
    current = { halted: false, haltCode: 0 };
    const session = pl.create(20_000);
    const writer = (write: (text: string) => void) => ({ put: (text: string) => { write(text); return true; }, flush: () => true });
    const stdin = (options.stdin ?? "").replace(/\r\n/g, "\n");
    const reader = {
        get: (length: number, position: number) => (position >= stdin.length ? "end_of_stream" : stdin.substr(position, length)),
        eof: (position: number) => position >= stdin.length,
        put: () => false,
        flush: () => true,
    };
    session.streams.user_input = new pl.type.Stream(reader, "read", "user_input", "text", false, "eof_code");
    session.streams.user_output = new pl.type.Stream(writer(out), "append", "user_output", "text", false, "reset");
    session.streams.user_error = new pl.type.Stream(writer(err), "append", "user_error", "text", false, "reset");
    session.standard_input = session.current_input = session.streams.user_input;
    session.standard_output = session.current_output = session.streams.user_output;
    session.standard_error = session.streams.user_error;
    session.flag.nodejs = new pl.type.Term("false");
    session.flag.double_quotes = new pl.type.Term("atom");

    const termText = (term: TauTerm | undefined) => (term ? term.toString({ quoted: true, session }) : "");
    const location = (line: number, column = 1) => `\n    at ${fileName}:${line}:${column}`;

    /** A readable message for an error term thrown by Tau (the argument of throw/1). */
    const describe = (thrown: TauTerm): { message: string; line?: number; column?: number } => {
        const term = thrown.indicator === "throw/1" ? thrown.args[0] : thrown;
        if (term?.indicator !== "error/2") return { message: say(T.uncaught, { term: termText(term) }) };
        const [formal, context] = term.args;
        let line: number | undefined;
        let column: number | undefined;
        let contextText = "";
        if (context?.indicator === "./2") {
            // [line(L), column(C), found(F)] from the parser.
            for (let item: TauTerm | undefined = context; item?.indicator === "./2"; item = item.args[1]) {
                const head = item.args[0];
                if (head?.indicator === "line/1") line = Number(head.args[0]?.value);
                if (head?.indicator === "column/1") column = Number(head.args[0]?.value);
            }
        } else if (context && !pl.type.is_variable(context) && context.indicator !== "top_level/0") {
            contextText = termText(context);
        }
        const inContext = contextText ? say(T.inContext, { context: contextText }) : "";
        const name = formal?.indicator ?? "";
        const arg = (index: number) => termText(formal?.args[index]);
        let message: string;
        switch (name) {
            case "syntax_error/1":
                message = say(T.syntax, { detail: formal.args[0]?.id ?? arg(0) });
                break;
            case "existence_error/2":
                if (formal.args[0]?.id === "procedure") {
                    const indicator = arg(1).replace(/^\/\((.*),(\d+)\)$/, "$1/$2");
                    const functor = indicator.split("/")[0];
                    const others = Object.keys(session.modules.user.rules).filter((key) => key.startsWith(`${functor}/`) && key !== indicator);
                    message = say(T.unknownProcedure, { name: indicator }) + (others.length ? say(T.arityHint, { list: others.join(", ") }) : "");
                } else {
                    message = say(T.existence, { type: arg(0), culprit: arg(1) });
                }
                break;
            case "instantiation_error/0":
                message = say(T.instantiation) + inContext;
                break;
            case "type_error/2":
                message = say(T.typeError, { type: arg(0), culprit: arg(1) }) + inContext;
                break;
            case "domain_error/2":
                message = say(T.domainError, { domain: arg(0), culprit: arg(1) }) + inContext;
                break;
            case "evaluation_error/1":
                message = (formal.args[0]?.id === "zero_divisor" ? say(T.zeroDivisor) : formal.args[0]?.id === "int_overflow" ? say(T.intOverflow) : say(T.evaluation, { what: arg(0) })) + inContext;
                break;
            case "permission_error/3":
                message = say(T.permission, { action: arg(0), type: arg(1), culprit: arg(2) }) + inContext;
                break;
            case "representation_error/1":
                message = say(T.representation, { what: arg(0) }) + inContext;
                break;
            case "resource_error/1":
                message = say(T.resource, { what: arg(0) }) + inContext;
                break;
            default:
                message = say(T.uncaught, { term: termText(term) });
        }
        return { message, line, column };
    };

    const stopped = () => {
        if (timedOut) return true;
        if (options.shouldStop?.()) timedOut = true;
        return timedOut;
    };

    /** Consults program text; resolves to an error message, or null on success. */
    const consult = (text: string) => new Promise<{ message: string; line?: number; column?: number } | null>((resolve) => {
        session.consult(text, { script: false, url: false, file: false, html: false, success: () => resolve(null), error: (error) => resolve(describe(error)) });
    });

    /**
     * Runs a goal. `onAnswer` receives each solution and returns whether to look for more;
     * the promise resolves to the number of answers, or to an error.
     */
    const solve = (goal: string, onAnswer: (answer: TauAnswer, more: boolean) => boolean) => new Promise<{ answers: number; error?: { message: string; line?: number; column?: number }; parseError?: boolean }>((resolve) => {
        let answers = 0;
        session.query(`${goal}.`, {
            error: (error) => resolve({ answers, error: describe(error), parseError: true }),
            success: () => {
                const next = () => {
                    if (stopped()) {
                        resolve({ answers });
                        return;
                    }
                    session.answer({
                        success: (answer) => {
                            answers += 1;
                            const more = session.thread.points.length > 0 && !current.halted;
                            if (onAnswer(answer, more) && more) next();
                            else resolve({ answers });
                        },
                        fail: () => resolve({ answers }),
                        error: (error) => resolve({ answers, error: describe(error) }),
                        limit: () => next(),
                    });
                };
                next();
            },
        });
    });

    // 1. The prelude, then the program's clauses and declarations.
    const preludeError = await consult(PRELUDE);
    if (preludeError) err(`${preludeError.message}\n`);
    const clauses = splitPrologClauses(source);
    const edits: Array<{ offset: number; end: number; text: string }> = [];
    const tasks: Task[] = [];
    const initializations: Task[] = [];
    let ruleCount = 0;
    for (const clause of clauses) {
        if (clause.kind === "clause") {
            ruleCount += 1;
            continue;
        }
        const original = source.slice(clause.offset, clause.end);
        if (clause.kind === "directive" && DECLARATIONS.test(clause.body)) {
            // `:- dynamic a/1, b/2.` declares both (Tau Prolog expects a list).
            const list = /^(dynamic|discontiguous|multifile)\s+(?![([])([\s\S]+)$/.exec(clause.body);
            if (list) {
                const text = `:- ${list[1]}([${list[2]}]).`;
                const lineBreaks = (original.match(/\n/g)?.length ?? 0) - (text.match(/\n/g)?.length ?? 0);
                edits.push({ offset: clause.offset, end: clause.end, text: text + "\n".repeat(Math.max(0, lineBreaks)) });
            }
            continue;
        }
        edits.push({ offset: clause.offset, end: clause.end, text: blank(original) });
        const init = clause.kind === "directive" ? INITIALIZATION.exec(clause.body) : null;
        if (init) {
            const [goal, when] = splitTopLevelComma(init[1] ?? init[2] ?? "");
            initializations.push({ kind: "initialization", goal, line: clause.line, column: clause.column, halt: when === "main" });
        } else {
            tasks.push({ kind: clause.kind === "query" ? "query" : "directive", goal: clause.body, line: clause.line, column: clause.column });
        }
    }
    let consultText = source;
    for (const edit of edits.reverse()) consultText = consultText.slice(0, edit.offset) + edit.text + consultText.slice(edit.end);
    const loadError = await consult(consultText);
    if (loadError) {
        err(`${loadError.message}${location(loadError.line ?? 1, loadError.column ?? 1)}\n`);
        return { output, errors, exitCode: 1, timedOut };
    }
    if (/-->/.test(source)) {
        for (const rules of Object.values(session.modules.user.rules)) {
            if (!Array.isArray(rules)) continue;
            for (const rule of rules as Array<{ head?: TauTerm; body?: TauTerm | null }>) {
                refreshGround(rule.head);
                refreshGround(rule.body);
            }
        }
    }
    if (!tasks.length && !initializations.length) {
        if (session.modules.user.rules["main/0"]) initializations.push({ kind: "initialization", goal: "main", line: 1, column: 1 });
        else out(`${say(T.loaded, { clauses: locale === "tr" ? ruleCount : `${ruleCount} ${ruleCount === 1 ? "clause" : "clauses"}` })}\n`);
    }

    // 2. Directives and queries in source order, then initialization goals.
    const maxAnswers = Math.max(1, options.maxAnswers ?? 10);
    for (const task of [...tasks, ...initializations]) {
        if (current.halted || stopped()) break;
        if (task.kind === "query") {
            out(`?- ${task.goal}.\n`);
            let names: string[] | null = null;
            let printed = 0;
            let open = false;
            const result = await solve(task.goal, (answer, more) => {
                names ??= Object.keys(answer.links).filter((name) => !name.startsWith("_"));
                const bindings = names
                    .map((name) => [name, answer.links[name]] as const)
                    .filter(([, value]) => value && !pl.type.is_variable(value))
                    .map(([name, value]) => `${name} = ${termText(value)}`);
                const text = bindings.length ? bindings.join(", ") : "true";
                printed += 1;
                if (!more) {
                    out(`${text}.\n`);
                    open = false;
                    return false;
                }
                out(`${text} ;\n`);
                open = true;
                if (printed >= maxAnswers) {
                    out(`${say(T.moreAnswers, { count: maxAnswers })}\n`);
                    open = false;
                    return false;
                }
                return true;
            });
            if (result.error) {
                const inGoal = result.parseError && result.error.line;
                err(`${result.error.message}${location(task.line + (inGoal ? (result.error.line ?? 1) - 1 : 0), inGoal ? result.error.column ?? 1 : task.column)}\n`);
                exitCode = 1;
            } else if (!timedOut && !current.halted && (!result.answers || open)) {
                out("false.\n");
            }
            out("\n");
            continue;
        }
        const result = await solve(task.goal, () => false);
        if (result.error) {
            const inGoal = result.parseError && result.error.line;
            err(`${result.error.message}${location(task.line + (inGoal ? (result.error.line ?? 1) - 1 : 0), inGoal ? result.error.column ?? 1 : task.column)}\n`);
            exitCode = 1;
        } else if (!result.answers && !timedOut && !current.halted) {
            err(`${say(task.kind === "initialization" ? T.initFailed : T.directiveFailed, { goal: task.goal })}${location(task.line, task.column)}\n`);
        }
        if (task.halt && !current.halted) {
            current.halted = true;
            current.haltCode = result.error ? 1 : result.answers ? 0 : 1;
        }
    }
    if (timedOut) {
        err(`${say(T.timeLimit)}\n`);
        return { output, errors, exitCode: 124, timedOut };
    }
    if (current.halted) exitCode = current.haltCode;
    return { output, errors, exitCode, timedOut };
}
