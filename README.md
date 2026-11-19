# LLM Benchmark Studio

**Built as a study project for testing and comparing large language models**, LLM Benchmark Studio brings prompt experiments, model responses, and execution metrics into one place.

The idea is to learn by building: run the same inputs across different models, repeat experiments, inspect the actual responses, and understand the trade-offs between response time, token usage, cost, and reliability.

Created and maintained by **[Matheus Ginez Duarte](https://github.com/matgduarte)**, a developer and Computer Engineering student.

![Status: In development](https://img.shields.io/badge/status-in%20development-orange)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)
![Provider: OpenRouter](https://img.shields.io/badge/provider-OpenRouter-6366F1)
[![License: MIT](https://img.shields.io/badge/license-MIT-green)](LICENSE)

> **Work in progress.** This is an evolving personal study project. Features, interfaces, and data formats may change, and some areas still need testing and refinement. Feedback, bug reports, and contributions are welcome.

## Why I built it

Comparing models often means switching between interfaces, copying prompts, and trying to remember which response came from which configuration. I wanted a place to organize that process and inspect the results.

This project is also a practical way to study LLM API integration, asynchronous execution, concurrency control, structured outputs, data persistence, and how to present technical results in a useful interface.

It is designed for developers, students, and anyone who wants to experiment with models using their own prompts and use cases.

## What you can do

| Capability | What it helps you explore |
| --- | --- |
| **Create experiments** | Group prompts, system instructions, models, parameters, and repetitions into a reusable batch. |
| **Compare multiple models** | Run the same inputs across selected models under a shared experiment configuration. |
| **Repeat requests** | Observe how responses and execution metrics vary between runs. |
| **Test structured outputs** | Request plain text, JSON objects, or JSON Schema outputs when supported by the selected model. |
| **Control execution** | Configure concurrency and timeouts, retry transient failures, and cancel or resume batches. |
| **Inspect metrics** | Explore latency, token usage, cost, and request completion rates through charts and tables. |
| **Review full responses** | Inspect prompts, outputs, errors, execution metadata, and raw API responses. |
| **Search previous runs** | Find results for one or more models across saved experiments and copy visible executions as JSON. |

Experiments are stored locally as JSON files. The benchmark workflow does **not require a separate database**.

## Provider support

**Benchmark execution currently works through OpenRouter only.** Models from different vendors can be compared when they are available through the OpenRouter catalog.

Native provider integrations are planned so you will be able to use each provider's own API key directly.

| Provider | Benchmark integration | API key |
| --- | --- | --- |
| **OpenRouter** | Available now | OpenRouter API key |
| **OpenAI** | Planned native integration | Your own OpenAI API key |
| **Anthropic / Claude** | Planned native integration | Your own Anthropic API key |
| **Google Gemini** | Planned native integration | Your own Gemini API key |

The existing `OPENAI_API_KEY` setting is used only by the **experimental usage-reporting screen**. It does not currently enable native OpenAI benchmark requests.

## A simple experiment

Suppose you want to compare how three models extract information into a JSON structure:

1. Write a system prompt and add two example inputs.
2. Select three models and request five repetitions.
3. Choose a supported JSON Schema output format.
4. Run the experiment and inspect the responses and execution metrics.

That configuration produces **2 inputs × 3 models × 5 repetitions = 30 executions**.

You can then compare the returned fields, look for inconsistent answers, inspect failures, and explore the cost and latency of each model.

> A completed request does not automatically mean a correct answer. Response quality still needs to be reviewed against the task. Results reflect your prompts, settings, selected models, and provider conditions; they are not a universal model ranking.

## Getting started

### Requirements

- [Bun](https://bun.sh/) 1.3 or later.
- An [OpenRouter API key](https://openrouter.ai/keys) for running benchmarks.
- Available credits or access to suitable models in your OpenRouter account.

API requests use your own account and may consume paid credits depending on the models you select.

### Install and run

```bash
git clone https://github.com/matgduarte/LLM-Benchmark-Studio-Personal.git
cd LLM-Benchmark-Studio-Personal
bun install
bun run dev
```

Open **[http://localhost:3000](http://localhost:3000)**.

The current application interface is in **Portuguese**. Open **Configurações** to save your OpenRouter key and refresh the model catalog, then choose **Novo experimento** to create your first benchmark.

### Environment configuration

You can configure your OpenRouter key through the interface or copy the example environment file:

```bash
cp .env.example .env
```

Set your key in `.env`:

```dotenv
OPENROUTER_API_KEY=your_openrouter_api_key
```

An environment key takes precedence over the key saved through the interface.

| Variable | Purpose |
| --- | --- |
| `OPENROUTER_API_KEY` | API key used to execute benchmarks. Optional when the key is configured through the interface. |
| `LLM_BENCH_DATA_DIR` | Optional directory for local experiment data. Defaults to `./data`. |
| `OPENROUTER_MANAGEMENT_KEY` | Optional key for the experimental OpenRouter usage-reporting screen. |
| `OPENAI_API_KEY` | Optional key for experimental OpenAI usage reporting. **Not used for benchmark execution.** |

### Build and code checks

```bash
# Run the linter
bun run lint

# Create a production build
bun run build

# Start the production server
bun run start
```

The production server also uses port 3000 by default.

## Technology

| Area | Stack |
| --- | --- |
| Application | Next.js 16, React 19, TypeScript |
| Interface | Tailwind CSS 4, shadcn/ui, Radix UI |
| Charts | Recharts |
| Client state | Zustand |
| Server-state fetching | TanStack Query |
| Runtime and package manager | Bun |
| Benchmark provider | OpenRouter API |
| Experiment storage | Local JSON files |

The repository includes Prisma-related files inherited from the initial scaffold, but the benchmark workflow uses local files.

## Local data and API keys

Experiment configurations, responses, and metrics are saved in `data/`, or the directory selected with `LLM_BENCH_DATA_DIR`. Back up that directory if you want to preserve your experiment history.

Keys entered through the interface are saved in `data/config/settings.json`. Treat that file as sensitive. Keep API keys, `.env` files, and private experiment data out of commits and bug reports.

The app runs locally, but benchmark prompts are sent to OpenRouter and the selected upstream model provider to generate responses.

## Development roadmap

- [x] Run multi-model benchmarks through OpenRouter.
- [x] Configure prompts, repetitions, concurrency, and structured outputs.
- [x] Store experiments locally and inspect responses and metrics.
- [x] Search model executions across saved batches.
- [ ] Add native **OpenAI** integration with user-provided API keys.
- [ ] Add native **Anthropic / Claude** integration with user-provided API keys.
- [ ] Add native **Google Gemini** integration with user-provided API keys.
- [ ] Validate and refine the experimental **Usage & Costs** screen.
- [ ] Improve stability, documentation, and the experience of comparing results.

The roadmap reflects the current direction of the project and may evolve as I learn and receive feedback.

## Bugs, feedback, and contributions

Found a bug, noticed inconsistent results, or have an idea for an improvement? **I'd like to hear from you.**

- **Report a bug or suggest a feature:** [open an issue](https://github.com/matgduarte/LLM-Benchmark-Studio-Personal/issues/new).
- **Get in touch or explore my work:** visit [my GitHub profile](https://github.com/matgduarte).
- **Contribute a fix or improvement:** submit a [pull request](https://github.com/matgduarte/LLM-Benchmark-Studio-Personal/pulls) with your own commits.

For bug reports, include the steps to reproduce the problem, expected and actual behavior, relevant model/settings, and redacted logs or screenshots when useful. Never include API keys or private prompts.

To contribute code:

1. Fork the repository and create a branch for your change.
2. Make focused commits and describe the problem your change solves.
3. Run `bun run lint` and any checks relevant to your change.
4. Open a pull request targeting `main`, with a short explanation and validation details.

Small fixes, documentation improvements, and ideas are welcome. Contributors are credited through their commits and pull requests.

## Author and credits

**Matheus Ginez Duarte** — project development and maintenance.

[GitHub · @matgduarte](https://github.com/matgduarte)

The initial application scaffold was generated with **Z.ai** and uses Next.js, Tailwind CSS, and shadcn/ui. Thanks to the open-source projects and libraries that make this work possible.

If this project helps you learn or experiment, consider leaving a star or sharing it with someone who might find it useful.

## License

This project is licensed under the **[MIT License](LICENSE)**.

You may use, modify, and redistribute it, including commercially, as long as the copyright and license notices are preserved. Third-party dependencies and components remain subject to their respective licenses.

Copyright (c) 2026 **Matheus Ginez Duarte**.
