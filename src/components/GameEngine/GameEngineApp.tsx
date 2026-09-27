"use client";

import { AlertTriangle, ArrowLeft, Gamepad2, LoaderCircle, RefreshCw } from "lucide-react";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import type { GameProjectDocument } from "@/lib/game-engine/types";
import EngineHub from "./EngineHub";
import { loadCloudProject, loadLocalProject, type ProjectSource } from "./editor/persistence";

const EngineEditor = dynamic(() => import("./editor/EngineEditor"), { ssr: false, loading: () => <EngineLoading /> });

export function EngineLoading({ label = "Hanogt Engine yükleniyor…" }: { label?: string }) {
    return (
        <main className="grid h-dvh min-h-[480px] place-items-center bg-zinc-950 text-white">
            <div className="text-center">
                <div className="relative mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br from-indigo-500 to-fuchsia-500 shadow-2xl shadow-indigo-500/30">
                    <Gamepad2 className="h-7 w-7" />
                    <LoaderCircle className="absolute -bottom-2 -right-2 h-6 w-6 animate-spin rounded-full bg-zinc-950 p-1 text-indigo-300" />
                </div>
                <h1 className="mt-5 text-sm font-black tracking-wide">Hanogt Engine</h1>
                <p className="mt-1 text-xs text-zinc-500">{label}</p>
            </div>
        </main>
    );
}

type Loaded = { project: GameProjectDocument; source: ProjectSource; revision: string | null; arcadeId: string | null };

export default function GameEngineApp() {
    const router = useRouter();
    const params = useSearchParams();
    const { status } = useSession();
    const projectId = params.get("project") ?? params.get("id");
    const requestedSource: ProjectSource = params.get("source") === "local" ? "local" : "cloud";
    const [loaded, setLoaded] = useState<Loaded | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [attempt, setAttempt] = useState(0);

    useEffect(() => {
        if (!projectId) return;
        if (requestedSource === "cloud" && status === "loading") return;
        let cancelled = false;
        const load = async () => {
            setError(null);
            try {
                if (requestedSource === "local") {
                    const project = await loadLocalProject(projectId);
                    if (!project) throw new Error("Bu proje bu tarayıcıda bulunamadı. Başka bir cihazda veya tarayıcıda oluşturulmuş olabilir.");
                    if (!cancelled) setLoaded({ project, source: "local", revision: null, arcadeId: null });
                    return;
                }
                if (status !== "authenticated") throw new Error("Bulut projelerini açmak için giriş yapmalısınız.");
                const result = await loadCloudProject(projectId);
                if (!cancelled) setLoaded({ project: result.project, source: "cloud", revision: result.revision, arcadeId: result.arcadeId });
            } catch (reason) {
                if (!cancelled) setError(reason instanceof Error ? reason.message : "Proje yüklenemedi.");
            }
        };
        void load();
        return () => {
            cancelled = true;
        };
    }, [projectId, requestedSource, status, attempt]);

    const open = (id: string, source: ProjectSource) => {
        setLoaded(null);
        router.push(`/game-engine?project=${encodeURIComponent(id)}&source=${source}`);
    };

    if (!projectId) return <EngineHub onOpen={open} />;

    if (error) {
        return (
            <main className="grid min-h-dvh place-items-center bg-zinc-950 p-6 text-white">
                <div className="max-w-md text-center">
                    <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-red-500/15 text-red-300"><AlertTriangle className="h-6 w-6" /></div>
                    <h1 className="mt-4 text-lg font-bold">Proje açılamadı</h1>
                    <p className="mt-2 text-sm leading-relaxed text-zinc-400">{error}</p>
                    <div className="mt-6 flex justify-center gap-2">
                        <button type="button" onClick={() => router.push("/game-engine")} className="inline-flex h-10 items-center gap-2 rounded-xl border border-white/10 px-4 text-sm font-semibold hover:bg-white/5"><ArrowLeft className="h-4 w-4" />Projeler</button>
                        {status !== "authenticated" && requestedSource === "cloud" ? (
                            <button type="button" onClick={() => router.push(`/login?callbackUrl=${encodeURIComponent(`/game-engine?project=${projectId}&source=cloud`)}`)} className="inline-flex h-10 items-center gap-2 rounded-xl bg-indigo-500 px-4 text-sm font-semibold hover:bg-indigo-400">Giriş yap</button>
                        ) : (
                            <button type="button" onClick={() => setAttempt((value) => value + 1)} className="inline-flex h-10 items-center gap-2 rounded-xl bg-indigo-500 px-4 text-sm font-semibold hover:bg-indigo-400"><RefreshCw className="h-4 w-4" />Tekrar dene</button>
                        )}
                    </div>
                </div>
            </main>
        );
    }

    if (!loaded || loaded.project.id !== projectId) return <EngineLoading label="Proje yükleniyor…" />;

    return (
        <EngineEditor
            key={`${loaded.source}:${loaded.project.id}`}
            initialProject={loaded.project}
            source={loaded.source}
            initialRevision={loaded.revision}
            initialArcadeId={loaded.arcadeId}
            onExit={() => {
                setLoaded(null);
                router.push("/game-engine");
            }}
        />
    );
}
