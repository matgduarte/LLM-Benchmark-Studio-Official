"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { ReactNode } from "react";

/** Peças compartilhadas pelos gráficos da tela de Uso & Custos. */

export const AXIS_TICK = { fontSize: 11, fill: "var(--muted-foreground)" } as const;

export const COLORS = {
  success: "var(--chart-1)",
  cost: "var(--chart-2)",
  error: "var(--chart-3)",
  other: "var(--chart-4)",
  neutral: "var(--chart-5)",
} as const;

export const MODEL_PALETTE = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

export function ChartCard({
  title,
  description,
  legend,
  children,
  className,
}: {
  title: string;
  description: string;
  legend?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card className={className}>
      <CardHeader className="flex-row items-start justify-between space-y-0 pb-2">
        <div className="space-y-1">
          <CardTitle className="text-base">{title}</CardTitle>
          <CardDescription className="text-xs">{description}</CardDescription>
        </div>
        {legend && <div className="flex shrink-0 items-center gap-3 text-[11px]">{legend}</div>}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5 text-muted-foreground">
      <span className="inline-block h-2 w-2 rounded-sm" style={{ background: color }} />
      {label}
    </span>
  );
}

export function EmptyChart({ label = "Sem dados no intervalo selecionado" }: { label?: string }) {
  return (
    <div className="flex h-[220px] items-center justify-center text-center text-sm text-muted-foreground">
      {label}
    </div>
  );
}

export function TooltipShell({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-popover p-2.5 text-xs text-popover-foreground shadow-xl">
      {children}
    </div>
  );
}

export function TooltipRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-6">
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}

/** Shape mínimo que o recharts entrega a um tooltip customizado. */
export interface TooltipProps<T> {
  active?: boolean;
  payload?: { payload: T }[];
  label?: string;
}
