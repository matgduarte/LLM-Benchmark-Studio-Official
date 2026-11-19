"use client";

import {
  PlusCircle,
  Loader2,
  Trash2,
  Play,
  Square,
  Clock,
  Coins,
  CheckCircle2,
  XCircle,
  FlaskConical,
  Tag,
  ArrowRight,
  CopyPlus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useBatches, useDeleteBatch, useRunBatch } from "../hooks";
import { useAppStore } from "@/lib/store";
import { formatRelativeTime, formatPercent, progressPercent } from "../format";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import type { BatchIndexEntry } from "@/lib/storage/types";

export function BatchesView() {
  const { data, isLoading } = useBatches();
  const batches = data?.batches ?? [];

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-48" />
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-48 w-full" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-xl border border-border/80 bg-gradient-to-br from-primary/5 via-background to-background p-6">
        <div className="bg-grid absolute inset-0 opacity-40" />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <FlaskConical className="h-5 w-5 text-primary" />
              <h1 className="text-2xl font-semibold tracking-tight">Experimentos</h1>
            </div>
            <p className="max-w-xl text-sm text-muted-foreground">
              Execute, registre e compare múltiplos modelos de linguagem via OpenRouter. Cada
              execução é persistida em arquivo local, permitindo análise posterior e
              reprodutibilidade.
            </p>
          </div>
          <Button onClick={() => useAppStore.getState().go({ kind: "create-batch" })} className="gap-2">
            <PlusCircle className="h-4 w-4" />
            Novo experimento
          </Button>
        </div>
      </div>

      {/* Stats strip */}
      {batches.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatChip
            icon={<FlaskConical className="h-3.5 w-3.5" />}
            label="Lotes"
            value={batches.length.toString()}
          />
          <StatChip
            icon={<Play className="h-3.5 w-3.5" />}
            label="Em execução"
            value={batches.filter((b) => b.isRunning).length.toString()}
          />
          <StatChip
            icon={<CheckCircle2 className="h-3.5 w-3.5" />}
            label="Execuções concluídas"
            value={batches.reduce((a, b) => a + b.completed, 0).toLocaleString("pt-BR")}
          />
          <StatChip
            icon={<XCircle className="h-3.5 w-3.5" />}
            label="Execuções com falha"
            value={batches.reduce((a, b) => a + b.failed, 0).toLocaleString("pt-BR")}
          />
        </div>
      )}

      {/* List */}
      {batches.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {batches.map((b) => (
            <BatchCard key={b.id} batch={b} />
          ))}
        </div>
      )}
    </div>
  );
}

function StatChip({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <Card className="gap-0 py-0">
      <CardContent className="flex items-center gap-3 py-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
          {icon}
        </span>
        <div className="min-w-0">
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
          <p className="truncate text-lg font-semibold tabular-nums">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function BatchCard({ batch }: { batch: BatchIndexEntry }) {
  const go = useAppStore((s) => s.go);
  const del = useDeleteBatch();
  const run = useRunBatch();
  const pct = progressPercent(batch.completed, batch.failed, batch.total);
  const active = batch.isRunning || batch.running > 0;

  return (
    <Card className="group relative flex flex-col gap-0 overflow-hidden transition hover:border-primary/40 hover:shadow-md">
      <CardHeader className="gap-2 pb-3">
        <div className="flex items-start justify-between gap-2">
          <button
            className="min-w-0 text-left"
            onClick={() => go({ kind: "batch-detail", batchId: batch.id })}
          >
            <h3 className="truncate text-base font-semibold leading-tight tracking-tight">
              {batch.name}
            </h3>
            {batch.description ? (
              <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{batch.description}</p>
            ) : null}
          </button>
          {active ? (
            <Badge className="shrink-0 gap-1.5 bg-primary/10 text-primary" variant="outline">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
              Em execução
            </Badge>
          ) : pct >= 100 ? (
            <Badge className="shrink-0 gap-1.5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" variant="outline">
              <CheckCircle2 className="h-3 w-3" /> Finalizado
            </Badge>
          ) : (
            <Badge variant="outline" className="shrink-0 gap-1.5">
              <Clock className="h-3 w-3" /> Pendente
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="flex flex-1 flex-col gap-4 pt-0">
        {/* Tags */}
        {batch.tags?.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {batch.tags.slice(0, 4).map((t) => (
              <Badge key={t} variant="secondary" className="gap-1 text-[10px] font-normal">
                <Tag className="h-2.5 w-2.5" />
                {t}
              </Badge>
            ))}
          </div>
        )}

        {/* Progress */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Progresso</span>
            <span className="font-medium tabular-nums">
              {batch.completed + batch.failed}/{batch.total} · {formatPercent(pct / 100)}
            </span>
          </div>
          <Progress value={pct} className="h-1.5" />
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-3 gap-2 text-xs">
          <Stat icon={<CheckCircle2 className="h-3 w-3 text-emerald-500" />} label="OK" value={batch.completed} />
          <Stat icon={<XCircle className="h-3 w-3 text-destructive" />} label="Falha" value={batch.failed} />
          <Stat icon={<Clock className="h-3 w-3 text-amber-500" />} label="Pend." value={batch.pending + batch.running} />
          <Stat icon={<FlaskConical className="h-3 w-3 text-primary" />} label="Modelos" value={batch.modelCount} />
          <Stat icon={<Coins className="h-3 w-3 text-violet-500" />} label="Reps" value={batch.repetitions} />
          <Stat
            icon={<Clock className="h-3 w-3 text-muted-foreground" />}
            label="Atualizado"
            value={formatRelativeTime(batch.lastUpdatedAt).replace(" atrás", "")}
            raw
          />
        </div>

        {/* Actions */}
        <div className="mt-auto flex items-center gap-2 pt-2">
          <Button
            size="sm"
            variant="default"
            className="gap-1.5"
            disabled={run.isPending}
            onClick={async () => {
              try {
                await run.mutateAsync(batch.id);
                toast.success("Lote iniciado", { description: `${batch.total} execuções em fila.` });
              } catch (e) {
                toast.error("Falha ao iniciar lote", { description: (e as Error).message });
              }
            }}
          >
            {active ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
            {active ? "Reanexar" : pct > 0 ? "Retomar" : "Executar"}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            className="gap-1.5"
            onClick={() => go({ kind: "batch-detail", batchId: batch.id })}
          >
            Detalhes
            <ArrowRight className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="gap-1.5 text-muted-foreground hover:text-primary"
            title="Refazer: abre um novo experimento com esta configuração"
            onClick={() => go({ kind: "create-batch", duplicateFrom: batch.id })}
          >
            <CopyPlus className="h-3.5 w-3.5" />
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button size="sm" variant="ghost" className="ml-auto gap-1.5 text-muted-foreground hover:text-destructive">
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Excluir lote?</AlertDialogTitle>
                <AlertDialogDescription>
                  Esta ação remove permanentemente o lote <strong>{batch.name}</strong> e todos os
                  arquivos de execução associados. Não pode ser desfeito.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  onClick={async () => {
                    try {
                      await del.mutateAsync(batch.id);
                      toast.success("Lote excluído");
                    } catch (e) {
                      toast.error("Falha ao excluir", { description: (e as Error).message });
                    }
                  }}
                >
                  Excluir
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </CardContent>
    </Card>
  );
}

function Stat({
  icon,
  label,
  value,
  raw,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  raw?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5 rounded-lg border border-border/60 bg-muted/30 px-2 py-1.5">
      <span className="flex items-center gap-1 text-[9px] font-medium uppercase tracking-wide text-muted-foreground">
        {icon}
        {label}
      </span>
      <span className="truncate text-sm font-semibold tabular-nums">
        {raw ? value : (value as number).toLocaleString("pt-BR")}
      </span>
    </div>
  );
}

function EmptyState() {
  const go = useAppStore((s) => s.go);
  return (
    <Card className="border-dashed py-12">
      <CardContent className="flex flex-col items-center justify-center gap-4 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <FlaskConical className="h-7 w-7" />
        </span>
        <div className="space-y-1.5">
          <h3 className="text-lg font-semibold">Nenhum experimento ainda</h3>
          <p className="max-w-md text-sm text-muted-foreground">
            Crie seu primeiro lote de avaliação: defina um prompt, selecione modelos do OpenRouter e
            execute repetições para comparar latência, custo e consumo de tokens.
          </p>
        </div>
        <Button onClick={() => go({ kind: "create-batch" })} className="gap-2">
          <PlusCircle className="h-4 w-4" />
          Criar primeiro experimento
        </Button>
      </CardContent>
    </Card>
  );
}
