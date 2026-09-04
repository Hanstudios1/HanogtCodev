import "server-only";

import { randomBytes, scrypt as nodeScrypt, timingSafeEqual, type ScryptOptions } from "node:crypto";
const KEY_LENGTH = 64;
const COST = 32768;
const BLOCK_SIZE = 8;
const PARALLELIZATION = 1;

function deriveKey(password: string, salt: Buffer, length: number, options: ScryptOptions) {
    return new Promise<Buffer>((resolve, reject) => {
        nodeScrypt(password, salt, length, options, (error, derivedKey) => {
            if (error) reject(error);
            else resolve(Buffer.from(derivedKey));
        });
    });
}

export function validatePassword(password: string) {
    if (password.length < 10) return "Şifre en az 10 karakter olmalıdır.";
    if (password.length > 128) return "Şifre en fazla 128 karakter olabilir.";
    if (!/[a-zA-ZçğıöşüÇĞİÖŞÜ]/.test(password) || !/\d/.test(password)) {
        return "Şifre en az bir harf ve bir rakam içermelidir.";
    }
    return null;
}

export async function hashPassword(password: string) {
    const salt = randomBytes(16);
    const derived = await deriveKey(password.normalize("NFKC"), salt, KEY_LENGTH, {
        N: COST,
        r: BLOCK_SIZE,
        p: PARALLELIZATION,
        maxmem: 64 * 1024 * 1024,
    });
    return `scrypt$${COST}$${BLOCK_SIZE}$${PARALLELIZATION}$${salt.toString("base64url")}$${derived.toString("base64url")}`;
}

export async function verifyPassword(password: string, encoded: string) {
    try {
        const [algorithm, cost, blockSize, parallelization, saltValue, hashValue] = encoded.split("$");
        if (algorithm !== "scrypt" || !saltValue || !hashValue) return false;
        const expected = Buffer.from(hashValue, "base64url");
        const actual = await deriveKey(password.normalize("NFKC"), Buffer.from(saltValue, "base64url"), expected.length, {
            N: Number(cost),
            r: Number(blockSize),
            p: Number(parallelization),
            maxmem: 64 * 1024 * 1024,
        });
        return expected.length === actual.length && timingSafeEqual(expected, actual);
    } catch {
        return false;
    }
}
