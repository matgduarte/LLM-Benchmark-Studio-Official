import {
  ModelDefinition,
  ResponseFormat,
  CURRENT_SCHEMA_VERSION,
} from "@/lib/storage/types";

/**
 * OpenRouter API client.
 *
 * Docs: https://openrouter.ai/docs
 * - Auth: `Authorization: Bearer <key>`
 * - Optional `HTTP-Referer` and `X-Title` headers for leaderboard ranking.
 *
 * Chat completions response includes a `usage` object; OpenRouter returns a
 * `cost` field (USD) when pricing is available. We also receive the resolved
 * provider model in `model` and a `generation_id` for billing lookup.
 */

const OPENROUTER_BASE = "https://openrouter.ai/api/v1";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatCompletionOptions {
  apiKey: string;
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  /**
   * Structured output configuration. Forwarded as `response_format` in the
   * OpenRouter request body. See:
   * https://openrouter.ai/docs/features/structured-outputs
   */
  responseFormat?: ResponseFormat;
  /**
   * When true, OpenRouter returns a 400 error if the model does not support
   * the parameters you sent (response_format, temperature, etc.). When false
   * (default), unsupported parameters are silently dropped.
   * See: https://openrouter.ai/docs/features/parameter-errors
   */
  requireParameters?: boolean;
  referer?: string;
  appTitle?: string;
  /** Abort signal used to enforce per-request timeouts. */
  signal?: AbortSignal;
}

export interface ChatCompletionResult {
  content: string;
  finishReason?: string;
  usage: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
  cost?: number;
  resolvedModel?: string;
  generationId?: string;
  raw: unknown;
}

export class OpenRouterError extends Error {
  code: string;
  status: number;
  body?: unknown;
  constructor(message: string, code: string, status: number, body?: unknown) {
    super(message);
    this.name = "OpenRouterError";
    this.code = code;
    this.status = status;
    this.body = body;
  }
}

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 409 || status === 429 || status >= 500;
}

/** Fetch the public model catalog. Does not require auth but key helps rate limits. */
export async function fetchOpenRouterModels(
  apiKey?: string,
  referer?: string,
  appTitle?: string
): Promise<ModelDefinition[]> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
  if (referer) headers["HTTP-Referer"] = referer;
  if (appTitle) headers["X-Title"] = appTitle;

  const res = await fetch(`${OPENROUTER_BASE}/models`, { headers });
  if (!res.ok) {
    const body = await safeJson(res);
    throw new OpenRouterError(
      `Failed to fetch models: ${res.status}`,
      "MODELS_FETCH_FAILED",
      res.status,
      body
    );
  }
  const payload = (await res.json()) as { data?: unknown[] };
  const list = Array.isArray(payload.data) ? payload.data : [];
  const now = new Date().toISOString();
  return list
    .map((raw: any): ModelDefinition | null => {
      if (!raw || typeof raw !== "object" || !raw.id) return null;
      const pricing = raw.pricing ?? {};
      // OpenRouter pricing is per-token (USD). Convert to per-million for UI.
      const toPer1M = (v: unknown): number | undefined => {
        const n = typeof v === "string" ? parseFloat(v) : typeof v === "number" ? v : NaN;
        if (!Number.isFinite(n)) return undefined;
        return n * 1_000_000; // per-token -> per-1M-tokens
      };
      return {
        schemaVersion: CURRENT_SCHEMA_VERSION,
        id: raw.id,
        name: raw.name ?? raw.id,
        description: raw.description,
        contextLength: typeof raw.context_length === "number" ? raw.context_length : undefined,
        pricing: {
          prompt: toPer1M(pricing.prompt),
          completion: toPer1M(pricing.completion),
          request: typeof pricing.request === "string" ? parseFloat(pricing.request) : pricing.request,
          image: toPer1M(pricing.image),
          currency: pricing.currency ?? "USD",
        },
        promptPricePer1M: toPer1M(pricing.prompt),
        completionPricePer1M: toPer1M(pricing.completion),
        architecture: raw.architecture,
        topProvider: raw.top_provider,
        // Capture the provider-declared supported parameters so the UI can flag
        // models incompatible with response_format / require_parameters.
        supportedParameters: Array.isArray(raw.supported_parameters)
          ? raw.supported_parameters.filter((p: unknown): p is string => typeof p === "string")
          : undefined,
        updatedAt: now,
      };
    })
    .filter((m): m is ModelDefinition => m !== null);
}

async function safeJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return undefined;
  }
}

/** Perform a chat completion with retry on transient failures. */
export async function chatCompletion(
  opts: ChatCompletionOptions,
  maxRetries = 2,
  retryBackoffMs = 800
): Promise<ChatCompletionResult> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const body: Record<string, unknown> = {
        model: opts.model,
        messages: opts.messages,
      };
      if (opts.temperature !== undefined) body.temperature = opts.temperature;
      if (opts.maxTokens !== undefined) body.max_tokens = opts.maxTokens;
      if (opts.topP !== undefined) body.top_p = opts.topP;
      // Structured outputs: forward response_format verbatim so providers that
      // support json_object / json_schema can enforce it.
      if (opts.responseFormat) body.response_format = opts.responseFormat;
      // When true, OpenRouter rejects requests whose params are unsupported by
      // the chosen model (instead of silently dropping them). This is exactly
      // what we want for capability-comparison benchmarks.
      if (opts.requireParameters) body.require_parameters = true;

      const res = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${opts.apiKey}`,
          "Content-Type": "application/json",
          ...(opts.referer ? { "HTTP-Referer": opts.referer } : {}),
          ...(opts.appTitle ? { "X-Title": opts.appTitle } : {}),
        },
        body: JSON.stringify(body),
        signal: opts.signal,
      });

      if (!res.ok) {
        const errPayload = await safeJson(res);
        const errBody = errPayload as { error?: { message?: string; code?: string } } | undefined;
        const message = errBody?.error?.message ?? `OpenRouter ${res.status}`;
        const code = errBody?.error?.code ?? `HTTP_${res.status}`;
        if (isRetryableStatus(res.status) && attempt < maxRetries) {
          lastErr = new OpenRouterError(message, code, res.status, errPayload);
          await sleep(retryBackoffMs * Math.pow(2, attempt));
          continue;
        }
        throw new OpenRouterError(message, code, res.status, errPayload);
      }

      const payload = (await res.json()) as {
        id?: string;
        model?: string;
        choices?: Array<{
          message?: { role?: string; content?: string };
          finish_reason?: string;
        }>;
        usage?: {
          prompt_tokens?: number;
          completion_tokens?: number;
          total_tokens?: number;
          cost?: number;
        };
      };

      // Providers occasionally answer 200 with no `choices` at all (upstream
      // failure swallowed by the gateway). That is not a valid completion —
      // recording it as `completed` would let an execution that produced
      // nothing count as a success and skew every average. Throwing here also
      // gets it retried like any other transient failure.
      if (!Array.isArray(payload.choices) || payload.choices.length === 0) {
        const err = new OpenRouterError(
          "OpenRouter returned no choices (empty response)",
          "EMPTY_RESPONSE",
          res.status,
          payload
        );
        if (attempt < maxRetries) {
          lastErr = err;
          await sleep(retryBackoffMs * Math.pow(2, attempt));
          continue;
        }
        throw err;
      }

      const choice = payload.choices[0];
      // A present choice with empty content is a real (if unhelpful) answer —
      // kept as completed; the metrics layer decides whether to average it.
      const content = choice?.message?.content ?? "";
      const usage = payload.usage ?? {};
      // OpenRouter reports cost in `usage.cost` (USD). Fallback: compute from
      // model pricing if caller attaches it (handled in runner).
      const cost =
        typeof usage.cost === "number"
          ? usage.cost
          : undefined;

      return {
        content,
        finishReason: choice?.finish_reason,
        usage: {
          promptTokens: usage.prompt_tokens,
          completionTokens: usage.completion_tokens,
          totalTokens: usage.total_tokens,
        },
        cost,
        resolvedModel: payload.model,
        generationId: payload.id,
        raw: payload,
      };
    } catch (err) {
      // Abort / timeout → not retryable.
      if (err instanceof Error) {
        const name = err.name;
        if (name === "AbortError") {
          throw new OpenRouterError("Request timed out", "TIMEOUT", 408, undefined);
        }
      }
      lastErr = err;
      if (attempt < maxRetries) {
        await sleep(retryBackoffMs * Math.pow(2, attempt));
        continue;
      }
      throw err;
    }
  }
  throw lastErr ?? new OpenRouterError("Unknown error", "UNKNOWN", 0);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Estimate cost (USD) from token usage and per-1M pricing when API omits it. */
export function estimateCost(
  usage: { promptTokens?: number; completionTokens?: number },
  promptPricePer1M?: number,
  completionPricePer1M?: number
): number | undefined {
  if (
    promptPricePer1M === undefined &&
    completionPricePer1M === undefined
  ) {
    return undefined;
  }
  const prompt =
    ((usage.promptTokens ?? 0) * (promptPricePer1M ?? 0)) / 1_000_000;
  const completion =
    ((usage.completionTokens ?? 0) * (completionPricePer1M ?? 0)) / 1_000_000;
  return prompt + completion;
}
