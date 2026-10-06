/**
 * What a starter project contains (scripts, objects, components), read from
 * the project itself so the hub never lists a feature a template doesn't use.
 */
import type { ComponentType, GameProjectDocument } from "@/lib/game-engine/types";

export interface TemplateScriptFact {
    name: string;
    language: "C#" | "C++";
    lines: number;
    content: string;
}

export interface TemplateFacts {
    scripts: TemplateScriptFact[];
    lines: number;
    objects: number;
    prefabs: number;
    scenes: number;
    components: string[];
}

const COMPONENT_NAMES: Partial<Record<ComponentType, [string, string]>> = {
    spriteRenderer: ["Sprite Renderer", "Sprite Renderer"],
    meshRenderer: ["Mesh Renderer", "Mesh Renderer"],
    camera: ["Camera", "Camera"],
    light: ["Light", "Light"],
    rigidBody: ["Rigidbody2D", "Rigidbody"],
    collider: ["Collider2D", "Collider"],
    particleSystem: ["Particle System", "Particle System"],
    audioSource: ["Audio Source", "Audio Source"],
    tilemap: ["Tilemap", "Tilemap"],
    animation: ["Animation", "Animation"],
    animator: ["Animator", "Animator"],
    uiText: ["Text", "Text"],
    uiButton: ["Button", "Button"],
    uiPanel: ["Panel", "Panel"],
    uiProgressBar: ["Slider", "Slider"],
    characterController2D: ["CharacterController2D", "CharacterController2D"],
    cameraFollow: ["CameraFollow", "CameraFollow"],
    navAgent2D: ["NavAgent2D", "NavAgent2D"],
    joint: ["Joint2D", "Joint"],
    uiSlider: ["Slider", "Slider"],
    uiToggle: ["Toggle", "Toggle"],
    uiInputField: ["InputField", "InputField"],
};

const ORDER = Object.keys(COMPONENT_NAMES) as ComponentType[];

export function templateFacts(project: GameProjectDocument): TemplateFacts {
    const scripts = project.scripts.map((script) => ({
        name: script.name,
        language: script.language === "cpp" ? "C++" as const : "C#" as const,
        lines: script.content.trimEnd().split("\n").length,
        content: script.content,
    }));
    const entities = [...project.scenes.flatMap((scene) => scene.objects), ...project.prefabs.flatMap((prefab) => prefab.entities)];
    const used = new Set(entities.flatMap((entity) => entity.components.map((component) => component.type)));
    const index = project.dimension === "2d" ? 0 : 1;
    return {
        scripts,
        lines: scripts.reduce((sum, script) => sum + script.lines, 0),
        objects: project.scenes.reduce((sum, scene) => sum + scene.objects.length, 0),
        prefabs: project.prefabs.length,
        scenes: project.scenes.length,
        components: ORDER.filter((type) => used.has(type)).map((type) => (COMPONENT_NAMES[type] as [string, string])[index]),
    };
}
