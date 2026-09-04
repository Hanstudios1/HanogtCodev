import { Suspense } from "react";
import { Gamepad2, LoaderCircle } from "lucide-react";
import { GameEngineShell } from "@/components/GameEngine";

export default function GameEnginePage() {
    return (
        <Suspense fallback={<EngineLoading />}>
            <GameEngineShell />
        </Suspense>
    );
}

function EngineLoading() {
    return (
        <main className="grid h-dvh min-h-[560px] place-items-center bg-zinc-950 text-white">
            <div className="text-center">
                <div className="relative mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br from-blue-600 to-violet-600 shadow-2xl shadow-blue-600/25">
                    <Gamepad2 className="h-7 w-7" />
                    <LoaderCircle className="absolute -bottom-2 -right-2 h-6 w-6 animate-spin rounded-full bg-zinc-950 p-1 text-blue-400" />
                </div>
                <h1 className="mt-5 text-sm font-black tracking-wide">Hanogt Engine</h1>
                <p className="mt-1 text-xs text-zinc-500">Oyun geliştirme alanı yükleniyor…</p>
            </div>
        </main>
    );
}
