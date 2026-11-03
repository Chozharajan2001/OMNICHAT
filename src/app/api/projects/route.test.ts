import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getServerSession, createProject, checkRateLimit, Duplicates, Unavailable } = vi.hoisted(() => ({
    getServerSession: vi.fn(),
    createProject: vi.fn(),
    checkRateLimit: vi.fn(),
    Duplicates: class extends Error {
        constructor() {
            super("A project with this name already exists");
            this.name = "DuplicateProjectNameError";
        }
    },
    Unavailable: class extends Error {
        constructor() {
            super("rate limit backend is not configured");
            this.name = "RateLimitBackendUnavailableError";
        }
    },
}));

vi.mock("@/lib/auth/session", () => ({ getServerSession }));
vi.mock("@/lib/api/csrf", () => ({ guardMutationRequest: () => null }));
vi.mock("@/lib/rate-limit", () => ({
    createRateLimiter: () => ({ check: checkRateLimit, reset: vi.fn() }),
    getRateLimitHeaders: () => ({}),
    isRateLimitBackendUnavailableError: (error: unknown) => error instanceof Unavailable,
}));
vi.mock("@/lib/db/queries/projects", () => ({
    createProject,
    getProjects: vi.fn(),
    // The route's 400 is an `instanceof` against this export, so the mock must
    // hand back one identity consistently.
    DuplicateProjectNameError: Duplicates,
}));

import { POST } from "./route";

function postRequest(body: unknown) {
    return new Request("http://localhost:3000/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: "http://localhost:3000" },
        body: JSON.stringify(body),
    });
}

beforeEach(() => {
    // Without this the vi.fn() calls accumulate across cases and every
    // "not.toHaveBeenCalled()" below would be measuring the previous test.
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    getServerSession.mockResolvedValue({ user: { id: "user-123" } });
    checkRateLimit.mockResolvedValue({ limited: false, remaining: 29, resetTime: Date.now() + 60_000 });
    createProject.mockResolvedValue({ id: "p1", name: "Alpha" });
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe("POST /api/projects failure mapping (3.4)", () => {
    it("answers 400 when the (userId, name) pair is already taken", async () => {
        createProject.mockRejectedValueOnce(new Duplicates());

        const response = await POST(postRequest({ name: "Alpha" }));

        expect(response.status).toBe(400);
        const body = await response.json();
        expect(body.error).toBe("A project with this name already exists");
        expect(body.details).toEqual([
            {
                code: "custom",
                path: ["name"],
                message: "A project with this name already exists",
            },
        ]);
    });

    it("keeps a schema violation at 400", async () => {
        const response = await POST(postRequest({ name: "x".repeat(200) }));

        expect(response.status).toBe(400);
        expect((await response.json()).error).toBe("Invalid request");
        expect(createProject).not.toHaveBeenCalled();
    });

    it("keeps an unavailable rate-limit backend at 503", async () => {
        checkRateLimit.mockRejectedValueOnce(new Unavailable());

        const response = await POST(postRequest({ name: "Alpha" }));

        expect(response.status).toBe(503);
        expect((await response.json()).error).toBe("Service unavailable");
        // That error's message can carry the internal endpoint or token, so it
        // must be answered before anything reaches the log.
        expect(console.error).not.toHaveBeenCalled();
    });

    it("does not turn an unrelated failure into a client error", async () => {
        createProject.mockRejectedValueOnce(new Error("database unreachable"));

        const response = await POST(postRequest({ name: "Alpha" }));

        expect(response.status).toBe(500);
        expect((await response.json()).error).toBe("Failed to create project");
    });

    it("still refuses a limited writer with 429", async () => {
        checkRateLimit.mockResolvedValueOnce({
            limited: true,
            remaining: 0,
            retryAfter: 30,
            resetTime: Date.now() + 30_000,
        });

        const response = await POST(postRequest({ name: "Alpha" }));

        expect(response.status).toBe(429);
        expect(createProject).not.toHaveBeenCalled();
    });
});
