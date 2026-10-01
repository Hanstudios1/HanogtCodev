// Hanogt AI text processing. Plain ESM (no TypeScript, no path aliases) so the
// browser engine, the /api/ai route and scripts/train-hanogt-ai.mjs share the
// exact same normalization and features — a trained model is only valid with
// the feature extractor it was trained with (see FEATURE_VERSION).

export const FEATURE_VERSION = 2;

/**
 * Lower-cases with Turkish rules (I → ı, İ → i), strips diacritics, turns
 * apostrophes and punctuation into spaces. Keeps letters of every script,
 * digits and the characters of "c#", "c++" and "f#".
 * @param {string} text
 * @returns {string}
 */
export function normalize(text) {
    return String(text ?? "")
        .toLocaleLowerCase("tr")
        .normalize("NFKD")
        .replace(/[̀-ͯ]/g, "")
        .replace(/ı/g, "i")
        .replace(/[^\p{L}\p{N}#+]+/gu, " ")
        .replace(/(^|\s)[#+]+(?=\s|$)/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

/**
 * @param {string} text
 * @returns {string[]}
 */
export function tokenize(text) {
    const normalized = normalize(text);
    return normalized ? normalized.split(" ") : [];
}

/**
 * Prefix stemming: the first five characters of a word are a strong stem for
 * agglutinative Turkish ("parolamı", "parolanın" → "parol") and work well
 * enough for English ("passwords" → "passw").
 * @param {string} token
 * @returns {string}
 */
export function stem(token) {
    return token.length > 5 ? token.slice(0, 5) : token;
}

const STOPWORDS = new Set([
    // Turkish
    "ve", "ile", "bir", "bu", "su", "o", "da", "de", "mi", "mu", "mii", "ne", "icin", "gibi", "ama", "veya", "ya", "ki", "cok", "daha",
    "en", "ben", "sen", "biz", "siz", "onlar", "benim", "senin", "nasil", "neden", "nerede", "hangi", "mı", "var", "yok", "olan", "olarak",
    "ise", "diye", "her", "hem", "kadar", "sonra", "once", "simdi", "lutfen", "acaba", "bana", "sana", "beni", "seni", "şu",
    // English
    "the", "a", "an", "and", "or", "of", "to", "in", "on", "for", "with", "is", "are", "was", "were", "be", "it", "this", "that", "i",
    "you", "me", "my", "your", "do", "does", "can", "could", "would", "should", "how", "what", "why", "where", "which", "please", "at",
    "as", "by", "from", "about", "into", "so", "if", "then", "there", "their", "we", "our", "us", "am", "have", "has", "will",
]);

/**
 * Content terms for retrieval (BM25): stems without stop words.
 * @param {string} text
 * @returns {string[]}
 */
const SHORT_TERMS = new Set(["c", "r", "d", "go", "js", "ts", "ai", "ui", "db", "os", "id", "c#", "f#", "c++", "3d", "2d", "ip", "pc"]);

export function terms(text) {
    // Turkish suffixes after an apostrophe ("javascript'te") become 1–2 letter tokens; they only add noise.
    return tokenize(text).filter((token) => (token.length > 2 || SHORT_TERMS.has(token)) && !STOPWORDS.has(token)).map(stem);
}

/**
 * Classifier features: words, stems, stem bigrams and in-word character
 * trigrams (robust against typos and suffixes).
 * @param {string} text
 * @returns {string[]}
 */
export function features(text) {
    const tokens = tokenize(text).slice(0, 64);
    const out = [];
    const stems = tokens.map(stem);
    for (let index = 0; index < tokens.length; index += 1) {
        const token = tokens[index];
        out.push(`w:${token}`);
        if (stems[index] !== token) out.push(`s:${stems[index]}`);
        if (index + 1 < tokens.length) out.push(`b:${stems[index]}_${stems[index + 1]}`);
        if (token.length >= 3) {
            const padded = `<${token}>`;
            for (let start = 0; start + 3 <= padded.length && start < 12; start += 1) out.push(`c:${padded.slice(start, start + 3)}`);
        }
    }
    if (!tokens.length) out.push("empty");
    return out;
}

/**
 * 32-bit FNV-1a.
 * @param {string} value
 * @returns {number}
 */
export function fnv1a(value) {
    let hash = 0x811c9dc5;
    for (let index = 0; index < value.length; index += 1) {
        hash ^= value.charCodeAt(index);
        hash = Math.imul(hash, 0x01000193);
    }
    return hash >>> 0;
}

/**
 * Hashed, de-duplicated feature buckets of a text.
 * @param {string} text
 * @param {number} bits
 * @returns {number[]}
 */
export function featureBuckets(text, bits) {
    const mask = (1 << bits) - 1;
    const seen = new Set();
    for (const feature of features(text)) seen.add(fnv1a(feature) & mask);
    return [...seen];
}

/**
 * Softmax over logits.
 * @param {number[]} logits
 * @returns {number[]}
 */
export function softmax(logits) {
    const max = Math.max(...logits);
    const exps = logits.map((value) => Math.exp(value - max));
    const sum = exps.reduce((total, value) => total + value, 0);
    return exps.map((value) => value / sum);
}

/**
 * Decodes a base64 string of signed 8-bit weights (browser + Node).
 * @param {string} base64
 * @returns {Int8Array}
 */
export function decodeInt8(base64) {
    if (typeof atob === "function") {
        const binary = atob(base64);
        const out = new Int8Array(binary.length);
        for (let index = 0; index < binary.length; index += 1) out[index] = (binary.charCodeAt(index) << 24) >> 24;
        return out;
    }
    return new Int8Array(Buffer.from(base64, "base64"));
}

/**
 * Scores a text with a trained intent model (see scripts/train-hanogt-ai.mjs).
 * Each row is a base64 string of sparse [label, int8 weight] pairs; rows are
 * decoded lazily and cached on the model object.
 * @param {{ bits: number, labels: string[], bias: number[], scale: number, rows: Record<string, string>, featureVersion?: number, threshold?: number, _cache?: Map<number, Int8Array | null> }} model
 * @param {string} text
 * @returns {Array<{ label: string, probability: number }>}
 */
export function classify(model, text) {
    const buckets = featureBuckets(text, model.bits);
    const logits = model.bias.slice();
    const norm = 1 / Math.sqrt(Math.max(1, buckets.length));
    if (!model._cache) model._cache = new Map();
    for (const bucket of buckets) {
        let row = model._cache.get(bucket);
        if (row === undefined) {
            const encoded = model.rows[bucket];
            row = encoded ? decodeInt8(encoded) : null;
            model._cache.set(bucket, row);
        }
        if (!row) continue;
        // Rows are sparse: [label, weight, label, weight, …] as signed bytes.
        for (let index = 0; index + 1 < row.length; index += 2) logits[row[index]] += row[index + 1] * model.scale * norm;
    }
    const probabilities = softmax(logits);
    return model.labels
        .map((label, index) => ({ label, probability: probabilities[index] }))
        .sort((a, b) => b.probability - a.probability);
}

/**
 * Small BM25 index over documents made of one or more text fields.
 */
export class Bm25Index {
    /**
     * @param {Array<{ id: string, text: string, boost?: number }>} documents
     * @param {{ k1?: number, b?: number }} [options]
     */
    constructor(documents, options = {}) {
        this.k1 = options.k1 ?? 1.2;
        this.b = options.b ?? 0.75;
        this.documents = documents.map((document) => {
            const tokens = terms(document.text);
            const frequencies = new Map();
            for (const token of tokens) frequencies.set(token, (frequencies.get(token) ?? 0) + 1);
            return { id: document.id, boost: document.boost ?? 1, length: tokens.length, frequencies };
        });
        this.averageLength = this.documents.reduce((sum, document) => sum + document.length, 0) / Math.max(1, this.documents.length);
        this.documentFrequency = new Map();
        for (const document of this.documents) for (const token of document.frequencies.keys()) this.documentFrequency.set(token, (this.documentFrequency.get(token) ?? 0) + 1);
    }

    /**
     * @param {string} term
     */
    idf(term) {
        const count = this.documentFrequency.get(term) ?? 0;
        return Math.log(1 + (this.documents.length - count + 0.5) / (count + 0.5));
    }

    /**
     * @param {string} query
     * @param {number} [limit]
     * @returns {Array<{ id: string, score: number, matched: number, coverage: number }>}
     */
    search(query, limit = 5) {
        const queryTerms = [...new Set(terms(query))];
        if (!queryTerms.length) return [];
        const results = [];
        for (const document of this.documents) {
            let score = 0;
            let matched = 0;
            for (const term of queryTerms) {
                const frequency = document.frequencies.get(term);
                if (!frequency) continue;
                matched += 1;
                const denominator = frequency + this.k1 * (1 - this.b + (this.b * document.length) / Math.max(1, this.averageLength));
                score += this.idf(term) * ((frequency * (this.k1 + 1)) / denominator);
            }
            if (score > 0) results.push({ id: document.id, score: score * document.boost, matched });
        }
        return results.sort((a, b) => b.score - a.score).slice(0, limit).map((result) => ({ ...result, coverage: result.matched / queryTerms.length }));
    }
}
