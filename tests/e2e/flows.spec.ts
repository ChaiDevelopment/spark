import { expect, test } from "@playwright/test";

/**
 * Full journeys against a REAL Supabase project (local `supabase start` or a
 * dedicated test project). Skipped unless E2E_SUPABASE=1.
 *
 * Requirements:
 *   - Email confirmations DISABLED in the test project (or use Inbucket locally),
 *     so sign-up returns a session immediately.
 *   - PHOTO_MODERATION_MODE=auto and R2 configured, so photos become visible.
 */
const enabled = process.env.E2E_SUPABASE === "1";
test.skip(!enabled, "Set E2E_SUPABASE=1 with real Supabase + R2 credentials to run journey tests.");
test.describe.configure({ mode: "serial" });

const stamp = Date.now();
const password = "SparkTest123";

async function signUp(page: import("@playwright/test").Page, email: string) {
  await page.goto("/signup");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/onboarding/);
}

async function onboard(page: import("@playwright/test").Page, name: string, gender: "Woman" | "Man", seeking: "Woman" | "Man") {
  await page.getByLabel("First name").fill(name);
  await page.getByLabel("Date of birth").fill("1995-06-15");
  await page.getByRole("button", { name: gender, exact: true }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("City").fill("Jakarta");
  await page.getByLabel("Province").selectOption("DKI Jakarta");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: seeking, exact: true }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("About you").fill("I love coffee, hiking and long conversations.");
  await page.getByRole("button", { name: "Continue" }).click();
  for (const i of ["Coffee", "Hiking", "Reading"]) await page.getByRole("button", { name: new RegExp(i) }).first().click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.setInputFiles('input[type="file"]', "tests/e2e/fixtures/portrait.jpg");
  await expect(page.getByLabel("Delete photo 1")).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Finish" }).click();
  await expect(page).toHaveURL(/\/chemistry/);
}

test("two users sign up, onboard, match and chat in real time", async ({ browser }) => {
  const a = await (await browser.newContext()).newPage();
  const b = await (await browser.newContext()).newPage();
  await signUp(a, `ana+${stamp}@example.test`);
  await onboard(a, "Ana", "Woman", "Man");
  await signUp(b, `budi+${stamp}@example.test`);
  await onboard(b, "Budi", "Man", "Woman");

  await a.goto("/discover");
  await a.getByRole("button", { name: /^Like Budi/ }).click();
  await b.goto("/discover");
  await b.getByRole("button", { name: /^Like Ana/ }).click();
  await expect(b.getByText("It's a spark!")).toBeVisible();
  await b.getByRole("link", { name: "Say hello" }).click();

  await a.goto("/chat");
  await a.getByRole("link", { name: /Budi/ }).click();
  await b.getByLabel(/Message Ana/).fill("Halo Ana!");
  await b.keyboard.press("Enter");
  await expect(a.getByText("Halo Ana!")).toBeVisible({ timeout: 10_000 });

  // Block ends the conversation
  await a.getByRole("button", { name: "Conversation options" }).click();
  await a.getByRole("button", { name: "Block" }).click();
  await a.getByRole("button", { name: "Block", exact: true }).last().click();
  await expect(a).toHaveURL(/\/chat$/);
});
