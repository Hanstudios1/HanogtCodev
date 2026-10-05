"use client";

import { Bell, Bot, Eye, Headphones, MessageSquareText, ShieldCheck, Sparkles } from "lucide-react";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { Modal, ModalHeader, Spinner, UserAvatar, cx } from "@/components/Groups/ui";
import { fetchOwnProfileResponse, saveOwnSettings } from "@/lib/account-profile-client";
import { useI18n, type Copy } from "@/lib/i18n";
import { GROUP_COMMANDS } from "@/lib/social/commands";
import { CHAT_BACKGROUND_CLASS, MESSAGE_FONT_CLASS, type ChatBackground, type MessageFontSize, type SocialPrefs, type VoiceQuality } from "@/lib/social/prefs";
import { AudioSettingsPanel } from "./AudioSettings";
import { BotAvatar, BotTag } from "./chat/bots";
import { useSocial } from "./context";
import SocialDisclaimer from "./Disclaimer";

export type SocialSettingsTab = "voice" | "messages" | "notifications" | "privacy" | "safety" | "bots";

const C = {
    title: { TR: "Hanogt Social ayarları", EN: "Hanogt Social settings" },
    description: { TR: "Değişiklikler hemen kaydedilir ve tüm cihazlarında geçerli olur.", EN: "Changes are saved right away and apply on all your devices." },
    sections: { TR: "Ayar bölümleri", EN: "Settings sections" },
    voice: { TR: "Ses ve Görüntü", EN: "Voice & Video" },
    messages: { TR: "Mesajlar", EN: "Messages" },
    notifications: { TR: "Bildirimler", EN: "Notifications" },
    privacy: { TR: "Gizlilik", EN: "Privacy" },
    safety: { TR: "Güvenlik", EN: "Safety" },
    bots: { TR: "Botlar", EN: "Bots" },
    saved: { TR: "Kaydedildi.", EN: "Saved." },
    saveFailed: { TR: "Ayar kaydedilemedi. Tekrar dene.", EN: "The setting couldn't be saved. Try again." },
    writing: { TR: "Yazma", EN: "Writing" },
    enterToSend: { TR: "Enter ile gönder", EN: "Send with Enter" },
    enterToSendHint: { TR: "Kapalıyken Enter yeni satır ekler; göndermek için Ctrl+Enter (Mac'te ⌘+Enter) kullanılır.", EN: "When off, Enter adds a new line and Ctrl+Enter (⌘+Enter on Mac) sends." },
    typing: { TR: "Yazıyor göstergesi", EN: "Typing indicator" },
    typingHint: { TR: "Kapalıyken yazdığın görünmez ve başkalarının yazdığını da görmezsin.", EN: "When off, nobody sees you typing and you don't see others typing." },
    receipts: { TR: "Okundu bilgisi", EN: "Read receipts" },
    receiptsHint: { TR: "Kapalıyken direkt mesajlarda karşı taraf mesajını gördüğünü bilmez; sen de onunkini göremezsin.", EN: "When off, the other person in a direct message doesn't see that you read their message, and you don't see it either." },
    look: { TR: "Görünüm", EN: "Appearance" },
    fontSize: { TR: "Mesaj yazı boyutu", EN: "Message text size" },
    small: { TR: "Küçük", EN: "Small" },
    medium: { TR: "Orta", EN: "Medium" },
    large: { TR: "Büyük", EN: "Large" },
    background: { TR: "Sohbet arka planı", EN: "Chat background" },
    bgDefault: { TR: "Varsayılan", EN: "Default" },
    bgDark: { TR: "Koyu", EN: "Dim" },
    bgGradient: { TR: "Renkli", EN: "Tinted" },
    bgPattern: { TR: "Desenli", EN: "Pattern" },
    gifAutoplay: { TR: "GIF'ler kendiliğinden oynasın", EN: "Play GIFs automatically" },
    gifAutoplayHint: { TR: "Kapalıyken GIF'ler üzerine gelince ya da dokununca oynar. Sistemin hareketi azalt ayarı da GIF'leri durdurur.", EN: "When off, GIFs play when you hover or tap them. Your system's reduce motion setting stops them too." },
    preview: { TR: "Önizleme", EN: "Preview" },
    previewName: { TR: "Hanogt", EN: "Hanogt" },
    previewText: { TR: "Merhaba! Bu bir **örnek** mesaj. `kod` da böyle görünür.", EN: "Hi! This is a **sample** message. `code` looks like this." },
    voiceMessages: { TR: "Sesli mesajlar", EN: "Voice messages" },
    voiceQuality: { TR: "Kayıt kalitesi", EN: "Recording quality" },
    qualityLow: { TR: "Düşük (dakikası ~120 kB)", EN: "Low (~120 kB a minute)" },
    qualityNormal: { TR: "Normal (dakikası ~240 kB)", EN: "Normal (~240 kB a minute)" },
    qualityHigh: { TR: "Yüksek (dakikası ~480 kB)", EN: "High (~480 kB a minute)" },
    bell: { TR: "Zil bildirimleri", EN: "Bell notifications" },
    dmNotify: { TR: "Direkt mesajlar", EN: "Direct messages" },
    dmNotifyHint: { TR: "Biri sana mesaj gönderdiğinde.", EN: "When someone sends you a message." },
    mentionNotify: { TR: "Gruplarda bahsedilme", EN: "Group mentions" },
    mentionNotifyHint: { TR: "Biri senden @ ile ya da @herkes ile bahsettiğinde.", EN: "When someone @mentions you or uses @everyone." },
    callNotify: { TR: "Cevapsız aramalar", EN: "Missed calls" },
    callNotifyHint: { TR: "Yanıtlayamadığın sesli aramalar.", EN: "Voice calls you couldn't answer." },
    groupLevels: { TR: "Her grubun bildirim düzeyini (tüm mesajlar, yalnızca bahsetmeler, hiçbiri) grubun menüsünden ayrıca seçebilirsin.", EN: "You can also pick each group's notification level (all messages, mentions only, nothing) from the group's menu." },
    presence: { TR: "Durum", EN: "Presence" },
    showOnline: { TR: "Çevrimiçi durumumu göster", EN: "Show when I'm online" },
    showOnlineHint: { TR: "Kapalıyken arkadaşların seni çevrimdışı görür.", EN: "When off, your friends see you as offline." },
    showLastSeen: { TR: "Son görülme zamanımı göster", EN: "Show when I was last seen" },
    contact: { TR: "Seninle kim iletişim kurabilir", EN: "Who can contact you" },
    whoCanAdd: { TR: "Bana arkadaşlık isteği gönderebilecekler", EN: "Who can send me friend requests" },
    everyone: { TR: "Herkes", EN: "Everyone" },
    friendsOfFriends: { TR: "Arkadaşlarımın arkadaşları", EN: "Friends of friends" },
    nobody: { TR: "Hiç kimse", EN: "Nobody" },
    hideFriends: { TR: "Arkadaş listemi gizle", EN: "Hide my friends list" },
    morePrivacy: { TR: "Diğer gizlilik ayarları Hesap Ayarları'nda", EN: "More privacy settings in Account Settings" },
    blocked: { TR: "Engellenen kişiler", EN: "Blocked people" },
    noBlocked: { TR: "Kimseyi engellemedin.", EN: "You haven't blocked anyone." },
    unblock: { TR: "Engeli kaldır", EN: "Unblock" },
    unblocked: { TR: "Engel kaldırıldı.", EN: "User unblocked." },
    securityBot: { TR: "Hanogt Security Bot", EN: "Hanogt Security Bot" },
    securityBotText: { TR: "Her grupta bulunur ve kaldırılamaz. Grubun AutoMod kurallarını uygular, moderatörlerin komutlarını çalıştırır ve kararlarını sohbette duyurur.", EN: "Part of every group and can't be removed. It applies the group's AutoMod rules, runs the moderators' commands and announces their decisions in the chat." },
    aiBot: { TR: "Hanogt AI", EN: "Hanogt AI" },
    aiBotText: { TR: "Bir grupta /ai yazarak ya da @Hanogt AI diyerek soru sorabilirsin. Yanıt, sohbetin son mesajlarını da dikkate alır ve senin Hanogt AI hakkından düşer; yanıt gelmezse hakkın iade edilir. Grup yöneticileri Hanogt AI'ı grup ayarlarından kapatabilir.", EN: "In a group, type /ai or mention @Hanogt AI to ask a question. The answer takes the chat's latest messages into account and counts against your Hanogt AI allowance; if no answer comes, your message is given back. Group admins can turn Hanogt AI off in the group settings." },
    usage: { TR: "Hanogt AI hakkını gör", EN: "See your Hanogt AI allowance" },
    commandsFor: { TR: "Komutlar", EN: "Commands" },
    everyoneCommands: { TR: "Herkes", EN: "Everyone" },
    moderatorCommands: { TR: "Moderatörler ve üstü", EN: "Moderators and up" },
    custom: { TR: "Grup yöneticileri, grup ayarları › Botlar bölümünden kendi komutlarını ve yeni üyelere gönderilecek karşılama mesajını ekleyebilir.", EN: "Group admins can add their own commands and a welcome message for new members in group settings › Bots." },
    loading: { TR: "Ayarlar yükleniyor", EN: "Loading settings" },
} satisfies Record<string, Copy>;

const TABS: Array<{ id: SocialSettingsTab; icon: ReactNode; label: Copy }> = [
    { id: "voice", icon: <Headphones className="h-4 w-4" aria-hidden />, label: C.voice },
    { id: "messages", icon: <MessageSquareText className="h-4 w-4" aria-hidden />, label: C.messages },
    { id: "notifications", icon: <Bell className="h-4 w-4" aria-hidden />, label: C.notifications },
    { id: "privacy", icon: <Eye className="h-4 w-4" aria-hidden />, label: C.privacy },
    { id: "safety", icon: <ShieldCheck className="h-4 w-4" aria-hidden />, label: C.safety },
    { id: "bots", icon: <Bot className="h-4 w-4" aria-hidden />, label: C.bots },
];

type PrivacyFields = { showOnlineStatus: boolean; showLastSeen: boolean; whoCanAdd: "everyone" | "friends_of_friends" | "nobody"; hideFriendList: boolean };

function Toggle({ label, hint, checked, onChange, disabled = false }: { label: string; hint?: string; checked: boolean; onChange: (value: boolean) => void; disabled?: boolean }) {
    return (
        <label className={cx("flex cursor-pointer items-start justify-between gap-4 py-3", disabled && "cursor-not-allowed opacity-60")}>
            <span className="min-w-0">
                <span className="block text-sm font-semibold text-zinc-900 dark:text-white">{label}</span>
                {hint && <span className="mt-0.5 block text-[12.5px] leading-5 text-zinc-500 dark:text-zinc-400">{hint}</span>}
            </span>
            <span className="relative mt-0.5 inline-flex shrink-0">
                <input type="checkbox" role="switch" className="peer sr-only" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} />
                <span className="h-6 w-11 rounded-full bg-zinc-300 transition peer-checked:bg-indigo-600 peer-focus-visible:ring-2 peer-focus-visible:ring-indigo-500 peer-focus-visible:ring-offset-2 dark:bg-zinc-700 dark:peer-focus-visible:ring-offset-zinc-900" aria-hidden />
                <span className="absolute start-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition peer-checked:translate-x-5 rtl:peer-checked:-translate-x-5" aria-hidden />
            </span>
        </label>
    );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
    return (
        <section className="mb-5">
            <h3 className="mb-1 text-[11px] font-black uppercase tracking-wider text-zinc-500 dark:text-zinc-400">{title}</h3>
            <div className="divide-y divide-zinc-100 dark:divide-white/[0.06]">{children}</div>
        </section>
    );
}

/** Hanogt Social's own settings (Discord's User Settings, the parts that belong to chatting). */
export default function SocialSettingsDialog({ open, initialTab, onClose }: { open: boolean; initialTab: SocialSettingsTab; onClose: () => void }) {
    const { tx } = useI18n();
    const social = useSocial();
    const email = social.me.email;
    const [tab, setTab] = useState<SocialSettingsTab>(initialTab);
    const [privacy, setPrivacy] = useState<PrivacyFields | null>(null);
    const [pending, setPending] = useState<Partial<SocialPrefs & PrivacyFields>>({});

    useEffect(() => {
        if (!open) return;
        let active = true;
        void fetchOwnProfileResponse(email).then((data) => {
            if (!active || !data) return;
            const fields = data.fields;
            setPrivacy({ showOnlineStatus: fields.showOnlineStatus, showLastSeen: fields.showLastSeen, whoCanAdd: fields.whoCanAdd, hideFriendList: fields.hideFriendList });
        });
        return () => { active = false; };
    }, [email, open]);

    const prefs: SocialPrefs = { ...social.prefs, ...(pending as Partial<SocialPrefs>) };

    const save = async <K extends keyof (SocialPrefs & PrivacyFields)>(key: K, value: (SocialPrefs & PrivacyFields)[K]) => {
        setPending((current) => ({ ...current, [key]: value }));
        const result = await saveOwnSettings(email, { [key]: value });
        setPending((current) => {
            const next = { ...current };
            delete next[key];
            return next;
        });
        if (!result.ok) {
            social.notify(tx(C.saveFailed), "error");
            return;
        }
        const fields = result.data.fields;
        setPrivacy({ showOnlineStatus: fields.showOnlineStatus, showLastSeen: fields.showLastSeen, whoCanAdd: fields.whoCanAdd, hideFriendList: fields.hideFriendList });
    };
    const privacyValue = <K extends keyof PrivacyFields>(key: K): PrivacyFields[K] | undefined => (pending[key] as PrivacyFields[K] | undefined) ?? privacy?.[key];

    const fonts: Array<{ value: MessageFontSize; label: Copy }> = [{ value: "small", label: C.small }, { value: "medium", label: C.medium }, { value: "large", label: C.large }];
    const backgrounds: Array<{ value: ChatBackground; label: Copy }> = [{ value: "default", label: C.bgDefault }, { value: "dark", label: C.bgDark }, { value: "gradient", label: C.bgGradient }, { value: "pattern", label: C.bgPattern }];
    const qualities: Array<{ value: VoiceQuality; label: Copy }> = [{ value: "low", label: C.qualityLow }, { value: "normal", label: C.qualityNormal }, { value: "high", label: C.qualityHigh }];

    let content: ReactNode;
    switch (tab) {
        case "voice":
            content = <AudioSettingsPanel />;
            break;
        case "messages":
            content = (
                <>
                    <Section title={tx(C.writing)}>
                        <Toggle label={tx(C.enterToSend)} hint={tx(C.enterToSendHint)} checked={prefs.enterToSend} onChange={(value) => void save("enterToSend", value)} />
                        <Toggle label={tx(C.typing)} hint={tx(C.typingHint)} checked={prefs.typingIndicator} onChange={(value) => void save("typingIndicator", value)} />
                        <Toggle label={tx(C.receipts)} hint={tx(C.receiptsHint)} checked={prefs.readReceipts} onChange={(value) => void save("readReceipts", value)} />
                    </Section>
                    <Section title={tx(C.look)}>
                        <div className="py-3">
                            <p className="text-sm font-semibold">{tx(C.fontSize)}</p>
                            <div className="mt-2 inline-flex rounded-xl border border-zinc-200 p-0.5 dark:border-white/10" role="radiogroup" aria-label={tx(C.fontSize)}>
                                {fonts.map((option) => (
                                    <button key={option.value} type="button" role="radio" aria-checked={prefs.msgFontSize === option.value} onClick={() => void save("msgFontSize", option.value)} className={cx("rounded-lg px-3 py-1.5 text-sm font-semibold transition", prefs.msgFontSize === option.value ? "bg-indigo-600 text-white" : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-white/10")}>{tx(option.label)}</button>
                                ))}
                            </div>
                        </div>
                        <div className="py-3">
                            <p className="text-sm font-semibold">{tx(C.background)}</p>
                            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4" role="radiogroup" aria-label={tx(C.background)}>
                                {backgrounds.map((option) => (
                                    <button key={option.value} type="button" role="radio" aria-checked={prefs.chatBackground === option.value} onClick={() => void save("chatBackground", option.value)} className={cx("flex h-16 items-end rounded-xl border-2 bg-white p-2 text-xs font-bold transition dark:bg-zinc-900", CHAT_BACKGROUND_CLASS[option.value], prefs.chatBackground === option.value ? "border-indigo-500" : "border-zinc-200 hover:border-zinc-300 dark:border-white/10")}>
                                        {tx(option.label)}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div className="py-3" aria-label={tx(C.preview)}>
                            <p className="text-[11px] font-black uppercase tracking-wider text-zinc-500 dark:text-zinc-400">{tx(C.preview)}</p>
                            <div className={cx("mt-2 flex gap-3 rounded-xl border border-zinc-200 bg-white p-3 dark:border-white/10 dark:bg-zinc-900", CHAT_BACKGROUND_CLASS[prefs.chatBackground])}>
                                <UserAvatar name={social.me.username} src={social.me.avatarUrl} size="sm" />
                                <div className="min-w-0">
                                    <p className="text-sm font-bold">{social.me.username || tx(C.previewName)}</p>
                                    <p className={cx("text-zinc-800 dark:text-zinc-100", MESSAGE_FONT_CLASS[prefs.msgFontSize])}>{tx(C.previewText).replace(/\*\*|`/g, "")}</p>
                                </div>
                            </div>
                        </div>
                        <Toggle label={tx(C.gifAutoplay)} hint={tx(C.gifAutoplayHint)} checked={prefs.gifAutoplay} onChange={(value) => void save("gifAutoplay", value)} />
                    </Section>
                    <Section title={tx(C.voiceMessages)}>
                        <label className="flex flex-wrap items-center justify-between gap-3 py-3">
                            <span className="text-sm font-semibold">{tx(C.voiceQuality)}</span>
                            <select value={prefs.voiceMsgQuality} onChange={(event) => void save("voiceMsgQuality", event.target.value as VoiceQuality)} className="h-9 rounded-lg border border-zinc-200 bg-white px-2 text-sm dark:border-white/10 dark:bg-zinc-950">
                                {qualities.map((option) => <option key={option.value} value={option.value}>{tx(option.label)}</option>)}
                            </select>
                        </label>
                    </Section>
                </>
            );
            break;
        case "notifications":
            content = (
                <>
                    <Section title={tx(C.bell)}>
                        <Toggle label={tx(C.dmNotify)} hint={tx(C.dmNotifyHint)} checked={prefs.msgNotifications} onChange={(value) => void save("msgNotifications", value)} />
                        <Toggle label={tx(C.mentionNotify)} hint={tx(C.mentionNotifyHint)} checked={prefs.mentionNotifications} onChange={(value) => void save("mentionNotifications", value)} />
                        <Toggle label={tx(C.callNotify)} hint={tx(C.callNotifyHint)} checked={prefs.callNotifications} onChange={(value) => void save("callNotifications", value)} />
                    </Section>
                    <p className="text-[12.5px] leading-5 text-zinc-500 dark:text-zinc-400">{tx(C.groupLevels)}</p>
                </>
            );
            break;
        case "privacy":
            content = !privacy ? (
                <div className="flex justify-center py-10" aria-label={tx(C.loading)}><Spinner className="h-6 w-6 text-indigo-500" /></div>
            ) : (
                <>
                    <Section title={tx(C.presence)}>
                        <Toggle label={tx(C.showOnline)} hint={tx(C.showOnlineHint)} checked={privacyValue("showOnlineStatus") ?? true} onChange={(value) => void save("showOnlineStatus", value)} />
                        <Toggle label={tx(C.showLastSeen)} checked={privacyValue("showLastSeen") ?? true} onChange={(value) => void save("showLastSeen", value)} />
                    </Section>
                    <Section title={tx(C.contact)}>
                        <label className="flex flex-wrap items-center justify-between gap-3 py-3">
                            <span className="text-sm font-semibold">{tx(C.whoCanAdd)}</span>
                            <select value={privacyValue("whoCanAdd") ?? "everyone"} onChange={(event) => void save("whoCanAdd", event.target.value as PrivacyFields["whoCanAdd"])} className="h-9 rounded-lg border border-zinc-200 bg-white px-2 text-sm dark:border-white/10 dark:bg-zinc-950">
                                <option value="everyone">{tx(C.everyone)}</option>
                                <option value="friends_of_friends">{tx(C.friendsOfFriends)}</option>
                                <option value="nobody">{tx(C.nobody)}</option>
                            </select>
                        </label>
                        <Toggle label={tx(C.hideFriends)} checked={privacyValue("hideFriendList") ?? false} onChange={(value) => void save("hideFriendList", value)} />
                    </Section>
                    <Link href="/account-settings" className="text-sm font-semibold text-indigo-600 hover:underline dark:text-indigo-300">{tx(C.morePrivacy)}</Link>
                </>
            );
            break;
        case "safety":
            content = (
                <>
                    <Section title={tx(C.blocked)}>
                        {social.friends.blocked.length ? social.friends.blocked.map((person) => (
                            <div key={person.email} className="flex items-center gap-3 py-2.5">
                                <UserAvatar name={person.username} src={person.avatarUrl} size="sm" />
                                <span className="min-w-0 flex-1 truncate text-sm font-semibold">{person.username}</span>
                                <button type="button" onClick={() => void social.friendAction({ action: "unblock", targetEmail: person.email }, C.unblocked)} className="rounded-lg border border-zinc-200 px-3 py-1 text-xs font-bold transition hover:bg-zinc-100 dark:border-white/10 dark:hover:bg-white/10">{tx(C.unblock)}</button>
                            </div>
                        )) : <p className="py-3 text-sm text-zinc-500 dark:text-zinc-400">{tx(C.noBlocked)}</p>}
                    </Section>
                    <SocialDisclaimer />
                </>
            );
            break;
        case "bots":
            content = (
                <>
                    <article className="mb-4 rounded-2xl border border-zinc-200 p-4 dark:border-white/10">
                        <div className="flex items-center gap-3">
                            <BotAvatar bot="security" size={40} />
                            <div className="min-w-0">
                                <p className="flex flex-wrap items-center gap-2 font-bold">{tx(C.securityBot)}<BotTag /></p>
                            </div>
                        </div>
                        <p className="mt-2 text-[13px] leading-6 text-zinc-600 dark:text-zinc-300">{tx(C.securityBotText)}</p>
                        <p className="mt-3 text-[11px] font-black uppercase tracking-wider text-zinc-500 dark:text-zinc-400">{tx(C.commandsFor)}</p>
                        {(["member", "moderator"] as const).map((rank) => (
                            <div key={rank} className="mt-1.5">
                                <p className="text-[12px] font-semibold text-zinc-500 dark:text-zinc-400">{tx(rank === "member" ? C.everyoneCommands : C.moderatorCommands)}</p>
                                <ul className="mt-1 flex flex-wrap gap-1.5">
                                    {GROUP_COMMANDS.filter((command) => command.bot === "security" && (rank === "member" ? command.minRank === "member" : command.minRank !== "member")).map((command) => (
                                        <li key={command.id}><code className="rounded-md bg-zinc-100 px-1.5 py-0.5 font-mono text-[12px] dark:bg-zinc-800" title={tx(command.description)}>{tx(command.usage)}</code></li>
                                    ))}
                                </ul>
                            </div>
                        ))}
                    </article>
                    <article className="mb-4 rounded-2xl border border-zinc-200 p-4 dark:border-white/10">
                        <div className="flex items-center gap-3">
                            <BotAvatar bot="ai" size={40} />
                            <p className="flex flex-wrap items-center gap-2 font-bold">{tx(C.aiBot)}<BotTag /></p>
                        </div>
                        <p className="mt-2 text-[13px] leading-6 text-zinc-600 dark:text-zinc-300">{tx(C.aiBotText)}</p>
                        <Link href="/plans#usage" className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-indigo-600 hover:underline dark:text-indigo-300"><Sparkles className="h-4 w-4" aria-hidden />{tx(C.usage)}</Link>
                    </article>
                    <p className="text-[12.5px] leading-5 text-zinc-500 dark:text-zinc-400">{tx(C.custom)}</p>
                </>
            );
            break;
    }

    return (
        <Modal open={open} onClose={onClose} labelledBy="social-settings-title" size="lg">
            <ModalHeader id="social-settings-title" title={tx(C.title)} description={tx(C.description)} onClose={onClose} />
            <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
                <nav className="flex shrink-0 gap-1 overflow-x-auto border-b border-zinc-200 p-2 dark:border-white/10 sm:w-52 sm:flex-col sm:overflow-visible sm:border-b-0 sm:border-e" aria-label={tx(C.sections)}>
                    {TABS.map((entry) => (
                        <button key={entry.id} type="button" onClick={() => setTab(entry.id)} aria-current={tab === entry.id ? "page" : undefined} className={cx("inline-flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition", tab === entry.id ? "bg-indigo-600 text-white" : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-white/10")}>
                            {entry.icon}{tx(entry.label)}
                        </button>
                    ))}
                </nav>
                <div className="min-h-0 flex-1 overflow-y-auto p-5 sm:max-h-[70dvh]">{content}</div>
            </div>
        </Modal>
    );
}
