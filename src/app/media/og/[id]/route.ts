import type { NextRequest } from "next/server";
import { cleanMediaTags } from "@/components/Editor/media-publish";
import { languageDisplayName } from "@/lib/runtimes/languages";
import type { MediaPost } from "@/lib/server/media";
import { getServerDocument } from "@/lib/server/firebase-rest";
import { fallbackCard, mediaCard } from "@/lib/server/og-cards";
import { memoryRateLimit } from "@/lib/server/rate-limit";
import { getClientKey } from "@/lib/server/request-security";
import { isDocId } from "@/lib/server/validate";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * The share card of a Media post (/media?post=<id> links point their
 * og:image here), drawn on request and never stored. Outside /api so the
 * crawlers robots.txt lets in can fetch it.
 */
export async function GET(request: NextRequest, context: RouteContext) {
    const { id } = await context.params;
    if (!memoryRateLimit(`og:media:${getClientKey(request)}`, 60, 60_000).allowed) return new Response(null, { status: 429, headers: { "Retry-After": "60" } });
    const post = isDocId(id, 100)
        ? await getServerDocument<MediaPost>(`media_posts/${id}`, { fields: ["title", "description", "status", "showAuthor", "ownerName", "language", "languages", "tags", "likeCount", "downloadCount"] }).catch(() => null)
        : null;
    if (!post || post.status !== "published") return fallbackCard("media");
    const languages = Array.isArray(post.languages) && post.languages.length ? post.languages : [post.language || "plaintext"];
    return mediaCard({
        title: post.title,
        description: post.description,
        author: post.showAuthor ? post.ownerName || "Hanogt geliştiricisi" : "Anonim geliştirici",
        languages: languages.map(languageDisplayName),
        tags: cleanMediaTags(post.tags ?? []),
        likes: Number(post.likeCount || 0),
        downloads: Number(post.downloadCount || 0),
    });
}
