import "server-only";

import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Two-factor authentication with time-based one-time passwords (RFC 6238,
 * HMAC-SHA1, 30 s, 6 digits — what every authenticator app supports).
 * Secrets are encrypted at rest with AES-256-GCM; recovery codes are stored
 * as HMAC-SHA256 digests. Used codes are rejected for their whole time step.
 */

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const STEP_SECONDS = 30;
const DIGITS = 6;
export const ISSUER = "Hanogt Codev";
export const RECOVERY_CODE_COUNT = 10;

function base32Encode(buffer: Buffer) {
    let bits = 0;
    let value = 0;
    let output = "";
    for (const byte of buffer) {
        value = (value << 8) | byte;
        bits += 8;
        while (bits >= 5) {
            output += BASE32[(value >>> (bits - 5)) & 31];
            bits -= 5;
        }
    }
    if (bits > 0) output += BASE32[(value << (5 - bits)) & 31];
    return output;
}

function base32Decode(text: string) {
    const clean = text.toUpperCase().replace(/[^A-Z2-7]/g, "");
    let bits = 0;
    let value = 0;
    const bytes: number[] = [];
    for (const char of clean) {
        value = (value << 5) | BASE32.indexOf(char);
        bits += 5;
        if (bits >= 8) {
            bytes.push((value >>> (bits - 8)) & 255);
            bits -= 8;
        }
    }
    return Buffer.from(bytes);
}

export function generateTotpSecret() {
    return base32Encode(randomBytes(20));
}

function hotp(secret: Buffer, counter: number) {
    const message = Buffer.alloc(8);
    message.writeBigUInt64BE(BigInt(counter));
    const digest = createHmac("sha1", secret).update(message).digest();
    const offset = digest[digest.length - 1] & 0x0f;
    const code = ((digest[offset] & 0x7f) << 24) | (digest[offset + 1] << 16) | (digest[offset + 2] << 8) | digest[offset + 3];
    return String(code % 10 ** DIGITS).padStart(DIGITS, "0");
}

export function currentTotpStep(now = Date.now()) {
    return Math.floor(now / 1000 / STEP_SECONDS);
}

/** Code of a secret at a given step (exported for tests). */
export function totpAt(secretBase32: string, step: number) {
    return hotp(base32Decode(secretBase32), step);
}

/**
 * Verifies a 6-digit code within ±1 step of clock drift. Returns the matched
 * step, or null. Steps at or below `lastUsedStep` are rejected (replay).
 */
export function verifyTotp(secretBase32: string, code: string, lastUsedStep = -1, now = Date.now()): number | null {
    const normalized = code.replace(/\s+/g, "");
    if (!/^\d{6}$/.test(normalized)) return null;
    const secret = base32Decode(secretBase32);
    const step = currentTotpStep(now);
    let matched: number | null = null;
    for (const candidate of [step - 1, step, step + 1]) {
        const expected = Buffer.from(hotp(secret, candidate));
        // Compare every candidate (constant work) and keep the match.
        if (timingSafeEqual(expected, Buffer.from(normalized)) && candidate > lastUsedStep) matched = candidate;
    }
    return matched;
}

export function otpauthUri(email: string, secretBase32: string) {
    const label = encodeURIComponent(`${ISSUER}:${email}`);
    const params = new URLSearchParams({ secret: secretBase32, issuer: ISSUER, algorithm: "SHA1", digits: String(DIGITS), period: String(STEP_SECONDS) });
    return `otpauth://totp/${label}?${params.toString()}`;
}

function encryptionKey() {
    const material = process.env.TOTP_ENCRYPTION_KEY || process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET;
    if (!material) throw new Error("2FA anahtarı yapılandırılmamış.");
    return createHash("sha256").update(`hanogt-totp:${material}`).digest();
}

/** AES-256-GCM: base64url(iv).base64url(tag).base64url(ciphertext) */
export function encryptSecret(secret: string) {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
    const ciphertext = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
    return `${iv.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}.${ciphertext.toString("base64url")}`;
}

export function decryptSecret(sealed: string) {
    const [iv, tag, ciphertext] = sealed.split(".");
    if (!iv || !tag || !ciphertext) throw new Error("Geçersiz 2FA anahtarı.");
    const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(iv, "base64url"));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64url")), decipher.final()]).toString("utf8");
}

/** Recovery codes look like "K7Q2-9XMA-PT4D" (60 bits of entropy). */
export function generateRecoveryCodes(count = RECOVERY_CODE_COUNT) {
    return Array.from({ length: count }, () => {
        const raw = base32Encode(randomBytes(8)).slice(0, 12);
        return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}`;
    });
}

export function normalizeRecoveryCode(code: string) {
    // Base32 has no 0, 1 or 8: read them as the letters people mistake them for.
    return code.toUpperCase().replace(/0/g, "O").replace(/1/g, "I").replace(/8/g, "B").replace(/[^A-Z2-7]/g, "");
}

export function hashRecoveryCode(code: string) {
    return createHmac("sha256", encryptionKey()).update(`recovery:${normalizeRecoveryCode(code)}`).digest("base64url");
}

/** Returns the remaining hashes if the code matched, otherwise null. */
export function consumeRecoveryCode(hashes: string[], code: string): string[] | null {
    if (normalizeRecoveryCode(code).length !== 12) return null;
    const candidate = Buffer.from(hashRecoveryCode(code));
    let index = -1;
    hashes.forEach((hash, position) => {
        const stored = Buffer.from(hash);
        if (stored.length === candidate.length && timingSafeEqual(stored, candidate)) index = position;
    });
    return index < 0 ? null : hashes.filter((_, position) => position !== index);
}
