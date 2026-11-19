/**
 * Type definitions for the LLM benchmark / evaluation framework.
 *
 * Schema versioning: every persisted object carries a `schemaVersion` field so
 * the storage layer can migrate formats in the future without breaking reads
 * of older experiments.
 */

export const CURRENT_SCHEMA_VERSION = 1 as const;

export type ExecutionStatus =
  | "pending"
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "cancelled"
  | "interrupted";

export type InputFormat = "text" | "json";

/** A single test input/prompt belonging to a batch. */
export interface BatchInput {
  id: string;
  /** Discriminator for forward compatibility with new input types. */
  format: InputFormat;
  /** Raw payload as authored by the user. For `json` inputs this is a JSON string. */
  content: string;
  /** Optional short label shown in the UI. */
  label?: string;
}

/** Reference to an OpenRouter model participating in a batch. */
export interface ModelRef {
  id: string;
  label?: string;
}

export interface BatchRunParams {
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  /**
   * Structured output / JSON mode.
   * - `{ type: "json_object" }` — basic JSON mode (no schema enforcement).
   * - `{ type: "json_schema", json_schema: {...} }` — strict Structured Outputs.
   * OpenRouter forwards `response_format` to the underlying provider when
   * supported. See https://openrouter.ai/docs/features/structured-outputs
   */
  responseFormat?: ResponseFormat;
  /**
   * When true, OpenRouter returns a 400 error if the chosen model does not
   * support any of the parameters you sent (e.g. response_format,
   * temperature). Useful for benchmarks that must validate model capabilities.
   * See https://openrouter.ai/docs/features/parameter-errors
   */
  requireParameters?: boolean;
}

/**
 * Discriminated union for `response_format` sent to OpenRouter.
 * Matches the OpenAI/OpenRouter schema so it is forwarded verbatim.
 */
export type ResponseFormat =
  | { type: "json_object" }
  | {
      type: "json_schema";
      json_schema: {
        /** A short name for the schema (required by OpenAI/OpenRouter). */
        name: string;
        /** Optional human description. */
        description?: string;
        /** The actual JSON Schema object. */
        schema: Record<string, unknown>;
        /** When true, enforces strict Structured Outputs (no extra keys). */
        strict?: boolean;
      };
    };

/** Persistent batch configuration. Written once at creation, immutable afterwards. */
export interface BatchMeta {
  schemaVersion: number;
  id: string;
  name: string;
  description?: string;
  systemPrompt: string;
  inputs: BatchInput[];
  models: ModelRef[];
  repetitions: number;
  params: BatchRunParams;
  /** Max concurrent executions for this batch. */
  concurrency: number;
  /** Per-request timeout in milliseconds. */
  timeoutMs: number;
  tags: string[];
  createdAt: string;
  createdBy?: string;
}

/** Live status of a batch, updated incrementally as executions finish. */
export interface BatchStatus {
  schemaVersion: number;
  batchId: string;
  total: number;
  pending: number;
  queued: number;
  running: number;
  completed: number;
  failed: number;
  cancelled: number;
  interrupted: number;
  startedAt?: string;
  finishedAt?: string;
  lastUpdatedAt: string;
  /** True while the runner is actively processing this batch. */
  isRunning: boolean;
}

export interface TokenUsage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}

export interface ExecutionRecord {
  schemaVersion: number;
  id: string;
  batchId: string;
  modelId: string;
  modelLabel?: string;
  inputId: string;
  inputFormat: InputFormat;
  inputContent: string;
  systemPrompt: string;
  /** Index (1-based) of this repetition within the model x input pair. */
  repetition: number;
  params: BatchRunParams;
  status: ExecutionStatus;
  startedAt?: string;
  finishedAt?: string;
  durationMs?: number;
  response?: string;
  finishReason?: string;
  errorMessage?: string;
  errorCode?: string;
  usage: TokenUsage;
  cost?: number;
  /** Provider model returned in the response (may differ from requested id). */
  resolvedModel?: string;
  /** Generation id returned by OpenRouter. */
  generationId?: string;
  /** Full raw API response payload for auditability. */
  raw?: unknown;
  createdAt: string;
  updatedAt: string;
}

/**
 * An execution without its raw API payload. The `raw` field is an order of
 * magnitude larger than everything else, so listings that span many batches
 * ship this shape instead.
 */
export type SlimExecutionRecord = Omit<ExecutionRecord, "raw">;

/** How much of the input text a cross-batch row carries. */
export const INPUT_PREVIEW_CHARS = 400;

/**
 * An execution as served by the cross-batch search: batch provenance (a listing
 * that spans batches has none on screen) plus the fields the results table and
 * the JSON export need.
 *
 * Deliberately not the full record. Inputs and system prompts can run to tens of
 * kilobytes each and are identical across every execution of a batch, so a
 * listing that carried them would be dominated by text nothing renders — the
 * full record is one request away (`/api/batches/<id>/executions`), which is
 * what the execution dialog already does.
 */
export interface CrossBatchExecution {
  id: string;
  batchId: string;
  batchName: string;
  batchTags: string[];
  batchCreatedAt: string;
  modelId: string;
  modelLabel?: string;
  inputId: string;
  /** Label of the batch input this execution used, when it has one. */
  inputLabel?: string;
  inputFormat: InputFormat;
  /** First `INPUT_PREVIEW_CHARS` characters of the input. */
  inputPreview: string;
  /** True when the input was longer than the preview. */
  inputTruncated: boolean;
  repetition: number;
  status: ExecutionStatus;
  startedAt?: string;
  finishedAt?: string;
  durationMs?: number;
  response?: string;
  finishReason?: string;
  errorMessage?: string;
  errorCode?: string;
  usage: TokenUsage;
  cost?: number;
  resolvedModel?: string;
  generationId?: string;
  createdAt: string;
}

/** How much a model has been exercised across every batch on disk. */
export interface ModelUsage {
  modelId: string;
  modelLabel?: string;
  /** Executions found for this model across all batches. */
  executions: number;
  completed: number;
  failed: number;
  /** Batches containing at least one execution of this model. */
  batches: number;
  /** Most recent start (falls back to the record's creation time). */
  lastRunAt?: string;
}

/** Aggregated metrics for a single model within a batch. */
export interface ModelMetrics {
  modelId: string;
  modelLabel?: string;
  total: number;
  completed: number;
  failed: number;
  pending: number;
  running: number;
  successRate: number;
  totalCost: number;
  avgCost: number;
  minCost?: number;
  maxCost?: number;
  avgLatencyMs: number;
  minLatencyMs?: number;
  maxLatencyMs?: number;
  medianLatencyMs?: number;
  p95LatencyMs?: number;
  latencies: number[];
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalTokens: number;
  avgPromptTokens: number;
  avgCompletionTokens: number;
  avgTotalTokens: number;
  costPer1kTokens?: number;
  /**
   * Completed executions that produced neither content nor token usage.
   * They are excluded from every average below — counting them would treat
   * "produced nothing" as "cost zero / zero tokens" and drag the means down.
   */
  emptyResponses: number;
  /** How many executions actually backed each average (see `emptyResponses`). */
  costSamples: number;
  latencySamples: number;
  tokenSamples: number;
}

export interface OverallMetrics {
  total: number;
  completed: number;
  failed: number;
  pending: number;
  running: number;
  successRate: number;
  totalCost: number;
  avgCost: number;
  avgLatencyMs: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalTokens: number;
  /** See `ModelMetrics.emptyResponses`. */
  emptyResponses: number;
  costSamples: number;
  latencySamples: number;
}

export interface BatchMetrics {
  schemaVersion: number;
  batchId: string;
  perModel: ModelMetrics[];
  overall: OverallMetrics;
  computedAt: string;
}

/** Lightweight entry in the global batches index. */
export interface BatchIndexEntry {
  id: string;
  name: string;
  description?: string;
  total: number;
  completed: number;
  failed: number;
  pending: number;
  running: number;
  isRunning: boolean;
  createdAt: string;
  lastUpdatedAt: string;
  tags: string[];
  modelCount: number;
  inputCount: number;
  repetitions: number;
}

export interface AppSettings {
  schemaVersion: number;
  openrouterApiKey?: string;
  /**
   * Management key do OpenRouter. Usada **apenas** pela tela de Uso & Custos:
   * `GET /api/v1/activity` rejeita a chave de inferência com 403.
   * Criada em openrouter.ai/settings/management-keys.
   */
  openrouterManagementKey?: string;
  /**
   * Chave da OpenAI. Usada **apenas** pela tela de Uso & Custos (leitura da
   * Usage API da organização). Execuções de benchmark continuam exclusivamente
   * no OpenRouter.
   */
  openaiApiKey?: string;
  /** Optional HTTP referer sent to OpenRouter for ranking/leaderboard. */
  referer?: string;
  /** Optional app title sent in X-Title header. */
  appTitle?: string;
  defaultConcurrency: number;
  defaultTimeoutMs: number;
  defaultRepetitions: number;
  /** Retry policy. */
  maxRetries: number;
  retryBackoffMs: number;
  updatedAt: string;
}

/** A model definition (cached from OpenRouter or user-registered custom). */
export interface ModelDefinition {
  schemaVersion: number;
  id: string;
  name: string;
  description?: string;
  contextLength?: number;
  pricing?: {
    prompt?: number;
    completion?: number;
    request?: number;
    image?: number;
    currency?: string;
  };
  architecture?: {
    modality?: string;
    inputModalities?: string[];
    outputModalities?: string[];
    tokenizer?: string;
  };
  topProvider?: {
    contextLength?: number;
    maxCompletionTokens?: number;
    isReasoningModel?: boolean;
  };
  /**
   * List of parameters the underlying provider supports, as reported by
   * OpenRouter's model catalog (`supported_parameters` field). Examples:
   * `["tools", "tool_choice", "response_format", "structured_outputs",
   * "temperature", "top_p", "max_tokens", ...]`.
   * Used by the UI to flag models incompatible with `response_format` or
   * `require_parameters: true`.
   */
  supportedParameters?: string[];
  /** True when registered manually by the user. */
  custom?: boolean;
  /** Per-million-token pricing normalized to USD. */
  promptPricePer1M?: number;
  completionPricePer1M?: number;
  updatedAt: string;
}

/** Capability flags derived from `supportedParameters` for UI convenience. */
export interface ModelCapabilities {
  /** Supports `response_format: { type: "json_object" }` or json_schema. */
  json: boolean;
  /** Supports strict Structured Outputs (json_schema with strict:true). */
  structuredOutputs: boolean;
  /** Supports tools / function calling. */
  tools: boolean;
  /** Supports temperature. */
  temperature: boolean;
  /** Supports top_p. */
  topP: boolean;
  /** Supports max_tokens / max_completion_tokens. */
  maxTokens: boolean;
}

/** Derive capability flags from a model's `supportedParameters` list. */
export function deriveCapabilities(
  supported?: string[]
): ModelCapabilities {
  const set = new Set(supported ?? []);
  const has = (keys: string[]) => keys.some((k) => set.has(k));
  return {
    json: has(["response_format", "json_object", "json_schema", "structured_outputs"]),
    structuredOutputs: has(["structured_outputs", "json_schema"]) ||
      has(["response_format"]),
    tools: has(["tools", "tool_choice"]),
    temperature: has(["temperature"]),
    topP: has(["top_p"]),
    maxTokens: has(["max_tokens", "max_completion_tokens"]),
  };
}
