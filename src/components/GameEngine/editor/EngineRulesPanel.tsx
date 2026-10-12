"use client";

/**
 * Project settings → Engine rules (V6): which engine's behaviour the project
 * keeps, what changes with the V6 rules, the upgrade and its undo.
 */
import { ArrowUpCircle, RotateCcw, ShieldCheck } from "lucide-react";
import { useI18n, type Copy } from "@/lib/i18n";
import { LATEST_RULES, rulesToUpgrade, undoRulesUpgrade, upgradeRules } from "@/lib/game-engine/rules";
import type { EngineRules, ProjectSettings } from "@/lib/game-engine/types";
import { useEditor } from "./context";
import { touch } from "./operations";
import { useEditorState } from "./store";
import { Button } from "./ui";

/** What a project notices when it moves to each rule set (only behaviour that differs; new features work everywhere). */
export const RULE_CHANGES: Record<Exclude<EngineRules, 3>, Copy[]> = {
    4: [
        { TR: "GetComponent<Slider>() ve AddComponent<Slider>() UI kaydırıcısını bulur.", EN: "GetComponent<Slider>() and AddComponent<Slider>() find the UI slider." },
        { TR: "Ses adları büyük-küçük harf ayırmadan hazır seslere eşlenir; bulunamayan ses Konsol'da uyarı verir.", EN: "Sound names match the built-in sounds whatever their case; a missing sound warns in the Console." },
    ],
    5: [
        { TR: "GetComponent<Animator>() Animator durum makinesini verir (Animator'ı olmayan nesnede yine Animation bileşenini).", EN: "GetComponent<Animator>() returns the Animator state machine (on an object without one, still its Animation component)." },
        { TR: "Animation.CrossFade klibi hemen başlatmak yerine verilen sürede (varsayılan 0,3 sn) geçiş yapar.", EN: "Animation.CrossFade blends over the given time (0.3 s by default) instead of starting the clip at once." },
        { TR: "Application.systemLanguage tarayıcının değil, oyuncunun seçtiği dilin adını verir.", EN: "Application.systemLanguage names the player's chosen language instead of the browser's." },
    ],
    6: [
        { TR: "LayerMask.GetMask, NameToLayer ve LayerToName katmanların adlarını kullanır; ışın ve örtüşme sorgularındaki maskeler geçerli olur (önce her katmana çarpıyorlardı).", EN: "LayerMask.GetMask, NameToLayer and LayerToName use the layer names; the masks of raycasts and overlap queries apply (before, they hit every layer)." },
        { TR: "gameObject.layer = n nesnenin katmanını değiştirir (önce yok sayılıyordu).", EN: "gameObject.layer = n changes the object's layer (before, it was ignored)." },
        { TR: "Physics.IgnoreLayerCollision, Physics2D.IgnoreCollision ve GetLayerCollisionMask çalışır.", EN: "Physics.IgnoreLayerCollision, Physics2D.IgnoreCollision and GetLayerCollisionMask work." },
        { TR: "Maskesiz ışınlar Ignore Raycast adlı katmanı atlar.", EN: "Raycasts without a mask skip the layer named Ignore Raycast." },
    ],
};

export function EngineRulesPanel({ disabled }: { disabled: boolean }) {
    const { store, t, toast } = useEditor();
    const { tx } = useI18n();
    const rules = useEditorState(store, (state) => state.project.settings.rules);
    const before = useEditorState(store, (state) => state.project.settings.rulesBefore ?? null);
    const pending = rulesToUpgrade(rules);
    const apply = (label: string, recipe: (settings: ProjectSettings) => boolean, message: string) => {
        let changed = false;
        store.update(label, (draft) => {
            draft.settings.rulesBefore ??= null;
            changed = recipe(draft.settings);
            if (changed) touch(draft);
        });
        if (changed) toast(message, "success");
    };

    return (
        <section className="mt-3 space-y-2 rounded-lg border border-white/[0.07] bg-white/[0.02] p-3" aria-labelledby="engine-rules-title">
            <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-indigo-300" />
                <h3 id="engine-rules-title" className="flex-1 text-[12px] font-bold text-zinc-200">{t("rulesTitle")}</h3>
                <span className="rounded-md border border-white/10 px-1.5 py-0.5 font-mono text-[11px] text-zinc-300">V{rules}</span>
            </div>
            <p className="text-[11.5px] leading-relaxed text-zinc-400">{(rules >= LATEST_RULES ? t("rulesLatest") : t("rulesOlder")).replace("{rules}", String(rules)).replace("{latest}", String(LATEST_RULES))}</p>
            {pending.length ? (
                <>
                    <p className="text-[11px] font-semibold text-zinc-300">{t("rulesChanges").replace("{latest}", String(LATEST_RULES))}</p>
                    <div className="space-y-1.5">
                        {pending.map((version) => (
                            <div key={version}>
                                <p className="text-[10.5px] font-bold uppercase tracking-wider text-zinc-500">V{version}</p>
                                <ul className="list-disc space-y-0.5 pl-4 text-[11.5px] leading-snug text-zinc-400">
                                    {RULE_CHANGES[version as Exclude<EngineRules, 3>].map((change, index) => <li key={index}>{tx(change)}</li>)}
                                </ul>
                            </div>
                        ))}
                    </div>
                    <Button variant="primary" className="w-full" disabled={disabled} onClick={() => apply(t("hRulesUpgrade"), upgradeRules, t("rulesUpgraded").replace("{latest}", String(LATEST_RULES)))}>
                        <ArrowUpCircle className="h-4 w-4" />{t("rulesUpgrade").replace("{latest}", String(LATEST_RULES))}
                    </Button>
                    <p className="text-[11px] leading-snug text-zinc-500">{t("rulesUpgradeHint")}</p>
                </>
            ) : null}
            {before !== null && before < rules ? (
                <div className="flex flex-wrap items-center gap-2 rounded-md border border-white/[0.06] px-2 py-1.5">
                    <p className="min-w-0 flex-1 text-[11.5px] text-zinc-400">{t("rulesUpgradedFrom").replace("{before}", String(before)).replace("{rules}", String(rules))}</p>
                    <Button disabled={disabled} onClick={() => apply(t("hRulesUndo"), undoRulesUpgrade, t("rulesUndone").replace("{before}", String(before)))}>
                        <RotateCcw className="h-3.5 w-3.5" />{t("rulesUndo").replace("{before}", String(before))}
                    </Button>
                </div>
            ) : null}
        </section>
    );
}
