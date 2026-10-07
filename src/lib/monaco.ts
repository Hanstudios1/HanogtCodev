import { loader } from "@monaco-editor/react";
import type { editor, languages } from "monaco-editor";

/**
 * The Monaco API object handed to beforeMount/onMount. (The `Monaco` type of
 * @monaco-editor/react resolves to `any` with monaco-editor 0.57's export map.)
 */
export type MonacoApi = typeof import("monaco-editor");

let configured = false;

/**
 * Serves Monaco from our own origin (copied by scripts/copy-monaco.mjs).
 * The default jsDelivr CDN is blocked by the site's CSP, which left every
 * code editor on an endless loading screen in production.
 */
export function configureMonaco() {
    if (configured || typeof window === "undefined") return;
    configured = true;
    loader.config({ paths: { vs: "/monaco/vs" } });
}

// ------------------------------------------------------------------ themes
type ThemeColors = {
    background: string;
    foreground: string;
    lineHighlight: string;
    selection: string;
    cursor: string;
    lineNumber: string;
    activeLineNumber: string;
    whitespace: string;
    indentGuide: string;
    brackets: [string, string, string];
};

type ThemeTokens = {
    comment: string;
    keyword: string;
    string: string;
    number: string;
    type: string;
    function: string;
    variable: string;
    constant: string;
    operator: string;
    tag: string;
    attribute: string;
    regexp: string;
    delimiter?: string;
};

function makeTheme(base: "vs" | "vs-dark", colors: ThemeColors, tokens: ThemeTokens): editor.IStandaloneThemeData {
    const hex = (value: string) => value.replace("#", "");
    return {
        base,
        inherit: true,
        rules: [
            { token: "", foreground: hex(colors.foreground), background: hex(colors.background) },
            { token: "comment", foreground: hex(tokens.comment), fontStyle: "italic" },
            { token: "keyword", foreground: hex(tokens.keyword) },
            { token: "keyword.flow", foreground: hex(tokens.keyword) },
            { token: "storage", foreground: hex(tokens.keyword) },
            { token: "string", foreground: hex(tokens.string) },
            { token: "string.escape", foreground: hex(tokens.constant) },
            { token: "string.key", foreground: hex(tokens.attribute) },
            { token: "string.value", foreground: hex(tokens.string) },
            { token: "number", foreground: hex(tokens.number) },
            { token: "regexp", foreground: hex(tokens.regexp) },
            { token: "type", foreground: hex(tokens.type) },
            { token: "type.identifier", foreground: hex(tokens.type) },
            { token: "identifier", foreground: hex(tokens.variable) },
            { token: "variable", foreground: hex(tokens.variable) },
            { token: "variable.predefined", foreground: hex(tokens.constant) },
            { token: "constant", foreground: hex(tokens.constant) },
            { token: "predefined", foreground: hex(tokens.function) },
            { token: "function", foreground: hex(tokens.function) },
            { token: "annotation", foreground: hex(tokens.function) },
            { token: "metatag", foreground: hex(tokens.keyword) },
            { token: "operator", foreground: hex(tokens.operator) },
            { token: "delimiter", foreground: hex(tokens.delimiter ?? colors.foreground) },
            { token: "tag", foreground: hex(tokens.tag) },
            { token: "attribute.name", foreground: hex(tokens.attribute) },
            { token: "attribute.value", foreground: hex(tokens.string) },
            { token: "key", foreground: hex(tokens.attribute) },
            { token: "emphasis", fontStyle: "italic" },
            { token: "strong", fontStyle: "bold" },
            { token: "invalid", foreground: "f14c4c" },
        ],
        colors: {
            "editor.background": colors.background,
            "editor.foreground": colors.foreground,
            "editor.lineHighlightBackground": colors.lineHighlight,
            "editor.lineHighlightBorder": colors.lineHighlight,
            "editor.selectionBackground": colors.selection,
            "editor.inactiveSelectionBackground": `${colors.selection.slice(0, 7)}55`,
            "editorCursor.foreground": colors.cursor,
            "editorLineNumber.foreground": colors.lineNumber,
            "editorLineNumber.activeForeground": colors.activeLineNumber,
            "editorWhitespace.foreground": colors.whitespace,
            "editorIndentGuide.background1": colors.indentGuide,
            "editorIndentGuide.activeBackground1": colors.lineNumber,
            "editorGutter.background": colors.background,
            "minimap.background": colors.background,
            "editorBracketHighlight.foreground1": colors.brackets[0],
            "editorBracketHighlight.foreground2": colors.brackets[1],
            "editorBracketHighlight.foreground3": colors.brackets[2],
            "editorBracketMatch.border": colors.cursor,
            "editorBracketMatch.background": `${colors.selection.slice(0, 7)}33`,
            "editorWidget.background": colors.background,
            "editorSuggestWidget.background": colors.background,
            "editorHoverWidget.background": colors.background,
        },
    };
}

/** Custom Monaco themes; ids are stored in the editor settings. */
export const HANOGT_THEME_DATA: Readonly<Record<string, editor.IStandaloneThemeData>> = {
    "hanogt-night": makeTheme("vs-dark", {
        background: "#0E0E16", foreground: "#E4E4E7", lineHighlight: "#18182A", selection: "#6366F166", cursor: "#A78BFA",
        lineNumber: "#52525B", activeLineNumber: "#C4B5FD", whitespace: "#3F3F46", indentGuide: "#27272A",
        brackets: ["#A78BFA", "#F472B6", "#38BDF8"],
    }, {
        comment: "#71717A", keyword: "#C084FC", string: "#6EE7B7", number: "#FBBF24", type: "#7DD3FC", function: "#A5B4FC",
        variable: "#E4E4E7", constant: "#F9A8D4", operator: "#F0ABFC", tag: "#C084FC", attribute: "#7DD3FC", regexp: "#FCA5A5",
    }),
    "hanogt-dracula": makeTheme("vs-dark", {
        background: "#282A36", foreground: "#F8F8F2", lineHighlight: "#343746", selection: "#44475A", cursor: "#F8F8F0",
        lineNumber: "#6272A4", activeLineNumber: "#F8F8F2", whitespace: "#424450", indentGuide: "#3B3E4E",
        brackets: ["#FF79C6", "#BD93F9", "#8BE9FD"],
    }, {
        comment: "#6272A4", keyword: "#FF79C6", string: "#F1FA8C", number: "#BD93F9", type: "#8BE9FD", function: "#50FA7B",
        variable: "#F8F8F2", constant: "#BD93F9", operator: "#FF79C6", tag: "#FF79C6", attribute: "#50FA7B", regexp: "#FF5555",
    }),
    "hanogt-monokai": makeTheme("vs-dark", {
        background: "#272822", foreground: "#F8F8F2", lineHighlight: "#3E3D32", selection: "#49483E", cursor: "#F8F8F0",
        lineNumber: "#75715E", activeLineNumber: "#F8F8F2", whitespace: "#464741", indentGuide: "#3B3A32",
        brackets: ["#F92672", "#A6E22E", "#66D9EF"],
    }, {
        comment: "#75715E", keyword: "#F92672", string: "#E6DB74", number: "#AE81FF", type: "#66D9EF", function: "#A6E22E",
        variable: "#F8F8F2", constant: "#AE81FF", operator: "#F92672", tag: "#F92672", attribute: "#A6E22E", regexp: "#E6DB74",
    }),
    "hanogt-nord": makeTheme("vs-dark", {
        background: "#2E3440", foreground: "#D8DEE9", lineHighlight: "#3B4252", selection: "#434C5ECC", cursor: "#D8DEE9",
        lineNumber: "#4C566A", activeLineNumber: "#D8DEE9", whitespace: "#4C566A", indentGuide: "#3B4252",
        brackets: ["#88C0D0", "#B48EAD", "#EBCB8B"],
    }, {
        comment: "#616E88", keyword: "#81A1C1", string: "#A3BE8C", number: "#B48EAD", type: "#8FBCBB", function: "#88C0D0",
        variable: "#D8DEE9", constant: "#EBCB8B", operator: "#81A1C1", tag: "#81A1C1", attribute: "#8FBCBB", regexp: "#EBCB8B",
    }),
    "hanogt-solarized-light": makeTheme("vs", {
        background: "#FDF6E3", foreground: "#657B83", lineHighlight: "#EEE8D5", selection: "#EEE8D5", cursor: "#657B83",
        lineNumber: "#93A1A1", activeLineNumber: "#586E75", whitespace: "#D3CBB7", indentGuide: "#EEE8D5",
        brackets: ["#268BD2", "#D33682", "#859900"],
    }, {
        comment: "#93A1A1", keyword: "#859900", string: "#2AA198", number: "#D33682", type: "#B58900", function: "#268BD2",
        variable: "#657B83", constant: "#CB4B16", operator: "#859900", tag: "#268BD2", attribute: "#93A1A1", regexp: "#DC322F",
    }),
    "hanogt-github-light": makeTheme("vs", {
        background: "#FFFFFF", foreground: "#1F2328", lineHighlight: "#F6F8FA", selection: "#0969DA33", cursor: "#0969DA",
        lineNumber: "#8C959F", activeLineNumber: "#1F2328", whitespace: "#D0D7DE", indentGuide: "#EAEEF2",
        brackets: ["#0969DA", "#8250DF", "#BF8700"],
    }, {
        comment: "#6E7781", keyword: "#CF222E", string: "#0A3069", number: "#0550AE", type: "#953800", function: "#8250DF",
        variable: "#1F2328", constant: "#0550AE", operator: "#CF222E", tag: "#116329", attribute: "#0550AE", regexp: "#0A3069",
    }),
};

// ------------------------------------------------------------------ languages
type LanguageDefinition = {
    id: string;
    aliases: string[];
    extensions: string[];
    /** Exact file names (e.g. "Makefile"). */
    filenames?: string[];
    tokens: languages.IMonarchLanguage;
    configuration: languages.LanguageConfiguration;
};

const BRACKETS: languages.CharacterPair[] = [["{", "}"], ["[", "]"], ["(", ")"]];
const PAIRS: languages.IAutoClosingPairConditional[] = [
    { open: "{", close: "}" }, { open: "[", close: "]" }, { open: "(", close: ")" },
    { open: "\"", close: "\"", notIn: ["string"] },
];

function cLikeConfiguration(lineComment = "//", block: languages.CharacterPair | null = ["/*", "*/"]): languages.LanguageConfiguration {
    return {
        comments: { lineComment, ...(block ? { blockComment: block } : {}) },
        brackets: BRACKETS,
        autoClosingPairs: [...PAIRS, { open: "'", close: "'", notIn: ["string", "comment"] }],
        surroundingPairs: [{ open: "{", close: "}" }, { open: "[", close: "]" }, { open: "(", close: ")" }, { open: "\"", close: "\"" }, { open: "'", close: "'" }],
    };
}

/** A Monarch grammar for brace languages (D, Zig, Groovy, Pony, Odin, V, Gleam). */
function cLikeTokens(options: {
    keywords: string[];
    types?: string[];
    constants?: string[];
    blockComments?: boolean;
    nestedComments?: [string, string];
    extraRoot?: languages.IMonarchLanguageRule[];
}): languages.IMonarchLanguage {
    const whitespace: languages.IMonarchLanguageRule[] = [[/[ \t\r\n]+/, ""], [/\/\/.*$/, "comment"]];
    if (options.blockComments !== false) whitespace.push([/\/\*/, "comment", "@comment"]);
    if (options.nestedComments) whitespace.push([new RegExp(options.nestedComments[0].replace(/[+*]/g, "\\$&")), "comment", "@nested"]);
    return {
        defaultToken: "",
        keywords: options.keywords,
        typeKeywords: options.types ?? [],
        constants: options.constants ?? ["true", "false", "null"],
        symbols: /[=><!~?:&|+\-*/^%]+/,
        escapes: /\\(?:[abfnrtv\\"'0]|x[0-9A-Fa-f]{1,4}|u\{?[0-9A-Fa-f]{1,6}\}?)/,
        tokenizer: {
            root: [
                ...(options.extraRoot ?? []),
                [/[A-Z][\w$]*/, { cases: { "@keywords": "keyword", "@typeKeywords": "type", "@default": "type.identifier" } }],
                [/[a-z_$][\w$]*/, { cases: { "@keywords": "keyword", "@typeKeywords": "type", "@constants": "constant", "@default": "identifier" } }],
                { include: "@whitespace" },
                [/[{}()[\]]/, "@brackets"],
                [/@[a-zA-Z_]\w*/, "annotation"],
                [/\d*\.\d+(?:[eE][-+]?\d+)?/, "number.float"],
                [/0[xX][0-9a-fA-F_]+/, "number.hex"],
                [/0[bB][01_]+/, "number.binary"],
                [/0[oO][0-7_]+/, "number.octal"],
                [/\d[\d_]*(?:[eE][-+]?\d+)?/, "number"],
                [/[;,.]/, "delimiter"],
                [/@symbols/, "operator"],
                [/"""/, "string", "@tripleString"],
                [/"/, "string", "@string"],
                [/'[^\\']'/, "string"],
                [/(')(@escapes)(')/, ["string", "string.escape", "string"]],
                [/'/, "string.invalid"],
            ],
            whitespace,
            comment: [[/[^/*]+/, "comment"], [/\*\//, "comment", "@pop"], [/[/*]/, "comment"]],
            nested: options.nestedComments
                ? [[new RegExp(options.nestedComments[0].replace(/[+*]/g, "\\$&")), "comment", "@push"], [new RegExp(options.nestedComments[1].replace(/[+*]/g, "\\$&")), "comment", "@pop"], [/[\s\S]/, "comment"]]
                : [[/[\s\S]/, "comment", "@pop"]],
            string: [[/[^\\"$]+/, "string"], [/\$\{[^}]*\}/, "variable"], [/\$/, "string"], [/@escapes/, "string.escape"], [/\\./, "string.escape.invalid"], [/"/, "string", "@pop"]],
            tripleString: [[/"""/, "string", "@pop"], [/[^"]+/, "string"], [/"/, "string"]],
        },
    };
}

const NUMBER_RULES: languages.IMonarchLanguageRule[] = [
    [/\d+\.\d+(?:[eE][+-]?\d+)?/, "number.float"],
    [/0[xX][0-9a-fA-F_]+/, "number.hex"],
    [/\d[\d_]*/, "number"],
];

/** Token types the CSV grammar cycles through, one per column. */
const CSV_COLUMN_TOKENS = ["identifier", "string", "number", "type", "keyword", "predefined"];

const EXTRA_LANGUAGES: LanguageDefinition[] = [
    {
        id: "brainfuck",
        aliases: ["Brainfuck", "bf"],
        extensions: [".bf", ".b"],
        tokens: {
            defaultToken: "comment",
            tokenizer: {
                root: [
                    [/[+-]+/, "keyword"],
                    [/[<>]+/, "type"],
                    [/[.,]/, "string"],
                    [/[[\]]/, "@brackets"],
                    [/[^+\-<>.,[\]]+/, "comment"],
                ],
            },
        },
        configuration: { brackets: [["[", "]"]], autoClosingPairs: [{ open: "[", close: "]" }] },
    },
    {
        id: "haskell",
        aliases: ["Haskell", "hs"],
        extensions: [".hs", ".lhs"],
        tokens: {
            defaultToken: "",
            keywords: ["case", "class", "data", "default", "deriving", "do", "else", "foreign", "if", "import", "in", "infix", "infixl", "infixr", "instance", "let", "module", "newtype", "of", "then", "type", "where", "qualified", "as", "hiding", "forall", "mdo", "family", "pattern"],
            tokenizer: {
                root: [
                    [/\{-/, "comment", "@comment"],
                    [/--+(?![!#$%&*+./<=>?@\\^|~:]).*$/, "comment"],
                    [/[A-Z][\w']*(?:\.[A-Z][\w']*)*/, "type.identifier"],
                    [/[a-z_][\w']*/, { cases: { "@keywords": "keyword", "@default": "identifier" } }],
                    ...NUMBER_RULES,
                    [/"/, "string", "@string"],
                    [/'(?:[^'\\]|\\.)'/, "string"],
                    [/[!#$%&*+./<=>?@\\^|~:-]+/, "operator"],
                    [/[()[\]{},;`]/, "delimiter"],
                ],
                comment: [[/[^{-]+/, "comment"], [/\{-/, "comment", "@push"], [/-\}/, "comment", "@pop"], [/[{-]/, "comment"]],
                string: [[/[^\\"]+/, "string"], [/\\./, "string.escape"], [/"/, "string", "@pop"]],
            },
        },
        configuration: { comments: { lineComment: "--", blockComment: ["{-", "-}"] }, brackets: BRACKETS, autoClosingPairs: PAIRS },
    },
    {
        id: "erlang",
        aliases: ["Erlang", "erl"],
        extensions: [".erl", ".hrl"],
        tokens: {
            defaultToken: "",
            keywords: ["after", "and", "andalso", "band", "begin", "bnot", "bor", "bsl", "bsr", "bxor", "case", "catch", "cond", "div", "end", "fun", "if", "let", "maybe", "not", "of", "or", "orelse", "receive", "rem", "try", "when", "xor"],
            tokenizer: {
                root: [
                    [/%.*$/, "comment"],
                    [/^-[a-z_]+/, "annotation"],
                    [/[A-Z_][\w@]*/, "variable"],
                    [/[a-z][\w@]*/, { cases: { "@keywords": "keyword", "@default": "identifier" } }],
                    [/'(?:[^'\\]|\\.)*'/, "type"],
                    [/"/, "string", "@string"],
                    [/\$\\?./, "string"],
                    [/\d+#[0-9a-zA-Z]+/, "number"],
                    ...NUMBER_RULES,
                    [/->|<-|=>|::|\|\||[+\-*/=<>!|]/, "operator"],
                    [/[()[\]{},.;:#]/, "delimiter"],
                ],
                string: [[/[^\\"~]+/, "string"], [/~[a-zA-Z~]/, "string.escape"], [/\\./, "string.escape"], [/~/, "string"], [/"/, "string", "@pop"]],
            },
        },
        configuration: { comments: { lineComment: "%" }, brackets: BRACKETS, autoClosingPairs: PAIRS },
    },
    {
        id: "nim",
        aliases: ["Nim"],
        extensions: [".nim", ".nims"],
        tokens: {
            defaultToken: "",
            keywords: ["addr", "and", "as", "asm", "bind", "block", "break", "case", "cast", "concept", "const", "continue", "converter", "defer", "discard", "distinct", "div", "do", "elif", "else", "end", "enum", "except", "export", "finally", "for", "from", "func", "if", "import", "in", "include", "interface", "is", "isnot", "iterator", "let", "macro", "method", "mixin", "mod", "nil", "not", "notin", "object", "of", "or", "out", "proc", "ptr", "raise", "ref", "return", "shl", "shr", "static", "template", "try", "tuple", "type", "using", "var", "when", "while", "xor", "yield"],
            constants: ["true", "false", "nil"],
            tokenizer: {
                root: [
                    [/#\[/, "comment", "@comment"],
                    [/#.*$/, "comment"],
                    [/"""/, "string", "@tripleString"],
                    [/[rR]"/, "string", "@rawString"],
                    [/"/, "string", "@string"],
                    [/'(?:[^'\\]|\\.)'/, "string"],
                    [/[A-Z]\w*/, "type.identifier"],
                    [/[a-z_]\w*/, { cases: { "@keywords": "keyword", "@constants": "constant", "@default": "identifier" } }],
                    ...NUMBER_RULES,
                    [/[=+\-*/<>@$~&%|!?^.:\\]+/, "operator"],
                    [/[()[\]{},;`]/, "delimiter"],
                ],
                comment: [[/[^#\]]+/, "comment"], [/#\[/, "comment", "@push"], [/\]#/, "comment", "@pop"], [/[#\]]/, "comment"]],
                tripleString: [[/"""/, "string", "@pop"], [/[^"]+/, "string"], [/"/, "string"]],
                rawString: [[/[^"]+/, "string"], [/""/, "string"], [/"/, "string", "@pop"]],
                string: [[/[^\\"]+/, "string"], [/\\./, "string.escape"], [/"/, "string", "@pop"]],
            },
        },
        configuration: { comments: { lineComment: "#", blockComment: ["#[", "]#"] }, brackets: BRACKETS, autoClosingPairs: PAIRS },
    },
    {
        id: "d",
        aliases: ["D", "dlang"],
        extensions: [".d"],
        tokens: cLikeTokens({
            keywords: ["abstract", "alias", "align", "asm", "assert", "auto", "body", "break", "case", "cast", "catch", "class", "const", "continue", "debug", "default", "delegate", "delete", "deprecated", "do", "else", "enum", "export", "extern", "final", "finally", "for", "foreach", "foreach_reverse", "function", "goto", "if", "immutable", "import", "in", "inout", "interface", "invariant", "is", "lazy", "mixin", "module", "new", "nothrow", "out", "override", "package", "pragma", "private", "protected", "public", "pure", "ref", "return", "scope", "shared", "static", "struct", "super", "switch", "synchronized", "template", "this", "throw", "try", "typeid", "typeof", "union", "unittest", "version", "while", "with"],
            types: ["bool", "byte", "ubyte", "short", "ushort", "int", "uint", "long", "ulong", "cent", "ucent", "char", "wchar", "dchar", "float", "double", "real", "void", "string", "size_t"],
            nestedComments: ["/+", "+/"],
        }),
        configuration: cLikeConfiguration(),
    },
    {
        id: "zig",
        aliases: ["Zig"],
        extensions: [".zig", ".zon"],
        tokens: cLikeTokens({
            keywords: ["addrspace", "align", "allowzero", "and", "anyframe", "anytype", "asm", "async", "await", "break", "callconv", "catch", "comptime", "const", "continue", "defer", "else", "enum", "errdefer", "error", "export", "extern", "fn", "for", "if", "inline", "linksection", "noalias", "noinline", "nosuspend", "opaque", "or", "orelse", "packed", "pub", "resume", "return", "struct", "suspend", "switch", "test", "threadlocal", "try", "union", "unreachable", "usingnamespace", "var", "volatile", "while"],
            types: ["i8", "u8", "i16", "u16", "i32", "u32", "i64", "u64", "i128", "u128", "isize", "usize", "f16", "f32", "f64", "f80", "f128", "bool", "void", "noreturn", "type", "anyerror", "comptime_int", "comptime_float", "c_int", "c_uint", "c_long", "c_ulong", "c_char"],
            constants: ["true", "false", "null", "undefined"],
            blockComments: false,
            extraRoot: [[/\\\\.*$/, "string"], [/@[a-zA-Z_]\w*/, "predefined"]],
        }),
        configuration: cLikeConfiguration("//", null),
    },
    {
        id: "groovy",
        aliases: ["Groovy"],
        extensions: [".groovy", ".gvy", ".gradle"],
        tokens: cLikeTokens({
            keywords: ["as", "assert", "break", "case", "catch", "class", "const", "continue", "def", "default", "do", "else", "enum", "extends", "final", "finally", "for", "goto", "if", "implements", "import", "in", "instanceof", "interface", "native", "new", "package", "private", "protected", "public", "return", "static", "strictfp", "super", "switch", "synchronized", "this", "throw", "throws", "trait", "transient", "try", "var", "volatile", "while", "println", "print"],
            types: ["boolean", "byte", "char", "double", "float", "int", "long", "short", "void", "String", "Object", "Integer", "List", "Map"],
        }),
        configuration: cLikeConfiguration(),
    },
    {
        id: "pony",
        aliases: ["Pony"],
        extensions: [".pony"],
        tokens: cLikeTokens({
            keywords: ["actor", "as", "be", "box", "break", "class", "compile_error", "compile_intrinsic", "consume", "continue", "do", "else", "elseif", "embed", "end", "error", "for", "fun", "if", "ifdef", "iftype", "in", "interface", "is", "isnt", "iso", "lambda", "let", "match", "new", "not", "object", "or", "primitive", "recover", "ref", "repeat", "return", "struct", "tag", "then", "this", "trait", "trn", "try", "type", "until", "use", "val", "var", "where", "while", "with", "xor"],
            constants: ["true", "false", "None"],
        }),
        configuration: cLikeConfiguration(),
    },
    {
        id: "ocaml",
        aliases: ["OCaml", "ml"],
        extensions: [".ml", ".mli"],
        tokens: {
            defaultToken: "",
            keywords: ["and", "as", "assert", "asr", "begin", "class", "constraint", "do", "done", "downto", "else", "end", "exception", "external", "for", "fun", "function", "functor", "if", "in", "include", "inherit", "initializer", "land", "lazy", "let", "lor", "lsl", "lsr", "lxor", "match", "method", "mod", "module", "mutable", "new", "nonrec", "object", "of", "open", "or", "private", "rec", "sig", "struct", "then", "to", "try", "type", "val", "virtual", "when", "while", "with"],
            constants: ["true", "false"],
            tokenizer: {
                root: [
                    [/\(\*/, "comment", "@comment"],
                    [/"/, "string", "@string"],
                    [/'(?:[^'\\]|\\.)'/, "string"],
                    [/[A-Z][\w']*/, "type.identifier"],
                    [/[a-z_][\w']*/, { cases: { "@keywords": "keyword", "@constants": "constant", "@default": "identifier" } }],
                    ...NUMBER_RULES,
                    [/[=<>@^|&+\-*/$%!?~.:#]+/, "operator"],
                    [/[()[\]{},;]/, "delimiter"],
                ],
                comment: [[/[^(*]+/, "comment"], [/\(\*/, "comment", "@push"], [/\*\)/, "comment", "@pop"], [/[(*]/, "comment"]],
                string: [[/[^\\"]+/, "string"], [/\\./, "string.escape"], [/"/, "string", "@pop"]],
            },
        },
        configuration: { comments: { blockComment: ["(*", "*)"] }, brackets: BRACKETS, autoClosingPairs: PAIRS },
    },
    {
        id: "commonlisp",
        aliases: ["Common Lisp", "lisp"],
        extensions: [".lisp", ".lsp", ".cl"],
        tokens: {
            defaultToken: "",
            ignoreCase: true,
            keywords: ["defun", "defmacro", "defvar", "defparameter", "defconstant", "defstruct", "defclass", "defmethod", "defgeneric", "defpackage", "lambda", "let", "let*", "flet", "labels", "macrolet", "if", "when", "unless", "cond", "case", "typecase", "ecase", "etypecase", "and", "or", "not", "progn", "prog1", "prog2", "block", "return", "return-from", "loop", "do", "do*", "dolist", "dotimes", "setf", "setq", "incf", "decf", "push", "pop", "quote", "function", "declare", "handler-case", "handler-bind", "unwind-protect", "ignore-errors", "multiple-value-bind", "destructuring-bind", "in-package", "eval-when", "the", "values", "format", "funcall", "apply"],
            constants: ["t", "nil"],
            tokenizer: {
                root: [
                    [/;.*$/, "comment"],
                    [/#\|/, "comment", "@comment"],
                    [/"/, "string", "@string"],
                    [/#\\(?:[a-zA-Z]+|.)/, "string"],
                    [/:[\w*+!\-?<>=/]+/, "type"],
                    [/[+-]?\d+(?:\.\d+)?(?:[eEdD][+-]?\d+)?/, "number"],
                    [/[a-zA-Z*+!\-_?<>=/&%^~$.][\w*+!\-?<>=/&%^~$.:]*/, { cases: { "@keywords": "keyword", "@constants": "constant", "@default": "identifier" } }],
                    [/['`,@#]/, "operator"],
                    [/[()]/, "@brackets"],
                ],
                comment: [[/[^|#]+/, "comment"], [/#\|/, "comment", "@push"], [/\|#/, "comment", "@pop"], [/[|#]/, "comment"]],
                string: [[/[^\\"]+/, "string"], [/\\./, "string.escape"], [/"/, "string", "@pop"]],
            },
        },
        configuration: { comments: { lineComment: ";", blockComment: ["#|", "|#"] }, brackets: [["(", ")"]], autoClosingPairs: [{ open: "(", close: ")" }, { open: "\"", close: "\"", notIn: ["string"] }] },
    },
    {
        id: "vimscript",
        aliases: ["Vim script", "vim", "viml"],
        extensions: [".vim"],
        tokens: {
            defaultToken: "",
            keywords: ["function", "endfunction", "func", "endfunc", "let", "unlet", "const", "if", "else", "elseif", "endif", "while", "endwhile", "for", "endfor", "in", "break", "continue", "return", "try", "catch", "finally", "endtry", "throw", "call", "execute", "exe", "echo", "echom", "echomsg", "echoerr", "set", "setlocal", "autocmd", "augroup", "command", "normal", "silent", "abort", "range", "dict", "closure", "noremap", "nnoremap", "inoremap", "vnoremap", "map", "nmap", "imap", "vmap", "source", "finish", "def", "enddef", "var"],
            tokenizer: {
                root: [
                    [/^\s*".*$/, "comment"],
                    [/^\s*#.*$/, "comment"],
                    [/"(?:[^"\\]|\\.)*"/, "string"],
                    [/'(?:[^']|'')*'/, "string"],
                    [/[gslabwtv]:\w+/, "variable"],
                    [/&\w+/, "variable.predefined"],
                    [/\$\w+/, "variable.predefined"],
                    [/\d+(?:\.\d+)?/, "number"],
                    [/[a-zA-Z_][\w#]*!?/, { cases: { "@keywords": "keyword", "@default": "identifier" } }],
                    [/[=!<>~+\-*/%.?:|&]+/, "operator"],
                    [/[()[\]{},]/, "delimiter"],
                ],
            },
        },
        configuration: { comments: { lineComment: "\"" }, brackets: BRACKETS, autoClosingPairs: [{ open: "(", close: ")" }, { open: "[", close: "]" }, { open: "{", close: "}" }, { open: "'", close: "'", notIn: ["string"] }] },
    },
    // ------------------------------------------------------------ browser runtimes
    {
        id: "prolog",
        aliases: ["Prolog", "pro"],
        extensions: [".pro", ".prolog"],
        tokens: {
            defaultToken: "",
            keywords: ["is", "mod", "rem", "div", "xor", "rdiv"],
            builtins: [
                "write", "writeln", "print", "nl", "tab", "format", "read", "read_term", "get_char", "put_char", "halt", "atom", "number", "integer",
                "float", "var", "nonvar", "compound", "atomic", "callable", "is_list", "functor", "arg", "copy_term", "findall", "bagof", "setof",
                "forall", "between", "succ", "plus", "length", "append", "member", "memberchk", "reverse", "nth0", "nth1", "msort", "sort", "last",
                "sum_list", "max_list", "min_list", "numlist", "maplist", "foldl", "include", "exclude", "assert", "asserta", "assertz", "retract",
                "retractall", "abolish", "atom_codes", "atom_chars", "char_code", "atom_length", "atom_concat", "sub_atom", "number_codes",
                "atom_number", "atomic_list_concat", "upcase_atom", "downcase_atom", "catch", "throw", "call", "once", "ignore", "not", "true",
                "fail", "false", "repeat", "phrase", "initialization", "dynamic", "discontiguous", "use_module", "op", "string_concat", "term_to_atom",
            ],
            tokenizer: {
                root: [
                    [/%.*$/, "comment"],
                    [/\/\*/, "comment", "@comment"],
                    [/0'(?:\\.|.)/, "string"],
                    [/"/, "string", "@dstring"],
                    [/'/, "string", "@qatom"],
                    [/`/, "string", "@bstring"],
                    [/[A-Z_][A-Za-z0-9_]*/, "variable"],
                    [/[a-z][A-Za-z0-9_]*(?=\()/, { cases: { "@builtins": "predefined", "@default": "function" } }],
                    [/[a-z][A-Za-z0-9_]*/, { cases: { "@keywords": "keyword", "@builtins": "predefined", "@default": "identifier" } }],
                    [/\d+\.\d+(?:[eE][-+]?\d+)?/, "number.float"],
                    [/0x[0-9a-fA-F]+|0o[0-7]+|0b[01]+|\d+/, "number"],
                    [/:-|-->|\?-/, "keyword"],
                    [/!/, "keyword"],
                    [/[+\-*/\\^<>=~:.?@#&$]+/, "operator"],
                    [/[()[\]{}|,;]/, "delimiter"],
                    [/\s+/, ""],
                ],
                comment: [[/[^*/]+/, "comment"], [/\*\//, "comment", "@pop"], [/[*/]/, "comment"]],
                dstring: [[/[^"\\]+/, "string"], [/\\./, "string.escape"], [/""/, "string"], [/"/, "string", "@pop"]],
                qatom: [[/[^'\\]+/, "string"], [/\\./, "string.escape"], [/''/, "string"], [/'/, "string", "@pop"]],
                bstring: [[/[^`\\]+/, "string"], [/\\./, "string.escape"], [/`/, "string", "@pop"]],
            },
        },
        configuration: {
            comments: { lineComment: "%", blockComment: ["/*", "*/"] },
            brackets: BRACKETS,
            autoClosingPairs: [...PAIRS, { open: "'", close: "'", notIn: ["string", "comment"] }],
        },
    },
    {
        id: "forth",
        aliases: ["Forth", "gforth"],
        extensions: [".fth", ".4th", ".forth", ".frt"],
        tokens: {
            defaultToken: "identifier",
            ignoreCase: true,
            keywords: [
                ":", ";", "if", "else", "then", "begin", "until", "again", "while", "repeat", "do", "?do", "loop", "+loop", "leave", "unloop", "exit",
                "recurse", "case", "of", "endof", "endcase", "immediate", "does>", "postpone", "literal", "[", "]", "'", "[']", "[char]", "char",
                "variable", "2variable", "constant", "value", "to", "create", "allot", ",", "c,", "defer", "is", ":noname", "buffer:",
            ],
            builtins: [
                "dup", "drop", "swap", "over", "rot", "-rot", "nip", "tuck", "pick", "roll", "2dup", "2drop", "2swap", "2over", "?dup", "depth", ">r",
                "r>", "r@", "i", "j", "k", "@", "!", "+!", "c@", "c!", "cells", "cell+", "chars", "char+", "here", "emit", "cr", "space", "spaces",
                "type", ".", ".s", "u.", ".r", "u.r", "key", "accept", "evaluate", "base", "decimal", "hex", "binary", "and", "or", "xor", "invert",
                "lshift", "rshift", "negate", "abs", "min", "max", "mod", "/mod", "*/", "*/mod", "+", "-", "*", "/", "1+", "1-", "2*", "2/", "=",
                "<>", "<", ">", "<=", ">=", "0=", "0<>", "0<", "0>", "u<", "within", "true", "false", "bye", "words", "count", "fill", "move",
                "erase", "pad", "random", "execute", "abort", "bl",
            ],
            tokenizer: {
                root: [
                    [/\\(?:\s.*)?$/, "comment"],
                    [/\((?=\s)/, "comment", "@paren"],
                    [/(?:\.|s|c|abort)"(?=\s)/, { token: "keyword", next: "@dstring" }],
                    [/\.\((?=\s)/, { token: "keyword", next: "@pstring" }],
                    [/(:)(\s+)(\S+)/, ["keyword", "", "function"]],
                    [/'.'(?=\s|$)/, "string"],
                    [/-?(?:\$[0-9a-f]+|%[01]+|#?\d+)(?=\s|$)/, "number"],
                    [/\S+/, { cases: { "@keywords": "keyword", "@builtins": "predefined", "@default": "identifier" } }],
                    [/\s+/, ""],
                ],
                paren: [[/[^)]+/, "comment"], [/\)/, "comment", "@pop"]],
                dstring: [[/[^"]+/, "string"], [/"/, "keyword", "@pop"]],
                pstring: [[/[^)]+/, "string"], [/\)/, "keyword", "@pop"]],
            },
        },
        configuration: { comments: { lineComment: "\\", blockComment: ["( ", ")"] }, brackets: [["(", ")"]], autoClosingPairs: [{ open: "\"", close: "\"", notIn: ["string"] }] },
    },
    {
        id: "basic",
        aliases: ["BASIC", "QBasic", "bas"],
        extensions: [".bas", ".basic", ".qb"],
        tokens: {
            defaultToken: "",
            ignoreCase: true,
            keywords: [
                "print", "lprint", "input", "let", "if", "then", "else", "elseif", "end", "endif", "for", "to", "step", "next", "while", "wend", "do",
                "loop", "until", "exit", "goto", "gosub", "return", "on", "dim", "redim", "as", "shared", "const", "data", "read", "restore", "swap",
                "randomize", "sub", "function", "call", "declare", "def", "select", "case", "is", "stop", "system", "write", "cls", "color", "locate",
                "screen", "line", "option", "base", "erase", "defint", "defstr", "deflng", "defsng", "defdbl", "common", "static", "integer", "long",
                "single", "double", "string", "beep", "sleep", "width", "using", "preserve", "byval",
            ],
            operators: ["and", "or", "not", "xor", "mod", "eqv", "imp"],
            builtins: [
                "abs", "asc", "atn", "cdbl", "chr$", "cint", "clng", "cos", "csng", "exp", "fix", "hex$", "instr", "int", "lcase$", "left$", "len",
                "log", "ltrim$", "mid$", "oct$", "right$", "rnd", "rtrim$", "sgn", "sin", "space$", "sqr", "str$", "string$", "tan", "timer", "trim$",
                "ucase$", "val", "tab", "spc", "date$", "time$", "inkey$",
            ],
            tokenizer: {
                root: [
                    [/^\s*\d+/, "number.linenumber"],
                    [/rem\b.*$/, "comment"],
                    [/'.*$/, "comment"],
                    [/"[^"]*"?/, "string"],
                    [/&[hH][0-9a-fA-F]+|&[oO][0-7]+|&[bB][01]+/, "number.hex"],
                    [/(?:\d+\.?\d*|\.\d+)(?:[eEdD][-+]?\d+)?[#!%&]?/, "number"],
                    [/[A-Za-z_][\w.]*[$%!#&]?/, { cases: { "@keywords": "keyword", "@operators": "keyword", "@builtins": "predefined", "@default": "identifier" } }],
                    [/<>|<=|>=|[<>=+\-*/\\^]/, "operator"],
                    [/[(),;:?]/, "delimiter"],
                    [/\s+/, ""],
                ],
            },
        },
        configuration: { comments: { lineComment: "'" }, brackets: [["(", ")"]], autoClosingPairs: [{ open: "(", close: ")" }, { open: "\"", close: "\"", notIn: ["string"] }] },
    },
    {
        id: "befunge",
        aliases: ["Befunge-93", "befunge"],
        extensions: [".b93", ".befunge", ".bf93"],
        tokens: {
            defaultToken: "comment",
            tokenizer: {
                root: [
                    [/"[^"]*"?/, "string"],
                    [/[0-9]/, "number"],
                    [/[><^v?_|#@]/, "keyword"],
                    [/[+\-*/%!`]/, "operator"],
                    [/[:\\$]/, "type"],
                    [/[.,&~]/, "predefined"],
                    [/[gp]/, "variable"],
                    [/\s+/, ""],
                    [/[^\s"]/, "comment"],
                ],
            },
        },
        configuration: { autoClosingPairs: [{ open: "\"", close: "\"" }] },
    },
    {
        id: "whitespace",
        aliases: ["Whitespace", "ws"],
        extensions: [".ws"],
        tokens: {
            defaultToken: "comment",
            tokenizer: { root: [[/[ \t]+/, ""], [/[^ \t]+/, "comment"]] },
        },
        configuration: {},
    },
    {
        id: "mermaid",
        aliases: ["Mermaid", "mmd"],
        extensions: [".mmd", ".mermaid"],
        tokens: {
            defaultToken: "",
            keywords: [
                "graph", "flowchart", "sequenceDiagram", "classDiagram", "stateDiagram", "stateDiagram-v2", "erDiagram", "journey", "gantt", "pie",
                "quadrantChart", "requirementDiagram", "gitGraph", "mindmap", "timeline", "sankey-beta", "xychart-beta", "block-beta", "packet-beta",
                "architecture-beta", "kanban", "C4Context", "subgraph", "end", "participant", "actor", "note", "Note", "loop", "alt", "else", "opt",
                "par", "and", "rect", "critical", "break", "activate", "deactivate", "title", "section", "dateFormat", "axisFormat", "class", "state",
                "direction", "click", "style", "classDef", "linkStyle", "as", "over", "of", "left", "right", "autonumber", "commit", "branch",
                "checkout", "merge", "TB", "TD", "BT", "RL", "LR", "showData", "accTitle", "accDescr", "excludes", "todayMarker",
            ],
            tokenizer: {
                root: [
                    [/%%.*$/, "comment"],
                    [/"[^"]*"/, "string"],
                    [/\|[^|]*\|/, "string"],
                    [/[A-Za-z][\w-]*/, { cases: { "@keywords": "keyword", "@default": "identifier" } }],
                    [/<-->|<--|-->>|->>|-->|---|-\.->|-\.-|==>|===|--[ox]|-[x)]|\.\.>|<\|--|\*--|o--|--|==|->|\.\./, "operator"],
                    [/[[\](){}]/, "@brackets"],
                    [/\d+(?:\.\d+)?/, "number"],
                    [/[:;,&<>]/, "delimiter"],
                    [/\s+/, ""],
                    [/./, ""],
                ],
            },
        },
        configuration: { comments: { lineComment: "%%" }, brackets: BRACKETS, autoClosingPairs: PAIRS },
    },
    {
        id: "latex",
        aliases: ["LaTeX", "TeX", "tex"],
        extensions: [".tex", ".latex", ".ltx"],
        tokens: {
            defaultToken: "",
            tokenizer: {
                root: [
                    [/%.*$/, "comment"],
                    [/(\\(?:begin|end))(\s*)(\{)([^}]*)(\})/, ["keyword", "", "delimiter.curly", "type", "delimiter.curly"]],
                    [/\\(?:part|chapter|section|subsection|subsubsection|paragraph|subparagraph)\*?/, "keyword.flow"],
                    [/\$\$/, "string", "@displayMath"],
                    [/\$/, "string", "@inlineMath"],
                    [/\\\[/, "string", "@bracketMath"],
                    [/\\\(/, "string", "@parenMath"],
                    [/\\[A-Za-z@]+\*?/, "keyword"],
                    [/\\./, "string.escape"],
                    [/[{}]/, "delimiter.curly"],
                    [/[[\]]/, "delimiter.square"],
                    [/[&~^_]/, "operator"],
                    [/[^\\%$&~^_{}[\]]+/, ""],
                ],
                inlineMath: [[/[^$\\]+/, "string"], [/\\[A-Za-z]+/, "predefined"], [/\\./, "string"], [/\$/, "string", "@pop"]],
                displayMath: [[/[^$\\]+/, "string"], [/\\[A-Za-z]+/, "predefined"], [/\\./, "string"], [/\$\$/, "string", "@pop"], [/\$/, "string"]],
                bracketMath: [[/[^\\]+/, "string"], [/\\\]/, "string", "@pop"], [/\\[A-Za-z]+/, "predefined"], [/\\./, "string"]],
                parenMath: [[/[^\\]+/, "string"], [/\\\)/, "string", "@pop"], [/\\[A-Za-z]+/, "predefined"], [/\\./, "string"]],
            },
        },
        configuration: {
            comments: { lineComment: "%" },
            brackets: BRACKETS,
            autoClosingPairs: [{ open: "{", close: "}" }, { open: "[", close: "]" }, { open: "(", close: ")" }, { open: "$", close: "$", notIn: ["string", "comment"] }],
        },
    },
    // ------------------------------------------------------------ batch 26: data, WebAssembly, diagrams, music, shaders, Logo
    {
        id: "jq",
        aliases: ["jq"],
        extensions: [".jq"],
        tokens: {
            defaultToken: "",
            keywords: ["def", "if", "then", "elif", "else", "end", "as", "reduce", "foreach", "try", "catch", "label", "import", "include", "and", "or", "not", "__loc__"],
            constants: ["true", "false", "null"],
            builtins: [
                "length", "utf8bytelength", "keys", "keys_unsorted", "has", "in", "map", "map_values", "path", "del", "getpath", "setpath", "delpaths",
                "to_entries", "from_entries", "with_entries", "select", "empty", "error", "halt", "halt_error", "paths", "leaf_paths", "add", "any",
                "all", "flatten", "range", "floor", "ceil", "round", "sqrt", "pow", "log", "exp", "abs", "tostring", "tonumber", "type", "infinite",
                "nan", "isinfinite", "isnan", "isnormal", "sort", "sort_by", "group_by", "min", "max", "min_by", "max_by", "unique", "unique_by",
                "reverse", "contains", "inside", "indices", "index", "rindex", "startswith", "endswith", "combinations", "ltrimstr", "rtrimstr",
                "trim", "ltrim", "rtrim", "explode", "implode", "split", "splits", "join", "ascii_downcase", "ascii_upcase", "while", "until",
                "repeat", "recurse", "env", "transpose", "first", "last", "nth", "limit", "input", "inputs", "debug", "stderr", "input_filename",
                "sub", "gsub", "test", "match", "capture", "scan", "tojson", "fromjson", "todate", "fromdate", "now", "mktime", "gmtime",
                "localtime", "strftime", "strptime", "tostream", "fromstream", "truncate_stream", "walk", "objects", "iterables", "booleans",
                "numbers", "strings", "nulls", "arrays", "scalars", "values", "builtins", "getpath", "splits", "toarray", "pick", "ascii", "@text",
            ],
            tokenizer: {
                root: [
                    [/#.*$/, "comment"],
                    [/"/, "string", "@string"],
                    [/@[A-Za-z0-9_]+/, "predefined"],
                    [/\$__loc__|\$[A-Za-z_]\w*/, "variable"],
                    [/\.[A-Za-z_]\w*/, "key"],
                    [/[A-Za-z_]\w*(?:::[A-Za-z_]\w*)*/, { cases: { "@keywords": "keyword", "@constants": "constant", "@builtins": "predefined", "@default": "identifier" } }],
                    [/\d+(?:\.\d+)?(?:[eE][-+]?\d+)?/, "number"],
                    [/\?\/\/|\/\/=?|\.\.|[|=!<>]=?|[+\-*/%]=?|\?/, "operator"],
                    [/[{}()[\]]/, "@brackets"],
                    [/[;:,.]/, "delimiter"],
                    [/\s+/, ""],
                ],
                string: [[/[^\\"]+/, "string"], [/\\\([^)]*\)/, "string.escape"], [/\\./, "string.escape"], [/"/, "string", "@pop"]],
            },
        },
        configuration: { comments: { lineComment: "#" }, brackets: BRACKETS, autoClosingPairs: PAIRS },
    },
    {
        id: "wat",
        aliases: ["WebAssembly (WAT)", "wat", "wast"],
        extensions: [".wat", ".wast"],
        tokens: {
            defaultToken: "",
            keywords: [
                "module", "func", "param", "result", "local", "global", "memory", "data", "table", "elem", "type", "import", "export", "start", "mut",
                "offset", "declare", "item", "rec", "sub", "final", "struct", "array", "field", "then", "else", "end", "block", "loop", "if", "tag",
                "shared", "pagesize",
            ],
            types: ["i32", "i64", "f32", "f64", "v128", "funcref", "externref", "anyref", "eqref", "i31ref", "structref", "arrayref", "nullref", "exnref"],
            instructions: ["unreachable", "nop", "br", "br_if", "br_table", "return", "call", "call_indirect", "return_call", "return_call_indirect", "drop", "select", "throw", "rethrow", "try_table", "delegate"],
            tokenizer: {
                root: [
                    [/;;.*$/, "comment"],
                    [/\(;/, "comment", "@comment"],
                    [/"/, "string", "@string"],
                    [/\$[\w!#$%&'*+\-./:<=>?@\\^`|~]+/, "variable"],
                    [/(?:offset|align)=/, "attribute.name"],
                    [/(?:i32|i64|f32|f64|v128|i8x16|i16x8|i32x4|i64x2|f32x4|f64x2|local|global|memory|table|ref|elem|data|atomic|struct|array|any|extern|i31)\.[a-z0-9_.]+/, "keyword.flow"],
                    [/[-+]?(?:0x[0-9a-fA-F_]+(?:\.[0-9a-fA-F_]*)?(?:[pP][-+]?\d+)?|\d[\d_]*(?:\.[\d_]*)?(?:[eE][-+]?\d+)?|inf\b|nan(?::0x[0-9a-fA-F]+)?)/, "number"],
                    [/[a-z][a-z0-9_.]*/, { cases: { "@types": "type", "@keywords": "keyword", "@instructions": "keyword.flow", "@default": "identifier" } }],
                    [/[()]/, "@brackets"],
                    [/\s+/, ""],
                ],
                comment: [[/[^(;]+/, "comment"], [/\(;/, "comment", "@push"], [/;\)/, "comment", "@pop"], [/[(;]/, "comment"]],
                string: [[/[^\\"]+/, "string"], [/\\(?:[0-9a-fA-F]{2}|u\{[0-9a-fA-F]+\}|.)/, "string.escape"], [/"/, "string", "@pop"]],
            },
        },
        configuration: { comments: { lineComment: ";;", blockComment: ["(;", ";)"] }, brackets: [["(", ")"]], autoClosingPairs: [{ open: "(", close: ")" }, { open: "\"", close: "\"", notIn: ["string"] }] },
    },
    {
        id: "dot",
        aliases: ["Graphviz DOT", "dot", "graphviz"],
        extensions: [".dot", ".gv"],
        tokens: {
            defaultToken: "",
            ignoreCase: true,
            keywords: ["strict", "graph", "digraph", "node", "edge", "subgraph"],
            attributes: [
                "label", "shape", "style", "color", "fillcolor", "fontcolor", "fontname", "fontsize", "rankdir", "rank", "ranksep", "nodesep", "splines",
                "layout", "bgcolor", "penwidth", "arrowhead", "arrowtail", "arrowsize", "dir", "width", "height", "fixedsize", "margin", "pad", "compound",
                "lhead", "ltail", "constraint", "weight", "xlabel", "headlabel", "taillabel", "tooltip", "href", "url", "target", "group", "peripheries",
                "orientation", "sides", "skew", "distortion", "image", "labelloc", "labeljust", "concentrate", "newrank", "overlap", "sep", "size",
                "ratio", "center", "ordering", "minlen", "samehead", "sametail", "headport", "tailport", "gradientangle", "colorscheme", "charset",
            ],
            tokenizer: {
                root: [
                    [/\/\/.*$/, "comment"],
                    [/^\s*#.*$/, "comment"],
                    [/\/\*/, "comment", "@comment"],
                    [/"/, "string", "@string"],
                    [/</, "string", "@html"],
                    [/->|--/, "operator"],
                    [/[A-Za-z_\u0080-￿][\w\u0080-￿]*/, { cases: { "@keywords": "keyword", "@attributes": "attribute.name", "@default": "identifier" } }],
                    [/-?(?:\.\d+|\d+(?:\.\d*)?)/, "number"],
                    [/[{}[\]]/, "@brackets"],
                    [/[;,=:]/, "delimiter"],
                    [/\s+/, ""],
                ],
                comment: [[/[^/*]+/, "comment"], [/\*\//, "comment", "@pop"], [/[/*]/, "comment"]],
                string: [[/[^\\"]+/, "string"], [/\\./, "string.escape"], [/"/, "string", "@pop"]],
                html: [[/</, "string", "@push"], [/>/, "string", "@pop"], [/[^<>]+/, "string"]],
            },
        },
        configuration: { comments: { lineComment: "//", blockComment: ["/*", "*/"] }, brackets: [["{", "}"], ["[", "]"]], autoClosingPairs: [{ open: "{", close: "}" }, { open: "[", close: "]" }, { open: "\"", close: "\"", notIn: ["string"] }] },
    },
    {
        id: "abc",
        aliases: ["ABC notation", "abc"],
        extensions: [".abc"],
        tokens: {
            defaultToken: "",
            tokenizer: {
                root: [
                    [/^%%.*$/, "annotation"],
                    [/%.*$/, "comment"],
                    [/^([A-Za-z+]:)(.*)$/, ["keyword", "string"]],
                    [/\[[A-Za-z]:[^\]]*\]/, "keyword"],
                    [/"[^"]*"?/, "string"],
                    [/![^!\s]*!|\+[^+\s]*\+/, "annotation"],
                    [/\|\]|\|\||\[\||:\|\]?|\|:|::|\[\d+|\|\d*/, "delimiter"],
                    [/[_^=]*[A-Ga-g][,']*/, "type"],
                    [/[zZxX]/, "variable"],
                    [/\d+\/*\d*|\/+\d*/, "number"],
                    [/[<>~.-]/, "operator"],
                    [/[()[\]{}]/, "@brackets"],
                    [/\s+/, ""],
                    [/./, ""],
                ],
            },
        },
        configuration: { comments: { lineComment: "%" }, brackets: [["[", "]"], ["(", ")"], ["{", "}"]], autoClosingPairs: [{ open: "\"", close: "\"", notIn: ["string"] }, { open: "[", close: "]" }] },
    },
    {
        id: "asciidoc",
        aliases: ["AsciiDoc", "adoc"],
        extensions: [".adoc", ".asciidoc"],
        tokens: {
            defaultToken: "",
            tokenizer: {
                root: [
                    [/^\/{4,}\s*$/, "comment", "@commentBlock"],
                    [/^\/\/.*$/, "comment"],
                    [/^={1,6}\s.*$/, "keyword"],
                    [/^(:!?[\w-]+!?:)(.*)$/, ["attribute.name", "string"]],
                    [/^\[[^\]]*\]\s*$/, "annotation"],
                    [/^\.[^\s.].*$/, "type"],
                    [/^(?:-{4,}|\.{4,})\s*$/, "string", "@listing"],
                    [/^\+{4,}\s*$/, "string", "@passthrough"],
                    [/^(?:NOTE|TIP|IMPORTANT|WARNING|CAUTION):/, "keyword"],
                    [/^\s*(?:\*+|-|\.+|\d+\.)(?=\s)/, "keyword"],
                    [/^\|===\s*$/, "delimiter"],
                    [/(?:link|image|include|xref|footnote|kbd|btn|menu|pass|stem|latexmath|asciimath|icon|video|audio|mailto):{1,2}[^\s[]*\[[^\]]*\]/, "tag"],
                    [/https?:\/\/[^\s[\]]+(?:\[[^\]]*\])?/, "tag"],
                    [/<<[^>]*>>/, "tag"],
                    [/`[^`]+`/, "string"],
                    [/\*[^*\s](?:[^*]*[^*\s])?\*/, "strong"],
                    [/_[^_\s](?:[^_]*[^_\s])?_/, "emphasis"],
                    [/\{[\w-]+\}/, "variable"],
                    [/\|/, "delimiter"],
                    [/[^\s`*_{|<]+|\s+|./, ""],
                ],
                listing: [[/^(?:-{4,}|\.{4,})\s*$/, "string", "@pop"], [/.+$/, "string"]],
                passthrough: [[/^\+{4,}\s*$/, "string", "@pop"], [/.+$/, "string"]],
                commentBlock: [[/^\/{4,}\s*$/, "comment", "@pop"], [/.+$/, "comment"]],
            },
        },
        configuration: { comments: { lineComment: "//" }, brackets: [["[", "]"], ["{", "}"]], autoClosingPairs: [{ open: "[", close: "]" }, { open: "{", close: "}" }, { open: "`", close: "`", notIn: ["string"] }] },
    },
    {
        id: "glsl",
        aliases: ["GLSL", "glsl", "frag"],
        extensions: [".glsl", ".frag", ".fsh"],
        tokens: cLikeTokens({
            keywords: [
                "attribute", "const", "uniform", "varying", "buffer", "shared", "coherent", "volatile", "restrict", "readonly", "writeonly", "layout",
                "centroid", "flat", "smooth", "noperspective", "patch", "sample", "break", "continue", "do", "for", "while", "switch", "case", "default",
                "if", "else", "subroutine", "in", "out", "inout", "invariant", "precise", "discard", "return", "struct", "precision", "highp", "mediump", "lowp",
            ],
            types: [
                "void", "bool", "int", "uint", "float", "double", "vec2", "vec3", "vec4", "dvec2", "dvec3", "dvec4", "bvec2", "bvec3", "bvec4", "ivec2",
                "ivec3", "ivec4", "uvec2", "uvec3", "uvec4", "mat2", "mat3", "mat4", "mat2x2", "mat2x3", "mat2x4", "mat3x2", "mat3x3", "mat3x4",
                "mat4x2", "mat4x3", "mat4x4", "sampler2D", "sampler3D", "samplerCube", "sampler2DArray", "sampler2DShadow", "isampler2D", "usampler2D",
            ],
            constants: ["true", "false"],
            extraRoot: [
                [/^\s*#\s*[a-z]+/, "annotation"],
                [/\bgl_\w+/, "variable.predefined"],
                [/\bi(?:Resolution|Time|TimeDelta|Frame|Mouse|Date|Channel\d)\b|\bu_(?:resolution|time|mouse)\b/, "variable.predefined"],
            ],
        }),
        configuration: cLikeConfiguration(),
    },
    {
        id: "logo",
        aliases: ["Logo", "ucblogo"],
        extensions: [".logo", ".lgo"],
        tokens: {
            defaultToken: "",
            ignoreCase: true,
            keywords: ["to", "end", "repeat", "repcount", "if", "ifelse", "while", "for", "stop", "output", "op", "make", "name", "local", "thing", "run", "bye", "wait", "true", "false"],
            builtins: [
                "forward", "fd", "back", "bk", "left", "lt", "right", "rt", "penup", "pu", "pendown", "pd", "home", "clearscreen", "cs", "clean", "setpos",
                "setposition", "setxy", "setx", "sety", "setheading", "seth", "setpencolor", "setpc", "setcolor", "setpensize", "setwidth", "setpw",
                "setbackground", "setbg", "setscreencolor", "setsc", "hideturtle", "ht", "showturtle", "st", "arc", "circle", "label", "pos", "xcor",
                "ycor", "heading", "towards", "pendownp", "print", "pr", "show", "type", "random", "pick", "sum", "difference", "product", "quotient",
                "remainder", "modulo", "power", "minus", "sqrt", "abs", "int", "round", "sin", "cos", "tan", "arctan", "exp", "ln", "pi", "word", "list",
                "sentence", "se", "fput", "lput", "first", "last", "butfirst", "bf", "butlast", "bl", "item", "count", "emptyp", "memberp", "numberp",
                "wordp", "listp", "equalp", "notequalp", "lessp", "greaterp", "not", "and", "or",
            ],
            tokenizer: {
                root: [
                    [/;.*$/, "comment"],
                    [/(to)(\s+)([^\s:;[\]()]+)/, ["keyword", "", "function"]],
                    [/"[^\s[\]()]*/, "string"],
                    [/:[^\s[\]()+\-*/=<>;]+/, "variable"],
                    [/\d+(?:\.\d+)?(?:[eE][-+]?\d+)?/, "number"],
                    [/[A-Za-z_À-￿][\w.?!À-￿-]*/, { cases: { "@keywords": "keyword", "@builtins": "predefined", "@default": "identifier" } }],
                    [/[[\]()]/, "@brackets"],
                    [/<=|>=|<>|[+\-*/=<>]/, "operator"],
                    [/\s+/, ""],
                    [/./, ""],
                ],
            },
        },
        configuration: { comments: { lineComment: ";" }, brackets: [["[", "]"], ["(", ")"]], autoClosingPairs: [{ open: "[", close: "]" }, { open: "(", close: ")" }] },
    },
    // ------------------------------------------------------------ data and configuration
    {
        id: "toml",
        aliases: ["TOML"],
        extensions: [".toml"],
        tokens: {
            defaultToken: "",
            tokenizer: {
                root: [
                    [/#.*$/, "comment"],
                    [/^\s*\[\[?[^\]#]*\]\]?/, "type"],
                    [/([A-Za-z0-9_\-.]+|"[^"]*"|'[^']*')(\s*)(=)/, ["key", "", "delimiter"]],
                    [/"""/, "string", "@multiString"],
                    [/'''/, "string", "@multiLiteral"],
                    [/"/, "string", "@string"],
                    [/'[^']*'/, "string"],
                    [/\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})?)?/, "number"],
                    [/[+-]?(?:inf|nan)\b/, "number"],
                    [/[+-]?(?:0x[0-9a-fA-F_]+|0o[0-7_]+|0b[01_]+|\d[\d_]*(?:\.\d[\d_]*)?(?:[eE][+-]?\d+)?)/, "number"],
                    [/\b(?:true|false)\b/, "constant"],
                    [/[[\]{},=.]/, "delimiter"],
                    [/\s+/, ""],
                    [/[^\s#"'[\]{},=]+/, ""],
                ],
                string: [[/[^"\\]+/, "string"], [/\\./, "string.escape"], [/"/, "string", "@pop"]],
                multiString: [[/"""/, "string", "@pop"], [/[^"\\]+/, "string"], [/\\./, "string.escape"], [/"/, "string"]],
                multiLiteral: [[/'''/, "string", "@pop"], [/[^']+/, "string"], [/'/, "string"]],
            },
        },
        configuration: { comments: { lineComment: "#" }, brackets: [["{", "}"], ["[", "]"]], autoClosingPairs: PAIRS },
    },
    {
        id: "dotenv",
        aliases: ["Dotenv", ".env"],
        extensions: [".env"],
        tokens: {
            defaultToken: "",
            tokenizer: {
                root: [
                    [/^\s*#.*$/, "comment"],
                    [/(export)(\s+)/, ["keyword", ""]],
                    [/([A-Za-z_][A-Za-z0-9_.-]*)(\s*)(=)/, ["key", "", "delimiter"]],
                    [/"/, "string", "@doubleQuoted"],
                    [/'[^']*'?/, "string"],
                    [/\$\{[^}]*\}|\$[A-Za-z_]\w*/, "variable"],
                    [/\s+#.*$/, "comment"],
                    [/[^\s#$"']+/, "string"],
                    [/\s+/, ""],
                    [/./, "string"],
                ],
                doubleQuoted: [[/[^"\\$]+/, "string"], [/\$\{[^}]*\}/, "variable"], [/\\./, "string.escape"], [/\$/, "string"], [/"/, "string", "@pop"]],
            },
        },
        configuration: { comments: { lineComment: "#" }, autoClosingPairs: [{ open: "\"", close: "\"", notIn: ["string"] }, { open: "'", close: "'", notIn: ["string"] }] },
    },
    {
        id: "csv",
        aliases: ["CSV", "TSV"],
        extensions: [".csv", ".tsv"],
        // Columns cycle through six colours ("rainbow CSV"); every line starts again at the first one.
        tokens: {
            defaultToken: "",
            tokenizer: Object.fromEntries(CSV_COLUMN_TOKENS.map((token, index) => {
                const next = index + 1 < CSV_COLUMN_TOKENS.length ? `@column${index + 1}` : "@root";
                const rules: languages.IMonarchLanguageRule[] = [
                    [/"(?:[^"]|"")*"$/, { token, next: "@root" }],
                    [/[^,;\t|"]+$/, { token, next: "@root" }],
                    [/"(?:[^"]|"")*"/, token],
                    [/[^,;\t|"]+/, token],
                    [/[,;\t|]$/, { token: "delimiter", next: "@root" }],
                    [/[,;\t|]/, { token: "delimiter", next }],
                    [/"/, token],
                ];
                return [index === 0 ? "root" : `column${index}`, rules];
            })),
        },
        configuration: { autoClosingPairs: [{ open: "\"", close: "\"", notIn: ["string"] }] },
    },
    {
        id: "makefile",
        aliases: ["Makefile", "make"],
        extensions: [".mk", ".mak", ".make"],
        filenames: ["Makefile", "makefile", "GNUmakefile"],
        tokens: {
            defaultToken: "",
            tokenizer: {
                root: [
                    [/#.*$/, "comment"],
                    [/^\s*(?:-?include|sinclude|ifeq|ifneq|ifdef|ifndef|else|endif|define|endef|export|unexport|override|vpath)\b/, "keyword"],
                    [/^\.[A-Z_]+(?=\s*:)/, "keyword"],
                    [/^[^\s:#=]+(?=\s*::?(?!=))/, "type"],
                    [/^\s*[A-Za-z_][\w.]*(?=\s*(?::|::|\?|\+|!)?=)/, "variable"],
                    [/\$\((?:wildcard|patsubst|subst|filter|filter-out|foreach|shell|addprefix|addsuffix|notdir|dir|basename|suffix|sort|strip|findstring|if|or|and|call|eval|origin|value|info|warning|error|abspath|realpath|word|words|wordlist|firstword|lastword|join|file|flavor)\b/, "predefined"],
                    [/\$\([^)\s]*\)|\$\{[^}\s]*\}|\$[@<^?*%+|]|\$\$/, "variable"],
                    [/[:=?+!]+/, "operator"],
                    [/"[^"]*"|'[^']*'/, "string"],
                    [/[()]/, "delimiter"],
                    [/[^\s$#:=()"']+/, ""],
                    [/\s+/, ""],
                    [/./, ""],
                ],
            },
        },
        configuration: { comments: { lineComment: "#" }, brackets: [["(", ")"], ["{", "}"]], autoClosingPairs: [{ open: "(", close: ")" }, { open: "{", close: "}" }, { open: "\"", close: "\"", notIn: ["string"] }] },
    },
    {
        id: "cmake",
        aliases: ["CMake"],
        extensions: [".cmake"],
        filenames: ["CMakeLists.txt"],
        tokens: {
            defaultToken: "",
            commands: [
                "cmake_minimum_required", "project", "set", "unset", "add_executable", "add_library", "target_link_libraries", "target_include_directories",
                "target_compile_options", "target_compile_definitions", "target_compile_features", "target_sources", "find_package", "include",
                "include_directories", "link_directories", "add_subdirectory", "if", "elseif", "else", "endif", "foreach", "endforeach", "while",
                "endwhile", "function", "endfunction", "macro", "endmacro", "message", "option", "install", "configure_file", "file", "list", "string",
                "math", "return", "add_custom_command", "add_custom_target", "add_definitions", "add_compile_options", "set_target_properties",
                "set_property", "get_property", "get_filename_component", "enable_testing", "add_test", "fetchcontent_declare",
                "fetchcontent_makeavailable", "include_guard", "cmake_parse_arguments", "execute_process", "break", "continue",
            ],
            tokenizer: {
                root: [
                    [/#\[\[/, "comment", "@bracketComment"],
                    [/#.*$/, "comment"],
                    [/[A-Za-z_]\w*(?=\s*\()/, { cases: { "@commands": "keyword", "@default": "function" } }],
                    [/\$\{[^}]*\}|\$ENV\{[^}]*\}|\$<[^>]*>/, "variable"],
                    [/"/, "string", "@string"],
                    [/\[\[/, "string", "@bracketString"],
                    [/\b(?:ON|OFF|TRUE|FALSE|YES|NO|IGNORE|NOTFOUND)\b/, "constant"],
                    [/\b[A-Z_][A-Z0-9_]+\b/, "type"],
                    [/\d+(?:\.\d+)*/, "number"],
                    [/[()]/, "@brackets"],
                    [/\s+/, ""],
                    [/[^\s()#"$]+/, ""],
                    [/./, ""],
                ],
                string: [[/[^"\\$]+/, "string"], [/\$\{[^}]*\}/, "variable"], [/\\./, "string.escape"], [/\$/, "string"], [/"/, "string", "@pop"]],
                bracketString: [[/\]\]/, "string", "@pop"], [/[^\]]+/, "string"], [/\]/, "string"]],
                bracketComment: [[/\]\]/, "comment", "@pop"], [/[^\]]+/, "comment"], [/\]/, "comment"]],
            },
        },
        configuration: { comments: { lineComment: "#" }, brackets: [["(", ")"]], autoClosingPairs: [{ open: "(", close: ")" }, { open: "\"", close: "\"", notIn: ["string"] }] },
    },
    {
        id: "nginx",
        aliases: ["Nginx", "nginx.conf"],
        extensions: [".nginx"],
        filenames: ["nginx.conf"],
        tokens: {
            defaultToken: "",
            blocks: ["server", "location", "http", "events", "upstream", "map", "if", "types", "stream", "geo", "limit_except", "split_clients", "mail"],
            tokenizer: {
                root: [
                    [/#.*$/, "comment"],
                    [/^(\s*)([a-z_]\w*)/, ["", { cases: { "@blocks": "keyword", "@default": "predefined" } }]],
                    [/\$\w+|\$\{\w+\}/, "variable"],
                    [/"/, "string", "@doubleQuoted"],
                    [/'[^']*'?/, "string"],
                    [/~\*?|\^~|=/, "operator"],
                    [/\b\d+(?:\.\d+)?[kmgsdhwyKMG]?\b/, "number"],
                    [/\b(?:on|off)\b/, "constant"],
                    [/[{};]/, "delimiter"],
                    [/[^\s{};#"'$]+/, ""],
                    [/\s+/, ""],
                ],
                doubleQuoted: [[/[^"\\$]+/, "string"], [/\$\w+|\$\{\w+\}/, "variable"], [/\\./, "string.escape"], [/\$/, "string"], [/"/, "string", "@pop"]],
            },
        },
        configuration: { comments: { lineComment: "#" }, brackets: [["{", "}"]], autoClosingPairs: [{ open: "{", close: "}" }, { open: "\"", close: "\"", notIn: ["string"] }, { open: "'", close: "'", notIn: ["string"] }] },
    },
    {
        id: "prisma",
        aliases: ["Prisma"],
        extensions: [".prisma"],
        tokens: {
            defaultToken: "",
            keywords: ["model", "enum", "datasource", "generator", "type", "view"],
            types: ["String", "Int", "BigInt", "Float", "Decimal", "Boolean", "DateTime", "Json", "Bytes", "Unsupported"],
            constants: ["true", "false", "null"],
            tokenizer: {
                root: [
                    [/\/\/.*$/, "comment"],
                    [/@@?[\w.]+/, "annotation"],
                    [/[A-Za-z_]\w*/, { cases: { "@keywords": "keyword", "@types": "type", "@constants": "constant", "@default": "identifier" } }],
                    [/"/, "string", "@string"],
                    [/\d+(?:\.\d+)?/, "number"],
                    [/[?!]|\[\]/, "operator"],
                    [/[{}()[\],=:]/, "delimiter"],
                    [/\s+/, ""],
                ],
                string: [[/[^"\\]+/, "string"], [/\\./, "string.escape"], [/"/, "string", "@pop"]],
            },
        },
        configuration: cLikeConfiguration("//", null),
    },
    // ------------------------------------------------------------ systems and hardware
    {
        id: "nasm",
        aliases: ["x86 Assembly (NASM)", "nasm", "x86"],
        extensions: [".nasm"],
        tokens: {
            defaultToken: "",
            ignoreCase: true,
            registers: [
                "rax", "rbx", "rcx", "rdx", "rsi", "rdi", "rbp", "rsp", "r8", "r9", "r10", "r11", "r12", "r13", "r14", "r15", "eax", "ebx", "ecx", "edx",
                "esi", "edi", "ebp", "esp", "r8d", "r9d", "r10d", "r11d", "r12d", "r13d", "r14d", "r15d", "ax", "bx", "cx", "dx", "si", "di", "bp", "sp",
                "al", "bl", "cl", "dl", "ah", "bh", "ch", "dh", "sil", "dil", "bpl", "spl", "r8b", "r9b", "r10b", "r11b", "r12b", "r13b", "r14b", "r15b",
                "cs", "ds", "ss", "es", "fs", "gs", "rip", "eip", "ip", "cr0", "cr2", "cr3", "cr4",
                "xmm0", "xmm1", "xmm2", "xmm3", "xmm4", "xmm5", "xmm6", "xmm7", "xmm8", "xmm9", "xmm10", "xmm11", "xmm12", "xmm13", "xmm14", "xmm15",
                "ymm0", "ymm1", "ymm2", "ymm3", "ymm4", "ymm5", "ymm6", "ymm7", "st0", "st1", "st2", "st3", "st4", "st5", "st6", "st7",
            ],
            directives: [
                "section", "segment", "global", "extern", "bits", "org", "align", "alignb", "db", "dw", "dd", "dq", "dt", "do", "dy", "resb", "resw",
                "resd", "resq", "rest", "reso", "resy", "equ", "times", "incbin", "default", "rel", "abs", "struc", "endstruc", "istruc", "iend", "at",
                "byte", "word", "dword", "qword", "tword", "oword", "yword", "ptr", "short", "near", "far", "cpu", "common", "static",
            ],
            instructions: [
                "mov", "movzx", "movsx", "movsxd", "lea", "push", "pop", "add", "sub", "inc", "dec", "mul", "imul", "div", "idiv", "neg", "and", "or",
                "xor", "not", "shl", "shr", "sal", "sar", "rol", "ror", "rcl", "rcr", "cmp", "test", "jmp", "je", "jne", "jz", "jnz", "jg", "jge", "jl",
                "jle", "ja", "jae", "jb", "jbe", "js", "jns", "jo", "jno", "jc", "jnc", "jp", "jnp", "jcxz", "jecxz", "jrcxz", "call", "ret", "leave",
                "enter", "nop", "int", "syscall", "sysenter", "sysret", "hlt", "loop", "loope", "loopne", "rep", "repe", "repne", "movsb", "movsw",
                "movsd", "movsq", "stosb", "stosw", "stosd", "stosq", "lodsb", "lodsw", "lodsd", "lodsq", "scasb", "cmpsb", "cld", "std", "cli", "sti",
                "xchg", "cmpxchg", "xadd", "lock", "cpuid", "rdtsc", "cqo", "cdq", "cwd", "cbw", "cwde", "cdqe", "bt", "bts", "btr", "btc", "bsf",
                "bsr", "popcnt", "lzcnt", "tzcnt", "adc", "sbb", "cmove", "cmovne", "cmovz", "cmovnz", "cmovg", "cmovge", "cmovl", "cmovle",
                "cmova", "cmovae", "cmovb", "cmovbe", "sete", "setne", "setz", "setnz", "setg", "setge", "setl", "setle", "seta", "setae", "setb",
                "setbe", "movss", "movaps", "movups", "movdqa", "movdqu", "movq", "movd", "addss", "addsd", "subss", "subsd", "mulss", "mulsd",
                "divss", "divsd", "sqrtss", "sqrtsd", "cvtsi2sd", "cvtsi2ss", "cvttsd2si", "cvttss2si", "pxor", "paddd", "psubd", "pushf", "popf",
                "pusha", "popa", "iret", "iretq", "ud2", "pause",
            ],
            tokenizer: {
                root: [
                    [/;.*$/, "comment"],
                    [/%[a-z_]+/, "annotation"],
                    [/^\s*[A-Za-z_.$?][\w.$?@#~]*:/, "type.identifier"],
                    [/"[^"]*"?|'[^']*'?|`[^`]*`?/, "string"],
                    [/0x[0-9a-f_]+|[0-9][0-9a-f_]*h\b|0b[01_]+|0o[0-7_]+|\d[\d_]*(?:\.\d+)?/, "number"],
                    [/[A-Za-z_.$?][\w.$?@#~]*/, { cases: { "@registers": "variable.predefined", "@directives": "keyword", "@instructions": "keyword.flow", "@default": "identifier" } }],
                    [/[[\]]/, "@brackets"],
                    [/[+\-*/%<>|&^~:,()]/, "operator"],
                    [/\s+/, ""],
                ],
            },
        },
        configuration: { comments: { lineComment: ";" }, brackets: [["[", "]"], ["(", ")"]], autoClosingPairs: [{ open: "[", close: "]" }, { open: "(", close: ")" }, { open: "\"", close: "\"", notIn: ["string"] }, { open: "'", close: "'", notIn: ["string"] }] },
    },
    {
        id: "fortran",
        aliases: ["Fortran", "f90"],
        extensions: [".f90", ".f95", ".f03", ".f08", ".f", ".for", ".f77"],
        tokens: {
            defaultToken: "",
            ignoreCase: true,
            keywords: [
                "program", "end", "implicit", "none", "integer", "real", "double", "precision", "complex", "logical", "character", "parameter",
                "dimension", "allocatable", "intent", "in", "out", "inout", "if", "then", "else", "elseif", "endif", "do", "enddo", "while", "select",
                "case", "default", "call", "subroutine", "function", "return", "module", "use", "contains", "type", "interface", "print", "write",
                "read", "open", "close", "format", "stop", "allocate", "deallocate", "cycle", "exit", "go", "to", "goto", "continue", "data", "common",
                "save", "external", "intrinsic", "pure", "elemental", "recursive", "result", "only", "public", "private", "pointer", "target", "kind",
                "associate", "block", "where", "forall", "procedure", "class", "extends", "abstract", "sequence", "namelist", "include", "optional",
                "concurrent", "endprogram", "endmodule", "endsubroutine", "endfunction",
            ],
            builtins: [
                "abs", "sqrt", "sin", "cos", "tan", "asin", "acos", "atan", "atan2", "exp", "log", "log10", "mod", "modulo", "max", "min", "size",
                "sum", "product", "int", "nint", "floor", "ceiling", "len", "len_trim", "trim", "adjustl", "adjustr", "allocated", "present", "huge",
                "tiny", "epsilon", "maxval", "minval", "maxloc", "minloc", "matmul", "transpose", "dot_product", "reshape", "merge", "any", "all",
                "count", "shape", "lbound", "ubound", "char", "ichar", "achar", "iachar", "index", "scan", "repeat", "random_number", "cpu_time",
            ],
            tokenizer: {
                root: [
                    [/!.*$/, "comment"],
                    [/^\*.*$/, "comment"],
                    [/\.(?:true|false)\.(?:_\w+)?/, "constant"],
                    [/\.(?:and|or|not|eqv|neqv|eq|ne|lt|le|gt|ge)\./, "operator"],
                    [/"/, "string", "@doubleQuoted"],
                    [/'/, "string", "@singleQuoted"],
                    [/(?:\d+\.\d*|\.\d+|\d+)(?:[eEdD][-+]?\d+)?(?:_\w+)?/, "number"],
                    [/[A-Za-z_]\w*/, { cases: { "@keywords": "keyword", "@builtins": "predefined", "@default": "identifier" } }],
                    [/\*\*|\/\/|==|\/=|<=|>=|=>|::|[+\-*/=<>%]/, "operator"],
                    [/[(),:]/, "delimiter"],
                    [/\s+/, ""],
                ],
                doubleQuoted: [[/[^"]+/, "string"], [/""/, "string"], [/"/, "string", "@pop"]],
                singleQuoted: [[/[^']+/, "string"], [/''/, "string"], [/'/, "string", "@pop"]],
            },
        },
        configuration: { comments: { lineComment: "!" }, brackets: [["(", ")"], ["[", "]"]], autoClosingPairs: [{ open: "(", close: ")" }, { open: "[", close: "]" }, { open: "\"", close: "\"", notIn: ["string"] }, { open: "'", close: "'", notIn: ["string", "comment"] }] },
    },
    {
        id: "cobol",
        aliases: ["COBOL", "cbl"],
        extensions: [".cob", ".cbl", ".cpy"],
        tokens: {
            defaultToken: "",
            ignoreCase: true,
            keywords: [
                "identification", "division", "program-id", "author", "environment", "configuration", "input-output", "file-control", "data",
                "working-storage", "local-storage", "linkage", "file", "section", "procedure", "display", "accept", "move", "to", "add", "subtract",
                "multiply", "divide", "compute", "giving", "remainder", "if", "else", "end-if", "perform", "end-perform", "until", "varying", "from",
                "by", "times", "thru", "through", "stop", "run", "pic", "picture", "value", "values", "evaluate", "when", "end-evaluate", "other",
                "go", "goback", "call", "using", "returning", "fd", "select", "assign", "open", "close", "read", "write", "rewrite", "delete", "input",
                "output", "extend", "at", "end", "not", "and", "or", "zero", "zeros", "zeroes", "space", "spaces", "occurs", "indexed", "redefines",
                "copy", "function", "continue", "exit", "initialize", "string", "unstring", "delimited", "into", "with", "no", "advancing", "upon",
                "is", "greater", "less", "than", "equal", "true", "false", "set", "up", "down", "of", "in", "comp", "comp-3", "binary", "sign",
                "leading", "trailing", "separate", "inspect", "tallying", "replacing", "all", "corresponding", "high-values", "low-values", "quote",
                "quotes", "null", "nulls", "next", "sentence", "on", "size", "error", "end-read", "end-write", "end-call", "end-compute",
            ],
            tokenizer: {
                root: [
                    [/^.{6}[*/].*$/, "comment"],
                    [/\*>.*$/, "comment"],
                    [/"[^"]*"?|'[^']*'?/, "string"],
                    [/\b\d{2}(?=\s)/, "number"],
                    [/[+-]?\d+(?:\.\d+)?/, "number"],
                    [/[A-Za-z][\w-]*/, { cases: { "@keywords": "keyword", "@default": "identifier" } }],
                    [/[+\-*/=<>]/, "operator"],
                    [/[().,]/, "delimiter"],
                    [/\s+/, ""],
                ],
            },
        },
        configuration: { comments: { lineComment: "*>" }, brackets: [["(", ")"]], autoClosingPairs: [{ open: "(", close: ")" }, { open: "\"", close: "\"", notIn: ["string"] }] },
    },
    {
        id: "ada",
        aliases: ["Ada"],
        extensions: [".adb", ".ads", ".ada"],
        tokens: {
            defaultToken: "",
            ignoreCase: true,
            keywords: [
                "abort", "abs", "abstract", "accept", "access", "aliased", "all", "and", "array", "at", "begin", "body", "case", "constant", "declare",
                "delay", "delta", "digits", "do", "else", "elsif", "end", "entry", "exception", "exit", "for", "function", "generic", "goto", "if", "in",
                "interface", "is", "limited", "loop", "mod", "new", "not", "null", "of", "or", "others", "out", "overriding", "package", "pragma",
                "private", "procedure", "protected", "raise", "range", "record", "rem", "renames", "requeue", "return", "reverse", "select",
                "separate", "some", "subtype", "synchronized", "tagged", "task", "terminate", "then", "type", "until", "use", "when", "while", "with", "xor",
            ],
            types: ["integer", "natural", "positive", "float", "long_float", "boolean", "character", "string", "duration", "wide_string", "unbounded_string"],
            constants: ["true", "false"],
            tokenizer: {
                root: [
                    [/--.*$/, "comment"],
                    [/"/, "string", "@string"],
                    [/'.'/, "string"],
                    [/'[A-Za-z_]\w*/, "annotation"],
                    [/\d[\d_]*#[0-9A-Fa-f_.]+#(?:[eE][-+]?\d+)?/, "number"],
                    [/\d[\d_]*(?:\.\d[\d_]*)?(?:[eE][-+]?\d+)?/, "number"],
                    [/[A-Za-z]\w*/, { cases: { "@keywords": "keyword", "@types": "type", "@constants": "constant", "@default": "identifier" } }],
                    [/:=|=>|\.\.|\*\*|\/=|<=|>=|<>|[+\-*/&=<>|]/, "operator"],
                    [/[();,.:]/, "delimiter"],
                    [/\s+/, ""],
                ],
                string: [[/[^"]+/, "string"], [/""/, "string"], [/"/, "string", "@pop"]],
            },
        },
        configuration: { comments: { lineComment: "--" }, brackets: [["(", ")"]], autoClosingPairs: [{ open: "(", close: ")" }, { open: "\"", close: "\"", notIn: ["string"] }] },
    },
    {
        id: "vhdl",
        aliases: ["VHDL"],
        extensions: [".vhd", ".vhdl"],
        tokens: {
            defaultToken: "",
            ignoreCase: true,
            keywords: [
                "abs", "access", "after", "alias", "all", "and", "architecture", "array", "assert", "attribute", "begin", "block", "body", "buffer",
                "bus", "case", "component", "configuration", "constant", "disconnect", "downto", "else", "elsif", "end", "entity", "exit", "file", "for",
                "function", "generate", "generic", "group", "guarded", "if", "impure", "in", "inertial", "inout", "is", "label", "library", "linkage",
                "literal", "loop", "map", "mod", "nand", "new", "next", "nor", "not", "null", "of", "on", "open", "or", "others", "out", "package",
                "port", "postponed", "procedure", "process", "pure", "range", "record", "register", "reject", "rem", "report", "return", "rol", "ror",
                "select", "severity", "signal", "shared", "sla", "sll", "sra", "srl", "subtype", "then", "to", "transport", "type", "unaffected",
                "units", "until", "use", "variable", "wait", "when", "while", "with", "xnor", "xor", "rising_edge", "falling_edge",
            ],
            types: ["std_logic", "std_logic_vector", "std_ulogic", "std_ulogic_vector", "integer", "natural", "positive", "boolean", "bit", "bit_vector", "signed", "unsigned", "real", "time", "string", "character"],
            constants: ["true", "false", "note", "warning", "error", "failure"],
            tokenizer: {
                root: [
                    [/--.*$/, "comment"],
                    [/[xXbBoO]"[0-9A-Fa-f_]*"/, "number"],
                    [/"/, "string", "@string"],
                    [/'[01UXZWLH-]'/, "number"],
                    [/'[A-Za-z_]\w*/, "annotation"],
                    [/\d[\d_]*(?:\.\d[\d_]*)?(?:[eE][-+]?\d+)?/, "number"],
                    [/[A-Za-z]\w*/, { cases: { "@keywords": "keyword", "@types": "type", "@constants": "constant", "@default": "identifier" } }],
                    [/<=|:=|=>|\/=|>=|\*\*|[+\-*/&=<>]/, "operator"],
                    [/[();,.:]/, "delimiter"],
                    [/\s+/, ""],
                ],
                string: [[/[^"]+/, "string"], [/""/, "string"], [/"/, "string", "@pop"]],
            },
        },
        configuration: { comments: { lineComment: "--" }, brackets: [["(", ")"]], autoClosingPairs: [{ open: "(", close: ")" }, { open: "\"", close: "\"", notIn: ["string"] }] },
    },
    {
        id: "odin",
        aliases: ["Odin"],
        extensions: [".odin"],
        tokens: cLikeTokens({
            keywords: [
                "package", "import", "proc", "struct", "enum", "union", "bit_set", "map", "dynamic", "distinct", "using", "defer", "when", "where", "if",
                "else", "for", "in", "not_in", "switch", "case", "fallthrough", "break", "continue", "return", "or_else", "or_return", "context",
                "auto_cast", "cast", "transmute", "foreign", "do", "matrix",
            ],
            types: ["int", "uint", "i8", "i16", "i32", "i64", "i128", "u8", "u16", "u32", "u64", "u128", "f16", "f32", "f64", "bool", "b8", "b16", "b32", "b64", "rune", "string", "cstring", "rawptr", "uintptr", "typeid", "any", "byte"],
            constants: ["true", "false", "nil"],
            extraRoot: [[/#[A-Za-z_]\w*/, "annotation"], [/`[^`]*`/, "string"]],
        }),
        configuration: cLikeConfiguration(),
    },
    {
        id: "vlang",
        aliases: ["V (Vlang)", "vlang"],
        extensions: [".vsh", ".vv"],
        tokens: cLikeTokens({
            keywords: [
                "fn", "mut", "pub", "struct", "enum", "interface", "module", "import", "const", "return", "if", "else", "for", "in", "match", "or",
                "defer", "go", "spawn", "unsafe", "as", "is", "type", "assert", "sizeof", "typeof", "isreftype", "lock", "rlock", "shared", "atomic",
                "union", "static", "volatile", "break", "continue", "goto", "select", "__global",
            ],
            types: ["int", "i8", "i16", "i64", "u8", "u16", "u32", "u64", "f32", "f64", "bool", "string", "rune", "voidptr", "byte", "usize", "isize", "map", "chan", "any", "thread"],
            constants: ["true", "false", "none", "nil"],
            extraRoot: [[/'(?:[^'\\]|\\.)*'/, "string"]],
        }),
        configuration: cLikeConfiguration(),
    },
    {
        id: "gleam",
        aliases: ["Gleam"],
        extensions: [".gleam"],
        tokens: cLikeTokens({
            keywords: ["pub", "fn", "let", "assert", "case", "use", "import", "type", "opaque", "const", "external", "todo", "panic", "as", "if", "echo"],
            types: ["Int", "Float", "String", "Bool", "List", "Nil", "Result", "Option", "BitArray", "Dict"],
            constants: ["True", "False", "Nil", "Ok", "Error"],
            blockComments: false,
        }),
        configuration: cLikeConfiguration("//", null),
    },
    {
        id: "elm",
        aliases: ["Elm"],
        extensions: [".elm"],
        tokens: {
            defaultToken: "",
            keywords: ["module", "exposing", "import", "as", "type", "alias", "port", "case", "of", "let", "in", "if", "then", "else", "where"],
            tokenizer: {
                root: [
                    [/\{-/, "comment", "@comment"],
                    [/--.*$/, "comment"],
                    [/"""/, "string", "@tripleString"],
                    [/"/, "string", "@string"],
                    [/'(?:[^'\\]|\\.)'/, "string"],
                    [/[A-Z][\w']*(?:\.[A-Z][\w']*)*/, "type.identifier"],
                    [/[a-z_][\w']*/, { cases: { "@keywords": "keyword", "@default": "identifier" } }],
                    ...NUMBER_RULES,
                    [/[!#$%&*+./<=>?@\\^|~:-]+/, "operator"],
                    [/[()[\]{},]/, "delimiter"],
                    [/\s+/, ""],
                ],
                comment: [[/[^{-]+/, "comment"], [/\{-/, "comment", "@push"], [/-\}/, "comment", "@pop"], [/[{-]/, "comment"]],
                string: [[/[^\\"]+/, "string"], [/\\./, "string.escape"], [/"/, "string", "@pop"]],
                tripleString: [[/"""/, "string", "@pop"], [/[^"]+/, "string"], [/"/, "string"]],
            },
        },
        configuration: { comments: { lineComment: "--", blockComment: ["{-", "-}"] }, brackets: BRACKETS, autoClosingPairs: PAIRS },
    },
];

/** Monaco language ids registered by Hanogt in addition to Monaco's own. */
export const EXTRA_MONACO_LANGUAGE_IDS: readonly string[] = EXTRA_LANGUAGES.map((language) => language.id);

/** The grammars themselves (scripts/tests/monaco-grammars.test.mjs compiles and runs every one). */
export const EXTRA_MONACO_LANGUAGES: ReadonlyArray<Readonly<LanguageDefinition>> = EXTRA_LANGUAGES;

type CompilerDefaults = { getCompilerOptions(): Record<string, unknown>; setCompilerOptions(options: Record<string, unknown>): void };

let setupDone = false;

/**
 * Registers Hanogt's themes and extra languages once per page (pass it to the
 * editor's beforeMount). Safe to call repeatedly.
 */
export function setupMonaco(monaco: MonacoApi) {
    if (setupDone) return;
    setupDone = true;
    for (const [id, data] of Object.entries(HANOGT_THEME_DATA)) monaco.editor.defineTheme(id, data);
    const known = new Set(monaco.languages.getLanguages().map((language: { id: string }) => language.id));
    for (const language of EXTRA_LANGUAGES) {
        if (known.has(language.id)) continue;
        monaco.languages.register({ id: language.id, aliases: language.aliases, extensions: language.extensions, filenames: language.filenames });
        monaco.languages.setMonarchTokensProvider(language.id, language.tokens);
        monaco.languages.setLanguageConfiguration(language.id, language.configuration);
    }
    // Treat every TypeScript/JavaScript tab as its own module, so two tabs that
    // both declare `const name` do not report "Cannot redeclare block-scoped variable".
    type TypeScriptApi = { typescriptDefaults?: CompilerDefaults; javascriptDefaults?: CompilerDefaults };
    const api = monaco as unknown as { typescript?: TypeScriptApi; languages: { typescript?: TypeScriptApi } };
    const typescript = api.typescript ?? api.languages.typescript;
    for (const defaults of [typescript?.typescriptDefaults, typescript?.javascriptDefaults]) {
        if (!defaults) continue;
        try {
            defaults.setCompilerOptions({ ...defaults.getCompilerOptions(), moduleDetection: 3 });
        } catch {
            // Older Monaco builds: keep their defaults.
        }
    }
}
