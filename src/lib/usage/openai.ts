import type { ProviderFetchResult, ProviderUsageRow } from "./types";

/**
 * Leitura de consumo da OpenAI.
 *
 * Mesma limitação do OpenRouter: a Usage API só expõe agregados por bucket de
 * tempo (dia) e modelo — não há log por request nem status code.
 *
 * Requer uma chave com escopo de leitura da organização (`api.usage.read`);
 * chaves de projeto comuns recebem 401 nesses endpoints.
 */

interface UsageBucket {
  start_time: number | string;
  results?: {
    input_tokens?: number;
    output_tokens?: number;
    input_cached_tokens?: number;
    num_model_requests?: number;
    model?: string;
  }[];
}

interface CostBucket {
  start_time: number | string;
  results?: { amount?: { value?: number; currency?: string } }[];
}

/** `start_time` vem como epoch em segundos; toleramos ISO por segurança. */
function bucketDay(t: number | string): string {
  const asNumber = typeof t === "number" ? t : Number(t);
  if (Number.isFinite(asNumber)) return new Date(asNumber * 1000).toISOString().slice(0, 10);
  return String(t).slice(0, 10);
}

export async function fetchOpenAiUsage(
  apiKey: string,
  from: string,
  to: string
): Promise<ProviderFetchResult> {
  try {
    const startSec = Math.floor(new Date(from + "T00:00:00Z").getTime() / 1000);
    const endSec = Math.floor(new Date(to + "T23:59:59Z").getTime() / 1000);
    const range = `start_time=${startSec}&end_time=${endSec}&bucket_width=1d&limit=31`;

    const [usageRes, costRes] = await Promise.allSettled([
      fetch(`https://api.openai.com/v1/organization/usage/completions?${range}&group_by=model`, {
        headers: { Authorization: `Bearer ${apiKey}` },
        cache: "no-store",
      }),
      fetch(`https://api.openai.com/v1/organization/costs?${range}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
        cache: "no-store",
      }),
    ]);

    if (usageRes.status === "rejected") {
      return {
        rows: [],
        note: `Falha ao consultar a OpenAI: ${String(usageRes.reason)}`,
        failed: true,
      };
    }
    if (!usageRes.value.ok) {
      const text = await usageRes.value.text();
      return {
        rows: [],
        note:
          usageRes.value.status === 401
            ? "OpenAI 401: a chave precisa de escopo de leitura da organização (api.usage.read)."
            : `OpenAI /usage ${usageRes.value.status}: ${text.slice(0, 300)}`,
        failed: true,
      };
    }

    const usageJson = (await usageRes.value.json()) as { data?: UsageBucket[] };

    const perDayModel = new Map<
      string,
      { day: string; model: string; prompt: number; completion: number; requests: number }
    >();
    for (const bucket of usageJson.data ?? []) {
      const day = bucketDay(bucket.start_time);
      for (const r of bucket.results ?? []) {
        const model = r.model ?? "unknown";
        const key = `${day}|${model}`;
        const e =
          perDayModel.get(key) ?? { day, model, prompt: 0, completion: 0, requests: 0 };
        e.prompt += Number(r.input_tokens ?? 0);
        e.completion += Number(r.output_tokens ?? 0);
        e.requests += Number(r.num_model_requests ?? 0);
        perDayModel.set(key, e);
      }
    }

    // O custo também vem só por dia; rateamos entre os modelos do dia na
    // proporção de tokens, já que a OpenAI não quebra custo por modelo.
    const costPerDay = new Map<string, number>();
    let totalCost = 0;
    if (costRes.status === "fulfilled" && costRes.value.ok) {
      const costJson = (await costRes.value.json()) as { data?: CostBucket[] };
      for (const bucket of costJson.data ?? []) {
        const day = bucketDay(bucket.start_time);
        const amount = (bucket.results ?? []).reduce(
          (a, r) => a + Number(r.amount?.value ?? 0),
          0
        );
        costPerDay.set(day, (costPerDay.get(day) ?? 0) + amount);
        totalCost += amount;
      }
    }

    const tokensPerDay = new Map<string, number>();
    for (const e of perDayModel.values()) {
      tokensPerDay.set(e.day, (tokensPerDay.get(e.day) ?? 0) + e.prompt + e.completion);
    }

    const rows: ProviderUsageRow[] = [];
    for (const [key, e] of perDayModel) {
      const total = e.prompt + e.completion;
      const dayTokens = tokensPerDay.get(e.day) ?? 0;
      const dayCost = costPerDay.get(e.day) ?? 0;
      rows.push({
        id: `oa-${key}`,
        provider: "openai",
        date: e.day,
        model: e.model,
        requests: e.requests,
        promptTokens: e.prompt,
        completionTokens: e.completion,
        reasoningTokens: 0,
        totalTokens: total,
        cost: dayTokens > 0 ? (dayCost * total) / dayTokens : 0,
      });
    }

    return {
      rows,
      credits:
        costPerDay.size > 0
          ? { provider: "openai", label: "OpenAI", usage: totalCost, currency: "USD" }
          : undefined,
      note:
        rows.length === 0
          ? "Sem uso neste intervalo (verifique se a chave tem acesso de leitura da organização)."
          : undefined,
    };
  } catch (e) {
    return {
      rows: [],
      note: `Falha ao consultar a OpenAI: ${e instanceof Error ? e.message : String(e)}`,
      failed: true,
    };
  }
}
