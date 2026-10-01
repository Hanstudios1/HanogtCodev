import type { Metadata } from "next";
import EngineDocs from "@/components/GameEngine/docs/EngineDocs";

export const metadata: Metadata = {
    title: "Hanogt Engine V3 Belgeleri",
    description: "Hanogt Engine V3 kullanım kılavuzu: editör, bileşenler, C# ve C++ ile script yazma, fizik, tilemap, arayüz, animasyon, tween ve timer, sahneler, yayınlama ve API referansı.",
};

export default function EngineDocsPage() {
    return <EngineDocs />;
}
