/**
 * Moderation panel: role boundaries, idempotent decisions, suspension and ban
 * effects, staff-only message access, and the append-only audit log.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { asService, asUser, createReadyUser, createTestDb, createUser, rejects, type Db } from "./harness";

let db: Db;
let alice: string; // regular user: must be refused everywhere below
let modA: string; // moderator

const NIL = "00000000-0000-4000-8000-000000000000";

beforeAll(async () => {
  db = await createTestDb();
  alice = await createReadyUser(db, { name: "Alice", gender: "woman", interestedIn: ["man"] });
  modA = await createUser(db, { name: "Moderator A" });
  await asService(db, (q) => q(`insert into public.admin_users (user_id, role) values ($1, 'moderator')`, [modA]));
});

async function newStaff(role: "moderator" | "admin"): Promise<string> {
  const id = await createUser(db, { name: `${role} staff` });
  await asService(db, (q) => q(`insert into public.admin_users (user_id, role) values ($1, $2)`, [id, role]));
  return id;
}

async function pendingPhoto(userId: string, position: number): Promise<string> {
  const [row] = await asService(db, (q) =>
    q<{ id: string }>(
      `insert into public.profile_photos (user_id, staging_key, object_key, thumb_key, status, position)
       values ($1::uuid, 'uploads/' || $1::text || '/p' || $2::text,
               'profiles/' || $1::text || '/p' || $2::text || '.webp',
               'profiles/' || $1::text || '/p' || $2::text || '_t.webp', 'pending', $3)
       returning id`,
      [userId, String(position), position],
    ),
  );
  return row.id;
}

async function statusOf(userId: string): Promise<string> {
  const [p] = await asService(db, (q) => q<{ account_status: string }>(`select account_status from public.profiles where id = $1`, [userId]));
  return p.account_status;
}

async function discoveryIds(viewer: string): Promise<string[]> {
  const rows = await asUser(db, viewer, (q) => q<{ id: string }>(`select id from public.get_discovery_candidates(50)`));
  return rows.map((r) => r.id);
}

async function matchedConversation(a: string, b: string): Promise<string> {
  await asUser(db, a, (q) => q(`select public.like_user($1)`, [b]));
  await asUser(db, b, (q) => q(`select public.like_user($1)`, [a]));
  const [conv] = await asUser(db, a, (q) => q<{ conversation_id: string }>(`select conversation_id from public.list_conversations()`));
  return conv.conversation_id;
}

describe("photo review", () => {
  it("a photo can be reviewed only once, and rejecting needs a reason", async () => {
    const owner = await createReadyUser(db, { name: "Owner A", gender: "man", interestedIn: ["woman"] });
    const photo = await pendingPhoto(owner, 1);
    expect(await rejects(asUser(db, modA, (q) => q(`select public.admin_review_photo($1, false, '')`, [photo])))).toMatch(/reason is required/);
    await asUser(db, modA, (q) => q(`select public.admin_review_photo($1, true, null)`, [photo]));
    const [row] = await asService(db, (q) => q<{ status: string }>(`select status from public.profile_photos where id = $1`, [photo]));
    expect(row.status).toBe("approved");
    expect(await rejects(asUser(db, modA, (q) => q(`select public.admin_review_photo($1, false, 'Face not visible')`, [photo])))).toMatch(
      /already reviewed/,
    );
  });

  it("removing a live photo rejects it, notifies the owner, and is audited", async () => {
    const owner = await createReadyUser(db, { name: "Owner B", gender: "man", interestedIn: ["woman"] });
    const [live] = await asService(db, (q) =>
      q<{ id: string }>(`select id from public.profile_photos where user_id = $1 and status = 'approved'`, [owner]),
    );
    await asUser(db, modA, (q) => q(`select public.admin_remove_photo($1, 'Not a photo of you')`, [live.id]));
    const [row] = await asService(db, (q) => q<{ status: string }>(`select status from public.profile_photos where id = $1`, [live.id]));
    expect(row.status).toBe("rejected");
    const notes = await asService(db, (q) => q<{ title: string }>(`select title from public.notifications where user_id = $1`, [owner]));
    expect(notes.map((n) => n.title)).toContain("A photo was removed");
    const audit = await asService(db, (q) => q(`select 1 from public.admin_audit_logs where action = 'photo.remove' and target_id = $1`, [live.id]));
    expect(audit).toHaveLength(1);
    expect(await rejects(asUser(db, modA, (q) => q(`select public.admin_remove_photo($1, 'again')`, [live.id])))).toMatch(/already reviewed/);
  });
});

describe("role boundaries", () => {
  it("non-staff are refused by every moderation function", async () => {
    const target = await createReadyUser(db, { name: "Target C", gender: "man", interestedIn: ["woman"] });
    for (const sql of [
      `select public.admin_moderate_user('${target}', 'warn', 'x')`,
      `select public.admin_resolve_report('${NIL}', 'dismiss')`,
      `select * from public.admin_profiles(array['${target}']::uuid[])`,
      `select * from public.admin_reported_message('${NIL}')`,
      `select public.admin_remove_photo('${NIL}', 'x')`,
    ]) {
      expect(await rejects(asUser(db, alice, (q) => q(sql)))).toMatch(/Not authorized/);
    }
  });

  it("anonymous visitors get no access at all", async () => {
    const target = await createReadyUser(db, { name: "Target C2", gender: "man", interestedIn: ["woman"] });
    expect(await rejects(asUser(db, null, (q) => q(`select * from public.admin_profiles(array['${target}']::uuid[])`)))).toMatch(
      /permission denied/,
    );
  });

  it("staff summaries show age and status, never the date of birth", async () => {
    const t = await createReadyUser(db, { name: "Summary", gender: "man", interestedIn: ["woman"], dob: "1990-01-15" });
    const [row] = await asUser(db, modA, (q) => q<{ age: number }>(`select * from public.admin_profiles(array[$1]::uuid[])`, [t]));
    expect(row.age).toBeGreaterThan(30);
    expect(Object.keys(row)).not.toContain("date_of_birth");
  });

  it("moderators must give a reason and a valid duration, and cannot act on themselves", async () => {
    const target = await createReadyUser(db, { name: "Target D", gender: "man", interestedIn: ["woman"] });
    expect(await rejects(asUser(db, modA, (q) => q(`select public.admin_moderate_user($1, 'warn', '  ')`, [target])))).toMatch(/reason is required/);
    expect(await rejects(asUser(db, modA, (q) => q(`select public.admin_moderate_user($1, 'suspend', 'spam', 0)`, [target])))).toMatch(
      /between 1 and 365/,
    );
    expect(await rejects(asUser(db, modA, (q) => q(`select public.admin_moderate_user($1, 'suspend', 'spam', 400)`, [target])))).toMatch(
      /between 1 and 365/,
    );
    expect(await rejects(asUser(db, modA, (q) => q(`select public.admin_moderate_user(auth.uid(), 'warn', 'self')`)))).toMatch(
      /your own account/,
    );
  });

  it("moderators cannot moderate admins; admins can", async () => {
    const admin = await newStaff("admin");
    expect(await rejects(asUser(db, modA, (q) => q(`select public.admin_moderate_user($1, 'warn', 'hi')`, [admin])))).toMatch(/Only admins/);
    await asUser(db, admin, (q) => q(`select public.admin_moderate_user($1, 'warn', 'hi')`, [modA]));
  });
});

describe("suspension and ban effects", () => {
  it("a suspension hides the user from discovery until it ends, then restores them", async () => {
    const viewer = await createReadyUser(db, { name: "Viewer F1", gender: "woman", interestedIn: ["man"] });
    const subject = await createReadyUser(db, { name: "Subject F1", gender: "man", interestedIn: ["woman"] });
    expect(await discoveryIds(viewer)).toContain(subject);
    await asUser(db, modA, (q) => q(`select public.admin_moderate_user($1, 'suspend', 'Spam in profile text', 7)`, [subject]));
    expect(await statusOf(subject)).toBe("suspended");
    expect(await discoveryIds(viewer)).not.toContain(subject);
    // The suspension period ends: the daily maintenance job restores the account.
    await db.query(`update public.profiles set suspended_until = now() - interval '1 minute' where id = $1`, [subject]);
    await asService(db, (q) => q(`select public.run_maintenance()`));
    expect(await statusOf(subject)).toBe("active");
    expect(await discoveryIds(viewer)).toContain(subject);
  });

  it("a suspended user's conversations disappear, and they cannot send messages", async () => {
    const woman = await createReadyUser(db, { name: "Viewer C2", gender: "woman", interestedIn: ["man"] });
    const man = await createReadyUser(db, { name: "Subject C2", gender: "man", interestedIn: ["woman"] });
    const conv = await matchedConversation(woman, man);
    await asUser(db, woman, (q) => q(`select public.send_message($1, 'Hi there!')`, [conv]));
    await asUser(db, modA, (q) => q(`select public.admin_moderate_user($1, 'suspend', 'Harassment', 3)`, [man]));
    const visible = await asUser(db, woman, (q) => q(`select conversation_id from public.list_conversations()`));
    expect(visible).toHaveLength(0);
    expect(await rejects(asUser(db, man, (q) => q(`select public.send_message($1, 'hello')`, [conv])))).toMatch(/cannot send messages/);
    expect(await rejects(asUser(db, woman, (q) => q(`select public.send_message($1, 'hello again')`, [conv])))).toMatch(/has ended/);
  });

  it("a ban is permanent: idempotent, cannot be downgraded, and an admin can restore it", async () => {
    const target = await createReadyUser(db, { name: "Target G", gender: "man", interestedIn: ["woman"] });
    await asUser(db, modA, (q) => q(`select public.admin_moderate_user($1, 'ban', 'Scam: asks for money')`, [target]));
    expect(await statusOf(target)).toBe("banned");
    await asUser(db, modA, (q) => q(`select public.admin_moderate_user($1, 'ban', 'Scam: asks for money')`, [target]));
    expect(await rejects(asUser(db, modA, (q) => q(`select public.admin_moderate_user($1, 'suspend', 'x', 7)`, [target])))).toMatch(/banned/);
    // A moderator cannot lift a ban; an admin can.
    expect(await rejects(asUser(db, modA, (q) => q(`select public.admin_moderate_user($1, 'unsuspend', 'Appeal accepted')`, [target])))).toMatch(
      /Only admins can restore/,
    );
    expect(await statusOf(target)).toBe("banned");
    const admin = await newStaff("admin");
    await asUser(db, admin, (q) => q(`select public.admin_moderate_user($1, 'unsuspend', 'Appeal accepted')`, [target]));
    expect(await statusOf(target)).toBe("active");
  });
});

describe("reports", () => {
  it("a report is resolved once, so a second moderator cannot double-sanction", async () => {
    const reporter = await createReadyUser(db, { name: "Reporter H", gender: "woman", interestedIn: ["man"] });
    const target = await createReadyUser(db, { name: "Target H", gender: "man", interestedIn: ["woman"] });
    await asUser(db, reporter, (q) => q(`select public.report_user($1, 'spam', 'Repeated ads')`, [target]));
    const [report] = await asService(db, (q) => q<{ id: string }>(`select id from public.user_reports where reported_user_ref = $1`, [target]));
    await asUser(db, modA, (q) => q(`select public.admin_resolve_report($1, 'warn', 'Ads in bio')`, [report.id]));
    expect(await rejects(asUser(db, modA, (q) => q(`select public.admin_resolve_report($1, 'ban', 'Ads in bio')`, [report.id])))).toMatch(
      /already handled/,
    );
    expect(await statusOf(target)).toBe("active");
    const warns = await asService(db, (q) =>
      q(`select id from public.notifications where user_id = $1 and title = 'A warning about your account'`, [target]),
    );
    expect(warns).toHaveLength(1);
    const [r] = await asService(db, (q) => q<{ status: string }>(`select status from public.user_reports where id = $1`, [report.id]));
    expect(r.status).toBe("actioned");
  });

  it("resolving can remove the reported user's photos; a dismissed report cannot", async () => {
    const reporter = await createReadyUser(db, { name: "Reporter I", gender: "woman", interestedIn: ["man"] });
    const target = await createReadyUser(db, { name: "Target I", gender: "man", interestedIn: ["woman"] });
    await asUser(db, reporter, (q) => q(`select public.report_user($1, 'fake_profile', 'Not me')`, [target]));
    const [report] = await asService(db, (q) => q<{ id: string }>(`select id from public.user_reports where reported_user_ref = $1`, [target]));
    await asUser(db, modA, (q) => q(`select public.admin_resolve_report($1, 'warn', 'Photos are not them', null, true)`, [report.id]));
    const photos = await asService(db, (q) => q<{ status: string }>(`select status from public.profile_photos where user_id = $1`, [target]));
    expect(photos.length).toBeGreaterThan(0);
    expect(photos.every((p) => p.status === "rejected")).toBe(true);

    const other = await createReadyUser(db, { name: "Target I2", gender: "man", interestedIn: ["woman"] });
    await asUser(db, reporter, (q) => q(`select public.report_user($1, 'spam', 'Ads')`, [other]));
    const [report2] = await asService(db, (q) => q<{ id: string }>(`select id from public.user_reports where reported_user_ref = $1`, [other]));
    expect(await rejects(asUser(db, modA, (q) => q(`select public.admin_resolve_report($1, 'dismiss', null, null, true)`, [report2.id])))).toMatch(
      /cannot remove photos/,
    );
    await asUser(db, modA, (q) => q(`select public.admin_resolve_report($1, 'dismiss', 'Not spam')`, [report2.id]));
    expect(await statusOf(other)).toBe("active");
    const [r2] = await asService(db, (q) => q<{ status: string }>(`select status from public.user_reports where id = $1`, [report2.id]));
    expect(r2.status).toBe("dismissed");
  });

  it("a reported message is visible to staff only when a report points at it, and each view is audited", async () => {
    const woman = await createReadyUser(db, { name: "Viewer J", gender: "woman", interestedIn: ["man"] });
    const man = await createReadyUser(db, { name: "Subject J", gender: "man", interestedIn: ["woman"] });
    const conv = await matchedConversation(woman, man);
    const [sent] = await asUser(db, man, (q) => q<{ id: string }>(`select id from public.send_message($1, 'Send me money on crypto')`, [conv]));

    expect(await rejects(asUser(db, modA, (q) => q(`select * from public.admin_reported_message($1)`, [sent.id])))).toMatch(/Message not found/);
    await asUser(db, woman, (q) => q(`select public.report_user($1, 'scam', '', 'message', $2)`, [man, sent.id]));
    const [msg] = await asUser(db, modA, (q) => q<{ body: string }>(`select body from public.admin_reported_message($1)`, [sent.id]));
    expect(msg.body).toContain("crypto");
    expect(await rejects(asUser(db, woman, (q) => q(`select * from public.admin_reported_message($1)`, [sent.id])))).toMatch(/Not authorized/);
    const views = await asService(db, (q) =>
      q(`select 1 from public.admin_audit_logs where action = 'message.view_reported' and target_id = $1`, [sent.id]),
    );
    expect(views).toHaveLength(1);
  });
});

describe("audit log", () => {
  it("is append-only: no update or delete, even with the service role", async () => {
    await asUser(db, modA, (q) => q(`select public.admin_moderate_user($1, 'warn', 'Audit check')`, [alice]));
    const [row] = await asService(db, (q) => q<{ id: string }>(`select id from public.admin_audit_logs limit 1`));
    expect(await rejects(asService(db, (q) => q(`update public.admin_audit_logs set action = 'tampered' where id = $1`, [row.id])))).toMatch(
      /append-only/,
    );
    expect(await rejects(asService(db, (q) => q(`delete from public.admin_audit_logs where id = $1`, [row.id])))).toMatch(/append-only/);
  });
});
