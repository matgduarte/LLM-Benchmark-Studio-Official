"use client";

import { useState } from "react";
import { CalendarRange, Filter, RefreshCw, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAppStore } from "@/lib/store";
import type { UsageFilters, UsageProvider, UsageStatusFilter } from "@/lib/usage/types";

const PRESETS: { value: Exclude<UsageFilters["preset"], "custom">; label: string }[] = [
  { value: "24h", label: "24h" },
  { value: "7d", label: "7d" },
  { value: "30d", label: "30d" },
];

interface Props {
  onRefresh: () => void;
  loading: boolean;
}

export function UsageFilterBar({ onRefresh, loading }: Props) {
  const filters = useAppStore((s) => s.usageFilters);
  const setFilters = useAppStore((s) => s.setUsageFilters);
  const setPreset = useAppStore((s) => s.setUsagePreset);

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border/80 bg-card/50 px-3 py-2">
      <div className="flex items-center gap-1.5 border-r border-border/80 pr-2 text-xs uppercase tracking-wide text-muted-foreground">
        <Filter className="h-3.5 w-3.5" />
        Filtros
      </div>

      <Select
        value={filters.provider}
        onValueChange={(v) => setFilters({ provider: v as UsageProvider | "all" })}
      >
        <SelectTrigger className="h-8 w-[160px] text-xs">
          <SelectValue placeholder="Provedor" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todos os provedores</SelectItem>
          <SelectItem value="openrouter">OpenRouter</SelectItem>
          <SelectItem value="openai">OpenAI</SelectItem>
        </SelectContent>
      </Select>

      {/* Só as execuções locais têm desfecho — nenhuma API de provedor expõe. */}
      <ToggleGroup
        type="single"
        value={filters.status}
        onValueChange={(v) => v && setFilters({ status: v as UsageStatusFilter })}
        className="rounded-md border border-border/80 bg-background/60 p-0.5"
        title="Recorta apenas as execuções locais"
      >
        <ToggleGroupItem value="all" className="h-7 px-3 text-xs">
          Tudo
        </ToggleGroupItem>
        <ToggleGroupItem
          value="success"
          className="h-7 px-3 text-xs data-[state=on]:bg-emerald-500/15 data-[state=on]:text-emerald-600 dark:data-[state=on]:text-emerald-400"
        >
          Sucesso
        </ToggleGroupItem>
        <ToggleGroupItem
          value="error"
          className="h-7 px-3 text-xs data-[state=on]:bg-destructive/15 data-[state=on]:text-destructive"
        >
          Erros
        </ToggleGroupItem>
      </ToggleGroup>

      <ToggleGroup
        type="single"
        value={filters.preset}
        onValueChange={(v) => v && setPreset(v as UsageFilters["preset"])}
        className="rounded-md border border-border/80 bg-background/60 p-0.5"
      >
        {PRESETS.map((p) => (
          <ToggleGroupItem key={p.value} value={p.value} className="h-7 px-3 text-xs">
            {p.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>

      <DateRangePicker
        from={filters.from}
        to={filters.to}
        onApply={(from, to) => setFilters({ from, to, preset: "custom" })}
      />

      <Button
        size="sm"
        variant="outline"
        onClick={onRefresh}
        disabled={loading}
        className="ml-auto h-8 gap-1.5 text-xs"
      >
        {loading ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <RefreshCw className="h-3.5 w-3.5" />
        )}
        {loading ? "Carregando…" : "Atualizar"}
      </Button>
    </div>
  );
}

function DateRangePicker({
  from,
  to,
  onApply,
}: {
  from: string;
  to: string;
  onApply: (from: string, to: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [localFrom, setLocalFrom] = useState(from);
  const [localTo, setLocalTo] = useState(to);

  // Reabrir deve refletir o intervalo vigente, não o rascunho abandonado.
  function handleOpenChange(next: boolean) {
    if (next) {
      setLocalFrom(from);
      setLocalTo(to);
    }
    setOpen(next);
  }

  const invalid = !localFrom || !localTo || localFrom > localTo;

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
          <CalendarRange className="h-3.5 w-3.5" />
          <span className="hidden tabular-nums sm:inline">
            {from} → {to}
          </span>
          <span className="sm:hidden">Período</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-3" align="end">
        <div className="space-y-3">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Intervalo customizado
          </p>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label htmlFor="usage-from" className="text-[10px] uppercase text-muted-foreground">
                De
              </Label>
              <Input
                id="usage-from"
                type="date"
                value={localFrom}
                max={localTo || undefined}
                onChange={(e) => setLocalFrom(e.target.value)}
                className="h-8 text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="usage-to" className="text-[10px] uppercase text-muted-foreground">
                Até
              </Label>
              <Input
                id="usage-to"
                type="date"
                value={localTo}
                min={localFrom || undefined}
                onChange={(e) => setLocalTo(e.target.value)}
                className="h-8 text-xs"
              />
            </div>
          </div>
          {invalid && (
            <p className="text-[11px] text-destructive">
              Informe um intervalo válido (início ≤ fim).
            </p>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)} className="h-7 text-xs">
              Cancelar
            </Button>
            <Button
              size="sm"
              disabled={invalid}
              onClick={() => {
                onApply(localFrom, localTo);
                setOpen(false);
              }}
              className="h-7 text-xs"
            >
              Aplicar
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
