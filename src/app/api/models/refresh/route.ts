import { NextResponse } from "next/server";
import { getSettings, resolveApiKey } from "@/lib/storage/settings";
import { fetchOpenRouterModels, OpenRouterError } from "@/lib/openrouter/client";
import { saveCachedModels, listCustomModels } from "@/lib/storage/models";
import { apiHandler, bad } from "@/lib/api/handlers";

export const POST = apiHandler(async () => {
  const settings = await getSettings();
  const apiKey = resolveApiKey(settings);
  if (!apiKey) {
    return bad(
      "OpenRouter API key is not configured. Add it in Settings first.",
      "NO_API_KEY",
      401
    );
  }
  try {
    const fetched = await fetchOpenRouterModels(apiKey, settings.referer, settings.appTitle);
    await saveCachedModels(fetched);
    // Merge with custom models (custom override by id).
    const custom = await listCustomModels();
    const byId = new Map<string, (typeof fetched)[number]>();
    for (const m of fetched) byId.set(m.id, m);
    for (const m of custom) byId.set(m.id, { ...m, custom: true });
    return NextResponse.json({
      models: Array.from(byId.values()),
      refreshedAt: new Date().toISOString(),
      count: fetched.length,
    });
  } catch (err) {
    if (err instanceof OpenRouterError) {
      return bad(err.message, err.code, err.status === 0 ? 502 : err.status);
    }
    throw err;
  }
});
