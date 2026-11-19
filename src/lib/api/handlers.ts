import { NextResponse } from "next/server";

/** Wrap an async handler, normalizing errors to a JSON `{ error, code }`. */
export function apiHandler<TArgs extends unknown[]>(
  fn: (...args: TArgs) => Promise<Response | NextResponse>
): (...args: TArgs) => Promise<NextResponse> {
  return async (...args: TArgs) => {
    try {
      const res = await fn(...args);
      return res instanceof NextResponse ? res : NextResponse.json(res);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Internal error";
      const code = (err as { code?: string })?.code ?? "INTERNAL_ERROR";
      const status = (err as { status?: number })?.status ?? 500;
      console.error("[api] error", code, message, err);
      return NextResponse.json({ error: message, code }, { status });
    }
  };
}

export function json<T>(data: T, init?: ResponseInit): NextResponse {
  return NextResponse.json(data, init);
}

export function bad(
  message: string,
  code = "BAD_REQUEST",
  status = 400
): NextResponse {
  return NextResponse.json({ error: message, code }, { status });
}

export function notFound(message = "Not found"): NextResponse {
  return NextResponse.json({ error: message, code: "NOT_FOUND" }, { status: 404 });
}
