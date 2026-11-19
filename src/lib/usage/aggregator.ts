import type {
  LocalDailyBucket,
  LocalExecutionRow,
  LocalModelBucket,
  LocalStatusBucket,
  LocalUsage,
  ProviderDailyBucket,
  ProviderModelBucket,
  ProviderSpend,
  ProviderUsageRow,
} from "./types";
import type { ExecutionStatus } from "@/lib/storage/types";

/** Agrega as linhas dos provedores nos buckets consumidos pelos gráficos. */
export function bucketizeProviders(
  rows: ProviderUsageRow[]
): Omit<ProviderSpend, "credits" | "sources"> {
  const dailyMap = new Map<string, ProviderDailyBucket>();
  const modelMap = new Map<string, ProviderModelBucket>();

  for (const r of rows) {
    const dk = `${r.date}|${r.provider}`;
    const d = dailyMap.get(dk);
    if (d) {
      d.requests += r.requests;
      d.tokens += r.totalTokens;
      d.cost += r.cost;
    } else {
      dailyMap.set(dk, {
        date: r.date,
        provider: r.provider,
        requests: r.requests,
        tokens: r.totalTokens,
        cost: r.cost,
      });
    }

    const mk = `${r.provider}|${r.model}`;
    const m = modelMap.get(mk);
    if (m) {
      m.requests += r.requests;
      m.tokens += r.totalTokens;
      m.cost += r.cost;
    } else {
      modelMap.set(mk, {
        model: r.model,
        provider: r.provider,
        requests: r.requests,
        tokens: r.totalTokens,
        cost: r.cost,
      });
    }
  }

  return {
    rows: [...rows].sort((a, b) => (a.date === b.date ? b.cost - a.cost : a.date < b.date ? 1 : -1)),
    daily: Array.from(dailyMap.values()).sort((a, b) => (a.date < b.date ? -1 : 1)),
    byModel: Array.from(modelMap.values()).sort((a, b) => b.cost - a.cost || b.requests - a.requests),
    totals: {
      requests: rows.reduce((s, r) => s + r.requests, 0),
      cost: rows.reduce((s, r) => s + r.cost, 0),
      tokens: rows.reduce((s, r) => s + r.totalTokens, 0),
    },
  };
}

/** Execuções que já terminaram e não são sucesso nem falha. */
function isOther(status: ExecutionStatus): boolean {
  return status !== "completed" && status !== "failed";
}

/** Agrega as execuções locais. `rows` já vem filtrado e ordenado (recente primeiro). */
export function bucketizeLocal(rows: LocalExecutionRow[], rowLimit: number): LocalUsage {
  const statusMap = new Map<ExecutionStatus, LocalStatusBucket>();
  const dailyMap = new Map<string, LocalDailyBucket>();
  const modelMap = new Map<string, LocalModelBucket & { latencySum: number; timed: number }>();

  let cost = 0;
  let failedCost = 0;
  let tokens = 0;
  let completed = 0;
  let failed = 0;
  let latencySum = 0;
  let timed = 0;

  for (const r of rows) {
    cost += r.cost;
    tokens += r.totalTokens;
    if (r.status === "completed") completed++;
    if (r.status === "failed") {
      failed++;
      failedCost += r.cost;
    }
    if (r.durationMs && r.durationMs > 0) {
      latencySum += r.durationMs;
      timed++;
    }

    const s = statusMap.get(r.status);
    if (s) {
      s.count++;
      s.cost += r.cost;
    } else {
      statusMap.set(r.status, { status: r.status, count: 1, cost: r.cost });
    }

    const date = r.ranAt.slice(0, 10);
    const d = dailyMap.get(date);
    if (d) {
      if (r.status === "completed") d.completed++;
      else if (r.status === "failed") d.failed++;
      else d.other++;
      d.cost += r.cost;
    } else {
      dailyMap.set(date, {
        date,
        completed: r.status === "completed" ? 1 : 0,
        failed: r.status === "failed" ? 1 : 0,
        other: isOther(r.status) ? 1 : 0,
        cost: r.cost,
      });
    }

    const m = modelMap.get(r.modelId);
    if (m) {
      m.total++;
      if (r.status === "completed") m.completed++;
      if (r.status === "failed") m.failed++;
      m.cost += r.cost;
      m.tokens += r.totalTokens;
      m.modelLabel ??= r.modelLabel;
      if (r.durationMs && r.durationMs > 0) {
        m.latencySum += r.durationMs;
        m.timed++;
      }
    } else {
      modelMap.set(r.modelId, {
        modelId: r.modelId,
        modelLabel: r.modelLabel,
        total: 1,
        completed: r.status === "completed" ? 1 : 0,
        failed: r.status === "failed" ? 1 : 0,
        cost: r.cost,
        tokens: r.totalTokens,
        avgLatencyMs: 0,
        latencySum: r.durationMs && r.durationMs > 0 ? r.durationMs : 0,
        timed: r.durationMs && r.durationMs > 0 ? 1 : 0,
      });
    }
  }

  const byModel = Array.from(modelMap.values())
    .map(({ latencySum: sum, timed: n, ...m }) => ({
      ...m,
      avgLatencyMs: n > 0 ? Math.round(sum / n) : 0,
    }))
    .sort((a, b) => b.total - a.total);

  const total = rows.length;
  // Sucesso é medido sobre execuções decididas: pendentes e canceladas não
  // contam nem como acerto nem como erro.
  const decided = completed + failed;

  return {
    rows: rows.slice(0, rowLimit),
    byStatus: Array.from(statusMap.values()).sort((a, b) => b.count - a.count),
    daily: Array.from(dailyMap.values()).sort((a, b) => (a.date < b.date ? -1 : 1)),
    byModel,
    totals: {
      total,
      completed,
      failed,
      cost,
      failedCost,
      tokens,
      avgLatencyMs: timed > 0 ? Math.round(latencySum / timed) : 0,
      successRate: decided > 0 ? (completed / decided) * 100 : 0,
    },
    matched: total,
    truncated: total > rowLimit,
  };
}

/** Formato compacto de USD para KPIs e eixos. */
export function formatUsd(n?: number): string {
  if (n === undefined || !Number.isFinite(n)) return "—";
  if (n === 0) return "$0.00";
  if (n < 0.01) return "<$0.01";
  if (n < 1) return `$${n.toFixed(4)}`;
  if (n < 1000) return `$${n.toFixed(2)}`;
  return `$${(n / 1000).toFixed(2)}k`;
}

/** `YYYY-MM-DD` → `DD/MM` (rótulo do eixo X). */
export function formatDateShort(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function daysAgoISO(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}
