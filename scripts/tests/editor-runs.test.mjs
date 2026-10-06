// Run: node --test scripts/tests/*.test.mjs
// Running many files from the editor (services/piston.ts): server languages
// go to /api/execute eight files a request, one request after another, and
// results keep the files' order; a failure the next group would meet too
// (a run limit, sign-in) stops the run without more requests.
import assert from "node:assert/strict";
import test from "node:test";
import { load } from "./setup.mjs";

const piston = await load("services/piston.ts");

const realFetch = globalThis.fetch;
test.afterEach(() => {
    globalThis.fetch = realFetch;
});

/** Answers /api/execute with `answer(requestNumber, body)`; returns the bodies it was sent. */
function stubExecute(answer) {
    const bodies = [];
    globalThis.fetch = async (url, init) => {
        assert.equal(url, "/api/execute");
        const body = JSON.parse(init.body);
        bodies.push(body);
        return answer(bodies.length, body);
    };
    return bodies;
}

const ran = (files) => new Response(JSON.stringify({ jobs: files.map((file) => ({ name: file.name, language: file.language, version: "1", run: { stdout: `ran ${file.name}`, stderr: "", code: 0, output: `ran ${file.name}` } })) }), { status: 200, headers: { "Content-Type": "application/json" } });
const cFiles = (count) => Array.from({ length: count }, (_, index) => ({ name: `f${index}.c`, language: "c", code: "int main(void) { return 0; }" }));

test("server files go eight a request, one after another, and every file reports in order", async () => {
    let open = 0;
    let most = 0;
    const bodies = stubExecute(async (_, body) => {
        open += 1;
        most = Math.max(most, open);
        await new Promise((resolve) => setTimeout(resolve, 5));
        open -= 1;
        return ran(body.files);
    });
    const files = cFiles(19);
    const reported = [];
    const result = await piston.executeProjectSecure(files, { stdin: "42", onJob: (job, index) => reported.push(index) });
    assert.deepEqual(bodies.map((body) => body.files.length), [8, 8, 3]);
    assert.deepEqual(bodies.map((body) => body.stdin), ["42", "42", "42"]);
    assert.equal(most, 1, "one request at a time");
    assert.deepEqual(reported, [...files.keys()]);
    assert.deepEqual(result.response.jobs.map((job) => job.run.stdout), files.map((file) => `ran ${file.name}`));
    assert.equal(result.blocked, false);
});

test("a plan's run limit stops the groups after it: they share the failure without a request", async () => {
    const bodies = stubExecute((number, body) => number === 1
        ? ran(body.files)
        : new Response(JSON.stringify({ error: "Planınızın çalıştırma sınırına ulaştınız.", code: "rate_limited", limit: 40, plan: "free", upgrade: "plus" }), { status: 429, headers: { "Content-Type": "application/json", "Retry-After": "30" } }));
    const result = await piston.executeProjectSecure(cFiles(25));
    assert.equal(bodies.length, 2, "the third and fourth groups aren't sent");
    const failed = result.response.jobs.filter((job) => job.failure);
    assert.equal(failed.length, 17);
    assert.deepEqual(failed.map((job) => job.failure.code), Array(17).fill("rate_limited"));
    assert.deepEqual(failed[0].failure.limit, { perMinute: 40, upgrade: "plus" });
    assert.equal(failed[16].failure.retryAfterSeconds, 30);
    assert.deepEqual(result.response.jobs.slice(0, 8).map((job) => job.failure), Array(8).fill(undefined), "the first group ran");
});

test("a failure the next group may not meet (a timeout) doesn't stop the run", async () => {
    const bodies = stubExecute((number, body) => number === 1
        ? new Response(JSON.stringify({ error: "zaman aşımı", code: "timeout" }), { status: 503, headers: { "Content-Type": "application/json" } })
        : ran(body.files));
    const result = await piston.executeProjectSecure(cFiles(10));
    assert.equal(bodies.length, 2);
    assert.deepEqual(result.response.jobs.map((job) => job.failure?.code ?? "ok"), [...Array(8).fill("timeout"), "ok", "ok"]);
});

test("a security block stops the run: later groups aren't sent", async () => {
    const bodies = stubExecute(() => new Response(JSON.stringify({ code: "security_blocked", security: { blocked: true, risk: "high", findings: [], appealAvailable: true } }), { status: 422, headers: { "Content-Type": "application/json" } }));
    const result = await piston.executeProjectSecure(cFiles(12));
    assert.equal(bodies.length, 1);
    assert.equal(result.blocked, true);
    assert.equal(result.securityCheck.risk, "high");
});
