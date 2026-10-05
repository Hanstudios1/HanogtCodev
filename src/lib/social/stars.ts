/**
 * Starred messages of Hanogt Social as the client sees them (the server
 * keeps them in message_stars; src/lib/server/social-stars.ts).
 * Framework-free.
 */

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

/** One person keeps at most this many stars. */
export const STARS_MAX = 200;

/** The key of a star in a set: scope, conversation and message. */
export const starKey = (scope: StarScope, target: string, messageId: string) => `${scope}:${target}:${messageId}`;
