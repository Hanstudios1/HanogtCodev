import type { Metadata } from "next";
import EngineDocs from "@/components/GameEngine/docs/EngineDocs";

export const metadata: Metadata = {
    title: "Hanogt Engine V6 Belgeleri",
    description: "Hanogt Engine V6 kullanım kılavuzu: editör, bileşenler, C# ve C++ ile script yazma, katmanlar ve çarpışma tablosu, nesne havuzları, parçacıklar, tilemap ve kural karoları, dokunmatik kontroller, animasyon ve animasyon olayları, prefab bağlantıları, hata ayıklama, yayınlama ve API referansı.",
};

export default function EngineDocsPage() {
    return <EngineDocs />;
}
