"use client";

/** Inspector editors of the V4 components: Character Controller 2D and Camera Follow. */
import { Wrench } from "lucide-react";
import { createCollider, createRigidBody } from "@/lib/game-engine/components";
import type { CameraFollowComponent, CharacterController2DComponent, GameEntity, JointComponent, NavAgent2DComponent } from "@/lib/game-engine/types";
import { useEditor } from "./context";
import { useComponentEdit, type Editor } from "./inspector-fields";
import { activeScene, findEntity, touch } from "./operations";
import { useEditorState } from "./store";
import { Button, ColorInput, FieldRow, NumberInput, SelectInput, SliderInput, Toggle, VectorInput } from "./ui";

function Hint({ children }: { children: string }) {
    return <p className="mb-1.5 rounded-md bg-white/[0.03] px-2 py-1.5 text-[11px] leading-relaxed text-zinc-400">{children}</p>;
}

function Warning({ children, action }: { children: string; action?: { label: string; onClick: () => void; disabled?: boolean } }) {
    return (
        <div role="status" className="mb-1.5 flex items-start gap-2 rounded-md border border-amber-400/25 bg-amber-500/10 px-2 py-1.5 text-[11px] leading-relaxed text-amber-200">
            <span className="min-w-0 flex-1">{children}</span>
            {action ? <Button className="h-6 shrink-0 px-2 text-[11px]" disabled={action.disabled} onClick={action.onClick}><Wrench className="h-3 w-3" />{action.label}</Button> : null}
        </div>
    );
}

function actionOptions(names: string[], current: string) {
    const list = names.includes(current) ? names : [current, ...names];
    return list.map((name) => ({ value: name, label: name }));
}

export function CharacterController2DEditor({ entity, component, disabled }: Editor<CharacterController2DComponent>) {
    const { store, t } = useEditor();
    const project = useEditorState(store, (state) => state.project);
    const edit = useComponentEdit(entity.id, component);
    const rigidBody = entity.components.find((item) => item.type === "rigidBody");
    const collider = entity.components.find((item) => item.type === "collider");
    const ready = rigidBody?.type === "rigidBody" && rigidBody.enabled && rigidBody.bodyType === "dynamic" && Boolean(collider);
    const axes = project.settings.input.actions.filter((action) => action.kind === "axis").map((action) => action.name);
    const buttons = project.settings.input.actions.map((action) => action.name);

    const fix = () => store.update(t("ccFix"), (draft) => {
        const target = findEntity(draft, entity.id);
        if (!target) return;
        const body = target.components.find((item) => item.type === "rigidBody");
        if (body?.type === "rigidBody") {
            body.enabled = true;
            body.bodyType = "dynamic";
            body.freezeRotation = true;
        } else {
            target.components.push(createRigidBody({ freezePosition: { x: false, y: false, z: true }, freezeRotation: true }));
        }
        if (!target.components.some((item) => item.type === "collider")) target.components.push(createCollider({ size: { x: 0.9, y: 1, z: 1 } }));
        touch(draft);
    });

    return (
        <div className="space-y-0.5" data-cc2d-editor>
            {project.dimension === "3d" ? <Warning>{t("ccOnly2D")}</Warning> : null}
            {!ready ? <Warning action={{ label: t("ccFixShort"), onClick: fix, disabled }}>{t("ccNeedsBody")}</Warning> : <Hint>{t("ccHint")}</Hint>}
            <FieldRow label="Move Speed"><NumberInput value={component.moveSpeed} min={0} max={200} step={0.5} disabled={disabled} onChange={(value) => edit("moveSpeed", (draft) => { draft.moveSpeed = value; })} /></FieldRow>
            <FieldRow label="Acceleration"><NumberInput value={component.acceleration} min={0} max={10000} step={5} disabled={disabled} onChange={(value) => edit("acceleration", (draft) => { draft.acceleration = value; })} /></FieldRow>
            <FieldRow label="Deceleration"><NumberInput value={component.deceleration} min={0} max={10000} step={5} disabled={disabled} onChange={(value) => edit("deceleration", (draft) => { draft.deceleration = value; })} /></FieldRow>
            <FieldRow label="Air Control"><SliderInput value={component.airControl} min={0} max={1} disabled={disabled} onChange={(value) => edit("airControl", (draft) => { draft.airControl = value; })} /></FieldRow>
            <p className="pb-0.5 pt-2 text-[10.5px] font-bold uppercase tracking-wider text-zinc-500">{t("ccJumping")}</p>
            <FieldRow label="Jump Height"><NumberInput value={component.jumpHeight} min={0} max={200} step={0.25} disabled={disabled} onChange={(value) => edit("jumpHeight", (draft) => { draft.jumpHeight = value; })} /></FieldRow>
            <FieldRow label="Max Jumps" title={t("ccMaxJumps")}><NumberInput value={component.maxJumps} min={0} max={10} integer step={1} disabled={disabled} onChange={(value) => edit("maxJumps", (draft) => { draft.maxJumps = value; })} /></FieldRow>
            <FieldRow label="Coyote Time" title={t("ccCoyote")}><NumberInput value={component.coyoteTime} min={0} max={1} step={0.01} disabled={disabled} onChange={(value) => edit("coyoteTime", (draft) => { draft.coyoteTime = value; })} /></FieldRow>
            <FieldRow label="Jump Buffer" title={t("ccBuffer")}><NumberInput value={component.jumpBuffer} min={0} max={1} step={0.01} disabled={disabled} onChange={(value) => edit("jumpBuffer", (draft) => { draft.jumpBuffer = value; })} /></FieldRow>
            <FieldRow label="Variable Jump" title={t("ccVariable")}><Toggle checked={component.variableJump} disabled={disabled} onChange={(value) => edit("variableJump", (draft) => { draft.variableJump = value; })} /></FieldRow>
            <FieldRow label="Fall Gravity"><NumberInput value={component.fallGravity} min={0.1} max={10} step={0.1} disabled={disabled} onChange={(value) => edit("fallGravity", (draft) => { draft.fallGravity = value; })} /></FieldRow>
            <FieldRow label="Max Fall Speed"><NumberInput value={component.maxFallSpeed} min={0.5} max={500} step={1} disabled={disabled} onChange={(value) => edit("maxFallSpeed", (draft) => { draft.maxFallSpeed = value; })} /></FieldRow>
            <FieldRow label="Max Slope" title={t("ccSlope")}><SliderInput value={component.maxSlope} min={0} max={89} step={1} disabled={disabled} onChange={(value) => edit("maxSlope", (draft) => { draft.maxSlope = value; })} /></FieldRow>
            <p className="pb-0.5 pt-2 text-[10.5px] font-bold uppercase tracking-wider text-zinc-500">{t("inputSettings")}</p>
            <FieldRow label="Use Input" title={t("ccUseInput")}><Toggle checked={component.useInput} disabled={disabled} onChange={(value) => edit("useInput", (draft) => { draft.useInput = value; })} /></FieldRow>
            {component.useInput ? (
                <>
                    <FieldRow label="Horizontal Action"><SelectInput value={component.horizontalAction} disabled={disabled} onChange={(value) => edit("horizontalAction", (draft) => { draft.horizontalAction = value; })} options={actionOptions(axes, component.horizontalAction)} /></FieldRow>
                    <FieldRow label="Jump Action"><SelectInput value={component.jumpAction} disabled={disabled} onChange={(value) => edit("jumpAction", (draft) => { draft.jumpAction = value; })} options={actionOptions(buttons, component.jumpAction)} /></FieldRow>
                </>
            ) : <Hint>{t("ccScripted")}</Hint>}
            <FieldRow label="Flip Sprite"><Toggle checked={component.flipSprite} disabled={disabled} onChange={(value) => edit("flipSprite", (draft) => { draft.flipSprite = value; })} /></FieldRow>
        </div>
    );
}

function vector2(value: { x: number; y: number }) {
    return { x: value.x, y: value.y, z: 0 };
}

export function CameraFollowEditor({ entity, component, disabled }: Editor<CameraFollowComponent>) {
    const { store, t } = useEditor();
    const project = useEditorState(store, (state) => state.project);
    const scene = activeScene(project);
    const edit = useComponentEdit(entity.id, component);
    const is2D = project.dimension === "2d";
    const hasCamera = entity.components.some((item) => item.type === "camera");
    const targets = scene.objects.filter((item: GameEntity) => item.id !== entity.id);
    const missing = component.targetId !== null && !targets.some((item) => item.id === component.targetId);

    return (
        <div className="space-y-0.5" data-camera-follow-editor>
            {!hasCamera ? <Warning>{t("followNeedsCamera")}</Warning> : <Hint>{t("followHint")}</Hint>}
            <FieldRow label="Target">
                <SelectInput
                    value={missing ? "" : component.targetId ?? ""}
                    disabled={disabled}
                    onChange={(value) => edit("target", (draft) => { draft.targetId = value || null; })}
                    options={[{ value: "", label: t("followPlayerTag") }, ...targets.map((item) => ({ value: item.id, label: item.name }))]}
                />
            </FieldRow>
            <FieldRow label="Offset"><VectorInput value={component.offset} hideZ={is2D} disabled={disabled} onChange={(value) => edit("offset", (draft) => { draft.offset = value; })} /></FieldRow>
            <FieldRow label="Smooth Time" title={t("followSmooth")}><NumberInput value={component.smoothTime} min={0} max={5} step={0.02} disabled={disabled} onChange={(value) => edit("smoothTime", (draft) => { draft.smoothTime = value; })} /></FieldRow>
            {is2D ? (
                <FieldRow label="Dead Zone" title={t("followDeadZone")}><VectorInput value={vector2(component.deadZone)} hideZ disabled={disabled} onChange={(value) => edit("deadZone", (draft) => { draft.deadZone = { x: Math.max(0, value.x), y: Math.max(0, value.y) }; })} /></FieldRow>
            ) : null}
            <FieldRow label="Look Ahead" title={t("followLookAhead")}><NumberInput value={component.lookAhead} min={0} max={100} step={0.25} disabled={disabled} onChange={(value) => edit("lookAhead", (draft) => { draft.lookAhead = value; })} /></FieldRow>
            <FieldRow label={is2D ? "Follow X" : "Follow X / Z"}><Toggle checked={component.followX} disabled={disabled} onChange={(value) => edit("followX", (draft) => { draft.followX = value; })} /></FieldRow>
            <FieldRow label="Follow Y"><Toggle checked={component.followY} disabled={disabled} onChange={(value) => edit("followY", (draft) => { draft.followY = value; })} /></FieldRow>
            {!is2D ? <FieldRow label="Look At Target"><Toggle checked={component.lookAtTarget} disabled={disabled} onChange={(value) => edit("lookAtTarget", (draft) => { draft.lookAtTarget = value; })} /></FieldRow> : null}
            <FieldRow label="Use Bounds" title={t("followBounds")}><Toggle checked={component.useBounds} disabled={disabled} onChange={(value) => edit("useBounds", (draft) => { draft.useBounds = value; })} /></FieldRow>
            {component.useBounds ? (
                <>
                    <FieldRow label={is2D ? "Bounds Min (X, Y)" : "Bounds Min (X, Z)"}><VectorInput value={vector2(component.boundsMin)} hideZ disabled={disabled} onChange={(value) => edit("boundsMin", (draft) => { draft.boundsMin = { x: value.x, y: value.y }; })} /></FieldRow>
                    <FieldRow label={is2D ? "Bounds Max (X, Y)" : "Bounds Max (X, Z)"}><VectorInput value={vector2(component.boundsMax)} hideZ disabled={disabled} onChange={(value) => edit("boundsMax", (draft) => { draft.boundsMax = { x: value.x, y: value.y }; })} /></FieldRow>
                </>
            ) : null}
        </div>
    );
}

export function NavAgent2DEditor({ entity, component, disabled }: Editor<NavAgent2DComponent>) {
    const { store, t } = useEditor();
    const project = useEditorState(store, (state) => state.project);
    const scene = activeScene(project);
    const edit = useComponentEdit(entity.id, component);
    const targets = scene.objects.filter((item: GameEntity) => item.id !== entity.id);
    const missing = component.targetId !== null && !targets.some((item) => item.id === component.targetId);

    return (
        <div className="space-y-0.5" data-nav-agent-editor>
            {project.dimension === "3d" ? <Warning>{t("navOnly2D")}</Warning> : <Hint>{t("navHint")}</Hint>}
            <FieldRow label="Target" title={t("navTarget")}>
                <SelectInput
                    value={missing ? "" : component.targetId ?? ""}
                    disabled={disabled}
                    onChange={(value) => edit("target", (draft) => { draft.targetId = value || null; })}
                    options={[{ value: "", label: t("navNoTarget") }, ...targets.map((item) => ({ value: item.id, label: item.name }))]}
                />
            </FieldRow>
            <FieldRow label="Speed"><NumberInput value={component.speed} min={0} max={200} step={0.25} disabled={disabled} onChange={(value) => edit("speed", (draft) => { draft.speed = value; })} /></FieldRow>
            <FieldRow label="Stopping Distance"><NumberInput value={component.stoppingDistance} min={0} max={100} step={0.05} disabled={disabled} onChange={(value) => edit("stoppingDistance", (draft) => { draft.stoppingDistance = value; })} /></FieldRow>
            <FieldRow label="Radius" title={t("navRadius")}><NumberInput value={component.radius} min={0} max={50} step={0.05} disabled={disabled} onChange={(value) => edit("radius", (draft) => { draft.radius = value; })} /></FieldRow>
            <FieldRow label="Repath Interval" title={t("navRepath")}><NumberInput value={component.repathInterval} min={0.05} max={10} step={0.05} disabled={disabled} onChange={(value) => edit("repathInterval", (draft) => { draft.repathInterval = value; })} /></FieldRow>
            <FieldRow label="Flip Sprite"><Toggle checked={component.flipSprite} disabled={disabled} onChange={(value) => edit("flipSprite", (draft) => { draft.flipSprite = value; })} /></FieldRow>
            <FieldRow label="Show Path" title={t("navShowPath")}><Toggle checked={component.showPath} disabled={disabled} onChange={(value) => edit("showPath", (draft) => { draft.showPath = value; })} /></FieldRow>
        </div>
    );
}

export function JointEditor({ entity, component, disabled }: Editor<JointComponent>) {
    const { store, t } = useEditor();
    const project = useEditorState(store, (state) => state.project);
    const scene = activeScene(project);
    const edit = useComponentEdit(entity.id, component);
    const is2D = project.dimension === "2d";
    const others = scene.objects.filter((item: GameEntity) => item.id !== entity.id);
    const missing = component.connectedId !== null && !others.some((item) => item.id === component.connectedId);
    const body = entity.components.find((item) => item.type === "rigidBody");
    const moves = body?.type === "rigidBody" && body.enabled && body.bodyType === "dynamic";
    const other = others.find((item) => item.id === component.connectedId);
    const otherBody = other?.components.find((item) => item.type === "rigidBody");
    const otherMoves = otherBody?.type === "rigidBody" && otherBody.enabled && otherBody.bodyType === "dynamic";

    return (
        <div className="space-y-0.5" data-joint-editor>
            {!moves && !otherMoves ? <Warning>{t("jointNeedsBody")}</Warning> : <Hint>{component.kind === "spring" ? t("jointSpringHint") : t("jointDistanceHint")}</Hint>}
            <FieldRow label="Type">
                <SelectInput value={component.kind} disabled={disabled} onChange={(value) => edit("kind", (draft) => { draft.kind = value; })} options={[{ value: "distance", label: is2D ? "Distance Joint 2D" : "Distance Joint" }, { value: "spring", label: is2D ? "Spring Joint 2D" : "Spring Joint" }]} />
            </FieldRow>
            <FieldRow label="Connected" title={t("jointConnected")}>
                <SelectInput
                    value={missing ? "" : component.connectedId ?? ""}
                    disabled={disabled}
                    onChange={(value) => edit("connected", (draft) => { draft.connectedId = value || null; })}
                    options={[{ value: "", label: t("jointWorldPoint") }, ...others.map((item) => ({ value: item.id, label: item.name }))]}
                />
            </FieldRow>
            <FieldRow label="Anchor"><VectorInput value={component.anchor} hideZ={is2D} disabled={disabled} onChange={(value) => edit("anchor", (draft) => { draft.anchor = value; })} /></FieldRow>
            <FieldRow label={component.connectedId ? "Connected Anchor" : t("jointWorldAnchor")}><VectorInput value={component.connectedAnchor} hideZ={is2D} disabled={disabled} onChange={(value) => edit("connectedAnchor", (draft) => { draft.connectedAnchor = value; })} /></FieldRow>
            <FieldRow label="Auto Distance" title={t("jointAuto")}><Toggle checked={component.autoDistance} disabled={disabled} onChange={(value) => edit("autoDistance", (draft) => { draft.autoDistance = value; })} /></FieldRow>
            {!component.autoDistance ? <FieldRow label="Distance"><NumberInput value={component.distance} min={0} max={10000} step={0.1} disabled={disabled} onChange={(value) => edit("distance", (draft) => { draft.distance = value; })} /></FieldRow> : null}
            {component.kind === "distance" ? (
                <FieldRow label="Max Distance Only" title={t("jointRope")}><Toggle checked={component.maxDistanceOnly} disabled={disabled} onChange={(value) => edit("maxDistanceOnly", (draft) => { draft.maxDistanceOnly = value; })} /></FieldRow>
            ) : (
                <>
                    <FieldRow label="Frequency" title={t("jointFrequency")}><NumberInput value={component.frequency} min={0.01} max={60} step={0.1} disabled={disabled} onChange={(value) => edit("frequency", (draft) => { draft.frequency = value; })} /></FieldRow>
                    <FieldRow label="Damping Ratio" title={t("jointDamping")}><SliderInput value={component.dampingRatio} min={0} max={1} disabled={disabled} onChange={(value) => edit("dampingRatio", (draft) => { draft.dampingRatio = value; })} /></FieldRow>
                </>
            )}
            <FieldRow label="Show Line"><Toggle checked={component.showLine} disabled={disabled} onChange={(value) => edit("showLine", (draft) => { draft.showLine = value; })} /></FieldRow>
            {component.showLine ? <FieldRow label="Line Color"><ColorInput value={component.lineColor} disabled={disabled} onChange={(value) => edit("lineColor", (draft) => { draft.lineColor = value; })} /></FieldRow> : null}
        </div>
    );
}
