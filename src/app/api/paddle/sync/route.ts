import type { NextRequest } from "next/server";
import { billingView } from "@/lib/paddle";
import { effectivePlan, type PaddleSyncResponse } from "@/lib/plans";
import { billingStep } from "@/lib/server/paddle";
import { syncAccountFromPaddle } from "@/lib/server/paddle-sync";
import { getSubscription } from "@/lib/server/plans";
import { billingFailure, billingGuard, billingJson } from "../_shared";

export const runtime = "nodejs";
// Up to three Paddle requests (8 s each at most) plus the database.
export const maxDuration = 30;

/**
 * POST /api/paddle/sync → { state: "active" | "pending" | "none", plan, billing }.
 * The Plans page asks after a checkout completes (and from "check my
 * payment"): the server looks up the account's own checkout and Paddle
 * customer at Paddle and stores what it finds, so a paid plan unlocks even
 * when Paddle's notification is late or never arrives. No body: nothing about
 * the purchase is taken from the browser.
 */
export async function POST(request: NextRequest) {
    const startedAt = Date.now();
    // Twenty a minute: the page asks every few seconds for two minutes at most.
    const guard = await billingGuard(request, "sync", 20);
    if (!guard.ok) return guard.response;
    try {
        const state = await billingStep("sync", () => syncAccountFromPaddle(guard.email));
        const subscription = await billingStep("subscription", () => getSubscription(guard.email));
        return billingJson({ state, plan: effectivePlan(subscription), billing: billingView(subscription.paddle) } satisfies PaddleSyncResponse);
    } catch (error) {
        return billingFailure(error, { route: "sync", email: guard.email, startedAt });
    }
}
