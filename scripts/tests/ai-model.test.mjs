// Run: node --test scripts/tests/
// The trained Hanogt AI Core model (npm run ai:train): binary format, metadata,
// size budget and a few unambiguous messages per action intent.
import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { ROOT } from "./setup.mjs";

const nlp = await import(new URL("src/lib/ai/nlp.mjs", ROOT).href);
const meta = JSON.parse(fs.readFileSync(new URL("src/lib/ai/model-meta.json", ROOT), "utf8"));
const bytes = fs.readFileSync(new URL(`public/ai/${meta.file}`, ROOT));
const model = nlp.decodeModelBinary(bytes);
const top = (text) => nlp.classify(model, text)[0].label;

test("model file, metadata and feature extractor belong together", () => {
    assert.equal(meta.file, "hanogt-intent-model.bin");
    assert.equal(model.featureVersion, nlp.FEATURE_VERSION);
    assert.equal(meta.featureVersion, nlp.FEATURE_VERSION);
    assert.equal(model.labels.length, meta.intents);
    assert.equal(model.bias.length, model.labels.length);
    assert.ok(bytes.length <= 1.5 * 1024 * 1024, `${bytes.length} bytes`);
    assert.match(meta.hash, /^[0-9a-f]{12}$/);
    for (const key of ["testAccuracy", "testMacroF1", "quantizedTestAccuracy", "quantizedTestMacroF1", "holdoutAccuracy", "holdoutMacroF1"]) {
        assert.equal(typeof meta[key], "number", key);
    }
});

test("binary format round-trips and rejects other files", () => {
    // Two rows (buckets 5 and 8): label a with +10, then labels a and b with +1 and −10.
    const blobs = { index: Uint8Array.of(5, 3), masks: Uint8Array.of(0b01, 0b11), scales: Uint8Array.of(128, 128), values: Uint8Array.of(10, 1, 246) };
    const encoded = nlp.encodeModelBinary({ version: 3, featureVersion: nlp.FEATURE_VERSION, bits: 4, labels: ["a", "b"], bias: [0, 0], scale: 0.1, scaleSteps: 8 }, blobs);
    const decoded = nlp.decodeModelBinary(encoded);
    assert.deepEqual([...decoded.values], [10, 1, 246]);
    assert.deepEqual([...decoded.masks], [1, 3]);
    assert.deepEqual(decoded.labels, ["a", "b"]);
    assert.deepEqual(decoded.blobs, [["index", 2], ["masks", 2], ["scales", 2], ["values", 3]]);
    assert.throws(() => nlp.decodeModelBinary(new TextEncoder().encode("{\"format\":\"json\"}")), /Not a Hanogt AI model/);
    assert.throws(() => nlp.decodeModelBinary(encoded.subarray(0, encoded.length - 1)), /Truncated/);
    const legacy = nlp.encodeModelBinary({ labels: ["a"] }, {});
    assert.throws(() => nlp.decodeModelBinary(legacy), /Unsupported/);
});

test("concept lexicon links words across languages", () => {
    assert.deepEqual(nlp.concepts("React çalışma grubu kur").filter((tag) => tag === "create" || tag === "group"), ["create", "group"]);
    assert.ok(nlp.concepts("create a team").includes("group"));
    assert.ok(nlp.concepts("создай группу").includes("group"));
    assert.ok(nlp.concepts("Python ile hesap makinesi yaz").includes("calc"));
    assert.ok(!nlp.concepts("hesap makinesi").includes("account"));
    assert.ok(nlp.concepts("dişim ağrıyor").includes("health"));
});

test("clear requests reach the right intent", () => {
    const expected = {
        "React çalışma grubu kur": "create_group",
        "create a study group for python": "create_group",
        "bana bir platform oyunu yap": "make_game",
        "profilimde ne yazıyor": "my_profile",
        "mesajlar sayfasına git": "navigate",
        "Python ile hesap makinesi yaz": "write_code",
        "kod editörünü aç": "open_editor",
        "merhaba": "greeting",
        "teşekkürler": "thanks",
        "iki adımlı doğrulama nasıl açılır": "twofa",
        "ajan modu nedir": "agent_mode",
        "destek talebi nasıl açılır": "support_ticket",
        "yarın hava nasıl olacak": "unknown",
    };
    for (const [text, intent] of Object.entries(expected)) assert.equal(top(text), intent, text);
});
