import "server-only";
import { NextResponse } from "next/server";
import type { z } from "zod";

export function json<T>(body: T, init: ResponseInit = {}) {
  return NextResponse.json(body, {
    ...init,
    headers: { "Cache-Control": "private, no-store", ...(init.headers ?? {}) },
  });
}

export const errorResponse = (status: number, error: string) => json({ error }, { status });

/** Parse and validate a JSON body; returns a typed value or an error Response. */
export async function parseBody<S extends z.ZodType>(req: Request, schema: S): Promise<{ data: z.infer<S> } | { response: Response }> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return { response: errorResponse(400, "Invalid JSON body") };
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return { response: errorResponse(422, parsed.error.issues[0]?.message ?? "Invalid request") };
  }
  return { data: parsed.data };
}

/** Same-origin check for state-changing route handlers (defence in depth against CSRF). */
export function isSameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true; // non-browser clients; session cookie is SameSite=Lax anyway
  try {
    return new URL(origin).host === new URL(req.url).host;
  } catch {
    return false;
  }
}
