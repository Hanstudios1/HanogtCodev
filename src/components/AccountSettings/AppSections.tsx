"use client";

import { Check, ChevronRight, Info, Laptop, Moon, RotateCcw, Sun, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { LANGUAGES, useI18n, type Copy } from "@/lib/i18n";
import { useTheme, type ThemePreference } from "@/lib/theme";
import { C } from "./copy";
import ProfileFallback from "./ProfileFallback";
import { CardBody, FOCUS, SelectRow, SettingRow, SettingsCard, ToggleRow, buttonClass } from "./ui";
import type { AccountSettingsModel } from "./useAccountSettings";

/** "Bildirimler": the bell notifications (save bar). */
export function NotificationsSection({ model }: { model: AccountSettingsModel }) {
    const { t, tx } = useI18n();
    const { form } = model;
    if (!form) return <ProfileFallback model={model} rows={1} />;
    return (
        <SettingsCard title={tx(C.inApp)} description={tx(C.inAppHint)}>
            <ToggleRow id="field-msgNotifications" label={t("msg_notification")} hint={tx(C.messageNotificationsHint)} checked={form.msgNotifications} onChange={(value) => model.setField("msgNotifications", value)} />
            <ToggleRow id="field-mentionNotifications" label={tx(C.mentionNotifications)} hint={tx(C.mentionNotificationsHint)} checked={form.mentionNotifications} onChange={(value) => model.setField("mentionNotifications", value)} />
            <ToggleRow id="field-callNotifications" label={t("call_notification")} hint={tx(C.callNotificationsHint)} checked={form.callNotifications} onChange={(value) => model.setField("callNotifications", value)} />
            <ToggleRow id="field-friendReqNotifications" label={t("friend_req_notification")} hint={tx(C.friendRequestNotificationsHint)} checked={form.friendReqNotifications} onChange={(value) => model.setField("friendReqNotifications", value)} />
            <CardBody className="flex items-start gap-2">
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-zinc-400" aria-hidden="true" />
                <p className="text-[12.5px] leading-relaxed text-zinc-500 dark:text-zinc-400">{tx(C.groupLevels)}</p>
            </CardBody>
        </SettingsCard>
    );
}

/** "Mesajlaşma": what Hanogt Social does while chatting, and how chats look (save bar). */
export function MessagingSection({ model }: { model: AccountSettingsModel }) {
    const { t, tx } = useI18n();
    const { form } = model;
    if (!form) return <ProfileFallback model={model} rows={2} />;
    return (
        <div className="space-y-6">
            <SettingsCard title={tx(C.chat)}>
                <ToggleRow id="field-typingIndicator" label={t("typing_indicator")} hint={tx(C.typingHint)} checked={form.typingIndicator} onChange={(value) => model.setField("typingIndicator", value)} />
                <ToggleRow id="field-readReceipts" label={t("read_receipts_setting")} hint={tx(C.receiptsHint)} checked={form.readReceipts} onChange={(value) => model.setField("readReceipts", value)} />
                <ToggleRow id="field-gifAutoplay" label={t("gif_autoplay")} hint={tx(C.gifHint)} checked={form.gifAutoplay} onChange={(value) => model.setField("gifAutoplay", value)} />
                <ToggleRow id="field-enterToSend" label={t("enter_to_send")} hint={tx(C.enterHint)} checked={form.enterToSend} onChange={(value) => model.setField("enterToSend", value)} />
            </SettingsCard>
            <SettingsCard title={tx(C.chatLook)}>
                <SelectRow id="field-msgFontSize" label={t("msg_font_size")} value={form.msgFontSize} onChange={(value) => model.setField("msgFontSize", value)} options={[{ value: "small", label: t("small") }, { value: "medium", label: t("medium") }, { value: "large", label: t("large") }]} />
                <SelectRow id="field-chatBackground" label={t("chat_background")} value={form.chatBackground} onChange={(value) => model.setField("chatBackground", value)} options={[{ value: "default", label: t("default_bg") }, { value: "dark", label: t("dark_bg") }, { value: "gradient", label: t("gradient_bg") }, { value: "pattern", label: t("pattern_bg") }]} />
                <SelectRow id="field-voiceMsgQuality" label={t("voice_msg_quality")} value={form.voiceMsgQuality} onChange={(value) => model.setField("voiceMsgQuality", value)} options={[{ value: "low", label: t("low") }, { value: "normal", label: t("normal_quality") }, { value: "high", label: t("high") }]} />
            </SettingsCard>
        </div>
    );
}

const THEME_OPTIONS: Array<{ value: ThemePreference; label: Copy; icon: LucideIcon }> = [
    { value: "light", label: C.themeLight, icon: Sun },
    { value: "dark", label: C.themeDark, icon: Moon },
    { value: "system", label: C.themeSystem, icon: Laptop },
];

/** "Görünüm": theme and language apply on this device at once; accessibility is kept with the account (save bar). */
export function AppearanceSection({ model }: { model: AccountSettingsModel }) {
    const { t, tx, language, setLanguage } = useI18n();
    const { preference, setPreference } = useTheme();
    const { form } = model;
    const option = (selected: boolean) => `${FOCUS} ${selected
        ? "border-indigo-500 bg-indigo-50 text-indigo-700 dark:border-indigo-400/60 dark:bg-indigo-500/10 dark:text-indigo-200"
        : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300 hover:bg-zinc-50 dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:border-white/20 dark:hover:bg-white/[0.03]"}`;

    return (
        <div className="space-y-6">
            <SettingsCard id="setting-theme" title={tx(C.theme)} instant="device">
                <CardBody>
                    <div role="group" aria-label={tx(C.theme)} className="grid grid-cols-3 gap-2 sm:max-w-md">
                        {THEME_OPTIONS.map((entry) => {
                            const Icon = entry.icon;
                            const selected = preference === entry.value;
                            return (
                                <button key={entry.value} type="button" aria-pressed={selected} onClick={() => setPreference(entry.value)} className={`flex flex-col items-center gap-1.5 rounded-xl border px-2 py-3 text-[13px] font-medium transition ${option(selected)}`}>
                                    <Icon className="h-5 w-5" aria-hidden="true" />
                                    {tx(entry.label)}
                                </button>
                            );
                        })}
                    </div>
                </CardBody>
            </SettingsCard>

            <SettingsCard id="setting-language" title={tx(C.language)} description={t("app_language_desc")} instant="device">
                <CardBody>
                    {/* Every interface language, including right-to-left ones. */}
                    <div role="group" aria-label={tx(C.language)} className="grid max-h-80 grid-cols-2 gap-2 overflow-y-auto overscroll-contain pe-1 sm:grid-cols-3">
                        {LANGUAGES.map((entry) => {
                            const selected = language === entry.code;
                            return (
                                <button key={entry.code} type="button" onClick={() => setLanguage(entry.code)} aria-pressed={selected} title={entry.english} className={`flex min-w-0 items-center gap-2 rounded-lg border px-3 py-2 text-start text-sm transition ${option(selected)}`}>
                                    <span className="min-w-0 flex-1 truncate" lang={entry.locale}><bdi>{entry.name}</bdi></span>
                                    {selected ? <Check className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /> : null}
                                    <span className={`shrink-0 rounded-md px-1.5 py-0.5 font-mono text-[10.5px] font-semibold ${selected ? "bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-200" : "bg-zinc-100 text-zinc-500 dark:bg-white/[0.06] dark:text-zinc-400"}`} aria-hidden="true">{entry.code}</span>
                                </button>
                            );
                        })}
                    </div>
                </CardBody>
            </SettingsCard>

            {form ? (
                <SettingsCard title={tx(C.accessibility)} description={tx(C.accessibilityHint)}>
                    <ToggleRow id="field-reduceAnimations" label={t("reduce_animations")} hint={tx(C.reduceAnimationsHint)} checked={form.reduceAnimations} onChange={(value) => model.setField("reduceAnimations", value)} />
                    <ToggleRow id="field-highContrast" label={t("high_contrast")} hint={tx(C.highContrastHint)} checked={form.highContrast} onChange={(value) => model.setField("highContrast", value)} />
                </SettingsCard>
            ) : (
                <ProfileFallback model={model} rows={1} />
            )}
        </div>
    );
}

/** "Editör": the editor's own settings page, and a reset that asks first. */
export function EditorSection({ model }: { model: AccountSettingsModel }) {
    const { t, tx } = useI18n();
    return (
        <SettingsCard id="setting-editor" title={tx(C.editorTitle)} description={tx(C.editorHint)}>
            <CardBody>
                <Link href="/settings" className={buttonClass("secondary")}>
                    {tx(C.openEditorSettings)}
                    <ChevronRight className="h-4 w-4 rtl:rotate-180" aria-hidden="true" />
                </Link>
            </CardBody>
            <SettingRow label={t("reset_editor")} hint={t("reset_editor_desc")} anchor="setting-reset-editor">
                <button type="button" onClick={() => model.openDialog("resetEditor")} className={buttonClass("dangerOutline")} data-account-reset-editor>
                    <RotateCcw className="h-4 w-4" aria-hidden="true" />
                    {t("reset")}
                </button>
            </SettingRow>
        </SettingsCard>
    );
}

/** "Hanogt AI": its settings live on their own page. */
export function AiSection() {
    const { tx } = useI18n();
    return (
        <SettingsCard id="setting-ai" title={tx(C.aiTitle)} description={tx(C.aiHint)}>
            <CardBody className="flex flex-wrap gap-2">
                <Link href="/ai/settings" className={buttonClass("primary")} data-account-ai-settings>
                    {tx(C.openHanogtAiSettings)}
                    <ChevronRight className="h-4 w-4 rtl:rotate-180" aria-hidden="true" />
                </Link>
                <Link href="/plans#usage" className={buttonClass("secondary")}>{tx(C.aiUsage)}</Link>
            </CardBody>
        </SettingsCard>
    );
}
