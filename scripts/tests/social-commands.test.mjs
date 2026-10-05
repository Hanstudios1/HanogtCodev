// Run: node --test scripts/tests/*.test.mjs
// Slash commands of Hanogt Social groups (lib/social/commands.ts): names in
// both languages, who may run them and how their arguments are read.
import assert from "node:assert/strict";
import test from "node:test";
import { load } from "./setup.mjs";

const commands = await load("lib/social/commands.ts");
const { readCommandLine, findCommand, parseCommand, parseDuration, takeMember, suggestCommands, rankAtLeast, MUTE_DEFAULT_MS } = commands;

const MEMBERS = ["Ali", "Ali Veli", "Ayşe", "zeynep_42"];
const run = (line) => {
    const parsed = readCommandLine(line);
    if (!parsed) return null;
    const spec = findCommand(parsed.name);
    return spec ? parseCommand(spec, parsed.rest, MEMBERS) : { ok: false, problem: "unknown" };
};

test("a command line: a slash, a name (Turkish letters folded), then the rest", () => {
    assert.deepEqual(readCommandLine("/Yavaşmod 5sn"), { name: "yavasmod", rest: "5sn" });
    assert.deepEqual(readCommandLine("  /UYARILAR  "), { name: "uyarilar", rest: "" });
    assert.deepEqual(readCommandLine("/ai nasıl\nçalışır?"), { name: "ai", rest: "nasıl\nçalışır?" });
    for (const text of ["//yorum", "/ boşluk", "/usr/bin/env", "merhaba /ai", "/", "/1abc"]) assert.equal(readCommandLine(text), null, text);
    assert.equal(findCommand("sustur").id, "mute");
    assert.equal(findCommand("TIMEOUT").id, "mute");
    assert.equal(findCommand("yavaşmod").id, "slowmode");
    assert.equal(findCommand("dans"), null);
});

test("durations: Turkish and English units, plain numbers are seconds", () => {
    assert.equal(parseDuration("10dk"), 600_000);
    assert.equal(parseDuration("2sa"), 7_200_000);
    assert.equal(parseDuration("1 gün"), 86_400_000);
    assert.equal(parseDuration("3h"), 10_800_000);
    assert.equal(parseDuration("1w"), 604_800_000);
    assert.equal(parseDuration("90"), 90_000);
    for (const value of ["0", "5x", "dk", "-5m", "1.5h"]) assert.equal(parseDuration(value), null, value);
});

test("members: the longest matching name wins, names may have spaces", () => {
    assert.deepEqual(takeMember("@Ali Veli 10dk spam", MEMBERS), { username: "Ali Veli", rest: "10dk spam" });
    assert.deepEqual(takeMember("@ali spam", MEMBERS), { username: "Ali", rest: "spam" });
    assert.deepEqual(takeMember("@AYŞE", MEMBERS), { username: "Ayşe", rest: "" });
    assert.deepEqual(takeMember("@Alican selam", MEMBERS), { username: null, rest: "@Alican selam" });
    assert.deepEqual(takeMember("Ali", MEMBERS), { username: null, rest: "Ali" });
});

test("moderation commands read their arguments", () => {
    assert.deepEqual(run("/uyar @Ayşe küfür etme"), { ok: true, command: { id: "warn", target: "Ayşe", reason: "küfür etme" } });
    assert.deepEqual(run("/warn @zeynep_42"), { ok: true, command: { id: "warn", target: "zeynep_42", reason: "" } });
    assert.deepEqual(run("/sustur @Ali Veli 2sa spam yapıyor"), { ok: true, command: { id: "mute", target: "Ali Veli", durationMs: 7_200_000, reason: "spam yapıyor" } });
    assert.deepEqual(run("/mute @Ali flood"), { ok: true, command: { id: "mute", target: "Ali", durationMs: MUTE_DEFAULT_MS, reason: "flood" } });
    assert.deepEqual(run("/sustur @Ali 30g"), { ok: false, problem: "bad_duration" }, "28 days at most");
    assert.deepEqual(run("/sustur @Ali 99x neden"), { ok: false, problem: "bad_duration" });
    assert.deepEqual(run("/sesiac @Ali"), { ok: true, command: { id: "unmute", target: "Ali" } });
    assert.deepEqual(run("/at @Ayşe"), { ok: true, command: { id: "kick", target: "Ayşe", reason: "" } });
    assert.deepEqual(run("/yasakla @Ali Veli dolandırıcılık"), { ok: true, command: { id: "ban", target: "Ali Veli", reason: "dolandırıcılık" } });
    assert.deepEqual(run("/yasakla Ali"), { ok: false, problem: "needs_member" });
    assert.deepEqual(run("/yasakla @Mehmet"), { ok: false, problem: "unknown_member" });
    assert.deepEqual(run("/temizle 50"), { ok: true, command: { id: "purge", count: 50, target: null } });
    assert.deepEqual(run("/purge 10 @Ali"), { ok: true, command: { id: "purge", count: 10, target: "Ali" } });
    for (const line of ["/temizle", "/temizle 0", "/temizle 101", "/temizle hepsi"]) assert.deepEqual(run(line), { ok: false, problem: "bad_count" }, line);
    assert.deepEqual(run("/yavasmod 5sn"), { ok: true, command: { id: "slowmode", seconds: 5 } });
    assert.deepEqual(run("/slowmode off"), { ok: true, command: { id: "slowmode", seconds: 0 } });
    assert.deepEqual(run("/yavasmod kapat"), { ok: true, command: { id: "slowmode", seconds: 0 } });
    assert.deepEqual(run("/yavasmod 7sa"), { ok: false, problem: "bad_duration" }, "6 hours at most");
});

test("everyone's commands: rules, help, warnings, report (with a reason) and Hanogt AI", () => {
    assert.deepEqual(run("/kurallar"), { ok: true, command: { id: "rules" } });
    assert.deepEqual(run("/yardım"), { ok: true, command: { id: "help" } });
    assert.deepEqual(run("/uyarilar"), { ok: true, command: { id: "warnings", target: null } });
    assert.deepEqual(run("/uyarılar @Ali"), { ok: true, command: { id: "warnings", target: "Ali" } });
    assert.deepEqual(run("/rapor @Ali hakaret ediyor"), { ok: true, command: { id: "report", target: "Ali", reason: "hakaret ediyor" } });
    assert.deepEqual(run("/rapor @Ali"), { ok: false, problem: "needs_text" });
    assert.deepEqual(run("/ai Python'da liste nasıl sıralanır?"), { ok: true, command: { id: "ai", question: "Python'da liste nasıl sıralanır?" } });
    assert.deepEqual(run("/ai"), { ok: false, problem: "needs_text" });
    assert.deepEqual(run("/dans"), { ok: false, problem: "unknown" }, "not a built-in (a custom command may still answer it)");
});

test("who may run what, and what the composer suggests", () => {
    assert.ok(rankAtLeast("owner", "admin") && rankAtLeast("moderator", "moderator") && !rankAtLeast("moderator", "admin") && !rankAtLeast("member", "moderator"));
    const member = suggestCommands("", "member", "TR").map((command) => command.name);
    assert.deepEqual(member, ["yardim", "ai", "kurallar", "rapor", "uyarilar"]);
    const moderator = suggestCommands("", "moderator", "TR").map((command) => command.name);
    assert.ok(moderator.includes("sustur") && moderator.includes("temizle") && !moderator.includes("yasakla"));
    assert.ok(suggestCommands("", "admin", "EN").some((command) => command.name === "ban"));
    assert.deepEqual(suggestCommands("/su", "moderator", "TR").map((command) => command.name), ["sustur"]);
    const custom = suggestCommands("ku", "member", "TR", [{ name: "kurulum", description: "Kurulum adımları" }]);
    assert.deepEqual(custom.map((command) => [command.kind, command.name]), [["builtin", "kurallar"], ["custom", "kurulum"]]);
});
