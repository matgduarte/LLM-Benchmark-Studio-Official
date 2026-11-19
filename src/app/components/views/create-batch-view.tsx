"use client";

import { useMemo, useState } from "react";
import {
  ArrowLeft,
  Plus,
  Trash2,
  Search,
  RefreshCw,
  Loader2,
  CheckCircle2,
  Save,
  Sparkles,
  Code2,
  Type,
  ShieldAlert,
  AlertTriangle,
  CopyPlus,
  Play,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import {
  useCreateBatch,
  useModels,
  useRefreshModels,
  useSettings,
  useAddCustomModel,
  useBatch,
  useRunBatch,
} from "../hooks";
import { useAppStore } from "@/lib/store";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatPricePer1M, formatNumber } from "../format";
import { cn } from "@/lib/utils";
import type { ModelDefinition, ResponseFormat } from "@/lib/storage/types";
import { deriveCapabilities } from "@/lib/storage/types";
import {
  type Draft,
  type DraftInput,
  blankDraft,
  draftFromMeta,
  uid,
} from "./create-batch-draft";

export function CreateBatchView({ duplicateFrom }: { duplicateFrom?: string } = {}) {
  const go = useAppStore((s) => s.go);
  const settings = useSettings();
  // Source batch to clone from ("Refazer"). Undefined for a blank experiment.
  const sourceQ = useBatch(duplicateFrom);
  const sourceMeta = sourceQ.data?.meta;

  if (duplicateFrom && sourceQ.isError) {
    return (
      <Card className="py-12">
        <CardContent className="flex flex-col items-center gap-3 text-center">
          <AlertTriangle className="h-8 w-8 text-destructive" />
          <p className="text-sm text-muted-foreground">
            Não foi possível carregar o experimento de origem.
          </p>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => go({ kind: "batches" })}>
              Voltar para lista
            </Button>
            <Button onClick={() => go({ kind: "create-batch" })}>Criar do zero</Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Wait for the clone source, otherwise the user could start typing into
  // fields that are about to be replaced.
  if (duplicateFrom && !sourceMeta) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Carregando configuração do experimento...</p>
      </div>
    );
  }

  return (
    <CreateBatchForm
      initial={sourceMeta ? draftFromMeta(sourceMeta) : blankDraft(settings.data)}
      sourceName={sourceMeta?.name}
    />
  );
}

function CreateBatchForm({ initial, sourceName }: { initial: Draft; sourceName?: string }) {
  const go = useAppStore((s) => s.go);
  const create = useCreateBatch();
  const runBatch = useRunBatch();
  const modelsQ = useModels();
  const refresh = useRefreshModels();
  const addCustom = useAddCustomModel();

  const [name, setName] = useState(initial.name);
  const [description, setDescription] = useState(initial.description);
  const [systemPrompt, setSystemPrompt] = useState(initial.systemPrompt);
  const [inputs, setInputs] = useState<DraftInput[]>(initial.inputs);
  const [selectedModelIds, setSelectedModelIds] = useState<Set<string>>(
    () => new Set(initial.selectedModelIds)
  );
  const [repetitions, setRepetitions] = useState(initial.repetitions);
  const [concurrency, setConcurrency] = useState(initial.concurrency);
  const [timeoutMs, setTimeoutMs] = useState(initial.timeoutMs);
  const [temperature, setTemperature] = useState<number | undefined>(initial.temperature);
  const [maxTokens, setMaxTokens] = useState<number | undefined>(initial.maxTokens);
  const [topP, setTopP] = useState<number | undefined>(initial.topP);
  // Structured-output state.
  const [jsonMode, setJsonMode] = useState<"none" | "object" | "schema">(initial.jsonMode);
  const [schemaName, setSchemaName] = useState(initial.schemaName);
  const [schemaStrict, setSchemaStrict] = useState(initial.schemaStrict);
  const [schemaText, setSchemaText] = useState<string>(initial.schemaText);
  const [requireParameters, setRequireParameters] = useState(initial.requireParameters);
  const [tags, setTags] = useState<string>(initial.tags);
  const [search, setSearch] = useState("");
  const [showCustom, setShowCustom] = useState(false);
  const [customId, setCustomId] = useState("");
  const [customName, setCustomName] = useState("");

  const clonedModelLabels = initial.modelLabels;
  const isCloning = Boolean(sourceName);
  const busy = create.isPending || runBatch.isPending;

  const allModels = modelsQ.data?.models ?? [];
  const filteredModels = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = q
      ? allModels.filter(
          (m) =>
            m.id.toLowerCase().includes(q) ||
            m.name.toLowerCase().includes(q) ||
            (m.description ?? "").toLowerCase().includes(q)
        )
      : allModels;
    return [...list].sort((a, b) => {
      // Selected first, then by name.
      const sa = selectedModelIds.has(a.id) ? 0 : 1;
      const sb = selectedModelIds.has(b.id) ? 0 : 1;
      if (sa !== sb) return sa - sb;
      return a.name.localeCompare(b.name);
    });
  }, [allModels, search, selectedModelIds]);

  const totalExecutions = inputs.length * selectedModelIds.size * repetitions;

  /**
   * Selected models the catalog doesn't know about — they stay selected and are
   * still sent, but the picker below can't render (or deselect) them, so the
   * user needs to be told they're in the plan.
   */
  const missingModels = useMemo(() => {
    if (modelsQ.isLoading) return [];
    const known = new Set(allModels.map((m) => m.id));
    return Array.from(selectedModelIds).filter((id) => !known.has(id));
  }, [allModels, selectedModelIds, modelsQ.isLoading]);

  function toggleModel(id: string) {
    setSelectedModelIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function addInput(format: "text" | "json") {
    setInputs((prev) => [
      ...prev,
      { id: uid(), format, label: `Input ${prev.length + 1}`, content: "" },
    ]);
  }

  function updateInput(id: string, patch: Partial<DraftInput>) {
    setInputs((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  }

  function removeInput(id: string) {
    setInputs((prev) => prev.filter((i) => i.id !== id));
  }

  async function submit(startNow = false) {
    if (!name.trim()) {
      toast.error("Informe um nome para o experimento");
      return;
    }
    if (inputs.length === 0) {
      toast.error("Adicione ao menos uma entrada");
      return;
    }
    const empty = inputs.find((i) => !i.content.trim());
    if (empty) {
      toast.error(`Entrada "${empty.label}" está vazia`);
      return;
    }
    if (selectedModelIds.size === 0) {
      toast.error("Selecione ao menos um modelo");
      return;
    }
    // Validate JSON inputs
    for (const i of inputs) {
      if (i.format === "json") {
        try {
          JSON.parse(i.content);
        } catch {
          toast.error(`Input "${i.label}" não é um JSON válido`);
          return;
        }
      }
    }

    // Validate & build response_format when JSON mode is enabled.
    let responseFormat: ResponseFormat | undefined;
    if (jsonMode === "object") {
      responseFormat = { type: "json_object" };
    } else if (jsonMode === "schema") {
      if (!schemaName.trim()) {
        toast.error("Informe um nome para o JSON Schema");
        return;
      }
      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(schemaText);
      } catch (e) {
        toast.error("JSON Schema inválido", { description: (e as Error).message });
        return;
      }
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        toast.error("JSON Schema deve ser um objeto");
        return;
      }
      responseFormat = {
        type: "json_schema",
        json_schema: {
          name: schemaName.trim(),
          schema: parsed,
          strict: schemaStrict,
        },
      };
    }

    try {
      const res = await create.mutateAsync({
        name: name.trim(),
        description: description.trim() || undefined,
        systemPrompt,
        inputs: inputs.map((i) => ({ format: i.format, content: i.content, label: i.label })),
        models: Array.from(selectedModelIds).map((id) => {
          const m = allModels.find((x) => x.id === id);
          // Fall back to the cloned batch's label when the catalog no longer
          // has the model, so re-running keeps the original display name.
          return { id, label: m?.name ?? clonedModelLabels[id] ?? id };
        }),
        repetitions,
        concurrency,
        timeoutMs,
        temperature,
        maxTokens,
        topP,
        responseFormat,
        requireParameters: requireParameters || undefined,
        tags: tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
      });
      if (startNow) {
        try {
          await runBatch.mutateAsync(res.meta.id);
          toast.success("Experimento criado e iniciado", {
            description: `${res.status.total} execuções em fila.`,
          });
        } catch (e) {
          // The batch exists either way — surface the failure but still
          // navigate, so the user can retry from the detail screen.
          toast.error("Experimento criado, mas falhou ao iniciar", {
            description: (e as Error).message,
          });
        }
      } else {
        toast.success("Experimento criado", {
          description: `${res.status.total} execuções planejadas.`,
        });
      }
      go({ kind: "batch-detail", batchId: res.meta.id });
    } catch (e) {
      toast.error("Falha ao criar experimento", { description: (e as Error).message });
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => go({ kind: "batches" })} className="h-9 w-9">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
            {isCloning ? "Refazer experimento" : "Novo experimento"}
            {isCloning && (
              <Badge variant="outline" className="gap-1 text-[10px] font-normal">
                <CopyPlus className="h-2.5 w-2.5" />
                cópia
              </Badge>
            )}
          </h1>
          <p className="text-sm text-muted-foreground">
            {isCloning ? (
              <>
                Configuração copiada de <strong>{sourceName}</strong>. Ajuste o que quiser e
                crie o novo experimento — o original não é alterado.
              </>
            ) : (
              "Configure entradas, system prompt, modelos e repetições para um benchmark comparativo."
            )}
          </p>
        </div>
      </div>

      {missingModels.length > 0 && (
        <Card className="border-amber-500/40 bg-amber-500/5">
          <CardContent className="flex items-start gap-3 py-4">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
            <div className="space-y-1 text-sm">
              <p className="font-medium">
                {missingModels.length} modelo{missingModels.length === 1 ? "" : "s"} do experimento
                original não está{missingModels.length === 1 ? "" : "ão"} no catálogo local
              </p>
              <p className="text-xs text-muted-foreground">
                Continuam selecionados e serão enviados ao OpenRouter normalmente, mas não aparecem
                na lista abaixo para desmarcar. Clique em <strong>Atualizar</strong> no painel de
                modelos se eles deveriam estar lá.
              </p>
              <div className="flex flex-wrap gap-1 pt-1">
                {missingModels.map((id) => (
                  <Badge key={id} variant="secondary" className="font-mono text-[10px] font-normal">
                    {id}
                  </Badge>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        {/* Left column: inputs & system prompt */}
        <div className="space-y-6">
          {/* Basic info */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Identificação</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="name">Nome do experimento *</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex: Comparação de modelos para resumo"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="desc">Descrição (opcional)</Label>
                <Input
                  id="desc"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Notas sobre objetivo, hipótese, etc."
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tags">Tags (separadas por vírgula)</Label>
                <Input
                  id="tags"
                  value={tags}
                  onChange={(e) => setTags(e.target.value)}
                  placeholder="resumo, rag, v1"
                />
              </div>
            </CardContent>
          </Card>

          {/* System prompt */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">System prompt</CardTitle>
              <CardDescription>Enviado como mensagem de system para todas as execuções.</CardDescription>
            </CardHeader>
            <CardContent>
              <Textarea
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                className="min-h-[100px] font-mono text-sm"
                placeholder="You are a helpful assistant..."
              />
            </CardContent>
          </Card>

          {/* Inputs */}
          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <div className="space-y-1">
                <CardTitle className="text-base">Entradas / Prompts</CardTitle>
                <CardDescription>
                  Cada entrada será executada por todos os modelos e repetições selecionadas.
                </CardDescription>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="gap-1.5" onClick={() => addInput("text")}>
                  <Type className="h-3.5 w-3.5" /> Texto
                </Button>
                <Button variant="outline" size="sm" className="gap-1.5" onClick={() => addInput("json")}>
                  <Code2 className="h-3.5 w-3.5" /> JSON
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {inputs.length === 0 && (
                <p className="rounded-lg border border-dashed py-6 text-center text-sm text-muted-foreground">
                  Nenhuma entrada. Adicione um prompt de texto ou JSON.
                </p>
              )}
              {inputs.map((input, idx) => (
                <div key={input.id} className="rounded-lg border border-border/70 bg-muted/20 p-3">
                  <div className="mb-2 flex items-center gap-2">
                    <Badge variant="outline" className="gap-1 text-[10px]">
                      {input.format === "json" ? <Code2 className="h-2.5 w-2.5" /> : <Type className="h-2.5 w-2.5" />}
                      {input.format.toUpperCase()}
                    </Badge>
                    <Input
                      value={input.label}
                      onChange={(e) => updateInput(input.id, { label: e.target.value })}
                      className="h-7 flex-1 text-xs"
                      placeholder={`Input ${idx + 1}`}
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      onClick={() => removeInput(input.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <Textarea
                    value={input.content}
                    onChange={(e) => updateInput(input.id, { content: e.target.value })}
                    className={cn(
                      "min-h-[80px] text-sm",
                      input.format === "json" && "font-mono text-xs"
                    )}
                    placeholder={
                      input.format === "json"
                        ? '{"task": "translate", "text": "Hello"}'
                        : "Escreva o prompt do usuário..."
                    }
                  />
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Structured output (JSON) */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Code2 className="h-4 w-4 text-primary" />
                    Saída estruturada (JSON)
                  </CardTitle>
                  <CardDescription>
                    Force os modelos a responderem em JSON. Modelos incompatíveis
                    falham (use <code className="rounded bg-muted px-1 py-0.5 text-[10px]">require_parameters</code> para erro explícito).
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Mode selector */}
              <div className="grid grid-cols-3 gap-2">
                <ModeButton
                  active={jsonMode === "none"}
                  onClick={() => setJsonMode("none")}
                  title="Texto livre"
                  desc="Sem enforcement"
                />
                <ModeButton
                  active={jsonMode === "object"}
                  onClick={() => setJsonMode("object")}
                  title="JSON object"
                  desc="Modo JSON básico"
                />
                <ModeButton
                  active={jsonMode === "schema"}
                  onClick={() => setJsonMode("schema")}
                  title="JSON Schema"
                  desc="Structured Outputs"
                />
              </div>

              {jsonMode === "object" && (
                <div className="rounded-lg border border-border/60 bg-muted/20 p-3 text-xs text-muted-foreground">
                  Envia <code className="rounded bg-muted px-1 py-0.5">response_format: {"{ type: 'json_object' }"}</code>.
                  O modelo retorna um JSON válido, mas sem schema fixo. Inclua "responda em JSON" no prompt.
                </div>
              )}

              {jsonMode === "schema" && (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="schemaName" className="text-xs">Nome do schema *</Label>
                      <Input
                        id="schemaName"
                        value={schemaName}
                        onChange={(e) => setSchemaName(e.target.value)}
                        placeholder="extracted_data"
                        className="h-8 text-xs font-mono"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Strict mode</Label>
                      <div className="flex h-8 items-center gap-2 rounded-md border border-border/60 px-3">
                        <Switch checked={schemaStrict} onCheckedChange={setSchemaStrict} />
                        <span className="text-xs text-muted-foreground">
                          {schemaStrict ? "Ativo (additionalProperties: false)" : "Permite propriedades extras"}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="schemaText" className="text-xs">JSON Schema *</Label>
                      <SchemaValidator text={schemaText} />
                    </div>
                    <Textarea
                      id="schemaText"
                      value={schemaText}
                      onChange={(e) => setSchemaText(e.target.value)}
                      className="min-h-[180px] font-mono text-xs"
                      spellCheck={false}
                    />
                  </div>
                </div>
              )}

              {/* require_parameters toggle */}
              <Separator />
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-0.5">
                  <Label className="text-xs flex items-center gap-1.5">
                    <ShieldAlert className="h-3.5 w-3.5 text-amber-500" />
                    require_parameters
                  </Label>
                  <p className="text-[11px] text-muted-foreground">
                    Quando ativo, o OpenRouter retorna erro 400 se o modelo não
                    suportar algum parâmetro enviado (ex: <code className="rounded bg-muted px-1 py-0.5 text-[10px]">response_format</code>).
                    Ideal para validar compatibilidade no benchmark.
                  </p>
                </div>
                <Switch checked={requireParameters} onCheckedChange={setRequireParameters} />
              </div>

              {/* Compatibility hint */}
              {selectedModelIds.size > 0 && (jsonMode !== "none" || requireParameters) && (
                <CompatibilityReport
                  models={allModels.filter((m) => selectedModelIds.has(m.id))}
                  jsonMode={jsonMode}
                  requireParameters={requireParameters}
                />
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right column: models + params */}
        <div className="space-y-6">
          {/* Models */}
          <Card className="flex flex-col">
            <CardHeader className="space-y-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Modelos</CardTitle>
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1.5"
                  disabled={refresh.isPending}
                  onClick={async () => {
                    try {
                      const r = await refresh.mutateAsync();
                      toast.success("Catálogo atualizado", {
                        description: `${r.count} modelos disponíveis.`,
                      });
                    } catch (e) {
                      toast.error("Falha ao atualizar catálogo", { description: (e as Error).message });
                    }
                  }}
                >
                  {refresh.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="h-3.5 w-3.5" />
                  )}
                  Atualizar
                </Button>
              </div>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar modelo..."
                  className="h-8 pl-8 text-xs"
                />
              </div>
            </CardHeader>
            <CardContent className="flex-1 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">
                  {selectedModelIds.size} selecionado{selectedModelIds.size === 1 ? "" : "s"}
                </span>
                <span className="text-muted-foreground">{formatNumber(allModels.length)} disponíveis</span>
              </div>
              <ScrollArea className="h-[280px] pr-3 scrollbar-thin">
                <div className="space-y-1.5">
                  {modelsQ.isLoading ? (
                    <div className="space-y-2">
                      {Array.from({ length: 6 }).map((_, i) => (
                        <div key={i} className="h-12 animate-pulse rounded-lg bg-muted/50" />
                      ))}
                    </div>
                  ) : filteredModels.length === 0 ? (
                    <p className="py-8 text-center text-xs text-muted-foreground">
                      Nenhum modelo. Atualize o catálogo ou cadastre um custom.
                    </p>
                  ) : (
                    filteredModels.slice(0, 200).map((m) => (
                      <ModelOption
                        key={m.id}
                        model={m}
                        selected={selectedModelIds.has(m.id)}
                        onToggle={() => toggleModel(m.id)}
                      />
                    ))
                  )}
                </div>
              </ScrollArea>

              {/* Custom model registration */}
              <Separator className="my-2" />
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium">Cadastrar modelo customizado</span>
                <Switch checked={showCustom} onCheckedChange={setShowCustom} />
              </div>
              {showCustom && (
                <div className="space-y-2 rounded-lg border border-border/70 p-3">
                  <Input
                    value={customId}
                    onChange={(e) => setCustomId(e.target.value)}
                    placeholder="ID OpenRouter (ex: anthropic/claude-3.7-sonnet)"
                    className="h-8 text-xs"
                  />
                  <Input
                    value={customName}
                    onChange={(e) => setCustomName(e.target.value)}
                    placeholder="Nome de exibição"
                    className="h-8 text-xs"
                  />
                  <Button
                    size="sm"
                    variant="secondary"
                    className="w-full gap-1.5"
                    disabled={!customId.trim() || !customName.trim()}
                    onClick={async () => {
                      try {
                        await addCustom.mutateAsync({ id: customId.trim(), name: customName.trim() });
                        toast.success("Modelo customizado adicionado");
                        setCustomId("");
                        setCustomName("");
                      } catch (e) {
                        toast.error("Falha ao cadastrar", { description: (e as Error).message });
                      }
                    }}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Cadastrar
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Execution params */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Parâmetros de execução</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs">Repetições por modelo</Label>
                  <span className="text-sm font-semibold tabular-nums">{repetitions}x</span>
                </div>
                <Slider
                  value={[repetitions]}
                  min={1}
                  max={20}
                  step={1}
                  onValueChange={(v) => setRepetitions(v[0])}
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs">Concorrência</Label>
                  <span className="text-sm font-semibold tabular-nums">{concurrency}</span>
                </div>
                <Slider
                  value={[concurrency]}
                  min={1}
                  max={16}
                  step={1}
                  onValueChange={(v) => setConcurrency(v[0])}
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs">Timeout (s)</Label>
                  <span className="text-sm font-semibold tabular-nums">{timeoutMs / 1000}s</span>
                </div>
                <Slider
                  value={[timeoutMs / 1000]}
                  min={5}
                  max={300}
                  step={5}
                  onValueChange={(v) => setTimeoutMs(v[0] * 1000)}
                />
              </div>
              <Separator />
              <p className="text-xs font-medium text-muted-foreground">Parâmetros opcionais</p>
              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-1">
                  <Label className="text-[10px]">Temperature</Label>
                  <Input
                    type="number"
                    step={0.1}
                    min={0}
                    max={2}
                    value={temperature ?? ""}
                    onChange={(e) =>
                      setTemperature(e.target.value === "" ? undefined : Number(e.target.value))
                    }
                    placeholder="—"
                    className="h-8 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px]">Max tokens</Label>
                  <Input
                    type="number"
                    min={1}
                    value={maxTokens ?? ""}
                    onChange={(e) =>
                      setMaxTokens(e.target.value === "" ? undefined : Number(e.target.value))
                    }
                    placeholder="—"
                    className="h-8 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px]">Top P</Label>
                  <Input
                    type="number"
                    step={0.05}
                    min={0}
                    max={1}
                    value={topP ?? ""}
                    onChange={(e) => setTopP(e.target.value === "" ? undefined : Number(e.target.value))}
                    placeholder="—"
                    className="h-8 text-xs"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Summary */}
          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="space-y-3 py-4">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium">Plano de execução</span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <PlanStat label="Inputs" value={inputs.length} />
                <PlanStat label="Modelos" value={selectedModelIds.size} />
                <PlanStat label="Reps" value={repetitions} />
              </div>
              <div className="flex items-center justify-between rounded-lg bg-background/60 px-3 py-2">
                <span className="text-xs text-muted-foreground">Total de execuções</span>
                <span className="text-xl font-bold tabular-nums text-primary">
                  {formatNumber(totalExecutions)}
                </span>
              </div>
              <div className="space-y-2">
                <Button
                  className="w-full gap-2"
                  size="lg"
                  disabled={busy || totalExecutions === 0}
                  onClick={() => submit(true)}
                >
                  {busy ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Play className="h-4 w-4" />
                  )}
                  Criar e executar
                </Button>
                <Button
                  className="w-full gap-2"
                  variant="secondary"
                  disabled={busy || totalExecutions === 0}
                  onClick={() => submit(false)}
                >
                  <Save className="h-4 w-4" />
                  Criar sem executar
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function PlanStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-background/60 py-2">
      <p className="text-lg font-bold tabular-nums">{value}</p>
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
    </div>
  );
}

function ModelOption({
  model,
  selected,
  onToggle,
}: {
  model: ModelDefinition;
  selected: boolean;
  onToggle: () => void;
}) {
  const caps = deriveCapabilities(model.supportedParameters);
  const hasCaps = model.supportedParameters !== undefined;
  return (
    <button
      type="button"
      onClick={onToggle}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-lg border px-2.5 py-2 text-left transition",
        selected
          ? "border-primary/40 bg-primary/10"
          : "border-border/60 bg-background hover:border-border hover:bg-muted/40"
      )}
    >
      <span
        className={cn(
          "flex h-4 w-4 shrink-0 items-center justify-center rounded border",
          selected ? "border-primary bg-primary text-primary-foreground" : "border-border"
        )}
      >
        {selected && <CheckCircle2 className="h-3 w-3" />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium leading-tight">{model.name}</p>
        <p className="truncate font-mono text-[10px] text-muted-foreground">{model.id}</p>
      </div>
      {caps.structuredOutputs && (
        <Badge
          variant="outline"
          className="shrink-0 gap-0.5 border-emerald-500/30 bg-emerald-500/10 px-1 text-[9px] text-emerald-600 dark:text-emerald-400"
          title="Suporta Structured Outputs (json_schema strict)"
        >
          JSON
        </Badge>
      )}
      {hasCaps && !caps.structuredOutputs && caps.json && (
        <Badge
          variant="outline"
          className="shrink-0 border-amber-500/30 bg-amber-500/10 px-1 text-[9px] text-amber-600 dark:text-amber-400"
          title="Suporta response_format (json_object), mas não json_schema strict"
        >
          json
        </Badge>
      )}
      {hasCaps && !caps.json && (
        <Badge
          variant="outline"
          className="shrink-0 border-destructive/30 bg-destructive/10 px-1 text-[9px] text-destructive"
          title="Não suporta response_format — falhará com require_parameters"
        >
          ✕
        </Badge>
      )}
      {model.custom && <Badge variant="secondary" className="text-[9px]">custom</Badge>}
      {model.promptPricePer1M !== undefined && (
        <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
          {formatPricePer1M(model.promptPricePer1M)}
        </span>
      )}
    </button>
  );
}

/** Mode selector button for the structured-output section. */
function ModeButton({
  active,
  onClick,
  title,
  desc,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  desc: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-lg border p-3 text-left transition",
        active
          ? "border-primary/50 bg-primary/10 ring-1 ring-primary/20"
          : "border-border/60 bg-background hover:border-border hover:bg-muted/40"
      )}
    >
      <p className={cn("text-xs font-semibold", active ? "text-primary" : "text-foreground")}>
        {title}
      </p>
      <p className="mt-0.5 text-[10px] text-muted-foreground">{desc}</p>
    </button>
  );
}

/** Live JSON schema validator badge. Derives validity from `text` during render. */
function SchemaValidator({ text }: { text: string }) {
  let valid = false;
  let msg: string | null = null;
  if (text.trim()) {
    try {
      const parsed = JSON.parse(text);
      if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
        valid = true;
      } else {
        msg = "Deve ser um objeto JSON";
      }
    } catch (e) {
      msg = (e as Error).message;
    }
  }
  if (msg) {
    // surface the error message via the badge tooltip
    return (
      <Badge
        variant="outline"
        title={msg ?? undefined}
        className="gap-1 text-[10px] border-destructive/30 bg-destructive/10 text-destructive"
      >
        <AlertTriangle className="h-2.5 w-2.5" />
        Inválido
      </Badge>
    );
  }
  return (
    <Badge
      variant="outline"
      className={cn(
        "gap-1 text-[10px]",
        valid
          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
          : "border-muted text-muted-foreground"
      )}
    >
      {valid ? <CheckCircle2 className="h-2.5 w-2.5" /> : null}
      {valid ? "Schema válido" : "Aguardando"}
    </Badge>
  );
}

/** Shows per-model compatibility with the selected JSON mode / require_parameters. */
function CompatibilityReport({
  models,
  jsonMode,
  requireParameters,
}: {
  models: ModelDefinition[];
  jsonMode: "none" | "object" | "schema";
  requireParameters: boolean;
}) {
  const rows = models.map((m) => {
    const caps = deriveCapabilities(m.supportedParameters);
    const supportsJson = caps.json || caps.structuredOutputs;
    let status: "ok" | "warn" | "unknown";
    let label: string;
    if (jsonMode !== "none") {
      if (m.supportedParameters === undefined) {
        status = "unknown";
        label = "Parâmetros não declarados";
      } else if (supportsJson) {
        status = "ok";
        label = caps.structuredOutputs
          ? "Suporta Structured Outputs"
          : "Suporta response_format";
      } else {
        status = "warn";
        label = requireParameters
          ? "Falhará com require_parameters"
          : "response_format ignorado";
      }
    } else if (requireParameters) {
      // require_parameters without response_format: model must support whatever
      // params we send (temperature/top_p/max_tokens). We can't know in advance,
      // so mark unknown unless supportedParameters is missing.
      status = m.supportedParameters === undefined ? "unknown" : "ok";
      label = m.supportedParameters === undefined ? "Parâmetros não declarados" : "OK";
    } else {
      status = "ok";
      label = "—";
    }
    return { model: m, status, label, caps };
  });

  const warnCount = rows.filter((r) => r.status === "warn").length;
  const unknownCount = rows.filter((r) => r.status === "unknown").length;

  return (
    <div className="rounded-lg border border-border/60 bg-muted/20 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium flex items-center gap-1.5">
          <ShieldAlert className="h-3.5 w-3.5 text-amber-500" />
          Compatibilidade dos modelos selecionados
        </p>
        <div className="flex gap-1.5">
          {warnCount > 0 && (
            <Badge variant="outline" className="gap-1 text-[10px] border-destructive/30 bg-destructive/10 text-destructive">
              <AlertTriangle className="h-2.5 w-2.5" />
              {warnCount} incompatível{warnCount === 1 ? "" : "eis"}
            </Badge>
          )}
          {unknownCount > 0 && (
            <Badge variant="outline" className="gap-1 text-[10px] border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400">
              {unknownCount} sem info
            </Badge>
          )}
        </div>
      </div>
      <div className="space-y-1 max-h-40 overflow-y-auto scrollbar-thin">
        {rows.map((r) => (
          <div key={r.model.id} className="flex items-center gap-2 text-xs">
            <span
              className={cn(
                "h-1.5 w-1.5 shrink-0 rounded-full",
                r.status === "ok" && "bg-emerald-500",
                r.status === "warn" && "bg-destructive",
                r.status === "unknown" && "bg-amber-500"
              )}
            />
            <span className="min-w-0 flex-1 truncate font-mono text-[10px]">{r.model.id}</span>
            <span className="shrink-0 text-[10px] text-muted-foreground">{r.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
