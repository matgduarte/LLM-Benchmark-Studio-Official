import { NextRequest } from "next/server";
import { apiHandler, bad, json } from "@/lib/api/handlers";
import {
  getSettings,
  resolveApiKey,
  resolveOpenAiKey,
  resolveManagementKey,
} from "@/lib/storage/settings";
import { bucketizeLocal, bucketizeProviders } from "@/lib/usage/aggregator";
import { fetchOpenRouterUsage } from "@/lib/usage/openrouter";
import { fetchOpenAiUsage } from "@/lib/usage/openai";
import { loadLocalExecutions, LOCAL_ROW_LIMIT } from "@/lib/usage/local";
import type {
  ProviderCredits,
  ProviderUsageRow,
  UsageProvider,
  UsageReport,
  UsageSource,
  UsageStatusFilter,
} from "@/lib/usage/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const STATUS_FILTERS: UsageStatusFilter[] = ["all", "success", "error"];

/**
 * Uso e custo consolidados.
 *
 * As chaves ficam no servidor (`data/config/settings.json` ou env) e nunca
 * trafegam para o cliente — a UI só envia o intervalo e os filtros.
 *
 * O `status` recorta apenas as execuções locais: nenhum provedor expõe
 * desfecho por request (ver `lib/usage/types.ts`).
 */
export const GET = apiHandler(async (req: NextRequest) => {
  const sp = req.nextUrl.searchParams;
  const from = sp.get("from") ?? "";
  const to = sp.get("to") ?? "";
  const provider = (sp.get("provider") ?? "all") as UsageProvider | "all";
  const statusParam = sp.get("status") ?? "all";

  if (!ISO_DATE.test(from) || !ISO_DATE.test(to)) {
    return bad("Parâmetros `from` e `to` devem estar no formato YYYY-MM-DD", "INVALID_RANGE");
  }
  if (from > to) {
    return bad("`from` não pode ser posterior a `to`", "INVALID_RANGE");
  }
  if (!STATUS_FILTERS.includes(statusParam as UsageStatusFilter)) {
    return bad("`status` deve ser all, success ou error", "INVALID_STATUS");
  }
  const status = statusParam as UsageStatusFilter;

  const settings = await getSettings();
  const inferenceKey = resolveApiKey(settings);
  const managementKey = resolveManagementKey(settings);
  const openAiKey = resolveOpenAiKey(settings);

  const rows: ProviderUsageRow[] = [];
  const credits: ProviderCredits[] = [];
  const sources: UsageSource[] = [];

  const wants = (p: UsageProvider) => provider === "all" || provider === p;
  const tasks: Promise<void>[] = [];

  if (wants("openrouter")) {
    if (inferenceKey || managementKey) {
      tasks.push(
        fetchOpenRouterUsage({ managementKey, inferenceKey }, from, to).then((r) => {
          rows.push(...r.rows);
          if (r.credits) credits.push(r.credits);
          sources.push({
            provider: "openrouter",
            requests: r.rows.reduce((s, x) => s + x.requests, 0),
            note: r.note,
            failed: r.failed,
          });
        })
      );
    } else {
      sources.push({
        provider: "openrouter",
        requests: 0,
        note: "Nenhuma chave do OpenRouter configurada.",
        missingKey: true,
      });
    }
  }

  if (wants("openai")) {
    if (openAiKey) {
      tasks.push(
        fetchOpenAiUsage(openAiKey, from, to).then((r) => {
          rows.push(...r.rows);
          if (r.credits) credits.push(r.credits);
          sources.push({
            provider: "openai",
            requests: r.rows.reduce((s, x) => s + x.requests, 0),
            note: r.note,
            failed: r.failed,
          });
        })
      );
    } else {
      sources.push({
        provider: "openai",
        requests: 0,
        note: "Nenhuma chave da OpenAI configurada — vincule uma em Configurações para ver o consumo dela aqui.",
        missingKey: true,
      });
    }
  }

  // O disco é lido em paralelo com as APIs externas.
  const localPromise = loadLocalExecutions({ from, to, status });
  await Promise.all(tasks);
  const localRows = await localPromise;

  const report: UsageReport = {
    from,
    to,
    providers: {
      ...bucketizeProviders(rows),
      credits,
      // Ordem estável, independente de qual provedor respondeu primeiro.
      sources: sources.sort((a, b) => a.provider.localeCompare(b.provider)),
    },
    local: bucketizeLocal(localRows, LOCAL_ROW_LIMIT),
  };

  return json(report);
});
