// Hanogt code-bench tasks: 20 JavaScript and 20 Python functions, each with a
// Turkish and an English prompt, a reference solution and hidden tests.
//
// JavaScript solutions and tests are real functions (their source text is
// what runs); Python ones are source strings. Tests get `assert`
// (node:assert/strict) and the task's functions; Python tests are a function
// body with plain asserts and the `_raises(exc, fn, *args)` helper. The tasks
// are written for this benchmark: none of them comes from a public set, and
// training/build-dataset.mjs keeps every one of them out of the training data.

const js = (task) => ({ language: "javascript", ...task, entries: task.entries ?? [task.solution.name] });
/** A Python task: its entry is the first top-level `def` of the solution unless `entries` lists them. */
const py = (task) => ({ language: "python", ...task, entries: task.entries ?? [/^def\s+(\w+)/m.exec(task.solution)[1]] });

export const BENCH_TASKS = [
    // ------------------------------------------------------------------ JavaScript
    js({
        id: "js-chunk",
        tags: ["array"],
        prompt: {
            TR: "JavaScript ile `chunk(array, size)` fonksiyonunu yaz: diziyi `size` uzunluğunda parçalara böler ve parçaların dizisini döndürür; son parça daha kısa olabilir. Boş dizi için `[]` döner. `size` pozitif bir tam sayı değilse `RangeError` fırlatır. Girdi dizisini değiştirmez.",
            EN: "Write `chunk(array, size)` in JavaScript: it splits the array into pieces of length `size` and returns an array of the pieces; the last piece may be shorter. An empty array gives `[]`. If `size` isn't a positive integer it throws a `RangeError`. It must not change the input array.",
        },
        solution: function chunk(array, size) {
            if (!Number.isInteger(size) || size < 1) throw new RangeError("size must be a positive integer");
            const out = [];
            for (let index = 0; index < array.length; index += size) out.push(array.slice(index, index + size));
            return out;
        },
        tests: (assert, { chunk }) => {
            assert.deepEqual(chunk([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
            assert.deepEqual(chunk([1, 2, 3], 3), [[1, 2, 3]]);
            assert.deepEqual(chunk([1, 2], 5), [[1, 2]]);
            assert.deepEqual(chunk([], 3), []);
            const input = [1, 2, 3, 4];
            chunk(input, 3);
            assert.deepEqual(input, [1, 2, 3, 4]);
            assert.throws(() => chunk([1], 0), RangeError);
            assert.throws(() => chunk([1], 1.5), RangeError);
            assert.throws(() => chunk([1], -2), RangeError);
        },
    }),
    js({
        id: "js-deep-equal",
        tags: ["object", "recursion"],
        prompt: {
            TR: "JavaScript ile `deepEqual(a, b)` fonksiyonunu yaz: iki değeri yapısal olarak karşılaştırır. Sayı, metin, boolean, null ve undefined `===` ile karşılaştırılır; ancak NaN NaN'a eşittir. Diziler aynı uzunluktaysa ve elemanları sırayla eşitse eşittir. Düz nesneler aynı kendi anahtarlarına (sıra önemsiz) ve eşit değerlere sahipse eşittir; bir nesnede olup diğerinde olmayan anahtar (değeri undefined olsa bile) eşitliği bozar. Dizi ile nesne asla eşit değildir. İç içe yapılar desteklenmeli.",
            EN: "Write `deepEqual(a, b)` in JavaScript: it compares two values structurally. Numbers, strings, booleans, null and undefined compare with `===`, except that NaN equals NaN. Arrays are equal when they have the same length and equal elements in order. Plain objects are equal when they have the same own keys (in any order) and equal values; a key present in one object and not the other (even with the value undefined) makes them different. An array never equals an object. Nested structures must work.",
        },
        solution: function deepEqual(a, b) {
            if (a === b) return true;
            if (typeof a === "number" && typeof b === "number") return Number.isNaN(a) && Number.isNaN(b);
            if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
            if (Array.isArray(a) !== Array.isArray(b)) return false;
            if (Array.isArray(a)) return a.length === b.length && a.every((item, index) => deepEqual(item, b[index]));
            const keys = Object.keys(a);
            if (keys.length !== Object.keys(b).length) return false;
            return keys.every((key) => Object.prototype.hasOwnProperty.call(b, key) && deepEqual(a[key], b[key]));
        },
        tests: (assert, { deepEqual }) => {
            assert.equal(deepEqual(1, 1), true);
            assert.equal(deepEqual("a", "b"), false);
            assert.equal(deepEqual(NaN, NaN), true);
            assert.equal(deepEqual(null, undefined), false);
            assert.equal(deepEqual(null, {}), false);
            assert.equal(deepEqual({ a: 1, b: [1, { c: 2 }] }, { b: [1, { c: 2 }], a: 1 }), true);
            assert.equal(deepEqual({ a: 1 }, { a: 1, b: undefined }), false);
            assert.equal(deepEqual({ a: undefined }, { b: undefined }), false);
            assert.equal(deepEqual([1, 2], { 0: 1, 1: 2 }), false);
            assert.equal(deepEqual([1, [2, 3]], [1, [2, 4]]), false);
            assert.equal(deepEqual([], []), true);
            assert.equal(deepEqual("1", 1), false);
        },
    }),
    js({
        id: "js-parse-duration",
        tags: ["string", "parsing"],
        prompt: {
            TR: "JavaScript ile `parseDuration(text)` fonksiyonunu yaz: '1h30m', '45s', '2h', '1h 5m 10s', '90m' gibi süreleri saniyeye çevirir. Birimler h, m ve s'dir (büyük/küçük harf duyarsız); sayı ile birim ve birimler arasında boşluk olabilir; her birim en fazla bir kez ve h → m → s sırasıyla gelir. Biçim geçersizse ya da metin boşsa `null` döner.",
            EN: "Write `parseDuration(text)` in JavaScript: it turns durations such as '1h30m', '45s', '2h', '1h 5m 10s' or '90m' into seconds. The units are h, m and s (case-insensitive); spaces may appear between a number and its unit and between parts; each unit appears at most once, in the order h → m → s. For an invalid format or an empty text it returns `null`.",
        },
        solution: function parseDuration(text) {
            if (typeof text !== "string") return null;
            const match = /^\s*(?:(\d+)\s*h)?\s*(?:(\d+)\s*m)?\s*(?:(\d+)\s*s)?\s*$/i.exec(text);
            if (!match || (match[1] === undefined && match[2] === undefined && match[3] === undefined)) return null;
            return Number(match[1] ?? 0) * 3600 + Number(match[2] ?? 0) * 60 + Number(match[3] ?? 0);
        },
        tests: (assert, { parseDuration }) => {
            assert.equal(parseDuration("1h30m"), 5400);
            assert.equal(parseDuration("45s"), 45);
            assert.equal(parseDuration("2h"), 7200);
            assert.equal(parseDuration("1h 5m 10s"), 3910);
            assert.equal(parseDuration("90m"), 5400);
            assert.equal(parseDuration("1H2M3S"), 3723);
            assert.equal(parseDuration("0s"), 0);
            assert.equal(parseDuration(""), null);
            assert.equal(parseDuration("abc"), null);
            assert.equal(parseDuration("5m1h"), null);
            assert.equal(parseDuration("1h1h"), null);
            assert.equal(parseDuration("10"), null);
        },
    }),
    js({
        id: "js-to-roman",
        tags: ["number", "string"],
        prompt: {
            TR: "JavaScript ile `toRoman(n)` fonksiyonunu yaz: 1 ile 3999 arasındaki bir tam sayıyı Roma rakamına çevirir (ör. 4 → 'IV', 1994 → 'MCMXCIV'). Aralık dışı ya da tam sayı olmayan değerlerde `RangeError` fırlatır.",
            EN: "Write `toRoman(n)` in JavaScript: it converts an integer from 1 to 3999 to Roman numerals (e.g. 4 → 'IV', 1994 → 'MCMXCIV'). For values out of range or not integers it throws a `RangeError`.",
        },
        solution: function toRoman(n) {
            if (!Number.isInteger(n) || n < 1 || n > 3999) throw new RangeError("1..3999 only");
            const table = [[1000, "M"], [900, "CM"], [500, "D"], [400, "CD"], [100, "C"], [90, "XC"], [50, "L"], [40, "XL"], [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"]];
            let out = "";
            for (const [value, symbol] of table) {
                while (n >= value) {
                    out += symbol;
                    n -= value;
                }
            }
            return out;
        },
        tests: (assert, { toRoman }) => {
            const cases = { 1: "I", 4: "IV", 9: "IX", 14: "XIV", 40: "XL", 90: "XC", 400: "CD", 1994: "MCMXCIV", 2026: "MMXXVI", 3999: "MMMCMXCIX" };
            for (const [value, roman] of Object.entries(cases)) assert.equal(toRoman(Number(value)), roman);
            assert.throws(() => toRoman(0), RangeError);
            assert.throws(() => toRoman(4000), RangeError);
            assert.throws(() => toRoman(2.5), RangeError);
        },
    }),
    js({
        id: "js-group-by",
        tags: ["array", "object"],
        prompt: {
            TR: "JavaScript ile `groupBy(items, keyFn)` fonksiyonunu yaz: her öğe için `keyFn(item)` sonucunu metne çevirip anahtar olarak kullanır ve `{ anahtar: [öğeler] }` biçiminde bir nesne döndürür. Her gruptaki öğelerin sırası girdideki sırayla aynıdır.",
            EN: "Write `groupBy(items, keyFn)` in JavaScript: for each item it uses `keyFn(item)`, converted to a string, as the key and returns an object of the form `{ key: [items] }`. Items keep their input order within each group.",
        },
        solution: function groupBy(items, keyFn) {
            const out = {};
            for (const item of items) {
                const key = String(keyFn(item));
                (out[key] ??= []).push(item);
            }
            return out;
        },
        tests: (assert, { groupBy }) => {
            const plain = (value) => ({ ...value });
            assert.deepEqual(plain(groupBy([1, 2, 3, 4, 5], (n) => (n % 2 ? "odd" : "even"))), { odd: [1, 3, 5], even: [2, 4] });
            assert.deepEqual(plain(groupBy(["ab", "c", "de"], (s) => s.length)), { 2: ["ab", "de"], 1: ["c"] });
            assert.deepEqual(plain(groupBy([], (x) => x)), {});
            const people = [{ n: "Ali", c: "TR" }, { n: "Bo", c: "US" }, { n: "Can", c: "TR" }];
            assert.deepEqual(groupBy(people, (p) => p.c).TR.map((p) => p.n), ["Ali", "Can"]);
            assert.deepEqual(plain(groupBy([true, false, true], (b) => b)), { true: [true, true], false: [false] });
        },
    }),
    js({
        id: "js-memoize",
        tags: ["function", "cache"],
        prompt: {
            TR: "JavaScript ile `memoize(fn)` fonksiyonunu yaz: `fn`'in sonuçlarını önbelleğe alan yeni bir fonksiyon döndürür. Argüman listesi `JSON.stringify` ile aynı görünen sonraki çağrılarda `fn` yeniden çağrılmaz ve saklanan sonuç döner. Farklı argümanlar ayrı ayrı saklanır; `undefined` dönen sonuçlar da önbelleğe alınır.",
            EN: "Write `memoize(fn)` in JavaScript: it returns a new function that caches `fn`'s results. Later calls whose argument list looks the same under `JSON.stringify` don't call `fn` again and return the stored result. Different arguments are stored separately; results that are `undefined` are cached too.",
        },
        solution: function memoize(fn) {
            const cache = new Map();
            return function memoized(...args) {
                const key = JSON.stringify(args);
                if (cache.has(key)) return cache.get(key);
                const value = fn.apply(this, args);
                cache.set(key, value);
                return value;
            };
        },
        tests: (assert, { memoize }) => {
            let calls = 0;
            const square = memoize((n) => {
                calls += 1;
                return n * n;
            });
            assert.equal(square(4), 16);
            assert.equal(square(4), 16);
            assert.equal(calls, 1);
            assert.equal(square(5), 25);
            assert.equal(calls, 2);
            let adds = 0;
            const add = memoize((a, b) => {
                adds += 1;
                return a + b;
            });
            assert.equal(add(1, 2), 3);
            assert.equal(add(2, 1), 3);
            assert.equal(add(1, 2), 3);
            assert.equal(adds, 2);
            let voids = 0;
            const nothing = memoize(() => {
                voids += 1;
                return undefined;
            });
            nothing();
            nothing();
            assert.equal(voids, 1);
        },
    }),
    js({
        id: "js-flatten",
        tags: ["array", "recursion"],
        prompt: {
            TR: "JavaScript ile `flatten(array, depth = Infinity)` fonksiyonunu yaz: iç içe dizileri en fazla `depth` seviye düzleştirip yeni bir dizi döndürür. `depth` 0 ise dizinin sığ bir kopyası döner. Girdiyi değiştirmez.",
            EN: "Write `flatten(array, depth = Infinity)` in JavaScript: it flattens nested arrays by at most `depth` levels and returns a new array. With `depth` 0 it returns a shallow copy. It must not change the input.",
        },
        solution: function flatten(array, depth = Infinity) {
            const out = [];
            for (const item of array) {
                if (Array.isArray(item) && depth > 0) out.push(...flatten(item, depth - 1));
                else out.push(item);
            }
            return out;
        },
        tests: (assert, { flatten }) => {
            assert.deepEqual(flatten([1, [2, [3, [4]]]]), [1, 2, 3, 4]);
            assert.deepEqual(flatten([1, [2, [3, [4]]]], 1), [1, 2, [3, [4]]]);
            assert.deepEqual(flatten([1, [2, [3]]], 0), [1, [2, [3]]]);
            const source = [[1], [2]];
            const copy = flatten(source, 0);
            assert.notEqual(copy, source);
            assert.deepEqual(source, [[1], [2]]);
            assert.deepEqual(flatten([]), []);
            assert.deepEqual(flatten([[[]]]), []);
            assert.deepEqual(flatten([["a", ["b"]], "c"], 2), ["a", "b", "c"]);
        },
    }),
    js({
        id: "js-kebab-case",
        tags: ["string", "regex"],
        prompt: {
            TR: "JavaScript ile `toKebabCase(name)` fonksiyonunu yaz: camelCase ya da PascalCase bir adı kebab-case'e çevirir: 'backgroundColor' → 'background-color', 'XMLHttpRequest' → 'xml-http-request', 'userID' → 'user-id'. Rakamlar önceki parçaya yapışık kalır: 'base64Encode' → 'base64-encode'. Zaten kebab-case olan ad değişmez.",
            EN: "Write `toKebabCase(name)` in JavaScript: it turns a camelCase or PascalCase name into kebab-case: 'backgroundColor' → 'background-color', 'XMLHttpRequest' → 'xml-http-request', 'userID' → 'user-id'. Digits stay with the part before them: 'base64Encode' → 'base64-encode'. A name already in kebab-case stays the same.",
        },
        solution: function toKebabCase(name) {
            return name.replace(/([a-z0-9])([A-Z])/g, "$1-$2").replace(/([A-Z]+)([A-Z][a-z])/g, "$1-$2").toLowerCase();
        },
        tests: (assert, { toKebabCase }) => {
            assert.equal(toKebabCase("backgroundColor"), "background-color");
            assert.equal(toKebabCase("XMLHttpRequest"), "xml-http-request");
            assert.equal(toKebabCase("userID"), "user-id");
            assert.equal(toKebabCase("base64Encode"), "base64-encode");
            assert.equal(toKebabCase("getHTTPResponseCode"), "get-http-response-code");
            assert.equal(toKebabCase("Simple"), "simple");
            assert.equal(toKebabCase("already-kebab"), "already-kebab");
            assert.equal(toKebabCase("a"), "a");
            assert.equal(toKebabCase(""), "");
        },
    }),
    js({
        id: "js-balanced",
        tags: ["string", "stack"],
        prompt: {
            TR: "JavaScript ile `isBalanced(text)` fonksiyonunu yaz: metindeki (), [] ve {} ayraçlarının doğru eşleşip doğru iç içe geçip geçmediğini döndürür (true/false). Diğer karakterler yok sayılır.",
            EN: "Write `isBalanced(text)` in JavaScript: it returns whether the (), [] and {} brackets in the text match and nest correctly (true/false). Other characters are ignored.",
        },
        solution: function isBalanced(text) {
            const pairs = { ")": "(", "]": "[", "}": "{" };
            const stack = [];
            for (const ch of text) {
                if (ch === "(" || ch === "[" || ch === "{") stack.push(ch);
                else if (ch in pairs && stack.pop() !== pairs[ch]) return false;
            }
            return stack.length === 0;
        },
        tests: (assert, { isBalanced }) => {
            for (const ok of ["", "()", "([]{})", "a(b[c]{d}e)f", "{[()()]}"]) assert.equal(isBalanced(ok), true, ok);
            for (const bad of ["(", ")(", "([)]", "{[}", "(()", "]"]) assert.equal(isBalanced(bad), false, bad);
        },
    }),
    js({
        id: "js-merge-intervals",
        tags: ["array", "sorting"],
        prompt: {
            TR: "JavaScript ile `mergeIntervals(intervals)` fonksiyonunu yaz: [başlangıç, bitiş] çiftlerinden oluşan diziyi başlangıca göre sıralar ve çakışan ya da uç uca değen aralıkları birleştirir ([1,3] ve [3,5] → [1,5]). Sonuç başlangıca göre sıralıdır. Girdi değiştirilmez.",
            EN: "Write `mergeIntervals(intervals)` in JavaScript: it sorts an array of [start, end] pairs by start and merges intervals that overlap or touch ([1,3] and [3,5] → [1,5]). The result is sorted by start. The input must not change.",
        },
        solution: function mergeIntervals(intervals) {
            const sorted = intervals.map(([start, end]) => [start, end]).sort((a, b) => a[0] - b[0]);
            const out = [];
            for (const [start, end] of sorted) {
                const last = out[out.length - 1];
                if (last && start <= last[1]) last[1] = Math.max(last[1], end);
                else out.push([start, end]);
            }
            return out;
        },
        tests: (assert, { mergeIntervals }) => {
            assert.deepEqual(mergeIntervals([[1, 3], [2, 6], [8, 10], [15, 18]]), [[1, 6], [8, 10], [15, 18]]);
            assert.deepEqual(mergeIntervals([[1, 4], [4, 5]]), [[1, 5]]);
            assert.deepEqual(mergeIntervals([[5, 6], [1, 2]]), [[1, 2], [5, 6]]);
            assert.deepEqual(mergeIntervals([[1, 10], [2, 3]]), [[1, 10]]);
            assert.deepEqual(mergeIntervals([]), []);
            const input = [[3, 4], [1, 3]];
            mergeIntervals(input);
            assert.deepEqual(input, [[3, 4], [1, 3]]);
        },
    }),
    js({
        id: "js-top-k-words",
        tags: ["map", "sorting"],
        prompt: {
            TR: "JavaScript ile `topKFrequent(words, k)` fonksiyonunu yaz: en sık geçen `k` kelimeyi sıklığa göre azalan sırada döndürür; sıklıkları eşit olan kelimeler basit karşılaştırmayla (`<`) alfabetik sırada gelir. Kelimeler büyük/küçük harf duyarlı karşılaştırılır. Farklı kelime sayısı `k`'dan azsa hepsi döner.",
            EN: "Write `topKFrequent(words, k)` in JavaScript: it returns the `k` most frequent words, most frequent first; words with the same count come in alphabetical order by plain comparison (`<`). Words are compared case-sensitively. If there are fewer than `k` distinct words, all of them are returned.",
        },
        solution: function topKFrequent(words, k) {
            const counts = new Map();
            for (const word of words) counts.set(word, (counts.get(word) ?? 0) + 1);
            return [...counts.entries()]
                .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
                .slice(0, k)
                .map(([word]) => word);
        },
        tests: (assert, { topKFrequent }) => {
            assert.deepEqual(topKFrequent(["i", "love", "code", "i", "love", "coding"], 2), ["i", "love"]);
            assert.deepEqual(topKFrequent(["the", "day", "is", "sunny", "the", "the", "the", "sunny", "is", "is"], 4), ["the", "is", "sunny", "day"]);
            assert.deepEqual(topKFrequent(["b", "a", "c"], 2), ["a", "b"]);
            assert.deepEqual(topKFrequent(["A", "a", "a"], 1), ["a"]);
            assert.deepEqual(topKFrequent(["x"], 5), ["x"]);
            assert.deepEqual(topKFrequent([], 3), []);
        },
    }),
    js({
        id: "js-spiral",
        tags: ["matrix"],
        prompt: {
            TR: "JavaScript ile `spiralOrder(matrix)` fonksiyonunu yaz: dikdörtgen bir matrisin (dizilerin dizisi) elemanlarını sol üstten başlayıp saat yönünde spiral sırayla tek bir dizi olarak döndürür. Boş matris ([] ya da [[]]) için [] döner.",
            EN: "Write `spiralOrder(matrix)` in JavaScript: it returns the elements of a rectangular matrix (an array of arrays) as one array in clockwise spiral order, starting at the top left. An empty matrix ([] or [[]]) gives [].",
        },
        solution: function spiralOrder(matrix) {
            const out = [];
            if (!matrix.length || !matrix[0].length) return out;
            let top = 0;
            let bottom = matrix.length - 1;
            let left = 0;
            let right = matrix[0].length - 1;
            while (top <= bottom && left <= right) {
                for (let col = left; col <= right; col++) out.push(matrix[top][col]);
                for (let row = top + 1; row <= bottom; row++) out.push(matrix[row][right]);
                if (top < bottom) for (let col = right - 1; col >= left; col--) out.push(matrix[bottom][col]);
                if (left < right) for (let row = bottom - 1; row > top; row--) out.push(matrix[row][left]);
                top++;
                bottom--;
                left++;
                right--;
            }
            return out;
        },
        tests: (assert, { spiralOrder }) => {
            assert.deepEqual(spiralOrder([[1, 2, 3], [4, 5, 6], [7, 8, 9]]), [1, 2, 3, 6, 9, 8, 7, 4, 5]);
            assert.deepEqual(spiralOrder([[1, 2, 3, 4], [5, 6, 7, 8], [9, 10, 11, 12]]), [1, 2, 3, 4, 8, 12, 11, 10, 9, 5, 6, 7]);
            assert.deepEqual(spiralOrder([[1]]), [1]);
            assert.deepEqual(spiralOrder([[1], [2], [3]]), [1, 2, 3]);
            assert.deepEqual(spiralOrder([[1, 2, 3]]), [1, 2, 3]);
            assert.deepEqual(spiralOrder([]), []);
            assert.deepEqual(spiralOrder([[]]), []);
        },
    }),
    js({
        id: "js-lru",
        tags: ["cache", "map", "design"],
        prompt: {
            TR: "JavaScript ile `createLRU(capacity)` fonksiyonunu yaz: `get(key)` ve `put(key, value)` metotları ile `size` özelliği (ya da getter'ı) olan bir LRU önbellek nesnesi döndürür. `get` anahtar yoksa `undefined` döner; varsa değeri döndürür ve anahtarı en son kullanılan yapar. `put` var olan anahtarı günceller ve en son kullanılan yapar; eleman sayısı `capacity`'yi aşarsa en uzun süredir kullanılmayan anahtarı siler. `size` eleman sayısını verir.",
            EN: "Write `createLRU(capacity)` in JavaScript: it returns an LRU cache object with `get(key)` and `put(key, value)` methods and a `size` property (or getter). `get` returns `undefined` for a missing key; otherwise it returns the value and marks the key as most recently used. `put` updates an existing key and marks it most recently used; when the number of entries exceeds `capacity` it removes the least recently used key. `size` gives the number of entries.",
        },
        solution: function createLRU(capacity) {
            const map = new Map();
            return {
                get(key) {
                    if (!map.has(key)) return undefined;
                    const value = map.get(key);
                    map.delete(key);
                    map.set(key, value);
                    return value;
                },
                put(key, value) {
                    if (map.has(key)) map.delete(key);
                    map.set(key, value);
                    if (map.size > capacity) map.delete(map.keys().next().value);
                },
                get size() {
                    return map.size;
                },
            };
        },
        tests: (assert, { createLRU }) => {
            const cache = createLRU(2);
            cache.put("a", 1);
            cache.put("b", 2);
            assert.equal(cache.get("a"), 1);
            cache.put("c", 3);
            assert.equal(cache.get("b"), undefined, "b was the least recently used");
            assert.equal(cache.get("c"), 3);
            cache.put("a", 10);
            cache.put("d", 4);
            assert.equal(cache.get("c"), undefined, "updating a made it recent");
            assert.equal(cache.get("a"), 10);
            assert.equal(cache.get("d"), 4);
            assert.equal(cache.size, 2);
            const one = createLRU(1);
            one.put(1, "x");
            one.put(2, "y");
            assert.equal(one.get(1), undefined);
            assert.equal(one.get(2), "y");
        },
    }),
    js({
        id: "js-csv-line",
        tags: ["string", "parsing"],
        prompt: {
            TR: "JavaScript ile `parseCSVLine(line)` fonksiyonunu yaz: tek bir CSV satırını alanlarına böler ve metin dizisi döndürür. Ayırıcı virgüldür. Çift tırnakla başlayan bir alan virgül içerebilir ve içindeki `\"\"` tek bir `\"` olur; dış tırnaklar sonuca girmez. Tırnaksız alanlar boşluklar dahil olduğu gibi alınır; boş alanlar '' olur (boş satır [''] verir).",
            EN: "Write `parseCSVLine(line)` in JavaScript: it splits one CSV line into its fields and returns an array of strings. The separator is a comma. A field that starts with a double quote may contain commas, and `\"\"` inside it becomes a single `\"`; the outer quotes are not part of the result. Unquoted fields are taken as they are, spaces included; empty fields become '' (an empty line gives ['']).",
        },
        solution: function parseCSVLine(line) {
            const fields = [];
            let field = "";
            let quoted = false;
            for (let index = 0; index < line.length; index++) {
                const ch = line[index];
                if (quoted) {
                    if (ch === '"') {
                        if (line[index + 1] === '"') {
                            field += '"';
                            index++;
                        } else {
                            quoted = false;
                        }
                    } else {
                        field += ch;
                    }
                } else if (ch === '"') {
                    quoted = true;
                } else if (ch === ",") {
                    fields.push(field);
                    field = "";
                } else {
                    field += ch;
                }
            }
            fields.push(field);
            return fields;
        },
        tests: (assert, { parseCSVLine }) => {
            assert.deepEqual(parseCSVLine("a,b,c"), ["a", "b", "c"]);
            assert.deepEqual(parseCSVLine('"a,b",c'), ["a,b", "c"]);
            assert.deepEqual(parseCSVLine('"say ""hi""",x'), ['say "hi"', "x"]);
            assert.deepEqual(parseCSVLine("a,,c"), ["a", "", "c"]);
            assert.deepEqual(parseCSVLine(""), [""]);
            assert.deepEqual(parseCSVLine(" a , b "), [" a ", " b "]);
            assert.deepEqual(parseCSVLine('x,""'), ["x", ""]);
            assert.deepEqual(parseCSVLine('1,"2,3",4'), ["1", "2,3", "4"]);
        },
    }),
    js({
        id: "js-word-wrap",
        tags: ["string"],
        prompt: {
            TR: "JavaScript ile `wordWrap(text, width)` fonksiyonunu yaz: metni boşluklarla ayrılmış kelimelere böler ve kelimeleri açgözlü biçimde satırlara yerleştirir: her satır en fazla `width` karakterdir ve kelimeler tek boşlukla birleşir. `width`'ten uzun bir kelime kendi satırında bölünmeden durur. Satırların dizisini döndürür; kelime yoksa [] döner.",
            EN: "Write `wordWrap(text, width)` in JavaScript: it splits the text into whitespace-separated words and fills lines greedily: each line is at most `width` characters, with words joined by a single space. A word longer than `width` stays unbroken on its own line. It returns the array of lines; with no words it returns [].",
        },
        solution: function wordWrap(text, width) {
            const lines = [];
            let line = "";
            for (const word of text.split(/\s+/).filter(Boolean)) {
                if (!line) line = word;
                else if (line.length + 1 + word.length <= width) line += ` ${word}`;
                else {
                    lines.push(line);
                    line = word;
                }
            }
            if (line) lines.push(line);
            return lines;
        },
        tests: (assert, { wordWrap }) => {
            assert.deepEqual(wordWrap("the quick brown fox jumps over the lazy dog", 10), ["the quick", "brown fox", "jumps over", "the lazy", "dog"]);
            assert.deepEqual(wordWrap("a b c", 1), ["a", "b", "c"]);
            assert.deepEqual(wordWrap("supercalifragilistic is long", 5), ["supercalifragilistic", "is", "long"]);
            assert.deepEqual(wordWrap("hello   world", 11), ["hello world"]);
            assert.deepEqual(wordWrap("   ", 5), []);
            assert.deepEqual(wordWrap("", 3), []);
        },
    }),
    js({
        id: "js-first-index",
        tags: ["binary-search"],
        prompt: {
            TR: "JavaScript ile `firstIndexOf(sorted, target)` fonksiyonunu yaz: artan sıralı bir sayı dizisinde `target`'ın ilk geçtiği indeksi ikili aramayla (O(log n)) bulur; yoksa -1 döner.",
            EN: "Write `firstIndexOf(sorted, target)` in JavaScript: in an ascending sorted array of numbers it finds the index of the first occurrence of `target` with binary search (O(log n)); if it's absent it returns -1.",
        },
        solution: function firstIndexOf(sorted, target) {
            let low = 0;
            let high = sorted.length - 1;
            let found = -1;
            while (low <= high) {
                const mid = (low + high) >> 1;
                if (sorted[mid] < target) low = mid + 1;
                else {
                    if (sorted[mid] === target) found = mid;
                    high = mid - 1;
                }
            }
            return found;
        },
        tests: (assert, { firstIndexOf }) => {
            assert.equal(firstIndexOf([1, 2, 2, 2, 3], 2), 1);
            assert.equal(firstIndexOf([1, 2, 3], 4), -1);
            assert.equal(firstIndexOf([], 1), -1);
            assert.equal(firstIndexOf([5, 5, 5], 5), 0);
            assert.equal(firstIndexOf([1, 3, 5, 7], 7), 3);
            assert.equal(firstIndexOf([1, 3, 5, 7], 0), -1);
            const big = Array.from({ length: 1_000_000 }, (_, index) => Math.floor(index / 3));
            assert.equal(firstIndexOf(big, 300_000), 900_000);
        },
    }),
    js({
        id: "js-format-bytes",
        tags: ["number", "string"],
        prompt: {
            TR: "JavaScript ile `formatBytes(bytes)` fonksiyonunu yaz: bayt sayısını 1024 tabanlı birimlerle (B, KB, MB, GB, TB) okunur metne çevirir. 1024'ten küçük değerler 'N B' olur (ör. '512 B'). Diğerlerinde değer 1024'ten küçük kalana kadar büyük birime geçilir (en büyük birim TB), değer bir ondalık basamağa yuvarlanır ve '.0' ile bitiyorsa ondalık atılır: 1536 → '1.5 KB', 1048576 → '1 MB'. Negatif ya da sayı olmayan değerde `RangeError` fırlatır.",
            EN: "Write `formatBytes(bytes)` in JavaScript: it turns a number of bytes into readable text with base-1024 units (B, KB, MB, GB, TB). Values below 1024 become 'N B' (e.g. '512 B'). Otherwise it moves to bigger units while the value is at least 1024 (TB is the largest), rounds to one decimal and drops the decimal when it ends in '.0': 1536 → '1.5 KB', 1048576 → '1 MB'. For a negative value or a non-number it throws a `RangeError`.",
        },
        solution: function formatBytes(bytes) {
            if (typeof bytes !== "number" || !Number.isFinite(bytes) || bytes < 0) throw new RangeError("bytes must be a non-negative number");
            if (bytes < 1024) return `${bytes} B`;
            const units = ["KB", "MB", "GB", "TB"];
            let value = bytes / 1024;
            let index = 0;
            while (value >= 1024 && index < units.length - 1) {
                value /= 1024;
                index += 1;
            }
            const rounded = Math.round(value * 10) / 10;
            return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(1)} ${units[index]}`;
        },
        tests: (assert, { formatBytes }) => {
            assert.equal(formatBytes(0), "0 B");
            assert.equal(formatBytes(512), "512 B");
            assert.equal(formatBytes(1023), "1023 B");
            assert.equal(formatBytes(1024), "1 KB");
            assert.equal(formatBytes(1536), "1.5 KB");
            assert.equal(formatBytes(1048576), "1 MB");
            assert.equal(formatBytes(5.2 * 1024 ** 3), "5.2 GB");
            assert.equal(formatBytes(2 * 1024 ** 4), "2 TB");
            assert.equal(formatBytes(3 * 1024 ** 5), "3072 TB");
            assert.throws(() => formatBytes(-1), RangeError);
            assert.throws(() => formatBytes("12"), RangeError);
        },
    }),
    js({
        id: "js-compare-versions",
        tags: ["string", "parsing"],
        prompt: {
            TR: "JavaScript ile `compareVersions(a, b)` fonksiyonunu yaz: 'MAJOR.MINOR.PATCH' biçimindeki iki sürümü karşılaştırır; a büyükse 1, küçükse -1, eşitse 0 döner. Parçalar sayı olarak karşılaştırılır ('1.10.0' > '1.9.9'); eksik parçalar 0 sayılır ('1.2' = '1.2.0'). İlk '-' işaretinden sonraki ön sürüm etiketi ('1.0.0-beta') aynı sürümün etiketsiz hâlinden küçüktür; iki etiket basit metin karşılaştırmasıyla (`<`) sıralanır.",
            EN: "Write `compareVersions(a, b)` in JavaScript: it compares two versions in 'MAJOR.MINOR.PATCH' form and returns 1 if a is greater, -1 if smaller and 0 if equal. Parts compare as numbers ('1.10.0' > '1.9.9'); missing parts count as 0 ('1.2' = '1.2.0'). A pre-release tag after the first '-' ('1.0.0-beta') is lower than the same version without a tag; two tags are ordered by plain string comparison (`<`).",
        },
        solution: function compareVersions(a, b) {
            const parse = (version) => {
                const dash = version.indexOf("-");
                return { parts: (dash === -1 ? version : version.slice(0, dash)).split(".").map(Number), pre: dash === -1 ? null : version.slice(dash + 1) };
            };
            const x = parse(a);
            const y = parse(b);
            for (let index = 0; index < Math.max(x.parts.length, y.parts.length); index++) {
                const difference = (x.parts[index] ?? 0) - (y.parts[index] ?? 0);
                if (difference) return difference > 0 ? 1 : -1;
            }
            if (x.pre === y.pre) return 0;
            if (x.pre === null) return 1;
            if (y.pre === null) return -1;
            return x.pre < y.pre ? -1 : 1;
        },
        tests: (assert, { compareVersions }) => {
            assert.equal(compareVersions("1.10.0", "1.9.9"), 1);
            assert.equal(compareVersions("1.0.0", "1.0.0"), 0);
            assert.equal(compareVersions("1.2", "1.2.0"), 0);
            assert.equal(compareVersions("2.0.0", "10.0.0"), -1);
            assert.equal(compareVersions("1.0.0-beta", "1.0.0"), -1);
            assert.equal(compareVersions("1.0.0", "1.0.0-rc"), 1);
            assert.equal(compareVersions("1.0.0-alpha", "1.0.0-beta"), -1);
            assert.equal(compareVersions("0.0.1", "0.0.0"), 1);
            assert.equal(compareVersions("1.0.0-rc.1", "1.0.0-rc.1"), 0);
        },
    }),
    js({
        id: "js-eval-rpn",
        tags: ["stack", "parsing"],
        prompt: {
            TR: "JavaScript ile `evalRPN(tokens)` fonksiyonunu yaz: ters Lehçe gösterimdeki (postfix) ifadeyi hesaplar. `tokens` metin dizisidir; işleçler + - * / ve tam sayılardır (negatif olabilir, ör. '-3'). Bölme sıfıra doğru keser (7 / -2 = -3). Geçersiz ifadede (eksik ya da fazla sayı, bilinmeyen jeton, boş girdi) `Error` fırlatır.",
            EN: "Write `evalRPN(tokens)` in JavaScript: it evaluates an expression in reverse Polish (postfix) notation. `tokens` is an array of strings; the operators are + - * / and the operands are integers (possibly negative, e.g. '-3'). Division truncates toward zero (7 / -2 = -3). For an invalid expression (too few or too many numbers, an unknown token, empty input) it throws an `Error`.",
        },
        solution: function evalRPN(tokens) {
            const stack = [];
            for (const token of tokens) {
                if (/^-?\d+$/.test(token)) {
                    stack.push(Number(token));
                    continue;
                }
                if (!["+", "-", "*", "/"].includes(token) || stack.length < 2) throw new Error(`invalid token ${token}`);
                const b = stack.pop();
                const a = stack.pop();
                stack.push(token === "+" ? a + b : token === "-" ? a - b : token === "*" ? a * b : Math.trunc(a / b));
            }
            if (stack.length !== 1) throw new Error("invalid expression");
            return stack[0];
        },
        tests: (assert, { evalRPN }) => {
            assert.equal(evalRPN(["2", "1", "+", "3", "*"]), 9);
            assert.equal(evalRPN(["4", "13", "5", "/", "+"]), 6);
            assert.equal(evalRPN(["10", "6", "9", "3", "+", "-11", "*", "/", "*", "17", "+", "5", "+"]), 22);
            assert.equal(evalRPN(["7", "-2", "/"]), -3);
            assert.equal(evalRPN(["5"]), 5);
            assert.throws(() => evalRPN(["1", "+"]), Error);
            assert.throws(() => evalRPN(["1", "2"]), Error);
            assert.throws(() => evalRPN(["1", "2", "^"]), Error);
            assert.throws(() => evalRPN([]), Error);
        },
    }),
    js({
        id: "js-common-prefix",
        tags: ["string"],
        prompt: {
            TR: "JavaScript ile `longestCommonPrefix(strings)` fonksiyonunu yaz: metin dizisindeki tüm metinlerin en uzun ortak önekini döndürür; dizi boşsa '' döner.",
            EN: "Write `longestCommonPrefix(strings)` in JavaScript: it returns the longest prefix shared by all strings in the array; for an empty array it returns ''.",
        },
        solution: function longestCommonPrefix(strings) {
            if (!strings.length) return "";
            let prefix = strings[0];
            for (const text of strings.slice(1)) {
                while (!text.startsWith(prefix)) prefix = prefix.slice(0, -1);
            }
            return prefix;
        },
        tests: (assert, { longestCommonPrefix }) => {
            assert.equal(longestCommonPrefix(["flower", "flow", "flight"]), "fl");
            assert.equal(longestCommonPrefix(["dog", "racecar", "car"]), "");
            assert.equal(longestCommonPrefix(["a"]), "a");
            assert.equal(longestCommonPrefix([]), "");
            assert.equal(longestCommonPrefix(["", "a"]), "");
            assert.equal(longestCommonPrefix(["interspecies", "interstellar", "interstate"]), "inters");
            assert.equal(longestCommonPrefix(["same", "same"]), "same");
        },
    }),

    // ------------------------------------------------------------------ Python
    py({
        id: "py-rle",
        tags: ["string"],
        entries: ["rle_encode", "rle_decode"],
        prompt: {
            TR: "Python ile iki fonksiyon yaz. `rle_encode(text: str) -> str` ardışık aynı karakterleri 'sayı + karakter' olarak kodlar: 'aaabcc' → '3a1b2c'; boş metin '' verir. `rle_decode(code: str) -> str` bunu geri çevirir; sayılar birden çok basamaklı olabilir ('12a' → on iki tane a). Kodlanan metin rakam içermez.",
            EN: "Write two Python functions. `rle_encode(text: str) -> str` encodes runs of the same character as 'count + character': 'aaabcc' → '3a1b2c'; an empty text gives ''. `rle_decode(code: str) -> str` reverses it; counts may have several digits ('12a' → twelve a's). The encoded text contains no digits.",
        },
        solution: String.raw`def rle_encode(text):
    out = []
    i = 0
    while i < len(text):
        j = i
        while j < len(text) and text[j] == text[i]:
            j += 1
        out.append(f"{j - i}{text[i]}")
        i = j
    return "".join(out)


def rle_decode(code):
    out = []
    count = ""
    for ch in code:
        if ch.isdigit():
            count += ch
        else:
            out.append(ch * int(count))
            count = ""
    return "".join(out)
`,
        tests: String.raw`assert rle_encode("aaabcc") == "3a1b2c"
assert rle_encode("") == ""
assert rle_encode("abc") == "1a1b1c"
assert rle_encode("z" * 12) == "12z"
assert rle_decode("3a1b2c") == "aaabcc"
assert rle_decode("12a") == "a" * 12
assert rle_decode("") == ""
for sample in ["hellooo wörld", "  x  ", "ççşş"]:
    assert rle_decode(rle_encode(sample)) == sample, sample
`,
    }),
    py({
        id: "py-ipv4",
        tags: ["string", "validation"],
        prompt: {
            TR: "Python ile `is_valid_ipv4(address: str) -> bool` fonksiyonunu yaz: noktalı onluk IPv4 adresini katı biçimde doğrular: tam 4 parça; her parça yalnızca ASCII rakamlarından (0–9) oluşur, 0–255 arasındadır ve başında gereksiz sıfır yoktur ('01' geçersiz, '0' geçerli); boşluk ya da işaret yoktur.",
            EN: "Write `is_valid_ipv4(address: str) -> bool` in Python: it strictly validates a dotted-decimal IPv4 address: exactly 4 parts; each part consists only of ASCII digits (0–9), is between 0 and 255 and has no leading zero ('01' is invalid, '0' is valid); no spaces or signs.",
        },
        solution: String.raw`def is_valid_ipv4(address):
    parts = address.split(".")
    if len(parts) != 4:
        return False
    for part in parts:
        if not part or not part.isascii() or not part.isdigit():
            return False
        if len(part) > 1 and part[0] == "0":
            return False
        if int(part) > 255:
            return False
    return True
`,
        tests: String.raw`for ok in ["192.168.1.1", "0.0.0.0", "255.255.255.255", "10.0.0.255"]:
    assert is_valid_ipv4(ok) is True, ok
for bad in ["256.1.1.1", "1.2.3", "1.2.3.4.5", "01.2.3.4", "1.2.3.-4", "1.2.3.a", " 1.2.3.4", "1..2.3", "1.2.3.٤", "", "1.2.3.+4"]:
    assert is_valid_ipv4(bad) is False, bad
`,
    }),
    py({
        id: "py-merge-sorted",
        tags: ["list", "two-pointers"],
        prompt: {
            TR: "Python ile `merge_sorted(a: list, b: list) -> list` fonksiyonunu yaz: artan sıralı iki listeyi tek bir artan sıralı listede birleştirir; doğrusal zamanda çalışmalı (O(len(a) + len(b))). Girdiler değiştirilmez.",
            EN: "Write `merge_sorted(a: list, b: list) -> list` in Python: it merges two ascending sorted lists into one ascending sorted list in linear time (O(len(a) + len(b))). The inputs must not change.",
        },
        solution: String.raw`def merge_sorted(a, b):
    out = []
    i = j = 0
    while i < len(a) and j < len(b):
        if b[j] < a[i]:
            out.append(b[j])
            j += 1
        else:
            out.append(a[i])
            i += 1
    out.extend(a[i:])
    out.extend(b[j:])
    return out
`,
        tests: String.raw`assert merge_sorted([1, 3, 5], [2, 4, 6]) == [1, 2, 3, 4, 5, 6]
assert merge_sorted([], [1]) == [1]
assert merge_sorted([], []) == []
assert merge_sorted([1, 1, 2], [1, 3]) == [1, 1, 1, 2, 3]
assert merge_sorted([-5, 0], [-10, 10]) == [-10, -5, 0, 10]
a, b = [1, 4], [2, 3]
merge_sorted(a, b)
assert a == [1, 4] and b == [2, 3]
assert merge_sorted(list(range(0, 200000, 2)), list(range(1, 200000, 2))) == list(range(200000))
`,
    }),
    py({
        id: "py-word-frequencies",
        tags: ["string", "dict", "sorting"],
        prompt: {
            TR: "Python ile `word_frequencies(text: str) -> list[tuple[str, int]]` fonksiyonunu yaz: metni küçük harfe çevirir, kelimeleri sayar ve (kelime, sayı) çiftlerini sayıya göre azalan, sayılar eşitse kelimeye göre artan sırada döndürür. Kelime yalnızca harflerden oluşan bir dizidir (Türkçe dahil tüm Unicode harfler); rakamlar, alt çizgi ve noktalama ayırıcıdır.",
            EN: "Write `word_frequencies(text: str) -> list[tuple[str, int]]` in Python: it lowercases the text, counts the words and returns (word, count) pairs ordered by count descending, then by word ascending for equal counts. A word is a run of letters only (any Unicode letters, Turkish included); digits, underscores and punctuation separate words.",
        },
        solution: String.raw`import re


def word_frequencies(text):
    counts = {}
    for word in re.findall(r"[^\W\d_]+", text.lower()):
        counts[word] = counts.get(word, 0) + 1
    return sorted(counts.items(), key=lambda item: (-item[1], item[0]))
`,
        tests: String.raw`assert word_frequencies("Bir iki, bir ÜÇ! üç üç.") == [("üç", 3), ("bir", 2), ("iki", 1)]
assert word_frequencies("") == []
assert word_frequencies("a1b 2c") == [("a", 1), ("b", 1), ("c", 1)]
assert word_frequencies("şeker, şeker; kek") == [("şeker", 2), ("kek", 1)]
assert word_frequencies("snake_case words") == [("case", 1), ("snake", 1), ("words", 1)]
`,
    }),
    py({
        id: "py-matrix-multiply",
        tags: ["matrix", "validation"],
        prompt: {
            TR: "Python ile `matrix_multiply(a, b)` fonksiyonunu yaz: liste listesi olarak verilen iki matrisi çarpar ve sonucu liste listesi olarak döndürür. Boyutlar uyumsuzsa (a'nın sütun sayısı b'nin satır sayısına eşit değilse) ya da bir matrisin satırları farklı uzunluktaysa `ValueError` fırlatır.",
            EN: "Write `matrix_multiply(a, b)` in Python: it multiplies two matrices given as lists of lists and returns the result as a list of lists. If the sizes don't fit (a's column count isn't b's row count) or a matrix has rows of different lengths, it raises `ValueError`.",
        },
        solution: String.raw`def matrix_multiply(a, b):
    if not a or not b:
        raise ValueError("empty matrix")
    if any(len(row) != len(a[0]) for row in a) or any(len(row) != len(b[0]) for row in b):
        raise ValueError("ragged matrix")
    if len(a[0]) != len(b):
        raise ValueError("size mismatch")
    return [[sum(a[i][k] * b[k][j] for k in range(len(b))) for j in range(len(b[0]))] for i in range(len(a))]
`,
        tests: String.raw`assert matrix_multiply([[1, 2], [3, 4]], [[5, 6], [7, 8]]) == [[19, 22], [43, 50]]
assert matrix_multiply([[1, 2, 3]], [[1], [2], [3]]) == [[14]]
assert matrix_multiply([[2]], [[3]]) == [[6]]
assert matrix_multiply([[1], [2]], [[3, 4]]) == [[3, 4], [6, 8]]
_raises(ValueError, matrix_multiply, [[1, 2]], [[1, 2]])
_raises(ValueError, matrix_multiply, [[1, 2], [3]], [[1], [2]])
`,
    }),
    py({
        id: "py-flatten-dict",
        tags: ["dict", "recursion"],
        prompt: {
            TR: "Python ile `flatten_dict(data: dict, sep: str = '.') -> dict` fonksiyonunu yaz: iç içe sözlükleri tek seviyeye indirir: {'a': {'b': 1}, 'c': 2} → {'a.b': 1, 'c': 2}. Anahtarlar `sep` ile birleştirilir. Boş iç sözlükler sonuçta görünmez; listeler ve diğer değerler (içlerinde sözlük olsa bile) olduğu gibi kalır.",
            EN: "Write `flatten_dict(data: dict, sep: str = '.') -> dict` in Python: it flattens nested dictionaries to one level: {'a': {'b': 1}, 'c': 2} → {'a.b': 1, 'c': 2}. Keys are joined with `sep`. Empty inner dictionaries don't appear in the result; lists and other values (even ones containing dictionaries) stay as they are.",
        },
        solution: String.raw`def flatten_dict(data, sep="."):
    out = {}

    def walk(value, prefix):
        for key, item in value.items():
            name = f"{prefix}{sep}{key}" if prefix else str(key)
            if isinstance(item, dict):
                walk(item, name)
            else:
                out[name] = item

    walk(data, "")
    return out
`,
        tests: String.raw`assert flatten_dict({"a": {"b": 1}, "c": 2}) == {"a.b": 1, "c": 2}
assert flatten_dict({"a": {"b": {"c": {"d": 4}}}}) == {"a.b.c.d": 4}
assert flatten_dict({"a": {"b": 1}}, sep="/") == {"a/b": 1}
assert flatten_dict({"a": {}, "b": 1}) == {"b": 1}
assert flatten_dict({"a": [1, {"b": 2}]}) == {"a": [1, {"b": 2}]}
assert flatten_dict({}) == {}
`,
    }),
    py({
        id: "py-next-permutation",
        tags: ["list", "algorithm"],
        prompt: {
            TR: "Python ile `next_permutation(nums: list[int]) -> list[int]` fonksiyonunu yaz: listenin sözlük sırasına göre bir sonraki permütasyonunu yeni bir liste olarak döndürür; liste son permütasyonsa (azalan sıradaysa) en küçüğünü (artan sırayı) döndürür. Tekrar eden elemanlar olabilir; girdi değiştirilmez.",
            EN: "Write `next_permutation(nums: list[int]) -> list[int]` in Python: it returns the lexicographically next permutation of the list as a new list; if the list is the last permutation (descending), it returns the first one (ascending). Elements may repeat; the input must not change.",
        },
        solution: String.raw`def next_permutation(nums):
    out = list(nums)
    i = len(out) - 2
    while i >= 0 and out[i] >= out[i + 1]:
        i -= 1
    if i >= 0:
        j = len(out) - 1
        while out[j] <= out[i]:
            j -= 1
        out[i], out[j] = out[j], out[i]
    out[i + 1:] = reversed(out[i + 1:])
    return out
`,
        tests: String.raw`assert next_permutation([1, 2, 3]) == [1, 3, 2]
assert next_permutation([3, 2, 1]) == [1, 2, 3]
assert next_permutation([1, 1, 5]) == [1, 5, 1]
assert next_permutation([1, 5, 1]) == [5, 1, 1]
assert next_permutation([1, 3, 2]) == [2, 1, 3]
assert next_permutation([2, 3, 1]) == [3, 1, 2]
assert next_permutation([1]) == [1]
assert next_permutation([]) == []
source = [1, 2, 3]
next_permutation(source)
assert source == [1, 2, 3]
`,
    }),
    py({
        id: "py-caesar",
        tags: ["string"],
        prompt: {
            TR: "Python ile `caesar(text: str, shift: int) -> str` fonksiyonunu yaz: İngiliz alfabesindeki harfleri (a–z, A–Z) `shift` kadar kaydırır ve büyük/küçük harfi korur; diğer karakterler (Türkçe harfler, rakamlar, boşluk, noktalama) değişmez. `shift` negatif ya da 26'dan büyük olabilir.",
            EN: "Write `caesar(text: str, shift: int) -> str` in Python: it shifts the letters of the English alphabet (a–z, A–Z) by `shift`, keeping their case; other characters (Turkish letters, digits, spaces, punctuation) stay the same. `shift` may be negative or greater than 26.",
        },
        solution: String.raw`def caesar(text, shift):
    out = []
    for ch in text:
        if "a" <= ch <= "z":
            out.append(chr((ord(ch) - 97 + shift) % 26 + 97))
        elif "A" <= ch <= "Z":
            out.append(chr((ord(ch) - 65 + shift) % 26 + 65))
        else:
            out.append(ch)
    return "".join(out)
`,
        tests: String.raw`assert caesar("abc", 1) == "bcd"
assert caesar("xyz", 3) == "abc"
assert caesar("Hello, World!", 13) == "Uryyb, Jbeyq!"
assert caesar("abc", -1) == "zab"
assert caesar("abc", 27) == "bcd"
assert caesar("çay 42", 1) == "çbz 42"
assert caesar("", 5) == ""
assert caesar(caesar("Gizli Mesaj", 7), -7) == "Gizli Mesaj"
`,
    }),
    py({
        id: "py-days-between",
        tags: ["date", "validation"],
        prompt: {
            TR: "Python ile `days_between(first: str, second: str) -> int` fonksiyonunu yaz: 'YYYY-AA-GG' biçimindeki iki tarih arasındaki gün farkını mutlak değer olarak döndürür; artık yılları doğru hesaplar. Tarih geçersizse (ör. 2023-02-29) ya da biçim farklıysa (ör. '2024/01/01') `ValueError` fırlatır.",
            EN: "Write `days_between(first: str, second: str) -> int` in Python: it returns the absolute number of days between two dates in 'YYYY-MM-DD' form, handling leap years correctly. For an invalid date (e.g. 2023-02-29) or another format (e.g. '2024/01/01') it raises `ValueError`.",
        },
        solution: String.raw`import datetime
import re


def days_between(first, second):
    dates = []
    for text in (first, second):
        if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", text):
            raise ValueError(f"bad date: {text}")
        dates.append(datetime.date.fromisoformat(text))
    return abs((dates[1] - dates[0]).days)
`,
        tests: String.raw`assert days_between("2024-02-28", "2024-03-01") == 2
assert days_between("2023-02-28", "2023-03-01") == 1
assert days_between("2024-01-01", "2023-01-01") == 365
assert days_between("2026-10-03", "2026-10-03") == 0
assert days_between("2000-01-01", "2026-10-03") == 9772
_raises(ValueError, days_between, "2023-02-29", "2023-03-01")
_raises(ValueError, days_between, "2024-13-01", "2024-01-01")
_raises(ValueError, days_between, "2024/01/01", "2024-01-02")
`,
    }),
    py({
        id: "py-parse-query",
        tags: ["string", "parsing", "web"],
        prompt: {
            TR: "Python ile `parse_query(query: str) -> dict[str, list[str]]` fonksiyonunu yaz: URL sorgu metnini ('?' olmadan) çözümler: 'a=1&b=2&a=3' → {'a': ['1', '3'], 'b': ['2']}. Anahtar ve değerlerde yüzde kodlamasını çözer ve '+' işaretini boşluğa çevirir. '=' içermeyen parça boş değer alır ('flag' → {'flag': ['']}); değer kısmında '=' olabilir ('k=v=w' → {'k': ['v=w']}); boş parçalar atlanır.",
            EN: "Write `parse_query(query: str) -> dict[str, list[str]]` in Python: it parses a URL query string (without '?'): 'a=1&b=2&a=3' → {'a': ['1', '3'], 'b': ['2']}. It decodes percent-encoding in keys and values and turns '+' into a space. A part without '=' gets an empty value ('flag' → {'flag': ['']}); a value may contain '=' ('k=v=w' → {'k': ['v=w']}); empty parts are skipped.",
        },
        solution: String.raw`from urllib.parse import unquote_plus


def parse_query(query):
    result = {}
    for part in query.split("&"):
        if not part:
            continue
        key, _, value = part.partition("=")
        result.setdefault(unquote_plus(key), []).append(unquote_plus(value))
    return result
`,
        tests: String.raw`assert parse_query("a=1&b=2&a=3") == {"a": ["1", "3"], "b": ["2"]}
assert parse_query("") == {}
assert parse_query("q=hello+world&x=%C3%A7ay") == {"q": ["hello world"], "x": ["çay"]}
assert parse_query("flag&a=1") == {"flag": [""], "a": ["1"]}
assert parse_query("a=1&&b=2&") == {"a": ["1"], "b": ["2"]}
assert parse_query("eq=a%3Db") == {"eq": ["a=b"]}
assert parse_query("k=v=w") == {"k": ["v=w"]}
assert parse_query("bo%C5%9F=") == {"boş": [""]}
`,
    }),
    py({
        id: "py-knapsack",
        tags: ["dynamic-programming"],
        prompt: {
            TR: "Python ile `knapsack(weights: list[int], values: list[int], capacity: int) -> int` fonksiyonunu yaz (0/1 sırt çantası): toplam ağırlığı `capacity`'yi aşmayan bir eşya seçimiyle elde edilebilecek en büyük toplam değeri döndürür. Her eşya en fazla bir kez seçilir. 200 eşya ve 2.500 kapasitede de hızlı çalışmalı (açgözlü seçim doğru sonucu vermez).",
            EN: "Write `knapsack(weights: list[int], values: list[int], capacity: int) -> int` in Python (0/1 knapsack): it returns the largest total value reachable with a choice of items whose total weight doesn't exceed `capacity`. Each item can be chosen at most once. It must also be fast for 200 items and a capacity of 2,500 (a greedy choice doesn't give the right answer).",
        },
        solution: String.raw`def knapsack(weights, values, capacity):
    best = [0] * (capacity + 1)
    for weight, value in zip(weights, values):
        for room in range(capacity, weight - 1, -1):
            candidate = best[room - weight] + value
            if candidate > best[room]:
                best[room] = candidate
    return best[capacity]
`,
        tests: String.raw`assert knapsack([1, 3, 4, 5], [1, 4, 5, 7], 7) == 9
assert knapsack([10, 20, 30], [60, 100, 120], 50) == 220
assert knapsack([], [], 10) == 0
assert knapsack([5], [10], 4) == 0
assert knapsack([2, 2, 2], [3, 3, 3], 5) == 6
seed = 7
weights, values = [], []
for _ in range(200):
    seed = (seed * 1103515245 + 12345) % 2147483648
    weights.append(seed % 97 + 3)
    seed = (seed * 1103515245 + 12345) % 2147483648
    values.append(seed % 500 + 1)
assert knapsack(weights, values, 2500) == 27790
`,
    }),
    py({
        id: "py-edit-distance",
        tags: ["dynamic-programming", "string"],
        prompt: {
            TR: "Python ile `edit_distance(a: str, b: str) -> int` fonksiyonunu yaz: iki metin arasındaki Levenshtein uzaklığını (karakter ekleme, silme ve değiştirme; her biri 1) döndürür. 1.000 karakterlik metinlerde de hızlı çalışmalı.",
            EN: "Write `edit_distance(a: str, b: str) -> int` in Python: it returns the Levenshtein distance between two strings (inserting, deleting or replacing a character costs 1 each). It must also be fast for 1,000-character strings.",
        },
        solution: String.raw`def edit_distance(a, b):
    previous = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        current = [i]
        for j, cb in enumerate(b, 1):
            current.append(min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + (ca != cb)))
        previous = current
    return previous[-1]
`,
        tests: String.raw`assert edit_distance("kitten", "sitting") == 3
assert edit_distance("", "abc") == 3
assert edit_distance("abc", "") == 3
assert edit_distance("abc", "abc") == 0
assert edit_distance("flaw", "lawn") == 2
assert edit_distance("intention", "execution") == 5
assert edit_distance("a" * 1000, "b" * 1000) == 1000
assert edit_distance("ab" * 500, "ba" * 500) == 2
`,
    }),
    py({
        id: "py-top-k",
        tags: ["list", "sorting"],
        prompt: {
            TR: "Python ile `top_k(nums: list[int], k: int) -> list[int]` fonksiyonunu yaz: en büyük `k` sayıyı azalan sırada döndürür (tekrar edenler ayrı sayılır). k ≤ 0 ise [] döner; k liste uzunluğundan büyükse tüm liste azalan sırada döner. Girdi değiştirilmez.",
            EN: "Write `top_k(nums: list[int], k: int) -> list[int]` in Python: it returns the `k` largest numbers in descending order (duplicates count separately). If k ≤ 0 it returns []; if k is larger than the list, the whole list in descending order. The input must not change.",
        },
        solution: String.raw`import heapq


def top_k(nums, k):
    if k <= 0:
        return []
    return heapq.nlargest(k, nums)
`,
        tests: String.raw`assert top_k([3, 1, 4, 1, 5, 9, 2, 6], 3) == [9, 6, 5]
assert top_k([5, 5, 1], 2) == [5, 5]
assert top_k([1, 2], 5) == [2, 1]
assert top_k([1, 2], 0) == []
assert top_k([1, 2], -3) == []
assert top_k([], 2) == []
data = [4, 2, 8]
top_k(data, 2)
assert data == [4, 2, 8]
`,
    }),
    py({
        id: "py-min-partition",
        tags: ["dynamic-programming"],
        prompt: {
            TR: "Python ile `min_partition_difference(nums: list[int]) -> int` fonksiyonunu yaz: pozitif tam sayıları iki gruba ayırırken (her sayı tam olarak bir gruba girer, gruplardan biri boş olabilir) iki grubun toplamları arasındaki en küçük farkı döndürür. Boş liste için 0. 60 sayı (her biri en fazla 1.000) için hızlı çalışmalı.",
            EN: "Write `min_partition_difference(nums: list[int]) -> int` in Python: when the positive integers are split into two groups (each number goes into exactly one group; a group may be empty), it returns the smallest possible difference between the two groups' sums. For an empty list it returns 0. It must be fast for 60 numbers of at most 1,000 each.",
        },
        solution: String.raw`def min_partition_difference(nums):
    total = sum(nums)
    reachable = 1
    for n in nums:
        reachable |= reachable << n
    best = total
    for s in range(total // 2 + 1):
        if reachable >> s & 1:
            best = min(best, total - 2 * s)
    return best
`,
        tests: String.raw`assert min_partition_difference([1, 6, 11, 5]) == 1
assert min_partition_difference([1, 2, 3, 9]) == 3
assert min_partition_difference([3, 1, 4, 2, 2, 1]) == 1
assert min_partition_difference([]) == 0
assert min_partition_difference([7]) == 7
assert min_partition_difference([10, 10]) == 0
assert min_partition_difference([1000] * 59 + [1]) == 999
assert min_partition_difference(list(range(1, 61))) == 0
`,
    }),
    py({
        id: "py-snake-case",
        tags: ["string", "regex"],
        prompt: {
            TR: "Python ile `to_snake_case(name: str) -> str` fonksiyonunu yaz: camelCase ya da PascalCase bir adı snake_case'e çevirir: 'parseHTTPResponse' → 'parse_http_response', 'userID' → 'user_id', 'Simple' → 'simple'. Rakamlar önceki parçaya yapışık kalır ('base64Encode' → 'base64_encode'); zaten snake_case olan ad değişmez.",
            EN: "Write `to_snake_case(name: str) -> str` in Python: it turns a camelCase or PascalCase name into snake_case: 'parseHTTPResponse' → 'parse_http_response', 'userID' → 'user_id', 'Simple' → 'simple'. Digits stay with the part before them ('base64Encode' → 'base64_encode'); a name already in snake_case stays the same.",
        },
        solution: String.raw`import re


def to_snake_case(name):
    step = re.sub(r"([a-z0-9])([A-Z])", r"\1_\2", name)
    step = re.sub(r"([A-Z]+)([A-Z][a-z])", r"\1_\2", step)
    return step.lower()
`,
        tests: String.raw`assert to_snake_case("parseHTTPResponse") == "parse_http_response"
assert to_snake_case("userID") == "user_id"
assert to_snake_case("Simple") == "simple"
assert to_snake_case("base64Encode") == "base64_encode"
assert to_snake_case("getHTTPResponseCode") == "get_http_response_code"
assert to_snake_case("already_snake") == "already_snake"
assert to_snake_case("XMLHttpRequest") == "xml_http_request"
assert to_snake_case("") == ""
`,
    }),
    py({
        id: "py-moving-average",
        tags: ["list", "math"],
        prompt: {
            TR: "Python ile `moving_average(values: list[float], window: int) -> list[float]` fonksiyonunu yaz: `window` uzunluğundaki kayan pencerelerin ortalamalarını döndürür (sonuç len(values) - window + 1 uzunluktadır). Pencere listeden uzunsa [] döner; window ≤ 0 ise `ValueError` fırlatır.",
            EN: "Write `moving_average(values: list[float], window: int) -> list[float]` in Python: it returns the averages of the sliding windows of length `window` (the result has len(values) - window + 1 items). If the window is longer than the list it returns []; if window ≤ 0 it raises `ValueError`.",
        },
        solution: String.raw`def moving_average(values, window):
    if window <= 0:
        raise ValueError("window must be positive")
    if window > len(values):
        return []
    total = sum(values[:window])
    out = [total / window]
    for i in range(window, len(values)):
        total += values[i] - values[i - window]
        out.append(total / window)
    return out
`,
        tests: String.raw`import math

def close(got, expected):
    return len(got) == len(expected) and all(math.isclose(x, y, rel_tol=1e-9, abs_tol=1e-9) for x, y in zip(got, expected))

assert close(moving_average([1, 2, 3, 4, 5], 2), [1.5, 2.5, 3.5, 4.5])
assert close(moving_average([1, 2, 3], 3), [2.0])
assert moving_average([1, 2], 3) == []
assert close(moving_average([5], 1), [5.0])
assert close(moving_average([0.1, 0.2, 0.3], 2), [0.15, 0.25])
_raises(ValueError, moving_average, [1, 2], 0)
_raises(ValueError, moving_average, [1, 2], -1)
`,
    }),
    py({
        id: "py-has-cycle",
        tags: ["graph"],
        prompt: {
            TR: "Python ile `has_cycle(graph: dict[str, list[str]]) -> bool` fonksiyonunu yaz: komşuluk listesiyle verilen yönlü grafikte döngü olup olmadığını döndürür. Listelerde geçip anahtar olarak bulunmayan düğümlerin çıkan kenarı yoktur; kendine dönen kenar da döngüdür. 5.000 düğümlük uzun zincirlerde de çalışmalı.",
            EN: "Write `has_cycle(graph: dict[str, list[str]]) -> bool` in Python: it returns whether the directed graph, given as adjacency lists, contains a cycle. Nodes that appear in the lists but not as keys have no outgoing edges; a self-loop is a cycle. It must also work for long chains of 5,000 nodes.",
        },
        solution: String.raw`def has_cycle(graph):
    state = {}
    for start in graph:
        if state.get(start):
            continue
        state[start] = 1
        stack = [(start, iter(graph.get(start, ())))]
        while stack:
            node, children = stack[-1]
            child = next(children, None)
            if child is None:
                state[node] = 2
                stack.pop()
            elif state.get(child) == 1:
                return True
            elif not state.get(child):
                state[child] = 1
                stack.append((child, iter(graph.get(child, ()))))
    return False
`,
        tests: String.raw`assert has_cycle({"a": ["b"], "b": ["c"], "c": ["a"]}) is True
assert has_cycle({"a": ["b"], "b": ["c"], "c": []}) is False
assert has_cycle({"a": ["a"]}) is True
assert has_cycle({}) is False
assert has_cycle({"a": ["b", "c"], "b": ["d"], "c": ["d"], "d": []}) is False
assert has_cycle({"a": ["x"]}) is False
chain = {str(i): [str(i + 1)] for i in range(5000)}
assert has_cycle(chain) is False
chain["5000"] = ["0"]
assert has_cycle(chain) is True
`,
    }),
    py({
        id: "py-grid-path",
        tags: ["graph", "bfs"],
        prompt: {
            TR: "Python ile `shortest_path(grid: list[str]) -> int` fonksiyonunu yaz: '.' boş ve '#' duvar olan ızgarada sol üst köşeden sağ alt köşeye yalnızca yukarı, aşağı, sola ve sağa giderek en kısa adım sayısını döndürür. Ulaşılamıyorsa ya da başlangıç veya bitiş duvarsa -1 döner; 1×1 boş ızgara için 0.",
            EN: "Write `shortest_path(grid: list[str]) -> int` in Python: on a grid where '.' is free and '#' is a wall, it returns the smallest number of steps from the top-left to the bottom-right corner, moving only up, down, left or right. If the goal can't be reached or the start or goal is a wall it returns -1; for a 1×1 free grid it returns 0.",
        },
        solution: String.raw`from collections import deque


def shortest_path(grid):
    rows, cols = len(grid), len(grid[0])
    if grid[0][0] == "#" or grid[rows - 1][cols - 1] == "#":
        return -1
    seen = {(0, 0)}
    queue = deque([(0, 0, 0)])
    while queue:
        r, c, steps = queue.popleft()
        if (r, c) == (rows - 1, cols - 1):
            return steps
        for dr, dc in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nr, nc = r + dr, c + dc
            if 0 <= nr < rows and 0 <= nc < cols and grid[nr][nc] == "." and (nr, nc) not in seen:
                seen.add((nr, nc))
                queue.append((nr, nc, steps + 1))
    return -1
`,
        tests: String.raw`assert shortest_path(["..", ".."]) == 2
assert shortest_path(["."]) == 0
assert shortest_path(["#."]) == -1
assert shortest_path([".#", "#."]) == -1
assert shortest_path(["...", "##.", "..."]) == 4
assert shortest_path([".....", "####.", ".....", ".####", "....."]) == 16
assert shortest_path(["." * 60] * 60) == 118
`,
    }),
    py({
        id: "py-roman-to-int",
        tags: ["string", "number"],
        prompt: {
            TR: "Python ile `roman_to_int(text: str) -> int` fonksiyonunu yaz: geçerli bir Roma rakamını (I, V, X, L, C, D, M; çıkarma kuralıyla IV, IX, XL, XC, CD, CM) tam sayıya çevirir. Boş metinde ya da bu harfler dışında bir karakterde `ValueError` fırlatır.",
            EN: "Write `roman_to_int(text: str) -> int` in Python: it converts a valid Roman numeral (I, V, X, L, C, D, M with the subtractive forms IV, IX, XL, XC, CD, CM) to an integer. For an empty text or any other character it raises `ValueError`.",
        },
        solution: String.raw`def roman_to_int(text):
    values = {"I": 1, "V": 5, "X": 10, "L": 50, "C": 100, "D": 500, "M": 1000}
    if not text or any(ch not in values for ch in text):
        raise ValueError(f"not a Roman numeral: {text!r}")
    total = 0
    for i, ch in enumerate(text):
        value = values[ch]
        if i + 1 < len(text) and values[text[i + 1]] > value:
            total -= value
        else:
            total += value
    return total
`,
        tests: String.raw`for roman, value in {"III": 3, "IV": 4, "IX": 9, "LVIII": 58, "MCMXCIV": 1994, "MMXXVI": 2026, "MMMCMXCIX": 3999}.items():
    assert roman_to_int(roman) == value, roman
_raises(ValueError, roman_to_int, "")
_raises(ValueError, roman_to_int, "ABC")
_raises(ValueError, roman_to_int, "12")
_raises(ValueError, roman_to_int, "iv")
`,
    }),
    py({
        id: "py-get-path",
        tags: ["dict", "parsing"],
        prompt: {
            TR: "Python ile `get_path(data, path: str, default=None)` fonksiyonunu yaz: iç içe sözlük ve listelerde 'a.b[2].c' biçimindeki yolu izleyerek değeri döndürür. Yol bulunamazsa (eksik anahtar, aralık dışı indeks ya da yanlış tür) `default` döner; değer gerçekten None ise None döner. Boş yol verinin kendisini döndürür; indeksler negatif olmayan tam sayılardır.",
            EN: "Write `get_path(data, path: str, default=None)` in Python: it follows a path such as 'a.b[2].c' through nested dictionaries and lists and returns the value. If the path can't be followed (missing key, index out of range or the wrong type) it returns `default`; if the value really is None it returns None. An empty path returns the data itself; indexes are non-negative integers.",
        },
        solution: String.raw`import re


def get_path(data, path, default=None):
    current = data
    for match in re.finditer(r"([^.\[\]]+)|\[(\d+)\]", path):
        key, index = match.group(1), match.group(2)
        if key is not None:
            if not isinstance(current, dict) or key not in current:
                return default
            current = current[key]
        else:
            position = int(index)
            if not isinstance(current, list) or position >= len(current):
                return default
            current = current[position]
    return current
`,
        tests: String.raw`data = {"a": {"b": [10, 20, {"c": "x"}]}, "n": None}
assert get_path(data, "a.b[2].c") == "x"
assert get_path(data, "a.b[0]") == 10
assert get_path(data, "a.b[5]", "yok") == "yok"
assert get_path(data, "a.x") is None
assert get_path(data, "a.b.c", 0) == 0
assert get_path(data, "n", "d") is None
assert get_path(data, "") is data
assert get_path([1, [2, 3]], "[1][0]") == 2
assert get_path({"a": 1}, "a.b", 0) == 0
`,
    }),
];

/** The ids of every task, for the training-data exclusion check. */
export const BENCH_TASK_IDS = BENCH_TASKS.map((task) => task.id);
