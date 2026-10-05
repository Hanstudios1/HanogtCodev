"use client";

import { ArrowLeft, Brain, Check, Code2, Download, FlaskConical, Gauge, History, LoaderCircle, MessagesSquare, Mic, Play, Settings2, Sparkles, Square, Trash2, UserRound, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import UsageList from "@/components/Plans/UsageList";
import { useRawSession } from "@/components/Provider";
import { AI_ANSWER_FONTS, AI_CODE_OUTPUTS, AI_CODE_STYLE_MAX, AI_EXPERTISE, AI_LENGTHS, AI_PREFERRED_LANGUAGES_MAX, AI_RETENTION_DAYS, AI_SEND_SHORTCUTS, AI_TONES, AI_VOICE_RATE_MAX, AI_VOICE_RATE_MIN, type AiSettings } from "@/lib/ai/ai-settings";
import { DEFAULT_CONNECTION } from "@/lib/ai/connections";
import { THINKING_SETTINGS } from "@/lib/ai/thinking";
import { clearAllConversations, exportConversationsJson, useConversations } from "@/lib/ai/conversations";
import { setClearChatsOnSignOut, useClearChatsOnSignOut } from "@/lib/ai/sign-out";
import type { PlanUsage } from "@/lib/ai/usage";
import { FEATURES, isFeatureId, type FeatureId, type FeaturesResponse } from "@/lib/features";
import { LANGUAGES, useI18n, type Copy } from "@/lib/i18n";
import { PLAN_COPY } from "@/lib/plans";
import { LANGUAGES as CODE_LANGUAGES, languageDisplayName } from "@/lib/runtimes/languages";
import { useAiSettings } from "./ai-settings-store";
import { AGENT_MODE_OPTIONS, MODES } from "./chat-copy";
import { useAiConnections } from "./connections-store";
import { cx } from "./ui";
import { useSpeech, useSpeechVoices, useVoice } from "./voice";

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
    thinkingSection: { TR: "Düşünme", EN: "Thinking" },
    thinkingSectionHint: { TR: "Hanogt AI zor sorularda yanıt vermeden önce düşünebilir. Düşünme yanıtı biraz geciktirir ama kod ve hata ayıklamada daha isabetli sonuç verir.", EN: "Hanogt AI can think before it answers hard questions. Thinking makes the answer a little slower but more accurate in code and debugging." },
    thinking: { TR: "Yanıt vermeden önce düşün", EN: "Think before answering" },
    showThinking: { TR: "Düşünmeyi ve adımları göster", EN: "Show the thinking and the steps" },
    showThinkingHint: { TR: "Yanıtın üstünde “N sn düşündü” paneli açılır: modelin düşünmesi, okunan bilgi kaynakları ve çalışan denetimler. Düşünme yalnızca bu tarayıcıda saklanır ve sonraki mesajlarla geri gönderilmez.", EN: "A “Thought for N s” panel opens above the answer: the model's thinking, the knowledge sources read and the checks that ran. Thinking is kept in this browser only and never sent back with later messages." },
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
    expertise: { TR: "Uzmanlık düzeyin", EN: "Your experience" },
    code: { TR: "Kod", EN: "Code" },
    codeHint: { TR: "Hanogt AI'ın yazdığı kod ve editördeki dosyanla nasıl çalışacağı.", EN: "How Hanogt AI writes code and works with the file in your editor." },
    commentLanguage: { TR: "Kod yorumlarının dili", EN: "Language of code comments" },
    sameAsAnswer: { TR: "Yanıtla aynı dil", EN: "Same as the answer" },
    preferredLanguages: { TR: "Tercih ettiğin programlama dilleri", EN: "Programming languages you prefer" },
    preferredHint: { TR: "Soruda dil belirtmediğinde bunlar kullanılır (en fazla {max}).", EN: "Used when a question names no language (up to {max})." },
    addLanguage: { TR: "Dil ekle…", EN: "Add a language…" },
    removeLanguage: { TR: "{name} dilini kaldır", EN: "Remove {name}" },
    codeStyle: { TR: "Kod stilin", EN: "Your code style" },
    codeStylePlaceholder: { TR: "Örn. 4 boşluk, tek tırnak, açıklayıcı değişken adları", EN: "E.g. 4 spaces, single quotes, descriptive names" },
    codeOutput: { TR: "Editördeki dosyada değişiklik", EN: "Changes to the file in your editor" },
    consoleErrors: { TR: "Son çalıştırmanın hatalarını ekle", EN: "Attach errors from the last run" },
    consoleErrorsHint: { TR: "Kodun hata verdiyse Hanogt AI konsol çıktısını da okur (en fazla 3.000 karakter).", EN: "When your code failed, Hanogt AI also reads the console output (up to 3,000 characters)." },
    projectTree: { TR: "Projedeki diğer dosyaların adlarını ekle", EN: "Attach the names of the project's other files" },
    projectTreeHint: { TR: "Yalnızca dosya adları gider, içerikleri gitmez.", EN: "Only file names are sent, not their contents." },
    sendShortcut: { TR: "Gönderme kısayolu", EN: "Send shortcut" },
    autoOpen: { TR: "Uzun kodu ve web sayfalarını yan panelde kendiliğinden aç", EN: "Open long code and web pages in the side panel automatically" },
    autoOpenHint: { TR: "Geniş ekranlarda, yanıt bitince.", EN: "On wide screens, when the answer finishes." },
    answerFont: { TR: "Yanıt yazı tipi", EN: "Answer font" },
    voice: { TR: "Ses", EN: "Voice" },
    voiceHint: { TR: "Sesle yazma ve yanıtları sesli dinleme; tanıma ve okuma tarayıcının kendi sesleriyle yapılır.", EN: "Dictation and listening to answers; recognition and reading use your browser's own voices." },
    voiceEarly: { TR: "Sesli özellikler şu an erken erişimde; ayarların sana açıldığında geçerli olur.", EN: "Voice features are in early access; your settings apply once they open to you." },
    dictationLanguage: { TR: "Dikte dili", EN: "Dictation language" },
    siteLanguageShort: { TR: "Sitenin dili", EN: "The site's language" },
    answerVoice: { TR: "Yanıt sesi", EN: "Answer voice" },
    autoVoice: { TR: "Otomatik (yanıtın diline göre)", EN: "Automatic (by the answer's language)" },
    noVoices: { TR: "Bu tarayıcıda okuma sesi bulunamadı.", EN: "No reading voices were found in this browser." },
    voiceRate: { TR: "Okuma hızı: {rate}×", EN: "Reading speed: {rate}×" },
    listen: { TR: "Dinle", EN: "Listen" },
    stopListening: { TR: "Durdur", EN: "Stop" },
    previewText: { TR: "Merhaba! Ben Hanogt AI. Yanıtlarımı bu sesle ve bu hızda okuyacağım.", EN: "Hello! I'm Hanogt AI. I'll read my answers in this voice and at this speed." },
    retention: { TR: "Sohbetleri bu tarayıcıda sakla", EN: "Keep chats in this browser" },
    retentionHint: { TR: "Daha eski sohbetler bu tarayıcıdan kendiliğinden silinir.", EN: "Older chats are deleted from this browser automatically." },
    forever: { TR: "Süresiz", EN: "Forever" },
    days: { TR: "{days} gün", EN: "{days} days" },
} satisfies Record<string, Copy>;

const EXPERTISE_COPY: Record<AiSettings["expertise"], Copy> = {
    beginner: { TR: "Yeni başlıyorum", EN: "I'm a beginner" },
    intermediate: { TR: "Orta düzey", EN: "Intermediate" },
    expert: { TR: "Deneyimliyim", EN: "Experienced" },
};
const CODE_OUTPUT_COPY: Record<AiSettings["codeOutput"], { label: Copy; hint: Copy }> = {
    full: { label: { TR: "Tam dosya", EN: "Whole file" }, hint: { TR: "Dosyanın son hâli gelir; kısa dosyalarda en kolayı.", EN: "The file as it should be; easiest for short files." } },
    diff: { label: { TR: "Yalnızca fark", EN: "Just the diff" }, hint: { TR: "Yalnızca değişen satırlar gelir; uzun dosyalarda daha hızlı.", EN: "Only the changed lines; faster for long files." } },
};
const SEND_COPY: Record<AiSettings["sendShortcut"], Copy> = {
    enter: { TR: "Enter ile gönder (Shift+Enter yeni satır)", EN: "Enter sends (Shift+Enter for a new line)" },
    "mod-enter": { TR: "Ctrl+Enter ile gönder (Mac'te Cmd+Enter)", EN: "Ctrl+Enter sends (Cmd+Enter on a Mac)" },
};
const FONT_COPY: Record<AiSettings["answerFont"], Copy> = {
    serif: { TR: "Serif (kâğıt gibi)", EN: "Serif (like paper)" },
    sans: { TR: "Sans-serif", EN: "Sans-serif" },
};
/** Languages the browser's speech recognition commonly knows. */
const DICTATION_LANGUAGES = ["tr-TR", "en-US", "en-GB", "de-DE", "fr-FR", "es-ES", "it-IT", "pt-BR", "pt-PT", "nl-NL", "ru-RU", "uk-UA", "pl-PL", "az-AZ", "ar-SA", "fa-IR", "hi-IN", "id-ID", "ja-JP", "ko-KR", "zh-CN", "sv-SE"];
/** Programming languages to choose from: the popular ones first. */
const PICKABLE_LANGUAGES = CODE_LANGUAGES.filter((language) => language.id !== "plaintext")
    .slice()
    .sort((a, b) => Number(Boolean(b.popular)) - Number(Boolean(a.popular)) || a.name.localeCompare(b.name));

const TONE_COPY: Record<AiSettings["tone"], Copy> = {
    balanced: { TR: "Dengeli", EN: "Balanced" },
    friendly: { TR: "Samimi", EN: "Friendly" },
    professional: { TR: "Profesyonel", EN: "Professional" },
};
const THINKING_COPY: Record<AiSettings["thinking"], Copy> = {
    auto: { TR: "Otomatik (kod, güvenlik ve uzun sorularda)", EN: "Automatic (code, security and long questions)" },
    on: { TR: "Her zaman", EN: "Always" },
    off: { TR: "Kapalı", EN: "Off" },
};
const LENGTH_COPY: Record<AiSettings["length"], Copy> = {
    short: { TR: "Kısa", EN: "Short" },
    normal: { TR: "Normal", EN: "Normal" },
    detailed: { TR: "Ayrıntılı", EN: "Detailed" },
};

const FIELD = "w-full rounded-xl border border-ai-line bg-ai-surface px-3 py-2 text-[14px] text-ai-ink outline-none transition placeholder:text-zinc-400 focus:border-ai-ink/40 focus:ring-2 focus:ring-ai-ink/10";
const LABEL = "block text-[13px] font-semibold text-ai-ink/85";
const BUTTON = "inline-flex items-center justify-center gap-1.5 rounded-xl px-3.5 py-2 text-[13px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ai-ink/30 disabled:opacity-50";

function Section({ id, icon, title, hint, children }: { id: string; icon: ReactNode; title: string; hint?: string; children: ReactNode }) {
    return (
        <section id={id} className="scroll-mt-24 rounded-3xl border border-ai-line bg-ai-surface p-5 shadow-sm sm:p-6">
            <h2 className="flex items-center gap-2 text-[16px] font-black tracking-tight text-ai-ink">{icon}{title}</h2>
            {hint ? <p className="mt-1 text-[13px] leading-relaxed text-ai-muted">{hint}</p> : null}
            <div className="mt-4 space-y-4">{children}</div>
        </section>
    );
}

function Toggle({ checked, onChange, label, hint, name }: { checked: boolean; onChange: (value: boolean) => void; label: string; hint?: string; name: string }) {
    return (
        <label className="flex cursor-pointer items-start justify-between gap-4">
            <span>
                <span className={LABEL}>{label}</span>
                {hint ? <span className="mt-0.5 block text-[12px] text-ai-muted">{hint}</span> : null}
            </span>
            <button
                type="button"
                role="switch"
                aria-checked={checked}
                aria-label={label}
                data-setting={name}
                onClick={() => onChange(!checked)}
                className={cx("relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ai-ink/30", checked ? "bg-brand-green" : "bg-zinc-300 dark:bg-zinc-700")}
            >
                <span className={cx("inline-block h-5 w-5 rounded-full bg-white shadow transition", checked ? "translate-x-[22px] rtl:-translate-x-[22px]" : "translate-x-0.5 rtl:-translate-x-0.5")} />
            </button>
        </label>
    );
}

function displayLanguage(code: string, locale: string) {
    try {
        return new Intl.DisplayNames([locale], { type: "language" }).of(code) ?? code;
    } catch {
        return code;
    }
}

/** Up to five programming languages, as removable chips and a list to add from. */
function LanguagePicker({ value, onChange }: { value: string[]; onChange: (next: string[]) => void }) {
    const { tx } = useI18n();
    const full = value.length >= AI_PREFERRED_LANGUAGES_MAX;
    return (
        <div>
            <p className={LABEL}>{tx(C.preferredLanguages)}</p>
            <p className="mt-0.5 text-[12px] text-ai-muted">{tx(C.preferredHint, { max: AI_PREFERRED_LANGUAGES_MAX })}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2" data-setting="preferredLanguages">
                {value.map((id) => (
                    <span key={id} className="inline-flex items-center gap-1 rounded-full border border-ai-line bg-ai-paper py-1 pe-1 ps-3 text-[12.5px] font-semibold text-ai-ink">
                        {languageDisplayName(id)}
                        <button type="button" onClick={() => onChange(value.filter((entry) => entry !== id))} className="grid h-5 w-5 place-items-center rounded-full text-ai-muted transition hover:bg-ai-ink/[0.08] hover:text-ai-ink" aria-label={tx(C.removeLanguage, { name: languageDisplayName(id) })}>
                            <X className="h-3 w-3" aria-hidden />
                        </button>
                    </span>
                ))}
                {!full ? (
                    <select
                        value=""
                        aria-label={tx(C.addLanguage)}
                        onChange={(event) => {
                            const id = event.target.value;
                            if (id && !value.includes(id)) onChange([...value, id].slice(0, AI_PREFERRED_LANGUAGES_MAX));
                        }}
                        className={cx(FIELD, "w-auto py-1.5 text-[13px]")}
                        data-setting="addPreferredLanguage"
                    >
                        <option value="">{tx(C.addLanguage)}</option>
                        {PICKABLE_LANGUAGES.filter((language) => !value.includes(language.id)).map((language) => <option key={language.id} value={language.id}>{language.name}</option>)}
                    </select>
                ) : null}
            </div>
        </div>
    );
}

/** /ai/settings: the account's Hanogt AI settings, this device's history, usage and early access. */
export default function AiSettingsPage() {
    const { tx, language, locale } = useI18n();
    const { data: session, status } = useRawSession();
    const voice = useVoice();
    const voices = useSpeechVoices();
    const speech = useSpeech();
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
    // Voices for the site's language first, then the rest by name.
    const voiceOptions = useMemo(() => {
        const prefix = language.toLowerCase();
        return [...voices].sort((a, b) => Number(b.lang.toLowerCase().startsWith(prefix)) - Number(a.lang.toLowerCase().startsWith(prefix)) || a.name.localeCompare(b.name));
    }, [language, voices]);
    const previewing = speech.speakingId === "settings-preview";

    return (
        <div className="mx-auto max-w-3xl px-4 pb-24 pt-8 sm:px-6">
            <Link href="/ai" className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-ai-muted hover:text-ai-ink"><ArrowLeft className="h-4 w-4 rtl:rotate-180" aria-hidden />{tx(C.back)}</Link>
            <h1 className="mt-3 flex items-center gap-2 text-3xl font-black tracking-tight text-ai-ink"><Settings2 className="h-7 w-7 text-brand-green" aria-hidden />{tx(C.title)}</h1>
            <p className="mt-2 text-[14px] leading-relaxed text-ai-muted">{tx(C.subtitle)}</p>

            {status === "unauthenticated" ? (
                <div className="mt-8 rounded-3xl border border-ai-line bg-ai-surface p-6 text-center">
                    <p className="text-[14px] text-ai-ink/75">{tx(C.signIn)}</p>
                    <Link href="/login?callbackUrl=%2Fai%2Fsettings" className={cx(BUTTON, "mt-4 bg-ai-ink text-ai-paper hover:opacity-90")}>{tx(C.signInButton)}</Link>
                </div>
            ) : !draft ? (
                <div className="mt-8 flex items-center gap-2 text-[14px] text-ai-muted">
                    {settings.failed ? (
                        <>
                            <span>{tx(C.loadFailed)}</span>
                            <button type="button" onClick={settings.refresh} className="font-semibold text-brand-green underline">{tx(C.retry)}</button>
                        </>
                    ) : (
                        <><LoaderCircle className="h-4 w-4 animate-spin" aria-hidden />{tx(C.loading)}</>
                    )}
                </div>
            ) : (
                <div className="mt-8 space-y-6" data-ai-settings-form>
                    <Section id="personal" icon={<UserRound className="h-5 w-5 text-brand-green" aria-hidden />} title={tx(C.personal)} hint={tx(C.personalHint)}>
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
                                <p className={cx("mt-1 text-end text-[11.5px] tabular-nums", draft[field].length >= limit ? "font-semibold text-amber-600 dark:text-amber-300" : "text-ai-muted")}>{tx(C.chars, { count: draft[field].length, max: limit })}</p>
                            </div>
                        ))}
                        <p className="text-[12px] text-ai-muted">
                            {tx(C.planLimit, { plan: planName, max: limit })} <Link href="/plans" className="font-semibold text-brand-green hover:underline">{tx(C.seePlans)}</Link>
                        </p>
                        <div className="grid gap-4 sm:grid-cols-2">
                            <div>
                                <label className={LABEL} htmlFor="ai-expertise">{tx(C.expertise)}</label>
                                <select id="ai-expertise" data-setting="expertise" value={draft.expertise} onChange={(event) => update("expertise", event.target.value as AiSettings["expertise"])} className={cx(FIELD, "mt-1.5")}>
                                    {AI_EXPERTISE.map((level) => <option key={level} value={level}>{tx(EXPERTISE_COPY[level])}</option>)}
                                </select>
                            </div>
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

                    <Section id="code" icon={<Code2 className="h-5 w-5 text-brand-green" aria-hidden />} title={tx(C.code)} hint={tx(C.codeHint)}>
                        <fieldset>
                            <legend className={LABEL}>{tx(C.codeOutput)}</legend>
                            <div className="mt-1.5 grid gap-2 sm:grid-cols-2" role="radiogroup">
                                {AI_CODE_OUTPUTS.map((option) => {
                                    const selected = draft.codeOutput === option;
                                    return (
                                        <button key={option} type="button" role="radio" aria-checked={selected} onClick={() => update("codeOutput", option)} data-setting={`codeOutput-${option}`}
                                            className={cx("rounded-2xl border p-3 text-start transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ai-ink/30", selected ? "border-ai-ink/40 bg-ai-ink/[0.04]" : "border-ai-line hover:border-ai-ink/25")}>
                                            <span className="flex items-center gap-2 text-[13.5px] font-semibold text-ai-ink">
                                                <span className={cx("h-3.5 w-3.5 shrink-0 rounded-full border-2", selected ? "border-ai-ink bg-ai-ink shadow-[inset_0_0_0_2px_var(--ai-surface)]" : "border-ai-line")} aria-hidden />
                                                {tx(CODE_OUTPUT_COPY[option].label)}
                                            </span>
                                            <span className="mt-1 block text-[12px] leading-snug text-ai-muted">{tx(CODE_OUTPUT_COPY[option].hint)}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        </fieldset>
                        <div className="grid gap-4 sm:grid-cols-2">
                            <div>
                                <label className={LABEL} htmlFor="ai-comment-language">{tx(C.commentLanguage)}</label>
                                <select id="ai-comment-language" data-setting="commentLanguage" value={draft.commentLanguage} onChange={(event) => update("commentLanguage", event.target.value)} className={cx(FIELD, "mt-1.5")}>
                                    <option value="site">{tx(C.sameAsAnswer)}</option>
                                    {LANGUAGES.map((entry) => <option key={entry.code} value={entry.code}>{entry.name}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className={LABEL} htmlFor="ai-code-style">{tx(C.codeStyle)}</label>
                                <input id="ai-code-style" data-setting="codeStyle" value={draft.codeStyle} maxLength={AI_CODE_STYLE_MAX} placeholder={tx(C.codeStylePlaceholder)} onChange={(event) => update("codeStyle", event.target.value)} className={cx(FIELD, "mt-1.5")} />
                            </div>
                        </div>
                        <LanguagePicker value={draft.preferredLanguages} onChange={(next) => update("preferredLanguages", next)} />
                        <Toggle name="attachConsoleErrors" checked={draft.attachConsoleErrors} onChange={(value) => update("attachConsoleErrors", value)} label={tx(C.consoleErrors)} hint={tx(C.consoleErrorsHint)} />
                        <Toggle name="attachProjectTree" checked={draft.attachProjectTree} onChange={(value) => update("attachProjectTree", value)} label={tx(C.projectTree)} hint={tx(C.projectTreeHint)} />
                    </Section>

                    <Section id="chat" icon={<MessagesSquare className="h-5 w-5 text-brand-green" aria-hidden />} title={tx(C.chat)} hint={tx(C.chatHint)}>
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
                                <Link href="/ai/api#connections" className="mt-1.5 inline-block text-[12px] font-semibold text-brand-green hover:underline" data-settings-connections-link>{tx(C.manageConnections)}</Link>
                            </div>
                            <div>
                                <label className={LABEL} htmlFor="ai-agent">{tx(C.agentMode)}</label>
                                <select id="ai-agent" data-setting="agentMode" value={draft.agentMode} onChange={(event) => update("agentMode", event.target.value as AiSettings["agentMode"])} className={cx(FIELD, "mt-1.5")}>
                                    {AGENT_MODE_OPTIONS.map((option) => <option key={option.id} value={option.id}>{tx(option.label)}</option>)}
                                </select>
                            </div>
                        </div>
                        <div className="grid gap-4 sm:grid-cols-2">
                            <div>
                                <label className={LABEL} htmlFor="ai-send">{tx(C.sendShortcut)}</label>
                                <select id="ai-send" data-setting="sendShortcut" value={draft.sendShortcut} onChange={(event) => update("sendShortcut", event.target.value as AiSettings["sendShortcut"])} className={cx(FIELD, "mt-1.5")}>
                                    {AI_SEND_SHORTCUTS.map((option) => <option key={option} value={option}>{tx(SEND_COPY[option])}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className={LABEL} htmlFor="ai-font">{tx(C.answerFont)}</label>
                                <select id="ai-font" data-setting="answerFont" value={draft.answerFont} onChange={(event) => update("answerFont", event.target.value as AiSettings["answerFont"])} className={cx(FIELD, "mt-1.5", draft.answerFont === "serif" && "font-serif")}>
                                    {AI_ANSWER_FONTS.map((option) => <option key={option} value={option}>{tx(FONT_COPY[option])}</option>)}
                                </select>
                            </div>
                        </div>
                        <Toggle name="attachEditorFile" checked={draft.attachEditorFile} onChange={(value) => update("attachEditorFile", value)} label={tx(C.attachFile)} hint={tx(C.attachHint)} />
                        <Toggle name="autoOpenArtifacts" checked={draft.autoOpenArtifacts} onChange={(value) => update("autoOpenArtifacts", value)} label={tx(C.autoOpen)} hint={tx(C.autoOpenHint)} />
                    </Section>

                    <Section id="thinking" icon={<Brain className="h-5 w-5 text-brand-green" aria-hidden />} title={tx(C.thinkingSection)} hint={tx(C.thinkingSectionHint)}>
                        <div className="max-w-sm">
                            <label className={LABEL} htmlFor="ai-thinking">{tx(C.thinking)}</label>
                            <select id="ai-thinking" data-setting="thinking" value={draft.thinking} onChange={(event) => update("thinking", event.target.value as AiSettings["thinking"])} className={cx(FIELD, "mt-1.5")}>
                                {THINKING_SETTINGS.map((option) => <option key={option} value={option}>{tx(THINKING_COPY[option])}</option>)}
                            </select>
                        </div>
                        <Toggle name="showThinking" checked={draft.showThinking} onChange={(value) => update("showThinking", value)} label={tx(C.showThinking)} hint={tx(C.showThinkingHint)} />
                    </Section>

                    <Section id="voice" icon={<Mic className="h-5 w-5 text-brand-green" aria-hidden />} title={tx(C.voice)} hint={tx(C.voiceHint)}>
                        {!voice.speech && !voice.dictation ? <p className="rounded-xl bg-amber-500/10 px-3 py-2 text-[12.5px] text-amber-800 dark:text-amber-200" data-voice-early>{tx(C.voiceEarly)}</p> : null}
                        <div className="grid gap-4 sm:grid-cols-2">
                            <div>
                                <label className={LABEL} htmlFor="ai-dictation">{tx(C.dictationLanguage)}</label>
                                <select id="ai-dictation" data-setting="dictationLanguage" value={draft.dictationLanguage} onChange={(event) => update("dictationLanguage", event.target.value)} className={cx(FIELD, "mt-1.5")}>
                                    <option value="site">{tx(C.siteLanguageShort)}</option>
                                    {DICTATION_LANGUAGES.map((code) => <option key={code} value={code}>{`${displayLanguage(code, locale)} (${code})`}</option>)}
                                    {draft.dictationLanguage !== "site" && !DICTATION_LANGUAGES.includes(draft.dictationLanguage) ? <option value={draft.dictationLanguage}>{draft.dictationLanguage}</option> : null}
                                </select>
                            </div>
                            <div>
                                <label className={LABEL} htmlFor="ai-voice">{tx(C.answerVoice)}</label>
                                <select id="ai-voice" data-setting="answerVoice" value={draft.answerVoice} onChange={(event) => update("answerVoice", event.target.value)} className={cx(FIELD, "mt-1.5")}>
                                    <option value="">{tx(C.autoVoice)}</option>
                                    {voiceOptions.map((option) => <option key={`${option.name}-${option.lang}`} value={option.name}>{`${option.name} (${option.lang})`}</option>)}
                                    {draft.answerVoice && !voices.some((option) => option.name === draft.answerVoice) ? <option value={draft.answerVoice}>{draft.answerVoice}</option> : null}
                                </select>
                                {!voices.length ? <p className="mt-1 text-[12px] text-ai-muted">{tx(C.noVoices)}</p> : null}
                            </div>
                        </div>
                        <div className="flex flex-wrap items-end gap-4">
                            <div className="min-w-[14rem] flex-1">
                                <label className={LABEL} htmlFor="ai-rate">{tx(C.voiceRate, { rate: draft.answerVoiceRate.toLocaleString(locale, { minimumFractionDigits: 1, maximumFractionDigits: 2 }) })}</label>
                                <input id="ai-rate" type="range" data-setting="answerVoiceRate" min={AI_VOICE_RATE_MIN} max={AI_VOICE_RATE_MAX} step={0.1} value={draft.answerVoiceRate} onChange={(event) => update("answerVoiceRate", Math.round(Number(event.target.value) * 10) / 10)} className="mt-2 w-full accent-[var(--ai-ink)]" />
                            </div>
                            <button
                                type="button"
                                disabled={!voices.length}
                                onClick={() => (previewing ? speech.stop() : speech.speak("settings-preview", tx(C.previewText), language, "", { voiceName: draft.answerVoice || undefined, rate: draft.answerVoiceRate }))}
                                className={cx(BUTTON, "border border-ai-line text-ai-ink/85 hover:bg-ai-ink/[0.04]")}
                                data-voice-preview
                            >
                                {previewing ? <Square className="h-4 w-4" aria-hidden /> : <Play className="h-4 w-4" aria-hidden />}{tx(previewing ? C.stopListening : C.listen)}
                            </button>
                        </div>
                    </Section>

                    <Section id="history" icon={<History className="h-5 w-5 text-brand-green" aria-hidden />} title={tx(C.history)} hint={tx(C.historyHint)}>
                        <p className="text-[13px] text-ai-ink/75">{tx(C.chatCount, { count: conversations.length })}</p>
                        <div className="flex flex-wrap gap-2">
                            <button type="button" onClick={exportChats} disabled={!conversations.length} className={cx(BUTTON, "border border-ai-line text-ai-ink/85 hover:bg-ai-ink/[0.04]")}><Download className="h-4 w-4" aria-hidden />{tx(C.export)}</button>
                            <button type="button" onClick={deleteChats} disabled={!conversations.length} className={cx(BUTTON, "border border-rose-200 text-rose-600 hover:bg-rose-50 dark:border-rose-500/30 dark:text-rose-300 dark:hover:bg-rose-500/10")} data-delete-chats><Trash2 className="h-4 w-4" aria-hidden />{tx(C.deleteAll)}</button>
                        </div>
                        <Toggle name="clearOnSignOut" checked={clearOnSignOut} onChange={setClearChatsOnSignOut} label={tx(C.clearOnSignOut)} hint={tx(C.clearOnSignOutHint)} />
                        <div className="max-w-sm">
                            <label className={LABEL} htmlFor="ai-retention">{tx(C.retention)}</label>
                            <select id="ai-retention" data-setting="localRetentionDays" value={draft.localRetentionDays} onChange={(event) => update("localRetentionDays", Number(event.target.value) as AiSettings["localRetentionDays"])} className={cx(FIELD, "mt-1.5")}>
                                {AI_RETENTION_DAYS.map((days) => <option key={days} value={days}>{days ? tx(C.days, { days }) : tx(C.forever)}</option>)}
                            </select>
                            <p className="mt-1 text-[12px] text-ai-muted">{tx(C.retentionHint)}</p>
                        </div>
                    </Section>

                    <div className="sticky bottom-4 z-10 flex flex-wrap items-center justify-end gap-3 rounded-2xl border border-ai-line bg-ai-surface/95 px-4 py-3 shadow-lg backdrop-blur">
                        {message ? (
                            <p role={message.tone === "error" ? "alert" : "status"} className={cx("me-auto inline-flex items-center gap-1.5 text-[13px] font-semibold", message.tone === "error" ? "text-rose-600 dark:text-rose-300" : "text-emerald-600 dark:text-emerald-300")} data-settings-message>
                                {message.tone === "success" ? <Check className="h-4 w-4" aria-hidden /> : null}{message.text}
                            </p>
                        ) : dirty ? <p className="me-auto text-[13px] text-ai-muted">{tx(C.unsaved)}</p> : null}
                        {dirty ? <button type="button" onClick={() => server && setDraft(server.settings)} disabled={busy} className={cx(BUTTON, "text-ai-ink/75 hover:bg-ai-ink/[0.06]")}>{tx(C.discard)}</button> : null}
                        <button type="button" onClick={() => void save()} disabled={busy || !dirty} className={cx(BUTTON, "bg-ai-ink text-ai-paper hover:opacity-90")} data-settings-save>
                            {busy ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden /> : <Check className="h-4 w-4" aria-hidden />}{tx(C.save)}
                        </button>
                    </div>


                    <Section id="plan-usage" icon={<Gauge className="h-5 w-5 text-brand-green" aria-hidden />} title={tx(C.usage)}>
                        {usage === "failed" ? <p className="text-[13px] text-ai-muted">{tx(C.usageFailed)}</p> : usage ? (
                            <div className="flex flex-col gap-3">
                                <UsageList usage={usage} />
                                <Link href="/plans#usage" className="text-[13px] font-semibold text-brand-green hover:underline">{tx(C.managePlan)}</Link>
                            </div>
                        ) : <LoaderCircle className="h-4 w-4 animate-spin text-ai-muted" aria-hidden />}
                    </Section>

                    <Section id="early-access" icon={<FlaskConical className="h-5 w-5 text-brand-green" aria-hidden />} title={tx(C.early)} hint={tx(C.earlyHint)}>
                        {features && !features.rollout.length ? <p className="text-[13px] text-ai-muted" data-early-access-empty>{tx(C.noneEarly)}</p> : null}
                        <ul className="divide-y divide-ai-line" data-early-access>
                            {(features?.rollout ?? []).map((id) => {
                                const open = features?.open[id] ?? false;
                                return (
                                    <li key={id} className="flex items-start justify-between gap-3 py-2.5">
                                        <span>
                                            <span className="flex items-center gap-1.5 text-[14px] font-semibold text-ai-ink"><Sparkles className="h-3.5 w-3.5 text-brand-green" aria-hidden />{tx(FEATURES[id].title)}</span>
                                            <span className="mt-0.5 block text-[12.5px] text-ai-muted">{tx(FEATURES[id].description)}</span>
                                        </span>
                                        <span className={cx("shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold", open ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "bg-zinc-500/10 text-ai-muted")} data-feature-state={id}>{tx(open ? C.open : C.notYet)}</span>
                                    </li>
                                );
                            })}
                        </ul>
                        {server?.plan !== "pro" ? <p className="text-[12.5px] text-ai-muted">{tx(C.earlyPro)} <Link href="/plans" className="font-semibold text-brand-green hover:underline">{tx(C.seePlans)}</Link></p> : null}
                    </Section>
                </div>
            )}
        </div>
    );
}
