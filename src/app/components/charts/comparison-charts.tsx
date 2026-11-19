"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
  ComposedChart,
} from "recharts";
import type { ModelMetrics } from "@/lib/storage/types";
import { formatCost, formatLatency, formatTokens } from "../format";

const PALETTE = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

function shortLabel(id: string, label?: string): string {
  const raw = label ?? id;
  // Take last segment after / and trim to 18 chars.
  const seg = raw.split("/").pop() ?? raw;
  return seg.length > 18 ? seg.slice(0, 16) + "…" : seg;
}

interface ChartProps {
  metrics: ModelMetrics[];
}

const tooltipStyle = {
  backgroundColor: "var(--popover)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  color: "var(--popover-foreground)",
  fontSize: 12,
};

/** Latency comparison: avg / min / max / p95 per model. */
export function LatencyComparisonChart({ metrics }: ChartProps) {
  const data = metrics
    .filter((m) => m.completed > 0)
    .map((m) => ({
      name: shortLabel(m.modelId, m.modelLabel),
      avg: Math.round(m.avgLatencyMs),
      min: m.minLatencyMs ? Math.round(m.minLatencyMs) : 0,
      max: m.maxLatencyMs ? Math.round(m.maxLatencyMs) : 0,
      p95: m.p95LatencyMs ? Math.round(m.p95LatencyMs) : 0,
    }));
  if (!data.length) return <EmptyChart label="Sem execuções concluídas ainda" />;
  return (
    <ResponsiveContainer width="100%" height={300}>
      <ComposedChart data={data} margin={{ top: 8, right: 16, bottom: 24, left: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis
          dataKey="name"
          tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
          angle={-25}
          textAnchor="end"
          height={60}
        />
        <YAxis
          tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
          tickFormatter={(v) => formatLatency(Number(v))}
        />
        <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => formatLatency(v)} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        <Bar dataKey="min" name="Mín" fill="var(--chart-2)" radius={[3, 3, 0, 0]} />
        <Bar dataKey="avg" name="Média" fill="var(--chart-1)" radius={[3, 3, 0, 0]} />
        <Bar dataKey="p95" name="P95" fill="var(--chart-4)" radius={[3, 3, 0, 0]} />
        <Bar dataKey="max" name="Máx" fill="var(--chart-3)" radius={[3, 3, 0, 0]} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

/** Cost comparison per model. */
export function CostComparisonChart({ metrics }: ChartProps) {
  const data = metrics
    .filter((m) => m.completed > 0)
    .map((m, i) => ({
      name: shortLabel(m.modelId, m.modelLabel),
      cost: Number((m.totalCost ?? 0).toFixed(6)),
      avg: Number((m.avgCost ?? 0).toFixed(6)),
      fill: PALETTE[i % PALETTE.length],
    }));
  if (!data.length) return <EmptyChart label="Sem execuções concluídas ainda" />;
  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data} margin={{ top: 8, right: 16, bottom: 24, left: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis
          dataKey="name"
          tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
          angle={-25}
          textAnchor="end"
          height={60}
        />
        <YAxis
          tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
          tickFormatter={(v) => formatCost(Number(v))}
        />
        <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => formatCost(v)} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        <Bar dataKey="cost" name="Custo total" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Token consumption comparison (prompt vs completion) stacked. */
export function TokenComparisonChart({ metrics }: ChartProps) {
  const data = metrics
    .filter((m) => m.completed > 0)
    .map((m) => ({
      name: shortLabel(m.modelId, m.modelLabel),
      prompt: m.totalPromptTokens,
      completion: m.totalCompletionTokens,
    }));
  if (!data.length) return <EmptyChart label="Sem execuções concluídas ainda" />;
  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data} margin={{ top: 8, right: 16, bottom: 24, left: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis
          dataKey="name"
          tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
          angle={-25}
          textAnchor="end"
          height={60}
        />
        <YAxis
          tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
          tickFormatter={(v) => formatTokens(Number(v))}
        />
        <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => formatTokens(v)} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        <Bar dataKey="prompt" name="Prompt" stackId="t" fill="var(--chart-1)" radius={[0, 0, 0, 0]} />
        <Bar dataKey="completion" name="Completion" stackId="t" fill="var(--chart-2)" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Success rate per model (horizontal bars). */
export function SuccessRateChart({ metrics }: ChartProps) {
  const data = metrics.map((m, i) => ({
    name: shortLabel(m.modelId, m.modelLabel),
    rate: Number((m.successRate * 100).toFixed(1)),
    fill: m.successRate >= 0.9 ? "var(--chart-1)" : m.successRate >= 0.5 ? "var(--chart-2)" : "var(--chart-3)",
  }));
  if (!data.length) return <EmptyChart label="Sem execuções" />;
  return (
    <ResponsiveContainer width="100%" height={Math.max(180, data.length * 44)}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 24, bottom: 4, left: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
        <XAxis
          type="number"
          domain={[0, 100]}
          tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
          tickFormatter={(v) => `${v}%`}
        />
        <YAxis
          type="category"
          dataKey="name"
          tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
          width={120}
        />
        <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => `${v}%`} />
        <Bar dataKey="rate" name="Taxa de sucesso" radius={[0, 4, 4, 0]} barSize={24}>
          {data.map((d, i) => (
            <Cell key={i} fill={d.fill} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Latency distribution scatter (each completed execution = a point). */
export function LatencyDistributionChart({ metrics }: ChartProps) {
  const points: Array<{ x: number; y: number; z: number; model: string; fill: string }> = [];
  metrics.forEach((m, idx) => {
    m.latencies.forEach((lat, i) => {
      points.push({
        x: i + 1,
        y: Math.round(lat),
        z: 1,
        model: shortLabel(m.modelId, m.modelLabel),
        fill: PALETTE[idx % PALETTE.length],
      });
    });
  });
  if (!points.length) return <EmptyChart label="Sem latências registradas" />;
  return (
    <ResponsiveContainer width="100%" height={300}>
      <ScatterChart margin={{ top: 8, right: 16, bottom: 24, left: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
        <XAxis
          type="number"
          dataKey="x"
          name="Execução"
          tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
        />
        <YAxis
          type="number"
          dataKey="y"
          name="Latência"
          tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
          tickFormatter={(v) => formatLatency(Number(v))}
        />
        <ZAxis type="number" dataKey="z" range={[40, 40]} />
        <Tooltip
          contentStyle={tooltipStyle}
          formatter={(v: number, name: string) =>
            name === "Latência" ? formatLatency(v) : v
          }
        />
        {metrics.map((m, i) => (
          <Scatter
            key={m.modelId}
            name={shortLabel(m.modelId, m.modelLabel)}
            data={points.filter((p) => p.model === shortLabel(m.modelId, m.modelLabel))}
            fill={PALETTE[i % PALETTE.length]}
          />
        ))}
        <Legend wrapperStyle={{ fontSize: 11 }} />
      </ScatterChart>
    </ResponsiveContainer>
  );
}

/** Cost vs latency scatter (efficiency frontier). Each point = a model. */
export function EfficiencyChart({ metrics }: ChartProps) {
  const data = metrics
    .filter((m) => m.completed > 0)
    .map((m, i) => ({
      x: Number((m.avgCost ?? 0).toFixed(6)),
      y: Math.round(m.avgLatencyMs),
      name: shortLabel(m.modelId, m.modelLabel),
      tokens: m.totalTokens,
      fill: PALETTE[i % PALETTE.length],
    }));
  if (!data.length) return <EmptyChart label="Sem dados de eficiência" />;
  return (
    <ResponsiveContainer width="100%" height={300}>
      <ScatterChart margin={{ top: 8, right: 16, bottom: 24, left: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
        <XAxis
          type="number"
          dataKey="x"
          name="Custo médio"
          tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
          tickFormatter={(v) => formatCost(Number(v))}
        />
        <YAxis
          type="number"
          dataKey="y"
          name="Latência média"
          tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
          tickFormatter={(v) => formatLatency(Number(v))}
        />
        <ZAxis type="number" dataKey="tokens" range={[60, 600]} name="Tokens" />
        <Tooltip
          contentStyle={tooltipStyle}
          formatter={(v: number, name: string) => {
            if (name === "Latência média") return formatLatency(v);
            if (name === "Custo médio") return formatCost(v);
            if (name === "Tokens") return formatTokens(v);
            return v;
          }}
        />
        <Scatter data={data}>
          {data.map((d, i) => (
            <Cell key={i} fill={d.fill} />
          ))}
        </Scatter>
        <Legend wrapperStyle={{ fontSize: 11 }} />
      </ScatterChart>
    </ResponsiveContainer>
  );
}

function EmptyChart({ label }: { label: string }) {
  return (
    <div className="flex h-[200px] items-center justify-center text-sm text-muted-foreground">
      {label}
    </div>
  );
}
