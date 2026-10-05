"use client";

import { ArrowRight, Check, ExternalLink, KeyRound, LoaderCircle, Lock, Pencil, Plus, RotateCcw, Trash2 } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useId, useState, type ReactNode } from "react";
import { API_KEY_MAX, CONNECTION_LABEL_MAX, CONNECTION_MODEL_MAX, PLAN_AI_CONNECTIONS, aiProvider, isConnectionsState, isPlausibleApiKey, type AiConnectionError, type AiConnectionView, type AiConnectionsState, type AiProviderId, type AiProviderInfo, isAiProviderId, providerName } from "@/lib/ai/connections";
import { useI18n, type Copy } from "@/lib/i18n";
import { PLAN_AI_FEATURES, PLAN_COPY } from "@/lib/plans";
import { connectionsRequest, type AiConnectionsHandle } from "./connections-store";
import { cx } from "./ui";

const C = {
    loading: { TR: "Bağlantılar yükleniyor…", EN: "Loading connections…" },
    loadFailed: { TR: "Bağlantılar yüklenemedi.", EN: "Your connections couldn't be loaded." },
    retry: { TR: "Tekrar dene", EN: "Try again" },
    planLine: { TR: "Planın: {plan} · en fazla {limit} bağlantı", EN: "Your plan: {plan} · up to {limit} connections" },
    planLimits: { TR: "Plus: {plus} bağlantı, Pro: {pro} bağlantı", EN: "Plus: {plus} connections, Pro: {pro} connections" },
    ownLimit: { TR: "Kendi bağlantılarınla günde en fazla {perDay} mesaj gönderebilirsin.", EN: "You can send up to {perDay} messages a day through your own connections." },
    planRequired: { TR: "Kendi API anahtarınla bağlantı eklemek için Plus ya da Pro plan gerekir.", EN: "Connecting your own API keys needs the Plus or Pro plan." },
    limitReached: { TR: "Planındaki bağlantı sınırına ulaştın; yeni bir bağlantı eklemek için önce birini sil.", EN: "You've reached your plan's connection limit; delete one to add another." },
    inactiveNote: { TR: "Planının kapsamadığı bağlantılar silinmez; planını yükseltirsen yeniden kullanabilirsin.", EN: "Connections outside your plan aren't deleted; you can use them again if you upgrade." },
    seePlans: { TR: "Planları gör", EN: "See plans" },
    yours: { TR: "Bağlantıların", EN: "Your connections" },
    none: { TR: "Henüz bağlantın yok.", EN: "You don't have any connections yet." },
    active: { TR: "Etkin", EN: "Active" },
    retired: { TR: "Artık desteklenmiyor", EN: "No longer supported" },
    retiredHint: { TR: "Bu sağlayıcı Hanogt AI'dan kaldırıldı. Bağlantı kullanılamaz ve planının bağlantı hakkından düşmez; silebilirsin.", EN: "This provider was removed from Hanogt AI. The connection can't be used and doesn't count toward your plan's connections; you can delete it." },
    inactive: { TR: "Planın kapsamıyor", EN: "Not in your plan" },
    selected: { TR: "Seçili", EN: "Selected" },
    use: { TR: "Kullan", EN: "Use" },
    edit: { TR: "Düzenle", EN: "Edit" },
    remove: { TR: "Sil", EN: "Delete" },
    confirmRemove: { TR: "Bu bağlantı ve şifreli anahtarı kalıcı olarak silinsin mi? Sağlayıcıya gönderim için verdiğin rıza da geri alınır.", EN: "Permanently delete this connection and its encrypted key? This also withdraws your consent to sending messages to the provider." },
    confirmYes: { TR: "Evet, sil", EN: "Yes, delete" },
    cancel: { TR: "Vazgeç", EN: "Cancel" },
    save: { TR: "Kaydet", EN: "Save" },
    keyHint: { TR: "Anahtar {hint}", EN: "Key {hint}" },
    added: { TR: "Eklendi: {date}", EN: "Added {date}" },
    lastUsed: { TR: "Son kullanım: {date}", EN: "Last used {date}" },
    addTitle: { TR: "Yeni bağlantı", EN: "New connection" },
    provider: { TR: "Sağlayıcı", EN: "Provider" },
    getKey: { TR: "Anahtar al", EN: "Get a key" },
    apiKey: { TR: "API anahtarı", EN: "API key" },
    keyFormat: { TR: "Biçim: {format}", EN: "Format: {format}" },
    verify: { TR: "Anahtarı doğrula", EN: "Verify key" },
    verifying: { TR: "Doğrulanıyor…", EN: "Verifying…" },
    verified: { TR: "Anahtar doğrulandı", EN: "Key verified" },
    model: { TR: "Model", EN: "Model" },
    chooseModel: { TR: "Bir model seç", EN: "Choose a model" },
    typeModel: { TR: "Listede yok mu? Model adını elle yaz", EN: "Not listed? Type the model name" },
    pickModel: { TR: "Listeden seç", EN: "Pick from the list" },
    modelExample: { TR: "ör. {model}", EN: "e.g. {model}" },
    noModels: { TR: "Sağlayıcı bir model listesi göndermedi; model adını elle yaz.", EN: "The provider didn't send a model list; type the model name." },
    label: { TR: "Etiket (isteğe bağlı)", EN: "Label (optional)" },
    labelField: { TR: "Etiket", EN: "Label" },
    add: { TR: "Bağlantıyı kaydet", EN: "Save connection" },
    saving: { TR: "Kaydediliyor…", EN: "Saving…" },
    addedSelected: { TR: "Bağlantı eklendi ve seçildi. Yeni mesajların bu modele gidecek.", EN: "Connection added and selected. Your new messages go to this model." },
    keyLooksWrong: { TR: "Bu bir API anahtarına benzemiyor: boşluk içermemeli ve en az 8 karakter olmalı.", EN: "This doesn't look like an API key: it has no spaces and at least 8 characters." },
    privacy: { TR: "Bu bağlantıyla gönderdiğin mesajlar doğrudan seçtiğin sağlayıcıya gider ve o sağlayıcının şartları geçerlidir; anahtarın şifreli saklanır ve sana bir daha gösterilmez.", EN: "Messages you send through a connection go straight to the provider you chose, and that provider's terms apply; your key is stored encrypted and never shown to you again." },
    // Explicit consent for the transfer abroad (KVKK m.9/6-a); required, never pre-ticked.
    consent: { TR: "Bu bağlantıyla yazdığım mesajların ve eklediğim içeriğin seçtiğim sağlayıcıya (yurt dışındaki sunucularına) gönderilmesine ve orada o sağlayıcının şartlarıyla işlenmesine açık rıza veriyorum. Rızamı bağlantıyı silerek geri alabilirim.", EN: "I explicitly consent to the messages I write and the content I attach through this connection being sent to the provider I chose (to its servers abroad) and processed there under that provider's terms. I can withdraw my consent by deleting the connection." },
    encryptionOff: { TR: "Bu sunucuda anahtar şifrelemesi ayarlanmamış, bu yüzden şu an yeni bağlantı eklenemiyor.", EN: "Key encryption isn't set up on this server, so connections can't be added right now." },
} satisfies Record<string, Copy>;

const ERRORS: Record<string, Copy> = {
    plan_required: C.planRequired,
    limit_reached: C.limitReached,
    invalid_key: { TR: "Sağlayıcı bu anahtarı kabul etmedi. Anahtarı ve seçtiğin sağlayıcıyı kontrol et.", EN: "The provider didn't accept this key. Check the key and the provider you chose." },
    provider_error: { TR: "Sağlayıcı şu an anahtarı doğrulayamadı. Biraz sonra tekrar dene.", EN: "The provider couldn't check the key right now. Try again in a moment." },
    unreachable: { TR: "Sağlayıcıya ulaşılamadı. Biraz sonra tekrar dene.", EN: "The provider couldn't be reached. Try again in a moment." },
    not_found: { TR: "Bu bağlantı artık yok.", EN: "This connection no longer exists." },
    invalid_request: { TR: "Bilgilerden biri geçersiz. Alanları kontrol edip tekrar dene.", EN: "Something isn't valid. Check the fields and try again." },
    encryption_unavailable: C.encryptionOff,
    consent_required: { TR: "Bağlantıyı kaydetmek için açık rıza kutusunu işaretlemelisin.", EN: "Tick the explicit consent box to save the connection." },
    rate_limited: { TR: "Çok fazla deneme yaptın. Biraz bekleyip tekrar dene.", EN: "Too many attempts. Wait a little and try again." },
    auth_required: { TR: "Bunun için giriş yapmalısın.", EN: "You need to sign in for this." },
    conflict: { TR: "Bağlantıların aynı anda başka bir yerde değişti. Tekrar dene.", EN: "Your connections changed somewhere else at the same time. Try again." },
};
const GENERIC_ERROR: Copy = { TR: "Bir şeyler ters gitti. Lütfen tekrar dene.", EN: "Something went wrong. Please try again." };

const LAST_ERRORS: Record<AiConnectionError, Copy> = {
    invalid_key: { TR: "Son denemede anahtar reddedildi; anahtarı kontrol et.", EN: "The key was rejected last time; check the key." },
    quota: { TR: "Sağlayıcı hesabında kota ya da kredi kalmamış.", EN: "No quota or credit left at the provider." },
    model_not_found: { TR: "Model sağlayıcıda bulunamadı; modeli değiştir.", EN: "The provider couldn't find the model; change it." },
    rate_limited: { TR: "Son denemede sağlayıcının istek sınırına takıldı.", EN: "Hit the provider's rate limit last time." },
    provider_error: { TR: "Son denemede sağlayıcı hata verdi.", EN: "The provider returned an error last time." },
    unreachable: { TR: "Son denemede sağlayıcıya ulaşılamadı.", EN: "The provider couldn't be reached last time." },
    key_unreadable: { TR: "Anahtar okunamıyor; bağlantıyı silip yeniden ekle.", EN: "The key can't be read; delete the connection and add it again." },
};

const LABEL = "text-[12px] font-bold text-ai-ink/75";
const FIELD = "mt-1 block h-10 w-full min-w-0 rounded-xl border border-ai-line bg-ai-surface px-3 text-[13.5px] text-ai-ink outline-none transition placeholder:text-zinc-400 focus:border-ai-ink/40 focus:ring-2 focus:ring-ai-ink/10 disabled:opacity-60 dark:[color-scheme:dark]";
const HINT = "mt-1 text-[11.5px] leading-snug text-ai-muted";
const PRIMARY = "inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-ai-ink px-4 text-[13.5px] font-bold text-ai-paper shadow-sm transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ai-ink/30 disabled:opacity-50 disabled:hover:opacity-40";
const SECONDARY = "inline-flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-xl border border-ai-line px-3.5 text-[13px] font-bold text-ai-ink/85 transition hover:bg-ai-ink/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ai-ink/30 disabled:opacity-50";
const SMALL = "inline-flex h-8 items-center gap-1 rounded-lg px-2.5 text-[12px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ai-ink/30 disabled:opacity-50";
const TEXT_LINK = "text-[12px] font-semibold text-brand-green hover:underline";

/** Runs a request while the dialog counts it as busy (it can't be closed meanwhile). */
type Track = <T>(run: () => Promise<T>) => Promise<T>;

function errorCopy(code: string): Copy {
    return ERRORS[code] ?? GENERIC_ERROR;
}

function formatDate(iso: string | null, locale: string) {
    const time = iso ? Date.parse(iso) : Number.NaN;
    if (!Number.isFinite(time)) return "";
    try {
        return new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric" }).format(time);
    } catch {
        return new Date(time).toISOString().slice(0, 10);
    }
}

function ConnectionRow({ item, selected, onUse, onState, track }: {
    item: AiConnectionView;
    selected: boolean;
    onUse: () => void;
    onState: (state: AiConnectionsState) => void;
    track: Track;
}) {
    const { tx, locale } = useI18n();
    const [mode, setMode] = useState<"view" | "edit" | "confirm">("view");
    const [label, setLabel] = useState(item.label);
    const [model, setModel] = useState(item.model);
    const [working, setWorking] = useState(false);
    const [error, setError] = useState<Copy | null>(null);
    const labelId = useId();
    const modelId = useId();
    // A retired provider's connection is shown only so it can be deleted.
    const retired = item.retired || !isAiProviderId(item.provider);
    const provider = isAiProviderId(item.provider) ? aiProvider(item.provider) : null;
    const providerLabel = providerName(item.provider);
    const lastError = !retired && item.lastError ? LAST_ERRORS[item.lastError] : undefined;
    const when = formatDate(item.lastUsedAt ?? item.createdAt, locale);
    const date = when ? tx(item.lastUsedAt ? C.lastUsed : C.added, { date: when }) : "";

    const send = async (body: Record<string, unknown>, done?: () => void) => {
        setWorking(true);
        setError(null);
        const result = await track(() => connectionsRequest(body));
        setWorking(false);
        if (!result.ok) {
            setError(errorCopy(result.code));
            return;
        }
        done?.();
        if (isConnectionsState(result.data)) onState(result.data);
    };

    return (
        <li className={cx("rounded-2xl border p-3", selected ? "border-sky-300 bg-sky-500/[0.04] dark:border-sky-400/30" : "border-ai-line")}>
            <div className="flex flex-wrap items-center gap-1.5">
                <span className="min-w-0 truncate text-[14px] font-bold">{item.label}</span>
                {retired ? (
                    <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10.5px] font-bold text-amber-700 dark:text-amber-300" data-connection-retired>{tx(C.retired)}</span>
                ) : selected ? (
                    <span className="rounded-full bg-sky-500/15 px-2 py-0.5 text-[10.5px] font-bold text-sky-700 dark:text-sky-300">{tx(C.selected)}</span>
                ) : item.active ? (
                    <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10.5px] font-bold text-emerald-700 dark:text-emerald-300">{tx(C.active)}</span>
                ) : (
                    <span className="rounded-full bg-zinc-500/10 px-2 py-0.5 text-[10.5px] font-bold text-ai-muted">{tx(C.inactive)}</span>
                )}
            </div>
            <p className="mt-0.5 truncate text-[12.5px] text-ai-ink/75">
                {providerLabel} · <span className="font-mono">{item.model || "—"}</span>
            </p>
            {retired ? <p className="mt-1 text-[11.5px] leading-snug text-amber-700 dark:text-amber-300">{tx(C.retiredHint)}</p> : null}
            <p className="mt-0.5 text-[11.5px] text-ai-muted">
                <span className="font-mono">{tx(C.keyHint, { hint: item.keyHint || "…" })}</span>
                {date ? ` · ${date}` : ""}
            </p>
            {lastError ? <p className="mt-1 text-[11.5px] font-semibold text-amber-700 dark:text-amber-300">{tx(lastError)}</p> : null}

            {mode === "edit" ? (
                <form
                    className="mt-3 space-y-2"
                    onSubmit={(event) => {
                        event.preventDefault();
                        if (!model.trim()) return;
                        void send({ action: "update", id: item.id, label: label.trim(), model: model.trim() }, () => setMode("view"));
                    }}
                >
                    <div>
                        <label htmlFor={labelId} className={LABEL}>{tx(C.labelField)}</label>
                        <input id={labelId} value={label} onChange={(event) => setLabel(event.target.value)} maxLength={CONNECTION_LABEL_MAX} placeholder={providerLabel} className={FIELD} />
                    </div>
                    <div>
                        <label htmlFor={modelId} className={LABEL}>{tx(C.model)}</label>
                        <input id={modelId} value={model} onChange={(event) => setModel(event.target.value)} maxLength={CONNECTION_MODEL_MAX} spellCheck={false} autoCapitalize="off" autoComplete="off" placeholder={tx(C.modelExample, { model: provider?.exampleModel ?? "" })} className={cx(FIELD, "font-mono")} />
                    </div>
                    <div className="flex justify-end gap-2 pt-1">
                        <button type="button" onClick={() => setMode("view")} disabled={working} className={cx(SMALL, "text-ai-ink/75 hover:bg-ai-ink/[0.05]")}>{tx(C.cancel)}</button>
                        <button type="submit" disabled={working || !model.trim()} className={cx(SMALL, "bg-ai-ink text-ai-paper hover:opacity-90")}>
                            {working ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Check className="h-3.5 w-3.5" aria-hidden />}
                            {tx(C.save)}
                        </button>
                    </div>
                </form>
            ) : mode === "confirm" ? (
                <div className="mt-3 rounded-xl bg-rose-500/[0.06] p-2.5">
                    <p className="text-[12.5px] font-semibold text-rose-700 dark:text-rose-300">{tx(C.confirmRemove)}</p>
                    <div className="mt-2 flex justify-end gap-2">
                        <button type="button" onClick={() => setMode("view")} disabled={working} className={cx(SMALL, "text-ai-ink/75 hover:bg-ai-ink/[0.05]")}>{tx(C.cancel)}</button>
                        <button type="button" autoFocus onClick={() => void send({ action: "delete", id: item.id })} disabled={working} className={cx(SMALL, "bg-rose-600 text-white hover:bg-rose-500")}>
                            {working ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Trash2 className="h-3.5 w-3.5" aria-hidden />}
                            {tx(C.confirmYes)}
                        </button>
                    </div>
                </div>
            ) : (
                <div className="mt-2 flex flex-wrap items-center gap-1">
                    {item.active && !selected && !retired ? (
                        <button type="button" onClick={onUse} className={cx(SMALL, "bg-sky-600 text-white hover:bg-sky-500")}>
                            <KeyRound className="h-3.5 w-3.5" aria-hidden />
                            {tx(C.use)}
                        </button>
                    ) : null}
                    {!retired ? (
                        <button
                            type="button"
                            onClick={() => {
                                setLabel(item.label);
                                setModel(item.model);
                                setError(null);
                                setMode("edit");
                            }}
                            className={cx(SMALL, "text-ai-ink/75 hover:bg-ai-ink/[0.05]")}
                        >
                            <Pencil className="h-3.5 w-3.5" aria-hidden />
                            {tx(C.edit)}
                        </button>
                    ) : null}
                    <button
                        type="button"
                        onClick={() => {
                            setError(null);
                            setMode("confirm");
                        }}
                        className={cx(SMALL, "text-rose-600 hover:bg-rose-500/10 dark:text-rose-400")}
                    >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden />
                        {tx(C.remove)}
                    </button>
                </div>
            )}
            {error ? <p role="alert" className="mt-2 text-[12px] font-semibold text-rose-600 dark:text-rose-400">{tx(error)}</p> : null}
        </li>
    );
}

function AddConnectionForm({ providers, onAdded, track }: {
    providers: AiProviderInfo[];
    onAdded: (state: AiConnectionsState, id: string | null) => void;
    track: Track;
}) {
    const { tx } = useI18n();
    const headingId = useId();
    const providerFieldId = useId();
    const keyFieldId = useId();
    const formatId = useId();
    const modelFieldId = useId();
    const labelFieldId = useId();
    const consentFieldId = useId();
    const [providerId, setProviderId] = useState<AiProviderId>(providers[0]?.id ?? "openai");
    const [apiKey, setApiKey] = useState("");
    // null until the key is verified; then the provider's chat models (maybe none).
    const [models, setModels] = useState<string[] | null>(null);
    const [model, setModel] = useState("");
    const [manual, setManual] = useState(false);
    const [label, setLabel] = useState("");
    // Consent is given for one provider: it is asked again when the provider changes.
    const [consent, setConsent] = useState(false);
    const [working, setWorking] = useState<"verify" | "save" | null>(null);
    const [error, setError] = useState<Copy | null>(null);
    const provider = providers.find((entry) => entry.id === providerId) ?? providers[0];
    if (!provider) return null;

    const resetVerification = () => {
        setModels(null);
        setModel("");
        setManual(false);
        setError(null);
    };

    const verify = async () => {
        const key = apiKey.trim();
        if (!isPlausibleApiKey(key)) {
            setError(C.keyLooksWrong);
            return;
        }
        setWorking("verify");
        setError(null);
        const result = await track(() => connectionsRequest({ action: "test", provider: providerId, apiKey: key }));
        setWorking(null);
        if (!result.ok) {
            setError(errorCopy(result.code));
            return;
        }
        const list = Array.isArray(result.data.models) ? result.data.models.filter((entry): entry is string => typeof entry === "string") : [];
        setModels(list);
        setManual(list.length === 0);
        setModel(list.includes(provider.exampleModel) ? provider.exampleModel : "");
    };

    const save = async () => {
        const chosen = model.trim();
        if (!models || !chosen) return;
        if (!consent) {
            setError(ERRORS.consent_required);
            return;
        }
        setWorking("save");
        setError(null);
        const result = await track(() => connectionsRequest({ action: "add", provider: providerId, apiKey: apiKey.trim(), model: chosen, label: label.trim(), consent: true }));
        setWorking(null);
        if (!result.ok) {
            setError(errorCopy(result.code));
            if (result.code === "invalid_key") setModels(null);
            return;
        }
        // The key is forgotten as soon as it is stored.
        setApiKey("");
        setLabel("");
        setConsent(false);
        resetVerification();
        const addedId = typeof result.data.addedId === "string" ? result.data.addedId : null;
        if (isConnectionsState(result.data)) onAdded(result.data, addedId);
    };

    return (
        <section aria-labelledby={headingId} className="rounded-2xl border border-ai-line p-3.5">
            <h3 id={headingId} className="flex items-center gap-1.5 text-[14px] font-bold">
                <Plus className="h-4 w-4 text-brand-green" aria-hidden />
                {tx(C.addTitle)}
            </h3>
            <form
                className="mt-3 space-y-3"
                onSubmit={(event) => {
                    event.preventDefault();
                    if (working) return;
                    void (models ? save() : verify());
                }}
            >
                <div>
                    <div className="flex items-center justify-between gap-2">
                        <label htmlFor={providerFieldId} className={LABEL}>{tx(C.provider)}</label>
                        <a href={provider.keyUrl} target="_blank" rel="noopener noreferrer" className={cx(TEXT_LINK, "inline-flex items-center gap-1")}>
                            {tx(C.getKey)}
                            <ExternalLink className="h-3 w-3" aria-hidden />
                        </a>
                    </div>
                    <select
                        id={providerFieldId}
                        value={providerId}
                        disabled={working !== null}
                        onChange={(event) => {
                            const next = providers.find((entry) => entry.id === event.target.value);
                            if (!next) return;
                            setProviderId(next.id);
                            setConsent(false);
                            resetVerification();
                        }}
                        className={FIELD}
                    >
                        {providers.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
                    </select>
                </div>
                <div>
                    <label htmlFor={keyFieldId} className={LABEL}>{tx(C.apiKey)}</label>
                    <div className="mt-1 flex flex-col gap-2 sm:flex-row">
                        <input
                            id={keyFieldId}
                            type="password"
                            name="hanogt-ai-provider-key"
                            value={apiKey}
                            disabled={working !== null}
                            onChange={(event) => {
                                setApiKey(event.target.value);
                                if (models) resetVerification();
                                else setError(null);
                            }}
                            maxLength={API_KEY_MAX + 32}
                            autoComplete="off"
                            autoCapitalize="off"
                            autoCorrect="off"
                            spellCheck={false}
                            data-1p-ignore
                            data-lpignore="true"
                            placeholder={provider.keyPlaceholder}
                            aria-describedby={formatId}
                            className={cx(FIELD, "mt-0 font-mono sm:flex-1")}
                        />
                        <button type="button" onClick={() => void verify()} disabled={working !== null || !apiKey.trim() || models !== null} className={SECONDARY}>
                            {working === "verify" ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden /> : models ? <Check className="h-4 w-4 text-emerald-500" aria-hidden /> : null}
                            {tx(working === "verify" ? C.verifying : models ? C.verified : C.verify)}
                        </button>
                    </div>
                    <p id={formatId} className={HINT}>{tx(C.keyFormat, { format: tx(provider.keyFormat) })}</p>
                </div>
                {models ? (
                    <>
                        <div>
                            <label htmlFor={modelFieldId} className={LABEL}>{tx(C.model)}</label>
                            {!manual && models.length ? (
                                <select id={modelFieldId} value={model} disabled={working !== null} onChange={(event) => setModel(event.target.value)} className={cx(FIELD, "font-mono")}>
                                    <option value="">{tx(C.chooseModel)}</option>
                                    {models.map((entry) => <option key={entry} value={entry}>{entry}</option>)}
                                </select>
                            ) : (
                                <input
                                    id={modelFieldId}
                                    value={model}
                                    disabled={working !== null}
                                    onChange={(event) => setModel(event.target.value)}
                                    maxLength={CONNECTION_MODEL_MAX}
                                    spellCheck={false}
                                    autoCapitalize="off"
                                    autoComplete="off"
                                    placeholder={tx(C.modelExample, { model: provider.exampleModel })}
                                    className={cx(FIELD, "font-mono")}
                                />
                            )}
                            {models.length ? (
                                <button
                                    type="button"
                                    onClick={() => {
                                        setManual(!manual);
                                        setModel("");
                                    }}
                                    className={cx(TEXT_LINK, "mt-1")}
                                >
                                    {tx(manual ? C.pickModel : C.typeModel)}
                                </button>
                            ) : (
                                <p className={HINT}>{tx(C.noModels)}</p>
                            )}
                        </div>
                        <div>
                            <label htmlFor={labelFieldId} className={LABEL}>{tx(C.label)}</label>
                            <input id={labelFieldId} value={label} disabled={working !== null} onChange={(event) => setLabel(event.target.value)} maxLength={CONNECTION_LABEL_MAX} placeholder={provider.name} className={FIELD} />
                        </div>
                        <div className="flex items-start gap-2.5 rounded-xl bg-ai-paper p-3">
                            <input
                                id={consentFieldId}
                                type="checkbox"
                                checked={consent}
                                disabled={working !== null}
                                required
                                onChange={(event) => {
                                    setConsent(event.target.checked);
                                    if (event.target.checked) setError(null);
                                }}
                                className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded border-ai-line accent-brand-green dark:border-white/20"
                            />
                            <label htmlFor={consentFieldId} className="cursor-pointer text-[12px] leading-relaxed text-ai-ink/85">{tx(C.consent)}</label>
                        </div>
                        <div className="flex justify-end">
                            <button type="submit" disabled={working !== null || !model.trim() || !consent} className={PRIMARY}>
                                {working === "save" ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden /> : <Check className="h-4 w-4" aria-hidden />}
                                {tx(working === "save" ? C.saving : C.add)}
                            </button>
                        </div>
                    </>
                ) : null}
                {error ? <p role="alert" className="text-[12.5px] font-semibold text-rose-600 dark:text-rose-400">{tx(error)}</p> : null}
            </form>
        </section>
    );
}

/**
 * Manages the person's own AI provider connections (Plus: 2, Pro: 5): the
 * list with plan state, key hints, label/model edits and deletion, and a form
 * that verifies a key with the provider before it is stored. Used by the
 * chat's dialog and by /ai/api.
 */
export default function ConnectionsManager({ connections, onUse, onNavigate, onBusyChange }: {
    connections: AiConnectionsHandle;
    /** "Use" on a connection, after it was selected for the chat. */
    onUse?: (id: string) => void;
    /** Leaving the page through a link (e.g. to /plans). */
    onNavigate?: () => void;
    /** A request is running (the dialog can't be closed meanwhile). */
    onBusyChange?: (busy: boolean) => void;
}) {
    const { tx, locale } = useI18n();
    const [pending, setPending] = useState(0);
    const [notice, setNotice] = useState<Copy | null>(null);
    const { state, loading, failed, selectedId, select, apply, refresh } = connections;
    const busy = pending > 0;

    // The plan may have changed since the list was loaded.
    useEffect(() => {
        refresh();
    }, [refresh]);

    useEffect(() => {
        onBusyChange?.(busy);
    }, [busy, onBusyChange]);

    const track: Track = useCallback(async <T,>(run: () => Promise<T>): Promise<T> => {
        setPending((count) => count + 1);
        try {
            return await run();
        } finally {
            setPending((count) => count - 1);
        }
    }, []);

    const onState = (next: AiConnectionsState) => {
        apply(next);
        setNotice(null);
        if (selectedId && !next.items.some((item) => item.id === selectedId)) select(null);
    };

    const onAdded = (next: AiConnectionsState, id: string | null) => {
        apply(next);
        if (id && next.items.some((item) => item.id === id && item.active)) {
            select(id);
            setNotice(C.addedSelected);
        }
    };

    const plansLink = (
        <Link href="/plans" onClick={onNavigate} className={cx(TEXT_LINK, "inline-flex items-center gap-1 whitespace-nowrap")}>
            {tx(C.seePlans)}
            <ArrowRight className="h-3 w-3 rtl:rotate-180" aria-hidden />
        </Link>
    );

    let body: ReactNode;
    if (!state) {
        body = failed ? (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
                <p className="text-[13.5px] font-semibold text-ai-ink/75">{tx(C.loadFailed)}</p>
                <button type="button" onClick={refresh} className={SECONDARY}>
                    <RotateCcw className="h-4 w-4" aria-hidden />
                    {tx(C.retry)}
                </button>
            </div>
        ) : (
            <p className="flex items-center justify-center gap-2 py-10 text-[13.5px] text-ai-muted" role="status">
                <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden />
                {tx(C.loading)}
            </p>
        );
    } else {
        // Retired providers' connections don't take up the plan's allowance.
        const count = state.items.filter((item) => !item.retired).length;
        const planName = PLAN_COPY[state.plan] ? tx(PLAN_COPY[state.plan].name) : state.plan;
        // Messages a day through own connections (Plus 3,000, Pro 10,000).
        const ownKey = PLAN_AI_FEATURES[state.plan]?.ownKey ?? null;
        const full = state.limit > 0 && count >= state.limit;
        const canAdd = state.canStore && state.limit > 0 && !full;
        const showPlans = state.limit === 0 || (full && state.plan !== "pro");
        body = (
            <>
                <section className="rounded-2xl bg-ai-paper p-3.5 text-[13px] leading-relaxed">
                    <p className="font-bold text-ai-ink">
                        {state.limit > 0 ? tx(C.planLine, { plan: planName, limit: state.limit }) : tx(C.planRequired)}
                    </p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-ai-ink/75">
                        <span>{tx(C.planLimits, { plus: PLAN_AI_CONNECTIONS.plus, pro: PLAN_AI_CONNECTIONS.pro })}</span>
                        {showPlans ? plansLink : null}
                    </p>
                    {state.limit > 0 && ownKey ? <p className="mt-0.5 text-[12px] text-ai-muted">{tx(C.ownLimit, { perDay: new Intl.NumberFormat(locale).format(ownKey.perDay) })}</p> : null}
                    {full ? <p className="mt-1.5 font-semibold text-amber-700 dark:text-amber-300">{tx(C.limitReached)}</p> : null}
                    {count > state.limit ? <p className="mt-1 text-[12px] text-ai-muted">{tx(C.inactiveNote)}</p> : null}
                    {!state.canStore && state.limit > 0 ? <p className="mt-1.5 font-semibold text-amber-700 dark:text-amber-300">{tx(C.encryptionOff)}</p> : null}
                </section>

                {notice ? <p role="status" className="rounded-xl bg-emerald-500/10 px-3 py-2 text-[12.5px] font-semibold text-emerald-700 dark:text-emerald-300">{tx(notice)}</p> : null}

                {/* Every stored connection is listed, a retired provider's too (it can only be deleted). */}
                {state.items.length ? (
                    <section>
                        <h3 className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-ai-muted">
                            {tx(C.yours)}
                            {loading ? <LoaderCircle className="h-3 w-3 animate-spin" aria-hidden /> : null}
                        </h3>
                        <ul className="space-y-2">
                            {state.items.map((item) => (
                                <ConnectionRow
                                    key={item.id}
                                    item={item}
                                    selected={item.id === selectedId}
                                    onUse={() => {
                                        select(item.id);
                                        onUse?.(item.id);
                                    }}
                                    onState={onState}
                                    track={track}
                                />
                            ))}
                        </ul>
                    </section>
                ) : state.limit > 0 ? (
                    <p className="text-[13px] text-ai-muted">{tx(C.none)}</p>
                ) : null}

                {canAdd ? <AddConnectionForm providers={state.providers} onAdded={onAdded} track={track} /> : null}
            </>
        );
    }

    return (
        <div className="space-y-4" data-connections-manager>
            {body}
            <p className="flex gap-2 rounded-2xl bg-sky-500/[0.06] p-3 text-[12px] leading-relaxed text-ai-ink/75">
                <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sky-600 dark:text-sky-300" aria-hidden />
                <span>{tx(C.privacy)}</span>
            </p>
        </div>
    );
}
