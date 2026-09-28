import type { Metadata } from "next";
import GuidePage from "@/components/Guide/GuidePage";

export const metadata: Metadata = {
    title: "Kılavuz — Minecraft kitabı tarzında kullanım rehberi",
    description: "Hanogt Codev'i sayfa sayfa çevrilen bir Minecraft kitabında öğren: hesap, kod editörü, Hanogt Engine, Arcade, Hanogt News'in nasıl çalıştığı, güvenlik ve gizlilik.",
    alternates: { canonical: "/guide" },
};

export default function Page() {
    return <GuidePage />;
}
