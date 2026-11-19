# LLM Benchmark Studio

Aplicação web para **execução, registro e avaliação comparativa de múltiplos modelos de linguagem** via API do [OpenRouter](https://openrouter.ai/).

Crie experimentos controlados (lotes de avaliação) com entradas/prompt, system prompt, múltiplos modelos e repetições — execute-os concorrentemente, persista cada execução individualmente em arquivos locais e compare os modelos em um dashboard rico com métricas agregadas e gráficos.

> **Sem banco de dados.** Toda a persistência é feita em **arquivos locais** dentro do próprio projeto (`data/`), que funcionam como a fonte de verdade dos experimentos.

---

## ✨ Funcionalidades

### Configuração de experimentos
- **Entradas/prompt** em texto livre ou **JSON** (com validação)
- **System prompt** associado ao lote
- **Múltiplos modelos** do catálogo do OpenRouter (buscável) ou **modelos customizados** cadastrados pelo usuário
- **Repetições** por modelo (ex: 10 modelos × 5 reps = 50 execuções)
- **Parâmetros opcionais**: `temperature`, `max_tokens`, `top_p`
- **Saída estruturada (JSON)**: modo `json_object`, `json_schema` (Structured Outputs strict) ou texto livre
- **`require_parameters: true`** — o OpenRouter retorna erro 400 se o modelo não suportar os parâmetros enviados, permitindo testar compatibilidade
- **Relatório de compatibilidade** ao vivo: mostra quais modelos selecionados suportam `response_format` / Structured Outputs
- **Concorrência** configurável por lote (1–16 requisições paralelas)
- **Timeout** por requisição (5–300s)
- **Tags** para organização

### Execução
- **Processamento concorrente** com semáforo por lote (bounded parallelism)
- **Persistência incremental** — cada execução é gravada em disco imediatamente após concluir (sucessou ou falhou), então resultados já finalizados não se perdem se uma execução posterior falhar
- **Retry** automático em erros transitórios (429, 5xx) com backoff exponencial
- **Cancelamento** via `AbortController` + timeout
- **Reconciliação de estado** após restart: execuções `running`/`interrupted` viram `queued` ao retomar o lote
- **Estados** rastreados: `pending`, `queued`, `running`, `completed`, `failed`, `cancelled`, `interrupted`

### Dashboard de comparação
- **Visão geral**: cards de métricas (total, taxa de sucesso, custo total, latência média, tokens)
- **Ranking de modelos** com medalhas (ordenado por sucesso → latência → custo)
- **6 gráficos comparativos** (Recharts):
  - Latência por modelo (min/avg/p95/máx)
  - Custo total por modelo
  - Consumo de tokens (entrada × saída, empilhado)
  - Taxa de sucesso por modelo
  - Distribuição de latência (scatter por execução)
  - Fronteira de eficiência (custo × latência, área = tokens)
- **Tabela comparativa** por modelo com min/avg/median/p95/máx de latência e custo
- **Tabela de execuções** com filtros (status, modelo), busca e ordenação por qualquer coluna
- **Dialog de detalhe** de cada execução: resposta completa, entrada, metadados, payload cru da API
- **Rastreabilidade**: navegue de métricas agregadas → execuções individuais que originaram aquela métrica

### Busca por modelo (todos os lotes)
- Tela **"Buscar por modelo"**: escolha **um ou mais modelos** e veja **todas as execuções deles em todos os lotes** já registrados
- **Seletor múltiplo** com busca, contagem de execuções, número de lotes e último uso por modelo
- **Filtros** de status e lote, além de **busca textual** aplicada no servidor sobre a resposta, o erro, a entrada completa, o nome do lote e o rótulo da entrada
- **Resumo por modelo** agregando o histórico inteiro (lotes, execuções, sucesso, latência média/P95, custo total e por execução, tokens) — mesmas regras de média do dashboard de lote
- **Navegação cruzada**: clique no lote para abrir seu dashboard, ou na linha para o dialog de detalhe da execução
- **Copiar JSON** das execuções visíveis (respostas que são JSON viram objeto, não string escapada)

### Persistência
- **Escrita atômica** (temp → fsync → rename) — leitores nunca veem arquivos parcialmente escritos
- **Schema versioning** (`schemaVersion` em todos os objetos) para evolução futura do formato
- Estrutura organizada que evita arquivos pesados (uma execução por arquivo)

---

## 🛠 Stack tecnológica

| Camada | Tecnologia |
|--------|------------|
| Framework | Next.js 16 (App Router) |
| Linguagem | TypeScript 5 |
| Styling | Tailwind CSS 4 + shadcn/ui (New York) |
| Gráficos | Recharts |
| Estado (cliente) | Zustand |
| Estado (servidor) | TanStack Query |
| Runtime | Bun |
| Persistência | Arquivos JSON locais (sem banco de dados) |

---

## 📋 Pré-requisitos

- **[Bun](https://bun.sh/)** v1.3+ (runtime recomendado) ou Node.js 20+
- Uma **chave de API do OpenRouter** — obtenha em [openrouter.ai/keys](https://openrouter.ai/keys)

---

## 🚀 Instalação

```bash
# 1. Clone o repositório (se aplicável)
git clone <url-do-repo> && cd my-project

# 2. Instale as dependências
bun install
```

---

## ⚙️ Configuração (variáveis de ambiente)

A aplicação funciona sem nenhuma variável de ambiente obrigatória — a API key do OpenRouter pode ser configurada pela **interface de Configurações** (salva em `data/config/settings.json`).

Para automatizar (CI/produção), use o arquivo `.env` na raiz do projeto:

```bash
# .env

# ─── Obrigatório para execuções reais ────────────────────────────
# Chave da API do OpenRouter (sobrescreve a configurada via UI).
# Obtenha em: https://openrouter.ai/keys
# Exemplo: sk-or-v1-abcdef0123456789...
OPENROUTER_API_KEY=

# ─── Opcional ────────────────────────────────────────────────────
# Diretório onde os dados (lotes, execuções, métricas) são persistidos.
# Padrão: <raiz-do-projeto>/data
# LLM_BENCH_DATA_DIR=/var/lib/llm-benchmark

# ─── Não relacionado a este app (scaffold original) ─────────────
# Usado pelo Prisma (não usado por este app, mantido pelo scaffold)
# DATABASE_URL=file:./db/custom.db
```

> **Precedência**: `OPENROUTER_API_KEY` (env) > chave configurada via UI. Quando a env var está definida, a UI não pode sobrescrevê-la (apenas exibe que está ativa via variável de ambiente).

### Resumo das variáveis

| Variável | Obrigatória | Default | Descrição |
|----------|:-----------:|---------|-----------|
| `OPENROUTER_API_KEY` | sim* | — | Chave da API do OpenRouter |
| `LLM_BENCH_DATA_DIR` | não | `./data` | Diretório raiz dos dados persistidos |
| `DATABASE_URL` | não | — | Apenas do scaffold Prisma (ignorado por este app) |

\* _Pode ser omitida se você configurar a chave pela interface de Configurações após iniciar o app._

---

## ▶️ Como iniciar

### Desenvolvimento

```bash
bun run dev
```

A aplicação sobe em **http://localhost:3000** (única rota visível: `/`).

> O dev server redireciona logs para `dev.log` (útil para depuração).

### Produção

```bash
# Build otimizado (standalone output)
bun run build

# Inicia o servidor de produção
bun run start
```

> Por padrão o servidor de produção também escuta na porta 3000.

### Verificar qualidade do código

```bash
bun run lint
```

---

## 🧭 Como usar (fluxo completo)

### 1. Configure a API key

- Se não definiu `OPENROUTER_API_KEY` no `.env`: abra o app → aba **Configurações** → cole sua chave (`sk-or-v1-...`) → **Salvar**.
- O badge no header mostra "API key ativa" (verde) ou "Sem API key" (âmbar).

### 2. Atualize o catálogo de modelos

- Na aba **Configurações**, role até **Catálogo de modelos** → clique em **"Atualizar do OpenRouter"**.
- Isso busca todos os modelos disponíveis e armazena localmente (incluindo `supported_parameters` de cada modelo, usado para indicar compatibilidade com JSON Schema).
- **Badges de compatibilidade** aparecem ao lado de cada modelo: `JSON schema` (verde), `json` (âmbar), `sem JSON` (vermelho).

### 3. Cadastre modelos customizados (opcional)

Se um modelo não aparece no catálogo, cadastre manualmente:
- Na aba **Configurações**, ative o toggle **"Cadastrar modelo customizado"**.
- Informe o ID OpenRouter (ex: `anthropic/claude-3.7-sonnet`) e um nome de exibição → **Cadastrar**.

### 4. Crie um experimento

Clique em **"Novo experimento"** e preencha:

- **Identificação**: nome, descrição, tags
- **System prompt**: instrução de sistema comum a todas as execuções
- **Entradas / Prompts**: adicione uma ou mais entradas (texto ou JSON). Cada entrada roda contra todos os modelos e repetições.
- **Modelos**: marque um ou mais modelos na lista buscável. Badges indicam compatibilidade com JSON.
- **Saída estruturada (JSON)** (opcional):
  - **Texto livre** — sem enforcement de formato
  - **JSON object** — modo JSON básico (`response_format: { type: "json_object" }`)
  - **JSON Schema** — Structured Outputs strict (`response_format: { type: "json_schema", json_schema: {...} }`), com editor de schema e validador ao vivo
  - **`require_parameters`** — quando ativo, modelos que não suportam os parâmetros enviados retornam erro 400 explícito (em vez de ignorar silenciosamente). Use para testar compatibilidade.
  - **Relatório de compatibilidade** mostra por modelo selecionado: ✓ suporta / ⚠ sem info / ✕ incompatível.
- **Parâmetros de execução**: repetições, concorrência, timeout, temperature/max_tokens/top_p opcionais.
- O **plano de execução** mostra o total: `inputs × modelos × repetições`.

Clique em **Criar experimento**.

### 5. Execute o lote

Na tela de detalhe do lote:
- Clique em **Executar** (ou **Retomar** se já houver execuções anteriores).
- O progresso é atualizado em tempo real (polling a cada ~1.2s enquanto rodando).
- Você pode **Cancelar** a qualquer momento — execuções em andamento recebem `AbortController` e as pendentes viram `cancelled`.

### 6. Analise os resultados

Na tela de detalhe do lote, explore as 5 abas:

| Aba | Conteúdo |
|-----|----------|
| **Visão geral** | Cards de métricas, distribuição de status, ranking de modelos |
| **Métricas & gráficos** | 6 gráficos comparativos + tabela comparativa por modelo |
| **Execuções** | Tabela com filtros/ordenação/busca; clique numa linha para ver o detalhe |
| **Comparar reps** | Respostas lado a lado (reps do mesmo modelo ou modelos na mesma rep) e comparação campo a campo de JSON |
| **Configuração** | System prompt, parâmetros, saída estruturada (schema JSON), modelos e entradas |

No **dialog de execução individual**, você vê:
- **Resposta**: conteúdo retornado pelo modelo
- **Entrada**: system prompt + input do usuário
- **Metadados**: ID, modelo resolvido, generation ID, tokens, custo, duração, finish reason, timestamps, etc.
- **Raw API**: payload cru retornado pelo OpenRouter

### 7. Busque um modelo em todos os lotes

Na tela **"Buscar por modelo"** (menu superior), a pergunta se inverte: em vez de "como os modelos se comportaram neste experimento", ela responde "tudo o que este modelo já produziu aqui".

- Abra o seletor e marque **um ou mais modelos** — a lista mostra somente modelos que já têm execuções, com quantas execuções, em quantos lotes e quando rodaram por último.
- Refine com **status**, **lote** e **busca textual** (a busca percorre a entrada completa, não só o trecho exibido na tabela).
- O **resumo por modelo** agrega todos os lotes de uma vez; a tabela lista cada execução com seu lote de origem.
- Clique no nome do lote para abrir o dashboard dele, ou na linha para ver a resposta completa. **Copiar JSON** leva as execuções visíveis para a área de transferência.

> Só aparecem modelos com execuções gravadas em disco: um modelo configurado em um lote que nunca rodou não tem o que retornar.

### 8. Gerencie lotes

Na home (lista de lotes), cada card permite:
- **Executar / Retomar** (reativa execuções pendentes/interrompidas)
- **Detalhes** (abre a tela de detalhe)
- **Excluir** (remove permanentemente o lote e seus arquivos — não pode ser desfeito; bloqueado se o lote estiver rodando)

---

## 📁 Estrutura do projeto

```
my-project/
├── src/
│   ├── app/
│   │   ├── api/                    # API routes (REST)
│   │   │   ├── settings/route.ts          # GET/PUT configurações
│   │   │   ├── models/                    # Catálogo de modelos
│   │   │   │   ├── route.ts              # GET lista (cached + custom)
│   │   │   │   ├── refresh/route.ts      # POST atualiza do OpenRouter
│   │   │   │   ├── custom/route.ts       # POST/DELETE modelo customizado
│   │   │   │   └── usage/route.ts        # GET modelos com execuções (todos os lotes)
│   │   │   ├── batches/                   # Lotes
│   │   │   │   ├── route.ts              # GET lista / POST cria
│   │   │   │   └── [id]/
│   │   │   │       ├── route.ts          # GET detalhe / DELETE
│   │   │   │       ├── run/route.ts      # POST inicia execução
│   │   │   │       ├── cancel/route.ts   # POST cancela
│   │   │   │       ├── status/route.ts   # GET progresso ao vivo
│   │   │   │       ├── metrics/route.ts  # GET métricas agregadas
│   │   │   │       └── executions/route.ts # GET execuções (filtros)
│   │   │   └── executions/
│   │   │       ├── route.ts              # GET busca cross-lote por modelo
│   │   │       └── [id]/route.ts         # GET execução individual
│   │   ├── components/
│   │   │   ├── views/                    # Telas principais
│   │   │   │   ├── batches-view.tsx      # Home: lista de lotes
│   │   │   │   ├── create-batch-view.tsx # Formulário de criação
│   │   │   │   ├── batch-detail-view.tsx # Detalhe com 5 abas
│   │   │   │   ├── model-search-view.tsx # Busca por modelo em todos os lotes
│   │   │   │   └── settings-view.tsx     # Configurações
│   │   │   ├── charts/                   # Gráficos Recharts
│   │   │   ├── execution-table.tsx       # Tabela de execuções
│   │   │   ├── rep-comparison.tsx        # Comparação lado a lado (reps/modelos)
│   │   │   ├── json-utils.ts             # Parse tolerante de respostas JSON
│   │   │   ├── execution-detail-dialog.tsx
│   │   │   ├── app-shell.tsx            # Layout, header, footer
│   │   │   └── ...                      # Componentes auxiliares
│   │   ├── layout.tsx                   # Root layout + providers
│   │   └── page.tsx                     # Rota única (/) que renderiza views
│   └── lib/
│       ├── storage/                     # Camada de persistência (arquivos)
│       │   ├── types.ts                # Tipos do domínio + deriveCapabilities
│       │   ├── paths.ts                 # Resolução de caminhos
│       │   ├── fs.ts                    # Escrita atômica (temp→fsync→rename)
│       │   ├── settings.ts             # AppSettings (API key, defaults)
│       │   ├── models.ts               # Catálogo cached + custom
│       │   ├── batches.ts              # CRUD de lotes e execuções
│       │   ├── executions-index.ts     # Índice cross-lote (cache por mtime)
│       │   └── metrics.ts              # Cálculo de métricas agregadas
│       ├── openrouter/
│       │   └── client.ts               # Cliente da API OpenRouter
│       ├── runner/
│       │   └── manager.ts              # Fila concorrente + persistência incremental
│       ├── api/
│       │   └── handlers.ts              # Helper de error handling
│       └── api-client.ts               # Cliente tipado para o frontend
├── data/                               # ← FONTE DE VERDADE (gerada em runtime)
│   ├── config/
│   │   ├── settings.json               # API key + defaults
│   │   ├── models.json                 # Catálogo OpenRouter cacheado
│   │   └── custom-models.json          # Modelos cadastrados pelo usuário
│   └── batches/
│       ├── index.json                  # Índice leve de todos os lotes
│       └── <batchId>/
│           ├── meta.json               # Configuração imutável do lote
│           ├── status.json             # Progresso ao vivo
│           ├── metrics.json            # Métricas agregadas
│           └── executions/
│               ├── <execId>.json       # Uma execução por arquivo
│               └── ...
├── .env                                # Variáveis de ambiente (opcional)
├── package.json
└── README.md
```

> A pasta `data/` é gerada automaticamente em runtime e está no `.gitignore`. **Ela é a fonte de verdade dos experimentos** — faça backup se precisar preservar o histórico.

---

## 🗂 Estrutura dos dados persistidos

Cada execução individual registra (no mínimo):

- Identificador único da execução (`id`)
- Identificador do lote (`batchId`)
- Modelo utilizado (`modelId`) + modelo resolvido pelo provider (`resolvedModel`)
- Prompt/input utilizado + format (text/json)
- System prompt utilizado
- Repetição (índice 1..N dentro do par modelo×input)
- Resposta completa retornada (`response`)
- Status (`pending` / `queued` / `running` / `completed` / `failed` / `cancelled` / `interrupted`)
- Timestamps de início e término
- Duração/latência (`durationMs`)
- Custo da requisição (`cost`, USD)
- Tokens de entrada, saída e total (`usage`)
- Finish reason (`stop`, `length`, etc.)
- Generation ID do OpenRouter
- Configurações usadas (`params`: temperature, maxTokens, topP, responseFormat, requireParameters)
- Erros ou mensagens de falha (`errorMessage`, `errorCode`)
- Payload cru da API (`raw`) para auditoria

Cada lote mantém:
- Configuração imutável (`meta.json`): entradas, system prompt, modelos, repetições, parâmetros, data/hora, tags
- Status ao vivo (`status.json`): contadores por estado, timestamps, `isRunning`
- Métricas agregadas (`metrics.json`): por modelo e geral (latência min/avg/median/p95/máx, custo, tokens, taxa de sucesso)

---

## 📊 Métricas calculadas

### Por modelo
- Total / concluídas / falhas / pendentes / em execução
- Taxa de sucesso
- Custo: total, médio, mínimo, máximo
- Latência: média, mínima, máxima, mediana, P95
- Tokens: total e médio (entrada, saída, total)
- Custo por 1k tokens

### Geral (lote)
- Total de execuções
- Concluídas / falhas
- Taxa de sucesso
- Custo total e médio
- Latência média
- Tokens totais (entrada + saída)

---

## 🌐 API REST

Todos os endpoints usam caminhos relativos e retornam JSON.

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| `GET` | `/api/settings` | Lê configurações (API key mascarada) |
| `PUT` | `/api/settings` | Atualiza configurações |
| `GET` | `/api/models` | Lista modelos (cached + custom) |
| `GET` | `/api/models/usage` | Modelos com execuções em disco + contagens (todos os lotes) |
| `POST` | `/api/models/refresh` | Atualiza catálogo do OpenRouter |
| `POST` | `/api/models/custom` | Cadastra modelo customizado |
| `DELETE` | `/api/models/custom?id=<id>` | Remove modelo customizado |
| `GET` | `/api/batches` | Lista lotes (índice) |
| `POST` | `/api/batches` | Cria novo lote |
| `GET` | `/api/batches/<id>` | Detalhe do lote (meta + status) |
| `DELETE` | `/api/batches/<id>` | Exclui lote |
| `POST` | `/api/batches/<id>/run` | Inicia/retoma execução |
| `POST` | `/api/batches/<id>/cancel` | Cancela execução |
| `GET` | `/api/batches/<id>/status` | Progresso ao vivo |
| `GET` | `/api/batches/<id>/metrics` | Métricas agregadas |
| `GET` | `/api/batches/<id>/executions` | Lista execuções (filtros: `?status=` `?modelId=`) |
| `GET` | `/api/executions?model=<id>&model=<id>` | Execuções dos modelos escolhidos em **todos os lotes** (filtros: `?status=` `?batchId=` `?q=`) |
| `GET` | `/api/executions/<id>?batchId=<batchId>` | Execução individual |

### Exemplo: execuções de dois modelos em todos os lotes

```bash
curl -G http://localhost:3000/api/executions \
  --data-urlencode "model=openai/gpt-4o-mini" \
  --data-urlencode "model=mistralai/mistral-small-24b-instruct-2501" \
  --data-urlencode "status=completed"
```

Resposta: `{ executions, perModel, overall }` — `executions` traz o lote de origem de cada execução (`batchId`, `batchName`) e um **preview** da entrada (400 chars) em vez do texto completo; `perModel` tem uma entrada por modelo pedido, zerada quando não houve correspondência. O parâmetro `model` é repetível e obrigatório: sem nenhum, o resultado é vazio (para varrer um lote inteiro use `/api/batches/<id>/executions`).

### Exemplo: criar um lote com JSON Schema

```bash
curl -X POST http://localhost:3000/api/batches \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Extracao de dados",
    "systemPrompt": "Responda estritamente em JSON.",
    "inputs": [
      {"format": "text", "content": "Extraia: nome=João, idade=30", "label": "extract-1"}
    ],
    "models": [
      {"id": "openai/gpt-4o-mini", "label": "gpt-4o-mini"},
      {"id": "meta-llama/llama-3.2-3b-instruct", "label": "llama-3.2-3b"}
    ],
    "repetitions": 3,
    "concurrency": 4,
    "responseFormat": {
      "type": "json_schema",
      "json_schema": {
        "name": "person",
        "schema": {
          "type": "object",
          "properties": {
            "name": {"type": "string"},
            "age": {"type": "number"}
          },
          "required": ["name", "age"],
          "additionalProperties": false
        },
        "strict": true
      }
    },
    "requireParameters": true
  }'
```

---

## ❓ Solução de problemas

| Problema | Solução |
|----------|---------|
| **"OpenRouter API key is not configured"** | Configure a chave em Configurações ou via `OPENROUTER_API_KEY` no `.env` |
| **Execuções falham com erro 400** | Com `require_parameters: true`, o modelo não suporta os parâmetros enviados. Desative `require_parameters` ou selecione modelos compatíveis (badges `JSON schema`) |
| **Catálogo de modelos vazio** | Clique em "Atualizar do OpenRouter" na aba Configurações (requer API key) |
| **Lote travado em "Em execução"** | Se o processo foi reiniciado, abra o lote e clique em "Retomar" — execuções `running`/`interrupted` são reconciliadas para `queued` |
| **Porta 3000 ocupada** | O app usa apenas a porta 3000. Encerre outros processos nessa porta |
| **Dados corrompidos** | Cada execução é um arquivo JSON independente; exclua apenas os afetados em `data/batches/<id>/executions/` |

---

## 📝 Notas

- **Sem dependência de banco de dados**: SQLite/Prisma estão no scaffold original mas **não são usados** por este app. Toda a persistência é via arquivos em `data/`.
- **Schema versioning**: todos os objetos persistidos incluem `schemaVersion`, permitindo migrações futuras do formato sem quebrar leituras de experimentos antigos.
- **Atomicidade**: escritas usam temp file → `fsync` → `rename`, garantindo consistência mesmo sob concorrência.
- **Extensibilidade**: a arquitetura separa storage / runner / openrouter-client / API / views, facilitando adicionar novos formatos de entrada, métricas ou provedores.

---

## 📄 Licença

Projeto de uso interno/livre. Adaptado a partir do scaffold Next.js + Tailwind + shadcn/ui da Z.ai.
