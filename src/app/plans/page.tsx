"use client";

import { motion } from "framer-motion";
import { Bell, BellRing, Check, Clock, CreditCard, Crown, LoaderCircle, PartyPopper, ShieldCheck, Sparkles, Ticket, Zap } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import Header from "@/components/Header";
import ChangePlanDialog from "@/components/Plans/ChangePlanDialog";
import { PaddleLoadError, failureMessage, getPaddle, onPaddleEvent, openCheckout, type PaddleCheckoutEvent } from "@/components/Plans/paddle-js";
import { useRawSession } from "@/components/Provider";
import SiteFooter from "@/components/SiteFooter";
import { useI18n, type Copy } from "@/lib/i18n";
import {
    ENTITLED_STATUSES,
    checkoutLocale,
    formatMoney,
    yearlySavingsPercent,
    type BillingErrorCode,
    type BillingInterval,
    type PaddleClientErrorStage,
    type PlanChangePreview,
} from "@/lib/paddle";
import {
    DEFAULT_PLAN_CATALOG,
    PLAN_AI_LIMITS,
    PLAN_COPY,
    PLAN_IDS,
    discountedPrice,
    type PaidPlanId,
    type PlanId,
    type PlansResponse,
} from "@/lib/plans";

const C = {
    badge: { TR: "Yakında", EN: "Coming soon" },
    badgeOpen: { TR: "Planlar açıldı", EN: "Plans are open" },
    title: { TR: "Hanogt Codev Planları", EN: "Hanogt Codev Plans" },
    subtitle: { TR: "Hanogt Codev ücretsiz kalacak. Daha fazlasını isteyenler için Plus ve Pro hazırlanıyor; şu anda ödeme alınmıyor ve hiçbir kart bilgisi istenmiyor.", EN: "Hanogt Codev stays free. Plus and Pro are being prepared for people who want more; no payments are taken right now and no card details are asked for." },
    subtitleOpen: { TR: "Hanogt Codev ücretsiz kalacak. Daha çok Hanogt AI ve destekte öncelik isteyenler için Plus ve Pro. Ödemeler Paddle üzerinden güvenle alınır; kart bilgilerin bize ulaşmaz.", EN: "Hanogt Codev stays free. Plus and Pro are for people who want more Hanogt AI and priority support. Payments are handled securely by Paddle; your card details never reach us." },
    yourPlan: { TR: "Planın: {plan}", EN: "Your plan: {plan}" },
    assigned: { TR: "Hanogt ekibi tarafından tanımlandı", EN: "Assigned by the Hanogt team" },
    paidMonthly: { TR: "Aylık abonelik", EN: "Monthly subscription" },
    paidYearly: { TR: "Yıllık abonelik", EN: "Yearly subscription" },
    until: { TR: "{date} tarihine kadar", EN: "until {date}" },
    renews: { TR: "Sonraki ödeme: {date}", EN: "Next payment: {date}" },
    endsAt: { TR: "Aboneliğin {date} tarihinde sona erecek; avantajların o güne kadar sürer.", EN: "Your subscription ends on {date}; your benefits last until then." },
    keep: { TR: "Vazgeç, aboneliğim devam etsin", EN: "Undo, keep my subscription" },
    pastDue: { TR: "Son ödemen alınamadı. Paddle ödemeyi birkaç kez daha deneyecek; avantajların bu sürede devam eder.", EN: "Your last payment didn't go through. Paddle will try again a few times; your benefits continue meanwhile." },
    updatePayment: { TR: "Ödeme yöntemini güncelle", EN: "Update payment method" },
    paused: { TR: "Aboneliğin duraklatıldı.", EN: "Your subscription is paused." },
    ended: { TR: "Önceki aboneliğin sona erdi.", EN: "Your previous subscription has ended." },
    manage: { TR: "Aboneliği yönet", EN: "Manage subscription" },
    manageHint: { TR: "Fatura, ödeme yöntemi ve iptal Paddle'ın güvenli müşteri portalında.", EN: "Invoices, payment method and cancellation are in Paddle's secure customer portal." },
    cancelSubscription: { TR: "Ücretsiz plana dönmek için aboneliği iptal et", EN: "Cancel your subscription to go back to Free" },
    blocked: { TR: "Plan avantajların şu anda kullanıma kapalı. Bir sorun olduğunu düşünüyorsan destek talebi aç.", EN: "Your plan benefits are switched off right now. If you think that's a mistake, open a support ticket." },
    aiToday: { TR: "Bugün Hanogt AI: {used} / {limit} mesaj", EN: "Hanogt AI today: {used} / {limit} messages" },
    monthly: { TR: "Aylık", EN: "Monthly" },
    yearly: { TR: "Yıllık", EN: "Yearly" },
    save: { TR: "%{percent} tasarruf", EN: "Save {percent}%" },
    perMonth: { TR: "/ay", EN: "/month" },
    perYearShort: { TR: "/yıl", EN: "/year" },
    perYear: { TR: "Yıllık {price}", EN: "{price} per year" },
    monthlyEquivalent: { TR: "Aylık {price} karşılığı", EN: "{price} a month" },
    onlyInterval: { TR: "Bu plan şimdilik yalnızca {interval} ödemeyle satılıyor.", EN: "This plan is sold with {interval} billing only for now." },
    priceAtCheckout: { TR: "Fiyat ödeme ekranında gösterilir", EN: "The price is shown at checkout" },
    trial: { TR: "{days} gün ücretsiz dene", EN: "{days}-day free trial" },
    priceSoon: { TR: "Fiyat yakında açıklanacak", EN: "Price to be announced" },
    forever: { TR: "her zaman", EN: "forever" },
    current: { TR: "Şu anki planın", EN: "Your current plan" },
    startFree: { TR: "Ücretsiz başla", EN: "Start for free" },
    buyPlus: { TR: "Plus'a geç", EN: "Get Plus" },
    buyPro: { TR: "Pro'ya geç", EN: "Get Pro" },
    upgradePro: { TR: "Pro'ya yükselt", EN: "Upgrade to Pro" },
    switchPlus: { TR: "Plus'a geç", EN: "Switch to Plus" },
    switchYearly: { TR: "Yıllık ödemeye geç", EN: "Switch to yearly" },
    switchMonthly: { TR: "Aylık ödemeye geç", EN: "Switch to monthly" },
    ownSubscription: { TR: "Kendi aboneliğini başlat", EN: "Start your own subscription" },
    signInToBuy: { TR: "Giriş yap ve satın al", EN: "Sign in to buy" },
    payFirst: { TR: "Önce ödeme yöntemini güncelle", EN: "Update your payment method first" },
    unavailableBlocked: { TR: "Kullanıma kapalı", EN: "Not available" },
    notify: { TR: "Açılınca haber ver", EN: "Notify me when it opens" },
    notified: { TR: "Haber vereceğiz", EN: "We'll let you know" },
    notifyHint: { TR: "Bildirimden çıkmak için tekrar bas.", EN: "Press again to stop the notification." },
    signInToNotify: { TR: "Haber almak için giriş yap", EN: "Sign in to get notified" },
    planned: { TR: "Planlanıyor", EN: "Planned" },
    popular: { TR: "En kapsamlı", EN: "Most complete" },
    discount: { TR: "%{percent} indirim", EN: "{percent}% off" },
    activating: { TR: "Ödemen alındı, planın etkinleştiriliyor…", EN: "Payment received, activating your plan…" },
    welcome: { TR: "Hoş geldin! {plan} planın etkin.", EN: "Welcome! Your {plan} plan is active." },
    activationSlow: { TR: "Ödemen alındı; planın birkaç dakika içinde etkinleşecek. Bu sayfayı sonra yenileyebilirsin.", EN: "Payment received; your plan will be active within a few minutes. You can refresh this page later." },
    changed: { TR: "Planın değişti: {plan}.", EN: "Your plan changed: {plan}." },
    kept: { TR: "Aboneliğin devam ediyor.", EN: "Your subscription will continue." },
    failed: { TR: "İşlem tamamlanamadı. Biraz sonra tekrar dene.", EN: "That didn't work. Try again in a moment." },
    testMode: { TR: "Test modu: satışlar henüz herkese açık değil; bu sayfayı yalnızca Hanogt ekibi ve test kullanıcıları satın alınabilir görüyor.", EN: "Test mode: sales aren't open to everyone yet; only the Hanogt team and testers see these plans as buyable." },
    sandbox: { TR: "Paddle sandbox: gerçek ödeme alınmaz, test kartıyla dene (4242 4242 4242 4242).", EN: "Paddle sandbox: no real payments; use a test card (4242 4242 4242 4242)." },
    alreadySubscribed: { TR: "Zaten bir aboneliğin var; planını bu sayfadan değiştirebilirsin.", EN: "You already have a subscription; you can change your plan on this page." },
    planUnavailable: { TR: "Bu plan şu anda satışta değil.", EN: "This plan isn't on sale right now." },
    billingUnavailable: { TR: "Ödemeler şu anda kapalı. Biraz sonra tekrar dene.", EN: "Payments are switched off right now. Try again later." },
    rateLimited: { TR: "Çok fazla deneme oldu. Bir dakika sonra tekrar dene.", EN: "Too many attempts. Try again in a minute." },
    signedOut: { TR: "Oturumun sona ermiş; yeniden giriş yap.", EN: "Your session has ended; please sign in again." },
    paddleError: { TR: "Paddle şu anda yanıt vermiyor ({code}). Biraz sonra tekrar dene.", EN: "Paddle isn't responding right now ({code}). Try again in a moment." },
    paddleBlocked: { TR: "Ödeme ekranı yüklenemedi: Paddle'ın ödeme betiği tarayıcına ulaşmadı. Reklam engelleyici, tarayıcının izleme koruması ya da ağ ayarların (ör. kurum ağı, VPN, DNS filtresi) cdn.paddle.com adresini engelliyor olabilir. Bu site için izin verip tekrar dene.", EN: "The checkout couldn't load: Paddle's checkout script didn't reach your browser. An ad blocker, your browser's tracking protection or your network (e.g. a work network, VPN or DNS filter) may be blocking cdn.paddle.com. Allow it for this site and try again." },
    paddleBlockedUrl: { TR: "Ödeme ekranı yüklenemedi: tarayıcın {url} adresini engelledi. Reklam ya da betik engelleyiciyi veya tarayıcının izleme korumasını bu site için kapatıp tekrar dene; sorun sürerse destek talebi aç.", EN: "The checkout couldn't load: your browser blocked {url}. Turn off your ad or script blocker or your browser's tracking protection for this site and try again; if it keeps happening, open a support ticket." },
    paddleStart: { TR: "Ödeme ekranı başlatılamadı: Paddle yüklendi ama çalıştırılamadı. Biraz sonra tekrar dene; sorun sürerse destek talebi aç.", EN: "The checkout couldn't start: Paddle loaded but couldn't be started. Try again in a moment; if it keeps happening, open a support ticket." },
    paddleStartTeam: { TR: "Ekip için: Vercel'deki istemci tarafı jeton (NEXT_PUBLIC_PADDLE_CLIENT_TOKEN) başka bir Paddle hesabına ya da öbür ortama (Sandbox/Canlı) ait olabilir. Yönetici Paneli › Abonelikler › Paddle bölümündeki jeton denetimine bakın.", EN: "For the team: the client-side token in Vercel (NEXT_PUBLIC_PADDLE_CLIENT_TOKEN) may belong to another Paddle account or to the other environment (sandbox/live). See the token check under Admin Panel › Subscriptions › Paddle." },
    paddleOpen: { TR: "Ödeme ekranı açılamadı. Sayfayı yenileyip tekrar dene; sorun sürerse destek talebi aç.", EN: "The checkout couldn't open. Refresh the page and try again; if it keeps happening, open a support ticket." },
    checkoutError: { TR: "Ödeme ekranı bir hata bildirdi: {detail}", EN: "The checkout reported an error: {detail}" },
    checkoutErrorGeneric: { TR: "Ödeme ekranında bir hata oluştu. Tekrar dene; sorun sürerse destek talebi aç.", EN: "Something went wrong in the checkout. Try again; if it keeps happening, open a support ticket." },
    technical: { TR: "Teknik ayrıntı: {stage}: {message}", EN: "Technical detail: {stage}: {message}" },
    unavailable: { TR: "Plan bilgileri şu anda alınamıyor; aşağıdaki fiyatlar henüz kesinleşmedi.", EN: "Plan details can't be loaded right now; the prices below aren't final yet." },
    taxNote: { TR: "Fiyatlara bulunduğun ülkenin vergileri dahildir; kesin tutar ödeme ekranında gösterilir. Ödemeler, Kayıtlı Satıcımız (Merchant of Record) Paddle.com tarafından alınır.", EN: "Prices include the taxes of your country; the exact amount is shown at checkout. Payments are taken by Paddle.com, our Merchant of Record." },
    refundPolicy: { TR: "İade Politikası", EN: "Refund Policy" },
    terms: { TR: "Kullanım Şartları", EN: "Terms of Use" },
    faqTitle: { TR: "Sık sorulanlar", EN: "Questions" },
    q1: { TR: "Ödeme ne zaman başlayacak?", EN: "When will payments start?" },
    a1: { TR: "Henüz bir tarih yok. Planlar açıldığında bu sayfada, güncelleme günlüğünde ve \"Açılınca haber ver\" dediysen bildirimlerinde duyuracağız. O güne kadar hiçbir ücret alınmaz.", EN: "There's no date yet. When plans open we'll announce it on this page, in the changelog and, if you pressed \"Notify me\", in your notifications. Until then nothing is charged." },
    q2: { TR: "Ücretsiz plan kalkacak mı?", EN: "Will the free plan go away?" },
    a2: { TR: "Hayır. Kod editörü, oyun motoru, Arcade, Media, Hanogt Social ve Hanogt AI ücretsiz planda kalmaya devam edecek.", EN: "No. The code editor, the game engine, the Arcade, Media, Hanogt Social and Hanogt AI stay in the free plan." },
    q3: { TR: "Kupon kodum var, ne yapmalıyım?", EN: "I have a coupon code. What do I do?" },
    a3: { TR: "Kodunu sakla; planlar açıldığında satın alma sırasında kullanabileceksin. Kuponların bitiş tarihi kupon verilirken belirtilir.", EN: "Keep it; you'll be able to use it at checkout once plans open. A coupon's expiry date is given with the coupon." },
    q4: { TR: "Planım nasıl tanımlandı?", EN: "How did I get a plan?" },
    a4: { TR: "Ekip; testçilere, katkı verenlere ve yarışma kazananlarına planı elle tanımlayabilir. Bugün planın canlı avantajı daha yüksek Hanogt AI sınırı ve destek taleplerinde önceliktir.", EN: "The team can assign a plan by hand to testers, contributors and contest winners. Today, a plan's live benefits are a higher Hanogt AI limit and priority on support tickets." },
    bq1: { TR: "Ödemeyi kim alıyor?", EN: "Who takes the payment?" },
    ba1: { TR: "Ödemeler Paddle üzerinden alınır. Paddle.com, Hanogt Codev siparişlerinin Kayıtlı Satıcısıdır (Merchant of Record): ödemeyi alır, faturayı keser ve vergileri hesaplar. Kart bilgilerin Hanogt Codev'e hiç ulaşmaz.", EN: "Payments go through Paddle. Paddle.com is the Merchant of Record for Hanogt Codev orders: it takes the payment, issues the invoice and handles taxes. Your card details never reach Hanogt Codev." },
    bq2: { TR: "Aboneliğimi nasıl iptal ederim?", EN: "How do I cancel?" },
    ba2: { TR: "Bu sayfada \"Aboneliği yönet\"e bas; Paddle'ın müşteri portalından aboneliğini iptal edebilirsin. İptal, ödediğin dönemin sonunda geçerli olur ve o güne kadar avantajların sürer.", EN: "Press \"Manage subscription\" on this page and cancel in Paddle's customer portal. Cancellation takes effect at the end of the period you paid for, and your benefits last until then." },
    bq3: { TR: "İade alabilir miyim?", EN: "Can I get a refund?" },
    ba3: { TR: "Bir aboneliğin ilk ödemesinden sonraki 14 gün içinde iade isteyebilirsin. Ayrıntılar İade Politikası'nda.", EN: "You can ask for a refund within 14 days of a subscription's first payment. The details are in the Refund Policy." },
    bq4: { TR: "Planımı değiştirebilir miyim?", EN: "Can I change my plan?" },
    ba4: { TR: "Evet. Plus ile Pro arasında ya da aylık ile yıllık ödeme arasında geçebilirsin. Kalan süren için fark orantılı hesaplanır ve onaylamadan önce gösterilir.", EN: "Yes. You can move between Plus and Pro, or between monthly and yearly billing. The difference for the rest of your period is prorated and shown before you confirm." },
    bq5: { TR: "Kupon kodumu nerede kullanırım?", EN: "Where do I use a coupon code?" },
    ba5: { TR: "Ödeme ekranında \"İndirim kodu ekle\"ye bas ve kodunu yaz.", EN: "On the checkout screen, press \"Add discount code\" and enter your code." },
} satisfies Record<string, Copy>;

const ACCENT: Record<PlanId, { ring: string; icon: typeof Zap; gradient: string }> = {
    free: { ring: "border-zinc-200 dark:border-white/10", icon: Sparkles, gradient: "from-zinc-500 to-zinc-700" },
    plus: { ring: "border-indigo-300/70 dark:border-indigo-400/30", icon: Zap, gradient: "from-indigo-500 to-sky-500" },
    pro: { ring: "border-transparent", icon: Crown, gradient: "from-fuchsia-500 to-amber-500" },
};

const PLAN_RANK: Record<PlanId, number> = { free: 0, plus: 1, pro: 2 };

type Notice = {
    tone: "info" | "success" | "error";
    copy: Copy;
    vars?: Record<string, string | number>;
    /** For the team and testers only: what to check. */
    hint?: Copy;
    /** For the team and testers only: the stage that failed and Paddle's own words. */
    technical?: { stage: string; message: string };
} | null;

/** Paddle checkout events the page reports, as stages of POST /api/paddle/client-error. */
const EVENT_STAGES: Partial<Record<string, PaddleClientErrorStage>> = {
    "checkout.error": "checkout_error",
    "checkout.failed": "checkout_failed",
    "checkout.payment.error": "payment_error",
};

type ClientErrorReport = { stage: PaddleClientErrorStage; message: string; blockedUrl?: string | null; code?: string | null };

/** Paddle's error code the way the report route takes it ([a-z0-9_]). */
function reportCode(value: string) {
    return value.toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 80);
}

/** What a checkout error event says: type, code and detail are on the event (or, in some builds, in its data). */
function checkoutEventError(event: PaddleCheckoutEvent) {
    const data = event.data && typeof event.data === "object" ? event.data as Record<string, unknown> : {};
    const field = (key: "type" | "code" | "detail") => {
        const value = event[key] ?? data[key];
        return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, 200) : "";
    };
    const type = field("type");
    const code = field("code");
    const detail = field("detail");
    return {
        code: reportCode(code),
        /** For the notice: Paddle's detail with its code, or whichever of them there is. */
        text: detail && code ? `${detail} (${code})` : detail || code,
        message: [event.name, type, code, detail].filter(Boolean).join(" · ").slice(0, 300),
    };
}

/** Fire and forget: the team sees it under Admin › Subscriptions › Paddle. */
function postClientError(report: ClientErrorReport) {
    void fetch("/api/paddle/client-error", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        keepalive: true,
        body: JSON.stringify(report),
    }).catch(() => undefined);
}

const ERROR_COPY: Partial<Record<BillingErrorCode, Copy>> = {
    already_subscribed: C.alreadySubscribed,
    plan_unavailable: C.planUnavailable,
    plan_blocked: C.blocked,
    billing_unavailable: C.billingUnavailable,
    rate_limited: C.rateLimited,
    unauthorized: C.signedOut,
};

async function fetchPlans(): Promise<PlansResponse | null> {
    try {
        const response = await fetch("/api/plans", { cache: "no-store", credentials: "same-origin" });
        return response.ok ? await response.json() as PlansResponse : null;
    } catch {
        return null;
    }
}

async function postJson<T>(url: string, body: unknown): Promise<{ ok: true; data: T } | { ok: false; error: BillingErrorCode | "network"; code?: string }> {
    try {
        const response = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "same-origin",
            body: JSON.stringify(body),
        });
        const payload = await response.json().catch(() => ({})) as T & { error?: BillingErrorCode; code?: string };
        if (!response.ok) return { ok: false, error: payload.error ?? "unavailable", code: payload.code };
        return { ok: true, data: payload };
    } catch {
        return { ok: false, error: "network" };
    }
}

function failureNotice(result: { error: BillingErrorCode | "network"; code?: string }): Notice {
    if (result.error === "paddle_error") return { tone: "error", copy: C.paddleError, vars: { code: result.code ?? "?" } };
    return { tone: "error", copy: (result.error !== "network" && ERROR_COPY[result.error]) || C.failed };
}

export default function PlansPage() {
    const { tx, locale, language } = useI18n();
    const auth = useRawSession();
    const signedIn = auth.status === "authenticated";
    const [data, setData] = useState<PlansResponse | null>(null);
    const [failed, setFailed] = useState(false);
    const [busy, setBusy] = useState<string | null>(null);
    const [notice, setNotice] = useState<Notice>(null);
    const [period, setPeriod] = useState<BillingInterval>("month");
    const [change, setChange] = useState<{ plan: PaidPlanId; interval: BillingInterval; preview: PlanChangePreview | null; error: string } | null>(null);
    const [activating, setActivating] = useState<PaidPlanId | null>(null);
    const [reload, setReload] = useState(0);
    const purchased = useRef<PaidPlanId | null>(null);

    useEffect(() => {
        if (auth.status === "loading") return;
        let active = true;
        void fetchPlans().then((payload) => {
            if (!active) return;
            setData(payload);
            setFailed(!payload);
        });
        return () => {
            active = false;
        };
    }, [auth.status, reload]);

    const catalog = data?.catalog ?? DEFAULT_PLAN_CATALOG;
    const checkout = data?.checkout ?? null;
    const me = data?.me ?? null;
    const billing = me?.billing ?? null;
    const liveSubscription = Boolean(billing?.plan && ENTITLED_STATUSES.includes(billing.status));
    const onSale = (plan: PaidPlanId) => checkout?.onSale[plan] ?? [];
    const anyOnSale = onSale("plus").length > 0 || onSale("pro").length > 0;

    // The team and testers (and anyone in the sandbox, where nothing is charged) also see why Paddle failed.
    const diagnostics = Boolean(checkout && (checkout.testMode || checkout.environment === "sandbox"));
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
        onPaddleEvent((event) => {
            if (event.name === "checkout.completed") {
                setActivating(purchased.current ?? "plus");
                return;
            }
            const stage = EVENT_STAGES[event.name ?? ""];
            if (!stage) return;
            const error = checkoutEventError(event);
            report({ stage, message: error.message, code: error.code || null });
            // Declined cards and other payment problems are explained by Paddle inside its own frame.
            if (stage === "payment_error") return;
            setNotice({
                tone: "error",
                copy: error.text ? C.checkoutError : C.checkoutErrorGeneric,
                vars: error.text ? { detail: error.text } : undefined,
                technical: diagnostics ? { stage, message: error.message } : undefined,
            });
        });
        return () => onPaddleEvent(null);
    }, [diagnostics, report]);

    // After a checkout the webhook activates the plan within seconds: wait for it.
    useEffect(() => {
        if (!activating) return;
        let stopped = false;
        let tries = 0;
        let timer = 0;
        const tick = async () => {
            tries += 1;
            const payload = await fetchPlans();
            if (stopped) return;
            if (payload) setData(payload);
            const live = Boolean(payload?.me?.billing?.plan && ENTITLED_STATUSES.includes(payload.me.billing.status));
            if (live || tries >= 24) {
                setActivating(null);
                setNotice(live ? { tone: "success", copy: C.welcome, vars: { plan: PLAN_COPY[payload!.me!.billing!.plan!].name.EN } } : { tone: "info", copy: C.activationSlow });
                return;
            }
            timer = window.setTimeout(() => void tick(), 2500);
        };
        timer = window.setTimeout(() => void tick(), 1500);
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
            setNotice({ tone: "error", copy: C.failed });
        }
        setBusy(null);
    };

    const startCheckout = async (plan: PaidPlanId) => {
        if (!checkout) return;
        setBusy(`checkout:${plan}`);
        setNotice(null);
        const result = await postJson<{ transactionId: string }>("/api/paddle/checkout", { plan, interval: intervalFor(plan) });
        if (!result.ok) {
            setNotice(failureNotice(result));
            if (result.error === "already_subscribed") setReload((value) => value + 1);
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
        const result = await postJson<{ overview: string; updatePayment: string | null; cancel: string | null }>("/api/paddle/subscription", { action: "portal" });
        if (result.ok) {
            window.location.assign(result.data[target] ?? result.data.overview);
            return;
        }
        setNotice(failureNotice(result));
        setBusy(null);
    };

    const keepSubscription = async () => {
        setBusy("keep");
        setNotice(null);
        const result = await postJson("/api/paddle/subscription", { action: "keep" });
        setNotice(result.ok ? { tone: "success", copy: C.kept } : failureNotice(result));
        if (result.ok) setReload((value) => value + 1);
        setBusy(null);
    };

    const openChange = async (plan: PaidPlanId) => {
        const interval = intervalFor(plan);
        setNotice(null);
        setChange({ plan, interval, preview: null, error: "" });
        const result = await postJson<{ preview: PlanChangePreview }>("/api/paddle/subscription", { action: "preview", plan, interval });
        setChange((current) => {
            if (!current || current.plan !== plan || current.interval !== interval) return current;
            if (result.ok) return { ...current, preview: result.data.preview };
            const failure = failureNotice(result);
            return { ...current, error: failure ? tx(failure.copy, failure.vars) : tx(C.failed) };
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
        } else {
            const failure = failureNotice(result);
            setChange((current) => (current ? { ...current, error: failure ? tx(failure.copy, failure.vars) : tx(C.failed) } : current));
        }
        setBusy(null);
    };

    const savings = checkout ? Math.max(yearlySavingsPercent(checkout.prices.plus.month, checkout.prices.plus.year), yearlySavingsPercent(checkout.prices.pro.month, checkout.prices.pro.year)) : 0;
    const showPeriodToggle = anyOnSale && (onSale("plus").length > 1 || onSale("pro").length > 1);
    const faq = anyOnSale ? [[C.bq1, C.ba1], [C.bq2, C.ba2], [C.bq3, C.ba3], [C.bq4, C.ba4], [C.bq5, C.ba5], [C.q2, C.a2]] : [[C.q1, C.a1], [C.q2, C.a2], [C.q3, C.a3], [C.q4, C.a4]];
    const primaryButton = (gradient: string) => `flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r text-[14px] font-bold text-white shadow-lg transition hover:-translate-y-0.5 disabled:translate-y-0 disabled:opacity-60 ${gradient}`;
    const quietButton = "inline-flex items-center justify-center gap-1.5 rounded-xl border border-zinc-200 px-3.5 py-2 text-[13px] font-bold transition hover:bg-zinc-50 disabled:opacity-60 dark:border-white/10 dark:hover:bg-white/5";

    const paidButton = (plan: PaidPlanId, gradient: string, current: boolean) => {
        const interval = intervalFor(plan);
        const loading = busy === `checkout:${plan}`;
        if (!me) {
            return <Link href="/login?callbackUrl=%2Fplans" className={primaryButton(gradient)}><CreditCard className="h-4 w-4" aria-hidden />{tx(C.signInToBuy)}</Link>;
        }
        if (me.blocked) return <p className="flex h-11 items-center justify-center rounded-xl border border-zinc-200 text-[14px] font-bold text-zinc-500 dark:border-white/10">{tx(C.unavailableBlocked)}</p>;
        if (liveSubscription && billing?.plan) {
            if (billing.plan === plan && billing.interval === interval) return <p className="flex h-11 items-center justify-center rounded-xl border border-emerald-500/40 bg-emerald-500/10 text-[14px] font-bold text-emerald-700 dark:text-emerald-300">{tx(C.current)}</p>;
            if (billing.pastDue) return <p className="flex h-11 items-center justify-center rounded-xl border border-zinc-200 text-center text-[13px] font-bold text-zinc-500 dark:border-white/10">{tx(C.payFirst)}</p>;
            const label = billing.plan === plan ? (interval === "year" ? C.switchYearly : C.switchMonthly) : PLAN_RANK[plan] > PLAN_RANK[billing.plan] ? C.upgradePro : C.switchPlus;
            return (
                <button type="button" onClick={() => void openChange(plan)} disabled={busy !== null || change !== null} className={primaryButton(gradient)}>
                    {label === C.upgradePro ? <Crown className="h-4 w-4" aria-hidden /> : <Zap className="h-4 w-4" aria-hidden />}{tx(label)}
                </button>
            );
        }
        const buy = (
            <button type="button" onClick={() => void startCheckout(plan)} disabled={busy !== null} className={primaryButton(gradient)}>
                {loading ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden /> : <CreditCard className="h-4 w-4" aria-hidden />}
                {tx(plan === "pro" ? C.buyPro : C.buyPlus)}
            </button>
        );
        if (current) {
            return (
                <>
                    <p className="flex h-11 items-center justify-center rounded-xl border border-emerald-500/40 bg-emerald-500/10 text-[14px] font-bold text-emerald-700 dark:text-emerald-300">{tx(C.current)}</p>
                    <button type="button" onClick={() => void startCheckout(plan)} disabled={busy !== null} className="mt-2 w-full text-center text-[12.5px] font-semibold text-indigo-600 underline-offset-2 hover:underline disabled:opacity-60 dark:text-indigo-300">
                        {loading ? <LoaderCircle className="me-1 inline h-3.5 w-3.5 animate-spin" aria-hidden /> : null}{tx(C.ownSubscription)}
                    </button>
                </>
            );
        }
        return buy;
    };

    const waitlistButton = (plan: PaidPlanId, gradient: string) => {
        const waiting = Boolean(me?.waitlist.includes(plan));
        if (!me) return <Link href="/login?callbackUrl=%2Fplans" className={primaryButton(gradient)}><Bell className="h-4 w-4" aria-hidden />{tx(C.signInToNotify)}</Link>;
        return (
            <>
                <button
                    type="button"
                    onClick={() => void toggleWaitlist(plan)}
                    disabled={busy !== null}
                    aria-pressed={waiting}
                    className={waiting ? "flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-emerald-500/40 bg-emerald-500/10 text-[14px] font-bold text-emerald-700 transition disabled:opacity-60 dark:text-emerald-300" : primaryButton(gradient)}
                >
                    {busy === `waitlist:${plan}` ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden /> : waiting ? <BellRing className="h-4 w-4" aria-hidden /> : <Bell className="h-4 w-4" aria-hidden />}
                    {tx(waiting ? C.notified : C.notify)}
                </button>
                {waiting ? <p className="mt-1.5 text-center text-[11.5px] text-zinc-500">{tx(C.notifyHint)}</p> : null}
            </>
        );
    };

    const sourceDetail = () => {
        if (!me || me.plan === "free") return null;
        if (me.source === "paddle" && billing) return <span className="font-medium text-zinc-500 dark:text-zinc-400"> · {tx(billing.interval === "year" ? C.paidYearly : C.paidMonthly)}</span>;
        return <span className="font-medium text-zinc-500 dark:text-zinc-400"> · {tx(C.assigned)}{me.expiresAt ? ` · ${tx(C.until, { date: date(me.expiresAt) })}` : ""}</span>;
    };

    return (
        <div className="min-h-dvh bg-white text-zinc-900 dark:bg-zinc-950 dark:text-white">
            <Header />
            <main id="main-content">
                <section className="relative overflow-hidden">
                    <div className="absolute inset-0 bg-grid opacity-60 mask-fade-b" />
                    <div className="absolute -left-24 top-16 h-80 w-80 rounded-full bg-indigo-500/20 blur-3xl animate-float" />
                    <div className="absolute -right-24 top-24 h-80 w-80 rounded-full bg-fuchsia-500/15 blur-3xl animate-float" style={{ animationDelay: "-3s" }} />
                    <div className="relative mx-auto max-w-4xl px-4 pb-10 pt-32 text-center sm:px-6">
                        {anyOnSale ? (
                            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-[12px] font-black uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
                                <ShieldCheck className="h-3.5 w-3.5" aria-hidden />{tx(C.badgeOpen)}
                            </span>
                        ) : (
                            <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-[12px] font-black uppercase tracking-wider text-amber-700 dark:text-amber-300">
                                <Clock className="h-3.5 w-3.5" aria-hidden />{tx(C.badge)}
                            </span>
                        )}
                        {checkout && anyOnSale && (checkout.testMode || checkout.environment === "sandbox") ? (
                            <div className="mx-auto mt-4 flex max-w-xl flex-col gap-1 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-[12.5px] font-semibold text-amber-800 dark:text-amber-200" role="note">
                                {checkout.testMode ? <p>{tx(C.testMode)}</p> : null}
                                {checkout.environment === "sandbox" ? <p>{tx(C.sandbox)}</p> : null}
                            </div>
                        ) : null}
                        <h1 className="mt-5 text-5xl font-black tracking-tight sm:text-6xl">{tx(C.title)}</h1>
                        <p className="mx-auto mt-5 max-w-2xl text-[17px] leading-relaxed text-zinc-600 dark:text-zinc-400">{tx(anyOnSale ? C.subtitleOpen : C.subtitle)}</p>
                        {me ? (
                            <div className="mx-auto mt-7 inline-flex max-w-full flex-col items-center gap-2 rounded-2xl border border-zinc-200 bg-white/80 px-5 py-3.5 text-[14px] backdrop-blur dark:border-white/10 dark:bg-white/[0.04]">
                                <p className="font-bold">{tx(C.yourPlan, { plan: tx(PLAN_COPY[me.plan].name) })}{sourceDetail()}</p>
                                {me.blocked ? <p className="text-[13px] text-rose-600 dark:text-rose-400">{tx(C.blocked)}</p> : null}
                                {activating ? <p className="flex items-center gap-2 text-[13px] font-semibold text-indigo-600 dark:text-indigo-300" role="status"><LoaderCircle className="h-4 w-4 animate-spin" aria-hidden />{tx(C.activating)}</p> : null}
                                {billing?.endsAt ? (
                                    <div className="flex max-w-md flex-col items-center gap-2 rounded-xl bg-amber-500/10 px-3 py-2 text-[13px] text-amber-800 dark:text-amber-200">
                                        <p>{tx(C.endsAt, { date: date(billing.endsAt) })}</p>
                                        <button type="button" onClick={() => void keepSubscription()} disabled={busy !== null} className="font-bold underline underline-offset-2 disabled:opacity-60">
                                            {busy === "keep" ? <LoaderCircle className="me-1 inline h-3.5 w-3.5 animate-spin" aria-hidden /> : null}{tx(C.keep)}
                                        </button>
                                    </div>
                                ) : null}
                                {billing?.pastDue ? (
                                    <div className="flex max-w-md flex-col items-center gap-2 rounded-xl bg-rose-500/10 px-3 py-2 text-[13px] text-rose-700 dark:text-rose-300">
                                        <p>{tx(C.pastDue)}</p>
                                        <button type="button" onClick={() => void openPortal("updatePayment")} disabled={busy !== null} className="font-bold underline underline-offset-2 disabled:opacity-60">{tx(C.updatePayment)}</button>
                                    </div>
                                ) : null}
                                {billing?.paused ? <p className="text-[13px] text-zinc-500">{tx(C.paused)}</p> : null}
                                {billing?.canceled && me.source !== "paddle" ? <p className="text-[12.5px] text-zinc-500">{tx(C.ended)}</p> : null}
                                {billing?.renewsAt && !billing.pastDue ? <p className="text-[12.5px] text-zinc-500">{tx(C.renews, { date: date(billing.renewsAt) })}</p> : null}
                                {me.canManageBilling && checkout ? (
                                    <button type="button" onClick={() => void openPortal("overview")} disabled={busy !== null} className={quietButton} title={tx(C.manageHint)}>
                                        {busy === "portal" ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <CreditCard className="h-3.5 w-3.5" aria-hidden />}{tx(C.manage)}
                                    </button>
                                ) : null}
                                <div className="w-64 max-w-full">
                                    <p className="text-[12.5px] text-zinc-500 dark:text-zinc-400">{tx(C.aiToday, { used: me.aiUsedToday, limit: me.aiLimits.perDay })}</p>
                                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-zinc-200 dark:bg-white/10" role="progressbar" aria-valuemin={0} aria-valuemax={me.aiLimits.perDay} aria-valuenow={Math.min(me.aiUsedToday, me.aiLimits.perDay)}>
                                        <div className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-fuchsia-500" style={{ width: `${Math.min(100, (me.aiUsedToday / Math.max(1, me.aiLimits.perDay)) * 100)}%` }} />
                                    </div>
                                </div>
                            </div>
                        ) : null}
                        {failed ? <p className="mx-auto mt-5 max-w-xl text-[13px] text-zinc-500">{tx(C.unavailable)}</p> : null}
                    </div>
                </section>

                <section className="mx-auto max-w-6xl px-4 pb-16 sm:px-6">
                    {showPeriodToggle ? (
                        <div className="mb-6 flex justify-center">
                            <div role="radiogroup" aria-label={`${tx(C.monthly)} / ${tx(C.yearly)}`} className="inline-flex rounded-2xl border border-zinc-200 bg-zinc-50 p-1 dark:border-white/10 dark:bg-white/[0.04]">
                                {(["month", "year"] as const).map((value) => (
                                    <button
                                        key={value}
                                        type="button"
                                        role="radio"
                                        aria-checked={period === value}
                                        onClick={() => setPeriod(value)}
                                        className={`flex items-center gap-2 rounded-xl px-4 py-2 text-[14px] font-bold transition ${period === value ? "bg-white text-zinc-900 shadow dark:bg-zinc-800 dark:text-white" : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"}`}
                                    >
                                        {tx(value === "month" ? C.monthly : C.yearly)}
                                        {value === "year" && savings > 0 ? <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-black text-emerald-700 dark:text-emerald-300">{tx(C.save, { percent: savings })}</span> : null}
                                    </button>
                                ))}
                            </div>
                        </div>
                    ) : null}
                    {notice ? (
                        <div role={notice.tone === "error" ? "alert" : "status"} className={`mx-auto mb-5 max-w-2xl rounded-2xl px-4 py-3 text-center text-[13.5px] font-semibold ${notice.tone === "error" ? "bg-rose-500/10 text-rose-700 dark:text-rose-300" : notice.tone === "success" ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "bg-indigo-500/10 text-indigo-700 dark:text-indigo-300"}`}>
                            <p className="flex items-center justify-center gap-2">
                                {notice.tone === "success" ? <PartyPopper className="h-4 w-4 shrink-0" aria-hidden /> : null}{tx(notice.copy, notice.vars)}
                            </p>
                            {notice.hint ? <p className="mt-2 text-[12.5px] font-medium opacity-90">{tx(notice.hint)}</p> : null}
                            {notice.technical ? <p className="mt-2 break-all font-mono text-[11.5px] font-medium opacity-80">{tx(C.technical, notice.technical)}</p> : null}
                        </div>
                    ) : null}
                    <div className="grid gap-5 md:grid-cols-3 md:items-stretch">
                        {PLAN_IDS.map((plan, index) => {
                            const accent = ACCENT[plan];
                            const Icon = accent.icon;
                            const copy = PLAN_COPY[plan];
                            const paid = plan === "free" ? null : plan;
                            const selling = paid ? onSale(paid).length > 0 : false;
                            const interval = paid ? intervalFor(paid) : period;
                            const live = paid && selling ? checkout?.prices[paid][interval] ?? null : null;
                            const price = paid ? catalog.plans[paid] : null;
                            const monthly = price ? discountedPrice(price.monthly, price.discountPercent) : null;
                            const yearly = price ? discountedPrice(price.yearly, price.discountPercent) : null;
                            const current = me?.plan === plan;
                            const card = (
                                <div className={`relative flex h-full flex-col rounded-[1.6rem] border bg-white p-6 shadow-sm dark:bg-zinc-900 ${accent.ring}`}>
                                    {plan === "pro" ? <span className="absolute -top-3 start-6 rounded-full bg-gradient-to-r from-fuchsia-500 to-amber-500 px-3 py-1 text-[11px] font-black uppercase tracking-wide text-white shadow-lg">{tx(C.popular)}</span> : null}
                                    <div className="flex items-center justify-between gap-3">
                                        <span className={`grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br text-white shadow-lg ${accent.gradient}`}><Icon className="h-5 w-5" aria-hidden /></span>
                                        {paid && !selling ? <span className="rounded-full bg-amber-500/15 px-2.5 py-1 text-[11px] font-black uppercase tracking-wide text-amber-700 dark:text-amber-300">{tx(C.badge)}</span> : null}
                                        {live?.trialDays ? <span className="rounded-full bg-emerald-500/15 px-2.5 py-1 text-[11px] font-black uppercase tracking-wide text-emerald-700 dark:text-emerald-300">{tx(C.trial, { days: live.trialDays })}</span> : null}
                                    </div>
                                    <h2 className="mt-4 text-2xl font-black">{tx(copy.name)}</h2>
                                    <p className="mt-1 min-h-[2.75rem] text-[14px] leading-snug text-zinc-500 dark:text-zinc-400">{tx(copy.tagline)}</p>
                                    <div className="mt-4 min-h-[4.5rem]">
                                        {plan === "free" ? (
                                            <p className="flex items-baseline gap-1.5"><span className="text-4xl font-black">{money(0)}</span><span className="text-[13px] text-zinc-500">{tx(C.forever)}</span></p>
                                        ) : selling ? (
                                            live ? (
                                                <>
                                                    <p className="flex flex-wrap items-baseline gap-x-2">
                                                        <span className="text-4xl font-black tabular-nums">{live.total}</span>
                                                        <span className="text-[13px] text-zinc-500">{tx(interval === "year" ? C.perYearShort : C.perMonth)}</span>
                                                    </p>
                                                    {interval === "year" ? <p className="mt-1 text-[12.5px] text-zinc-500">{tx(C.monthlyEquivalent, { price: formatMoney(Number(live.amount) / 12, live.currency, locale) })}</p> : null}
                                                    {interval !== period ? <p className="mt-1 text-[12px] text-zinc-500">{tx(C.onlyInterval, { interval: tx(interval === "year" ? C.yearly : C.monthly).toLocaleLowerCase(locale) })}</p> : null}
                                                </>
                                            ) : (
                                                <p className="pt-2 text-[15px] font-bold text-zinc-500 dark:text-zinc-400">{tx(C.priceAtCheckout)}</p>
                                            )
                                        ) : monthly !== null ? (
                                            <>
                                                <p className="flex flex-wrap items-baseline gap-x-2">
                                                    <span className="text-4xl font-black tabular-nums">{money(monthly)}</span>
                                                    <span className="text-[13px] text-zinc-500">{tx(C.perMonth)}</span>
                                                    {price && price.discountPercent > 0 && price.monthly !== null ? <span className="text-[14px] text-zinc-400 line-through tabular-nums">{money(price.monthly)}</span> : null}
                                                </p>
                                                <p className="mt-1 flex flex-wrap items-center gap-2 text-[12.5px] text-zinc-500">
                                                    {yearly !== null ? <span>{tx(C.perYear, { price: money(yearly) })}</span> : null}
                                                    {price && price.discountPercent > 0 ? <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 font-bold text-emerald-700 dark:text-emerald-300">{tx(C.discount, { percent: price.discountPercent })}</span> : null}
                                                </p>
                                            </>
                                        ) : (
                                            <p className="pt-2 text-[15px] font-bold text-zinc-500 dark:text-zinc-400">{tx(C.priceSoon)}</p>
                                        )}
                                    </div>
                                    <ul className="mt-5 flex-1 space-y-2.5 text-[14px]">
                                        {copy.features.map((feature) => (
                                            <li key={feature.text.EN} className="flex items-start gap-2.5">
                                                <span className={`mt-0.5 grid h-4.5 w-4.5 shrink-0 place-items-center rounded-full ${feature.planned ? "bg-zinc-200 text-zinc-500 dark:bg-white/10" : "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"}`}><Check className="h-3 w-3" strokeWidth={3} aria-hidden /></span>
                                                <span className="leading-snug text-zinc-700 dark:text-zinc-300">
                                                    {tx(feature.text)}
                                                    {feature.planned ? <span className="ms-1.5 rounded bg-zinc-100 px-1.5 py-0.5 text-[10.5px] font-bold uppercase text-zinc-500 dark:bg-white/10 dark:text-zinc-400">{tx(C.planned)}</span> : null}
                                                </span>
                                            </li>
                                        ))}
                                    </ul>
                                    <div className="mt-6">
                                        {plan === "free" ? (
                                            current ? (
                                                <p className="flex h-11 items-center justify-center rounded-xl border border-zinc-200 text-[14px] font-bold text-zinc-500 dark:border-white/10">{tx(C.current)}</p>
                                            ) : liveSubscription && !billing?.endsAt ? (
                                                <button type="button" onClick={() => void openPortal("cancel")} disabled={busy !== null} className="flex min-h-11 w-full items-center justify-center rounded-xl border border-zinc-200 px-3 text-center text-[13px] font-bold text-zinc-600 transition hover:bg-zinc-50 disabled:opacity-60 dark:border-white/10 dark:text-zinc-300 dark:hover:bg-white/5">{tx(C.cancelSubscription)}</button>
                                            ) : (
                                                <Link href={signedIn ? "/dashboard" : "/signup"} className="flex h-11 items-center justify-center rounded-xl bg-zinc-900 text-[14px] font-bold text-white transition hover:-translate-y-0.5 dark:bg-white dark:text-zinc-900">{tx(C.startFree)}</Link>
                                            )
                                        ) : selling ? (
                                            paidButton(plan, accent.gradient, current)
                                        ) : current ? (
                                            <p className="flex h-11 items-center justify-center rounded-xl border border-emerald-500/40 bg-emerald-500/10 text-[14px] font-bold text-emerald-700 dark:text-emerald-300">{tx(C.current)}</p>
                                        ) : (
                                            waitlistButton(plan, accent.gradient)
                                        )}
                                    </div>
                                </div>
                            );
                            return (
                                <motion.div key={plan} initial={{ opacity: 0, y: 18 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: index * 0.08, duration: 0.45 }} className="h-full">
                                    {plan === "pro" ? <div className="h-full rounded-[1.7rem] bg-gradient-to-br from-fuchsia-500 via-violet-500 to-amber-500 p-[1.5px] shadow-xl shadow-fuchsia-500/15">{card}</div> : card}
                                </motion.div>
                            );
                        })}
                    </div>
                    <p className="mt-6 flex items-center justify-center gap-2 text-center text-[12.5px] text-zinc-500 dark:text-zinc-400">
                        <Ticket className="h-4 w-4" aria-hidden />
                        {tx({ TR: "Hanogt AI sınırları: Ücretsiz {free}, Plus {plus}, Pro {pro} mesaj/gün.", EN: "Hanogt AI limits: Free {free}, Plus {plus}, Pro {pro} messages/day." }, { free: PLAN_AI_LIMITS.free.perDay, plus: PLAN_AI_LIMITS.plus.perDay, pro: PLAN_AI_LIMITS.pro.perDay })}
                    </p>
                    {anyOnSale ? (
                        <p className="mx-auto mt-3 max-w-2xl text-center text-[12px] leading-relaxed text-zinc-500 dark:text-zinc-400">
                            {tx(C.taxNote)}{" "}
                            <Link href="/refund-policy" className="font-semibold text-indigo-600 underline-offset-2 hover:underline dark:text-indigo-300">{tx(C.refundPolicy)}</Link>
                            {" · "}
                            <Link href="/terms-of-use" className="font-semibold text-indigo-600 underline-offset-2 hover:underline dark:text-indigo-300">{tx(C.terms)}</Link>
                        </p>
                    ) : null}
                </section>

                <section aria-labelledby="plans-faq" className="mx-auto max-w-3xl px-4 pb-24 sm:px-6">
                    <h2 id="plans-faq" className="text-center text-3xl font-black tracking-tight">{tx(C.faqTitle)}</h2>
                    <div className="mt-8 space-y-3">
                        {faq.map(([question, answer]) => (
                            <details key={question.EN} className="group rounded-2xl border border-zinc-200 bg-zinc-50 p-5 open:bg-white dark:border-white/10 dark:bg-white/[0.03] dark:open:bg-zinc-900">
                                <summary className="cursor-pointer list-none text-[15.5px] font-bold marker:hidden">{tx(question)}</summary>
                                <p className="mt-3 text-[14.5px] leading-relaxed text-zinc-600 dark:text-zinc-400">
                                    {tx(answer)}
                                    {answer === C.ba3 ? <> <Link href="/refund-policy" className="font-semibold text-indigo-600 underline-offset-2 hover:underline dark:text-indigo-300">{tx(C.refundPolicy)}</Link></> : null}
                                </p>
                            </details>
                        ))}
                    </div>
                </section>
            </main>
            <SiteFooter />
            {change && billing?.plan && billing.interval ? (
                <ChangePlanDialog
                    from={{ name: tx(PLAN_COPY[billing.plan].name), interval: billing.interval }}
                    to={{ name: tx(PLAN_COPY[change.plan].name), interval: change.interval }}
                    preview={change.preview}
                    error={change.error}
                    busy={busy === "change"}
                    onConfirm={() => void confirmChange()}
                    onClose={() => setChange(null)}
                />
            ) : null}
        </div>
    );
}
