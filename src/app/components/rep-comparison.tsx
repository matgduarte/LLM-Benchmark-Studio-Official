"use client";

import { useMemo, useRef, useState } from "react";
import {
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Eye,
  Braces,
  Columns3,
  Cpu,
  Equal,
  Repeat2,
  SplitSquareHorizontal,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useExecutions } from "./hooks";
import { tryParseJson } from "./json-utils";
import { StatusBadge } from "./status-badge";
import { useAppStore } from "@/lib/store";
import { formatCost, formatLatency, formatTokens } from "./format";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { BatchMeta, ExecutionRecord, ModelRef } from "@/lib/storage/types";

/** Palette used to tag responses that are byte-identical to each other. */
const VARIANT_STYLES = [
  "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  "border-violet-500/40 bg-violet-500/10 text-violet-600 dark:text-violet-400",
  "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  "border-sky-500/40 bg-sky-500/10 text-sky-600 dark:text-sky-400",
  "border-rose-500/40 bg-rose-500/10 text-rose-600 dark:text-rose-400",
  "border-teal-500/40 bg-teal-500/10 text-teal-600 dark:text-teal-400",
];

const ALL_REPS = "__all__";

/** Label rendered on a column header (and on the JSON table header). */
interface ColumnLabel {
  primary: string;
  badge?: string;
  secondary?: string;
}

export function RepComparison({ batchId, meta }: { batchId: string; meta: BatchMeta }) {
  const execsQ = useExecutions(batchId);
  const openExecution = useAppStore((s) => s.openExecution);
  const compareTarget = useAppStore((s) => s.compareTarget);
  const target = compareTarget?.batchId === batchId ? compareTarget : null;

  /**
   * Which dimension becomes the columns:
   * - `reps`   — one model fixed, every repetition side by side.
   * - `models` — one repetition fixed, every model side by side.
   */
  const allModelIds = useMemo(() => meta.models.map((m) => m.id), [meta.models]);

  const [axis, setAxis] = useState<"reps" | "models">(target?.axis ?? "reps");
  const [inputId, setInputId] = useState<string>(target?.inputId ?? meta.inputs[0]?.id ?? "");
  /** Which models get a column. Defaults to every model in the batch. */
  const [selectedModels, setSelectedModels] = useState<string[]>(
    target?.axis === "reps" ? [target.modelId] : allModelIds
  );
  const [rep, setRep] = useState<string>(target ? String(target.repetition) : "1");
  const [mode, setMode] = useState<"columns" | "fields">("columns");
  const [showPrompt, setShowPrompt] = useState(true);
  const [wrap, setWrap] = useState(true);
  const [syncScroll, setSyncScroll] = useState(true);

  // Jump-in from the execution detail dialog while already on this tab: adjust
  // the selection during render (see "adjusting state when props change").
  const [appliedTarget, setAppliedTarget] = useState(target);
  if (target && target !== appliedTarget) {
    setAppliedTarget(target);
    setAxis(target.axis);
    setInputId(target.inputId);
    // Comparing reps zooms into one model; comparing models needs them all.
    setSelectedModels(target.axis === "reps" ? [target.modelId] : allModelIds);
    setRep(String(target.repetition));
  }

  const input = meta.inputs.find((i) => i.id === inputId) ?? meta.inputs[0];

  const forInput = useMemo(
    () => (execsQ.data?.executions ?? []).filter((e) => e.inputId === inputId),
    [execsQ.data, inputId]
  );

  /** Repetition numbers that actually exist for this input. */
  const repOptions = useMemo(() => {
    const set = new Set(forInput.map((e) => e.repetition));
    if (set.size === 0) {
      for (let i = 1; i <= meta.repetitions; i++) set.add(i);
    }
    return [...set].sort((a, b) => a - b);
  }, [forInput, meta.repetitions]);

  const columns = useMemo(() => {
    const chosen = new Set(selectedModels);
    const list = forInput.filter((e) => chosen.has(e.modelId));
    if (axis === "models") {
      // Rep first so that, with "todas as reps", each rep block stays together.
      return list
        .filter((e) => rep === ALL_REPS || e.repetition === Number(rep))
        .sort((a, b) => a.repetition - b.repetition || a.modelId.localeCompare(b.modelId));
    }
    return list.sort(
      (a, b) => a.modelId.localeCompare(b.modelId) || a.repetition - b.repetition
    );
  }, [forInput, axis, selectedModels, rep]);

  /** Column headers: the fixed dimension is implicit, the varying one leads. */
  const labels = useMemo<ColumnLabel[]>(
    () =>
      columns.map((e) => {
        const model = e.modelLabel ?? e.modelId;
        if (axis === "models") {
          return {
            primary: model,
            badge: `#${e.repetition}`,
            secondary: model === e.modelId ? undefined : e.modelId,
          };
        }
        return {
          primary: `#${e.repetition}`,
          secondary: selectedModels.length > 1 ? e.modelId : undefined,
        };
      }),
    [columns, axis, selectedModels]
  );

  /** Groups byte-identical responses so repeated outputs are obvious at a glance. */
  const variants = useMemo(() => {
    const byKey = new Map<string, number>();
    const index: number[] = [];
    for (const e of columns) {
      const key = canonicalize(e.response);
      if (key === null) {
        index.push(-1);
        continue;
      }
      if (!byKey.has(key)) byKey.set(key, byKey.size);
      index.push(byKey.get(key)!);
    }
    return { index, count: byKey.size };
  }, [columns]);

  /**
   * Payload of the "Copiar todos" button: one entry per selected model (in the
   * batch's model order) for every repetition in view. A model that produced
   * nothing still takes its slot, carrying just its id.
   */
  function buildModelsPayload(): Record<string, unknown>[] {
    const reps = rep === ALL_REPS ? repOptions : [Number(rep)];
    const chosen = new Set(selectedModels);
    const out: Record<string, unknown>[] = [];
    for (const r of reps) {
      for (const m of meta.models) {
        if (!chosen.has(m.id)) continue;
        out.push(
          exportEntry(
            m.id,
            forInput.find((e) => e.modelId === m.id && e.repetition === r)
          )
        );
      }
    }
    return out;
  }

  // Optional synchronized vertical scrolling between the response panes.
  const paneRefs = useRef<Array<HTMLDivElement | null>>([]);
  const syncing = useRef(false);

  function handlePaneScroll(i: number) {
    if (!syncScroll || syncing.current) return;
    const src = paneRefs.current[i];
    if (!src) return;
    syncing.current = true;
    for (let j = 0; j < paneRefs.current.length; j++) {
      const el = paneRefs.current[j];
      if (!el || j === i) continue;
      el.scrollTop = src.scrollTop;
    }
    requestAnimationFrame(() => {
      syncing.current = false;
    });
  }

  if (meta.inputs.length === 0) {
    return (
      <Card className="py-12">
        <CardContent className="text-center text-sm text-muted-foreground">
          Este lote não possui entradas.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {/* Axis picker — decides what a column means */}
      <div className="flex h-9 w-fit items-center rounded-md border border-border/60 p-0.5">
        <ModeButton active={axis === "reps"} onClick={() => setAxis("reps")}>
          <Repeat2 className="h-3.5 w-3.5" /> Reps do mesmo modelo
        </ModeButton>
        <ModeButton active={axis === "models"} onClick={() => setAxis("models")}>
          <Cpu className="h-3.5 w-3.5" /> Modelos na mesma rep
        </ModeButton>
      </div>

      {/* Selection bar */}
      <div className="flex flex-wrap items-center gap-2">
        <Select value={inputId} onValueChange={setInputId}>
          <SelectTrigger className="h-9 w-[260px] text-sm">
            <SelectValue placeholder="Entrada" />
          </SelectTrigger>
          <SelectContent>
            {meta.inputs.map((i, idx) => (
              <SelectItem key={i.id} value={i.id}>
                {i.label ?? `Input ${idx + 1}`}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {axis === "models" && (
          <Select value={rep} onValueChange={setRep}>
            <SelectTrigger className="h-9 w-[200px] text-sm">
              <SelectValue placeholder="Repetição" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_REPS}>Todas as repetições</SelectItem>
              {repOptions.map((r) => (
                <SelectItem key={r} value={String(r)}>
                  Repetição #{r}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <ModelPicker
          models={meta.models}
          selected={selectedModels}
          onChange={setSelectedModels}
        />

        <div className="flex h-9 items-center rounded-md border border-border/60 p-0.5">
          <ModeButton active={mode === "columns"} onClick={() => setMode("columns")}>
            <Columns3 className="h-3.5 w-3.5" /> Colunas
          </ModeButton>
          <ModeButton active={mode === "fields"} onClick={() => setMode("fields")}>
            <Braces className="h-3.5 w-3.5" /> Campos JSON
          </ModeButton>
        </div>

        <div className="ml-auto flex items-center gap-4">
          {mode === "columns" && (
            <>
              <div className="flex items-center gap-2">
                <Switch id="cmp-wrap" checked={wrap} onCheckedChange={setWrap} />
                <Label htmlFor="cmp-wrap" className="text-xs text-muted-foreground">
                  Quebrar linhas
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch id="cmp-sync" checked={syncScroll} onCheckedChange={setSyncScroll} />
                <Label htmlFor="cmp-sync" className="text-xs text-muted-foreground">
                  Rolagem sincronizada
                </Label>
              </div>
            </>
          )}
          {axis === "models" && <CopyAllButton build={buildModelsPayload} />}
          <Badge variant="secondary" className="h-9 px-3">
            {columns.length} {columns.length === 1 ? "execução" : "execuções"}
          </Badge>
        </div>
      </div>

      {/* Shared input + prompt (identical for every column by construction) */}
      <Card>
        <CardContent className="space-y-3 py-3">
          <button
            onClick={() => setShowPrompt((v) => !v)}
            className="flex w-full items-center gap-1.5 text-left text-sm font-medium"
          >
            {showPrompt ? (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            )}
            Prompt e entrada usados em todas as colunas abaixo
            <span className="ml-2 font-normal text-xs text-muted-foreground">
              {input?.label ?? "Input"} ·{" "}
              {axis === "models"
                ? rep === ALL_REPS
                  ? "todas as reps"
                  : `rep #${rep}`
                : "todas as reps"}{" "}
              ·{" "}
              {selectedModels.length === allModelIds.length
                ? `${allModelIds.length} modelos`
                : selectedModels.length === 1
                  ? selectedModels[0]
                  : `${selectedModels.length} de ${allModelIds.length} modelos`}
            </span>
          </button>
          {showPrompt && (
            <div className="grid gap-3 lg:grid-cols-2">
              <div>
                <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  System prompt
                </p>
                <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-muted/40 p-3 font-mono text-xs scrollbar-thin">
                  {meta.systemPrompt || "(vazio)"}
                </pre>
              </div>
              <div>
                <div className="mb-1 flex items-center gap-2">
                  <Badge variant="outline" className="text-[10px]">
                    {(input?.format ?? "text").toUpperCase()}
                  </Badge>
                  <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    Input do usuário
                  </p>
                </div>
                <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-muted/40 p-3 font-mono text-xs scrollbar-thin">
                  {input?.content ?? "(vazio)"}
                </pre>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {execsQ.isLoading ? (
        <div className="flex gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-64 flex-1" />
          ))}
        </div>
      ) : columns.length === 0 ? (
        <Card className="py-12">
          <CardContent className="text-center text-sm text-muted-foreground">
            {selectedModels.length === 0
              ? "Selecione ao menos um modelo para comparar."
              : "Nenhuma execução para esta seleção."}
          </CardContent>
        </Card>
      ) : mode === "columns" ? (
        <>
          <VariantSummary
            count={variants.count}
            total={columns.length}
            unit={axis === "models" ? "modelos" : "execuções"}
          />
          <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-thin">
            {columns.map((exec, i) => (
              <RepColumn
                key={exec.id}
                exec={exec}
                label={labels[i]}
                variant={variants.index[i]}
                firstOfVariant={variants.index.indexOf(variants.index[i]) === i}
                wrap={wrap}
                onView={() => openExecution(exec.id, batchId)}
                paneRef={(el) => {
                  paneRefs.current[i] = el;
                }}
                onScroll={() => handlePaneScroll(i)}
              />
            ))}
          </div>
        </>
      ) : (
        <FieldComparison
          columns={columns}
          labels={labels}
          unit={axis === "models" ? "modelos" : "reps"}
        />
      )}
    </div>
  );
}

/**
 * One slot of the exported array: the model id first, then the response's own
 * fields. A model with no usable response keeps its slot carrying only the id,
 * so the array stays aligned with the model list either way.
 */
function exportEntry(modelId: string, exec?: ExecutionRecord): Record<string, unknown> {
  const out: Record<string, unknown> = { model: modelId };
  const text = exec?.response?.trim();
  if (!text) return out;
  const parsed = tryParseJson(text);
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    // `model` is ours by definition; every other field is copied verbatim.
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (k !== "model") out[k] = v;
    }
  } else {
    // Arrays and free text have no fields to merge — nest them instead.
    out.response = parsed ?? text;
  }
  return out;
}

/** Copies every model's response as a single positional JSON array. */
function CopyAllButton({ build }: { build: () => Record<string, unknown>[] }) {
  const [copied, setCopied] = useState(false);

  function copy() {
    const payload = build();
    navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
    setCopied(true);
    // Slots carrying only `model` are the ones that produced nothing.
    const empty = payload.filter((p) => Object.keys(p).length === 1).length;
    toast.success(
      `${payload.length} ${payload.length === 1 ? "resultado copiado" : "resultados copiados"}` +
        (empty > 0 ? ` (${empty} sem retorno)` : "")
    );
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <Button
      variant="outline"
      onClick={copy}
      title="Copiar um array com o resultado de todos os modelos, na ordem do lote"
      className="h-9 gap-1.5 px-3 text-xs font-normal"
    >
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      Copiar todos
    </Button>
  );
}

/** Checkbox list of the batch's models — all selected by default. */
function ModelPicker({
  models,
  selected,
  onChange,
}: {
  models: ModelRef[];
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const all = models.length;
  const chosen = selected.length;
  const label =
    chosen === all
      ? `Todos os modelos (${all})`
      : chosen === 1
        ? (models.find((m) => m.id === selected[0])?.label ?? selected[0])
        : `${chosen} de ${all} modelos`;

  function toggle(id: string, on: boolean) {
    // Preserve the batch's model order regardless of click order.
    onChange(models.filter((m) => (m.id === id ? on : selected.includes(m.id))).map((m) => m.id));
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          className="h-9 w-[260px] justify-between gap-2 px-3 text-sm font-normal"
        >
          <span className="truncate">{label}</span>
          <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-[300px]">
        <div className="flex items-center justify-between px-2 py-1.5">
          <span className="text-xs font-medium text-muted-foreground">Modelos a comparar</span>
          <div className="flex gap-1">
            <button
              onClick={() => onChange(models.map((m) => m.id))}
              className="rounded px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              Todos
            </button>
            <button
              onClick={() => onChange([])}
              className="rounded px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              Limpar
            </button>
          </div>
        </div>
        <DropdownMenuSeparator />
        {models.map((m) => (
          <DropdownMenuCheckboxItem
            key={m.id}
            checked={selected.includes(m.id)}
            onCheckedChange={(on) => toggle(m.id, Boolean(on))}
            onSelect={(e) => e.preventDefault()}
          >
            <span className="min-w-0">
              <span className="block truncate text-sm">{m.label ?? m.id}</span>
              {m.label && m.label !== m.id && (
                <span className="block truncate font-mono text-[10px] text-muted-foreground">
                  {m.id}
                </span>
              )}
            </span>
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ModeButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded px-2.5 text-xs font-medium transition",
        active ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"
      )}
    >
      {children}
    </button>
  );
}

function VariantSummary({
  count,
  total,
  unit,
}: {
  count: number;
  total: number;
  unit: string;
}) {
  if (total < 2) return null;
  const allEqual = count === 1;
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-lg border px-3 py-2 text-xs",
        allEqual
          ? "border-emerald-500/40 bg-emerald-500/5 text-emerald-600 dark:text-emerald-400"
          : "border-amber-500/40 bg-amber-500/5 text-amber-600 dark:text-amber-400"
      )}
    >
      {allEqual ? (
        <Equal className="h-3.5 w-3.5" />
      ) : (
        <SplitSquareHorizontal className="h-3.5 w-3.5" />
      )}
      {allEqual
        ? `Todas as ${total} respostas são idênticas.`
        : `${count} respostas distintas entre ${total} ${unit}.`}
    </div>
  );
}

function RepColumn({
  exec,
  label,
  variant,
  firstOfVariant,
  wrap,
  onView,
  paneRef,
  onScroll,
}: {
  exec: ExecutionRecord;
  label: ColumnLabel;
  variant: number;
  firstOfVariant: boolean;
  wrap: boolean;
  onView: () => void;
  paneRef: (el: HTMLDivElement | null) => void;
  onScroll: () => void;
}) {
  const [copied, setCopied] = useState(false);

  function copy() {
    navigator.clipboard.writeText(exec.response ?? "");
    setCopied(true);
    toast.success("Resposta copiada");
    setTimeout(() => setCopied(false), 1500);
  }

  const chars = exec.response?.length ?? 0;

  return (
    <div className="flex min-w-[340px] flex-1 flex-col overflow-hidden rounded-lg border border-border/60">
      <div className="space-y-1.5 border-b border-border/60 bg-muted/30 px-3 py-2">
        <div className="flex items-center gap-2">
          <span
            className="min-w-0 truncate text-sm font-semibold tabular-nums"
            title={label.primary}
          >
            {label.primary}
          </span>
          {label.badge && (
            <Badge variant="secondary" className="shrink-0 px-1.5 text-[10px] tabular-nums">
              {label.badge}
            </Badge>
          )}
          {variant >= 0 && (
            <Badge
              variant="outline"
              className={cn("px-1.5 text-[10px]", VARIANT_STYLES[variant % VARIANT_STYLES.length])}
              title={
                firstOfVariant
                  ? "Primeira ocorrência desta resposta"
                  : "Resposta idêntica à de outra coluna com esta mesma cor"
              }
            >
              {String.fromCharCode(65 + (variant % 26))}
              {!firstOfVariant && " = "}
            </Badge>
          )}
          <StatusBadge status={exec.status} />
          <div className="ml-auto flex items-center gap-0.5">
            <button
              onClick={copy}
              title="Copiar resposta"
              className="rounded p-1 text-muted-foreground transition hover:bg-muted hover:text-foreground"
            >
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            </button>
            <button
              onClick={onView}
              title="Abrir detalhe da execução"
              className="rounded p-1 text-muted-foreground transition hover:bg-muted hover:text-foreground"
            >
              <Eye className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
        {label.secondary && (
          <p
            className="truncate font-mono text-[10px] text-muted-foreground"
            title={label.secondary}
          >
            {label.secondary}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px] tabular-nums text-muted-foreground">
          <span>{formatLatency(exec.durationMs)}</span>
          <span>{formatCost(exec.cost)}</span>
          <span>{formatTokens(exec.usage.totalTokens)} tok</span>
          <span>{chars.toLocaleString("pt-BR")} chars</span>
        </div>
      </div>
      <div
        ref={paneRef}
        onScroll={onScroll}
        className="h-[55vh] overflow-auto scrollbar-thin"
      >
        {exec.status === "failed" && exec.errorMessage ? (
          <p className="p-3 text-xs text-destructive">{exec.errorMessage}</p>
        ) : (
          <pre
            className={cn(
              "p-3 font-mono text-xs leading-relaxed",
              wrap ? "whitespace-pre-wrap break-words" : "whitespace-pre"
            )}
          >
            {exec.response || "(resposta vazia)"}
          </pre>
        )}
      </div>
    </div>
  );
}

/**
 * Field-level view for JSON responses: one row per JSON path, one column per rep.
 * Rows whose values diverge across reps are highlighted — this is what makes
 * structured-output runs comparable without reading each response in full.
 */
function FieldComparison({
  columns,
  labels,
  unit,
}: {
  columns: ExecutionRecord[];
  labels: ColumnLabel[];
  unit: string;
}) {
  const [onlyDiff, setOnlyDiff] = useState(false);

  const { paths, values, parsedCount } = useMemo(() => {
    const values = columns.map((e) => {
      const parsed = tryParseJson(e.response);
      return parsed === undefined ? null : flattenJson(parsed);
    });
    const paths: string[] = [];
    const seen = new Set<string>();
    for (const v of values) {
      if (!v) continue;
      for (const k of Object.keys(v)) {
        if (!seen.has(k)) {
          seen.add(k);
          paths.push(k);
        }
      }
    }
    return { paths, values, parsedCount: values.filter(Boolean).length };
  }, [columns]);

  const rows = useMemo(
    () =>
      paths.map((path) => {
        const cells = values.map((v) => (v && path in v ? v[path] : undefined));
        // Only reps that produced parseable JSON take part in the verdict —
        // otherwise a single failed rep would paint every field as divergent.
        const comparable = cells.filter((_, i) => values[i] !== null);
        const differs = comparable.some((c) => c !== comparable[0]);
        return { path, cells, differs };
      }),
    [paths, values]
  );

  const visible = onlyDiff ? rows.filter((r) => r.differs) : rows;
  const diffCount = rows.filter((r) => r.differs).length;

  if (parsedCount === 0) {
    return (
      <Card className="py-12">
        <CardContent className="text-center text-sm text-muted-foreground">
          Nenhuma das respostas é JSON válido — use o modo &quot;Colunas&quot;.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        <div
          className={cn(
            "flex items-center gap-2 rounded-lg border px-3 py-2 text-xs",
            diffCount === 0
              ? "border-emerald-500/40 bg-emerald-500/5 text-emerald-600 dark:text-emerald-400"
              : "border-amber-500/40 bg-amber-500/5 text-amber-600 dark:text-amber-400"
          )}
        >
          {diffCount === 0 ? (
            <Equal className="h-3.5 w-3.5" />
          ) : (
            <SplitSquareHorizontal className="h-3.5 w-3.5" />
          )}
          {diffCount === 0
            ? `Os ${rows.length} campos são iguais em todos os ${unit}.`
            : `${diffCount} de ${rows.length} campos divergem entre os ${unit}.`}
        </div>
        {parsedCount < columns.length && (
          <Badge variant="outline" className="border-amber-500/40 text-[10px] text-amber-600 dark:text-amber-400">
            {columns.length - parsedCount} resposta(s) não são JSON válido
          </Badge>
        )}
        <div className="ml-auto flex items-center gap-2">
          <Switch id="cmp-onlydiff" checked={onlyDiff} onCheckedChange={setOnlyDiff} />
          <Label htmlFor="cmp-onlydiff" className="text-xs text-muted-foreground">
            Só campos divergentes
          </Label>
        </div>
      </div>

      <Card>
        <CardContent className="overflow-x-auto p-0 scrollbar-thin">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr className="text-left text-xs text-muted-foreground">
                <th className="sticky left-0 z-10 min-w-[200px] bg-muted/50 px-3 py-2 font-medium">
                  Campo
                </th>
                {columns.map((e, i) => (
                  <th key={e.id} className="min-w-[200px] px-3 py-2 font-medium">
                    <span className="tabular-nums text-foreground">{labels[i].primary}</span>
                    {labels[i].badge && (
                      <span className="ml-1.5 tabular-nums">{labels[i].badge}</span>
                    )}
                    {labels[i].secondary && (
                      <span className="ml-1.5 font-mono text-[10px]">{labels[i].secondary}</span>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 ? (
                <tr>
                  <td
                    colSpan={columns.length + 1}
                    className="px-3 py-8 text-center text-sm text-muted-foreground"
                  >
                    Nenhum campo divergente.
                  </td>
                </tr>
              ) : (
                visible.map((r) => (
                  <tr
                    key={r.path}
                    className={cn(
                      "border-b border-border/40 align-top last:border-0",
                      r.differs && "bg-amber-500/5"
                    )}
                  >
                    <td
                      className={cn(
                        "sticky left-0 z-10 max-w-[280px] break-all px-3 py-1.5 font-mono text-[11px]",
                        r.differs ? "bg-amber-500/5 text-amber-700 dark:text-amber-400" : "bg-background text-muted-foreground"
                      )}
                    >
                      {r.path}
                    </td>
                    {r.cells.map((c, i) => (
                      <td
                        key={columns[i].id}
                        className="max-w-[360px] whitespace-pre-wrap break-words px-3 py-1.5 font-mono text-[11px]"
                      >
                        {values[i] === null ? (
                          <span className="text-muted-foreground/60">(sem JSON)</span>
                        ) : c === undefined ? (
                          <span className="text-muted-foreground/60">(ausente)</span>
                        ) : (
                          displayValue(c)
                        )}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * Normalized form used to detect identical responses. JSON payloads are
 * canonicalized (keys sorted) so that key ordering alone does not make two
 * otherwise-equal responses look different.
 */
function canonicalize(response?: string): string | null {
  if (!response) return null;
  const parsed = tryParseJson(response);
  if (parsed !== undefined) return JSON.stringify(sortKeys(parsed));
  return response.trim();
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(value as Record<string, unknown>).sort()) {
      out[k] = sortKeys((value as Record<string, unknown>)[k]);
    }
    return out;
  }
  return value;
}

/** Flattens a JSON value into `path -> stringified scalar` pairs. */
function flattenJson(
  value: unknown,
  prefix = "",
  out: Record<string, string> = {}
): Record<string, string> {
  const key = prefix || "(raiz)";
  if (value === null || typeof value !== "object") {
    out[key] = JSON.stringify(value) ?? "undefined";
    return out;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) {
      out[key] = "[]";
      return out;
    }
    value.forEach((v, i) => flattenJson(v, `${prefix}[${i}]`, out));
    return out;
  }
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length === 0) {
    out[key] = "{}";
    return out;
  }
  for (const [k, v] of entries) flattenJson(v, prefix ? `${prefix}.${k}` : k, out);
  return out;
}

/** Strips the JSON quotes from string scalars so the table stays readable. */
function displayValue(raw: string): string {
  if (raw.startsWith('"') && raw.endsWith('"')) {
    try {
      return JSON.parse(raw) as string;
    } catch {
      return raw;
    }
  }
  return raw;
}
