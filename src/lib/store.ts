"use client";

import { create } from "zustand";
import { daysAgoISO, todayISO } from "./usage/aggregator";
import type { UsageFilters } from "./usage/types";

export type ViewKind =
  | { kind: "batches" }
  /** `duplicateFrom` pre-fills the form with an existing batch's config. */
  | { kind: "create-batch"; duplicateFrom?: string }
  | { kind: "batch-detail"; batchId: string }
  /** Cross-batch search: every execution of the chosen models. */
  | { kind: "model-search" }
  /** Consumo e custo lidos direto das APIs dos provedores. */
  | { kind: "usage" }
  | { kind: "settings" };

/**
 * The slice the comparison view should preselect. Set when the user jumps into
 * the comparison from an execution; the comparison view keys off object
 * identity, so re-triggering with the same values works.
 *
 * `axis` picks which dimension becomes the columns: `reps` holds the model
 * fixed, `models` holds the repetition fixed.
 */
export interface CompareTarget {
  batchId: string;
  inputId: string;
  modelId: string;
  repetition: number;
  axis: "reps" | "models";
}

interface AppState {
  view: ViewKind;
  selectedExecutionId: string | null;
  selectedExecutionBatchId: string | null;
  /** Active tab of the batch detail view — lives here so other components can switch it. */
  batchTab: string;
  compareTarget: CompareTarget | null;
  /**
   * Models chosen in the cross-batch search. Kept outside the view so that
   * jumping into a batch and coming back doesn't discard the selection.
   */
  modelSearchModels: string[];
  /**
   * Filtros da tela de Uso & Custos. Ficam fora da view pelo mesmo motivo de
   * `modelSearchModels`: sair e voltar não deve perder a seleção.
   */
  usageFilters: UsageFilters;
  go: (view: ViewKind) => void;
  setBatchTab: (tab: string) => void;
  setModelSearchModels: (ids: string[]) => void;
  setUsageFilters: (patch: Partial<UsageFilters>) => void;
  /** Aplica um preset relativo, recalculando o intervalo a partir de hoje. */
  setUsagePreset: (preset: UsageFilters["preset"]) => void;
  openExecution: (execId: string, batchId: string) => void;
  closeExecution: () => void;
  /** Closes the detail dialog and switches the batch view to the comparison tab. */
  openComparison: (target: CompareTarget) => void;
}

const DEFAULT_USAGE_FILTERS: UsageFilters = {
  provider: "all",
  status: "all",
  preset: "7d",
  from: daysAgoISO(7),
  to: todayISO(),
};

export const useAppStore = create<AppState>((set) => ({
  view: { kind: "batches" },
  selectedExecutionId: null,
  selectedExecutionBatchId: null,
  batchTab: "overview",
  compareTarget: null,
  modelSearchModels: [],
  usageFilters: DEFAULT_USAGE_FILTERS,
  go: (view) => set({ view, batchTab: "overview" }),
  setBatchTab: (batchTab) => set({ batchTab }),
  setModelSearchModels: (modelSearchModels) => set({ modelSearchModels }),
  setUsageFilters: (patch) =>
    set((s) => ({ usageFilters: { ...s.usageFilters, ...patch } })),
  setUsagePreset: (preset) =>
    set((s) => ({
      usageFilters: {
        ...s.usageFilters,
        preset,
        ...(preset === "custom"
          ? {}
          : { from: daysAgoISO(preset === "24h" ? 1 : preset === "7d" ? 7 : 30), to: todayISO() }),
      },
    })),
  openExecution: (execId, batchId) =>
    set({ selectedExecutionId: execId, selectedExecutionBatchId: batchId }),
  closeExecution: () =>
    set({ selectedExecutionId: null, selectedExecutionBatchId: null }),
  openComparison: (target) =>
    set({
      // The jump can start outside the batch (e.g. the cross-batch search), so
      // it has to bring the view along instead of assuming it's already there.
      view: { kind: "batch-detail", batchId: target.batchId },
      compareTarget: target,
      batchTab: "compare",
      selectedExecutionId: null,
      selectedExecutionBatchId: null,
    }),
}));
