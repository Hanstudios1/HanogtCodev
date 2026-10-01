// Evaluates the Hanogt Security Bot abuse guard (src/lib/security/signatures.ts).
//
// Two things matter for a guard that blocks the online runner, Media posts and
// Arcade publishing:
//   1. Recall — every abuse category it claims to catch still fires.
//   2. Precision — ordinary code that merely *looks* risky is NOT blocked, so
//      real users are not stopped from running or sharing their projects.
//
// Run: node scripts/eval-security.mjs   (writes ai/security/eval-report.md)
import { writeFileSync } from "node:fs";
import { load, ROOT } from "./tests/setup.mjs";
import { BENIGN_CORPUS } from "../ai/security/benign-corpus.mjs";
import { RECALL_FIXTURES } from "../ai/security/recall-fixtures.mjs";

const { scanUntrustedCode } = await load("lib/server/security-scanner.ts");
const { SIGNATURE_RULES, detectSignatures } = await load("lib/security/signatures.ts");

const ruleIds = new Set(SIGNATURE_RULES.map((rule) => rule.id));

// ---- Recall: each fixture must fire its signature; each rule needs a fixture.
const recallRows = RECALL_FIXTURES.map((fixture) => {
    const ids = detectSignatures(fixture.marker).map((finding) => finding.id);
    return { id: fixture.id, fired: ids.includes(fixture.id), blocked: !scanUntrustedCode(fixture.marker).allowed };
});
const missedRecall = recallRows.filter((row) => !row.fired || !row.blocked);
const uncovered = [...ruleIds].filter((id) => !RECALL_FIXTURES.some((fixture) => fixture.id === id));

// ---- Precision: no benign sample may be blocked.
const benignRows = BENIGN_CORPUS.map((sample) => {
    const scan = scanUntrustedCode(sample.code);
    return { id: sample.id, near: sample.near, blocked: !scan.allowed, findings: scan.findings.map((f) => f.id) };
});
const falsePositives = benignRows.filter((row) => row.blocked);
// A benign sample that produces any finding (even a non-blocking one) is worth noting.
const benignNoise = benignRows.filter((row) => !row.blocked && row.findings.length);

const recallRate = recallRows.length ? (recallRows.length - missedRecall.length) / recallRows.length : 1;
const precisionClean = BENIGN_CORPUS.length ? (BENIGN_CORPUS.length - falsePositives.length) / BENIGN_CORPUS.length : 1;
const pct = (value) => `${(value * 100).toFixed(1)}%`;

const lines = [
    "# Hanogt Security Bot — guard evaluation",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    "The guard in `src/lib/security/signatures.ts` is a high-confidence abuse",
    "guardrail for untrusted code (the runner, Media posts, Arcade publishing).",
    "It is not a sandbox or a malware verdict; this report measures whether it",
    "still catches the categories it claims to, without blocking ordinary code.",
    "",
    "## Summary",
    "",
    `- Signatures defined: **${ruleIds.size}**`,
    `- Recall fixtures: **${RECALL_FIXTURES.length}** → detected & blocked **${pct(recallRate)}**`,
    `- Signatures without a recall fixture: **${uncovered.length}**${uncovered.length ? ` (${uncovered.join(", ")})` : ""}`,
    `- Benign samples: **${BENIGN_CORPUS.length}** → allowed **${pct(precisionClean)}**`,
    `- Benign samples wrongly blocked (false positives): **${falsePositives.length}**`,
    `- Benign samples with a non-blocking finding: **${benignNoise.length}**`,
    "",
    "## Recall gaps",
    "",
    missedRecall.length
        ? missedRecall.map((row) => `- \`${row.id}\` — fired: ${row.fired}, blocked: ${row.blocked}`).join("\n")
        : "_None — every recall fixture is detected and blocked._",
    "",
    "## False positives (benign code blocked)",
    "",
    falsePositives.length
        ? falsePositives.map((row) => `- \`${row.id}\` (near \`${row.near}\`) → blocked by ${row.findings.join(", ")}`).join("\n")
        : "_None — every benign sample is allowed._",
    "",
    "## Benign code with a non-blocking finding",
    "",
    benignNoise.length
        ? benignNoise.map((row) => `- \`${row.id}\` (near \`${row.near}\`) → noted: ${row.findings.join(", ")}`).join("\n")
        : "_None._",
    "",
];

const report = lines.join("\n");
writeFileSync(new URL("ai/security/eval-report.md", ROOT), report);

console.log(report);
const ok = missedRecall.length === 0 && uncovered.length === 0 && falsePositives.length === 0;
console.log(ok ? "\nPASS" : "\nFAIL");
process.exit(ok ? 0 : 1);
