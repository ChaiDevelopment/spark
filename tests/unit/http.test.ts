import { describe, expect, it } from "vitest";
import { isSameOrigin } from "@/server/http";

const req = (url: string, headers: Record<string, string>) => new Request(url, { method: "POST", headers });

describe("isSameOrigin", () => {
  it("allows requests without an Origin header (non-browser clients)", () => {
    expect(isSameOrigin(req("http://localhost:3000/api/x", {}))).toBe(true);
  });

  it("allows a direct same-origin request", () => {
    expect(isSameOrigin(req("http://localhost:3000/api/x", { origin: "http://localhost:3000", host: "localhost:3000" }))).toBe(true);
  });

  it("allows the public origin behind a reverse proxy (internal req.url host)", () => {
    const r = req("http://localhost:8080/api/photos/upload-url", {
      origin: "https://spark-production-73e8.up.railway.app",
      host: "spark-production-73e8.up.railway.app",
      "x-forwarded-host": "spark-production-73e8.up.railway.app",
    });
    expect(isSameOrigin(r)).toBe(true);
  });

  it("rejects a cross-site origin", () => {
    const r = req("http://localhost:8080/api/photos/upload-url", {
      origin: "https://evil.example",
      host: "spark-production-73e8.up.railway.app",
      "x-forwarded-host": "spark-production-73e8.up.railway.app",
    });
    expect(isSameOrigin(r)).toBe(false);
  });

  it("rejects a malformed origin", () => {
    expect(isSameOrigin(req("http://localhost:3000/api/x", { origin: "not a url", host: "localhost:3000" }))).toBe(false);
  });
});
