// Trains the offline intent model of Hanogt AI.
//
//   npm run ai:train             full run with the hyper-parameter search
//   npm run ai:train -- --quick  reuse the first configuration of the grid
//   npm run ai:train -- --cv     also run 5-fold cross-validation (≈ 3 min)
//
// Pipeline: load ai/dataset/intents.json → de-duplicate (cross-intent
// collisions are dropped and reported) → group near-duplicates (same content
// stems or very similar character trigrams) so that paraphrases of one
// sentence never land in different splits → seeded stratified split of those
// groups into train / validation / test → noise augmentation of the training
// items only (typos, keyboard slips, dropped/swapped/joined words, fillers)
// → multinomial logistic regression over hashed n-gram features
// (src/lib/ai/nlp.mjs) with AdaGrad, L2, feature dropout and class-balanced
// sample weights → configuration and epoch picked on validation macro-F1 →
// evaluation on the untouched test set, before and after pruning + int8
// quantization → the exported model is retrained on every example with the
// chosen configuration and written in the binary format 3 to
// public/ai/hanogt-intent-model.bin → the shipped model is also scored on the
// blind holdout (ai/dataset/holdout.json), which is never used for training
// or selection. Metrics go to src/lib/ai/model-meta.json and
// ai/reports/intent-training-report.md.
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { encodeModelBinary, FEATURE_VERSION, featureBuckets, normalize, terms } from "../src/lib/ai/nlp.mjs";

const ROOT = process.cwd();
const DATASET = path.join(ROOT, "ai/dataset/intents.json");
const HOLDOUT = path.join(ROOT, "ai/dataset/holdout.json");
const MODEL_OUT = path.join(ROOT, "public/ai/hanogt-intent-model.bin");
const LEGACY_MODEL = path.join(ROOT, "public/ai/hanogt-intent-model.json");
const META_OUT = path.join(ROOT, "src/lib/ai/model-meta.json");
const REPORT_OUT = path.join(ROOT, "ai/reports/intent-training-report.md");
const QUICK = process.argv.includes("--quick");
const CROSS_VALIDATE = process.argv.includes("--cv");

// The model this training pipeline replaced (feature version 2, 41 intents),
// kept for the before/after table in the report.
const BASELINE = { intents: 41, examples: 1528, testAccuracy: 67.2, testMacroF1: 68.3, quantizedTestAccuracy: 66.4, sizeKb: 396.8 };

const CONFIG = {
    seed: 20261001,
    bits: 19,
    testShare: 0.15,
    validationShare: 0.12,
    augmentations: 6,
    /** Features seen in fewer training samples than this get no weights (mostly one-off typos). */
    minFeatureCount: 3,
    maxEpochs: 60,
    patience: 8,
    /** Character-trigram Jaccard similarity above which two examples count as paraphrases of each other. */
    nearDuplicate: 0.72,
    grid: [
        { learningRate: 0.5, l2: 1e-4, dropout: 0.5, average: true },
        { learningRate: 0.5, l2: 1e-4, dropout: 0.4, average: true },
        { learningRate: 0.3, l2: 1e-4, dropout: 0.5, average: true },
        { learningRate: 0.5, l2: 3e-4, dropout: 0.5, average: true },
        { learningRate: 0.8, l2: 1e-4, dropout: 0.5, average: true },
        { learningRate: 0.5, l2: 1e-4, dropout: 0.3, average: true },
    ],
    pruneBelow: 2,
    /** Strongest classes kept per feature; lowered automatically when the file would exceed maxModelBytes. */
    keepPerRow: 24,
    /**
     * Models whose weights are averaged for the test and the shipped model. A
     * softmax regression's average is again one linear model of the same
     * size, so this only reduces the variance of SGD, dropout and augmentation.
     */
    ensemble: 3,
    /** Each ensemble member gets its own augmented copies (more diversity, a few more rare features). */
    reaugment: false,
    maxModelBytes: 1.5 * 1024 * 1024,
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

// ---------------------------------------------------------------- augmentation
// Neutral fillers only: greetings or "thanks" here would leak into every intent.
const FILLERS_BEFORE = ["lütfen", "acaba", "please", "pls", "ya", "şey", "hmm", "abi", "bro", "rica etsem", "so", "ok"];
const FILLERS_AFTER = ["lütfen", "please", "pls", "ya", "acaba", "hemen", "şimdi", "now", "abi", "bro"];
// Neighbouring keys on a Turkish Q keyboard (and plain QWERTY).
const NEIGHBOURS = {
    q: "wa", w: "qes", e: "wrd", r: "etf", t: "ryg", y: "tuh", u: "yıj", ı: "uok", i: "uok", o: "ıpl", p: "oğ", ğ: "pü",
    a: "qsz", s: "adx", d: "sfc", f: "dgv", g: "fhb", h: "gjn", j: "hkm", k: "jl", l: "kş", ş: "li", z: "asx", x: "zc",
    c: "xv", v: "cb", b: "vn", n: "bm", m: "nö", ö: "mç", ç: "ö",
};

function typo(word, random) {
    if (word.length <= 3) return word;
    const at = 1 + Math.floor(random() * (word.length - 2));
    const kind = random();
    if (kind < 0.3) return word.slice(0, at) + word.slice(at + 1);
    if (kind < 0.5) return word.slice(0, at) + word[at] + word.slice(at);
    if (kind < 0.75) return word.slice(0, at - 1) + word[at] + word[at - 1] + word.slice(at + 1);
    const options = NEIGHBOURS[word[at].toLocaleLowerCase("tr")];
    return options ? word.slice(0, at) + options[Math.floor(random() * options.length)] + word.slice(at + 1) : word;
}

function augment(text, random) {
    let words = text.split(/\s+/).filter(Boolean);
    const operations = random() < 0.35 ? 2 : 1;
    for (let step = 0; step < operations; step += 1) {
        const pick = random();
        const index = Math.floor(random() * words.length);
        if (pick < 0.42 && words.length) {
            words[index] = typo(words[index], random);
        } else if (pick < 0.54 && words.length >= 3) {
            words.splice(index, 1);
        } else if (pick < 0.63 && words.length >= 2) {
            const at = Math.min(index, words.length - 2);
            [words[at], words[at + 1]] = [words[at + 1], words[at]];
        } else if (pick < 0.7 && words.length >= 2) {
            const at = Math.min(index, words.length - 2);
            words = [...words.slice(0, at), `${words[at]}${words[at + 1]}`, ...words.slice(at + 2)];
        } else if (pick < 0.86) {
            words.unshift(FILLERS_BEFORE[Math.floor(random() * FILLERS_BEFORE.length)]);
        } else {
            words.push(FILLERS_AFTER[Math.floor(random() * FILLERS_AFTER.length)]);
        }
    }
    return words.join(" ");
}

// ---------------------------------------------------------------- model
function vectorize(text) {
    const buckets = Int32Array.from(featureBuckets(text, CONFIG.bits));
    return { buckets, norm: 1 / Math.sqrt(Math.max(1, buckets.length)) };
}

function createModel(labelCount) {
    return {
        weights: new Map(),
        gradSquares: new Map(),
        bias: new Float64Array(labelCount),
        biasSquares: new Float64Array(labelCount).fill(1e-8),
        // Averaging (Daumé's trick): sums of step × update, so average = w − sums / steps.
        sums: new Map(),
        biasSums: new Float64Array(labelCount),
        steps: 1,
        labelCount,
    };
}

/** The averaged weights of all training steps so far: a strong, free regularizer for sparse SGD. */
function averaged(model) {
    const weights = new Map();
    for (const [bucket, row] of model.weights) {
        const sums = model.sums.get(bucket);
        weights.set(bucket, row.map((value, label) => value - sums[label] / model.steps));
    }
    const bias = model.bias.map((value, label) => value - model.biasSums[label] / model.steps);
    return { ...model, weights, bias };
}

function scores(model, buckets, norm) {
    const out = Float64Array.from(model.bias);
    for (const bucket of buckets) {
        const row = model.weights.get(bucket);
        if (!row) continue;
        for (let label = 0; label < model.labelCount; label += 1) out[label] += row[label] * norm;
    }
    return out;
}

function probabilitiesOf(logits) {
    let max = -Infinity;
    for (const value of logits) if (value > max) max = value;
    let sum = 0;
    const out = new Float64Array(logits.length);
    for (let index = 0; index < logits.length; index += 1) {
        out[index] = Math.exp(logits[index] - max);
        sum += out[index];
    }
    for (let index = 0; index < out.length; index += 1) out[index] /= sum;
    return out;
}

function trainEpoch(model, samples, random, options) {
    let loss = 0;
    for (const sample of shuffle(samples, random)) {
        let buckets = sample.buckets;
        let norm = sample.norm;
        if (options.dropout > 0 && buckets.length > 2) {
            const kept = buckets.filter(() => random() >= options.dropout);
            if (kept.length) {
                // Dropped features shrink the sum, so the rest are scaled up (inverted dropout).
                norm = sample.norm * (buckets.length / kept.length);
                buckets = kept;
            }
        }
        const probabilities = probabilitiesOf(scores(model, buckets, norm));
        loss -= sample.weight * Math.log(Math.max(1e-12, probabilities[sample.label]));
        const gradient = probabilities;
        gradient[sample.label] -= 1;
        const step = model.steps;
        for (let label = 0; label < model.labelCount; label += 1) {
            const g = gradient[label] * sample.weight;
            model.biasSquares[label] += g * g;
            const update = (options.learningRate / Math.sqrt(model.biasSquares[label])) * g;
            model.bias[label] -= update;
            model.biasSums[label] -= step * update;
        }
        for (const bucket of buckets) {
            let row = model.weights.get(bucket);
            let squares = model.gradSquares.get(bucket);
            let sums = model.sums.get(bucket);
            if (!row) {
                row = new Float64Array(model.labelCount);
                squares = new Float64Array(model.labelCount).fill(1e-8);
                sums = new Float64Array(model.labelCount);
                model.weights.set(bucket, row);
                model.gradSquares.set(bucket, squares);
                model.sums.set(bucket, sums);
            }
            for (let label = 0; label < model.labelCount; label += 1) {
                const g = gradient[label] * sample.weight * norm + options.l2 * row[label];
                squares[label] += g * g;
                const update = (options.learningRate / Math.sqrt(squares[label])) * g;
                row[label] -= update;
                sums[label] -= step * update;
            }
        }
        model.steps += 1;
    }
    return loss / samples.length;
}

function predict(model, sample) {
    const probabilities = probabilitiesOf(scores(model, sample.buckets, sample.norm));
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

function snapshot(model) {
    return { bias: Float64Array.from(model.bias), weights: new Map([...model.weights].map(([key, row]) => [key, Float64Array.from(row)])) };
}

function fit(trainSamples, validationSamples, labels, options, seed, fixedEpochs) {
    const random = mulberry32(seed);
    const model = createModel(labels.length);
    let best = { macroF1: -1, loss: Infinity, epoch: 0, state: null };
    let stale = 0;
    const history = [];
    const epochs = fixedEpochs ?? CONFIG.maxEpochs;
    for (let epoch = 1; epoch <= epochs; epoch += 1) {
        const trainLoss = trainEpoch(model, trainSamples, random, options);
        if (fixedEpochs) continue;
        const current = options.average ? averaged(model) : model;
        const validation = evaluate(current, validationSamples, labels);
        history.push({ epoch, trainLoss, validationLoss: validation.loss, validationAccuracy: validation.accuracy, validationMacroF1: validation.macroF1 });
        const better = validation.macroF1 > best.macroF1 + 1e-9 || (Math.abs(validation.macroF1 - best.macroF1) < 1e-9 && validation.loss < best.loss);
        if (better) {
            best = { macroF1: validation.macroF1, loss: validation.loss, accuracy: validation.accuracy, epoch, state: snapshot(current) };
            stale = 0;
        } else if ((stale += 1) >= CONFIG.patience) {
            break;
        }
    }
    if (!fixedEpochs && best.state) {
        model.bias = best.state.bias;
        model.weights = best.state.weights;
    } else if (fixedEpochs && options.average) {
        const final = averaged(model);
        model.bias = final.bias;
        model.weights = final.weights;
    }
    return { model, bestEpoch: best.epoch || epochs, best, history };
}

// ---------------------------------------------------------------- quantization
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

/** Per-row scales are powers of 2^(1/8) around the global scale, stored as one byte per row. */
const SCALE_STEPS = 8;

function rowScaleCode(maxAbs, baseScale) {
    if (!(maxAbs > 0)) return 128;
    const code = Math.ceil(Math.log2(maxAbs / 127 / baseScale) * SCALE_STEPS) + 128;
    return Math.max(0, Math.min(255, code));
}

function rowScaleOf(code, baseScale) {
    return baseScale * 2 ** ((code - 128) / SCALE_STEPS);
}

/**
 * Keeps the strongest weights of each row and quantizes them to int8 with a
 * per-row scale, so rare strong features (digits → math, a price word →
 * pricing) are not clipped and weak rows keep their resolution.
 */
function quantize(rawModel, keepPerRow = CONFIG.keepPerRow) {
    const model = centerRows(rawModel);
    const magnitudes = [];
    for (const row of model.weights.values()) for (const value of row) if (value) magnitudes.push(Math.abs(value));
    magnitudes.sort((a, b) => a - b);
    const baseScale = (magnitudes[Math.floor(magnitudes.length / 2)] || 1) / 127;
    const rows = [];
    let kept = 0;
    for (const [bucket, row] of model.weights) {
        const entries = [];
        for (let label = 0; label < row.length; label += 1) if (row[label]) entries.push([label, row[label]]);
        entries.sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]) || a[0] - b[0]);
        const top = entries.slice(0, keepPerRow);
        if (!top.length) continue;
        const code = rowScaleCode(Math.abs(top[0][1]), baseScale);
        const rowScale = rowScaleOf(code, baseScale);
        const quantized = top
            .map(([label, value]) => [label, Math.max(-127, Math.min(127, Math.round(value / rowScale)))])
            .filter(([, q]) => Math.abs(q) >= CONFIG.pruneBelow);
        if (!quantized.length) continue;
        kept += quantized.length;
        rows.push([bucket, quantized, code]);
    }
    rows.sort((a, b) => a[0] - b[0]);
    return { scale: baseScale, rows, bias: Array.from(model.bias, (value) => Number(value.toFixed(5))), kept };
}

/** Rebuilds a float model from quantized rows so the exported weights can be evaluated. */
function dequantize(quantized, labelCount) {
    const model = createModel(labelCount);
    model.bias = Float64Array.from(quantized.bias);
    for (const [bucket, entries, code] of quantized.rows) {
        const row = new Float64Array(labelCount);
        const rowScale = rowScaleOf(code, quantized.scale);
        for (const [label, q] of entries) row[label] = q * rowScale;
        model.weights.set(bucket, row);
    }
    return model;
}

/**
 * The weight blobs of format 3 (see decodeCompact in nlp.mjs): varint bucket
 * deltas, a label bitmask and a scale code per row, and one int8 weight per
 * set bit in label order — a byte per weight instead of a [label, weight] pair.
 */
function encodeCompact(quantized, labelCount) {
    const maskBytes = Math.ceil(labelCount / 8);
    const index = [];
    const masks = new Uint8Array(quantized.rows.length * maskBytes);
    const scales = [];
    const values = [];
    let previous = 0;
    quantized.rows.forEach(([bucket, entries, code], row) => {
        scales.push(code);
        let delta = bucket - previous;
        previous = bucket;
        do {
            let byte = delta & 0x7f;
            delta = Math.floor(delta / 128);
            if (delta > 0) byte |= 0x80;
            index.push(byte);
        } while (delta > 0);
        for (const [label, q] of [...entries].sort((a, b) => a[0] - b[0])) {
            masks[row * maskBytes + (label >> 3)] |= 1 << (label & 7);
            values.push(q & 0xff);
        }
    });
    return { index: Uint8Array.from(index), masks, scales: Uint8Array.from(scales), values: Uint8Array.from(values) };
}

// ---------------------------------------------------------------- data
const started = Date.now();
const dataset = JSON.parse(fs.readFileSync(DATASET, "utf8"));
const labels = Object.keys(dataset.intents);
const random = mulberry32(CONFIG.seed);

const owners = new Map();
const collisions = [];
const byLabel = labels.map((label) => {
    const seen = new Set();
    const unique = [];
    for (const text of dataset.intents[label]) {
        const key = normalize(text);
        if (!key || seen.has(key)) continue;
        seen.add(key);
        if (owners.has(key) && owners.get(key) !== label) {
            collisions.push(`${text} (${owners.get(key)} / ${label})`);
            continue;
        }
        owners.set(key, label);
        unique.push(text);
    }
    return unique;
});

function trigrams(text) {
    const value = `_${normalize(text).replace(/ /g, "_")}_`;
    const out = new Set();
    for (let index = 0; index + 3 <= value.length; index += 1) out.add(value.slice(index, index + 3));
    return out;
}

function jaccard(a, b) {
    let shared = 0;
    for (const item of a) if (b.has(item)) shared += 1;
    return shared / Math.max(1, a.size + b.size - shared);
}

/** Groups paraphrases (same content stems, or very similar spelling) with union-find. */
function clusters(examples) {
    const parent = examples.map((_, index) => index);
    const find = (index) => (parent[index] === index ? index : (parent[index] = find(parent[index])));
    const signatures = examples.map((text) => [...new Set(terms(text))].sort().join(" "));
    const grams = examples.map(trigrams);
    for (let a = 0; a < examples.length; a += 1) {
        for (let b = a + 1; b < examples.length; b += 1) {
            const same = (signatures[a] && signatures[a] === signatures[b]) || jaccard(grams[a], grams[b]) >= CONFIG.nearDuplicate;
            if (same) parent[find(a)] = find(b);
        }
    }
    const groups = new Map();
    examples.forEach((text, index) => {
        const root = find(index);
        if (!groups.has(root)) groups.set(root, []);
        groups.get(root).push(text);
    });
    return [...groups.values()];
}

// Blind holdout: written after the dataset, never trained on or used for
// selection. Texts that also appear in the dataset are left out; "strict"
// items have no near-copy (same content stems or similar spelling) in it.
const holdoutSource = fs.existsSync(HOLDOUT) ? JSON.parse(fs.readFileSync(HOLDOUT, "utf8")) : { intents: {} };
const datasetSignatures = new Set();
const datasetGrams = [];
byLabel.forEach((examples) => {
    for (const text of examples) {
        datasetSignatures.add([...new Set(terms(text))].sort().join(" "));
        datasetGrams.push(trigrams(text));
    }
});
const holdout = [];
let holdoutOverlap = 0;
for (const [name, texts] of Object.entries(holdoutSource.intents ?? {})) {
    const label = labels.indexOf(name);
    if (label < 0) continue;
    for (const text of texts) {
        if (owners.has(normalize(text))) {
            holdoutOverlap += 1;
            continue;
        }
        const signature = [...new Set(terms(text))].sort().join(" ");
        const grams = trigrams(text);
        const near = (signature && datasetSignatures.has(signature)) || datasetGrams.some((other) => jaccard(grams, other) >= CONFIG.nearDuplicate);
        holdout.push({ text, label, strict: !near });
    }
}

const split = { train: [], validation: [], test: [] };
let groupedExamples = 0;
let groupCount = 0;
byLabel.forEach((examples, label) => {
    const groups = shuffle(clusters(examples), random);
    groupCount += groups.length;
    groupedExamples += groups.filter((group) => group.length > 1).reduce((sum, group) => sum + group.length, 0);
    const testTarget = Math.max(1, Math.round(examples.length * CONFIG.testShare));
    const validationTarget = Math.max(1, Math.round(examples.length * CONFIG.validationShare));
    let test = 0;
    let validation = 0;
    for (const group of groups) {
        let bucket = "train";
        if (test < testTarget && test + group.length <= testTarget + 1) {
            bucket = "test";
            test += group.length;
        } else if (validation < validationTarget && validation + group.length <= validationTarget + 1) {
            bucket = "validation";
            validation += group.length;
        }
        for (const text of group) split[bucket].push({ text, label });
    }
});

// Class weights balance the loss when some intents have more examples.
const trainCounts = labels.map((_, label) => split.train.filter((item) => item.label === label).length);
const meanCount = trainCounts.reduce((sum, count) => sum + count, 0) / labels.length;
const classWeight = trainCounts.map((count) => Math.sqrt(meanCount / Math.max(1, count)));

const heldOut = new Set([...split.validation, ...split.test].map((item) => normalize(item.text)));
let droppedAugmentations = 0;
const expandWith = (items, seed, guard, weights) => {
    const augmentRandom = mulberry32(seed);
    const out = [];
    for (const item of items) {
        out.push({ ...vectorize(item.text), label: item.label, weight: weights[item.label], text: item.text });
        for (let copy = 0; copy < CONFIG.augmentations; copy += 1) {
            const text = augment(item.text, augmentRandom);
            // A typo could accidentally recreate a held-out sentence: never train on it.
            if (guard && guard.has(normalize(text))) {
                droppedAugmentations += 1;
                continue;
            }
            out.push({ ...vectorize(text), label: item.label, weight: weights[item.label], text });
        }
    }
    return out;
};
const expand = (items, seed, guard) => expandWith(items, seed, guard, classWeight);
const plain = (items) => items.map((item) => ({ ...vectorize(item.text), label: item.label, weight: 1, text: item.text }));

/** Keeps only features seen in at least CONFIG.minFeatureCount samples of the given training set. */
function pruneRareFeatures(samples) {
    const counts = new Map();
    for (const sample of samples) for (const bucket of sample.buckets) counts.set(bucket, (counts.get(bucket) ?? 0) + 1);
    let removed = 0;
    for (const sample of samples) {
        const kept = sample.buckets.filter((bucket) => counts.get(bucket) >= CONFIG.minFeatureCount);
        removed += sample.buckets.length - kept.length;
        // The norm still counts every feature, as it does when the browser scores a message.
        sample.buckets = kept;
    }
    return { features: [...counts.values()].filter((count) => count >= CONFIG.minFeatureCount).length, removed };
}

const trainSamples = expand(split.train, CONFIG.seed + 7, heldOut);
const droppedInTraining = droppedAugmentations;
const trainFeatures = pruneRareFeatures(trainSamples);

/** The weight average of several models (see CONFIG.ensemble). */
function averageModels(models) {
    if (models.length === 1) return models[0];
    const out = createModel(labels.length);
    out.bias = Float64Array.from(models[0].bias, (_, label) => models.reduce((sum, model) => sum + model.bias[label], 0) / models.length);
    for (const model of models) {
        for (const [bucket, row] of model.weights) {
            let target = out.weights.get(bucket);
            if (!target) {
                target = new Float64Array(labels.length);
                out.weights.set(bucket, target);
            }
            for (let label = 0; label < row.length; label += 1) target[label] += row[label] / models.length;
        }
    }
    return out;
}

/** Trains CONFIG.ensemble models on the augmented items with the chosen configuration and averages them. */
function trainEnsemble(items, seed, guard, weights, options, epochs) {
    const models = [];
    let samples = null;
    for (let member = 0; member < CONFIG.ensemble; member += 1) {
        if (!samples || CONFIG.reaugment) {
            samples = expandWith(items, seed + member * 1000, guard, weights);
            pruneRareFeatures(samples);
        }
        models.push(fit(samples, [], labels, options, seed + 1 + member * 1000, epochs).model);
    }
    return { model: averageModels(models), sampleCount: samples.length };
}
const validationSamples = plain(split.validation);
const testSamples = plain(split.test);

// ---------------------------------------------------------------- experiment
const grid = QUICK ? CONFIG.grid.slice(0, 1) : CONFIG.grid;
const searches = [];
let chosen = null;
for (const options of grid) {
    const result = fit(trainSamples, validationSamples, labels, options, CONFIG.seed + 1);
    searches.push({ options, epoch: result.bestEpoch, validationMacroF1: result.best.macroF1, validationAccuracy: result.best.accuracy });
    console.log(`  lr ${options.learningRate}, l2 ${options.l2}, dropout ${options.dropout}: epoch ${result.bestEpoch}, validation macro-F1 %${(result.best.macroF1 * 100).toFixed(1)}`);
    if (!chosen || result.best.macroF1 > chosen.result.best.macroF1 + 1e-9) chosen = { options, result };
}
const { options: bestOptions, result: experiment } = chosen;
const bestEpoch = experiment.bestEpoch;
// The selection model saw only the training split: validation scores and the threshold come from it.
const selectionModel = experiment.model;
const validationFloat = evaluate(selectionModel, validationSamples, labels);
// The test model: the chosen configuration retrained on train + validation; the test split stays unseen.
const testGuard = new Set(split.test.map((item) => normalize(item.text)));
const { model: experimentModel } = trainEnsemble([...split.train, ...split.validation], CONFIG.seed + 9, testGuard, classWeight, bestOptions, bestEpoch);
const testFloat = evaluate(experimentModel, testSamples, labels);

// ---------------------------------------------------------------- final model
const everything = [...split.train, ...split.validation, ...split.test];
const { model: finalModel, sampleCount: finalSampleCount } = trainEnsemble(everything, CONFIG.seed + 11, null, classWeight, bestOptions, bestEpoch);

// Keep as many weights per feature as the size budget allows; the test and
// threshold below use the same setting as the shipped file.
const exportHeader = (quantized, thresholdValue) => ({
    format: "hanogt-intent-model",
    version: 3,
    featureVersion: FEATURE_VERSION,
    bits: CONFIG.bits,
    labels,
    bias: quantized.bias,
    scale: quantized.scale,
    scaleSteps: SCALE_STEPS,
    threshold: thresholdValue,
});
let keepPerRow = CONFIG.keepPerRow;
let finalQuantized = quantize(finalModel, keepPerRow);
while (encodeModelBinary(exportHeader(finalQuantized, 0.3), encodeCompact(finalQuantized, labels.length)).length > CONFIG.maxModelBytes && keepPerRow > 6) {
    keepPerRow -= 2;
    finalQuantized = quantize(finalModel, keepPerRow);
}
const experimentQuantized = quantize(experimentModel, keepPerRow);
const quantizedExperimentModel = dequantize(experimentQuantized, labels.length);
const testQuantized = evaluate(quantizedExperimentModel, testSamples, labels);
const quantizedSelectionModel = dequantize(quantize(selectionModel, keepPerRow), labels.length);

// Confidence threshold for "not sure → search the knowledge base instead":
// the value that maximizes validation accuracy when low-confidence
// predictions are treated as "unknown".
const unknownLabel = labels.indexOf("unknown");
let threshold = { value: 0.3, accuracy: 0 };
for (let value = 0.1; value <= 0.7001; value += 0.05) {
    let correct = 0;
    for (const sample of validationSamples) {
        const result = predict(quantizedSelectionModel, sample);
        const predicted = result.probability < value ? unknownLabel : result.label;
        if (predicted === sample.label) correct += 1;
    }
    const accuracy = correct / validationSamples.length;
    if (accuracy > threshold.accuracy + 1e-9) threshold = { value: Number(value.toFixed(2)), accuracy };
}

const trainingAccuracy = evaluate(dequantize(finalQuantized, labels.length), plain(everything), labels).accuracy;
const binary = encodeModelBinary(exportHeader(finalQuantized, threshold.value), encodeCompact(finalQuantized, labels.length));
console.log(`  test: float %${(testFloat.accuracy * 100).toFixed(1)} / F1 %${(testFloat.macroF1 * 100).toFixed(1)}, quantized %${(testQuantized.accuracy * 100).toFixed(1)} / F1 %${(testQuantized.macroF1 * 100).toFixed(1)}, model ${(binary.length / 1024).toFixed(0)} KB, ${finalQuantized.rows.length} rows, ${keepPerRow} weights per row`);
if (binary.length > CONFIG.maxModelBytes) {
    throw new Error(`The model is ${(binary.length / 1024).toFixed(0)} KB, above the ${CONFIG.maxModelBytes / 1024} KB budget.`);
}
fs.mkdirSync(path.dirname(MODEL_OUT), { recursive: true });
fs.writeFileSync(MODEL_OUT, binary);
// Format 2 (base64 in JSON) is replaced by the binary file.
if (fs.existsSync(LEGACY_MODEL)) fs.rmSync(LEGACY_MODEL);
const sizeKb = fs.statSync(MODEL_OUT).size / 1024;

// ---------------------------------------------------------------- holdout and cross-validation
const shippedModel = dequantize(finalQuantized, labels.length);
const holdoutSamples = plain(holdout);
const holdoutResult = evaluate(shippedModel, holdoutSamples, labels);
const strictSamples = plain(holdout.filter((item) => item.strict));
const strictResult = evaluate(shippedModel, strictSamples, labels);
const holdoutMistakes = holdoutSamples
    .map((sample) => ({ sample, result: predict(shippedModel, sample) }))
    .filter(({ sample, result }) => result.label !== sample.label);
console.log(`  holdout: %${(holdoutResult.accuracy * 100).toFixed(1)} / F1 %${(holdoutResult.macroF1 * 100).toFixed(1)} (${holdoutSamples.length} sentences; strict %${(strictResult.accuracy * 100).toFixed(1)} on ${strictSamples.length})`);

/** 5-fold cross-validation with the chosen configuration (group-aware, stratified per intent). */
function crossValidate(folds = 5) {
    const foldOf = [];
    byLabel.forEach((examples, label) => {
        const groups = shuffle(clusters(examples), mulberry32(CONFIG.seed + 31 + label));
        const sizes = new Array(folds).fill(0);
        for (const group of groups) {
            let target = 0;
            for (let fold = 1; fold < folds; fold += 1) if (sizes[fold] < sizes[target]) target = fold;
            sizes[target] += group.length;
            for (const text of group) foldOf.push({ text, label, fold: target });
        }
    });
    const results = [];
    for (let fold = 0; fold < folds; fold += 1) {
        const trainItems = foldOf.filter((item) => item.fold !== fold);
        const testItems = foldOf.filter((item) => item.fold === fold);
        const counts = labels.map((_, label) => trainItems.filter((item) => item.label === label).length);
        const mean = counts.reduce((sum, count) => sum + count, 0) / labels.length;
        const weights = counts.map((count) => Math.sqrt(mean / Math.max(1, count)));
        const guard = new Set(testItems.map((item) => normalize(item.text)));
        const { model } = trainEnsemble(trainItems, CONFIG.seed + 100 + fold, guard, weights, bestOptions, bestEpoch);
        const tests = plain(testItems);
        results.push({ float: evaluate(model, tests, labels), quantized: evaluate(dequantize(quantize(model, keepPerRow), labels.length), tests, labels) });
        console.log(`  cross-validation fold ${fold + 1}/${folds}: %${(results[fold].quantized.accuracy * 100).toFixed(1)}`);
    }
    const mean = (pick) => results.reduce((sum, result) => sum + pick(result), 0) / results.length;
    return {
        floatAccuracy: mean((result) => result.float.accuracy),
        floatMacroF1: mean((result) => result.float.macroF1),
        accuracy: mean((result) => result.quantized.accuracy),
        macroF1: mean((result) => result.quantized.macroF1),
        folds: results.map((result) => result.quantized.accuracy),
    };
}
const cv = CROSS_VALIDATE ? crossValidate() : null;

const round = (value) => Number((value * 100).toFixed(1));
const meta = {
    version: 3,
    featureVersion: FEATURE_VERSION,
    file: path.basename(MODEL_OUT),
    /** Content hash: the browser adds it to the model URL, so a new model is never mixed with a cached old one. */
    hash: createHash("sha256").update(binary).digest("hex").slice(0, 12),
    trainedAt: new Date().toISOString().slice(0, 10),
    intents: labels.length,
    examples: everything.length,
    augmentedTrainingSamples: finalSampleCount,
    ensemble: CONFIG.ensemble,
    weightsPerRow: keepPerRow,
    epochs: bestEpoch,
    testAccuracy: round(testFloat.accuracy),
    testMacroF1: round(testFloat.macroF1),
    quantizedTestAccuracy: round(testQuantized.accuracy),
    quantizedTestMacroF1: round(testQuantized.macroF1),
    holdoutExamples: holdoutSamples.length,
    holdoutAccuracy: round(holdoutResult.accuracy),
    holdoutMacroF1: round(holdoutResult.macroF1),
    holdoutStrictAccuracy: round(strictResult.accuracy),
    cvAccuracy: cv ? round(cv.accuracy) : null,
    cvMacroF1: cv ? round(cv.macroF1) : null,
    threshold: threshold.value,
    parameters: experimentQuantized.kept,
    exportedWeights: finalQuantized.kept,
    sizeKb: Number(sizeKb.toFixed(1)),
};
fs.writeFileSync(META_OUT, `${JSON.stringify(meta, null, 2)}\n`);

// ---------------------------------------------------------------- report
const table = (rows) => rows.join("\n") || "| — | — | — |";
const escape = (text) => text.replace(/\|/g, "\\|");
const perIntent = testQuantized.perLabel.filter((entry) => entry.support).sort((a, b) => a.f1 - b.f1 || a.name.localeCompare(b.name));
const confusions = [];
testQuantized.confusion.forEach((row, actual) => row.forEach((count, predicted) => {
    if (actual !== predicted && count) confusions.push({ actual: labels[actual], predicted: labels[predicted], count });
}));
confusions.sort((a, b) => b.count - a.count);
const mistakes = [];
for (const sample of testSamples) {
    const result = predict(quantizedExperimentModel, sample);
    if (result.label !== sample.label) mistakes.push(`| ${escape(sample.text)} | ${labels[sample.label]} | ${labels[result.label]} (${(result.probability * 100).toFixed(0)}%) |`);
}
const ACTIONS = ["create_group", "my_profile", "write_code", "open_editor", "make_game", "navigate"];
const actionRows = perIntent.filter((entry) => ACTIONS.includes(entry.name)).sort((a, b) => a.name.localeCompare(b.name));

const report = `# Hanogt AI — intent model training report

Generated by \`npm run ai:train${CROSS_VALIDATE ? " -- --cv" : ""}\` on ${meta.trainedAt}. Seed ${CONFIG.seed}; feature version ${FEATURE_VERSION}; model format 3 (binary, \`public/ai/${path.basename(MODEL_OUT)}\`).

## Before and after

| | Intents | Examples | Test accuracy | Test macro F1 | Accuracy after quantization | Model size |
| --- | --- | --- | --- | --- | --- | --- |
| Before (feature version 2) | ${BASELINE.intents} | ${BASELINE.examples} | ${BASELINE.testAccuracy}% | ${BASELINE.testMacroF1}% | ${BASELINE.quantizedTestAccuracy}% | ${BASELINE.sizeKb} KB |
| Now (feature version ${FEATURE_VERSION}) | ${labels.length} | ${meta.examples} | ${meta.testAccuracy}% | ${meta.testMacroF1}% | ${meta.quantizedTestAccuracy}% | ${meta.sizeKb} KB |

## Data

- Intents: **${labels.length}**, unique examples: **${meta.examples}** (train ${split.train.length} / validation ${split.validation.length} / test ${split.test.length})
- Leakage control: examples are grouped into **${groupCount} paraphrase groups** (same content stems or character-trigram Jaccard ≥ ${CONFIG.nearDuplicate}; ${groupedExamples} examples share a group). Whole groups are assigned to one split, stratified per intent, so a test sentence never has a near-copy in training.${collisions.length ? ` ${collisions.length} text(s) labelled with two intents were dropped.` : ""}
- Augmentation is applied to **training items only**: ${CONFIG.augmentations} noisy copies each (typos and keyboard slips, dropped, swapped or joined words, neutral fillers) → ${trainSamples.length} training samples. ${droppedInTraining} augmented copies that happened to equal a validation/test sentence were discarded.
- Class-balanced loss: sample weight √(mean count / intent count), between ${Math.min(...classWeight).toFixed(2)} and ${Math.max(...classWeight).toFixed(2)}.
- Features: words, 5-character stems, stem bigrams, in-word character trigrams, first and last stem, a multilingual concept lexicon (concept tags and tag pairs, e.g. create + group), script and shape (digits, operators, codes, Cyrillic/Arabic/CJK, length); hashed into 2^${CONFIG.bits} buckets. Features seen in fewer than ${CONFIG.minFeatureCount} training samples (mostly one-off typos) get no weight: ${trainFeatures.features.toLocaleString("en-US")} features are learned.

## Model

Multinomial logistic regression (softmax) trained with AdaGrad, L2 and feature dropout. The configuration and the epoch are chosen on validation macro-F1 (early stopping, patience ${CONFIG.patience}):

| Learning rate | L2 | Feature dropout | Best epoch | Validation macro-F1 | Validation accuracy |
| --- | --- | --- | --- | --- | --- |
${searches.map((entry) => `| ${entry.options.learningRate} | ${entry.options.l2} | ${entry.options.dropout} | ${entry.epoch} | ${round(entry.validationMacroF1)}% | ${round(entry.validationAccuracy)}% |`).join("\n")}

Chosen: learning rate ${bestOptions.learningRate}, L2 ${bestOptions.l2}, dropout ${bestOptions.dropout}, ${bestEpoch} epochs, averaged weights. A hidden layer was not added: with hashed sparse features it multiplies the size by the layer width, while richer features (concept lexicon, larger hash space) and more data gave the measured gains; the linear model also scores a message in well under a millisecond.

The shipped model is retrained with that configuration on every example (train + validation + test) for ${bestEpoch} epochs${CONFIG.ensemble > 1 ? ` as the weight average of ${CONFIG.ensemble} runs with different seeds (a softmax regression's average is again one linear model)` : ""}, rows are centred, cut to the ${keepPerRow} strongest classes per feature and quantized to int8 with a per-row scale (|q| < ${CONFIG.pruneBelow} dropped), and stored as a label bitmask per row plus one byte per weight: ${finalQuantized.kept.toLocaleString("en-US")} weights in ${finalQuantized.rows.length.toLocaleString("en-US")} rows, written as raw bytes: **${sizeKb.toFixed(1)} KB** (budget ${(CONFIG.maxModelBytes / 1024).toFixed(0)} KB). The test scores below come from the chosen configuration retrained on train + validation (${split.train.length + split.validation.length} sentences), which never saw the test set; the holdout scores come from the shipped model.

## Results (held-out test set: ${split.test.length} sentences, never used for training or selection)

| Metric | Value |
| --- | --- |
| Accuracy (float weights) | **${round(testFloat.accuracy)}%** |
| Macro F1 (float weights) | **${round(testFloat.macroF1)}%** |
| Accuracy after pruning + int8 quantization (what the browser runs) | **${round(testQuantized.accuracy)}%** |
| Macro F1 after quantization | **${round(testQuantized.macroF1)}%** |
| Validation accuracy / macro F1 at the chosen epoch | ${round(validationFloat.accuracy)}% / ${round(validationFloat.macroF1)}% |
| Low-confidence threshold (→ knowledge search) | ${threshold.value} (validation accuracy ${round(threshold.accuracy)}%) |
| Accuracy of the shipped model on all examples (training fit) | ${round(trainingAccuracy)}% |
### Blind holdout (shipped model)

\`ai/dataset/holdout.json\` holds ${holdoutSamples.length + holdoutOverlap} sentences written after the dataset and never used for training, selection or error analysis${holdoutOverlap ? ` (${holdoutOverlap} that also occur in the dataset are skipped)` : ""}. They are ordinary requests, so ${holdoutSamples.length - strictSamples.length} of them resemble a dataset sentence; the strict subset leaves those out.

| Holdout | Sentences | Accuracy | Macro F1 |
| --- | --- | --- | --- |
| All | ${holdoutSamples.length} | **${round(holdoutResult.accuracy)}%** | **${round(holdoutResult.macroF1)}%** |
| Strict (no near-copy in the dataset) | ${strictSamples.length} | ${round(strictResult.accuracy)}% | — |

${holdoutMistakes.length ? `Holdout mistakes:\n\n| Message | Expected | Predicted |\n| --- | --- | --- |\n${holdoutMistakes.map(({ sample, result }) => `| ${escape(sample.text)} | ${labels[sample.label]} | ${labels[result.label]} (${(result.probability * 100).toFixed(0)}%) |`).join("\n")}\n` : "No holdout mistakes.\n"}
${cv ? `### 5-fold cross-validation (every example tested once, chosen configuration)

| Weights | Accuracy | Macro F1 | Per fold (quantized accuracy) |
| --- | --- | --- | --- |
| Float | ${round(cv.floatAccuracy)}% | ${round(cv.floatMacroF1)}% | |
| Quantized | **${round(cv.accuracy)}%** | **${round(cv.macroF1)}%** | ${cv.folds.map((value) => `${round(value)}%`).join(", ")} |
` : "Cross-validation was not run this time (\`npm run ai:train -- --cv\`).\n"}
### Agent action intents (test, quantized)

| Intent | Precision | Recall | F1 | Support |
| --- | --- | --- | --- | --- |
${table(actionRows.map((entry) => `| ${entry.name} | ${round(entry.precision)}% | ${round(entry.recall)}% | ${round(entry.f1)}% | ${entry.support} |`))}

### Every intent (test, quantized, hardest first)

| Intent | Precision | Recall | F1 | Support |
| --- | --- | --- | --- | --- |
${table(perIntent.map((entry) => `| ${entry.name} | ${round(entry.precision)}% | ${round(entry.recall)}% | ${round(entry.f1)}% | ${entry.support} |`))}

### Most frequent confusions

| Expected | Predicted | Count |
| --- | --- | --- |
${table(confusions.slice(0, 15).map((entry) => `| ${entry.actual} | ${entry.predicted} | ${entry.count} |`))}

### Test mistakes

| Message | Expected | Predicted |
| --- | --- | --- |
${table(mistakes)}

### Learning curve of the chosen configuration (validation)

| Epoch | Train loss | Validation loss | Validation accuracy | Validation macro F1 |
| --- | --- | --- | --- | --- |
${experiment.history.filter((entry, index) => index % 3 === 0 || entry.epoch === bestEpoch).map((entry) => `| ${entry.epoch} | ${entry.trainLoss.toFixed(3)} | ${entry.validationLoss.toFixed(3)} | ${round(entry.validationAccuracy)}% | ${round(entry.validationMacroF1)}% |`).join("\n")}
${collisions.length ? `\n### Dropped label collisions\n\n${collisions.map((entry) => `- ${escape(entry)}`).join("\n")}\n` : ""}
## Limits

This is a small supervised classifier that routes messages to Hanogt AI's offline skills (site knowledge, agent actions, security tools, snippets, error explanations, calculator). It does not generate free text; open-ended answers come from the large language model configured on the server (see docs/HANOGT_AI.md). The test sentences were written by the same authors as the training data, so real-world accuracy on unusual phrasing will be lower; low-confidence predictions fall back to knowledge search.
`;
fs.mkdirSync(path.dirname(REPORT_OUT), { recursive: true });
fs.writeFileSync(REPORT_OUT, report);

console.log(`Hanogt AI intent modeli eğitildi (${((Date.now() - started) / 1000).toFixed(1)} sn)`);
console.log(`  niyet: ${labels.length}, örnek: ${meta.examples} (eğitim ${split.train.length} / doğrulama ${split.validation.length} / test ${split.test.length}), artırılmış eğitim örneği: ${trainSamples.length}`);
console.log(`  seçilen: lr ${bestOptions.learningRate}, l2 ${bestOptions.l2}, dropout ${bestOptions.dropout}, epoch ${bestEpoch}`);
console.log(`  test doğruluğu: %${meta.testAccuracy}, makro F1: %${meta.testMacroF1}, nicemlenmiş: %${meta.quantizedTestAccuracy} / F1 %${meta.quantizedTestMacroF1}`);
console.log(`  eşik: ${threshold.value}, ağırlık: ${finalQuantized.kept}, boyut: ${sizeKb.toFixed(1)} KB → ${path.relative(ROOT, MODEL_OUT)}`);
