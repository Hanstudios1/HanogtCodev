import type { Metadata } from "next";
import NewsPage from "@/components/News/NewsPage";
import { getNewsSnapshot } from "@/lib/server/news";

// Pre-rendered and refreshed in the background; the page itself polls /api/news for live updates.
export const revalidate = 180;

export const metadata: Metadata = {
    title: "Hanogt News — Yapay zeka, yazılım ve oyun haberleri",
    description: "Yapay zeka, yazılım, oyun, uygulama ve bilim dünyasından canlı güncellenen haberler; yorumlar, gündem konuları ve topluluk oylarıyla yapay zeka sıralamaları.",
    alternates: { canonical: "/news" },
    openGraph: {
        title: "Hanogt News",
        description: "Canlı teknoloji haberleri ve yapay zeka sıralamaları.",
        type: "website",
    },
};

export default async function Page() {
    const snapshot = await getNewsSnapshot().catch(() => null);
    return <NewsPage initial={snapshot} />;
}
