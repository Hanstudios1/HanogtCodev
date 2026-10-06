"use client";

import { Camera, CheckCircle2, ExternalLink, Globe, LoaderCircle, Rocket, Settings2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { GameProjectDocument, ProjectSettings } from "@/lib/game-engine/types";
import { useEditor } from "./context";
import { activeScene, touch } from "./operations";
import { InputSettingsPanel } from "./InputSettings";
import { LocalizationPanel } from "./LocalizationPanel";
import { publishProject, unpublishProject } from "./persistence";
import { useEditorState } from "./store";
import { Button, ColorInput, FieldRow, Modal, NumberInput, SelectInput, SliderInput, TabButton, TextInput, Toggle, VectorInput } from "./ui";

export type SettingsTab = "project" | "input" | "languages" | "scene";

export function SettingsDialog({ open, onClose, tab, onTabChange }: { open: boolean; onClose: () => void; tab: SettingsTab; onTabChange: (tab: SettingsTab) => void }) {
    const { store, t, playing } = useEditor();
    const project = useEditorState(store, (state) => state.project);
    const scene = activeScene(project);
    const effects = scene.settings.postProcessing;
    const grading = effects.colorGrading;
    const setTab = onTabChange;
    const disabled = playing;

    const setProject = (label: string, recipe: (draft: GameProjectDocument) => void, key: string) => store.update(label, (draft) => {
        recipe(draft);
        touch(draft);
    }, { mergeKey: `settings:${key}` });
    const setSetting = <K extends keyof ProjectSettings>(key: K, value: ProjectSettings[K]) => setProject(t("projectSettings"), (draft) => { draft.settings[key] = value; }, key);
    const setScene = (key: string, recipe: (settings: GameProjectDocument["scenes"][number]["settings"]) => void) => setProject(t("sceneSettings"), (draft) => { recipe(activeScene(draft).settings); }, `scene:${key}`);
    const setInput = (key: string, recipe: (input: ProjectSettings["input"]) => void) => setProject(t("inputSettings"), (draft) => { recipe(draft.settings.input); }, `input:${key}`);

    return (
        <Modal open={open} onClose={onClose} title={t("settings")} icon={Settings2} width={tab === "languages" ? "max-w-4xl" : "max-w-xl"} footer={<Button variant="primary" onClick={onClose}>{t("ok")}</Button>}>
            <div className="mb-3 flex flex-wrap gap-1">
                <TabButton active={tab === "project"} onClick={() => setTab("project")}>{t("projectSettings")}</TabButton>
                <TabButton active={tab === "input"} onClick={() => setTab("input")}>{t("inputSettings")}</TabButton>
                <TabButton active={tab === "languages"} onClick={() => setTab("languages")} count={project.settings.localization.languages.length || undefined}>{t("languagesTab")}</TabButton>
                <TabButton active={tab === "scene"} onClick={() => setTab("scene")}>{t("sceneSettings")} · {scene.name}</TabButton>
            </div>
            {tab === "input" ? (
                <InputSettingsPanel input={project.settings.input} disabled={disabled} onEdit={setInput} />
            ) : tab === "languages" ? (
                <LocalizationPanel disabled={disabled} />
            ) : tab === "project" ? (
                <div className="space-y-1">
                    <FieldRow label={t("projectName")}><TextInput value={project.name} maxLength={80} disabled={disabled} onChange={(value) => value.trim() && setProject(t("projectName"), (draft) => { draft.name = value.trim().slice(0, 80); }, "name")} /></FieldRow>
                    <FieldRow label={t("description")}><TextInput multiline value={project.description} maxLength={500} disabled={disabled} onChange={(value) => setProject(t("description"), (draft) => { draft.description = value.slice(0, 500); }, "description")} /></FieldRow>
                    <FieldRow label={t("startScene")}>
                        <SelectInput value={project.settings.startSceneId} disabled={disabled} onChange={(value) => setSetting("startSceneId", value)} options={project.scenes.map((item, index) => ({ value: item.id, label: `${index}: ${item.name}` }))} />
                    </FieldRow>
                    <FieldRow label={t("aspect")}>
                        <SelectInput value={project.settings.aspect} disabled={disabled} onChange={(value) => setSetting("aspect", value)} options={[
                            { value: "free", label: "Serbest (tam ekran)" },
                            { value: "16:9", label: "16:9 yatay" },
                            { value: "4:3", label: "4:3" },
                            { value: "9:16", label: "9:16 dikey (mobil)" },
                            { value: "1:1", label: "1:1 kare" },
                        ]} />
                    </FieldRow>
                    <FieldRow label={t("shadows")}><Toggle checked={project.settings.shadows} disabled={disabled} onChange={(value) => setSetting("shadows", value)} /></FieldRow>
                    <FieldRow label={t("antialias")}><Toggle checked={project.settings.antialias} disabled={disabled} onChange={(value) => setSetting("antialias", value)} /></FieldRow>
                    <FieldRow label={t("pixelArt")}><Toggle checked={project.settings.pixelArt} disabled={disabled} onChange={(value) => setSetting("pixelArt", value)} /></FieldRow>
                    <FieldRow label={t("fps")}><Toggle checked={project.settings.showFps} disabled={disabled} onChange={(value) => setSetting("showFps", value)} /></FieldRow>
                    <FieldRow label={t("touchControls")}><Toggle checked={project.settings.touchControls} disabled={disabled} onChange={(value) => setSetting("touchControls", value)} /></FieldRow>
                </div>
            ) : (
                <div className="space-y-1">
                    <FieldRow label={t("background")}>
                        <SelectInput value={scene.settings.background.mode} disabled={disabled} onChange={(value) => setScene("bgMode", (settings) => { settings.background.mode = value; })} options={[{ value: "solid", label: t("solid") }, { value: "gradient", label: t("gradient") }]} />
                    </FieldRow>
                    <FieldRow label={scene.settings.background.mode === "gradient" ? t("bottomColor") : t("background")}>
                        <ColorInput value={scene.settings.background.color} disabled={disabled} onChange={(value) => setScene("bgColor", (settings) => { settings.background.color = value; })} />
                    </FieldRow>
                    {scene.settings.background.mode === "gradient" ? (
                        <FieldRow label={t("topColor")}><ColorInput value={scene.settings.background.topColor} disabled={disabled} onChange={(value) => setScene("bgTop", (settings) => { settings.background.topColor = value; })} /></FieldRow>
                    ) : null}
                    <FieldRow label={t("ambient")}>
                        <div className="grid grid-cols-[1fr_1fr] gap-2">
                            <ColorInput value={scene.settings.ambientColor} disabled={disabled} onChange={(value) => setScene("ambientColor", (settings) => { settings.ambientColor = value; })} />
                            <SliderInput value={scene.settings.ambientIntensity} min={0} max={3} disabled={disabled} onChange={(value) => setScene("ambient", (settings) => { settings.ambientIntensity = value; })} />
                        </div>
                    </FieldRow>
                    <p className="pb-0.5 pt-2 text-[10.5px] font-bold uppercase tracking-wider text-zinc-500">{t("environment")}</p>
                    <FieldRow label={t("fog")}><Toggle checked={scene.settings.fog.enabled} disabled={disabled} onChange={(value) => setScene("fog", (settings) => { settings.fog.enabled = value; })} /></FieldRow>
                    {scene.settings.fog.enabled ? (
                        <>
                            <FieldRow label={t("fogMode")}>
                                <SelectInput value={scene.settings.fog.mode} disabled={disabled} onChange={(value) => setScene("fogMode", (settings) => { settings.fog.mode = value; })} options={[{ value: "linear", label: t("fogLinear") }, { value: "exponential", label: t("fogExponential") }]} />
                            </FieldRow>
                            <FieldRow label="Fog Color"><ColorInput value={scene.settings.fog.color} disabled={disabled} onChange={(value) => setScene("fogColor", (settings) => { settings.fog.color = value; })} /></FieldRow>
                            {scene.settings.fog.mode === "exponential" ? (
                                <FieldRow label={t("fogDensity")}><SliderInput value={scene.settings.fog.density} min={0} max={0.2} step={0.001} disabled={disabled} onChange={(value) => setScene("fogDensity", (settings) => { settings.fog.density = value; })} /></FieldRow>
                            ) : (
                                <FieldRow label="Fog Near / Far">
                                    <div className="grid grid-cols-2 gap-1">
                                        <NumberInput value={scene.settings.fog.near} min={0} step={1} disabled={disabled} onChange={(value) => setScene("fogNear", (settings) => { settings.fog.near = value; })} />
                                        <NumberInput value={scene.settings.fog.far} min={0.1} step={1} disabled={disabled} onChange={(value) => setScene("fogFar", (settings) => { settings.fog.far = value; })} />
                                    </div>
                                </FieldRow>
                            )}
                        </>
                    ) : null}
                    <p className="pb-0.5 pt-2 text-[10.5px] font-bold uppercase tracking-wider text-zinc-500">{t("screenEffects")}</p>
                    <FieldRow label={t("bloom")}><Toggle checked={scene.settings.postProcessing.bloom.enabled} disabled={disabled} onChange={(value) => setScene("bloom", (settings) => { settings.postProcessing.bloom.enabled = value; })} /></FieldRow>
                    {scene.settings.postProcessing.bloom.enabled ? (
                        <>
                            <FieldRow label={t("bloomIntensity")}><SliderInput value={scene.settings.postProcessing.bloom.intensity} min={0} max={3} disabled={disabled} onChange={(value) => setScene("bloomIntensity", (settings) => { settings.postProcessing.bloom.intensity = value; })} /></FieldRow>
                            <FieldRow label={t("bloomThreshold")}><SliderInput value={scene.settings.postProcessing.bloom.threshold} min={0} max={1.5} disabled={disabled} onChange={(value) => setScene("bloomThreshold", (settings) => { settings.postProcessing.bloom.threshold = value; })} /></FieldRow>
                            <FieldRow label={t("bloomRadius")}><SliderInput value={scene.settings.postProcessing.bloom.radius} min={0} max={1} disabled={disabled} onChange={(value) => setScene("bloomRadius", (settings) => { settings.postProcessing.bloom.radius = value; })} /></FieldRow>
                        </>
                    ) : null}
                    <FieldRow label={t("vignette")}><Toggle checked={scene.settings.postProcessing.vignette.enabled} disabled={disabled} onChange={(value) => setScene("vignette", (settings) => { settings.postProcessing.vignette.enabled = value; })} /></FieldRow>
                    {scene.settings.postProcessing.vignette.enabled ? (
                        <FieldRow label={t("vignetteIntensity")}><SliderInput value={scene.settings.postProcessing.vignette.intensity} min={0} max={1} disabled={disabled} onChange={(value) => setScene("vignetteIntensity", (settings) => { settings.postProcessing.vignette.intensity = value; })} /></FieldRow>
                    ) : null}
                    <FieldRow label={t("exposure")}><SliderInput value={scene.settings.postProcessing.exposure} min={0.2} max={3} disabled={disabled} onChange={(value) => setScene("exposure", (settings) => { settings.postProcessing.exposure = value; })} /></FieldRow>
                    <FieldRow label={t("colorGrading")}><Toggle checked={grading.enabled} disabled={disabled} onChange={(value) => setScene("grading", (settings) => { settings.postProcessing.colorGrading.enabled = value; })} /></FieldRow>
                    {grading.enabled ? (
                        <>
                            <FieldRow label={t("saturation")}><SliderInput value={grading.saturation} min={-1} max={1} disabled={disabled} onChange={(value) => setScene("saturation", (settings) => { settings.postProcessing.colorGrading.saturation = value; })} /></FieldRow>
                            <FieldRow label={t("contrast")}><SliderInput value={grading.contrast} min={-1} max={1} disabled={disabled} onChange={(value) => setScene("contrast", (settings) => { settings.postProcessing.colorGrading.contrast = value; })} /></FieldRow>
                            <FieldRow label={t("brightness")}><SliderInput value={grading.brightness} min={-1} max={1} disabled={disabled} onChange={(value) => setScene("brightness", (settings) => { settings.postProcessing.colorGrading.brightness = value; })} /></FieldRow>
                            <FieldRow label={t("hue")}><SliderInput value={grading.hue} min={-180} max={180} step={1} disabled={disabled} onChange={(value) => setScene("hue", (settings) => { settings.postProcessing.colorGrading.hue = value; })} /></FieldRow>
                            <FieldRow label={t("tint")}>
                                <div className="grid grid-cols-[1fr_1fr] gap-2">
                                    <ColorInput value={grading.tint} disabled={disabled} onChange={(value) => setScene("tint", (settings) => { settings.postProcessing.colorGrading.tint = value; })} />
                                    <SliderInput value={grading.tintAmount} min={0} max={1} disabled={disabled} onChange={(value) => setScene("tintAmount", (settings) => { settings.postProcessing.colorGrading.tintAmount = value; })} />
                                </div>
                            </FieldRow>
                        </>
                    ) : null}
                    <FieldRow label={t("chromaticAberration")}><Toggle checked={effects.chromaticAberration.enabled} disabled={disabled} onChange={(value) => setScene("aberration", (settings) => { settings.postProcessing.chromaticAberration.enabled = value; })} /></FieldRow>
                    {effects.chromaticAberration.enabled ? (
                        <FieldRow label={t("effectIntensity")}><SliderInput value={effects.chromaticAberration.intensity} min={0} max={1} disabled={disabled} onChange={(value) => setScene("aberrationIntensity", (settings) => { settings.postProcessing.chromaticAberration.intensity = value; })} /></FieldRow>
                    ) : null}
                    <FieldRow label={t("pixelate")}><Toggle checked={effects.pixelate.enabled} disabled={disabled} onChange={(value) => setScene("pixelate", (settings) => { settings.postProcessing.pixelate.enabled = value; })} /></FieldRow>
                    {effects.pixelate.enabled ? (
                        <FieldRow label={t("pixelSize")}><SliderInput value={effects.pixelate.size} min={2} max={32} integer disabled={disabled} onChange={(value) => setScene("pixelSize", (settings) => { settings.postProcessing.pixelate.size = Math.round(value); })} /></FieldRow>
                    ) : null}
                    <FieldRow label={t("crt")}><Toggle checked={effects.crt.enabled} disabled={disabled} onChange={(value) => setScene("crt", (settings) => { settings.postProcessing.crt.enabled = value; })} /></FieldRow>
                    {effects.crt.enabled ? (
                        <>
                            <FieldRow label={t("scanlines")}><SliderInput value={effects.crt.scanlines} min={0} max={1} disabled={disabled} onChange={(value) => setScene("scanlines", (settings) => { settings.postProcessing.crt.scanlines = value; })} /></FieldRow>
                            <FieldRow label={t("curvature")}><SliderInput value={effects.crt.curvature} min={0} max={1} disabled={disabled} onChange={(value) => setScene("curvature", (settings) => { settings.postProcessing.crt.curvature = value; })} /></FieldRow>
                        </>
                    ) : null}
                    <p className="pt-1 text-[11px] leading-snug text-zinc-500">{t("screenEffectsHint")}</p>
                    <p className="pb-0.5 pt-2 text-[10.5px] font-bold uppercase tracking-wider text-zinc-500">Physics</p>
                    <FieldRow label={t("gravity")}>
                        <VectorInput value={scene.settings.physics.gravity} hideZ={project.dimension === "2d"} disabled={disabled} onChange={(value) => setScene("gravity", (settings) => { settings.physics.gravity = project.dimension === "2d" ? { ...value, z: 0 } : value; })} />
                    </FieldRow>
                    <FieldRow label={t("fixedStep")}>
                        <SelectInput value={String(Math.round(1 / scene.settings.physics.fixedTimeStep))} disabled={disabled} onChange={(value) => setScene("fixedStep", (settings) => { settings.physics.fixedTimeStep = 1 / Number(value); })} options={[{ value: "30", label: "30 Hz" }, { value: "50", label: "50 Hz (Unity)" }, { value: "60", label: "60 Hz" }, { value: "120", label: "120 Hz" }]} />
                    </FieldRow>
                    <FieldRow label="Max Sub Steps"><NumberInput value={scene.settings.physics.maxSubSteps} min={1} max={16} integer step={1} disabled={disabled} onChange={(value) => setScene("substeps", (settings) => { settings.physics.maxSubSteps = value; })} /></FieldRow>
                </div>
            )}
        </Modal>
    );
}

async function shrinkSnapshot(dataUrl: string): Promise<string | null> {
    if (!dataUrl) return null;
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error("snapshot"));
        image.src = dataUrl;
    });
    const width = 480;
    const height = Math.round(width * (image.height / Math.max(1, image.width)));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = Math.min(height, 360);
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.drawImage(image, 0, 0, width, height);
    return canvas.toDataURL("image/jpeg", 0.72);
}

export async function captureThumbnail(snapshot: (() => string) | undefined): Promise<string | null> {
    try {
        return snapshot ? await shrinkSnapshot(snapshot()) : null;
    } catch {
        return null;
    }
}

export function PublishDialog({ open, onClose, source, arcadeId, onPublished, onSaveFirst, snapshot }: {
    open: boolean;
    onClose: () => void;
    source: "cloud" | "local";
    arcadeId: string | null;
    onPublished: (arcadeId: string | null) => void;
    onSaveFirst: () => Promise<boolean>;
    snapshot: (() => string) | undefined;
}) {
    const { store, t, toast } = useEditor();
    const project = useEditorState(store, (state) => state.project);
    const [title, setTitle] = useState(project.name);
    const [description, setDescription] = useState(project.description);
    const [thumbnail, setThumbnail] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [allowRemix, setAllowRemix] = useState(false);

    // A published game keeps its remix setting; read it so republishing doesn't change it by accident.
    useEffect(() => {
        if (!open || !arcadeId) return;
        const controller = new AbortController();
        fetch(`/api/arcade/${encodeURIComponent(arcadeId)}`, { signal: controller.signal, cache: "no-store" })
            .then((response) => (response.ok ? response.json() : null))
            .then((payload: { game?: { allowRemix?: unknown } } | null) => {
                if (payload?.game) setAllowRemix(payload.game.allowRemix === true);
            })
            .catch(() => undefined);
        return () => controller.abort();
    }, [arcadeId, open]);

    const publish = async () => {
        setBusy(true);
        try {
            if (!(await onSaveFirst())) throw new Error(t("saveFailed"));
            const image = thumbnail ?? await captureThumbnail(snapshot);
            const result = await publishProject(project.id, { title: title.trim() || project.name, description: description.trim(), thumbnail: image, allowRemix });
            onPublished(result.arcadeId);
            toast(`${t("publishedAt")} 🎉`, "success");
        } catch (error) {
            toast(error instanceof Error ? error.message : t("publishFailed"), "error");
        } finally {
            setBusy(false);
        }
    };

    const unpublish = async () => {
        setBusy(true);
        try {
            await unpublishProject(project.id);
            onPublished(null);
            toast(t("unpublish"), "info");
        } catch (error) {
            toast(error instanceof Error ? error.message : t("actionFailed"), "error");
        } finally {
            setBusy(false);
        }
    };

    return (
        <Modal open={open} onClose={onClose} title={t("publish")} icon={Rocket} footer={source === "cloud" ? (
            <>
                {arcadeId ? <Button variant="danger" disabled={busy} onClick={() => void unpublish()}>{t("unpublish")}</Button> : null}
                <Button variant="primary" disabled={busy} onClick={() => void publish()}>{busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Globe className="h-4 w-4" />}{arcadeId ? t("updatePublished") : t("publishNow")}</Button>
            </>
        ) : <Button onClick={onClose}>{t("close")}</Button>}>
            {source !== "cloud" ? (
                <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-[13px] leading-relaxed text-amber-100">{t("publishNeedsCloud")}</p>
            ) : (
                <div className="space-y-3">
                    {arcadeId ? (
                        <div className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-[13px] text-emerald-100">
                            <CheckCircle2 className="h-4 w-4 shrink-0" />
                            <span className="flex-1">{t("publishedAt")}</span>
                            <Link href={`/arcade/${arcadeId}`} target="_blank" className="inline-flex items-center gap-1 font-semibold underline-offset-2 hover:underline">{t("viewInArcade")}<ExternalLink className="h-3.5 w-3.5" /></Link>
                        </div>
                    ) : null}
                    <FieldRow label={t("publishTitle")}><TextInput value={title} maxLength={80} onChange={setTitle} commitOnBlur={false} /></FieldRow>
                    <FieldRow label={t("publishDescription")}><TextInput multiline value={description} maxLength={500} onChange={setDescription} commitOnBlur={false} /></FieldRow>
                    <FieldRow label={t("thumbnail")}>
                        <div className="flex items-center gap-2">
                            {thumbnail ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={thumbnail} alt="" className="h-16 w-28 rounded-lg border border-white/10 object-cover" />
                            ) : <div className="grid h-16 w-28 place-items-center rounded-lg border border-dashed border-white/15 text-[10px] text-zinc-500">Otomatik</div>}
                            <Button onClick={async () => setThumbnail(await captureThumbnail(snapshot))}><Camera className="h-4 w-4" />{t("captureThumbnail")}</Button>
                        </div>
                    </FieldRow>
                    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                        <label className="flex cursor-pointer items-center justify-between gap-3">
                            <span className="text-[13px] font-semibold text-zinc-200">{t("allowRemix")}</span>
                            <Toggle checked={allowRemix} onChange={setAllowRemix} disabled={busy} label={t("allowRemix")} />
                        </label>
                        <p className="mt-1.5 text-[11.5px] leading-relaxed text-zinc-500">{t("allowRemixHint")}</p>
                    </div>
                    <p className="text-[11.5px] leading-relaxed text-zinc-500">{t("publishNotice")}</p>
                </div>
            )}
        </Modal>
    );
}
