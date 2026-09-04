import { cloneProject, cloneScene } from "./scene";
import type { GameProjectDocument, SceneDocument } from "./types";
import { MAX_SERIALIZED_SCENE_BYTES } from "./types";
import { assertValidProject, assertValidScene } from "./validation";

export const DEFAULT_SCENE_SERIALIZATION_LIMIT = MAX_SERIALIZED_SCENE_BYTES;
export const DEFAULT_PROJECT_SERIALIZATION_LIMIT = 20_000_000;

function utf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function parseJsonWithLimit(serialized: string, maxBytes: number): unknown {
  if (utf8ByteLength(serialized) > maxBytes) {
    throw new Error(`Oyun motoru belgesi ${maxBytes} bayt sınırını aşıyor.`);
  }
  try {
    return JSON.parse(serialized) as unknown;
  } catch {
    throw new Error("Oyun motoru belgesi geçerli JSON değil.");
  }
}

export function serializeScene(scene: SceneDocument, pretty = false): string {
  assertValidScene(scene);
  return JSON.stringify(scene, null, pretty ? 2 : undefined);
}

export function deserializeScene(serialized: string, maxBytes = DEFAULT_SCENE_SERIALIZATION_LIMIT): SceneDocument {
  const parsed = parseJsonWithLimit(serialized, maxBytes);
  assertValidScene(parsed);
  return cloneScene(parsed);
}

export function serializeProject(project: GameProjectDocument, pretty = false): string {
  assertValidProject(project);
  return JSON.stringify(project, null, pretty ? 2 : undefined);
}

export function deserializeProject(serialized: string, maxBytes = DEFAULT_PROJECT_SERIALIZATION_LIMIT): GameProjectDocument {
  const parsed = parseJsonWithLimit(serialized, maxBytes);
  assertValidProject(parsed);
  return cloneProject(parsed);
}
