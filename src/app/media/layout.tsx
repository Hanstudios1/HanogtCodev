import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "Hanogt Media",
    description: "Topluluğun paylaştığı kod projelerini keşfet, indir, beğen ve yorum yap.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
    return children;
}
