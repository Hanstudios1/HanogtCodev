"use client";

import { ChevronRight, Copy as CopyIcon, KeyRound, LogOut, Paintbrush, ShieldAlert, ShieldCheck, Shuffle, type LucideIcon } from "lucide-react";
import { useId, type ReactNode } from "react";
import PlanBadge from "@/components/PlanBadge";
import PresenceAvatar from "@/components/PresenceAvatar";
import { useAccountSecurity } from "@/components/Security/account-security-store";
import StaffBadge, { parseStaffRole } from "@/components/StaffBadge";
import { NICKNAME_INPUT_MAX, NICKNAME_INPUT_PATTERN, PROFILE_TEXT_LIMITS, isSafeProfileUrl } from "@/lib/account-profile";
import { useI18n, type Copy } from "@/lib/i18n";
import { visiblePlanBadge } from "@/lib/plan-badge";
import { C } from "./copy";
import { bandStyle, formatDate, plainClick } from "./helpers";
import ProfileFallback from "./ProfileFallback";
import type { SectionId } from "./sections";
import { FOCUS, INPUT, READONLY_INPUT, SettingRow, SettingsCard, buttonClass } from "./ui";
import type { AccountSettingsModel } from "./useAccountSettings";

type Tone = "ok" | "warn" | "neutral";
const TONE_ICON: Record<Tone, string> = {
    ok: "text-emerald-600 dark:text-emerald-400",
    warn: "text-amber-600 dark:text-amber-400",
    neutral: "text-zinc-400 dark:text-zinc-500",
};

function StatusChip({ icon: Icon, tone, children }: { icon: LucideIcon; tone: Tone; children: ReactNode }) {
    return (
        <span className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-[12.5px] font-medium text-zinc-700 dark:border-white/10 dark:bg-white/[0.04] dark:text-zinc-200">
            <Icon className={`h-3.5 w-3.5 shrink-0 ${TONE_ICON[tone]}`} aria-hidden="true" />
            <span className="truncate">{children}</span>
        </span>
    );
}

/** Two-step verification and password at a glance (the shared security summary), with a way to the security settings. */
function SecurityStatus({ owner, hasPassword, onManage }: { owner: string | null; hasPassword: boolean; onManage: () => void }) {
    const { tx } = useI18n();
    const { load } = useAccountSecurity(owner);
    const summary = load.state === "ready" ? load.summary : null;
    const password = summary?.hasPassword ?? hasPassword;
    return (
        <div className="flex flex-wrap items-center gap-1.5">
            {summary ? (
                <StatusChip icon={summary.twoFactor.enabled ? ShieldCheck : ShieldAlert} tone={summary.twoFactor.enabled ? "ok" : "warn"}>
                    {tx(summary.twoFactor.enabled ? C.twoFactorOn : C.twoFactorOff)}
                </StatusChip>
            ) : load.state === "loading" ? (
                <span className="h-7 w-40 animate-pulse rounded-full bg-zinc-100 dark:bg-white/[0.06]" role="status">
                    <span className="sr-only">{tx(C.securityLoading)}</span>
                </span>
            ) : null}
            <StatusChip icon={KeyRound} tone={password ? "ok" : "neutral"}>{tx(password ? C.passwordOn : C.passwordOff)}</StatusChip>
            <a
                href="#privacy"
                onClick={(event) => {
                    if (plainClick(event)) onManage();
                }}
                className={`inline-flex items-center gap-0.5 rounded-md px-1 text-[12.5px] font-semibold text-indigo-600 hover:underline dark:text-indigo-400 ${FOCUS}`}
            >
                {tx(C.manageSecurity)}
                <ChevronRight className="h-3.5 w-3.5 rtl:rotate-180" aria-hidden="true" />
            </a>
        </div>
    );
}

/** The account at a glance (as saved): picture, names, badges, membership, last sign-in, security and counters. */
function Overview({ model, onNavigate }: { model: AccountSettingsModel; onNavigate: (id: SectionId) => void }) {
    const { tx, locale } = useI18n();
    const nameId = useId();
    const { base: saved, facts, stats, email } = model;
    const avatar = saved ? (isSafeProfileUrl(saved.avatarUrl.trim()) ? saved.avatarUrl.trim() : null) : model.sessionUser?.image;
    const handle = saved?.nickname && saved.nicknameTag ? `${saved.nickname}#${saved.nicknameTag}` : "";
    const memberSince = formatDate(facts?.createdAt, locale, { year: "numeric", month: "long" });
    const lastLogin = formatDate(facts?.lastLoginAt, locale, { dateStyle: "medium", timeStyle: "short" });
    const number = new Intl.NumberFormat(locale);
    const statItems: Array<{ label: Copy; value: number | null }> = stats ? [
        { label: C.statProjects, value: stats.projects },
        { label: C.statGameProjects, value: stats.gameProjects },
        { label: C.statGroups, value: stats.groups },
        { label: C.statFriends, value: stats.friends },
        { label: C.statPosts, value: stats.mediaPosts },
    ] : [];
    const term = "text-[12px] text-zinc-500 dark:text-zinc-400";
    const detail = "mt-0.5 text-[14px] font-medium text-zinc-900 dark:text-zinc-100";

    return (
        <section aria-labelledby={nameId} className="overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:border-white/[0.08] dark:bg-zinc-900" data-account-overview>
            <div className="h-16 bg-zinc-100 sm:h-20 dark:bg-zinc-800" style={bandStyle(saved)} aria-hidden="true" />
            <div className="px-5 pb-5 sm:px-6">
                <div className="flex items-end justify-between gap-3">
                    <span className="-mt-9 inline-block shrink-0 rounded-full border-4 border-white bg-white sm:-mt-10 dark:border-zinc-900 dark:bg-zinc-900">
                        <PresenceAvatar src={avatar} name={model.displayName} status={model.ownStatus} size="lg" ring="bg-white dark:bg-zinc-900" />
                    </span>
                    <button type="button" onClick={() => onNavigate("profile")} className={`mt-3 ${buttonClass("secondary", "sm")}`}>
                        <Paintbrush className="h-4 w-4" aria-hidden="true" />
                        {tx(C.editProfile)}
                    </button>
                </div>
                <div className="mt-3 min-w-0">
                    <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                        <h3 id={nameId} className="min-w-0 break-words text-xl font-semibold tracking-tight text-zinc-900 dark:text-white">{model.displayName}</h3>
                        <StaffBadge role={parseStaffRole(facts?.staffRole)} size="sm" />
                        <PlanBadge plan={visiblePlanBadge(facts?.planBadge)} size="sm" />
                    </div>
                    <p className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-[13px] text-zinc-500 dark:text-zinc-400">
                        {handle ? <span className="font-mono" dir="ltr">{handle}</span> : null}
                        {handle ? <span aria-hidden="true">·</span> : null}
                        <span className="min-w-0 truncate" dir="ltr">{email}</span>
                    </p>
                </div>
                <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-zinc-100 pt-4 sm:grid-cols-[minmax(0,auto)_minmax(0,auto)_minmax(0,1fr)] sm:gap-x-8 dark:border-white/[0.06]">
                    <div className="min-w-0">
                        <dt className={term}>{tx(C.memberSince)}</dt>
                        <dd className={detail}>{memberSince || "—"}</dd>
                    </div>
                    <div className="min-w-0">
                        <dt className={term}>{tx(C.lastSignIn)}</dt>
                        <dd className={detail}>{lastLogin || "—"}</dd>
                    </div>
                    <div className="col-span-2 min-w-0 sm:col-span-1">
                        <dt className={term}>{tx(C.security)}</dt>
                        <dd className="mt-1">
                            <SecurityStatus owner={model.sessionUser?.email ?? null} hasPassword={model.hasPassword} onManage={() => onNavigate("privacy")} />
                        </dd>
                    </div>
                </dl>
                {statItems.length ? (
                    <dl aria-label={tx(C.statsLabel)} className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-5">
                        {statItems.map((item) => (
                            <div key={item.label.EN} className="flex min-w-0 flex-col-reverse rounded-xl border border-zinc-100 bg-zinc-50/70 px-2 py-2 text-center dark:border-white/[0.06] dark:bg-white/[0.03]">
                                <dt className="truncate text-[11.5px] text-zinc-500 dark:text-zinc-400">{tx(item.label)}</dt>
                                <dd className="text-base font-semibold tabular-nums text-zinc-900 dark:text-white">{item.value === null ? "—" : number.format(item.value)}</dd>
                            </div>
                        ))}
                    </dl>
                ) : null}
            </div>
        </section>
    );
}

/** "Hesabım": the overview, the identity fields (save bar) and this device's session. */
export default function AccountSection({ model, onNavigate }: { model: AccountSettingsModel; onNavigate: (id: SectionId) => void }) {
    const { t, tx } = useI18n();
    const { form, facts } = model;
    const providerLabel = facts?.provider === "google" ? "Google" : facts?.provider === "credentials" ? tx(C.providerPassword) : facts?.provider || "";

    return (
        <div className="space-y-6">
            <Overview model={model} onNavigate={onNavigate} />

            {form ? (
                <SettingsCard title={tx(C.identity)} description={tx(C.identityHint)}>
                    <SettingRow layout="field" label={t("username")} hint={tx(C.usernameHint)} htmlFor="field-username">
                        <input id="field-username" type="text" value={form.username} maxLength={PROFILE_TEXT_LIMITS.username} onChange={(event) => model.setField("username", event.target.value)} aria-invalid={model.fieldInvalid("username")} className={INPUT} autoComplete="nickname" />
                    </SettingRow>
                    <SettingRow layout="field" label={t("nickname_tag")} hint={t("nickname_tag_desc")} htmlFor="field-nickname" hintId="nickname-hint">
                        <div className="flex flex-wrap gap-2">
                            <input
                                id="field-nickname"
                                type="text"
                                value={form.nickname}
                                onChange={(event) => model.setField("nickname", event.target.value.replace(NICKNAME_INPUT_PATTERN, ""))}
                                placeholder={t("nickname")}
                                maxLength={Math.max(NICKNAME_INPUT_MAX, form.nickname.length)}
                                aria-describedby="nickname-hint"
                                aria-invalid={model.fieldInvalid("nickname")}
                                className={`${INPUT} flex-1 basis-40`}
                            />
                            <div className="flex items-center gap-1.5">
                                <span id="field-nicknameTag" tabIndex={-1} aria-label={tx(C.tagLabel)} aria-invalid={model.fieldInvalid("nicknameTag")} className="inline-flex h-10 items-center gap-1 rounded-xl border border-zinc-300 bg-zinc-50 px-3 font-mono text-sm text-zinc-700 outline-none aria-[invalid=true]:border-red-500 dark:border-white/10 dark:bg-zinc-800 dark:text-zinc-200" dir="ltr">
                                    <span aria-hidden="true" className="text-zinc-400">#</span>
                                    <span>{form.nicknameTag || "0000"}</span>
                                </span>
                                <button type="button" onClick={model.newTag} title={tx(C.newTagHint)} className={buttonClass("secondary")}>
                                    <Shuffle className="h-4 w-4" aria-hidden="true" />
                                    {tx(C.newTag)}
                                </button>
                                <button type="button" onClick={() => void model.copyTag()} aria-label={tx(C.copyTag)} title={tx(C.copyTag)} className={buttonClass("ghost", "icon")}>
                                    <CopyIcon className="h-4 w-4" aria-hidden="true" />
                                </button>
                            </div>
                        </div>
                    </SettingRow>
                    <SettingRow layout="field" label={t("email")} hint={tx(C.emailHint)} htmlFor="account-email">
                        <input id="account-email" type="email" value={model.email ?? ""} readOnly aria-readonly="true" dir="ltr" className={READONLY_INPUT} />
                    </SettingRow>
                </SettingsCard>
            ) : (
                <ProfileFallback model={model} rows={1} />
            )}

            <SettingsCard title={tx(C.session)}>
                {providerLabel ? (
                    <SettingRow label={t("login_provider")}>
                        <span className="text-[14px] font-medium text-zinc-700 dark:text-zinc-200">{providerLabel}</span>
                    </SettingRow>
                ) : null}
                <SettingRow label={tx(C.signOutHere)} hint={t("sign_out_desc")} anchor="setting-sign-out">
                    <button type="button" onClick={model.signOutNow} className={buttonClass("secondary")} data-account-sign-out>
                        <LogOut className="h-4 w-4 rtl:rotate-180" aria-hidden="true" />
                        {t("sign_out")}
                    </button>
                </SettingRow>
            </SettingsCard>
        </div>
    );
}
