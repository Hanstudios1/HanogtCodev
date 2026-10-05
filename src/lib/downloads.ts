/** Platforms with a download on the latest release (src/lib/server/releases.ts, GET /api/download). */
export type DownloadPlatform = "windows" | "macos" | "linux" | "android";

export const DOWNLOAD_PLATFORMS: readonly DownloadPlatform[] = ["windows", "macos", "linux", "android"];

export type DownloadsResponse = {
    tag: string | null;
    releaseUrl: string;
    platforms: Record<DownloadPlatform, boolean>;
};

export function isDownloadPlatform(value: unknown): value is DownloadPlatform {
    return typeof value === "string" && (DOWNLOAD_PLATFORMS as readonly string[]).includes(value);
}

export type DevicePlatform = DownloadPlatform | "ios";

/** The visitor's device. iPadOS reports itself as a Mac, but with a touch screen. */
export function detectDevice(userAgent: string, maxTouchPoints: number): DevicePlatform {
    const ua = userAgent.toLowerCase();
    if (/iphone|ipad|ipod/.test(ua) || (ua.includes("macintosh") && maxTouchPoints > 1)) return "ios";
    if (ua.includes("android")) return "android";
    if (ua.includes("mac")) return "macos";
    if (ua.includes("linux") || ua.includes("cros")) return "linux";
    return "windows";
}
