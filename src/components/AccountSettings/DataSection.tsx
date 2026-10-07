"use client";

import { Download, LoaderCircle, Trash2 } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { C } from "./copy";
import { CardBody, SettingRow, SettingsCard, buttonClass } from "./ui";
import type { AccountSettingsModel } from "./useAccountSettings";

/** "Veri": download everything, or delete the account (asks first, in a dialog). */
export default function DataSection({ model }: { model: AccountSettingsModel }) {
    const { t, tx } = useI18n();
    const exporting = model.busyAction === "export";
    return (
        <div className="space-y-6">
            <SettingsCard id="setting-export" title={tx(C.exportTitle)} description={t("data_export_desc")}>
                <CardBody>
                    <button type="button" onClick={() => void model.exportData()} disabled={exporting} className={buttonClass("secondary")} data-account-export>
                        {exporting ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Download className="h-4 w-4" aria-hidden="true" />}
                        {t("download_my_data")}
                    </button>
                </CardBody>
            </SettingsCard>

            <SettingsCard title={tx(C.dangerTitle)} tone="danger">
                <SettingRow layout="wide" label={t("delete_account")} hint={t("delete_account_warning")} anchor="setting-delete">
                    <button type="button" onClick={() => model.openDialog("delete")} className={buttonClass("danger")} data-account-delete>
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                        {t("delete_account")}
                    </button>
                </SettingRow>
            </SettingsCard>
        </div>
    );
}
