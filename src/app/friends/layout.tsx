import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "Arkadaşlar",
    // Signed-in workspace; nothing here is useful to search engines.
    robots: { index: false, follow: false },
};

export default function Layout({ children }: { children: React.ReactNode }) {
    return children;
}
