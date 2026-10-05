"use client";

import { Ticket } from "lucide-react";
import Link from "next/link";
import Header from "@/components/Header";
import ChangePlanDialog from "@/components/Plans/ChangePlanDialog";
import { AccountBar, CouponBox, NoticeBanner, PlanCards, PlanComparison, PlansFaq, PricingHero, UsagePanel } from "@/components/Plans/PricingSections";
import { C } from "@/components/Plans/plans-copy";
import { usePlansBilling } from "@/components/Plans/usePlansBilling";
import SiteFooter from "@/components/SiteFooter";
import type { Copy } from "@/lib/i18n";
import { PLAN_AI_LIMITS, PLAN_COPY } from "@/lib/plans";

const AI_LIMITS_LINE: Copy = {
    TR: "Hanogt AI: Ücretsiz haftada {free}, Plus 2 haftada {plus}, Pro haftada {pro} mesaj; geliştirici API'si aynı haktan düşer.",
    EN: "Hanogt AI: Free {free} a week, Plus {plus} every 2 weeks, Pro {pro} a week; the developer API uses the same messages.",
};

/**
 * Pricing: the plans, the person's subscription and the checkout. The state
 * and every request live in usePlansBilling; the parts in PricingSections.
 */
export default function PlansPage() {
    const billing = usePlansBilling();
    const { tx, change, billing: subscription, busy, anyOnSale } = billing;
    return (
        <div className="min-h-dvh bg-white text-zinc-900 dark:bg-zinc-950 dark:text-white">
            <Header />
            <main id="main-content">
                <PricingHero billing={billing} />
                <AccountBar billing={billing} />
                <section aria-label={tx(C.title)} className="pb-4">
                    <CouponBox billing={billing} />
                    <NoticeBanner billing={billing} />
                    <PlanCards billing={billing} />
                    <p className="mx-auto mt-6 flex max-w-3xl items-center justify-center gap-2 px-4 text-center text-[12.5px] text-zinc-500 dark:text-zinc-400">
                        <Ticket className="h-4 w-4 shrink-0" aria-hidden />
                        {tx(AI_LIMITS_LINE, { free: PLAN_AI_LIMITS.free.perWindow, plus: PLAN_AI_LIMITS.plus.perWindow, pro: PLAN_AI_LIMITS.pro.perWindow })}
                    </p>
                    {anyOnSale ? (
                        <p className="mx-auto mt-3 max-w-2xl px-4 text-center text-[12px] leading-relaxed text-zinc-500 dark:text-zinc-400">
                            {tx(C.taxNote)}{" "}
                            <Link href="/refund-policy" className="font-semibold text-zinc-800 underline underline-offset-2 dark:text-zinc-200">{tx(C.refundPolicy)}</Link>
                            {" · "}
                            <Link href="/terms-of-use" className="font-semibold text-zinc-800 underline underline-offset-2 dark:text-zinc-200">{tx(C.terms)}</Link>
                        </p>
                    ) : null}
                </section>
                <UsagePanel billing={billing} />
                <PlanComparison billing={billing} />
                <PlansFaq billing={billing} />
            </main>
            <SiteFooter />
            {change && subscription?.plan && subscription.interval ? (
                <ChangePlanDialog
                    from={{ name: tx(PLAN_COPY[subscription.plan].name), interval: subscription.interval }}
                    to={{ name: tx(PLAN_COPY[change.plan].name), interval: change.interval }}
                    preview={change.preview}
                    error={change.error}
                    busy={busy === "change"}
                    endsAt={subscription.endsAt}
                    onConfirm={() => void billing.confirmChange()}
                    onClose={() => billing.setChange(null)}
                />
            ) : null}
        </div>
    );
}
