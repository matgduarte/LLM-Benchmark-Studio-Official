"use client";

import { useMemo, useState } from "react";
import {
  ArrowUpDown,
  Eye,
  Search,
  CheckCircle2,
  XCircle,
  Loader2,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { useExecutions, useMetrics } from "./hooks";
import { StatusBadge } from "./status-badge";
import { useAppStore } from "@/lib/store";
import {
  formatCost,
  formatLatency,
  formatTokens,
  formatDateTime,
} from "./format";
import type { ExecutionRecord, ExecutionStatus } from "@/lib/storage/types";
import { cn } from "@/lib/utils";

type SortKey = "model" | "status" | "latency" | "cost" | "tokens" | "startedAt";
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

export function ExecutionTable({ batchId }: { batchId: string }) {
  const openExecution = useAppStore((s) => s.openExecution);
  const metricsQ = useMetrics(batchId, false);
  const [statusFilter, setStatusFilter] = useState<"all" | ExecutionStatus>("all");
  const [modelFilter, setModelFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("startedAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const execsQ = useExecutions(batchId, {
    status: statusFilter === "all" ? undefined : statusFilter,
    modelId: modelFilter === "all" ? undefined : modelFilter,
  });

  const models = useMemo(() => metricsQ.data?.metrics?.perModel ?? [], [metricsQ.data]);

  const rows = useMemo(() => {
    let list = execsQ.data?.executions ?? [];
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (e) =>
          e.response?.toLowerCase().includes(q) ||
          e.errorMessage?.toLowerCase().includes(q) ||
          e.inputContent.toLowerCase().includes(q)
      );
    }
    const dir = sortDir === "asc" ? 1 : -1;
    return [...list].sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "model":
          cmp = (a.modelLabel ?? a.modelId).localeCompare(b.modelLabel ?? b.modelId);
          break;
        case "status":
          cmp = a.status.localeCompare(b.status);
          break;
        case "latency":
          cmp = (a.durationMs ?? 0) - (b.durationMs ?? 0);
          break;
        case "cost":
          cmp = (a.cost ?? 0) - (b.cost ?? 0);
          break;
        case "tokens":
          cmp = (a.usage.totalTokens ?? 0) - (b.usage.totalTokens ?? 0);
          break;
        case "startedAt":
          cmp = (a.startedAt ?? "").localeCompare(b.startedAt ?? "");
          break;
      }
      return cmp * dir;
    });
  }, [execsQ.data, search, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  return (
    <div className="space-y-3">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar resposta, erro ou input..."
            className="h-9 pl-8 text-sm"
          />
        </div>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as "all" | ExecutionStatus)}>
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
        <Select value={modelFilter} onValueChange={setModelFilter}>
          <SelectTrigger className="h-9 w-[220px] text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os modelos</SelectItem>
            {models.map((m) => (
              <SelectItem key={m.modelId} value={m.modelId}>
                {m.modelLabel ?? m.modelId}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Badge variant="secondary" className="h-9 gap-1.5 px-3">
          {rows.length} de {execsQ.data?.executions.length ?? 0}
        </Badge>
      </div>

      {/* Table */}
      <Card>
        <div className="overflow-hidden rounded-lg border border-border/60">
          <ScrollArea className="h-[560px] scrollbar-thin">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-muted/80 backdrop-blur">
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="px-3 py-2 font-medium">Modelo</th>
                  <th className="px-2 py-2 font-medium">Rep</th>
                  <th className="px-2 py-2 font-medium">Status</th>
                  <Th label="Latência" sortKey="latency" active={sortKey} dir={sortDir} onClick={toggleSort} />
                  <Th label="Custo" sortKey="cost" active={sortKey} dir={sortDir} onClick={toggleSort} />
                  <Th label="Tokens" sortKey="tokens" active={sortKey} dir={sortDir} onClick={toggleSort} />
                  <Th label="Início" sortKey="startedAt" active={sortKey} dir={sortDir} onClick={toggleSort} />
                  <th className="px-2 py-2 text-right font-medium">Resposta</th>
                </tr>
              </thead>
              <tbody>
                {execsQ.isLoading ? (
                  Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i} className="border-b border-border/40">
                      <td colSpan={8} className="px-3 py-3">
                        <Skeleton className="h-5 w-full" />
                      </td>
                    </tr>
                  ))
                ) : rows.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-3 py-12 text-center text-sm text-muted-foreground">
                      Nenhuma execução corresponde aos filtros.
                    </td>
                  </tr>
                ) : (
                  rows.map((e) => (
                    <ExecutionRow
                      key={e.id}
                      exec={e}
                      onClick={() => openExecution(e.id, batchId)}
                    />
                  ))
                )}
              </tbody>
            </table>
          </ScrollArea>
        </div>
      </Card>
    </div>
  );
}

function Th({
  label,
  sortKey,
  active,
  dir,
  onClick,
}: {
  label: string;
  sortKey: SortKey;
  active: SortKey;
  dir: SortDir;
  onClick: (k: SortKey) => void;
}) {
  return (
    <th className="px-2 py-2 text-right font-medium">
      <button
        className={cn(
          "inline-flex items-center gap-1 transition hover:text-foreground",
          active === sortKey && "text-foreground"
        )}
        onClick={() => onClick(sortKey)}
      >
        {label}
        <ArrowUpDown className={cn("h-3 w-3", active === sortKey && (dir === "asc" ? "rotate-180" : ""))} />
      </button>
    </th>
  );
}

function ExecutionRow({ exec, onClick }: { exec: ExecutionRecord; onClick: () => void }) {
  return (
    <tr
      onClick={onClick}
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
      <td className="px-2 py-2 text-center tabular-nums text-muted-foreground">#{exec.repetition}</td>
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
      <td className="px-2 py-2 text-right">
        <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs">
          <Eye className="h-3 w-3" />
          Ver
        </Button>
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
