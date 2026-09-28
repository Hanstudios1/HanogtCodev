import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Compass, Gamepad2, LayoutDashboard } from "lucide-react";

export const metadata: Metadata = {
    title: "Sayfa bulunamadı",
    robots: { index: false },
};

export default function NotFound() {
    return (
        <main id="main-content" className="relative grid min-h-dvh place-items-center overflow-hidden bg-background px-6 text-foreground">
            <div className="pointer-events-none absolute inset-0 bg-grid mask-radial opacity-70" aria-hidden="true" />
            <div className="pointer-events-none absolute left-1/2 top-1/3 h-72 w-72 -translate-x-1/2 rounded-full bg-indigo-500/20 blur-3xl" aria-hidden="true" />
            <div className="relative max-w-lg text-center">
                <p className="text-gradient font-mono text-7xl font-black tracking-tight sm:text-8xl">404</p>
                <h1 className="mt-4 text-2xl font-bold sm:text-3xl">Bu sayfa haritada yok</h1>
                <p className="mt-3 text-zinc-500 dark:text-zinc-400">Aradığınız bağlantı taşınmış, silinmiş ya da hiç var olmamış olabilir.</p>
                <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
                    <Link href="/" className="inline-flex items-center gap-2 rounded-2xl bg-zinc-950 px-5 py-3 text-sm font-semibold text-white transition hover:-translate-y-0.5 dark:bg-white dark:text-zinc-950"><ArrowLeft className="h-4 w-4" />Ana sayfa</Link>
                    <Link href="/dashboard" className="inline-flex items-center gap-2 rounded-2xl border border-zinc-200 px-5 py-3 text-sm font-semibold transition hover:bg-zinc-100 dark:border-zinc-800 dark:hover:bg-zinc-900"><LayoutDashboard className="h-4 w-4" />Panel</Link>
                    <Link href="/game-engine" className="inline-flex items-center gap-2 rounded-2xl border border-zinc-200 px-5 py-3 text-sm font-semibold transition hover:bg-zinc-100 dark:border-zinc-800 dark:hover:bg-zinc-900"><Gamepad2 className="h-4 w-4" />Oyun motoru</Link>
                    <Link href="/arcade" className="inline-flex items-center gap-2 rounded-2xl border border-zinc-200 px-5 py-3 text-sm font-semibold transition hover:bg-zinc-100 dark:border-zinc-800 dark:hover:bg-zinc-900"><Compass className="h-4 w-4" />Arcade</Link>
                </div>
            </div>
        </main>
    );
}
