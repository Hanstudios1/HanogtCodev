"use client";

import {
    Box,
    Camera,
    Circle,
    Cone,
    Cylinder,
    Diamond,
    Grid3x3,
    Hexagon,
    LayoutTemplate,
    Lightbulb,
    MousePointerClick,
    PanelTop,
    Pill,
    Sparkles,
    Square,
    Star,
    Sun,
    Torus,
    Triangle,
    Type,
    Volume2,
    Zap,
    type LucideIcon,
} from "lucide-react";
import { createContext, useContext } from "react";
import type { EntityPreset } from "@/lib/game-engine/scene";
import type { CompiledProgram } from "@/lib/game-engine/script/compiler";
import type { GameDimension, GameEntity } from "@/lib/game-engine/types";
import type { LogEntry } from "@/lib/game-engine/runtime/world";
import type { EditorStore } from "./store";
import type { TextKey } from "./text";
import type { TilePainterStore } from "./tile-painter";
import type { MenuItem } from "./ui";

export interface ConsoleEntry extends LogEntry {
    /** Editor-side entries (compile errors) are not tied to a frame. */
    origin: "game" | "editor";
}

export interface EditorContextValue {
    store: EditorStore;
    t: (key: TextKey) => string;
    locale: "tr" | "en";
    toast: (text: string, tone?: "info" | "success" | "error") => void;
    program: CompiledProgram;
    playing: boolean;
    openScript: (scriptId: string, line?: number) => void;
    focusEntity: (id: string) => void;
    createAt: () => { x: number; y: number; z: number };
    tilePainter: TilePainterStore;
}

export const EditorContext = createContext<EditorContextValue | null>(null);

export function useEditor(): EditorContextValue {
    const value = useContext(EditorContext);
    if (!value) throw new Error("useEditor must be used inside the engine editor.");
    return value;
}

export function entityIcon(entity: GameEntity): { icon: LucideIcon; className: string } {
    const types = new Set(entity.components.map((component) => component.type));
    if (types.has("camera")) return { icon: Camera, className: "text-sky-400" };
    const light = entity.components.find((component) => component.type === "light");
    if (light?.type === "light") return light.lightType === "directional" ? { icon: Sun, className: "text-amber-300" } : light.lightType === "spot" ? { icon: Zap, className: "text-amber-300" } : { icon: Lightbulb, className: "text-amber-300" };
    if (types.has("particleSystem")) return { icon: Sparkles, className: "text-pink-400" };
    if (types.has("tilemap")) return { icon: Grid3x3, className: "text-lime-300" };
    if (types.has("uiButton")) return { icon: MousePointerClick, className: "text-violet-300" };
    if (types.has("uiProgressBar")) return { icon: LayoutTemplate, className: "text-violet-300" };
    if (types.has("uiPanel")) return { icon: PanelTop, className: "text-violet-300" };
    if (types.has("uiText")) return { icon: Type, className: "text-violet-300" };
    const mesh = entity.components.find((component) => component.type === "meshRenderer");
    if (mesh?.type === "meshRenderer") {
        const icons: Record<string, LucideIcon> = { cube: Box, sphere: Circle, plane: Square, capsule: Pill, cylinder: Cylinder, cone: Cone, torus: Torus };
        return { icon: icons[mesh.mesh] ?? Box, className: "text-indigo-300" };
    }
    const sprite = entity.components.find((component) => component.type === "spriteRenderer");
    if (sprite?.type === "spriteRenderer") {
        const icons: Record<string, LucideIcon> = { square: Square, roundedSquare: Square, circle: Circle, triangle: Triangle, diamond: Diamond, hexagon: Hexagon, star: Star };
        return { icon: icons[sprite.shape] ?? Square, className: "text-emerald-300" };
    }
    if (types.has("audioSource")) return { icon: Volume2, className: "text-teal-300" };
    return { icon: Box, className: "text-zinc-500" };
}

export function createMenuItems(dimension: GameDimension, t: (key: TextKey) => string, onCreate: (preset: EntityPreset) => void): MenuItem[] {
    const item = (label: string, preset: EntityPreset, icon: LucideIcon): MenuItem => ({ label, icon, onSelect: () => onCreate(preset) });
    const shapes2D: MenuItem[] = [
        item(t("spriteSquare"), "sprite", Square),
        item(t("spriteCircle"), "circleSprite", Circle),
        item("Tilemap", "tilemap", Grid3x3),
    ];
    const shapes3D: MenuItem[] = [
        item("Cube", "cube", Box),
        item("Sphere", "sphere", Circle),
        item("Plane", "plane", Square),
        item("Capsule", "capsule", Pill),
        item("Cylinder", "cylinder", Cylinder),
        item("Cone", "cone", Cone),
        item("Torus", "torus", Torus),
    ];
    return [
        item(t("emptyObject"), "empty", Box),
        { separator: true, label: "" },
        ...(dimension === "2d" ? shapes2D : [{ label: "3D", icon: Box, items: shapes3D } as MenuItem, { label: "2D", icon: Square, items: shapes2D } as MenuItem]),
        ...(dimension === "2d" ? [{ label: "3D", icon: Box, items: shapes3D } as MenuItem] : []),
        { separator: true, label: "" },
        item("Camera", "camera", Camera),
        {
            label: "Light",
            icon: Sun,
            items: [
                item("Directional Light", "directionalLight", Sun),
                item("Point Light", "pointLight", Lightbulb),
                item("Spot Light", "spotLight", Zap),
            ],
        },
        item("Particle System", "particles", Sparkles),
        {
            label: "UI",
            icon: PanelTop,
            items: [
                item("Text", "text", Type),
                item("Button", "button", MousePointerClick),
                item("Panel / Image", "panel", PanelTop),
                item("Progress Bar", "progressBar", LayoutTemplate),
            ],
        },
        item("Audio Source", "audio", Volume2),
    ];
}
