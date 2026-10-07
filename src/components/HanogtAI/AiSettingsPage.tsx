"use client";

import { ArrowLeft, Bell, Brain, Check, Code2, Download, EyeOff, FlaskConical, Gauge, History, Languages, LoaderCircle, MessagesSquare, Mic, Play, RotateCcw, Search, Settings2, Smartphone, Sparkles, Square, Trash2, Upload, UserRound, X, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import UsageList from "@/components/Plans/UsageList";
import { useRawSession } from "@/components/Provider";
import { AI_ANSWER_FONTS, AI_CODE_OUTPUTS, AI_CODE_STYLE_MAX, AI_CREATIVITY, AI_EXPERTISE, AI_LENGTHS, AI_PREFERRED_LANGUAGES_MAX, AI_RETENTION_DAYS, AI_SEND_SHORTCUTS, AI_TONES, AI_VOICE_RATE_MAX, AI_VOICE_RATE_MIN, DEFAULT_AI_SETTINGS, normalizeAiSettings, type AiSettings } from "@/lib/ai/ai-settings";
import { clearAgentModeChoice } from "@/lib/ai/agent-settings";
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
import { clearConnectionChoice, useAiConnections } from "./connections-store";
import { notificationPermission, requestAnswerNotifications, type NotifyPermission } from "./notify";
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
    sections: { TR: "Bölümler", EN: "Sections" },
    search: { TR: "Ayarlarda ara…", EN: "Search settings…" },
    noMatch: { TR: "“{query}” ile eşleşen bir ayar yok.", EN: "No setting matches “{query}”." },
    clearSearch: { TR: "Aramayı temizle", EN: "Clear search" },
    resetSection: { TR: "Varsayılana döndür", EN: "Reset to defaults" },
    resetDone: { TR: "Bölüm varsayılanlara döndü; kaydetmeyi unutma.", EN: "The section is back to its defaults; remember to save." },
    summaryTitle: { TR: "Hanogt AI seni böyle yanıtlayacak", EN: "This is how Hanogt AI will answer you" },
    summaryInstructions: { TR: "Kişisel talimat: {count} karakter", EN: "Personal instructions: {count} characters" },
    summaryNoInstructions: { TR: "Kişisel talimat yok", EN: "No personal instructions" },
    historyOn: { TR: "Sohbetler bu tarayıcıda saklanır", EN: "Chats are kept in this browser" },
    historyOff: { TR: "Gizli sohbetler: hiçbir yerde saklanmaz", EN: "Private chats: never stored" },
    exportSettings: { TR: "Ayarları dışa aktar", EN: "Export settings" },
    importSettings: { TR: "Ayarları içe aktar", EN: "Import settings" },
    imported: { TR: "Ayarlar içe aktarıldı; kaydetmeyi unutma.", EN: "Settings imported; remember to save." },
    importFailed: { TR: "Bu dosya okunamadı. Hanogt AI ayarları dosyası (JSON) seç.", EN: "This file couldn't be read. Pick a Hanogt AI settings file (JSON)." },
    creativity: { TR: "Yaratıcılık", EN: "Creativity" },
    creativityHint: { TR: "Hassas yanıtlar en olası sözcüklere bağlı kalır; yaratıcı yanıtlar daha özgürdür. Ajan modu açıkken etkisi daha küçüktür ki önerilen işlemler doğru kalsın; düşünürken modelin önerdiği değer kullanılır.", EN: "Precise answers stick to the likeliest words; creative ones are freer. With agent mode on the effect is smaller so proposed actions stay exact; while thinking the model's recommended value is used." },
    saveHistory: { TR: "Yeni sohbetleri bu tarayıcıda sakla", EN: "Keep new chats in this browser" },
    saveHistoryHint: { TR: "Kapalıyken yeni sohbetler gizli olur: sekme kapanınca kaybolur ve hiçbir yerde saklanmaz. Kenar çubuğunda göz simgesiyle görünür.", EN: "When off, new chats are private: they're gone when the tab closes and are never stored. They show an eye icon in the sidebar." },
    notifyOnDone: { TR: "Yanıt hazır olunca bildirim gönder", EN: "Notify me when an answer is ready" },
    notifyOnDoneHint: { TR: "Sekme arka plandayken yanıt biterse tarayıcı bildirimi gösterilir.", EN: "If an answer finishes while the tab is in the background, a browser notification appears." },
    notifyDenied: { TR: "Tarayıcı bildirim izni vermedi; izni tarayıcının site ayarlarından açabilirsin.", EN: "The browser didn't allow notifications; you can allow them in the browser's site settings." },
    notifyUnsupported: { TR: "Bu tarayıcı bildirimleri desteklemiyor.", EN: "This browser doesn't support notifications." },
    deviceChoices: { TR: "Bu cihazdaki seçimleri sıfırla", EN: "Reset this device's choices" },
    deviceChoicesHint: { TR: "Bu cihazda seçtiğin model ve ajan modu buradaki varsayılanların önüne geçer. Sıfırlarsan bu cihazda da hesap varsayılanların geçerli olur.", EN: "The model and agent mode picked on this device win over these defaults. Reset them and your account defaults apply on this device too." },
    deviceChoicesDone: { TR: "Bu cihaz artık hesap varsayılanlarını kullanıyor.", EN: "This device now uses your account defaults." },
    personalNote: { TR: "Kişiselleştirme sohbetlerine uygulanır; grup botu ve geliştirici API'si bunları kullanmaz.", EN: "Personalization applies to your chats; the group bot and the developer API don't use it." },
} satisfies Record<string, Copy>;

const CREATIVITY_COPY: Record<AiSettings["creativity"], Copy> = {
    precise: { TR: "Hassas", EN: "Precise" },
    balanced: { TR: "Dengeli", EN: "Balanced" },
    creative: { TR: "Yaratıcı", EN: "Creative" },
};

/** The settings each section's "Reset to defaults" puts back. */
const SECTION_KEYS: Record<string, Array<keyof AiSettings>> = {
    personal: ["about", "style", "expertise", "tone", "length", "language", "creativity"],
    code: ["codeOutput", "commentLanguage", "codeStyle", "preferredLanguages", "attachConsoleErrors", "attachProjectTree"],
    chat: ["defaultMode", "defaultModel", "agentMode", "sendShortcut", "answerFont", "attachEditorFile", "autoOpenArtifacts", "notifyOnDone"],
    thinking: ["thinking", "showThinking"],
    voice: ["dictationLanguage", "answerVoice", "answerVoiceRate"],
    history: ["saveHistory", "localRetentionDays"],
};

const NAV: Array<{ id: string; icon: LucideIcon; title: Copy }> = [
    { id: "personal", icon: UserRound, title: C.personal },
    { id: "code", icon: Code2, title: C.code },
    { id: "chat", icon: MessagesSquare, title: C.chat },
    { id: "thinking", icon: Brain, title: C.thinkingSection },
    { id: "voice", icon: Mic, title: C.voice },
    { id: "history", icon: History, title: C.history },
    { id: "plan-usage", icon: Gauge, title: C.usage },
    { id: "early-access", icon: FlaskConical, title: C.early },
];

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

function Section({ id, icon, title, hint, hidden = false, resetLabel, onReset, children }: { id: string; icon: ReactNode; title: string; hint?: string; hidden?: boolean; resetLabel?: string; onReset?: () => void; children: ReactNode }) {
    return (
        <section id={id} hidden={hidden} data-settings-section={id} className="scroll-mt-28 rounded-3xl border border-ai-line bg-ai-surface p-5 shadow-sm sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-2">
                <h2 className="flex items-center gap-2 text-[16px] font-black tracking-tight text-ai-ink">{icon}{title}</h2>
                {onReset && resetLabel ? (
                    <button type="button" onClick={onReset} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[12px] font-semibold text-ai-muted transition hover:bg-ai-ink/[0.06] hover:text-ai-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ai-ink/30" data-section-reset={id}>
                        <RotateCcw className="h-3.5 w-3.5" aria-hidden />{resetLabel}
                    </button>
                ) : null}
            </div>
            {hint ? <p className="mt-1 text-[13px] leading-relaxed text-ai-muted">{hint}</p> : null}
            <div className="mt-4 space-y-4">{children}</div>
        </section>
    );
}

/** One chip of the summary at the top of the page: what the setting is, then its value. */
function SummaryChip({ icon: Icon, label, children }: { icon: LucideIcon; label?: string; children: ReactNode }) {
    return (
        <span className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-ai-line bg-ai-paper px-2.5 py-1 text-[12px] font-semibold text-ai-ink/85">
            <Icon className="h-3.5 w-3.5 shrink-0 text-brand-green" aria-hidden />
            {label ? <span className="font-medium text-ai-muted">{label}:</span> : null}
            <span className="min-w-0 truncate">{children}</span>
        </span>
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

/** Keeps the browser's notification permission readable without an effect (it changes only through our own request). */
const subscribeNever = () => () => undefined;

/** Saves `text` as a file through a temporary link. */
function downloadJson(text: string, name: string) {
    const blob = new Blob([text], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

/** The words each section is found by in the search box (in the site's language and in English). */
const SECTION_SEARCH: Record<string, Copy[]> = {
    personal: [C.personal, C.about, C.style, C.expertise, C.tone, C.length, C.language, C.creativity],
    code: [C.code, C.codeOutput, C.commentLanguage, C.codeStyle, C.preferredLanguages, C.consoleErrors, C.projectTree],
    chat: [C.chat, C.defaultMode, C.defaultModel, C.agentMode, C.sendShortcut, C.answerFont, C.attachFile, C.autoOpen, C.notifyOnDone, C.deviceChoices],
    thinking: [C.thinkingSection, C.thinking, C.showThinking],
    voice: [C.voice, C.dictationLanguage, C.answerVoice, C.voiceRate],
    history: [C.history, C.saveHistory, C.retention, C.export, C.deleteAll, C.clearOnSignOut],
    "plan-usage": [C.usage, C.managePlan],
    "early-access": [C.early],
};

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
    const [query, setQuery] = useState("");
    const [active, setActive] = useState(NAV[0].id);
    const browserPermission = useSyncExternalStore(subscribeNever, notificationPermission, () => null);
    const [askedPermission, setAskedPermission] = useState<NotifyPermission | null>(null);
    const permission = askedPermission ?? browserPermission;
    const fileInput = useRef<HTMLInputElement>(null);

    // The draft follows what the server has until it is edited (adjusted while rendering).
    const server = settings.data;
    const serverKey = server ? `${server.updatedAt ?? "new"}:${server.plan}:${JSON.stringify(server.settings)}` : null;
    if (server && serverKey !== loadedFrom) {
        setLoadedFrom(serverKey);
        setDraft(server.settings);
    }
    const dirty = Boolean(server && draft && JSON.stringify(draft) !== JSON.stringify(server.settings));
    const ready = Boolean(draft);

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

    // The section being read lights up in the side menu.
    useEffect(() => {
        if (!ready || typeof IntersectionObserver === "undefined") return;
        const nodes = Array.from(document.querySelectorAll<HTMLElement>("[data-settings-section]"));
        const observer = new IntersectionObserver((entries) => {
            const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
            const id = visible[0]?.target.getAttribute("data-settings-section");
            if (id) setActive(id);
        }, { rootMargin: "-120px 0px -55% 0px" });
        nodes.forEach((node) => observer.observe(node));
        return () => observer.disconnect();
    }, [ready, query]);

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

    const today = () => new Date().toISOString().slice(0, 10);
    const exportChats = () => downloadJson(exportConversationsJson(), `hanogt-ai-chats-${today()}.json`);
    const exportSettings = () => {
        if (draft) downloadJson(JSON.stringify({ app: "hanogt-ai-settings", version: 1, exportedAt: new Date().toISOString(), settings: draft }, null, 2), `hanogt-ai-settings-${today()}.json`);
    };
    const importSettings = async (file: File | undefined) => {
        if (!file || !draft || !server) return;
        try {
            if (file.size > 64_000) throw new Error("too_big");
            const parsed: unknown = JSON.parse(await file.text());
            const record = parsed && typeof parsed === "object" && "settings" in parsed ? (parsed as { settings: unknown }).settings : parsed;
            if (!record || typeof record !== "object" || Array.isArray(record)) throw new Error("shape");
            // Unknown or broken fields keep what the draft had; instructions are cut to this plan's length.
            setDraft(normalizeAiSettings({ ...draft, ...record }, server.plan));
            setMessage({ tone: "success", text: tx(C.imported) });
        } catch {
            setMessage({ tone: "error", text: tx(C.importFailed) });
        }
    };

    const resetSection = (id: string) => {
        const keys = SECTION_KEYS[id];
        if (!keys) return;
        setDraft((current) => {
            if (!current) return current;
            const next = { ...current };
            const restore = <K extends keyof AiSettings>(key: K) => {
                const value = DEFAULT_AI_SETTINGS[key];
                next[key] = (Array.isArray(value) ? [...value] : value) as AiSettings[K];
            };
            keys.forEach(restore);
            return next;
        });
        setMessage({ tone: "success", text: tx(C.resetDone) });
    };

    const deleteChats = () => {
        if (!window.confirm(tx(C.deleteConfirm))) return;
        clearAllConversations();
        setMessage({ tone: "success", text: tx(C.deleted) });
    };

    const setNotifyOnDone = async (value: boolean) => {
        if (!value) {
            update("notifyOnDone", false);
            return;
        }
        const result = await requestAnswerNotifications();
        setAskedPermission(result);
        if (result === "unsupported") {
            setMessage({ tone: "error", text: tx(C.notifyUnsupported) });
            return;
        }
        // On by account even when this browser said no: another device may allow it.
        update("notifyOnDone", true);
        if (result === "denied") setMessage({ tone: "error", text: tx(C.notifyDenied) });
    };

    const resetDeviceChoices = () => {
        clearAgentModeChoice();
        clearConnectionChoice(email);
        setMessage({ tone: "success", text: tx(C.deviceChoicesDone) });
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

    // Search: a section shows when its title or one of its settings matches, in the site's language or in English.
    const needle = query.trim().toLocaleLowerCase(locale);
    const shown = useMemo(() => {
        const result: Record<string, boolean> = {};
        for (const { id } of NAV) {
            result[id] = !needle || (SECTION_SEARCH[id] ?? []).some((copy) => `${tx(copy)} ${copy.EN}`.toLocaleLowerCase(locale).includes(needle));
        }
        return result;
    }, [needle, locale, tx]);
    const anyShown = NAV.some(({ id }) => shown[id]);
    const navItems = NAV.filter(({ id }) => shown[id]);
    const answerLanguageName = draft ? (draft.language === "site" ? siteLanguageName : LANGUAGES.find((entry) => entry.code === draft.language)?.name ?? draft.language) : "";
    const instructionChars = draft ? draft.about.length + draft.style.length : 0;
    const sectionIcon = (Icon: LucideIcon) => <Icon className="h-5 w-5 text-brand-green" aria-hidden />;

    return (
        <div className="mx-auto max-w-6xl px-4 pb-24 pt-8 sm:px-6">
            <Link href="/ai" className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-ai-muted hover:text-ai-ink"><ArrowLeft className="h-4 w-4 rtl:rotate-180" aria-hidden />{tx(C.back)}</Link>
            <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
                <div className="min-w-0 max-w-2xl">
                    <h1 className="flex items-center gap-2 text-3xl font-black tracking-tight text-ai-ink"><Settings2 className="h-7 w-7 text-brand-green" aria-hidden />{tx(C.title)}</h1>
                    <p className="mt-2 text-[14px] leading-relaxed text-ai-muted">{tx(C.subtitle)}</p>
                </div>
                {draft ? (
                    <div className="flex flex-wrap gap-2">
                        <button type="button" onClick={exportSettings} className={cx(BUTTON, "border border-ai-line bg-ai-surface text-ai-ink/85 hover:bg-ai-ink/[0.04]")} data-settings-export><Download className="h-4 w-4" aria-hidden />{tx(C.exportSettings)}</button>
                        <button type="button" onClick={() => fileInput.current?.click()} className={cx(BUTTON, "border border-ai-line bg-ai-surface text-ai-ink/85 hover:bg-ai-ink/[0.04]")} data-settings-import><Upload className="h-4 w-4" aria-hidden />{tx(C.importSettings)}</button>
                        <input
                            ref={fileInput}
                            type="file"
                            accept="application/json,.json"
                            className="hidden"
                            data-settings-import-file
                            onChange={(event) => {
                                void importSettings(event.target.files?.[0]);
                                event.target.value = "";
                            }}
                        />
                    </div>
                ) : null}
            </div>

            {status === "unauthenticated" ? (
                <div className="mt-8 max-w-3xl rounded-3xl border border-ai-line bg-ai-surface p-6 text-center">
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
                <div className="mt-8 lg:grid lg:grid-cols-[14rem_minmax(0,1fr)] lg:gap-8">
                    <aside className="sticky top-16 z-20 -mx-4 border-b border-ai-line bg-ai-paper/95 px-4 py-2 backdrop-blur sm:-mx-6 sm:px-6 lg:top-24 lg:mx-0 lg:self-start lg:border-0 lg:bg-transparent lg:p-0 lg:backdrop-blur-none" data-settings-nav>
                        <label className="relative block">
                            <span className="sr-only">{tx(C.search)}</span>
                            <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ai-muted" aria-hidden />
                            <input
                                type="search"
                                value={query}
                                onChange={(event) => setQuery(event.target.value)}
                                placeholder={tx(C.search)}
                                className={cx(FIELD, "py-1.5 ps-9")}
                                data-settings-search
                            />
                        </label>
                        <p className="mt-4 hidden px-2 text-[11px] font-bold uppercase tracking-wider text-ai-muted lg:block">{tx(C.sections)}</p>
                        <nav aria-label={tx(C.sections)} className="mt-2 flex gap-1 overflow-x-auto pb-1 lg:mt-1 lg:flex-col lg:overflow-visible lg:pb-0">
                            {navItems.map(({ id, icon: Icon, title }) => {
                                const current = active === id;
                                return (
                                    <a
                                        key={id}
                                        href={`#${id}`}
                                        onClick={() => setActive(id)}
                                        aria-current={current ? "true" : undefined}
                                        data-settings-nav-item={id}
                                        className={cx(
                                            "inline-flex shrink-0 items-center gap-2 rounded-xl px-3 py-1.5 text-[13px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ai-ink/30 lg:py-2",
                                            current ? "bg-ai-ink/[0.07] text-ai-ink" : "text-ai-muted hover:bg-ai-ink/[0.04] hover:text-ai-ink",
                                        )}
                                    >
                                        <Icon className={cx("h-4 w-4 shrink-0", current ? "text-brand-green" : "")} aria-hidden />
                                        <span className="whitespace-nowrap">{tx(title)}</span>
                                    </a>
                                );
                            })}
                        </nav>
                    </aside>

                    <div className="mt-6 min-w-0 space-y-6 lg:mt-0" data-ai-settings-form>
                        {!needle ? (
                            <section className="rounded-3xl border border-ai-line bg-ai-surface p-5 shadow-sm sm:p-6" data-settings-summary>
                                <h2 className="text-[15px] font-black tracking-tight text-ai-ink">{tx(C.summaryTitle)}</h2>
                                <div className="mt-3 flex flex-wrap gap-2">
                                    <SummaryChip icon={MessagesSquare} label={tx(C.tone)}>{tx(TONE_COPY[draft.tone])}</SummaryChip>
                                    <SummaryChip icon={Gauge} label={tx(C.length)}>{tx(LENGTH_COPY[draft.length])}</SummaryChip>
                                    <SummaryChip icon={Sparkles} label={tx(C.creativity)}>{tx(CREATIVITY_COPY[draft.creativity])}</SummaryChip>
                                    <SummaryChip icon={UserRound} label={tx(C.expertise)}>{tx(EXPERTISE_COPY[draft.expertise])}</SummaryChip>
                                    <SummaryChip icon={Languages} label={tx(C.language)}>{answerLanguageName}</SummaryChip>
                                    <SummaryChip icon={Brain} label={tx(C.thinkingSection)}>{tx(THINKING_COPY[draft.thinking])}</SummaryChip>
                                    <SummaryChip icon={draft.saveHistory ? History : EyeOff}>{tx(draft.saveHistory ? C.historyOn : C.historyOff)}</SummaryChip>
                                    {draft.notifyOnDone ? <SummaryChip icon={Bell}>{tx(C.notifyOnDone)}</SummaryChip> : null}
                                </div>
                                <p className="mt-3 text-[12.5px] text-ai-muted" data-summary-instructions>{instructionChars ? tx(C.summaryInstructions, { count: instructionChars }) : tx(C.summaryNoInstructions)}</p>
                            </section>
                        ) : null}

                        {!anyShown ? (
                            <div className="rounded-3xl border border-dashed border-ai-line p-6 text-center" data-settings-no-match>
                                <p className="text-[14px] text-ai-muted">{tx(C.noMatch, { query: query.trim() })}</p>
                                <button type="button" onClick={() => setQuery("")} className="mt-3 text-[13px] font-semibold text-brand-green hover:underline">{tx(C.clearSearch)}</button>
                            </div>
                        ) : null}

                        <Section id="personal" hidden={!shown.personal} icon={sectionIcon(UserRound)} title={tx(C.personal)} hint={tx(C.personalHint)} resetLabel={tx(C.resetSection)} onReset={() => resetSection("personal")}>
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
                            <fieldset>
                                <legend className={LABEL}>{tx(C.creativity)}</legend>
                                <div className="mt-1.5 inline-flex flex-wrap rounded-xl border border-ai-line bg-ai-paper p-1" role="radiogroup" aria-label={tx(C.creativity)}>
                                    {AI_CREATIVITY.map((option) => {
                                        const selected = draft.creativity === option;
                                        return (
                                            <button key={option} type="button" role="radio" aria-checked={selected} onClick={() => update("creativity", option)} data-setting={`creativity-${option}`}
                                                className={cx("rounded-lg px-3.5 py-1.5 text-[13px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ai-ink/30", selected ? "bg-ai-surface text-ai-ink shadow-sm" : "text-ai-muted hover:text-ai-ink")}>
                                                {tx(CREATIVITY_COPY[option])}
                                            </button>
                                        );
                                    })}
                                </div>
                                <p className="mt-1.5 text-[12px] leading-snug text-ai-muted">{tx(C.creativityHint)}</p>
                            </fieldset>
                            <p className="rounded-xl bg-ai-ink/[0.04] px-3 py-2 text-[12px] text-ai-muted">{tx(C.personalNote)}</p>
                        </Section>

                        <Section id="code" hidden={!shown.code} icon={sectionIcon(Code2)} title={tx(C.code)} hint={tx(C.codeHint)} resetLabel={tx(C.resetSection)} onReset={() => resetSection("code")}>
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

                        <Section id="chat" hidden={!shown.chat} icon={sectionIcon(MessagesSquare)} title={tx(C.chat)} hint={tx(C.chatHint)} resetLabel={tx(C.resetSection)} onReset={() => resetSection("chat")}>
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
                            <div>
                                <Toggle name="notifyOnDone" checked={draft.notifyOnDone} onChange={(value) => void setNotifyOnDone(value)} label={tx(C.notifyOnDone)} hint={tx(C.notifyOnDoneHint)} />
                                {draft.notifyOnDone && (permission === "denied" || permission === "unsupported") ? (
                                    <p className="mt-1.5 rounded-xl bg-amber-500/10 px-3 py-2 text-[12px] text-amber-800 dark:text-amber-200" data-notify-warning>{tx(permission === "denied" ? C.notifyDenied : C.notifyUnsupported)}</p>
                                ) : null}
                            </div>
                            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-ai-line p-3">
                                <span className="min-w-0 flex-1">
                                    <span className={cx(LABEL, "flex items-center gap-1.5")}><Smartphone className="h-4 w-4 text-ai-muted" aria-hidden />{tx(C.deviceChoices)}</span>
                                    <span className="mt-0.5 block text-[12px] text-ai-muted">{tx(C.deviceChoicesHint)}</span>
                                </span>
                                <button type="button" onClick={resetDeviceChoices} className={cx(BUTTON, "border border-ai-line text-ai-ink/85 hover:bg-ai-ink/[0.04]")} data-reset-device-choices><RotateCcw className="h-4 w-4" aria-hidden />{tx(C.resetSection)}</button>
                            </div>
                        </Section>

                        <Section id="thinking" hidden={!shown.thinking} icon={sectionIcon(Brain)} title={tx(C.thinkingSection)} hint={tx(C.thinkingSectionHint)} resetLabel={tx(C.resetSection)} onReset={() => resetSection("thinking")}>
                            <div className="max-w-sm">
                                <label className={LABEL} htmlFor="ai-thinking">{tx(C.thinking)}</label>
                                <select id="ai-thinking" data-setting="thinking" value={draft.thinking} onChange={(event) => update("thinking", event.target.value as AiSettings["thinking"])} className={cx(FIELD, "mt-1.5")}>
                                    {THINKING_SETTINGS.map((option) => <option key={option} value={option}>{tx(THINKING_COPY[option])}</option>)}
                                </select>
                            </div>
                            <Toggle name="showThinking" checked={draft.showThinking} onChange={(value) => update("showThinking", value)} label={tx(C.showThinking)} hint={tx(C.showThinkingHint)} />
                        </Section>

                        <Section id="voice" hidden={!shown.voice} icon={sectionIcon(Mic)} title={tx(C.voice)} hint={tx(C.voiceHint)} resetLabel={tx(C.resetSection)} onReset={() => resetSection("voice")}>
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

                        <Section id="history" hidden={!shown.history} icon={sectionIcon(History)} title={tx(C.history)} hint={tx(C.historyHint)} resetLabel={tx(C.resetSection)} onReset={() => resetSection("history")}>
                            <Toggle name="saveHistory" checked={draft.saveHistory} onChange={(value) => update("saveHistory", value)} label={tx(C.saveHistory)} hint={tx(C.saveHistoryHint)} />
                            <div className="max-w-sm">
                                <label className={LABEL} htmlFor="ai-retention">{tx(C.retention)}</label>
                                <select id="ai-retention" data-setting="localRetentionDays" value={draft.localRetentionDays} disabled={!draft.saveHistory} onChange={(event) => update("localRetentionDays", Number(event.target.value) as AiSettings["localRetentionDays"])} className={cx(FIELD, "mt-1.5 disabled:opacity-60")}>
                                    {AI_RETENTION_DAYS.map((days) => <option key={days} value={days}>{days ? tx(C.days, { days }) : tx(C.forever)}</option>)}
                                </select>
                                <p className="mt-1 text-[12px] text-ai-muted">{tx(C.retentionHint)}</p>
                            </div>
                            <div className="rounded-2xl border border-ai-line p-3">
                                <p className="text-[13px] text-ai-ink/75">{tx(C.chatCount, { count: conversations.length })}</p>
                                <div className="mt-2 flex flex-wrap gap-2">
                                    <button type="button" onClick={exportChats} disabled={!conversations.length} className={cx(BUTTON, "border border-ai-line text-ai-ink/85 hover:bg-ai-ink/[0.04]")}><Download className="h-4 w-4" aria-hidden />{tx(C.export)}</button>
                                    <button type="button" onClick={deleteChats} disabled={!conversations.length} className={cx(BUTTON, "border border-rose-200 text-rose-600 hover:bg-rose-50 dark:border-rose-500/30 dark:text-rose-300 dark:hover:bg-rose-500/10")} data-delete-chats><Trash2 className="h-4 w-4" aria-hidden />{tx(C.deleteAll)}</button>
                                </div>
                            </div>
                            <Toggle name="clearOnSignOut" checked={clearOnSignOut} onChange={setClearChatsOnSignOut} label={tx(C.clearOnSignOut)} hint={tx(C.clearOnSignOutHint)} />
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

                        <Section id="plan-usage" hidden={!shown["plan-usage"]} icon={sectionIcon(Gauge)} title={tx(C.usage)}>
                            {usage === "failed" ? <p className="text-[13px] text-ai-muted">{tx(C.usageFailed)}</p> : usage ? (
                                <div className="flex flex-col gap-3">
                                    <UsageList usage={usage} />
                                    <Link href="/plans#usage" className="text-[13px] font-semibold text-brand-green hover:underline">{tx(C.managePlan)}</Link>
                                </div>
                            ) : <LoaderCircle className="h-4 w-4 animate-spin text-ai-muted" aria-hidden />}
                        </Section>

                        <Section id="early-access" hidden={!shown["early-access"]} icon={sectionIcon(FlaskConical)} title={tx(C.early)} hint={tx(C.earlyHint)}>
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
                </div>
            )}
        </div>
    );
}
