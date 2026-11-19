/**
 * Draft model for the create-experiment form.
 *
 * Kept free of React/UI imports so the meta -> draft mapping (used by the
 * "Refazer" flow) stays independently testable.
 */

import type { BatchMeta } from "@/lib/storage/types";
import type { PublicSettings } from "@/lib/api-client";

export interface DraftInput {
  id: string;
  format: "text" | "json";
  content: string;
  label: string;
}

export function uid() {
  return Math.random().toString(36).slice(2, 10);
}

export const DEFAULT_SCHEMA_TEXT = JSON.stringify(
  {
    type: "object",
    properties: {
      answer: { type: "string" },
      confidence: { type: "number" },
      tags: { type: "array", items: { type: "string" } },
    },
    required: ["answer", "confidence"],
    additionalProperties: false,
  },
  null,
  2
);

/** Everything the form needs to initialise its own state. */
export interface Draft {
  name: string;
  description: string;
  systemPrompt: string;
  inputs: DraftInput[];
  selectedModelIds: string[];
  /**
   * Labels of a cloned batch's models, keyed by id. The catalog may no longer
   * list a model (removed upstream, or a custom one never re-added), and we
   * must not lose its label when re-creating the batch.
   */
  modelLabels: Record<string, string>;
  repetitions: number;
  concurrency: number;
  timeoutMs: number;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  jsonMode: "none" | "object" | "schema";
  schemaName: string;
  schemaStrict: boolean;
  schemaText: string;
  requireParameters: boolean;
  tags: string;
}

export function blankDraft(settings: PublicSettings | undefined): Draft {
  return {
    name: "",
    description: "",
    systemPrompt: "You are a precise, helpful assistant. Answer concisely.",
    inputs: [
      {
        id: uid(),
        format: "text",
        label: "Resumo",
        content:
          "Resuma o conceito de 'vector database' em 3 frases para um engenheiro júnior.",
      },
    ],
    selectedModelIds: [],
    modelLabels: {},
    repetitions: settings?.defaultRepetitions ?? 3,
    concurrency: settings?.defaultConcurrency ?? 4,
    timeoutMs: settings?.defaultTimeoutMs ?? 90000,
    jsonMode: "none",
    schemaName: "extracted_data",
    schemaStrict: true,
    schemaText: DEFAULT_SCHEMA_TEXT,
    requireParameters: false,
    tags: "",
  };
}

/** Rebuild an editable draft from a previously created batch ("Refazer"). */
export function draftFromMeta(meta: BatchMeta): Draft {
  const rf = meta.params.responseFormat;
  return {
    name: `${meta.name} (cópia)`,
    description: meta.description ?? "",
    systemPrompt: meta.systemPrompt,
    inputs: meta.inputs.map((i) => ({
      id: uid(), // fresh draft ids; the backend assigns real ones on create
      format: i.format,
      content: i.content,
      label: i.label ?? "",
    })),
    selectedModelIds: meta.models.map((m) => m.id),
    modelLabels: Object.fromEntries(meta.models.map((m) => [m.id, m.label ?? m.id])),
    repetitions: meta.repetitions,
    concurrency: meta.concurrency,
    timeoutMs: meta.timeoutMs,
    temperature: meta.params.temperature,
    maxTokens: meta.params.maxTokens,
    topP: meta.params.topP,
    jsonMode:
      rf?.type === "json_schema" ? "schema" : rf?.type === "json_object" ? "object" : "none",
    schemaName: rf?.type === "json_schema" ? rf.json_schema.name : "extracted_data",
    schemaStrict: rf?.type === "json_schema" ? rf.json_schema.strict ?? true : true,
    schemaText:
      rf?.type === "json_schema"
        ? JSON.stringify(rf.json_schema.schema, null, 2)
        : DEFAULT_SCHEMA_TEXT,
    requireParameters: meta.params.requireParameters ?? false,
    tags: (meta.tags ?? []).join(", "),
  };
}
