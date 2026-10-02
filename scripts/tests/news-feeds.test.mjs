// Run: node --test scripts/tests/
import assert from "node:assert/strict";
import test from "node:test";
import { load } from "./setup.mjs";

const { NEWS_CATEGORIES, NEWS_SOURCES, inferTags } = await load("lib/news/sources.ts");
const { decodeFeedBytes, parseFeed } = await load("lib/news/feed-parser.ts");
const { normalizeTitle, selectItems } = await load("lib/news/select.ts");
const { balanceFeed, trendingTopics } = await load("components/News/NewsTypes.ts");
const format = await load("components/News/market-format.ts");

// ---------------------------------------------------------------------------
// Sources and categories
// ---------------------------------------------------------------------------

test("the finance category is offered and every source is well formed", () => {
    const finance = NEWS_CATEGORIES.find((entry) => entry.id === "finance");
    assert.deepEqual(finance, { id: "finance", tr: "Finans & Ekonomi", en: "Finance & Economy", emoji: "💹" });
    assert.equal(new Set(NEWS_CATEGORIES.map((entry) => entry.id)).size, NEWS_CATEGORIES.length);

    const ids = new Set();
    const urls = new Set();
    for (const source of NEWS_SOURCES) {
        assert.ok(!ids.has(source.id), `duplicate id ${source.id}`);
        assert.ok(!urls.has(source.url), `duplicate feed ${source.url}`);
        ids.add(source.id);
        urls.add(source.url);
        for (const field of ["url", "homepage"]) {
            const url = new URL(source[field]);
            assert.equal(url.protocol, "https:", `${source.id}.${field}`);
            assert.equal(url.username + url.password, "", `${source.id}.${field} carries credentials`);
        }
        assert.ok(NEWS_CATEGORIES.some((entry) => entry.id === source.category), `${source.id}: unknown category ${source.category}`);
        assert.ok(source.language === "tr" || source.language === "en", `${source.id}: language`);
        assert.ok(source.name.trim().length > 0 && /^[a-z0-9-]+$/.test(source.id), `${source.id}: name/id`);
    }
});

test("finance coverage: Turkish and international economy, banking, markets and gold", () => {
    const finance = NEWS_SOURCES.filter((source) => source.category === "finance");
    assert.ok(finance.filter((source) => source.language === "tr").length >= 6, "Turkish finance sources");
    assert.ok(finance.filter((source) => source.language === "en").length >= 4, "English finance sources");
    const names = finance.map((source) => source.name);
    for (const expected of ["Bloomberg HT", "AA Ekonomi", "Dünya", "Habertürk Ekonomi", "Investing.com Türkiye", "CNBC Finance", "MarketWatch", "Yahoo Finance"]) {
        assert.ok(names.includes(expected), `missing ${expected}`);
    }
    // The tech sources are all still there.
    for (const id of ["openai", "github-blog", "ign", "the-verge", "nasa", "webtekno", "merlinin-kazani"]) {
        assert.ok(NEWS_SOURCES.some((source) => source.id === id), `lost ${id}`);
    }
});

test("finance stories are recognised by topic, in Turkish and English", () => {
    const has = (title, summary, base, tag) => inferTags(title, summary, base).includes(tag);
    assert.deepEqual(inferTags("Dolar güne yükselişle başladı", "", "finance"), ["finance"]);
    // Stories from the tech feeds that are really market news also show up under Finance.
    assert.ok(has("Borsa İstanbul günü yükselişle tamamladı", "", "apps", "finance"));
    assert.ok(has("BİST 100 endeksi rekor kırdı", "", "apps", "finance"), "dotted capital İ");
    assert.ok(has("MERKEZ BANKASI FAİZ KARARINI AÇIKLADI", "", "apps", "finance"), "all capitals");
    assert.ok(has("Bitcoin yeniden 100 bin doları aştı", "", "software", "finance"));
    assert.ok(has("Hisseleri %12 değer kazandı", "", "apps", "finance"), "suffixed stem");
    assert.ok(has("Gram altın rekor tazeledi", "", "apps", "finance"));
    assert.ok(has("Nasdaq closes at a record as inflation cools", "", "apps", "finance"));
    assert.ok(has("Startup files for IPO after a record quarter", "", "apps", "finance"));
    assert.ok(has("Apple earnings report beats expectations", "", "apps", "finance"));
    // Look-alikes are not finance.
    assert.ok(!has("Kriptografi dersleri artık ücretsiz", "", "software", "finance"), "cryptography");
    assert.ok(!has("Hissettiğim en iyi oyun", "", "games", "finance"), "to feel");
    assert.ok(!has("Bistro Tycoon is the cosiest game of the year", "", "games", "finance"));
    assert.ok(!has("Steam Deck now costs 399 dollars", "", "games", "finance"));
    assert.ok(!has("PS5 is back in stock at retailers", "", "games", "finance"));
    assert.ok(!has("New Rust release improves compile times", "", "software", "finance"));
    // Finance feeds say "model" and "agent" in the business sense: only unambiguous AI terms tag them.
    assert.deepEqual(inferTags("Şirketin yeni iş modeli kâr getirdi", "Sigorta ajanları ve model değişikliği", "finance"), ["finance"]);
    assert.deepEqual(inferTags("Yapay zeka hisseleri yükseldi", "", "finance"), ["finance", "ai"]);
    assert.deepEqual(inferTags("Yapay zekaya yatırım yapan fonlar büyüdü", "", "finance"), ["finance", "ai"], "suffixed");
    assert.deepEqual(inferTags("OpenAI is raising money at a higher valuation", "", "finance"), ["finance", "ai"]);
    // The previous tagging of the tech feeds is unchanged.
    assert.deepEqual(inferTags("OpenAI releases a new GPT model", "", "apps"), ["apps", "ai"]);
    assert.deepEqual(inferTags("Unreal Engine gets a new API", "", "software"), ["software", "games"]);
});

// ---------------------------------------------------------------------------
// Feed parsing
// ---------------------------------------------------------------------------

const RSS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/" xmlns:dc="http://purl.org/dc/elements/1.1/"><channel>
<title>Ekonomi</title><link>https://example.com/</link>
<image><url>https://example.com/logo.png</url><title>Logo</title></image>
<item>
  <title><![CDATA[Dolar güne yükselişle başladı]]></title>
  <link>https://example.com/haber/1</link>
  <description><![CDATA[<p>Dolar/TL <b>41,60</b> seviyesinden işlem görüyor.</p>]]></description>
  <pubDate>2025-03-14 10:15:00</pubDate>
  <enclosure url="//cdn.example.com/img/1.jpg" length="0"/>
</item>
<item>
  <title>Altın &amp; gümüş fiyatları</title>
  <link>https://example.com/haber/2</link>
  <description>Ons altın rekor kırdı</description>
  <pubDate>14.03.2025 15:30:00</pubDate>
  <image>https://cdn.example.com/img/2.png</image>
</item>
<item>
  <title>Faiz kararı bekleniyor</title>
  <link>https://example.com/haber/3</link>
  <pubDate>Fri, 14 Mar 2025 10:15:00</pubDate>
  <enclosure url="https://cdn.example.com/video/3.mp4" type="video/mp4"/>
</item>
<item>
  <title>Borsa güne düşüşle başladı</title>
  <link>https://example.com/haber/4</link>
  <pubDate>Fri, 14 Mar 2025 10:15:00 +0000</pubDate>
  <media:content url="http://insecure.example.com/4.jpg" medium="image"/>
</item>
<item>
  <title>Yanlış tarihli haber</title>
  <link>https://example.com/haber/5</link>
  <pubDate>2099-01-01 00:00:00</pubDate>
</item>
</channel></rss>`;

test("zone-less timestamps of Turkish feeds are read as Turkey time", () => {
    const items = parseFeed(RSS, 25, { assumeOffset: "+03:00" });
    assert.equal(items.length, 5);
    assert.equal(items[0].title, "Dolar güne yükselişle başladı");
    assert.equal(items[0].summary, "Dolar/TL 41,60 seviyesinden işlem görüyor.");
    assert.equal(items[0].publishedAt, "2025-03-14T07:15:00.000Z", "ISO without a zone");
    assert.equal(items[1].title, "Altın & gümüş fiyatları");
    assert.equal(items[1].publishedAt, "2025-03-14T12:30:00.000Z", "dd.MM.yyyy is day first, not month first");
    assert.equal(items[2].publishedAt, "2025-03-14T07:15:00.000Z", "RFC 822 without a zone");
    // A timestamp that names its zone is never shifted.
    assert.equal(items[3].publishedAt, "2025-03-14T10:15:00.000Z");
    // Broken far-future dates are dropped (the server then uses the fetch time).
    assert.equal(items[4].publishedAt, null);
    // Without the option, timestamps with a zone parse exactly as before.
    assert.equal(parseFeed(RSS, 25)[3].publishedAt, "2025-03-14T10:15:00.000Z");
});

test("feed images: protocol-relative, typeless enclosures and item-level image elements; never insecure or video", () => {
    const items = parseFeed(RSS, 25);
    assert.equal(items[0].image, "https://cdn.example.com/img/1.jpg");
    assert.equal(items[1].image, "https://cdn.example.com/img/2.png");
    assert.equal(items[2].image, null, "a video enclosure is not an image");
    assert.equal(items[3].image, null, "http images are refused");
    assert.equal(items[4].image, null, "the channel logo is not an item image");
});

test("Atom feeds and plain RSS still parse", () => {
    const atom = `<feed xmlns="http://www.w3.org/2005/Atom"><entry><title>Atom story</title><link rel="alternate" href="https://example.com/a"/><updated>2025-03-14T08:00:00Z</updated><summary>Short text</summary></entry></feed>`;
    assert.deepEqual(parseFeed(atom).map((item) => [item.title, item.link, item.publishedAt, item.summary]), [["Atom story", "https://example.com/a", "2025-03-14T08:00:00.000Z", "Short text"]]);
    assert.deepEqual(parseFeed("<html>not a feed</html>"), []);
});

test("feed bytes are decoded with the right charset", () => {
    const utf8 = new TextEncoder().encode('<?xml version="1.0" encoding="UTF-8"?><t>Şişli ğüzel ıspanak İstanbul</t>');
    assert.equal(decodeFeedBytes(utf8), '<?xml version="1.0" encoding="UTF-8"?><t>Şişli ğüzel ıspanak İstanbul</t>');

    // windows-1254 / ISO-8859-9 bytes: Ş=DE ş=FE ğ=F0 ı=FD İ=DD ü=FC.
    const legacy = (declaration) => Uint8Array.from([...new TextEncoder().encode(`${declaration}<t>`), 0xde, 0x69, 0xfe, 0x6c, 0x69, 0x20, 0xf0, 0xfc, 0x7a, 0x65, 0x6c, 0x20, 0xfd, 0x20, 0xdd, ...new TextEncoder().encode("</t>")]);
    assert.match(decodeFeedBytes(legacy('<?xml version="1.0" encoding="windows-1254"?>')), /<t>Şişli ğüzel ı İ<\/t>/);
    assert.match(decodeFeedBytes(legacy('<?xml version="1.0" encoding="ISO-8859-9"?>')), /<t>Şişli ğüzel ı İ<\/t>/);
    assert.match(decodeFeedBytes(legacy(""), "text/xml; charset=iso-8859-9"), /<t>Şişli ğüzel ı İ<\/t>/, "HTTP charset");
    assert.match(decodeFeedBytes(legacy(""), null, "windows-1254"), /<t>Şişli ğüzel ı İ<\/t>/, "caller's fallback for Turkish sources");

    // A wrong declaration does not matter when the bytes are valid UTF-8.
    const mislabelled = new TextEncoder().encode('<?xml version="1.0" encoding="windows-1254"?><t>Şişli</t>');
    assert.match(decodeFeedBytes(mislabelled), /<t>Şişli<\/t>/);
    // A UTF-8 feed with one broken byte keeps its letters (replacement character instead of shifted text).
    const broken = Uint8Array.from([...new TextEncoder().encode('<?xml version="1.0" encoding="utf-8"?><t>Şişli '), 0xff, ...new TextEncoder().encode("</t>")]);
    assert.match(decodeFeedBytes(broken, null, "windows-1254"), /<t>Şişli �<\/t>/);
    // Unknown labels fall through to the next candidate instead of throwing.
    assert.match(decodeFeedBytes(legacy('<?xml version="1.0" encoding="not-a-charset"?>'), null, "windows-1254"), /Şişli/);
});

// ---------------------------------------------------------------------------
// Snapshot selection (de-duplication, per-category ceiling)
// ---------------------------------------------------------------------------

const NOW = Date.parse("2026-10-02T12:00:00Z");
const story = (id, category, minutesAgo, title = `Story ${id}`) => ({ id, title, category, publishedAt: new Date(NOW - minutesAgo * 60_000).toISOString() });
const OPTIONS = { now: NOW, maxAgeMs: 21 * 24 * 3600 * 1000, maxItems: 100, perCategory: 50 };

test("stories are de-duplicated by link id and by headline across categories", () => {
    const picked = selectItems([
        story("a", "apps", 5, "Nvidia hisseleri rekor kırdı!"),
        story("b", "finance", 10, "NVIDIA hisseleri rekor kırdı"),
        story("a", "ai", 20, "Same link, different title"),
        story("c", "finance", 15, "IŞIK hızında büyüme"),
        story("d", "finance", 25, "ışık hızında büyüme."),
        story("e", "games", 30),
    ], OPTIONS);
    assert.deepEqual(picked.map((item) => item.id), ["a", "c", "e"]);
    assert.equal(normalizeTitle("Dolar/TL  41,60'a Çıktı!"), "dolar tl 41 60 a cikti");
    assert.equal(normalizeTitle("IŞIK"), normalizeTitle("ışık"), "dotless and dotted i");
    assert.equal(normalizeTitle("BİTCOİN yükselişte"), normalizeTitle("Bitcoin yukselişte"), "capitals and accents");
    assert.notEqual(normalizeTitle("Dolar düştü"), normalizeTitle("Dolar yükseldi"));
});

test("a flood from one category cannot push the others out of the snapshot", () => {
    const finance = Array.from({ length: 120 }, (_, index) => story(`f${index}`, "finance", index));
    const tech = Array.from({ length: 30 }, (_, index) => story(`t${index}`, "software", 300 + index * 60));
    const picked = selectItems([...finance, ...tech], { ...OPTIONS, perCategory: 50 });
    assert.equal(picked.filter((item) => item.category === "finance").length, 50);
    assert.equal(picked.filter((item) => item.category === "software").length, 30, "the slow feed keeps everything");
    // The finance stories kept are the newest ones, and the list stays newest first.
    assert.deepEqual(picked.filter((item) => item.category === "finance").map((item) => item.id), finance.slice(0, 50).map((item) => item.id));
    const times = picked.map((item) => item.publishedAt);
    assert.deepEqual(times, [...times].sort().reverse());
});

test("old stories and the global ceiling are enforced", () => {
    const picked = selectItems([
        story("new", "ai", 10),
        story("old", "ai", 22 * 24 * 60),
        ...Array.from({ length: 10 }, (_, index) => story(`x${index}`, "games", 20 + index)),
    ], { ...OPTIONS, maxItems: 5 });
    assert.equal(picked.length, 5);
    assert.equal(picked[0].id, "new");
    assert.ok(!picked.some((item) => item.id === "old"));
    assert.deepEqual(selectItems([], OPTIONS), []);
});

// ---------------------------------------------------------------------------
// Mixed-view ordering
// ---------------------------------------------------------------------------

const card = (id, category) => ({ id, category });
const ids = (list) => list.map((item) => item.id).join(" ");

test("balanceFeed keeps a flooding category from filling the top of the feed", () => {
    // Nine stories from a busy wire service, all newer than fifteen from four other categories.
    const flood = Array.from({ length: 9 }, (_, index) => card(`f${index}`, "finance"));
    const others = Array.from({ length: 15 }, (_, index) => card(`o${index}`, ["ai", "software", "games", "apps"][index % 4]));
    const balanced = balanceFeed([...flood, ...others]);
    assert.equal(balanced.length, 24);
    assert.deepEqual([...balanced].map((item) => item.id).sort(), [...flood, ...others].map((item) => item.id).sort(), "nothing lost or duplicated");
    for (let start = 0; start + 8 <= balanced.length; start += 1) {
        const window = balanced.slice(start, start + 8);
        for (const category of ["finance", "ai", "software", "games", "apps"]) {
            assert.ok(window.filter((item) => item.category === category).length <= 3, `${category} in window at ${start}: ${ids(window)}`);
        }
    }
    // Inside a category the newest-first order is untouched, and the newest story is still on top.
    assert.deepEqual(balanced.filter((item) => item.category === "finance").map((item) => item.id), flood.map((item) => item.id));
    assert.deepEqual(balanced.filter((item) => item.category === "ai").map((item) => item.id), others.filter((item) => item.category === "ai").map((item) => item.id));
    assert.equal(balanced[0].id, "f0");
    // Without a flood there is nothing to hold back: the others are not delayed behind the finance stories.
    assert.ok(balanced.slice(0, 8).some((item) => item.category !== "finance"));
});

test("balanceFeed never drops stories when only the flooding category is left", () => {
    const flood = Array.from({ length: 12 }, (_, index) => card(`f${index}`, "finance"));
    const balanced = balanceFeed([...flood, card("a1", "ai"), card("a2", "ai")]);
    assert.equal(balanced.length, 14);
    assert.deepEqual(balanced.filter((item) => item.category === "finance").map((item) => item.id), flood.map((item) => item.id));
    assert.deepEqual(balanced.filter((item) => item.category === "ai").map((item) => item.id), ["a1", "a2"]);
});

test("balanceFeed leaves an already mixed feed alone and never stalls", () => {
    const mixed = [card("1", "ai"), card("2", "finance"), card("3", "games"), card("4", "finance"), card("5", "software"), card("6", "apps"), card("7", "finance"), card("8", "ai"), card("9", "finance")];
    assert.equal(ids(balanceFeed(mixed)), ids(mixed));
    const single = Array.from({ length: 10 }, (_, index) => card(`s${index}`, "finance"));
    assert.equal(ids(balanceFeed(single)), ids(single), "a single category keeps its order");
    assert.deepEqual(balanceFeed([]), []);
    assert.equal(ids(balanceFeed([card("x", "ai")])), "x");
    // It does not mutate its input.
    const input = [card("1", "finance"), card("2", "finance"), card("3", "finance"), card("4", "finance"), card("5", "ai")];
    balanceFeed(input);
    assert.equal(ids(input), "1 2 3 4 5");
});

test("trending topics skip filler words of wire headlines", () => {
    const base = { link: "https://example.com", summary: "", image: null, publishedAt: new Date().toISOString(), source: { id: "s", name: "S", homepage: "https://example.com" }, tags: [], language: "tr" };
    const items = ["Dolar milyar lira bugün", "Altın milyar lira bugün", "Dolar yeniden yükseldi", "Altın yeniden yükseldi"].map((title, index) => ({ ...base, id: `n${index}`, title, category: "finance" }));
    const words = trendingTopics(items, 10).map((topic) => topic.word.toLocaleLowerCase("tr"));
    assert.ok(words.includes("dolar") && words.includes("altın"));
    for (const filler of ["milyar", "lira", "bugün"]) assert.ok(!words.includes(filler), filler);
});

// ---------------------------------------------------------------------------
// Market formatting
// ---------------------------------------------------------------------------

const fx = { id: "usd-try", value: 41.5761, unit: "TRY" };

test("market values follow the viewer's locale and each instrument's precision", () => {
    assert.equal(format.formatMarketValue(fx, "tr-TR"), "₺41,5761");
    assert.equal(format.formatMarketValue(fx, "en-US"), "₺41.5761");
    assert.equal(format.formatMarketValue({ id: "gram-gold", value: 4471.4, unit: "TRY" }, "tr-TR"), "₺4.471,40");
    assert.equal(format.formatMarketValue({ id: "bitcoin", value: 67234, unit: "USD" }, "en-US"), "$67,234");
    assert.equal(format.formatMarketValue({ id: "bist-100", value: 10250.5, unit: "pts" }, "tr-TR"), "10.250,50");
    assert.equal(format.formatMarketValue({ id: "bist-100", value: 10250.5, unit: "pts" }, "en-US"), "10,250.50");
    // An invalid locale never breaks the strip.
    assert.equal(format.formatMarketValue(fx, "not a locale"), "₺41.5761");
    assert.equal(format.formatCurrency(3345.1, "USD", 2, "en-US"), "$3,345.10");
    assert.equal(format.formatMarketNumber(fx, 41.5, "tr-TR"), "41,5000");
});

test("changes are signed, directional and honest about missing data", () => {
    const up = { id: "usd-try", value: 41.5761, unit: "TRY", change: 0.1093, changePercent: 0.2636 };
    assert.equal(format.marketDirection(up), "up");
    assert.equal(format.formatChangePercent(up, "en-US"), "+0.26%");
    assert.equal(format.formatChangePercent(up, "tr-TR"), "+%0,26");
    assert.equal(format.formatChangeAmount(up, "en-US"), "+0.1093");
    const down = { ...up, change: -70.5, changePercent: -0.69 };
    assert.equal(format.marketDirection(down), "down");
    assert.match(format.formatChangePercent(down, "en-US"), /^[-−]0\.69%$/);
    assert.equal(format.marketDirection({ change: 0.0001, changePercent: 0.001 }), "flat", "prints as 0.00 %");
    assert.equal(format.formatChangePercent({ changePercent: 0.001 }, "en-US"), "0.00%");
    assert.equal(format.marketDirection({ change: 5, changePercent: null }), "up");
    assert.equal(format.marketDirection({ change: 0, changePercent: null }), "flat");
    assert.equal(format.marketDirection({ change: null, changePercent: null }), null);
    assert.equal(format.formatChangePercent({ changePercent: null }, "en-US"), "");
    assert.equal(format.formatChangeAmount({ ...fx, change: null }, "en-US"), "");
    assert.match(format.formatMarketTime("2026-10-02T12:30:00.000Z", "tr-TR"), /2026/);
    assert.equal(format.formatMarketTime("not a date", "tr-TR"), "");
});
