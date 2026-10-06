"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import { PaddleLoadError, checkoutEventError, closeCheckout, failureMessage, getPaddle, onPaddleEvent, openCheckout } from "@/components/Plans/paddle-js";
import { useRawSession } from "@/components/Provider";
import { useI18n, type Copy } from "@/lib/i18n";
import { announcePlanChange } from "@/lib/plan-signal";
import { checkoutLocale, yearlySavingsPercent, type BillingInterval, type PlanChangePreview } from "@/lib/paddle";
import {
    DEFAULT_PLAN_CATALOG,
    PLAN_COPY,
    type CouponView,
    type PaidPlanId,
    type PaddleSyncResponse,
    type PlanId,
    type PlansResponse,
} from "@/lib/plans";
import {
    COUPON_ERRORS,
    EVENT_STAGES,
    PORTAL_VISIT_KEY,
    RETRY_DELAY_MS,
    SYNC_DELAYS_MS,
    SYNC_WINDOW_MS,
    failureNotice,
    fetchPlans,
    postClientError,
    postJson,
    retryable,
    type ClientErrorReport,
    type Notice,
    type RequestFailure,
    type RequestResult,
} from "./billing-requests";
import { C, loginHref } from "./plans-copy";

/** The code of a /plans?coupon=CODE link (from a campaign); "" without one. Read on the client only. */
const readLinkCoupon = () => (new URLSearchParams(window.location.search).get("coupon") ?? "").trim().slice(0, 40);
const noSubscription = () => () => undefined;

/**
 * Everything the Pricing page knows and does about billing: the plans and
 * the person's subscription (GET /api/plans), Paddle checkout and its
 * events, following a payment until the plan is active, the customer
 * portal, plan changes, pausing and resuming, coupons and the waitlist.
 * The page's components (this folder) only draw it.
 */
export function usePlansBilling() {
    const { tx, locale, language } = useI18n();
    const auth = useRawSession();
    const signedIn = auth.status === "authenticated";
    const [data, setData] = useState<PlansResponse | null>(null);
    const [failed, setFailed] = useState(false);
    const [busy, setBusy] = useState<string | null>(null);
    const [notice, setNotice] = useState<Notice>(null);
    const noticeRef = useRef<HTMLDivElement>(null);
    const [period, setPeriod] = useState<BillingInterval>("month");
    const [change, setChange] = useState<{ plan: PaidPlanId; interval: BillingInterval; preview: PlanChangePreview | null; error: string } | null>(null);
    const [activating, setActivating] = useState<PaidPlanId | null>(null);
    const [reload, setReload] = useState(0);
    // A coupon the server accepted; the checkout of a plan it covers carries it.
    const [coupon, setCoupon] = useState<CouponView | null>(null);
    const [couponOpen, setCouponOpen] = useState(false);
    const [couponInput, setCouponInput] = useState("");
    const [couponError, setCouponError] = useState<Copy | null>(null);
    const couponFromLink = useRef(false);
    const linkCoupon = useSyncExternalStore(noSubscription, readLinkCoupon, () => "");
    const signInHref = loginHref(linkCoupon);
    const purchased = useRef<PaidPlanId | null>(null);
    // The person picked Monthly or Yearly themselves; until then a subscriber sees their own billing period.
    const periodTouched = useRef(false);
    const [resumeOpen, setResumeOpen] = useState(false);

    useEffect(() => {
        if (auth.status === "loading") return;
        let active = true;
        void fetchPlans().then((payload) => {
            if (!active) return;
            setData(payload);
            setFailed(!payload);
            const own = payload?.me?.billing;
            if (own?.entitled && own.interval && !periodTouched.current) setPeriod(own.interval);
        });
        return () => {
            active = false;
        };
    }, [auth.status, reload]);

    const catalog = data?.catalog ?? DEFAULT_PLAN_CATALOG;
    const checkout = data?.checkout ?? null;
    const me = data?.me ?? null;
    const billing = me?.billing ?? null;
    // The server decides (the grace after a period end included), so the page never offers changes Paddle would refuse.
    const liveSubscription = Boolean(billing?.plan && billing.entitled);
    // What the Paddle event handlers read: they're registered once.
    const pageState = useRef({ signedIn, liveSubscription });
    useEffect(() => {
        pageState.current = { signedIn, liveSubscription };
    }, [signedIn, liveSubscription]);
    const onSale = (plan: PaidPlanId) => checkout?.onSale[plan] ?? [];
    const anyOnSale = onSale("plus").length > 0 || onSale("pro").length > 0;

    // The team and testers (and anyone in the sandbox, where nothing is charged) also see why Paddle failed.
    const diagnostics = Boolean(checkout && (checkout.testMode || checkout.environment === "sandbox" || me?.isStaff));
    const reported = useRef(new Set<string>());

    /** Tells the team about a failure, once per page view and kind (the route keeps no names). */
    const report = useCallback((entry: ClientErrorReport) => {
        if (!signedIn) return;
        const key = `${entry.stage}:${entry.code ?? ""}`;
        if (reported.current.has(key)) return;
        reported.current.add(key);
        postClientError(entry);
    }, [signedIn]);

    /** A failure of getPaddle or openCheckout, in words for its stage. */
    const showPaddleFailure = useCallback((error: unknown) => {
        const failure = error instanceof PaddleLoadError ? error : new PaddleLoadError("init", failureMessage(error));
        const starting = failure.stage === "missing" || failure.stage === "init";
        setNotice({
            tone: "error",
            copy: failure.stage === "blocked" ? (failure.blockedUrl ? C.paddleBlockedUrl : C.paddleBlocked) : starting ? C.paddleStart : C.paddleOpen,
            vars: failure.blockedUrl ? { url: failure.blockedUrl } : undefined,
            hint: diagnostics && starting ? C.paddleStartTeam : undefined,
            technical: diagnostics ? { stage: failure.stage, message: failure.message } : undefined,
        });
        report({ stage: failure.stage, message: failure.message, blockedUrl: failure.blockedUrl });
    }, [diagnostics, report]);

    /** Shows why a billing request failed; when our code never answered, the team hears about it from here. */
    const showRequestFailure = useCallback((route: string, result: RequestFailure) => {
        setNotice(failureNotice(result, diagnostics));
        if (result.json) return; // The route logged and kept it itself.
        const code = result.error === "network" ? "network" : result.status ? `http_${result.status}` : "timeout";
        report({ stage: "request", code, message: `POST /api/paddle/${route}: ${result.status ? `HTTP ${result.status}` : result.error}, ${(result.ms / 1000).toFixed(1)} s` });
    }, [diagnostics, report]);

    /** A request that may simply be tried again (opening a checkout or the portal): once, after a short pause. */
    const postWithRetry = async <T,>(url: string, body: unknown): Promise<RequestResult<T>> => {
        const first = await postJson<T>(url, body);
        if (first.ok || !retryable(first)) return first;
        setNotice({ tone: "info", copy: C.retrying });
        await new Promise((resolve) => window.setTimeout(resolve, RETRY_DELAY_MS));
        const second = await postJson<T>(url, body);
        if (second.ok) setNotice(null);
        return second;
    };

    // Paddle sends payment links (the default payment link, /plans?_ptxn=…); Paddle.js opens them itself.
    // Customers get Paddle.js right away too, so Paddle Retain can reach them (pwCustomer).
    const customerId = me?.paddleCustomerId ?? null;
    useEffect(() => {
        if (!checkout) return;
        const paymentLink = new URLSearchParams(window.location.search).has("_ptxn");
        if (!paymentLink && !customerId) return;
        getPaddle(checkout, { customerId, debug: checkout.testMode }).catch((error: unknown) => {
            // Loaded only for Paddle Retain it fails quietly; a payment link someone opened doesn't.
            if (paymentLink) showPaddleFailure(error);
        });
    }, [checkout, customerId, showPaddleFailure]);

    useEffect(() => {
        /** A payment link (?_ptxn=…) is done with: a refresh mustn't open the same transaction again. */
        const forgetPaymentLink = () => {
            const url = new URL(window.location.href);
            if (!url.searchParams.has("_ptxn")) return;
            url.searchParams.delete("_ptxn");
            window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
        };
        onPaddleEvent((event) => {
            if (event.name === "checkout.closed") {
                forgetPaymentLink();
                return;
            }
            if (event.name === "checkout.completed") {
                forgetPaymentLink();
                const { signedIn: isSignedIn, liveSubscription: subscribed } = pageState.current;
                // A payment link paid without signing in: there's no account here to follow up.
                if (!isSignedIn) {
                    setNotice({ tone: "success", copy: C.paymentLinkSignedOut });
                    return;
                }
                // A payment link for a subscription that already runs (e.g. a past-due invoice): no "welcome".
                if (!purchased.current && subscribed) {
                    setNotice({ tone: "success", copy: C.paymentLinkDone });
                    setReload((value) => value + 1);
                    return;
                }
                setActivating(purchased.current ?? "plus");
                return;
            }
            const stage = EVENT_STAGES[event.name ?? ""];
            if (!stage) return;
            const error = checkoutEventError(event);
            report({ stage, message: error.message, code: error.code || null });
            // A declined card is explained by Paddle inside its own frame, where another card can be tried.
            if (event.name === "checkout.payment.failed") return;
            // No usable payment method: Paddle's frame may say little, so the page says it too.
            if (event.name === "checkout.payment.error") {
                setNotice({ tone: "error", copy: C.paymentMethodError, technical: diagnostics ? { stage, message: error.message } : undefined });
                return;
            }
            // A checkout that can't start leaves only Paddle's "Something went wrong" over the page.
            if (stage === "checkout_error") closeCheckout();
            setNotice({
                tone: "error",
                copy: error.text ? C.checkoutError : C.checkoutErrorGeneric,
                vars: error.text ? { detail: error.text } : undefined,
                hint: diagnostics && error.code === "validation" ? C.checkoutValidationTeam : undefined,
                technical: diagnostics ? { stage, message: error.message } : undefined,
            });
        });
        return () => onPaddleEvent(null);
    }, [diagnostics, report]);

    // The notice sits above the plans; after a click lower down it may be out of sight.
    useEffect(() => {
        if (notice?.tone === "error") noticeRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }, [notice]);

    // Back from the portal with the browser's back button, the page comes from its cache with the
    // portal button still busy: free the buttons and read the plan again.
    useEffect(() => {
        const onShow = (event: PageTransitionEvent) => {
            if (!event.persisted) return;
            setBusy(null);
            setReload((value) => value + 1);
        };
        window.addEventListener("pageshow", onShow);
        return () => window.removeEventListener("pageshow", onShow);
    }, []);

    // Back from Paddle's customer portal (a cancellation, a new card): ask Paddle about the subscription now
    // instead of waiting for its notification.
    const hasAccount = Boolean(data?.me);
    useEffect(() => {
        if (!hasAccount) return;
        let visited = 0;
        try {
            visited = Number(window.sessionStorage.getItem(PORTAL_VISIT_KEY) || 0);
            window.sessionStorage.removeItem(PORTAL_VISIT_KEY);
        } catch {
            // Storage blocked: Paddle's notification updates the page later.
        }
        if (!visited || Date.now() - visited > 60 * 60_000) return;
        let active = true;
        void postJson<PaddleSyncResponse>("/api/paddle/sync", { refresh: true }).then(async (result) => {
            if (!active || !result.ok) return;
            const payload = await fetchPlans();
            if (active && payload) setData(payload);
        });
        return () => {
            active = false;
        };
    }, [hasAccount]);

    // After a checkout: ask the server to check the payment with Paddle until the plan is active.
    // Paddle's notification usually gets there first; this also works when it's late or never arrives.
    useEffect(() => {
        if (!activating) return;
        let stopped = false;
        let timer = 0;
        let attempt = 0;
        let delay: number = SYNC_DELAYS_MS[0];
        const started = Date.now();
        const welcome = (plan: PaidPlanId) => {
            setActivating(null);
            setNotice({ tone: "success", copy: C.welcome, vars: { plan: PLAN_COPY[plan].name.EN } });
            announcePlanChange();
        };
        const tick = async () => {
            attempt += 1;
            const result = await postJson<PaddleSyncResponse>("/api/paddle/sync", {});
            if (stopped) return;
            if (result.ok && result.data.state === "active") {
                const payload = await fetchPlans();
                if (stopped) return;
                if (payload) setData(payload);
                welcome(result.data.billing?.plan ?? activating);
                return;
            }
            // Signed out for real, or a page the server can't verify: stop. A 401 while this page still has its
            // session (or a 503 when the database didn't answer) is a hiccup: keep following the payment.
            const signedOut = !result.ok && result.error === "unauthorized" && !pageState.current.signedIn;
            if (!result.ok && (signedOut || result.error === "forbidden_origin")) {
                setActivating(null);
                setNotice({ tone: "error", copy: signedOut ? C.signedOut : C.reloadPage, action: signedOut ? undefined : "reload" });
                return;
            }
            if (Date.now() - started >= SYNC_WINDOW_MS) {
                // The notification may have got there meanwhile.
                const payload = await fetchPlans();
                if (stopped) return;
                if (payload) setData(payload);
                const live = payload?.me?.billing?.plan && payload.me.billing.entitled ? payload.me.billing.plan : null;
                if (live) welcome(live);
                else {
                    setActivating(null);
                    setNotice({ tone: "info", copy: C.activationSlow, action: "checkPayment" });
                }
                return;
            }
            delay = !result.ok && result.error === "rate_limited" ? Math.min(delay * 2, 20_000) : SYNC_DELAYS_MS[Math.min(attempt, SYNC_DELAYS_MS.length - 1)];
            timer = window.setTimeout(() => void tick(), delay);
        };
        timer = window.setTimeout(() => void tick(), delay);
        return () => {
            stopped = true;
            window.clearTimeout(timer);
        };
    }, [activating]);

    const money = (value: number) => {
        try {
            return new Intl.NumberFormat(locale, { style: "currency", currency: catalog.currency, maximumFractionDigits: value % 1 ? 2 : 0 }).format(value);
        } catch {
            return `$${value}`;
        }
    };
    const date = (iso: string) => {
        try {
            return new Intl.DateTimeFormat(locale, { day: "numeric", month: "long", year: "numeric" }).format(new Date(iso));
        } catch {
            return iso.slice(0, 10);
        }
    };
    const checkoutSettings = () => ({
        theme: document.documentElement.classList.contains("dark") ? "dark" : "light",
        ...(checkoutLocale(language) ? { locale: checkoutLocale(language) } : {}),
    });
    const intervalFor = (plan: PaidPlanId) => (onSale(plan).includes(period) ? period : onSale(plan)[0] ?? period);

    const toggleWaitlist = async (plan: PaidPlanId) => {
        if (!me) return;
        const join = !me.waitlist.includes(plan);
        setBusy(`waitlist:${plan}`);
        setNotice(null);
        const result = await postJson<{ waitlist?: PaidPlanId[] }>("/api/plans", { action: "waitlist", plan, join });
        if (result.ok && Array.isArray(result.data.waitlist)) {
            const waitlist = result.data.waitlist;
            setData((current) => (current?.me ? { ...current, me: { ...current.me, waitlist } } : current));
        } else {
            setNotice(result.ok ? { tone: "error", copy: C.failed } : failureNotice(result, diagnostics));
        }
        setBusy(null);
    };

    // Only a new subscription's checkout carries a coupon: plan changes don't, so a subscriber sees no coupon prices.
    const couponFor = (plan: PaidPlanId) => (!liveSubscription && coupon && (coupon.plan === "any" || coupon.plan === plan) ? coupon : null);

    const applyCoupon = async (value: string) => {
        const code = value.trim().toUpperCase();
        if (!code) return;
        setBusy("coupon");
        setCouponError(null);
        const result = await postJson<{ coupon: CouponView }>("/api/paddle/coupon", { code });
        setBusy(null);
        if (result.ok) {
            setCoupon(result.data.coupon);
            setCouponInput("");
            setCouponOpen(false);
            return;
        }
        setCouponOpen(true);
        setCouponInput(code);
        setCouponError(failureNotice(result, diagnostics).copy);
    };

    const submitCoupon = (event: FormEvent) => {
        event.preventDefault();
        void applyCoupon(couponInput);
    };

    // A link with ?coupon=CODE (e.g. from a campaign) applies the code once the visitor is signed in.
    useEffect(() => {
        if (!signedIn || !checkout || liveSubscription || couponFromLink.current || !linkCoupon) return;
        couponFromLink.current = true;
        void Promise.resolve().then(() => applyCoupon(linkCoupon));
    });

    const startCheckout = async (plan: PaidPlanId) => {
        if (!checkout) return;
        setBusy(`checkout:${plan}`);
        setNotice(null);
        const applied = couponFor(plan);
        const result = await postWithRetry<{ transactionId: string }>("/api/paddle/checkout", { plan, interval: intervalFor(plan), ...(applied ? { coupon: applied.code } : {}) });
        if (!result.ok) {
            showRequestFailure("checkout", result);
            // A subscription the page didn't know about (or a paused one) is stored now: show it.
            if (result.error === "already_subscribed" || result.error === "subscription_paused") setReload((value) => value + 1);
            // Paid already, Paddle is still creating the subscription: follow it up like a completed checkout.
            if (result.error === "payment_pending") setActivating(plan);
            // A coupon that stopped working meanwhile (expired, used up) is taken off; the plan can still be bought.
            if (COUPON_ERRORS.has(result.error)) setCoupon(null);
            setBusy(null);
            return;
        }
        try {
            const settings = checkoutSettings();
            const paddle = await getPaddle(checkout, { settings, customerId, debug: checkout.testMode });
            purchased.current = plan;
            openCheckout(paddle, result.data.transactionId, settings);
        } catch (error) {
            showPaddleFailure(error);
        }
        setBusy(null);
    };

    const openPortal = async (target: "overview" | "updatePayment" | "cancel") => {
        setBusy("portal");
        setNotice(null);
        const result = await postWithRetry<{ overview: string; updatePayment: string | null; cancel: string | null }>("/api/paddle/subscription", { action: "portal" });
        if (result.ok) {
            try {
                window.sessionStorage.setItem(PORTAL_VISIT_KEY, String(Date.now()));
            } catch {
                // Storage blocked: Paddle's notification updates the page later.
            }
            window.location.assign(result.data[target] ?? result.data.overview);
            return;
        }
        showRequestFailure("subscription", result);
        setBusy(null);
    };

    /** "Check my payment": the server asks Paddle about the account's purchase now. */
    const checkPayment = async () => {
        setBusy("sync");
        setNotice(null);
        const result = await postJson<PaddleSyncResponse>("/api/paddle/sync", {});
        setBusy(null);
        if (!result.ok) {
            showRequestFailure("sync", result);
            return;
        }
        if (result.data.state === "active") {
            const payload = await fetchPlans();
            if (payload) setData(payload);
            setNotice({ tone: "success", copy: C.welcome, vars: { plan: PLAN_COPY[result.data.billing?.plan ?? "plus"].name.EN } });
            announcePlanChange();
            return;
        }
        if (result.data.state === "pending") {
            setActivating(result.data.billing?.plan ?? purchased.current ?? "plus");
            return;
        }
        setNotice({ tone: "info", copy: C.paymentNotFound, action: "checkPayment" });
    };

    const keepSubscription = async () => {
        setBusy("keep");
        setNotice(null);
        const result = await postJson("/api/paddle/subscription", { action: "keep" });
        if (result.ok) {
            setNotice({ tone: "success", copy: C.kept });
            setReload((value) => value + 1);
        } else {
            showRequestFailure("subscription", result);
        }
        setBusy(null);
    };

    /** Resumes the paused subscription (the server finds it; nothing is taken from the page). */
    const resumeSubscription = async () => {
        setBusy("resume");
        setNotice(null);
        const result = await postJson<{ plan?: PlanId; billing?: { plan?: PaidPlanId | null } | null }>("/api/paddle/subscription", { action: "resume" });
        setBusy(null);
        if (result.ok) {
            setResumeOpen(false);
            const plan = result.data.billing?.plan ?? billing?.plan ?? "plus";
            setNotice({ tone: "success", copy: C.resumed, vars: { plan: PLAN_COPY[plan].name.EN } });
            setReload((value) => value + 1);
            announcePlanChange();
            return;
        }
        showRequestFailure("subscription", result);
    };

    /** The button of a notice. */
    const noticeAction = (action: NonNullable<Notice>["action"]) => {
        if (action === "checkPayment") return void checkPayment();
        if (action === "updatePayment") return void openPortal("updatePayment");
        if (action === "reload") return window.location.reload();
        if (action === "resume") {
            setResumeOpen(true);
            setReload((value) => value + 1);
        }
    };

    /** A failure as one sentence for the plan change dialog, with its error code. */
    const failureText = (result: RequestFailure) => {
        const failure = failureNotice(result, diagnostics);
        return [tx(failure.copy, failure.vars), failure.reference ? tx(C.reference, { ref: failure.reference }) : ""].filter(Boolean).join(" ");
    };

    const openChange = async (plan: PaidPlanId) => {
        const interval = intervalFor(plan);
        setNotice(null);
        setChange({ plan, interval, preview: null, error: "" });
        const result = await postJson<{ preview: PlanChangePreview }>("/api/paddle/subscription", { action: "preview", plan, interval });
        setChange((current) => {
            if (!current || current.plan !== plan || current.interval !== interval) return current;
            if (result.ok) return { ...current, preview: result.data.preview };
            return { ...current, error: failureText(result) };
        });
    };

    const confirmChange = async () => {
        if (!change) return;
        setBusy("change");
        const result = await postJson("/api/paddle/subscription", { action: "change", plan: change.plan, interval: change.interval });
        if (result.ok) {
            setNotice({ tone: "success", copy: C.changed, vars: { plan: PLAN_COPY[change.plan].name.EN } });
            setChange(null);
            setReload((value) => value + 1);
            announcePlanChange();
        } else {
            setChange((current) => (current ? { ...current, error: failureText(result) } : current));
        }
        setBusy(null);
    };

    const savings = checkout ? Math.max(yearlySavingsPercent(checkout.prices.plus.month, checkout.prices.plus.year), yearlySavingsPercent(checkout.prices.pro.month, checkout.prices.pro.year)) : 0;
    const showPeriodToggle = anyOnSale && (onSale("plus").length > 1 || onSale("pro").length > 1);
    // A subscriber gets the answers about billing even while sales are closed ("nothing is charged" isn't true for them).
    const faq: Array<[Copy, Copy]> = anyOnSale || liveSubscription
        ? [[C.bq1, C.ba1], [C.bq2, C.ba2], [C.bq3, C.ba3], [C.bq4, C.ba4], [C.bq5, C.ba5], [C.q5, C.a5], [C.q6, C.a6], [C.q2, C.a2]]
        : [[C.q1, C.a1], [C.q2, C.a2], [C.q5, C.a5], [C.q6, C.a6], [C.q3, C.a3], [C.q4, C.a4]];

    return {
        tx, locale, signedIn, data, setData, failed, catalog, checkout, me, billing, liveSubscription, anyOnSale, diagnostics,
        period, setPeriod: (value: BillingInterval) => {
            periodTouched.current = true;
            setPeriod(value);
        },
        savings, showPeriodToggle, faq,
        busy, notice, noticeRef, activating, change, setChange, resumeOpen, setResumeOpen,
        coupon, setCoupon, couponOpen, setCouponOpen, couponInput, setCouponInput, couponError, setCouponError, linkCoupon, signInHref,
        onSale, intervalFor, couponFor, money, date,
        toggleWaitlist, applyCoupon, submitCoupon, startCheckout, openPortal, checkPayment, keepSubscription, resumeSubscription, noticeAction, openChange, confirmChange,
    };
}

export type PlansBilling = ReturnType<typeof usePlansBilling>;
