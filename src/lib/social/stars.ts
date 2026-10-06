/**
 * Starred messages of Hanogt Social as the client sees them (the server
 * keeps them in message_stars; src/lib/server/social-stars.ts).
 * Framework-free.
 */
import { PLAN_STAR_LIMITS } from "@/lib/plans";

export type StarScope = "dm" | "group";

export type StarredMessage = {
    id: string;
    scope: StarScope;
    /** The partner's address (direct messages) or the group id. */
    target: string;
    messageId: string;
    excerpt: string;
    author: string;
    href: string;
    starredAt: string | null;
    messageAt: string | null;
};

/** The most stars any plan keeps (Pro); a person's own limit is their plan's (PLAN_STAR_LIMITS). */
export const STARS_MAX = PLAN_STAR_LIMITS.pro;

/** The key of a star in a set: scope, conversation and message. */
export const starKey = (scope: StarScope, target: string, messageId: string) => `${scope}:${target}:${messageId}`;
