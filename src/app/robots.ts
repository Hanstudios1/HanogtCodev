import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
    return {
        rules: [{
            userAgent: "*",
            allow: ["/", "/arcade", "/media", "/game-engine", "/game-engine/docs", "/about"],
            disallow: ["/api/", "/dashboard", "/editor", "/account-settings", "/settings", "/messages/", "/friends", "/groups/", "/login", "/signup"],
        }],
        sitemap: `${SITE_URL}/sitemap.xml`,
    };
}
