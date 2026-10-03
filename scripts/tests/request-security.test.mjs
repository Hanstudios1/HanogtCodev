// Run: node --test scripts/tests/
// The visitor's address behind Cloudflare (lib/server/request-security.ts):
// CF-Connecting-IP counts only when the request reached Vercel from one of
// Cloudflare's addresses; IPv4 and IPv6 CIDR blocks.
import assert from "node:assert/strict";
import test from "node:test";
import { load } from "./setup.mjs";

const security = await load("lib/server/request-security.ts");
const headers = (values) => new Headers(values);

test("CIDR blocks: IPv4, IPv6, IPv4-mapped IPv6 and junk", () => {
    const { ipInCidrs, isCidr } = security;
    assert.equal(ipInCidrs("34.194.127.46", ["34.194.127.46/32"]), true);
    assert.equal(ipInCidrs("34.194.127.47", ["34.194.127.46/32"]), false);
    assert.equal(ipInCidrs("::ffff:34.194.127.46", ["34.194.127.46/32"]), true, "an IPv4-mapped address is IPv4");
    assert.equal(ipInCidrs("10.1.2.3", ["10.0.0.0/8"]), true);
    assert.equal(ipInCidrs("10.1.2.3", ["0.0.0.0/0"]), true);
    assert.equal(ipInCidrs("2606:4700:3031::ac43:8360", ["2606:4700::/32"]), true);
    assert.equal(ipInCidrs("2606:4701::1", ["2606:4700::/32"]), false);
    assert.equal(ipInCidrs("2a06:98c7:ffff::1", ["2a06:98c0::/29"]), true);
    assert.equal(ipInCidrs("2a06:98c8::1", ["2a06:98c0::/29"]), false);
    assert.equal(ipInCidrs("2001:db8::1", ["0.0.0.0/0"]), false, "IPv6 never matches an IPv4 block");
    assert.equal(ipInCidrs("1.2.3.4", ["::/0"]), false, "and the other way round");
    for (const bad of ["unknown", "", "1.2.3", "1.2.3.400", "1:2:3:4:5:6:7:8:9", "::1::2", "gggg::1", null, undefined]) {
        assert.equal(ipInCidrs(bad, ["0.0.0.0/0", "::/0"]), false, String(bad));
    }
    assert.equal(ipInCidrs("1.2.3.4", ["bogus", "1.2.3.400/32", "1.2.3.4/33"]), false);
    assert.deepEqual(["10.0.0.0/8", "2400:cb00::/32", "1.2.3.4", "1.2.3.0/33", "::/129", "x/8", 7].map(isCidr), [true, true, true, false, false, false, false]);
});

test("visitor address: CF-Connecting-IP only when Vercel saw a Cloudflare address", () => {
    const { clientIpFromHeaders, CLOUDFLARE_CIDRS } = security;
    assert.equal(CLOUDFLARE_CIDRS.length, 22);
    // hanogtcodev.com: Cloudflare → Vercel. Vercel names Cloudflare's edge, Cloudflare names the visitor.
    assert.equal(clientIpFromHeaders(headers({ "x-vercel-forwarded-for": "172.70.231.15", "x-forwarded-for": "172.70.231.15", "cf-connecting-ip": "88.230.10.20" })), "88.230.10.20");
    assert.equal(clientIpFromHeaders(headers({ "x-vercel-forwarded-for": "2a06:98c0:3600::103", "cf-connecting-ip": "2a02:e0:1::5" })), "2a02:e0:1::5", "IPv6 on both sides");
    assert.equal(clientIpFromHeaders(headers({ "x-real-ip": "162.158.95.1", "cf-connecting-ip": "34.194.127.46" })), "34.194.127.46", "x-real-ip when Vercel's header is missing");
    // Straight to *.vercel.app: a CF-Connecting-IP header is just text anyone can send.
    assert.equal(clientIpFromHeaders(headers({ "x-vercel-forwarded-for": "203.0.113.9", "cf-connecting-ip": "34.194.127.46" })), "203.0.113.9");
    assert.equal(clientIpFromHeaders(headers({ "x-vercel-forwarded-for": "203.0.113.9", "x-forwarded-for": "172.70.1.1", "cf-connecting-ip": "34.194.127.46" })), "203.0.113.9", "Vercel's own header wins over a forged x-forwarded-for");
    // No platform address at all: CF-Connecting-IP alone is not trusted.
    assert.equal(clientIpFromHeaders(headers({ "cf-connecting-ip": "34.194.127.46" })), "unknown");
    assert.equal(clientIpFromHeaders(headers({})), "unknown");
    // Junk in either header.
    assert.equal(clientIpFromHeaders(headers({ "x-vercel-forwarded-for": "172.70.231.15", "cf-connecting-ip": "not-an-ip" })), "172.70.231.15");
    assert.equal(clientIpFromHeaders(headers({ "x-vercel-forwarded-for": "nonsense", "x-forwarded-for": "198.51.100.7, 172.70.1.1" })), "198.51.100.7");
    // Plain objects (NextAuth's request headers) work the same way.
    assert.equal(clientIpFromHeaders({ "x-vercel-forwarded-for": "104.23.0.1", "cf-connecting-ip": "5.6.7.8" }), "5.6.7.8");
    assert.equal(clientIpFromHeaders({ "x-forwarded-for": ["9.9.9.9"] }), "9.9.9.9");
});

test("visitor country for prices: Cloudflare's header only through Cloudflare, Vercel's otherwise", () => {
    const headers = (entries) => new Headers(entries);
    // Through Cloudflare: Vercel locates Cloudflare's server (US); the visitor is in Türkiye.
    assert.equal(security.visitorCountryFromHeaders(headers({ "x-vercel-forwarded-for": "172.70.10.20", "x-vercel-ip-country": "US", "cf-ipcountry": "tr" })), "TR");
    // Straight to the deployment: a CF-IPCountry anyone can send is ignored.
    assert.equal(security.visitorCountryFromHeaders(headers({ "x-vercel-forwarded-for": "198.51.100.7", "x-vercel-ip-country": "DE", "cf-ipcountry": "TR" })), "DE");
    // Unknown and Tor count as unknown; no headers at all too.
    assert.equal(security.visitorCountryFromHeaders(headers({ "x-vercel-forwarded-for": "172.70.10.20", "cf-ipcountry": "XX" })), null);
    assert.equal(security.visitorCountryFromHeaders(headers({ "x-vercel-forwarded-for": "172.70.10.20", "cf-ipcountry": "T1" })), null);
    assert.equal(security.visitorCountryFromHeaders(headers({ "x-vercel-forwarded-for": "172.70.10.20", "x-vercel-ip-country": "US" })), null, "through Cloudflare without its header: not Cloudflare's server country");
    assert.equal(security.visitorCountryFromHeaders(headers({})), null);
    assert.equal(security.visitorCountryFromHeaders(headers({ "x-vercel-ip-country": "<script>" })), null);
});
