"use client";

import { Save, Zap } from "lucide-react";
import { useState } from "react";
import { DEFAULT_ENGINE_MODEL, ENGINE_DAILY_MAX, ENGINE_EFFORTS, ENGINE_MODEL_PATTERN, ENGINE_SCOPES, type AiEngineSettings, type EngineEffort, type EngineScope } from "@/lib/ai/engine";
import { useI18n, type Copy } from "@/lib/i18n";
import { PLAN_COPY, PLAN_IDS, type PlanId } from "@/lib/plans";
import { adminPost, type ApiFailure } from "./api";
import { formatDateTime } from "./hooks";
import type { AdminPlansResponse } from "./types";
import { Badge, Button, ErrorNotice, INPUT_CLASS, Notice, Panel, useToast } from "./ui";

const C = {
    title: { TR: "Hanogt AI motoru", EN: "Hanogt AI engine" },
    hint: { TR: "Kod ve güvenlik soruları gelişmiş kod motoruna (Claude) gider; her planın günlük hakkı dolunca ya da motor yanıt veremezse standart motor yanıtlar. Değişiklik bir dakika içinde geçerli olur ve denetim kaydına yazılır.", EN: "Code and security questions go to the advanced code engine (Claude); when a plan's daily answers run out or the engine can't answer, the standard engine does. A change applies within a minute and is written to the audit log." },
    configured: { TR: "ANTHROPIC_API_KEY tanımlı", EN: "ANTHROPIC_API_KEY is set" },
    missing: { TR: "ANTHROPIC_API_KEY yok", EN: "No ANTHROPIC_API_KEY" },
    missingHint: { TR: "Sunucuda Anthropic anahtarı olmadığı için bütün yanıtları standart motor veriyor. Vercel → Settings → Environment Variables bölümüne ANTHROPIC_API_KEY ekleyip yeniden dağıtın (gizli bir değişkendir; NEXT_PUBLIC_ ile başlamasın).", EN: "The server has no Anthropic key, so the standard engine answers everything. Add ANTHROPIC_API_KEY in Vercel → Settings → Environment Variables and redeploy (it's secret; no NEXT_PUBLIC_ prefix)." },
    enabled: { TR: "Gelişmiş kod motoru açık", EN: "Advanced code engine on" },
    model: { TR: "Model", EN: "Model" },
    modelHint: { TR: "Anthropic model kimliği, ör. {model}.", EN: "An Anthropic model ID, e.g. {model}." },
    effort: { TR: "Efor", EN: "Effort" },
    effortHint: { TR: "Yüksek efor daha derin düşünür ama daha yavaş ve pahalıdır; sohbetin 55 saniyelik sınırı için orta önerilir.", EN: "Higher effort thinks deeper but is slower and costs more; medium suits the chat's 55-second limit." },
    scope: { TR: "Hangi mesajlar", EN: "Which messages" },
    daily: { TR: "Günlük gelişmiş yanıt (24 saat)", EN: "Advanced answers a day (24 hours)" },
    save: { TR: "Kaydet", EN: "Save" },
    saved: { TR: "Hanogt AI motoru kaydedildi.", EN: "Hanogt AI engine saved." },
    invalid: { TR: "Model kimliği ya da günlük haklar geçersiz (0–{max}).", EN: "The model ID or a daily allowance is invalid (0–{max})." },
    updated: { TR: "Son değişiklik: {by} · {at}", EN: "Last change: {by} · {at}" },
    never: { TR: "Henüz değiştirilmedi; varsayılanlar geçerli.", EN: "Not changed yet; the defaults apply." },
} satisfies Record<string, Copy>;

const EFFORT_COPY: Record<EngineEffort, Copy> = {
    low: { TR: "Düşük (en hızlı)", EN: "Low (fastest)" },
    medium: { TR: "Orta (önerilen)", EN: "Medium (recommended)" },
    high: { TR: "Yüksek", EN: "High" },
    xhigh: { TR: "Çok yüksek", EN: "Extra high" },
    max: { TR: "En yüksek", EN: "Max" },
};

const SCOPE_COPY: Record<EngineScope, Copy> = {
    code: { TR: "Kod ve güvenlik (Kod/Güvenlik modu, ekli dosya, kod, hata ya da programlama sorusu)", EN: "Code and security (Code/Security mode, an attached file, code, an error or a programming question)" },
    all: { TR: "Bütün mesajlar", EN: "Every message" },
};

/** Admin › Subscriptions: the advanced code engine's switch, model, effort, scope and each plan's answers a day. */
export default function AiEngineCard({ engine, onChanged }: { engine: AdminPlansResponse["engine"]; onChanged: (data: AdminPlansResponse) => void }) {
    const { tx, locale } = useI18n();
    const toast = useToast();
    const [draft, setDraft] = useState<AiEngineSettings>(engine.settings);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<ApiFailure | null>(null);
    const [invalid, setInvalid] = useState(false);

    const dirty = JSON.stringify(draft) !== JSON.stringify(engine.settings);
    const setDaily = (plan: PlanId, value: string) => setDraft((current) => ({ ...current, daily: { ...current.daily, [plan]: value === "" ? Number.NaN : Number(value) } }));

    const save = async () => {
        const valid = ENGINE_MODEL_PATTERN.test(draft.model) && PLAN_IDS.every((plan) => Number.isInteger(draft.daily[plan]) && draft.daily[plan] >= 0 && draft.daily[plan] <= ENGINE_DAILY_MAX);
        setInvalid(!valid);
        if (!valid) return;
        setBusy(true);
        setError(null);
        const result = await adminPost<AdminPlansResponse>("/api/admin/plans", { action: "setAiEngine", settings: draft });
        setBusy(false);
        if (!result.ok) {
            setError(result);
            return;
        }
        toast("success", tx(C.saved));
        setDraft(result.data.engine.settings);
        onChanged(result.data);
    };

    return (
        <Panel title={tx(C.title)} description={tx(C.hint)} icon={Zap}>
            <div className="space-y-4" data-ai-engine-card>
                <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={engine.configured ? "emerald" : "amber"}>{tx(engine.configured ? C.configured : C.missing)}</Badge>
                    <code className="text-[11px] text-zinc-400">site_config/ai_engine</code>
                </div>
                {!engine.configured ? <Notice tone="warning">{tx(C.missingHint)}</Notice> : null}
                {error ? <ErrorNotice error={error} /> : null}
                {invalid ? <Notice tone="error">{tx(C.invalid, { max: ENGINE_DAILY_MAX })}</Notice> : null}

                <label className="flex items-center gap-2 text-[14px] font-semibold text-zinc-800 dark:text-zinc-100">
                    <input type="checkbox" className="h-4 w-4 accent-indigo-600" checked={draft.enabled} onChange={(event) => setDraft((current) => ({ ...current, enabled: event.target.checked }))} data-ai-engine-enabled />
                    {tx(C.enabled)}
                </label>

                <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block text-[12.5px] font-semibold text-zinc-600 dark:text-zinc-300">
                        {tx(C.model)}
                        <input className={`${INPUT_CLASS} mt-1 font-mono`} value={draft.model} maxLength={64} spellCheck={false} onChange={(event) => setDraft((current) => ({ ...current, model: event.target.value.trim() }))} data-ai-engine-model />
                        <span className="mt-1 block text-[11.5px] font-normal text-zinc-400">{tx(C.modelHint, { model: DEFAULT_ENGINE_MODEL })}</span>
                    </label>
                    <label className="block text-[12.5px] font-semibold text-zinc-600 dark:text-zinc-300">
                        {tx(C.effort)}
                        <select className={`${INPUT_CLASS} mt-1`} value={draft.effort} onChange={(event) => setDraft((current) => ({ ...current, effort: event.target.value as EngineEffort }))} data-ai-engine-effort>
                            {ENGINE_EFFORTS.map((effort) => <option key={effort} value={effort}>{tx(EFFORT_COPY[effort])}</option>)}
                        </select>
                        <span className="mt-1 block text-[11.5px] font-normal text-zinc-400">{tx(C.effortHint)}</span>
                    </label>
                </div>

                <label className="block text-[12.5px] font-semibold text-zinc-600 dark:text-zinc-300">
                    {tx(C.scope)}
                    <select className={`${INPUT_CLASS} mt-1`} value={draft.scope} onChange={(event) => setDraft((current) => ({ ...current, scope: event.target.value as EngineScope }))} data-ai-engine-scope>
                        {ENGINE_SCOPES.map((scope) => <option key={scope} value={scope}>{tx(SCOPE_COPY[scope])}</option>)}
                    </select>
                </label>

                <fieldset>
                    <legend className="text-[12.5px] font-semibold text-zinc-600 dark:text-zinc-300">{tx(C.daily)}</legend>
                    <div className="mt-1 grid grid-cols-3 gap-3">
                        {PLAN_IDS.map((plan) => (
                            <label key={plan} className="block text-[12px] text-zinc-500 dark:text-zinc-400">
                                {tx(PLAN_COPY[plan].name)}
                                <input
                                    type="number"
                                    min={0}
                                    max={ENGINE_DAILY_MAX}
                                    step={1}
                                    className={`${INPUT_CLASS} mt-1 tabular-nums`}
                                    value={Number.isFinite(draft.daily[plan]) ? draft.daily[plan] : ""}
                                    onChange={(event) => setDaily(plan, event.target.value)}
                                    data-ai-engine-daily={plan}
                                />
                            </label>
                        ))}
                    </div>
                </fieldset>

                <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-[12px] text-zinc-500">
                        {engine.updatedAt ? tx(C.updated, { by: engine.updatedBy ?? "—", at: formatDateTime(engine.updatedAt, locale) }) : tx(C.never)}
                    </p>
                    <Button variant="primary" icon={Save} busy={busy} disabled={!dirty} onClick={() => void save()} data-ai-engine-save>{tx(C.save)}</Button>
                </div>
            </div>
        </Panel>
    );
}
