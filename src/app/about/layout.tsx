import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "Hakkımızda",
    description: "Hanogt Codev ve HanStudios hakkında: kod editörü, Hanogt Engine, Arcade, Hanogt News ve güvenlik yaklaşımı.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
    return children;
}
