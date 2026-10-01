// Trains the offline intent model of Hanogt AI.
//
//   npm run ai:train
//
// Pipeline: load ai/dataset/intents.json → de-duplicate → seeded stratified
// split (train / validation / test) → noise augmentation (typos, dropped words,
// fillers) → multinomial logistic regression over hashed n-gram features
// (src/lib/ai/nlp.mjs) trained with AdaGrad + L2 and early stopping on the
// validation set → evaluation on the untouched test set → pruning + int8
// quantization (its effect is measured on the test set too) → a final model is
// retrained on all examples with the selected number of epochs and exported to
// public/ai/hanogt-intent-model.json. Metrics go to src/lib/ai/model-meta.json
// and ai/reports/intent-training-report.md.
import fs from "node:fs";
import path from "node:path";
import { FEATURE_VERSION, featureBuckets, normalize, softmax } from "../src/lib/ai/nlp.mjs";

const ROOT = process.cwd();
const DATASET = path.join(ROOT, "ai/dataset/intents.json");
const MODEL_OUT = path.join(ROOT, "public/ai/hanogt-intent-model.json");
const META_OUT = path.join(ROOT, "src/lib/ai/model-meta.json");
const REPORT_OUT = path.join(ROOT, "ai/reports/intent-training-report.md");

const CONFIG = {
    seed: 20260930,
    bits: 15,
    testShare: 0.15,
    validationShare: 0.12,
    augmentations: 4,
    maxEpochs: 90,
    patience: 12,
    learningRate: 0.15,
    l2: 1e-3,
    pruneBelow: 1,
    keepPerRow: 8,
    scaleQuantile: 0.995,
};

function mulberry32(seed) {
    let state = seed >>> 0;
    return () => {
        state += 0x6d2b79f5;
        let value = state;
        value = Math.imul(value ^ (value >>> 15), value | 1);
        value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
        return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
}

function shuffle(items, random) {
    const copy = items.slice();
    for (let index = copy.length - 1; index > 0; index -= 1) {
        const other = Math.floor(random() * (index + 1));
        [copy[index], copy[other]] = [copy[other], copy[index]];
    }
    return copy;
}

// Neutral fillers only: greetings or "thanks" here would leak into every intent.
const FILLERS_BEFORE = ["lütfen", "acaba", "bir sorum var", "please", "quick question", "ya", "şey", "so"];
const FILLERS_AFTER = ["lütfen", "?", "acil", "please", "pls", "ya", "!"];

function augment(text, random) {
    const words = text.split(/\s+/).filter(Boolean);
    const pick = random();
    if (pick < 0.3 && words.length) {
        // Typo: drop, duplicate or swap one character of a word.
        const index = Math.floor(random() * words.length);
        const word = words[index];
        if (word.length > 3) {
            const at = 1 + Math.floor(random() * (word.length - 2));
            const kind = random();
            words[index] = kind < 0.4 ? word.slice(0, at) + word.slice(at + 1)
                : kind < 0.7 ? word.slice(0, at) + word[at] + word.slice(at)
                    : word.slice(0, at - 1) + word[at] + word[at - 1] + word.slice(at + 1);
        }
        return words.join(" ");
    }
    if (pick < 0.5 && words.length >= 3) {
        words.splice(Math.floor(random() * words.length), 1);
        return words.join(" ");
    }
    if (pick < 0.75) return `${FILLERS_BEFORE[Math.floor(random() * FILLERS_BEFORE.length)]} ${text}`;
    return `${text} ${FILLERS_AFTER[Math.floor(random() * FILLERS_AFTER.length)]}`;
}

function vectorize(text) {
    const buckets = featureBuckets(text, CONFIG.bits);
    return { buckets, norm: 1 / Math.sqrt(Math.max(1, buckets.length)) };
}

function createModel(labelCount) {
    return { weights: new Map(), gradSquares: new Map(), bias: new Float64Array(labelCount), biasSquares: new Float64Array(labelCount).fill(1e-8), labelCount };
}

function logits(model, sample) {
    const out = Array.from(model.bias);
    for (const bucket of sample.buckets) {
        const row = model.weights.get(bucket);
        if (!row) continue;
        for (let label = 0; label < model.labelCount; label += 1) out[label] += row[label] * sample.norm;
    }
    return out;
}

function trainEpoch(model, samples, random) {
    let loss = 0;
    for (const sample of shuffle(samples, random)) {
        const probabilities = softmax(logits(model, sample));
        loss -= Math.log(Math.max(1e-12, probabilities[sample.label]));
        const gradient = probabilities.map((value, label) => value - (label === sample.label ? 1 : 0));
        for (let label = 0; label < model.labelCount; label += 1) {
            model.biasSquares[label] += gradient[label] ** 2;
            model.bias[label] -= (CONFIG.learningRate / Math.sqrt(model.biasSquares[label])) * gradient[label];
        }
        for (const bucket of sample.buckets) {
            let row = model.weights.get(bucket);
            let squares = model.gradSquares.get(bucket);
            if (!row) {
                row = new Float64Array(model.labelCount);
                squares = new Float64Array(model.labelCount).fill(1e-8);
                model.weights.set(bucket, row);
                model.gradSquares.set(bucket, squares);
            }
            for (let label = 0; label < model.labelCount; label += 1) {
                const g = gradient[label] * sample.norm + CONFIG.l2 * row[label];
                squares[label] += g * g;
                row[label] -= (CONFIG.learningRate / Math.sqrt(squares[label])) * g;
            }
        }
    }
    return loss / samples.length;
}

function predict(model, sample) {
    const probabilities = softmax(logits(model, sample));
    let best = 0;
    for (let label = 1; label < probabilities.length; label += 1) if (probabilities[label] > probabilities[best]) best = label;
    return { label: best, probability: probabilities[best], probabilities };
}

function evaluate(model, samples, labels) {
    const confusion = labels.map(() => new Array(labels.length).fill(0));
    let loss = 0;
    let correct = 0;
    for (const sample of samples) {
        const result = predict(model, sample);
        loss -= Math.log(Math.max(1e-12, result.probabilities[sample.label]));
        confusion[sample.label][result.label] += 1;
        if (result.label === sample.label) correct += 1;
    }
    const perLabel = labels.map((name, label) => {
        const truePositive = confusion[label][label];
        const predicted = confusion.reduce((sum, row) => sum + row[label], 0);
        const actual = confusion[label].reduce((sum, value) => sum + value, 0);
        const precision = predicted ? truePositive / predicted : 0;
        const recall = actual ? truePositive / actual : 0;
        const f1 = precision + recall ? (2 * precision * recall) / (precision + recall) : 0;
        return { name, precision, recall, f1, support: actual };
    });
    const withSupport = perLabel.filter((entry) => entry.support > 0);
    return {
        accuracy: samples.length ? correct / samples.length : 0,
        macroF1: withSupport.reduce((sum, entry) => sum + entry.f1, 0) / Math.max(1, withSupport.length),
        loss: loss / Math.max(1, samples.length),
        perLabel,
        confusion,
    };
}

/** Prunes small weights, keeps the strongest per row and quantizes to int8. */
/**
 * Softmax is invariant to adding the same constant to every class weight of a
 * feature, so each row is shifted by its median: the many small "not this
 * class" weights become ~0 and the row can be stored sparsely.
 */
function centerRows(model) {
    const centered = new Map();
    for (const [bucket, row] of model.weights) {
        const sorted = Array.from(row).sort((a, b) => a - b);
        const median = sorted[Math.floor(sorted.length / 2)];
        centered.set(bucket, row.map((value) => value - median));
    }
    return { ...model, weights: centered };
}

function quantize(rawModel) {
    const model = centerRows(rawModel);
    // The scale comes from the 99.9th percentile of |w|; the few larger
    // weights are clipped. A max-based scale let one outlier push most
    // useful small weights below the pruning threshold.
    const magnitudes = [];
    for (const row of model.weights.values()) for (const value of row) if (value) magnitudes.push(Math.abs(value));
    magnitudes.sort((a, b) => a - b);
    const reference = magnitudes[Math.min(magnitudes.length - 1, Math.floor(magnitudes.length * CONFIG.scaleQuantile))] || 1;
    const scale = reference / 127;
    const rows = {};
    let kept = 0;
    for (const [bucket, row] of model.weights) {
        const entries = [];
        for (let label = 0; label < row.length; label += 1) {
            const q = Math.round(row[label] / scale);
            if (Math.abs(q) >= CONFIG.pruneBelow) entries.push([label, Math.max(-127, Math.min(127, q))]);
        }
        if (!entries.length) continue;
        entries.sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
        const bytes = new Int8Array(Math.min(entries.length, CONFIG.keepPerRow) * 2);
        entries.slice(0, CONFIG.keepPerRow).forEach(([label, q], index) => {
            bytes[index * 2] = label;
            bytes[index * 2 + 1] = q;
        });
        kept += bytes.length / 2;
        rows[bucket] = Buffer.from(bytes.buffer).toString("base64");
    }
    return { scale, rows, bias: Array.from(model.bias, (value) => Number(value.toFixed(5))), kept };
}

/** Rebuilds a float model from quantized rows so the exported weights can be evaluated. */
function dequantize(quantized, labelCount) {
    const model = createModel(labelCount);
    model.bias = Float64Array.from(quantized.bias);
    for (const [bucket, encoded] of Object.entries(quantized.rows)) {
        const bytes = new Int8Array(Buffer.from(encoded, "base64"));
        const row = new Float64Array(labelCount);
        for (let index = 0; index + 1 < bytes.length; index += 2) row[bytes[index]] = bytes[index + 1] * quantized.scale;
        model.weights.set(Number(bucket), row);
    }
    return model;
}

function fit(trainSamples, validationSamples, labels, random, fixedEpochs) {
    const model = createModel(labels.length);
    let best = { accuracy: -1, loss: Infinity, epoch: 0, snapshot: null };
    let stale = 0;
    const history = [];
    const epochs = fixedEpochs ?? CONFIG.maxEpochs;
    for (let epoch = 1; epoch <= epochs; epoch += 1) {
        const trainLoss = trainEpoch(model, trainSamples, random);
        if (fixedEpochs) continue;
        const validation = evaluate(model, validationSamples, labels);
        history.push({ epoch, trainLoss, validationLoss: validation.loss, validationAccuracy: validation.accuracy });
        const better = validation.accuracy > best.accuracy + 1e-9 || (Math.abs(validation.accuracy - best.accuracy) < 1e-9 && validation.loss < best.loss);
        if (better) {
            best = {
                accuracy: validation.accuracy,
                loss: validation.loss,
                epoch,
                snapshot: { bias: Float64Array.from(model.bias), weights: new Map([...model.weights].map(([key, row]) => [key, Float64Array.from(row)])) },
            };
            stale = 0;
        } else if ((stale += 1) >= CONFIG.patience) {
            break;
        }
    }
    if (!fixedEpochs && best.snapshot) {
        model.bias = best.snapshot.bias;
        model.weights = best.snapshot.weights;
    }
    return { model, bestEpoch: best.epoch || epochs, history };
}

// ---------------------------------------------------------------- data
const dataset = JSON.parse(fs.readFileSync(DATASET, "utf8"));
const labels = Object.keys(dataset.intents);
const random = mulberry32(CONFIG.seed);
const byLabel = labels.map((label) => {
    const seen = new Set();
    const unique = [];
    for (const text of dataset.intents[label]) {
        const key = normalize(text);
        if (!key || seen.has(key)) continue;
        seen.add(key);
        unique.push(text);
    }
    return shuffle(unique, random);
});

const split = { train: [], validation: [], test: [] };
byLabel.forEach((examples, label) => {
    const testCount = Math.max(1, Math.round(examples.length * CONFIG.testShare));
    const validationCount = Math.max(1, Math.round(examples.length * CONFIG.validationShare));
    examples.forEach((text, index) => {
        const bucket = index < testCount ? "test" : index < testCount + validationCount ? "validation" : "train";
        split[bucket].push({ text, label });
    });
});

const expand = (items) => {
    const out = [];
    for (const item of items) {
        out.push({ ...vectorize(item.text), label: item.label, text: item.text });
        for (let copy = 0; copy < CONFIG.augmentations; copy += 1) {
            const text = augment(item.text, random);
            out.push({ ...vectorize(text), label: item.label, text });
        }
    }
    return out;
};
const plain = (items) => items.map((item) => ({ ...vectorize(item.text), label: item.label, text: item.text }));

const trainSamples = expand(split.train);
const validationSamples = plain(split.validation);
const testSamples = plain(split.test);

// ---------------------------------------------------------------- experiment
const started = Date.now();
const { model: experimentModel, bestEpoch, history } = fit(trainSamples, validationSamples, labels, random);
const testFloat = evaluate(experimentModel, testSamples, labels);
const experimentQuantized = quantize(experimentModel);
const testQuantized = evaluate(dequantize(experimentQuantized, labels.length), testSamples, labels);

// Confidence threshold for "not sure → search the knowledge base instead":
// pick the value that maximizes validation accuracy when low-confidence
// predictions are treated as "unknown".
const unknownLabel = labels.indexOf("unknown");
let threshold = { value: 0.3, accuracy: 0 };
for (let value = 0.1; value <= 0.7001; value += 0.05) {
    let correct = 0;
    for (const sample of validationSamples) {
        const result = predict(experimentModel, sample);
        const predicted = result.probability < value ? unknownLabel : result.label;
        if (predicted === sample.label) correct += 1;
    }
    const accuracy = correct / validationSamples.length;
    if (accuracy > threshold.accuracy + 1e-9) threshold = { value: Number(value.toFixed(2)), accuracy };
}

// ---------------------------------------------------------------- final model
const allSamples = expand([...split.train, ...split.validation, ...split.test]);
const { model: finalModel } = fit(allSamples, [], labels, mulberry32(CONFIG.seed + 1), bestEpoch);
const finalQuantized = quantize(finalModel);
const trainingAccuracy = evaluate(dequantize(finalQuantized, labels.length), plain([...split.train, ...split.validation, ...split.test]), labels).accuracy;

const exported = {
    format: "hanogt-intent-model",
    version: 1,
    featureVersion: FEATURE_VERSION,
    bits: CONFIG.bits,
    labels,
    bias: finalQuantized.bias,
    scale: Number(finalQuantized.scale.toPrecision(8)),
    threshold: threshold.value,
    rows: finalQuantized.rows,
};
fs.mkdirSync(path.dirname(MODEL_OUT), { recursive: true });
fs.writeFileSync(MODEL_OUT, JSON.stringify(exported));
const sizeKb = fs.statSync(MODEL_OUT).size / 1024;

const round = (value) => Number((value * 100).toFixed(1));
const meta = {
    version: 1,
    featureVersion: FEATURE_VERSION,
    trainedAt: new Date().toISOString().slice(0, 10),
    intents: labels.length,
    examples: split.train.length + split.validation.length + split.test.length,
    augmentedTrainingSamples: allSamples.length,
    epochs: bestEpoch,
    testAccuracy: round(testFloat.accuracy),
    testMacroF1: round(testFloat.macroF1),
    quantizedTestAccuracy: round(testQuantized.accuracy),
    threshold: threshold.value,
    parameters: experimentQuantized.kept,
    exportedWeights: finalQuantized.kept,
    sizeKb: Number(sizeKb.toFixed(1)),
};
fs.writeFileSync(META_OUT, `${JSON.stringify(meta, null, 2)}\n`);

const worst = testFloat.perLabel.filter((entry) => entry.support).sort((a, b) => a.f1 - b.f1).slice(0, 10);
const mistakes = [];
for (const sample of testSamples) {
    const result = predict(experimentModel, sample);
    if (result.label !== sample.label) mistakes.push(`| ${sample.text.replace(/\|/g, "\\|")} | ${labels[sample.label]} | ${labels[result.label]} (${(result.probability * 100).toFixed(0)}%) |`);
}
const report = `# Hanogt AI — intent model training report

Generated by \`npm run ai:train\` on ${meta.trainedAt}. Seed ${CONFIG.seed}; feature version ${FEATURE_VERSION}.

## Data

- Intents: **${labels.length}**, unique examples: **${meta.examples}** (train ${split.train.length} / validation ${split.validation.length} / test ${split.test.length}, stratified per intent)
- Training augmentation: ${CONFIG.augmentations} noisy copies per example (typos, dropped words, fillers) → ${trainSamples.length} training samples
- Features: words, 5-character prefix stems, stem bigrams and in-word character trigrams, hashed into 2^${CONFIG.bits} buckets

## Model

Multinomial logistic regression (softmax), AdaGrad (lr ${CONFIG.learningRate}), L2 ${CONFIG.l2}, early stopping on validation accuracy (patience ${CONFIG.patience}). Best epoch: **${bestEpoch}**. The exported model is retrained on all examples for ${bestEpoch} epochs, pruned (|w| < ${CONFIG.pruneBelow}/127 of the largest weight, at most ${CONFIG.keepPerRow} classes per feature) and quantized to int8: ${finalQuantized.kept.toLocaleString("en-US")} weights, ${sizeKb.toFixed(1)} KB.

## Results (held-out test set, never used for training or model selection)

| Metric | Value |
| --- | --- |
| Accuracy (float weights) | **${round(testFloat.accuracy)}%** |
| Macro F1 | **${round(testFloat.macroF1)}%** |
| Accuracy after pruning + int8 quantization | **${round(testQuantized.accuracy)}%** |
| Validation accuracy at best epoch | ${round(history.find((entry) => entry.epoch === bestEpoch)?.validationAccuracy ?? 0)}% |
| Low-confidence threshold (→ knowledge search) | ${threshold.value} (validation accuracy ${round(threshold.accuracy)}%) |
| Accuracy of the final model on all examples | ${round(trainingAccuracy)}% |

### Hardest intents (test F1)

| Intent | Precision | Recall | F1 | Support |
| --- | --- | --- | --- | --- |
${worst.map((entry) => `| ${entry.name} | ${round(entry.precision)}% | ${round(entry.recall)}% | ${round(entry.f1)}% | ${entry.support} |`).join("\n")}

### Test mistakes

| Message | Expected | Predicted |
| --- | --- | --- |
${mistakes.join("\n") || "| — | — | — |"}

### Learning curve (validation)

| Epoch | Train loss | Validation loss | Validation accuracy |
| --- | --- | --- | --- |
${history.filter((entry, index) => index % 5 === 0 || entry.epoch === bestEpoch).map((entry) => `| ${entry.epoch} | ${entry.trainLoss.toFixed(3)} | ${entry.validationLoss.toFixed(3)} | ${round(entry.validationAccuracy)}% |`).join("\n")}

## Limits

This is a small supervised classifier that routes messages to Hanogt AI's offline skills (site knowledge, security tools, snippets, error explanations, calculator). It does not generate free text; open-ended answers come from the large language model configured on the server (see docs/HANOGT_AI.md).
`;
fs.mkdirSync(path.dirname(REPORT_OUT), { recursive: true });
fs.writeFileSync(REPORT_OUT, report);

console.log(`Hanogt AI intent modeli eğitildi (${((Date.now() - started) / 1000).toFixed(1)} sn)`);
console.log(`  niyet: ${labels.length}, örnek: ${meta.examples}, artırılmış eğitim örneği: ${trainSamples.length}`);
console.log(`  en iyi epoch: ${bestEpoch}, test doğruluğu: %${meta.testAccuracy}, makro F1: %${meta.testMacroF1}, nicemlenmiş: %${meta.quantizedTestAccuracy}`);
console.log(`  eşik: ${threshold.value}, ağırlık: ${finalQuantized.kept}, boyut: ${sizeKb.toFixed(1)} KB → ${path.relative(ROOT, MODEL_OUT)}`);
