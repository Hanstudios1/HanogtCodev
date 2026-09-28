import type { Metadata } from "next";
import ArcadeGallery from "@/components/Arcade/ArcadeGallery";

export const metadata: Metadata = {
    title: "Arcade — Topluluk oyunları",
    description: "Hanogt Engine ile C# ve C++ kullanılarak yapılmış 2D/3D oyunları tarayıcıda anında oyna, beğen ve remiksle.",
};

export default function ArcadePage() {
    return <ArcadeGallery />;
}
