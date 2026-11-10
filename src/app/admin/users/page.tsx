import type { Metadata } from "next";
import { UserTable, type AdminUserRow } from "@/components/admin/user-table";
import { createClient } from "@/lib/supabase/server";
import { requireStaff } from "@/server/auth";

export const metadata: Metadata = { title: "Users" };

export default async function UsersPage({ searchParams }: PageProps<"/admin/users">) {
  const { role } = await requireStaff();
  const sp = await searchParams;
  const query = typeof sp.q === "string" ? sp.q.trim().slice(0, 100) : "";

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_search_users", { p_query: query || null, p_limit: 100 });
  if (error) throw error;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-extrabold">Users</h1>
          <p className="text-ink-soft">Search by name, email or user ID.</p>
        </div>
        <form className="flex gap-2" role="search">
          <input
            name="q"
            defaultValue={query}
            placeholder="Name, email or ID"
            aria-label="Search users"
            className="h-10 w-64 rounded-full border border-line bg-white px-4 text-sm focus-visible:border-coral focus-visible:outline-none"
          />
          <button className="h-10 rounded-full bg-ink px-4 text-sm font-semibold text-white">Search</button>
        </form>
      </div>
      <UserTable users={(data ?? []) as AdminUserRow[]} isAdmin={role === "admin"} />
    </div>
  );
}
