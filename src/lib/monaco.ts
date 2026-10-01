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

/** A Monarch grammar for brace languages (D, Zig, Groovy, Pony). */
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
];

/** Monaco language ids registered by Hanogt in addition to Monaco's own. */
export const EXTRA_MONACO_LANGUAGE_IDS: readonly string[] = EXTRA_LANGUAGES.map((language) => language.id);

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
        monaco.languages.register({ id: language.id, aliases: language.aliases, extensions: language.extensions });
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
