/**
 * Map database / API errors to safe user-facing messages. Only errors raised
 * deliberately by our own SQL (custom SQLSTATEs) are shown verbatim; anything
 * else becomes a generic message so internals never leak to the browser.
 */
const SAFE_CODES = new Set(["P0001", "P0002", "P0003", "P0004", "P0005", "22023", "23514", "28000"]);

export interface DbErrorLike {
  code?: string;
  message?: string;
}

export function friendlyError(error: unknown, fallback = "Something went wrong. Please try again."): string {
  const e = error as DbErrorLike | null;
  if (e?.code && SAFE_CODES.has(e.code) && e.message) return e.message;
  if (e?.code === "23505") return "That was already done.";
  if (e?.code === "42501") return "You don't have permission to do that.";
  return fallback;
}

export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string[] | undefined> };

export const ok = <T,>(data: T): ActionResult<T> => ({ ok: true, data });
export const fail = (error: string, fieldErrors?: Record<string, string[] | undefined>): ActionResult<never> => ({
  ok: false,
  error,
  fieldErrors,
});
