import type { NextConfig } from "next";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

// This repository's parent directory also holds a package.json and a
// pnpm-lock.yaml, so Next infers the tracing root one level up. Locally that
// nests the standalone output under `omnichat/` -- `node server.js` would then
// start from the wrong directory -- and it rewrites the paths that
// outputFileTracingExcludes has to match. Inside the image the build context is
// this directory alone, so pinning it here makes the local build behave like the
// Docker build instead of silently differing from it.
const APP_ROOT = dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: APP_ROOT,
  turbopack: { root: APP_ROOT },
  images: {
    unoptimized: true, // Required for Tauri desktop app
  },
  async headers() {
    return [
      {
        // Apply security headers to all routes
        source: "/(.*)",
        headers: [
          // Prevent clickjacking
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          // Prevent MIME type sniffing
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          // Control referrer information
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          // Content Security Policy (CSP)
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-eval' 'unsafe-inline'", // Required for Next.js
              "style-src 'self' 'unsafe-inline'", // Required for Tailwind
              "img-src 'self' data: blob:",
              "font-src 'self' data:",
              // Audit M-CSP: `https: http:` wildcards allowed connects to ANY
              // host (exfiltration surface). Provider calls happen
              // server-side, so pages only ever need 'self'; websockets are
              // dev-only for the HMR channel. This header is what actually
              // governs the desktop renderer: src-tauri points its webview at
              // http://localhost:3000, so tauri.conf.json's own `csp` never
              // applies to this document. `ipc:` / `http://ipc.localhost` are
              // allowance for Tauri's IPC transport, which no call site uses
              // today (@tauri-apps/api is not a dependency) — kept because
              // adding a command would otherwise need a change here.
              `connect-src 'self' ipc: http://ipc.localhost${process.env.NODE_ENV !== "production" ? " ws: wss:" : ""}`,
              "frame-ancestors 'none'",
              "base-uri 'self'",
              "form-action 'self'",
            ].join("; "),
          },
          // Permissions Policy (formerly Feature-Policy)
          {
            key: "Permissions-Policy",
            value: [
              "camera=()",
              "microphone=()",
              "geolocation=()",
              "interest-cohort=()",
            ].join(", "),
          },
          // Remove X-Powered-By header
          {
            key: "X-Powered-By",
            value: "",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
