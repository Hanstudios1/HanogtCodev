import type { MediaLicense } from "@/components/Editor/media-publish";
import type { Copy } from "@/lib/i18n";

/** A post as /api/media returns it (see publicMediaPost in src/lib/server/media.ts). */
export type Post = {
    id: string;
    title: string;
    description: string;
    language: string;
    languages: string[];
    tags: string[];
    author: string;
    authorAvatar: string | null;
    showAuthor: boolean;
    fileCount: number;
    createdAt?: string;
    updatedAt?: string;
    likeCount: number;
    commentCount: number;
    downloadCount: number;
    liked: boolean;
    owned: boolean;
    contributedToSecurity: boolean;
    license: string;
};

export type PostFile = { name: string; lang: string; code: string; order: number };
export type PublishableProject = { id: string; name: string; lang: string; fileCount: number; updatedAt: string };
export type PostComment = { id: string; author: string; authorAvatar: string | null; text: string; createdAt?: string; mine: boolean; canDelete: boolean };
export type Detail = { post: Post; files: PostFile[]; comments: PostComment[] };
export type PostFields = { title: string; description: string; tags: string[]; license: MediaLicense; showAuthor: boolean };
export type Translate = (copy: Copy, vars?: Record<string, string | number>) => string;

export type MediaSortOption = "likes" | "newest" | "downloads";
export type MediaFeedPage = { posts?: Post[]; top?: Post[]; nextCursor?: string | null; viewer?: { signedIn?: boolean; securityResearchConsent?: boolean } };

/** A page-level message; inside an open post it is shown in the post's dialog. */
export type Banner = { tone: "error" | "success"; text: string };
