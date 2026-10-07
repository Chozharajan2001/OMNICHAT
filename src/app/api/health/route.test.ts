import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";
import { APP_VERSION } from "@/lib/version";

const { queryRaw } = vi.hoisted(() => ({ queryRaw: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({ prisma: { $queryRaw: queryRaw } }));

beforeEach(() => {
    queryRaw.mockReset().mockResolvedValue([{ result: 1 }]);
    vi.stubEnv("ENCRYPTION_SECRET_KEY", "health-test-secret".repeat(3));
    vi.stubEnv("ENCRYPTION_KEY", undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
});

describe("GET /api/health", () => {
    it("uses the vault's environment setting and reports healthy dependencies", async () => {
        const response = await GET();
        const body = await response.json();
        expect(response.status).toBe(200);
        expect(response.headers.get("Cache-Control")).toBe("no-store");
        expect(body).toEqual({
            status: "healthy", checks: { database: "up", encryption: "up" },
            timestamp: expect.any(String), version: expect.any(String),
        });
        expect(Number.isNaN(Date.parse(body.timestamp))).toBe(false);
        expect(queryRaw).toHaveBeenCalledExactlyOnceWith(["SELECT 1"]);
        expect(JSON.stringify(body)).not.toContain(process.env.ENCRYPTION_SECRET_KEY);
    });

    it.each([undefined, "", "x".repeat(31)])("reports a degraded vault for invalid configuration (case %#)", async (secret) => {
        vi.stubEnv("ENCRYPTION_SECRET_KEY", secret);
        const response = await GET();
        expect(response.status).toBe(503);
        expect(response.headers.get("Cache-Control")).toBe("no-store");
        expect(await response.json()).toMatchObject({
            // Database works, vault does not: a real degraded tier, still 503
            // so strict probes treat the instance as not-ready.
            status: "degraded", checks: { database: "up", encryption: "down" },
        });
    });

    it("reports the package version and ignores the process environment", async () => {
        // A container starts Next directly, so npm_package_version is unset
        // there; reading it made the deployed version depend on how the
        // process happened to be launched.
        vi.stubEnv("npm_package_version", "9.9.9-environment-decoy");

        const body = await (await GET()).json();

        expect(body.version).toBe(APP_VERSION);
        expect(body.version).not.toContain("decoy");
    });

    it("accepts the same minimum secret length as the vault", async () => {
        vi.stubEnv("ENCRYPTION_SECRET_KEY", "x".repeat(32));
        expect((await GET()).status).toBe(200);
    });

    it("does not treat the unrelated legacy variable as vault configuration", async () => {
        vi.stubEnv("ENCRYPTION_SECRET_KEY", undefined);
        vi.stubEnv("ENCRYPTION_KEY", "x".repeat(32));
        expect((await GET()).status).toBe(503);
    });

    it("reports a database failure without exposing its error to the caller", async () => {
        const failure = new Error("synthetic database connection failure");
        queryRaw.mockRejectedValueOnce(failure);
        const response = await GET();
        const body = await response.json();
        expect(response.status).toBe(503);
        expect(body).toMatchObject({
            status: "unhealthy", checks: { database: "down", encryption: "up" },
        });
        expect(JSON.stringify(body)).not.toContain(failure.message);
        expect(console.error).toHaveBeenCalledWith("Health check: Database connection failed", failure);
    });

    it("reports simultaneous dependency failures", async () => {
        queryRaw.mockRejectedValueOnce(new Error("synthetic outage"));
        vi.stubEnv("ENCRYPTION_SECRET_KEY", undefined);
        const response = await GET();
        expect(response.status).toBe(503);
        expect(await response.json()).toMatchObject({
            status: "unhealthy", checks: { database: "down", encryption: "down" },
        });
    });

    it("rechecks dependencies after recovery instead of caching unhealthy state", async () => {
        queryRaw.mockRejectedValueOnce(new Error("synthetic timeout"));
        expect((await GET()).status).toBe(503);
        expect((await GET()).status).toBe(200);
        expect(queryRaw).toHaveBeenCalledTimes(2);
    });

    it("isolates concurrent health results during an intermittent outage", async () => {
        queryRaw.mockRejectedValueOnce(new Error("synthetic intermittent failure"));
        const responses = await Promise.all([GET(), GET()]);
        expect(responses.map((response) => response.status)).toEqual([503, 200]);
        expect((await responses[1].json()).checks.database).toBe("up");
    });
});
