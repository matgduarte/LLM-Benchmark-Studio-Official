"use client";

import { useState } from "react";
import {
  Activity,
  ArrowLeft,
  KeyRound,
  Save,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Trash2,
  CheckCircle2,
  Cpu,
  Clock,
  Repeat,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import {
  useSettings,
  useSaveSettings,
  useRefreshModels,
  useModels,
  useRemoveCustomModel,
} from "../hooks";
import { useAppStore } from "@/lib/store";
import { toast } from "sonner";
import { formatPricePer1M, formatDateTime, formatNumber, formatTokens } from "../format";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import type { PublicSettings } from "@/lib/api-client";
import { deriveCapabilities } from "@/lib/storage/types";

export function SettingsView() {
  const go = useAppStore((s) => s.go);
  const settings = useSettings();
  const refresh = useRefreshModels();
  const modelsQ = useModels();
  const removeCustom = useRemoveCustomModel();

  const data = settings.data;
  const envKey = data?.openrouterApiKeySource === "env";
  const envOpenAiKey = data?.openaiApiKeySource === "env";
  const envManagementKey = data?.managementKeySource === "env";

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => go({ kind: "batches" })} className="h-9 w-9">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Configurações</h1>
          <p className="text-sm text-muted-foreground">
            API key do OpenRouter, chaves de leitura de consumo, defaults de execução e catálogo de
            modelos.
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <SettingsForm
          key={data?.updatedAt ?? "empty"}
          data={data}
          envKey={envKey}
          envOpenAiKey={envOpenAiKey}
          envManagementKey={envManagementKey}
        />
      </div>

      {/* Models catalog */}
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <div className="space-y-1">
            <CardTitle className="text-base">Catálogo de modelos</CardTitle>
            <CardDescription>
              {formatNumber(modelsQ.data?.models.length ?? 0)} modelos. Custom:{" "}
              {formatNumber(modelsQ.data?.models.filter((m) => m.custom).length ?? 0)}.
            </CardDescription>
          </div>
          <Button
            variant="secondary"
            className="gap-2"
            disabled={refresh.isPending}
            onClick={async () => {
              try {
                const r = await refresh.mutateAsync();
                toast.success("Catálogo atualizado", { description: `${r.count} modelos.` });
              } catch (e) {
                toast.error("Falha ao atualizar", { description: (e as Error).message });
              }
            }}
          >
            {refresh.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Atualizar do OpenRouter
          </Button>
        </CardHeader>
        <CardContent>
          {modelsQ.isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : (
            <ScrollArea className="h-[400px] pr-3 scrollbar-thin">
              <div className="space-y-1.5">
                {modelsQ.data?.models.slice(0, 300).map((m) => (
                  <div
                    key={m.id}
                    className="flex items-center gap-3 rounded-lg border border-border/60 bg-muted/20 px-3 py-2"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <p className="truncate text-sm font-medium">{m.name}</p>
                        {m.custom && <Badge variant="secondary" className="text-[9px]">custom</Badge>}
                        {m.topProvider?.isReasoningModel && (
                          <Badge variant="outline" className="text-[9px]">reasoning</Badge>
                        )}
                        {deriveCapabilities(m.supportedParameters).structuredOutputs && (
                          <Badge
                            variant="outline"
                            className="border-emerald-500/30 bg-emerald-500/10 px-1 text-[9px] text-emerald-600 dark:text-emerald-400"
                            title="Suporta Structured Outputs (json_schema strict)"
                          >
                            JSON schema
                          </Badge>
                        )}
                        {m.supportedParameters !== undefined &&
                          !deriveCapabilities(m.supportedParameters).json && (
                            <Badge
                              variant="outline"
                              className="border-destructive/30 bg-destructive/10 px-1 text-[9px] text-destructive"
                              title="Não suporta response_format"
                            >
                              sem JSON
                            </Badge>
                          )}
                      </div>
                      <p className="truncate font-mono text-[10px] text-muted-foreground">{m.id}</p>
                    </div>
                    <div className="hidden gap-4 text-right text-xs sm:flex">
                      {m.contextLength !== undefined && (
                        <div>
                          <p className="text-[9px] uppercase text-muted-foreground">Contexto</p>
                          <p className="tabular-nums">{formatTokens(m.contextLength)}</p>
                        </div>
                      )}
                      <div>
                        <p className="text-[9px] uppercase text-muted-foreground">In / 1M</p>
                        <p className="tabular-nums">{formatPricePer1M(m.promptPricePer1M)}</p>
                      </div>
                      <div>
                        <p className="text-[9px] uppercase text-muted-foreground">Out / 1M</p>
                        <p className="tabular-nums">{formatPricePer1M(m.completionPricePer1M)}</p>
                      </div>
                    </div>
                    {m.custom && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Remover modelo customizado?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Remove <strong>{m.name}</strong> do catálogo. Lotes existentes não são afetados.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={async () => {
                                await removeCustom.mutateAsync(m.id);
                                toast.success("Modelo removido");
                              }}
                            >
                              Remover
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function SettingsForm({
  data,
  envKey,
  envOpenAiKey,
  envManagementKey,
}: {
  data: PublicSettings | undefined;
  envKey: boolean;
  envOpenAiKey: boolean;
  envManagementKey: boolean;
}) {
  const save = useSaveSettings();
  const [apiKey, setApiKey] = useState("");
  const [openAiKey, setOpenAiKey] = useState("");
  const [showOpenAiKey, setShowOpenAiKey] = useState(false);
  const [managementKey, setManagementKey] = useState("");
  const [showManagementKey, setShowManagementKey] = useState(false);
  const [referer, setReferer] = useState(data?.referer ?? "");
  const [appTitle, setAppTitle] = useState(data?.appTitle ?? "");
  const [concurrency, setConcurrency] = useState(data?.defaultConcurrency ?? 4);
  const [timeoutSec, setTimeoutSec] = useState(
    Math.round((data?.defaultTimeoutMs ?? 90000) / 1000)
  );
  const [repetitions, setRepetitions] = useState(data?.defaultRepetitions ?? 3);
  const [maxRetries, setMaxRetries] = useState(data?.maxRetries ?? 2);
  const [showKey, setShowKey] = useState(false);

  async function handleSave() {
    try {
      await save.mutateAsync({
        openrouterApiKey: envKey ? undefined : apiKey.trim() || undefined,
        // Campo vazio = manter a chave já salva; limpar é ação explícita.
        openaiApiKey: envOpenAiKey ? undefined : openAiKey.trim() || undefined,
        openrouterManagementKey: envManagementKey ? undefined : managementKey.trim() || undefined,
        referer: referer.trim() || undefined,
        appTitle: appTitle.trim() || undefined,
        defaultConcurrency: concurrency,
        defaultTimeoutMs: timeoutSec * 1000,
        defaultRepetitions: repetitions,
        maxRetries,
      });
      setApiKey("");
      setOpenAiKey("");
      setManagementKey("");
      toast.success("Configurações salvas");
    } catch (e) {
      toast.error("Falha ao salvar", { description: (e as Error).message });
    }
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <CardTitle className="text-base flex items-center gap-2">
                <KeyRound className="h-4 w-4 text-primary" />
                OpenRouter API Key
              </CardTitle>
              <CardDescription>
                Chave armazenada localmente em{" "}
                <code className="rounded bg-muted px-1 py-0.5 text-xs">data/config/settings.json</code>.
              </CardDescription>
            </div>
            {data?.hasApiKey ? (
              <Badge
                className="gap-1.5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                variant="outline"
              >
                <ShieldCheck className="h-3 w-3" /> Ativa
              </Badge>
            ) : (
              <Badge
                className="gap-1.5 bg-amber-500/10 text-amber-600 dark:text-amber-400"
                variant="outline"
              >
                <AlertCircle className="h-3 w-3" /> Ausente
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {envKey ? (
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm">
              <p className="flex items-center gap-2 font-medium text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="h-4 w-4" /> API key definida via variável de ambiente
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                <code className="rounded bg-muted px-1 py-0.5">OPENROUTER_API_KEY</code> tem
                precedência e não pode ser sobrescrita pela UI.
              </p>
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label htmlFor="apikey">Chave (sk-or-...)</Label>
              <div className="flex gap-2">
                <Input
                  id="apikey"
                  type={showKey ? "text" : "password"}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={data?.apiKeyMasked ?? "sk-or-v1-..."}
                  className="font-mono text-sm"
                />
                <Button variant="outline" size="sm" onClick={() => setShowKey((s) => !s)}>
                  {showKey ? "Ocultar" : "Mostrar"}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Obtenha sua chave em{" "}
                <a
                  href="https://openrouter.ai/keys"
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary underline underline-offset-2"
                >
                  openrouter.ai/keys
                </a>
              </p>
            </div>
          )}

          <Separator />

          <div className="space-y-1.5">
            <Label htmlFor="referer">HTTP-Referer (opcional)</Label>
            <Input
              id="referer"
              value={referer}
              onChange={(e) => setReferer(e.target.value)}
              placeholder="https://meu-app.com"
              className="text-sm"
            />
            <p className="text-xs text-muted-foreground">
              Enviado no header <code>HTTP-Referer</code> para ranking no leaderboard do OpenRouter.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="apptitle">App Title (opcional)</Label>
            <Input
              id="apptitle"
              value={appTitle}
              onChange={(e) => setAppTitle(e.target.value)}
              placeholder="LLM Benchmark Studio"
              className="text-sm"
            />
            <p className="text-xs text-muted-foreground">
              Enviado no header <code>X-Title</code> para identificação do app.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Chaves de leitura — consumidas apenas pela tela de Uso & Custos */}
      <Card>
        <CardHeader>
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2 text-base">
              <Activity className="h-4 w-4 text-primary" />
              Chaves da tela de Uso &amp; Custos
            </CardTitle>
            <CardDescription>
              Opcionais e usadas <strong>somente</strong> para ler consumo naquela tela. Nenhuma
              execução de benchmark passa por elas.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          <ReadOnlyKeyField
            id="or-management-key"
            title="OpenRouter — management key"
            active={data?.hasManagementKey}
            fromEnv={envManagementKey}
            envVar="OPENROUTER_MANAGEMENT_KEY"
            value={managementKey}
            onChange={setManagementKey}
            show={showManagementKey}
            onToggleShow={() => setShowManagementKey((s) => !s)}
            placeholder={data?.managementKeyMasked ?? "sk-or-mgmt-..."}
            help={
              <>
                Necessária para o consumo por dia/modelo — o endpoint{" "}
                <code className="rounded bg-muted px-1 py-0.5">/v1/activity</code> rejeita a chave de
                inferência com 403. Crie em{" "}
                <a
                  href="https://openrouter.ai/settings/management-keys"
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary underline underline-offset-2"
                >
                  openrouter.ai/settings/management-keys
                </a>
                . Sem ela, só o saldo aparece.
              </>
            }
          />

          <Separator />

          <ReadOnlyKeyField
            id="openai-key"
            title="OpenAI — API key"
            active={data?.hasOpenAiKey}
            fromEnv={envOpenAiKey}
            envVar="OPENAI_API_KEY"
            value={openAiKey}
            onChange={setOpenAiKey}
            show={showOpenAiKey}
            onToggleShow={() => setShowOpenAiKey((s) => !s)}
            placeholder={data?.openaiApiKeyMasked ?? "sk-..."}
            help={
              <>
                Precisa do escopo de leitura da organização (
                <code className="rounded bg-muted px-1 py-0.5">api.usage.read</code>). Crie em{" "}
                <a
                  href="https://platform.openai.com/api-keys"
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary underline underline-offset-2"
                >
                  platform.openai.com/api-keys
                </a>
                .
              </>
            }
          />

          <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
            <p className="flex items-start gap-2 text-xs leading-relaxed text-amber-700 dark:text-amber-400">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                Nenhum dos dois provedores expõe log por request: ambos devolvem apenas uso agregado
                por dia e modelo, sem status code. O recorte de sucesso/erro na tela de Uso vem das
                execuções gravadas em <code className="rounded bg-muted px-1 py-0.5">/data</code>.
              </span>
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Execution defaults */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Cpu className="h-4 w-4 text-primary" />
            Defaults de execução
          </CardTitle>
          <CardDescription>Aplicados a novos experimentos.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <SliderRow
            icon={<Repeat className="h-3.5 w-3.5" />}
            label="Repetições padrão"
            value={repetitions}
            min={1}
            max={20}
            step={1}
            suffix="x"
            onChange={setRepetitions}
          />
          <SliderRow
            icon={<Cpu className="h-3.5 w-3.5" />}
            label="Concorrência padrão"
            value={concurrency}
            min={1}
            max={16}
            step={1}
            suffix=""
            onChange={setConcurrency}
          />
          <SliderRow
            icon={<Clock className="h-3.5 w-3.5" />}
            label="Timeout padrão"
            value={timeoutSec}
            min={5}
            max={300}
            step={5}
            suffix="s"
            onChange={setTimeoutSec}
          />
          <SliderRow
            icon={<RefreshCw className="h-3.5 w-3.5" />}
            label="Retentativas (transient errors)"
            value={maxRetries}
            min={0}
            max={5}
            step={1}
            suffix=""
            onChange={setMaxRetries}
          />
          <Separator />
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Atualizado em</p>
              <p className="text-xs text-muted-foreground">{formatDateTime(data?.updatedAt)}</p>
            </div>
            <Button onClick={handleSave} disabled={save.isPending} className="gap-2">
              {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Salvar
            </Button>
          </div>
        </CardContent>
      </Card>
    </>
  );
}

/**
 * Campo de uma chave usada só para leitura de consumo. Deixar em branco mantém
 * a chave já salva — o placeholder mostra a versão mascarada.
 */
function ReadOnlyKeyField({
  id,
  title,
  active,
  fromEnv,
  envVar,
  value,
  onChange,
  show,
  onToggleShow,
  placeholder,
  help,
}: {
  id: string;
  title: string;
  active?: boolean;
  fromEnv: boolean;
  envVar: string;
  value: string;
  onChange: (v: string) => void;
  show: boolean;
  onToggleShow: () => void;
  placeholder: string;
  help: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={id} className="text-sm font-medium">
          {title}
        </Label>
        {active ? (
          <Badge
            className="gap-1.5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
            variant="outline"
          >
            <ShieldCheck className="h-3 w-3" /> Ativa
          </Badge>
        ) : (
          <Badge className="text-muted-foreground" variant="outline">
            Não vinculada
          </Badge>
        )}
      </div>

      {fromEnv ? (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3">
          <p className="flex items-center gap-2 text-sm font-medium text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="h-4 w-4" /> Definida via variável de ambiente
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            <code className="rounded bg-muted px-1 py-0.5">{envVar}</code> tem precedência e não pode
            ser sobrescrita pela UI.
          </p>
        </div>
      ) : (
        <>
          <div className="flex gap-2">
            <Input
              id={id}
              type={show ? "text" : "password"}
              value={value}
              onChange={(e) => onChange(e.target.value)}
              placeholder={placeholder}
              className="font-mono text-sm"
              autoComplete="off"
              spellCheck={false}
            />
            <Button variant="outline" size="sm" onClick={onToggleShow}>
              {show ? "Ocultar" : "Mostrar"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">{help}</p>
        </>
      )}
    </div>
  );
}

function SliderRow({
  icon,
  label,
  value,
  min,
  max,
  step,
  suffix,
  onChange,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix: string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="flex items-center gap-1.5 text-xs">
          {icon}
          {label}
        </Label>
        <span className="text-sm font-semibold tabular-nums">
          {value}
          {suffix}
        </span>
      </div>
      <Slider value={[value]} min={min} max={max} step={step} onValueChange={(v) => onChange(v[0])} />
    </div>
  );
}
