import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  images: {
    unoptimized: true, // Required for Tauri desktop app
  },
};

export default nextConfig;
