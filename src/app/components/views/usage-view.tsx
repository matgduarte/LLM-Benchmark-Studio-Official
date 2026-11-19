"use client";

import { Activity, AlertTriangle, Cloud, FlaskConical, Info } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { UsageFilterBar } from "../usage/usage-filter-bar";
import { ProviderSpendSection } from "../usage/provider-spend";
import { LocalExecutionsSection } from "../usage/local-executions";
import { useSettings, useUsage } from "../hooks";
import { useAppStore } from "@/lib/store";
import { usageProviderLabel, type UsageSource } from "@/lib/usage/types";
import type { ReactNode } from "react";

export function UsageView() {
  const go = useAppStore((s) => s.go);
  const filters = useAppStore((s) => s.usageFilters);
  const settings = useSettings();

  const usage = useUsage(
    {
      from: filters.from,
      to: filters.to,
      provider: filters.provider,
      status: filters.status,
    },
    // Espera as settings para não disparar a consulta antes de saber das chaves.
    settings.isSuccess
  );

  const report = usage.data;
  const hasAnyKey = Boolean(settings.data?.hasApiKey || settings.data?.hasOpenAiKey);

  return (
    <div className="space-y-6">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-xl border border-border/80 bg-gradient-to-br from-primary/5 via-background to-background p-6">
        <div className="bg-grid absolute inset-0 opacity-40" />
        <div className="relative space-y-1.5">
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary" />
            <h1 className="text-2xl font-semibold tracking-tight">Uso &amp; Custos</h1>
          </div>
          <p className="max-w-3xl text-sm text-muted-foreground">
            O que suas chaves de API consumiram, cruzado com o que os benchmarks deste app
            gastaram. São duas fontes com granularidades diferentes — os provedores só expõem
            agregados por dia, enquanto as execuções locais têm desfecho por request.
          </p>
        </div>
      </div>

      {settings.isLoading ? (
        <LoadingSkeleton />
      ) : (
        <>
          <UsageFilterBar onRefresh={() => usage.refetch()} loading={usage.isFetching} />

          {usage.isError && (
            <Notice kind="error">
              Falha ao carregar os dados: {(usage.error as Error).message}
            </Notice>
          )}

          {!hasAnyKey && (
            <Notice kind="warn">
              Nenhuma chave de API configurada — a seção de gasto nos provedores fica vazia. As
              execuções locais abaixo continuam disponíveis.{" "}
              <button
                onClick={() => go({ kind: "settings" })}
                className="underline underline-offset-2"
              >
                Configurar chaves
              </button>
            </Notice>
          )}

          {/* Seção A — gasto cobrado nos provedores */}
          <Section
            icon={<Cloud className="h-4 w-4" />}
            title="Gasto nos provedores"
            subtitle="Cobrado na sua conta. Agregado por dia e modelo — é o máximo que as APIs devolvem."
          >
            {(report?.providers.sources ?? []).map((s) => (
              <SourceNotice key={s.provider} source={s} onOpenSettings={() => go({ kind: "settings" })} />
            ))}
            <ProviderSpendSection spend={report?.providers} />
          </Section>

          {/* Seção B — execuções deste app, com desfecho real */}
          <Section
            icon={<FlaskConical className="h-4 w-4" />}
            title="Execuções locais"
            subtitle="Benchmarks rodados por este app, lidos de /data. Única fonte com status, latência e custo por request."
          >
            <LocalExecutionsSection local={report?.local} />
          </Section>
        </>
      )}
    </div>
  );
}

function Section({
  icon,
  title,
  subtitle,
  children,
}: {
  icon: ReactNode;
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-start gap-2 border-b border-border/60 pb-2">
        <span className="mt-0.5 text-primary">{icon}</span>
        <div>
          <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

/** Nota por provedor: chave ausente, erro de permissão ou limitação da API. */
function SourceNotice({
  source,
  onOpenSettings,
}: {
  source: UsageSource;
  onOpenSettings: () => void;
}) {
  if (!source.note) return null;
  const kind = source.failed ? "error" : source.missingKey ? "warn" : "info";
  return (
    <Notice kind={kind}>
      <strong>{usageProviderLabel(source.provider)}:</strong> {source.note}{" "}
      {(source.missingKey || source.failed) && (
        <button onClick={onOpenSettings} className="underline underline-offset-2">
          Abrir Configurações
        </button>
      )}
    </Notice>
  );
}

function Notice({ kind, children }: { kind: "error" | "warn" | "info"; children: ReactNode }) {
  const styles = {
    error: "border-destructive/30 bg-destructive/5 text-destructive",
    warn: "border-amber-500/30 bg-amber-500/5 text-amber-700 dark:text-amber-400",
    info: "border-primary/30 bg-primary/5 text-primary",
  }[kind];
  const Icon = kind === "info" ? Info : AlertTriangle;

  return (
    <div className={`flex items-start gap-2 rounded-lg border p-3 text-xs ${styles}`}>
      <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span className="leading-relaxed">{children}</span>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-12 w-full" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-28 w-full" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Skeleton className="h-80 w-full lg:col-span-2" />
        <Skeleton className="h-80 w-full" />
      </div>
    </div>
  );
}
