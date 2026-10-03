"use client";

import { ArrowLeft, Check, Download, FlaskConical, Gauge, History, LoaderCircle, MessagesSquare, Settings2, Sparkles, Trash2, UserRound } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import UsageList from "@/components/Plans/UsageList";
import { useRawSession } from "@/components/Provider";
import { AI_LENGTHS, AI_TONES, type AiSettings } from "@/lib/ai/ai-settings";
import { DEFAULT_CONNECTION } from "@/lib/ai/connections";
import { clearAllConversations, exportConversationsJson, useConversations } from "@/lib/ai/conversations";
import { setClearChatsOnSignOut, useClearChatsOnSignOut } from "@/lib/ai/sign-out";
import type { PlanUsage } from "@/lib/ai/usage";
import { FEATURES, isFeatureId, type FeatureId, type FeaturesResponse } from "@/lib/features";
import { LANGUAGES, useI18n, type Copy } from "@/lib/i18n";
import { PLAN_COPY } from "@/lib/plans";
import { useAiSettings } from "./ai-settings-store";
import { AGENT_MODE_OPTIONS, MODES } from "./chat-copy";
import { useAiConnections } from "./connections-store";
import { cx } from "./ui";

const C = {
    back: { TR: "Hanogt AI'a dön", EN: "Back to Hanogt AI" },
    title: { TR: "Hanogt AI ayarları", EN: "Hanogt AI settings" },
    subtitle: { TR: "Hanogt AI'ın seni nasıl yanıtlayacağını ve yeni sohbetlerin nasıl başlayacağını seç. Ayarlar hesabınla saklanır; sohbetlerin yalnızca bu tarayıcıda kalır.", EN: "Choose how Hanogt AI answers you and how new chats start. Settings are kept with your account; your chats stay in this browser only." },
    signIn: { TR: "Hanogt AI ayarları için giriş yap.", EN: "Sign in to change your Hanogt AI settings." },
    signInButton: { TR: "Giriş yap", EN: "Sign in" },
    loading: { TR: "Ayarlar yükleniyor…", EN: "Loading settings…" },
    loadFailed: { TR: "Ayarlar yüklenemedi.", EN: "Settings couldn't be loaded." },
    retry: { TR: "Tekrar dene", EN: "Try again" },
    personal: { TR: "Kişiselleştirme", EN: "Personalization" },
    personalHint: { TR: "Hanogt AI bunları her yanıtta dikkate alır; güvenlik kurallarını değiştiremezler.", EN: "Hanogt AI considers these in every answer; they can't change its safety rules." },
    about: { TR: "Hanogt AI senin hakkında neyi bilsin?", EN: "What should Hanogt AI know about you?" },
    aboutPlaceholder: { TR: "Örn. Lise öğrencisiyim, Python ve oyun geliştirme öğreniyorum.", EN: "E.g. I'm a student learning Python and game development." },
    style: { TR: "Nasıl yanıt versin?", EN: "How should it answer?" },
    stylePlaceholder: { TR: "Örn. Önce kısa özet ver, sonra adım adım anlat; kodda yorum satırı kullan.", EN: "E.g. Start with a short summary, then explain step by step; comment the code." },
    chars: { TR: "{count} / {max}", EN: "{count} / {max}" },
    planLimit: { TR: "{plan} planında her alan en fazla {max} karakter.", EN: "Up to {max} characters each on {plan}." },
    tone: { TR: "Üslup", EN: "Tone" },
    length: { TR: "Yanıt uzunluğu", EN: "Answer length" },
    language: { TR: "Yanıt dili", EN: "Answer language" },
    siteLanguage: { TR: "Sitenin dili (şu an {name})", EN: "The site's language (now {name})" },
    chat: { TR: "Sohbet", EN: "Chat" },
    chatHint: { TR: "Yeni sohbetler bu ayarlarla başlar. Bu cihazda seçtiğin ajan modu ve model, buradaki varsayılanlardan önce gelir.", EN: "New chats start with these. The agent mode and model you pick on a device win over these defaults there." },
    defaultMode: { TR: "Varsayılan yanıt modu", EN: "Default answer mode" },
    defaultModel: { TR: "Varsayılan model", EN: "Default model" },
    manageConnections: { TR: "Kendi anahtarlarını ve Hanogt AI API'sini yönet", EN: "Manage your own keys and the Hanogt AI API" },
    hanogtModel: { TR: "Hanogt AI (varsayılan)", EN: "Hanogt AI (default)" },
    agentMode: { TR: "Varsayılan ajan modu", EN: "Default agent mode" },
    attachFile: { TR: "Açık editör dosyasını sorulara ekle", EN: "Attach the open editor file to questions" },
    attachHint: { TR: "Editörde açık dosya varsa Hanogt AI onu okur (planına göre en fazla belli bir uzunluk).", EN: "When a file is open in the editor, Hanogt AI reads it (up to your plan's length)." },
    save: { TR: "Kaydet", EN: "Save" },
    saved: { TR: "Kaydedildi.", EN: "Saved." },
    unsaved: { TR: "Kaydedilmemiş değişiklikler var.", EN: "You have unsaved changes." },
    discard: { TR: "Vazgeç", EN: "Discard" },
    tooLong: { TR: "Bu alan planında en fazla {limit} karakter olabilir.", EN: "This field can be at most {limit} characters on your plan." },
    saveFailed: { TR: "Kaydedilemedi ({code}). Biraz sonra tekrar dene.", EN: "Couldn't save ({code}). Try again in a moment." },
    history: { TR: "Geçmiş ve gizlilik", EN: "History and privacy" },
    historyHint: { TR: "Sohbetlerin sunucuya kaydedilmez; yalnızca bu tarayıcıda saklanır.", EN: "Your chats aren't stored on the server; they're kept in this browser only." },
    chatCount: { TR: "Bu tarayıcıda {count} sohbet var.", EN: "{count} chats in this browser." },
    export: { TR: "Sohbetleri dışa aktar (JSON)", EN: "Export chats (JSON)" },
    deleteAll: { TR: "Tüm sohbetleri sil", EN: "Delete all chats" },
    deleteConfirm: { TR: "Bu tarayıcıdaki tüm Hanogt AI sohbetleri silinsin mi? Bu geri alınamaz.", EN: "Delete all Hanogt AI chats in this browser? This can't be undone." },
    deleted: { TR: "Sohbetler silindi.", EN: "Chats deleted." },
    clearOnSignOut: { TR: "Çıkış yapınca bu cihazdaki sohbetleri sil", EN: "Delete this device's chats when I sign out" },
    clearOnSignOutHint: { TR: "Bu bir cihaz ayarıdır; yalnızca bu tarayıcıda geçerli.", EN: "A device setting: it applies to this browser only." },
    usage: { TR: "Kullanım", EN: "Usage" },
    usageFailed: { TR: "Kullanım şu anda okunamadı.", EN: "Usage can't be read right now." },
    early: { TR: "Erken erişim", EN: "Early access" },
    earlyHint: { TR: "Yeni özellikler önce Hanogt ekibine, sonra erken erişimle Pro abonelerine, en son herkese açılır.", EN: "New features open to the Hanogt team first, then to Pro subscribers in early access, and finally to everyone." },
    open: { TR: "Sana açık", EN: "Open to you" },
    notYet: { TR: "Henüz açık değil", EN: "Not open yet" },
    noneEarly: { TR: "Şu an erken erişimde bir özellik yok; yeni bir özellik denemeye açıldığında burada görünür.", EN: "Nothing is in early access right now; when a new feature opens for trying, it shows up here." },
    earlyPro: { TR: "Erken erişim Pro planına dahil.", EN: "Early access comes with Pro." },
    seePlans: { TR: "Planları gör", EN: "See plans" },
    managePlan: { TR: "Tüm hakların", EN: "All your benefits" },
} satisfies Record<string, Copy>;

const TONE_COPY: Record<AiSettings["tone"], Copy> = {
    balanced: { TR: "Dengeli", EN: "Balanced" },
    friendly: { TR: "Samimi", EN: "Friendly" },
    professional: { TR: "Profesyonel", EN: "Professional" },
};
const LENGTH_COPY: Record<AiSettings["length"], Copy> = {
    short: { TR: "Kısa", EN: "Short" },
    normal: { TR: "Normal", EN: "Normal" },
    detailed: { TR: "Ayrıntılı", EN: "Detailed" },
};

const FIELD = "w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-[14px] text-zinc-900 outline-none transition placeholder:text-zinc-400 focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 dark:border-white/10 dark:bg-zinc-950/60 dark:text-zinc-100";
const LABEL = "block text-[13px] font-semibold text-zinc-700 dark:text-zinc-200";
const BUTTON = "inline-flex items-center justify-center gap-1.5 rounded-xl px-3.5 py-2 text-[13px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/60 disabled:opacity-50";

function Section({ id, icon, title, hint, children }: { id: string; icon: ReactNode; title: string; hint?: string; children: ReactNode }) {
    return (
        <section id={id} className="scroll-mt-24 rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-zinc-900 sm:p-6">
            <h2 className="flex items-center gap-2 text-[16px] font-black tracking-tight text-zinc-900 dark:text-white">{icon}{title}</h2>
            {hint ? <p className="mt-1 text-[13px] leading-relaxed text-zinc-500 dark:text-zinc-400">{hint}</p> : null}
            <div className="mt-4 space-y-4">{children}</div>
        </section>
    );
}

function Toggle({ checked, onChange, label, hint, name }: { checked: boolean; onChange: (value: boolean) => void; label: string; hint?: string; name: string }) {
    return (
        <label className="flex cursor-pointer items-start justify-between gap-4">
            <span>
                <span className={LABEL}>{label}</span>
                {hint ? <span className="mt-0.5 block text-[12px] text-zinc-500 dark:text-zinc-400">{hint}</span> : null}
            </span>
            <button
                type="button"
                role="switch"
                aria-checked={checked}
                aria-label={label}
                data-setting={name}
                onClick={() => onChange(!checked)}
                className={cx("relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/60", checked ? "bg-violet-600" : "bg-zinc-300 dark:bg-zinc-700")}
            >
                <span className={cx("inline-block h-5 w-5 rounded-full bg-white shadow transition", checked ? "translate-x-[22px] rtl:-translate-x-[22px]" : "translate-x-0.5 rtl:-translate-x-0.5")} />
            </button>
        </label>
    );
}

/** /ai/settings: the account's Hanogt AI settings, this device's history, usage and early access. */
export default function AiSettingsPage() {
    const { tx, language } = useI18n();
    const { data: session, status } = useRawSession();
    const signedIn = status === "authenticated";
    const email = signedIn ? session?.user?.email ?? null : null;
    const settings = useAiSettings(email);
    const connections = useAiConnections(email);
    const conversations = useConversations();
    const clearOnSignOut = useClearChatsOnSignOut();
    const [draft, setDraft] = useState<AiSettings | null>(null);
    const [loadedFrom, setLoadedFrom] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
    const [usage, setUsage] = useState<PlanUsage | null | "failed">(null);
    const [features, setFeatures] = useState<{ open: Record<FeatureId, boolean>; rollout: FeatureId[] } | null>(null);

    // The draft follows what the server has until it is edited (adjusted while rendering).
    const server = settings.data;
    const serverKey = server ? `${server.updatedAt ?? "new"}:${server.plan}:${JSON.stringify(server.settings)}` : null;
    if (server && serverKey !== loadedFrom) {
        setLoadedFrom(serverKey);
        setDraft(server.settings);
    }
    const dirty = Boolean(server && draft && JSON.stringify(draft) !== JSON.stringify(server.settings));

    useEffect(() => {
        if (!signedIn) return;
        let active = true;
        void fetch("/api/ai/usage?full=1", { cache: "no-store" })
            .then(async (response) => (response.ok ? response.json() as Promise<PlanUsage> : Promise.reject(new Error(String(response.status)))))
            .then((data) => {
                if (active) setUsage(data && typeof data === "object" && "counts" in data ? data : "failed");
            }, () => {
                if (active) setUsage("failed");
            });
        void fetch("/api/features", { cache: "no-store" })
            .then((response) => (response.ok ? response.json() as Promise<Partial<FeaturesResponse>> : null))
            .then((data) => {
                if (active && data?.features) setFeatures({ open: data.features, rollout: Array.isArray(data.rollout) ? data.rollout.filter(isFeatureId) : [] });
            }, () => undefined);
        return () => {
            active = false;
        };
    }, [signedIn]);

    const update = useCallback(<K extends keyof AiSettings>(key: K, value: AiSettings[K]) => {
        setDraft((current) => (current ? { ...current, [key]: value } : current));
        setMessage(null);
    }, []);

    const save = async () => {
        if (!draft) return;
        setBusy(true);
        const result = await settings.save(draft);
        setBusy(false);
        if (result.ok) setMessage({ tone: "success", text: tx(C.saved) });
        else if (result.code === "too_long" && result.limit) setMessage({ tone: "error", text: tx(C.tooLong, { limit: result.limit }) });
        else setMessage({ tone: "error", text: tx(C.saveFailed, { code: result.code }) });
    };

    const exportChats = () => {
        const blob = new Blob([exportConversationsJson()], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `hanogt-ai-chats-${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
    };

    const deleteChats = () => {
        if (!window.confirm(tx(C.deleteConfirm))) return;
        clearAllConversations();
        setMessage({ tone: "success", text: tx(C.deleted) });
    };

    const siteLanguageName = LANGUAGES.find((entry) => entry.code === language)?.name ?? language;
    const limit = server?.instructionsLimit ?? 500;
    const planName = server ? tx(PLAN_COPY[server.plan].name) : "";
    const activeConnections = connections.items.filter((item) => item.active);

    return (
        <div className="mx-auto max-w-3xl px-4 pb-24 pt-8 sm:px-6">
            <Link href="/ai" className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white"><ArrowLeft className="h-4 w-4 rtl:rotate-180" aria-hidden />{tx(C.back)}</Link>
            <h1 className="mt-3 flex items-center gap-2 text-3xl font-black tracking-tight text-zinc-900 dark:text-white"><Settings2 className="h-7 w-7 text-violet-500" aria-hidden />{tx(C.title)}</h1>
            <p className="mt-2 text-[14px] leading-relaxed text-zinc-500 dark:text-zinc-400">{tx(C.subtitle)}</p>

            {status === "unauthenticated" ? (
                <div className="mt-8 rounded-3xl border border-zinc-200 bg-white p-6 text-center dark:border-white/10 dark:bg-zinc-900">
                    <p className="text-[14px] text-zinc-600 dark:text-zinc-300">{tx(C.signIn)}</p>
                    <Link href="/login?callbackUrl=%2Fai%2Fsettings" className={cx(BUTTON, "mt-4 bg-violet-600 text-white hover:bg-violet-500")}>{tx(C.signInButton)}</Link>
                </div>
            ) : !draft ? (
                <div className="mt-8 flex items-center gap-2 text-[14px] text-zinc-500">
                    {settings.failed ? (
                        <>
                            <span>{tx(C.loadFailed)}</span>
                            <button type="button" onClick={settings.refresh} className="font-semibold text-violet-600 underline dark:text-violet-300">{tx(C.retry)}</button>
                        </>
                    ) : (
                        <><LoaderCircle className="h-4 w-4 animate-spin" aria-hidden />{tx(C.loading)}</>
                    )}
                </div>
            ) : (
                <div className="mt-8 space-y-6" data-ai-settings-form>
                    <Section id="personal" icon={<UserRound className="h-5 w-5 text-violet-500" aria-hidden />} title={tx(C.personal)} hint={tx(C.personalHint)}>
                        {(["about", "style"] as const).map((field) => (
                            <div key={field}>
                                <label className={LABEL} htmlFor={`ai-${field}`}>{tx(field === "about" ? C.about : C.style)}</label>
                                <textarea
                                    id={`ai-${field}`}
                                    data-setting={field}
                                    value={draft[field]}
                                    maxLength={limit}
                                    rows={field === "about" ? 3 : 4}
                                    placeholder={tx(field === "about" ? C.aboutPlaceholder : C.stylePlaceholder)}
                                    onChange={(event) => update(field, event.target.value)}
                                    className={cx(FIELD, "mt-1.5 resize-y leading-relaxed")}
                                />
                                <p className={cx("mt-1 text-end text-[11.5px] tabular-nums", draft[field].length >= limit ? "font-semibold text-amber-600 dark:text-amber-300" : "text-zinc-400")}>{tx(C.chars, { count: draft[field].length, max: limit })}</p>
                            </div>
                        ))}
                        <p className="text-[12px] text-zinc-500 dark:text-zinc-400">
                            {tx(C.planLimit, { plan: planName, max: limit })} <Link href="/plans" className="font-semibold text-violet-600 hover:underline dark:text-violet-300">{tx(C.seePlans)}</Link>
                        </p>
                        <div className="grid gap-4 sm:grid-cols-3">
                            <div>
                                <label className={LABEL} htmlFor="ai-tone">{tx(C.tone)}</label>
                                <select id="ai-tone" data-setting="tone" value={draft.tone} onChange={(event) => update("tone", event.target.value as AiSettings["tone"])} className={cx(FIELD, "mt-1.5")}>
                                    {AI_TONES.map((tone) => <option key={tone} value={tone}>{tx(TONE_COPY[tone])}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className={LABEL} htmlFor="ai-length">{tx(C.length)}</label>
                                <select id="ai-length" data-setting="length" value={draft.length} onChange={(event) => update("length", event.target.value as AiSettings["length"])} className={cx(FIELD, "mt-1.5")}>
                                    {AI_LENGTHS.map((length) => <option key={length} value={length}>{tx(LENGTH_COPY[length])}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className={LABEL} htmlFor="ai-language">{tx(C.language)}</label>
                                <select id="ai-language" data-setting="language" value={draft.language} onChange={(event) => update("language", event.target.value)} className={cx(FIELD, "mt-1.5")}>
                                    <option value="site">{tx(C.siteLanguage, { name: siteLanguageName })}</option>
                                    {LANGUAGES.map((entry) => <option key={entry.code} value={entry.code}>{entry.name}</option>)}
                                </select>
                            </div>
                        </div>
                    </Section>

                    <Section id="chat" icon={<MessagesSquare className="h-5 w-5 text-violet-500" aria-hidden />} title={tx(C.chat)} hint={tx(C.chatHint)}>
                        <div className="grid gap-4 sm:grid-cols-3">
                            <div>
                                <label className={LABEL} htmlFor="ai-mode">{tx(C.defaultMode)}</label>
                                <select id="ai-mode" data-setting="defaultMode" value={draft.defaultMode} onChange={(event) => update("defaultMode", event.target.value as AiSettings["defaultMode"])} className={cx(FIELD, "mt-1.5")}>
                                    {MODES.map((mode) => <option key={mode.id} value={mode.id}>{tx(mode.label)}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className={LABEL} htmlFor="ai-model">{tx(C.defaultModel)}</label>
                                <select id="ai-model" data-setting="defaultModel" value={draft.defaultModel} onChange={(event) => update("defaultModel", event.target.value)} className={cx(FIELD, "mt-1.5")}>
                                    <option value={DEFAULT_CONNECTION}>{tx(C.hanogtModel)}</option>
                                    {activeConnections.map((item) => <option key={item.id} value={item.id}>{`${item.label} · ${item.model}`}</option>)}
                                    {draft.defaultModel !== DEFAULT_CONNECTION && !activeConnections.some((item) => item.id === draft.defaultModel) ? <option value={draft.defaultModel}>{draft.defaultModel}</option> : null}
                                </select>
                                <Link href="/ai/api#connections" className="mt-1.5 inline-block text-[12px] font-semibold text-violet-600 hover:underline dark:text-violet-300" data-settings-connections-link>{tx(C.manageConnections)}</Link>
                            </div>
                            <div>
                                <label className={LABEL} htmlFor="ai-agent">{tx(C.agentMode)}</label>
                                <select id="ai-agent" data-setting="agentMode" value={draft.agentMode} onChange={(event) => update("agentMode", event.target.value as AiSettings["agentMode"])} className={cx(FIELD, "mt-1.5")}>
                                    {AGENT_MODE_OPTIONS.map((option) => <option key={option.id} value={option.id}>{tx(option.label)}</option>)}
                                </select>
                            </div>
                        </div>
                        <Toggle name="attachEditorFile" checked={draft.attachEditorFile} onChange={(value) => update("attachEditorFile", value)} label={tx(C.attachFile)} hint={tx(C.attachHint)} />
                    </Section>

                    <div className="sticky bottom-4 z-10 flex flex-wrap items-center justify-end gap-3 rounded-2xl border border-zinc-200 bg-white/90 px-4 py-3 shadow-lg backdrop-blur dark:border-white/10 dark:bg-zinc-900/90">
                        {message ? (
                            <p role={message.tone === "error" ? "alert" : "status"} className={cx("me-auto inline-flex items-center gap-1.5 text-[13px] font-semibold", message.tone === "error" ? "text-rose-600 dark:text-rose-300" : "text-emerald-600 dark:text-emerald-300")} data-settings-message>
                                {message.tone === "success" ? <Check className="h-4 w-4" aria-hidden /> : null}{message.text}
                            </p>
                        ) : dirty ? <p className="me-auto text-[13px] text-zinc-500">{tx(C.unsaved)}</p> : null}
                        {dirty ? <button type="button" onClick={() => server && setDraft(server.settings)} disabled={busy} className={cx(BUTTON, "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-white/10")}>{tx(C.discard)}</button> : null}
                        <button type="button" onClick={() => void save()} disabled={busy || !dirty} className={cx(BUTTON, "bg-violet-600 text-white hover:bg-violet-500")} data-settings-save>
                            {busy ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden /> : <Check className="h-4 w-4" aria-hidden />}{tx(C.save)}
                        </button>
                    </div>

                    <Section id="history" icon={<History className="h-5 w-5 text-violet-500" aria-hidden />} title={tx(C.history)} hint={tx(C.historyHint)}>
                        <p className="text-[13px] text-zinc-600 dark:text-zinc-300">{tx(C.chatCount, { count: conversations.length })}</p>
                        <div className="flex flex-wrap gap-2">
                            <button type="button" onClick={exportChats} disabled={!conversations.length} className={cx(BUTTON, "border border-zinc-200 text-zinc-700 hover:bg-zinc-50 dark:border-white/10 dark:text-zinc-200 dark:hover:bg-white/5")}><Download className="h-4 w-4" aria-hidden />{tx(C.export)}</button>
                            <button type="button" onClick={deleteChats} disabled={!conversations.length} className={cx(BUTTON, "border border-rose-200 text-rose-600 hover:bg-rose-50 dark:border-rose-500/30 dark:text-rose-300 dark:hover:bg-rose-500/10")} data-delete-chats><Trash2 className="h-4 w-4" aria-hidden />{tx(C.deleteAll)}</button>
                        </div>
                        <Toggle name="clearOnSignOut" checked={clearOnSignOut} onChange={setClearChatsOnSignOut} label={tx(C.clearOnSignOut)} hint={tx(C.clearOnSignOutHint)} />
                    </Section>

                    <Section id="plan-usage" icon={<Gauge className="h-5 w-5 text-violet-500" aria-hidden />} title={tx(C.usage)}>
                        {usage === "failed" ? <p className="text-[13px] text-zinc-500">{tx(C.usageFailed)}</p> : usage ? (
                            <div className="flex flex-col gap-3">
                                <UsageList usage={usage} />
                                <Link href="/plans#usage" className="text-[13px] font-semibold text-violet-600 hover:underline dark:text-violet-300">{tx(C.managePlan)}</Link>
                            </div>
                        ) : <LoaderCircle className="h-4 w-4 animate-spin text-zinc-400" aria-hidden />}
                    </Section>

                    <Section id="early-access" icon={<FlaskConical className="h-5 w-5 text-violet-500" aria-hidden />} title={tx(C.early)} hint={tx(C.earlyHint)}>
                        {features && !features.rollout.length ? <p className="text-[13px] text-zinc-500 dark:text-zinc-400" data-early-access-empty>{tx(C.noneEarly)}</p> : null}
                        <ul className="divide-y divide-zinc-100 dark:divide-white/[0.06]" data-early-access>
                            {(features?.rollout ?? []).map((id) => {
                                const open = features?.open[id] ?? false;
                                return (
                                    <li key={id} className="flex items-start justify-between gap-3 py-2.5">
                                        <span>
                                            <span className="flex items-center gap-1.5 text-[14px] font-semibold text-zinc-800 dark:text-zinc-100"><Sparkles className="h-3.5 w-3.5 text-fuchsia-500" aria-hidden />{tx(FEATURES[id].title)}</span>
                                            <span className="mt-0.5 block text-[12.5px] text-zinc-500 dark:text-zinc-400">{tx(FEATURES[id].description)}</span>
                                        </span>
                                        <span className={cx("shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold", open ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "bg-zinc-500/10 text-zinc-500")} data-feature-state={id}>{tx(open ? C.open : C.notYet)}</span>
                                    </li>
                                );
                            })}
                        </ul>
                        {server?.plan !== "pro" ? <p className="text-[12.5px] text-zinc-500 dark:text-zinc-400">{tx(C.earlyPro)} <Link href="/plans" className="font-semibold text-violet-600 hover:underline dark:text-violet-300">{tx(C.seePlans)}</Link></p> : null}
                    </Section>
                </div>
            )}
        </div>
    );
}
