import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "Kayıt Ol",
    description: "Ücretsiz Hanogt Codev hesabı oluştur: kod editörü, oyun motoru ve topluluk tek hesapta.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
    return children;
}
