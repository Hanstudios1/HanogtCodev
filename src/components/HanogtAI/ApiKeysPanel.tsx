"use client";

import { AlertTriangle, Check, Copy as CopyIcon, KeyRound, LoaderCircle, Plus, RotateCcw, Trash2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useState } from "react";
import { API_KEY_NAME_MAX, isApiKeysState, type ApiKeyCreated, type ApiKeyView, type ApiKeysState } from "@/lib/ai/api-keys";
import { currentWindow, formatResetTime, usageLevel, type UsageWindow } from "@/lib/ai/usage";
import { useI18n, type Copy } from "@/lib/i18n";
import { PLAN_AI_FEATURES, PLAN_COPY } from "@/lib/plans";
import { cx } from "./ui";

const C = {
    title: { TR: "Hanogt AI API anahtarların", EN: "Your Hanogt AI API keys" },
    loading: { TR: "Anahtarlar yükleniyor…", EN: "Loading keys…" },
    loadFailed: { TR: "Anahtarlar yüklenemedi.", EN: "Your keys couldn't be loaded." },
    retry: { TR: "Tekrar dene", EN: "Try again" },
    planLine: { TR: "Planın: {plan} · {count} / {limit} anahtar", EN: "Your plan: {plan} · {count} / {limit} keys" },
    limits: { TR: "Dakikada {perMinute}, 24 saatte {perDay} istek", EN: "{perMinute} requests a minute, {perDay} in 24 hours" },
    planRequired: { TR: "Hanogt AI API'si Plus ve Pro planlarında: Plus'ta {plus} anahtar ve günde {plusDay} istek, Pro'da {pro} anahtar ve günde {proDay} istek.", EN: "The Hanogt AI API comes with Plus and Pro: {plus} keys and {plusDay} requests a day on Plus, {pro} keys and {proDay} on Pro." },
    seePlans: { TR: "Planları gör", EN: "See plans" },
    notOpen: { TR: "Hanogt AI API'si kademeli olarak açılıyor; hesabında henüz açık değil. Belgeleri şimdiden inceleyebilirsin.", EN: "The Hanogt AI API is opening gradually and isn't on for your account yet. You can read the docs already." },
    today: { TR: "Son 24 saat", EN: "Last 24 hours" },
    renews: { TR: "Yenilenme: {time}", EN: "Renews: {time}" },
    none: { TR: "Henüz anahtarın yok.", EN: "You don't have any keys yet." },
    active: { TR: "Etkin", EN: "Active" },
    inactive: { TR: "Planın kapsamıyor", EN: "Not in your plan" },
    inactiveNote: { TR: "Planının kapsamadığı anahtarlar çalışmaz ama silinmez; en eskileri planın kadarı etkin kalır.", EN: "Keys beyond your plan don't work but aren't deleted; your oldest ones stay active up to your plan's allowance." },
    created: { TR: "Oluşturuldu: {date}", EN: "Created {date}" },
    lastUsed: { TR: "Son kullanım: {date}", EN: "Last used {date}" },
    neverUsed: { TR: "Henüz kullanılmadı", EN: "Not used yet" },
    revoke: { TR: "İptal et", EN: "Revoke" },
    revokeConfirm: { TR: "Bu anahtar hemen çalışmaz hâle gelir ve geri alınamaz. İptal edilsin mi?", EN: "This key stops working at once, and this can't be undone. Revoke it?" },
    revokeYes: { TR: "Evet, iptal et", EN: "Yes, revoke" },
    cancel: { TR: "Vazgeç", EN: "Cancel" },
    newKey: { TR: "Yeni anahtar", EN: "New key" },
    name: { TR: "Anahtarın adı (isteğe bağlı)", EN: "Key name (optional)" },
    namePlaceholder: { TR: "Örn. Discord botum", EN: "E.g. my Discord bot" },
    create: { TR: "Anahtar oluştur", EN: "Create key" },
    creating: { TR: "Oluşturuluyor…", EN: "Creating…" },
    limitReached: { TR: "Planındaki anahtar sınırına ulaştın; yenisi için önce birini iptal et.", EN: "You've reached your plan's key limit; revoke one to create another." },
    secretTitle: { TR: "Yeni anahtarın hazır", EN: "Your new key is ready" },
    secretHint: { TR: "Bu anahtar yalnızca şimdi gösterilir; kopyalayıp güvenli bir yerde (ör. sunucundaki bir ortam değişkeninde) sakla. Kaybedersen iptal edip yenisini oluştur.", EN: "This key is shown only now: copy it and keep it somewhere safe (e.g. an environment variable on your server). If you lose it, revoke it and create a new one." },
    copy: { TR: "Kopyala", EN: "Copy" },
    copied: { TR: "Kopyalandı", EN: "Copied" },
    copyFailed: { TR: "Kopyalanamadı; anahtarı elle seç.", EN: "Couldn't copy; select the key by hand." },
    done: { TR: "Sakladım, kapat", EN: "I've saved it, close" },
    safety: { TR: "Anahtarını tarayıcıda, mobil uygulamada ya da herkese açık bir depoda kullanma: onu bilen herkes senin hakkınla istek gönderebilir. Sızdıysa hemen iptal et.", EN: "Don't use your key in a browser, a mobile app or a public repository: anyone who has it can send requests on your allowance. If it leaks, revoke it at once." },
} satisfies Record<string, Copy>;

const ERRORS: Record<string, Copy> = {
    plan_required: { TR: "Hanogt AI API anahtarı için Plus ya da Pro plan gerekir.", EN: "API keys need the Plus or Pro plan." },
    limit_reached: C.limitReached,
    feature_unavailable: C.notOpen,
    not_found: { TR: "Bu anahtar artık yok.", EN: "This key no longer exists." },
    conflict: { TR: "Anahtarların aynı anda başka bir yerde değişti. Tekrar dene.", EN: "Your keys changed somewhere else at the same time. Try again." },
    rate_limited: { TR: "Çok fazla deneme yaptın. Biraz bekleyip tekrar dene.", EN: "Too many attempts. Wait a little and try again." },
    auth_required: { TR: "Bunun için giriş yapmalısın.", EN: "You need to sign in for this." },
};
const GENERIC_ERROR: Copy = { TR: "Bir şeyler ters gitti. Lütfen tekrar dene.", EN: "Something went wrong. Please try again." };

const BUTTON = "inline-flex items-center justify-center gap-1.5 rounded-xl px-3.5 py-2 text-[13px] font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/60 disabled:opacity-50";
const FIELD = "w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-[14px] text-zinc-900 outline-none transition placeholder:text-zinc-400 focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 dark:border-white/10 dark:bg-zinc-950/60 dark:text-zinc-100";
const BAR = { ok: "from-indigo-500 to-fuchsia-500", high: "from-amber-400 to-amber-500", full: "from-rose-500 to-rose-600" } as const;

type Result<T> = { ok: true; data: T } | { ok: false; code: string };

async function keysRequest<T>(init?: RequestInit): Promise<Result<T>> {
    try {
        const response = await fetch("/api/ai/keys", { cache: "no-store", credentials: "same-origin", ...init });
        const data = await response.json().catch(() => null) as (T & { code?: string }) | null;
        if (!response.ok || !data) return { ok: false, code: data?.code ?? `http_${response.status}` };
        return { ok: true, data };
    } catch {
        return { ok: false, code: "network" };
    }
}

const post = <T,>(body: Record<string, unknown>) => keysRequest<T>({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

function formatDate(iso: string | null, locale: string) {
    const time = iso ? Date.parse(iso) : Number.NaN;
    if (!Number.isFinite(time)) return "";
    try {
        return new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(time);
    } catch {
        return new Date(time).toISOString().slice(0, 16).replace("T", " ");
    }
}

function UsageBar({ window }: { window: UsageWindow }) {
    const { tx, locale } = useI18n();
    const now = currentWindow(window);
    const level = usageLevel(now);
    const number = (value: number) => value.toLocaleString(locale);
    return (
        <div data-api-usage>
            <div className="flex items-baseline justify-between gap-3 text-[12.5px]">
                <span className="font-semibold text-zinc-600 dark:text-zinc-300">{tx(C.today)}</span>
                <span className="font-bold tabular-nums text-zinc-900 dark:text-white">{number(now.used)} / {number(now.limit)}</span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-zinc-200 dark:bg-white/10" role="progressbar" aria-label={tx(C.today)} aria-valuemin={0} aria-valuemax={now.limit} aria-valuenow={Math.min(now.used, now.limit)}>
                <div className={`h-full rounded-full bg-gradient-to-r ${BAR[level]}`} style={{ width: `${now.limit > 0 ? Math.min(100, (now.used / now.limit) * 100) : 100}%` }} />
            </div>
            {now.resetsAt ? <p className="mt-1 text-[11.5px] text-zinc-500 dark:text-zinc-400">{tx(C.renews, { time: formatResetTime(now.resetsAt, locale) })}</p> : null}
        </div>
    );
}

function KeyRow({ item, onState }: { item: ApiKeyView; onState: (state: ApiKeysState) => void }) {
    const { tx, locale } = useI18n();
    const [confirming, setConfirming] = useState(false);
    const [working, setWorking] = useState(false);
    const [error, setError] = useState<Copy | null>(null);
    const created = formatDate(item.createdAt, locale);
    const used = formatDate(item.lastUsedAt, locale);

    const revoke = async () => {
        setWorking(true);
        setError(null);
        const result = await post<ApiKeysState>({ action: "revoke", id: item.id });
        setWorking(false);
        if (!result.ok) {
            setError(ERRORS[result.code] ?? GENERIC_ERROR);
            return;
        }
        if (isApiKeysState(result.data)) onState(result.data);
    };

    return (
        <li className="rounded-2xl border border-zinc-200 p-3 dark:border-white/10" data-api-key-row={item.id}>
            <div className="flex flex-wrap items-center gap-1.5">
                <span className="min-w-0 truncate text-[14px] font-bold">{item.name}</span>
                <span className={cx("rounded-full px-2 py-0.5 text-[10.5px] font-bold", item.active ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "bg-zinc-500/10 text-zinc-500 dark:text-zinc-400")}>
                    {tx(item.active ? C.active : C.inactive)}
                </span>
            </div>
            <p className="mt-0.5 font-mono text-[12.5px] text-zinc-600 dark:text-zinc-300" dir="ltr">{item.start}…{item.last4}</p>
            <p className="mt-0.5 text-[11.5px] text-zinc-500 dark:text-zinc-400">
                {created ? tx(C.created, { date: created }) : ""}{created ? " · " : ""}{used ? tx(C.lastUsed, { date: used }) : tx(C.neverUsed)}
            </p>
            {confirming ? (
                <div className="mt-2.5 rounded-xl bg-rose-500/[0.06] p-2.5">
                    <p className="text-[12.5px] font-semibold text-rose-700 dark:text-rose-300">{tx(C.revokeConfirm)}</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                        <button type="button" onClick={() => void revoke()} disabled={working} className={cx(BUTTON, "bg-rose-600 text-white hover:bg-rose-500")} data-api-key-confirm>
                            {working ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden /> : <Trash2 className="h-4 w-4" aria-hidden />}{tx(C.revokeYes)}
                        </button>
                        <button type="button" onClick={() => setConfirming(false)} disabled={working} className={cx(BUTTON, "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-white/5")}>{tx(C.cancel)}</button>
                    </div>
                </div>
            ) : (
                <div className="mt-2">
                    <button type="button" onClick={() => setConfirming(true)} className={cx(BUTTON, "px-2.5 py-1.5 text-[12px] text-rose-600 hover:bg-rose-500/10 dark:text-rose-400")} data-api-key-revoke>
                        <Trash2 className="h-3.5 w-3.5" aria-hidden />{tx(C.revoke)}
                    </button>
                </div>
            )}
            {error ? <p role="alert" className="mt-1.5 text-[12px] font-semibold text-rose-600 dark:text-rose-400">{tx(error)}</p> : null}
        </li>
    );
}

/** The one time a new key is shown: copy it, then close. */
function NewSecret({ secret, onDone }: { secret: string; onDone: () => void }) {
    const { tx } = useI18n();
    const [copied, setCopied] = useState<"yes" | "failed" | null>(null);
    const copy = async () => {
        try {
            await navigator.clipboard.writeText(secret);
            setCopied("yes");
        } catch {
            setCopied("failed");
        }
    };
    return (
        <div className="rounded-2xl border border-emerald-300 bg-emerald-500/[0.06] p-4 dark:border-emerald-400/30" role="status">
            <p className="flex items-center gap-1.5 text-[14px] font-black text-emerald-800 dark:text-emerald-200"><Check className="h-4 w-4" aria-hidden />{tx(C.secretTitle)}</p>
            <p className="mt-1 text-[12.5px] leading-relaxed text-emerald-900/80 dark:text-emerald-100/80">{tx(C.secretHint)}</p>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <input readOnly value={secret} dir="ltr" onFocus={(event) => event.currentTarget.select()} className={cx(FIELD, "font-mono text-[12.5px]")} aria-label={tx(C.secretTitle)} data-api-key-secret />
                <button type="button" onClick={() => void copy()} className={cx(BUTTON, "shrink-0 bg-emerald-600 text-white hover:bg-emerald-500")} data-api-key-copy>
                    {copied === "yes" ? <Check className="h-4 w-4" aria-hidden /> : <CopyIcon className="h-4 w-4" aria-hidden />}{tx(copied === "yes" ? C.copied : C.copy)}
                </button>
            </div>
            {copied === "failed" ? <p className="mt-1.5 text-[12px] font-semibold text-amber-700 dark:text-amber-300">{tx(C.copyFailed)}</p> : null}
            <button type="button" onClick={onDone} className={cx(BUTTON, "mt-3 border border-emerald-300 text-emerald-800 hover:bg-emerald-500/10 dark:border-emerald-400/30 dark:text-emerald-200")} data-api-key-done>{tx(C.done)}</button>
        </div>
    );
}

/**
 * The developer API keys of the signed-in account (/api/ai/keys): the plan's
 * allowance and today's requests, the keys (name, first and last characters,
 * dates, active or not), making one (shown once) and revoking.
 */
export default function ApiKeysPanel() {
    const { tx, locale } = useI18n();
    const nameId = useId();
    const [state, setState] = useState<ApiKeysState | null>(null);
    const [failed, setFailed] = useState(false);
    const [name, setName] = useState("");
    const [working, setWorking] = useState(false);
    const [error, setError] = useState<Copy | null>(null);
    const [secret, setSecret] = useState<string | null>(null);

    const [reloads, setReloads] = useState(0);

    useEffect(() => {
        let active = true;
        void keysRequest<ApiKeysState>().then((result) => {
            if (!active) return;
            const ok = result.ok && isApiKeysState(result.data);
            if (ok) setState(result.data);
            setFailed(!ok);
        });
        return () => {
            active = false;
        };
    }, [reloads]);

    const create = async () => {
        setWorking(true);
        setError(null);
        const result = await post<ApiKeyCreated>({ action: "create", name: name.trim() });
        setWorking(false);
        if (!result.ok) {
            setError(ERRORS[result.code] ?? GENERIC_ERROR);
            return;
        }
        setSecret(result.data.key);
        setName("");
        if (isApiKeysState(result.data.state)) setState(result.data.state);
    };

    if (!state) {
        return (
            <section className="rounded-3xl border border-zinc-200 bg-white p-5 dark:border-white/10 dark:bg-zinc-900" data-api-keys-panel="loading">
                {failed ? (
                    <div className="flex flex-wrap items-center gap-3 text-[13.5px] text-zinc-600 dark:text-zinc-300">
                        {tx(C.loadFailed)}
                        <button
                            type="button"
                            onClick={() => {
                                setFailed(false);
                                setReloads((count) => count + 1);
                            }}
                            className={cx(BUTTON, "border border-zinc-200 dark:border-white/10")}
                        ><RotateCcw className="h-4 w-4" aria-hidden />{tx(C.retry)}</button>
                    </div>
                ) : (
                    <p className="flex items-center gap-2 text-[13.5px] text-zinc-500" role="status"><LoaderCircle className="h-4 w-4 animate-spin" aria-hidden />{tx(C.loading)}</p>
                )}
            </section>
        );
    }

    const number = (value: number) => value.toLocaleString(locale);
    const planName = tx(PLAN_COPY[state.plan].name);
    const full = state.limit > 0 && state.keys.length >= state.limit;
    const canCreate = state.allowed && state.limit > 0 && !full;
    const plus = PLAN_AI_FEATURES.plus.api;
    const pro = PLAN_AI_FEATURES.pro.api;

    return (
        <section className="space-y-4 rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-zinc-900 sm:p-6" data-api-keys-panel={state.allowed ? "open" : "closed"}>
            <h2 className="flex items-center gap-2 text-[16px] font-black tracking-tight text-zinc-900 dark:text-white"><KeyRound className="h-5 w-5 text-violet-500" aria-hidden />{tx(C.title)}</h2>

            {state.limit === 0 ? (
                <div className="rounded-2xl bg-zinc-50 p-3.5 text-[13px] leading-relaxed text-zinc-700 dark:bg-white/[0.04] dark:text-zinc-200">
                    <p>{tx(C.planRequired, { plus: plus?.keys ?? 2, plusDay: number(plus?.perDay ?? 0), pro: pro?.keys ?? 5, proDay: number(pro?.perDay ?? 0) })}</p>
                    <Link href="/plans" className="mt-1.5 inline-block font-bold text-violet-600 hover:underline dark:text-violet-300">{tx(C.seePlans)}</Link>
                </div>
            ) : (
                <div className="space-y-3 rounded-2xl bg-zinc-50 p-3.5 text-[13px] dark:bg-white/[0.04]">
                    <p className="font-bold text-zinc-800 dark:text-zinc-100">{tx(C.planLine, { plan: planName, count: state.keys.length, limit: state.limit })}</p>
                    {state.limits ? <p className="text-zinc-600 dark:text-zinc-300">{tx(C.limits, { perMinute: number(state.limits.perMinute), perDay: number(state.limits.perDay) })}</p> : null}
                    {state.usage ? <UsageBar window={state.usage.day} /> : null}
                </div>
            )}

            {!state.allowed && state.limit > 0 ? (
                <p className="flex gap-2 rounded-2xl bg-amber-500/10 p-3 text-[12.5px] font-semibold text-amber-800 dark:text-amber-200" data-api-not-open><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />{tx(C.notOpen)}</p>
            ) : null}

            {secret ? <NewSecret secret={secret} onDone={() => setSecret(null)} /> : null}

            {state.keys.length ? (
                <ul className="space-y-2" data-api-key-list>
                    {state.keys.map((item) => <KeyRow key={item.id} item={item} onState={setState} />)}
                </ul>
            ) : state.limit > 0 ? (
                <p className="text-[13px] text-zinc-500 dark:text-zinc-400">{tx(C.none)}</p>
            ) : null}
            {state.keys.some((item) => !item.active) ? <p className="text-[12px] text-zinc-500 dark:text-zinc-400">{tx(C.inactiveNote)}</p> : null}

            {state.allowed && state.limit > 0 ? (
                <form
                    className="space-y-2 rounded-2xl border border-dashed border-zinc-300 p-3.5 dark:border-white/15"
                    onSubmit={(event) => {
                        event.preventDefault();
                        if (canCreate && !working) void create();
                    }}
                >
                    <p className="text-[13px] font-bold text-zinc-800 dark:text-zinc-100">{tx(C.newKey)}</p>
                    <label htmlFor={nameId} className="block text-[12px] font-semibold text-zinc-600 dark:text-zinc-300">{tx(C.name)}</label>
                    <div className="flex flex-col gap-2 sm:flex-row">
                        <input id={nameId} value={name} onChange={(event) => setName(event.target.value)} maxLength={API_KEY_NAME_MAX} placeholder={tx(C.namePlaceholder)} disabled={!canCreate || working} className={FIELD} data-api-key-name />
                        <button type="submit" disabled={!canCreate || working} className={cx(BUTTON, "shrink-0 bg-violet-600 text-white hover:bg-violet-500")} data-api-key-create>
                            {working ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden /> : <Plus className="h-4 w-4" aria-hidden />}{tx(working ? C.creating : C.create)}
                        </button>
                    </div>
                    {full ? <p className="text-[12px] font-semibold text-amber-700 dark:text-amber-300">{tx(C.limitReached)}</p> : null}
                </form>
            ) : null}
            {error ? <p role="alert" className="text-[12.5px] font-semibold text-rose-600 dark:text-rose-400">{tx(error)}</p> : null}

            <p className="flex gap-2 rounded-2xl bg-sky-500/[0.06] p-3 text-[12px] leading-relaxed text-zinc-600 dark:text-zinc-300"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sky-600 dark:text-sky-300" aria-hidden />{tx(C.safety)}</p>
        </section>
    );
}
