// Just enough of Jest's API to run Exercism's JavaScript test files against
// their reference solutions (training/import-github.mjs). Every test runs,
// including xtest/test.skip ones (Exercism skips all but the first for
// students). Anything it doesn't support makes the run fail, which only
// marks that exercise as not verified here.
import { isDeepStrictEqual, inspect } from "node:util";

const tests = [];
const hooks = { beforeEach: [], afterEach: [], beforeAll: [], afterAll: [] };
let prefix = [];

const register = (name, fn) => tests.push({ name: [...prefix, name].join(" › "), fn });
const describe = (name, fn) => {
    prefix.push(name);
    try {
        fn();
    } finally {
        prefix.pop();
    }
};
describe.skip = describe;
describe.only = describe;
describe.each = (table) => (name, fn) => table.forEach((row) => describe(name, () => fn(...(Array.isArray(row) ? row : [row]))));
const test = (name, fn) => register(name, fn);
test.skip = test;
test.only = test;
test.todo = () => {};
test.each = (table) => (name, fn) => table.forEach((row, index) => register(`${name} #${index}`, () => fn(...(Array.isArray(row) ? row : [row]))));

class Asymmetric {
    constructor(check, label) {
        this.check = check;
        this.label = label;
    }
}

/** Jest's toEqual: recursive, ignores undefined properties, honours asymmetric matchers. */
function equals(actual, expected, strict = false) {
    if (expected instanceof Asymmetric) return expected.check(actual);
    if (actual instanceof Asymmetric) return actual.check(expected);
    if (Object.is(actual, expected)) return true;
    if (typeof actual === "number" && typeof expected === "number") return actual === expected;
    if (!actual || !expected || typeof actual !== "object" || typeof expected !== "object") return false;
    if (strict && Object.getPrototypeOf(actual) !== Object.getPrototypeOf(expected)) return false;
    if (Array.isArray(actual) !== Array.isArray(expected)) return false;
    if (actual instanceof Date || expected instanceof Date) return actual instanceof Date && expected instanceof Date && actual.getTime() === expected.getTime();
    if (actual instanceof RegExp || expected instanceof RegExp) return String(actual) === String(expected);
    if (actual instanceof Map || expected instanceof Map) {
        if (!(actual instanceof Map && expected instanceof Map) || actual.size !== expected.size) return false;
        for (const [key, value] of actual) if (!expected.has(key) || !equals(value, expected.get(key), strict)) return false;
        return true;
    }
    if (actual instanceof Set || expected instanceof Set) {
        if (!(actual instanceof Set && expected instanceof Set) || actual.size !== expected.size) return false;
        for (const value of actual) if (![...expected].some((other) => equals(value, other, strict))) return false;
        return true;
    }
    const keys = (value) => Object.keys(value).filter((key) => strict || value[key] !== undefined);
    const actualKeys = keys(actual);
    const expectedKeys = keys(expected);
    if (actualKeys.length !== expectedKeys.length) return false;
    return expectedKeys.every((key) => Object.prototype.hasOwnProperty.call(actual, key) && equals(actual[key], expected[key], strict));
}

function matchesObject(actual, expected) {
    if (expected instanceof Asymmetric) return expected.check(actual);
    if (!expected || typeof expected !== "object") return equals(actual, expected);
    if (!actual || typeof actual !== "object") return false;
    if (Array.isArray(expected)) return Array.isArray(actual) && actual.length === expected.length && expected.every((value, index) => matchesObject(actual[index], value));
    return Object.keys(expected).every((key) => matchesObject(actual[key], expected[key]));
}

function thrown(fn) {
    try {
        fn();
    } catch (error) {
        return { error };
    }
    return null;
}

function errorMatches(error, expected) {
    if (expected === undefined) return true;
    const message = error?.message ?? String(error);
    if (typeof expected === "string") return message.includes(expected);
    if (expected instanceof RegExp) return expected.test(message);
    if (typeof expected === "function") return error instanceof expected;
    if (expected instanceof Error) return message === expected.message;
    if (expected && typeof expected === "object") return Object.keys(expected).every((key) => equals(error?.[key], expected[key]));
    return false;
}

function matchers(actual, negate, label = "") {
    const check = (pass, what) => {
        if (pass === negate) throw new Error(`expect(${inspect(actual, { depth: 3 })})${label}${negate ? ".not" : ""}.${what}`);
    };
    const api = {
        toBe: (expected) => check(Object.is(actual, expected), `toBe(${inspect(expected)})`),
        toEqual: (expected) => check(equals(actual, expected), `toEqual(${inspect(expected, { depth: 3 })})`),
        toStrictEqual: (expected) => check(equals(actual, expected, true) && isDeepStrictEqual(actual, expected), `toStrictEqual(${inspect(expected, { depth: 3 })})`),
        toBeCloseTo: (expected, digits = 2) => check(Math.abs(actual - expected) < 10 ** -digits / 2, `toBeCloseTo(${expected}, ${digits})`),
        toBeTruthy: () => check(Boolean(actual), "toBeTruthy()"),
        toBeFalsy: () => check(!actual, "toBeFalsy()"),
        toBeNull: () => check(actual === null, "toBeNull()"),
        toBeUndefined: () => check(actual === undefined, "toBeUndefined()"),
        toBeDefined: () => check(actual !== undefined, "toBeDefined()"),
        toBeNaN: () => check(Number.isNaN(actual), "toBeNaN()"),
        toContain: (expected) => check(typeof actual === "string" ? actual.includes(expected) : [...actual].some((item) => Object.is(item, expected)), `toContain(${inspect(expected)})`),
        toContainEqual: (expected) => check([...actual].some((item) => equals(item, expected)), `toContainEqual(${inspect(expected)})`),
        toHaveLength: (expected) => check(actual?.length === expected, `toHaveLength(${expected})`),
        toBeGreaterThan: (expected) => check(actual > expected, `toBeGreaterThan(${expected})`),
        toBeGreaterThanOrEqual: (expected) => check(actual >= expected, `toBeGreaterThanOrEqual(${expected})`),
        toBeLessThan: (expected) => check(actual < expected, `toBeLessThan(${expected})`),
        toBeLessThanOrEqual: (expected) => check(actual <= expected, `toBeLessThanOrEqual(${expected})`),
        toMatch: (expected) => check(typeof actual === "string" && (expected instanceof RegExp ? expected.test(actual) : actual.includes(expected)), `toMatch(${inspect(expected)})`),
        toMatchObject: (expected) => check(matchesObject(actual, expected), `toMatchObject(${inspect(expected, { depth: 3 })})`),
        toBeInstanceOf: (expected) => check(actual instanceof expected, `toBeInstanceOf(${expected?.name})`),
        toHaveProperty: (key, ...value) => {
            const pathKeys = Array.isArray(key) ? key : String(key).split(".");
            let current = actual;
            let found = true;
            for (const part of pathKeys) {
                if (current !== null && current !== undefined && Object.prototype.hasOwnProperty.call(Object(current), part)) current = current[part];
                else {
                    found = false;
                    break;
                }
            }
            check(found && (value.length === 0 || equals(current, value[0])), `toHaveProperty(${inspect(key)})`);
        },
        toThrow: (expected) => {
            const result = typeof actual === "function" ? thrown(actual) : actual instanceof Error ? { error: actual } : null;
            check(Boolean(result) && errorMatches(result.error, expected), `toThrow(${inspect(expected)})`);
        },
    };
    api.toThrowError = api.toThrow;
    api.toBeCalled = () => {
        throw new Error("mock functions are not supported");
    };
    return api;
}

const expect = (actual) => {
    const api = matchers(actual, false);
    api.not = matchers(actual, true);
    const settle = async (wantRejected) => {
        try {
            const value = await actual;
            if (wantRejected) throw Object.assign(new Error("expected a rejection"), { harness: true });
            return value;
        } catch (error) {
            if (error?.harness || !wantRejected) throw error;
            return error;
        }
    };
    const later = (wantRejected) => {
        const wrap = (negate) => new Proxy({}, {
            get: (_, name) => async (...args) => {
                const value = await settle(wantRejected);
                const target = wantRejected && name.startsWith("toThrow") ? () => {
                    throw value;
                } : value;
                return matchers(target, negate, wantRejected ? ".rejects" : ".resolves")[name](...args);
            },
        });
        const api = wrap(false);
        api.not = wrap(true);
        return api;
    };
    api.resolves = later(false);
    api.rejects = later(true);
    return api;
};
expect.any = (type) => new Asymmetric((value) => (value !== null && value !== undefined && (Object(value) instanceof type || value.constructor === type)), `any(${type?.name})`);
expect.anything = () => new Asymmetric((value) => value !== null && value !== undefined, "anything()");
expect.arrayContaining = (items) => new Asymmetric((value) => Array.isArray(value) && items.every((item) => value.some((other) => equals(other, item))), "arrayContaining");
expect.objectContaining = (shape) => new Asymmetric((value) => matchesObject(value, shape), "objectContaining");
expect.stringContaining = (text) => new Asymmetric((value) => typeof value === "string" && value.includes(text), "stringContaining");
expect.stringMatching = (pattern) => new Asymmetric((value) => typeof value === "string" && new RegExp(pattern).test(value), "stringMatching");
expect.assertions = () => {};
expect.hasAssertions = () => {};

export function install(target = globalThis) {
    Object.assign(target, {
        describe,
        xdescribe: describe,
        test,
        it: test,
        xtest: test,
        xit: test,
        expect,
        beforeEach: (fn) => hooks.beforeEach.push(fn),
        afterEach: (fn) => hooks.afterEach.push(fn),
        beforeAll: (fn) => hooks.beforeAll.push(fn),
        afterAll: (fn) => hooks.afterAll.push(fn),
    });
}

const callWithDone = (fn) => (fn.length > 0 ? new Promise((resolve, reject) => fn((error) => (error ? reject(error) : resolve()))) : fn());

/** Runs every registered test; resolves to { passed, failed, failures }. */
export async function run({ timeoutMs = 5000 } = {}) {
    const failures = [];
    let passed = 0;
    for (const hook of hooks.beforeAll) await callWithDone(hook);
    for (const { name, fn } of tests) {
        try {
            for (const hook of hooks.beforeEach) await callWithDone(hook);
            await Promise.race([
                Promise.resolve().then(() => callWithDone(fn)),
                new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), timeoutMs).unref()),
            ]);
            for (const hook of hooks.afterEach) await callWithDone(hook);
            passed += 1;
        } catch (error) {
            failures.push({ name, error: String(error?.message ?? error).slice(0, 300) });
        }
    }
    for (const hook of hooks.afterAll) await callWithDone(hook);
    return { passed, failed: failures.length, failures };
}
