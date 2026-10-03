import "server-only";

import type { UserRole } from "@/components/Admin/types";
import { normalizeEmail } from "./validate";

/*
 * Who is an owner and which staff role an account has, without the admin
 * session code (Next.js imports): the admin panel, the plan badge written
 * after a payment and the tests share it. See ./admin for the role model.
 */

/**
 * The site founder. Always an owner, also on deployments where ADMIN_EMAILS
 * was never set (the Admin Panel used to stay hidden there).
 */
export const BUILT_IN_OWNER_EMAILS: readonly string[] = ["oguzhanguluzade21@gmail.com"];

let ownerCache: { raw: string; emails: ReadonlySet<string> } | null = null;

/** Built-in owners plus ADMIN_EMAILS, lower-cased (parsed once per value). */
export function getOwnerEmails(): ReadonlySet<string> {
    const raw = process.env.ADMIN_EMAILS ?? "";
    if (!ownerCache || ownerCache.raw !== raw) {
        const emails = raw
            .split(/[\s,;]+/)
            .map((entry) => normalizeEmail(entry.replace(/^["']+|["']+$/g, "")))
            .filter(Boolean);
        ownerCache = { raw, emails: new Set([...BUILT_IN_OWNER_EMAILS, ...emails]) };
    }
    return ownerCache.emails;
}

export function isOwnerEmail(email: string) {
    return getOwnerEmails().has(email.trim().toLowerCase());
}

/** The staff role stored in Firestore; anything unexpected counts as none. */
export function parseStoredRole(value: unknown): "admin" | "moderator" | null {
    return value === "admin" || value === "moderator" ? value : null;
}

export function resolveUserRole(email: string, storedRole: unknown): UserRole {
    if (isOwnerEmail(email)) return "owner";
    return parseStoredRole(storedRole) ?? "user";
}
