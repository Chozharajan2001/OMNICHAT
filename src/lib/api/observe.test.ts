import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/session", () => ({ getServerSession: vi.fn(async () => null) }));

import { metrics } from "@/lib/metrics";
import { recordRejection } from "./observe";
import { GET as listProviders } from "@/app/api/providers/route";

beforeEach(() => {
    metrics.reset();
});

describe("routeTimer HTTP accounting (E)", () => {
    it("records a rejected unauthenticated read", async () => {
        const response = await listProviders();

        expect(response.status).toBe(401);
        const series = metrics.getMetricsJSON().find((s) => s.name === "http_requests_total");
        expect(series).toBeTruthy();
        expect(series?.values).toEqual([
            expect.objectContaining({
                value: 1,
                labels: { method: "GET", path: "/api/providers", status: "401" },
            }),
        ]);
    });

    it("hashes the rejection identifier instead of storing it raw", async () => {
        recordRejection("/api/chat", "user-123");

        const series = metrics.getMetricsJSON().find((s) => s.name === "rate_limit_rejections_total");
        const labels = series?.values[0]?.labels ?? {};
        expect(labels["endpoint"]).toBe("/api/chat");
        expect(labels["identifier"]).not.toContain("user-123");
        expect(labels["identifier"]).toHaveLength(16);
    });
});
