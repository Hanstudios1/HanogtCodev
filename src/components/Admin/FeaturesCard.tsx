"use client";

import { FlaskConical } from "lucide-react";
import { useState } from "react";
import { FEATURE_AUDIENCES, FEATURE_AUDIENCE_COPY, FEATURE_IDS, FEATURES, type FeatureAudience, type FeatureId } from "@/lib/features";
import { useI18n, type Copy } from "@/lib/i18n";
import { adminPost, type ApiFailure } from "./api";
import { formatDateTime } from "./hooks";
import type { AdminPlansResponse } from "./types";
import { Badge, ConfirmDialog, ErrorNotice, INPUT_CLASS, Panel, useToast } from "./ui";

const C = {
    title: { TR: "Özellikler ve erken erişim", EN: "Features and early access" },
    hint: { TR: "Yeni özellikleri adım adım aç: önce yalnızca ekip, sonra erken erişim (Pro aboneleri ve ekip), en son herkes. Değişiklik bir dakika içinde her yerde geçerli olur ve denetim kaydına yazılır.", EN: "Open new features step by step: first staff only, then early access (Pro subscribers and staff), finally everyone. A change applies everywhere within a minute and is written to the audit log." },
    audience: { TR: "{feature} kimlere açık", EN: "Who sees {feature}" },
    saved: { TR: "{feature}: {audience}", EN: "{feature}: {audience}" },
    updated: { TR: "Son değişiklik: {by} · {at}", EN: "Last change: {by} · {at}" },
    never: { TR: "Henüz değiştirilmedi; varsayılanlar geçerli.", EN: "Not changed yet; the defaults apply." },
} satisfies Record<string, Copy>;

const TONE: Record<FeatureAudience, "zinc" | "amber" | "fuchsia" | "emerald"> = { off: "zinc", staff: "amber", early: "fuchsia", all: "emerald" };

/** Admin › Subscriptions: who sees each feature that is opened step by step (src/lib/features.ts). */
export default function FeaturesCard({ features, onChanged }: { features: AdminPlansResponse["features"]; onChanged: (data: AdminPlansResponse) => void }) {
    const { tx, locale } = useI18n();
    const toast = useToast();
    const [busy, setBusy] = useState<FeatureId | null>(null);
    const [error, setError] = useState<ApiFailure | null>(null);
    // Switching a feature off for everyone who has it is asked first.
    const [turningOff, setTurningOff] = useState<FeatureId | null>(null);

    const change = async (feature: FeatureId, audience: FeatureAudience) => {
        setBusy(feature);
        setError(null);
        const result = await adminPost<AdminPlansResponse>("/api/admin/plans", { action: "setFeature", feature, audience });
        setBusy(null);
        if (!result.ok) {
            setError(result);
            return;
        }
        toast("success", tx(C.saved, { feature: tx(FEATURES[feature].title), audience: tx(FEATURE_AUDIENCE_COPY[audience]) }));
        onChanged(result.data);
    };

    return (
        <Panel title={tx(C.title)} description={tx(C.hint)} icon={FlaskConical}>
            {error ? <div className="mb-3"><ErrorNotice error={error} /></div> : null}
            <ul className="divide-y divide-zinc-100 dark:divide-white/[0.06]" data-features-card>
                {FEATURE_IDS.map((id) => {
                    const audience = features.audiences[id];
                    return (
                        <li key={id} className="flex flex-wrap items-center gap-3 py-3">
                            <div className="min-w-0 flex-1">
                                <p className="flex flex-wrap items-center gap-2 text-[14px] font-bold text-zinc-900 dark:text-white">
                                    {tx(FEATURES[id].title)}
                                    <Badge tone={TONE[audience]}>{tx(FEATURE_AUDIENCE_COPY[audience])}</Badge>
                                    <code className="text-[11px] font-normal text-zinc-400">{id}</code>
                                </p>
                                <p className="mt-0.5 text-[12.5px] text-zinc-500 dark:text-zinc-400">{tx(FEATURES[id].description)}</p>
                            </div>
                            <select
                                className={`${INPUT_CLASS.replace("w-full", "w-full sm:w-60")}`}
                                value={audience}
                                disabled={busy !== null}
                                aria-label={tx(C.audience, { feature: tx(FEATURES[id].title) })}
                                data-feature={id}
                                onChange={(event) => {
                                    const next = event.target.value as FeatureAudience;
                                    if (next === "off" && audience !== "off") setTurningOff(id);
                                    else void change(id, next);
                                }}
                            >
                                {FEATURE_AUDIENCES.map((option) => <option key={option} value={option}>{tx(FEATURE_AUDIENCE_COPY[option])}</option>)}
                            </select>
                        </li>
                    );
                })}
            </ul>
            <ConfirmDialog
                open={turningOff !== null}
                onClose={() => {
                    if (busy === null) setTurningOff(null);
                }}
                onConfirm={async () => {
                    if (!turningOff) return;
                    await change(turningOff, "off");
                    setTurningOff(null);
                }}
                title={tx({ TR: "{feature} kapatılsın mı?", EN: "Switch {feature} off?" }, { feature: turningOff ? tx(FEATURES[turningOff].title) : "" })}
                description={tx({ TR: "Özellik, şu an kullananlar dahil herkes için bir dakika içinde kapanır. İstediğiniz zaman yeniden açabilirsiniz.", EN: "The feature switches off within a minute for everyone, including people using it now. You can open it again at any time." })}
                confirmLabel={tx({ TR: "Kapat", EN: "Switch off" })}
                tone="default"
                busy={busy !== null}
            />
            <p className="mt-2 text-[12px] text-zinc-500">
                {features.updatedAt ? tx(C.updated, { by: features.updatedBy ?? "—", at: formatDateTime(features.updatedAt, locale) }) : tx(C.never)}
            </p>
        </Panel>
    );
}
