"use client";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

interface MetricCardProps {
  label: string;
  value: string;
  hint?: string;
  icon?: ReactNode;
  accent?: "primary" | "emerald" | "amber" | "rose" | "violet" | "neutral";
  className?: string;
}

const ACCENT_BAR: Record<NonNullable<MetricCardProps["accent"]>, string> = {
  primary: "bg-primary",
  emerald: "bg-emerald-500",
  amber: "bg-amber-500",
  rose: "bg-rose-500",
  violet: "bg-violet-500",
  neutral: "bg-muted-foreground",
};

export function MetricCard({ label, value, hint, icon, accent = "neutral", className }: MetricCardProps) {
  return (
    <Card className={cn("relative overflow-hidden gap-0", className)}>
      <div className={cn("absolute left-0 top-0 h-full w-1", ACCENT_BAR[accent])} />
      <CardContent className="pt-5 pl-6">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {label}
          </p>
          {icon ? <span className="text-muted-foreground [&>svg]:h-4 [&>svg]:w-4">{icon}</span> : null}
        </div>
        <p className="mt-2 text-2xl font-semibold tabular-nums tracking-tight">{value}</p>
        {hint ? (
          <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}
