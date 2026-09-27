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
    languages?: string[];
    plays?: number;
    likes?: number;
    createdAt?: string;
    updatedAt?: string;
    _id?: string;
    _path?: string;
    _updateTime?: string;
};

export const ARCADE_LIST_FIELDS = ["title", "description", "dimension", "thumbnail", "authorName", "authorImage", "templateId", "languages", "plays", "likes", "createdAt", "updatedAt"];
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
        languages: Array.isArray(record.languages) ? record.languages.filter((item) => item === "C#" || item === "C++") : [],
        plays: Number(record.plays || 0),
        likes: Number(record.likes || 0),
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

export function likeDocumentId(gameId: string, email: string) {
    const salt = process.env.RATE_LIMIT_SALT || process.env.NEXTAUTH_SECRET || "hanogt";
    return `${gameId}__${createHash("sha256").update(`${salt}:${email}`).digest("hex").slice(0, 32)}`;
}

export function assertGameId(value: unknown) {
    if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_-]{7,99}$/.test(value)) return null;
    return value;
}
