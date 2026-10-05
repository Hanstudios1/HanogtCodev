// Run: node --test scripts/tests/
// "Download the app": the device a visitor is on (src/lib/downloads.ts) and
// the files of the latest GitHub release (src/lib/server/releases.ts,
// GET /api/download), with GitHub's answer stubbed.
import assert from "node:assert/strict";
import test from "node:test";
import { load } from "./setup.mjs";

const { detectDevice, isDownloadPlatform } = await load("lib/downloads.ts");
const { availableDownloads, downloadTarget } = await load("lib/server/releases.ts");
const route = await load("app/api/download/route.ts");
const { NextRequest } = await import("next/server.js");

const RELEASES = "https://github.com/Hanstudios1/HanogtCodev/releases/latest";
const file = (name) => ({ name, browser_download_url: `https://github.com/Hanstudios1/HanogtCodev/releases/download/v0.0.2/${name}` });

/** Runs `fn` while GitHub answers with `answer` (an object, a status number, or an Error). */
async function withGitHub(answer, fn) {
    const original = globalThis.fetch;
    const calls = [];
    globalThis.fetch = async (url) => {
        calls.push(String(url));
        if (answer instanceof Error) throw answer;
        if (typeof answer === "number") return new Response("{}", { status: answer });
        return Response.json(answer);
    };
    try {
        return await fn(calls);
    } finally {
        globalThis.fetch = original;
    }
}

const release = {
    tag_name: "v0.0.2",
    html_url: "https://github.com/Hanstudios1/HanogtCodev/releases/tag/v0.0.2",
    assets: [
        file("Hanogt.Codev-0.0.2-x64.dmg"),
        file("Hanogt.Codev-0.0.2-arm64.dmg"),
        file("Hanogt.Codev.Setup.0.0.2.exe"),
        file("Hanogt.Codev-uninstaller.exe"),
        file("Hanogt.Codev-0.0.2.AppImage"),
        file("latest.yml"),
        // Only files on github.com are linked to.
        { name: "evil.apk", browser_download_url: "https://example.com/evil.apk" },
    ],
};

test("the visitor's device, iPadOS included", () => {
    assert.equal(detectDevice("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)", 5), "ios");
    // iPadOS asks for desktop pages and calls itself a Mac, but has a touch screen.
    assert.equal(detectDevice("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15", 5), "ios");
    assert.equal(detectDevice("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15", 0), "macos");
    assert.equal(detectDevice("Mozilla/5.0 (Linux; Android 15; Pixel 9)", 5), "android");
    assert.equal(detectDevice("Mozilla/5.0 (X11; Linux x86_64)", 0), "linux");
    assert.equal(detectDevice("Mozilla/5.0 (X11; CrOS x86_64 16093.0.0)", 0), "linux");
    assert.equal(detectDevice("Mozilla/5.0 (Windows NT 10.0; Win64; x64)", 0), "windows");
    assert.equal(isDownloadPlatform("android"), true);
    assert.equal(isDownloadPlatform("ios"), false);
});

test("files are found by type, whatever version they carry", async () => {
    await withGitHub(release, async (calls) => {
        assert.deepEqual(await availableDownloads(), {
            tag: "v0.0.2",
            releaseUrl: "https://github.com/Hanstudios1/HanogtCodev/releases/tag/v0.0.2",
            platforms: { windows: true, macos: true, linux: true, android: false },
        });
        assert.match(calls[0], /api\.github\.com\/repos\/Hanstudios1\/HanogtCodev\/releases\/latest$/);
        // The installer before any other .exe, Apple silicon before Intel.
        assert.deepEqual(await downloadTarget("windows"), { url: file("Hanogt.Codev.Setup.0.0.2.exe").browser_download_url, known: true });
        assert.deepEqual(await downloadTarget("macos"), { url: file("Hanogt.Codev-0.0.2-arm64.dmg").browser_download_url, known: true });
        // No (safe) Android file: the release page.
        assert.deepEqual(await downloadTarget("android"), { url: release.html_url, known: true });
    });
});

test("when GitHub can't be asked, nothing is claimed and nothing is cached", async () => {
    for (const answer of [403, new Error("network down")]) {
        await withGitHub(answer, async () => {
            assert.equal(await availableDownloads(), null);
            assert.deepEqual(await downloadTarget("linux"), { url: RELEASES, known: false });

            const listing = await route.GET(new NextRequest("http://localhost/api/download"));
            assert.equal(listing.status, 503);
            assert.equal(listing.headers.get("cache-control"), "no-store");

            const redirect = await route.GET(new NextRequest("http://localhost/api/download?platform=windows"));
            assert.equal(redirect.status, 302);
            assert.equal(redirect.headers.get("location"), RELEASES);
            assert.equal(redirect.headers.get("cache-control"), "no-store");
        });
    }
});

test("the route: a listing, a redirect to the file, an unknown platform", async () => {
    await withGitHub(release, async () => {
        const listing = await route.GET(new NextRequest("http://localhost/api/download"));
        assert.equal(listing.status, 200);
        assert.match(listing.headers.get("cache-control"), /s-maxage=900/);
        assert.equal((await listing.json()).platforms.linux, true);

        const redirect = await route.GET(new NextRequest("http://localhost/api/download?platform=linux"));
        assert.equal(redirect.status, 302);
        assert.equal(redirect.headers.get("location"), file("Hanogt.Codev-0.0.2.AppImage").browser_download_url);

        const unknown = await route.GET(new NextRequest("http://localhost/api/download?platform=ios"));
        assert.equal(unknown.status, 400);
    });
});
