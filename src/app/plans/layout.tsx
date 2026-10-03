import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "Fiyatlandırma",
    description: "Hanogt Codev planları: Ücretsiz, Plus ve Pro. Daha yüksek Hanogt AI sınırları ve destek taleplerinde öncelik; ödemeler Paddle.com üzerinden güvenle alınır.",
    alternates: { canonical: "/plans" },
};

export default function Layout({ children }: { children: React.ReactNode }) {
    return children;
}
