"use client";

import { Ban, BadgePercent, Bot, Crown, History, Plus, RefreshCw, RotateCcw, Search, Tag, Trash2, UserCog } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useI18n, type Copy } from "@/lib/i18n";
import { AI_BONUS_MAX, GRANT_DAYS_MAX, PAID_PLAN_IDS, PLAN_COPY, PLAN_IDS, PRICE_MAX, type PaidPlanId, type PlanId, type PlanPrice } from "@/lib/plans";
import { adminPost, adminRequest, type ApiFailure } from "./api";
import { COMMON } from "./copy";
import { formatDateTime, formatNumber, useAdminResource } from "./hooks";
import type { AdminCoupon, AdminPlansResponse, AdminUserPlanResponse } from "./types";
import { Badge, Button, ConfirmDialog, ErrorNotice, IconButton, INPUT_CLASS, LoadingRows, Notice, Panel, SectionHeader, Switch, cx, useErrorText, useToast } from "./ui";

const C = {
    title: { TR: "Abonelikler", EN: "Subscriptions" },
    description: { TR: "Planlar \"Yakında\" olarak görünüyor; ödeme alınmıyor. Fiyatları, indirimleri ve kuponları hazırla, kişilere elle plan tanımla ve Hanogt AI sınırlarını yönet.", EN: "Plans show as \"Coming soon\" and no payments are taken. Prepare prices, discounts and coupons, assign plans to people by hand and manage Hanogt AI limits." },
    prices: { TR: "Planlar ve fiyatlar", EN: "Plans and prices" },
    pricesHint: { TR: "Fiyatlar Planlar sayfasında yalnızca \"Görünür\" açıkken gösterilir.", EN: "Prices appear on the Plans page only while \"Visible\" is on." },
    monthly: { TR: "Aylık (₺)", EN: "Monthly (TRY)" },
    yearly: { TR: "Yıllık (₺)", EN: "Yearly (TRY)" },
    discount: { TR: "İndirim (%)", EN: "Discount (%)" },
    visible: { TR: "Görünür", EN: "Visible" },
    empty: { TR: "Boş = açıklanmadı", EN: "Empty = not announced" },
    savePrice: { TR: "{plan} fiyatını kaydet", EN: "Save {plan} price" },
    priceSaved: { TR: "Fiyat kaydedildi.", EN: "Price saved." },
    history: { TR: "Fiyat geçmişi", EN: "Price history" },
    noHistory: { TR: "Henüz fiyat değişikliği yok.", EN: "No price changes yet." },
    notAnnounced: { TR: "açıklanmadı", EN: "not announced" },
    waitlist: { TR: "Haber bekleyenler: Plus {plus} · Pro {pro}", EN: "Waiting to hear: Plus {plus} · Pro {pro}" },
    coupons: { TR: "Kuponlar", EN: "Coupons" },
    couponsHint: { TR: "Planlar açıldığında satın almada kullanılacak indirim kodları.", EN: "Discount codes to be used at checkout once plans open." },
    code: { TR: "Kod", EN: "Code" },
    percentOff: { TR: "İndirim (%)", EN: "Discount (%)" },
    plan: { TR: "Plan", EN: "Plan" },
    anyPlan: { TR: "Tüm planlar", EN: "All plans" },
    maxUses: { TR: "En çok kullanım", EN: "Max uses" },
    unlimited: { TR: "Sınırsız", EN: "Unlimited" },
    expires: { TR: "Bitiş", EN: "Expires" },
    never: { TR: "Süresiz", EN: "No expiry" },
    note: { TR: "Not", EN: "Note" },
    createCoupon: { TR: "Kupon oluştur", EN: "Create coupon" },
    couponCreated: { TR: "Kupon oluşturuldu.", EN: "Coupon created." },
    noCoupons: { TR: "Henüz kupon yok.", EN: "No coupons yet." },
    used: { TR: "{used}/{max} kullanıldı", EN: "{used}/{max} used" },
    deleteCoupon: { TR: "Kuponu sil", EN: "Delete coupon" },
    deleteCouponTitle: { TR: "{code} kuponu silinsin mi?", EN: "Delete coupon {code}?" },
    deleteCouponBody: { TR: "Kod artık kullanılamaz. Bu işlem geri alınamaz.", EN: "The code can no longer be used. This can't be undone." },
    couponActive: { TR: "Kupon etkin", EN: "Coupon active" },
    people: { TR: "Kişinin planı", EN: "A person's plan" },
    peopleHint: { TR: "E-posta ile bul; plan tanımla, engelle, Hanogt AI sınırını sıfırla veya ek hak ver.", EN: "Find by e-mail; assign a plan, block it, reset the Hanogt AI limit or grant extra quota." },
    emailPlaceholder: { TR: "kullanici@ornek.com", EN: "user@example.com" },
    find: { TR: "Bul", EN: "Find" },
    noAccount: { TR: "Bu e-postayla bir hesap yok.", EN: "There's no account with this e-mail." },
    effective: { TR: "Geçerli plan: {plan}", EN: "Plan in effect: {plan}" },
    assignedPlan: { TR: "Tanımlı plan: {plan}", EN: "Assigned plan: {plan}" },
    blocked: { TR: "Engelli", EN: "Blocked" },
    until: { TR: "{date} tarihine kadar", EN: "until {date}" },
    aiLimits: { TR: "Hanogt AI: dakikada {minute}, günde {day} mesaj", EN: "Hanogt AI: {minute} a minute, {day} a day" },
    aiUsage: { TR: "Bugün kullanılan: {used} / {day}", EN: "Used today: {used} / {day}" },
    bonus: { TR: "Ek hak: günde +{extra}, {date} tarihine kadar", EN: "Extra quota: +{extra} a day until {date}" },
    setPlan: { TR: "Planı uygula", EN: "Apply plan" },
    days: { TR: "Süre (gün, 0 = süresiz)", EN: "Duration (days, 0 = no expiry)" },
    planSaved: { TR: "Plan güncellendi.", EN: "Plan updated." },
    block: { TR: "Plan kullanımını engelle", EN: "Block plan use" },
    unblock: { TR: "Engeli kaldır", EN: "Lift the block" },
    blockedNow: { TR: "Plan kullanımı engellendi.", EN: "Plan use blocked." },
    unblockedNow: { TR: "Engel kaldırıldı.", EN: "Block lifted." },
    remove: { TR: "Planı kaldır", EN: "Remove plan" },
    removeTitle: { TR: "{email} için plan kaldırılsın mı?", EN: "Remove the plan for {email}?" },
    removeBody: { TR: "Kişi Ücretsiz plana döner; ek Hanogt AI hakları da silinir.", EN: "They go back to Free; extra Hanogt AI quota is removed too." },
    removed: { TR: "Plan kaldırıldı.", EN: "Plan removed." },
    resetAi: { TR: "Hanogt AI sınırını sıfırla", EN: "Reset the Hanogt AI limit" },
    resetDone: { TR: "Hanogt AI sayaçları sıfırlandı.", EN: "Hanogt AI counters reset." },
    grantTitle: { TR: "Ek Hanogt AI hakkı", EN: "Extra Hanogt AI quota" },
    extraDaily: { TR: "Günlük ek mesaj", EN: "Extra messages a day" },
    grantDays: { TR: "Kaç gün", EN: "For how many days" },
    grant: { TR: "Hakkı ver", EN: "Grant" },
    granted: { TR: "Ek hak kaydedildi.", EN: "Extra quota saved." },
} satisfies Record<string, Copy>;

type PriceDraft = { monthly: string; yearly: string; discountPercent: string; visible: boolean };

function priceDraft(price: PlanPrice): PriceDraft {
    return { monthly: price.monthly === null ? "" : String(price.monthly), yearly: price.yearly === null ? "" : String(price.yearly), discountPercent: String(price.discountPercent), visible: price.visible };
}

function parsePrice(value: string) {
    const trimmed = value.trim().replace(",", ".");
    return trimmed === "" ? null : Number(trimmed);
}

function PriceEditor({ plan, price, onSaved }: { plan: PaidPlanId; price: PlanPrice; onSaved: (data: AdminPlansResponse) => void }) {
    const { tx } = useI18n();
    const toast = useToast();
    const errorText = useErrorText();
    const [draft, setDraft] = useState(() => priceDraft(price));
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<ApiFailure | null>(null);

    const save = async (event: FormEvent) => {
        event.preventDefault();
        setBusy(true);
        setError(null);
        const result = await adminPost<AdminPlansResponse>("/api/admin/plans", {
            action: "setPrice",
            plan,
            monthly: parsePrice(draft.monthly),
            yearly: parsePrice(draft.yearly),
            discountPercent: Number(draft.discountPercent || 0),
            visible: draft.visible,
        });
        setBusy(false);
        if (!result.ok) {
            setError(result);
            return;
        }
        toast("success", tx(C.priceSaved));
        onSaved(result.data);
    };

    return (
        <form onSubmit={(event) => void save(event)} className="rounded-2xl border border-zinc-200 p-4 dark:border-white/10">
            <div className="flex items-center justify-between gap-3">
                <p className="flex items-center gap-2 text-[15px] font-black"><Crown className={cx("h-4 w-4", plan === "pro" ? "text-fuchsia-500" : "text-indigo-500")} aria-hidden="true" />{tx(PLAN_COPY[plan].name)}</p>
                <label className="flex items-center gap-2 text-[13px] font-semibold text-zinc-600 dark:text-zinc-300">
                    {tx(C.visible)}
                    <Switch checked={draft.visible} onChange={(visible) => setDraft((current) => ({ ...current, visible }))} label={tx(C.visible)} />
                </label>
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
                {([["monthly", C.monthly], ["yearly", C.yearly], ["discountPercent", C.discount]] as const).map(([key, label]) => (
                    <label key={key} className="block text-[12px] font-semibold text-zinc-500 dark:text-zinc-400">
                        {tx(label)}
                        <input
                            inputMode="decimal"
                            value={draft[key]}
                            placeholder={key === "discountPercent" ? "0" : "—"}
                            onChange={(event) => setDraft((current) => ({ ...current, [key]: event.target.value }))}
                            className={cx(INPUT_CLASS, "mt-1 tabular-nums")}
                            aria-describedby={`price-hint-${plan}`}
                        />
                    </label>
                ))}
            </div>
            <p id={`price-hint-${plan}`} className="mt-2 text-[11.5px] text-zinc-500">{`${tx(C.empty)} · 0 – ${formatNumber(PRICE_MAX, "tr-TR")} ₺ · %0 – 90`}</p>
            {error ? <p role="alert" className="mt-2 text-[12.5px] font-semibold text-red-600 dark:text-red-400">{errorText(error)}</p> : null}
            <div className="mt-3 flex justify-end">
                <Button type="submit" variant="primary" size="sm" busy={busy}>{tx(C.savePrice, { plan: tx(PLAN_COPY[plan].name) })}</Button>
            </div>
        </form>
    );
}

function CouponForm({ onCreated }: { onCreated: (data: AdminPlansResponse) => void }) {
    const { tx } = useI18n();
    const toast = useToast();
    const errorText = useErrorText();
    const [draft, setDraft] = useState({ code: "", percentOff: "10", plan: "any", maxUses: "", expiresAt: "", note: "" });
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<ApiFailure | null>(null);

    const create = async (event: FormEvent) => {
        event.preventDefault();
        setBusy(true);
        setError(null);
        const result = await adminPost<AdminPlansResponse>("/api/admin/plans", {
            action: "createCoupon",
            code: draft.code,
            percentOff: Number(draft.percentOff),
            plan: draft.plan,
            maxUses: draft.maxUses.trim() ? Number(draft.maxUses) : null,
            expiresAt: draft.expiresAt ? new Date(`${draft.expiresAt}T23:59:59`).toISOString() : null,
            note: draft.note,
        });
        setBusy(false);
        if (!result.ok) {
            setError(result);
            return;
        }
        toast("success", tx(C.couponCreated));
        setDraft({ code: "", percentOff: "10", plan: "any", maxUses: "", expiresAt: "", note: "" });
        onCreated(result.data);
    };

    const field = "block text-[12px] font-semibold text-zinc-500 dark:text-zinc-400";
    return (
        <form onSubmit={(event) => void create(event)} className="grid gap-3 rounded-2xl border border-dashed border-zinc-300 p-4 sm:grid-cols-2 lg:grid-cols-3 dark:border-white/15">
            <label className={field}>{tx(C.code)}<input value={draft.code} onChange={(event) => setDraft({ ...draft, code: event.target.value.toUpperCase() })} maxLength={24} placeholder="HANOGT20" className={cx(INPUT_CLASS, "mt-1 font-mono uppercase")} required /></label>
            <label className={field}>{tx(C.percentOff)}<input type="number" min={1} max={100} value={draft.percentOff} onChange={(event) => setDraft({ ...draft, percentOff: event.target.value })} className={cx(INPUT_CLASS, "mt-1")} required /></label>
            <label className={field}>{tx(C.plan)}
                <select value={draft.plan} onChange={(event) => setDraft({ ...draft, plan: event.target.value })} className={cx(INPUT_CLASS, "mt-1")}>
                    <option value="any">{tx(C.anyPlan)}</option>
                    {PAID_PLAN_IDS.map((plan) => <option key={plan} value={plan}>{tx(PLAN_COPY[plan].name)}</option>)}
                </select>
            </label>
            <label className={field}>{tx(C.maxUses)}<input type="number" min={1} value={draft.maxUses} onChange={(event) => setDraft({ ...draft, maxUses: event.target.value })} placeholder={tx(C.unlimited)} className={cx(INPUT_CLASS, "mt-1")} /></label>
            <label className={field}>{tx(C.expires)}<input type="date" value={draft.expiresAt} onChange={(event) => setDraft({ ...draft, expiresAt: event.target.value })} className={cx(INPUT_CLASS, "mt-1")} /></label>
            <label className={field}>{tx(C.note)}<input value={draft.note} onChange={(event) => setDraft({ ...draft, note: event.target.value })} maxLength={300} placeholder={tx(COMMON.optional)} className={cx(INPUT_CLASS, "mt-1")} /></label>
            {error ? <p role="alert" className="text-[12.5px] font-semibold text-red-600 sm:col-span-2 lg:col-span-3 dark:text-red-400">{errorText(error)}</p> : null}
            <div className="flex justify-end sm:col-span-2 lg:col-span-3">
                <Button type="submit" variant="primary" size="sm" icon={Plus} busy={busy}>{tx(C.createCoupon)}</Button>
            </div>
        </form>
    );
}

function CouponRow({ coupon, onChanged }: { coupon: AdminCoupon; onChanged: (data: AdminPlansResponse) => void }) {
    const { tx, locale } = useI18n();
    const toast = useToast();
    const errorText = useErrorText();
    const [busy, setBusy] = useState(false);
    const [confirming, setConfirming] = useState(false);
    const [error, setError] = useState<ApiFailure | null>(null);

    const run = async (body: Record<string, unknown>) => {
        setBusy(true);
        setError(null);
        const result = await adminPost<AdminPlansResponse>("/api/admin/plans", { code: coupon.code, ...body });
        setBusy(false);
        if (!result.ok) {
            setError(result);
            toast("error", errorText(result));
            return false;
        }
        onChanged(result.data);
        return true;
    };

    return (
        <li className="flex flex-wrap items-center gap-3 py-3">
            <span className="font-mono text-[14px] font-black">{coupon.code}</span>
            <Badge tone="emerald" icon={BadgePercent}>%{coupon.percentOff}</Badge>
            <Badge tone="indigo">{coupon.plan === "any" ? tx(C.anyPlan) : tx(PLAN_COPY[coupon.plan].name)}</Badge>
            <span className="text-[12.5px] text-zinc-500">{tx(C.used, { used: coupon.used, max: coupon.maxUses ?? "∞" })}</span>
            <span className="text-[12.5px] text-zinc-500">{coupon.expiresAt ? formatDateTime(coupon.expiresAt, locale) : tx(C.never)}</span>
            {coupon.note ? <span className="min-w-0 flex-1 truncate text-[12.5px] text-zinc-500">{coupon.note}</span> : <span className="flex-1" />}
            <Switch checked={coupon.active} busy={busy} onChange={(active) => void run({ action: "setCouponActive", active })} label={tx(C.couponActive)} />
            <IconButton label={tx(C.deleteCoupon)} icon={Trash2} tone="danger" onClick={() => setConfirming(true)} />
            <ConfirmDialog
                open={confirming}
                onClose={() => setConfirming(false)}
                onConfirm={async () => {
                    if (await run({ action: "deleteCoupon" })) setConfirming(false);
                }}
                title={tx(C.deleteCouponTitle, { code: coupon.code })}
                description={tx(C.deleteCouponBody)}
                confirmLabel={tx(COMMON.delete)}
                busy={busy}
                error={error}
            />
        </li>
    );
}

function PersonPlan() {
    const { tx, locale } = useI18n();
    const toast = useToast();
    const errorText = useErrorText();
    const [email, setEmail] = useState("");
    const [result, setResult] = useState<AdminUserPlanResponse | null>(null);
    const [busy, setBusy] = useState<string | null>(null);
    const [error, setError] = useState<ApiFailure | null>(null);
    const [plan, setPlan] = useState<PlanId>("plus");
    const [days, setDays] = useState("30");
    const [note, setNote] = useState("");
    const [extra, setExtra] = useState("100");
    const [grantDays, setGrantDays] = useState("7");
    const [confirmRemove, setConfirmRemove] = useState(false);

    const find = async (event?: FormEvent) => {
        event?.preventDefault();
        if (!email.trim()) return;
        setBusy("find");
        setError(null);
        const response = await adminRequest<AdminUserPlanResponse>(`/api/admin/plans?email=${encodeURIComponent(email.trim())}`);
        setBusy(null);
        if (!response.ok) {
            setError(response);
            setResult(null);
            return;
        }
        setResult(response.data);
        setPlan(response.data.subscription.plan === "free" ? "plus" : response.data.subscription.plan);
    };

    const act = async (key: string, body: Record<string, unknown>, success: Copy) => {
        if (!result) return false;
        setBusy(key);
        const response = await adminPost<AdminUserPlanResponse>("/api/admin/plans", { email: result.email, ...body });
        setBusy(null);
        if (!response.ok) {
            toast("error", errorText(response));
            return false;
        }
        setResult(response.data);
        toast("success", tx(success));
        return true;
    };

    const subscription = result?.subscription;
    const date = (iso: string | null) => (iso ? formatDateTime(iso, locale) : "");
    const label = "block text-[12px] font-semibold text-zinc-500 dark:text-zinc-400";

    return (
        <Panel title={tx(C.people)} description={tx(C.peopleHint)} icon={UserCog}>
            <form onSubmit={(event) => void find(event)} className="flex gap-2">
                <label className="sr-only" htmlFor="plan-person-email">E-mail</label>
                <input id="plan-person-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder={tx(C.emailPlaceholder)} className={INPUT_CLASS} dir="ltr" />
                <Button type="submit" icon={Search} busy={busy === "find"}>{tx(C.find)}</Button>
            </form>
            {error ? <ErrorNotice error={error} className="mt-3" /> : null}
            {result && subscription ? (
                <div className="mt-4 space-y-4">
                    {!result.exists ? <Notice tone="warning">{tx(C.noAccount)}</Notice> : null}
                    <div className="flex flex-wrap items-center gap-2 text-[13.5px]">
                        <span className="font-mono font-semibold" dir="ltr">{result.email}</span>
                        <Badge tone={result.effectivePlan === "free" ? "zinc" : "violet"} icon={Crown}>{tx(C.effective, { plan: tx(PLAN_COPY[result.effectivePlan].name) })}</Badge>
                        {subscription.plan !== result.effectivePlan ? <Badge tone="amber">{tx(C.assignedPlan, { plan: tx(PLAN_COPY[subscription.plan].name) })}</Badge> : null}
                        {subscription.status === "blocked" ? <Badge tone="red" icon={Ban}>{tx(C.blocked)}</Badge> : null}
                        {subscription.expiresAt ? <span className="text-zinc-500">{tx(C.until, { date: date(subscription.expiresAt) })}</span> : null}
                    </div>
                    <div className="rounded-2xl bg-zinc-50 p-3 text-[13px] dark:bg-white/[0.03]">
                        <p className="flex items-center gap-2 font-semibold"><Bot className="h-4 w-4 text-indigo-500" aria-hidden="true" />{tx(C.aiLimits, { minute: result.aiLimits.perMinute, day: result.aiLimits.perDay })}</p>
                        <p className="mt-1 text-zinc-500">{tx(C.aiUsage, { used: result.aiUsage.day?.count ?? 0, day: result.aiLimits.perDay })}</p>
                        {subscription.aiBonusDaily > 0 && subscription.aiBonusUntil ? <p className="mt-1 text-zinc-500">{tx(C.bonus, { extra: subscription.aiBonusDaily, date: date(subscription.aiBonusUntil) })}</p> : null}
                        <Button className="mt-2" size="sm" icon={RotateCcw} busy={busy === "reset"} onClick={() => void act("reset", { action: "resetAi" }, C.resetDone)}>{tx(C.resetAi)}</Button>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-3">
                        <label className={label}>{tx(C.plan)}
                            <select value={plan} onChange={(event) => setPlan(event.target.value as PlanId)} className={cx(INPUT_CLASS, "mt-1")}>
                                {PLAN_IDS.map((id) => <option key={id} value={id}>{tx(PLAN_COPY[id].name)}</option>)}
                            </select>
                        </label>
                        <label className={label}>{tx(C.days)}<input type="number" min={0} max={GRANT_DAYS_MAX} value={days} onChange={(event) => setDays(event.target.value)} className={cx(INPUT_CLASS, "mt-1")} /></label>
                        <label className={label}>{tx(C.note)}<input value={note} onChange={(event) => setNote(event.target.value)} maxLength={300} placeholder={tx(COMMON.optional)} className={cx(INPUT_CLASS, "mt-1")} /></label>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <Button variant="primary" size="sm" icon={Crown} busy={busy === "plan"} onClick={() => void act("plan", { action: "setPlan", plan, days: Number(days || 0), note }, C.planSaved)}>{tx(C.setPlan)}</Button>
                        {subscription.status === "blocked" ? (
                            <Button size="sm" busy={busy === "block"} onClick={() => void act("block", { action: "setBlocked", blocked: false, note }, C.unblockedNow)}>{tx(C.unblock)}</Button>
                        ) : (
                            <Button size="sm" icon={Ban} busy={busy === "block"} onClick={() => void act("block", { action: "setBlocked", blocked: true, note }, C.blockedNow)}>{tx(C.block)}</Button>
                        )}
                        <Button size="sm" variant="ghost" icon={Trash2} onClick={() => setConfirmRemove(true)}>{tx(C.remove)}</Button>
                    </div>
                    <div className="rounded-2xl border border-zinc-200 p-3 dark:border-white/10">
                        <p className="text-[13px] font-bold">{tx(C.grantTitle)}</p>
                        <div className="mt-2 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                            <label className={label}>{tx(C.extraDaily)}<input type="number" min={0} max={AI_BONUS_MAX} value={extra} onChange={(event) => setExtra(event.target.value)} className={cx(INPUT_CLASS, "mt-1")} /></label>
                            <label className={label}>{tx(C.grantDays)}<input type="number" min={1} max={GRANT_DAYS_MAX} value={grantDays} onChange={(event) => setGrantDays(event.target.value)} className={cx(INPUT_CLASS, "mt-1")} /></label>
                            <Button size="sm" icon={Bot} busy={busy === "grant"} onClick={() => void act("grant", { action: "grantAi", extraDaily: Number(extra || 0), days: Number(grantDays || 1) }, C.granted)}>{tx(C.grant)}</Button>
                        </div>
                    </div>
                    <ConfirmDialog
                        open={confirmRemove}
                        onClose={() => setConfirmRemove(false)}
                        onConfirm={async () => {
                            if (await act("remove", { action: "removePlan" }, C.removed)) setConfirmRemove(false);
                        }}
                        title={tx(C.removeTitle, { email: result.email })}
                        description={tx(C.removeBody)}
                        confirmLabel={tx(C.remove)}
                        busy={busy === "remove"}
                    />
                </div>
            ) : null}
        </Panel>
    );
}

/** Admin › Subscriptions: "coming soon" plans prepared without taking payments. */
export default function PlansSection() {
    const { tx, locale } = useI18n();
    const resource = useAdminResource<AdminPlansResponse>("/api/admin/plans");
    const data = resource.data;
    const replace = (next: AdminPlansResponse) => resource.mutate(() => next);
    const count = (value: number | null) => (value === null ? "—" : formatNumber(value, locale));
    const priceText = (value: number | null) => (value === null ? tx(C.notAnnounced) : `${formatNumber(value, locale)} ₺`);

    return (
        <div className="space-y-6">
            <SectionHeader
                title={tx(C.title)}
                description={tx(C.description)}
                actions={<Button size="sm" icon={RefreshCw} onClick={resource.reload} busy={resource.loading}>{tx(COMMON.refresh)}</Button>}
            />
            {resource.error && !data ? <ErrorNotice error={resource.error} onRetry={resource.reload} /> : null}
            {!data ? (
                resource.error ? null : <LoadingRows rows={5} />
            ) : (
                <>
                    <Panel title={tx(C.prices)} description={tx(C.pricesHint)} icon={Crown}>
                        <p className="mb-4 text-[13px] font-semibold text-zinc-600 dark:text-zinc-300">{tx(C.waitlist, { plus: count(data.waitlist.plus), pro: count(data.waitlist.pro) })}</p>
                        <div className="grid gap-4 lg:grid-cols-2">
                            {PAID_PLAN_IDS.map((plan) => (
                                <PriceEditor key={`${plan}-${data.catalog.updatedAt ?? "new"}`} plan={plan} price={data.catalog.plans[plan]} onSaved={replace} />
                            ))}
                        </div>
                        <h3 className="mt-6 flex items-center gap-2 text-[13px] font-black uppercase tracking-wide text-zinc-500"><History className="h-4 w-4" aria-hidden="true" />{tx(C.history)}</h3>
                        {data.history.length === 0 ? <p className="mt-2 text-[13px] text-zinc-500">{tx(C.noHistory)}</p> : (
                            <ul className="mt-2 divide-y divide-zinc-100 text-[13px] dark:divide-white/[0.06]">
                                {data.history.map((change, index) => (
                                    <li key={`${change.at}-${index}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                                        <Badge tone={change.plan === "pro" ? "fuchsia" : "indigo"}>{tx(PLAN_COPY[change.plan].name)}</Badge>
                                        <span className="tabular-nums">{priceText(change.from.monthly)} → <strong>{priceText(change.to.monthly)}</strong></span>
                                        {change.to.discountPercent ? <Badge tone="emerald">%{change.to.discountPercent}</Badge> : null}
                                        <span className="text-zinc-500">{change.by}</span>
                                        <span className="text-zinc-500">{formatDateTime(change.at, locale)}</span>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </Panel>
                    <Panel title={tx(C.coupons)} description={tx(C.couponsHint)} icon={Tag}>
                        <CouponForm onCreated={replace} />
                        {data.coupons.length === 0 ? <p className="mt-4 text-[13px] text-zinc-500">{tx(C.noCoupons)}</p> : (
                            <ul className="mt-2 divide-y divide-zinc-100 dark:divide-white/[0.06]">
                                {data.coupons.map((coupon) => <CouponRow key={coupon.code} coupon={coupon} onChanged={replace} />)}
                            </ul>
                        )}
                    </Panel>
                </>
            )}
            <PersonPlan />
        </div>
    );
}
