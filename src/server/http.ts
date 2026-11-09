import "server-only";
import { NextResponse } from "next/server";
import type { z } from "zod";
import { publicEnv } from "@/lib/env";

export function json<T>(body: T, init: ResponseInit = {}) {
  return NextResponse.json(body, {
    ...init,
    headers: { "Cache-Control": "private, no-store", ...(init.headers ?? {}) },
  });
}

export const errorResponse = (status: number, error: string) => json({ error }, { status });

/**
 * Redirect to a same-origin PATH using a relative Location header.
 *
 * Never build absolute URLs from the request in route handlers: behind a
 * reverse proxy (Railway) `request.url` / `nextUrl.origin` carry the INTERNAL
 * host (e.g. https://localhost:8080). A relative Location resolves against the
 * address the browser actually used, and doesn't trust the Host header.
 * Cookies set through next/headers `cookies()` are still attached.
 */
export function redirectTo(path: string, status: 302 | 303 | 307 = 303): Response {
  if (!path.startsWith("/") || path.startsWith("//") || path.startsWith("/\\")) {
    throw new Error("redirectTo expects a same-origin path");
  }
  return new Response(null, { status, headers: { Location: path, "Cache-Control": "private, no-store" } });
}

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

/**
 * Same-origin check for state-changing route handlers (defence in depth against CSRF).
 *
 * Behind a reverse proxy (Railway, Render, Docker…) `req.url` carries the
 * INTERNAL host (e.g. localhost:8080), so the Origin is compared with the
 * public host instead: X-Forwarded-Host, Host, and the configured app URL.
 */
export function isSameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true; // non-browser clients; session cookie is SameSite=Lax anyway
  let originHost: string;
  try {
    originHost = new URL(origin).host.toLowerCase();
  } catch {
    return false;
  }
  const allowed = new Set<string>();
  const add = (h: string | null | undefined) => {
    const v = h?.split(",")[0]?.trim().toLowerCase();
    if (v) allowed.add(v);
  };
  add(req.headers.get("x-forwarded-host"));
  add(req.headers.get("host"));
  try {
    add(new URL(req.url).host);
  } catch {
    /* ignore */
  }
  try {
    add(new URL(publicEnv.appUrl).host);
  } catch {
    /* ignore */
  }
  return allowed.has(originHost);
}
