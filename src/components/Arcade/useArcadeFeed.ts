"use client";

import { useCallback, useEffect, useState } from "react";
import type { Copy } from "@/lib/i18n";
import type { ArcadeGameSummary } from "./ArcadeGallery";

export type ArcadeCreatorInfo = { id: string; name: string; avatar: string | null; games: number | null };

type ArcadePage = { games?: ArcadeGameSummary[]; featured?: ArcadeGameSummary[]; creator?: ArcadeCreatorInfo; nextCursor?: string | null; error?: string; code?: string };

/** A failed request: the server's (Turkish) message and its code. */
export type ArcadeFeedError = { message: string; code: string };

class ArcadeFeedFailure extends Error {
    readonly code: string;
    constructor(code: string, message = "") {
        super(message);
        this.name = "ArcadeFeedFailure";
        this.code = code;
    }
}

type Feed = {
    key: string;
    games: ArcadeGameSummary[];
    featured: ArcadeGameSummary[];
    creator: ArcadeCreatorInfo | null;
    nextCursor: string | null;
    error: ArcadeFeedError | null;
};

export const ARCADE_FEED_ERRORS: Record<string, Copy> = {
    rate_limited: { TR: "Çok fazla istek gönderildi. Biraz sonra tekrar deneyin.", EN: "Too many requests. Please try again in a moment." },
    invalid_filter: { TR: "Bu filtre kullanılamıyor.", EN: "This filter can't be used." },
    invalid_cursor: { TR: "Liste değişti; devamını görmek için sayfayı yenileyin.", EN: "The list has changed; reload the page to see more." },
    creator_not_found: { TR: "Bu yapımcının yayında oyunu yok.", EN: "This creator has no published games." },
    unavailable: { TR: "Arcade şu anda yüklenemiyor.", EN: "The Arcade couldn't be loaded right now." },
    network: { TR: "Sunucuya ulaşılamadı. Bağlantınızı kontrol edin.", EN: "Couldn't reach the server. Check your connection." },
};

async function fetchPage(query: string, signal?: AbortSignal): Promise<ArcadePage> {
    let response: Response;
    try {
        response = await fetch(`/api/arcade?${query}`, { signal });
    } catch (error) {
        if (signal?.aborted) throw error;
        throw new ArcadeFeedFailure("network");
    }
    const payload = await response.json().catch(() => ({})) as ArcadePage;
    if (!response.ok) throw new ArcadeFeedFailure(payload.code ?? "unavailable", payload.error ?? "");
    return payload;
}

const asFeedError = (error: unknown): ArcadeFeedError => (error instanceof ArcadeFeedFailure ? { message: error.message, code: error.code } : { message: "", code: "unavailable" });

/** Games that aren't on the list yet (one can move between pages while someone reads). */
function appendGames(current: ArcadeGameSummary[], next: ArcadeGameSummary[]) {
    const seen = new Set(current.map((game) => game.id));
    return [...current, ...next.filter((game) => !seen.has(game.id))];
}

/**
 * A paged Arcade list (/api/arcade with `query`, 24 games a page): the
 * current games, whether the first page for this query is still loading, and
 * "Load more". A changed query starts again from its first page.
 */
export function useArcadeFeed(query: string) {
    const [feed, setFeed] = useState<Feed | null>(null);
    const [loadingMore, setLoadingMore] = useState(false);
    const [moreError, setMoreError] = useState<ArcadeFeedError | null>(null);
    const [attempt, setAttempt] = useState(0);
    const key = `${query}#${attempt}`;

    useEffect(() => {
        const controller = new AbortController();
        fetchPage(query, controller.signal)
            .then((page) => setFeed({ key, games: page.games ?? [], featured: page.featured ?? [], creator: page.creator ?? null, nextCursor: page.nextCursor ?? null, error: null }))
            .catch((error: unknown) => {
                if (controller.signal.aborted) return;
                setFeed({ key, games: [], featured: [], creator: null, nextCursor: null, error: asFeedError(error) });
            });
        return () => controller.abort();
    }, [key, query]);

    const loading = !feed || feed.key !== key;

    const loadMore = useCallback(async () => {
        if (!feed || feed.key !== key || !feed.nextCursor || loadingMore) return;
        const { nextCursor } = feed;
        setLoadingMore(true);
        setMoreError(null);
        try {
            const params = new URLSearchParams(query);
            params.set("cursor", nextCursor);
            const page = await fetchPage(params.toString());
            setFeed((current) => (current && current.key === key ? { ...current, games: appendGames(current.games, page.games ?? []), nextCursor: page.nextCursor ?? null } : current));
        } catch (error) {
            setMoreError(asFeedError(error));
        } finally {
            setLoadingMore(false);
        }
    }, [feed, key, loadingMore, query]);

    const retry = useCallback(() => setAttempt((value) => value + 1), []);

    return {
        games: feed?.games ?? [],
        featured: !loading ? feed?.featured ?? [] : [],
        creator: !loading ? feed?.creator ?? null : null,
        nextCursor: !loading ? feed?.nextCursor ?? null : null,
        error: !loading ? feed?.error ?? null : null,
        loading,
        loadingMore,
        moreError,
        loadMore,
        retry,
    };
}
