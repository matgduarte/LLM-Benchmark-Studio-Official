import { ModelDefinition, CURRENT_SCHEMA_VERSION } from "./types";
import { readJson, writeJsonAtomic } from "./fs";
import { PATHS } from "./paths";

/** Read cached OpenRouter model catalog. */
export async function listCachedModels(): Promise<ModelDefinition[]> {
  const data = await readJson<ModelDefinition[]>(PATHS.models, []);
  return data ?? [];
}

/** Overwrite the cached catalog (after refresh from OpenRouter). */
export async function saveCachedModels(models: ModelDefinition[]): Promise<void> {
  await writeJsonAtomic(PATHS.models, models);
}

/** Read user-registered custom models. */
export async function listCustomModels(): Promise<ModelDefinition[]> {
  const data = await readJson<ModelDefinition[]>(PATHS.customModels, []);
  return data ?? [];
}

/** Add or update a custom model (matched by id). */
export async function upsertCustomModel(
  model: Omit<ModelDefinition, "schemaVersion" | "updatedAt" | "custom"> & Partial<Pick<ModelDefinition, "custom">>
): Promise<ModelDefinition> {
  const existing = await listCustomModels();
  const now = new Date().toISOString();
  const next: ModelDefinition = {
    ...model,
    custom: model.custom ?? true,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    updatedAt: now,
  };
  const idx = existing.findIndex((m) => m.id === next.id);
  if (idx >= 0) existing[idx] = next;
  else existing.push(next);
  await writeJsonAtomic(PATHS.customModels, existing);
  return next;
}

/** Remove a custom model by id. */
export async function removeCustomModel(id: string): Promise<void> {
  const existing = await listCustomModels();
  const next = existing.filter((m) => m.id !== id);
  await writeJsonAtomic(PATHS.customModels, next);
}

/** Union of cached + custom models, custom overriding cached by id. */
export async function listAllModels(): Promise<ModelDefinition[]> {
  const [cached, custom] = await Promise.all([listCachedModels(), listCustomModels()]);
  const byId = new Map<string, ModelDefinition>();
  for (const m of cached) byId.set(m.id, m);
  for (const m of custom) byId.set(m.id, { ...m, custom: true });
  return Array.from(byId.values());
}

/** Find a model definition by id. */
export async function findModel(id: string): Promise<ModelDefinition | undefined> {
  const all = await listAllModels();
  return all.find((m) => m.id === id);
}
