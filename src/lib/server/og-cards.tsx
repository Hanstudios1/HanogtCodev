import "server-only";

import { ImageResponse } from "next/og";
import type { ReactElement, ReactNode } from "react";
import { ogCount, ogImageSource, ogText } from "@/lib/og-text";

/*
 * Share cards (Open Graph images, 1200×630) of Arcade games and Media posts:
 * drawn on request from the stored title, creator and labels with the
 * renderer's bundled font, never stored. Flat colours on the site's dark
 * neutral, one accent per product. Every element with more than one child is
 * a flex box (the renderer requires it).
 */

export const OG_SIZE = { width: 1200, height: 630 };
/** Cards change rarely; shared links are fetched by many crawlers at once. */
const CACHE = "public, max-age=600, s-maxage=3600, stale-while-revalidate=86400";

const COLORS = { background: "#09090b", panel: "#18181b", border: "#27272a", text: "#fafafa", muted: "#a1a1aa", arcade: "#6366f1", arcadeSoft: "#a5b4fc", media: "#2563eb", mediaSoft: "#93c5fd", star: "#f59e0b" };

type Product = "arcade" | "media";

function Brand({ product }: { product: Product }) {
    const accent = product === "arcade" ? COLORS.arcade : COLORS.media;
    return (
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{ display: "flex", width: 48, height: 48, borderRadius: 14, background: accent, alignItems: "center", justifyContent: "center", fontSize: 28, color: "#ffffff" }}>H</div>
            <div style={{ display: "flex", fontSize: 30, color: COLORS.text }}>
                <span>Hanogt</span>
                <span style={{ marginLeft: 10, color: product === "arcade" ? COLORS.arcadeSoft : COLORS.mediaSoft }}>{product === "arcade" ? "Arcade" : "Media"}</span>
            </div>
        </div>
    );
}

function Chip({ children, tone = "plain" }: { children: ReactNode; tone?: "plain" | Product }) {
    const background = tone === "arcade" ? "#312e81" : tone === "media" ? "#1e3a8a" : COLORS.panel;
    const color = tone === "arcade" ? "#e0e7ff" : tone === "media" ? "#dbeafe" : "#e4e4e7";
    return <div style={{ display: "flex", alignItems: "center", padding: "8px 18px", borderRadius: 999, background, color, fontSize: 24, border: `1px solid ${tone === "plain" ? COLORS.border : background}` }}>{children}</div>;
}

function StarIcon() {
    return (
        <svg width="26" height="26" viewBox="0 0 24 24">
            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" fill={COLORS.star} />
        </svg>
    );
}

function Stat({ icon, children }: { icon: "play" | "heart" | "download"; children: ReactNode }) {
    const path = icon === "play"
        ? "M7 4.5v15l12.5-7.5z"
        : icon === "heart"
            ? "M12 21s-7.5-4.6-9.6-9.2C.9 8.3 3.1 4.5 6.9 4.5c2.1 0 3.6 1.2 5.1 3 1.5-1.8 3-3 5.1-3 3.8 0 6 3.8 4.5 7.3C19.5 16.4 12 21 12 21z"
            : "M12 3v12m0 0l-5-5m5 5l5-5M4 20h16";
    return (
        <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 26, color: COLORS.muted }}>
            <svg width="26" height="26" viewBox="0 0 24 24">
                {icon === "download"
                    ? <path d={path} stroke={COLORS.muted} strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                    : <path d={path} fill={COLORS.muted} />}
            </svg>
            <span>{children}</span>
        </div>
    );
}

function Frame({ product, children }: { product: Product; children: ReactNode }) {
    return (
        <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: COLORS.background, color: COLORS.text, padding: "52px 60px", borderTop: `10px solid ${product === "arcade" ? COLORS.arcade : COLORS.media}` }}>
            <Brand product={product} />
            {children}
        </div>
    );
}

function image(element: ReactElement) {
    return new ImageResponse(element, { ...OG_SIZE, headers: { "Cache-Control": CACHE } });
}

export type ArcadeCardInput = {
    title: unknown;
    author: unknown;
    genre: string;
    dimension: "2d" | "3d";
    languages: string[];
    thumbnail: unknown;
    rating: { average: number; count: number } | null;
    plays: number;
};

/** An Arcade game: title, creator, genre, 2D/3D and languages, the cover when it has one, rating and plays. */
export function arcadeCard(input: ArcadeCardInput) {
    const title = ogText(input.title, 70) || "Hanogt Arcade";
    const author = ogText(input.author, 40);
    const cover = ogImageSource(input.thumbnail);
    return image(
        <Frame product="arcade">
            <div style={{ display: "flex", flex: 1, alignItems: "center", gap: 48, marginTop: 28 }}>
                <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", fontSize: title.length > 40 ? 54 : 66, lineHeight: 1.12, color: COLORS.text }}>{title}</div>
                    {author ? <div style={{ display: "flex", marginTop: 22, fontSize: 30, color: COLORS.muted }}>{author}</div> : null}
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 30 }}>
                        <Chip tone="arcade">{ogText(input.genre, 24)}</Chip>
                        <Chip>{input.dimension.toUpperCase()}</Chip>
                        {input.languages.slice(0, 2).map((language) => <Chip key={language}>{ogText(language, 8)}</Chip>)}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 32, marginTop: 30 }}>
                        {input.rating ? (
                            <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 28, color: COLORS.text }}>
                                <StarIcon />
                                <span>{input.rating.average.toFixed(1)}</span>
                                <span style={{ color: COLORS.muted }}>({ogCount(input.rating.count)})</span>
                            </div>
                        ) : null}
                        <Stat icon="play">{ogCount(input.plays)}</Stat>
                    </div>
                </div>
                <div style={{ display: "flex", width: 480, height: 270, borderRadius: 24, overflow: "hidden", background: COLORS.panel, border: `2px solid ${COLORS.border}`, alignItems: "center", justifyContent: "center" }}>
                    {cover
                        // eslint-disable-next-line @next/next/no-img-element
                        ? <img src={cover} alt="" width={480} height={270} style={{ width: 480, height: 270, objectFit: "cover" }} />
                        : <div style={{ display: "flex", fontSize: 96, color: COLORS.arcadeSoft }}>{input.dimension.toUpperCase()}</div>}
                </div>
            </div>
        </Frame>,
    );
}

export type MediaCardInput = {
    title: unknown;
    description: unknown;
    author: unknown;
    languages: string[];
    tags: string[];
    likes: number;
    downloads: number;
};

/** A Media post: title, a line of its description, the author, languages and tags, likes and downloads. */
export function mediaCard(input: MediaCardInput) {
    const title = ogText(input.title, 80) || "Hanogt Media";
    const description = ogText(input.description, 140);
    const author = ogText(input.author, 40);
    return image(
        <Frame product="media">
            <div style={{ display: "flex", flexDirection: "column", flex: 1, justifyContent: "center", marginTop: 20 }}>
                <div style={{ display: "flex", fontSize: title.length > 44 ? 56 : 68, lineHeight: 1.12, color: COLORS.text }}>{title}</div>
                {description ? <div style={{ display: "flex", marginTop: 20, fontSize: 28, lineHeight: 1.35, color: COLORS.muted }}>{description}</div> : null}
                <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 28 }}>
                    {input.languages.slice(0, 3).map((language) => <Chip key={language} tone="media">{ogText(language, 24)}</Chip>)}
                    {input.tags.slice(0, 3).map((tag) => <Chip key={tag}>{`#${ogText(tag, 24)}`}</Chip>)}
                </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 24, paddingTop: 22, borderTop: `1px solid ${COLORS.border}` }}>
                <div style={{ display: "flex", fontSize: 28, color: COLORS.text }}>{author}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 32 }}>
                    <Stat icon="heart">{ogCount(input.likes)}</Stat>
                    <Stat icon="download">{ogCount(input.downloads)}</Stat>
                </div>
            </div>
        </Frame>,
    );
}

/** The card of something that doesn't exist (any more): the product's name and what it is. */
export function fallbackCard(product: Product) {
    return image(
        <Frame product={product}>
            <div style={{ display: "flex", flexDirection: "column", flex: 1, justifyContent: "center" }}>
                <div style={{ display: "flex", fontSize: 72, color: COLORS.text }}>{product === "arcade" ? "Hanogt Arcade" : "Hanogt Media"}</div>
                <div style={{ display: "flex", marginTop: 20, fontSize: 32, color: COLORS.muted }}>{product === "arcade" ? "Tarayıcıda anında oynanan topluluk oyunları" : "Topluluğun paylaştığı kod projeleri"}</div>
            </div>
        </Frame>,
    );
}
