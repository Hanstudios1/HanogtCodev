import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "Hanogt AI API ve bağlantılar",
    description: "Hanogt AI'ı kendi uygulamandan OpenAI uyumlu API ile çağır: anahtarlar, kullanım ve belgeler. Kendi sağlayıcı anahtarlarınla bağlantılar.",
    alternates: { canonical: "/ai/api" },
    robots: { index: false, follow: false },
};

export default function AiApiLayout({ children }: { children: React.ReactNode }) {
    return children;
}
