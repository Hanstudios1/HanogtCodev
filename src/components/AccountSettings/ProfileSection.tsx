"use client";

import { Check, ChevronRight, Facebook, Github, Globe2, Instagram, Linkedin, Twitter, Youtube } from "lucide-react";
import Link from "next/link";
import { useId, type ReactNode } from "react";
import PlanBadge from "@/components/PlanBadge";
import PlanBadgeSetting from "@/components/Plans/PlanBadgeSetting";
import PresenceAvatar from "@/components/PresenceAvatar";
import StaffBadge, { parseStaffRole } from "@/components/StaffBadge";
import { PROFILE_TEXT_LIMITS, isSafeProfileUrl, type AccountFacts, type EditableAccountFields } from "@/lib/account-profile";
import { useI18n } from "@/lib/i18n";
import { visiblePlanBadge } from "@/lib/plan-badge";
import { PRESENCE_STATUS_COPY, type PresenceStatus } from "@/lib/presence";
import { POPULAR_LANGUAGE_IDS, getLanguage } from "@/lib/runtimes/languages";
import { C } from "./copy";
import { bandStyle } from "./helpers";
import ProfileFallback from "./ProfileFallback";
import { CardBody, FOCUS, INPUT, SettingRow, SettingsCard } from "./ui";
import type { AccountSettingsModel } from "./useAccountSettings";

// Names people can mark as favourites. The runnable languages come from the
// editor's single source of truth; framework/library names are kept as before
// so previously saved favourites still match.
const PROGRAMMING_LANGUAGES = [...new Set([
    ...POPULAR_LANGUAGE_IDS.map((id) => (id === "sql" ? "SQL" : getLanguage(id)?.name ?? id)),
    "Ruby", "PHP", "Swift", "Dart", "Scala", "R", "Lua", "Scheme",
    "CSS", "React", "Vue", "Angular", "Node.js", "Next.js", "Flutter",
])];

const ACCENT_COLORS = [
    "#3B82F6", "#8B5CF6", "#EC4899", "#EF4444", "#F97316", "#EAB308",
    "#22C55E", "#06B6D4", "#6366F1", "#D946EF", "#14B8A6", "#F43F5E",
];

/** TikTok has no icon in the set: its mark, drawn in the text colour like the others. */
function TiktokIcon({ className }: { className?: string }) {
    return (
        <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
            <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z" />
        </svg>
    );
}

type SocialKey = keyof EditableAccountFields & `social${string}`;
const ICON = "h-4 w-4 shrink-0 text-zinc-500 dark:text-zinc-400";
// Neutral icons in the text colour (no brand colours).
const SOCIAL_FIELDS: Array<{ key: SocialKey; label: string | null; placeholder: string; icon: ReactNode; type?: string }> = [
    { key: "socialGithub", label: "GitHub", placeholder: "github.com/kullaniciadi", icon: <Github className={ICON} aria-hidden="true" /> },
    { key: "socialLinkedin", label: "LinkedIn", placeholder: "linkedin.com/in/kullaniciadi", icon: <Linkedin className={ICON} aria-hidden="true" /> },
    { key: "socialTwitter", label: "Twitter / X", placeholder: "x.com/kullaniciadi", icon: <Twitter className={ICON} aria-hidden="true" /> },
    // The website's name comes from the site language.
    { key: "socialWebsite", label: null, placeholder: "https://example.com", icon: <Globe2 className={ICON} aria-hidden="true" />, type: "url" },
    { key: "socialYoutube", label: "YouTube", placeholder: "youtube.com/@kanaliniz", icon: <Youtube className={ICON} aria-hidden="true" /> },
    { key: "socialTiktok", label: "TikTok", placeholder: "tiktok.com/@kullaniciadi", icon: <TiktokIcon className={ICON} /> },
    { key: "socialInstagram", label: "Instagram", placeholder: "instagram.com/kullaniciadi", icon: <Instagram className={ICON} aria-hidden="true" /> },
    { key: "socialFacebook", label: "Facebook", placeholder: "facebook.com/kullaniciadi", icon: <Facebook className={ICON} aria-hidden="true" /> },
];

/** The live profile card: banner, picture with status, name, nickname#tag, custom status, about, badges. */
function ProfilePreview({ form, email, facts, status }: { form: EditableAccountFields; email: string; facts: AccountFacts | null; status: PresenceStatus | null }) {
    const { t, tx } = useI18n();
    const avatar = form.avatarUrl.trim();
    const name = form.username.trim() || email.split("@")[0];
    const custom = form.customStatus.trim();
    return (
        <article aria-label={tx(C.preview)} className="overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:border-white/[0.08] dark:bg-zinc-900">
            <div className="h-16 bg-zinc-100 dark:bg-zinc-800" style={bandStyle(form)} aria-hidden="true" />
            <div className="px-4 pb-4">
                <div className="-mt-9 flex items-end justify-between gap-3">
                    <span className="inline-block rounded-full border-4 border-white bg-white dark:border-zinc-900 dark:bg-zinc-900">
                        <PresenceAvatar src={isSafeProfileUrl(avatar) ? avatar : null} name={name} status={status} size="lg" ring="bg-white dark:bg-zinc-900" />
                    </span>
                    <span className="mb-1 flex flex-wrap items-center justify-end gap-1.5">
                        <StaffBadge role={parseStaffRole(facts?.staffRole)} size="sm" />
                        <PlanBadge plan={visiblePlanBadge(facts?.planBadge)} size="sm" />
                    </span>
                </div>
                <p className="mt-2 break-words text-lg font-semibold text-zinc-900 dark:text-white">{name}</p>
                {form.nickname ? <p className="font-mono text-[13px] text-zinc-500 dark:text-zinc-400" dir="ltr">{form.nickname}#{form.nicknameTag || "0000"}</p> : null}
                {status ? <p className="mt-0.5 text-[12.5px] text-zinc-500 dark:text-zinc-400">{tx(PRESENCE_STATUS_COPY[status])}</p> : null}
                {custom ? <p className="mt-2 rounded-xl bg-zinc-50 px-3 py-2 text-[13px] text-zinc-700 dark:bg-white/[0.04] dark:text-zinc-200" dir="auto">{custom}</p> : null}
                <div className="mt-3 border-t border-zinc-100 pt-3 dark:border-white/[0.06]">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">{t("bio") || "Hakkında"}</p>
                    <p className="mt-1 line-clamp-5 whitespace-pre-wrap break-words text-[13px] text-zinc-700 dark:text-zinc-300" dir="auto">{form.bio.trim() || t("no_bio") || "—"}</p>
                </div>
                {form.favoriteLangs.length ? (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                        {form.favoriteLangs.map((lang) => (
                            <span key={lang} className="rounded-full px-2.5 py-0.5 text-[11.5px] font-semibold text-white" style={{ backgroundColor: form.accentColor }}>{lang}</span>
                        ))}
                    </div>
                ) : null}
            </div>
        </article>
    );
}

/** "Profil": picture, banner, accent, plan badge, about, favourite languages and links, with a live preview. */
export default function ProfileSection({ model }: { model: AccountSettingsModel }) {
    const { t, tx } = useI18n();
    const accentLabelId = useId();
    const langsLabelId = useId();
    const { form, facts } = model;
    if (!form || !model.email) return <ProfileFallback model={model} rows={3} />;

    const avatarValid = isSafeProfileUrl(form.avatarUrl.trim());
    const bannerValid = isSafeProfileUrl(form.bannerUrl.trim());
    const accent = form.accentColor.toUpperCase();
    const langsFull = form.favoriteLangs.length >= 5;

    return (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_18rem] xl:items-start">
            <div className="order-2 min-w-0 space-y-6 xl:order-1">
                <SettingsCard title={tx(C.picture)}>
                    <SettingRow layout="field" label={t("avatar_url")} hint={tx(C.avatarHint)} htmlFor="field-avatarUrl">
                        <input id="field-avatarUrl" type="url" inputMode="url" dir="ltr" value={form.avatarUrl} maxLength={2048} onChange={(event) => model.setField("avatarUrl", event.target.value)} placeholder="https://example.com/avatar.jpg" aria-invalid={model.fieldInvalid("avatarUrl") ?? (!avatarValid || undefined)} aria-describedby={avatarValid ? undefined : "avatar-hint"} className={INPUT} />
                        {!avatarValid ? <p id="avatar-hint" className="mt-1.5 text-xs text-red-600 dark:text-red-400">{tx(C.urlInvalid)}</p> : null}
                    </SettingRow>
                    <SettingRow layout="field" label={t("banner_url")} hint={tx(C.bannerHint)} htmlFor="field-bannerUrl">
                        <input id="field-bannerUrl" type="url" inputMode="url" dir="ltr" value={form.bannerUrl} maxLength={2048} onChange={(event) => model.setField("bannerUrl", event.target.value)} placeholder="https://example.com/banner.jpg" aria-invalid={model.fieldInvalid("bannerUrl") ?? (!bannerValid || undefined)} aria-describedby={bannerValid ? undefined : "banner-hint"} className={INPUT} />
                        {!bannerValid ? <p id="banner-hint" className="mt-1.5 text-xs text-red-600 dark:text-red-400">{tx(C.urlInvalid)}</p> : null}
                    </SettingRow>
                    <SettingRow layout="field" label={t("accent_color")} hint={tx(C.accentHint)} labelId={accentLabelId}>
                        <div id="field-accentColor" tabIndex={-1} role="group" aria-labelledby={accentLabelId} className="flex flex-wrap gap-2 outline-none @xl:pt-1">
                            {ACCENT_COLORS.map((color) => {
                                const selected = accent === color;
                                return (
                                    <button
                                        key={color}
                                        type="button"
                                        onClick={() => model.setField("accentColor", color)}
                                        aria-pressed={selected}
                                        aria-label={tx(C.accentOption, { color })}
                                        title={color}
                                        className={`grid h-8 w-8 place-items-center rounded-full transition ${FOCUS} ${selected ? "ring-2 ring-zinc-900 ring-offset-2 ring-offset-white dark:ring-white dark:ring-offset-zinc-900" : "hover:opacity-85"}`}
                                        style={{ backgroundColor: color }}
                                    >
                                        {selected ? <Check className="h-4 w-4 text-white" aria-hidden="true" /> : null}
                                    </button>
                                );
                            })}
                        </div>
                    </SettingRow>
                </SettingsCard>

                {facts?.planBadge?.plan ? (
                    <SettingsCard id="setting-plan-badge" title={tx(C.planBadgeTitle)} instant="account">
                        <CardBody>
                            <PlanBadgeSetting state={facts.planBadge} onChange={model.applyPlanBadge} />
                        </CardBody>
                    </SettingsCard>
                ) : facts?.planBadge?.allowed ? (
                    <SettingsCard id="setting-plan-badge" title={tx(C.planBadgeTitle)} description={tx(C.planBadgeTeaser)}>
                        <CardBody>
                            <Link href="/plans" className={`inline-flex items-center gap-1 rounded-md text-[13px] font-semibold text-indigo-600 hover:underline dark:text-indigo-400 ${FOCUS}`} data-plan-badge-teaser>
                                {tx(C.seePlans)}
                                <ChevronRight className="h-4 w-4 rtl:rotate-180" aria-hidden="true" />
                            </Link>
                        </CardBody>
                    </SettingsCard>
                ) : null}

                <SettingsCard title={tx(C.about)}>
                    <SettingRow layout="field" label={t("bio")} hint={tx(C.bioHint)} htmlFor="field-bio">
                        <textarea id="field-bio" value={form.bio} onChange={(event) => model.setField("bio", event.target.value)} placeholder={t("bio_placeholder")} maxLength={PROFILE_TEXT_LIMITS.bio} rows={4} aria-invalid={model.fieldInvalid("bio")} className={`${INPUT} resize-y`} />
                        <p className="mt-1 text-end text-xs tabular-nums text-zinc-400 dark:text-zinc-500">{[...form.bio].length}/{PROFILE_TEXT_LIMITS.bio}</p>
                    </SettingRow>
                    <SettingRow
                        layout="field"
                        label={<>{t("favorite_langs")} <span className="font-normal tabular-nums text-zinc-500 dark:text-zinc-400">({form.favoriteLangs.length}/5)</span></>}
                        hint={t("favorite_langs_desc")}
                        labelId={langsLabelId}
                    >
                        <div id="field-favoriteLangs" tabIndex={-1} role="group" aria-labelledby={langsLabelId} className="flex flex-wrap gap-1.5 outline-none @xl:pt-1">
                            {PROGRAMMING_LANGUAGES.map((lang) => {
                                const selected = form.favoriteLangs.includes(lang);
                                const full = langsFull && !selected;
                                return (
                                    <button
                                        key={lang}
                                        type="button"
                                        onClick={() => model.toggleFavoriteLang(lang)}
                                        aria-pressed={selected}
                                        disabled={full}
                                        className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium transition ${FOCUS} ${selected ? "border-transparent text-white" : "border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300 hover:text-zinc-900 dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:border-white/20 dark:hover:text-white"} ${full ? "cursor-not-allowed opacity-40" : ""}`}
                                        style={selected ? { backgroundColor: form.accentColor } : undefined}
                                    >
                                        {selected ? <Check className="h-3 w-3" aria-hidden="true" /> : null}
                                        {lang}
                                    </button>
                                );
                            })}
                        </div>
                    </SettingRow>
                </SettingsCard>

                <SettingsCard id="setting-social-links" title={t("social_links")} description={t("social_links_desc")}>
                    {SOCIAL_FIELDS.map((field) => (
                        <SettingRow
                            key={field.key}
                            layout="field"
                            htmlFor={`field-${field.key}`}
                            label={<span className="inline-flex items-center gap-2">{field.icon}{field.label ?? t("website")}</span>}
                        >
                            <input
                                id={`field-${field.key}`}
                                type={field.type ?? "text"}
                                dir="ltr"
                                value={form[field.key]}
                                maxLength={PROFILE_TEXT_LIMITS.social}
                                onChange={(event) => model.setField(field.key, event.target.value)}
                                placeholder={field.placeholder}
                                aria-invalid={model.fieldInvalid(field.key)}
                                className={INPUT}
                            />
                        </SettingRow>
                    ))}
                </SettingsCard>
            </div>

            <div className="order-1 min-w-0 xl:sticky xl:top-24 xl:order-2">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">{tx(C.preview)}</p>
                <div className="sm:max-w-sm xl:max-w-none">
                    <ProfilePreview form={form} email={model.email} facts={facts} status={model.ownStatus} />
                </div>
                <p className="mt-2 text-[12px] leading-relaxed text-zinc-500 dark:text-zinc-400">{tx(C.previewHint)}</p>
            </div>
        </div>
    );
}
