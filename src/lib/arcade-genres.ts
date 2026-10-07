import type { Copy } from "@/lib/i18n";

/**
 * Arcade game genres: one per game, chosen when publishing and changeable by
 * the author. Games published before genres existed count as "other".
 * Shared by the Arcade routes, the gallery's filter and the publish dialog.
 */
export const ARCADE_GENRES = ["action", "platformer", "puzzle", "racing", "shooter", "adventure", "arcade", "strategy", "sports", "other"] as const;
export type ArcadeGenre = (typeof ARCADE_GENRES)[number];
export const DEFAULT_ARCADE_GENRE: ArcadeGenre = "other";

export function isArcadeGenre(value: unknown): value is ArcadeGenre {
    return typeof value === "string" && (ARCADE_GENRES as readonly string[]).includes(value);
}

/** A stored or requested genre; anything unknown is "other". */
export function normalizeArcadeGenre(value: unknown): ArcadeGenre {
    return isArcadeGenre(value) ? value : DEFAULT_ARCADE_GENRE;
}

export const ARCADE_GENRE_LABELS: Record<ArcadeGenre, Copy> = {
    action: { TR: "Aksiyon", EN: "Action" },
    platformer: { TR: "Platform", EN: "Platformer" },
    puzzle: { TR: "Bulmaca", EN: "Puzzle" },
    racing: { TR: "Yarış", EN: "Racing" },
    shooter: { TR: "Nişancı", EN: "Shooter" },
    adventure: { TR: "Macera", EN: "Adventure" },
    arcade: { TR: "Atari", EN: "Arcade" },
    strategy: { TR: "Strateji", EN: "Strategy" },
    sports: { TR: "Spor", EN: "Sports" },
    other: { TR: "Diğer", EN: "Other" },
};
