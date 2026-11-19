import { AppSettings, CURRENT_SCHEMA_VERSION } from "./types";
import { readJson, writeJsonAtomic, ensureDir } from "./fs";
import { PATHS } from "./paths";

const DEFAULT_SETTINGS: AppSettings = {
  schemaVersion: CURRENT_SCHEMA_VERSION,
  openrouterApiKey: undefined,
  openrouterManagementKey: undefined,
  openaiApiKey: undefined,
  referer: "https://llm-benchmark.local",
  appTitle: "LLM Benchmark Studio",
  defaultConcurrency: 4,
  defaultTimeoutMs: 90_000,
  defaultRepetitions: 3,
  maxRetries: 2,
  retryBackoffMs: 800,
  updatedAt: new Date().toISOString(),
};

/** In-memory cache of settings (single source in process). */
let cache: AppSettings | undefined;

/** Read settings from disk, merging with defaults. */
export async function getSettings(): Promise<AppSettings> {
  if (cache) return cache;
  const onDisk = await readJson<Partial<AppSettings>>(PATHS.settings, {});
  cache = { ...DEFAULT_SETTINGS, ...onDisk, schemaVersion: CURRENT_SCHEMA_VERSION };
  return cache;
}

/** Get settings synchronously from cache (only valid after first getSettings). */
export function getCachedSettings(): AppSettings | undefined {
  return cache;
}

/** Persist updated settings and refresh the cache. */
export async function saveSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
  const current = await getSettings();
  const next: AppSettings = {
    ...current,
    ...patch,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    updatedAt: new Date().toISOString(),
  };
  await ensureDir(PATHS.configDir);
  await writeJsonAtomic(PATHS.settings, next);
  cache = next;
  return next;
}

/** Resolve the active API key (env overrides file). */
export function resolveApiKey(settings?: AppSettings): string | undefined {
  if (process.env.OPENROUTER_API_KEY) return process.env.OPENROUTER_API_KEY;
  return settings?.openrouterApiKey;
}

/**
 * Resolve the OpenAI key (env overrides file). Consumida somente pela tela de
 * Uso & Custos — nenhuma execução de benchmark usa esta chave.
 */
export function resolveOpenAiKey(settings?: AppSettings): string | undefined {
  if (process.env.OPENAI_API_KEY) return process.env.OPENAI_API_KEY;
  return settings?.openaiApiKey;
}

/**
 * Resolve a management key do OpenRouter (env overrides file). Usada somente
 * pela tela de Uso & Custos; execuções continuam usando `resolveApiKey`.
 */
export function resolveManagementKey(settings?: AppSettings): string | undefined {
  if (process.env.OPENROUTER_MANAGEMENT_KEY) return process.env.OPENROUTER_MANAGEMENT_KEY;
  return settings?.openrouterManagementKey;
}
