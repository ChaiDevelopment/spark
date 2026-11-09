/**
 * In-process Postgres (PGlite) harness for migration + RLS tests.
 *
 * It recreates the parts of a Supabase database that our migrations depend on:
 *   - roles: anon, authenticated, service_role (BYPASSRLS)
 *   - Supabase's default privileges (ALL on public tables/functions for API roles),
 *     so our explicit REVOKEs are actually exercised
 *   - auth.users and auth.uid()/auth.role()/auth.jwt() backed by request.jwt.claim.*
 *
 * Then it applies every file in supabase/migrations in order — the exact SQL
 * that ships to production. Realtime-specific statements are guarded in the
 * migrations and skipped here because the `realtime` schema does not exist.
 */
import { PGlite } from "@electric-sql/pglite";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

const BOOTSTRAP = `
create role anon nologin noinherit;
create role authenticated nologin noinherit;
create role service_role nologin noinherit bypassrls;

alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;

create schema auth;
grant usage on schema auth to anon, authenticated, service_role;
create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  email_confirmed_at timestamptz,
  created_at timestamptz not null default now()
);
create function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create function auth.role() returns text language sql stable as
  $$ select nullif(current_setting('request.jwt.claim.role', true), '')::text $$;
create function auth.jwt() returns jsonb language sql stable as
  $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
grant execute on all functions in schema auth to anon, authenticated, service_role;
`;

export type Db = PGlite;

export async function createTestDb(): Promise<Db> {
  const db = new PGlite();
  await db.exec(BOOTSTRAP);
  const dir = path.resolve(__dirname, "../../supabase/migrations");
  const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  for (const file of files) {
    try {
      await db.exec(readFileSync(path.join(dir, file), "utf8"));
    } catch (error) {
      throw new Error(`Migration ${file} failed: ${(error as Error).message}`);
    }
  }
  return db;
}

/** Simulate Supabase Auth sign-up (fires the on_auth_user_created trigger). */
export async function createUser(db: Db, opts: { email?: string; name?: string } = {}): Promise<string> {
  const id = randomUUID();
  await db.query(
    `insert into auth.users (id, email, raw_user_meta_data, email_confirmed_at) values ($1, $2, $3, now())`,
    [id, opts.email ?? `${id.slice(0, 8)}@example.test`, JSON.stringify({ full_name: opts.name ?? "" })],
  );
  return id;
}

/**
 * Run `fn` as an authenticated end user (RLS enforced), inside a transaction
 * that is rolled back afterwards unless `commit` is true.
 */
export async function asUser<T>(
  db: Db,
  userId: string | null,
  fn: (q: <R = Record<string, unknown>>(sql: string, params?: unknown[]) => Promise<R[]>) => Promise<T>,
  { commit = true, role = userId ? "authenticated" : "anon" }: { commit?: boolean; role?: string } = {},
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [userId ?? ""]);
    await tx.query(`select set_config('request.jwt.claim.role', $1, true)`, [role]);
    await tx.exec(`set local role ${role}`);
    const q = async <R,>(sql: string, params: unknown[] = []) => (await tx.query<R>(sql, params)).rows;
    const result = await fn(q);
    if (!commit) await tx.rollback();
    return result;
  });
}

/** Run as the trusted server (service role bypasses RLS). */
export async function asService<T>(
  db: Db,
  fn: (q: <R = Record<string, unknown>>(sql: string, params?: unknown[]) => Promise<R[]>) => Promise<T>,
): Promise<T> {
  return asUser(db, null, fn, { role: "service_role" });
}

/** Expect a promise to reject; returns the error message. */
export async function rejects(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (error) {
    return (error as Error).message;
  }
  throw new Error("Expected operation to be rejected, but it succeeded");
}

/**
 * Create a fully onboarded, discoverable user (as superuser, simulating the
 * trusted server's photo pipeline + onboarding RPC).
 */
export async function createReadyUser(
  db: Db,
  opts: {
    name: string;
    gender: "woman" | "man" | "non_binary" | "other";
    interestedIn: string[];
    dob?: string;
    city?: string;
    region?: string;
    minAge?: number;
    maxAge?: number;
    scope?: "city" | "region" | "country" | "anywhere";
  },
): Promise<string> {
  const id = await createUser(db, { name: opts.name });
  await asUser(db, id, async (q) => {
    await q(`update public.profiles set display_name = $1, gender = $2, city = $3, region = $4, bio = 'Hello there, nice to meet you!' where id = auth.uid()`, [
      opts.name,
      opts.gender,
      opts.city ?? "Jakarta",
      opts.region ?? "DKI Jakarta",
    ]);
    await q(`update public.user_preferences set interested_in = $1, min_age = $2, max_age = $3, location_scope = $4 where user_id = auth.uid()`, [
      opts.interestedIn,
      opts.minAge ?? 18,
      opts.maxAge ?? 60,
      opts.scope ?? "country",
    ]);
    await q(`select public.set_date_of_birth($1::date)`, [opts.dob ?? "1996-05-04"]);
    await q(
      `insert into public.user_interests (user_id, interest_id)
       select auth.uid(), id from public.interests where slug in ('coffee', 'hiking', 'reading')`,
    );
  });
  // Server-side photo pipeline (service role) + moderation approval.
  await asService(db, (q) =>
    q(
      `insert into public.profile_photos (user_id, staging_key, object_key, thumb_key, status, position)
       values ($1::uuid, 'uploads/' || $1::text || '/a', 'profiles/' || $1::text || '/a.webp', 'profiles/' || $1::text || '/a_thumb.webp', 'approved', 0)`,
      [id],
    ),
  );
  const [res] = await asUser(db, id, (q) => q<{ r: { ok: boolean } }>(`select public.complete_onboarding() as r`));
  if (!res.r.ok) throw new Error(`onboarding incomplete: ${JSON.stringify(res.r)}`);
  return id;
}
