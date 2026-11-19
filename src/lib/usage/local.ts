import { scanAllExecutions } from "@/lib/storage/executions-index";
import type { LocalExecutionRow, UsageStatusFilter } from "./types";

/**
 * Execuções de benchmark gravadas em `/data`.
 *
 * É a única fonte com desfecho, latência e custo **por request** — nenhuma API
 * de provedor expõe isso. Em compensação, cobre só o que rodou por este app.
 */

/** Quantas execuções a tabela recebe; a agregação continua vendo todas. */
export const LOCAL_ROW_LIMIT = 500;

export interface LocalUsageFilters {
  /** ISO date `YYYY-MM-DD`, inclusivo. */
  from: string;
  /** ISO date `YYYY-MM-DD`, inclusivo. */
  to: string;
  status: UsageStatusFilter;
}

/** Execuções no intervalo, mais recentes primeiro. */
export async function loadLocalExecutions(
  filters: LocalUsageFilters
): Promise<LocalExecutionRow[]> {
  const all = await scanAllExecutions();
  const rows: LocalExecutionRow[] = [];

  for (const e of all) {
    // `startedAt` é o momento real da chamada; execuções que nunca saíram da
    // fila só têm `createdAt`.
    const ranAt = e.startedAt ?? e.createdAt;
    const day = ranAt.slice(0, 10);
    if (day < filters.from || day > filters.to) continue;

    if (filters.status === "success" && e.status !== "completed") continue;
    if (filters.status === "error" && e.status !== "failed") continue;

    rows.push({
      id: e.id,
      batchId: e.batchId,
      batchName: e.batchName,
      modelId: e.modelId,
      modelLabel: e.modelLabel,
      status: e.status,
      ranAt,
      durationMs: e.durationMs,
      cost: e.cost ?? 0,
      totalTokens: e.usage?.totalTokens ?? 0,
      errorCode: e.errorCode,
      errorMessage: e.errorMessage,
    });
  }

  return rows.sort((a, b) => b.ranAt.localeCompare(a.ranAt));
}
