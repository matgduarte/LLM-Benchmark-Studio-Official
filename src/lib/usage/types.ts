import type { ExecutionStatus } from "@/lib/storage/types";

/**
 * Tipos da tela de Uso & Custos.
 *
 * A tela cruza duas fontes que têm granularidades diferentes por limitação das
 * APIs, e nunca devem ser somadas entre si:
 *
 *  - **Provedores** (`ProviderSpend`): gasto real cobrado na conta, lido do
 *    OpenRouter e da OpenAI. Ambos só expõem dados **agregados por dia+modelo**
 *    — não existe endpoint público com log por request nem status code.
 *  - **Execuções locais** (`LocalUsage`): os benchmarks rodados por este app,
 *    lidos de `/data`. É a única fonte com status, latência e custo por
 *    request, e cobre apenas o que passou por aqui.
 */

export type UsageProvider = "openrouter" | "openai";

/** Recorte de desfecho aplicado às execuções locais. */
export type UsageStatusFilter = "all" | "success" | "error";

export type UsageRangePreset = "24h" | "7d" | "30d" | "custom";

export interface UsageFilters {
  provider: UsageProvider | "all";
  status: UsageStatusFilter;
  preset: UsageRangePreset;
  /** ISO date `YYYY-MM-DD`. */
  from: string;
  /** ISO date `YYYY-MM-DD`. */
  to: string;
}

// ─── Provedores (agregado) ──────────────────────────────────────────────────

/** Uma linha de consumo agregada em (dia, provedor, modelo). */
export interface ProviderUsageRow {
  id: string;
  provider: UsageProvider;
  /** `YYYY-MM-DD`. */
  date: string;
  model: string;
  /** Provedor upstream que atendeu o modelo — só o OpenRouter informa. */
  upstream?: string;
  requests: number;
  promptTokens: number;
  completionTokens: number;
  reasoningTokens: number;
  totalTokens: number;
  /** USD. */
  cost: number;
}

export interface ProviderDailyBucket {
  date: string;
  provider: UsageProvider;
  requests: number;
  tokens: number;
  cost: number;
}

export interface ProviderModelBucket {
  model: string;
  provider: UsageProvider;
  requests: number;
  tokens: number;
  cost: number;
}

export interface ProviderCredits {
  provider: UsageProvider;
  label: string;
  /** Saldo restante, quando calculável. */
  balance?: number;
  /** Gasto acumulado na conta (não no intervalo filtrado). */
  usage?: number;
  currency?: string;
}

/** Uma linha por provedor consultado, mesmo quando ele falhou. */
export interface UsageSource {
  provider: UsageProvider;
  requests: number;
  /** Nota informativa ou mensagem de erro. */
  note?: string;
  /** True quando `note` descreve uma falha, não uma limitação conhecida. */
  failed?: boolean;
  /** True quando falta a chave necessária para este provedor. */
  missingKey?: boolean;
}

export interface ProviderSpend {
  rows: ProviderUsageRow[];
  daily: ProviderDailyBucket[];
  byModel: ProviderModelBucket[];
  credits: ProviderCredits[];
  totals: { requests: number; cost: number; tokens: number };
  sources: UsageSource[];
}

/** Resultado bruto de um provedor, antes da agregação. */
export interface ProviderFetchResult {
  rows: ProviderUsageRow[];
  credits?: ProviderCredits;
  note?: string;
  failed?: boolean;
}

// ─── Execuções locais (por request) ─────────────────────────────────────────

export interface LocalExecutionRow {
  id: string;
  batchId: string;
  batchName: string;
  modelId: string;
  modelLabel?: string;
  status: ExecutionStatus;
  /** ISO timestamp. */
  ranAt: string;
  durationMs?: number;
  cost: number;
  totalTokens: number;
  errorCode?: string;
  errorMessage?: string;
}

export interface LocalStatusBucket {
  status: ExecutionStatus;
  count: number;
  cost: number;
}

export interface LocalDailyBucket {
  date: string;
  completed: number;
  failed: number;
  /** Cancelada, interrompida, pendente — nem sucesso nem falha. */
  other: number;
  cost: number;
}

export interface LocalModelBucket {
  modelId: string;
  modelLabel?: string;
  total: number;
  completed: number;
  failed: number;
  cost: number;
  tokens: number;
  avgLatencyMs: number;
}

export interface LocalUsage {
  /** Execuções mais recentes; ver `truncated`. */
  rows: LocalExecutionRow[];
  byStatus: LocalStatusBucket[];
  daily: LocalDailyBucket[];
  byModel: LocalModelBucket[];
  totals: {
    total: number;
    completed: number;
    failed: number;
    cost: number;
    /** Quanto foi gasto em execuções que falharam. */
    failedCost: number;
    tokens: number;
    avgLatencyMs: number;
    /** 0–100. */
    successRate: number;
  };
  /** Execuções que casaram com o filtro, antes do corte de `rows`. */
  matched: number;
  truncated: boolean;
}

// ─── Resposta da rota ───────────────────────────────────────────────────────

export interface UsageReport {
  from: string;
  to: string;
  providers: ProviderSpend;
  local: LocalUsage;
}

export function usageProviderLabel(p: UsageProvider): string {
  return p === "openrouter" ? "OpenRouter" : "OpenAI";
}
