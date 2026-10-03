"use client";

/**
 * "The plan changed": the Pricing page says so after a payment activates a
 * plan, a plan change or a resumed subscription; pages that show what the plan
 * allows (Hanogt AI's usage meter and connections) read it again. Other tabs
 * hear it through localStorage (a time stamp, nothing about the plan), the
 * same tab through a window event.
 */
const KEY = "hanogt:plan-changed";
const EVENT = "hanogt:plan-changed";

export function announcePlanChange() {
    window.dispatchEvent(new Event(EVENT));
    try {
        window.localStorage.setItem(KEY, String(Date.now()));
    } catch {
        // Storage blocked: other tabs catch up when they next load the plan.
    }
}

/** Calls `listener` when the plan may have changed, in this tab or another; returns the unsubscribe. */
export function onPlanChange(listener: () => void) {
    const onStorage = (event: StorageEvent) => {
        if (event.key === KEY) listener();
    };
    window.addEventListener(EVENT, listener);
    window.addEventListener("storage", onStorage);
    return () => {
        window.removeEventListener(EVENT, listener);
        window.removeEventListener("storage", onStorage);
    };
}
