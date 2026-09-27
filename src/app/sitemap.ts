import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

const PUBLIC_ROUTES: Array<{ path: string; priority: number; changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"] }> = [
    { path: "", priority: 1, changeFrequency: "weekly" },
    { path: "/game-engine", priority: 0.9, changeFrequency: "weekly" },
    { path: "/game-engine/docs", priority: 0.8, changeFrequency: "monthly" },
    { path: "/arcade", priority: 0.8, changeFrequency: "daily" },
    { path: "/media", priority: 0.7, changeFrequency: "daily" },
    { path: "/about", priority: 0.5, changeFrequency: "monthly" },
    { path: "/feedback", priority: 0.4, changeFrequency: "monthly" },
    { path: "/privacy-policy", priority: 0.2, changeFrequency: "yearly" },
    { path: "/terms-of-use", priority: 0.2, changeFrequency: "yearly" },
    { path: "/disclosure", priority: 0.2, changeFrequency: "yearly" },
];

export default function sitemap(): MetadataRoute.Sitemap {
    const lastModified = new Date();
    return PUBLIC_ROUTES.map(({ path, priority, changeFrequency }) => ({
        url: `${SITE_URL}${path}`,
        lastModified,
        changeFrequency,
        priority,
    }));
}
