"use client";

import { useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Coins, Cloud, Hash, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { MetricCard } from "../metric-card";
import { formatNumber } from "../format";
import { formatDateShort, formatUsd } from "@/lib/usage/aggregator";
import { usageProviderLabel, type ProviderSpend } from "@/lib/usage/types";
import {
  AXIS_TICK,
  ChartCard,
  COLORS,
  EmptyChart,
  LegendDot,
  MODEL_PALETTE,
  TooltipRow,
  TooltipShell,
  type TooltipProps,
} from "./chart-kit";

const ROWS_PAGE = 30;

/**
 * Seção "Gasto nos provedores": o que foi efetivamente cobrado na conta.
 * Sempre agregado por dia+modelo — é o máximo que as APIs devolvem.
 */
export function ProviderSpendSection({ spend }: { spend: ProviderSpend | undefined }) {
  const totals = spend?.totals;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard
          label="Requests"
          value={totals ? formatNumber(totals.requests) : "—"}
          hint={
            spend?.sources.length
              ? spend.sources
                  .map((s) => `${usageProviderLabel(s.provider)}: ${formatNumber(s.requests)}`)
                  .join(" · ")
              : undefined
          }
          icon={<Hash />}
          accent="primary"
        />
        <MetricCard
          label="Custo no período"
          value={totals ? formatUsd(totals.cost) : "—"}
          hint={
            totals && totals.requests > 0
              ? `${formatUsd(totals.cost / totals.requests)} por request`
              : undefined
          }
          icon={<Coins />}
          accent="amber"
        />
        <MetricCard
          label="Tokens"
          value={totals ? formatNumber(totals.tokens) : "—"}
          hint={spend?.byModel.length ? `${spend.byModel.length} modelos` : undefined}
          icon={<Cloud />}
          accent="violet"
        />
        <CreditsCard spend={spend} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <DailySpendChart spend={spend} className="lg:col-span-2" />
        <TopModelsChart spend={spend} />
      </div>

      <SpendTable spend={spend} />
    </div>
  );
}

function CreditsCard({ spend }: { spend: ProviderSpend | undefined }) {
  const credits = spend?.credits ?? [];
  // O saldo é da conta inteira, não do intervalo — por isso fica separado dos
  // demais KPIs em vez de virar mais um número na mesma régua.
  const primary = credits.find((c) => c.balance !== undefined) ?? credits[0];

  return (
    <Card className="relative gap-0 overflow-hidden">
      <div className="absolute left-0 top-0 h-full w-1 bg-emerald-500" />
      <CardContent className="pl-6 pt-5">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Saldo da conta
          </p>
          <Wallet className="h-4 w-4 text-muted-foreground" />
        </div>
        {!primary ? (
          <>
            <p className="mt-2 text-2xl font-semibold tabular-nums tracking-tight">—</p>
            <p className="mt-1 text-xs text-muted-foreground">Nenhum provedor reportou saldo</p>
          </>
        ) : (
          <>
            <p className="mt-2 text-2xl font-semibold tabular-nums tracking-tight">
              {primary.balance !== undefined ? formatUsd(primary.balance) : formatUsd(primary.usage)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {credits
                .map((c) =>
                  c.balance !== undefined
                    ? `${c.label}: ${formatUsd(c.balance)} restante`
                    : `${c.label}: ${formatUsd(c.usage)} gasto`
                )
                .join(" · ")}
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function DailySpendChart({
  spend,
  className,
}: {
  spend: ProviderSpend | undefined;
  className?: string;
}) {
  // Os buckets vêm por dia+provedor; o gráfico soma os provedores.
  const byDate = new Map<string, { date: string; requests: number; cost: number }>();
  for (const d of spend?.daily ?? []) {
    const e = byDate.get(d.date) ?? { date: d.date, requests: 0, cost: 0 };
    e.requests += d.requests;
    e.cost += d.cost;
    byDate.set(d.date, e);
  }
  const data = Array.from(byDate.values()).sort((a, b) => (a.date < b.date ? -1 : 1));

  return (
    <ChartCard
      className={className}
      title="Consumo por dia"
      description="Requests em barras, custo na linha do eixo direito"
      legend={
        <>
          <LegendDot color={COLORS.success} label="Requests" />
          <LegendDot color={COLORS.cost} label="Custo" />
        </>
      }
    >
      {data.length === 0 ? (
        <EmptyChart />
      ) : (
        <ResponsiveContainer width="100%" height={260}>
          <ComposedChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis
              dataKey="date"
              tickFormatter={formatDateShort}
              tick={AXIS_TICK}
              stroke="var(--border)"
            />
            <YAxis
              yAxisId="left"
              tick={AXIS_TICK}
              stroke="var(--border)"
              tickFormatter={(v) => formatNumber(Number(v))}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              tick={AXIS_TICK}
              stroke="var(--border)"
              tickFormatter={(v) => formatUsd(Number(v))}
            />
            <Tooltip content={<DailyTooltip />} />
            <Bar yAxisId="left" dataKey="requests" fill={COLORS.success} radius={[3, 3, 0, 0]} />
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="cost"
              stroke={COLORS.cost}
              strokeWidth={2}
              dot={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      )}
    </ChartCard>
  );
}

function TopModelsChart({ spend }: { spend: ProviderSpend | undefined }) {
  const data = (spend?.byModel ?? []).slice(0, 8).map((m) => ({
    label: m.model.length > 24 ? `${m.model.slice(0, 22)}…` : m.model,
    model: m.model,
    provider: usageProviderLabel(m.provider),
    requests: m.requests,
    tokens: m.tokens,
    cost: m.cost,
  }));

  return (
    <ChartCard title="Modelos por gasto" description="Top 8 modelos no período">
      {data.length === 0 ? (
        <EmptyChart />
      ) : (
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={data} layout="vertical" margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
            <XAxis
              type="number"
              tick={AXIS_TICK}
              stroke="var(--border)"
              tickFormatter={(v) => formatUsd(Number(v))}
            />
            <YAxis
              type="category"
              dataKey="label"
              tick={{ ...AXIS_TICK, fontSize: 10 }}
              stroke="var(--border)"
              width={140}
            />
            <Tooltip content={<ModelTooltip />} cursor={{ fill: "var(--muted)", opacity: 0.4 }} />
            <Bar dataKey="cost" radius={[0, 3, 3, 0]}>
              {data.map((_, i) => (
                <Cell key={i} fill={MODEL_PALETTE[i % MODEL_PALETTE.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </ChartCard>
  );
}

function SpendTable({ spend }: { spend: ProviderSpend | undefined }) {
  const [visible, setVisible] = useState(ROWS_PAGE);
  const rows = spend?.rows ?? [];
  const shown = rows.slice(0, visible);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Detalhamento por dia e modelo</CardTitle>
        <CardDescription className="text-xs">
          Exibindo {formatNumber(shown.length)} de {formatNumber(rows.length)} linhas. Esta é a menor
          granularidade que as APIs dos provedores oferecem.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="rounded-lg border border-border/60">
          <ScrollArea className="h-[340px] scrollbar-thin">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-card">
                <TableRow className="hover:bg-transparent">
                  <Th>Data</Th>
                  <Th>Provedor</Th>
                  <Th>Modelo</Th>
                  <Th className="text-right">Requests</Th>
                  <Th className="text-right">Tokens</Th>
                  <Th className="text-right">Custo</Th>
                </TableRow>
              </TableHeader>
              <TableBody>
                {shown.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                      Nenhum consumo reportado no intervalo.
                    </TableCell>
                  </TableRow>
                ) : (
                  shown.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="whitespace-nowrap py-2 font-mono text-[11px] tabular-nums text-muted-foreground">
                        {r.date}
                      </TableCell>
                      <TableCell className="py-2">
                        <ProviderTag provider={r.provider} upstream={r.upstream} />
                      </TableCell>
                      <TableCell
                        className="max-w-[300px] truncate py-2 font-mono text-[11px]"
                        title={r.model}
                      >
                        {r.model}
                      </TableCell>
                      <TableCell className="py-2 text-right text-[11px] tabular-nums">
                        {formatNumber(r.requests)}
                      </TableCell>
                      <TableCell className="py-2 text-right text-[11px] tabular-nums text-muted-foreground">
                        {formatNumber(r.totalTokens)}
                      </TableCell>
                      <TableCell className="py-2 text-right text-[11px] tabular-nums text-amber-600 dark:text-amber-400">
                        {formatUsd(r.cost)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </ScrollArea>
        </div>
        {visible < rows.length && (
          <div className="mt-3 flex justify-center">
            <Button variant="outline" size="sm" onClick={() => setVisible((v) => v + ROWS_PAGE)}>
              Carregar mais {formatNumber(Math.min(ROWS_PAGE, rows.length - visible))}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ProviderTag({ provider, upstream }: { provider: "openrouter" | "openai"; upstream?: string }) {
  return (
    <span
      className={`rounded px-1.5 py-0.5 font-mono text-[10px] ${
        provider === "openrouter"
          ? "bg-primary/10 text-primary"
          : "bg-violet-500/10 text-violet-600 dark:text-violet-400"
      }`}
      title={upstream ? `${usageProviderLabel(provider)} → ${upstream}` : usageProviderLabel(provider)}
    >
      {provider === "openrouter" ? "OR" : "OA"}
      {upstream ? ` · ${upstream}` : ""}
    </span>
  );
}

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <TableHead
      className={`h-8 text-[10px] uppercase tracking-wider text-muted-foreground ${className ?? ""}`}
    >
      {children}
    </TableHead>
  );
}

function DailyTooltip({
  active,
  payload,
  label,
}: TooltipProps<{ requests: number; cost: number }>) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <TooltipShell>
      <div className="mb-1.5 font-medium tabular-nums">{label}</div>
      <div className="space-y-0.5">
        <TooltipRow label="Requests" value={formatNumber(p.requests)} />
        <TooltipRow label="Custo" value={formatUsd(p.cost)} />
      </div>
    </TooltipShell>
  );
}

function ModelTooltip({
  active,
  payload,
}: TooltipProps<{
  model: string;
  provider: string;
  requests: number;
  tokens: number;
  cost: number;
}>) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <TooltipShell>
      <div className="mb-1.5 max-w-[260px] break-all font-medium">{p.model}</div>
      <div className="space-y-0.5">
        <TooltipRow label="Provedor" value={p.provider} />
        <TooltipRow label="Requests" value={formatNumber(p.requests)} />
        <TooltipRow label="Tokens" value={formatNumber(p.tokens)} />
        <TooltipRow label="Custo" value={formatUsd(p.cost)} />
      </div>
    </TooltipShell>
  );
}
