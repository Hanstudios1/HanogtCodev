/**
 * Audio files of games in the browser (V4).
 *
 * Signed-in people upload files to the asset store (/api/game-assets), which
 * keeps each file once by its SHA-256. Guests keep files on this device
 * (IndexedDB). For playing, bytes come from memory, then files embedded in an
 * exported HTML game, then this device, then the asset store.
 */
import type { AudioAsset } from "./types";

export const AUDIO_ACCEPT = "audio/wav,audio/x-wav,audio/wave,audio/mpeg,audio/mp3,audio/ogg,.wav,.mp3,.ogg";
export const AUDIO_MAX_BYTES = 300 * 1024;

export type AudioContentType = AudioAsset["contentType"];

/** WAV, MP3 or Ogg by their first bytes (the server checks the same way). */
export function sniffAudioType(bytes: Uint8Array): AudioContentType | null {
    if (bytes.length < 12) return null;
    const ascii = (start: number, length: number) => String.fromCharCode(...bytes.subarray(start, start + length));
    if (ascii(0, 4) === "RIFF" && ascii(8, 4) === "WAVE") return "audio/wav";
    if (ascii(0, 4) === "OggS") return "audio/ogg";
    if (ascii(0, 3) === "ID3" || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0)) return "audio/mpeg";
    return null;
}

export async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Length of a file in seconds (0 when the browser can't decode it). */
export async function audioDuration(bytes: ArrayBuffer): Promise<number> {
    if (typeof window === "undefined") return 0;
    const OfflineCtor = window.OfflineAudioContext || (window as unknown as { webkitOfflineAudioContext?: typeof OfflineAudioContext }).webkitOfflineAudioContext;
    if (!OfflineCtor) return 0;
    try {
        const buffer = await new OfflineCtor(1, 1, 44_100).decodeAudioData(bytes.slice(0));
        return Math.round(buffer.duration * 100) / 100;
    } catch {
        return 0;
    }
}

export class AudioStoreError extends Error {
    readonly code: string;
    readonly status: number;
    readonly details: Record<string, unknown>;
    constructor(message: string, code = "error", status = 0, details: Record<string, unknown> = {}) {
        super(message);
        this.name = "AudioStoreError";
        this.code = code;
        this.status = status;
        this.details = details;
    }
}

// ---------------------------------------------------------------------------
// This device (guests, and a cache of files played before)
// ---------------------------------------------------------------------------

const DB_NAME = "hanogt-engine-audio";
const STORE = "files";

function openDatabase(): Promise<IDBDatabase | null> {
    return new Promise((resolve) => {
        if (typeof indexedDB === "undefined") {
            resolve(null);
            return;
        }
        const request = indexedDB.open(DB_NAME, 1);
        request.onupgradeneeded = () => {
            if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE);
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => resolve(null);
    });
}

export async function saveLocalAudio(hash: string, bytes: ArrayBuffer): Promise<boolean> {
    const db = await openDatabase();
    if (!db) return false;
    try {
        return await new Promise<boolean>((resolve) => {
            const transaction = db.transaction(STORE, "readwrite");
            transaction.objectStore(STORE).put(bytes, hash);
            transaction.oncomplete = () => resolve(true);
            transaction.onerror = () => resolve(false);
        });
    } finally {
        db.close();
    }
}

export async function readLocalAudio(hash: string): Promise<ArrayBuffer | null> {
    const db = await openDatabase();
    if (!db) return null;
    try {
        return await new Promise<ArrayBuffer | null>((resolve) => {
            const request = db.transaction(STORE, "readonly").objectStore(STORE).get(hash);
            request.onsuccess = () => resolve(request.result instanceof ArrayBuffer ? request.result : null);
            request.onerror = () => resolve(null);
        });
    } finally {
        db.close();
    }
}

// ---------------------------------------------------------------------------
// The asset store (signed in)
// ---------------------------------------------------------------------------

export type AccountAudioUsage = { plan: string; bytes: number; files: number; limit: { bytes: number; files: number }; maxFileBytes: number };
export type AccountAudioFile = { hash: string; name: string; size: number; contentType: string; createdAt: string | null };

async function failure(response: Response, fallback: string): Promise<never> {
    const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
    throw new AudioStoreError(typeof payload.error === "string" ? payload.error : fallback, typeof payload.code === "string" ? payload.code : "error", response.status, payload);
}

/** Uploads a file to the account's library (the same file is stored and counted once). */
export async function uploadAudio(bytes: ArrayBuffer, name: string): Promise<{ hash: string; contentType: AudioContentType; size: number; usage: AccountAudioUsage; duplicate: boolean }> {
    const response = await fetch(`/api/game-assets?name=${encodeURIComponent(name.slice(0, 80))}`, {
        method: "POST",
        headers: { "Content-Type": "application/octet-stream" },
        body: bytes,
        credentials: "same-origin",
    });
    if (!response.ok) return failure(response, "Ses dosyası yüklenemedi.");
    return response.json();
}

export async function listAccountAudio(): Promise<{ files: AccountAudioFile[]; usage: AccountAudioUsage }> {
    const response = await fetch("/api/game-assets", { credentials: "same-origin", cache: "no-store" });
    if (!response.ok) return failure(response, "Ses dosyaları yüklenemedi.");
    return response.json();
}

export async function deleteAccountAudio(hash: string): Promise<{ removed: boolean; usage: AccountAudioUsage }> {
    const response = await fetch(`/api/game-assets/${hash}`, { method: "DELETE", credentials: "same-origin" });
    if (!response.ok) return failure(response, "Ses dosyası silinemedi.");
    return response.json();
}

// ---------------------------------------------------------------------------
// Loading for play
// ---------------------------------------------------------------------------

const memory = new Map<string, Promise<ArrayBuffer | null>>();
let embedded: Record<string, string> = {};

/** Files embedded in an exported HTML game ({ hash: base64 }). */
export function registerEmbeddedAudio(files: Record<string, string>) {
    embedded = { ...embedded, ...files };
}

function fromBase64(value: string): ArrayBuffer {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes.buffer;
}

/** Bytes of a project's audio file, from wherever they are; null when they can't be found. */
export function loadAudioBytes(asset: Pick<AudioAsset, "hash">): Promise<ArrayBuffer | null> {
    const hash = asset.hash;
    if (!/^[0-9a-f]{64}$/.test(hash)) return Promise.resolve(null);
    let pending = memory.get(hash);
    if (!pending) {
        pending = (async () => {
            if (embedded[hash]) return fromBase64(embedded[hash]);
            const local = await readLocalAudio(hash);
            if (local) return local;
            if (typeof fetch === "undefined" || typeof location === "undefined" || location.protocol === "file:") return null;
            const response = await fetch(`/api/game-assets/${hash}`, { credentials: "omit" }).catch(() => null);
            if (!response?.ok) return null;
            return response.arrayBuffer();
        })().then((bytes) => {
            // Forget failures so a later attempt (back online, file uploaded) can succeed.
            if (!bytes) memory.delete(hash);
            return bytes;
        });
        memory.set(hash, pending);
    }
    return pending;
}

/** Embeds the bytes of every audio file of a project (exported HTML games play offline). */
export async function embedProjectAudio(assets: readonly AudioAsset[]): Promise<{ files: Record<string, string>; missing: string[] }> {
    const files: Record<string, string> = {};
    const missing: string[] = [];
    for (const asset of assets) {
        if (files[asset.hash]) continue;
        const bytes = await loadAudioBytes(asset);
        if (!bytes) {
            missing.push(asset.name);
            continue;
        }
        let binary = "";
        const view = new Uint8Array(bytes);
        for (let index = 0; index < view.length; index += 0x8000) binary += String.fromCharCode(...view.subarray(index, index + 0x8000));
        files[asset.hash] = btoa(binary);
    }
    return { files, missing };
}
