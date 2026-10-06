"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import MiniGame, { type RunnerEvent } from "./MiniGame";
import { RUNNER } from "./runner-rules";

/** C# float literal: 2300 → "2300f", 0.1 → "0.1f". */
const f = (value: number) => `${value}f`;
/** A line of code with its comment lined up with the others. */
const note = (code: string, comment: string) => `${code.padEnd(38)}// ${comment}`;

/** The game's rules as a plain C# (.NET) class, line by line, tagged with the events that run them. */
const LINES: Array<{ text: string; on?: RunnerEvent[] }> = [
    { text: "// The rules of the game below, in plain C#." },
    { text: "using System;" },
    { text: "" },
    { text: "public sealed class Runner" },
    { text: "{" },
    { text: `    const float Gravity = ${f(RUNNER.gravity)};` },
    { text: `    const float JumpSpeed = ${f(RUNNER.jumpSpeed)}, DoubleJumpSpeed = ${f(RUNNER.doubleJumpSpeed)};` },
    { text: note(`    const float CoyoteTime = ${f(RUNNER.coyoteTime)};`, "just off the ground still counts") },
    { text: note(`    const float JumpBuffer = ${f(RUNNER.jumpBuffer)};`, "a press just before landing") },
    { text: note(`    const int MaxJumps = ${RUNNER.maxJumps};`, "double jump") },
    { text: `    const int StreakStep = ${RUNNER.streakStep}, MaxMultiplier = ${RUNNER.maxMultiplier};` },
    { text: "" },
    { text: "    float y, velocityY, sinceGrounded;" },
    { text: "    float sinceJumpPressed = float.PositiveInfinity;" },
    { text: "    int jumpsLeft = MaxJumps, streak;" },
    { text: "    bool grounded = true, shield;" },
    { text: "" },
    { text: "    public int Score { get; private set; }" },
    { text: "    public int Multiplier => Math.Min(MaxMultiplier, 1 + streak / StreakStep);", on: ["coin"] },
    { text: "" },
    { text: "    public void Jump() => sinceJumpPressed = 0;", on: ["jump", "doubleJump"] },
    { text: "" },
    { text: "    public void Update(float dt, float groundY)" },
    { text: "    {" },
    { text: "        sinceGrounded = grounded ? 0 : sinceGrounded + dt;" },
    { text: "        sinceJumpPressed += dt;" },
    { text: "        if (sinceJumpPressed <= JumpBuffer)", on: ["jump", "doubleJump"] },
    { text: "        {" },
    { text: "            if ((grounded || sinceGrounded <= CoyoteTime) && jumpsLeft == MaxJumps)", on: ["jump"] },
    { text: "                Launch(JumpSpeed);", on: ["jump"] },
    { text: "            else if (!grounded && jumpsLeft > 0)", on: ["doubleJump"] },
    { text: "                Launch(DoubleJumpSpeed);", on: ["doubleJump"] },
    { text: "        }" },
    { text: "        velocityY += Gravity * dt;" },
    { text: "        y += velocityY * dt;" },
    { text: "        if (y >= groundY)" },
    { text: "            (y, velocityY, grounded, jumpsLeft) = (groundY, 0, true, MaxJumps);" },
    { text: "    }" },
    { text: "" },
    { text: "    void Launch(float speed)", on: ["jump", "doubleJump"] },
    { text: "    {", on: ["jump", "doubleJump"] },
    { text: "        velocityY = -speed;", on: ["jump", "doubleJump"] },
    { text: "        jumpsLeft = jumpsLeft == MaxJumps ? MaxJumps - 1 : 0;", on: ["jump", "doubleJump"] },
    { text: "        (grounded, sinceJumpPressed) = (false, float.PositiveInfinity);", on: ["jump", "doubleJump"] },
    { text: "    }", on: ["jump", "doubleJump"] },
    { text: "" },
    { text: "    public void OnCoin() { streak++; Score += Multiplier; }", on: ["coin"] },
    { text: "    public void OnShield() => shield = true;", on: ["shield"] },
    { text: "" },
    { text: note("    public bool OnHit()", "true: game over"), on: ["hit", "shield"] },
    { text: "    {", on: ["hit", "shield"] },
    { text: "        if (shield) { shield = false; return false; }", on: ["shield"] },
    { text: "        streak = 0;", on: ["hit"] },
    { text: "        return true;", on: ["hit"] },
    { text: "    }", on: ["hit", "shield"] },
    { text: "}" },
];

type Kind = "kw" | "type" | "num" | "fn" | "cm" | "plain";
const KEYWORDS = new Set(["using", "public", "private", "sealed", "class", "const", "float", "int", "bool", "void", "if", "else", "return", "get", "set", "true", "false"]);
const TYPES = new Set(["Runner", "Math", "System"]);
// The site's accent colors: keywords purple, types pink, numbers amber.
const COLORS: Record<Kind, string> = {
    kw: "text-violet-300",
    type: "text-pink-300",
    num: "text-amber-200",
    fn: "text-yellow-100",
    cm: "text-zinc-500",
    plain: "text-zinc-200",
};

function tokenize(line: string) {
    const tokens: Array<{ text: string; kind: Kind }> = [];
    const pattern = /(\/\/.*)|(\b\d+(?:\.\d+)?f?\b)|([A-Za-z_][A-Za-z0-9_]*)|(\s+|[^\sA-Za-z0-9_])/g;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(line))) {
        const [text, comment, number, word] = match;
        if (comment) tokens.push({ text, kind: "cm" });
        else if (number) tokens.push({ text, kind: "num" });
        else if (word) tokens.push({ text, kind: KEYWORDS.has(word) ? "kw" : TYPES.has(word) ? "type" : line[pattern.lastIndex] === "(" ? "fn" : "plain" });
        else tokens.push({ text, kind: "plain" });
    }
    return tokens;
}

const TOKENIZED = LINES.map((line) => ({ ...line, tokens: tokenize(line.text) }));
const LINE_HEIGHT = 19;

export type ShowcaseLabels = {
    file: string;
    runs: string;
    hint: string;
    tap: string;
    play: string;
    again: string;
    over: string;
    best: string;
    score: string;
};

/**
 * The C# Runner class and, under it, the game it describes: what happens in
 * the game (a jump, a coin, a hit) lights up the lines that handle it.
 */
export default function CodeShowcase({ labels }: { labels: ShowcaseLabels }) {
    const preRef = useRef<HTMLPreElement | null>(null);
    const [active, setActive] = useState<RunnerEvent | null>(null);
    const timer = useRef<number | undefined>(undefined);

    const onEvent = useCallback((event: RunnerEvent) => {
        setActive(event);
        window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => setActive(null), 700);
        const pre = preRef.current;
        const first = LINES.findIndex((line) => line.on?.includes(event));
        if (pre && first >= 0) {
            const top = first * LINE_HEIGHT;
            if (top < pre.scrollTop || top > pre.scrollTop + pre.clientHeight - LINE_HEIGHT * 3) pre.scrollTop = Math.max(0, top - LINE_HEIGHT * 2);
        }
    }, []);
    useEffect(() => () => window.clearTimeout(timer.current), []);

    return (
        <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950 shadow-xl" dir="ltr">
            <div className="flex items-center gap-2 border-b border-white/10 bg-zinc-900 px-4 py-2.5">
                <span className="h-3 w-3 rounded-full bg-indigo-400/70" />
                <span className="h-3 w-3 rounded-full bg-pink-400/70" />
                <span className="h-3 w-3 rounded-full bg-amber-400/70" />
                <span className="ms-3 rounded-md bg-white/10 px-2 py-0.5 font-mono text-[11.5px] text-zinc-300">{labels.file}</span>
                <span className="ms-auto rounded-md bg-white/5 px-2 py-0.5 text-[11px] font-bold text-zinc-300">C# · .NET</span>
            </div>
            <pre ref={preRef} className="scrollbar-thin relative h-[230px] overflow-y-auto py-2 font-mono text-[12px] sm:text-[12.5px]" aria-label={labels.file} style={{ lineHeight: `${LINE_HEIGHT}px` }}>
                <code className="block min-w-max">
                    {TOKENIZED.map((line, index) => {
                        const lit = Boolean(active && line.on?.includes(active));
                        return (
                            <span key={index} className={`flex pe-4 transition-colors duration-200 ${lit ? "bg-fuchsia-500/20" : ""}`}>
                                <span className={`w-10 shrink-0 select-none pe-3 text-end ${lit ? "text-pink-300" : "text-zinc-600"}`} aria-hidden="true">{index + 1}</span>
                                <span>{line.tokens.length ? line.tokens.map((token, position) => <span key={position} className={COLORS[token.kind]}>{token.text}</span>) : " "}</span>
                            </span>
                        );
                    })}
                </code>
            </pre>
            <div className="flex items-center gap-2 border-t border-white/10 bg-zinc-900 px-4 py-1.5 text-[11px] font-semibold text-zinc-400">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-pink-400" aria-hidden="true" />
                <span className="truncate">{labels.runs}</span>
            </div>
            <MiniGame labels={labels} onEvent={onEvent} />
        </div>
    );
}
