import "server-only";

import { createHash } from "node:crypto";
import { normalizeProject } from "@/lib/game-engine/schema";
import type { GameProjectDocument } from "@/lib/game-engine/types";

export type ArcadeRecord = {
    ownerEmail?: string;
    projectId?: string;
    title?: string;
    description?: string;
    dimension?: "2d" | "3d";
    thumbnail?: string | null;
    authorName?: string;
    authorImage?: string | null;
    game?: string;
    templateId?: string | null;
    /** Major Hanogt Engine version the game was published with (missing before V3). */
    engineVersion?: number;
    languages?: string[];
    plays?: number;
    likes?: number;
    /** The author lets others copy the game with Remix (off unless they turn it on). */
    allowRemix?: boolean;
    /** Set when the game was made from someone else's remix; shown as attribution. */
    remixOf?: unknown;
    createdAt?: string;
    updatedAt?: string;
    _id?: string;
    _path?: string;
    _updateTime?: string;
};

export const ARCADE_LIST_FIELDS = ["title", "description", "dimension", "thumbnail", "authorName", "authorImage", "templateId", "engineVersion", "languages", "plays", "likes", "allowRemix", "remixOf", "createdAt", "updatedAt"];

export type RemixSource = { gameId: string; title: string; authorName: string };

/** Attribution of a remix as stored on game projects and Arcade games; anything malformed is dropped. */
export function remixSourceOf(value: unknown): RemixSource | null {
    if (!value || typeof value !== "object") return null;
    const source = value as Record<string, unknown>;
    const gameId = assertGameId(source.gameId);
    if (!gameId) return null;
    const title = typeof source.title === "string" ? source.title.slice(0, 80) : "";
    const authorName = typeof source.authorName === "string" ? source.authorName.slice(0, 40) : "";
    return { gameId, title: title || "Adsız oyun", authorName: authorName || "Hanogt geliştiricisi" };
}

export const MAX_ARCADE_GAME_BYTES = 900 * 1024;

export function arcadeSummary(record: ArcadeRecord, id: string) {
    return {
        id,
        title: record.title || "Adsız oyun",
        description: record.description || "",
        dimension: record.dimension === "2d" ? "2d" : "3d",
        thumbnail: typeof record.thumbnail === "string" ? record.thumbnail : null,
        authorName: record.authorName || "Hanogt geliştiricisi",
        authorImage: typeof record.authorImage === "string" && /^https:\/\//.test(record.authorImage) ? record.authorImage : null,
        templateId: record.templateId ?? null,
        engineVersion: typeof record.engineVersion === "number" && Number.isFinite(record.engineVersion) ? Math.trunc(record.engineVersion) : null,
        languages: Array.isArray(record.languages) ? record.languages.filter((item) => item === "C#" || item === "C++") : [],
        plays: Number(record.plays || 0),
        likes: Number(record.likes || 0),
        allowRemix: record.allowRemix === true,
        remixOf: remixSourceOf(record.remixOf),
        createdAt: record.createdAt || null,
        updatedAt: record.updatedAt || null,
    };
}

/** Parses and re-validates the stored game before sending it to players. */
export function arcadeProject(record: ArcadeRecord, id: string): GameProjectDocument {
    const parsed = JSON.parse(record.game || "{}") as unknown;
    const project = normalizeProject(parsed, { fallbackId: id });
    project.id = id;
    return project;
}

/** Salted, non-reversible id of a user for like records (the e-mail itself is never stored). */
export function likerHash(email: string) {
    const salt = process.env.RATE_LIMIT_SALT || process.env.NEXTAUTH_SECRET || "hanogt";
    return createHash("sha256").update(`${salt}:${email}`).digest("hex").slice(0, 32);
}

export function likeDocumentId(gameId: string, email: string) {
    return `${gameId}__${likerHash(email)}`;
}

export function assertGameId(value: unknown) {
    if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_-]{7,99}$/.test(value)) return null;
    return value;
}
