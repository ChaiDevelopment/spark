"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { fail, friendlyError, ok, type ActionResult } from "@/lib/errors";
import { PHOTO_REJECT_REASONS } from "@/lib/constants";
import {
  adminBulkPhotoSchema,
  adminModerateSchema,
  adminPhotoSchema,
  adminReportStatusSchema,
  adminResolveSchema,
  adminRoleSchema,
} from "@/lib/validation/schemas";
import { getStaffRole } from "@/server/auth";

/**
 * Every action re-checks the caller's role on the server (getStaffRole), and
 * every RPC re-checks it again in the database (private.require_staff). The
 * audit log is written inside the same transaction as each decision.
 */
const NOT_AUTHORIZED = "You don't have permission to do that.";

async function staffClient() {
  const role = await getStaffRole();
  if (!role) return null;
  return { role, supabase: await createClient() };
}

/** Human label + optional note, stored as the photo's rejection reason. */
function photoReason(code: string | undefined, note: string | undefined): string | undefined {
  if (!code) return undefined;
  const label = PHOTO_REJECT_REASONS.find((r) => r.value === code)?.label ?? "Community guidelines";
  return note ? `${label}: ${note}` : label;
}

const PHOTO_PATHS = ["/admin/photos", "/admin"];
const USER_PATHS = ["/admin/users", "/admin/reports", "/admin"];

// ------------------------------------------------------------------ Photos

export async function reviewPhotoAction(input: unknown): Promise<ActionResult<null>> {
  const ctx = await staffClient();
  if (!ctx) return fail(NOT_AUTHORIZED);
  const parsed = adminPhotoSchema.safeParse(input);
  if (!parsed.success) return fail("Invalid request.");
  if (!parsed.data.approve && !parsed.data.reasonCode) return fail("Choose a reason for rejecting this photo.");
  const { error } = await ctx.supabase.rpc("admin_review_photo", {
    p_photo: parsed.data.photoId,
    p_approve: parsed.data.approve,
    p_reason: parsed.data.approve ? null : photoReason(parsed.data.reasonCode, parsed.data.note) ?? null,
  });
  if (error) return fail(friendlyError(error));
  for (const path of PHOTO_PATHS) revalidatePath(path);
  return ok(null);
}

/**
 * Approve or reject many photos. Each decision is its own audited transaction;
 * photos another moderator already handled are counted as "skipped", not errors.
 */
export async function bulkReviewPhotosAction(input: unknown): Promise<ActionResult<{ done: number; skipped: number; failed: number }>> {
  const ctx = await staffClient();
  if (!ctx) return fail(NOT_AUTHORIZED);
  const parsed = adminBulkPhotoSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid request.");
  if (!parsed.data.approve && !parsed.data.reasonCode) return fail("Choose a reason for rejecting these photos.");
  const reason = photoReason(parsed.data.reasonCode, parsed.data.note) ?? null;

  let done = 0;
  let skipped = 0;
  let failed = 0;
  for (const photoId of parsed.data.photoIds) {
    const { error } = await ctx.supabase.rpc("admin_review_photo", {
      p_photo: photoId,
      p_approve: parsed.data.approve,
      p_reason: parsed.data.approve ? null : reason,
    });
    if (!error) done++;
    else if (error.code === "P0003" || error.code === "P0002") skipped++;
    else failed++;
  }
  for (const path of PHOTO_PATHS) revalidatePath(path);
  return ok({ done, skipped, failed });
}

// ----------------------------------------------------------------- Reports

/** Resolve one report: dismiss, or warn / suspend / ban, optionally removing photos. */
export async function resolveReportAction(input: unknown): Promise<ActionResult<null>> {
  const ctx = await staffClient();
  if (!ctx) return fail(NOT_AUTHORIZED);
  const parsed = adminResolveSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid request.");
  const d = parsed.data;
  if (d.outcome !== "dismiss" && !d.reason) return fail("Write a reason so the user and the audit log know why.");
  if (d.outcome === "suspend" && !d.days) return fail("Choose how long the suspension lasts.");
  if (d.outcome === "dismiss" && d.removePhotos) return fail("A dismissed report can't remove photos.");

  const { error } = await ctx.supabase.rpc("admin_resolve_report", {
    p_report: d.reportId,
    p_outcome: d.outcome,
    p_reason: d.reason ?? null,
    p_days: d.outcome === "suspend" ? d.days : null,
    p_remove_photos: d.removePhotos,
  });
  if (error) return fail(friendlyError(error, "Couldn't resolve this report."));
  for (const path of USER_PATHS) revalidatePath(path);
  return ok(null);
}

/** Mark a report as being looked at (keeps it in the queue). */
export async function updateReportAction(input: unknown): Promise<ActionResult<null>> {
  const ctx = await staffClient();
  if (!ctx) return fail(NOT_AUTHORIZED);
  const parsed = adminReportStatusSchema.safeParse(input);
  if (!parsed.success) return fail("Invalid request.");
  const { error } = await ctx.supabase.rpc("admin_update_report", { p_report: parsed.data.reportId, p_status: "in_review", p_notes: null });
  if (error) return fail(friendlyError(error));
  revalidatePath("/admin/reports");
  return ok(null);
}

// ------------------------------------------------------------------ Users

/** Warn, suspend (with an end date), ban, or restore an account. */
export async function moderateUserAction(input: unknown): Promise<ActionResult<null>> {
  const ctx = await staffClient();
  if (!ctx) return fail(NOT_AUTHORIZED);
  const parsed = adminModerateSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid request.");
  const d = parsed.data;
  if (d.action !== "unsuspend" && !d.reason) return fail("Write a reason so the user and the audit log know why.");
  if (d.action === "suspend" && !d.days) return fail("Choose how long the suspension lasts.");

  const { error } = await ctx.supabase.rpc("admin_moderate_user", {
    p_user: d.userId,
    p_action: d.action,
    p_reason: d.reason ?? null,
    p_days: d.action === "suspend" ? d.days : null,
  });
  if (error) return fail(friendlyError(error));
  revalidatePath("/admin/users");
  revalidatePath(`/admin/users/${d.userId}`);
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
  revalidatePath("/admin/users");
  return ok(null);
}
