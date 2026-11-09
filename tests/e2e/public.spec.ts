import { expect, test } from "@playwright/test";

test.describe("public pages", () => {
  test("landing page renders the brand and primary CTA", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("the swipe");
    await expect(page.getByRole("link", { name: /create your profile/i })).toHaveAttribute("href", "/signup");
    await expect(page.getByText("Chemistry you can actually read.")).toBeVisible();
  });

  for (const [path, heading] of [
    ["/terms", "Terms of Service"],
    ["/privacy", "Privacy Policy"],
    ["/guidelines", "Community Guidelines"],
  ] as const) {
    test(`legal page ${path}`, async ({ page }) => {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
    });
  }

  test("no horizontal overflow on key pages", async ({ page }) => {
    for (const path of ["/", "/login", "/signup", "/terms"]) {
      await page.goto(path);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `horizontal overflow on ${path}`).toBeLessThanOrEqual(1);
    }
  });
});

test.describe("auth forms", () => {
  test("sign-up validates on the client before contacting the server", async ({ page }) => {
    await page.goto("/signup");
    await page.getByLabel("Email").fill("not-an-email");
    await page.getByLabel("Password", { exact: true }).fill("short");
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByText("Enter a valid email address")).toBeVisible();
    await expect(page.getByText("Use at least 8 characters")).toBeVisible();
    await expect(page.getByText(/accept the Terms/)).toBeVisible();
  });

  test("login form and links", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
    await expect(page.getByRole("button", { name: /continue with google/i })).toBeVisible();
    await page.getByRole("link", { name: "Forgot password?" }).click();
    await expect(page).toHaveURL(/\/forgot-password$/);
  });
});

test.describe("route protection", () => {
  for (const path of ["/discover", "/chat", "/me", "/settings", "/admin", "/onboarding", "/chat/00000000-0000-4000-8000-000000000000"]) {
    test(`${path} requires sign-in`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(/\/login/);
    });
  }
});

test.describe("API authorization", () => {
  test("photo and account APIs reject unauthenticated requests", async ({ request }) => {
    const upload = await request.post("/api/photos/upload-url", { data: { contentType: "image/jpeg", size: 1000 } });
    expect(upload.status()).toBe(401);
    const view = await request.post("/api/photos/view", { data: { ids: ["00000000-0000-4000-8000-000000000000"], variant: "main" } });
    expect(view.status()).toBe(401);
    const del = await request.delete("/api/photos/00000000-0000-4000-8000-000000000000");
    expect(del.status()).toBe(401);
    const account = await request.post("/api/account/delete", { data: { confirm: "DELETE" } });
    expect(account.status()).toBe(401);
  });

  test("cross-origin state changes are refused", async ({ request }) => {
    const res = await request.post("/api/photos/upload-url", {
      data: { contentType: "image/jpeg", size: 1000 },
      headers: { Origin: "https://evil.example" },
    });
    expect(res.status()).toBe(403);
  });

  test("cron endpoint requires the secret", async ({ request }) => {
    expect((await request.get("/api/cron/cleanup")).status()).toBe(401);
  });
});

test.describe("PWA & security headers", () => {
  test("manifest and service worker are served", async ({ request }) => {
    const manifest = await request.get("/manifest.webmanifest");
    expect(manifest.ok()).toBe(true);
    const json = await manifest.json();
    expect(json.short_name).toBe("SPARK");
    expect(json.icons.length).toBeGreaterThanOrEqual(3);
    const sw = await request.get("/sw.js");
    expect(sw.ok()).toBe(true);
    expect(await sw.text()).toContain("NEVER cache");
    expect((await request.get("/offline")).ok()).toBe(true);
  });

  test("security headers are present", async ({ request }) => {
    const res = await request.get("/");
    const h = res.headers();
    expect(h["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(h["x-content-type-options"]).toBe("nosniff");
    expect(h["x-frame-options"]).toBe("DENY");
    expect(h["x-powered-by"]).toBeUndefined();
  });
});
