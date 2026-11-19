"use client";

import { useMemo } from "react";
import {
  ArrowLeft,
  Play,
  Square,
  Loader2,
  Clock,
  Coins,
  CheckCircle2,
  XCircle,
  Gauge,
  Hash,
  TrendingUp,
  Activity,
  Zap,
  Brain,
  Cpu,
  Code2,
  CopyPlus,
  AlertTriangle,
  Columns3,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { useAppStore } from "@/lib/store";
import { useBatch, useBatchStatus, useMetrics, useRunBatch, useCancelBatch } from "../hooks";
import { MetricCard } from "../metric-card";
import {
  LatencyComparisonChart,
  CostComparisonChart,
  TokenComparisonChart,
  SuccessRateChart,
  LatencyDistributionChart,
  EfficiencyChart,
} from "../charts/comparison-charts";
import { ExecutionTable } from "../execution-table";
import { RepComparison } from "../rep-comparison";
import {
  formatCost,
  formatLatency,
  formatPercent,
  formatTokens,
  progressPercent,
  formatDateTime,
} from "../format";
import { toast } from "sonner";

export function BatchDetailView({ batchId }: { batchId: string }) {
  const go = useAppStore((s) => s.go);
  const tab = useAppStore((s) => s.batchTab);
  const setTab = useAppStore((s) => s.setBatchTab);
  const batchQ = useBatch(batchId);
  const statusQ = useBatchStatus(batchId, batchQ.data?.isRunning ?? false);
  const metricsQ = useMetrics(batchId, batchQ.data?.isRunning ?? false);
  const run = useRunBatch();
  const cancel = useCancelBatch();

  const meta = batchQ.data?.meta;
  const status = statusQ.data?.status ?? batchQ.data?.status;
  const isRunning = statusQ.data?.isRunning ?? batchQ.data?.isRunning ?? false;
  const metrics = metricsQ.data?.metrics;

  const pct = progressPercent(status?.completed ?? 0, status?.failed ?? 0, status?.total ?? 0);

  async function handleRun() {
    try {
      const r = await run.mutateAsync(batchId);
      toast.success("Execução iniciada", { description: `${r.queued} execuções em fila.` });
    } catch (e) {
      toast.error("Falha ao iniciar", { description: (e as Error).message });
    }
  }

  async function handleCancel() {
    try {
      const r = await cancel.mutateAsync(batchId);
      toast.success("Lote cancelado", { description: `${r.cancelled} execuções canceladas.` });
    } catch (e) {
      toast.error("Falha ao cancelar", { description: (e as Error).message });
    }
  }

  if (batchQ.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-9 w-48" />
        <Skeleton className="h-24 w-full" />
        <div className="grid gap-4 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
      </div>
    );
  }

  if (batchQ.isError || !meta) {
    return (
      <Card className="py-12">
        <CardContent className="flex flex-col items-center gap-3 text-center">
          <XCircle className="h-8 w-8 text-destructive" />
          <p className="text-sm text-muted-foreground">Lote não encontrado ou erro ao carregar.</p>
          <Button variant="secondary" onClick={() => go({ kind: "batches" })}>
            Voltar para lista
          </Button>
        </CardContent>
      </Card>
    );
  }

  const overall = metrics?.overall;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => go({ kind: "batches" })} className="h-9 w-9">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-semibold tracking-tight">{meta.name}</h1>
              {isRunning ? (
                <Badge className="gap-1.5 bg-primary/10 text-primary" variant="outline">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
                  Em execução
                </Badge>
              ) : pct >= 100 ? (
                <Badge className="gap-1.5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" variant="outline">
                  <CheckCircle2 className="h-3 w-3" /> Finalizado
                </Badge>
              ) : null}
            </div>
            {meta.description ? (
              <p className="text-sm text-muted-foreground">{meta.description}</p>
            ) : (
              <p className="font-mono text-xs text-muted-foreground">{meta.id}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            className="gap-2"
            title="Abre um novo experimento com esta mesma configuração"
            onClick={() => go({ kind: "create-batch", duplicateFrom: batchId })}
          >
            <CopyPlus className="h-4 w-4" />
            Refazer
          </Button>
          {isRunning ? (
            <Button variant="destructive" className="gap-2" onClick={handleCancel} disabled={cancel.isPending}>
              <Square className="h-4 w-4" />
              Cancelar
            </Button>
          ) : (
            <Button className="gap-2" onClick={handleRun} disabled={run.isPending}>
              {run.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              {pct > 0 ? "Retomar" : "Executar"}
            </Button>
          )}
        </div>
      </div>

      {/* Progress bar */}
      <Card className="gap-0">
        <CardContent className="py-4">
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="font-medium">Progresso do lote</span>
            <span className="tabular-nums text-muted-foreground">
              {status?.completed ?? 0} concluídas · {status?.failed ?? 0} falhas ·{" "}
              {(status?.running ?? 0) + (status?.pending ?? 0)} restantes
            </span>
          </div>
          <Progress value={pct} className="h-2" />
          <div className="mt-1.5 flex items-center justify-between text-xs text-muted-foreground">
            <span>{formatPercent(pct / 100)}</span>
            <span>Iniciado: {formatDateTime(status?.startedAt)}</span>
          </div>
        </CardContent>
      </Card>

      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <TabsList className="h-9">
          <TabsTrigger value="overview" className="gap-1.5">
            <Gauge className="h-3.5 w-3.5" /> Visão geral
          </TabsTrigger>
          <TabsTrigger value="metrics" className="gap-1.5">
            <TrendingUp className="h-3.5 w-3.5" /> Métricas & gráficos
          </TabsTrigger>
          <TabsTrigger value="executions" className="gap-1.5">
            <Activity className="h-3.5 w-3.5" /> Execuções
          </TabsTrigger>
          <TabsTrigger value="compare" className="gap-1.5">
            <Columns3 className="h-3.5 w-3.5" /> Comparar reps
          </TabsTrigger>
          <TabsTrigger value="config" className="gap-1.5">
            <Cpu className="h-3.5 w-3.5" /> Configuração
          </TabsTrigger>
        </TabsList>

        {/* Overview */}
        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard
              label="Execuções totais"
              value={(status?.total ?? 0).toLocaleString("pt-BR")}
              hint={`${status?.completed ?? 0} concluídas · ${status?.failed ?? 0} falhas`}
              icon={<Hash />}
              accent="primary"
            />
            <MetricCard
              label="Taxa de sucesso"
              value={formatPercent(overall?.successRate)}
              hint={`${overall?.completed ?? 0}/${status?.total ?? 0}`}
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

          {(overall?.emptyResponses ?? 0) > 0 && (
            <EmptyResponsesNotice
              count={overall!.emptyResponses}
              perModel={metrics?.perModel ?? []}
            />
          )}

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard
              label="Tokens de entrada"
              value={formatTokens(overall?.totalPromptTokens)}
              icon={<Brain />}
              accent="primary"
            />
            <MetricCard
              label="Tokens de saída"
              value={formatTokens(overall?.totalCompletionTokens)}
              icon={<Zap />}
              accent="emerald"
            />
            <MetricCard
              label="Tokens totais"
              value={formatTokens(overall?.totalTokens)}
              icon={<Hash />}
              accent="violet"
            />
            <MetricCard
              label="Modelos no lote"
              value={(meta.models.length).toString()}
              hint={`${meta.inputs.length} inputs · ${meta.repetitions}x reps`}
              icon={<Cpu />}
              accent="amber"
            />
          </div>

          {/* Status breakdown */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Distribuição de status</CardTitle>
              <CardDescription>Estado atual de todas as execuções do lote.</CardDescription>
            </CardHeader>
            <CardContent>
              <StatusBreakdown status={status} />
            </CardContent>
          </Card>

          {/* Model leaderboard */}
          {metrics && metrics.perModel.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Ranking de modelos</CardTitle>
                <CardDescription>
                  Comparação rápida por taxa de sucesso, latência média e custo total.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ModelLeaderboard metrics={metrics.perModel} />
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Metrics & charts */}
        <TabsContent value="metrics" className="space-y-4">
          {!metrics || metrics.perModel.length === 0 ? (
            <Card className="py-12">
              <CardContent className="flex flex-col items-center gap-2 text-center">
                <Activity className="h-8 w-8 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  Sem métricas ainda. Execute o lote para gerar gráficos comparativos.
                </p>
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="grid gap-4 lg:grid-cols-2">
                <ChartCard title="Latência por modelo" description="Mín / média / P95 / máx (ms)">
                  <LatencyComparisonChart metrics={metrics.perModel} />
                </ChartCard>
                <ChartCard title="Custo total por modelo" description="Soma dos custos (USD)">
                  <CostComparisonChart metrics={metrics.perModel} />
                </ChartCard>
                <ChartCard title="Consumo de tokens" description="Entrada vs saída (empilhado)">
                  <TokenComparisonChart metrics={metrics.perModel} />
                </ChartCard>
                <ChartCard title="Taxa de sucesso" description="% de execuções concluídas">
                  <SuccessRateChart metrics={metrics.perModel} />
                </ChartCard>
                <ChartCard title="Distribuição de latência" description="Cada ponto = 1 execução concluída">
                  <LatencyDistributionChart metrics={metrics.perModel} />
                </ChartCard>
                <ChartCard
                  title="Fronteira de eficiência"
                  description="Custo médio × latência média (área = tokens)"
                >
                  <EfficiencyChart metrics={metrics.perModel} />
                </ChartCard>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Tabela comparativa por modelo</CardTitle>
                </CardHeader>
                <CardContent>
                  <ModelComparisonTable metrics={metrics.perModel} />
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        {/* Executions */}
        <TabsContent value="executions" className="space-y-4">
          <ExecutionTable batchId={batchId} />
        </TabsContent>

        {/* Rep comparison */}
        <TabsContent value="compare" className="space-y-4">
          <RepComparison batchId={batchId} meta={meta} />
        </TabsContent>

        {/* Config */}
        <TabsContent value="config" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">System prompt</CardTitle>
              </CardHeader>
              <CardContent>
                <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-lg bg-muted/40 p-3 font-mono text-xs scrollbar-thin">
                  {meta.systemPrompt || "(vazio)"}
                </pre>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Parâmetros</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <ConfigRow label="Repetições" value={`${meta.repetitions}x`} />
                <ConfigRow label="Concorrência" value={`${meta.concurrency}`} />
                <ConfigRow label="Timeout" value={`${meta.timeoutMs / 1000}s`} />
                <ConfigRow
                  label="Temperature"
                  value={meta.params.temperature !== undefined ? String(meta.params.temperature) : "default"}
                />
                <ConfigRow
                  label="Max tokens"
                  value={meta.params.maxTokens !== undefined ? String(meta.params.maxTokens) : "default"}
                />
                <ConfigRow
                  label="Top P"
                  value={meta.params.topP !== undefined ? String(meta.params.topP) : "default"}
                />
                <ConfigRow label="Criado em" value={formatDateTime(meta.createdAt)} />
              </CardContent>
            </Card>

            {/* Structured output / require_parameters */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Code2 className="h-4 w-4 text-primary" />
                  Saída estruturada
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                {meta.params.responseFormat ? (
                  <div className="space-y-2">
                    <ConfigRow
                      label="Modo"
                      value={meta.params.responseFormat.type === "json_schema" ? "JSON Schema (Structured Outputs)" : "JSON object"}
                    />
                    {meta.params.responseFormat.type === "json_schema" && (
                      <div className="space-y-2">
                        <ConfigRow label="Nome do schema" value={meta.params.responseFormat.json_schema.name} />
                        <ConfigRow
                          label="Strict"
                          value={meta.params.responseFormat.json_schema.strict ? "Sim" : "Não"}
                        />
                        <div className="space-y-1">
                          <p className="text-xs text-muted-foreground">Schema</p>
                          <pre className="max-h-48 overflow-auto rounded-lg bg-muted/40 p-3 font-mono text-[11px] scrollbar-thin">
                            {JSON.stringify(meta.params.responseFormat.json_schema.schema, null, 2)}
                          </pre>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Nenhum — respostas em texto livre.</p>
                )}
                <Separator />
                <ConfigRow
                  label="require_parameters"
                  value={meta.params.requireParameters ? "Ativo (modelos incompatíveis falham)" : "Inativo"}
                />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Modelos ({meta.models.length})</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {meta.models.map((m) => (
                    <Badge key={m.id} variant="secondary" className="gap-1 font-mono text-xs">
                      {m.label ?? m.id}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Entradas ({meta.inputs.length})</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {meta.inputs.map((i, idx) => (
                  <div key={i.id} className="rounded-lg border border-border/60 bg-muted/20 p-2">
                    <div className="mb-1 flex items-center gap-2">
                      <Badge variant="outline" className="text-[10px]">{i.format.toUpperCase()}</Badge>
                      <span className="text-xs font-medium">{i.label ?? `Input ${idx + 1}`}</span>
                    </div>
                    <pre className="max-h-24 overflow-auto whitespace-pre-wrap font-mono text-[11px] text-muted-foreground scrollbar-thin">
                      {i.content.slice(0, 400)}{i.content.length > 400 ? "…" : ""}
                    </pre>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ChartCard({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold">{title}</CardTitle>
        {description ? <CardDescription className="text-xs">{description}</CardDescription> : null}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function ConfigRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-border/40 py-1 last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium tabular-nums">{value}</span>
    </div>
  );
}

function StatusBreakdown({ status }: { status?: { total: number; pending: number; queued: number; running: number; completed: number; failed: number; cancelled: number; interrupted: number } }) {
  const items: Array<{ label: string; value: number; color: string }> = [
    { label: "Concluídas", value: status?.completed ?? 0, color: "bg-emerald-500" },
    { label: "Falhas", value: status?.failed ?? 0, color: "bg-destructive" },
    { label: "Executando", value: status?.running ?? 0, color: "bg-primary" },
    { label: "Em fila", value: status?.queued ?? 0, color: "bg-amber-500" },
    { label: "Pendentes", value: status?.pending ?? 0, color: "bg-muted-foreground" },
    { label: "Canceladas", value: status?.cancelled ?? 0, color: "bg-zinc-500" },
    { label: "Interrompidas", value: status?.interrupted ?? 0, color: "bg-orange-500" },
  ];
  const total = status?.total ?? 0;
  return (
    <div className="space-y-3">
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted">
        {items.map((it) =>
          it.value > 0 ? (
            <div
              key={it.label}
              className={it.color}
              style={{ width: `${(it.value / Math.max(total, 1)) * 100}%` }}
              title={`${it.label}: ${it.value}`}
            />
          ) : null
        )}
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
        {items.map((it) => (
          <div key={it.label} className="flex items-center gap-2">
            <span className={`h-2.5 w-2.5 rounded-full ${it.color}`} />
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{it.label}</p>
              <p className="text-sm font-semibold tabular-nums">{it.value}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ModelLeaderboard({
  metrics,
}: {
  metrics: Array<{
    modelId: string;
    modelLabel?: string;
    completed: number;
    failed: number;
    successRate: number;
    avgLatencyMs: number;
    totalCost: number;
    avgCost: number;
  }>;
}) {
  const ranked = useMemo(() => {
    return [...metrics]
      .filter((m) => m.completed > 0)
      .sort((a, b) => {
        // Rank by success rate desc, then latency asc, then cost asc.
        if (b.successRate !== a.successRate) return b.successRate - a.successRate;
        if (a.avgLatencyMs !== b.avgLatencyMs) return a.avgLatencyMs - b.avgLatencyMs;
        return (a.totalCost ?? 0) - (b.totalCost ?? 0);
      });
  }, [metrics]);

  if (ranked.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">Sem execuções concluídas.</p>;
  }

  const medals = ["🥇", "🥈", "🥉"];

  return (
    <div className="space-y-1.5">
      {ranked.map((m, i) => (
        <div
          key={m.modelId}
          className="flex items-center gap-3 rounded-lg border border-border/60 bg-muted/20 px-3 py-2"
        >
          <span className="w-6 text-center text-lg">{medals[i] ?? `#${i + 1}`}</span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{m.modelLabel ?? m.modelId}</p>
            <p className="truncate font-mono text-[10px] text-muted-foreground">{m.modelId}</p>
          </div>
          <div className="flex gap-4 text-right">
            <div>
              <p className="text-[10px] uppercase text-muted-foreground">Sucesso</p>
              <p className="text-sm font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                {formatPercent(m.successRate)}
              </p>
            </div>
            <div>
              <p className="text-[10px] uppercase text-muted-foreground">Latência</p>
              <p className="text-sm font-semibold tabular-nums">{formatLatency(m.avgLatencyMs)}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase text-muted-foreground">Custo total</p>
              <p className="text-sm font-semibold tabular-nums text-violet-600 dark:text-violet-400">
                {formatCost(m.totalCost)}
              </p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Surfaces executions excluded from the averages. Without this the dashboard
 * would quietly average over a smaller set than the "concluídas" count implies.
 */
function EmptyResponsesNotice({
  count,
  perModel,
}: {
  count: number;
  perModel: Array<{ modelId: string; modelLabel?: string; emptyResponses: number }>;
}) {
  const offenders = perModel.filter((m) => m.emptyResponses > 0);
  return (
    <Card className="border-amber-500/40 bg-amber-500/5">
      <CardContent className="flex items-start gap-3 py-4">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
        <div className="space-y-1.5 text-sm">
          <p className="font-medium">
            {count} execução{count === 1 ? "" : "ões"} concluíram sem produzir resposta
          </p>
          <p className="text-xs text-muted-foreground">
            O provedor respondeu sem conteúdo nem contagem de tokens. Elas ficam de fora das
            médias de custo, latência e tokens — incluí-las trataria &quot;não produziu nada&quot;
            como &quot;custou zero&quot; e puxaria as médias para baixo. Os totais e a contagem de
            execuções seguem incluindo tudo.
          </p>
          {offenders.length > 0 && (
            <div className="flex flex-wrap gap-1 pt-0.5">
              {offenders.map((m) => (
                <Badge key={m.modelId} variant="secondary" className="gap-1 text-[10px] font-normal">
                  <span className="font-mono">{m.modelId}</span>
                  <span className="text-muted-foreground">×{m.emptyResponses}</span>
                </Badge>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function ModelComparisonTable({
  metrics,
}: {
  metrics: Array<{
    modelId: string;
    modelLabel?: string;
    total: number;
    completed: number;
    failed: number;
    successRate: number;
    avgLatencyMs: number;
    minLatencyMs?: number;
    maxLatencyMs?: number;
    medianLatencyMs?: number;
    p95LatencyMs?: number;
    totalCost: number;
    avgCost: number;
    minCost?: number;
    maxCost?: number;
    totalPromptTokens: number;
    totalCompletionTokens: number;
    totalTokens: number;
    avgTotalTokens: number;
    costPer1kTokens?: number;
    emptyResponses: number;
    costSamples: number;
  }>;
}) {
  const sorted = useMemo(
    () => [...metrics].sort((a, b) => (b.successRate - a.successRate) || (a.avgLatencyMs - b.avgLatencyMs)),
    [metrics]
  );
  return (
    <div className="overflow-x-auto scrollbar-thin">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-xs text-muted-foreground">
            <th className="py-2 pr-3 font-medium">Modelo</th>
            <th className="px-2 py-2 text-right font-medium">Execs</th>
            <th className="px-2 py-2 text-right font-medium">Sucesso</th>
            <th className="px-2 py-2 text-right font-medium">Lat. média</th>
            <th className="px-2 py-2 text-right font-medium">P95</th>
            <th className="px-2 py-2 text-right font-medium">Custo total</th>
            <th className="px-2 py-2 text-right font-medium">Custo/exec</th>
            <th className="px-2 py-2 text-right font-medium">Tokens</th>
            <th className="px-2 py-2 text-right font-medium">$/1k tok</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((m) => (
            <tr key={m.modelId} className="border-b border-border/40 last:border-0 hover:bg-muted/30">
              <td className="py-2 pr-3">
                <div className="flex items-center gap-1.5">
                  <p className="font-medium">{m.modelLabel ?? m.modelId}</p>
                  {m.emptyResponses > 0 && (
                    <Badge
                      variant="outline"
                      className="gap-1 border-amber-500/30 bg-amber-500/10 px-1 text-[9px] font-normal text-amber-600 dark:text-amber-400"
                      title={`${m.emptyResponses} execução(ões) sem resposta, excluída(s) das médias`}
                    >
                      <AlertTriangle className="h-2.5 w-2.5" />
                      {m.emptyResponses} sem saída
                    </Badge>
                  )}
                </div>
                <p className="font-mono text-[10px] text-muted-foreground">{m.modelId}</p>
              </td>
              <td className="px-2 py-2 text-right tabular-nums">
                <span className="text-emerald-600 dark:text-emerald-400">{m.completed}</span>
                {m.failed > 0 && <span className="text-destructive"> / {m.failed}</span>}
              </td>
              <td className="px-2 py-2 text-right tabular-nums">{formatPercent(m.successRate)}</td>
              <td className="px-2 py-2 text-right tabular-nums">{formatLatency(m.avgLatencyMs)}</td>
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
              <td className="px-2 py-2 text-right tabular-nums">{formatTokens(m.totalTokens)}</td>
              <td className="px-2 py-2 text-right tabular-nums text-muted-foreground">
                {m.costPer1kTokens !== undefined ? formatCost(m.costPer1kTokens) : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
