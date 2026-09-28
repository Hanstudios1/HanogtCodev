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
        icons: [
            { src: "/logo-dark.png", sizes: "500x500", type: "image/png", purpose: "any" },
            { src: "/logo-dark.png", sizes: "500x500", type: "image/png", purpose: "maskable" },
        ],
    };
}
