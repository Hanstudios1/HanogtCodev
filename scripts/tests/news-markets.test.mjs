// Run: node --test scripts/tests/
//
// The sample payloads below are hand-written in the documented response shapes of each provider
// (TCMB kurlar/today.xml, gold-api.com /price/XAU, CoinGecko /simple/price, Yahoo Finance
// v8/finance/chart); the test sandbox cannot reach those hosts, so nothing here is a live capture.
// The numbers are made up for the tests.
import assert from "node:assert/strict";
import test from "node:test";
import { load } from "./setup.mjs";

const markets = await load("lib/news/markets.ts");
const {
    buildBistItem, buildFxItems, buildGramGoldItem, buildOunceGoldItem, buildSp500Item, collectMarkets, computeChange, createMarketsMemo, deriveGramGold,
    failedMarketIds, parseBistQuote, parseBitcoinQuote, parseGoldQuote, parseSp500Quote, parseTcmbBulletin, previousWeekdays, tcmbArchiveUrl,
    tcmbPublishedAt, COINGECKO_URL, GOLD_API_URL, TCMB_TODAY_URL, YAHOO_BIST_URL, YAHOO_SP500_URL, MARKET_ORDER,
} = markets;

const NOW = new Date("2026-10-02T11:00:00Z");

// ---------------------------------------------------------------------------
// Samples
// ---------------------------------------------------------------------------

const TCMB_TODAY = `<?xml version="1.0" encoding="UTF-8"?>
<?xml-stylesheet type="text/xsl" href="isokur.xsl"?>
<Tarih_Date Tarih="02.10.2026"  Date="10/02/2026"  Bulten_No="2026/190" >
	<Currency CrossOrder="0" Kod="USD" CurrencyCode="USD">
		<Unit>1</Unit>
		<Isim>ABD DOLARI</Isim>
		<CurrencyName>US DOLLAR</CurrencyName>
		<ForexBuying>41.5012</ForexBuying>
		<ForexSelling>41.5761</ForexSelling>
		<BanknoteBuying>41.4679</BanknoteBuying>
		<BanknoteSelling>41.6426</BanknoteSelling>
		<CrossRateUSD/>
		<CrossRateOther/>
	</Currency>
	<Currency CrossOrder="9" Kod="EUR" CurrencyCode="EUR">
		<Unit>1</Unit>
		<Isim>EURO</Isim>
		<CurrencyName>EURO</CurrencyName>
		<ForexBuying>48.2100</ForexBuying>
		<ForexSelling>48.2966</ForexSelling>
		<BanknoteBuying>48.1736</BanknoteBuying>
		<BanknoteSelling>48.3706</BanknoteSelling>
		<CrossRateUSD>1.1618</CrossRateUSD>
		<CrossRateOther/>
	</Currency>
	<Currency CrossOrder="10" Kod="GBP" CurrencyCode="GBP">
		<Unit>1</Unit>
		<Isim>İNGİLİZ STERLİNİ</Isim>
		<CurrencyName>POUND STERLING</CurrencyName>
		<ForexBuying>55.4000</ForexBuying>
		<ForexSelling>55.5000</ForexSelling>
		<BanknoteBuying>55.3000</BanknoteBuying>
		<BanknoteSelling>55.6000</BanknoteSelling>
		<CrossRateUSD>1.3350</CrossRateUSD>
		<CrossRateOther/>
	</Currency>
	<Currency CrossOrder="11" Kod="JPY" CurrencyCode="JPY">
		<Unit>100</Unit>
		<Isim>JAPON YENİ</Isim>
		<CurrencyName>JAPENESE YEN</CurrencyName>
		<ForexBuying>27.9900</ForexBuying>
		<ForexSelling>28.1000</ForexSelling>
		<BanknoteBuying>0</BanknoteBuying>
		<BanknoteSelling>0</BanknoteSelling>
		<CrossRateUSD>148.5000</CrossRateUSD>
		<CrossRateOther/>
	</Currency>
	<Currency CrossOrder="" Kod="XDR" CurrencyCode="XDR">
		<Unit>1</Unit>
		<Isim>ÖZEL ÇEKME HAKKI (SDR)</Isim>
		<CurrencyName>SDR</CurrencyName>
		<ForexBuying/>
		<ForexSelling/>
		<BanknoteBuying/>
		<BanknoteSelling/>
		<CrossRateUSD/>
		<CrossRateOther/>
	</Currency>
</Tarih_Date>`;

/** A bulletin in the same shape for another day: rows are [code, buying, selling]. */
function bulletinXml(tarih, date, rows) {
    const currencies = rows.map(([code, buying, selling]) => `	<Currency CrossOrder="0" Kod="${code}" CurrencyCode="${code}">
		<Unit>1</Unit><Isim>${code}</Isim><CurrencyName>${code}</CurrencyName>
		<ForexBuying>${buying}</ForexBuying><ForexSelling>${selling}</ForexSelling>
	</Currency>`).join("\n");
    return `<?xml version="1.0" encoding="UTF-8"?>\n<Tarih_Date Tarih="${tarih}"  Date="${date}"  Bulten_No="2026/189" >\n${currencies}\n</Tarih_Date>`;
}

const TCMB_PREVIOUS = bulletinXml("01.10.2026", "10/01/2026", [["USD", "41.3920", "41.4668"], ["EUR", "48.0500", "48.1364"], ["GBP", "55.6000", "55.7000"]]);

const GOLD_JSON = JSON.stringify({ currency: "USD", currencySymbol: "$", exchangeRate: 1, name: "Gold", price: 3345.1, symbol: "XAU", updatedAt: "2026-10-02T09:55:09Z", updatedAtReadable: "a few seconds ago" });

const COINGECKO_JSON = JSON.stringify({ bitcoin: { usd: 67234, usd_24h_change: 1.2345, try: 2795000, try_24h_change: 1.1, last_updated_at: 1790935500 } });

const DAY = (iso) => Date.parse(iso) / 1000;
/** Yahoo daily bars sit at the 10:00 Istanbul open (07:00 UTC). */
function yahooChart({ closes, days, marketTime, price = closes.at(-1), symbol = "XU100.IS", previousClose }) {
    return JSON.stringify({
        chart: {
            result: [{
                meta: { currency: "TRY", symbol, exchangeName: "IST", instrumentType: "INDEX", regularMarketTime: marketTime, regularMarketPrice: price, chartPreviousClose: 9980, dataGranularity: "1d", range: "5d", ...(previousClose ? { previousClose } : {}) },
                ...(days ? { timestamp: days.map((day) => DAY(`${day}T07:00:00Z`)), indicators: { quote: [{ close: closes }] } } : {}),
            }],
            error: null,
        },
    });
}
const YAHOO_JSON = yahooChart({
    days: ["2026-09-28", "2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02"],
    closes: [10010.2, 10060.8, 10120.4, 10180, 10250.5],
    marketTime: DAY("2026-10-02T10:40:00Z"),
});

/** Yahoo daily bars for the S&P 500 sit at the 09:30 New York open (13:30 UTC in summer time). */
function sp500Chart({ closes, days, marketTime, price = closes.at(-1), symbol = "^GSPC", gmtoffset = -14400 }) {
    return JSON.stringify({
        chart: {
            result: [{
                meta: { currency: "USD", symbol, exchangeName: "SNP", instrumentType: "INDEX", regularMarketTime: marketTime, regularMarketPrice: price, chartPreviousClose: 6500, gmtoffset, dataGranularity: "1d", range: "5d" },
                timestamp: days.map((day) => DAY(`${day}T13:30:00Z`)),
                indicators: { quote: [{ close: closes }] },
            }],
            error: null,
        },
    });
}
const SP500_JSON = sp500Chart({
    days: ["2026-09-28", "2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02"],
    closes: [6610.25, 6625.5, 6640, 6655.75, 6688.5],
    // 10:00 in New York: today's session is open, so yesterday is the 1 October bar.
    marketTime: DAY("2026-10-02T14:00:00Z"),
});

/** A fetchText that serves `routes` (url → body | Error) and answers 404 (null) for everything else. */
function fakeFetch(routes) {
    const calls = [];
    const fetchText = async (url) => {
        calls.push(url);
        if (!(url in routes)) return null;
        const body = routes[url];
        if (body instanceof Error) throw body;
        return body;
    };
    return { fetchText, calls };
}

const GOOD_ROUTES = {
    [TCMB_TODAY_URL]: TCMB_TODAY,
    [tcmbArchiveUrl("2026-10-01")]: TCMB_PREVIOUS,
    [GOLD_API_URL]: GOLD_JSON,
    [COINGECKO_URL]: COINGECKO_JSON,
    [YAHOO_BIST_URL]: YAHOO_JSON,
    [YAHOO_SP500_URL]: SP500_JSON,
};

// ---------------------------------------------------------------------------
// TCMB
// ---------------------------------------------------------------------------

test("TCMB bulletin: date, per-unit rates, empty and unreadable entries", () => {
    const bulletin = parseTcmbBulletin(TCMB_TODAY);
    assert.equal(bulletin.date, "2026-10-02");
    assert.deepEqual(bulletin.rates.USD, { buying: 41.5012, selling: 41.5761 });
    assert.deepEqual(bulletin.rates.EUR, { buying: 48.21, selling: 48.2966 });
    // Quoted per 100 yen in the file, normalised to one unit.
    assert.deepEqual(bulletin.rates.JPY, { buying: 0.2799, selling: 0.281 });
    // A currency without any forex rate is skipped rather than read as zero.
    assert.equal("XDR" in bulletin.rates, false);

    assert.equal(parseTcmbBulletin(null), null);
    assert.equal(parseTcmbBulletin(""), null);
    assert.equal(parseTcmbBulletin("<html><body>Bakımdayız</body></html>"), null);
    assert.equal(parseTcmbBulletin('<Tarih_Date Tarih="31.02.2026" Date="02/31/2026"><Currency Kod="USD"><Unit>1</Unit><ForexSelling>41.5</ForexSelling></Currency></Tarih_Date>'), null, "impossible date");
    assert.equal(parseTcmbBulletin('<Tarih_Date Tarih="02.10.2026" Date="10/02/2026"></Tarih_Date>'), null, "no currencies");
    // The US-style attribute is enough when the Turkish one is missing.
    assert.equal(parseTcmbBulletin('<Tarih_Date Date="10/02/2026"><Currency Kod="USD"><Unit>1</Unit><ForexSelling>41.5</ForexSelling></Currency></Tarih_Date>').date, "2026-10-02");
    // Zero, negative and non-numeric rates are not rates.
    const odd = parseTcmbBulletin('<Tarih_Date Tarih="02.10.2026"><Currency Kod="USD"><Unit>1</Unit><ForexBuying>0</ForexBuying><ForexSelling>-3</ForexSelling></Currency><Currency Kod="EUR"><Unit>1</Unit><ForexBuying>abc</ForexBuying><ForexSelling>48.3</ForexSelling></Currency></Tarih_Date>');
    assert.deepEqual(odd.rates, { EUR: { buying: null, selling: 48.3 } });
});

test("archive URLs and previous business days", () => {
    assert.equal(tcmbArchiveUrl("2026-10-01"), "https://www.tcmb.gov.tr/kurlar/202610/01102026.xml");
    assert.equal(tcmbArchiveUrl("2027-01-05"), "https://www.tcmb.gov.tr/kurlar/202701/05012027.xml");
    // 2026-10-05 is a Monday: the weekend is skipped.
    assert.deepEqual(previousWeekdays("2026-10-05", 3), ["2026-10-02", "2026-10-01", "2026-09-30"]);
    assert.deepEqual(previousWeekdays("2026-10-02", 2), ["2026-10-01", "2026-09-30"]);
    // Across a year boundary.
    assert.deepEqual(previousWeekdays("2027-01-04", 2), ["2027-01-01", "2026-12-31"]);
    assert.equal(tcmbPublishedAt("2026-10-02"), "2026-10-02T12:30:00.000Z", "15:30 in Turkey is 12:30 UTC");
});

test("exchange-rate items use the selling rate and the previous business day", () => {
    const items = buildFxItems(parseTcmbBulletin(TCMB_TODAY), parseTcmbBulletin(TCMB_PREVIOUS));
    assert.deepEqual(items.map((item) => item.id), ["usd-try", "eur-try", "gbp-try"]);
    const [usd, eur, gbp] = items;
    assert.equal(usd.label, "USD/TRY");
    assert.equal(usd.value, 41.5761);
    assert.equal(usd.change, 0.1093);
    assert.equal(usd.changePercent, 0.2636);
    assert.equal(usd.unit, "TRY");
    assert.equal(usd.source, "TCMB");
    assert.equal(usd.updatedAt, "2026-10-02T12:30:00.000Z");
    assert.equal(usd.changeBasis, "previous-business-day");
    assert.deepEqual(usd.details, { buying: 41.5012, selling: 41.5761 });
    assert.equal(eur.value, 48.2966);
    assert.equal(eur.change, 0.1602);
    assert.ok(gbp.change < 0 && gbp.changePercent < 0, "the pound fell");
    assert.equal(gbp.change, -0.2);
});

test("exchange-rate items without a comparison keep their value and drop the change", () => {
    const [usd] = buildFxItems(parseTcmbBulletin(TCMB_TODAY), null);
    assert.equal(usd.value, 41.5761);
    assert.equal(usd.change, null);
    assert.equal(usd.changePercent, null);
    assert.equal(usd.changeBasis, null);
    // The previous bulletin knows the dollar only: the other pairs have no comparison.
    const partial = buildFxItems(parseTcmbBulletin(TCMB_TODAY), parseTcmbBulletin(bulletinXml("01.10.2026", "10/01/2026", [["USD", "41.3920", "41.4668"]])));
    assert.equal(partial[0].change, 0.1093);
    assert.equal(partial[1].change, null);
    // Only a buying rate is published: use it, and compare buying with buying.
    const buyingOnly = buildFxItems(
        parseTcmbBulletin('<Tarih_Date Tarih="02.10.2026"><Currency Kod="USD"><Unit>1</Unit><ForexBuying>41.50</ForexBuying></Currency></Tarih_Date>'),
        parseTcmbBulletin('<Tarih_Date Tarih="01.10.2026"><Currency Kod="USD"><Unit>1</Unit><ForexBuying>41.00</ForexBuying><ForexSelling>41.10</ForexSelling></Currency></Tarih_Date>'),
    );
    assert.equal(buyingOnly[0].value, 41.5);
    assert.equal(buyingOnly[0].change, 0.5);
});

test("computeChange never fabricates a comparison", () => {
    assert.deepEqual(computeChange(110, 100), { change: 10, changePercent: 10 });
    assert.deepEqual(computeChange(90, 100), { change: -10, changePercent: -10 });
    for (const bad of [null, undefined, 0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
        assert.deepEqual(computeChange(100, bad), { change: null, changePercent: null }, String(bad));
    }
    assert.deepEqual(computeChange(Number.NaN, 100), { change: null, changePercent: null });
});

// ---------------------------------------------------------------------------
// Gold
// ---------------------------------------------------------------------------

test("gold quote parsing rejects anything that is not a gold price", () => {
    assert.deepEqual(parseGoldQuote(GOLD_JSON, NOW), { ounceUsd: 3345.1, updatedAt: "2026-10-02T09:55:09.000Z" });
    assert.equal(parseGoldQuote(JSON.stringify({ symbol: "XAG", price: 31.2 }), NOW), null, "silver is not gold");
    for (const body of [null, "", "not json", "[]", "null", JSON.stringify({ price: 0 }), JSON.stringify({ price: -5 }), JSON.stringify({ price: "abc" }), JSON.stringify({ symbol: "XAU" }), JSON.stringify({ error: "rate limited" })]) {
        assert.equal(parseGoldQuote(body, NOW), null, String(body));
    }
    // A missing or absurd timestamp falls back to the time of the request instead of inventing one.
    assert.equal(parseGoldQuote(JSON.stringify({ price: 3000 }), NOW).updatedAt, NOW.toISOString());
    assert.equal(parseGoldQuote(JSON.stringify({ price: 3000, updatedAt: "2099-01-01T00:00:00Z" }), NOW).updatedAt, NOW.toISOString());
    assert.equal(parseGoldQuote(JSON.stringify({ price: 3000, updatedAt: "garbage" }), NOW).updatedAt, NOW.toISOString());
});

test("gram gold is the ounce price divided by 31.1035 and multiplied by USD/TRY", () => {
    assert.ok(Math.abs(deriveGramGold(31.1034768, 40) - 40) < 1e-9, "one troy ounce is 31.1035 g");
    assert.ok(Math.abs(deriveGramGold(3345.1, 41.5761) - (3345.1 / 31.1035) * 41.5761) < 0.01);
    const item = buildGramGoldItem({ ounceUsd: 3345.1, updatedAt: "2026-10-02T09:55:09.000Z" }, 41.5761);
    assert.equal(item.id, "gram-gold");
    assert.equal(item.value, 4471.4);
    assert.equal(item.unit, "TRY");
    assert.equal(item.change, null, "there is no honest previous value to compare with");
    assert.equal(item.changePercent, null);
    assert.equal(item.updatedAt, "2026-10-02T09:55:09.000Z");
    assert.deepEqual(item.details, { ounceUsd: 3345.1, usdTry: 41.5761 });
    assert.match(item.source, /gold-api\.com/);
    assert.match(item.source, /TCMB/);
});

// ---------------------------------------------------------------------------
// Bitcoin
// ---------------------------------------------------------------------------

test("bitcoin comes from the USD price with its 24-hour change", () => {
    const quote = parseBitcoinQuote(COINGECKO_JSON, NOW);
    assert.deepEqual(quote, { usd: 67234, try: 2795000, changePercent: 1.2345, updatedAt: "2026-10-02T10:05:00.000Z" });
    const item = markets.buildBitcoinItem(quote);
    assert.equal(item.id, "bitcoin");
    assert.equal(item.value, 67234);
    assert.equal(item.unit, "USD");
    assert.equal(item.changePercent, 1.23);
    assert.equal(item.change, 819.88);
    assert.equal(item.changeBasis, "24h");
    assert.deepEqual(item.details, { valueTry: 2795000 });
    assert.equal(item.source, "CoinGecko");

    // No change field: the price still shows, with no arrow.
    const bare = markets.buildBitcoinItem(parseBitcoinQuote(JSON.stringify({ bitcoin: { usd: 67000 } }), NOW));
    assert.equal(bare.value, 67000);
    assert.equal(bare.change, null);
    assert.equal(bare.changeBasis, null);
    assert.equal(bare.details, undefined);
    // A -100 % "change" cannot be turned into a previous price.
    assert.equal(markets.buildBitcoinItem({ usd: 1, try: null, changePercent: -100, updatedAt: NOW.toISOString() }).change, null);

    for (const body of [null, "", "{}", JSON.stringify({ bitcoin: {} }), JSON.stringify({ bitcoin: { usd: 0 } }), JSON.stringify({ ethereum: { usd: 3000 } }), JSON.stringify({ status: { error_code: 429 } }), "<html>"]) {
        assert.equal(parseBitcoinQuote(body, NOW), null, String(body));
    }
});

// ---------------------------------------------------------------------------
// BIST 100
// ---------------------------------------------------------------------------

test("BIST 100: the previous close is yesterday's bar, not the start of the range", () => {
    const quote = parseBistQuote(YAHOO_JSON, NOW);
    assert.equal(quote.value, 10250.5);
    assert.equal(quote.previousClose, 10180);
    assert.equal(quote.updatedAt, "2026-10-02T10:40:00.000Z");
    const item = buildBistItem(quote);
    assert.equal(item.id, "bist-100");
    assert.equal(item.label, "BIST 100");
    assert.equal(item.unit, "pts");
    assert.equal(item.change, 70.5);
    assert.equal(item.changePercent, 0.69);
    assert.equal(item.changeBasis, "previous-close");
    assert.equal(item.source, "Yahoo Finance");
});

test("BIST 100: a quote from a session that has no daily bar yet compares with the newest bar", () => {
    const body = yahooChart({
        days: ["2026-09-28", "2026-09-29", "2026-09-30", "2026-10-01"],
        closes: [10010.2, 10060.8, 10120.4, 10180],
        marketTime: DAY("2026-10-02T07:15:00Z"),
        price: 10199.9,
    });
    const quote = parseBistQuote(body, NOW);
    assert.equal(quote.value, 10199.9);
    assert.equal(quote.previousClose, 10180);
    // An unfinished bar with a null close is ignored the same way.
    const withHole = yahooChart({
        days: ["2026-09-30", "2026-10-01", "2026-10-02"],
        closes: [10120.4, 10180, null],
        marketTime: DAY("2026-10-02T07:15:00Z"),
        price: 10199.9,
    });
    assert.equal(parseBistQuote(withHole, NOW).previousClose, 10180);
});

test("BIST 100: without bars the provider's own previous close is used, and bad payloads give nothing", () => {
    const noBars = yahooChart({ closes: [], marketTime: DAY("2026-10-02T10:40:00Z"), price: 10250.5, previousClose: 10180 });
    const quote = parseBistQuote(noBars, NOW);
    assert.equal(quote.value, 10250.5);
    assert.equal(quote.previousClose, 10180);
    const noReference = parseBistQuote(yahooChart({ closes: [], marketTime: DAY("2026-10-02T10:40:00Z"), price: 10250.5 }), NOW);
    assert.equal(noReference.previousClose, null);
    assert.equal(buildBistItem(noReference).change, null);

    assert.equal(parseBistQuote(yahooChart({ closes: [100], days: ["2026-10-02"], marketTime: 1, symbol: "AAPL" }), NOW), null, "wrong instrument");
    assert.equal(parseBistQuote(yahooChart({ closes: [], marketTime: 1, price: 0 }), NOW), null, "no price at all");
    for (const body of [null, "", "{}", "garbage", JSON.stringify({ chart: { result: null, error: { code: "Not Found", description: "No data found" } } }), JSON.stringify({ chart: { result: [] } }), JSON.stringify({ finance: { error: { code: "Too Many Requests" } } })]) {
        assert.equal(parseBistQuote(body, NOW), null, String(body));
    }
});

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------

test("every provider answering gives the eight items in display order", async () => {
    const { fetchText } = fakeFetch(GOOD_ROUTES);
    const result = await collectMarkets({ fetchText, now: NOW, memo: createMarketsMemo() });
    assert.deepEqual(result.items.map((item) => item.id), [...MARKET_ORDER]);
    assert.deepEqual(result.failures, []);
    assert.deepEqual(failedMarketIds(result), []);
    const byId = Object.fromEntries(result.items.map((item) => [item.id, item]));
    assert.equal(byId["usd-try"].change, 0.1093, "compared with the 2026-10-01 bulletin");
    // The lira price of gold is built from the same dollar rate the strip shows.
    assert.equal(byId["gram-gold"].value, 4471.4);
    assert.equal(byId["gram-gold"].details.usdTry, byId["usd-try"].value);
    assert.equal(byId["ounce-gold"].value, 3345.1);
    assert.equal(byId["bist-100"].value, 10250.5);
    assert.equal(byId["sp-500"].value, 6688.5);
    assert.equal(byId.bitcoin.value, 67234);
    // The payload is plain JSON.
    assert.deepEqual(JSON.parse(JSON.stringify(result.items)), result.items);
});

test("a failing provider removes only its own items", async () => {
    const run = async (broken) => collectMarkets({ fetchText: fakeFetch({ ...GOOD_ROUTES, ...broken }).fetchText, now: NOW, memo: createMarketsMemo() });

    const noBitcoin = await run({ [COINGECKO_URL]: new Error("HTTP 429") });
    assert.deepEqual(noBitcoin.items.map((item) => item.id), ["usd-try", "eur-try", "gbp-try", "gram-gold", "ounce-gold", "bist-100", "sp-500"]);
    assert.deepEqual(noBitcoin.failures, [{ provider: "bitcoin", reason: "HTTP 429", ids: ["bitcoin"] }]);

    const noBist = await run({ [YAHOO_BIST_URL]: "<html>Edge: Too Many Requests</html>" });
    assert.deepEqual(noBist.items.map((item) => item.id), ["usd-try", "eur-try", "gbp-try", "gram-gold", "ounce-gold", "sp-500", "bitcoin"]);
    assert.deepEqual(failedMarketIds(noBist), ["bist-100"]);

    const noGold = await run({ [GOLD_API_URL]: new Error("HTTP 503") });
    assert.deepEqual(noGold.items.map((item) => item.id), ["usd-try", "eur-try", "gbp-try", "bist-100", "sp-500", "bitcoin"]);
    assert.deepEqual(failedMarketIds(noGold), ["gram-gold", "ounce-gold"]);

    const noSp500 = await run({ [YAHOO_SP500_URL]: new Error("HTTP 429") });
    assert.deepEqual(failedMarketIds(noSp500), ["sp-500"]);
    assert.equal(noSp500.items.length, MARKET_ORDER.length - 1);

    // Without the TCMB bulletin there are no lira rates, and gold cannot be priced in lira either
    // (the dollar price per ounce still shows).
    const noTcmb = await run({ [TCMB_TODAY_URL]: new Error("HTTP 500") });
    assert.deepEqual(noTcmb.items.map((item) => item.id), ["ounce-gold", "bist-100", "sp-500", "bitcoin"]);
    assert.deepEqual(failedMarketIds(noTcmb).sort(), ["eur-try", "gbp-try", "gram-gold", "usd-try"]);

    // A bulletin that lacks the pound still yields the other pairs.
    const noPound = await run({ [TCMB_TODAY_URL]: bulletinXml("02.10.2026", "10/02/2026", [["USD", "41.5012", "41.5761"], ["EUR", "48.2100", "48.2966"]]) });
    assert.deepEqual(noPound.items.map((item) => item.id), ["usd-try", "eur-try", "gram-gold", "ounce-gold", "bist-100", "sp-500", "bitcoin"]);
    assert.deepEqual(failedMarketIds(noPound), ["gbp-try"]);
});

test("nothing is invented when every provider is down", async () => {
    const result = await collectMarkets({ fetchText: async () => { throw new Error("network down"); }, now: NOW, memo: createMarketsMemo() });
    assert.deepEqual(result.items, []);
    assert.equal(failedMarketIds(result).length, MARKET_ORDER.length);
    const notFound = await collectMarkets({ fetchText: async () => null, now: NOW, memo: createMarketsMemo() });
    assert.deepEqual(notFound.items, []);
});

test("a missing previous bulletin only costs the change arrow", async () => {
    const routes = { ...GOOD_ROUTES, [tcmbArchiveUrl("2026-10-01")]: new Error("HTTP 500") };
    const { fetchText } = fakeFetch(routes);
    const result = await collectMarkets({ fetchText, now: NOW, memo: createMarketsMemo() });
    const usd = result.items.find((item) => item.id === "usd-try");
    assert.equal(usd.value, 41.5761);
    assert.equal(usd.change, null);
    assert.equal(usd.changeBasis, null);
    assert.equal(result.items.length, MARKET_ORDER.length);

    // An archive file that is not the bulletin of the requested day is not trusted.
    const wrongDay = fakeFetch({ ...GOOD_ROUTES, [tcmbArchiveUrl("2026-10-01")]: bulletinXml("29.09.2026", "09/29/2026", [["USD", "40", "40.1"]]) });
    const mismatched = await collectMarkets({ fetchText: wrongDay.fetchText, now: NOW, memo: createMarketsMemo() });
    assert.equal(mismatched.items.find((item) => item.id === "usd-try").change, null);
});

test("the previous business day skips holidays and is looked up once per bulletin", async () => {
    // Bulletin of Wednesday 7 Oct; Tuesday 6th was a holiday (404), Monday 5th has a bulletin.
    const today = bulletinXml("07.10.2026", "10/07/2026", [["USD", "42.00", "42.10"], ["EUR", "49.00", "49.10"], ["GBP", "56.00", "56.10"]]);
    const monday = bulletinXml("05.10.2026", "10/05/2026", [["USD", "41.00", "41.10"], ["EUR", "48.00", "48.10"], ["GBP", "55.00", "55.10"]]);
    const routes = { [TCMB_TODAY_URL]: today, [tcmbArchiveUrl("2026-10-05")]: monday, [GOLD_API_URL]: GOLD_JSON, [COINGECKO_URL]: COINGECKO_JSON, [YAHOO_BIST_URL]: YAHOO_JSON };
    const memo = createMarketsMemo();
    const first = fakeFetch(routes);
    const result = await collectMarkets({ fetchText: first.fetchText, now: NOW, memo });
    const usd = result.items.find((item) => item.id === "usd-try");
    assert.equal(usd.change, 1, "compared with Monday, not with the holiday");
    assert.deepEqual(first.calls.filter((url) => url.includes("/kurlar/2")).sort(), [tcmbArchiveUrl("2026-10-05"), tcmbArchiveUrl("2026-10-06")]);

    const second = fakeFetch(routes);
    const again = await collectMarkets({ fetchText: second.fetchText, now: NOW, memo });
    assert.equal(again.items.find((item) => item.id === "usd-try").change, 1);
    assert.deepEqual(second.calls.filter((url) => url.includes("/kurlar/2")), [], "archived bulletins never change, so they are not fetched again");
});

test("a long break reaches further back, nearest bulletin first", async () => {
    // Monday 12 Oct after a break: only Friday 2 Oct and Thursday 1 Oct exist.
    const today = bulletinXml("12.10.2026", "10/12/2026", [["USD", "42.00", "42.10"]]);
    const friday = bulletinXml("02.10.2026", "10/02/2026", [["USD", "41.00", "41.60"]]);
    const thursday = bulletinXml("01.10.2026", "10/01/2026", [["USD", "40.00", "40.60"]]);
    const { fetchText, calls } = fakeFetch({ [TCMB_TODAY_URL]: today, [tcmbArchiveUrl("2026-10-02")]: friday, [tcmbArchiveUrl("2026-10-01")]: thursday });
    const result = await collectMarkets({ fetchText, now: NOW, memo: createMarketsMemo() });
    assert.equal(result.items.find((item) => item.id === "usd-try").change, 0.5, "Friday, not Thursday");
    assert.ok(calls.includes(tcmbArchiveUrl("2026-10-09")), "the first two weekdays are tried first");
});

test("S&P 500: yesterday's close comes from the bars, in New York's calendar", () => {
    const quote = parseSp500Quote(SP500_JSON, NOW);
    assert.equal(quote.value, 6688.5);
    assert.equal(quote.previousClose, 6655.75);
    const item = buildSp500Item(quote);
    assert.equal(item.id, "sp-500");
    assert.equal(item.label, "S&P 500");
    assert.equal(item.unit, "pts");
    assert.equal(item.source, "Yahoo Finance");
    assert.equal(item.change, 32.75);
    assert.equal(item.changeBasis, "previous-close");

    // Before the open the newest bar is still yesterday's session, so it is the reference itself.
    const preOpen = sp500Chart({ days: ["2026-09-30", "2026-10-01"], closes: [6640, 6655.75], marketTime: DAY("2026-10-02T12:00:00Z"), price: 6660 });
    assert.equal(parseSp500Quote(preOpen, NOW).previousClose, 6655.75);
    // Late in the evening UTC is already the next day, but New York is not.
    const evening = sp500Chart({ days: ["2026-10-01", "2026-10-02"], closes: [6655.75, 6688.5], marketTime: DAY("2026-10-03T00:30:00Z") });
    assert.equal(parseSp500Quote(evening, NOW).previousClose, 6655.75);

    assert.equal(parseSp500Quote(YAHOO_JSON, NOW), null, "a BIST response is not the S&P 500");
    assert.equal(parseBistQuote(SP500_JSON, NOW), null, "and the other way round");
});

test("ounce gold is the provider's dollar price per troy ounce", () => {
    const item = buildOunceGoldItem(parseGoldQuote(GOLD_JSON, NOW));
    assert.equal(item.id, "ounce-gold");
    assert.equal(item.value, 3345.1);
    assert.equal(item.unit, "USD");
    assert.equal(item.source, "gold-api.com");
    assert.equal(item.change, null);
});
