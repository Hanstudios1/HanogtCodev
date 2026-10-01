import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "Hakkımızda",
    description: "Hanogt Codev ve HanStudios hakkında: kod editörü, Hanogt Engine V3, Hanogt AI, Hanogt Social, Arcade, Hanogt News, güncel rakamlar ve yolculuğumuz.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
    return children;
}
