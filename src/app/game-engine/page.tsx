import type { Metadata } from "next";
import { Suspense } from "react";
import { EngineLoading, GameEngineApp } from "@/components/GameEngine";

export const metadata: Metadata = {
    title: "Hanogt Engine V4 — Tarayıcıda 2D/3D Oyun Motoru",
    description: "Unity benzeri, C# ve C++ script destekli, tarayıcıda çalışan 2D/3D oyun motoru. Gamepad, karakter denetleyici, kamera takibi, A* yol bulma, eklemler, ses dosyaları ve müzikle şablondan başla, anında oyna, Arcade'de yayınla.",
};

export default function GameEnginePage() {
    return (
        <Suspense fallback={<EngineLoading />}>
            <GameEngineApp />
        </Suspense>
    );
}
