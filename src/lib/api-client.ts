/**
 * Typed API client for the LLM benchmark backend.
 * All endpoints use relative paths (the app is served by the gateway).
 */

import type {
  AppSettings,
  BatchIndexEntry,
  BatchMeta,
  BatchMetrics,
  BatchStatus,
  CrossBatchExecution,
  ExecutionRecord,
  ExecutionStatus,
  InputFormat,
  ModelDefinition,
  ModelMetrics,
  ModelUsage,
  OverallMetrics,
  ResponseFormat,
} from "@/lib/storage/types";
import type { UsageFilters, UsageReport } from "@/lib/usage/types";

export interface PublicSettings {
  hasApiKey: boolean;
  apiKeyMasked?: string;
  openrouterApiKeySource: "env" | "file";
  /** Management key do OpenRouter — usada apenas pela tela de Uso & Custos. */
  hasManagementKey: boolean;
  managementKeyMasked?: string;
  managementKeySource: "env" | "file";
  /** Chave da OpenAI — usada apenas pela tela de Uso & Custos. */
  hasOpenAiKey: boolean;
  openaiApiKeyMasked?: string;
  openaiApiKeySource: "env" | "file";
  referer?: string;
  appTitle?: string;
  defaultConcurrency: number;
  defaultTimeoutMs: number;
  defaultRepetitions: number;
  maxRetries: number;
  retryBackoffMs: number;
  updatedAt: string;
}

async function http<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const message =
      (data && typeof data === "object" && "error" in data ? (data as { error: string }).error : null) ??
      `HTTP ${res.status}`;
    const code =
      (data && typeof data === "object" && "code" in data ? (data as { code: string }).code : null) ??
      `HTTP_${res.status}`;
    const err = new Error(message) as Error & { code: string; status: number };
    err.code = code;
    err.status = res.status;
    throw err;
  }
  return data as T;
}

/** Models with executions on disk (cross-batch search picker). */
export interface ModelUsageResult {
  models: ModelUsage[];
  totalExecutions: number;
  totalBatches: number;
}

/** Result of the cross-batch execution search. */
export interface ExecutionSearchResult {
  executions: CrossBatchExecution[];
  /** One entry per requested model, zeroed when it has no match. */
  perModel: ModelMetrics[];
  overall: OverallMetrics;
}

export interface ExecutionSearchParams {
  modelIds: string[];
  status?: ExecutionStatus;
  batchId?: string;
  /** Free text; matched server-side against the full input, not the preview. */
  query?: string;
}

export const api = {
  getSettings: () => http<PublicSettings>("/api/settings"),
  saveSettings: (patch: Partial<AppSettings>) =>
    http<PublicSettings>("/api/settings", { method: "PUT", body: JSON.stringify(patch) }),

  listModels: () => http<{ models: ModelDefinition[] }>("/api/models"),
  refreshModels: () =>
    http<{ models: ModelDefinition[]; refreshedAt: string; count: number }>(
      "/api/models/refresh",
      { method: "POST" }
    ),
  addCustomModel: (model: Partial<ModelDefinition> & { id: string; name: string }) =>
    http<{ model: ModelDefinition }>("/api/models/custom", {
      method: "POST",
      body: JSON.stringify(model),
    }),
  removeCustomModel: (id: string) =>
    http<{ ok: boolean }>(`/api/models/custom?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
    }),

  listBatches: () => http<{ batches: BatchIndexEntry[] }>("/api/batches"),
  createBatch: (body: CreateBatchBody) =>
    http<{ meta: BatchMeta; status: BatchStatus }>("/api/batches", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  getBatch: (id: string) =>
    http<{ meta: BatchMeta; status: BatchStatus; isRunning: boolean }>(`/api/batches/${id}`),
  deleteBatch: (id: string) => http<{ ok: boolean }>(`/api/batches/${id}`, { method: "DELETE" }),
  runBatch: (id: string) => http<{ ok: boolean; queued: number }>(`/api/batches/${id}/run`, { method: "POST" }),
  cancelBatch: (id: string) =>
    http<{ ok: boolean; cancelled: number }>(`/api/batches/${id}/cancel`, { method: "POST" }),
  getMetrics: (id: string) => http<{ metrics: BatchMetrics | undefined }>(`/api/batches/${id}/metrics`),
  getStatus: (id: string) =>
    http<{ status: BatchStatus | undefined; isRunning: boolean }>(`/api/batches/${id}/status`),
  listExecutions: (id: string, opts?: { status?: ExecutionStatus; modelId?: string }) => {
    const qs = new URLSearchParams();
    if (opts?.status) qs.set("status", opts.status);
    if (opts?.modelId) qs.set("modelId", opts.modelId);
    const q = qs.toString();
    return http<{ executions: ExecutionRecord[] }>(`/api/batches/${id}/executions${q ? `?${q}` : ""}`);
  },

  getModelUsage: () => http<ModelUsageResult>("/api/models/usage"),
  /** Executions of the given models across every batch. */
  searchExecutions: (params: ExecutionSearchParams) => {
    const qs = new URLSearchParams();
    // Repeated `model` params — model ids contain `/` and `:`, so no delimiter
    // is safe to join them with.
    for (const id of params.modelIds) qs.append("model", id);
    if (params.status) qs.set("status", params.status);
    if (params.batchId) qs.set("batchId", params.batchId);
    if (params.query?.trim()) qs.set("q", params.query.trim());
    return http<ExecutionSearchResult>(`/api/executions?${qs.toString()}`);
  },

  /** Uso e custo consolidados dos provedores (tela de Uso & Custos). */
  getUsage: (filters: Pick<UsageFilters, "from" | "to" | "provider" | "status">) => {
    const qs = new URLSearchParams({
      from: filters.from,
      to: filters.to,
      provider: filters.provider,
      status: filters.status,
    });
    return http<UsageReport>(`/api/usage?${qs.toString()}`);
  },
};

export interface CreateBatchBody {
  name: string;
  description?: string;
  systemPrompt: string;
  inputs: Array<{ id?: string; format: InputFormat; content: string; label?: string }>;
  models: Array<{ id: string; label?: string }>;
  repetitions: number;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  /** Structured output config (json_object or json_schema). */
  responseFormat?: ResponseFormat;
  /** When true, OpenRouter errors if the model rejects any param. */
  requireParameters?: boolean;
  concurrency: number;
  timeoutMs: number;
  tags?: string[];
}
