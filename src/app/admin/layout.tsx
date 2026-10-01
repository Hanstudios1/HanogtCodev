import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "Yönetici Paneli",
    // Staff-only tool: keep it out of search engines and link previews.
    robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
};

export default function Layout({ children }: { children: React.ReactNode }) {
    return children;
}
