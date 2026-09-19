import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatMessage } from "@/lib/ai/context-manager";
import { POST } from "./route";

// Phase 4.2: exercise the real handler, validation, context preparation, and
// header formatting. External auth, DB, and provider modules never initialize.
// The SDK response is inert; explicitly invoking the captured onFinish tests
// route callback behavior, NOT live streaming, SDK retries, or elapsed timeouts.
type FinishPayload = {
    text: string;
    usage?: { inputTokens?: number; outputTokens?: number };
};

type StreamOptions = {
    model: unknown;
    messages: ChatMessage[];
    temperature: number;
    maxOutputTokens: number;
    onFinish: (result: FinishPayload) => Promise<void>;
};

type ConversationFixture = {
    id: string;
    systemPrompt: string | null;
    messages: ChatMessage[];
};

type MessageWrite = {
    data: {
        conversationId: string;
        role: ChatMessage["role"];
        content: string;
        modelId: string;
        providerId: string;
        tokenCount?: number;
    };
};

type TransactionClient = {
    message: { create: (input: MessageWrite) => Promise<unknown> };
};

const mocks = vi.hoisted(() => ({
    getServerSession: vi.fn<() => Promise<{ user?: { id?: string } } | null>>(),
    getDecryptedKey: vi.fn<(userId: string, providerId: string) => Promise<string | null>>(),
    getConversationWithMessages: vi.fn<(
        conversationId: string, userId: string
    ) => Promise<ConversationFixture | null>>(),
    createConversation: vi.fn<(
        userId: string, providerId: string, modelId: string,
        options: { title: string; systemPrompt?: string }
    ) => Promise<{ id: string }>>(),
    updateConversation: vi.fn<(
        conversationId: string, userId: string, data: { title: string }
    ) => Promise<unknown>>(),
    addMessage: vi.fn(),
    getPreferences: vi.fn<() => Promise<{ defaultSystemPrompt: string | null } | null>>(),
    createLanguageModel: vi.fn<(providerId: string, modelId: string, key: string) => unknown>(),
    streamText: vi.fn<(options: StreamOptions) => {
        toTextStreamResponse: (options?: ResponseInit) => Response;
    }>(),
    toTextStreamResponse: vi.fn<(options?: ResponseInit) => Response>(),
    transaction: vi.fn<(work: (tx: TransactionClient) => Promise<void>) => Promise<void>>(),
    messageCreate: vi.fn<(input: MessageWrite) => Promise<unknown>>(),
    checkRateLimit: vi.fn<typeof import("@/lib/rate-limit").chatRateLimiter.check>(),
    fetch: vi.fn<typeof fetch>(),
}));

vi.mock("@/lib/auth/session", () => ({ getServerSession: mocks.getServerSession }));
vi.mock("@/lib/db/queries/api-keys", () => ({ getDecryptedKey: mocks.getDecryptedKey }));
vi.mock("@/lib/db/queries/conversations", () => ({
    getConversationWithMessages: mocks.getConversationWithMessages,
    createConversation: mocks.createConversation,
    updateConversation: mocks.updateConversation,
    addMessage: mocks.addMessage,
}));
vi.mock("@/lib/db/queries/preferences", () => ({ getPreferences: mocks.getPreferences }));
vi.mock("@/lib/db/prisma", () => ({ prisma: { $transaction: mocks.transaction } }));
vi.mock("@/lib/mastra/index", () => ({ createLanguageModel: mocks.createLanguageModel }));
vi.mock("ai", () => ({ streamText: mocks.streamText }));
vi.mock("@/lib/rate-limit", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/rate-limit")>();
    return { ...actual, chatRateLimiter: { check: mocks.checkRateLimit } };
});

const USER_ID = "phase-42-user";
const EXISTING_ID = "clx1234567890abcdefghijkl";
const NEW_ID = "clx2234567890abcdefghijkl";
const RECOVERY_ID = "clx3234567890abcdefghijkl";
const FAKE_KEY = "not-a-real-provider-key";
const USER_TEXT = "Explain deterministic fault injection";
const ASSISTANT_TEXT = "This is a synthetic response.";
const MODEL = Object.freeze({ provider: "test-only", modelId: "test-only" });
const RATE_RESULT = {
    limited: false,
    remaining: 59,
    resetTime: 1_800_000_060_001,
    retryAfter: 0,
};
const tx: TransactionClient = { message: { create: mocks.messageCreate } };

function request(overrides: Record<string, unknown> = {}) {
    return new Request("http://localhost/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            messages: [{ role: "user", content: USER_TEXT }],
            providerId: "openai",
            modelId: "gpt-4o",
            ...overrides,
        }),
    });
}

function rawRequest(body: string) {
    return new Request("http://localhost/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
    });
}

function capturedStream(index = 0) {
    const options = mocks.streamText.mock.calls[index]?.[0];
    expect(options).toBeDefined();
    expect(options.onFinish).toEqual(expect.any(Function));
    return options;
}

function finish(index = 0, payload: FinishPayload = {
    text: ASSISTANT_TEXT,
    usage: { inputTokens: 11, outputTokens: 7 },
}) {
    return capturedStream(index).onFinish(payload);
}

function expectNoMessagePersistence() {
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.messageCreate).not.toHaveBeenCalled();
    expect(mocks.addMessage).not.toHaveBeenCalled();
    expect(mocks.updateConversation).not.toHaveBeenCalled();
}

function expectNoConversationAccess() {
    expect(mocks.getConversationWithMessages).not.toHaveBeenCalled();
    expect(mocks.createConversation).not.toHaveBeenCalled();
    expectNoMessagePersistence();
}

function expectNoProviderStart() {
    expect(mocks.createLanguageModel).not.toHaveBeenCalled();
    expect(mocks.streamText).not.toHaveBeenCalled();
    expect(mocks.toTextStreamResponse).not.toHaveBeenCalled();
}

function expectRateHeaders(response: Response, remaining = 59) {
    expect(response.headers.get("X-RateLimit-Limit")).toBe("60");
    expect(response.headers.get("X-RateLimit-Remaining")).toBe(String(remaining));
    // Use the real formatter, including its millisecond-to-second ceiling.
    expect(response.headers.get("X-RateLimit-Reset")).toBe("1800000061");
}

async function expectGenericFailure(response: Response, error: Error) {
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
        error: "An error occurred while processing your request",
    });
    expect(response.headers.get("X-Conversation-Id")).toBeNull();
    expect(console.error).toHaveBeenCalledExactlyOnceWith("Chat API error:", error);
    expectNoMessagePersistence();
}

function expectMessagePair(conversationId: string, content = USER_TEXT) {
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    expect(mocks.transaction).toHaveBeenCalledWith(expect.any(Function));
    expect(mocks.messageCreate).toHaveBeenCalledTimes(2);
    expect(mocks.messageCreate).toHaveBeenNthCalledWith(1, {
        data: {
            conversationId, role: "user", content,
            modelId: "gpt-4o", providerId: "openai", tokenCount: 11,
        },
    });
    expect(mocks.messageCreate).toHaveBeenNthCalledWith(2, {
        data: {
            conversationId, role: "assistant", content: ASSISTANT_TEXT,
            modelId: "gpt-4o", providerId: "openai", tokenCount: 7,
        },
    });
    expect(mocks.addMessage).not.toHaveBeenCalled();
}

function deferred() {
    let resolve!: () => void;
    const promise = new Promise<void>((done) => { resolve = done; });
    return { promise, resolve };
}

beforeEach(() => {
    vi.resetAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.fetch.mockImplementation(async () => {
        throw new Error("Network access is forbidden in route fault-injection tests");
    });
    vi.stubGlobal("fetch", mocks.fetch);
    mocks.getServerSession.mockResolvedValue({ user: { id: USER_ID } });
    mocks.checkRateLimit.mockReturnValue({ ...RATE_RESULT });
    mocks.getDecryptedKey.mockResolvedValue(FAKE_KEY);
    mocks.getConversationWithMessages.mockResolvedValue({
        id: EXISTING_ID, systemPrompt: null, messages: [],
    });
    mocks.createConversation.mockResolvedValue({ id: NEW_ID });
    mocks.getPreferences.mockResolvedValue(null);
    mocks.createLanguageModel.mockReturnValue(MODEL);
    mocks.streamText.mockImplementation(() => ({
        toTextStreamResponse: mocks.toTextStreamResponse,
    }));
    mocks.toTextStreamResponse.mockImplementation((options) => new Response(ASSISTANT_TEXT, options));
    // This executes route-owned transaction work against spies only. It does
    // not implement a database, commit, rollback, or atomicity guarantees.
    mocks.transaction.mockImplementation(async (work) => { await work(tx); });
    mocks.messageCreate.mockResolvedValue({ id: "synthetic-message" });
    mocks.updateConversation.mockResolvedValue({ id: NEW_ID });
});

afterEach(() => {
    try {
        expect(mocks.fetch).not.toHaveBeenCalled();
    } finally {
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    }
});

describe("POST /api/chat - Phase 4.2 deterministic fault injection", () => {
    describe("authentication, validation, and rate-limit gates", () => {
        it.each([null, {}, { user: {} }, { user: { id: "" } }])(
            "rejects an unauthenticated session %j before reading the body", async (session) => {
                mocks.getServerSession.mockResolvedValueOnce(session);
                const req = rawRequest("not json");
                const response = await POST(req);

                expect(response.status).toBe(401);
                expect(await response.json()).toEqual({ error: "Unauthorized" });
                expect(req.bodyUsed).toBe(false);
                expect(mocks.checkRateLimit).not.toHaveBeenCalled();
                expect(mocks.getDecryptedKey).not.toHaveBeenCalled();
                expect(mocks.getPreferences).not.toHaveBeenCalled();
                expectNoConversationAccess();
                expectNoProviderStart();
                expect(console.error).not.toHaveBeenCalled();
            },
        );

        it("sanitizes an auth lookup rejection and stops downstream work", async () => {
            const error = new Error("synthetic auth storage failure");
            mocks.getServerSession.mockRejectedValueOnce(error);

            await expectGenericFailure(await POST(request()), error);
            expect(mocks.checkRateLimit).not.toHaveBeenCalled();
            expect(mocks.getDecryptedKey).not.toHaveBeenCalled();
            expectNoConversationAccess();
            expectNoProviderStart();
        });

        it("returns 400 for malformed JSON without reaching DB or provider seams", async () => {
            const response = await POST(rawRequest("{"));

            expect(response.status).toBe(400);
            expect(await response.json()).toEqual({ error: "Invalid JSON in request body" });
            expect(mocks.checkRateLimit).toHaveBeenCalledExactlyOnceWith(USER_ID);
            expect(mocks.getDecryptedKey).not.toHaveBeenCalled();
            expect(mocks.getPreferences).not.toHaveBeenCalled();
            expectNoConversationAccess();
            expectNoProviderStart();
            expect(console.error).not.toHaveBeenCalled();
        });

        it.each([
            { name: "empty messages", body: { messages: [] }, path: ["messages"] },
            { name: "empty content", body: { messages: [{ role: "user", content: "" }] }, path: ["messages", 0, "content"] },
            { name: "unsupported role", body: { messages: [{ role: "tool", content: "test" }] }, path: ["messages", 0, "role"] },
            { name: "empty provider", body: { providerId: "" }, path: ["providerId"] },
            { name: "empty model", body: { modelId: "" }, path: ["modelId"] },
            { name: "invalid conversation ID", body: { conversationId: "not-a-cuid" }, path: ["conversationId"] },
            { name: "invalid private mode", body: { privateMode: "true" }, path: ["privateMode"] },
            { name: "temperature above limit", body: { temperature: 3 }, path: ["temperature"] },
            { name: "zero output tokens", body: { maxTokens: 0 }, path: ["maxTokens"] },
        ])("uses actual Zod validation for $name", async ({ body, path }) => {
            const response = await POST(request(body));

            expect(response.status).toBe(400);
            expect(await response.json()).toEqual({
                error: "Invalid request",
                details: expect.arrayContaining([expect.objectContaining({ path })]),
            });
            expect(mocks.checkRateLimit).toHaveBeenCalledExactlyOnceWith(USER_ID);
            expect(mocks.getDecryptedKey).not.toHaveBeenCalled();
            expect(mocks.getPreferences).not.toHaveBeenCalled();
            expectNoConversationAccess();
            expectNoProviderStart();
            expect(console.error).toHaveBeenCalledExactlyOnceWith("Chat API error:", expect.any(Error));
        });

        it("returns 429 and exact retry/rate headers before parsing, then allows a later request", async () => {
            mocks.checkRateLimit.mockReturnValueOnce({
                ...RATE_RESULT, limited: true, remaining: 0, retryAfter: 17,
            });
            const req = rawRequest("not json");
            const response = await POST(req);

            expect(response.status).toBe(429);
            expect(await response.json()).toEqual({
                error: "Rate limit exceeded",
                retryAfter: 17,
                message: "Too many requests. Please wait 17 seconds before trying again.",
            });
            expect(req.bodyUsed).toBe(false);
            expect(response.headers.get("Retry-After")).toBe("17");
            expect(response.headers.get("X-Conversation-Id")).toBeNull();
            expectRateHeaders(response, 0);
            expect(mocks.getDecryptedKey).not.toHaveBeenCalled();
            expectNoConversationAccess();
            expectNoProviderStart();

            // A changed limiter result, not a test of window expiry or real time.
            const recovered = await POST(request());
            expect(recovered.status).toBe(200);
            expectRateHeaders(recovered);
            expect(recovered.headers.get("Retry-After")).toBeNull();
            expect(mocks.checkRateLimit).toHaveBeenNthCalledWith(2, USER_ID);
            expectNoMessagePersistence();
            await finish();
            expectMessagePair(NEW_ID);
            expect(console.error).not.toHaveBeenCalled();
        });

        it("rejects a missing API key without creating a conversation or starting a provider", async () => {
            mocks.getDecryptedKey.mockResolvedValueOnce(null);
            const response = await POST(request());

            expect(response.status).toBe(400);
            expect(await response.json()).toEqual({
                error: "No API key configured for this provider. Please add your API key in Settings.",
            });
            expect(mocks.getDecryptedKey).toHaveBeenCalledExactlyOnceWith(USER_ID, "openai");
            expect(mocks.getPreferences).not.toHaveBeenCalled();
            expectNoConversationAccess();
            expectNoProviderStart();
            expect(console.error).not.toHaveBeenCalled();
        });
    });

    describe("database seam failures before streaming", () => {
        it.each(["getDecryptedKey", "getConversationWithMessages", "getPreferences"] as const)(
            "sanitizes %s rejection and recovers on a later request", async (seam) => {
                const error = new Error(`synthetic ${seam} database outage: internal details`);
                mocks[seam].mockRejectedValueOnce(error);
                const response = await POST(request({ conversationId: EXISTING_ID }));

                await expectGenericFailure(response, error);
                expect(mocks[seam]).toHaveBeenCalledTimes(1);
                expect(mocks.createConversation).not.toHaveBeenCalled();
                expectNoProviderStart();
                if (seam === "getDecryptedKey") {
                    expect(mocks.getConversationWithMessages).not.toHaveBeenCalled();
                }
                if (seam !== "getPreferences") {
                    expect(mocks.getPreferences).not.toHaveBeenCalled();
                }

                // No reset between requests: only the injected one-shot fault expires.
                const recovered = await POST(request({ conversationId: EXISTING_ID }));
                expect(recovered.status).toBe(200);
                expect(recovered.headers.get("X-Conversation-Id")).toBe(EXISTING_ID);
                expectRateHeaders(recovered);
                expect(mocks.getDecryptedKey).toHaveBeenLastCalledWith(USER_ID, "openai");
                expect(mocks.getConversationWithMessages).toHaveBeenLastCalledWith(EXISTING_ID, USER_ID);
                expect(mocks.getPreferences).toHaveBeenLastCalledWith(USER_ID);
                expect(mocks[seam]).toHaveBeenCalledTimes(2);
                expectNoMessagePersistence();
                await finish();
                expectMessagePair(EXISTING_ID);
                expect(mocks.updateConversation).toHaveBeenCalledExactlyOnceWith(EXISTING_ID, USER_ID, { title: USER_TEXT });
                expect(console.error).toHaveBeenCalledTimes(1);
            },
        );

        it("stops after conversation creation rejects and can create on a later request", async () => {
            const error = new Error("synthetic conversation insert outage");
            mocks.createConversation.mockRejectedValueOnce(error);

            await expectGenericFailure(await POST(request()), error);
            expect(mocks.createConversation).toHaveBeenCalledExactlyOnceWith(
                USER_ID, "openai", "gpt-4o", { title: "New Chat", systemPrompt: undefined },
            );
            expect(mocks.getPreferences).not.toHaveBeenCalled();
            expectNoProviderStart();

            const recovered = await POST(request());
            expect(recovered.status).toBe(200);
            expect(mocks.createConversation).toHaveBeenCalledTimes(2);
            await finish();
            expectMessagePair(NEW_ID);
            expect(mocks.updateConversation).toHaveBeenCalledExactlyOnceWith(NEW_ID, USER_ID, { title: USER_TEXT });
        });
    });

    describe("synchronous provider startup faults (not live stream faults)", () => {
        it.each([
            { seam: "createLanguageModel", name: "provider factory failure", timeout: false },
            { seam: "createLanguageModel", name: "simulated factory timeout", timeout: true },
            { seam: "streamText", name: "SDK startup failure", timeout: false },
            { seam: "streamText", name: "simulated SDK startup timeout", timeout: true },
            { seam: "toTextStreamResponse", name: "response construction failure", timeout: false },
        ] as const)("handles $name and persists only the later request's completion", async ({ seam, timeout }) => {
            const error = timeout
                ? new DOMException("synthetic startup deadline exceeded", "TimeoutError")
                : new Error("synthetic provider startup failure: internal details");
            mocks[seam].mockImplementationOnce(() => { throw error; });
            mocks.createConversation.mockResolvedValueOnce({ id: NEW_ID }).mockResolvedValue({ id: RECOVERY_ID });

            await expectGenericFailure(await POST(request()), error);
            expect(mocks.createConversation).toHaveBeenCalledTimes(1);
            // Creation precedes provider startup. This asserts the observed call,
            // not cleanup of the empty conversation (the route has no such cleanup).
            expect(mocks[seam]).toHaveBeenCalledTimes(1);
            if (seam === "createLanguageModel") {
                expect(mocks.streamText).not.toHaveBeenCalled();
            }
            if (seam !== "toTextStreamResponse") {
                expect(mocks.toTextStreamResponse).not.toHaveBeenCalled();
            }

            const recovered = await POST(request({ messages: [{ role: "user", content: "Recovery request" }] }));
            expect(recovered.status).toBe(200);
            expect(await recovered.text()).toBe(ASSISTANT_TEXT);
            expect(recovered.headers.get("X-Conversation-Id")).toBe(RECOVERY_ID);
            expectRateHeaders(recovered);
            expect(mocks.createConversation).toHaveBeenCalledTimes(2);
            expect(mocks.createLanguageModel).toHaveBeenLastCalledWith("openai", "gpt-4o", FAKE_KEY);
            expectNoMessagePersistence();
            await finish(mocks.streamText.mock.calls.length - 1);
            expectMessagePair(RECOVERY_ID, "Recovery request");
            expect(mocks.updateConversation).toHaveBeenCalledExactlyOnceWith(RECOVERY_ID, USER_ID, { title: "Recovery request" });
            expect(console.error).toHaveBeenCalledTimes(1);
        });
    });

    describe("captured completion callback and transaction fault handling", () => {
        it("defers persistence until onFinish, then waits for transaction fulfillment before updating the title", async () => {
            const transactionPending = deferred();
            const writesAttempted = deferred();
            mocks.transaction.mockImplementationOnce(async (work) => {
                await work(tx);
                writesAttempted.resolve();
                await transactionPending.promise;
            });
            const response = await POST(request());

            expect(response.status).toBe(200);
            expect(response.headers.get("X-Conversation-Id")).toBe(NEW_ID);
            expectRateHeaders(response);
            expect(capturedStream()).toMatchObject({
                model: MODEL,
                messages: [
                    { role: "system", content: "You are a helpful assistant." },
                    { role: "user", content: USER_TEXT },
                ],
                temperature: 0.7,
                maxOutputTokens: 4096,
            });
            expectNoMessagePersistence();

            const completion = finish();
            try {
                await writesAttempted.promise;
                expectMessagePair(NEW_ID);
                expect(mocks.updateConversation).not.toHaveBeenCalled();
            } finally {
                transactionPending.resolve();
                await completion;
            }
            expect(mocks.updateConversation).toHaveBeenCalledExactlyOnceWith(NEW_ID, USER_ID, { title: USER_TEXT });
            expect(console.error).not.toHaveBeenCalled();
        });

        it.each([
            { stage: "transaction entry", attempts: 0 },
            { stage: "first message write", attempts: 1 },
            { stage: "second message write", attempts: 2 },
            { stage: "transaction rejection after both writes", attempts: 2 },
        ])("logs $stage failure without rejecting onFinish or updating title", async ({ stage, attempts }) => {
            const error = new Error(`synthetic ${stage} failure`);
            if (stage === "transaction entry") {
                mocks.transaction.mockRejectedValueOnce(error);
            } else if (stage === "first message write") {
                mocks.messageCreate.mockRejectedValueOnce(error);
            } else if (stage === "second message write") {
                mocks.messageCreate.mockResolvedValueOnce({ id: "attempt-only" }).mockRejectedValueOnce(error);
            } else {
                mocks.transaction.mockImplementationOnce(async (work) => {
                    await work(tx);
                    throw error;
                });
            }
            const response = await POST(request());
            expect(response.status).toBe(200);
            expectNoMessagePersistence();

            await expect(finish()).resolves.toBeUndefined();
            expect(mocks.transaction).toHaveBeenCalledTimes(1);
            expect(mocks.messageCreate).toHaveBeenCalledTimes(attempts);
            expect(mocks.updateConversation).not.toHaveBeenCalled();
            expect(mocks.addMessage).not.toHaveBeenCalled();
            expect(console.error).toHaveBeenCalledExactlyOnceWith("Failed to save messages:", error);
            // Only attempted calls are observable. No assertion about real
            // stored rows, transaction rollback, or database atomicity is made.
            expect(response.status).toBe(200);
        });

        it("recovers from a failed completion transaction on a later request without resetting mocks", async () => {
            const error = new Error("synthetic transient transaction outage");
            mocks.transaction.mockRejectedValueOnce(error);
            mocks.createConversation.mockResolvedValueOnce({ id: NEW_ID }).mockResolvedValue({ id: RECOVERY_ID });
            await POST(request());
            await finish();
            expect(mocks.messageCreate).not.toHaveBeenCalled();
            expect(mocks.updateConversation).not.toHaveBeenCalled();

            const recovered = await POST(request({ messages: [{ role: "user", content: "Try again" }] }));
            expect(recovered.status).toBe(200);
            expect(recovered.headers.get("X-Conversation-Id")).toBe(RECOVERY_ID);
            await finish(1);
            expect(mocks.transaction).toHaveBeenCalledTimes(2);
            expect(mocks.messageCreate).toHaveBeenCalledTimes(2);
            expect(mocks.messageCreate).toHaveBeenNthCalledWith(1, {
                data: expect.objectContaining({ conversationId: RECOVERY_ID, role: "user", content: "Try again" }),
            });
            expect(mocks.messageCreate).toHaveBeenNthCalledWith(2, {
                data: expect.objectContaining({ conversationId: RECOVERY_ID, role: "assistant", content: ASSISTANT_TEXT }),
            });
            expect(mocks.updateConversation).toHaveBeenCalledExactlyOnceWith(RECOVERY_ID, USER_ID, { title: "Try again" });
            expect(console.error).toHaveBeenCalledExactlyOnceWith("Failed to save messages:", error);
        });

        it("logs title-update rejection after the transaction without retrying message writes", async () => {
            const error = new Error("synthetic title update outage");
            mocks.updateConversation.mockRejectedValueOnce(error);
            const response = await POST(request());

            await expect(finish()).resolves.toBeUndefined();
            expectMessagePair(NEW_ID);
            expect(mocks.updateConversation).toHaveBeenCalledExactlyOnceWith(NEW_ID, USER_ID, { title: USER_TEXT });
            expect(console.error).toHaveBeenCalledExactlyOnceWith("Failed to save messages:", error);
            expect(response.status).toBe(200);
        });

        it("keeps existing history in context and does not retitle an established conversation", async () => {
            const history: ChatMessage[] = [
                { role: "user", content: "Earlier question" },
                { role: "assistant", content: "Earlier answer" },
            ];
            mocks.getConversationWithMessages.mockResolvedValueOnce({
                id: EXISTING_ID, systemPrompt: "Stored system prompt", messages: history,
            });
            const response = await POST(request({
                conversationId: EXISTING_ID,
                messages: [...history, { role: "user", content: USER_TEXT }],
                temperature: 0,
                maxTokens: 128,
            }));

            expect(response.status).toBe(200);
            expect(capturedStream()).toMatchObject({
                messages: [{ role: "system", content: "Stored system prompt" }, ...history, { role: "user", content: USER_TEXT }],
                temperature: 0,
                maxOutputTokens: 128,
            });
            expect(mocks.createConversation).not.toHaveBeenCalled();
            await finish();
            expectMessagePair(EXISTING_ID);
            expect(mocks.updateConversation).not.toHaveBeenCalled();
            expect(console.error).not.toHaveBeenCalled();
        });

        it("handles unavailable token counts without failing persistence", async () => {
            await POST(request());
            await finish(0, { text: ASSISTANT_TEXT, usage: {} });

            expect(mocks.messageCreate).toHaveBeenCalledTimes(2);
            for (const [write] of mocks.messageCreate.mock.calls) {
                expect(write.data.tokenCount).toBeUndefined();
            }
            expect(mocks.updateConversation).toHaveBeenCalledTimes(1);
            expect(console.error).not.toHaveBeenCalled();
        });
    });

    describe("private mode", () => {
        it.each([undefined, EXISTING_ID])("does not read or persist conversation data even with ID %s", async (conversationId) => {
            const response = await POST(request({ privateMode: true, conversationId }));

            expect(response.status).toBe(200);
            expect(response.headers.get("X-Conversation-Id")).toBeNull();
            expectRateHeaders(response);
            // Private mode still reads credentials/preferences, not chat history.
            expect(mocks.getDecryptedKey).toHaveBeenCalledExactlyOnceWith(USER_ID, "openai");
            expect(mocks.getPreferences).toHaveBeenCalledExactlyOnceWith(USER_ID);
            expectNoConversationAccess();
            await expect(finish()).resolves.toBeUndefined();
            expectNoConversationAccess();
            expect(console.error).not.toHaveBeenCalled();
        });

        it("does not create or persist a conversation on a private provider startup failure", async () => {
            const error = new DOMException("synthetic private startup timeout", "TimeoutError");
            mocks.streamText.mockImplementationOnce(() => { throw error; });

            await expectGenericFailure(await POST(request({ privateMode: true, conversationId: EXISTING_ID })), error);
            expectNoConversationAccess();
            expect(mocks.toTextStreamResponse).not.toHaveBeenCalled();
        });
    });
});
