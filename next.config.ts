import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
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
