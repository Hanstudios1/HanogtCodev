import type { Metadata } from "next";
import EngineDocs from "@/components/GameEngine/docs/EngineDocs";

export const metadata: Metadata = {
    title: "Hanogt Engine V4 Belgeleri",
    description: "Hanogt Engine V4 kullanım kılavuzu: editör, bileşenler, C# ve C++ ile script yazma, giriş eylemleri ve gamepad, karakter denetleyici, kamera takibi, eklemler, yol bulma, tilemap, arayüz, ses dosyaları, animasyon, sahneler, yayınlama ve API referansı.",
};

export default function EngineDocsPage() {
    return <EngineDocs />;
}
