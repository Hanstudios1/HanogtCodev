import type { CSSProperties, ReactNode } from "react";
import type { OutputPiece } from "@/components/Editor/output-links";
import { ansiStyleKey, xtermColor, type AnsiColor, type AnsiStyle } from "@/lib/editor/ansi";

/**
 * The 16 terminal colours for the console's light and dark backgrounds
 * (readable on white and on zinc-950). Full class names, so Tailwind sees them.
 */
const FOREGROUND: readonly string[] = [
    "text-[#24292f] dark:text-[#6e7681]",
    "text-[#cf222e] dark:text-[#ff7b72]",
    "text-[#116329] dark:text-[#3fb950]",
    "text-[#9a6700] dark:text-[#d29922]",
    "text-[#0969da] dark:text-[#58a6ff]",
    "text-[#8250df] dark:text-[#bc8cff]",
    "text-[#1b7c83] dark:text-[#39c5cf]",
    "text-[#6e7781] dark:text-[#b1bac4]",
    "text-[#57606a] dark:text-[#8b949e]",
    "text-[#a40e26] dark:text-[#ffa198]",
    "text-[#1a7f37] dark:text-[#56d364]",
    "text-[#7d4e00] dark:text-[#e3b341]",
    "text-[#218bff] dark:text-[#79c0ff]",
    "text-[#a475f9] dark:text-[#d2a8ff]",
    "text-[#3192aa] dark:text-[#56d4dd]",
    "text-[#8c959f] dark:text-[#f0f6fc]",
];

const BACKGROUND: readonly string[] = [
    "bg-[#24292f] dark:bg-[#484f58]",
    "bg-[#cf222e] dark:bg-[#ff7b72]",
    "bg-[#116329] dark:bg-[#3fb950]",
    "bg-[#9a6700] dark:bg-[#d29922]",
    "bg-[#0969da] dark:bg-[#58a6ff]",
    "bg-[#8250df] dark:bg-[#bc8cff]",
    "bg-[#1b7c83] dark:bg-[#39c5cf]",
    "bg-[#6e7781] dark:bg-[#b1bac4]",
    "bg-[#57606a] dark:bg-[#8b949e]",
    "bg-[#a40e26] dark:bg-[#ffa198]",
    "bg-[#1a7f37] dark:bg-[#56d364]",
    "bg-[#7d4e00] dark:bg-[#e3b341]",
    "bg-[#218bff] dark:bg-[#79c0ff]",
    "bg-[#a475f9] dark:bg-[#d2a8ff]",
    "bg-[#3192aa] dark:bg-[#56d4dd]",
    "bg-[#8c959f] dark:bg-[#f0f6fc]",
];

/** The background colours above as values (light, dark), to pick readable text on them. */
const BACKGROUND_VALUES: ReadonlyArray<readonly [string, string]> = [
    ["#24292f", "#484f58"], ["#cf222e", "#ff7b72"], ["#116329", "#3fb950"], ["#9a6700", "#d29922"],
    ["#0969da", "#58a6ff"], ["#8250df", "#bc8cff"], ["#1b7c83", "#39c5cf"], ["#6e7781", "#b1bac4"],
    ["#57606a", "#8b949e"], ["#a40e26", "#ffa198"], ["#1a7f37", "#56d364"], ["#7d4e00", "#e3b341"],
    ["#218bff", "#79c0ff"], ["#a475f9", "#d2a8ff"], ["#3192aa", "#56d4dd"], ["#8c959f", "#f0f6fc"],
];

const LIGHT_TEXT = "#ffffff";
const DARK_TEXT = "#0d1117";

/** The console's own colours, used when inverse video swaps a default colour. */
const DEFAULT_AS_TEXT = "text-white dark:text-zinc-950";
const DEFAULT_AS_BACKGROUND = "bg-zinc-800 dark:bg-zinc-200";

function colorValue(color: AnsiColor): string {
    return typeof color === "number" ? xtermColor(color) : color;
}

function luminance(hex: string): number {
    const channel = (offset: number) => {
        const value = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;
        return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

/** White or near-black, whichever contrasts more with the background. */
function readableOn(background: string): typeof LIGHT_TEXT | typeof DARK_TEXT {
    const value = luminance(background);
    return (1.05) / (value + 0.05) >= (value + 0.05) / (luminance(DARK_TEXT) + 0.05) ? LIGHT_TEXT : DARK_TEXT;
}

/** Text classes for the default colour on a palette background, per theme. */
const TEXT_ON_BACKGROUND: readonly string[] = BACKGROUND_VALUES.map(([light, dark]) => [
    readableOn(light) === LIGHT_TEXT ? "text-white" : "text-[#0d1117]",
    readableOn(dark) === LIGHT_TEXT ? "dark:text-white" : "dark:text-[#0d1117]",
].join(" "));

/** Class names and inline styles for one terminal style. */
export function ansiPresentation(style: AnsiStyle): { className: string; style: CSSProperties } {
    const classes: string[] = [];
    const css: CSSProperties = {};
    const foreground = style.inverse ? style.bg : style.fg;
    const background = style.inverse ? style.fg : style.bg;
    if (background === undefined) {
        if (style.inverse) classes.push(DEFAULT_AS_BACKGROUND);
    } else if (typeof background === "number" && background < 16) {
        classes.push(BACKGROUND[background]);
    } else {
        css.backgroundColor = colorValue(background);
    }
    if (foreground !== undefined) {
        if (typeof foreground === "number" && foreground < 16) classes.push(FOREGROUND[foreground]);
        else css.color = colorValue(foreground);
    } else if (background === undefined) {
        if (style.inverse) classes.push(DEFAULT_AS_TEXT);
    } else if (typeof background === "number" && background < 16) {
        // Only a background was given: the console's text colour may not be readable on it.
        classes.push(TEXT_ON_BACKGROUND[background]);
    } else {
        css.color = readableOn(colorValue(background));
    }
    if (style.bold) classes.push("font-bold");
    if (style.dim) classes.push("opacity-70");
    if (style.italic) classes.push("italic");
    if (style.hidden) classes.push("invisible");
    const decorations = [style.underline ? "underline" : "", style.strike ? "line-through" : ""].filter(Boolean);
    if (decorations.length) css.textDecorationLine = decorations.join(" ");
    return { className: classes.join(" "), style: css };
}

/** Output text in terminal colours; unstyled pieces stay plain text. */
export function AnsiPieces({ pieces }: { pieces: readonly OutputPiece[] }): ReactNode {
    return pieces.map((piece, index) => {
        if (!piece.style) return piece.text;
        const { className, style } = ansiPresentation(piece.style);
        return <span key={index} className={className || undefined} style={style} data-ansi={ansiStyleKey(piece.style)}>{piece.text}</span>;
    });
}
