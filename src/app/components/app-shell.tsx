"use client";

import { Activity, BarChart3, PlusCircle, Search, Settings as SettingsIcon, FlaskConical, Github, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "./theme-toggle";
import { useAppStore, type ViewKind } from "@/lib/store";
import { useSettings } from "./hooks";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

export function AppShell({ children }: { children: ReactNode }) {
  const view = useAppStore((s) => s.view);
  const go = useAppStore((s) => s.go);
  const settings = useSettings();
  const hasApiKey = settings.data?.hasApiKey;

  const navItems: Array<{ kind: ViewKind["kind"]; label: string; icon: ReactNode }> = [
    { kind: "batches", label: "Lotes", icon: <BarChart3 className="h-4 w-4" /> },
    { kind: "create-batch", label: "Novo experimento", icon: <PlusCircle className="h-4 w-4" /> },
    { kind: "model-search", label: "Buscar por modelo", icon: <Search className="h-4 w-4" /> },
    { kind: "usage", label: "Uso & Custos", icon: <Activity className="h-4 w-4" /> },
    { kind: "settings", label: "Configurações", icon: <SettingsIcon className="h-4 w-4" /> },
  ];

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-border/80 bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex h-14 w-full max-w-[1600px] items-center gap-3 px-4 sm:px-6">
          <button
            onClick={() => go({ kind: "batches" })}
            className="flex items-center gap-2.5 rounded-lg transition hover:opacity-80"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
              <FlaskConical className="h-4 w-4" />
            </span>
            <span className="flex flex-col items-start leading-none">
              <span className="text-sm font-semibold tracking-tight">LLM Benchmark Studio</span>
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                OpenRouter Evaluation
              </span>
            </span>
          </button>

          <nav className="ml-4 hidden items-center gap-1 md:flex">
            {navItems.map((item) => {
              const active = view.kind === item.kind;
              return (
                <Button
                  key={item.kind}
                  variant={active ? "secondary" : "ghost"}
                  size="sm"
                  className={cn(
                    "h-9 gap-2",
                    active && "bg-secondary text-secondary-foreground shadow-sm"
                  )}
                  onClick={() => go({ kind: item.kind } as ViewKind)}
                >
                  {item.icon}
                  {item.label}
                </Button>
              );
            })}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <Badge
              variant="outline"
              className={cn(
                "hidden gap-1.5 sm:flex",
                hasApiKey
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                  : "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400"
              )}
            >
              <KeyRound className="h-3 w-3" />
              {hasApiKey ? "API key ativa" : "Sem API key"}
            </Badge>
            <ThemeToggle />
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9"
              asChild
              aria-label="OpenRouter docs"
            >
              <a href="https://openrouter.ai/docs" target="_blank" rel="noreferrer">
                <Github className="h-4 w-4" />
              </a>
            </Button>
          </div>
        </div>

        {/* Mobile nav */}
        <div className="flex items-center gap-1 overflow-x-auto border-t border-border/60 px-2 py-1.5 md:hidden scrollbar-thin">
          {navItems.map((item) => {
            const active = view.kind === item.kind;
            return (
              <Button
                key={item.kind}
                variant={active ? "secondary" : "ghost"}
                size="sm"
                className="h-8 shrink-0 gap-1.5 text-xs"
                onClick={() => go({ kind: item.kind } as ViewKind)}
              >
                {item.icon}
                {item.label}
              </Button>
            );
          })}
        </div>
      </header>

      {/* Main */}
      <main className="mx-auto w-full max-w-[1600px] flex-1 px-4 py-6 sm:px-6">{children}</main>

      {/* Footer */}
      <footer className="mt-auto border-t border-border/80 bg-muted/30">
        <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-2 px-4 py-4 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="flex items-center gap-2">
            <Activity className="h-3.5 w-3.5 text-primary" />
            <span>
              Persistência em arquivos locais · {settings.data?.appTitle ?? "LLM Benchmark Studio"}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="opacity-70">Fonte de verdade: <code className="rounded bg-muted px-1.5 py-0.5">/data</code></span>
            <span className="opacity-70">OpenRouter API</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
