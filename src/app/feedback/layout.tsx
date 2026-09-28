import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "Geri Bildirim ve SSS",
    description: "Hanogt Codev için soru sorun, geri bildirim paylaşın ve sık sorulan soruları okuyun.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
    return children;
}
