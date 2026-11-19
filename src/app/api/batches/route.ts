import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { listBatchesIndex } from "@/lib/storage/batches";
import { createBatch } from "@/lib/runner/manager";
import { getSettings } from "@/lib/storage/settings";
import { apiHandler, bad, json } from "@/lib/api/handlers";
import type { ResponseFormat } from "@/lib/storage/types";

/** Normalize & validate the incoming `responseFormat` payload. */
function parseResponseFormat(raw: unknown): ResponseFormat | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as { type?: string; json_schema?: any };
  if (r.type === "json_object") return { type: "json_object" };
  if (r.type === "json_schema" && r.json_schema) {
    const js = r.json_schema;
    if (typeof js.name !== "string" || !js.name.trim()) {
      throw Object.assign(new Error("`responseFormat.json_schema.name` is required"), {
        code: "BAD_REQUEST",
        status: 400,
      });
    }
    if (!js.schema || typeof js.schema !== "object") {
      throw Object.assign(new Error("`responseFormat.json_schema.schema` must be an object"), {
        code: "BAD_REQUEST",
        status: 400,
      });
    }
    return {
      type: "json_schema",
      json_schema: {
        name: js.name.trim(),
        description: typeof js.description === "string" ? js.description : undefined,
        schema: js.schema,
        strict: typeof js.strict === "boolean" ? js.strict : undefined,
      },
    };
  }
  return undefined;
}

export const GET = apiHandler(async () => {
  const entries = await listBatchesIndex();
  return json({ batches: entries });
});

export const POST = apiHandler(async (req: NextRequest) => {
  const body = await req.json();
  if (!body?.name || typeof body.name !== "string") {
    return bad("`name` is required.");
  }
  if (!Array.isArray(body.inputs) || body.inputs.length === 0) {
    return bad("At least one input is required.");
  }
  if (!Array.isArray(body.models) || body.models.length === 0) {
    return bad("At least one model is required.");
  }
  const settings = await getSettings();
  const reps = Math.max(1, Number(body.repetitions ?? settings.defaultRepetitions) | 0);

  const inputs = body.inputs.map((i: any, idx: number) => ({
    id: i.id ?? randomUUID(),
    format: i.format === "json" ? "json" : "text",
    content: typeof i.content === "string" ? i.content : JSON.stringify(i.content),
    label: i.label ?? `Input ${idx + 1}`,
  }));

  const models = body.models.map((m: any) => ({
    id: m.id,
    label: m.label ?? m.id,
  }));

  const { meta, status } = await createBatch({
    id: randomUUID(),
    name: body.name,
    description: body.description,
    systemPrompt: body.systemPrompt ?? "",
    inputs,
    models,
    repetitions: reps,
    params: {
      temperature: body.temperature,
      maxTokens: body.maxTokens,
      topP: body.topP,
      // Structured outputs + capability enforcement
      responseFormat: parseResponseFormat(body.responseFormat),
      requireParameters: body.requireParameters === true,
    },
    concurrency: Math.max(
      1,
      Number(body.concurrency ?? settings.defaultConcurrency) | 0
    ),
    timeoutMs: Math.max(
      5_000,
      Number(body.timeoutMs ?? settings.defaultTimeoutMs) | 0
    ),
    tags: Array.isArray(body.tags) ? body.tags : [],
  });

  return json({ meta, status }, { status: 201 });
});
