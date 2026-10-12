import type { Metadata } from "next";
import { Suspense } from "react";
import { EngineLoading, GameEngineApp } from "@/components/GameEngine";

export const metadata: Metadata = {
    title: "Hanogt Engine V6 — Tarayıcıda 2D/3D Oyun Motoru",
    description: "Unity benzeri, C# ve C++ script destekli, tarayıcıda çalışan 2D/3D oyun motoru. Fizik katmanları, nesne havuzları, Parçacıklar V2, kural karoları, sanal joystick, Animator ve prefab'larla şablondan başla, anında oyna, Arcade'de yayınla.",
};

export default function GameEnginePage() {
    return (
        <Suspense fallback={<EngineLoading />}>
            <GameEngineApp />
        </Suspense>
    );
}
