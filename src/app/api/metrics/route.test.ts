import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "./route";

// Access control contract for the metrics surface (audit M-metrics):
// token-protected, fail-closed in production, open only outside production.
// The real metrics registry is used; no external seams are needed.
// The route guard (src/proxy.ts) exempts this exact path so a session-less
// scraper can reach it, which makes these checks the endpoint's ONLY gate.

function request(authorization?: string) {
    return new NextRequest("http://localhost/api/metrics", {
        method: "GET",
        headers: authorization ? { Authorization: authorization } : undefined,
    });
}

beforeEach(() => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("METRICS_TOKEN", undefined);
});

afterEach(() => {
    vi.unstubAllEnvs();
});

describe("GET /api/metrics access control", () => {
    it("hides the endpoint in production when no token is configured", async () => {
        const response = await GET(request());
        expect(response.status).toBe(404);
        expect(await response.text()).toBe("");
    });

    it("serves Prometheus text outside production without a token", async () => {
        vi.stubEnv("NODE_ENV", "test");
        const response = await GET(request());
        expect(response.status).toBe(200);
        expect(response.headers.get("Content-Type")).toContain("text/plain");
        expect(response.headers.get("Cache-Control")).toBe("no-store");
    });

    it("accepts the exact bearer token", async () => {
        vi.stubEnv("METRICS_TOKEN", "scrape-secret-42");
        const response = await GET(request("Bearer scrape-secret-42"));
        expect(response.status).toBe(200);
    });

    it.each([
        ["no header at all", undefined],
        ["an empty bearer prefix", "Bearer "],
        ["a wrong token", "Bearer wrong-token"],
        ["a raw token without the Bearer scheme", "scrape-secret-42"],
        ["a shorter prefix of the token", "Bearer scrape-secret"],
        ["a longer padded token", "Bearer scrape-secret-42XYZ"],
    ])("returns 404 for %s", async (_name, authorization) => {
        vi.stubEnv("METRICS_TOKEN", "scrape-secret-42");
        const response = await GET(request(authorization));
        expect(response.status).toBe(404);
    });

    it("compares tokens in constant time via a length-guarded digest", async () => {
        // Behavioral proxy: mismatched lengths must not throw out of the
        // handler (timingSafeEqual throws before a length guard would pass).
        vi.stubEnv("METRICS_TOKEN", "scrape-secret-42");
        await expect(GET(request("Bearer x"))).resolves.toMatchObject({ status: 404 });
    });
});
