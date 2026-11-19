# LLM Benchmark Studio — Worklog

> **Objetivo do projeto**: Aplicação web para execução, registro e avaliação
> comparativa de múltiplos modelos de linguagem via API do OpenRouter, com
> persistência 100% em arquivos locais (sem banco de dados).

---

Task ID: 1-12
Agent: main (orchestrator)
Task: Construção completa do benchmark/evaluation framework (backend + frontend)

Work Log:
- Definidos os tipos TypeScript do domínio (`src/lib/storage/types.ts`):
  `BatchMeta`, `BatchStatus`, `ExecutionRecord`, `BatchMetrics`, `ModelMetrics`,
  `AppSettings`, `ModelDefinition`, com `schemaVersion` para evolução futura.
- Implementada camada de armazenamento em arquivos com **escrita atômica**
  (`src/lib/storage/fs.ts`): write temp -> fsync -> rename, garantindo
  consistência mesmo sob concorrência.
- Layout de arquivos em `data/`:
  - `config/settings.json` — API key + defaults
  - `config/models.json` — catálogo OpenRouter cacheado
  - `config/custom-models.json` — modelos cadastrados pelo usuário
  - `batches/index.json` — índice leve de lotes
  - `batches/<id>/meta.json`, `status.json`, `metrics.json`,
    `executions/<execId>.json` (um arquivo por execução → evita arquivo único
    pesado e permite leitura incremental)
- Cliente OpenRouter (`src/lib/openrouter/client.ts`): list models, chat
  completions com retry em erros transitórios (429/5xx), parsing de `usage.cost`,
  fallback de custo via pricing por-1M, headers `HTTP-Referer`/`X-Title`.
- Execution runner (`src/lib/runner/manager.ts`): fila concorrente com semáforo
  por batch, persistência incremental (cada execução escrita em disco
  imediatamente após concluir), reconciliação de estado após restart
  (running→interrupted→queued), cancelamento via AbortController + timeout.
- Métricas agregadas (`src/lib/storage/metrics.ts`): por modelo e geral —
  latência (min/avg/median/p95/max), custo (total/avg/min/max), tokens
  (prompt/completion/total), taxa de sucesso, custo por 1k tokens.
- API Routes REST: settings, models (+refresh +custom), batches CRUD,
  batches/[id]/run, /cancel, /status, /metrics, /executions, executions/[id].
- Frontend (Next.js 16 App Router, single-page client-side routing em `/`):
  - AppShell com header sticky, navegação, theme toggle (next-themes),
    badge de status da API key, footer sticky (`min-h-screen flex flex-col`).
  - View "Experimentos" (home): cards de lote com progresso, stats, ações
    (Executar/Retomar/Cancelar/Excluir), empty state.
  - View "Novo experimento": editor de inputs (texto/JSON), system prompt,
    seleção multi-modelo com busca, cadastro de modelo customizado, sliders
    de reps/concorrência/timeout, params opcionais, plano de execução.
  - View "Detalhe do lote": 4 abas (Visão geral / Métricas & gráficos /
    Execuções / Configuração), cards de métricas, ranking de modelos
    (medalhas), 6 gráficos comparativos (Recharts), tabela comparativa,
    distribuição de status, tabela de execuções com filtros/ordenação/busca.
  - Dialog de execução: 4 abas (Resposta / Entrada / Metadados / Raw API),
    banner de erro, grid de metadados, copy da resposta.
  - View "Configurações": API key (com masking, env override), referer,
    app title, defaults de execução, catálogo de modelos com pricing.
- Tema customizado esmeralda (sem indigo/azul), dark mode, scrollbar
  customizada, animações sutis (pulse-ring, bg-grid).
- Polling em tempo real: batches (4s), status (1.2s quando rodando), metrics
  (2s quando rodando), execução individual (1.5s se em andamento).

Stage Summary:
- **Backend 100% funcional**: validado via curl — criação de batch, execução
  concorrente, persistência incremental (8 execuções = 8 arquivos individuais),
  métricas agregadas corretas.
- **Frontend 100% funcional**: validado via agent-browser — home, criação de
  experimento (com cadastro de modelo customizado), detalhe do lote com 4 abas,
  dialog de execução com 4 abas, settings, ranking, gráficos.
- **Lint limpo** (0 erros), **dev server sem erros** no log.
- **Footer sticky verificado**: gruda no fundo em viewport 900px (content curto)
  e empurra naturalmente em viewport 577px (content overflow).
- Sem dependência de banco de dados; arquivos em `data/` são a fonte de verdade.

Unresolved issues / Próximos passos recomendados:
- Sem API key OpenRouter configurada por padrão — o usuário precisa adicionar
  a chave em Configurações (ou via `OPENROUTER_API_KEY` env) para execuções
  reais. As execuções sem key falham graciosamente com mensagem clara.
- Possíveis melhorias futuras (cron reviewer pode priorizar):
  1. Export/import de lotes (JSON zip) para portabilidade de experimentos.
  2. Comparação lado-a-lado de respostas individuais entre modelos para o
     mesmo input (eval qualitativa).
  3. Suporte a inputs estruturados (chat messages array) além de text/json.
  4. Websocket para progresso em tempo real (atualmente polling de 1.2s).
  5. Métricas de consistência (variância de resposta entre repetições).
  6. Suporte a streaming de respostas (SSE) para modelos lentos.
  7. Filtro avançado de modelos por provider, modality, context length.
  8. Cache de catálogo de modelos com TTL e refresh automático.

---

Task ID: 13-19
Agent: main (orchestrator)
Task: Adicionar suporte a saída estruturada JSON (response_format) + require_parameters para testar compatibilidade de modelos

Work Log:
- Estendido `BatchRunParams` (`src/lib/storage/types.ts`) com:
  - `responseFormat?: ResponseFormat` — discriminated union para
    `{ type: "json_object" }` (modo JSON básico) ou
    `{ type: "json_schema", json_schema: { name, description?, schema, strict? } }`
    (Structured Outputs strict).
  - `requireParameters?: boolean` — quando true, OpenRouter retorna erro 400 se
    o modelo não suportar algum parâmetro enviado.
- Adicionado `supportedParameters?: string[]` ao `ModelDefinition` + helper
  `deriveCapabilities()` que deriva flags (json, structuredOutputs, tools,
  temperature, topP, maxTokens) para a UI.
- Cliente OpenRouter (`src/lib/openrouter/client.ts`):
  - `ChatCompletionOptions` agora aceita `responseFormat` e `requireParameters`.
  - Body da requisição envia `response_format` (verbatim) e `require_parameters`
    quando aplicável.
  - `fetchOpenRouterModels()` captura `supported_parameters` do catálogo.
  - Corrigido shadowing de variável `body` na handling de erro.
- Runner (`src/lib/runner/manager.ts`): repassa `responseFormat` e
  `requireParameters` do `job.params` para `chatCompletion()`.
- API route `POST /api/batches` (`src/app/api/batches/route.ts`):
  - Novo helper `parseResponseFormat()` valida e normaliza o payload
    (`json_object` ou `json_schema` com name/schema obrigatórios).
  - `requireParameters` aceito como boolean.
- API client (`src/lib/api-client.ts`): `CreateBatchBody` tipado com os novos
  campos.
- Frontend create-batch-view: nova seção "Saída estruturada (JSON)" com:
  - 3 modos (Texto livre / JSON object / JSON Schema) via `ModeButton`.
  - Editor de JSON Schema com nome, strict toggle, validador ao vivo
    (`SchemaValidator` badge "Schema válido" / "Inválido" / "Aguardando").
  - Toggle `require_parameters` com explicação.
  - `CompatibilityReport` mostra por modelo selecionado: ✓ suporta Structured
    Outputs, ⚠ sem info (supported_parameters ausente), ✕ incompatível
    (falhará com require_parameters).
- Badges de compatibilidade na seleção de modelos (create-batch) e no
  catálogo (settings): `JSON` (verde, structured outputs), `json` (âmbar,
  json_object only), `✕` (vermelho, sem response_format).
- Batch-detail (aba Configuração): novo card "Saída estruturada" mostra modo,
  nome do schema, strict, schema completo (JSON formatado) e estado do
  require_parameters.

Stage Summary:
- **Backend validado via curl**: criado batch com `responseFormat: json_schema`
  (strict) + `requireParameters: true` → persistido corretamente em `meta.json`
  (`params.responseFormat` + `params.requireParameters`), execução falha
  graciosamente quando modelo/API key incompatível.
- **Frontend validado via agent-browser**:
  - Seção "Saída estruturada" renderiza com 3 modos.
  - JSON Schema mode: editor + badge "Schema válido" aparecem.
  - require_parameters toggle funciona.
  - CompatibilityReport aparece ao selecionar modelo ("1 sem info").
  - Batch-detail aba Configuração mostra "JSON Schema (Structured Outputs)",
    nome do schema, strict, schema completo e require_parameters.
- **Lint limpo** (0 erros), **dev server sem erros**.

Como testar com modelos reais:
1. Adicionar API key em Configurações (ou `OPENROUTER_API_KEY` env).
2. Atualizar catálogo de modelos (botão "Atualizar do OpenRouter") — agora
   captura `supported_parameters` de cada modelo.
3. Criar experimento: selecionar modelos variados (alguns com suporte a JSON
   schema, outros sem), ativar "JSON Schema" + definir schema + ativar
   `require_parameters`.
4. Executar: modelos compatíveis retornam JSON conforme schema; modelos
   incompatíveis falham com erro explícito do OpenRouter (400), permitindo
   comparar capacidades de structured outputs entre modelos.


---

Task ID: 20
Agent: main (orchestrator)
Task: Criar README.md com instalação, configuração, uso e variáveis de ambiente + .env.example

Work Log:
- Criado `README.md` na raiz do projeto cobrindo:
  - Visão geral e funcionalidades (configuração de experimentos, execução,
    dashboard, persistência).
  - Stack tecnológica (Next.js 16, TS, Tailwind 4, shadcn/ui, Recharts,
    Zustand, TanStack Query, Bun, persistência em arquivos).
  - Pré-requisitos (Bun v1.3+ ou Node 20+, chave OpenRouter).
  - Instalação (`bun install`).
  - Variáveis de ambiente (`.env`): `OPENROUTER_API_KEY` (obrigatória p/
    execuções reais), `LLM_BENCH_DATA_DIR` (opcional), `DATABASE_URL`
    (ignorada pelo app). Tabela de variáveis com default/obrigatoriedade.
  - Como iniciar (dev: `bun run dev`, produção: `bun run build` + `bun run
    start`, lint: `bun run lint`).
  - Fluxo completo de uso em 7 passos (configurar API key → atualizar
    catálogo → cadastrar modelos custom → criar experimento → executar →
    analisar → gerenciar lotes).
  - Estrutura do projeto (árvore de diretórios com descrições).
  - Estrutura dos dados persistidos (campos de execução e lote).
  - Métricas calculadas (por modelo e geral).
  - Referência da API REST (todos os endpoints + exemplo curl de criação
    de lote com JSON Schema + require_parameters).
  - Solução de problemas (FAQ).
  - Notas sobre atomicidade, schema versioning, extensibilidade.
- Criado `.env.example` na raiz como referência comentada.
- Ajustado `.gitignore` para permitir commit de `.env.example` (negation
  `!.env.example`) mantendo `.env*` ignorado.

Stage Summary:
- README.md completo e .env.example criados.
- Lint limpo, dev server sem erros.
- Documentação cobre instalação, configuração de env vars, uso completo,
  estrutura de arquivos, API REST e troubleshooting.

---

Task ID: 13
Agent: main
Task: Visualização de comparação lado a lado (reps de um modelo / modelos numa
mesma rep), com input e prompt em evidência

Work Log:
- Nova aba **"Comparar reps"** em `batch-detail-view.tsx`, servida pelo novo
  componente `src/app/components/rep-comparison.tsx`.
- **Dois eixos de comparação** (seletor no topo):
  - `Reps do mesmo modelo` — fixa entrada + modelo, colunas = repetições.
  - `Modelos na mesma rep` — fixa entrada + repetição, colunas = modelos
    (opção "Todas as repetições" mostra tudo, agrupado por rep).
  A lista de repetições disponíveis é derivada das execuções reais da entrada,
  com fallback para `meta.repetitions`.
- **Seletor múltiplo de modelos** (`ModelPicker`, dropdown com checkboxes +
  atalhos "Todos"/"Limpar"): por padrão todos os modelos do lote entram na
  comparação, e o usuário desmarca os que não quer ver. Vale para os dois
  eixos — no eixo de reps, selecionar 1 modelo dá o comparativo clássico de
  repetições; selecionar vários mostra as reps de cada um agrupadas por
  modelo. A ordem das colunas segue a ordem dos modelos no lote,
  independentemente da ordem de clique.
- **Painel de prompt/entrada** colapsável acima das colunas: system prompt +
  input do usuário, idênticos para todas as colunas por construção.
- **Modo Colunas**: cada execução vira uma coluna (scroll horizontal) com
  status, latência, custo, tokens, nº de chars, copiar resposta e abrir
  detalhe. Toggles de quebra de linha e rolagem sincronizada entre painéis.
  - **Etiquetas de variante (A, B, C…)**: respostas idênticas recebem a mesma
    letra/cor; JSON é canonicalizado (chaves ordenadas) antes de comparar, de
    modo que ordem de chave não gere falso "diferente". Resumo no topo:
    "todas idênticas" vs "N respostas distintas entre M colunas".
- **Modo Campos JSON**: achata cada resposta em `caminho -> valor` e monta
  tabela campo x coluna, destacando linhas divergentes, com filtro "só campos
  divergentes". Respostas não-JSON aparecem como `(sem JSON)` e ficam fora do
  veredito (senão uma execução falha pintaria todos os campos como divergentes).
  Aceita payload envolto em cercas ```json.
- **Atalhos no diálogo de execução**: "Comparar reps" (mesmo modelo) e
  "Comparar modelos" (mesma rep) abrem a aba já com a seleção correta.
- `store.ts`: aba ativa do batch-detail (`batchTab`) e `compareTarget`
  (`{batchId, inputId, modelId, repetition, axis}`) movidos para o Zustand,
  permitindo o salto a partir do diálogo. Seleção ajustada durante o render
  (padrão "adjusting state when props change"), sem `useEffect` — o lint
  `react-hooks/set-state-in-effect` proíbe setState em efeito.

Stage Summary:
- `tsc --noEmit` e `eslint` limpos nos arquivos alterados; `next build` passa.
- Lógica de colunas/variantes/campos validada contra os dados reais em
  `data/batches` (lote de sumários, 4 modelos x 2 reps): eixo modelos com
  rep #1 -> 4 colunas / 3 variantes / 1 sem resposta; rep #2 -> 4 colunas /
  4 variantes / 104 campos com 101 divergentes; eixo reps no mistral ->
  2 colunas / 99 campos com 88 divergentes.
- Erros pré-existentes de `tsc` em `examples/` (socket.io não instalado)
  permanecem, sem relação com esta mudança.

---

Task ID: 14
Agent: main
Task: Página de busca por modelo — todas as execuções de um ou mais modelos
escolhidos, reunidas de todos os lotes

Work Log:
- Nova tela **"Buscar por modelo"** (`src/app/components/views/model-search-view.tsx`),
  registrada no shell (`app-shell.tsx`) e no roteador de views (`page.tsx`) via
  o novo `ViewKind` `model-search`. Inverte a pergunta dos painéis de lote: em
  vez de "como os modelos se comportaram neste experimento", responde "tudo o
  que este modelo já produziu aqui".
- **Índice cross-lote** (`src/lib/storage/executions-index.ts`): as execuções
  ficam sob o lote que as gerou, então buscar por modelo exige varrer todos os
  arquivos em disco. Dois cuidados mantêm o custo baixo:
  - `raw` é descartado logo após o parse (é uma ordem de grandeza maior que o
    resto do registro);
  - cada arquivo parseado é memoizado e revalidado por `(mtime, size)`, e o mapa
    de cache é **substituído** a cada varredura, de modo que execuções e lotes
    excluídos saem do cache em vez de acumular.
  Medido nos dados reais (`data/`, 330 execuções / 27 lotes / 32 MB): ~125 ms por
  requisição com cache quente.
- **Projeção de rede enxuta** (`CrossBatchExecution` em `types.ts`): a listagem
  cross-lote não carrega `raw`, `systemPrompt`, `params` nem o `inputContent`
  completo — só um preview de 400 chars, com `inputTruncated` para o "…". Nos
  dados reais isso levou a resposta de **6,29 MB para 371 KB** (as entradas são
  documentos de ~50 KB, idênticos entre execuções do mesmo lote e nunca
  renderizados na tabela). O registro completo continua a um request de
  distância — é o que o dialog de execução já faz.
- **Busca textual no servidor** (`?q=`), justamente porque ela precisa olhar a
  entrada inteira, que a listagem só previa. Percorre resposta, erro, entrada,
  nome do lote e rótulo da entrada. No cliente, `onChange` faz debounce de 350 ms
  via `setTimeout` guardado em ref (sem `useEffect`, que o lint
  `react-hooks/set-state-in-effect` proibiria).
- **Endpoints**:
  - `GET /api/executions?model=<id>&model=<id>&status=&batchId=&q=` — `model` é
    repetível (ids contêm `/` e `:`, nenhum separador seria seguro) e
    obrigatório: sem nenhum, resultado vazio, que é a leitura honesta de "só os
    modelos escolhidos".
  - `GET /api/models/usage` — modelos que **têm** execuções, com contagem de
    execuções/lotes/falhas e último uso. Alimenta o seletor; um modelo
    configurado num lote que nunca rodou não tem o que retornar. Ficou sob
    `/api/models/` e não sob `/api/executions/` para não sombrear a rota
    dinâmica `[id]`.
- **Métricas** reaproveitam `computeModelMetrics`/`computeOverall` no servidor,
  então as regras valem igual às dos painéis de lote (execuções concluídas sem
  resposta ficam fora das médias). Há uma entrada `perModel` por modelo pedido,
  zerada quando não houve correspondência — um modelo sem resultado aparece
  explicitamente em vez de desaparecer da tabela.
- UI: seletor múltiplo com busca/contadores, chips removíveis, filtros de status
  e lote, cards agregados, tabela "resumo por modelo" (inclui em quantos lotes o
  modelo apareceu, derivado no cliente) e tabela de execuções ordenável por
  qualquer coluna, com link para o lote de origem e para o dialog de detalhe.
  Botão **Copiar JSON** exporta as linhas visíveis (respostas JSON viram objeto,
  não string escapada).
- `tryParseJson` saiu de `rep-comparison.tsx` para `components/json-utils.ts`,
  agora compartilhado pelas duas telas em vez de duplicado.
- Dois ajustes de integração exigidos pelo novo ponto de entrada:
  - `openComparison` (store) passou a **levar a view** para o `batch-detail` do
    lote alvo. Antes assumia que a tela já era a do lote; acionado do dialog
    aberto pela busca, apenas fechava o dialog sem navegar.
  - a seleção de modelos vive no store (`modelSearchModels`), então entrar num
    lote e voltar não descarta a escolha.
- `listDirs` adicionado a `storage/fs.ts` — a varredura descobre os lotes pelo
  disco, não pelo `index.json`, e um diretório sem `meta.json` é ignorado em vez
  de ter suas execuções atribuídas a um lote inventado.

Stage Summary:
- `tsc --noEmit` e `eslint src` limpos; `next build` compila as duas rotas novas
  (`/api/executions`, `/api/models/usage`). O passo `cp -r` do script `build`
  falha neste ambiente Windows ("cp: illegal option -- r") — pré-existente, sem
  relação com esta mudança, assim como os erros de `tsc` em `examples/`.
- Verificação do índice em data dir temporário: 25 checks passando, incluindo
  revalidação por mtime (arquivo reescrito volta atualizado), poda do cache após
  exclusão de lote, diretório sem `meta.json` ignorado, ordenação por recência e
  cada filtro isolado.
- Endpoints exercitados contra os dados reais: 330 execuções / 27 lotes / 37
  modelos; filtros de status, lote, texto e seleção vazia conferidos; payload
  sem `raw`/`systemPrompt`/`params`.
- View renderizada em SSR com os payloads reais (84 execuções, 926 KB de HTML):
  resumo por modelo confere com a API (96,2% sucesso, 11,56 s de latência média,
  $0,1334 de custo total, 902,4k tokens para o gpt-4o-mini).
