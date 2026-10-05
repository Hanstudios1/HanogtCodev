import type { NextRequest } from "next/server";
import { apiKeyAllowance, storedApiKeys } from "@/lib/server/ai-api-keys";
import { hanogtUsageFor } from "@/lib/server/ai-usage";
import { apiJson, callerOf, unavailable } from "../_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const windowOf = (window: { limit: number; used: number; remaining: number; resetsAt: string | null }) => ({ limit: window.limit, used: window.used, remaining: window.remaining, resets_at: window.resetsAt });

/**
 * GET /api/v1/usage: the account's Hanogt AI messages in the current minute
 * and in the plan's window (shared by the chat and the API), and its keys.
 * Not counted as a request.
 */
export async function GET(request: NextRequest) {
    const { caller, refusal } = await callerOf(request);
    if (!caller) return refusal;
    try {
        const [usage, keys] = await Promise.all([hanogtUsageFor(caller.email, caller.subscription), storedApiKeys(caller.email)]);
        return apiJson({
            object: "usage",
            plan: caller.plan,
            requests: { minute: windowOf(usage.minute), window: { ...windowOf(usage.window), days: usage.windowDays } },
            keys: { used: keys.length, limit: apiKeyAllowance(caller.plan) },
        });
    } catch (error) {
        console.error("[hanogt-ai-api:usage]", error instanceof Error ? error.message : error);
        return unavailable();
    }
}
