"use client";

import { useEffect, useRef, useState } from "react";
import MiniGame from "./MiniGame";

const SOURCE = `using UnityEngine;

public class Runner : MonoBehaviour
{
    public float jumpForce = 11f;
    private Rigidbody2D rb;
    private int score;

    void Start()
    {
        rb = GetComponent<Rigidbody2D>();
    }

    void Update()
    {
        if (Input.GetKeyDown(KeyCode.Space))
            rb.velocity = new Vector2(rb.velocity.x, jumpForce);
    }

    void OnTriggerEnter2D(Collider2D other)
    {
        if (!other.CompareTag("Coin")) return;
        score++;
        Audio.Play("coin");
        Destroy(other.gameObject);
    }
}`;

type Token = { text: string; kind: "kw" | "type" | "str" | "num" | "fn" | "cm" | "plain" };

const KEYWORDS = new Set(["using", "public", "private", "class", "void", "float", "int", "if", "return", "new", "bool"]);
const TYPES = new Set(["UnityEngine", "MonoBehaviour", "Rigidbody2D", "Input", "KeyCode", "Vector2", "Collider2D", "Audio"]);

function tokenize(source: string): Token[] {
    const tokens: Token[] = [];
    const pattern = /(\/\/[^\n]*)|("(?:[^"\\]|\\.)*")|(\b\d+(?:\.\d+)?f?\b)|([A-Za-z_][A-Za-z0-9_]*)|(\s+|[^\sA-Za-z0-9_"])/g;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(source))) {
        const [text, comment, string, number, word] = match;
        if (comment) tokens.push({ text, kind: "cm" });
        else if (string) tokens.push({ text, kind: "str" });
        else if (number) tokens.push({ text, kind: "num" });
        else if (word) {
            const next = source[pattern.lastIndex];
            tokens.push({ text, kind: KEYWORDS.has(word) ? "kw" : TYPES.has(word) ? "type" : next === "(" || next === "<" ? "fn" : "plain" });
        } else tokens.push({ text, kind: "plain" });
    }
    return tokens;
}

const TOKENS = tokenize(SOURCE);
const COLORS: Record<Token["kind"], string> = {
    kw: "text-fuchsia-400",
    type: "text-sky-300",
    str: "text-amber-300",
    num: "text-emerald-300",
    fn: "text-indigo-300",
    cm: "text-zinc-500",
    plain: "text-zinc-200",
};

function renderUntil(count: number) {
    const out: React.ReactNode[] = [];
    let remaining = count;
    for (let index = 0; index < TOKENS.length && remaining > 0; index += 1) {
        const token = TOKENS[index];
        const text = token.text.length <= remaining ? token.text : token.text.slice(0, remaining);
        remaining -= text.length;
        out.push(<span key={index} className={COLORS[token.kind]}>{text}</span>);
    }
    return out;
}

export default function CodeShowcase({ labels }: { labels: { file: string; play: string; hint: string; compiled: string } }) {
    const [typed, setTyped] = useState(0);
    const containerRef = useRef<HTMLDivElement | null>(null);
    const tiltRef = useRef<HTMLDivElement | null>(null);
    const preRef = useRef<HTMLPreElement | null>(null);

    // Keep the caret in view while typing.
    useEffect(() => {
        const pre = preRef.current;
        if (pre && typed < SOURCE.length) pre.scrollTop = pre.scrollHeight;
    }, [typed]);

    useEffect(() => {
        if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
            const done = window.setTimeout(() => setTyped(SOURCE.length), 0);
            return () => window.clearTimeout(done);
        }
        let position = 0;
        const timer = window.setInterval(() => {
            position = Math.min(SOURCE.length, position + 3);
            setTyped(position);
            if (position >= SOURCE.length) window.clearInterval(timer);
        }, 22);
        return () => window.clearInterval(timer);
    }, []);

    // Subtle 3D tilt that follows the pointer (desktop only).
    useEffect(() => {
        const container = containerRef.current;
        const card = tiltRef.current;
        if (!container || !card || window.matchMedia("(pointer: coarse), (prefers-reduced-motion: reduce)").matches) return;
        let frame = 0;
        const onMove = (event: PointerEvent) => {
            const rect = container.getBoundingClientRect();
            const x = (event.clientX - rect.left) / rect.width - 0.5;
            const y = (event.clientY - rect.top) / rect.height - 0.5;
            cancelAnimationFrame(frame);
            frame = requestAnimationFrame(() => {
                card.style.transform = `perspective(1400px) rotateY(${x * 7}deg) rotateX(${-y * 6}deg)`;
            });
        };
        const onLeave = () => {
            cancelAnimationFrame(frame);
            card.style.transform = "perspective(1400px) rotateY(0deg) rotateX(0deg)";
        };
        container.addEventListener("pointermove", onMove);
        container.addEventListener("pointerleave", onLeave);
        return () => {
            cancelAnimationFrame(frame);
            container.removeEventListener("pointermove", onMove);
            container.removeEventListener("pointerleave", onLeave);
        };
    }, []);

    const done = typed >= SOURCE.length;

    return (
        <div ref={containerRef} className="relative" dir="ltr">
            <div className="absolute -inset-6 rounded-[2.5rem] bg-gradient-to-br from-indigo-500/30 via-fuchsia-500/20 to-amber-400/20 blur-3xl" />
            <div ref={tiltRef} className="relative overflow-hidden rounded-3xl border border-white/10 bg-zinc-950 shadow-2xl shadow-indigo-500/20 transition-transform duration-300 ease-out will-change-transform">
                <div className="flex items-center gap-2 border-b border-white/10 bg-zinc-900/80 px-4 py-2.5">
                    <span className="h-3 w-3 rounded-full bg-rose-500/90" />
                    <span className="h-3 w-3 rounded-full bg-amber-400/90" />
                    <span className="h-3 w-3 rounded-full bg-emerald-500/90" />
                    <span className="ms-3 rounded-md bg-white/10 px-2 py-0.5 font-mono text-[11.5px] text-zinc-300">{labels.file}</span>
                    <span className={`ms-auto inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[11px] font-bold transition ${done ? "bg-emerald-500/15 text-emerald-300" : "bg-white/5 text-zinc-400"}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${done ? "bg-emerald-400" : "animate-pulse bg-zinc-400"}`} />{done ? labels.compiled : "C#"}
                    </span>
                </div>
                <pre ref={preRef} className={`scrollbar-thin h-[228px] px-4 py-3 ${done ? "overflow-y-auto" : "overflow-hidden"} font-mono text-[12px] leading-[1.55] sm:text-[12.5px]`} aria-label={labels.file}>
                    <code>{renderUntil(typed)}{!done ? <span className="inline-block h-[1.1em] w-[7px] translate-y-[2px] animate-pulse bg-indigo-400" /> : null}</code>
                </pre>
                <div className="flex items-center gap-2 border-t border-white/10 bg-zinc-900/80 px-4 py-1.5 text-[11px] font-semibold text-zinc-400">
                    <span className="inline-flex h-5 items-center rounded bg-emerald-500 px-1.5 text-[10px] font-black text-emerald-950">▶ {labels.play}</span>
                    <span className="truncate">Hanogt Engine · WebGL</span>
                </div>
                <MiniGame hint={labels.hint} />
            </div>
        </div>
    );
}
