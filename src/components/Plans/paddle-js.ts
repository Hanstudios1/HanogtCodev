"use client";

import type { PaddleClientErrorStage, PaddleEnvironment } from "@/lib/paddle";

/**
 * Loads Paddle.js (https://cdn.paddle.com/paddle/v2/paddle.js) on demand and
 * initialises it the way Paddle's own loader (@paddle/paddle-js) does: a tag
 * already on the page is reused, the instance is window.PaddleBillingV1
 * (window.Paddle on older builds), and once Paddle.Initialized is set it gets
 * Update instead of a second Initialize. Paddle takes one event callback, so
 * events are forwarded to whichever handler the page registered last.
 * The checkout itself runs in Paddle's iframe; next.config.ts allows its hosts.
 * The environment follows the client-side token: Environment.set("sandbox")
 * is only called for sandbox tokens, live needs nothing.
 * Paddle Retain gets the signed-in person's Paddle customer id (pwCustomer),
 * never their e-mail or our own ids; Paddle loads Retain for live accounts only.
 * Every failure is a PaddleLoadError naming the stage that failed (and a
 * Paddle address a Content Security Policy refused, if there was one), so the
 * Plans page can tell people, and the team, what actually went wrong.
 */

/**
 * What Paddle.js passes to eventCallback. Error events also carry type, code
 * and detail; validation errors list each refused field in errors.
 */
export type PaddleCheckoutEvent = {
    name?: string;
    data?: unknown;
    type?: string;
    code?: string;
    detail?: string;
    documentation_url?: string;
    errors?: unknown;
    /** Older builds nested type, code, detail and errors here. */
    error?: unknown;
};

/** Paddle's error code the way the report route takes it ([a-z0-9_]). */
export function reportCode(value: string) {
    return value.toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 80);
}

function oneLine(value: unknown, max: number) {
    return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

/**
 * What a checkout error event says. Paddle.js puts type, code and detail on
 * the event itself (older builds: in data or in a nested error object), and a
 * validation error ("api_error" / "validation") lists every field Paddle
 * refused with its message: without them "Invalid request." says nothing.
 */
export function checkoutEventError(event: PaddleCheckoutEvent) {
    const record = event as Record<string, unknown>;
    const data = record.data && typeof record.data === "object" ? record.data as Record<string, unknown> : null;
    const sources = [record, data, record.error, data?.error]
        .filter((value): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value));
    const field = (key: string) => sources.map((source) => oneLine(source[key], 200)).find(Boolean) ?? "";
    const type = field("type");
    const code = field("code");
    const detail = field("detail");
    const fields = sources
        .flatMap((source) => (Array.isArray(source.errors) ? source.errors as unknown[] : []))
        .map((item) => {
            if (typeof item === "string") return oneLine(item, 160);
            if (!item || typeof item !== "object") return "";
            const entry = item as Record<string, unknown>;
            const name = oneLine(entry.field ?? entry.name, 60);
            const message = oneLine(entry.message ?? entry.detail, 160);
            return name && message ? `${name}: ${message}` : name || message;
        })
        .filter(Boolean)
        .slice(0, 5);
    const refused = fields.join("; ");
    const main = detail && code ? `${detail} (${code})` : detail || code;
    return {
        code: reportCode(code),
        /** For the notice: Paddle's detail with its code, then the refused fields. */
        text: [main, refused].filter(Boolean).join(" — "),
        /** For the team and the report (300 characters): the fields come before the detail so they survive the cut. */
        message: [event.name, type, code, refused, detail].filter(Boolean).join(" · ").slice(0, 300),
        fields,
    };
}

type RetainCustomer = { id: string };
type CheckoutSettings = Record<string, unknown>;
type SetupOptions = {
    token: string;
    pwCustomer?: RetainCustomer;
    debug?: boolean;
    eventCallback?: (event: PaddleCheckoutEvent) => void;
    checkout?: { settings: CheckoutSettings };
};

export type PaddleJs = {
    Environment: { set(environment: "sandbox" | "production"): void };
    /** True once Initialize has run (missing on very old builds). */
    Initialized?: boolean;
    Initialize(options: SetupOptions): void;
    Update?(options: Partial<SetupOptions>): void;
    Checkout: {
        open(options: { transactionId: string; settings?: CheckoutSettings }): void;
        close(): void;
    };
};

declare global {
    interface Window {
        Paddle?: PaddleJs;
        PaddleBillingV1?: PaddleJs;
    }
}

const SCRIPT_URL = "https://cdn.paddle.com/paddle/v2/paddle.js";
/** A tag that has neither loaded nor failed by then counts as blocked (a stalled network). */
const LOAD_TIMEOUT_MS = 15_000;
/** The CSP event can arrive just after the tag's error event; a failure waits this long for it. */
const VIOLATION_WAIT_MS = 50;
const MESSAGE_MAX = 300;
const CUSTOMER_ID = /^ctm_[a-z0-9]{10,64}$/;
/** Paddle's and Retain's domains: an address there that a CSP refused explains a failure. */
const WATCHED_DOMAINS = ["paddle.com", "profitwell.com"];

// ---------------------------------------------------------------------------
// Failures
// ---------------------------------------------------------------------------

/**
 * Where it failed: Paddle.js never arrived (blocked: an ad blocker, browser
 * protection, the network or a Content Security Policy), it loaded without
 * its instance (missing), Environment.set, Initialize or Update threw (init),
 * or Checkout.open threw (open).
 */
export type PaddleFailureStage = Extract<PaddleClientErrorStage, "blocked" | "missing" | "init" | "open">;

export class PaddleLoadError extends Error {
    readonly stage: PaddleFailureStage;
    /** A Paddle or Retain address a Content Security Policy refused meanwhile (origin and path). */
    readonly blockedUrl: string | null;
    // No parameter properties: the plain-Node tests strip types and can't run them.
    constructor(stage: PaddleFailureStage, message: string, blockedUrl: string | null = null) {
        super(message);
        this.name = "PaddleLoadError";
        this.stage = stage;
        this.blockedUrl = blockedUrl;
    }
}

/** A refused address and the CSP directive that refused it. */
export type PaddleViolation = { url: string; directive: string };

/** The calls that can fail, and the stage each failure belongs to (adding the tag is "script"). */
const CALL_STAGES = {
    script: "blocked",
    "Environment.set": "init",
    Initialize: "init",
    Update: "init",
    "Checkout.open": "open",
} as const satisfies Record<string, PaddleFailureStage>;
export type PaddleCall = keyof typeof CALL_STAGES;

/** What the loader saw go wrong. */
export type PaddleFailure =
    /** The tag fired `error`, also when tried once more with a fresh tag. */
    | { kind: "script_error"; violation?: PaddleViolation | null }
    /** The tag fired neither `load` nor `error` in time. */
    | { kind: "script_timeout"; violation?: PaddleViolation | null }
    /** `load` fired, but neither window.PaddleBillingV1 nor window.Paddle is there. */
    | { kind: "no_instance"; violation?: PaddleViolation | null }
    /** A call threw. */
    | { kind: "threw"; call: PaddleCall; error: unknown; violation?: PaddleViolation | null };

/** The text of anything thrown: Error.message or String(value), on one line and at most 300 characters. */
export function failureMessage(error: unknown): string {
    let text: string;
    try {
        const message = typeof error === "object" && error !== null ? (error as { message?: unknown }).message : undefined;
        text = typeof message === "string" && message ? message : String(error);
    } catch {
        // e.g. an object whose toString throws.
        text = "";
    }
    return text.replace(/\s+/g, " ").trim().slice(0, MESSAGE_MAX);
}

/**
 * The error the page shows for what the loader saw: a tag that failed or
 * stalled is "blocked", a tag without Paddle's instance "missing", and a throw
 * belongs to the stage of its call (an error that already is a
 * PaddleLoadError keeps its own). The message names the call and keeps
 * Paddle's own words; a refused address comes along.
 */
export function classifyPaddleFailure(failure: PaddleFailure): PaddleLoadError {
    const violation = failure.violation ?? null;
    const refused = violation ? ` (${violation.directive} refused ${violation.url})` : "";
    let stage: PaddleFailureStage;
    let message: string;
    switch (failure.kind) {
        case "script_error":
            stage = "blocked";
            message = `${SCRIPT_URL} failed to load${refused}`;
            break;
        case "script_timeout":
            stage = "blocked";
            message = `${SCRIPT_URL} neither loaded nor failed within ${LOAD_TIMEOUT_MS / 1000} s${refused}`;
            break;
        case "no_instance":
            stage = "missing";
            message = `Paddle.js loaded, but window.PaddleBillingV1 and window.Paddle are missing${refused}`;
            break;
        default:
            if (failure.error instanceof PaddleLoadError) return failure.error;
            stage = CALL_STAGES[failure.call];
            message = `${failure.call}: ${failureMessage(failure.error) || "threw"}${refused}`;
    }
    return new PaddleLoadError(stage, message.slice(0, MESSAGE_MAX), violation?.url ?? null);
}

/** The address as origin and path when it is https on Paddle's or Retain's domains, else null. */
export function paddleBlockedUrl(raw: unknown): string | null {
    if (typeof raw !== "string" || !raw) return null;
    try {
        const url = new URL(raw);
        const host = url.hostname.toLowerCase();
        const watched = WATCHED_DOMAINS.some((domain) => host === domain || host.endsWith(`.${domain}`));
        return watched && url.protocol === "https:" ? `${url.origin}${url.pathname}`.slice(0, MESSAGE_MAX) : null;
    } catch {
        // "inline", "eval" and the like.
        return null;
    }
}

let violation: (PaddleViolation & { at: number }) | null = null;
let watching = false;
/** When the current getPaddle call started: refusals before it belong to something else. */
let since = 0;

/** Remembers the last Paddle or Retain address a Content Security Policy refused (from the first load on). */
function watchViolations() {
    if (watching) return;
    watching = true;
    document.addEventListener("securitypolicyviolation", (event) => {
        const url = paddleBlockedUrl(event.blockedURI);
        if (url) violation = { url, directive: event.effectiveDirective || event.violatedDirective || "CSP", at: Date.now() };
    });
}

function recentViolation(): PaddleViolation | null {
    return violation && violation.at >= since ? { url: violation.url, directive: violation.directive } : null;
}

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

let loading: Promise<PaddleJs> | null = null;

/** Paddle's instance: window.PaddleBillingV1 on current builds, window.Paddle on older ones. */
function instance(): PaddleJs | undefined {
    return window.PaddleBillingV1 ?? window.Paddle;
}

type Attempt = { paddle: PaddleJs } | { failure: "script_error" | "script_timeout" | "no_instance" };

/** Waits for a tag to load: the one already on the page (`reuse`) or a new one. A failed tag is removed. */
function loadTag(reuse: boolean): Promise<Attempt> {
    return new Promise<Attempt>((resolve) => {
        let tag = reuse ? document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT_URL}"]`) : null;
        if (!tag) {
            tag = document.createElement("script");
            tag.src = SCRIPT_URL;
            tag.async = true;
            (document.head ?? document.body).appendChild(tag);
        }
        const script = tag;
        let timer = 0;
        const settle = (attempt: Attempt) => {
            window.clearTimeout(timer);
            script.removeEventListener("load", onLoad);
            script.removeEventListener("error", onError);
            // The next try starts with a fresh tag.
            if ("failure" in attempt) script.remove();
            resolve(attempt);
        };
        const onLoad = () => {
            const paddle = instance();
            settle(paddle ? { paddle } : { failure: "no_instance" });
        };
        const onError = () => settle({ failure: "script_error" });
        script.addEventListener("load", onLoad);
        script.addEventListener("error", onError);
        timer = window.setTimeout(() => {
            const paddle = instance();
            settle(paddle ? { paddle } : { failure: "script_timeout" });
        }, LOAD_TIMEOUT_MS);
    });
}

async function loadOnce(): Promise<PaddleJs> {
    try {
        let attempt = await loadTag(true);
        // A failed download gets one more try with a fresh tag (a network hiccup, or a tag that had failed before).
        if ("failure" in attempt && attempt.failure === "script_error") attempt = await loadTag(false);
        if ("paddle" in attempt) return attempt.paddle;
        await new Promise((resolve) => window.setTimeout(resolve, VIOLATION_WAIT_MS));
        throw classifyPaddleFailure({ kind: attempt.failure, violation: recentViolation() });
    } catch (error) {
        // Already classified above, or the tag couldn't even be added.
        throw classifyPaddleFailure({ kind: "threw", call: "script", error, violation: recentViolation() });
    }
}

function loadScript(): Promise<PaddleJs> {
    const ready = instance();
    if (ready) return Promise.resolve(ready);
    // Calls while it loads share the attempt; after a failure the next call starts over.
    loading ??= loadOnce().finally(() => {
        loading = null;
    });
    return loading;
}

// ---------------------------------------------------------------------------
// Initialising and opening
// ---------------------------------------------------------------------------

let handler: ((event: PaddleCheckoutEvent) => void) | null = null;
/** What this page last gave Paddle.js (null until it initialised or updated it). */
let applied: { token: string; customer: string | null; debug: boolean } | null = null;

function forward(event: PaddleCheckoutEvent) {
    handler?.(event);
}

/** Runs a Paddle.js call; a throw becomes the PaddleLoadError of the call's stage. */
function guarded(call: PaddleCall, run: () => void) {
    try {
        run();
    } catch (error) {
        throw classifyPaddleFailure({ kind: "threw", call, error, violation: recentViolation() });
    }
}

/** Forwards checkout events (checkout.completed, checkout.error…) to the current page. */
export function onPaddleEvent(next: ((event: PaddleCheckoutEvent) => void) | null) {
    handler = next;
}

export type PaddleOptions = {
    /** Checkout defaults (theme, locale…); Checkout.open gets them again. */
    settings?: CheckoutSettings;
    /** The signed-in person's Paddle customer (ctm_…), for Paddle Retain. */
    customerId?: string | null;
    /** Paddle.js explains itself in the browser console (test mode). */
    debug?: boolean;
};

/**
 * Paddle.js, initialised for this site's account. Rejects with a
 * PaddleLoadError whose stage is "blocked", "missing" or "init".
 */
export async function getPaddle(config: { environment: PaddleEnvironment; clientToken: string }, options: PaddleOptions = {}): Promise<PaddleJs> {
    since = Date.now();
    watchViolations();
    const paddle = await loadScript();
    const customer = options.customerId && CUSTOMER_ID.test(options.customerId) ? options.customerId : null;
    const debug = options.debug === true;
    // Paddle.Initialized decides (a payment link or an earlier copy of this module may have initialised it); builds without it go by this page.
    const initialized = typeof paddle.Initialized === "boolean" ? paddle.Initialized : applied !== null;
    const changed = !applied || applied.token !== config.clientToken || applied.debug !== debug || (customer !== null && applied.customer !== customer);
    if (initialized && !changed) return paddle;
    const setup: SetupOptions = {
        token: config.clientToken,
        ...(customer ? { pwCustomer: { id: customer } } : {}),
        debug,
        eventCallback: forward,
        checkout: { settings: { displayMode: "overlay", allowLogout: false, ...options.settings } },
    };
    if (config.environment === "sandbox") guarded("Environment.set", () => paddle.Environment.set("sandbox"));
    if (initialized) guarded("Update", () => paddle.Update?.(setup));
    else guarded("Initialize", () => paddle.Initialize(setup));
    applied = { token: config.clientToken, customer: customer ?? applied?.customer ?? null, debug };
    return paddle;
}

/**
 * Opens the overlay checkout for a transaction the server created. A throw
 * from Paddle.js becomes a PaddleLoadError with stage "open"; problems Paddle
 * finds later arrive as checkout.error and checkout.failed events.
 */
export function openCheckout(paddle: PaddleJs, transactionId: string, settings: CheckoutSettings = {}) {
    guarded("Checkout.open", () => paddle.Checkout.open({ transactionId, settings }));
}

/**
 * Closes Paddle's overlay, if Paddle.js is on the page. After a checkout.error
 * Paddle shows only "Something went wrong" (and a button to Paddle's support)
 * on top of the page; closing it lets the page say what Paddle refused.
 */
export function closeCheckout() {
    try {
        instance()?.Checkout.close();
    } catch {
        // Nothing open, or a build without close: the page's notice is still shown.
    }
}
