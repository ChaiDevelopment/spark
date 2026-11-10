import { describe, expect, it, vi } from "vitest";

// The moderation area guard: anonymous visitors, regular users and suspended
// accounts all get the same 404, so the admin area is not revealed.

const h = vi.hoisted(() => ({
  claims: null as null | { sub: string },
  profile: null as null | { id: string; display_name: string; account_status: string; onboarding_completed_at: string | null; is_visible: boolean },
  role: null as null | string,
}));

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));
vi.mock("next/server", () => ({ connection: async () => undefined }));
vi.mock("@/lib/env", () => ({ isSupabaseConfigured: () => true }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getClaims: async () => ({ data: { claims: h.claims ? { ...h.claims, email: "x@example.com" } : null }, error: null }) },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: h.profile }) }) }) }),
    rpc: async (name: string) => ({ data: name === "my_staff_role" ? h.role : null, error: null }),
  }),
}));

const { requireStaff } = await import("@/server/auth");

const active = { id: "u1", display_name: "Mod", account_status: "active", onboarding_completed_at: "2026-01-01", is_visible: true };

describe("requireStaff", () => {
  it("answers anonymous visitors with a 404, not a login redirect", async () => {
    h.claims = null;
    h.profile = null;
    h.role = null;
    await expect(requireStaff()).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("answers regular users with the same 404", async () => {
    h.claims = { sub: "u1" };
    h.profile = active;
    h.role = null;
    await expect(requireStaff()).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("answers suspended and banned staff with the same 404", async () => {
    h.claims = { sub: "u1" };
    h.profile = { ...active, account_status: "suspended" };
    h.role = "admin";
    await expect(requireStaff()).rejects.toThrow("NEXT_NOT_FOUND");
    h.profile = { ...active, account_status: "banned" };
    await expect(requireStaff()).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("lets an active moderator through with their role", async () => {
    h.claims = { sub: "u1" };
    h.profile = active;
    h.role = "moderator";
    const staff = await requireStaff();
    expect(staff.role).toBe("moderator");
    expect(staff.userId).toBe("u1");
  });
});
