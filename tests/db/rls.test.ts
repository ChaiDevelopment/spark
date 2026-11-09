/**
 * Authorization tests against the real migrations, with multiple users.
 * Each test describes an attack or boundary from the security requirements.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { asService, asUser, createReadyUser, createTestDb, createUser, rejects, type Db } from "./harness";

let db: Db;
let alice: string; // woman → men
let bob: string; // man → women
let carol: string; // woman → men (third party)
let dave: string; // man → men (incompatible with alice)

beforeAll(async () => {
  db = await createTestDb();
  alice = await createReadyUser(db, { name: "Alice", gender: "woman", interestedIn: ["man"] });
  bob = await createReadyUser(db, { name: "Bob", gender: "man", interestedIn: ["woman"] });
  carol = await createReadyUser(db, { name: "Carol", gender: "woman", interestedIn: ["man"] });
  dave = await createReadyUser(db, { name: "Dave", gender: "man", interestedIn: ["man"] });
});

describe("profiles & private data", () => {
  it("anonymous visitors cannot read any profile", async () => {
    const msg = await rejects(asUser(db, null, (q) => q(`select * from public.profiles`)));
    expect(msg).toMatch(/permission denied/);
  });

  it("a fresh (not onboarded) user is invisible to others", async () => {
    const newbie = await createUser(db, { name: "Newbie" });
    const rows = await asUser(db, alice, (q) => q(`select id from public.profiles where id = $1`, [newbie]));
    expect(rows).toHaveLength(0);
  });

  it("date of birth is readable only by its owner", async () => {
    const own = await asUser(db, alice, (q) => q(`select * from public.profile_private`));
    expect(own).toHaveLength(1);
    const other = await asUser(db, bob, (q) => q(`select * from public.profile_private where user_id = $1`, [alice]));
    expect(other).toHaveLength(0);
  });

  it("users cannot change protected columns (status, onboarding, completion)", async () => {
    for (const col of ["account_status = 'active'", "onboarding_completed_at = now()", "completion_percent = 100"]) {
      const msg = await rejects(asUser(db, alice, (q) => q(`update public.profiles set ${col} where id = auth.uid()`)));
      expect(msg).toMatch(/permission denied/);
    }
  });

  it("users cannot update someone else's profile", async () => {
    await asUser(db, alice, (q) => q(`update public.profiles set bio = 'hacked' where id = $1`, [bob]));
    const [row] = await asService(db, (q) => q<{ bio: string }>(`select bio from public.profiles where id = $1`, [bob]));
    expect(row.bio).not.toBe("hacked");
  });

  it("minors are rejected by the database and DOB cannot be re-set", async () => {
    const teen = await createUser(db);
    const d = new Date();
    d.setFullYear(d.getFullYear() - 17);
    const msg = await rejects(asUser(db, teen, (q) => q(`select public.set_date_of_birth($1::date)`, [d.toISOString().slice(0, 10)])));
    expect(msg).toMatch(/at least 18/);
    const again = await rejects(asUser(db, alice, (q) => q(`select public.set_date_of_birth('1990-01-01')`)));
    expect(again).toMatch(/already set/);
  });

  it("profile completion is calculated server-side", async () => {
    const [row] = await asUser(db, alice, (q) => q<{ completion_percent: number }>(`select completion_percent from public.profiles where id = auth.uid()`));
    // name, gender, DOB, city, bio, 1 photo, 3 interests = 75 (no goal, <3 photos, no chemistry)
    expect(row.completion_percent).toBe(75);
  });
});

describe("discovery", () => {
  it("returns mutually compatible users only, with age but never DOB", async () => {
    const rows = await asUser(db, alice, (q) => q<{ id: string; age: number }>(`select * from public.get_discovery_candidates(20)`));
    const ids = rows.map((r) => r.id);
    expect(ids).toContain(bob);
    expect(ids).not.toContain(dave); // dave is not interested in women
    expect(ids).not.toContain(carol); // alice is not interested in women
    expect(ids).not.toContain(alice);
    expect(rows[0]).not.toHaveProperty("date_of_birth");
    expect(rows.find((r) => r.id === bob)?.age).toBeGreaterThanOrEqual(18);
  });

  it("respects age preferences in both directions", async () => {
    const young = await createReadyUser(db, { name: "Young", gender: "man", interestedIn: ["woman"], dob: "2004-01-01", minAge: 18, maxAge: 25 });
    const rows = await asUser(db, alice, (q) => q<{ id: string }>(`select id from public.get_discovery_candidates(50)`));
    expect(rows.map((r) => r.id)).not.toContain(young); // alice (born 1996) is outside young's max_age
  });

  it("respects location scope", async () => {
    const local = await createReadyUser(db, { name: "Local", gender: "man", interestedIn: ["woman"], city: "Bandung", region: "Jawa Barat", scope: "city" });
    const rows = await asUser(db, alice, (q) => q<{ id: string }>(`select id from public.get_discovery_candidates(50)`));
    expect(rows.map((r) => r.id)).not.toContain(local); // local only wants people in Bandung
  });

  it("does not let users write discovery state or usage directly", async () => {
    for (const sql of [
      `insert into public.likes (liker_id, likee_id) values ('${alice}', '${bob}')`,
      `insert into public.passes (passer_id, passee_id) values ('${alice}', '${bob}')`,
      `insert into public.daily_usage_limits (user_id, usage_date) values ('${alice}', current_date)`,
      `update public.daily_usage_limits set likes_used = 0`,
      `insert into public.matches (user_low, user_high) values ('${alice < bob ? alice : bob}', '${alice < bob ? bob : alice}')`,
    ]) {
      expect(await rejects(asUser(db, alice, (q) => q(sql)))).toMatch(/permission denied/);
    }
  });
});

describe("likes & matching", () => {
  it("rejects self-likes and likes on incompatible users", async () => {
    expect(await rejects(asUser(db, alice, (q) => q(`select public.like_user($1)`, [alice])))).toMatch(/yourself/);
    expect(await rejects(asUser(db, alice, (q) => q(`select public.like_user($1)`, [dave])))).toMatch(/no longer available/);
  });

  it("mutual likes create exactly one match and one conversation, idempotently", async () => {
    const [first] = await asUser(db, alice, (q) => q<{ r: { matched: boolean } }>(`select public.like_user($1) as r`, [bob]));
    expect(first.r.matched).toBe(false);
    // duplicate like is idempotent and does not consume another like
    const [dup] = await asUser(db, alice, (q) => q<{ r: { already_liked: boolean } }>(`select public.like_user($1) as r`, [bob]));
    expect(dup.r.already_liked).toBe(true);
    const [usage] = await asUser(db, alice, (q) => q<{ u: { likes_used: number } }>(`select public.get_usage() as u`));
    expect(usage.u.likes_used).toBe(1);

    const [second] = await asUser(db, bob, (q) =>
      q<{ r: { matched: boolean; new_match: boolean; conversation_id: string } }>(`select public.like_user($1) as r`, [alice]),
    );
    expect(second.r).toMatchObject({ matched: true, new_match: true });
    expect(second.r.conversation_id).toBeTruthy();

    // Repeat from both sides: still one match.
    await asUser(db, bob, (q) => q(`select public.like_user($1)`, [alice]));
    await asUser(db, alice, (q) => q(`select public.like_user($1)`, [bob]));
    const [{ n }] = await asService(db, (q) => q<{ n: number }>(`select count(*)::int n from public.matches`));
    const [{ c }] = await asService(db, (q) => q<{ c: number }>(`select count(*)::int c from public.conversations`));
    expect(n).toBe(1);
    expect(c).toBe(1);

    // Both get a match notification
    const notes = await asUser(db, bob, (q) => q<{ type: string }>(`select type from public.notifications where type = 'new_match'`));
    expect(notes).toHaveLength(1);
  });

  it("only participants can read a match", async () => {
    expect(await asUser(db, alice, (q) => q(`select * from public.matches`))).toHaveLength(1);
    expect(await asUser(db, carol, (q) => q(`select * from public.matches`))).toHaveLength(0);
  });

  it("a like does not reveal the liker's identity to free users", async () => {
    await asUser(db, carol, (q) => q(`select public.like_user($1)`, [bob]));
    const [likes] = await asUser(db, bob, (q) => q<{ r: { entitled: boolean; count: number; likes: unknown[] } }>(`select public.get_received_likes() as r`));
    expect(likes.r).toMatchObject({ entitled: false, count: 1, likes: [] });
    // Bob cannot read Carol's like row directly either
    expect(await asUser(db, bob, (q) => q(`select * from public.likes where liker_id = $1`, [carol]))).toHaveLength(0);
  });

  it("enforces the daily like limit server-side via entitlements", async () => {
    const eve = await createReadyUser(db, { name: "Eve", gender: "woman", interestedIn: ["man"] });
    await asService(db, (q) =>
      q(`insert into public.subscription_entitlements (user_id, key, value, source) values ($1, 'daily_likes', '1', 'admin_grant')`, [eve]),
    );
    const m1 = await createReadyUser(db, { name: "M1", gender: "man", interestedIn: ["woman"] });
    const m2 = await createReadyUser(db, { name: "M2", gender: "man", interestedIn: ["woman"] });
    await asUser(db, eve, (q) => q(`select public.like_user($1)`, [m1]));
    expect(await rejects(asUser(db, eve, (q) => q(`select public.like_user($1)`, [m2])))).toMatch(/like limit/);
  });

  it("users cannot grant themselves entitlements or subscriptions", async () => {
    expect(
      await rejects(asUser(db, alice, (q) => q(`insert into public.subscription_entitlements (user_id, key, value, source) values (auth.uid(), 'see_likes', 'true', 'promo')`))),
    ).toMatch(/permission denied/);
    expect(await rejects(asUser(db, alice, (q) => q(`update public.subscription_plans set entitlements = '{"daily_likes": 9999}'`)))).toMatch(/permission denied/);
    expect(await rejects(asUser(db, alice, (q) => q(`select * from public.payment_events`)))).toMatch(/permission denied/);
  });
});

describe("chat", () => {
  let conversation: string;
  beforeAll(async () => {
    const [row] = await asService(db, (q) => q<{ id: string }>(`select id from public.conversations limit 1`));
    conversation = row.id;
  });

  it("members can send; sender is always the authenticated user", async () => {
    const [msg] = await asUser(db, alice, (q) => q<{ sender_id: string; body: string }>(`select * from public.send_message($1, $2)`, [conversation, "  Hi Bob! \u0007 "]));
    expect(msg.sender_id).toBe(alice);
    expect(msg.body).toBe("Hi Bob!");
  });

  it("idempotent sends with the same client id", async () => {
    const cid = "11111111-1111-4111-8111-111111111111";
    const [a] = await asUser(db, bob, (q) => q<{ id: string }>(`select * from public.send_message($1, 'hey', $2)`, [conversation, cid]));
    const [b] = await asUser(db, bob, (q) => q<{ id: string }>(`select * from public.send_message($1, 'hey', $2)`, [conversation, cid]));
    expect(a.id).toBe(b.id);
  });

  it("non-members cannot read or write the conversation", async () => {
    expect(await asUser(db, carol, (q) => q(`select * from public.messages where conversation_id = $1`, [conversation]))).toHaveLength(0);
    expect(await rejects(asUser(db, carol, (q) => q(`select public.send_message($1, 'intrusion')`, [conversation])))).toMatch(/not found/);
    expect(
      await rejects(asUser(db, carol, (q) => q(`insert into public.messages (conversation_id, sender_id, body) values ($1, $2, 'spoof')`, [conversation, alice]))),
    ).toMatch(/permission denied/);
  });

  it("members cannot insert messages directly (impersonation)", async () => {
    expect(
      await rejects(asUser(db, alice, (q) => q(`insert into public.messages (conversation_id, sender_id, body) values ($1, $2, 'as bob')`, [conversation, bob]))),
    ).toMatch(/permission denied/);
  });

  it("rejects empty and oversized messages", async () => {
    expect(await rejects(asUser(db, alice, (q) => q(`select public.send_message($1, '   ')`, [conversation])))).toMatch(/between 1 and 2000/);
    expect(await rejects(asUser(db, alice, (q) => q(`select public.send_message($1, $2)`, [conversation, "x".repeat(2001)])))).toMatch(/between 1 and 2000/);
  });

  it("rate-limits message bursts", async () => {
    const msg = await rejects(
      asUser(db, bob, async (q) => {
        for (let i = 0; i < 40; i++) await q(`select public.send_message($1, $2)`, [conversation, `spam ${i}`]);
      }),
    );
    expect(msg).toMatch(/too quickly/);
  });

  it("read receipts and unread counts work", async () => {
    const [before] = await asUser(db, alice, (q) => q<{ unread_count: number }>(`select * from public.list_conversations()`));
    expect(before.unread_count).toBeGreaterThan(0);
    await asUser(db, alice, (q) => q(`select public.mark_conversation_read($1)`, [conversation]));
    const [after] = await asUser(db, alice, (q) => q<{ unread_count: number }>(`select * from public.list_conversations()`));
    expect(after.unread_count).toBe(0);
  });
});

describe("safety", () => {
  it("blocking ends the match, hides profiles, and prevents re-matching", async () => {
    const frank = await createReadyUser(db, { name: "Frank", gender: "man", interestedIn: ["woman"] });
    await asUser(db, carol, (q) => q(`select public.like_user($1)`, [frank]));
    const [m] = await asUser(db, frank, (q) => q<{ r: { matched: boolean; conversation_id: string } }>(`select public.like_user($1) as r`, [carol]));
    expect(m.r.matched).toBe(true);

    await asUser(db, carol, (q) => q(`select public.block_user($1, 'not nice')`, [frank]));
    expect(await asUser(db, frank, (q) => q(`select id from public.profiles where id = $1`, [carol]))).toHaveLength(0);
    expect(await rejects(asUser(db, frank, (q) => q(`select public.send_message($1, 'hello?')`, [m.r.conversation_id])))).toMatch(/ended/);
    const cands = await asUser(db, frank, (q) => q<{ id: string }>(`select id from public.get_discovery_candidates(50)`));
    expect(cands.map((c) => c.id)).not.toContain(carol);
    // The blocked user cannot see who blocked them
    expect(await asUser(db, frank, (q) => q(`select * from public.user_blocks`))).toHaveLength(0);
  });

  it("blocked users cannot match", async () => {
    const gina = await createReadyUser(db, { name: "Gina", gender: "woman", interestedIn: ["man"] });
    const hank = await createReadyUser(db, { name: "Hank", gender: "man", interestedIn: ["woman"] });
    await asUser(db, gina, (q) => q(`select public.like_user($1)`, [hank]));
    await asUser(db, gina, (q) => q(`select public.block_user($1)`, [hank]));
    expect(await rejects(asUser(db, hank, (q) => q(`select public.like_user($1)`, [gina])))).toMatch(/no longer available/);
  });

  it("reports are private to the reporter and staff", async () => {
    await asUser(db, alice, (q) => q(`select public.report_user($1, 'spam', 'sent links')`, [dave]));
    expect(await asUser(db, alice, (q) => q(`select * from public.user_reports`))).toHaveLength(1);
    expect(await asUser(db, bob, (q) => q(`select * from public.user_reports`))).toHaveLength(0);
    expect(await asUser(db, dave, (q) => q(`select * from public.user_reports`))).toHaveLength(0);
    expect(await asUser(db, alice, (q) => q(`select * from public.moderation_queue`))).toHaveLength(0);
    expect(await rejects(asUser(db, alice, (q) => q(`insert into public.user_reports (reporter_id, reported_user_ref, category) values (auth.uid(), $1, 'spam')`, [dave])))).toMatch(
      /permission denied/,
    );
  });
});

describe("photos", () => {
  it("clients cannot create or approve photo records", async () => {
    expect(
      await rejects(
        asUser(db, alice, (q) =>
          q(`insert into public.profile_photos (user_id, staging_key, status) values (auth.uid(), 'uploads/' || auth.uid() || '/x', 'approved')`),
        ),
      ),
    ).toMatch(/permission denied/);
    expect(await rejects(asUser(db, alice, (q) => q(`update public.profile_photos set status = 'approved'`)))).toMatch(/permission denied/);
  });

  it("pending photos are visible only to their owner and staff", async () => {
    await asService(db, (q) =>
      q(
        `insert into public.profile_photos (user_id, staging_key, object_key, thumb_key, status, position)
         values ($1::uuid, 'uploads/' || $1::text || '/p', 'profiles/' || $1::text || '/p.webp', 'profiles/' || $1::text || '/p_thumb.webp', 'pending', 1)`,
        [bob],
      ),
    );
    const mine = await asUser(db, bob, (q) => q(`select * from public.profile_photos where status = 'pending'`));
    expect(mine).toHaveLength(1);
    const theirs = await asUser(db, alice, (q) => q(`select * from public.profile_photos where user_id = $1`, [bob]));
    expect(theirs.every((p) => (p as { status: string }).status === "approved")).toBe(true);
    // pending photo was auto-queued for moderation
    const [{ n }] = await asService(db, (q) => q<{ n: number }>(`select count(*)::int n from public.moderation_queue where item_type = 'photo'`));
    expect(n).toBeGreaterThan(0);
  });

  it("users cannot reorder someone else's photos", async () => {
    const [p] = await asService(db, (q) => q<{ id: string }>(`select id from public.profile_photos where user_id = $1 limit 1`, [bob]));
    expect(await rejects(asUser(db, alice, (q) => q(`select public.reorder_photos(array[$1]::uuid[])`, [p.id])))).toMatch(/exactly once/);
  });

  it("object keys must live under the owner's prefix", async () => {
    expect(
      await rejects(
        asService(db, (q) => q(`insert into public.profile_photos (user_id, staging_key) values ($1::uuid, 'uploads/' || $2::text || '/x')`, [alice, bob])),
      ),
    ).toMatch(/profile_photos_keys_scoped/);
  });
});

describe("chemistry data", () => {
  it("answers are private and cannot be written for others", async () => {
    await asUser(db, alice, (q) =>
      q(`insert into public.chemistry_answers (user_id, question_id, questionnaire_version, option_keys)
         select auth.uid(), id, 1, array['s4'] from public.chemistry_questions where code = 'p_social_recharge'`),
    );
    expect(await asUser(db, bob, (q) => q(`select * from public.chemistry_answers where user_id = $1`, [alice]))).toHaveLength(0);
    // RLS WITH CHECK rejects writing as another user
    expect(
      await rejects(
        asUser(db, bob, (q) =>
          q(`insert into public.chemistry_answers (user_id, question_id, questionnaire_version, option_keys)
             select $1, id, 1, array['s1'] from public.chemistry_questions where code = 'p_planner'`, [alice]),
        ),
      ),
    ).toMatch(/row-level security/);
  });

  it("saving answers works with the statements the app sends (insert-ignore + update option_keys)", async () => {
    const upsertAll = `insert into public.chemistry_answers (user_id, question_id, questionnaire_version, option_keys)
       select auth.uid(), id, 1, array[$1::text] from public.chemistry_questions where code = 'p_planner'
       on conflict (user_id, question_id) do update set user_id = excluded.user_id, question_id = excluded.question_id,
         questionnaire_version = excluded.questionnaire_version, option_keys = excluded.option_keys`;
    // Regression: a PostgREST upsert (ON CONFLICT DO UPDATE SET <every column>) needs UPDATE on columns
    // users must not change, so it is refused. The app must not use it.
    expect(await rejects(asUser(db, carol, (q) => q(upsertAll, ["s2"])))).toMatch(/permission denied/);

    // What saveChemistryAnswersAction does: insert new answers, ignoring existing ones…
    const insertIgnore = `insert into public.chemistry_answers (user_id, question_id, questionnaire_version, option_keys)
       select auth.uid(), id, 1, array[$1::text] from public.chemistry_questions where code = 'p_planner'
       on conflict (user_id, question_id) do nothing`;
    await asUser(db, carol, (q) => q(insertIgnore, ["s2"]));
    await asUser(db, carol, (q) => q(insertIgnore, ["s5"])); // second save: no error, no change
    // …then change existing answers through the one updatable column.
    await asUser(db, carol, (q) =>
      q(`update public.chemistry_answers set option_keys = array['s5']
         where user_id = auth.uid() and question_id = (select id from public.chemistry_questions where code = 'p_planner')`),
    );
    const [row] = await asUser(db, carol, (q) =>
      q<{ option_keys: string[] }>(`select option_keys from public.chemistry_answers a join public.chemistry_questions c on c.id = a.question_id
         where a.user_id = auth.uid() and c.code = 'p_planner'`),
    );
    expect(row.option_keys).toEqual(["s5"]);
    // Another user still cannot touch it.
    await asUser(db, bob, (q) => q(`update public.chemistry_answers set option_keys = array['s1'] where user_id = $1`, [carol]));
    const [still] = await asService(db, (q) =>
      q<{ option_keys: string[] }>(`select option_keys from public.chemistry_answers a join public.chemistry_questions c on c.id = a.question_id
         where a.user_id = $1 and c.code = 'p_planner'`, [carol]),
    );
    expect(still.option_keys).toEqual(["s5"]);
  });

  it("rejects invalid options", async () => {
    expect(
      await rejects(
        asUser(db, alice, (q) =>
          q(`insert into public.chemistry_answers (user_id, question_id, questionnaire_version, option_keys)
             select auth.uid(), id, 1, array['nope'] from public.chemistry_questions where code = 'p_planner'`),
        ),
      ),
    ).toMatch(/Invalid option/);
  });

  it("results are not client-writable", async () => {
    const [lo, hi] = [alice, bob].sort();
    expect(
      await rejects(
        asUser(db, alice, (q) =>
          q(`insert into public.chemistry_results (user_low, user_high, questionnaire_version, calculation_version, overall_score, confidence)
             values ($1, $2, 1, 1, 100, 1)`, [lo, hi]),
        ),
      ),
    ).toMatch(/permission denied/);
  });
});

describe("administration", () => {
  let mod: string;
  beforeAll(async () => {
    mod = await createUser(db, { name: "Mod" });
    await asService(db, (q) => q(`insert into public.admin_users (user_id, role) values ($1, 'moderator')`, [mod]));
  });

  it("users cannot promote themselves", async () => {
    expect(await rejects(asUser(db, alice, (q) => q(`insert into public.admin_users (user_id, role) values (auth.uid(), 'admin')`)))).toMatch(
      /permission denied/,
    );
    expect(await rejects(asUser(db, alice, (q) => q(`select public.admin_set_role(auth.uid(), 'admin')`)))).toMatch(/Not authorized/);
    expect(await rejects(asUser(db, mod, (q) => q(`select public.admin_set_role(auth.uid(), 'admin')`)))).toMatch(/Not authorized/);
  });

  it("non-staff cannot call admin functions", async () => {
    for (const sql of [`select public.admin_stats()`, `select * from public.admin_search_users('a')`, `select public.admin_set_suspension('${bob}', true, 'x')`]) {
      expect(await rejects(asUser(db, alice, (q) => q(sql)))).toMatch(/Not authorized/);
    }
  });

  it("staff can moderate, every action is audited, and suspension takes effect", async () => {
    const [stats] = await asUser(db, mod, (q) => q<{ s: { reports_open: number } }>(`select public.admin_stats() as s`));
    expect(stats.s.reports_open).toBeGreaterThan(0);
    expect((await asUser(db, mod, (q) => q(`select * from public.user_reports`))).length).toBeGreaterThan(0);

    await asUser(db, mod, (q) => q(`select public.admin_set_suspension($1, true, 'spam')`, [dave]));
    const [p] = await asService(db, (q) => q<{ account_status: string }>(`select account_status from public.profiles where id = $1`, [dave]));
    expect(p.account_status).toBe("suspended");
    const logs = await asService(db, (q) => q<{ action: string; actor_id: string }>(`select * from public.admin_audit_logs where target_id = $1`, [dave]));
    expect(logs).toEqual(expect.arrayContaining([expect.objectContaining({ action: "user.suspend", actor_id: mod })]));

    // Suspended users drop out of discovery and cannot like
    expect(await rejects(asUser(db, dave, (q) => q(`select public.like_user($1)`, [bob])))).toMatch(/Finish setting up/);
    // Moderators cannot read the audit log (admins only); normal users neither
    expect(await asUser(db, mod, (q) => q(`select * from public.admin_audit_logs`))).toHaveLength(0);
    expect(await asUser(db, alice, (q) => q(`select * from public.admin_audit_logs`))).toHaveLength(0);
  });

  it("photo review is audited and notifies the owner on rejection", async () => {
    const [p] = await asService(db, (q) => q<{ id: string }>(`select id from public.profile_photos where status = 'pending' limit 1`));
    await asUser(db, mod, (q) => q(`select public.admin_review_photo($1, false, 'Face not visible')`, [p.id]));
    const [row] = await asService(db, (q) => q<{ status: string }>(`select status from public.profile_photos where id = $1`, [p.id]));
    expect(row.status).toBe("rejected");
    expect(await asService(db, (q) => q(`select * from public.admin_audit_logs where action = 'photo.reject'`))).toHaveLength(1);
  });
});

describe("notifications", () => {
  it("are private to their owner and only markable as read via RPC", async () => {
    const mine = await asUser(db, alice, (q) => q<{ user_id: string }>(`select * from public.notifications`));
    expect(mine.every((n) => n.user_id === alice)).toBe(true);
    expect(await rejects(asUser(db, alice, (q) => q(`update public.notifications set title = 'x'`)))).toMatch(/permission denied/);
    expect(await rejects(asUser(db, alice, (q) => q(`insert into public.notifications (user_id, type, title) values ($1, 'system', 'fake')`, [bob])))).toMatch(
      /permission denied/,
    );
  });
});

describe("maintenance", () => {
  it("only the service role can run maintenance, which prunes expired rate-limit windows", async () => {
    expect(await rejects(asUser(db, alice, (q) => q(`select public.run_maintenance()`)))).toMatch(/permission denied/);
    expect(await rejects(asUser(db, null, (q) => q(`select public.run_maintenance()`)))).toMatch(/permission denied/);

    // Fixture rows are written as the superuser: private.* is not reachable by API roles at all.
    await db.query(
      `insert into private.rate_limit_hits (bucket, window_start, hits) values ('test:old', now() - interval '3 days', 1), ('test:new', now(), 1)`,
    );
    await asService(db, (q) => q(`select public.run_maintenance()`));
    const left = await db.query<{ bucket: string }>(`select bucket from private.rate_limit_hits where bucket like 'test:%'`);
    expect(left.rows.map((r) => r.bucket)).toEqual(["test:new"]);
  });
});
