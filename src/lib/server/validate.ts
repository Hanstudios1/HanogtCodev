import "server-only";

/**
 * Input validation shared by API routes. Every id that ends up inside a
 * Firestore document path must pass one of these checks first: the REST
 * layer joins segments with "/", so an id like "../credentials/x" would
 * otherwise address a different collection.
 */

/** Generic document id: letters, digits, "_" and "-" (randomUUID, createEngineId, Firestore auto ids). */
export function isDocId(value: unknown, maxLength = 128): value is string {
    return typeof value === "string" && value.length > 0 && value.length <= maxLength && /^[A-Za-z0-9_-]+$/.test(value);
}

/** Strict e-mail address as used for user document ids (no "/", no whitespace). */
export const EMAIL_PATTERN = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

export function normalizeEmail(value: unknown): string {
    if (typeof value !== "string") return "";
    const email = value.trim().toLowerCase();
    return email.length <= 254 && EMAIL_PATTERN.test(email) && !email.includes("..") ? email : "";
}

/** Friend request ids are `${fromEmail}_${toEmail}_${timestamp}`. */
export function isFriendRequestId(value: unknown): value is string {
    return typeof value === "string" && value.length > 0 && value.length <= 600 && /^[A-Za-z0-9._%+@-]+$/.test(value) && !value.includes("..");
}

/** Plain text with NUL bytes removed, trimmed and capped. */
export function cleanText(value: unknown, max: number): string {
    return typeof value === "string" ? value.replace(/\0/g, "").trim().slice(0, max) : "";
}

/**
 * Storage object paths written by clients (voice messages) must stay inside the
 * owning container's folder: `<prefix>/<containerId>/<file>`.
 */
export function isOwnedStoragePath(path: unknown, prefix: string, containerId: string): path is string {
    if (typeof path !== "string") return false;
    const parts = path.split("/");
    return parts.length === 3 && parts[0] === prefix && parts[1] === containerId && /^[A-Za-z0-9._-]{1,200}$/.test(parts[2]) && parts[2] !== "." && parts[2] !== "..";
}

/** Parses a JSON request body; returns null for invalid JSON or non-objects. */
export async function readJsonBody<T extends Record<string, unknown> = Record<string, unknown>>(request: Request, maxBytes = 1_000_000): Promise<T | null> {
    const length = Number(request.headers.get("content-length") || 0);
    if (length > maxBytes) return null;
    try {
        const text = await request.text();
        if (text.length > maxBytes) return null;
        const parsed = JSON.parse(text) as unknown;
        return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as T : null;
    } catch {
        return null;
    }
}
