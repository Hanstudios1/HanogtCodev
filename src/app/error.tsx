"use client";

import Link from "next/link";
import { useEffect } from "react";
import { Home, RotateCcw, TriangleAlert } from "lucide-react";

export default function RouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
    useEffect(() => {
        console.error(error);
    }, [error]);

    return (
        <main id="main-content" className="grid min-h-dvh place-items-center bg-background px-6 text-foreground">
            <div className="w-full max-w-md rounded-3xl border border-zinc-200 bg-white p-8 text-center shadow-xl dark:border-zinc-800 dark:bg-zinc-900">
                <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-amber-500/10 text-amber-500"><TriangleAlert className="h-7 w-7" /></span>
                <h1 className="mt-5 text-2xl font-bold">Bir şeyler ters gitti</h1>
                <p className="mt-2 text-sm leading-6 text-zinc-500 dark:text-zinc-400">Sayfa beklenmedik bir hatayla karşılaştı. Yaptığınız kayıtlı işler etkilenmez; sayfayı yeniden deneyebilirsiniz.</p>
                {error.digest && <p className="mt-3 font-mono text-[11px] text-zinc-400">Hata kodu: {error.digest}</p>}
                <div className="mt-7 flex flex-col gap-2 sm:flex-row sm:justify-center">
                    <button type="button" onClick={reset} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-indigo-500"><RotateCcw className="h-4 w-4" />Tekrar dene</button>
                    <Link href="/" className="inline-flex items-center justify-center gap-2 rounded-2xl border border-zinc-200 px-5 py-3 text-sm font-semibold transition hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"><Home className="h-4 w-4" />Ana sayfa</Link>
                </div>
            </div>
        </main>
    );
}
