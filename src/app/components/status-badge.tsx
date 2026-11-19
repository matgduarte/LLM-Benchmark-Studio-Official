"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { ExecutionStatus } from "@/lib/storage/types";

const STATUS_CONFIG: Record<
  ExecutionStatus,
  { label: string; className: string; dot: string }
> = {
  pending: {
    label: "Pendente",
    className: "bg-muted text-muted-foreground border-border",
    dot: "bg-muted-foreground",
  },
  queued: {
    label: "Em fila",
    className: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30",
    dot: "bg-amber-500",
  },
  running: {
    label: "Executando",
    className: "bg-primary/10 text-primary border-primary/30",
    dot: "bg-primary animate-pulse",
  },
  completed: {
    label: "Concluída",
    className: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
    dot: "bg-emerald-500",
  },
  failed: {
    label: "Falha",
    className: "bg-destructive/10 text-destructive border-destructive/30",
    dot: "bg-destructive",
  },
  cancelled: {
    label: "Cancelada",
    className: "bg-zinc-500/10 text-zinc-500 border-zinc-500/30",
    dot: "bg-zinc-500",
  },
  interrupted: {
    label: "Interrompida",
    className: "bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/30",
    dot: "bg-orange-500",
  },
};

export function StatusBadge({ status, className }: { status: ExecutionStatus; className?: string }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.pending;
  return (
    <Badge variant="outline" className={cn("gap-1.5 font-medium", cfg.className, className)}>
      <span className={cn("h-1.5 w-1.5 rounded-full", cfg.dot)} />
      {cfg.label}
    </Badge>
  );
}

export function statusLabel(status: ExecutionStatus): string {
  return STATUS_CONFIG[status]?.label ?? status;
}
