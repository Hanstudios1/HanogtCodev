"use client";

import { Ban, BadgePercent, Bot, CreditCard, Crown, ExternalLink, History, Plus, RefreshCw, RotateCcw, Search, Tag, Trash2, Upload, UserCog } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useI18n, type Copy } from "@/lib/i18n";
import { billingView, paddleEntitles } from "@/lib/paddle";
import { AI_BONUS_MAX, GRANT_DAYS_MAX, PAID_PLAN_IDS, PLAN_COPY, PLAN_IDS, PRICE_MAX, type PaidPlanId, type PlanId, type PlanPrice } from "@/lib/plans";
import { adminPost, adminRequest, type ApiFailure } from "./api";
import { COMMON } from "./copy";
import { formatDateTime, formatNumber, useAdminResource } from "./hooks";
import PaddleCard, { PaddleEnvironmentBadge, PaddleStatusBadge } from "./PaddleCard";
import type { AdminCoupon, AdminPaddleCouponResponse, AdminPaddleResponse, AdminPaddleResyncResponse, AdminPlansResponse, AdminUserPlanResponse } from "./types";
import { Badge, Button, ConfirmDialog, ErrorNotice, IconButton, INPUT_CLASS, LoadingRows, Notice, Panel, SectionHeader, Switch, cx, useErrorText, useToast } from "./ui";

const C = {
    title: { TR: "Abonelikler", EN: "Subscriptions" },
    description: { TR: "Paddle bağlantısını, satışları ve fiyatları yönet; kuponları hazırla, kişilere elle plan tanımla ve Hanogt AI sınırlarını yönet.", EN: "Manage the Paddle connection, sales and prices; prepare coupons, assign plans to people by hand and manage Hanogt AI limits." },
    prices: { TR: "Planlar ve fiyatlar", EN: "Plans and prices" },
    pricesHint: { TR: "Planlar sayfasında yalnızca \"Görünür\" planlar gösterilir; Paddle fiyatı eşlenmiş olanlar satışa çıkar.", EN: "Only \"Visible\" plans appear on the Plans page; those with a Paddle price mapped go on sale." },
    monthly: { TR: "Aylık ({currency})", EN: "Monthly ({currency})" },
    yearly: { TR: "Yıllık ({currency})", EN: "Yearly ({currency})" },
    discount: { TR: "İndirim (%)", EN: "Discount (%)" },
    visible: { TR: "Görünür", EN: "Visible" },
    empty: { TR: "Boş = açıklanmadı", EN: "Empty = not announced" },
    savePrice: { TR: "{plan} fiyatını kaydet", EN: "Save {plan} price" },
    priceSaved: { TR: "Fiyat kaydedildi.", EN: "Price saved." },
    paddleNote: { TR: "Bu planın Paddle fiyatı eşlenmiş: ödeme ekranı Paddle'daki fiyatı tahsil eder. Buradaki tutarlar yalnızca \"Yakında\" görünümü içindir; \"Görünür\" ise planın satışta olup olmadığını belirlemeye devam eder.", EN: "This plan has a Paddle price mapped: checkout charges the price in Paddle. The amounts here are only for the \"Coming soon\" view; \"Visible\" still decides whether the plan is on sale." },
    discountNote: { TR: "İndirim yalnızca \"Yakında\" görünümünde uygulanır; Paddle ödemesinde indirim için kupon kullanın.", EN: "The discount only applies to the \"Coming soon\" view; use a coupon for a discount at Paddle checkout." },
    history: { TR: "Fiyat geçmişi", EN: "Price history" },
    noHistory: { TR: "Henüz fiyat değişikliği yok.", EN: "No price changes yet." },
    notAnnounced: { TR: "açıklanmadı", EN: "not announced" },
    waitlist: { TR: "Haber bekleyenler: Plus {plus} · Pro {pro}", EN: "Waiting to hear: Plus {plus} · Pro {pro}" },
    coupons: { TR: "Kuponlar", EN: "Coupons" },
    couponsHint: { TR: "Ödeme ekranında kullanılacak indirim kodları.", EN: "Discount codes for checkout." },
    couponsPaddle: { TR: "Paddle bağlıyken her yeni kupon Paddle'da da indirim kodu olarak oluşturulur (yalnızca harf ve rakam). Müşteriler kodu ödeme ekranında girer; indirim yalnızca ilk ödemeye uygulanır.", EN: "While Paddle is connected, every new coupon is also created in Paddle as a discount code (letters and digits only). Customers enter the code at checkout; the discount applies to the first payment only." },
    couponsNoPaddle: { TR: "Paddle bağlanınca kuponlar \"Paddle'a aktar\" ile ödeme ekranında kullanılabilir hâle getirilir.", EN: "Once Paddle is connected, \"Send to Paddle\" makes coupons usable at checkout." },
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
    inPaddle: { TR: "Paddle'da", EN: "In Paddle" },
    inPaddleTitle: { TR: "Paddle indirimi {id}; kullanım sayısı Paddle'dan", EN: "Paddle discount {id}; the use count comes from Paddle" },
    syncCoupon: { TR: "Paddle'a aktar", EN: "Send to Paddle" },
    couponSynced: { TR: "Kupon Paddle'a aktarıldı.", EN: "Coupon sent to Paddle." },
    deleteCoupon: { TR: "Kuponu sil", EN: "Delete coupon" },
    deleteCouponTitle: { TR: "{code} kuponu silinsin mi?", EN: "Delete coupon {code}?" },
    deleteCouponBody: { TR: "Kod artık kullanılamaz. Bu işlem geri alınamaz.", EN: "The code can no longer be used. This can't be undone." },
    deleteCouponPaddle: { TR: "Kod artık kullanılamaz; Paddle'daki indirimi de arşivlenir. Bu işlem geri alınamaz.", EN: "The code can no longer be used, and its Paddle discount is archived. This can't be undone." },
    couponActive: { TR: "Kupon etkin", EN: "Coupon active" },
    people: { TR: "Kişinin planı", EN: "A person's plan" },
    peopleHint: { TR: "E-posta ile bul; plan tanımla, engelle, Hanogt AI sınırını sıfırla veya ek hak ver.", EN: "Find by e-mail; assign a plan, block it, reset the Hanogt AI limit or grant extra quota." },
    emailPlaceholder: { TR: "kullanici@ornek.com", EN: "user@example.com" },
    find: { TR: "Bul", EN: "Find" },
    noAccount: { TR: "Bu e-postayla bir hesap yok.", EN: "There's no account with this e-mail." },
    effective: { TR: "Geçerli plan: {plan}", EN: "Plan in effect: {plan}" },
    source: { TR: "Kaynağı: {source}", EN: "Comes from: {source}" },
    sourcePaddle: { TR: "Paddle aboneliği", EN: "the Paddle subscription" },
    sourceStaff: { TR: "ekip tanımı", EN: "a team assignment" },
    assignedPlan: { TR: "Tanımlı plan: {plan}", EN: "Assigned plan: {plan}" },
    blocked: { TR: "Engelli", EN: "Blocked" },
    until: { TR: "{date} tarihine kadar", EN: "until {date}" },
    aiLimits: { TR: "Hanogt AI: dakikada {minute}, günde {day} mesaj", EN: "Hanogt AI: {minute} a minute, {day} a day" },
    aiUsage: { TR: "Bugün kullanılan: {used} / {day}", EN: "Used today: {used} / {day}" },
    bonus: { TR: "Ek hak: günde +{extra}, {date} tarihine kadar", EN: "Extra quota: +{extra} a day until {date}" },
    paddleTitle: { TR: "Paddle aboneliği", EN: "Paddle subscription" },
    perMonth: { TR: "Aylık", EN: "Monthly" },
    perYear: { TR: "Yıllık", EN: "Yearly" },
    noPlanPrice: { TR: "Fiyat bir plana eşlenmemiş", EN: "Price not mapped to a plan" },
    noPlanPriceHint: { TR: "Bu aboneliğin fiyatı hiçbir plana eşlenmemiş, bu yüzden avantaj açmıyor. Fiyatı Paddle kartındaki eşlemeye ekleyip yeniden eşitleyin.", EN: "This subscription's price isn't mapped to any plan, so it unlocks nothing. Add the price to the mapping in the Paddle card and re-sync." },
    renews: { TR: "Yenilenme: {date}", EN: "Renews {date}" },
    ends: { TR: "Bitiş: {date} (iptal planlandı)", EN: "Ends {date} (cancellation scheduled)" },
    periodEnd: { TR: "Dönem sonu: {date}", EN: "Period ends {date}" },
    canceledAt: { TR: "İptal: {date}", EN: "Canceled {date}" },
    noSubscription: { TR: "Paddle müşterisi var, kayıtlı abonelik yok.", EN: "There's a Paddle customer but no subscription on record." },
    customer: { TR: "Müşteri", EN: "Customer" },
    subscriptionId: { TR: "Abonelik", EN: "Subscription" },
    openInPaddle: { TR: "Paddle'da aç", EN: "Open in Paddle" },
    resync: { TR: "Paddle'dan yeniden eşitle", EN: "Re-sync from Paddle" },
    resynced: { TR: "Paddle'dan eşitlendi.", EN: "Synced from Paddle." },
    resyncNone: { TR: "Paddle'da bu hesaba ait abonelik bulunamadı.", EN: "Paddle has no subscription for this account." },
    setPlan: { TR: "Planı uygula", EN: "Apply plan" },
    days: { TR: "Süre (gün, 0 = süresiz)", EN: "Duration (days, 0 = no expiry)" },
    planSaved: { TR: "Plan güncellendi.", EN: "Plan updated." },
    block: { TR: "Plan kullanımını engelle", EN: "Block plan use" },
    unblock: { TR: "Engeli kaldır", EN: "Lift the block" },
    blockPaddle: { TR: "Engellemek ücretli plan avantajlarını da kapatır, ancak Paddle ödeme almaya devam eder. Gerekirse aboneliği Paddle panelinden iptal edin ya da iade yapın.", EN: "Blocking also switches off paid benefits, but Paddle keeps charging. If needed, cancel or refund the subscription in the Paddle dashboard." },
    blockedNow: { TR: "Plan kullanımı engellendi.", EN: "Plan use blocked." },
    unblockedNow: { TR: "Engel kaldırıldı.", EN: "Block lifted." },
    remove: { TR: "Planı kaldır", EN: "Remove plan" },
    removeTitle: { TR: "{email} için plan kaldırılsın mı?", EN: "Remove the plan for {email}?" },
    removeBody: { TR: "Kişi Ücretsiz plana döner; ek Hanogt AI hakları da silinir.", EN: "They go back to Free; extra Hanogt AI quota is removed too." },
    removeBodyPaddle: { TR: "Ekibin tanımladığı plan ve ek Hanogt AI hakları kaldırılır. Paddle aboneliğine dokunulmaz; onu Paddle panelinden yönetin.", EN: "The team-assigned plan and extra Hanogt AI quota are removed. The Paddle subscription isn't touched; manage it in the Paddle dashboard." },
    removed: { TR: "Plan kaldırıldı.", EN: "Plan removed." },
    resetAi: { TR: "Hanogt AI sınırını sıfırla", EN: "Reset the Hanogt AI limit" },
    resetDone: { TR: "Hanogt AI sayaçları sıfırlandı.", EN: "Hanogt AI counters reset." },
    grantTitle: { TR: "Ek Hanogt AI hakkı", EN: "Extra Hanogt AI quota" },
    extraDaily: { TR: "Günlük ek mesaj", EN: "Extra messages a day" },
    grantDays: { TR: "Kaç gün", EN: "For how many days" },
    grant: { TR: "Hakkı ver", EN: "Grant" },
    granted: { TR: "Ek hak kaydedildi.", EN: "Extra quota saved." },
} satisfies Record<string, Copy>;

/** An amount in the catalog's currency ("$20", "$19.99"). */
function money(value: number, currency: string, locale: string) {
    try {
        return new Intl.NumberFormat(locale, { style: "currency", currency, maximumFractionDigits: value % 1 ? 2 : 0 }).format(value);
    } catch {
        return `${formatNumber(value, locale)} ${currency}`;
    }
}

type PriceDraft = { monthly: string; yearly: string; discountPercent: string; visible: boolean };

function priceDraft(price: PlanPrice): PriceDraft {
    return { monthly: price.monthly === null ? "" : String(price.monthly), yearly: price.yearly === null ? "" : String(price.yearly), discountPercent: String(price.discountPercent), visible: price.visible };
}

function parsePrice(value: string) {
    const trimmed = value.trim().replace(",", ".");
    return trimmed === "" ? null : Number(trimmed);
}

function PriceEditor({ plan, price, currency, paddleMapped, onSaved }: { plan: PaidPlanId; price: PlanPrice; currency: string; paddleMapped: boolean; onSaved: (data: AdminPlansResponse) => void }) {
    const { tx, locale } = useI18n();
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
                        {tx(label, { currency })}
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
            <p id={`price-hint-${plan}`} className="mt-2 text-[11.5px] text-zinc-500">{`${tx(C.empty)} · ${money(0, currency, locale)} – ${money(PRICE_MAX, currency, locale)} · %0 – 90`}</p>
            {paddleMapped ? (
                <Notice tone="info" className="mt-3 text-[12.5px]">
                    {tx(C.paddleNote)}
                    {Number(draft.discountPercent || 0) > 0 ? <span className="mt-1 block font-semibold">{tx(C.discountNote)}</span> : null}
                </Notice>
            ) : null}
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

function CouponRow({ coupon, paddleReady, onChanged, onSynced }: { coupon: AdminCoupon; paddleReady: boolean; onChanged: (data: AdminPlansResponse) => void; onSynced: () => void }) {
    const { tx, locale } = useI18n();
    const toast = useToast();
    const errorText = useErrorText();
    const [busy, setBusy] = useState(false);
    const [syncing, setSyncing] = useState(false);
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

    const sync = async () => {
        setSyncing(true);
        const result = await adminPost<AdminPaddleCouponResponse>("/api/admin/paddle", { action: "syncCoupon", code: coupon.code });
        setSyncing(false);
        if (!result.ok) {
            toast("error", errorText(result));
            return;
        }
        toast("success", tx(C.couponSynced));
        onSynced();
    };

    return (
        <li className="flex flex-wrap items-center gap-3 py-3">
            <span className="font-mono text-[14px] font-black">{coupon.code}</span>
            <Badge tone="emerald" icon={BadgePercent}>%{coupon.percentOff}</Badge>
            <Badge tone="indigo">{coupon.plan === "any" ? tx(C.anyPlan) : tx(PLAN_COPY[coupon.plan].name)}</Badge>
            {coupon.paddleDiscountId ? (
                <span title={tx(C.inPaddleTitle, { id: coupon.paddleDiscountId })}><Badge tone="sky" icon={CreditCard}>{tx(C.inPaddle)}</Badge></span>
            ) : null}
            <span className="text-[12.5px] text-zinc-500">{tx(C.used, { used: coupon.paddleTimesUsed ?? coupon.used, max: coupon.maxUses ?? "∞" })}</span>
            <span className="text-[12.5px] text-zinc-500">{coupon.expiresAt ? formatDateTime(coupon.expiresAt, locale) : tx(C.never)}</span>
            {coupon.note ? <span className="min-w-0 flex-1 truncate text-[12.5px] text-zinc-500">{coupon.note}</span> : <span className="flex-1" />}
            {!coupon.paddleDiscountId && paddleReady && coupon.active ? (
                <Button size="sm" variant="ghost" icon={Upload} busy={syncing} onClick={() => void sync()}>{tx(C.syncCoupon)}</Button>
            ) : null}
            <Switch checked={coupon.active} busy={busy} onChange={(active) => void run({ action: "setCouponActive", active })} label={tx(C.couponActive)} />
            <IconButton label={tx(C.deleteCoupon)} icon={Trash2} tone="danger" onClick={() => setConfirming(true)} />
            <ConfirmDialog
                open={confirming}
                onClose={() => setConfirming(false)}
                onConfirm={async () => {
                    if (await run({ action: "deleteCoupon" })) setConfirming(false);
                }}
                title={tx(C.deleteCouponTitle, { code: coupon.code })}
                description={tx(coupon.paddleDiscountId ? C.deleteCouponPaddle : C.deleteCouponBody)}
                confirmLabel={tx(COMMON.delete)}
                busy={busy}
                error={error}
            />
        </li>
    );
}

/** A Paddle id that opens the matching page of Paddle's dashboard. */
function PaddleLink({ href, id }: { href: string; id: string }) {
    const { tx } = useI18n();
    return (
        <a href={href} target="_blank" rel="noopener noreferrer" title={tx(C.openInPaddle)} className="inline-flex items-center gap-1 break-all font-mono font-semibold text-indigo-600 hover:underline dark:text-indigo-300" dir="ltr">
            {id}<ExternalLink className="h-3 w-3 shrink-0" aria-hidden="true" />
        </a>
    );
}

/** The person's Paddle subscription (configured environment only) and the re-sync button. */
function PaddleSubscription({ result, busy, onResync }: { result: AdminUserPlanResponse; busy: boolean; onResync: () => void }) {
    const { tx, locale } = useI18n();
    const paddle = result.subscription.paddle;
    const customerId = result.subscription.paddleCustomerId ?? paddle?.customerId ?? null;
    if (!paddle && !customerId) return null;
    const view = billingView(paddle);
    const date = (iso: string) => formatDateTime(iso, locale);
    const base = result.paddleDashboard;
    return (
        <div className="rounded-2xl border border-zinc-200 p-3 text-[13px] dark:border-white/10">
            <div className="flex flex-wrap items-center gap-2">
                <p className="flex items-center gap-2 font-bold"><CreditCard className="h-4 w-4 text-indigo-500" aria-hidden="true" />{tx(C.paddleTitle)}</p>
                <PaddleEnvironmentBadge environment={result.paddleEnvironment} />
                {paddle ? <PaddleStatusBadge status={paddle.status} /> : null}
                {paddle?.plan ? <Badge tone={paddle.plan === "pro" ? "fuchsia" : "indigo"} icon={Crown}>{tx(PLAN_COPY[paddle.plan].name)}</Badge> : paddle ? <Badge tone="amber">{tx(C.noPlanPrice)}</Badge> : null}
                {paddle?.interval ? <span className="text-zinc-500">{tx(paddle.interval === "month" ? C.perMonth : C.perYear)}</span> : null}
            </div>
            {paddle && view ? (
                <ul className="mt-2 space-y-0.5 text-zinc-600 dark:text-zinc-300">
                    {view.renewsAt ? <li>{tx(C.renews, { date: date(view.renewsAt) })}</li> : null}
                    {view.endsAt ? <li>{tx(C.ends, { date: date(view.endsAt) })}</li> : null}
                    {!view.renewsAt && !view.endsAt && paddle.currentPeriodEnd ? <li>{tx(C.periodEnd, { date: date(paddle.currentPeriodEnd) })}</li> : null}
                    {paddle.canceledAt ? <li>{tx(C.canceledAt, { date: date(paddle.canceledAt) })}</li> : null}
                    {!paddle.plan ? <li className="text-amber-700 dark:text-amber-300">{tx(C.noPlanPriceHint)}</li> : null}
                </ul>
            ) : (
                <p className="mt-2 text-zinc-500">{tx(C.noSubscription)}</p>
            )}
            <dl className="mt-2 grid gap-2 text-[12px] sm:grid-cols-2">
                {customerId ? (
                    <div className="min-w-0">
                        <dt className="text-zinc-400">{tx(C.customer)}</dt>
                        <dd><PaddleLink href={`${base}/customers-v2/${customerId}`} id={customerId} /></dd>
                    </div>
                ) : null}
                {paddle ? (
                    <div className="min-w-0">
                        <dt className="text-zinc-400">{tx(C.subscriptionId)}</dt>
                        <dd><PaddleLink href={`${base}/subscriptions-v2/${paddle.subscriptionId}`} id={paddle.subscriptionId} /></dd>
                    </div>
                ) : null}
            </dl>
            <Button className="mt-3" size="sm" icon={RefreshCw} busy={busy} onClick={onResync}>{tx(C.resync)}</Button>
        </div>
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

    const resync = async () => {
        if (!result) return;
        setBusy("resync");
        const response = await adminPost<AdminPaddleResyncResponse>("/api/admin/paddle", { action: "resync", email: result.email });
        setBusy(null);
        if (!response.ok) {
            toast("error", errorText(response));
            return;
        }
        const { found, ...person } = response.data;
        setResult(person);
        toast(found ? "success" : "info", tx(found ? C.resynced : C.resyncNone));
    };

    const subscription = result?.subscription;
    const date = (iso: string | null) => (iso ? formatDateTime(iso, locale) : "");
    const label = "block text-[12px] font-semibold text-zinc-500 dark:text-zinc-400";
    const billing = Boolean(subscription && (subscription.paddle || subscription.paddleCustomerId));
    // Blocking switches off what Paddle keeps charging for.
    const paying = Boolean(subscription?.paddle && paddleEntitles(subscription.paddle));

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
                        {result.planSource ? <span className="text-zinc-500">{tx(C.source, { source: tx(result.planSource === "paddle" ? C.sourcePaddle : C.sourceStaff) })}</span> : null}
                        {subscription.plan !== result.effectivePlan ? <Badge tone="amber">{tx(C.assignedPlan, { plan: tx(PLAN_COPY[subscription.plan].name) })}</Badge> : null}
                        {subscription.status === "blocked" ? <Badge tone="red" icon={Ban}>{tx(C.blocked)}</Badge> : null}
                        {subscription.expiresAt ? <span className="text-zinc-500">{tx(C.until, { date: date(subscription.expiresAt) })}</span> : null}
                    </div>
                    <PaddleSubscription result={result} busy={busy === "resync"} onResync={() => void resync()} />
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
                    {paying ? <p className="text-[12px] leading-relaxed text-amber-700 dark:text-amber-300">{tx(C.blockPaddle)}</p> : null}
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
                        description={tx(billing ? C.removeBodyPaddle : C.removeBody)}
                        confirmLabel={tx(C.remove)}
                        busy={busy === "remove"}
                    />
                </div>
            ) : null}
        </Panel>
    );
}

/** Admin › Subscriptions: Paddle, plan prices, coupons and people's plans. */
export default function PlansSection() {
    const { tx, locale } = useI18n();
    const resource = useAdminResource<AdminPlansResponse>("/api/admin/plans");
    const paddle = useAdminResource<AdminPaddleResponse>("/api/admin/paddle");
    const data = resource.data;
    const replace = (next: AdminPlansResponse) => resource.mutate(() => next);
    const count = (value: number | null) => (value === null ? "—" : formatNumber(value, locale));
    const priceText = (value: number | null, currency: string) => (value === null ? tx(C.notAnnounced) : money(value, currency, locale));
    const mapping = paddle.data?.mapping ?? null;
    const paddleReady = paddle.data?.config.ready ?? false;

    return (
        <div className="space-y-6">
            <SectionHeader
                title={tx(C.title)}
                description={tx(C.description)}
                actions={(
                    <Button
                        size="sm"
                        icon={RefreshCw}
                        onClick={() => {
                            resource.reload();
                            paddle.reload();
                        }}
                        busy={resource.loading || paddle.loading}
                    >
                        {tx(COMMON.refresh)}
                    </Button>
                )}
            />
            <PaddleCard resource={paddle} catalog={data?.catalog ?? null} />
            {resource.error && !data ? <ErrorNotice error={resource.error} onRetry={resource.reload} /> : null}
            {!data ? (
                resource.error ? null : <LoadingRows rows={5} />
            ) : (
                <>
                    <Panel title={tx(C.prices)} description={tx(C.pricesHint)} icon={Crown}>
                        <p className="mb-4 text-[13px] font-semibold text-zinc-600 dark:text-zinc-300">{tx(C.waitlist, { plus: count(data.waitlist.plus), pro: count(data.waitlist.pro) })}</p>
                        <div className="grid gap-4 lg:grid-cols-2">
                            {PAID_PLAN_IDS.map((plan) => (
                                <PriceEditor
                                    key={`${plan}-${data.catalog.updatedAt ?? "new"}`}
                                    plan={plan}
                                    price={data.catalog.plans[plan]}
                                    currency={data.catalog.currency}
                                    paddleMapped={Boolean(mapping && (mapping[plan].month || mapping[plan].year))}
                                    onSaved={replace}
                                />
                            ))}
                        </div>
                        <h3 className="mt-6 flex items-center gap-2 text-[13px] font-black uppercase tracking-wide text-zinc-500"><History className="h-4 w-4" aria-hidden="true" />{tx(C.history)}</h3>
                        {data.history.length === 0 ? <p className="mt-2 text-[13px] text-zinc-500">{tx(C.noHistory)}</p> : (
                            <ul className="mt-2 divide-y divide-zinc-100 text-[13px] dark:divide-white/[0.06]">
                                {data.history.map((change, index) => (
                                    <li key={`${change.at}-${index}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                                        <Badge tone={change.plan === "pro" ? "fuchsia" : "indigo"}>{tx(PLAN_COPY[change.plan].name)}</Badge>
                                        <span className="tabular-nums">{priceText(change.from.monthly, change.currency)} → <strong>{priceText(change.to.monthly, change.currency)}</strong></span>
                                        {change.to.discountPercent ? <Badge tone="emerald">%{change.to.discountPercent}</Badge> : null}
                                        <span className="text-zinc-500">{change.by}</span>
                                        <span className="text-zinc-500">{formatDateTime(change.at, locale)}</span>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </Panel>
                    <Panel title={tx(C.coupons)} description={tx(C.couponsHint)} icon={Tag}>
                        <p className="mb-3 text-[12.5px] leading-relaxed text-zinc-500 dark:text-zinc-400">{tx(paddleReady ? C.couponsPaddle : C.couponsNoPaddle)}</p>
                        <CouponForm onCreated={replace} />
                        {data.coupons.length === 0 ? <p className="mt-4 text-[13px] text-zinc-500">{tx(C.noCoupons)}</p> : (
                            <ul className="mt-2 divide-y divide-zinc-100 dark:divide-white/[0.06]">
                                {data.coupons.map((coupon) => <CouponRow key={coupon.code} coupon={coupon} paddleReady={paddleReady} onChanged={replace} onSynced={resource.reload} />)}
                            </ul>
                        )}
                    </Panel>
                </>
            )}
            <PersonPlan />
        </div>
    );
}
