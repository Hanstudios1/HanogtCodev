import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "Planlar",
    description: "Hanogt Codev planları yakında: Ücretsiz, Plus ve Pro. Şu anda ödeme alınmıyor; açıldığında haber almak için kaydol.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
    return children;
}
