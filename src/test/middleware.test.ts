import { afterEach, describe, expect, it, vi } from "vitest";
import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import middleware, { config } from "../../middleware";
import RegisterPage from "@/app/(auth)/register/page";
import VerifyEmailPage from "@/app/(auth)/verify-email/page";

// Inspect real Next.js matching and public page rendering without auth or DB I/O.
vi.mock("@/lib/auth/config", () => ({ auth: vi.fn((handler) => handler) }));

function matches(url: string) {
    return unstable_doesMiddlewareMatch({ config, nextConfig: {}, url });
}
const handle = middleware as unknown as (request: {
    nextUrl: URL; auth: { user: { id: string } } | null;
}) => Response | undefined;

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("readiness endpoint middleware matching", () => {
    it.each(["/api/health", "/api/health?probe=1", "/api/metrics", "/api/metrics?format=prom"])("allows unauthenticated probes at %s", (url) => {
        expect(matches(url)).toBe(false);
    });

    // /api/metrics is exempted by exact match only; the bearer token in the route
    // is the sole gate, so near-miss paths must stay session-protected.
    it.each([
        "/api/health/details", "/api/health-admin", "/api/providers",
        "/api/conversations", "/api/chat", "/api/projects", "/settings/account", "/api/auth-extra",
        "/api/metrics/details", "/api/metrics-admin", "/api/metricss",
    ])("retains authentication for %s", (url) => {
        expect(matches(url)).toBe(true);
    });
});

describe("public authentication pages", () => {
    it.each(["/login", "/register", "/verify-email", "/verify-email/", "/verify-email#token=secret"])("permits unauthenticated access to %s", (path) => {
        expect(handle({ nextUrl: new URL(path, "https://chat.example.com"), auth: null })).toBeUndefined();
    });

    it.each(["/login-extra", "/register/private", "/verify-email/private", "/chat", "/settings/account"])("does not broaden public access to %s", (path) => {
        const response = handle({ nextUrl: new URL(path, "https://chat.example.com"), auth: null });
        expect(response?.headers.get("location")).toBe("https://chat.example.com/login");
    });

    it("returns JSON 401 for protected APIs rather than a login redirect", async () => {
        const response = handle({ nextUrl: new URL("https://chat.example.com/api/chat"), auth: null });
        expect(response?.status).toBe(401);
        expect(await response?.json()).toEqual({ error: "Unauthorized" });
    });

    it("allows authenticated requests after the JWT verification gate", () => {
        expect(handle({ nextUrl: new URL("https://chat.example.com/chat"), auth: { user: { id: "u1" } } })).toBeUndefined();
    });

    it("renders registration and explicit confirmation without sending or consuming on GET", () => {
        vi.stubEnv("EMAIL_VERIFICATION_REQUIRED", "true");
        const fetchMock = vi.fn();
        vi.stubGlobal("fetch", fetchMock);
        expect(renderToStaticMarkup(createElement(RegisterPage))).toContain("Create account");
        const confirmation = renderToStaticMarkup(createElement(VerifyEmailPage));
        expect(confirmation).toContain("Confirm email");
        expect(confirmation).toContain("Send verification email");
        expect(confirmation).not.toContain("token=");
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("shows the local/offline exemption without hosted forms when disabled", () => {
        vi.stubEnv("EMAIL_VERIFICATION_REQUIRED", "false");
        const page = renderToStaticMarkup(createElement(RegisterPage));
        expect(page).toContain("not enabled");
        expect(page).not.toContain("<form");
    });
});
