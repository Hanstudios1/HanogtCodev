import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "Hanogt AI",
    description: "Hanogt AI: kod yazma, oyun geliştirme, hata ayıklama ve güvenlik için yapay zeka asistanı. Hanogt bilgi tabanıyla desteklenen dil modeli ve cihazda çalışan eğitilmiş çekirdek.",
    alternates: { canonical: "/ai" },
};

export default function AiLayout({ children }: { children: React.ReactNode }) {
    return children;
}
