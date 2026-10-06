import "server-only";

import { createHash } from "node:crypto";

/**
 * Pseudonymous, per-group member key used for reactions, typing state and
 * voice channels, so those documents never store the e-mail addresses of
 * the people who reacted or typed.
 */
export function memberKey(groupId: string, email: string) {
    const salt = process.env.RATE_LIMIT_SALT || process.env.NEXTAUTH_SECRET || "hanogt";
    return `k${createHash("sha256").update(`${salt}:group-member:${groupId}:${email}`).digest("hex").slice(0, 20)}`;
}
