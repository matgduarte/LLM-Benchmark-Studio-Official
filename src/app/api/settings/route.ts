import { NextRequest } from "next/server";
import {
  getSettings,
  saveSettings,
  resolveApiKey,
  resolveOpenAiKey,
  resolveManagementKey,
} from "@/lib/storage/settings";
import { apiHandler, json } from "@/lib/api/handlers";
import type { AppSettings } from "@/lib/storage/types";

function mask(key?: string): string | undefined {
  if (!key) return undefined;
  return key.slice(0, 6) + "••••••" + key.slice(-4);
}

/** Client-facing projection: never leaks a raw key, only whether one is set. */
function toPublicSettings(s: AppSettings) {
  return {
    hasApiKey: Boolean(resolveApiKey(s)),
    apiKeyMasked: mask(s.openrouterApiKey),
    openrouterApiKeySource: process.env.OPENROUTER_API_KEY ? "env" : "file",
    hasManagementKey: Boolean(resolveManagementKey(s)),
    managementKeyMasked: mask(s.openrouterManagementKey),
    managementKeySource: process.env.OPENROUTER_MANAGEMENT_KEY ? "env" : "file",
    hasOpenAiKey: Boolean(resolveOpenAiKey(s)),
    openaiApiKeyMasked: mask(s.openaiApiKey),
    openaiApiKeySource: process.env.OPENAI_API_KEY ? "env" : "file",
    referer: s.referer,
    appTitle: s.appTitle,
    defaultConcurrency: s.defaultConcurrency,
    defaultTimeoutMs: s.defaultTimeoutMs,
    defaultRepetitions: s.defaultRepetitions,
    maxRetries: s.maxRetries,
    retryBackoffMs: s.retryBackoffMs,
    updatedAt: s.updatedAt,
  };
}

export const GET = apiHandler(async () => {
  return json(toPublicSettings(await getSettings()));
});

export const PUT = apiHandler(async (req: NextRequest) => {
  const body = await req.json();
  // Never allow env-sourced keys to be overwritten from UI.
  if (process.env.OPENROUTER_API_KEY) delete body.openrouterApiKey;
  if (process.env.OPENROUTER_MANAGEMENT_KEY) delete body.openrouterManagementKey;
  if (process.env.OPENAI_API_KEY) delete body.openaiApiKey;
  return json(toPublicSettings(await saveSettings(body)));
});
