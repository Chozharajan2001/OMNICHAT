import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RateLimitConfig, RateLimitResult } from "@/lib/rate-limit";

const mocks = vi.hoisted(() => ({
    check: vi.fn<(key: string) => Promise<RateLimitResult>>(),
    ip: vi.fn(), send: vi.fn(), consume: vi.fn(), config: vi.fn(),
}));
vi.mock("@/lib/rate-limit", () => ({
    createRateLimiter: (config: RateLimitConfig) => ({
        check: (key: string) => mocks.check(config.keyGenerator!(key)),
    }),
    getClientIp: mocks.ip,
}));
vi.mock("@/lib/auth/email-verification", () => ({ requestEmailVerification: mocks.send, consumeEmailVerification: mocks.consume }));
vi.mock("@/lib/email/config", () => ({ getEmailConfiguration: mocks.config }));

import * as registration from "@/app/api/auth/register/route";
import * as resend from "@/app/api/auth/resend-verification/route";
import * as verify from "@/app/api/auth/verify-email/route";

const token = "a".repeat(64);
const email = "user@example.com";
const bodies = {
    register: { email, password: "Password1" }, resend: { email }, verify: { email, token },
};
const routes = [
    { name: "register" as const, route: registration },
    { name: "resend" as const, route: resend },
    { name: "verify" as const, route: verify },
];
function request(body: unknown, headers: Record<string, string> = {}) {
    return new Request("https://chat.example.com/api/auth/test", {
        method: "POST", headers: {
            "content-type": "application/json", origin: "https://chat.example.com",
            host: "chat.example.com", "x-real-ip": "192.0.2.4", ...headers,
        }, body: JSON.stringify(body),
    });
}
beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("APP_ORIGIN", "https://chat.example.com");
    vi.stubEnv("EMAIL_VERIFICATION_REQUIRED", "true");
    vi.stubEnv("NODE_ENV", "production");
    mocks.ip.mockReturnValue("192.0.2.4");
    mocks.check.mockResolvedValue({ limited: false, remaining: 3, resetTime: 0, retryAfter: 0 });
    mocks.consume.mockResolvedValue(true);
    mocks.send.mockResolvedValue(undefined);
});
afterEach(() => vi.unstubAllEnvs());

for (const { name, route } of routes) {
    describe(`${name} guarded endpoint`, () => {
        it("exports POST only; scanners cannot consume via GET", () => {
            expect(route).not.toHaveProperty("GET");
            expect(route).not.toHaveProperty("HEAD");
        });

        it.each(["https://evil.example", "null", "", "https://chat.example.com.evil", "https://chat.example.com/path"])("blocks origin %s before body parsing and side effects", async (origin) => {
            const req = request(bodies[name], { origin });
            const response = await route.POST(req);
            expect(response.status).toBe(403);
            expect(req.bodyUsed).toBe(false);
            expect(mocks.check).not.toHaveBeenCalled();
            expect(mocks.send).not.toHaveBeenCalled();
            expect(mocks.consume).not.toHaveBeenCalled();
        });

        it("blocks explicit cross-site metadata", async () => {
            const response = await route.POST(request(bodies[name], { "sec-fetch-site": "cross-site" }));
            expect(response.status).toBe(403);
            expect(mocks.check).not.toHaveBeenCalled();
        });

        it("validates JSON content type before reading the request", async () => {
            const req = request(bodies[name], { "content-type": "text/plain" });
            expect((await route.POST(req)).status).toBe(415);
            expect(req.bodyUsed).toBe(false);
            expect(mocks.check).not.toHaveBeenCalled();
        });

        it("returns 503 for bad canonical configuration without fallback to attacker Host", async () => {
            vi.stubEnv("APP_ORIGIN", "not-a-url");
            const req = request(bodies[name], { host: "evil.example" });
            expect((await route.POST(req)).status).toBe(503);
            expect(req.bodyUsed).toBe(false);
            expect(mocks.check).not.toHaveBeenCalled();
        });

        it("returns 404 when strict verification is not explicitly enabled", async () => {
            vi.stubEnv("EMAIL_VERIFICATION_REQUIRED", "false");
            expect((await route.POST(request(bodies[name]))).status).toBe(404);
            expect(mocks.config).not.toHaveBeenCalled();
            expect(mocks.check).not.toHaveBeenCalled();
        });

        it("returns a sanitized 503 for SMTP configuration and async backend failures", async () => {
            mocks.config.mockImplementationOnce(() => { throw new Error("smtp-password"); });
            const configResponse = await route.POST(request(bodies[name]));
            expect(configResponse.status).toBe(503);
            expect(await configResponse.json()).toEqual({ error: "Service unavailable" });
            mocks.check.mockRejectedValue(new Error("Redis url token"));
            const response = await route.POST(request(bodies[name]));
            expect(response.status).toBe(503);
            expect(await response.json()).toEqual({ error: "Service unavailable" });
            expect(mocks.send).not.toHaveBeenCalled();
            expect(mocks.consume).not.toHaveBeenCalled();
        });

        it.each([1, 2])("stops when limiter %i is exhausted", async (position) => {
            if (position === 2) mocks.check.mockResolvedValueOnce({ limited: false, remaining: 1, resetTime: 0, retryAfter: 0 });
            mocks.check.mockResolvedValue({ limited: true, remaining: 0, resetTime: 0, retryAfter: 30 });
            const response = await route.POST(request(bodies[name]));
            expect(response.status).toBe(429);
            expect(response.headers.get("retry-after")).toBe("30");
            expect(mocks.send).not.toHaveBeenCalled();
            expect(mocks.consume).not.toHaveBeenCalled();
        });

        it("limits trusted IP and normalized email separately without exposing email in backend keys", async () => {
            const req = request({ ...bodies[name], email: " USER@EXAMPLE.COM " });
            expect((await route.POST(req)).status).toBe(name === "verify" ? 200 : 202);
            expect(mocks.ip).toHaveBeenCalledWith(req);
            expect(mocks.check).toHaveBeenNthCalledWith(1, expect.stringContaining(":ip:192.0.2.4"));
            expect(mocks.check).toHaveBeenNthCalledWith(2, expect.stringContaining(createHash("sha256").update(email).digest("hex")));
        });

        it.each([null, {}, { email: "not-email" }, { ...bodies[name], injected: true }])("rejects malformed body %j", async (body) => {
            expect((await route.POST(request(body))).status).toBe(400);
            expect(mocks.send).not.toHaveBeenCalled();
            expect(mocks.consume).not.toHaveBeenCalled();
        });

        it("bounds JSON body size", async () => {
            expect((await route.POST(request({ email: "a".repeat(4096) }))).status).toBe(413);
            expect(mocks.send).not.toHaveBeenCalled();
        });
    });
}

describe("verification result contracts", () => {
    it("returns the same accepted response for signup and resend with no account metadata", async () => {
        const a = await registration.POST(request(bodies.register));
        const b = await resend.POST(request(bodies.resend));
        expect(a.status).toBe(202);
        expect(b.status).toBe(202);
        expect(await a.json()).toEqual(await b.json());
        expect(a.headers.get("cache-control")).toBe("no-store");
    });

    it("validates password complexity and the bcrypt byte limit", async () => {
        for (const password of ["weak", "PASSWORD1", "password1", "Password", "Password1" + "é".repeat(32)]) {
            expect((await registration.POST(request({ email, password }))).status).toBe(400);
        }
        expect(mocks.send).not.toHaveBeenCalled();
    });

    it.each(["", "b".repeat(63), "Z".repeat(64)])("rejects malformed token %s without consumption", async (value) => {
        expect((await verify.POST(request({ email, token: value }))).status).toBe(400);
        expect(mocks.consume).not.toHaveBeenCalled();
    });

    it("binds confirmation to email and returns one generic error for invalid, expired or replayed tokens", async () => {
        mocks.consume.mockResolvedValue(false);
        const response = await verify.POST(request({ email, token }));
        expect(mocks.consume).toHaveBeenCalledWith(token, email);
        expect(response.status).toBe(400);
        expect(await response.json()).toEqual({ error: "Invalid or expired verification link" });
    });

    it("redacts mail and database failures", async () => {
        mocks.send.mockRejectedValue(new Error("SMTP password secret"));
        mocks.consume.mockRejectedValue(new Error("DB secret"));
        for (const { name, route } of routes) {
            const response = await route.POST(request(bodies[name]));
            expect(response.status).toBe(503);
            expect(await response.json()).toEqual({ error: "Service unavailable" });
        }
    });
});
