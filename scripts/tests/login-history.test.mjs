// Run: node --test scripts/tests/
// The account's recent sign-ins (src/lib/login-history.ts): the device family
// instead of the user agent, the country instead of the address, the last ten.
import assert from "node:assert/strict";
import test from "node:test";
import { load } from "./setup.mjs";

const { LOGIN_HISTORY_MAX, countryFromHeaders, deviceLabel, readLoginHistory, withLogin } = await load("lib/login-history.ts");

const AGENTS = {
    chromeWindows: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
    edge: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0",
    safariIphone: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
    chromeIphone: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/141.0 Mobile/15E148 Safari/604.1",
    firefoxLinux: "Mozilla/5.0 (X11; Linux x86_64; rv:141.0) Gecko/20100101 Firefox/141.0",
    samsung: "Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36",
    safariMac: "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15",
    electron: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) HanogtCodev/1.4.0 Chrome/138.0.0.0 Electron/37.2.0 Safari/537.36",
};

test("the device is a browser and system family, never the whole user agent", () => {
    assert.equal(deviceLabel(AGENTS.chromeWindows), "Chrome · Windows");
    assert.equal(deviceLabel(AGENTS.edge), "Edge · Windows");
    assert.equal(deviceLabel(AGENTS.safariIphone), "Safari · iPhone");
    assert.equal(deviceLabel(AGENTS.chromeIphone), "Chrome · iPhone");
    assert.equal(deviceLabel(AGENTS.firefoxLinux), "Firefox · Linux");
    assert.equal(deviceLabel(AGENTS.samsung), "Samsung Internet · Android");
    assert.equal(deviceLabel(AGENTS.safariMac), "Safari · macOS");
    assert.equal(deviceLabel(AGENTS.electron), "Hanogt Codev · Windows");
    assert.equal(deviceLabel("curl/8.0"), "");
    assert.equal(deviceLabel(undefined), "");
});

test("the country comes from the edge network's header; unknown, Tor and junk are left out", () => {
    assert.equal(countryFromHeaders(new Headers({ "cf-ipcountry": "TR" })), "TR");
    assert.equal(countryFromHeaders({ "x-vercel-ip-country": "de" }), "DE");
    for (const value of ["XX", "T1", "TUR", "", "1A"]) assert.equal(countryFromHeaders({ "cf-ipcountry": value }), null, value);
    assert.equal(countryFromHeaders(null), null);
});

test("a sign-in goes first; the history keeps the last ten and drops broken entries", () => {
    const earlier = Array.from({ length: 12 }, (_, index) => ({ at: new Date(Date.UTC(2026, 9, 1, index)), method: index % 2 ? "google" : "password", device: "Firefox · Linux", country: "TR" }));
    const next = withLogin([...earlier, { at: "never", method: "password" }, { at: new Date(), method: "magic" }, "x"], {
        at: new Date(Date.UTC(2026, 9, 5, 12)),
        method: "google",
        headers: { "user-agent": AGENTS.safariIphone, "cf-ipcountry": "AZ", "x-forwarded-for": "203.0.113.9" },
    });
    assert.equal(next.length, LOGIN_HISTORY_MAX);
    assert.ok(next[0].at instanceof Date, "stored as a date");
    assert.deepEqual({ ...next[0], at: next[0].at.toISOString() }, { at: "2026-10-05T12:00:00.000Z", method: "google", device: "Safari · iPhone", country: "AZ" });
    assert.ok(!JSON.stringify(next).includes("203.0.113.9"), "no IP address");
    assert.equal(next[1].at.toISOString(), "2026-10-01T11:00:00.000Z", "newest first");
});

test("what the browser reads back is checked again", () => {
    const read = readLoginHistory([
        { at: "2026-10-05T12:00:00.000Z", method: "password", device: "Chrome · Windows\u0007", country: "tr" },
        { at: "2026-10-04T12:00:00.000Z", method: "google", device: 42, country: "TR" },
        { at: "x", method: "google" },
        null,
    ]);
    assert.deepEqual(read, [
        { at: "2026-10-05T12:00:00.000Z", method: "password", device: "Chrome · Windows", country: null },
        { at: "2026-10-04T12:00:00.000Z", method: "google", device: "", country: "TR" },
    ]);
    assert.deepEqual(readLoginHistory("x"), []);
});
