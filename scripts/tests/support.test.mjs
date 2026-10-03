// Run: node --test scripts/tests/
import assert from "node:assert/strict";
import test from "node:test";
import { load } from "./setup.mjs";

const support = await load("lib/support.ts");
const {
    TICKET_LIMITS, TICKET_CATEGORIES, LEGACY_TICKET_CATEGORIES, STORED_TICKET_CATEGORIES, COMPLAINT_SUBJECTS, BAN_SCOPES,
    TICKET_STATUSES, TICKET_PRIORITIES, TICKET_SEVERITIES,
    TICKET_CATEGORY_COPY, COMPLAINT_SUBJECT_COPY, BAN_SCOPE_COPY, KVKK_REQUEST_HINT,
    TICKET_STATUS_COPY, TICKET_PRIORITY_COPY, TICKET_SEVERITY_COPY, SUPPORT_ERROR_COPY,
    RECORD_REASON_COPY, RECORD_VERDICT_COPY,
    STAFF_TICKET_NOTIFICATION_TITLES, STAFF_TICKET_NOTIFICATION_COPY, staffTicketNotificationId, staffTicketLink, staffTicketEventOf,
    isTicketCategory, isLegacyTicketCategory, isStoredTicketCategory,
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
    assert.equal(sanitizeTicketText("  Editör\u0000 \u202ekapanıyor\t\n ", false), "Editör kapanıyor");
    assert.equal(sanitizeTicketText("a\r\nb\rc\n\n\n\n\nd  \n", true), "a\nb\nc\n\nd");
    // Decomposed "ö" (o + combining diaeresis) becomes the single code point.
    assert.equal(sanitizeTicketText("o\u0308", false), "ö");
    // Zero-width joiners stay so emoji sequences survive.
    assert.equal(sanitizeTicketText("👩\u200d💻", false), "👩\u200d💻");
});

test("new tickets use the six categories; old ones stay readable only", () => {
    assert.deepEqual([...TICKET_CATEGORIES], ["complaint", "request", "security", "ban_appeal", "question", "feedback"]);
    assert.deepEqual([...LEGACY_TICKET_CATEGORIES], ["bug", "account", "other"]);
    assert.deepEqual([...STORED_TICKET_CATEGORIES], [...TICKET_CATEGORIES, ...LEGACY_TICKET_CATEGORIES]);
    for (const category of TICKET_CATEGORIES) {
        assert.equal(isTicketCategory(category), true, category);
        assert.equal(isLegacyTicketCategory(category), false, category);
        assert.equal(isStoredTicketCategory(category), true, category);
    }
    for (const category of LEGACY_TICKET_CATEGORIES) {
        assert.equal(isTicketCategory(category), false, category);
        assert.equal(isLegacyTicketCategory(category), true, category);
        assert.equal(isStoredTicketCategory(category), true, category);
        // Filed before the change: shown with an "(old)" label, never accepted again.
        assert.match(TICKET_CATEGORY_COPY[category].label.TR, /\(eski\)$/);
        assert.match(TICKET_CATEGORY_COPY[category].label.EN, /\(old\)$/);
        assert.deepEqual(validateTicketDraft({ category, title: "Eski kategori", description: "Bu kategori artık seçilemez." }).errors, [{ field: "category", code: "invalid_category" }]);
    }
    for (const bad of ["all", "Şikayet", "", null, 3, "__proto__"]) assert.equal(isStoredTicketCategory(bad), false, String(bad));
    assert.deepEqual(
        TICKET_CATEGORIES.map((category) => TICKET_CATEGORY_COPY[category].label.TR),
        ["Şikayet", "İstek", "Güvenlik Açığı", "Ban Kaldırma İsteği", "Soru", "Geri Bildirim"],
    );
    assert.equal(KVKK_REQUEST_HINT.TR, "KVKK başvuruları için bu kategoriyi seçin.");
});

test("a complaint keeps its optional subject, user and link; other categories drop them", () => {
    const result = validateTicketDraft({
        category: "complaint",
        title: "  Hakaret   içeren yorum ",
        description: "Yorumda bana hakaret edildi.\r\n\r\n\r\n\r\nEkran adı aşağıda.",
        complaintSubject: "user",
        reportedUser: "  kod\u202eKral#1234  ",
        contentUrl: "/media/abc?x=1",
        severity: "critical",
        banScope: "group",
        banReference: "Grup",
    });
    assert.equal(result.ok, true);
    assert.deepEqual(result.draft, {
        category: "complaint",
        title: "Hakaret içeren yorum",
        description: "Yorumda bana hakaret edildi.\n\nEkran adı aşağıda.",
        severity: null,
        complaintSubject: "user",
        reportedUser: "kodKral#1234",
        contentUrl: "/media/abc?x=1",
        banScope: null,
        banReference: null,
    });
    // Everything except the description is optional; "" counts as not given.
    const bare = validateTicketDraft({ category: "complaint", title: "Yavaş site", description: "Sayfalar çok geç açılıyor.", complaintSubject: "", reportedUser: " ", contentUrl: "" });
    assert.equal(bare.ok, true);
    assert.deepEqual([bare.draft.complaintSubject, bare.draft.reportedUser, bare.draft.contentUrl], [null, null, null]);
    for (const subject of COMPLAINT_SUBJECTS) {
        assert.equal(validateTicketDraft({ category: "complaint", title: "Konu", description: "Yeterince uzun açıklama.", complaintSubject: subject }).draft.complaintSubject, subject);
    }
    assert.deepEqual(validateTicketDraft({
        category: "complaint", title: "Konu", description: "Yeterince uzun açıklama.",
        complaintSubject: "everyone", reportedUser: "u".repeat(TICKET_LIMITS.reportedUser + 1), contentUrl: "javascript:alert(1)",
    }).errors, [
        { field: "complaintSubject", code: "invalid_complaint_subject" },
        { field: "reportedUser", code: "reported_user_too_long" },
        { field: "contentUrl", code: "invalid_content_url" },
    ]);

    // Other categories ignore the complaint, ban and severity fields instead of failing.
    const question = validateTicketDraft({
        category: "question", title: "Nasıl yapılır?", description: "Grup davet bağlantısı nasıl oluşturulur?",
        complaintSubject: "nope", reportedUser: 42, contentUrl: "javascript:alert(1)", banScope: "moon", banReference: "x", severity: "high", steps: "x", pageUrl: "//evil",
    });
    assert.equal(question.ok, true);
    assert.deepEqual(question.draft, {
        category: "question", title: "Nasıl yapılır?", description: "Grup davet bağlantısı nasıl oluşturulur?",
        severity: null, complaintSubject: null, reportedUser: null, contentUrl: null, banScope: null, banReference: null,
    });
    // Old bug-report fields are no longer part of a draft.
    assert.equal("steps" in question.draft || "pageUrl" in question.draft, false);
});

test("an unban request names what was banned; a group needs its name", () => {
    const base = { category: "ban_appeal", title: "Yasağımın kaldırılmasını istiyorum", description: "Yanlışlıkla yasaklandığımı düşünüyorum." };
    assert.deepEqual(validateTicketDraft(base).errors, [{ field: "banScope", code: "invalid_ban_scope" }]);
    assert.deepEqual(validateTicketDraft({ ...base, banScope: "planet" }).errors, [{ field: "banScope", code: "invalid_ban_scope" }]);
    assert.deepEqual(validateTicketDraft({ ...base, banScope: "group" }).errors, [{ field: "banReference", code: "ban_reference_required" }]);
    assert.deepEqual(validateTicketDraft({ ...base, banScope: "group", banReference: "   " }).errors, [{ field: "banReference", code: "ban_reference_required" }]);
    assert.deepEqual(validateTicketDraft({ ...base, banScope: "group", banReference: "g".repeat(TICKET_LIMITS.banReference + 1) }).errors, [{ field: "banReference", code: "ban_reference_too_long" }]);

    const group = validateTicketDraft({ ...base, banScope: "group", banReference: "  Python   Severler ", severity: "high", reportedUser: "x" });
    assert.equal(group.ok, true);
    assert.deepEqual([group.draft.banScope, group.draft.banReference, group.draft.severity, group.draft.reportedUser], ["group", "Python Severler", null, null]);
    // The account itself needs no reference, so one sent anyway is dropped.
    const account = validateTicketDraft({ ...base, banScope: "account", banReference: "hesabım" });
    assert.deepEqual([account.ok, account.draft.banScope, account.draft.banReference], [true, "account", null]);
    const other = validateTicketDraft({ ...base, banScope: "other" });
    assert.deepEqual([other.ok, other.draft.banScope, other.draft.banReference], [true, "other", null]);
    for (const scope of BAN_SCOPES) assert.equal(validateTicketDraft({ ...base, banScope: scope, banReference: "Ad" }).ok, true, scope);
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
    const tooShort = validateTicketDraft({ category: "question", title: "ab", description: "kısa" });
    assert.deepEqual(tooShort.errors, [{ field: "title", code: "title_too_short" }, { field: "description", code: "description_too_short" }]);
    const tooLong = validateTicketDraft({ category: "request", title: "x".repeat(TICKET_LIMITS.title + 1), description: "y".repeat(TICKET_LIMITS.description + 1) });
    assert.deepEqual(tooLong.errors, [{ field: "title", code: "title_too_long" }, { field: "description", code: "description_too_long" }]);
    // Category errors come with the text errors, so the form can mark every field at once.
    assert.deepEqual(validateTicketDraft({ category: "ban_appeal", title: "ab", description: "Yeterince uzun açıklama." }).errors, [
        { field: "title", code: "title_too_short" },
        { field: "banScope", code: "invalid_ban_scope" },
    ]);
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
    // A complaint's content link follows the same rules.
    assert.deepEqual(validateTicketDraft({ category: "complaint", title: "Şikayet", description: "Yeterince uzun açıklama.", contentUrl: "//evil.example" }).errors, [{ field: "contentUrl", code: "invalid_content_url" }]);
    assert.equal(validateTicketDraft({ category: "complaint", title: "Şikayet", description: "Yeterince uzun açıklama.", contentUrl: "https://hanogtcodev.com/media/x" }).draft.contentUrl, "https://hanogtcodev.com/media/x");
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
    assert.equal(defaultTicketPriority("ban_appeal"), "high");
    for (const category of ["complaint", "request", "question", "feedback"]) assert.equal(defaultTicketPriority(category), "normal", category);
    // Only a security report's severity counts.
    assert.equal(defaultTicketPriority("question", "critical"), "normal");

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

test("the author's plan: Plus and Pro tickets start high, an upgrade moves a ticket up, Pro comes first", () => {
    const { planTicketPriority, ticketPlanUpdate, compareInboxTickets, readTicketPlan } = support;
    assert.equal(readTicketPlan("pro"), "pro");
    assert.equal(readTicketPlan("gold"), null);
    assert.equal(readTicketPlan(undefined), null, "tickets from before plans were noted");

    assert.equal(planTicketPriority("normal", "free"), "normal");
    assert.equal(planTicketPriority("low", "plus"), "high");
    assert.equal(planTicketPriority("normal", "pro"), "high");
    assert.equal(planTicketPriority("critical", "plus"), "critical", "a higher priority stays");

    // The follow-up of someone who moved up since: the ticket moves up too.
    assert.deepEqual(ticketPlanUpdate({ authorPlan: "free", priority: "normal" }, "plus"), { authorPlan: "plus", priority: "high" });
    assert.deepEqual(ticketPlanUpdate({ authorPlan: null, priority: "low" }, "pro"), { authorPlan: "pro", priority: "high" });
    assert.deepEqual(ticketPlanUpdate({ authorPlan: "plus", priority: "high" }, "pro"), { authorPlan: "pro" });
    // Same plan: a priority the team lowered stays; a lower plan only updates the note.
    assert.deepEqual(ticketPlanUpdate({ authorPlan: "pro", priority: "low" }, "pro"), {});
    assert.deepEqual(ticketPlanUpdate({ authorPlan: "pro", priority: "high" }, "free"), { authorPlan: "free" });
    assert.deepEqual(ticketPlanUpdate({ authorPlan: null, priority: "normal" }, "free"), { authorPlan: "free" });

    // The inbox: unread first, then priority, then Pro, Plus, Free, then the latest message.
    const ticket = (id, fields) => ({ id, unreadForStaff: false, priority: "normal", authorPlan: null, lastMessageAt: "2026-10-01T10:00:00.000Z", ...fields });
    const inbox = [
        ticket("free-new", { authorPlan: "free", lastMessageAt: "2026-10-02T10:00:00.000Z" }),
        ticket("legacy", {}),
        ticket("plus", { authorPlan: "plus" }),
        ticket("pro", { authorPlan: "pro" }),
        ticket("critical-free", { authorPlan: "free", priority: "critical" }),
        ticket("high-plus", { authorPlan: "plus", priority: "high" }),
        ticket("high-pro", { authorPlan: "pro", priority: "high" }),
        ticket("unread-low", { priority: "low", unreadForStaff: true }),
        ticket("no-date", { lastMessageAt: null }),
    ];
    assert.deepEqual(inbox.sort(compareInboxTickets).map((item) => item.id), ["unread-low", "critical-free", "high-pro", "high-plus", "pro", "plus", "free-new", "legacy", "no-date"]);
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
    for (const category of STORED_TICKET_CATEGORIES) {
        complete(TICKET_CATEGORY_COPY[category].label, category);
        complete(TICKET_CATEGORY_COPY[category].hint, category);
        assert.match(TICKET_CATEGORY_COPY[category].icon, /^[A-Z][A-Za-z]+$/, category);
    }
    assert.equal(Object.keys(TICKET_CATEGORY_COPY).length, STORED_TICKET_CATEGORIES.length);
    for (const subject of COMPLAINT_SUBJECTS) complete(COMPLAINT_SUBJECT_COPY[subject], subject);
    for (const scope of BAN_SCOPES) {
        complete(BAN_SCOPE_COPY[scope].label, scope);
        complete(BAN_SCOPE_COPY[scope].hint, scope);
    }
    complete(KVKK_REQUEST_HINT, "kvkk hint");
    for (const [event, copy] of Object.entries(STAFF_TICKET_NOTIFICATION_COPY)) complete(copy, event);
    for (const status of TICKET_STATUSES) complete(TICKET_STATUS_COPY[status].label, status);
    for (const priority of TICKET_PRIORITIES) complete(TICKET_PRIORITY_COPY[priority], priority);
    for (const severity of TICKET_SEVERITIES) complete(TICKET_SEVERITY_COPY[severity].label, severity);
    for (const [code, copy] of Object.entries(SUPPORT_ERROR_COPY)) complete(copy, code);
    for (const [code, copy] of Object.entries(RECORD_REASON_COPY)) complete(copy, code);
    for (const [code, entry] of Object.entries(RECORD_VERDICT_COPY)) complete(entry.label, code);
    // Every code a validator can return has a message.
    for (const code of [
        "invalid_category", "title_required", "title_too_short", "title_too_long", "description_required", "description_too_short", "description_too_long",
        "invalid_severity", "invalid_complaint_subject", "reported_user_too_long", "invalid_content_url", "invalid_ban_scope", "ban_reference_required",
        "ban_reference_too_long", "message_required", "message_too_long", "invalid_body",
    ]) {
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

test("staff notifications: one item per ticket, linked to the admin inbox", () => {
    const id = "3fa9c2d1e4b5a6978877";
    assert.equal(staffTicketNotificationId(id), `ticket_new_${id}`);
    assert.equal(staffTicketLink(id), `/admin#tickets?id=${id}`);
    // The stored (Turkish) title tells the two events apart; anything else reads as a new ticket.
    assert.notEqual(STAFF_TICKET_NOTIFICATION_TITLES.created, STAFF_TICKET_NOTIFICATION_TITLES.reply);
    assert.equal(staffTicketEventOf(STAFF_TICKET_NOTIFICATION_TITLES.created), "created");
    assert.equal(staffTicketEventOf(STAFF_TICKET_NOTIFICATION_TITLES.reply), "reply");
    assert.equal(staffTicketEventOf("something else"), "created");
    assert.equal(STAFF_TICKET_NOTIFICATION_COPY.created.TR, STAFF_TICKET_NOTIFICATION_TITLES.created);
    assert.equal(STAFF_TICKET_NOTIFICATION_COPY.reply.TR, STAFF_TICKET_NOTIFICATION_TITLES.reply);
});
