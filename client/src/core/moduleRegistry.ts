import type { NexModule } from "./types";

const registry = new Map<string, NexModule>();

export function registerModule(mod: NexModule) {
  if (registry.has(mod.id)) {
    console.warn(`[nexroom] Module "${mod.id}" already registered — skipping.`);
    return;
  }
  registry.set(mod.id, mod);
}

export function getModule(id: string): NexModule | undefined {
  return registry.get(id);
}

export function getAllModules(): NexModule[] {
  return Array.from(registry.values());
}

export function unregisterModule(id: string) {
  registry.delete(id);
}
