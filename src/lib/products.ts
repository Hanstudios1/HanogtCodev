import type { Copy } from "@/lib/i18n";

/**
 * Hanogt's products and their logos. The logo files live in public/brand
 * (<logo>-<size>.{png,webp}, sizes 64–512) and are built from the owner's
 * drawings in brand/source by scripts/brand-assets.mjs; the main mark has a
 * light and a dark variant.
 */

export type ProductId = "ai" | "engine" | "security" | "news" | "social";
export type LogoId = ProductId | "hanogt";

export type Product = {
    id: ProductId;
    /** Brand name: never translated. */
    name: string;
    href: string;
    tagline: Copy;
};

export const PRODUCTS: Record<ProductId, Product> = {
    ai: { id: "ai", name: "Hanogt AI", href: "/ai", tagline: { TR: "Kod, oyun ve güvenlik için yapay zekâ asistanı", EN: "AI assistant for code, games and security" } },
    engine: { id: "engine", name: "Hanogt Engine", href: "/game-engine", tagline: { TR: "Tarayıcıda C# ve C++ ile 2D ve 3D oyunlar", EN: "2D and 3D games in C# and C++, in the browser" } },
    security: { id: "security", name: "Hanogt Security", href: "/security", tagline: { TR: "Hesabını, kodunu ve bağlantılarını koru", EN: "Protect your account, your code and your links" } },
    news: { id: "news", name: "Hanogt News", href: "/news", tagline: { TR: "Teknoloji, oyun ve piyasa haberleri", EN: "Tech, gaming and market news" } },
    social: { id: "social", name: "Hanogt Social", href: "/social", tagline: { TR: "Arkadaşlar, mesajlar, gruplar ve aramalar", EN: "Friends, messages, groups and calls" } },
};

export const BRAND_ASSET_SIZES = [64, 128, 256, 512] as const;

/** The smallest generated size that stays sharp at `size` CSS pixels on a 2× screen. */
export function brandAssetSize(size: number) {
    return BRAND_ASSET_SIZES.find((candidate) => candidate >= size * 2) ?? BRAND_ASSET_SIZES[BRAND_ASSET_SIZES.length - 1];
}

/** URL of a logo at `size` CSS pixels; the main mark needs the background it sits on. */
export function logoSrc(id: LogoId, size: number, on: "light" | "dark" = "light") {
    const stem = id === "hanogt" ? `hanogt-${on}` : id;
    return `/brand/${stem}-${brandAssetSize(size)}.webp`;
}
