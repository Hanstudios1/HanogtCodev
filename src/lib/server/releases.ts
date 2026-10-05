import "server-only";

import { GITHUB_URL, RELEASES_URL } from "@/lib/site";
import type { DownloadPlatform, DownloadsResponse } from "@/lib/downloads";

/**
 * The desktop and Android builds of the latest GitHub release, found by file
 * type rather than by name, so the download links keep working whatever
 * version the files carry. Cached for 15 minutes (the unauthenticated API
 * allows 60 requests an hour).
 */

const REPOSITORY = new URL(GITHUB_URL).pathname.replace(/^\/|\/$/g, "");
const PATTERNS: Record<DownloadPlatform, RegExp[]> = {
    windows: [/setup.*\.exe$/i, /\.exe$/i],
    macos: [/arm64.*\.dmg$/i, /\.dmg$/i],
    linux: [/\.appimage$/i],
    android: [/\.apk$/i],
};

type Asset = { name: string; browser_download_url: string };

/** The latest release; null when GitHub couldn't be asked (rate limit, network, an odd answer). */
async function latestRelease(): Promise<{ tag: string | null; url: string; assets: Asset[] } | null> {
    try {
        const response = await fetch(`https://api.github.com/repos/${REPOSITORY}/releases/latest`, {
            headers: { Accept: "application/vnd.github+json", "User-Agent": "hanogt-codev" },
            next: { revalidate: 900 },
        });
        if (!response.ok) throw new Error(String(response.status));
        const release = await response.json() as { tag_name?: unknown; html_url?: unknown; assets?: unknown };
        const assets = Array.isArray(release.assets)
            ? release.assets.filter((asset): asset is Asset => typeof asset?.name === "string" && typeof asset?.browser_download_url === "string" && asset.browser_download_url.startsWith("https://github.com/"))
            : [];
        return {
            tag: typeof release.tag_name === "string" ? release.tag_name.slice(0, 40) : null,
            url: typeof release.html_url === "string" && release.html_url.startsWith(GITHUB_URL) ? release.html_url : RELEASES_URL,
            assets,
        };
    } catch {
        return null;
    }
}

function assetFor(assets: Asset[], platform: DownloadPlatform) {
    for (const pattern of PATTERNS[platform]) {
        const match = assets.find((asset) => pattern.test(asset.name));
        if (match) return match;
    }
    return null;
}

/** Which platforms the latest release has; null when that can't be known now (the menu then links to the release page). */
export async function availableDownloads(): Promise<DownloadsResponse | null> {
    const release = await latestRelease();
    if (!release) return null;
    const platforms = Object.fromEntries((Object.keys(PATTERNS) as DownloadPlatform[]).map((platform) => [platform, Boolean(assetFor(release.assets, platform))])) as Record<DownloadPlatform, boolean>;
    return { tag: release.tag, releaseUrl: release.url, platforms };
}

/** Where a download of `platform` goes: the file, or the release page when there is none or GitHub can't be asked (`known` false). */
export async function downloadTarget(platform: DownloadPlatform): Promise<{ url: string; known: boolean }> {
    const release = await latestRelease();
    if (!release) return { url: RELEASES_URL, known: false };
    return { url: assetFor(release.assets, platform)?.browser_download_url ?? release.url, known: true };
}
