"use client";

import { motion } from "framer-motion";
import { Bell, BellRing, Check, Clock, Crown, LoaderCircle, Sparkles, Ticket, Zap } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import Header from "@/components/Header";
import { useRawSession } from "@/components/Provider";
import SiteFooter from "@/components/SiteFooter";
import { useI18n, type Copy } from "@/lib/i18n";
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
    title: { TR: "Hanogt Codev Planları", EN: "Hanogt Codev Plans" },
    subtitle: { TR: "Hanogt Codev ücretsiz kalacak. Daha fazlasını isteyenler için Plus ve Pro hazırlanıyor; şu anda ödeme alınmıyor ve hiçbir kart bilgisi istenmiyor.", EN: "Hanogt Codev stays free. Plus and Pro are being prepared for people who want more; no payments are taken right now and no card details are asked for." },
    yourPlan: { TR: "Planın: {plan}", EN: "Your plan: {plan}" },
    assigned: { TR: "Hanogt ekibi tarafından tanımlandı", EN: "Assigned by the Hanogt team" },
    until: { TR: "{date} tarihine kadar", EN: "until {date}" },
    blocked: { TR: "Plan avantajların şu anda kullanıma kapalı. Bir sorun olduğunu düşünüyorsan destek talebi aç.", EN: "Your plan benefits are switched off right now. If you think that's a mistake, open a support ticket." },
    aiToday: { TR: "Bugün Hanogt AI: {used} / {limit} mesaj", EN: "Hanogt AI today: {used} / {limit} messages" },
    perMonth: { TR: "/ay", EN: "/month" },
    perYear: { TR: "Yıllık {price}", EN: "{price} per year" },
    priceSoon: { TR: "Fiyat yakında açıklanacak", EN: "Price to be announced" },
    free: { TR: "0 ₺", EN: "₺0" },
    forever: { TR: "her zaman", EN: "forever" },
    current: { TR: "Şu anki planın", EN: "Your current plan" },
    startFree: { TR: "Ücretsiz başla", EN: "Start for free" },
    notify: { TR: "Açılınca haber ver", EN: "Notify me when it opens" },
    notified: { TR: "Haber vereceğiz", EN: "We'll let you know" },
    notifyHint: { TR: "Bildirimden çıkmak için tekrar bas.", EN: "Press again to stop the notification." },
    signInToNotify: { TR: "Haber almak için giriş yap", EN: "Sign in to get notified" },
    planned: { TR: "Planlanıyor", EN: "Planned" },
    popular: { TR: "En kapsamlı", EN: "Most complete" },
    discount: { TR: "%{percent} indirim", EN: "{percent}% off" },
    failed: { TR: "İşlem tamamlanamadı. Biraz sonra tekrar dene.", EN: "That didn't work. Try again in a moment." },
    unavailable: { TR: "Plan bilgileri şu anda alınamıyor; aşağıdaki fiyatlar henüz kesinleşmedi.", EN: "Plan details can't be loaded right now; the prices below aren't final yet." },
    faqTitle: { TR: "Sık sorulanlar", EN: "Questions" },
    q1: { TR: "Ödeme ne zaman başlayacak?", EN: "When will payments start?" },
    a1: { TR: "Henüz bir tarih yok. Planlar açıldığında bu sayfada, güncelleme günlüğünde ve \"Açılınca haber ver\" dediysen bildirimlerinde duyuracağız. O güne kadar hiçbir ücret alınmaz.", EN: "There's no date yet. When plans open we'll announce it on this page, in the changelog and, if you pressed \"Notify me\", in your notifications. Until then nothing is charged." },
    q2: { TR: "Ücretsiz plan kalkacak mı?", EN: "Will the free plan go away?" },
    a2: { TR: "Hayır. Kod editörü, oyun motoru, Arcade, Media, Hanogt Social ve Hanogt AI ücretsiz planda kalmaya devam edecek.", EN: "No. The code editor, the game engine, the Arcade, Media, Hanogt Social and Hanogt AI stay in the free plan." },
    q3: { TR: "Kupon kodum var, ne yapmalıyım?", EN: "I have a coupon code. What do I do?" },
    a3: { TR: "Kodunu sakla; planlar açıldığında satın alma sırasında kullanabileceksin. Kuponların bitiş tarihi kupon verilirken belirtilir.", EN: "Keep it; you'll be able to use it at checkout once plans open. A coupon's expiry date is given with the coupon." },
    q4: { TR: "Planım nasıl tanımlandı?", EN: "How did I get a plan?" },
    a4: { TR: "Ekip; testçilere, katkı verenlere ve yarışma kazananlarına planı elle tanımlayabilir. Bugün planın canlı avantajı daha yüksek Hanogt AI sınırı ve destek taleplerinde önceliktir.", EN: "The team can assign a plan by hand to testers, contributors and contest winners. Today, a plan's live benefits are a higher Hanogt AI limit and priority on support tickets." },
} satisfies Record<string, Copy>;

const ACCENT: Record<PlanId, { ring: string; icon: typeof Zap; gradient: string }> = {
    free: { ring: "border-zinc-200 dark:border-white/10", icon: Sparkles, gradient: "from-zinc-500 to-zinc-700" },
    plus: { ring: "border-indigo-300/70 dark:border-indigo-400/30", icon: Zap, gradient: "from-indigo-500 to-sky-500" },
    pro: { ring: "border-transparent", icon: Crown, gradient: "from-fuchsia-500 to-amber-500" },
};

export default function PlansPage() {
    const { tx, locale } = useI18n();
    const auth = useRawSession();
    const signedIn = auth.status === "authenticated";
    const [data, setData] = useState<PlansResponse | null>(null);
    const [failed, setFailed] = useState(false);
    const [busy, setBusy] = useState<PaidPlanId | null>(null);
    const [notice, setNotice] = useState("");

    useEffect(() => {
        if (auth.status === "loading") return;
        let active = true;
        fetch("/api/plans", { cache: "no-store", credentials: "same-origin" })
            .then((response) => (response.ok ? response.json() as Promise<PlansResponse> : null))
            .then((payload) => {
                if (!active) return;
                setData(payload);
                setFailed(!payload);
            })
            .catch(() => {
                if (active) setFailed(true);
            });
        return () => {
            active = false;
        };
    }, [auth.status]);

    const catalog = data?.catalog ?? DEFAULT_PLAN_CATALOG;
    const me = data?.me ?? null;
    const money = (value: number) => {
        try {
            return new Intl.NumberFormat(locale, { style: "currency", currency: "TRY", maximumFractionDigits: value % 1 ? 2 : 0 }).format(value);
        } catch {
            return `${value} ₺`;
        }
    };
    const date = (iso: string) => {
        try {
            return new Intl.DateTimeFormat(locale, { day: "numeric", month: "long", year: "numeric" }).format(new Date(iso));
        } catch {
            return iso.slice(0, 10);
        }
    };

    const toggleWaitlist = async (plan: PaidPlanId) => {
        if (!me) return;
        const join = !me.waitlist.includes(plan);
        setBusy(plan);
        setNotice("");
        try {
            const response = await fetch("/api/plans", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "same-origin",
                body: JSON.stringify({ action: "waitlist", plan, join }),
            });
            const payload = await response.json().catch(() => ({})) as { waitlist?: PaidPlanId[] };
            if (!response.ok || !Array.isArray(payload.waitlist)) throw new Error("failed");
            setData((current) => (current?.me ? { ...current, me: { ...current.me, waitlist: payload.waitlist! } } : current));
        } catch {
            setNotice(tx(C.failed));
        } finally {
            setBusy(null);
        }
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
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-[12px] font-black uppercase tracking-wider text-amber-700 dark:text-amber-300">
                            <Clock className="h-3.5 w-3.5" aria-hidden />{tx(C.badge)}
                        </span>
                        <h1 className="mt-5 text-5xl font-black tracking-tight sm:text-6xl">{tx(C.title)}</h1>
                        <p className="mx-auto mt-5 max-w-2xl text-[17px] leading-relaxed text-zinc-600 dark:text-zinc-400">{tx(C.subtitle)}</p>
                        {me ? (
                            <div className="mx-auto mt-7 inline-flex max-w-full flex-col items-center gap-1.5 rounded-2xl border border-zinc-200 bg-white/80 px-5 py-3 text-[14px] backdrop-blur dark:border-white/10 dark:bg-white/[0.04]">
                                <p className="font-bold">
                                    {tx(C.yourPlan, { plan: tx(PLAN_COPY[me.plan].name) })}
                                    {me.plan !== "free" ? <span className="font-medium text-zinc-500 dark:text-zinc-400"> · {tx(C.assigned)}{me.expiresAt ? ` · ${tx(C.until, { date: date(me.expiresAt) })}` : ""}</span> : null}
                                </p>
                                {me.blocked ? <p className="text-[13px] text-rose-600 dark:text-rose-400">{tx(C.blocked)}</p> : null}
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
                    <div className="grid gap-5 md:grid-cols-3 md:items-stretch">
                        {PLAN_IDS.map((plan, index) => {
                            const accent = ACCENT[plan];
                            const Icon = accent.icon;
                            const copy = PLAN_COPY[plan];
                            const price = plan === "free" ? null : catalog.plans[plan];
                            const monthly = price ? discountedPrice(price.monthly, price.discountPercent) : null;
                            const yearly = price ? discountedPrice(price.yearly, price.discountPercent) : null;
                            const current = me?.plan === plan;
                            const waiting = plan !== "free" && Boolean(me?.waitlist.includes(plan));
                            const card = (
                                <div className={`relative flex h-full flex-col rounded-[1.6rem] border bg-white p-6 shadow-sm dark:bg-zinc-900 ${accent.ring}`}>
                                    {plan === "pro" ? <span className="absolute -top-3 start-6 rounded-full bg-gradient-to-r from-fuchsia-500 to-amber-500 px-3 py-1 text-[11px] font-black uppercase tracking-wide text-white shadow-lg">{tx(C.popular)}</span> : null}
                                    <div className="flex items-center justify-between gap-3">
                                        <span className={`grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br text-white shadow-lg ${accent.gradient}`}><Icon className="h-5 w-5" aria-hidden /></span>
                                        {plan !== "free" ? <span className="rounded-full bg-amber-500/15 px-2.5 py-1 text-[11px] font-black uppercase tracking-wide text-amber-700 dark:text-amber-300">{tx(C.badge)}</span> : null}
                                    </div>
                                    <h2 className="mt-4 text-2xl font-black">{tx(copy.name)}</h2>
                                    <p className="mt-1 min-h-[2.75rem] text-[14px] leading-snug text-zinc-500 dark:text-zinc-400">{tx(copy.tagline)}</p>
                                    <div className="mt-4 min-h-[4.5rem]">
                                        {plan === "free" ? (
                                            <p className="flex items-baseline gap-1.5"><span className="text-4xl font-black">{tx(C.free)}</span><span className="text-[13px] text-zinc-500">{tx(C.forever)}</span></p>
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
                                            ) : (
                                                <Link href={signedIn ? "/dashboard" : "/signup"} className="flex h-11 items-center justify-center rounded-xl bg-zinc-900 text-[14px] font-bold text-white transition hover:-translate-y-0.5 dark:bg-white dark:text-zinc-900">{tx(C.startFree)}</Link>
                                            )
                                        ) : current ? (
                                            <p className="flex h-11 items-center justify-center rounded-xl border border-emerald-500/40 bg-emerald-500/10 text-[14px] font-bold text-emerald-700 dark:text-emerald-300">{tx(C.current)}</p>
                                        ) : me ? (
                                            <>
                                                <button
                                                    type="button"
                                                    onClick={() => void toggleWaitlist(plan)}
                                                    disabled={busy !== null}
                                                    aria-pressed={waiting}
                                                    className={`flex h-11 w-full items-center justify-center gap-2 rounded-xl text-[14px] font-bold transition disabled:opacity-60 ${waiting ? "border border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : `bg-gradient-to-r text-white shadow-lg hover:-translate-y-0.5 ${accent.gradient}`}`}
                                                >
                                                    {busy === plan ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden /> : waiting ? <BellRing className="h-4 w-4" aria-hidden /> : <Bell className="h-4 w-4" aria-hidden />}
                                                    {tx(waiting ? C.notified : C.notify)}
                                                </button>
                                                {waiting ? <p className="mt-1.5 text-center text-[11.5px] text-zinc-500">{tx(C.notifyHint)}</p> : null}
                                            </>
                                        ) : (
                                            <Link href="/login?callbackUrl=%2Fplans" className={`flex h-11 items-center justify-center gap-2 rounded-xl bg-gradient-to-r text-[14px] font-bold text-white shadow-lg transition hover:-translate-y-0.5 ${accent.gradient}`}><Bell className="h-4 w-4" aria-hidden />{tx(C.signInToNotify)}</Link>
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
                    {notice ? <p role="alert" className="mt-4 text-center text-[13px] font-semibold text-rose-600 dark:text-rose-400">{notice}</p> : null}
                    <p className="mt-6 flex items-center justify-center gap-2 text-center text-[12.5px] text-zinc-500 dark:text-zinc-400">
                        <Ticket className="h-4 w-4" aria-hidden />
                        {tx({ TR: "Hanogt AI sınırları: Ücretsiz {free}, Plus {plus}, Pro {pro} mesaj/gün.", EN: "Hanogt AI limits: Free {free}, Plus {plus}, Pro {pro} messages/day." }, { free: PLAN_AI_LIMITS.free.perDay, plus: PLAN_AI_LIMITS.plus.perDay, pro: PLAN_AI_LIMITS.pro.perDay })}
                    </p>
                </section>

                <section aria-labelledby="plans-faq" className="mx-auto max-w-3xl px-4 pb-24 sm:px-6">
                    <h2 id="plans-faq" className="text-center text-3xl font-black tracking-tight">{tx(C.faqTitle)}</h2>
                    <div className="mt-8 space-y-3">
                        {[[C.q1, C.a1], [C.q2, C.a2], [C.q3, C.a3], [C.q4, C.a4]].map(([question, answer]) => (
                            <details key={question.EN} className="group rounded-2xl border border-zinc-200 bg-zinc-50 p-5 open:bg-white dark:border-white/10 dark:bg-white/[0.03] dark:open:bg-zinc-900">
                                <summary className="cursor-pointer list-none text-[15.5px] font-bold marker:hidden">{tx(question)}</summary>
                                <p className="mt-3 text-[14.5px] leading-relaxed text-zinc-600 dark:text-zinc-400">{tx(answer)}</p>
                            </details>
                        ))}
                    </div>
                </section>
            </main>
            <SiteFooter />
        </div>
    );
}
