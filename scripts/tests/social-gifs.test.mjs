// Run: node --test scripts/tests/*.test.mjs
// GIFs in Hanogt Social (lib/social/gif.ts, lib/server/gifs.ts): which
// provider answers, what is sent to it, how its answers are read and which
// image addresses a message may carry.
import assert from "node:assert/strict";
import test from "node:test";
import { load } from "./setup.mjs";

const gif = await load("lib/social/gif.ts");
const server = await load("lib/server/gifs.ts");

test("the provider: KLIPY first, GIPHY otherwise, GIF_PROVIDER picks; nothing without a key", () => {
    assert.equal(server.gifProviderConfig({}), null);
    assert.deepEqual(server.gifProviderConfig({ GIPHY_API_KEY: "g" }), { provider: "giphy", key: "g" });
    assert.deepEqual(server.gifProviderConfig({ KLIPY_API_KEY: "k", GIPHY_API_KEY: "g" }), { provider: "klipy", key: "k" });
    assert.deepEqual(server.gifProviderConfig({ KLIPY_API_KEY: "k", GIPHY_API_KEY: "g", GIF_PROVIDER: "giphy" }), { provider: "giphy", key: "g" });
    assert.deepEqual(server.gifProviderConfig({ GIPHY_API_KEY: "g", GIF_PROVIDER: "klipy" }), { provider: "giphy", key: "g" }, "a forced provider without a key falls back");
    assert.deepEqual(server.gifProviderConfig({ TENOR_API_KEY: "t" }), null, "Tenor's API is gone");
    assert.equal(server.gifRating({}), "pg");
    assert.equal(server.gifRating({ GIF_RATING: "PG-13" }), "pg-13");
    assert.equal(server.gifRating({ GIF_RATING: "r" }), "pg", "nothing above PG-13");
});

test("what goes to the provider: the text, the page, the language and the rating, nothing about the person", () => {
    assert.equal(server.normalizeGifQuery("  Mutlu\n  KEDİ  "), "mutlu kedi");
    assert.equal(server.normalizeGifQuery("x".repeat(80)).length, 50);
    assert.equal(server.normalizeGifQuery(42), "");

    const klipy = server.gifRequestUrl({ provider: "klipy", key: "abc/1" }, "kedi", 2, "tr", "pg");
    assert.equal(klipy.origin + klipy.pathname, "https://api.klipy.com/api/v1/abc%2F1/gifs/search");
    assert.deepEqual(Object.fromEntries(klipy.searchParams), { q: "kedi", page: "2", per_page: "24", rating: "pg", locale: "tr_TR" });
    const trending = server.gifRequestUrl({ provider: "klipy", key: "k" }, "", 1, "en", "g");
    assert.ok(trending.pathname.endsWith("/gifs/trending") && !trending.searchParams.has("q") && trending.searchParams.get("locale") === "en_US");

    const giphy = server.gifRequestUrl({ provider: "giphy", key: "g" }, "cat", 3, "en", "pg-13");
    assert.equal(giphy.origin + giphy.pathname, "https://api.giphy.com/v1/gifs/search");
    assert.deepEqual(Object.fromEntries(giphy.searchParams), { api_key: "g", q: "cat", limit: "24", offset: "48", rating: "pg-13", lang: "en", bundle: "messaging_non_clips" });
    for (const url of [klipy, trending, giphy]) assert.ok(!/customer|user|email/i.test(url.search), "no personal identifier");
});

test("KLIPY answers: animations from the media host, a still frame when there is one, no ads", () => {
    const body = {
        result: true,
        data: {
            data: [
                { id: 1, slug: "happy-cat-1", title: "Happy cat", type: "gif", file: { md: { webp: { url: "https://static.klipy.com/a/md.webp", width: 220, height: 180 }, jpg: { url: "https://static.klipy.com/a/md.jpg", width: 220, height: 180 } }, hd: { gif: { url: "https://static.klipy.com/a/hd.gif", width: 498, height: 408 } } } },
                { type: "ad", id: 2, file: { md: { webp: { url: "https://static.klipy.com/ad.webp", width: 300, height: 250 } } } },
                { id: 3, slug: "evil", file: { md: { gif: { url: "https://evil.example/x.gif", width: 10, height: 10 } } } },
                { id: 4, slug: "only-sm", file: { sm: { gif: { url: "https://media.klipy.com/b/sm.gif", width: 120, height: 90 } } } },
            ],
            current_page: 1,
            per_page: 24,
            has_next: true,
        },
    };
    const page = server.readGifAnswer("klipy", body, 1);
    assert.deepEqual(page.items.map((item) => item.id), ["happy-cat-1", "only-sm"]);
    assert.deepEqual(page.items[0], { provider: "klipy", id: "happy-cat-1", title: "Happy cat", url: "https://static.klipy.com/a/md.webp", width: 220, height: 180, still: "https://static.klipy.com/a/md.jpg" });
    assert.equal(page.items[1].still, null);
    assert.equal(page.next, 2);
    assert.equal(server.readGifAnswer("klipy", { data: { data: [], has_next: true } }, 20).next, null, "at most 20 pages");
    assert.deepEqual(server.readGifAnswer("klipy", null, 1), { items: [], next: null });
});

test("GIPHY answers: fixed-height WebP first, the still frame, pages from the total", () => {
    const item = (id, host = "media2.giphy.com") => ({
        id,
        title: `GIF ${id}`,
        images: {
            fixed_height: { url: `https://${host}/media/${id}/200.gif`, webp: `https://${host}/media/${id}/200.webp`, width: "267", height: "200" },
            fixed_height_still: { url: `https://${host}/media/${id}/200_s.gif`, width: "267", height: "200" },
        },
    });
    const page = server.readGifAnswer("giphy", { data: [item("abc"), item("bad", "giphy.evil.com")], pagination: { total_count: 60, count: 24, offset: 24 } }, 2);
    assert.deepEqual(page.items, [{ provider: "giphy", id: "abc", title: "GIF abc", url: "https://media2.giphy.com/media/abc/200.webp", width: 267, height: 200, still: "https://media2.giphy.com/media/abc/200_s.gif" }]);
    assert.equal(page.next, 3);
    assert.equal(server.readGifAnswer("giphy", { data: [], pagination: { total_count: 48 } }, 2).next, null);
});

test("a message's GIF: only https on the provider's media hosts, with an id and a size", () => {
    const good = { provider: "giphy", id: "abc", title: "Hi\u0007", url: "https://i.giphy.com/abc.webp", still: "https://evil.example/s.gif", width: 200, height: "150" };
    assert.deepEqual(gif.readMessageGif(good), { provider: "giphy", id: "abc", title: "Hi", url: "https://i.giphy.com/abc.webp", still: null, width: 200, height: 150 });
    for (const url of ["http://i.giphy.com/a.gif", "https://user:pw@i.giphy.com/a.gif", "https://i.giphy.com:8443/a.gif", "https://giphy.com.evil.example/a.gif", "javascript:alert(1)", "https://static.klipy.com/a.gif"]) {
        assert.equal(gif.readMessageGif({ ...good, url }), null, url);
    }
    assert.equal(gif.readMessageGif({ ...good, provider: "tenor" }), null);
    assert.equal(gif.readMessageGif({ ...good, width: 0 }), null);
    assert.equal(gif.readMessageGif({ ...good, id: "" }), null);
    assert.ok(gif.isAllowedGifUrl("https://static.klipy.com/a.webp", "klipy"));
    assert.ok(gif.isAllowedGifUrl("https://klipy.com/a.webp", "klipy"));
    assert.ok(!gif.isAllowedGifUrl("https://klipy.com.evil.example/a.webp", "klipy"));
});
