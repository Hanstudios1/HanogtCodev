import "server-only";

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * Encryption at rest for secrets people give us, such as the API keys of
 * their Hanogt AI connections. AES-256-GCM with a random 12-byte IV; the
 * associated data binds a ciphertext to its owner and purpose, so a sealed
 * value copied to another record (or account) no longer opens.
 *
 * Output: "v1.<iv>.<tag>.<ciphertext>" (base64url). The key is the SHA-256 of
 * a domain-separated server secret: AI_KEYS_ENCRYPTION_KEY, otherwise
 * TOTP_ENCRYPTION_KEY, otherwise NEXTAUTH_SECRET / AUTH_SECRET. Without any
 * of them nothing can be sealed. Changing the secret makes stored values
 * unreadable (people then add their connections again).
 */

const VERSION = "v1";
const IV_BYTES = 12;
const TAG_BYTES = 16;
const SECRET_VARIABLES = ["AI_KEYS_ENCRYPTION_KEY", "TOTP_ENCRYPTION_KEY", "NEXTAUTH_SECRET", "AUTH_SECRET"] as const;

export type SecretBoxErrorCode = "not_configured" | "malformed" | "unsupported_version" | "decrypt_failed";
export type SecretBoxError = Error & { code: SecretBoxErrorCode };

const MESSAGES: Record<SecretBoxErrorCode, string> = {
    not_configured: "Şifreleme anahtarı yapılandırılmamış.",
    malformed: "Şifreli değer bozuk.",
    unsupported_version: "Şifreli değerin sürümü desteklenmiyor.",
    decrypt_failed: "Şifreli değer açılamadı.",
};

/** Messages never contain the secret, the plaintext or the associated data. */
function secretBoxError(code: SecretBoxErrorCode): SecretBoxError {
    const error = new Error(MESSAGES[code]) as SecretBoxError;
    error.code = code;
    return error;
}

export function isSecretBoxError(error: unknown, code?: SecretBoxErrorCode): error is SecretBoxError {
    return error instanceof Error && typeof (error as SecretBoxError).code === "string" && (code === undefined || (error as SecretBoxError).code === code);
}

function secretMaterial(): string | null {
    for (const name of SECRET_VARIABLES) {
        const value = process.env[name]?.trim();
        if (value) return value;
    }
    return null;
}

/** True when a server secret is set, so values can be sealed. */
export function isSecretBoxConfigured() {
    return secretMaterial() !== null;
}

function encryptionKey() {
    const material = secretMaterial();
    if (!material) throw secretBoxError("not_configured");
    // Domain-separated from every other use of the same secret (e.g. 2FA's "hanogt-totp:").
    return createHash("sha256").update(`hanogt-ai-keys:${VERSION}:${material}`).digest();
}

export function sealSecret(plaintext: string, associatedData: string): string {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv, { authTagLength: TAG_BYTES });
    cipher.setAAD(Buffer.from(associatedData, "utf8"));
    const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    return [VERSION, iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), ciphertext.toString("base64url")].join(".");
}

/** Throws a SecretBoxError for a tampered, foreign (other associated data or secret) or malformed value. */
export function openSecret(sealed: string, associatedData: string): string {
    const parts = typeof sealed === "string" ? sealed.split(".") : [];
    if (parts.length !== 4) throw secretBoxError("malformed");
    const [version, ivText, tagText, ciphertextText] = parts;
    if (version !== VERSION) throw secretBoxError("unsupported_version");
    const iv = Buffer.from(ivText, "base64url");
    const tag = Buffer.from(tagText, "base64url");
    const ciphertext = Buffer.from(ciphertextText, "base64url");
    if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) throw secretBoxError("malformed");
    const key = encryptionKey();
    try {
        const decipher = createDecipheriv("aes-256-gcm", key, iv, { authTagLength: TAG_BYTES });
        decipher.setAAD(Buffer.from(associatedData, "utf8"));
        decipher.setAuthTag(tag);
        return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
    } catch {
        throw secretBoxError("decrypt_failed");
    }
}

/** Associated data of a Hanogt AI connection's API key: its owner and connection id. */
export function aiKeyAssociatedData(email: string, connectionId: string) {
    return `ai-key:v1:${email}:${connectionId}`;
}
