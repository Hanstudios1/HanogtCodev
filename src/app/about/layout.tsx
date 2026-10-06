import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "Hakkımızda",
    description: "Hanogt Codev ve HanStudios hakkında: kod editörü, Hanogt Engine V5, Arcade, Hanogt Social, Hanogt AI, Media, News ve güvenlik yaklaşımı; canlı topluluk rakamlarıyla.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
    return children;
}
