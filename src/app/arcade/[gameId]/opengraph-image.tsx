import { ARCADE_GENRE_LABELS, normalizeArcadeGenre } from "@/lib/arcade-genres";
import { ratingAverage, readRatingTotals } from "@/lib/arcade-ratings";
import { assertGameId, type ArcadeRecord } from "@/lib/server/arcade";
import { getServerDocument } from "@/lib/server/firebase-rest";
import { OG_SIZE, arcadeCard, fallbackCard } from "@/lib/server/og-cards";

export const runtime = "nodejs";
export const alt = "Hanogt Arcade oyunu";
export const size = OG_SIZE;
export const contentType = "image/png";

/** The game's share card, drawn on request from its title, creator, genre and cover (nothing is stored). */
export default async function Image({ params }: { params: Promise<{ gameId: string }> }) {
    const gameId = assertGameId((await params).gameId);
    const record = gameId
        ? await getServerDocument<ArcadeRecord>(`arcade_games/${gameId}`, { fields: ["title", "authorName", "genre", "dimension", "languages", "thumbnail", "ratingCount", "ratingSum", "plays"] }).catch(() => null)
        : null;
    if (!record) return fallbackCard("arcade");
    const totals = readRatingTotals(record);
    const average = ratingAverage(totals);
    return arcadeCard({
        title: record.title,
        author: record.authorName,
        genre: ARCADE_GENRE_LABELS[normalizeArcadeGenre(record.genre)].TR,
        dimension: record.dimension === "2d" ? "2d" : "3d",
        languages: Array.isArray(record.languages) ? record.languages.filter((item): item is string => item === "C#" || item === "C++") : [],
        thumbnail: record.thumbnail,
        rating: average !== null ? { average, count: totals.count } : null,
        plays: Number(record.plays || 0),
    });
}
