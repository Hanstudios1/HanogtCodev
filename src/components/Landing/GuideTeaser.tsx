"use client";

import "@fontsource/pixelify-sans/400.css";
import "@fontsource/pixelify-sans/600.css";
import { BookOpen } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useI18n } from "@/lib/i18n";

/** A closed Minecraft-style "Book and Quill" that opens on hover/tap and links to /guide. */
export default function GuideTeaser() {
    const { tx } = useI18n();
    const [open, setOpen] = useState(false);
    return (
        <section className="relative overflow-hidden py-24">
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(16,185,129,0.12),transparent_65%)]" />
            <div className="relative mx-auto grid max-w-6xl grid-cols-1 items-center gap-14 px-4 sm:px-6 lg:grid-cols-2">
                <div>
                    <span className="inline-flex items-center gap-2 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-3 py-1 text-[12px] font-bold text-emerald-700 dark:text-emerald-300">
                        <BookOpen className="h-3.5 w-3.5" />{tx({ TR: "Nasıl kullanılır?", EN: "How does it work?" })}
                    </span>
                    <h2 className="mt-4 text-4xl font-black tracking-tight text-zinc-900 sm:text-5xl dark:text-white">
                        {tx({ TR: "Kılavuz artık bir", EN: "The guide is now a" })} <span className="bg-gradient-to-r from-emerald-500 to-lime-400 bg-clip-text text-transparent">{tx({ TR: "Minecraft kitabı", EN: "Minecraft book" })}</span>
                    </h2>
                    <p className="mt-4 max-w-xl text-[16px] leading-relaxed text-zinc-600 dark:text-zinc-400">
                        {tx({
                            TR: "Hesap açmaktan oyun yayınlamaya, Hanogt News'in haberleri nasıl topladığından yapay zeka arenasına kadar her şey; sayfa sayfa çevrilen, bölümlere ayrılmış piksel bir kitapta anlatılıyor.",
                            EN: "From creating an account to publishing a game, from how Hanogt News collects stories to the AI arena, everything is explained in a pixel book you flip page by page.",
                        })}
                    </p>
                    <div className="mt-6 flex flex-wrap gap-3">
                        <Link href="/guide" className="inline-flex h-12 items-center gap-2 rounded-xl border-b-4 border-emerald-800 bg-emerald-600 px-5 text-[15px] font-bold text-white shadow-lg shadow-emerald-600/25 transition hover:-translate-y-0.5 hover:bg-emerald-500 active:translate-y-0.5 active:border-b-2" style={{ fontFamily: "'Pixelify Sans', var(--font-sans)" }}>
                            📖 {tx({ TR: "Kitabı aç", EN: "Open the book" })}
                        </Link>
                        <Link href="/guide#news" className="inline-flex h-12 items-center gap-2 rounded-xl border border-zinc-200 bg-white px-5 text-[14px] font-semibold text-zinc-700 transition hover:-translate-y-0.5 dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-200">
                            📰 {tx({ TR: "Haberler nasıl çalışır?", EN: "How news works" })}
                        </Link>
                    </div>
                </div>

                <button
                    type="button"
                    onClick={() => setOpen((value) => !value)}
                    onMouseEnter={() => setOpen(true)}
                    onMouseLeave={() => setOpen(false)}
                    className="group relative mx-auto h-[360px] w-[280px] cursor-pointer [perspective:1600px] sm:h-[400px] sm:w-[310px]"
                    aria-label={tx({ TR: "Kılavuz kitabını önizle", EN: "Preview the guide book" })}
                >
                    {/* First page (visible when the cover opens) */}
                    <div className="absolute inset-0 rounded-e-lg border-4 border-[#6b4a2b] bg-[#f4e9c8] p-6 text-start shadow-2xl" style={{ fontFamily: "'Pixelify Sans', monospace", imageRendering: "pixelated" }}>
                        <p className="text-[11px] text-[#7a6a4f]">{tx({ TR: "Sayfa 1 / 24", EN: "Page 1 of 24" })}</p>
                        <p className="mt-3 text-[20px] font-semibold leading-tight text-[#3b2a1a]">{tx({ TR: "Hoş geldin, maceracı!", EN: "Welcome, adventurer!" })}</p>
                        <p className="mt-3 text-[15px] leading-snug text-[#3b2a1a]">
                            {tx({
                                TR: "Bu kitap Hanogt Codev dünyasının haritasıdır. Kod yaz, oyun inşa et, haberleri takip et. Her bölüm bir görevdir.",
                                EN: "This book maps the world of Hanogt Codev. Write code, build games, follow the news. Every chapter is a quest.",
                            })}
                        </p>
                        <p className="mt-4 text-[15px] text-[#1f6b3a]">▶ {tx({ TR: "1. Bölüm: Hesap aç", EN: "Chapter 1: Sign up" })}</p>
                        <p className="text-[15px] text-[#1f6b3a]">▶ {tx({ TR: "5. Bölüm: Hanogt News", EN: "Chapter 5: Hanogt News" })}</p>
                        <p className="absolute bottom-5 end-6 text-[22px]">🪶</p>
                    </div>
                    {/* Cover */}
                    <div
                        className="absolute inset-0 origin-left rounded-e-lg transition-transform duration-[900ms] ease-[cubic-bezier(0.22,1,0.36,1)] [backface-visibility:hidden] [transform-style:preserve-3d]"
                        style={{ transform: open ? "rotateY(-155deg)" : "rotateY(0deg)" }}
                    >
                        <div className="absolute inset-0 overflow-hidden rounded-e-lg border-4 border-[#3d2512] bg-[#7b4a26] shadow-[inset_-10px_0_0_rgba(0,0,0,0.25),0_30px_60px_-15px_rgba(0,0,0,0.5)]">
                            <div className="absolute inset-0 opacity-40" style={{ backgroundImage: "repeating-linear-gradient(0deg, rgba(0,0,0,0.12) 0 8px, transparent 8px 16px), repeating-linear-gradient(90deg, rgba(255,255,255,0.05) 0 8px, transparent 8px 16px)" }} />
                            <div className="absolute inset-y-0 start-0 w-5 bg-[#4a2c14]" />
                            <div className="relative flex h-full flex-col items-center justify-center gap-4 px-8 text-center" style={{ fontFamily: "'Pixelify Sans', monospace" }}>
                                <span className="grid h-20 w-20 place-items-center border-4 border-[#2b1a0c] bg-[#5e3a1c] text-5xl shadow-[4px_4px_0_#2b1a0c] transition-transform duration-500 group-hover:scale-110">📘</span>
                                <p className="text-[26px] font-semibold leading-tight text-[#f7e7b4] drop-shadow-[2px_2px_0_#2b1a0c]">Hanogt<br />{tx({ TR: "Kılavuzu", EN: "Guide" })}</p>
                                <p className="text-[13px] text-[#e8cf8f]">{tx({ TR: "Dokun ve aç", EN: "Tap to open" })}</p>
                            </div>
                        </div>
                    </div>
                </button>
            </div>
        </section>
    );
}
