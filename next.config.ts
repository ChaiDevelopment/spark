import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseWs = supabaseUrl.replace(/^http/, "ws");
/**
 * Presigned photo URLs are served by the S3 endpoint, either path-style
 * (https://endpoint/bucket/key) or virtual-hosted (https://bucket.endpoint/key),
 * so allow the endpoint host and its subdomains. Read at build time.
 */
function storageImgSources(): string {
  const endpoint = (process.env.S3_ENDPOINT || process.env.ENDPOINT || process.env.R2_ENDPOINT || "").trim();
  if (endpoint) {
    try {
      const { protocol, host } = new URL(endpoint);
      return `${protocol}//${host} ${protocol}//*.${host}`;
    } catch {
      /* fall through to defaults */
    }
  }
  // Defaults: Railway Storage Buckets and Cloudflare R2.
  return "https://t3.storageapi.dev https://*.t3.storageapi.dev https://*.r2.cloudflarestorage.com";
}
const storageOrigins = storageImgSources();

const csp = [
  "default-src 'self'",
  // Next.js injects inline bootstrap scripts; 'unsafe-eval' only in development (React dev tooling).
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: ${storageOrigins}`,
  "font-src 'self' data:",
  // Uploads go through our own API, so the browser never connects to storage.
  `connect-src 'self' ${supabaseUrl} ${supabaseWs}`.trim(),
  "frame-ancestors 'none'",
  "form-action 'self' https://accounts.google.com " + supabaseUrl,
  "base-uri 'self'",
  "object-src 'none'",
  "worker-src 'self'",
  "manifest-src 'self'",
].join("; ");

const nextConfig: NextConfig = {
  // Every app page is per-user and reads the session cookie; nothing private
  // should be prerendered or cached, so Cache Components stays off.
  cacheComponents: false,
  poweredByHeader: false,
  serverExternalPackages: ["sharp"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
        ],
      },
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
};

export default nextConfig;
