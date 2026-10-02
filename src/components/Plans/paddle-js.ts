"use client";

import type { PaddleEnvironment } from "@/lib/paddle";

/**
 * Loads Paddle.js (https://cdn.paddle.com/paddle/v2/paddle.js) on demand and
 * initialises it once per page load. Paddle allows a single Initialize call,
 * so events are forwarded to whichever handler the page registered last.
 * The checkout itself runs in Paddle's iframe; next.config.ts allows its hosts.
 * The environment follows the client-side token: Environment.set("sandbox")
 * is only called for sandbox tokens, live needs nothing.
 * Paddle Retain gets the signed-in person's Paddle customer id (pwCustomer),
 * never their e-mail or our own ids.
 */

export type PaddleCheckoutEvent = { name?: string; data?: unknown };

type RetainCustomer = { id: string };

type PaddleJs = {
    Environment: { set(environment: "sandbox" | "production"): void };
    Initialize(options: { token: string; pwCustomer?: RetainCustomer; eventCallback?: (event: PaddleCheckoutEvent) => void; checkout?: { settings?: Record<string, unknown> } }): void;
    Update?(options: { pwCustomer?: RetainCustomer }): void;
    Checkout: {
        open(options: { transactionId: string; settings?: Record<string, unknown> }): void;
        close(): void;
    };
};

declare global {
    interface Window {
        Paddle?: PaddleJs;
    }
}

const SCRIPT_URL = "https://cdn.paddle.com/paddle/v2/paddle.js";

let loading: Promise<PaddleJs> | null = null;
let initializedToken: string | null = null;
let retainCustomer: string | null = null;
let handler: ((event: PaddleCheckoutEvent) => void) | null = null;

function loadScript(): Promise<PaddleJs> {
    if (window.Paddle) return Promise.resolve(window.Paddle);
    loading ??= new Promise<PaddleJs>((resolve, reject) => {
        const script = document.createElement("script");
        script.src = SCRIPT_URL;
        script.async = true;
        script.onload = () => (window.Paddle ? resolve(window.Paddle) : reject(new Error("paddle_missing")));
        script.onerror = () => {
            loading = null;
            script.remove();
            reject(new Error("paddle_blocked"));
        };
        document.head.appendChild(script);
    });
    return loading;
}

/** Forwards checkout events (checkout.completed, checkout.closed…) to the current page. */
export function onPaddleEvent(next: ((event: PaddleCheckoutEvent) => void) | null) {
    handler = next;
}

/**
 * Paddle.js, initialised for this site's account; rejects if the script is
 * blocked. `customerId` is the signed-in person's Paddle customer (ctm_…).
 */
export async function getPaddle(config: { environment: PaddleEnvironment; clientToken: string }, settings: Record<string, unknown> = {}, customerId: string | null = null) {
    const paddle = await loadScript();
    const pwCustomer = customerId && /^ctm_[a-z0-9]{10,64}$/.test(customerId) ? { id: customerId } : undefined;
    if (initializedToken !== config.clientToken) {
        if (config.environment === "sandbox") paddle.Environment.set("sandbox");
        paddle.Initialize({
            token: config.clientToken,
            ...(pwCustomer ? { pwCustomer } : {}),
            eventCallback: (event) => handler?.(event),
            checkout: { settings: { displayMode: "overlay", allowLogout: false, ...settings } },
        });
        initializedToken = config.clientToken;
        retainCustomer = pwCustomer?.id ?? null;
    } else if (pwCustomer && retainCustomer !== pwCustomer.id) {
        paddle.Update?.({ pwCustomer });
        retainCustomer = pwCustomer.id;
    }
    return paddle;
}
