import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
    getServerSession, getDecryptedKey, markKeyValid, validateApiKey, checkRateLimit,
} = vi.hoisted(() => ({
    getServerSession: vi.fn(),
    getDecryptedKey: vi.fn(),
    markKeyValid: vi.fn(),
    validateApiKey: vi.fn(),
    checkRateLimit: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getServerSession }));
vi.mock("@/lib/api/csrf", () => ({ guardMutationRequest: () => null }));
vi.mock("@/lib/db/queries/api-keys", () => ({ getDecryptedKey, markKeyValid }));
vi.mock("@/lib/mastra", () => ({ validateApiKey }));
// @/lib/mastra/providers is deliberately NOT mocked: the registry check under
// test is only meaningful against the real provider list.
vi.mock("@/lib/rate-limit", () => ({
    apiKeyRateLimiter: { check: checkRateLimit, reset: vi.fn() },
    getRateLimitHeaders: () => ({}),
    isRateLimitBackendUnavailableError: () => false,
}));

import { POST } from "./route";

const SECRET = "sk-super-secret-stored-value";

function request(providerId = "openai") {
    return new Request(`http://localhost:3000/api/api-keys/${providerId}/validate`, {
        method: "POST",
        headers: { Origin: "http://localhost:3000" },
    });
}

beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    getServerSession.mockResolvedValue({ user: { id: "user-123" } });
    checkRateLimit.mockResolvedValue({ limited: false, remaining: 9, retryAfter: 0, resetTime: Date.now() + 60_000 });
    getDecryptedKey.mockResolvedValue(SECRET);
    validateApiKey.mockResolvedValue(true);
    markKeyValid.mockResolvedValue(undefined);
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe("POST /api/api-keys/[providerId]/validate (3.5)", () => {
    it("confirms a stored key and records the verdict", async () => {
        const response = await POST(request("openai"), { params: Promise.resolve({ providerId: "openai" }) });

        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toEqual({ providerId: "openai", valid: true });
        expect(getDecryptedKey).toHaveBeenCalledWith("user-123", "openai");
        expect(validateApiKey).toHaveBeenCalledWith("openai", SECRET);
        expect(markKeyValid).toHaveBeenCalledWith("user-123", "openai", true);
    });

    it("records a refusal instead of pretending the key is fine", async () => {
        validateApiKey.mockResolvedValueOnce(false);

        const response = await POST(request("openai"), { params: Promise.resolve({ providerId: "openai" }) });

        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toMatchObject({ valid: false });
        expect(markKeyValid).toHaveBeenCalledWith("user-123", "openai", false);
    });

    it("never returns the credential", async () => {
        const response = await POST(request("openai"), { params: Promise.resolve({ providerId: "openai" }) });
        const text = await response.text();

        expect(text).not.toContain(SECRET);
    });

    it("refuses a provider outside the registry before touching the vault", async () => {
        const response = await POST(request("not-a-provider"), {
            params: Promise.resolve({ providerId: "not-a-provider" }),
        });

        expect(response.status).toBe(400);
        expect(getDecryptedKey).not.toHaveBeenCalled();
        expect(validateApiKey).not.toHaveBeenCalled();
    });

    it("says 404 when nothing is stored, without billing a provider request", async () => {
        getDecryptedKey.mockResolvedValueOnce(null);

        const response = await POST(request("groq"), { params: Promise.resolve({ providerId: "groq" }) });

        expect(response.status).toBe(404);
        expect(validateApiKey).not.toHaveBeenCalled();
        expect(markKeyValid).not.toHaveBeenCalled();
    });

    it("rate limits, because every check costs the user real money", async () => {
        checkRateLimit.mockResolvedValueOnce({
            limited: true, remaining: 0, retryAfter: 42, resetTime: Date.now() + 42_000,
        });

        const response = await POST(request("openai"), { params: Promise.resolve({ providerId: "openai" }) });

        expect(response.status).toBe(429);
        expect(response.headers.get("Retry-After")).toBe("42");
        expect(validateApiKey).not.toHaveBeenCalled();
    });

    it("requires a session", async () => {
        getServerSession.mockResolvedValueOnce(null);

        const response = await POST(request("openai"), { params: Promise.resolve({ providerId: "openai" }) });

        expect(response.status).toBe(401);
        expect(getDecryptedKey).not.toHaveBeenCalled();
    });
});
