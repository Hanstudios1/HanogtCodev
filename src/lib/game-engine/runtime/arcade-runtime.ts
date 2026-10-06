/**
 * Leaderboards and achievements while a game runs (V5). The runtime keeps the
 * player's best score per board and the unlocked achievements; the host (the
 * Arcade page) gets new bests and unlocks through ArcadeServices and stores
 * them for signed-in players. One runtime is shared by every world of a
 * player, so a restart keeps what was reached.
 */
import { isBetterScore, roundScore } from "../arcade";
import type { ArcadeAchievement, ArcadeLeaderboard, ArcadeSettings } from "../types";

export type ArcadePanel = "leaderboard" | "achievements";

/** What the host does with scores and unlocks (none in the editor and in exported games). */
export interface ArcadeServices {
    /** Scores and unlocks are stored (the Arcade with a signed-in player). */
    readonly online: boolean;
    /** A new best of the player on a board; the host sends it once the board's rules allow. */
    submitScore(board: ArcadeLeaderboard, score: number): void;
    unlockAchievement(achievement: ArcadeAchievement): void;
    /** Opens the host's leaderboard (boardId null: the first board) or achievements panel. */
    show(panel: ArcadePanel, boardId: string | null): void;
}

/** What the host already knows about the player (the server's bests and unlocks). */
export interface ArcadeState {
    best: Record<string, number>;
    unlocked: string[];
}

const key = (id: string) => id.trim().toLowerCase();

export class ArcadeRuntime {
    readonly boards: readonly ArcadeLeaderboard[];
    readonly achievements: readonly ArcadeAchievement[];
    services: ArcadeServices | null;
    private readonly best = new Map<string, number>();
    private readonly unlocked = new Set<string>();

    constructor(settings: ArcadeSettings | undefined, services: ArcadeServices | null = null, state: Partial<ArcadeState> | null = null) {
        this.boards = settings?.leaderboards ?? [];
        this.achievements = settings?.achievements ?? [];
        this.services = services;
        if (state) this.merge(state);
    }

    board(id: string): ArcadeLeaderboard | null {
        const wanted = key(id);
        return this.boards.find((board) => board.id === wanted) ?? null;
    }

    achievement(id: string): ArcadeAchievement | null {
        const wanted = key(id);
        return this.achievements.find((achievement) => achievement.id === wanted) ?? null;
    }

    bestOf(id: string): number | null {
        return this.best.get(key(id)) ?? null;
    }

    isUnlocked(id: string) {
        return this.unlocked.has(key(id));
    }

    get unlockedCount() {
        return this.achievements.filter((achievement) => this.unlocked.has(achievement.id)).length;
    }

    get online() {
        return Boolean(this.services?.online);
    }

    /** Adds what the host learned (bests only improve; unlocks only add). */
    merge(state: Partial<ArcadeState>) {
        for (const [id, score] of Object.entries(state.best ?? {})) {
            const board = this.board(id);
            if (board && Number.isFinite(score) && isBetterScore(board.order, score, this.best.get(board.id))) this.best.set(board.id, roundScore(score));
        }
        for (const id of state.unlocked ?? []) {
            const achievement = this.achievement(String(id));
            if (achievement) this.unlocked.add(achievement.id);
        }
    }

    /** The player took their entry off a board: the next score counts as a new best again. */
    forgetBest(id: string) {
        this.best.delete(key(id));
    }

    /** Records a score in range; true when it is the player's new best (the host then gets it). */
    submit(board: ArcadeLeaderboard, score: number): boolean {
        const value = roundScore(score);
        if (!isBetterScore(board.order, value, this.best.get(board.id))) return false;
        this.best.set(board.id, value);
        this.services?.submitScore(board, value);
        return true;
    }

    /** True when the achievement was locked until now (the host then gets it). */
    unlock(achievement: ArcadeAchievement): boolean {
        if (this.unlocked.has(achievement.id)) return false;
        this.unlocked.add(achievement.id);
        this.services?.unlockAchievement(achievement);
        return true;
    }

    snapshot(): ArcadeState {
        return { best: Object.fromEntries(this.best), unlocked: [...this.unlocked] };
    }
}
