"use client";

import { useSession } from "next-auth/react";
import { useMyPlan } from "@/lib/plan-client";
import { PLAN_MESSAGE_CHARS } from "@/lib/plans";

/** The longest message the signed-in person's plan sends (Free 4,000, Plus 6,000, Pro 8,000 characters; the server checks again). */
export function useMessageMax() {
    const { data } = useSession();
    return PLAN_MESSAGE_CHARS[useMyPlan(data?.user?.email ?? null)];
}
