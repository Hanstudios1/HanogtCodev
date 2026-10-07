"use client";

import { CheckCircle2, Info, LoaderCircle, LogOut } from "lucide-react";
import TwoFactorSettings from "@/components/Account/TwoFactorSettings";
import AccountSecurityCard from "@/components/Security/AccountSecurityCard";
import RecentSignIns from "@/components/Security/RecentSignIns";
import type { SecurityCheckId } from "@/lib/account-security";
import { useI18n } from "@/lib/i18n";
import { C } from "./copy";
import ProfileFallback from "./ProfileFallback";
import { CardBody, INPUT, SelectRow, SettingRow, SettingsCard, ToggleRow, buttonClass } from "./ui";
import type { AccountSettingsModel } from "./useAccountSettings";

/** "Gizlilik ve Güvenlik": the security summary, password, two-step verification, sessions, then who sees what. */
export default function PrivacySection({ model }: { model: AccountSettingsModel }) {
    const { t, tx } = useI18n();
    const { form, hasPassword, password, busyAction } = model;

    // The summary's buttons go to the card on this page that handles them.
    const showCheck = (check: SecurityCheckId) => {
        const target = check === "password" || (check === "twoFactor" && !hasPassword) ? "security-password" : check === "sessions" ? "security-sessions" : "security-2fa";
        document.getElementById(target)?.scrollIntoView({ behavior: "smooth", block: "start" });
    };

    return (
        <div className="space-y-6">
            <div id="setting-security" className="scroll-mt-24">
                <AccountSecurityCard variant="settings" onAction={showCheck} />
            </div>

            <SettingsCard id="security-password" title={tx(C.passwordTitle)} description={tx(C.passwordStepUpNote)}>
                <CardBody className="flex items-start gap-2.5">
                    {hasPassword
                        ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                        : <Info className="mt-0.5 h-4 w-4 shrink-0 text-zinc-400" aria-hidden="true" />}
                    <p className="text-[13px] leading-relaxed text-zinc-700 dark:text-zinc-300">{hasPassword ? t("password_already_set") : t("password_google_info")}</p>
                </CardBody>
                <form
                    onSubmit={(event) => {
                        event.preventDefault();
                        void password.submit();
                    }}
                    className="divide-y divide-zinc-100 dark:divide-white/[0.06]"
                >
                    {/* For password managers: which account the password belongs to. */}
                    <input type="text" name="username" autoComplete="username" value={model.email ?? ""} readOnly hidden />
                    {hasPassword ? (
                        <SettingRow layout="field" label={tx(C.currentPassword)} htmlFor="password-current">
                            <input id="password-current" type="password" value={password.current} onChange={(event) => password.setCurrent(event.target.value)} autoComplete="current-password" className={INPUT} />
                        </SettingRow>
                    ) : null}
                    <SettingRow layout="field" label={tx(C.newPassword)} hint={tx(C.newPasswordHint)} htmlFor="password-new">
                        <input id="password-new" type="password" value={password.next} onChange={(event) => password.setNext(event.target.value)} autoComplete="new-password" className={INPUT} />
                    </SettingRow>
                    <SettingRow layout="field" label={tx(C.confirmPassword)} htmlFor="password-confirm">
                        <input id="password-confirm" type="password" value={password.confirm} onChange={(event) => password.setConfirm(event.target.value)} autoComplete="new-password" className={INPUT} />
                    </SettingRow>
                    <div className="flex justify-end px-5 py-3 sm:px-6">
                        <button type="submit" disabled={busyAction === "password"} className={buttonClass("primary")}>
                            {busyAction === "password" ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
                            {hasPassword ? t("change_password") : t("set_password")}
                        </button>
                    </div>
                </form>
            </SettingsCard>

            <SettingsCard id="security-2fa" title={tx(C.twoFactor)}>
                <CardBody>
                    <TwoFactorSettings />
                </CardBody>
            </SettingsCard>

            <SettingsCard id="security-sessions" title={tx(C.sessionsTitle)} description={tx(C.sessionsHint)}>
                <CardBody>
                    <button type="button" onClick={() => void model.signOutOthers()} disabled={busyAction === "sessions"} className={buttonClass("secondary")}>
                        {busyAction === "sessions" ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : <LogOut className="h-4 w-4 rtl:rotate-180" aria-hidden="true" />}
                        {tx(C.signOutOthers)}
                    </button>
                </CardBody>
                <CardBody>
                    <RecentSignIns />
                </CardBody>
            </SettingsCard>

            {form ? (
                <>
                    <SettingsCard title={tx(C.profileVisibility)}>
                        <ToggleRow id="field-publicProfile" label={t("public_profile")} hint={tx(C.publicProfileHint)} checked={form.publicProfile} onChange={(value) => model.setField("publicProfile", value)} />
                        <ToggleRow id="field-publicProjects" label={t("public_projects_setting")} checked={form.publicProjects} onChange={(value) => model.setField("publicProjects", value)} />
                        <SelectRow
                            id="field-bioVisibility"
                            label={t("bio_visibility")}
                            hint={tx(C.bioVisibilityHint)}
                            value={form.bioVisibility}
                            onChange={(value) => model.setField("bioVisibility", value)}
                            options={[{ value: "everyone", label: t("everyone") }, { value: "friends", label: t("friends_only") }, { value: "nobody", label: t("nobody") }]}
                        />
                    </SettingsCard>
                    <SettingsCard title={tx(C.friendRequests)}>
                        <SelectRow
                            id="field-whoCanAdd"
                            label={t("who_can_add")}
                            value={form.whoCanAdd}
                            onChange={(value) => model.setField("whoCanAdd", value)}
                            options={[{ value: "everyone", label: t("everyone") }, { value: "friends_of_friends", label: t("friends_of_friends") }, { value: "nobody", label: t("nobody") }]}
                        />
                    </SettingsCard>
                </>
            ) : (
                <ProfileFallback model={model} rows={1} />
            )}
        </div>
    );
}
