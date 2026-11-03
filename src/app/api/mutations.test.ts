import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RateLimitBackendUnavailableError, type RateLimitResult } from "@/lib/rate-limit";
import { POST as chat } from "./chat/route";
import { GET as listKeys, POST as saveKey } from "./api-keys/route";
import { DELETE as deleteKey } from "./api-keys/[providerId]/route";
import { GET as listConversations, POST as createConversation, DELETE as deleteAllConversations } from "./conversations/route";
import { GET as getConversation, PATCH as updateConversation, DELETE as deleteConversation } from "./conversations/[id]/route";
import { GET as getPreferences, PATCH as updatePreferences } from "./preferences/route";
import { GET as listProjects, POST as createProject } from "./projects/route";
import { DELETE as deleteProject } from "./projects/[id]/route";

// Real handlers, schemas, CSRF checks, error classes, and header formatting.
// Every auth/DB/provider seam is inert; no real sessions, Redis, or SQL are used.
const mocks = vi.hoisted(() => ({
    session: vi.fn<() => Promise<{ user?: { id?: string } } | null>>(),
    chatLimit: vi.fn<(id: string) => Promise<RateLimitResult>>(),
    keyLimit: vi.fn<(id: string) => Promise<RateLimitResult>>(),
    writeLimit: vi.fn<(id: string) => Promise<RateLimitResult>>(),
    effects: {
        getDecryptedKey: vi.fn(), saveApiKey: vi.fn(), deleteApiKey: vi.fn(), getUserKeys: vi.fn(),
        getConversations: vi.fn(), getConversationWithMessages: vi.fn(), createConversation: vi.fn(),
        updateConversation: vi.fn(), deleteConversation: vi.fn(), deleteAllConversations: vi.fn(),
        getPreferences: vi.fn(), upsertPreferences: vi.fn(),
        createProject: vi.fn(), deleteProject: vi.fn(), getProjects: vi.fn(),
        validateApiKey: vi.fn(), createLanguageModel: vi.fn(), streamText: vi.fn(), transaction: vi.fn(),
        recordChatMessage: vi.fn(),
    },
    fetch: vi.fn<typeof fetch>(),
}));

vi.mock("@/lib/auth/session", () => ({ getServerSession: mocks.session }));
vi.mock("@/lib/db/queries/api-keys", () => mocks.effects);
vi.mock("@/lib/db/queries/conversations", () => mocks.effects);
vi.mock("@/lib/db/queries/preferences", () => mocks.effects);
vi.mock("@/lib/db/queries/projects", async () => {
    const actual = await vi.importActual<typeof import("@/lib/db/queries/projects")>(
        "@/lib/db/queries/projects"
    );
    // The route's duplicate-name mapping is an instanceof against this class, so
    // the mock must expose the real one while keeping the recorded effects.
    return { ...mocks.effects, DuplicateProjectNameError: actual.DuplicateProjectNameError };
});
vi.mock("@/lib/db/prisma", () => ({ prisma: { $transaction: mocks.effects.transaction } }));
vi.mock("@/lib/mastra", () => mocks.effects);
vi.mock("@/lib/mastra/index", () => mocks.effects);
vi.mock("ai", () => ({ streamText: mocks.effects.streamText }));
vi.mock("@/lib/metrics", () => ({ recordChatMessage: mocks.effects.recordChatMessage }));
vi.mock("@/lib/rate-limit", async () => {
    const actual = await vi.importActual<typeof import("@/lib/rate-limit")>("@/lib/rate-limit");
    return {
        ...actual,
        chatRateLimiter: { check: mocks.chatLimit },
        apiKeyRateLimiter: { check: mocks.keyLimit },
        createRateLimiter: () => ({ check: mocks.writeLimit }),
    };
});

const ORIGIN = "http://localhost";
const PUBLIC_ORIGIN = "https://chat.example:8443";
const USER = "mutation-owner";
const ID = "clx1234567890abcdefghijkl";
const KEY = "synthetic-api-key-not-a-secret";
const RATE: RateLimitResult = { limited: false, remaining: 7, resetTime: 1_800_000_060_001, retryAfter: 0 };
const CONTEXT = { params: Promise.resolve({ id: ID }) };
const KEY_CONTEXT = { params: Promise.resolve({ providerId: "openai" }) };
const CONVERSATION = { id: ID, title: "Owned conversation" };
const PROJECT = { id: ID, name: "Owned project", color: "blue" };
const PREFERENCES = { theme: "dark" };
const effects = mocks.effects;

interface Mutation {
    name: string;
    method: "POST" | "PATCH" | "DELETE";
    path: string;
    handle: (request: Request) => Promise<Response>;
    body?: Record<string, unknown>;
    status: number;
    response: unknown;
    verify: () => void;
}

const mutations: Mutation[] = [
    {
        name: "POST chat", method: "POST", path: "/api/chat", handle: chat,
        body: { messages: [{ role: "user", content: "Hello" }], providerId: "openai", modelId: "gpt-4o", privateMode: true },
        status: 200, response: "Synthetic stream",
        verify: () => {
            expect(effects.getDecryptedKey).toHaveBeenCalledExactlyOnceWith(USER, "openai");
            expect(effects.createLanguageModel).toHaveBeenCalledExactlyOnceWith("openai", "gpt-4o", KEY);
            expect(effects.streamText).toHaveBeenCalledTimes(1);
            expect(effects.createConversation).not.toHaveBeenCalled();
        },
    },
    {
        name: "POST api-keys", method: "POST", path: "/api/api-keys", handle: saveKey,
        body: { providerId: "openai", apiKey: KEY }, status: 200, response: { success: true },
        verify: () => {
            expect(effects.validateApiKey).toHaveBeenCalledExactlyOnceWith("openai", KEY);
            expect(effects.saveApiKey).toHaveBeenCalledExactlyOnceWith(USER, "openai", KEY, true);
        },
    },
    {
        name: "DELETE api-keys/provider", method: "DELETE", path: "/api/api-keys/openai",
        handle: (req) => deleteKey(req, KEY_CONTEXT), status: 200, response: { success: true },
        verify: () => { expect(effects.deleteApiKey).toHaveBeenCalledExactlyOnceWith(USER, "openai"); },
    },
    {
        name: "POST conversations", method: "POST", path: "/api/conversations", handle: createConversation,
        body: { title: "Owned conversation", providerId: "openai", modelId: "gpt-4o", projectId: ID },
        status: 201, response: CONVERSATION,
        verify: () => {
            expect(effects.createConversation).toHaveBeenCalledExactlyOnceWith(USER, "openai", "gpt-4o", {
                title: "Owned conversation", projectId: ID, folderId: undefined,
            });
        },
    },
    {
        name: "DELETE conversations", method: "DELETE", path: "/api/conversations", handle: deleteAllConversations,
        status: 200, response: { success: true, deletedCount: 3 },
        verify: () => { expect(effects.deleteAllConversations).toHaveBeenCalledExactlyOnceWith(USER); },
    },
    {
        name: "PATCH conversations/id", method: "PATCH", path: `/api/conversations/${ID}`,
        handle: (req) => updateConversation(req, CONTEXT), body: { title: "Updated", archived: true },
        status: 200, response: CONVERSATION,
        verify: () => {
            expect(effects.updateConversation).toHaveBeenCalledExactlyOnceWith(ID, USER, {
                title: "Updated", projectId: undefined, folderId: undefined, archivedAt: expect.any(Date),
            });
        },
    },
    {
        name: "DELETE conversations/id", method: "DELETE", path: `/api/conversations/${ID}`,
        handle: (req) => deleteConversation(req, CONTEXT), status: 200, response: { success: true },
        verify: () => { expect(effects.deleteConversation).toHaveBeenCalledExactlyOnceWith(ID, USER); },
    },
    {
        name: "PATCH preferences", method: "PATCH", path: "/api/preferences", handle: updatePreferences,
        body: PREFERENCES, status: 200, response: { preferences: PREFERENCES },
        verify: () => { expect(effects.upsertPreferences).toHaveBeenCalledExactlyOnceWith(USER, PREFERENCES); },
    },
    {
        name: "POST projects", method: "POST", path: "/api/projects", handle: createProject,
        body: { name: PROJECT.name, color: PROJECT.color }, status: 201, response: { project: PROJECT },
        verify: () => { expect(effects.createProject).toHaveBeenCalledExactlyOnceWith(USER, PROJECT.name, PROJECT.color); },
    },
    {
        name: "DELETE projects/id", method: "DELETE", path: `/api/projects/${ID}`,
        handle: (req) => deleteProject(req, CONTEXT), status: 200, response: { success: true },
        verify: () => { expect(effects.deleteProject).toHaveBeenCalledExactlyOnceWith(USER, ID); },
    },
];

function request(route: Mutation, origin = ORIGIN, url = `${ORIGIN}${route.path}`) {
    const headers = new Headers({ Origin: origin, "Sec-Fetch-Site": "same-origin" });
    if (route.body) headers.set("Content-Type", "application/json; charset=utf-8");
    return new Request(url, {
        method: route.method, headers,
        body: route.body ? JSON.stringify(route.body) : undefined,
    });
}

function noOperations() {
    for (const effect of Object.values(effects)) expect(effect).not.toHaveBeenCalled();
}

function noRateConsumption() {
    for (const limiter of [mocks.chatLimit, mocks.keyLimit, mocks.writeLimit]) expect(limiter).not.toHaveBeenCalled();
}

async function expectEarlyRejection(route: Mutation, req: Request, status: number, error: string) {
    const parse = vi.spyOn(req, "json");
    const response = await route.handle(req);
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ error });
    expect(req.bodyUsed).toBe(false);
    expect(parse).not.toHaveBeenCalled();
    expect(mocks.session).not.toHaveBeenCalled();
    noRateConsumption();
    noOperations();
    expect(console.error).not.toHaveBeenCalled();
}

beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("APP_ORIGIN", ORIGIN);
    vi.stubEnv("NEXTAUTH_URL", undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.fetch.mockRejectedValue(new Error("Network access is forbidden"));
    vi.stubGlobal("fetch", mocks.fetch);
    mocks.session.mockResolvedValue({ user: { id: USER } });
    for (const limiter of [mocks.chatLimit, mocks.keyLimit, mocks.writeLimit]) limiter.mockResolvedValue({ ...RATE });
    effects.getDecryptedKey.mockResolvedValue(KEY);
    effects.validateApiKey.mockResolvedValue(true);
    effects.createConversation.mockResolvedValue(CONVERSATION);
    effects.updateConversation.mockResolvedValue(CONVERSATION);
    effects.getConversationWithMessages.mockResolvedValue(CONVERSATION);
    effects.deleteAllConversations.mockResolvedValue(3);
    effects.getPreferences.mockResolvedValue(PREFERENCES);
    effects.upsertPreferences.mockResolvedValue(PREFERENCES);
    effects.createProject.mockResolvedValue(PROJECT);
    effects.getUserKeys.mockResolvedValue([]);
    effects.getConversations.mockResolvedValue({ data: [] });
    effects.getProjects.mockResolvedValue([PROJECT]);
    effects.createLanguageModel.mockReturnValue({ testOnly: true });
    effects.streamText.mockReturnValue({
        toTextStreamResponse: (init: ResponseInit) => new Response("Synthetic stream", init),
    });
});

afterEach(() => {
    try {
        expect(mocks.fetch).not.toHaveBeenCalled();
    } finally {
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
        vi.unstubAllEnvs();
    }
});

describe.each(mutations)("$name guard integration", (route) => {
    it.each([null, "null", "https://attacker.example", "http://localhost:3000", "https://localhost", "http://sub.localhost", "http://localhost/"])(
        "rejects Origin %s before every side effect", async (origin) => {
            const req = request(route);
            if (origin === null) req.headers.delete("Origin");
            else req.headers.set("Origin", origin);
            req.headers.set("Referer", `${ORIGIN}/settings`);
            await expectEarlyRejection(route, req, 403, "Forbidden");
        },
    );

    it("rejects cross-site Fetch Metadata even with an exact Origin", async () => {
        const req = request(route);
        req.headers.set("Sec-Fetch-Site", "cross-site");
        await expectEarlyRejection(route, req, 403, "Forbidden");
    });

    it("ignores forged Host and forwarding headers", async () => {
        const req = request(route, "https://attacker.example");
        req.headers.set("Host", "attacker.example");
        req.headers.set("X-Forwarded-Host", "attacker.example");
        req.headers.set("X-Forwarded-Proto", "https");
        req.headers.set("Forwarded", "host=attacker.example;proto=https");
        await expectEarlyRejection(route, req, 403, "Forbidden");
    });

    it.each([undefined, "", "malformed", "https://user:secret@chat.example", "https://chat.example:invalid"])(
        "fails closed with safe 503 for production config %s", async (config) => {
            vi.stubEnv("NODE_ENV", "production");
            vi.stubEnv("APP_ORIGIN", config);
            await expectEarlyRejection(route, request(route), 503, "Service unavailable");
        },
    );

    it("preserves successful owned behavior with JSON charset or a bodyless DELETE", async () => {
        const response = await route.handle(request(route));
        expect(response.status).toBe(route.status);
        const body = typeof route.response === "string" ? await response.text() : await response.json();
        expect(body).toEqual(route.response);
        expect(mocks.session).toHaveBeenCalledTimes(1);
        route.verify();
    });

    it("accepts the configured public origin behind an internal production proxy", async () => {
        vi.stubEnv("NODE_ENV", "production");
        vi.stubEnv("APP_ORIGIN", PUBLIC_ORIGIN);
        const req = request(route, PUBLIC_ORIGIN, `http://internal:3000${route.path}`);
        req.headers.set("Host", "internal:3000");
        req.headers.set("X-Forwarded-Host", "untrusted.example");
        const response = await route.handle(req);
        expect(response.status).toBe(route.status);
        route.verify();
    });

    it("rejects a mismatched public port behind a production proxy", async () => {
        vi.stubEnv("NODE_ENV", "production");
        vi.stubEnv("APP_ORIGIN", PUBLIC_ORIGIN);
        await expectEarlyRejection(route, request(route, "https://chat.example", `http://internal:3000${route.path}`), 403, "Forbidden");
    });

    it("still requires authentication after valid CSRF/media checks", async () => {
        mocks.session.mockResolvedValueOnce(null);
        const req = request(route);
        const response = await route.handle(req);
        expect(response.status).toBe(401);
        expect(await response.json()).toEqual({ error: "Unauthorized" });
        expect(req.bodyUsed).toBe(false);
        noRateConsumption();
        noOperations();
    });
});

describe.each(mutations.filter((route) => route.body))("$name JSON gate", (route) => {
    it.each([null, "text/plain", "application/x-www-form-urlencoded", "multipart/form-data", "application/problem+json"])(
        "rejects Content-Type %s before authentication or rate consumption", async (type) => {
            const req = request(route);
            if (type === null) req.headers.delete("Content-Type");
            else req.headers.set("Content-Type", type);
            await expectEarlyRejection(route, req, 415, "Content-Type must be application/json");
        },
    );
});

function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((done) => { resolve = done; });
    return { promise, resolve };
}

const limitedRoutes = [
    { name: "chat", route: mutations[0], limiter: mocks.chatLimit, limit: 60 },
    { name: "api-keys", route: mutations[1], limiter: mocks.keyLimit, limit: 10 },
    { name: "projects", route: mutations[8], limiter: mocks.writeLimit, limit: 30 },
];

describe.each(limitedRoutes)("$name async rate-limit integration", ({ route, limiter, limit }) => {
    it.each(["configuration", "timeout", "transport", "http", "response"] as const)(
        "maps backend %s failure to safe 503 and stops all later operations", async (reason) => {
            const error = new RateLimitBackendUnavailableError(reason);
            error.message = "internal endpoint/token must not escape";
            limiter.mockRejectedValueOnce(error);
            const req = request(route);
            const response = await route.handle(req);
            expect(response.status).toBe(503);
            expect(await response.json()).toEqual({ error: "Service unavailable" });
            expect(response.headers.get("Retry-After")).toBeNull();
            expect(req.bodyUsed).toBe(false);
            expect(limiter).toHaveBeenCalledExactlyOnceWith(USER);
            noOperations();
            expect(console.error).not.toHaveBeenCalled();
        },
    );

    it("preserves quota 429 and exact Retry-After/rate-limit headers", async () => {
        limiter.mockResolvedValueOnce({ ...RATE, limited: true, remaining: 0, retryAfter: 17 });
        const req = request(route);
        const response = await route.handle(req);
        expect(response.status).toBe(429);
        expect(response.headers.get("Retry-After")).toBe("17");
        expect(response.headers.get("X-RateLimit-Limit")).toBe(String(limit));
        expect(response.headers.get("X-RateLimit-Remaining")).toBe("0");
        expect(response.headers.get("X-RateLimit-Reset")).toBe("1800000061");
        expect(req.bodyUsed).toBe(false);
        noOperations();
    });

    it("waits for a pending rate-limit check before parsing or starting work", async () => {
        const entered = deferred<void>();
        const gate = deferred<RateLimitResult>();
        limiter.mockImplementationOnce(() => { entered.resolve(); return gate.promise; });
        const req = request(route);
        let settled = false;
        const pending = route.handle(req).then((response) => { settled = true; return response; });
        try {
            await entered.promise;
            expect(settled).toBe(false);
            expect(req.bodyUsed).toBe(false);
            noOperations();
        } finally {
            gate.resolve({ ...RATE, limited: true, remaining: 0, retryAfter: 17 });
        }
        expect((await pending).status).toBe(429);
        noOperations();
    });

    it("does not misclassify unknown failures as backend unavailability", async () => {
        limiter.mockRejectedValueOnce(new Error("synthetic private details"));
        const req = request(route);
        const response = await route.handle(req);
        expect(response.status).toBe(500);
        expect(await response.text()).not.toContain("synthetic private details");
        expect(req.bodyUsed).toBe(false);
        noOperations();
    });
});

describe("API-key quota identity and existing behavior", () => {
    it("uses only the authenticated user despite changing client IP headers", async () => {
        for (const ip of ["198.51.100.1", "203.0.113.9"]) {
            const req = request(mutations[1]);
            req.headers.set("X-Real-IP", ip);
            req.headers.set("X-Forwarded-For", ip);
            expect((await saveKey(req)).status).toBe(200);
        }
        expect(mocks.keyLimit.mock.calls).toEqual([[USER], [USER]]);
        expect(mocks.session.mock.invocationCallOrder[0]).toBeLessThan(mocks.keyLimit.mock.invocationCallOrder[0]);
    });

    it("keeps quotas separate for different authenticated users on the same IP", async () => {
        mocks.session.mockResolvedValueOnce({ user: { id: "other-user" } });
        await saveKey(request(mutations[1]));
        await saveKey(request(mutations[1]));
        expect(mocks.keyLimit.mock.calls).toEqual([["other-user"], [USER]]);
    });

    it("preserves skipped provider validation and marks the saved key unvalidated", async () => {
        const route = { ...mutations[1], body: { ...mutations[1].body, validate: false } };
        expect((await saveKey(request(route))).status).toBe(200);
        expect(effects.validateApiKey).not.toHaveBeenCalled();
        expect(effects.saveApiKey).toHaveBeenCalledExactlyOnceWith(USER, "openai", KEY, false);
    });

    it("does not save a rejected provider key", async () => {
        effects.validateApiKey.mockResolvedValueOnce(false);
        expect((await saveKey(request(mutations[1]))).status).toBe(400);
        expect(effects.saveApiKey).not.toHaveBeenCalled();
    });

    it("preserves idempotent deletion of an already missing key", async () => {
        effects.deleteApiKey.mockRejectedValueOnce({ code: "P2025" });
        const response = await mutations[2].handle(request(mutations[2]));
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ success: true });
    });
});

describe("existing read and ownership behavior", () => {
    it("keeps authenticated GET routes usable without Origin or Content-Type", async () => {
        const req = new Request(`${ORIGIN}/api/conversations`);
        for (const response of await Promise.all([
            listKeys(), listConversations(req), getConversation(req, CONTEXT), getPreferences(), listProjects(),
        ])) expect(response.status).toBe(200);
        noRateConsumption();
    });

    it.each([
        { route: mutations[3], effect: effects.createConversation, message: "Project not found or access denied" },
        { route: mutations[5], effect: effects.updateConversation, message: "Conversation not found or access denied" },
        { route: mutations[6], effect: effects.deleteConversation, message: "Conversation not found or access denied" },
    ])("preserves ownership 404 after valid guards for $route.name", async ({ route, effect, message }) => {
        effect.mockRejectedValueOnce(new Error(message));
        expect((await route.handle(request(route))).status).toBe(404);
    });
});
