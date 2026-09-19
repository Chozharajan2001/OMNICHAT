import { describe, expect, it, vi } from "vitest";
import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { config } from "../../middleware";

// Inspect Next.js's real matcher compilation without initializing auth or the DB.
vi.mock("@/lib/auth/config", () => ({ auth: vi.fn((handler) => handler) }));

function matches(url: string) {
    return unstable_doesMiddlewareMatch({ config, nextConfig: {}, url });
}

describe("readiness endpoint middleware matching", () => {
    it.each(["/api/health", "/api/health?probe=1"])("allows unauthenticated probes at %s", (url) => {
        expect(matches(url)).toBe(false);
    });

    it.each([
        "/api/health/details", "/api/health-admin", "/api/providers",
        "/api/conversations", "/api/chat", "/api/projects", "/settings/account",
    ])("retains authentication for %s", (url) => {
        expect(matches(url)).toBe(true);
    });
});
