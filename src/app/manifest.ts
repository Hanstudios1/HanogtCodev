import type { MetadataRoute } from "next";
import { SITE_DESCRIPTION, SITE_NAME } from "@/lib/site";

export default function manifest(): MetadataRoute.Manifest {
    return {
        name: SITE_NAME,
        short_name: "Hanogt",
        description: SITE_DESCRIPTION,
        start_url: "/dashboard",
        display: "standalone",
        background_color: "#07070b",
        theme_color: "#07070b",
        lang: "tr",
        categories: ["developer", "education", "games"],
        // Built by scripts/brand-assets.mjs.
        icons: [
            { src: "/brand/hanogt-app-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
            { src: "/brand/hanogt-app-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
            { src: "/brand/hanogt-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
    };
}
