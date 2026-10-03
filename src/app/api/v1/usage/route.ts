import type { NextRequest } from "next/server";
import { apiKeyAllowance, storedApiKeys } from "@/lib/server/ai-api-keys";
import { apiUsageFor } from "@/lib/server/ai-usage";
import { apiJson, callerOf, unavailable } from "../_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const windowOf = (window: { limit: number; used: number; remaining: number; resetsAt: string | null }) => ({ limit: window.limit, used: window.used, remaining: window.remaining, resets_at: window.resetsAt });

/** GET /api/v1/usage: the account's API requests in the current minute and 24 hours, and its keys (not counted as a request). */
export async function GET(request: NextRequest) {
    const { caller, refusal } = await callerOf(request);
    if (!caller) return refusal;
    try {
        const [usage, keys] = await Promise.all([apiUsageFor(caller.email, caller.subscription), storedApiKeys(caller.email)]);
        if (!usage) return unavailable();
        return apiJson({
            object: "usage",
            plan: caller.plan,
            requests: { minute: windowOf(usage.minute), day: windowOf(usage.day) },
            keys: { used: keys.length, limit: apiKeyAllowance(caller.plan) },
        });
    } catch (error) {
        console.error("[hanogt-ai-api:usage]", error instanceof Error ? error.message : error);
        return unavailable();
    }
}
