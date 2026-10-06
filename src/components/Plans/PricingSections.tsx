"use client";

import { Bell, BellRing, Check, ChevronDown, Clock, CreditCard, Crown, LoaderCircle, Minus, PartyPopper, RefreshCw, ShieldCheck, Ticket, Zap } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef } from "react";
import GridBackdrop from "@/components/GridBackdrop";
import PlanBadgeSetting from "@/components/Plans/PlanBadgeSetting";
import UsageList from "@/components/Plans/UsageList";
import type { Copy } from "@/lib/i18n";
import { formatMoney } from "@/lib/paddle";
import {
    PLAN_AI_CONNECTIONS,
    PLAN_AI_FEATURES,
    PLAN_AI_LIMITS,
    PLAN_COLLAB_LIMITS,
    PLAN_COPY,
    PLAN_GROUP_LIMITS,
    PLAN_IDS,
    PLAN_PROJECT_LIMITS,
    couponAmount,
    discountedPrice,
    normalizeCouponCode,
    type PaidPlanId,
    type PlanId,
} from "@/lib/plans";
import { C, PLAN_RANK, couponPayments } from "./plans-copy";
import type { PlansBilling } from "./usePlansBilling";

/** The Pricing page's parts; the state and the actions come from usePlansBilling. */

const P = {
    yourUsage: { TR: "Kullanımın", EN: "Your usage" },
    compare: { TR: "Planları karşılaştır", EN: "Compare the plans" },
    feature: { TR: "Özellik", EN: "Feature" },
    unlimited: { TR: "Sınırsız", EN: "Unlimited" },
    aiMessages: { TR: "Hanogt AI mesajı", EN: "Hanogt AI messages" },
    aiWindow: { TR: "{count} / {days} gün", EN: "{count} / {days} days" },
    aiMinute: { TR: "Dakikada mesaj", EN: "Messages a minute" },
    answerLength: { TR: "En uzun yanıt", EN: "Longest answer" },
    tokens: { TR: "{count} token", EN: "{count} tokens" },
    fileContext: { TR: "Okunan dosya", EN: "File read" },
    chars: { TR: "{count} karakter", EN: "{count} characters" },
    ownKeys: { TR: "Kendi API anahtarınla bağlantı", EN: "Own API key connections" },
    apiKeys: { TR: "Geliştirici API anahtarı", EN: "Developer API keys" },
    codeProjects: { TR: "Kod projesi", EN: "Code projects" },
    gameProjects: { TR: "Oyun projesi", EN: "Game projects" },
    groups: { TR: "Hanogt Social grubu", EN: "Hanogt Social groups" },
    team: { TR: "Ekiple düzenleme", EN: "Team editing" },
    people: { TR: "{count} kişi", EN: "{count} people" },
    support: { TR: "Destekte öncelik", EN: "Support priority" },
    supportNormal: { TR: "Normal", EN: "Normal" },
    supportHigh: { TR: "Yüksek", EN: "High" },
    supportTop: { TR: "En yüksek", EN: "Top" },
    badge: { TR: "Profil rozeti", EN: "Profile badge" },
    early: { TR: "Yeni özelliklere erken erişim", EN: "Early access to new features" },
} satisfies Record<string, Copy>;

const CURRENT_CLASS = "flex h-11 items-center justify-center rounded-xl border border-brand-green/40 bg-brand-green/10 text-[14px] font-bold text-brand-green";
const QUIET_BUTTON = "inline-flex items-center justify-center gap-1.5 rounded-xl border border-zinc-200 px-3.5 py-2 text-[13px] font-bold transition hover:bg-zinc-50 disabled:opacity-60 dark:border-white/10 dark:hover:bg-white/5";

function primaryButton(highlight: boolean) {
    return `flex h-11 w-full items-center justify-center gap-2 rounded-xl text-[14px] font-bold transition disabled:opacity-60 ${highlight ? "bg-brand-green text-white hover:brightness-110" : "bg-zinc-900 text-white hover:bg-zinc-700 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"}`;
}

// ---------------------------------------------------------------- hero

export function PricingHero({ billing }: { billing: PlansBilling }) {
    const { tx, checkout, anyOnSale, liveSubscription, failed } = billing;
    return (
        <section className="relative isolate">
            <GridBackdrop fade="bottom" />
            <div className="mx-auto max-w-4xl px-4 pb-8 pt-28 text-center sm:px-6">
                {anyOnSale ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-brand-green/30 px-3 py-1 text-[12px] font-black uppercase tracking-wider text-brand-green">
                        <ShieldCheck className="h-3.5 w-3.5" aria-hidden />{tx(C.badgeOpen)}
                    </span>
                ) : (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 px-3 py-1 text-[12px] font-black uppercase tracking-wider text-amber-700 dark:text-amber-300">
                        <Clock className="h-3.5 w-3.5" aria-hidden />{tx(C.badge)}
                    </span>
                )}
                {checkout && anyOnSale && (checkout.testMode || checkout.environment === "sandbox") ? (
                    <div className="mx-auto mt-4 flex max-w-xl flex-col gap-1 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-[12.5px] font-semibold text-amber-800 dark:text-amber-200" role="note">
                        {checkout.testMode ? <p>{tx(C.testMode)}</p> : null}
                        {checkout.environment === "sandbox" ? <p>{tx(C.sandbox)}</p> : null}
                    </div>
                ) : null}
                <h1 className="mt-5 text-4xl font-black tracking-tight sm:text-5xl"><span className="text-gradient animate-gradient">{tx(C.title)}</span></h1>
                <p className="mx-auto mt-4 max-w-2xl text-[16.5px] leading-relaxed text-zinc-600 dark:text-zinc-400">{tx(anyOnSale ? C.subtitleOpen : liveSubscription ? C.subtitleSubscriber : C.subtitle)}</p>
                <BillingToggle billing={billing} />
                {failed ? <p className="mx-auto mt-5 max-w-xl text-[13px] text-zinc-500">{tx(C.unavailable)}</p> : null}
            </div>
        </section>
    );
}

function BillingToggle({ billing }: { billing: PlansBilling }) {
    const { tx, showPeriodToggle, period, setPeriod, savings } = billing;
    if (!showPeriodToggle) return null;
    return (
        <div className="mt-7 flex justify-center">
            <div role="radiogroup" aria-label={`${tx(C.monthly)} / ${tx(C.yearly)}`} className="inline-flex rounded-2xl border border-zinc-200 bg-zinc-50 p-1 dark:border-white/10 dark:bg-white/[0.04]">
                {(["month", "year"] as const).map((value) => (
                    <button
                        key={value}
                        type="button"
                        role="radio"
                        aria-checked={period === value}
                        onClick={() => setPeriod(value)}
                        className={`flex items-center gap-2 rounded-xl px-4 py-2 text-[14px] font-bold transition ${period === value ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-800 dark:text-white" : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"}`}
                    >
                        {tx(value === "month" ? C.monthly : C.yearly)}
                        {value === "year" && savings > 0 ? <span className="rounded-full bg-brand-green/15 px-2 py-0.5 text-[11px] font-black text-brand-green">{tx(C.save, { percent: savings })}</span> : null}
                    </button>
                ))}
            </div>
        </div>
    );
}

// ---------------------------------------------------------------- the account bar

export function AccountBar({ billing }: { billing: PlansBilling }) {
    const { tx, me, billing: subscription, activating, notice, busy, liveSubscription, resumeOpen, setResumeOpen, date } = billing;
    if (!me) return null;
    const source = () => {
        if (me.plan === "free") return null;
        if (me.source === "paddle" && subscription) return <span className="font-medium text-zinc-500 dark:text-zinc-400"> · {tx(subscription.interval === "year" ? C.paidYearly : subscription.interval === "month" ? C.paidMonthly : C.paidOther)}</span>;
        return <span className="font-medium text-zinc-500 dark:text-zinc-400"> · {tx(C.assigned)}{me.expiresAt ? ` · ${tx(C.until, { date: date(me.expiresAt) })}` : ""}</span>;
    };
    const alert = "flex flex-col gap-1.5 rounded-xl px-3 py-2 text-[13px] sm:flex-row sm:items-center sm:justify-between";
    return (
        <section aria-label={tx(C.yourPlan, { plan: tx(PLAN_COPY[me.plan].name) })} className="mx-auto mb-6 max-w-6xl px-4 sm:px-6">
            <div className="space-y-2.5 rounded-2xl border border-zinc-200 px-4 py-3 dark:border-white/10">
                <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                    <p className="text-[14px] font-bold">
                        {tx(C.yourPlan, { plan: tx(PLAN_COPY[me.plan].name) })}{source()}
                        {subscription?.renewsAt && !subscription.pastDue ? <span className="ms-2 text-[12.5px] font-medium text-zinc-500">{tx(C.renews, { date: date(subscription.renewsAt) })}</span> : null}
                    </p>
                    {me.canManageBilling ? (
                        <button type="button" onClick={() => void billing.openPortal("overview")} disabled={busy !== null} className={QUIET_BUTTON} title={tx(C.manageHint)}>
                            {busy === "portal" ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <CreditCard className="h-3.5 w-3.5" aria-hidden />}{tx(C.manage)}
                        </button>
                    ) : null}
                </div>
                {me.blocked ? <p className="text-[13px] text-rose-600 dark:text-rose-400">{tx(C.blocked)}</p> : null}
                {activating ? <p className="flex items-center gap-2 text-[13px] font-semibold text-brand-green" role="status"><LoaderCircle className="h-4 w-4 animate-spin" aria-hidden />{tx(C.activating)}</p> : null}
                {me.checkoutPending && !liveSubscription && !activating && notice?.action !== "checkPayment" ? (
                    <p className="flex flex-wrap items-center gap-x-2 text-[12.5px] text-zinc-500 dark:text-zinc-400" data-checkout-pending>
                        {tx(C.checkPaymentHint)}
                        <button type="button" onClick={() => void billing.checkPayment()} disabled={busy !== null} className="inline-flex items-center gap-1 font-bold text-zinc-900 underline-offset-2 hover:underline disabled:opacity-60 dark:text-white">
                            {busy === "sync" ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <RefreshCw className="h-3.5 w-3.5" aria-hidden />}{tx(C.checkPayment)}
                        </button>
                    </p>
                ) : null}
                {subscription?.endsAt ? (
                    <div className={`${alert} bg-amber-500/10 text-amber-800 dark:text-amber-200`}>
                        <p>{tx(C.endsAt, { date: date(subscription.endsAt) })}</p>
                        <button type="button" onClick={() => void billing.keepSubscription()} disabled={busy !== null} className="shrink-0 text-start font-bold underline underline-offset-2 disabled:opacity-60">
                            {busy === "keep" ? <LoaderCircle className="me-1 inline h-3.5 w-3.5 animate-spin" aria-hidden /> : null}{tx(C.keep)}
                        </button>
                    </div>
                ) : null}
                {subscription?.pastDue ? (
                    <div className={`${alert} bg-rose-500/10 text-rose-700 dark:text-rose-300`}>
                        <p>{tx(C.pastDue)}</p>
                        <button type="button" onClick={() => void billing.openPortal("updatePayment")} disabled={busy !== null} className="shrink-0 text-start font-bold underline underline-offset-2 disabled:opacity-60">{tx(C.updatePayment)}</button>
                    </div>
                ) : null}
                {subscription?.paused ? (
                    <div className={`${alert} bg-zinc-500/10 text-zinc-700 sm:flex-col sm:items-start dark:text-zinc-300`} data-paused>
                        <p>{tx(C.paused)}</p>
                        {resumeOpen ? (
                            <>
                                <p className="text-[12.5px]">{subscription.periodEndsAt ? tx(C.resumeFree, { date: date(subscription.periodEndsAt) }) : tx(C.resumeCharge, { plan: tx(PLAN_COPY[subscription.plan ?? "plus"].name) })}</p>
                                <div className="flex flex-wrap items-center gap-3">
                                    <button type="button" onClick={() => void billing.resumeSubscription()} disabled={busy !== null} className="inline-flex items-center gap-1.5 font-bold underline underline-offset-2 disabled:opacity-60" data-resume-confirm>
                                        {busy === "resume" ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}{tx(C.resumeConfirm)}
                                    </button>
                                    <button type="button" onClick={() => setResumeOpen(false)} disabled={busy !== null} className="font-semibold opacity-80 hover:opacity-100 disabled:opacity-50">{tx(C.resumeCancel)}</button>
                                </div>
                            </>
                        ) : (
                            <button type="button" onClick={() => setResumeOpen(true)} disabled={busy !== null} className="font-bold underline underline-offset-2 disabled:opacity-60" data-resume>{tx(C.resume)}</button>
                        )}
                    </div>
                ) : null}
                {subscription?.canceled && me.source !== "paddle" ? <p className="text-[12.5px] text-zinc-500">{tx(C.ended)}</p> : null}
                {me.badge?.plan ? (
                    <PlanBadgeSetting
                        state={me.badge}
                        onChange={(badge) => billing.setData((current) => (current?.me ? { ...current, me: { ...current.me, badge } } : current))}
                        className="border-t border-zinc-100 pt-2.5 dark:border-white/[0.06]"
                    />
                ) : null}
            </div>
        </section>
    );
}

// ---------------------------------------------------------------- coupon and notice

export function CouponBox({ billing }: { billing: PlansBilling }) {
    const { tx, anyOnSale, me, liveSubscription, coupon, couponOpen, couponInput, couponError, busy, linkCoupon, signInHref } = billing;
    if (!anyOnSale) return null;
    return (
        <div className="mx-auto mb-5 flex max-w-2xl flex-col items-center gap-2 px-4" data-coupon>
            {!me ? (
                <Link href={signInHref} className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-zinc-700 underline-offset-2 hover:underline dark:text-zinc-300">
                    <Ticket className="h-4 w-4" aria-hidden />{normalizeCouponCode(linkCoupon) ? tx(C.couponSignInCode, { code: normalizeCouponCode(linkCoupon) }) : tx(C.couponSignIn)}
                </Link>
            ) : liveSubscription ? (
                <p className="inline-flex items-center gap-1.5 text-center text-[12.5px] text-zinc-500 dark:text-zinc-400" data-coupon-subscribed>
                    <Ticket className="h-4 w-4 shrink-0" aria-hidden />{tx(C.couponSubscribed)}
                </p>
            ) : coupon ? (
                <p className="flex flex-wrap items-center justify-center gap-2 rounded-2xl bg-brand-green/10 px-4 py-2 text-center text-[13.5px] font-semibold text-brand-green" data-coupon-applied>
                    <Ticket className="h-4 w-4 shrink-0" aria-hidden />
                    <span>{tx(C.couponApplied, { code: coupon.code, percent: coupon.percentOff, plans: coupon.plan === "any" ? tx(C.couponAllPlans) : tx(PLAN_COPY[coupon.plan].name), payments: tx(couponPayments(coupon.recur).copy, couponPayments(coupon.recur).vars) })}</span>
                    <button type="button" onClick={() => billing.setCoupon(null)} disabled={busy !== null} className="font-bold underline underline-offset-2 hover:no-underline">{tx(C.couponRemove)}</button>
                </p>
            ) : couponOpen ? (
                <form onSubmit={billing.submitCoupon} className="flex w-full max-w-sm gap-2">
                    <input
                        value={couponInput}
                        onChange={(event) => {
                            billing.setCouponInput(event.target.value.toUpperCase());
                            billing.setCouponError(null);
                        }}
                        maxLength={24}
                        placeholder="HANOGT20"
                        aria-label={tx(C.couponLabel)}
                        autoComplete="off"
                        spellCheck={false}
                        autoFocus
                        className="h-10 min-w-0 flex-1 rounded-xl border border-zinc-200 bg-white px-3 font-mono text-[14px] font-bold uppercase tracking-wide outline-none transition focus:border-brand-green dark:border-white/10 dark:bg-zinc-900"
                    />
                    <button type="submit" disabled={busy !== null || !couponInput.trim()} className={QUIET_BUTTON}>
                        {busy === "coupon" ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Ticket className="h-3.5 w-3.5" aria-hidden />}{tx(C.couponApply)}
                    </button>
                </form>
            ) : (
                <button type="button" onClick={() => billing.setCouponOpen(true)} className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-zinc-700 underline-offset-2 hover:underline dark:text-zinc-300">
                    <Ticket className="h-4 w-4" aria-hidden />{tx(C.couponQuestion)}
                </button>
            )}
            {couponError ? <p role="alert" className="text-center text-[12.5px] font-semibold text-rose-600 dark:text-rose-300">{tx(couponError)}</p> : null}
        </div>
    );
}

export function NoticeBanner({ billing }: { billing: PlansBilling }) {
    const { tx, notice, noticeRef, busy } = billing;
    if (!notice) return null;
    const tone = notice.tone === "error" ? "bg-rose-500/10 text-rose-700 dark:text-rose-300" : notice.tone === "success" ? "bg-brand-green/10 text-brand-green" : "bg-sky-500/10 text-sky-800 dark:text-sky-300";
    return (
        <div ref={noticeRef} role={notice.tone === "error" ? "alert" : "status"} className={`mx-auto mb-5 max-w-2xl scroll-mt-24 rounded-2xl px-4 py-3 text-center text-[13.5px] font-semibold ${tone}`}>
            <p className="flex items-center justify-center gap-2">
                {notice.tone === "success" ? <PartyPopper className="h-4 w-4 shrink-0" aria-hidden /> : null}{tx(notice.copy, notice.vars)}
            </p>
            {notice.hint ? <p className="mt-2 text-[12.5px] font-medium opacity-90">{tx(notice.hint)}</p> : null}
            {notice.technical ? <p className="mt-2 break-all font-mono text-[11.5px] font-medium opacity-80">{tx(C.technical, notice.technical)}</p> : null}
            {notice.reference ? <p className="mt-1.5 break-all font-mono text-[11.5px] font-medium opacity-75" data-error-reference>{tx(C.reference, { ref: notice.reference })}</p> : null}
            {notice.action ? (
                <button type="button" onClick={() => billing.noticeAction(notice.action)} disabled={busy !== null} className="mt-2 inline-flex items-center gap-1.5 font-bold underline underline-offset-2 disabled:opacity-60" data-check-payment={notice.action === "checkPayment" ? "" : undefined} data-notice-action={notice.action}>
                    {busy === "sync" || (busy === "portal" && notice.action === "updatePayment") ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <RefreshCw className="h-3.5 w-3.5" aria-hidden />}
                    {tx(notice.action === "checkPayment" ? C.checkPayment : notice.action === "resume" ? C.resume : notice.action === "updatePayment" ? C.updatePayment : C.reload)}
                </button>
            ) : null}
        </div>
    );
}

// ---------------------------------------------------------------- the plan cards

function PaidButton({ billing, plan, highlight, current }: { billing: PlansBilling; plan: PaidPlanId; highlight: boolean; current: boolean }) {
    const { tx, me, billing: subscription, liveSubscription, busy, change, activating, signInHref } = billing;
    const interval = billing.intervalFor(plan);
    const loading = busy === `checkout:${plan}`;
    if (!me) return <Link href={signInHref} className={primaryButton(highlight)}><CreditCard className="h-4 w-4" aria-hidden />{tx(C.signInToBuy)}</Link>;
    if (me.blocked) return <p className="flex h-11 items-center justify-center rounded-xl border border-zinc-200 text-[14px] font-bold text-zinc-500 dark:border-white/10">{tx(C.unavailableBlocked)}</p>;
    const muted = (text: Copy) => <p className="flex min-h-11 items-center justify-center rounded-xl border border-zinc-200 px-3 text-center text-[13px] font-bold text-zinc-500 dark:border-white/10">{tx(text)}</p>;
    if (liveSubscription && subscription?.plan) {
        // A period other than monthly or yearly (e.g. a quarterly price set up in Paddle): only the portal changes it.
        if (!subscription.interval) return subscription.plan === plan ? <p className={CURRENT_CLASS}>{tx(C.current)}</p> : muted(C.changeInPortal);
        if (subscription.plan === plan && subscription.interval === interval) return <p className={CURRENT_CLASS}>{tx(C.current)}</p>;
        if (subscription.pastDue) return muted(C.payFirst);
        const label = subscription.plan === plan ? (interval === "year" ? C.switchYearly : C.switchMonthly) : PLAN_RANK[plan] > PLAN_RANK[subscription.plan] ? C.upgradePro : C.switchPlus;
        return (
            <button type="button" onClick={() => void billing.openChange(plan)} disabled={busy !== null || change !== null} className={primaryButton(highlight)}>
                {label === C.upgradePro ? <Crown className="h-4 w-4" aria-hidden /> : <Zap className="h-4 w-4" aria-hidden />}{tx(label)}
            </button>
        );
    }
    // A paused subscription is resumed, not bought again (the server refuses a second one anyway).
    if (subscription?.paused) return muted(C.subscriptionPaused);
    // A lasting plan from the team that is higher already: buying this one would change nothing.
    if (me.source === "staff" && !me.expiresAt && PLAN_RANK[me.plan] > PLAN_RANK[plan]) return muted(C.staffPlanHigher);
    if (current) {
        return (
            <>
                <p className={CURRENT_CLASS}>{tx(C.current)}</p>
                <button type="button" onClick={() => void billing.startCheckout(plan)} disabled={busy !== null || activating !== null} className="mt-2 w-full text-center text-[12.5px] font-semibold text-zinc-700 underline-offset-2 hover:underline disabled:opacity-60 dark:text-zinc-300">
                    {loading ? <LoaderCircle className="me-1 inline h-3.5 w-3.5 animate-spin" aria-hidden /> : null}{tx(C.ownSubscription)}
                </button>
            </>
        );
    }
    return (
        <button type="button" onClick={() => void billing.startCheckout(plan)} disabled={busy !== null || activating !== null} className={primaryButton(highlight)}>
            {loading ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden /> : <CreditCard className="h-4 w-4" aria-hidden />}
            {tx(plan === "pro" ? C.buyPro : C.buyPlus)}
        </button>
    );
}

function WaitlistButton({ billing, plan, highlight }: { billing: PlansBilling; plan: PaidPlanId; highlight: boolean }) {
    const { tx, me, busy, signInHref } = billing;
    const waiting = Boolean(me?.waitlist.includes(plan));
    if (!me) return <Link href={signInHref} className={primaryButton(highlight)}><Bell className="h-4 w-4" aria-hidden />{tx(C.signInToNotify)}</Link>;
    return (
        <>
            <button
                type="button"
                onClick={() => void billing.toggleWaitlist(plan)}
                disabled={busy !== null}
                aria-pressed={waiting}
                className={waiting ? "flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-brand-green/40 bg-brand-green/10 text-[14px] font-bold text-brand-green transition disabled:opacity-60" : primaryButton(highlight)}
            >
                {busy === `waitlist:${plan}` ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden /> : waiting ? <BellRing className="h-4 w-4" aria-hidden /> : <Bell className="h-4 w-4" aria-hidden />}
                {tx(waiting ? C.notified : C.notify)}
            </button>
            {waiting ? <p className="mt-1.5 text-center text-[11.5px] text-zinc-500">{tx(C.notifyHint)}</p> : null}
        </>
    );
}

function PlanPrice({ billing, plan }: { billing: PlansBilling; plan: PlanId }) {
    const { tx, locale, period, catalog, checkout, money } = billing;
    const paid = plan === "free" ? null : plan;
    if (!paid) return <p className="flex items-baseline gap-1.5"><span className="text-4xl font-black">{money(0)}</span><span className="text-[13px] text-zinc-500">{tx(C.forever)}</span></p>;
    const selling = billing.onSale(paid).length > 0;
    const interval = billing.intervalFor(paid);
    const live = selling ? checkout?.prices[paid][interval] ?? null : null;
    const coupon = billing.couponFor(paid);
    if (selling) {
        if (!live) return <p className="pt-2 text-[15px] font-bold text-zinc-500 dark:text-zinc-400">{tx(C.priceAtCheckout)}</p>;
        const payments = coupon ? couponPayments(coupon.recur) : null;
        return (
            <>
                <p className="flex flex-wrap items-baseline gap-x-2">
                    {coupon ? (
                        <span className="text-4xl font-black tabular-nums" data-coupon-price>{formatMoney(couponAmount(live.amount, coupon.percentOff), live.currency, locale)}</span>
                    ) : (
                        <span className="text-4xl font-black tabular-nums">{live.total}</span>
                    )}
                    <span className="text-[13px] text-zinc-500">{tx(interval === "year" ? C.perYearShort : C.perMonth)}</span>
                    {coupon ? <span className="text-[15px] text-zinc-400 line-through tabular-nums">{formatMoney(live.amount, live.currency, locale)}</span> : null}
                </p>
                {coupon && payments ? <p className="mt-1 text-[12.5px] font-bold text-brand-green">{tx(C.couponOnCard, { code: coupon.code, payments: tx(payments.copy, payments.vars) })}</p> : null}
                {interval === "year" ? <p className="mt-1 text-[12.5px] text-zinc-500">{tx(C.monthlyEquivalent, { price: formatMoney(Number(coupon ? couponAmount(live.amount, coupon.percentOff) : live.amount) / 12, live.currency, locale) })}</p> : null}
                {interval !== period ? <p className="mt-1 text-[12px] text-zinc-500">{tx(C.onlyInterval, { interval: tx(interval === "year" ? C.yearly : C.monthly).toLocaleLowerCase(locale) })}</p> : null}
            </>
        );
    }
    const price = catalog.plans[paid];
    const monthly = discountedPrice(price.monthly, price.discountPercent);
    const yearly = discountedPrice(price.yearly, price.discountPercent);
    if (monthly === null) return <p className="pt-2 text-[15px] font-bold text-zinc-500 dark:text-zinc-400">{tx(C.priceSoon)}</p>;
    return (
        <>
            <p className="flex flex-wrap items-baseline gap-x-2">
                <span className="text-4xl font-black tabular-nums">{money(monthly)}</span>
                <span className="text-[13px] text-zinc-500">{tx(C.perMonth)}</span>
                {price.discountPercent > 0 && price.monthly !== null ? <span className="text-[14px] text-zinc-400 line-through tabular-nums">{money(price.monthly)}</span> : null}
            </p>
            <p className="mt-1 flex flex-wrap items-center gap-2 text-[12.5px] text-zinc-500">
                {yearly !== null ? <span>{tx(C.perYear, { price: money(yearly) })}</span> : null}
                {price.discountPercent > 0 ? <span className="rounded-full bg-brand-green/15 px-2 py-0.5 font-bold text-brand-green">{tx(C.discount, { percent: price.discountPercent })}</span> : null}
            </p>
        </>
    );
}

/** Three cards on one skeleton: name, price, button, then what's included. Pro is the one highlighted. */
export function PlanCards({ billing }: { billing: PlansBilling }) {
    const { tx, me, liveSubscription, billing: subscription, busy, signedIn, checkout, period } = billing;
    return (
        <div className="mx-auto grid max-w-6xl gap-5 px-4 sm:px-6 md:grid-cols-3 md:items-stretch">
            {PLAN_IDS.map((plan) => {
                const copy = PLAN_COPY[plan];
                const paid = plan === "free" ? null : plan;
                const selling = paid ? billing.onSale(paid).length > 0 : false;
                const live = paid && selling ? checkout?.prices[paid][billing.intervalFor(paid)] ?? null : null;
                const current = me?.plan === plan;
                const highlight = plan === "pro";
                return (
                    <article key={plan} className={`relative flex h-full flex-col rounded-3xl border bg-white p-6 dark:bg-zinc-900 ${highlight ? "border-2 border-brand-green" : "border-zinc-200 dark:border-white/10"}`} data-plan-card={plan} data-period={period}>
                        <div className="flex min-h-7 items-center justify-between gap-3">
                            <h2 className="text-2xl font-black">{tx(copy.name)}</h2>
                            {highlight ? <span className="rounded-full bg-brand-green px-2.5 py-1 text-[11px] font-black uppercase tracking-wide text-white">{tx(C.popular)}</span> : null}
                            {paid && !selling && !highlight ? <span className="rounded-full bg-amber-500/15 px-2.5 py-1 text-[11px] font-black uppercase tracking-wide text-amber-700 dark:text-amber-300">{tx(C.badge)}</span> : null}
                        </div>
                        <p className="mt-1 min-h-[2.75rem] text-[14px] leading-snug text-zinc-500 dark:text-zinc-400">{tx(copy.tagline)}</p>
                        <div className="mt-4 min-h-[5.25rem]">
                            <PlanPrice billing={billing} plan={plan} />
                            {live?.trialDays ? <p className="mt-1 text-[12px] font-bold text-brand-green">{tx(C.trial, { days: live.trialDays })}</p> : null}
                        </div>
                        <div className="mt-4">
                            {plan === "free" ? (
                                current ? (
                                    <p className="flex h-11 items-center justify-center rounded-xl border border-zinc-200 text-[14px] font-bold text-zinc-500 dark:border-white/10">{tx(C.current)}</p>
                                ) : liveSubscription && !subscription?.endsAt ? (
                                    <button type="button" onClick={() => void billing.openPortal("cancel")} disabled={busy !== null} className="flex min-h-11 w-full items-center justify-center rounded-xl border border-zinc-200 px-3 text-center text-[13px] font-bold text-zinc-600 transition hover:bg-zinc-50 disabled:opacity-60 dark:border-white/10 dark:text-zinc-300 dark:hover:bg-white/5">{tx(C.cancelSubscription)}</button>
                                ) : (
                                    <Link href={signedIn ? "/dashboard" : "/signup"} className="flex h-11 items-center justify-center rounded-xl border border-zinc-300 text-[14px] font-bold transition hover:border-zinc-500 dark:border-white/15 dark:hover:border-white/40">{tx(C.startFree)}</Link>
                                )
                            ) : selling ? (
                                <PaidButton billing={billing} plan={plan} highlight={highlight} current={current} />
                            ) : current ? (
                                <p className={CURRENT_CLASS}>{tx(C.current)}</p>
                            ) : (
                                <WaitlistButton billing={billing} plan={plan} highlight={highlight} />
                            )}
                        </div>
                        <ul className="mt-6 flex-1 space-y-2.5 border-t border-zinc-100 pt-5 text-[14px] dark:border-white/[0.06]">
                            {copy.features.map((feature) => (
                                <li key={feature.text.EN} className="flex items-start gap-2.5">
                                    <Check className={`mt-0.5 h-4 w-4 shrink-0 ${feature.planned ? "text-zinc-400" : "text-brand-green"}`} strokeWidth={3} aria-hidden />
                                    <span className="leading-snug text-zinc-700 dark:text-zinc-300">
                                        {tx(feature.text)}
                                        {feature.planned ? <span className="ms-1.5 rounded bg-zinc-100 px-1.5 py-0.5 text-[10.5px] font-bold uppercase text-zinc-500 dark:bg-white/10 dark:text-zinc-400">{tx(C.planned)}</span> : null}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    </article>
                );
            })}
        </div>
    );
}

// ---------------------------------------------------------------- usage, comparison and questions

export function UsagePanel({ billing }: { billing: PlansBilling }) {
    const { tx, me } = billing;
    const panel = useRef<HTMLDetailsElement>(null);
    const ready = Boolean(me);

    // Linked as /plans#usage (the usage meter, AI and account settings): opened and scrolled to
    // once the account has loaded, and again when the link is followed on this page.
    useEffect(() => {
        if (!ready) return;
        const reveal = () => {
            if (window.location.hash !== "#usage" || !panel.current) return;
            panel.current.open = true;
            panel.current.scrollIntoView({ block: "start" });
        };
        reveal();
        window.addEventListener("hashchange", reveal);
        return () => window.removeEventListener("hashchange", reveal);
    }, [ready]);

    if (!me) return null;
    return (
        <details ref={panel} id="usage" className="group mx-auto mt-6 max-w-6xl scroll-mt-24 px-4 sm:px-6" data-usage-panel>
            <summary className="flex cursor-pointer list-none items-center justify-between rounded-2xl border border-zinc-200 px-4 py-3 text-[14px] font-bold marker:hidden dark:border-white/10">
                {tx(P.yourUsage)}
                <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" aria-hidden />
            </summary>
            <div className="mt-2 rounded-2xl border border-zinc-200 px-4 py-4 dark:border-white/10">
                {me.usage ? <UsageList usage={me.usage} /> : (
                    <p className="text-[13px] text-zinc-600 dark:text-zinc-400">{tx(C.aiWindow, { used: me.aiUsed, limit: me.aiLimits.perWindow, days: me.aiLimits.windowDays })}</p>
                )}
            </div>
        </details>
    );
}

type Cell = string | boolean;

export function PlanComparison({ billing }: { billing: PlansBilling }) {
    const { tx, locale } = billing;
    const number = (value: number) => new Intl.NumberFormat(locale).format(value);
    const limit = (value: number | null) => (value === null ? tx(P.unlimited) : number(value));
    const rows: Array<{ label: Copy; values: Record<PlanId, Cell> }> = [
        { label: P.aiMessages, values: Object.fromEntries(PLAN_IDS.map((plan) => [plan, tx(P.aiWindow, { count: number(PLAN_AI_LIMITS[plan].perWindow), days: PLAN_AI_LIMITS[plan].windowDays })])) as Record<PlanId, Cell> },
        { label: P.aiMinute, values: Object.fromEntries(PLAN_IDS.map((plan) => [plan, number(PLAN_AI_LIMITS[plan].perMinute)])) as Record<PlanId, Cell> },
        { label: P.answerLength, values: Object.fromEntries(PLAN_IDS.map((plan) => [plan, tx(P.tokens, { count: number(PLAN_AI_FEATURES[plan].maxTokens) })])) as Record<PlanId, Cell> },
        { label: P.fileContext, values: Object.fromEntries(PLAN_IDS.map((plan) => [plan, tx(P.chars, { count: number(PLAN_AI_FEATURES[plan].contextChars) })])) as Record<PlanId, Cell> },
        { label: P.ownKeys, values: Object.fromEntries(PLAN_IDS.map((plan) => [plan, PLAN_AI_CONNECTIONS[plan] ? number(PLAN_AI_CONNECTIONS[plan]) : false])) as Record<PlanId, Cell> },
        { label: P.apiKeys, values: Object.fromEntries(PLAN_IDS.map((plan) => [plan, PLAN_AI_FEATURES[plan].api ? number(PLAN_AI_FEATURES[plan].api!.keys) : false])) as Record<PlanId, Cell> },
        { label: P.codeProjects, values: Object.fromEntries(PLAN_IDS.map((plan) => [plan, limit(PLAN_PROJECT_LIMITS[plan].code)])) as Record<PlanId, Cell> },
        { label: P.gameProjects, values: Object.fromEntries(PLAN_IDS.map((plan) => [plan, limit(PLAN_PROJECT_LIMITS[plan].game)])) as Record<PlanId, Cell> },
        { label: P.groups, values: Object.fromEntries(PLAN_IDS.map((plan) => [plan, limit(PLAN_GROUP_LIMITS[plan])])) as Record<PlanId, Cell> },
        { label: P.team, values: Object.fromEntries(PLAN_IDS.map((plan) => [plan, tx(P.people, { count: number(PLAN_COLLAB_LIMITS[plan].people) })])) as Record<PlanId, Cell> },
        { label: P.support, values: { free: tx(P.supportNormal), plus: tx(P.supportHigh), pro: tx(P.supportTop) } },
        { label: P.badge, values: { free: false, plus: true, pro: true } },
        { label: P.early, values: { free: false, plus: false, pro: true } },
    ];
    const cell = (value: Cell) => (value === true ? <Check className="mx-auto h-4.5 w-4.5 text-brand-green" strokeWidth={3} aria-label="✓" /> : value === false ? <Minus className="mx-auto h-4 w-4 text-zinc-400" aria-label="—" /> : value);
    return (
        <section aria-labelledby="plans-compare" className="mx-auto mt-16 max-w-6xl px-4 sm:px-6">
            <h2 id="plans-compare" className="text-center text-3xl font-black tracking-tight">{tx(P.compare)}</h2>
            <div className="mt-8 overflow-x-auto rounded-2xl border border-zinc-200 dark:border-white/10">
                <table className="w-full min-w-[34rem] border-collapse text-[14px]">
                    <thead>
                        <tr className="border-b border-zinc-200 bg-zinc-50 dark:border-white/10 dark:bg-white/[0.03]">
                            <th scope="col" className="sticky start-0 bg-zinc-50 px-4 py-3 text-start font-bold text-zinc-500 dark:bg-zinc-900">{tx(P.feature)}</th>
                            {PLAN_IDS.map((plan) => <th key={plan} scope="col" className={`px-4 py-3 text-center font-black ${plan === "pro" ? "text-brand-green" : ""}`}>{tx(PLAN_COPY[plan].name)}</th>)}
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((row) => (
                            <tr key={row.label.EN} className="border-b border-zinc-100 last:border-b-0 dark:border-white/[0.06]">
                                <th scope="row" className="sticky start-0 bg-white px-4 py-3 text-start font-semibold text-zinc-700 dark:bg-zinc-950 dark:text-zinc-300">{tx(row.label)}</th>
                                {PLAN_IDS.map((plan) => <td key={plan} className="px-4 py-3 text-center tabular-nums text-zinc-700 dark:text-zinc-300">{cell(row.values[plan])}</td>)}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </section>
    );
}

export function PlansFaq({ billing }: { billing: PlansBilling }) {
    const { tx, faq } = billing;
    return (
        <section aria-labelledby="plans-faq" className="mx-auto mt-16 max-w-3xl px-4 pb-24 sm:px-6">
            <h2 id="plans-faq" className="text-center text-3xl font-black tracking-tight">{tx(C.faqTitle)}</h2>
            <div className="mt-8 divide-y divide-zinc-200 border-y border-zinc-200 dark:divide-white/10 dark:border-white/10">
                {faq.map(([question, answer]) => (
                    <details key={question.EN} className="group py-1">
                        <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-4 text-[15.5px] font-bold marker:hidden">
                            {tx(question)}
                            <ChevronDown className="h-5 w-5 shrink-0 text-zinc-400 transition-transform group-open:rotate-180" aria-hidden />
                        </summary>
                        <p className="pb-4 text-[14.5px] leading-relaxed text-zinc-600 dark:text-zinc-400">
                            {tx(answer)}
                            {answer === C.ba3 ? <> <Link href="/refund-policy" className="font-semibold text-zinc-900 underline underline-offset-2 dark:text-white">{tx(C.refundPolicy)}</Link></> : null}
                        </p>
                    </details>
                ))}
            </div>
        </section>
    );
}
