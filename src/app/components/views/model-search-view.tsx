"use client";

import { useMemo, useRef, useState } from "react";
import {
  ArrowUpDown,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock,
  Coins,
  Copy,
  Cpu,
  Eye,
  FlaskConical,
  Hash,
  Loader2,
  Search,
  X,
  XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useAppStore } from "@/lib/store";
import { useBatches, useExecutionSearch, useModelUsage } from "../hooks";
import { MetricCard } from "../metric-card";
import { StatusBadge } from "../status-badge";
import { tryParseJson } from "../json-utils";
import {
  formatCost,
  formatDateTime,
  formatLatency,
  formatPercent,
  formatRelativeTime,
  formatTokens,
} from "../format";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type {
  CrossBatchExecution,
  ExecutionStatus,
  ModelMetrics,
  ModelUsage,
} from "@/lib/storage/types";

/**
 * Cross-batch view: pick one or more models, get every execution they produced
 * in any batch. The batch dashboards answer "how did the models compare in this
 * experiment"; this answers the transposed question — "everything this model
 * ever did here".
 */

type SortKey = "model" | "batch" | "input" | "status" | "latency" | "cost" | "tokens" | "startedAt";
type SortDir = "asc" | "desc";

const STATUS_OPTIONS: Array<{ value: "all" | ExecutionStatus; label: string }> = [
  { value: "all", label: "Todos os status" },
  { value: "completed", label: "Concluídas" },
  { value: "failed", label: "Falhas" },
  { value: "running", label: "Executando" },
  { value: "pending", label: "Pendentes" },
  { value: "queued", label: "Em fila" },
  { value: "cancelled", label: "Canceladas" },
  { value: "interrupted", label: "Interrompidas" },
];

export function ModelSearchView() {
  const go = useAppStore((s) => s.go);
  const openExecution = useAppStore((s) => s.openExecution);
  const usageQ = useModelUsage();
  const batchesQ = useBatches();

  // Kept in the store so a detour into a batch doesn't reset the selection.
  const selected = useAppStore((s) => s.modelSearchModels);
  const setSelected = useAppStore((s) => s.setModelSearchModels);
  const [statusFilter, setStatusFilter] = useState<"all" | ExecutionStatus>("all");
  const [batchFilter, setBatchFilter] = useState<string>("all");
  /** What the user typed vs. what has been sent to the server (debounced). */
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("startedAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const resultQ = useExecutionSearch({
    modelIds: selected,
    status: statusFilter === "all" ? undefined : statusFilter,
    batchId: batchFilter === "all" ? undefined : batchFilter,
    query: appliedSearch,
  });

  const usage = usageQ.data;
  const executions = resultQ.data?.executions ?? [];

  /**
   * The text query is applied server-side (it has to see the full input, which
   * rows only preview), so all that's left here is ordering.
   */
  const rows = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;
    return [...executions].sort((a, b) => cmp(a, b, sortKey) * dir);
  }, [executions, sortKey, sortDir]);

  /** Debounced so typing doesn't fire a scan per keystroke. */
  function onSearchChange(value: string) {
    setSearch(value);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setAppliedSearch(value), 350);
  }

  /** Batches each model appears in — the metrics layer knows nothing of batches. */
  const batchesPerModel = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const e of executions) {
      let set = map.get(e.modelId);
      if (!set) map.set(e.modelId, (set = new Set()));
      set.add(e.batchId);
    }
    return map;
  }, [executions]);

  const distinctBatches = useMemo(
    () => new Set(executions.map((e) => e.batchId)).size,
    [executions]
  );

  const overall = resultQ.data?.overall;
  const perModel = resultQ.data?.perModel ?? [];
  const hasSelection = selected.length > 0;

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir(key === "model" || key === "batch" || key === "input" ? "asc" : "desc");
    }
  }

  return (
    <div className="space-y-6">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-xl border border-border/80 bg-gradient-to-br from-primary/5 via-background to-background p-6">
        <div className="bg-grid absolute inset-0 opacity-40" />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <Search className="h-5 w-5 text-primary" />
              <h1 className="text-2xl font-semibold tracking-tight">Buscar por modelo</h1>
            </div>
            <p className="max-w-2xl text-sm text-muted-foreground">
              Escolha um ou mais modelos e veja todas as execuções deles em todos os lotes já
              registrados — com métricas agregadas do histórico completo, não de um experimento só.
            </p>
          </div>
          {usage && (
            <div className="flex flex-wrap gap-2 text-xs">
              <Badge variant="outline" className="gap-1.5">
                <Cpu className="h-3 w-3" />
                {usage.models.length} modelos com execuções
              </Badge>
              <Badge variant="outline" className="gap-1.5">
                <Hash className="h-3 w-3" />
                {usage.totalExecutions.toLocaleString("pt-BR")} execuções
              </Badge>
              <Badge variant="outline" className="gap-1.5">
                <FlaskConical className="h-3 w-3" />
                {usage.totalBatches} lotes
              </Badge>
            </div>
          )}
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="space-y-3 py-4">
          <div className="flex flex-wrap items-center gap-2">
            <ModelMultiPicker
              models={usage?.models ?? []}
              loading={usageQ.isLoading}
              selected={selected}
              onChange={setSelected}
            />
            <Select
              value={statusFilter}
              onValueChange={(v) => setStatusFilter(v as "all" | ExecutionStatus)}
            >
              <SelectTrigger className="h-9 w-[170px] text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={batchFilter} onValueChange={setBatchFilter}>
              <SelectTrigger className="h-9 w-[240px] text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os lotes</SelectItem>
                {(batchesQ.data?.batches ?? []).map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="relative min-w-[220px] flex-1">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder="Buscar na resposta, entrada, erro ou nome do lote..."
                className="h-9 pl-8 text-sm"
              />
            </div>
            {resultQ.isFetching && (
              <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
            )}
          </div>

          {/* Selected models as removable chips */}
          {hasSelection && (
            <div className="flex flex-wrap items-center gap-1.5">
              {selected.map((id) => (
                <Badge
                  key={id}
                  variant="secondary"
                  className="gap-1 py-1 font-mono text-[10px] font-normal"
                >
                  {id}
                  <button
                    onClick={() => setSelected(selected.filter((m) => m !== id))}
                    className="rounded-sm text-muted-foreground transition hover:text-foreground"
                    aria-label={`Remover ${id}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
              <button
                onClick={() => setSelected([])}
                className="rounded px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                Limpar seleção
              </button>
            </div>
          )}
        </CardContent>
      </Card>

      {!hasSelection ? (
        <NoSelectionState
          loading={usageQ.isLoading}
          hasModels={(usage?.models.length ?? 0) > 0}
        />
      ) : (
        <>
          {/* Aggregate over the whole selection */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard
              label="Execuções encontradas"
              value={(overall?.total ?? 0).toLocaleString("pt-BR")}
              hint={`${distinctBatches} ${distinctBatches === 1 ? "lote" : "lotes"} · ${selected.length} ${selected.length === 1 ? "modelo" : "modelos"}`}
              icon={<Hash />}
              accent="primary"
            />
            <MetricCard
              label="Taxa de sucesso"
              value={formatPercent(overall?.successRate)}
              hint={`${overall?.completed ?? 0} concluídas · ${overall?.failed ?? 0} falhas`}
              icon={<CheckCircle2 />}
              accent="emerald"
            />
            <MetricCard
              label="Custo total"
              value={formatCost(overall?.totalCost)}
              hint={`média ${formatCost(overall?.avgCost)}/exec · base ${overall?.costSamples ?? 0} exec`}
              icon={<Coins />}
              accent="violet"
            />
            <MetricCard
              label="Latência média"
              value={formatLatency(overall?.avgLatencyMs)}
              hint={`base ${overall?.latencySamples ?? 0} execuções com resposta`}
              icon={<Clock />}
              accent="amber"
            />
          </div>

          {/* Per-model comparison across every batch */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Resumo por modelo</CardTitle>
              <CardDescription>
                Agregado de todas as execuções que passam pelos filtros acima, somando todos os
                lotes. Execuções concluídas sem resposta ficam fora das médias, como nos painéis de
                lote.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <PerModelTable metrics={perModel} batchesPerModel={batchesPerModel} />
            </CardContent>
          </Card>

          {/* Executions */}
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-base font-semibold tracking-tight">Execuções</h2>
              <div className="flex items-center gap-2">
                <CopyJsonButton rows={rows} />
                <Badge variant="secondary" className="h-9 gap-1.5 px-3">
                  {rows.length} {rows.length === 1 ? "execução" : "execuções"}
                </Badge>
              </div>
            </div>

            <Card>
              <div className="overflow-hidden rounded-lg border border-border/60">
                <ScrollArea className="h-[620px] scrollbar-thin">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 z-10 bg-muted/80 backdrop-blur">
                      <tr className="text-left text-xs text-muted-foreground">
                        <Th label="Modelo" col="model" align="left" active={sortKey} dir={sortDir} onClick={toggleSort} />
                        <Th label="Lote" col="batch" align="left" active={sortKey} dir={sortDir} onClick={toggleSort} />
                        <Th label="Entrada" col="input" align="left" active={sortKey} dir={sortDir} onClick={toggleSort} />
                        <th className="px-2 py-2 font-medium">Rep</th>
                        <Th label="Status" col="status" align="left" active={sortKey} dir={sortDir} onClick={toggleSort} />
                        <Th label="Latência" col="latency" active={sortKey} dir={sortDir} onClick={toggleSort} />
                        <Th label="Custo" col="cost" active={sortKey} dir={sortDir} onClick={toggleSort} />
                        <Th label="Tokens" col="tokens" active={sortKey} dir={sortDir} onClick={toggleSort} />
                        <Th label="Início" col="startedAt" active={sortKey} dir={sortDir} onClick={toggleSort} />
                        <th className="px-2 py-2 text-right font-medium">Resposta</th>
                      </tr>
                    </thead>
                    <tbody>
                      {resultQ.isLoading ? (
                        Array.from({ length: 8 }).map((_, i) => (
                          <tr key={i} className="border-b border-border/40">
                            <td colSpan={10} className="px-3 py-3">
                              <Skeleton className="h-5 w-full" />
                            </td>
                          </tr>
                        ))
                      ) : rows.length === 0 ? (
                        <tr>
                          <td
                            colSpan={10}
                            className="px-3 py-12 text-center text-sm text-muted-foreground"
                          >
                            Nenhuma execução corresponde aos filtros.
                          </td>
                        </tr>
                      ) : (
                        rows.map((e) => (
                          <ExecutionRow
                            key={`${e.batchId}:${e.id}`}
                            exec={e}
                            onOpen={() => openExecution(e.id, e.batchId)}
                            onOpenBatch={() => go({ kind: "batch-detail", batchId: e.batchId })}
                          />
                        ))
                      )}
                    </tbody>
                  </table>
                </ScrollArea>
              </div>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

function cmp(a: CrossBatchExecution, b: CrossBatchExecution, key: SortKey): number {
  switch (key) {
    case "model":
      return (a.modelLabel ?? a.modelId).localeCompare(b.modelLabel ?? b.modelId);
    case "batch":
      return a.batchName.localeCompare(b.batchName);
    case "input":
      return (a.inputLabel ?? a.inputId).localeCompare(b.inputLabel ?? b.inputId);
    case "status":
      return a.status.localeCompare(b.status);
    case "latency":
      return (a.durationMs ?? 0) - (b.durationMs ?? 0);
    case "cost":
      return (a.cost ?? 0) - (b.cost ?? 0);
    case "tokens":
      return (a.usage.totalTokens ?? 0) - (b.usage.totalTokens ?? 0);
    case "startedAt":
      return (a.startedAt ?? a.createdAt).localeCompare(b.startedAt ?? b.createdAt);
  }
}

/** Multi-select over the models that actually have executions on disk. */
function ModelMultiPicker({
  models,
  loading,
  selected,
  onChange,
}: {
  models: ModelUsage[];
  loading: boolean;
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? models.filter(
          (m) =>
            m.modelId.toLowerCase().includes(q) ||
            (m.modelLabel ?? "").toLowerCase().includes(q)
        )
      : models;
    // Selected first so the current choice never scrolls out of reach.
    return [...list].sort((a, b) => {
      const sa = selected.includes(a.modelId) ? 0 : 1;
      const sb = selected.includes(b.modelId) ? 0 : 1;
      if (sa !== sb) return sa - sb;
      return b.executions - a.executions;
    });
  }, [models, query, selected]);

  const label =
    selected.length === 0
      ? "Selecionar modelos..."
      : selected.length === 1
        ? selected[0]
        : `${selected.length} modelos selecionados`;

  function toggle(id: string) {
    onChange(
      selected.includes(id) ? selected.filter((m) => m !== id) : [...selected, id]
    );
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className="h-9 w-[320px] justify-between gap-2 px-3 text-sm font-normal"
        >
          <span className="truncate">{label}</span>
          <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[420px] p-0">
        <div className="space-y-2 border-b border-border/60 p-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar modelo..."
              className="h-8 pl-8 text-xs"
            />
          </div>
          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span>
              {selected.length} de {models.length} selecionado{selected.length === 1 ? "" : "s"}
            </span>
            <div className="flex gap-1">
              <button
                onClick={() => onChange(filtered.map((m) => m.modelId))}
                className="rounded px-1.5 py-0.5 hover:bg-muted hover:text-foreground"
              >
                {query.trim() ? "Selecionar filtrados" : "Todos"}
              </button>
              <button
                onClick={() => onChange([])}
                className="rounded px-1.5 py-0.5 hover:bg-muted hover:text-foreground"
              >
                Limpar
              </button>
            </div>
          </div>
        </div>
        <ScrollArea className="h-[320px] scrollbar-thin">
          <div className="space-y-1 p-2">
            {loading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-11 w-full" />
              ))
            ) : filtered.length === 0 ? (
              <p className="py-8 text-center text-xs text-muted-foreground">
                {models.length === 0
                  ? "Nenhum modelo com execuções registradas."
                  : "Nenhum modelo corresponde à busca."}
              </p>
            ) : (
              filtered.map((m) => (
                <ModelOption
                  key={m.modelId}
                  usage={m}
                  selected={selected.includes(m.modelId)}
                  onToggle={() => toggle(m.modelId)}
                />
              ))
            )}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}

function ModelOption({
  usage,
  selected,
  onToggle,
}: {
  usage: ModelUsage;
  selected: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-lg border px-2.5 py-2 text-left transition",
        selected
          ? "border-primary/40 bg-primary/10"
          : "border-border/60 bg-background hover:border-border hover:bg-muted/40"
      )}
    >
      <span
        className={cn(
          "flex h-4 w-4 shrink-0 items-center justify-center rounded border",
          selected ? "border-primary bg-primary text-primary-foreground" : "border-border"
        )}
      >
        {selected && <Check className="h-3 w-3" />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium leading-tight">
          {usage.modelLabel ?? usage.modelId}
        </p>
        <p className="truncate font-mono text-[10px] text-muted-foreground">{usage.modelId}</p>
      </div>
      <div className="shrink-0 text-right">
        <p className="text-[11px] font-medium tabular-nums">
          {usage.executions} exec · {usage.batches} {usage.batches === 1 ? "lote" : "lotes"}
        </p>
        <p className="text-[10px] tabular-nums text-muted-foreground">
          {usage.failed > 0 ? `${usage.failed} falhas · ` : ""}
          {formatRelativeTime(usage.lastRunAt)}
        </p>
      </div>
    </button>
  );
}

/** Same columns as the batch comparison table, plus the batch spread. */
function PerModelTable({
  metrics,
  batchesPerModel,
}: {
  metrics: ModelMetrics[];
  batchesPerModel: Map<string, Set<string>>;
}) {
  const sorted = useMemo(
    () =>
      [...metrics].sort(
        (a, b) => b.total - a.total || b.successRate - a.successRate || a.modelId.localeCompare(b.modelId)
      ),
    [metrics]
  );

  return (
    <div className="overflow-x-auto scrollbar-thin">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-xs text-muted-foreground">
            <th className="py-2 pr-3 font-medium">Modelo</th>
            <th className="px-2 py-2 text-right font-medium">Lotes</th>
            <th className="px-2 py-2 text-right font-medium">Execs</th>
            <th className="px-2 py-2 text-right font-medium">Sucesso</th>
            <th className="px-2 py-2 text-right font-medium">Lat. média</th>
            <th className="px-2 py-2 text-right font-medium">P95</th>
            <th className="px-2 py-2 text-right font-medium">Custo total</th>
            <th className="px-2 py-2 text-right font-medium">Custo/exec</th>
            <th className="px-2 py-2 text-right font-medium">Tokens</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((m) => {
            const empty = m.total === 0;
            return (
              <tr
                key={m.modelId}
                className={cn(
                  "border-b border-border/40 last:border-0 hover:bg-muted/30",
                  empty && "text-muted-foreground"
                )}
              >
                <td className="py-2 pr-3">
                  <p className="font-medium">{m.modelLabel ?? m.modelId}</p>
                  <p className="font-mono text-[10px] text-muted-foreground">{m.modelId}</p>
                </td>
                {empty ? (
                  <td colSpan={8} className="px-2 py-2 text-right text-xs">
                    Nenhuma execução com os filtros atuais.
                  </td>
                ) : (
                  <>
                    <td className="px-2 py-2 text-right tabular-nums">
                      {batchesPerModel.get(m.modelId)?.size ?? 0}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">
                      <span className="text-emerald-600 dark:text-emerald-400">{m.completed}</span>
                      {m.failed > 0 && <span className="text-destructive"> / {m.failed}</span>}
                      <span className="text-muted-foreground"> de {m.total}</span>
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">
                      {formatPercent(m.successRate)}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">
                      {formatLatency(m.avgLatencyMs)}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums text-muted-foreground">
                      {formatLatency(m.p95LatencyMs)}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums font-medium text-violet-600 dark:text-violet-400">
                      {formatCost(m.totalCost)}
                    </td>
                    <td
                      className="px-2 py-2 text-right tabular-nums text-muted-foreground"
                      title={`média sobre ${m.costSamples} execução(ões) com custo conhecido`}
                    >
                      {formatCost(m.avgCost)}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">
                      {formatTokens(m.totalTokens)}
                    </td>
                  </>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Th({
  label,
  col,
  active,
  dir,
  align = "right",
  onClick,
}: {
  label: string;
  col: SortKey;
  active: SortKey;
  dir: SortDir;
  align?: "left" | "right";
  onClick: (k: SortKey) => void;
}) {
  return (
    <th className={cn("px-2 py-2 font-medium", align === "right" ? "text-right" : "text-left")}>
      <button
        className={cn(
          "inline-flex items-center gap-1 transition hover:text-foreground",
          active === col && "text-foreground"
        )}
        onClick={() => onClick(col)}
      >
        {label}
        <ArrowUpDown className={cn("h-3 w-3", active === col && dir === "asc" && "rotate-180")} />
      </button>
    </th>
  );
}

function ExecutionRow({
  exec,
  onOpen,
  onOpenBatch,
}: {
  exec: CrossBatchExecution;
  onOpen: () => void;
  onOpenBatch: () => void;
}) {
  const preview = (exec.status === "failed" ? exec.errorMessage : exec.response)?.replace(
    /\s+/g,
    " "
  );

  return (
    <tr
      onClick={onOpen}
      className="cursor-pointer border-b border-border/40 last:border-0 hover:bg-muted/40"
    >
      <td className="px-3 py-2">
        <div className="flex items-center gap-2">
          <StatusIcon status={exec.status} />
          <div className="min-w-0">
            <p className="truncate text-xs font-medium">{exec.modelLabel ?? exec.modelId}</p>
            <p className="truncate font-mono text-[10px] text-muted-foreground">{exec.modelId}</p>
          </div>
        </div>
      </td>
      <td className="max-w-[200px] px-2 py-2">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onOpenBatch();
          }}
          className="max-w-full truncate text-left text-xs text-primary hover:underline"
          title={`Abrir lote: ${exec.batchName}`}
        >
          {exec.batchName}
        </button>
        <p className="text-[10px] text-muted-foreground">
          {formatRelativeTime(exec.batchCreatedAt)}
        </p>
      </td>
      <td className="max-w-[180px] px-2 py-2">
        <p className="truncate text-xs">{exec.inputLabel ?? exec.inputId}</p>
        <p
          className="truncate font-mono text-[10px] text-muted-foreground"
          title={exec.inputPreview + (exec.inputTruncated ? "…" : "")}
        >
          {exec.inputPreview.slice(0, 60)}
        </p>
      </td>
      <td className="px-2 py-2 text-center tabular-nums text-muted-foreground">
        #{exec.repetition}
      </td>
      <td className="px-2 py-2">
        <StatusBadge status={exec.status} />
      </td>
      <td className="px-2 py-2 text-right tabular-nums">{formatLatency(exec.durationMs)}</td>
      <td className="px-2 py-2 text-right tabular-nums">{formatCost(exec.cost)}</td>
      <td className="px-2 py-2 text-right tabular-nums text-muted-foreground">
        {exec.usage.totalTokens !== undefined ? formatTokens(exec.usage.totalTokens) : "—"}
      </td>
      <td className="px-2 py-2 text-right text-xs text-muted-foreground">
        {formatDateTime(exec.startedAt)}
      </td>
      <td className="px-2 py-2">
        <div className="flex items-center justify-end gap-2">
          <span
            className={cn(
              "hidden max-w-[220px] truncate font-mono text-[10px] xl:block",
              exec.status === "failed" ? "text-destructive" : "text-muted-foreground"
            )}
            title={preview}
          >
            {preview || "—"}
          </span>
          <Button variant="ghost" size="sm" className="h-7 shrink-0 gap-1 text-xs">
            <Eye className="h-3 w-3" />
            Ver
          </Button>
        </div>
      </td>
    </tr>
  );
}

function StatusIcon({ status }: { status: ExecutionStatus }) {
  if (status === "completed")
    return <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-500" />;
  if (status === "failed") return <XCircle className="h-3.5 w-3.5 shrink-0 text-destructive" />;
  if (status === "running")
    return <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-primary" />;
  return <span className="h-2 w-2 shrink-0 rounded-full bg-muted-foreground" />;
}

/**
 * Copies the visible rows as a JSON array. JSON responses are embedded as
 * objects (not as escaped strings) so the export stays machine-readable.
 */
function CopyJsonButton({ rows }: { rows: CrossBatchExecution[] }) {
  const [copied, setCopied] = useState(false);

  function copy() {
    const payload = rows.map((e) => ({
      model: e.modelId,
      batch: e.batchName,
      batchId: e.batchId,
      input: e.inputLabel ?? e.inputId,
      repetition: e.repetition,
      status: e.status,
      ...(e.errorMessage ? { error: e.errorMessage } : {}),
      response: tryParseJson(e.response) ?? e.response ?? null,
    }));
    navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
    setCopied(true);
    toast.success(
      `${payload.length} ${payload.length === 1 ? "execução copiada" : "execuções copiadas"}`
    );
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <Button
      variant="outline"
      onClick={copy}
      disabled={rows.length === 0}
      title="Copiar as execuções visíveis como array JSON"
      className="h-9 gap-1.5 px-3 text-xs font-normal"
    >
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      Copiar JSON
    </Button>
  );
}

function NoSelectionState({ loading, hasModels }: { loading: boolean; hasModels: boolean }) {
  const go = useAppStore((s) => s.go);
  return (
    <Card className="border-dashed py-12">
      <CardContent className="flex flex-col items-center justify-center gap-4 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <Cpu className="h-7 w-7" />
        </span>
        <div className="space-y-1.5">
          <h3 className="text-lg font-semibold">
            {loading
              ? "Carregando modelos..."
              : hasModels
                ? "Selecione um ou mais modelos"
                : "Nenhuma execução registrada ainda"}
          </h3>
          <p className="max-w-md text-sm text-muted-foreground">
            {hasModels || loading
              ? "As execuções de todos os lotes serão reunidas aqui, com métricas agregadas do histórico completo de cada modelo."
              : "Só aparecem aqui modelos que já produziram execuções. Crie um experimento e execute-o para começar."}
          </p>
        </div>
        {!loading && !hasModels && (
          <Button onClick={() => go({ kind: "create-batch" })} className="gap-2">
            <FlaskConical className="h-4 w-4" />
            Criar experimento
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
