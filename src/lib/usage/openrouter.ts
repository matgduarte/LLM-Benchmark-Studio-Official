import type { ProviderCredits, ProviderFetchResult, ProviderUsageRow } from "./types";

/**
 * Leitura de consumo do OpenRouter.
 *
 * Não existe endpoint público com log por request: `GET /api/v1/activity`
 * devolve agregados por (dia, modelo, endpoint) dos **últimos 30 dias UTC
 * completos** e exige uma *management key* — a chave de inferência recebe 403.
 * `GET /api/v1/credits` devolve o total creditado e o total gasto na conta.
 *
 * Docs: https://openrouter.ai/docs/api-reference/analytics/get-activity
 */

interface ActivityItem {
  date: string;
  model: string;
  model_permaslug?: string;
  endpoint_id?: string;
  provider_name?: string;
  usage: number;
  byok_usage_inference?: number;
  requests: number;
  prompt_tokens: number;
  completion_tokens: number;
  reasoning_tokens: number;
}

interface ORError {
  error?: { code?: number; message?: string };
}

const MANAGEMENT_KEY_HINT =
  "O endpoint de atividade do OpenRouter exige uma management key (a chave de inferência não serve). Crie uma em openrouter.ai/settings/management-keys e informe em Configurações.";

/**
 * @param managementKey Chave de gestão, necessária para o consumo detalhado.
 * @param inferenceKey  Chave normal; ainda serve para consultar o saldo.
 */
export async function fetchOpenRouterUsage(
  { managementKey, inferenceKey }: { managementKey?: string; inferenceKey?: string },
  from: string,
  to: string
): Promise<ProviderFetchResult> {
  // O saldo costuma responder com qualquer uma das chaves; a de gestão tem
  // precedência por ser a que a doc especifica.
  const credits = await fetchCredits(managementKey ?? inferenceKey);

  if (!managementKey) {
    return { rows: [], credits, note: MANAGEMENT_KEY_HINT };
  }

  try {
    const res = await fetch("https://openrouter.ai/api/v1/activity", {
      headers: { Authorization: `Bearer ${managementKey}` },
      cache: "no-store",
    });

    if (!res.ok) {
      const body = await res.text();
      let message = body.slice(0, 300);
      try {
        message = (JSON.parse(body) as ORError).error?.message ?? message;
      } catch {
        // Resposta não-JSON (página de erro): a fatia do corpo já basta.
      }
      return {
        rows: [],
        credits,
        note:
          res.status === 403
            ? MANAGEMENT_KEY_HINT
            : `OpenRouter /activity ${res.status}: ${message}`,
        failed: true,
      };
    }

    const json = (await res.json()) as { data?: ActivityItem[] };
    const rows: ProviderUsageRow[] = [];

    for (const [i, item] of (json.data ?? []).entries()) {
      // A API não aceita intervalo, só um dia por vez — filtramos localmente.
      if (item.date < from || item.date > to) continue;
      const prompt = Number(item.prompt_tokens ?? 0);
      const completion = Number(item.completion_tokens ?? 0);
      const reasoning = Number(item.reasoning_tokens ?? 0);
      rows.push({
        id: `or-${item.date}-${item.model}-${item.endpoint_id ?? i}`,
        provider: "openrouter",
        date: item.date,
        model: item.model,
        upstream: item.provider_name,
        requests: Number(item.requests ?? 0),
        promptTokens: prompt,
        completionTokens: completion,
        reasoningTokens: reasoning,
        totalTokens: prompt + completion + reasoning,
        // `usage` são os créditos consumidos; BYOK é cobrado fora e vem à parte.
        cost: Number(item.usage ?? 0) + Number(item.byok_usage_inference ?? 0),
      });
    }

    return {
      rows,
      credits,
      note:
        rows.length === 0
          ? "Sem atividade neste intervalo. A API cobre apenas os últimos 30 dias UTC completos (o dia corrente ainda não entra)."
          : undefined,
    };
  } catch (e) {
    return {
      rows: [],
      credits,
      note: `Falha ao consultar o OpenRouter: ${e instanceof Error ? e.message : String(e)}`,
      failed: true,
    };
  }
}

/** Saldo da conta. Falha aqui não invalida o resto. */
async function fetchCredits(apiKey?: string): Promise<ProviderCredits | undefined> {
  if (!apiKey) return undefined;
  try {
    const res = await fetch("https://openrouter.ai/api/v1/credits", {
      headers: { Authorization: `Bearer ${apiKey}` },
      cache: "no-store",
    });
    if (!res.ok) return undefined;
    const json = (await res.json()) as {
      data?: { total_credits?: number; total_usage?: number };
    };
    const granted = json.data?.total_credits;
    const used = json.data?.total_usage;
    return {
      provider: "openrouter",
      label: "OpenRouter",
      // A API não devolve saldo pronto — é a diferença entre creditado e gasto.
      balance: granted !== undefined && used !== undefined ? granted - used : undefined,
      usage: used,
      currency: "USD",
    };
  } catch {
    return undefined;
  }
}
