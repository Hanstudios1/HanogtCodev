import type { Metadata } from "next";
import EngineDocs from "@/components/GameEngine/docs/EngineDocs";

export const metadata: Metadata = {
    title: "Hanogt Engine Belgeleri",
    description: "Hanogt Engine kullanım kılavuzu: editör, bileşenler, C# ve C++ ile script yazma, fizik, girdi, prefab, sahneler, yayınlama ve API referansı.",
};

export default function EngineDocsPage() {
    return <EngineDocs />;
}
