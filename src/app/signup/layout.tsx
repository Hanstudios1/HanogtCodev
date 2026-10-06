import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "Kayıt Ol",
    description: "Ücretsiz Hanogt Codev hesabı oluştur: kod editörü, Hanogt Engine V5, Hanogt Social, Hanogt AI ve Media tek hesapta.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
    return children;
}
