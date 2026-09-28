import "server-only";

import { createHash } from "node:crypto";
import { commitServerMutations, getServerDocument } from "./firebase-rest";

// ---------------------------------------------------------------------------
// External sources (real data, fetched live and attributed)
// ---------------------------------------------------------------------------

export interface ExternalModel {
    id: string;
    name: string;
    organization: string;
    score: number | null;
    scoreLabel: string | null;
    detail: string | null;
    url: string | null;
    released: string | null;
}

export interface ExternalBoard {
    id: "artificial-analysis" | "openrouter-new" | "custom";
    title: string;
    description: string;
    sourceName: string;
    sourceUrl: string;
    fetchedAt: string;
    models: ExternalModel[];
}

const boardCache = new Map<string, { at: number; board: ExternalBoard | null }>();
const BOARD_TTL_MS = 30 * 60_000;

async function fetchJson(url: string, headers: Record<string, string> = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8_000);
    try {
        const response = await fetch(url, { signal: controller.signal, headers: { Accept: "application/json", "User-Agent": "HanogtNewsBot/1.0", ...headers }, cache: "no-store" });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return await response.json() as unknown;
    } finally {
        clearTimeout(timer);
    }
}

function text(value: unknown, max = 120) {
    return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

async function cached(id: string, loader: () => Promise<ExternalBoard | null>) {
    const hit = boardCache.get(id);
    if (hit && Date.now() - hit.at < BOARD_TTL_MS) return hit.board;
    let board: ExternalBoard | null = null;
    try {
        board = await loader();
    } catch {
        board = hit?.board ?? null;
    }
    boardCache.set(id, { at: Date.now(), board });
    return board;
}

/** Newest models on OpenRouter (public endpoint, no key). */
async function openRouterBoard(): Promise<ExternalBoard | null> {
    const payload = await fetchJson("https://openrouter.ai/api/v1/models") as { data?: Array<Record<string, unknown>> };
    const models = (payload.data ?? [])
        .filter((model) => typeof model.id === "string" && typeof model.created === "number")
        .sort((a, b) => Number(b.created) - Number(a.created))
        .slice(0, 15)
        .map((model) => {
            const id = text(model.id, 120);
            const pricing = (model.pricing ?? {}) as Record<string, unknown>;
            const prompt = Number(pricing.prompt);
            const context = Number(model.context_length);
            return {
                id,
                name: text(model.name, 80) || id,
                organization: id.split("/")[0] || "",
                score: null,
                scoreLabel: null,
                detail: [
                    Number.isFinite(context) && context > 0 ? `${Math.round(context / 1000)}K bağlam` : "",
                    Number.isFinite(prompt) ? (prompt === 0 ? "ücretsiz" : `$${(prompt * 1_000_000).toFixed(2)}/1M giriş`) : "",
                ].filter(Boolean).join(" · ") || null,
                url: `https://openrouter.ai/${id}`,
                released: new Date(Number(model.created) * 1000).toISOString(),
            };
        });
    if (!models.length) return null;
    return {
        id: "openrouter-new",
        title: "En yeni modeller",
        description: "OpenRouter kataloğuna en son eklenen yapay zeka modelleri.",
        sourceName: "OpenRouter",
        sourceUrl: "https://openrouter.ai/models",
        fetchedAt: new Date().toISOString(),
        models,
    };
}

/** Artificial Analysis Intelligence Index (requires ARTIFICIAL_ANALYSIS_API_KEY). */
async function artificialAnalysisBoard(): Promise<ExternalBoard | null> {
    const key = process.env.ARTIFICIAL_ANALYSIS_API_KEY;
    if (!key) return null;
    const payload = await fetchJson("https://artificialanalysis.ai/api/v2/data/llms/models", { "x-api-key": key }) as { data?: Array<Record<string, unknown>> };
    const models = (payload.data ?? [])
        .map((model) => {
            const evaluations = (model.evaluations ?? {}) as Record<string, unknown>;
            const creator = (model.model_creator ?? {}) as Record<string, unknown>;
            const score = Number(evaluations.artificial_analysis_intelligence_index);
            return {
                id: text(model.slug ?? model.id, 100),
                name: text(model.name, 80),
                organization: text(creator.name, 60),
                score: Number.isFinite(score) ? Math.round(score * 10) / 10 : null,
                scoreLabel: "Zekâ endeksi",
                detail: null,
                url: typeof model.slug === "string" ? `https://artificialanalysis.ai/models/${encodeURIComponent(model.slug)}` : null,
                released: typeof model.release_date === "string" ? model.release_date : null,
            };
        })
        .filter((model) => model.name && model.score !== null)
        .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
        .slice(0, 20);
    if (!models.length) return null;
    return {
        id: "artificial-analysis",
        title: "Zekâ endeksi sıralaması",
        description: "Artificial Analysis Intelligence Index: çoklu benchmark ortalaması (yüksek daha iyi).",
        sourceName: "Artificial Analysis",
        sourceUrl: "https://artificialanalysis.ai/leaderboards/models",
        fetchedAt: new Date().toISOString(),
        models,
    };
}

/** Optional custom leaderboard JSON: [{ name, organization, score, url }] (AI_LEADERBOARD_JSON_URL). */
async function customBoard(): Promise<ExternalBoard | null> {
    const url = process.env.AI_LEADERBOARD_JSON_URL;
    if (!url || !url.startsWith("https://")) return null;
    const payload = await fetchJson(url);
    const rows = Array.isArray(payload) ? payload : Array.isArray((payload as { models?: unknown[] }).models) ? (payload as { models: unknown[] }).models : [];
    const models = rows.slice(0, 25).map((row, index) => {
        const item = (row ?? {}) as Record<string, unknown>;
        const score = Number(item.score);
        return {
            id: text(item.id ?? item.name, 100) || String(index),
            name: text(item.name, 80),
            organization: text(item.organization ?? item.org, 60),
            score: Number.isFinite(score) ? score : null,
            scoreLabel: text(item.scoreLabel, 30) || "Puan",
            detail: text(item.detail, 80) || null,
            url: typeof item.url === "string" && item.url.startsWith("https://") ? item.url : null,
            released: null,
        };
    }).filter((model) => model.name);
    if (!models.length) return null;
    return {
        id: "custom",
        title: text((payload as { title?: unknown }).title, 60) || "Benchmark sıralaması",
        description: text((payload as { description?: unknown }).description, 200) || "Yönetici tarafından yapılandırılmış benchmark kaynağı.",
        sourceName: text((payload as { source?: unknown }).source, 60) || new URL(url).hostname,
        sourceUrl: url,
        fetchedAt: new Date().toISOString(),
        models,
    };
}

export async function getExternalBoards(): Promise<ExternalBoard[]> {
    const boards = await Promise.all([
        cached("artificial-analysis", artificialAnalysisBoard),
        cached("custom", customBoard),
        cached("openrouter-new", openRouterBoard),
    ]);
    return boards.filter((board): board is ExternalBoard => Boolean(board));
}

// ---------------------------------------------------------------------------
// Community arena (Elo from Hanogt users' votes)
// ---------------------------------------------------------------------------

export const ARENA_CATEGORIES = [
    { id: "code", tr: "Kod yazma", en: "Coding" },
    { id: "chat", tr: "Genel sohbet", en: "General chat" },
    { id: "creative", tr: "Yaratıcı yazı", en: "Creative writing" },
    { id: "turkish", tr: "Türkçe", en: "Turkish" },
] as const;

export type ArenaCategory = (typeof ARENA_CATEGORIES)[number]["id"];

/** Assistant families (no version numbers or scores are invented here; ratings come only from votes). */
export const ARENA_MODELS = [
    { id: "chatgpt", name: "ChatGPT", organization: "OpenAI" },
    { id: "claude", name: "Claude", organization: "Anthropic" },
    { id: "gemini", name: "Gemini", organization: "Google" },
    { id: "grok", name: "Grok", organization: "xAI" },
    { id: "llama", name: "Llama", organization: "Meta" },
    { id: "deepseek", name: "DeepSeek", organization: "DeepSeek" },
    { id: "qwen", name: "Qwen", organization: "Alibaba" },
    { id: "mistral", name: "Mistral / Le Chat", organization: "Mistral AI" },
    { id: "copilot", name: "Microsoft Copilot", organization: "Microsoft" },
    { id: "perplexity", name: "Perplexity", organization: "Perplexity" },
    { id: "kimi", name: "Kimi", organization: "Moonshot AI" },
] as const;

export type ArenaModelId = (typeof ARENA_MODELS)[number]["id"];

type ArenaStats = {
    ratings?: Record<string, { rating: number; wins: number; losses: number; ties: number }>;
    votes?: number;
    updatedAt?: string;
    _updateTime?: string;
};

const BASE_RATING = 1000;
const K_FACTOR = 24;

export function isArenaCategory(value: unknown): value is ArenaCategory {
    return typeof value === "string" && ARENA_CATEGORIES.some((category) => category.id === value);
}

export function isArenaModel(value: unknown): value is ArenaModelId {
    return typeof value === "string" && ARENA_MODELS.some((model) => model.id === value);
}

export async function getArenaStandings(category: ArenaCategory) {
    const stats = await getServerDocument<ArenaStats>(`arena_stats/${category}`).catch(() => null);
    const ratings = stats?.ratings ?? {};
    const standings = ARENA_MODELS.map((model) => {
        const entry = ratings[model.id];
        const games = entry ? entry.wins + entry.losses + entry.ties : 0;
        return {
            ...model,
            rating: Math.round(entry?.rating ?? BASE_RATING),
            wins: entry?.wins ?? 0,
            losses: entry?.losses ?? 0,
            ties: entry?.ties ?? 0,
            games,
            winRate: games ? Math.round(((entry!.wins + entry!.ties / 2) / games) * 100) : null,
        };
    }).sort((a, b) => b.rating - a.rating || b.games - a.games);
    return { category, standings, votes: Number(stats?.votes || 0), updatedAt: stats?.updatedAt ?? null };
}

function expected(a: number, b: number) {
    return 1 / (1 + 10 ** ((b - a) / 400));
}

/** Salted pseudonym stored with arena votes instead of the e-mail. */
export function voterHash(email: string) {
    const salt = process.env.RATE_LIMIT_SALT || process.env.NEXTAUTH_SECRET || "hanogt";
    return createHash("sha256").update(`${salt}:${email}`).digest("hex").slice(0, 24);
}

export async function recordArenaVote(email: string, category: ArenaCategory, a: ArenaModelId, b: ArenaModelId, result: "a" | "b" | "tie") {
    const day = new Date().toISOString().slice(0, 10);
    const pair = [a, b].sort().join(":");
    const voter = voterHash(email);
    const voteId = createHash("sha256").update(`${voter}:${category}:${pair}:${day}`).digest("hex").slice(0, 40);

    for (let attempt = 0; attempt < 4; attempt += 1) {
        const stats = await getServerDocument<ArenaStats>(`arena_stats/${category}`);
        const ratings = { ...(stats?.ratings ?? {}) };
        const ra = ratings[a] ?? { rating: BASE_RATING, wins: 0, losses: 0, ties: 0 };
        const rb = ratings[b] ?? { rating: BASE_RATING, wins: 0, losses: 0, ties: 0 };
        const scoreA = result === "a" ? 1 : result === "b" ? 0 : 0.5;
        const ea = expected(ra.rating, rb.rating);
        const nextA = { ...ra, rating: ra.rating + K_FACTOR * (scoreA - ea), wins: ra.wins + (result === "a" ? 1 : 0), losses: ra.losses + (result === "b" ? 1 : 0), ties: ra.ties + (result === "tie" ? 1 : 0) };
        const nextB = { ...rb, rating: rb.rating + K_FACTOR * ((1 - scoreA) - (1 - ea)), wins: rb.wins + (result === "b" ? 1 : 0), losses: rb.losses + (result === "a" ? 1 : 0), ties: rb.ties + (result === "tie" ? 1 : 0) };
        ratings[a] = { ...nextA, rating: Math.round(nextA.rating * 100) / 100 };
        ratings[b] = { ...nextB, rating: Math.round(nextB.rating * 100) / 100 };
        const now = new Date().toISOString();
        try {
            await commitServerMutations([
                { type: "create", path: `arena_votes/${voteId}`, data: { voter, category, a, b, result, day, createdAt: now } },
                stats
                    ? { type: "update", path: `arena_stats/${category}`, data: { ratings, votes: Number(stats.votes || 0) + 1, updatedAt: now }, updateFields: ["ratings", "votes", "updatedAt"], updateTime: stats._updateTime }
                    : { type: "create", path: `arena_stats/${category}`, data: { ratings, votes: 1, updatedAt: now } },
            ]);
            return { ok: true as const };
        } catch (error) {
            const status = Number((error as { status?: number }).status);
            // 409 = the vote document already exists (already voted today) or a concurrent update.
            const alreadyVoted = await getServerDocument(`arena_votes/${voteId}`).catch(() => null);
            if (alreadyVoted) return { ok: false as const, reason: "already-voted" as const };
            if (status !== 409 && status !== 400 && status !== 412) throw error;
        }
    }
    return { ok: false as const, reason: "busy" as const };
}
