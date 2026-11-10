#!/usr/bin/env node
/**
 * Grant a staff role to an EXISTING account. Use it once for the first
 * moderator or admin; after that, staff can promote others from /admin/users.
 *
 *   node --env-file=.env.local scripts/make-moderator.mjs you@example.com admin
 *
 * Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY. The service key
 * bypasses row-level security: run this only on a machine you control, and never
 * put the key in the browser or in the repository.
 */

const [email, roleArg = "moderator"] = process.argv.slice(2);
const role = roleArg;

if (!email || !email.includes("@") || !["moderator", "admin"].includes(role)) {
  console.error("Usage: node --env-file=.env.local scripts/make-moderator.mjs <email> [moderator|admin]");
  process.exit(1);
}

const base = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim().replace(/\/$/, "");
const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
if (!base || !key) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (for example in .env.local).");
  process.exit(1);
}

const headers = { apikey: key, authorization: `Bearer ${key}`, "content-type": "application/json" };

async function findUserByEmail(address) {
  const wanted = address.toLowerCase();
  for (let page = 1; page <= 100; page++) {
    const res = await fetch(`${base}/auth/v1/admin/users?page=${page}&per_page=200`, { headers });
    if (!res.ok) throw new Error(`Account lookup failed (${res.status}). Check the service key.`);
    const { users = [] } = await res.json();
    const hit = users.find((u) => (u.email || "").toLowerCase() === wanted);
    if (hit) return hit;
    if (users.length < 200) return null;
  }
  return null;
}

const user = await findUserByEmail(email);
if (!user) {
  console.error(`No account with the email ${email}. Sign up in SPARK, verify the email, then run this again.`);
  process.exit(1);
}

const save = await fetch(`${base}/rest/v1/admin_users?on_conflict=user_id`, {
  method: "POST",
  headers: { ...headers, prefer: "resolution=merge-duplicates,return=minimal" },
  body: JSON.stringify({ user_id: user.id, role }),
});
if (!save.ok) {
  console.error(`Could not save the role (${save.status}): ${await save.text()}`);
  process.exit(1);
}

// Record the grant in the append-only audit log (no actor: it was done from the CLI).
await fetch(`${base}/rest/v1/admin_audit_logs`, {
  method: "POST",
  headers: { ...headers, prefer: "return=minimal" },
  body: JSON.stringify({ actor_id: null, action: "role.set", target_type: "user", target_id: user.id, details: { role, via: "cli" } }),
});

console.log(`Done: ${email} is now a ${role}. Refresh the app; the role is read from the database on every request.`);
