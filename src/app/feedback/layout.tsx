import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "Geri Bildirim ve SSS",
    description: "Hanogt Codev için destek talebi açın (şikâyet, istek, güvenlik açığı, ban kaldırma, soru, geri bildirim), yanıtları takip edin ve sık sorulan soruları okuyun.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
    return children;
}
