import { afterEach, describe, expect, it, vi } from "vitest";

let mockHeaders = new Headers();
vi.mock("next/headers", () => ({ headers: async () => mockHeaders }));

const { getAppUrl } = await import("@/server/app-url");

afterEach(() => {
  vi.unstubAllEnvs();
  mockHeaders = new Headers();
});

describe("getAppUrl", () => {
  it("prefers NEXT_PUBLIC_APP_URL", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://spark.example/");
    vi.stubEnv("RAILWAY_PUBLIC_DOMAIN", "spark-production-73e8.up.railway.app");
    expect(await getAppUrl()).toBe("https://spark.example");
  });

  it("falls back to Railway's public domain when the build had no app URL", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
    vi.stubEnv("RAILWAY_PUBLIC_DOMAIN", "spark-production-73e8.up.railway.app");
    mockHeaders = new Headers({ host: "localhost:8080" });
    expect(await getAppUrl()).toBe("https://spark-production-73e8.up.railway.app");
  });

  it("then uses the forwarded host the browser used", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
    vi.stubEnv("RAILWAY_PUBLIC_DOMAIN", "");
    mockHeaders = new Headers({ host: "localhost:8080", "x-forwarded-host": "spark.example", "x-forwarded-proto": "https" });
    expect(await getAppUrl()).toBe("https://spark.example");
  });

  it("uses http for localhost and ignores malformed hosts", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
    vi.stubEnv("RAILWAY_PUBLIC_DOMAIN", "");
    mockHeaders = new Headers({ host: "localhost:3000" });
    expect(await getAppUrl()).toBe("http://localhost:3000");
    mockHeaders = new Headers({ host: "evil.example/phish" });
    expect(await getAppUrl()).toBe("http://localhost:3000");
  });
});
