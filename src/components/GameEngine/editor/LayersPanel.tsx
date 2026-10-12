"use client";

/**
 * Project settings → Layers (V6): names of the 16 physics layers and the
 * collision matrix (Unity's Layer Collision Matrix). Objects pick their layer
 * in the Inspector; scripts use LayerMask.GetMask("Name").
 */
import { Layers } from "lucide-react";
import { useState } from "react";
import { ALL_LAYERS, cleanLayerName, layersCollide, setLayerCollision } from "@/lib/game-engine/layers";
import { MAX_LAYERS, type LayerSettings } from "@/lib/game-engine/types";
import { useEditor } from "./context";
import { touch } from "./operations";
import { openSettings } from "./settings-events";
import { useEditorState } from "./store";
import { Button, cx, inputClass } from "./ui";

/** A layer name field: cleaned and checked for clashes when it is committed. */
function LayerNameInput({ layer, names, disabled, onChange, onRejected }: { layer: number; names: readonly string[]; disabled: boolean; onChange: (name: string) => void; onRejected: () => void }) {
    const { t } = useEditor();
    const [draft, setDraft] = useState<string | null>(null);
    const value = names[layer] ?? "";
    const commit = () => {
        if (draft === null) return;
        const raw = draft;
        setDraft(null);
        const name = cleanLayerName(raw);
        if (name === value) return;
        if (raw.trim() && (!name || names.some((other, index) => index !== layer && other && other.toLocaleLowerCase("tr") === name.toLocaleLowerCase("tr")))) {
            onRejected();
            return;
        }
        onChange(name);
    };
    return (
        <input
            value={draft ?? value}
            disabled={disabled}
            maxLength={32}
            placeholder={t("layerNamePlaceholder")}
            aria-label={`${t("layer")} ${layer}`}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={commit}
            onKeyDown={(event) => {
                if (event.key === "Enter") event.currentTarget.blur();
                if (event.key === "Escape") {
                    setDraft(null);
                    event.currentTarget.blur();
                }
            }}
            className={inputClass}
        />
    );
}

export function LayersPanel({ disabled }: { disabled: boolean }) {
    const { store, t, toast } = useEditor();
    const layers = useEditorState(store, (state) => state.project.settings.layers);
    const rules = useEditorState(store, (state) => state.project.settings.rules);
    const update = (label: string, recipe: (draft: LayerSettings) => void, key: string) => store.update(label, (draft) => {
        recipe(draft.settings.layers);
        touch(draft);
    }, { mergeKey: `layers:${key}` });
    const named = layers.names.map((name, layer) => ({ name, layer })).filter((item) => item.name);
    const everything = layers.collisions.every((row) => (row & ALL_LAYERS) === ALL_LAYERS);

    return (
        <div className="space-y-4">
            <p className="text-[12px] leading-relaxed text-zinc-400">{t("layersIntro")}</p>
            {rules < 6 ? (
                <p className="rounded-lg border border-amber-400/20 bg-amber-500/[0.08] p-2 text-[11.5px] leading-snug text-amber-100/90">
                    {t("layersOldRules").replace("{rules}", String(rules))}{" "}
                    <button type="button" onClick={() => openSettings("project")} className="font-semibold text-amber-50 underline underline-offset-2">{t("rulesOpen")}</button>
                </p>
            ) : null}

            <section>
                <h3 className="mb-1.5 text-[10.5px] font-bold uppercase tracking-wider text-zinc-500">{t("layerNames")}</h3>
                <div className="grid gap-x-3 gap-y-1 sm:grid-cols-2">
                    {Array.from({ length: MAX_LAYERS }, (_, layer) => (
                        <label key={layer} className="flex items-center gap-2">
                            <span className="w-5 shrink-0 text-right font-mono text-[11px] text-zinc-500">{layer}</span>
                            {layer === 0 ? (
                                <span className={cx(inputClass, "flex items-center text-zinc-400")}>Default</span>
                            ) : (
                                <LayerNameInput
                                    layer={layer}
                                    names={layers.names}
                                    disabled={disabled}
                                    onRejected={() => toast(t("layerNameInvalid"), "error")}
                                    onChange={(name) => update(t("hLayers"), (draft) => { draft.names[layer] = name; }, `name:${layer}`)}
                                />
                            )}
                        </label>
                    ))}
                </div>
            </section>

            <section>
                <div className="mb-1.5 flex items-center justify-between gap-2">
                    <h3 className="text-[10.5px] font-bold uppercase tracking-wider text-zinc-500">{t("collisionMatrix")}</h3>
                    <Button disabled={disabled || everything} onClick={() => update(t("hLayers"), (draft) => { draft.collisions = draft.collisions.map(() => ALL_LAYERS); }, "all")}>{t("collideAll")}</Button>
                </div>
                <div className="scrollbar-thin overflow-x-auto rounded-lg border border-white/[0.06] p-2">
                    <table className="border-separate border-spacing-0 text-[11px]">
                        <thead>
                            <tr>
                                <th />
                                {[...named].reverse().map((column) => (
                                    <th key={column.layer} className="h-24 w-6 align-bottom font-medium text-zinc-400" title={`${column.layer}: ${column.name}`}>
                                        <span className="mx-auto block max-h-24 truncate [writing-mode:vertical-rl] rotate-180">{column.name}</span>
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {named.map((row, rowIndex) => (
                                <tr key={row.layer}>
                                    <th className="max-w-[9rem] truncate pr-2 text-right font-medium text-zinc-300" title={`${row.layer}: ${row.name}`}>{row.name}</th>
                                    {[...named].reverse().map((column, columnIndex) => {
                                        // Upper-left triangle like Unity: each pair once.
                                        const visible = columnIndex < named.length - rowIndex;
                                        const checked = layersCollide(layers.collisions, row.layer, column.layer);
                                        return (
                                            <td key={column.layer} className="h-6 w-6 text-center">
                                                {visible ? (
                                                    <input
                                                        type="checkbox"
                                                        checked={checked}
                                                        disabled={disabled}
                                                        aria-label={`${row.name} × ${column.name}`}
                                                        title={`${row.name} × ${column.name}`}
                                                        onChange={(event) => update(t("hLayers"), (draft) => setLayerCollision(draft.collisions, row.layer, column.layer, event.target.checked), `pair:${row.layer}:${column.layer}`)}
                                                        className="h-3.5 w-3.5 cursor-pointer accent-indigo-400"
                                                    />
                                                ) : null}
                                            </td>
                                        );
                                    })}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <p className="mt-1.5 flex gap-1.5 text-[11px] leading-snug text-zinc-500"><Layers className="mt-0.5 h-3.5 w-3.5 shrink-0" />{t("collisionMatrixHint")}</p>
            </section>
        </div>
    );
}
