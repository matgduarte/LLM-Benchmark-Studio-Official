/** Helpers for reading model responses that are meant to be JSON. */

/**
 * Parses a response as JSON, tolerating ```json fences around the payload.
 * Returns `undefined` when the text isn't a JSON object/array — callers treat
 * that as "free text", which is a valid response, not an error.
 */
export function tryParseJson(text?: string): unknown | undefined {
  if (!text) return undefined;
  let t = text.trim();
  const fence = t.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fence) t = fence[1].trim();
  if (!(t.startsWith("{") || t.startsWith("["))) return undefined;
  try {
    return JSON.parse(t);
  } catch {
    return undefined;
  }
}
