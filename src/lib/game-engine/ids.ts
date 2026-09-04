let fallbackSequence = 0;

export function createEngineId(prefix = "engine"): string {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi && typeof cryptoApi.randomUUID === "function") {
    return `${prefix}_${cryptoApi.randomUUID()}`;
  }

  fallbackSequence = (fallbackSequence + 1) % Number.MAX_SAFE_INTEGER;
  const entropy = Math.random().toString(36).slice(2, 10);
  return `${prefix}_${Date.now().toString(36)}_${fallbackSequence.toString(36)}_${entropy}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}
