"use client";

import PresenceAvatar from "@/components/PresenceAvatar";
import StatusMenu from "@/components/StatusMenu";
import { isSafeProfileUrl } from "@/lib/account-profile";
import { useI18n } from "@/lib/i18n";
import { PRESENCE_STATUS_COPY, STATUS_PREFERENCE_COPY } from "@/lib/presence";
import { C } from "./copy";
import ProfileFallback from "./ProfileFallback";
import { CardBody, SettingsCard, ToggleRow } from "./ui";
import type { AccountSettingsModel } from "./useAccountSettings";

/** "Durum": the status and custom status (StatusMenu) and who sees you online; everything here saves at once. */
export default function StatusSection({ model }: { model: AccountSettingsModel }) {
    const { t, tx } = useI18n();
    const { form, base: saved, ownStatus } = model;
    if (!model.email) return null;
    const avatar = saved ? (isSafeProfileUrl(saved.avatarUrl.trim()) ? saved.avatarUrl.trim() : null) : model.sessionUser?.image;
    const shown = ownStatus ? (saved?.statusPreference === "invisible" ? tx(STATUS_PREFERENCE_COPY.invisible.label) : tx(PRESENCE_STATUS_COPY[ownStatus])) : "";

    return (
        <div className="space-y-6">
            <SettingsCard id="setting-status" title={tx(C.statusTitle)} description={tx(C.statusHint)} instant="account">
                <CardBody>
                    <div className="flex items-center gap-3 rounded-xl border border-zinc-100 bg-zinc-50 p-3 dark:border-white/[0.06] dark:bg-white/[0.03]">
                        <PresenceAvatar src={avatar} name={model.displayName} status={ownStatus} size="md" ring="bg-zinc-50 dark:bg-zinc-900" />
                        <div className="min-w-0">
                            <p className="truncate text-[14px] font-semibold text-zinc-900 dark:text-white">{model.displayName}</p>
                            {shown ? <p className="text-[12.5px] text-zinc-500 dark:text-zinc-400">{tx(C.statusNow, { status: shown })}</p> : null}
                        </div>
                    </div>
                    <StatusMenu email={model.email} onSaved={model.applyInstantSave} variant="settings" className="mt-4" />
                </CardBody>
            </SettingsCard>

            {form ? (
                <SettingsCard title={tx(C.visibility)} description={tx(C.visibilityDescription)} instant="account">
                    <ToggleRow id="field-showOnlineStatus" label={t("online_status")} hint={tx(C.onlineHidden)} checked={form.showOnlineStatus} busy={model.instantBusy === "showOnlineStatus"} onChange={(value) => void model.saveInstant("showOnlineStatus", value)} />
                    <ToggleRow id="field-showLastSeen" label={t("show_last_seen")} hint={tx(C.lastSeenHint)} checked={form.showLastSeen} busy={model.instantBusy === "showLastSeen"} onChange={(value) => void model.saveInstant("showLastSeen", value)} />
                </SettingsCard>
            ) : (
                <ProfileFallback model={model} rows={1} />
            )}
        </div>
    );
}
