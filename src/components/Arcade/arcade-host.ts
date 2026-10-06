/**
 * The Arcade page's side of leaderboards and achievements (V5): what a game
 * reports through Leaderboard.Submit and Achievements.Unlock goes to the
 * server for signed-in players (with the play token of /session), or stays
 * on this device for guests. Scores wait until the board's minimum play time
 * has passed, and only a player's new bests are ever sent.
 */
import { isBetterScore, roundScore } from "@/lib/game-engine/arcade";
import type { ArcadePanel, ArcadeServices, ArcadeState } from "@/lib/game-engine/runtime/arcade-runtime";
import type { ArcadeAchievement, ArcadeLeaderboard, ArcadeSettings } from "@/lib/game-engine/types";

export type ArcadeHostEvent =
    /** A new personal best: saved on the leaderboard, or kept on this device (guests, sharing off). */
    | { kind: "best"; board: ArcadeLeaderboard; score: number; saved: boolean }
    | { kind: "achievement"; achievement: ArcadeAchievement }
    /** A score or unlock the server refused or couldn't take (message in Turkish from the server, or a code). */
    | { kind: "error"; code: string; message: string | null }
    | { kind: "show"; panel: ArcadePanel; boardId: string | null }
    /** What the player has (after the session started, a save or an unlock). */
    | { kind: "state"; state: ArcadeState };

type Storage = Pick<globalThis.Storage, "getItem" | "setItem">;

/** Leaving this off keeps scores on this device only. */
export const SHARE_SCORES_KEY = "hanogt-arcade:share-scores";
/** Extra wait after the minimum play time (clock differences between here and the server). */
const SEND_MARGIN_MS = 800;

function storage(): Storage | null {
    try {
        return typeof window !== "undefined" ? window.localStorage : null;
    } catch {
        return null;
    }
}

export function readShareScores(): boolean {
    try {
        return storage()?.getItem(SHARE_SCORES_KEY) !== "0";
    } catch {
        return true;
    }
}

export function writeShareScores(share: boolean) {
    try {
        storage()?.setItem(SHARE_SCORES_KEY, share ? "1" : "0");
    } catch {
        // Private mode: the choice lasts for this page.
    }
}

export class ArcadeHost implements ArcadeServices {
    private token: string | null = null;
    /** When this page received the token (its own clock). */
    private startedAt = 0;
    private starting: Promise<void> | null = null;
    private readonly pending = new Map<string, { board: ArcadeLeaderboard; score: number }>();
    private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
    private readonly best: Record<string, number> = {};
    private readonly unlocked = new Set<string>();
    private disposed = false;

    constructor(
        private readonly gameId: string,
        private readonly settings: ArcadeSettings,
        private readonly listener: (event: ArcadeHostEvent) => void,
        private signedIn: boolean,
        private share: boolean,
    ) {
        if (!signedIn) this.mergeState(this.readLocal());
    }

    get online() {
        return this.signedIn && this.share;
    }

    get state(): ArcadeState {
        return { best: { ...this.best }, unlocked: [...this.unlocked] };
    }

    setShare(share: boolean) {
        this.share = share;
        writeShareScores(share);
        if (share) for (const board of this.pending.keys()) this.schedule(board);
    }

    /** Signed in later on the same page (the session callback). */
    setSignedIn(signedIn: boolean) {
        this.signedIn = signedIn;
    }

    /** What a signed-in player already has, shown before Play (no play token yet). */
    async loadProgress() {
        if (!this.signedIn) return;
        try {
            const response = await fetch(`/api/arcade/${encodeURIComponent(this.gameId)}/session`, { credentials: "same-origin", cache: "no-store" });
            if (!response.ok) return;
            const payload = await response.json() as { best?: Record<string, number>; unlocked?: string[] };
            this.mergeState({ best: payload.best ?? {}, unlocked: payload.unlocked ?? [] });
        } catch {
            // Shown after Play instead.
        }
    }

    /** The player removed their own entry: the next score on that board is sent again. */
    forgetBest(boardId: string) {
        delete this.best[boardId];
        this.pending.delete(boardId);
        this.emit({ kind: "state", state: this.state });
    }

    /**
     * Starts the play session for a signed-in player (the first Play; a
     * restart keeps it). Resolves with what the player already has.
     */
    begin(): Promise<void> {
        if (!this.signedIn) return Promise.resolve();
        if (!this.starting) {
            this.starting = this.requestSession().catch((error: unknown) => {
                this.starting = null;
                this.emit({ kind: "error", code: "session", message: error instanceof Error ? error.message : null });
            });
        }
        return this.starting;
    }

    private async requestSession() {
        const response = await fetch(`/api/arcade/${encodeURIComponent(this.gameId)}/session`, { method: "POST", credentials: "same-origin" });
        const payload = await response.json().catch(() => ({})) as { token?: string; best?: Record<string, number>; unlocked?: string[]; error?: string; code?: string };
        if (response.status === 401) {
            // The session ended: play on as a guest.
            this.signedIn = false;
            return;
        }
        if (!response.ok || !payload.token) throw new Error(payload.error || "");
        this.token = payload.token;
        this.startedAt = Date.now();
        this.mergeState({ best: payload.best ?? {}, unlocked: payload.unlocked ?? [] });
        // Unlocks reached before the session was ready.
        for (const id of [...this.unlocked]) if (!(payload.unlocked ?? []).includes(id)) void this.sendUnlock(id);
        for (const board of this.pending.keys()) this.schedule(board);
    }

    private emit(event: ArcadeHostEvent) {
        if (!this.disposed) this.listener(event);
    }

    private mergeState(state: Partial<ArcadeState>) {
        for (const [id, score] of Object.entries(state.best ?? {})) {
            const board = this.settings.leaderboards.find((item) => item.id === id);
            if (board && Number.isFinite(score) && isBetterScore(board.order, score, this.best[id])) this.best[id] = roundScore(score);
        }
        for (const id of state.unlocked ?? []) if (this.settings.achievements.some((item) => item.id === id)) this.unlocked.add(id);
        this.emit({ kind: "state", state: this.state });
    }

    // -----------------------------------------------------------------
    // Guests: this device
    // -----------------------------------------------------------------

    private localKey() {
        return `hanogt-arcade:progress:${this.gameId}`;
    }

    private readLocal(): Partial<ArcadeState> {
        try {
            const parsed = JSON.parse(storage()?.getItem(this.localKey()) || "{}") as Partial<ArcadeState>;
            return { best: parsed.best && typeof parsed.best === "object" ? parsed.best : {}, unlocked: Array.isArray(parsed.unlocked) ? parsed.unlocked.map(String) : [] };
        } catch {
            return {};
        }
    }

    private writeLocal() {
        try {
            storage()?.setItem(this.localKey(), JSON.stringify(this.state));
        } catch {
            // Storage full or blocked: progress lasts for this page.
        }
    }

    // -----------------------------------------------------------------
    // ArcadeServices
    // -----------------------------------------------------------------

    /** Keeps `entry` as the board's pending score unless a better one is already waiting. */
    private keepPending(boardId: string, entry: { board: ArcadeLeaderboard; score: number }) {
        const waiting = this.pending.get(boardId);
        if (!waiting || isBetterScore(entry.board.order, entry.score, waiting.score)) this.pending.set(boardId, entry);
    }

    submitScore(board: ArcadeLeaderboard, score: number) {
        if (!isBetterScore(board.order, score, this.best[board.id])) return;
        const waiting = this.pending.get(board.id);
        if (waiting && !isBetterScore(board.order, score, waiting.score)) return;
        if (!this.online) {
            this.best[board.id] = score;
            if (!this.signedIn) this.writeLocal();
            this.emit({ kind: "best", board, score, saved: false });
            this.emit({ kind: "state", state: this.state });
            return;
        }
        this.pending.set(board.id, { board, score });
        this.schedule(board.id);
    }

    unlockAchievement(achievement: ArcadeAchievement) {
        if (this.unlocked.has(achievement.id)) return;
        this.unlocked.add(achievement.id);
        this.emit({ kind: "achievement", achievement });
        this.emit({ kind: "state", state: this.state });
        if (!this.signedIn) this.writeLocal();
        else if (this.token) void this.sendUnlock(achievement.id);
        else void this.begin();
    }

    show(panel: ArcadePanel, boardId: string | null) {
        this.emit({ kind: "show", panel, boardId });
    }

    // -----------------------------------------------------------------
    // Sending
    // -----------------------------------------------------------------

    /** Sends a board's pending best once the token is there and the minimum play time has passed. */
    private schedule(boardId: string) {
        if (this.disposed || this.timers.has(boardId)) return;
        const entry = this.pending.get(boardId);
        if (!entry || !this.online) return;
        if (!this.token) {
            void this.begin();
            return;
        }
        const wait = Math.max(0, this.startedAt + entry.board.minPlaySeconds * 1000 + SEND_MARGIN_MS - Date.now());
        this.timers.set(boardId, setTimeout(() => {
            this.timers.delete(boardId);
            void this.sendScore(boardId);
        }, wait));
    }

    private async sendScore(boardId: string) {
        const entry = this.pending.get(boardId);
        if (!entry || !this.token || this.disposed) return;
        this.pending.delete(boardId);
        try {
            const response = await fetch(`/api/arcade/${encodeURIComponent(this.gameId)}/scores`, {
                method: "POST",
                credentials: "same-origin",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ token: this.token, board: boardId, score: entry.score }),
            });
            const payload = await response.json().catch(() => ({})) as { improved?: boolean; best?: number; error?: string; code?: string; retryAfterSeconds?: number };
            if (response.ok) {
                if (typeof payload.best === "number") this.mergeState({ best: { [boardId]: payload.best } });
                if (payload.improved) this.emit({ kind: "best", board: entry.board, score: entry.score, saved: true });
                return;
            }
            // Too early or too many: try again with the latest best when allowed.
            if ((payload.code === "too_early" || response.status === 429) && payload.retryAfterSeconds) {
                this.keepPending(boardId, entry);
                clearTimeout(this.timers.get(boardId));
                this.timers.set(boardId, setTimeout(() => {
                    this.timers.delete(boardId);
                    void this.sendScore(boardId);
                }, Math.min(60, payload.retryAfterSeconds) * 1000 + SEND_MARGIN_MS));
                return;
            }
            if (payload.code === "session_expired") {
                this.token = null;
                this.starting = null;
                this.keepPending(boardId, entry);
                void this.begin();
                return;
            }
            this.emit({ kind: "error", code: payload.code || "score", message: payload.error ?? null });
        } catch {
            this.emit({ kind: "error", code: "network", message: null });
        }
    }

    private async sendUnlock(id: string) {
        if (!this.token) return;
        try {
            const response = await fetch(`/api/arcade/${encodeURIComponent(this.gameId)}/achievements`, {
                method: "POST",
                credentials: "same-origin",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ token: this.token, id }),
            });
            if (!response.ok) {
                const payload = await response.json().catch(() => ({})) as { error?: string; code?: string };
                this.emit({ kind: "error", code: payload.code || "achievement", message: payload.error ?? null });
            }
        } catch {
            this.emit({ kind: "error", code: "network", message: null });
        }
    }

    dispose() {
        this.disposed = true;
        for (const timer of this.timers.values()) clearTimeout(timer);
        this.timers.clear();
    }
}
