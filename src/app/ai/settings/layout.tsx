import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "Hanogt AI ayarları",
    description: "Hanogt AI'ın seni nasıl yanıtlayacağı, yeni sohbetlerin varsayılanları, sohbet geçmişi, kullanım ve erken erişim.",
    alternates: { canonical: "/ai/settings" },
    robots: { index: false, follow: false },
};

export default function AiSettingsLayout({ children }: { children: React.ReactNode }) {
    return children;
}
