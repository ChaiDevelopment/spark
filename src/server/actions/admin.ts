"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { fail, friendlyError, ok, type ActionResult } from "@/lib/errors";
import { adminPhotoSchema, adminReportSchema, adminRoleSchema, adminSuspendSchema } from "@/lib/validation/schemas";
import { getStaffRole } from "@/server/auth";

/**
 * Admin actions call SECURITY DEFINER functions that re-check the caller's
 * role in the database and write the audit log in the same transaction.
 * The getStaffRole() check here is only for a clean error message.
 */
async function staffClient() {
  const role = await getStaffRole();
  if (!role) return null;
  return { role, supabase: await createClient() };
}

export async function reviewPhotoAction(input: unknown): Promise<ActionResult<null>> {
  const ctx = await staffClient();
  if (!ctx) return fail("Not authorized.");
  const parsed = adminPhotoSchema.safeParse(input);
  if (!parsed.success) return fail("Invalid request.");
  const { error } = await ctx.supabase.rpc("admin_review_photo", {
    p_photo: parsed.data.photoId,
    p_approve: parsed.data.approve,
    p_reason: parsed.data.reason ?? null,
  });
  if (error) return fail(friendlyError(error));
  revalidatePath("/admin/moderation");
  return ok(null);
}

export async function updateReportAction(input: unknown): Promise<ActionResult<null>> {
  const ctx = await staffClient();
  if (!ctx) return fail("Not authorized.");
  const parsed = adminReportSchema.safeParse(input);
  if (!parsed.success) return fail("Invalid request.");
  const { error } = await ctx.supabase.rpc("admin_update_report", {
    p_report: parsed.data.reportId,
    p_status: parsed.data.status,
    p_notes: parsed.data.notes ?? null,
  });
  if (error) return fail(friendlyError(error));
  revalidatePath("/admin/moderation");
  return ok(null);
}

export async function setSuspensionAction(input: unknown): Promise<ActionResult<null>> {
  const ctx = await staffClient();
  if (!ctx) return fail("Not authorized.");
  const parsed = adminSuspendSchema.safeParse(input);
  if (!parsed.success) return fail("Invalid request.");
  const { error } = await ctx.supabase.rpc("admin_set_suspension", {
    p_user: parsed.data.userId,
    p_suspend: parsed.data.suspend,
    p_reason: parsed.data.reason ?? null,
  });
  if (error) return fail(friendlyError(error));
  revalidatePath("/admin");
  return ok(null);
}

export async function setRoleAction(input: unknown): Promise<ActionResult<null>> {
  const ctx = await staffClient();
  if (!ctx || ctx.role !== "admin") return fail("Only admins can change roles.");
  const parsed = adminRoleSchema.safeParse(input);
  if (!parsed.success) return fail("Invalid request.");
  const { error } = await ctx.supabase.rpc("admin_set_role", { p_user: parsed.data.userId, p_role: parsed.data.role });
  if (error) return fail(friendlyError(error));
  revalidatePath("/admin");
  return ok(null);
}
