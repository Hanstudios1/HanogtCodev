// Run: node --test scripts/tests/*.test.mjs
// The admin panel's server side (lib/server/admin-pages.ts, ai-usage-stats.ts,
// admin-activity.ts, admin-insights.ts and the announcement slots in
// admin.ts): pages that never skip or repeat a row (also when times are equal
// or rows are filtered while reading), Hanogt AI's daily totals in Türkiye
// time, the overview's buckets, the Social and AI summaries (totals only),
// open feedback, and two admins switching announcements on at once.
import assert from "node:assert/strict";
import test from "node:test";
import { setFakeEmulatorEnv, withBackend } from "./fake-backend.mjs";
import { load } from "./setup.mjs";

setFakeEmulatorEnv();
for (const key of ["HANOGT_AI_API_KEY", "HANOGT_AI_BASE_URL", "HANOGT_AI_MODEL"]) delete process.env[key];

const pages = await load("lib/server/admin-pages.ts");
const stats = await load("lib/server/ai-usage-stats.ts");
const activity = await load("lib/server/admin-activity.ts");
const insights = await load("lib/server/admin-insights.ts");
const admin = await load("lib/server/admin.ts");
const firebase = await load("lib/server/firebase-rest.ts");
const { AUTOMOD_RULE_COPY } = await load("lib/social/automod-config.ts");

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
/** 12:00 in Türkiye on 6 October 2026. */
const NOW = Date.parse("2026-10-06T09:00:00.000Z");
const iso = (at) => new Date(at).toISOString();

/** Every page of a list, following the cursors (at most `max` pages). */
async function allPages(read, max = 20) {
    const seen = [];
    let cursor = null;
    for (let index = 0; index < max; index += 1) {
        const page = await read(cursor);
        seen.push(page.items);
        if (!page.nextCursor) return seen;
        cursor = pages.decodeCursor(page.nextCursor, page.collectionId ?? "users");
        assert.ok(cursor, "a cursor the server made must decode");
    }
    throw new Error("too many pages");
}

test("page cursors round-trip and refuse what isn't theirs", () => {
    const cursor = { at: "2026-10-06T09:00:00.000Z", path: "users/ali@example.com" };
    const encoded = pages.encodeCursor(cursor);
    assert.match(encoded, /^[A-Za-z0-9_-]+$/);
    assert.deepEqual(pages.decodeCursor(encoded, "users"), cursor);
    assert.equal(pages.decodeCursor(encoded, "feedback"), null, "another collection's cursor");
    assert.equal(pages.decodeCursor("not-a-cursor", "users"), null);
    assert.equal(pages.decodeCursor(pages.encodeCursor({ at: "yesterday", path: "users/x" }), "users"), null);
    assert.equal(pages.decodeCursor(pages.encodeCursor({ at: cursor.at, path: "users/x/files/y" }), "users"), null, "a nested path");
    assert.equal(pages.decodeCursor(undefined, "users"), null);

    assert.equal(pages.readPageCursor(new URLSearchParams(), "users"), null);
    assert.deepEqual(pages.readPageCursor(new URLSearchParams({ cursor: encoded }), "users"), cursor);
    assert.throws(() => pages.readPageCursor(new URLSearchParams({ cursor: "garbage" }), "users"), (error) => error instanceof admin.AdminHttpError && error.status === 400 && error.code === "invalid_cursor");
});

test("searches ignore case, accents and the dotless i", () => {
    assert.equal(pages.foldText("Şikâyet İÇİN"), "sikayet icin");
    assert.equal(pages.readSearch(new URLSearchParams({ q: "  IVAN " })), "ivan");
    assert.equal(pages.readSearch(new URLSearchParams({ q: "   " })), null);
    assert.throws(() => pages.readSearch(new URLSearchParams({ q: "x".repeat(101) })), (error) => error.code === "invalid_query");
    assert.ok(pages.matchesSearch("sikayet", [null, "Bir şikâyet var"]));
    assert.ok(pages.matchesSearch("ivan", ["IVAN@example.com"]));
    assert.ok(!pages.matchesSearch("ivan", ["ali@example.com", undefined]));
});

test("pages never skip or repeat rows with the same time", async () => {
    const times = [NOW, NOW, NOW, NOW - HOUR, NOW - HOUR, NOW - 2 * HOUR, NOW - 3 * HOUR];
    const seed = Object.fromEntries(times.map((at, index) => [`users/u${index}@example.com`, { createdAt: iso(at), n: index }]));
    // Not listed: no time at all.
    seed["users/legacy@example.com"] = { n: 99 };
    await withBackend(seed, {}, async () => {
        const result = await allPages((cursor) => pages.newestPage({ collectionId: "users", field: "createdAt", limit: 3, cursor }));
        assert.deepEqual(result.map((page) => page.length), [3, 3, 1]);
        const order = result.flat().map((row) => row._id);
        // Newest first; equal times by path, last first.
        assert.deepEqual(order, ["u2@example.com", "u1@example.com", "u0@example.com", "u4@example.com", "u3@example.com", "u5@example.com", "u6@example.com"]);
    });
});

test("text times page as text; a timestamp there isn't listed", async () => {
    const seed = {
        "news_comments/c1": { createdAt: iso(NOW - 1000), text: "one" },
        "news_comments/c2": { createdAt: iso(NOW - 2000), text: "two" },
        "news_comments/c3": { createdAt: iso(NOW - 3000), text: "three" },
        // Stored as a timestamp: a query for text times doesn't see it.
        "news_comments/c4": { createdAt: new Date(NOW), text: "four" },
    };
    await withBackend(seed, {}, async () => {
        const result = await allPages(async (cursor) => ({
            ...(await pages.newestPage({ collectionId: "news_comments", field: "createdAt", text: true, limit: 2, cursor })),
            collectionId: "news_comments",
        }));
        assert.deepEqual(result.flat().map((row) => row._id), ["c1", "c2", "c3"]);
    });
});

test("filtered pages read on from where the last one stopped", async () => {
    const seed = Object.fromEntries(Array.from({ length: 10 }, (_, index) => [`feedback/f${index}`, { createdAt: iso(NOW - index * HOUR), even: index % 2 === 0 }]));
    let queries = 0;
    await withBackend(seed, {}, async (backend) => {
        const original = globalThis.fetch;
        globalThis.fetch = (input, init) => {
            if (String(typeof input === "string" ? input : input.url).endsWith(":runQuery")) queries += 1;
            return original(input, init);
        };
        try {
            const result = await allPages(async (cursor) => ({
                ...(await pages.newestPage({ collectionId: "feedback", field: "createdAt", limit: 2, cursor, keep: (row) => row.even === true, maxScan: 3 })),
                collectionId: "feedback",
            }));
            // At most three rows are read per page, so some pages come back short.
            assert.ok(result.some((page) => page.length < 2));
            assert.deepEqual(result.flat().map((row) => row._id), ["f0", "f2", "f4", "f6", "f8"]);
            assert.ok(backend.paths().length === 10);
        } finally {
            globalThis.fetch = original;
        }
    });
    assert.ok(queries >= 4, `${queries} reads`);
});

test("a filtered page stops at the last row it used", async () => {
    // Four matching rows in one batch, a page of two: the next page starts right after the second.
    const seed = Object.fromEntries(Array.from({ length: 6 }, (_, index) => [`admin_audit_log/a${index}`, { createdAt: iso(NOW - index * HOUR), action: index < 4 ? "user.suspend" : "report.resolve" }]));
    await withBackend(seed, {}, async () => {
        const result = await allPages(async (cursor) => ({
            ...(await pages.newestPage({ collectionId: "admin_audit_log", field: "createdAt", limit: 2, cursor, keep: (row) => row.action === "user.suspend" })),
            collectionId: "admin_audit_log",
        }));
        assert.deepEqual(result.map((page) => page.map((row) => row._id)), [["a0", "a1"], ["a2", "a3"], []]);
    });
});

test("Hanogt AI days follow Türkiye's calendar", () => {
    assert.equal(stats.usageDayKey(Date.parse("2026-10-05T20:59:59.999Z")), "2026-10-05");
    assert.equal(stats.usageDayKey(Date.parse("2026-10-05T21:00:00.000Z")), "2026-10-06");
    assert.equal(stats.dayKeyStart("2026-10-06"), Date.parse("2026-10-05T21:00:00.000Z"));
    assert.equal(stats.turkeyDayStart(NOW), Date.parse("2026-10-05T21:00:00.000Z"));
    assert.equal(stats.turkeyDayStart(Date.parse("2026-10-05T21:00:00.000Z")), Date.parse("2026-10-05T21:00:00.000Z"));
});

test("daily totals count messages and refunds without anyone's details", async () => {
    await withBackend({}, {}, async (backend) => {
        await stats.recordAiUsage({ source: "chat", plan: "plus" }, NOW);
        await stats.recordAiUsage({ source: "chat", plan: "plus" }, NOW + HOUR);
        await stats.recordAiUsage({ source: "group", plan: "free" }, NOW + 2 * HOUR);
        await stats.recordAiUsage({ source: "chat", plan: "plus", refund: true }, NOW + 3 * HOUR);
        // 00:30 the next day in Türkiye.
        await stats.recordAiUsage({ source: "api", plan: "pro" }, Date.parse("2026-10-06T21:30:00.000Z"));

        const today = backend.get("ai_usage_daily/2026-10-06");
        assert.equal(today.day, "2026-10-06");
        assert.equal(today.messages, 3);
        assert.equal(today.source_chat, 2);
        assert.equal(today.source_group, 1);
        assert.equal(today.plan_plus, 2);
        assert.equal(today.plan_free, 1);
        assert.equal(today.refunds, 1);
        assert.equal(today.refund_chat, 1);
        assert.equal(Date.parse(today.expiresAt), Date.parse("2026-10-05T21:00:00.000Z") + 400 * DAY);
        assert.deepEqual(Object.keys(today).sort(), ["day", "expiresAt", "messages", "plan_free", "plan_plus", "refund_chat", "refunds", "source_chat", "source_group"]);

        const days = await stats.readAiUsageDays("2026-10-01", "2026-10-07");
        assert.deepEqual(days.map((day) => day.day), ["2026-10-06", "2026-10-07"]);
        assert.deepEqual(days[0], { day: "2026-10-06", messages: 3, refunds: 1, sources: { chat: 2, own: 0, api: 0, group: 1 }, plans: { free: 1, plus: 2, pro: 0 } });
        assert.equal(days[1].sources.api, 1);
        assert.deepEqual(await stats.readAiUsageDays("2026-10-07", "2026-10-07").then((list) => list.map((day) => day.day)), ["2026-10-07"]);
    });
});

test("activity buckets are whole Türkiye days or weeks ending tonight", () => {
    const tonight = Date.parse("2026-10-06T21:00:00.000Z");
    for (const [range, count, size] of [[7, 7, DAY], [30, 30, DAY], [90, 13, 7 * DAY]]) {
        const buckets = activity.activityBuckets(range, NOW);
        assert.equal(buckets.length, count);
        assert.equal(buckets.at(-1).end, tonight);
        buckets.forEach((bucket, index) => {
            assert.equal(bucket.end - bucket.start, size);
            if (index) assert.equal(bucket.start, buckets[index - 1].end);
        });
    }
    assert.ok(activity.isActivityRange(30));
    assert.ok(!activity.isActivityRange("30"));
});

test("the overview counts each series per day and the period before", async () => {
    const day = (offset) => stats.usageDayKey(NOW - offset * DAY);
    const seed = {
        "users/a@example.com": { createdAt: iso(NOW - HOUR) },
        "users/b@example.com": { createdAt: iso(NOW - 2 * HOUR) },
        "users/c@example.com": { createdAt: iso(NOW - 3 * DAY) },
        "users/d@example.com": { createdAt: iso(NOW - 10 * DAY) },
        "users/e@example.com": { createdAt: iso(NOW - 20 * DAY) },
        "security_events/s1": { createdAt: iso(NOW - HOUR), risk: "high" },
        "automod_events/m1": { createdAt: iso(NOW - DAY), rule: "profanity" },
        "automod_events/m2": { createdAt: iso(NOW - DAY), rule: "links" },
        [`ai_usage_daily/${day(0)}`]: { day: day(0), messages: 5 },
        [`ai_usage_daily/${day(2)}`]: { day: day(2), messages: 2 },
        [`ai_usage_daily/${day(8)}`]: { day: day(8), messages: 4 },
        [`ai_usage_daily/${day(30)}`]: { day: day(30), messages: 100 },
    };
    await withBackend(seed, {}, async () => {
        const result = await activity.buildActivity(7, NOW);
        assert.equal(result.unit, "day");
        assert.equal(result.buckets.length, 7);
        const series = (key) => result.buckets.map((bucket) => bucket.values[key]);
        assert.deepEqual(series("signups"), [0, 0, 0, 1, 0, 0, 2]);
        assert.deepEqual(series("aiMessages"), [0, 0, 0, 0, 2, 0, 5]);
        assert.deepEqual(series("securityEvents"), [0, 0, 0, 0, 0, 0, 1]);
        assert.deepEqual(series("automodStops"), [0, 0, 0, 0, 0, 2, 0]);
        assert.deepEqual(result.totals, { signups: 3, aiMessages: 7, securityEvents: 1, automodStops: 2 });
        assert.deepEqual(result.previous, { signups: 1, aiMessages: 4, securityEvents: 0, automodStops: 0 });

        const weeks = await activity.buildActivity(90, NOW);
        assert.equal(weeks.unit, "week");
        assert.equal(weeks.buckets.length, 13);
        assert.equal(weeks.totals.signups, 5);
        assert.equal(weeks.totals.aiMessages, 111);
    });
});

test("a series that can't be counted is shown as unavailable, not as zero", async () => {
    await withBackend({ "users/a@example.com": { createdAt: iso(NOW - HOUR) } }, {
        failQuery: ({ collectionId }) => (collectionId === "automod_events" ? 503 : 0),
    }, async () => {
        const result = await activity.buildActivity(7, NOW);
        assert.equal(result.totals.automodStops, null);
        assert.ok(result.buckets.every((bucket) => bucket.values.automodStops === null));
        assert.equal(result.totals.signups, 1);
    });
});

test("the Hanogt AI summary adds up sources, plans and refunds", async () => {
    const day = (offset) => stats.usageDayKey(NOW - offset * DAY);
    const seed = {
        [`ai_usage_daily/${day(0)}`]: { day: day(0), messages: 6, refunds: 1, source_chat: 4, source_api: 2, plan_free: 1, plan_plus: 5, refund_chat: 1 },
        [`ai_usage_daily/${day(1)}`]: { day: day(1), messages: 3, source_group: 2, source_own: 1, plan_pro: 3 },
        [`ai_usage_daily/${day(9)}`]: { day: day(9), messages: 10, refunds: 2, source_chat: 10, plan_free: 10 },
        [`ai_usage_daily/${day(40)}`]: { day: day(40), messages: 1, source_chat: 1, plan_free: 1 },
    };
    await withBackend(seed, {}, async () => {
        const result = await insights.buildAiUsage(7, NOW);
        assert.deepEqual(result.totals, { messages: 9, refunds: 1, sources: { chat: 4, own: 1, api: 2, group: 2 }, plans: { free: 1, plus: 5, pro: 3 } });
        assert.deepEqual(result.previous, { messages: 10, refunds: 2 });
        assert.deepEqual(result.buckets.map((bucket) => bucket.messages), [0, 0, 0, 0, 0, 3, 6]);
        assert.equal(result.firstDay, day(40));
        assert.deepEqual(result.model, { configured: false, name: null });
        assert.equal(result.limits.free.perWindow > 0, true);
        // Totals only: nothing in the answer names an account.
        assert.doesNotMatch(JSON.stringify(result), /@/);
    });
});

test("the Social summary counts records and never returns who reported whom", async () => {
    const rules = Object.keys(AUTOMOD_RULE_COPY);
    const seed = {
        "groups/g1": { name: "Alpha" },
        "groups/g2": { name: "Beta" },
        "groups/g3": { name: "Gamma" },
        "chats/c1": { participants: ["a@example.com", "b@example.com"] },
        "group_voice/g1": { updatedAt: iso(NOW - 10_000) },
        "group_voice/g2": { updatedAt: iso(NOW - 5 * 60_000) },
        "group_reports/r1": { groupId: "g2", status: "open", reporter: "a@example.com", target: "b@example.com" },
        "group_reports/r2": { groupId: "g2", status: "open", reporter: "c@example.com", target: "b@example.com" },
        "group_reports/r3": { groupId: "g2", status: "open", reporter: "d@example.com", target: "e@example.com" },
        "group_reports/r4": { groupId: "g1", status: "open", reporter: "a@example.com", target: "f@example.com" },
        "group_reports/r5": { groupId: "g1", status: "closed", reporter: "a@example.com", target: "f@example.com" },
        "automod_events/m1": { rule: rules[0], email: "a@example.com", createdAt: iso(NOW) },
        "automod_events/m2": { rule: rules[0], email: "b@example.com", createdAt: iso(NOW) },
        "automod_events/m3": { rule: rules[1], email: "b@example.com", createdAt: iso(NOW) },
        "message_files/f1": { size: 100 },
        "message_files/f2": { size: 250 },
    };
    await withBackend(seed, {}, async () => {
        const result = await insights.buildSocialOverview(NOW);
        const count = (value) => value?.count;
        assert.equal(count(result.counts.groups), 3);
        assert.equal(count(result.counts.directChats), 1);
        assert.equal(count(result.counts.voiceChannelsLive), 1);
        assert.equal(count(result.counts.reportsOpen), 4);
        assert.equal(count(result.counts.reportsTotal), 5);
        assert.equal(count(result.counts.automodStops), 3);
        assert.equal(count(result.counts.files), 2);
        assert.equal(result.fileBytes, 350);
        assert.deepEqual(result.automodByRule.slice(0, 2), [{ rule: rules[0], count: 2 }, { rule: rules[1], count: 1 }]);
        assert.equal(result.automodByRule.length, rules.length);
        assert.deepEqual(result.reportedGroups, [{ id: "g2", name: "Beta", open: 3 }, { id: "g1", name: "Alpha", open: 1 }]);
        assert.doesNotMatch(JSON.stringify(result), /@/);
    });
});

test("open feedback includes items from before statuses existed", async () => {
    const seed = {
        "feedback/a": { content: "old" },
        "feedback/b": { content: "old too" },
        "feedback/c": { status: "open" },
        "feedback/d": { status: "done" },
        "feedback/e": { status: "planned" },
        "feedback/f": { status: "closed" },
    };
    await withBackend(seed, {}, async () => {
        assert.deepEqual(await admin.countOpenFeedback(), { count: 3, capped: false });
    });
});

test("two admins switching announcements on at once can't pass the limit together", async () => {
    const active = (id) => ({ text: { TR: `Duyuru ${id}`, EN: `Notice ${id}` }, level: "info", active: true, createdAt: iso(NOW) });
    const seed = Object.fromEntries(["a1", "a2", "a3", "a4"].map((id) => [`site_announcements/${id}`, active(id)]));
    seed["site_announcements/off"] = { ...active("off"), active: false };
    seed["site_announcements/ended"] = { ...active("ended"), endsAt: iso(NOW - HOUR) };
    await withBackend(seed, {}, async (backend) => {
        // Both read the same four occupied slots...
        const [first, second] = await Promise.all([admin.claimAnnouncementSlot(undefined, NOW), admin.claimAnnouncementSlot(undefined, NOW)]);
        await firebase.commitServerMutations([{ type: "create", path: "site_announcements/a5", data: active("a5") }, first]);
        // ...but only the first write gets the fifth.
        await assert.rejects(
            firebase.commitServerMutations([{ type: "create", path: "site_announcements/a6", data: active("a6") }, second]),
            (error) => firebase.isWriteConflict(error),
        );
        assert.ok(!backend.has("site_announcements/a6"));
        await assert.rejects(admin.claimAnnouncementSlot(undefined, NOW), (error) => error.status === 409 && error.code === "too_many_active");
        // Switching one that already holds a slot back on doesn't need another.
        await assert.doesNotReject(admin.claimAnnouncementSlot("a1", NOW));

        // With the slot record in place, the precondition is its version.
        await firebase.commitServerMutations([{ type: "update", path: "site_announcements/a5", data: { active: false }, updateFields: ["active"] }]);
        const [third, fourth] = await Promise.all([admin.claimAnnouncementSlot("off", NOW), admin.claimAnnouncementSlot("off", NOW)]);
        assert.equal(third.type, "update");
        await firebase.commitServerMutations([third]);
        await assert.rejects(firebase.commitServerMutations([fourth]), (error) => firebase.isWriteConflict(error));
    });
});
