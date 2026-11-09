#!/usr/bin/env node
/**
 * Daily maintenance trigger for hosts without built-in HTTP crons (Railway).
 *
 * Calls GET {APP_URL}/api/cron/cleanup with `Authorization: Bearer $CRON_SECRET`
 * and exits non-zero on failure so the platform marks the run as failed.
 *
 * Railway: create a separate "cron" service from this repo with
 *   Start command:  node scripts/cron-cleanup.mjs
 *   Cron schedule:  0 20 * * *      (03:00 WIB)
 *   Variables:      CRON_SECRET, and CRON_TARGET_URL (or NEXT_PUBLIC_APP_URL)
 */
const base = (process.env.CRON_TARGET_URL || process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "");
const secret = process.env.CRON_SECRET || "";

if (!base || !secret) {
  console.error("cron-cleanup: CRON_TARGET_URL (or NEXT_PUBLIC_APP_URL) and CRON_SECRET are required");
  process.exit(1);
}

const res = await fetch(`${base}/api/cron/cleanup`, {
  headers: { authorization: `Bearer ${secret}`, "user-agent": "spark-cron" },
  signal: AbortSignal.timeout(60_000),
});
const body = await res.text();
console.log(`cron-cleanup: ${res.status} ${body.slice(0, 500)}`);
// exitCode (not process.exit) lets undici close its sockets cleanly first.
process.exitCode = res.ok ? 0 : 1;
