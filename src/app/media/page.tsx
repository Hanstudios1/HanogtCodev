import type { Metadata } from "next";
import MediaGallery from "@/components/Media/MediaGallery";
import { isMediaPostId, mediaPostPath } from "@/components/Editor/media-publish";
import { getServerDocument } from "@/lib/server/firebase-rest";
import type { MediaPost } from "@/lib/server/media";

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/**
 * A shared post link (/media?post=<id>) gets the post's title and
 * description and its share card (/media/og/<id>); the gallery itself keeps
 * the layout's metadata.
 */
export async function generateMetadata({ searchParams }: PageProps): Promise<Metadata> {
    const raw = (await searchParams).post;
    const postId = typeof raw === "string" && isMediaPostId(raw) ? raw : null;
    if (!postId) return {};
    const post = await getServerDocument<MediaPost>(`media_posts/${postId}`, { fields: ["title", "description", "status", "showAuthor", "ownerName"] }).catch(() => null);
    if (!post || post.status !== "published") return {};
    const title = (post.title || "İsimsiz proje").slice(0, 100);
    const author = post.showAuthor ? post.ownerName || "Hanogt geliştiricisi" : "Anonim geliştirici";
    const description = (post.description || `${author} tarafından Hanogt Media'da paylaşılan kod projesi.`).replace(/\s+/g, " ").slice(0, 180);
    const image = { url: `/media/og/${encodeURIComponent(postId)}`, width: 1200, height: 630, alt: title };
    return {
        title: `${title} — Hanogt Media`,
        description,
        alternates: { canonical: mediaPostPath(postId) },
        openGraph: { title, description, url: mediaPostPath(postId), type: "article", images: [image] },
        twitter: { card: "summary_large_image", title, description, images: [image.url] },
    };
}

export default function MediaPage() {
    return <MediaGallery />;
}
