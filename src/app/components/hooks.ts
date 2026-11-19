"use client";

import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { api, type CreateBatchBody, type ExecutionSearchParams } from "@/lib/api-client";
import type { ExecutionStatus, ModelDefinition } from "@/lib/storage/types";
import type { UsageFilters } from "@/lib/usage/types";

export const qk = {
  settings: ["settings"] as const,
  models: ["models"] as const,
  modelUsage: ["model-usage"] as const,
  batches: ["batches"] as const,
  batch: (id: string) => ["batch", id] as const,
  status: (id: string) => ["status", id] as const,
  metrics: (id: string) => ["metrics", id] as const,
  executions: (id: string, opts?: { status?: ExecutionStatus; modelId?: string }) =>
    ["executions", id, opts?.status ?? "all", opts?.modelId ?? "all"] as const,
  executionSearch: (params: ExecutionSearchParams) =>
    [
      "execution-search",
      // Sorted so that picking the same models in another order hits the cache.
      [...params.modelIds].sort().join("|"),
      params.status ?? "all",
      params.batchId ?? "all",
      params.query?.trim() ?? "",
    ] as const,
  usage: (f: UsageQueryParams) =>
    ["usage", f.from, f.to, f.provider, f.status] as const,
};

export type UsageQueryParams = Pick<UsageFilters, "from" | "to" | "provider" | "status">;

export function useSettings() {
  return useQuery({ queryKey: qk.settings, queryFn: api.getSettings });
}

export function useSaveSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.saveSettings,
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.settings }),
  });
}

export function useModels() {
  return useQuery({ queryKey: qk.models, queryFn: api.listModels });
}

export function useRefreshModels() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.refreshModels,
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.models }),
  });
}

export function useAddCustomModel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.addCustomModel,
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.models }),
  });
}

export function useRemoveCustomModel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.removeCustomModel,
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.models }),
  });
}

export function useBatches() {
  return useQuery({ queryKey: qk.batches, queryFn: api.listBatches, refetchInterval: 4000 });
}

export function useCreateBatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateBatchBody) => api.createBatch(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.batches }),
  });
}

export function useBatch(id: string | undefined) {
  return useQuery({
    queryKey: id ? qk.batch(id) : ["batch", "none"],
    queryFn: () => api.getBatch(id!),
    enabled: Boolean(id),
  });
}

export function useBatchStatus(id: string | undefined, running: boolean) {
  return useQuery({
    queryKey: id ? qk.status(id) : ["status", "none"],
    queryFn: () => api.getStatus(id!),
    enabled: Boolean(id),
    refetchInterval: running ? 1200 : 6000,
  });
}

export function useMetrics(id: string | undefined, running: boolean) {
  return useQuery({
    queryKey: id ? qk.metrics(id) : ["metrics", "none"],
    queryFn: () => api.getMetrics(id!),
    enabled: Boolean(id),
    refetchInterval: running ? 2000 : 8000,
  });
}

export function useExecutions(
  id: string | undefined,
  opts?: { status?: ExecutionStatus; modelId?: string }
) {
  return useQuery({
    queryKey: id ? qk.executions(id, opts) : ["executions", "none"],
    queryFn: () => api.listExecutions(id!, opts),
    enabled: Boolean(id),
  });
}

/** Models that have executions on disk (populates the cross-batch picker). */
export function useModelUsage() {
  return useQuery({ queryKey: qk.modelUsage, queryFn: api.getModelUsage });
}

/** Executions of the selected models across every batch. */
export function useExecutionSearch(params: ExecutionSearchParams) {
  return useQuery({
    queryKey: qk.executionSearch(params),
    queryFn: () => api.searchExecutions(params),
    enabled: params.modelIds.length > 0,
    // Toggling a model keeps the previous result on screen instead of flashing
    // the whole table back to its loading state.
    placeholderData: keepPreviousData,
  });
}

/**
 * Uso e custo dos provedores. Cada chamada bate nas APIs externas, então o
 * resultado fica fresco por mais tempo e só recarrega sob demanda.
 */
export function useUsage(params: UsageQueryParams, enabled = true) {
  return useQuery({
    queryKey: qk.usage(params),
    queryFn: () => api.getUsage(params),
    enabled,
    staleTime: 60_000,
    // Mantém o painel anterior visível enquanto um novo intervalo carrega.
    placeholderData: keepPreviousData,
  });
}

export function useRunBatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.runBatch,
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: qk.batch(id) });
      qc.invalidateQueries({ queryKey: qk.status(id) });
      qc.invalidateQueries({ queryKey: qk.metrics(id) });
      qc.invalidateQueries({ queryKey: qk.executions(id) });
      qc.invalidateQueries({ queryKey: qk.batches });
    },
  });
}

export function useCancelBatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.cancelBatch,
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: qk.batch(id) });
      qc.invalidateQueries({ queryKey: qk.status(id) });
      qc.invalidateQueries({ queryKey: qk.metrics(id) });
      qc.invalidateQueries({ queryKey: qk.executions(id) });
      qc.invalidateQueries({ queryKey: qk.batches });
    },
  });
}

export function useDeleteBatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.deleteBatch,
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.batches }),
  });
}

export type { ModelDefinition };
