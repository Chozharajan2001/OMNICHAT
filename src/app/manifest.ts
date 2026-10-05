import type { MetadataRoute } from "next";

/**
 * Served at /manifest.webmanifest. The app is desktop-first (Tauri) and this is
 * what makes an installed browser tab behave like the same product: standalone
 * chrome, the workspace as the entry point, and the brand mark.
 */
export default function manifest(): MetadataRoute.Manifest {
    return {
        name: "OmniChat",
        short_name: "OmniChat",
        description: "A personal multi-provider AI workspace with bring-your-own-key model access.",
        start_url: "/chat",
        scope: "/",
        display: "standalone",
        background_color: "#131217",
        theme_color: "#b34a12",
        icons: [
            { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
            { src: "/icon.svg", sizes: "192x192", type: "image/svg+xml", purpose: "maskable" },
        ],
    };
}
