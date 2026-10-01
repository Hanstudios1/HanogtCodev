// Run: node --test scripts/tests/
import assert from "node:assert/strict";
import test from "node:test";
import { load } from "./setup.mjs";

const support = await load("lib/support.ts");
const {
    TICKET_LIMITS, TICKET_CATEGORIES, TICKET_STATUSES, TICKET_PRIORITIES, TICKET_SEVERITIES,
    TICKET_CATEGORY_COPY, TICKET_STATUS_COPY, TICKET_PRIORITY_COPY, TICKET_SEVERITY_COPY, SUPPORT_ERROR_COPY,
    RECORD_REASON_COPY, RECORD_VERDICT_COPY,
    sanitizeTicketText, validateTicketDraft, validateTicketMessage, normalizePageUrl, normalizeUserAgent,
    defaultTicketPriority, statusAfterStaffReply, statusAfterUserReply, canUserClose, canUserReopen,
    ticketReference, isTicketId, messagePreview, foldSearchText, matchesSearch,
    evaluateUserRecord, accountAgeDays,
} = support;

const CLEAN_FACTS = {
    accountExists: true, accountAgeDays: 400, suspendedNow: false, previousSuspensions: 0, contentRemovals: 0, staffDeletions: 0,
    reportsUpheld: 0, reportsOpen: 0, reportsDismissed: 0, securityEvents: 0, securityEventsCritical: 0, groupBans: 0, incomplete: false,
};

test("text is normalised: unsafe characters go, line breaks are unified", () => {
    assert.equal(sanitizeTicketText("  Editör\u0000 ‮kapanıyor\t\n ", false), "Editör kapanıyor");
    assert.equal(sanitizeTicketText("a\r\nb\rc\n\n\n\n\nd  \n", true), "a\nb\nc\n\nd");
    // Decomposed "ö" (o + combining diaeresis) becomes the single code point.
    assert.equal(sanitizeTicketText("ö", false), "ö");
    // Zero-width joiners stay so emoji sequences survive.
    assert.equal(sanitizeTicketText("👩‍💻", false), "👩‍💻");
});

test("a valid bug report keeps its steps and page; other categories drop them", () => {
    const result = validateTicketDraft({
        category: "bug",
        title: "  Kaydet   düğmesi çalışmıyor ",
        description: "Kaydet'e basınca sayfa donuyor.\r\n\r\n\r\n\r\nTekrar deneyince de aynı.",
        steps: "1. Editörü aç\n2. Kaydet",
        pageUrl: "/editor?lang=python",
        severity: "critical",
    });
    assert.equal(result.ok, true);
    assert.deepEqual(result.draft, {
        category: "bug",
        title: "Kaydet düğmesi çalışmıyor",
        description: "Kaydet'e basınca sayfa donuyor.\n\nTekrar deneyince de aynı.",
        steps: "1. Editörü aç\n2. Kaydet",
        pageUrl: "/editor?lang=python",
        severity: null,
    });

    const question = validateTicketDraft({ category: "question", title: "Nasıl yapılır?", description: "Grup davet bağlantısı nasıl oluşturulur?", steps: "x", pageUrl: "javascript:alert(1)", severity: "high" });
    assert.equal(question.ok, true);
    assert.equal(question.draft.steps, null);
    assert.equal(question.draft.pageUrl, null);
    assert.equal(question.draft.severity, null);
});

test("security reports accept a known severity only", () => {
    const base = { category: "security", title: "XSS açığı", description: "Profil biyografisinde betik çalışıyor." };
    assert.equal(validateTicketDraft({ ...base, severity: "high" }).draft.severity, "high");
    assert.equal(validateTicketDraft({ ...base }).draft.severity, null);
    assert.equal(validateTicketDraft({ ...base, severity: "" }).draft.severity, null);
    assert.deepEqual(validateTicketDraft({ ...base, severity: "apocalyptic" }), { ok: false, errors: [{ field: "severity", code: "invalid_severity" }] });
});

test("required fields and limits are reported per field", () => {
    assert.deepEqual(validateTicketDraft({}).errors, [
        { field: "category", code: "invalid_category" },
        { field: "title", code: "title_required" },
        { field: "description", code: "description_required" },
    ]);
    const tooShort = validateTicketDraft({ category: "other", title: "ab", description: "kısa" });
    assert.deepEqual(tooShort.errors, [{ field: "title", code: "title_too_short" }, { field: "description", code: "description_too_short" }]);
    const tooLong = validateTicketDraft({ category: "other", title: "x".repeat(TICKET_LIMITS.title + 1), description: "y".repeat(TICKET_LIMITS.description + 1) });
    assert.deepEqual(tooLong.errors, [{ field: "title", code: "title_too_long" }, { field: "description", code: "description_too_long" }]);
    const steps = validateTicketDraft({ category: "bug", title: "Hata başlığı", description: "Yeterince uzun açıklama.", steps: "z".repeat(TICKET_LIMITS.steps + 1) });
    assert.deepEqual(steps.errors, [{ field: "steps", code: "steps_too_long" }]);
    // Whitespace-only text counts as empty; wrong types are rejected outright.
    assert.deepEqual(validateTicketDraft({ category: "feedback", title: " \n\t ", description: 42 }).errors, [
        { field: "title", code: "title_required" },
        { field: "description", code: "invalid_body" },
    ]);
    // Exactly at the limit is fine.
    assert.equal(validateTicketDraft({ category: "feedback", title: "t".repeat(TICKET_LIMITS.title), description: "d".repeat(TICKET_LIMITS.description) }).ok, true);
});

test("page addresses: http(s) links and site paths only", () => {
    assert.equal(normalizePageUrl(undefined), null);
    assert.equal(normalizePageUrl("   "), null);
    assert.equal(normalizePageUrl("/groups/join/abc"), "/groups/join/abc");
    assert.equal(normalizePageUrl("https://hanogtcodev.com/editor#x"), "https://hanogtcodev.com/editor#x");
    assert.equal(normalizePageUrl("http://localhost:3000/feedback"), "http://localhost:3000/feedback");
    for (const bad of ["//evil.example", "javascript:alert(1)", "data:text/html,x", "https://user:pw@evil.example", "https://a b.com", "ftp://x.com/f", "/path\"onmouseover", 7, "/" + "a".repeat(TICKET_LIMITS.pageUrl)]) {
        assert.equal(normalizePageUrl(bad), undefined, String(bad));
    }
    assert.deepEqual(validateTicketDraft({ category: "bug", title: "Hata başlığı", description: "Yeterince uzun açıklama.", pageUrl: "//evil.example" }).errors, [{ field: "pageUrl", code: "invalid_page_url" }]);
});

test("messages and user agents", () => {
    assert.deepEqual(validateTicketMessage("  Teşekkürler!  "), { ok: true, text: "Teşekkürler!" });
    assert.deepEqual(validateTicketMessage("   \n "), { ok: false, code: "message_required" });
    assert.deepEqual(validateTicketMessage(undefined), { ok: false, code: "message_required" });
    assert.deepEqual(validateTicketMessage({ text: "x" }), { ok: false, code: "invalid_body" });
    assert.deepEqual(validateTicketMessage("m".repeat(TICKET_LIMITS.message + 1)), { ok: false, code: "message_too_long" });
    assert.equal(normalizeUserAgent("Mozilla/5.0\u0000 (X11)\n Firefox"), "Mozilla/5.0 (X11) Firefox");
    assert.equal(normalizeUserAgent("u".repeat(1_000)).length, TICKET_LIMITS.userAgent);
    assert.equal(normalizeUserAgent(""), null);
    assert.equal(normalizeUserAgent(null), null);
});

test("priorities and status transitions", () => {
    assert.equal(defaultTicketPriority("security"), "high");
    assert.equal(defaultTicketPriority("security", "critical"), "critical");
    assert.equal(defaultTicketPriority("security", "low"), "high");
    assert.equal(defaultTicketPriority("bug", "critical"), "normal");

    assert.equal(statusAfterStaffReply("open"), "answered");
    assert.equal(statusAfterStaffReply("in_progress"), "answered");
    assert.equal(statusAfterStaffReply("resolved"), "resolved");
    assert.equal(statusAfterStaffReply("closed"), "closed");

    assert.equal(statusAfterUserReply("answered"), "open");
    assert.equal(statusAfterUserReply("resolved"), "open");
    assert.equal(statusAfterUserReply("in_progress"), "in_progress");
    assert.equal(statusAfterUserReply("open"), "open");
    assert.equal(statusAfterUserReply("closed"), null);

    assert.deepEqual(TICKET_STATUSES.filter(canUserClose), ["open", "in_progress", "answered", "resolved"]);
    assert.deepEqual(TICKET_STATUSES.filter(canUserReopen), ["resolved", "closed"]);
});

test("ticket ids and references", () => {
    assert.equal(isTicketId("3fa9c2d1e4b5a6978877"), true);
    for (const bad of ["3FA9C2D1E4B5A6978877", "../credentials/x", "3fa9c2d1", "", null, 12]) assert.equal(isTicketId(bad), false, String(bad));
    assert.equal(ticketReference("3fa9c2d1e4b5a6978877"), "3FA9C2D1");
    assert.equal(messagePreview("kısa   metin\n\nikinci satır"), "kısa metin ikinci satır");
    const long = messagePreview("x".repeat(TICKET_LIMITS.preview + 50));
    assert.equal(long.length, TICKET_LIMITS.preview);
    assert.equal(long.endsWith("…"), true);
});

test("search ignores case, Turkish letters and diacritics", () => {
    assert.equal(foldSearchText("  IŞIK  Güvenlİk ÇAĞRI Öğle "), "isik guvenlik cagri ogle");
    assert.equal(foldSearchText("Café"), "cafe");
    assert.equal(matchesSearch("İki adımlı doğrulama", "iki adimli"), true);
    assert.equal(matchesSearch("Şifremi unuttum", "SIFRE"), true);
    assert.equal(matchesSearch("Verilerimi nasıl silerim?", "VERİ sil"), true);
    assert.equal(matchesSearch("Verilerimi nasıl silerim?", "veri indir"), false);
    assert.equal(matchesSearch("anything", "   "), true);
});

test("sender record verdicts", () => {
    assert.deepEqual(evaluateUserRecord(CLEAN_FACTS), { verdict: "clean", reasons: [] });

    // Info reasons are shown but keep the record clean.
    const fresh = evaluateUserRecord({ ...CLEAN_FACTS, accountAgeDays: 2, incomplete: true });
    assert.equal(fresh.verdict, "clean");
    assert.deepEqual(fresh.reasons.map((reason) => reason.code), ["new_account", "partial"]);

    const notice = evaluateUserRecord({ ...CLEAN_FACTS, reportsOpen: 2, securityEvents: 1, groupBans: 1 });
    assert.equal(notice.verdict, "notice");
    assert.deepEqual(notice.reasons.map((reason) => [reason.code, reason.severity, reason.count]), [
        ["security_events", "notice", 1],
        ["group_bans", "notice", 1],
        ["reports_open", "notice", 2],
    ]);

    for (const facts of [
        { suspendedNow: true },
        { previousSuspensions: 1 },
        { contentRemovals: 1 },
        { reportsUpheld: 3 },
        { staffDeletions: 3 },
        { securityEvents: 5 },
        { securityEventsCritical: 3, securityEvents: 3 },
        { groupBans: 3 },
    ]) {
        assert.equal(evaluateUserRecord({ ...CLEAN_FACTS, ...facts }).verdict, "flagged", JSON.stringify(facts));
    }

    // Flagged reasons come first.
    const mixed = evaluateUserRecord({ ...CLEAN_FACTS, reportsOpen: 1, previousSuspensions: 2, accountAgeDays: 1 });
    assert.deepEqual(mixed.reasons.map((reason) => reason.severity), ["flagged", "notice", "info"]);
    assert.equal(evaluateUserRecord({ ...CLEAN_FACTS, accountExists: false }).verdict, "notice");
});

test("account age in whole days", () => {
    const now = Date.parse("2026-10-01T12:00:00.000Z");
    assert.equal(accountAgeDays("2026-09-30T12:00:00.000Z", now), 1);
    assert.equal(accountAgeDays("2026-10-01T11:00:00.000Z", now), 0);
    assert.equal(accountAgeDays("2027-01-01T00:00:00.000Z", now), null);
    assert.equal(accountAgeDays("not a date", now), null);
    assert.equal(accountAgeDays(null, now), null);
});

test("every label and error code has Turkish and English text", () => {
    const complete = (copy, name) => {
        assert.equal(typeof copy.TR, "string", name);
        assert.equal(typeof copy.EN, "string", name);
        assert.ok(copy.TR.trim() && copy.EN.trim(), name);
        // Placeholders need a value: either from `vars` or from the caller ({count} for record reasons).
        for (const match of `${copy.TR} ${copy.EN}`.matchAll(/\{(\w+)\}/g)) {
            assert.ok(match[1] === "count" || (copy.vars && match[1] in copy.vars), `${name}: {${match[1]}}`);
        }
    };
    for (const category of TICKET_CATEGORIES) {
        complete(TICKET_CATEGORY_COPY[category].label, category);
        complete(TICKET_CATEGORY_COPY[category].hint, category);
    }
    for (const status of TICKET_STATUSES) complete(TICKET_STATUS_COPY[status].label, status);
    for (const priority of TICKET_PRIORITIES) complete(TICKET_PRIORITY_COPY[priority], priority);
    for (const severity of TICKET_SEVERITIES) complete(TICKET_SEVERITY_COPY[severity].label, severity);
    for (const [code, copy] of Object.entries(SUPPORT_ERROR_COPY)) complete(copy, code);
    for (const [code, copy] of Object.entries(RECORD_REASON_COPY)) complete(copy, code);
    for (const [code, entry] of Object.entries(RECORD_VERDICT_COPY)) complete(entry.label, code);
    // Every code a validator can return has a message.
    for (const code of ["invalid_category", "title_required", "title_too_short", "title_too_long", "description_required", "description_too_short", "description_too_long", "steps_too_long", "invalid_page_url", "invalid_severity", "message_required", "message_too_long", "invalid_body"]) {
        assert.ok(SUPPORT_ERROR_COPY[code], code);
    }
});

test("FAQ entries are unique, bilingual and fill their placeholders", async () => {
    const { FAQS, FAQ_CATEGORIES } = await load("lib/faq.ts");
    const ids = new Set();
    for (const faq of FAQS) {
        assert.ok(!ids.has(faq.id), faq.id);
        ids.add(faq.id);
        for (const copy of [faq.category, faq.question, faq.answer]) {
            assert.ok(copy.TR.trim() && copy.EN.trim(), faq.id);
            for (const match of `${copy.TR} ${copy.EN}`.matchAll(/\{(\w+)\}/g)) assert.ok(copy.vars && match[1] in copy.vars, `${faq.id}: {${match[1]}}`);
        }
        assert.ok(FAQ_CATEGORIES.includes(faq.category), faq.id);
    }
    const languages = FAQS.find((faq) => faq.id === "code-languages");
    assert.equal(languages.answer.vars.usable, languages.answer.vars.runnable + languages.answer.vars.preview);
});
