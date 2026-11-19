"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Copy, Check, AlertTriangle, Clock, Coins, Hash, Cpu, Columns3 } from "lucide-react";
import { useAppStore } from "@/lib/store";
import { api } from "@/lib/api-client";
import { StatusBadge } from "./status-badge";
import {
  formatCost,
  formatLatency,
  formatTokens,
  formatDateTime,
} from "./format";
import { toast } from "sonner";
import type { ExecutionRecord } from "@/lib/storage/types";
import { useQuery } from "@tanstack/react-query";

export function ExecutionDetailDialog() {
  const execId = useAppStore((s) => s.selectedExecutionId);
  const batchId = useAppStore((s) => s.selectedExecutionBatchId);
  const close = useAppStore((s) => s.closeExecution);

  const q = useQuery({
    queryKey: ["execution", batchId, execId],
    queryFn: () => api.listExecutions(batchId!),
    enabled: Boolean(batchId && execId),
    refetchInterval: (q) => {
      const exec = q.state.data?.executions.find((e) => e.id === execId);
      return exec && (exec.status === "running" || exec.status === "queued" || exec.status === "pending")
        ? 1500
        : false;
    },
  });

  const exec = q.data?.executions.find((e) => e.id === execId);
  const open = Boolean(execId && batchId);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-hidden p-0 sm:rounded-xl">
        <DialogHeader className="border-b border-border/60 px-5 py-4">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <DialogTitle className="text-base">Detalhe da execução</DialogTitle>
              <DialogDescription className="truncate font-mono text-xs">
                {execId}
              </DialogDescription>
            </div>
            {exec ? <StatusBadge status={exec.status} /> : null}
          </div>
        </DialogHeader>

        {q.isLoading || !exec ? (
          <div className="space-y-3 p-5">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : (
          <ExecutionDetailBody exec={exec} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function ExecutionDetailBody({ exec }: { exec: ExecutionRecord }) {
  const [copied, setCopied] = useState(false);
  const openComparison = useAppStore((s) => s.openComparison);

  function copyResponse() {
    navigator.clipboard.writeText(exec.response ?? "");
    setCopied(true);
    toast.success("Resposta copiada");
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="flex flex-col">
      {/* Metadata grid */}
      <div className="grid grid-cols-2 gap-2 border-b border-border/60 bg-muted/20 px-5 py-3 sm:grid-cols-3 lg:grid-cols-6">
        <Meta icon={<Cpu className="h-3 w-3" />} label="Modelo" value={exec.modelLabel ?? exec.modelId} mono />
        <Meta icon={<Hash className="h-3 w-3" />} label="Repetição" value={`#${exec.repetition}`} />
        <Meta icon={<Clock className="h-3 w-3" />} label="Duração" value={formatLatency(exec.durationMs)} />
        <Meta icon={<Coins className="h-3 w-3" />} label="Custo" value={formatCost(exec.cost)} />
        <Meta
          icon={<Hash className="h-3 w-3" />}
          label="Tokens"
          value={exec.usage.totalTokens !== undefined ? formatTokens(exec.usage.totalTokens) : "—"}
          hint={`${exec.usage.promptTokens ?? 0} in / ${exec.usage.completionTokens ?? 0} out`}
        />
        <Meta icon={<Clock className="h-3 w-3" />} label="Início" value={formatDateTime(exec.startedAt)} />
      </div>

      {/* Error banner */}
      {exec.status === "failed" && exec.errorMessage && (
        <div className="flex items-start gap-3 border-b border-destructive/30 bg-destructive/5 px-5 py-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-destructive">{exec.errorMessage}</p>
            {exec.errorCode && (
              <p className="font-mono text-xs text-muted-foreground">code: {exec.errorCode}</p>
            )}
          </div>
        </div>
      )}

      <Tabs defaultValue="response" className="flex min-h-0 flex-1 flex-col">
        <div className="flex items-center justify-between border-b border-border/60 px-5 py-2">
          <TabsList className="h-8">
            <TabsTrigger value="response" className="text-xs">Resposta</TabsTrigger>
            <TabsTrigger value="input" className="text-xs">Entrada</TabsTrigger>
            <TabsTrigger value="metadata" className="text-xs">Metadados</TabsTrigger>
            <TabsTrigger value="raw" className="text-xs">Raw API</TabsTrigger>
          </TabsList>
          <div className="flex items-center gap-1">
            <button
              onClick={() =>
                openComparison({
                  batchId: exec.batchId,
                  inputId: exec.inputId,
                  modelId: exec.modelId,
                  repetition: exec.repetition,
                  axis: "reps",
                })
              }
              title="Ver todas as repetições deste modelo lado a lado"
              className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground transition hover:bg-muted hover:text-foreground"
            >
              <Columns3 className="h-3 w-3" />
              Comparar reps
            </button>
            <button
              onClick={() =>
                openComparison({
                  batchId: exec.batchId,
                  inputId: exec.inputId,
                  modelId: exec.modelId,
                  repetition: exec.repetition,
                  axis: "models",
                })
              }
              title={`Ver a rep #${exec.repetition} de todos os modelos lado a lado`}
              className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground transition hover:bg-muted hover:text-foreground"
            >
              <Cpu className="h-3 w-3" />
              Comparar modelos
            </button>
            <button
              onClick={copyResponse}
              className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground transition hover:bg-muted hover:text-foreground"
            >
              {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              Copiar
            </button>
          </div>
        </div>

        <TabsContent value="response" className="m-0 min-h-0">
          <ScrollArea className="h-[50vh] scrollbar-thin">
            <pre className="whitespace-pre-wrap break-words p-5 font-mono text-xs leading-relaxed">
              {exec.response || "(resposta vazia)"}
            </pre>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="input" className="m-0 min-h-0">
          <ScrollArea className="h-[50vh] scrollbar-thin">
            <div className="space-y-3 p-5">
              <div>
                <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  System prompt
                </p>
                <pre className="whitespace-pre-wrap break-words rounded-lg bg-muted/40 p-3 font-mono text-xs">
                  {exec.systemPrompt || "(vazio)"}
                </pre>
              </div>
              <div>
                <div className="mb-1 flex items-center gap-2">
                  <Badge variant="outline" className="text-[10px]">{exec.inputFormat.toUpperCase()}</Badge>
                  <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Input do usuário
                  </span>
                </div>
                <pre className="whitespace-pre-wrap break-words rounded-lg bg-muted/40 p-3 font-mono text-xs">
                  {exec.inputContent}
                </pre>
              </div>
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="metadata" className="m-0 min-h-0">
          <ScrollArea className="h-[50vh] scrollbar-thin">
            <div className="p-5">
              <MetadataTable exec={exec} />
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="raw" className="m-0 min-h-0">
          <ScrollArea className="h-[50vh] scrollbar-thin">
            <pre className="p-5 font-mono text-[11px] leading-relaxed">
              {exec.raw ? JSON.stringify(exec.raw, null, 2) : "(sem payload cru)"}
            </pre>
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Meta({
  icon,
  label,
  value,
  hint,
  mono,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
  mono?: boolean;
}) {
  return (
    <div className="min-w-0">
      <p className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {icon}
        {label}
      </p>
      <p className={`truncate text-sm font-medium ${mono ? "font-mono text-xs" : ""}`}>{value}</p>
      {hint ? <p className="text-[10px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function MetadataTable({ exec }: { exec: ExecutionRecord }) {
  const rows: Array<[string, string]> = [
    ["ID da execução", exec.id],
    ["ID do lote", exec.batchId],
    ["Modelo solicitado", exec.modelId],
    ["Modelo resolvido (provider)", exec.resolvedModel ?? "—"],
    ["Rótulo do modelo", exec.modelLabel ?? "—"],
    ["Generation ID (OpenRouter)", exec.generationId ?? "—"],
    ["Status", exec.status],
    ["Finish reason", exec.finishReason ?? "—"],
    ["Duração", formatLatency(exec.durationMs)],
    ["Início", formatDateTime(exec.startedAt)],
    ["Término", formatDateTime(exec.finishedAt)],
    ["Custo (USD)", formatCost(exec.cost)],
    ["Tokens de entrada", exec.usage.promptTokens?.toLocaleString("pt-BR") ?? "—"],
    ["Tokens de saída", exec.usage.completionTokens?.toLocaleString("pt-BR") ?? "—"],
    ["Tokens totais", exec.usage.totalTokens?.toLocaleString("pt-BR") ?? "—"],
    ["Temperature", exec.params.temperature?.toString() ?? "default"],
    ["Max tokens", exec.params.maxTokens?.toString() ?? "default"],
    ["Top P", exec.params.topP?.toString() ?? "default"],
    ["Criado em", formatDateTime(exec.createdAt)],
    ["Atualizado em", formatDateTime(exec.updatedAt)],
  ];
  return (
    <div className="overflow-hidden rounded-lg border border-border/60">
      <table className="w-full text-sm">
        <tbody>
          {rows.map(([k, v], i) => (
            <tr key={k} className={i % 2 === 0 ? "bg-muted/20" : ""}>
              <td className="w-1/3 border-r border-border/40 px-3 py-1.5 text-muted-foreground">{k}</td>
              <td className="break-all px-3 py-1.5 font-mono text-xs">{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Helper to render metadata table is above.
