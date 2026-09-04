import { createCamera, createCollider, createLight, createMeshRenderer, createRigidBody, createSpriteRenderer } from "./components";
import { createEntity, createScene, createTransform } from "./scene";
import type { GameDimension, SceneDocument } from "./types";
import { assertValidScene } from "./validation";

export interface SceneTemplateDefinition {
  id: string;
  name: string;
  description: string;
  dimension: GameDimension;
  create(): SceneDocument;
}

function blank2d(): SceneDocument {
  const scene = createScene("Yeni 2D Sahne", "2d", "blank-2d");
  const camera = createEntity("Ana Kamera", [
    createTransform({ position: { x: 0, y: 0, z: -10 } }),
    createCamera({ projection: "orthographic", orthographicSize: 5, clearColor: "#111827" }),
  ]);
  scene.objects.push(camera);
  return scene;
}

function platformer2d(): SceneDocument {
  const scene = blank2d();
  scene.name = "2D Platform Başlangıcı";
  scene.metadata.templateId = "platformer-2d";
  const player = createEntity("Oyuncu", [
    createTransform({ position: { x: 0, y: 1, z: 0 } }),
    createSpriteRenderer({ color: "#7c3aed" }),
    createRigidBody({ freezePosition: { x: false, y: false, z: true } }),
    createCollider({ shape: "box", size: { x: 1, y: 1, z: 0.01 } }),
  ]);
  const ground = createEntity("Zemin", [
    createTransform({ position: { x: 0, y: -1.5, z: 0 }, scale: { x: 8, y: 0.5, z: 1 } }),
    createSpriteRenderer({ color: "#334155" }),
    createRigidBody({ bodyType: "static", useGravity: false }),
    createCollider({ shape: "box", size: { x: 1, y: 1, z: 0.01 } }),
  ]);
  scene.objects.push(player, ground);
  return scene;
}

function blank3d(): SceneDocument {
  const scene = createScene("Yeni 3D Sahne", "3d", "blank-3d");
  const camera = createEntity("Ana Kamera", [
    createTransform({ position: { x: 0, y: 2, z: -6 }, rotation: { x: 12, y: 0, z: 0 } }),
    createCamera(),
  ]);
  const light = createEntity("Yönlü Işık", [
    createTransform({ rotation: { x: 45, y: -30, z: 0 } }),
    createLight({ lightType: "directional", intensity: 1.2 }),
  ]);
  const cube = createEntity("Küp", [createTransform(), createMeshRenderer()]);
  scene.objects.push(camera, light, cube);
  return scene;
}

function physics3d(): SceneDocument {
  const scene = blank3d();
  scene.name = "3D Fizik Alanı";
  scene.metadata.templateId = "physics-3d";
  const cube = scene.objects.find((object) => object.name === "Küp");
  if (cube) {
    getTransformUnsafe(cube).position.y = 3;
    cube.components.push(createRigidBody({ restitution: 0.35 }), createCollider());
  }
  const ground = createEntity("Zemin", [
    createTransform({ position: { x: 0, y: -1, z: 0 }, scale: { x: 10, y: 0.5, z: 10 } }),
    createMeshRenderer({ mesh: { kind: "primitive", primitive: "cube" }, material: { color: "#334155", metallic: 0, roughness: 0.9, opacity: 1, textureAssetId: null } }),
    createRigidBody({ bodyType: "static", useGravity: false }),
    createCollider(),
  ]);
  scene.objects.push(ground);
  return scene;
}

function getTransformUnsafe(entity: SceneDocument["objects"][number]) {
  const transform = entity.components.find((component) => component.type === "transform");
  if (!transform || transform.type !== "transform") throw new Error("Şablon transform bileşeni içermiyor.");
  return transform;
}

export const SCENE_TEMPLATES: readonly SceneTemplateDefinition[] = [
  { id: "blank-2d", name: "Boş 2D", description: "Ortografik kamera ile sade bir 2D sahne.", dimension: "2d", create: blank2d },
  { id: "platformer-2d", name: "2D Platform", description: "Oyuncu, zemin, çarpıştırıcı ve temel fizik bileşenleri.", dimension: "2d", create: platformer2d },
  { id: "blank-3d", name: "Boş 3D", description: "Kamera, yönlü ışık ve bir küp içeren 3D sahne.", dimension: "3d", create: blank3d },
  { id: "physics-3d", name: "3D Fizik Alanı", description: "Dinamik küp ve statik zeminle fizik önizlemesi.", dimension: "3d", create: physics3d },
] as const;

export function listSceneTemplates(dimension?: GameDimension): readonly SceneTemplateDefinition[] {
  return dimension ? SCENE_TEMPLATES.filter((template) => template.dimension === dimension) : SCENE_TEMPLATES;
}

export function createSceneFromTemplate(templateId: string): SceneDocument {
  const template = SCENE_TEMPLATES.find((candidate) => candidate.id === templateId);
  if (!template) throw new Error(`Sahne şablonu bulunamadı: ${templateId}`);
  const scene = template.create();
  assertValidScene(scene);
  return scene;
}
