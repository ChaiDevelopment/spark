import { beforeEach, describe, expect, it, vi } from "vitest";

// Role checks in every moderation action. The database re-checks each call
// (tests/db/moderation.test.ts); this file proves the server refuses before it
// ever asks the database to act.

const h = vi.hoisted(() => ({ role: null as null | "admin" | "moderator" }));
const rpc = vi.hoisted(() => vi.fn(async () => ({ data: null, error: null })));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/server/auth", () => ({ getStaffRole: vi.fn(async () => h.role) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(async () => ({ rpc })) }));

const actions = await import("@/server/actions/admin");

const PHOTO = "11111111-1111-4111-8111-111111111111";
const USER = "22222222-2222-4222-8222-222222222222";
const REPORT = "33333333-3333-4333-8333-333333333333";

const calls: [string, () => Promise<{ ok: boolean; error?: string }>][] = [
  ["reviewPhotoAction", () => actions.reviewPhotoAction({ photoId: PHOTO, approve: true })],
  ["bulkReviewPhotosAction", () => actions.bulkReviewPhotosAction({ photoIds: [PHOTO], approve: true })],
  ["resolveReportAction", () => actions.resolveReportAction({ reportId: REPORT, outcome: "dismiss", removePhotos: false })],
  ["updateReportAction", () => actions.updateReportAction({ reportId: REPORT, status: "in_review" })],
  ["moderateUserAction", () => actions.moderateUserAction({ userId: USER, action: "warn", reason: "Be kind" })],
  ["setRoleAction", () => actions.setRoleAction({ userId: USER, role: "moderator" })],
];

beforeEach(() => {
  rpc.mockClear();
  h.role = null;
});

describe("moderation actions refuse non-staff", () => {
  for (const [name, call] of calls) {
    it(`${name} refuses anonymous visitors and regular users without calling the database`, async () => {
      h.role = null;
      const res = await call();
      expect(res.ok).toBe(false);
      expect(rpc).not.toHaveBeenCalled();
    });
  }
});

describe("moderation actions for staff", () => {
  it("a moderator's warning reaches the database as a moderation RPC with the reason", async () => {
    h.role = "moderator";
    const res = await actions.moderateUserAction({ userId: USER, action: "warn", reason: "Be kind" });
    expect(res.ok).toBe(true);
    expect(rpc).toHaveBeenCalledWith("admin_moderate_user", { p_user: USER, p_action: "warn", p_reason: "Be kind", p_days: null });
  });

  it("a suspension passes the chosen length to the database", async () => {
    h.role = "moderator";
    await actions.moderateUserAction({ userId: USER, action: "suspend", reason: "Spam", days: 7 });
    expect(rpc).toHaveBeenCalledWith("admin_moderate_user", { p_user: USER, p_action: "suspend", p_reason: "Spam", p_days: 7 });
  });

  it("a moderator cannot change roles, even though the other actions are open to them", async () => {
    h.role = "moderator";
    const res = await actions.setRoleAction({ userId: USER, role: "admin" });
    expect(res).toEqual({ ok: false, error: "Only admins can change roles." });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejecting a photo requires a reason code", async () => {
    h.role = "moderator";
    const res = await actions.reviewPhotoAction({ photoId: PHOTO, approve: false });
    expect(res.ok).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("a reason label is stored with the rejection, with the moderator's note appended", async () => {
    h.role = "moderator";
    await actions.reviewPhotoAction({ photoId: PHOTO, approve: false, reasonCode: "face_not_visible", note: "Too dark" });
    expect(rpc).toHaveBeenCalledWith("admin_review_photo", {
      p_photo: PHOTO,
      p_approve: false,
      p_reason: "Face isn't clearly visible: Too dark",
    });
  });

  it("suspensions and warnings need a reason and a length", async () => {
    h.role = "moderator";
    expect((await actions.moderateUserAction({ userId: USER, action: "ban" })).ok).toBe(false);
    expect((await actions.moderateUserAction({ userId: USER, action: "suspend", reason: "x" })).ok).toBe(false);
    expect((await actions.resolveReportAction({ reportId: REPORT, outcome: "suspend", reason: "x" })).ok).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("a dismissed report cannot also remove photos", async () => {
    h.role = "moderator";
    const res = await actions.resolveReportAction({ reportId: REPORT, outcome: "dismiss", removePhotos: true });
    expect(res.ok).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("bulk review counts photos another moderator already handled as skipped, not failed", async () => {
    h.role = "moderator";
    rpc.mockResolvedValueOnce({ data: null, error: null });
    rpc.mockResolvedValueOnce({ data: null, error: { code: "P0003", message: "This photo was already reviewed" } } as never);
    const res = await actions.bulkReviewPhotosAction({
      photoIds: [PHOTO, "44444444-4444-4444-8444-444444444444"],
      approve: true,
    });
    expect(res).toEqual({ ok: true, data: { done: 1, skipped: 1, failed: 0 } });
  });
});
