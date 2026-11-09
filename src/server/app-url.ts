import "server-only";
import { headers } from "next/headers";

/**
 * The public base URL of the app, for links that leave the browser (email
 * verification, password reset, OAuth redirect_to). Resolved at REQUEST time:
 *
 *   1. NEXT_PUBLIC_APP_URL           explicit configuration (inlined at build)
 *   2. RAILWAY_PUBLIC_DOMAIN         injected by Railway at runtime
 *   3. X-Forwarded-Host / Host       the address the browser used
 *   4. http://localhost:3000         local development
 *
 * Header-derived values are safe for auth links because Supabase only
 * redirects to URLs on its allow-list (Auth → URL Configuration).
 */
export async function getAppUrl(): Promise<string> {
  const configured = (process.env.NEXT_PUBLIC_APP_URL || "").trim();
  if (configured) return configured.replace(/\/$/, "");

  const railway = (process.env.RAILWAY_PUBLIC_DOMAIN || "").trim();
  if (railway) return `https://${railway.replace(/\/$/, "")}`;

  const h = await headers();
  const host = (h.get("x-forwarded-host") || h.get("host") || "").split(",")[0].trim();
  if (host && /^[a-z0-9.-]+(:\d+)?$/i.test(host)) {
    const local = /^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(host);
    const proto = (h.get("x-forwarded-proto") || "").split(",")[0].trim() || (local ? "http" : "https");
    return `${proto === "http" ? "http" : "https"}://${host}`;
  }
  return "http://localhost:3000";
}
