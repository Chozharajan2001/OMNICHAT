import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatMessage } from "@/lib/ai/context-manager";
import { POST } from "./route";

// Phase 4.2 + audit remediation: exercise the real handler, validation,
// context preparation, and header formatting. External auth, DB, and
// provider modules never initialize. The SDK response is inert; explicitly
// invoking the captured onFinish/onAbort/onError tests route callback
// behavior, NOT live streaming, SDK retries, or elapsed timeouts.
//
// Persistence contract under test:
// - The user message is persisted BEFORE streamText starts.
// - The assistant message + conversation touch happen in onFinish (or
//   onAbort for partial text), exactly once per turn.
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
    onAbort: (result: { steps: { text?: string }[] }) => Promise<void>;
    onError: (result: { error: unknown }) => Promise<void> | void;
};

type ConversationFixture = {
    id: string;
    systemPrompt: string | null;
    messages: ChatMessage[];
};

type MessageWrite = {
    data: {
        conversationId: string;
        role: "system" | "user" | "assistant";
        content: string;
        modelId: string;
        providerId: string;
        tokenCount?: number;
    };
};

type ConversationTouch = {
    where: { id: string };
    data: { updatedAt: Date };
};

type TransactionClient = {
    message: { create: (input: MessageWrite) => Promise<unknown> };
    conversation: { update: (input: ConversationTouch) => Promise<unknown> };
};

const mocks = vi.hoisted(() => ({
    getServerSession: vi.fn<() => Promise<{ user?: { id?: string } } | null>>(),
    getDecryptedKey: vi.fn<(userId: string, providerId: string) => Promise<string | null>>(),
    getConversationWithMessages: vi.fn<(
        conversationId: string, userId: string
    ) => Promise<ConversationFixture | null>>(),
    createConversation: vi.fn<(
        userId: string, providerId: string, modelId: string,
        options: { title: string; systemPrompt?: string; projectId?: string; folderId?: string }
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
    conversationUpdate: vi.fn<(input: ConversationTouch) => Promise<unknown>>(),
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
const PROJECT_ID = "clp1234567890abcdefghijkl";
const FOLDER_ID = "cld1234567890abcdefghijkl";
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
const tx: TransactionClient = {
    message: { create: mocks.messageCreate },
    conversation: { update: mocks.conversationUpdate },
};

function request(overrides: Record<string, unknown> = {}) {
    return new Request("http://localhost/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: "http://localhost" },
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
        headers: { "Content-Type": "application/json", Origin: "http://localhost" },
        body,
    });
}

function capturedStream(index = 0) {
    const options = mocks.streamText.mock.calls[index]?.[0];
    expect(options).toBeDefined();
    expect(options.onFinish).toEqual(expect.any(Function));
    expect(options.onAbort).toEqual(expect.any(Function));
    expect(options.onError).toEqual(expect.any(Function));
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

/** H1: the user message is stored during the request, before streaming. */
function expectUserPersisted(conversationId: string, content = USER_TEXT) {
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    expect(mocks.messageCreate).toHaveBeenCalledExactlyOnceWith({
        data: {
            conversationId, role: "user", content,
            modelId: "gpt-4o", providerId: "openai",
        },
    });
    expect(mocks.addMessage).not.toHaveBeenCalled();
    expect(mocks.updateConversation).not.toHaveBeenCalled();
}

/** After onFinish: user + assistant stored, conversation touched once. */
function expectCompletionPersisted(conversationId: string, content = USER_TEXT) {
    expect(mocks.transaction).toHaveBeenCalledTimes(2);
    expect(mocks.messageCreate).toHaveBeenCalledTimes(2);
    expect(mocks.messageCreate).toHaveBeenNthCalledWith(1, {
        data: {
            conversationId, role: "user", content,
            modelId: "gpt-4o", providerId: "openai",
        },
    });
    expect(mocks.messageCreate).toHaveBeenNthCalledWith(2, {
        data: {
            conversationId, role: "assistant", content: ASSISTANT_TEXT,
            modelId: "gpt-4o", providerId: "openai", tokenCount: 7,
        },
    });
    expect(mocks.conversationUpdate).toHaveBeenCalledTimes(1);
    expect(mocks.conversationUpdate).toHaveBeenCalledWith({
        where: { id: conversationId },
        data: { updatedAt: expect.any(Date) },
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
    vi.stubEnv("APP_ORIGIN", "http://localhost");
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.fetch.mockImplementation(async () => {
        throw new Error("Network access is forbidden in route fault-injection tests");
    });
    vi.stubGlobal("fetch", mocks.fetch);
    mocks.getServerSession.mockResolvedValue({ user: { id: USER_ID } });
    mocks.checkRateLimit.mockResolvedValue({ ...RATE_RESULT });
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
    mocks.conversationUpdate.mockResolvedValue({ id: "synthetic-conversation" });
    mocks.updateConversation.mockResolvedValue({ id: NEW_ID });
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

describe("POST /api/chat - fault injection with pre-stream persistence", () => {
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
            { name: "over-long provider", body: { providerId: "p".repeat(65) }, path: ["providerId"] },
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

        it("rejects a transcript that does not end with a user message (M8)", async () => {
            const response = await POST(request({
                messages: [
                    { role: "user", content: USER_TEXT },
                    { role: "assistant", content: "self-supplied reply" },
                ],
            }));

            expect(response.status).toBe(400);
            expect(await response.json()).toEqual({ error: "Last message must be from the user" });
            expect(mocks.getDecryptedKey).not.toHaveBeenCalled();
            expectNoConversationAccess();
            expectNoProviderStart();
            expect(console.error).not.toHaveBeenCalled();
        });

        it("returns 429 and exact retry/rate headers before parsing, then allows a later request", async () => {
            mocks.checkRateLimit.mockResolvedValueOnce({
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
            expect(mocks.checkRateLimit).toHaveBeenNthCalledWith(2, USER_ID);
            expectUserPersisted(NEW_ID);
            await finish();
            expectCompletionPersisted(NEW_ID);
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

    describe("database seam failures before persistence", () => {
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
                // H1: the user message survives the request itself.
                expectUserPersisted(EXISTING_ID);
                await finish();
                expectCompletionPersisted(EXISTING_ID);
                // The fixture history is empty, so this is the first message.
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
            expectUserPersisted(NEW_ID);
            await finish();
            expectCompletionPersisted(NEW_ID);
            expect(mocks.updateConversation).toHaveBeenCalledExactlyOnceWith(NEW_ID, USER_ID, { title: USER_TEXT });
        });

        it("sanitizes a user-persistence transaction failure before the provider starts (H1 gate)", async () => {
            const error = new Error("synthetic user-message insert outage");
            mocks.transaction.mockRejectedValueOnce(error);

            const response = await POST(request());
            expect(response.status).toBe(500);
            expect(await response.json()).toEqual({
                error: "An error occurred while processing your request",
            });
            expect(console.error).toHaveBeenCalledExactlyOnceWith("Chat API error:", error);
            expect(mocks.messageCreate).not.toHaveBeenCalled();
            // Model construction precedes the persist step; streaming never starts.
            expect(mocks.createLanguageModel).toHaveBeenCalledExactlyOnceWith("openai", "gpt-4o", FAKE_KEY);
            expect(mocks.streamText).not.toHaveBeenCalled();
            expect(mocks.toTextStreamResponse).not.toHaveBeenCalled();
        });
    });

    describe("synchronous provider startup faults (not live stream faults)", () => {
        it("aborts before provider start when the model factory throws, losing nothing", async () => {
            const error = new Error("synthetic provider startup failure: internal details");
            mocks.createLanguageModel.mockImplementationOnce(() => { throw error; });
            mocks.createConversation.mockResolvedValueOnce({ id: NEW_ID }).mockResolvedValue({ id: RECOVERY_ID });

            // Factory construction happens before the persist step, so the
            // user message has not been written yet on this fault path.
            await expectGenericFailure(await POST(request()), error);
            expect(mocks.createConversation).toHaveBeenCalledTimes(1);
            expect(mocks.streamText).not.toHaveBeenCalled();
            expect(mocks.toTextStreamResponse).not.toHaveBeenCalled();

            const recovered = await POST(request({ messages: [{ role: "user", content: "Recovery request" }] }));
            expect(recovered.status).toBe(200);
            expect(recovered.headers.get("X-Conversation-Id")).toBe(RECOVERY_ID);
            expectUserPersisted(RECOVERY_ID, "Recovery request");
            await finish(mocks.streamText.mock.calls.length - 1);
            expectCompletionPersisted(RECOVERY_ID, "Recovery request");
            expect(mocks.updateConversation).toHaveBeenCalledExactlyOnceWith(RECOVERY_ID, USER_ID, { title: "Recovery request" });
            expect(console.error).toHaveBeenCalledTimes(1);
        });

        it.each(["streamText", "toTextStreamResponse"] as const)(
            "keeps the persisted user message when %s throws synchronously (H1)", async (seam) => {
                const error = new Error(`synthetic ${seam} startup failure`);
                mocks[seam].mockImplementationOnce(() => { throw error; });
                mocks.createConversation.mockResolvedValueOnce({ id: NEW_ID }).mockResolvedValue({ id: RECOVERY_ID });

                const response = await POST(request());
                expect(response.status).toBe(500);
                expect(await response.json()).toEqual({
                    error: "An error occurred while processing your request",
                });
                expect(console.error).toHaveBeenCalledExactlyOnceWith("Chat API error:", error);
                // The user message was persisted BEFORE the provider call:
                // the failed turn still contains what the user asked.
                expect(mocks.transaction).toHaveBeenCalledTimes(1);
                expect(mocks.messageCreate).toHaveBeenCalledExactlyOnceWith({
                    data: {
                        conversationId: NEW_ID, role: "user", content: USER_TEXT,
                        modelId: "gpt-4o", providerId: "openai",
                    },
                });
                if (seam === "streamText") {
                    expect(mocks.toTextStreamResponse).not.toHaveBeenCalled();
                }
            },
        );
    });

    describe("completion callback persistence", () => {
        it("persists the user message before streaming and the reply on finish", async () => {
            const transactionPending = deferred();
            const userWritten = deferred();
            let transactions = 0;
            mocks.transaction.mockImplementation(async (work) => {
                transactions += 1;
                if (transactions === 1) {
                    await work(tx);
                    userWritten.resolve();
                } else {
                    await work(tx);
                    await transactionPending.promise;
                }
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
            // H1: the user write completed while the response is streaming.
            await userWritten.promise;
            expectUserPersisted(NEW_ID);

            const completion = finish();
            expect(mocks.updateConversation).not.toHaveBeenCalled();
            transactionPending.resolve();
            await completion;
            expectCompletionPersisted(NEW_ID);
            expect(mocks.updateConversation).toHaveBeenCalledExactlyOnceWith(NEW_ID, USER_ID, { title: USER_TEXT });
            expect(console.error).not.toHaveBeenCalled();
        });

        it.each([
            { stage: "completion transaction entry", assistantWrites: 0 },
            { stage: "assistant message write", assistantWrites: 1 },
            { stage: "conversation touch", assistantWrites: 1 },
        ])("logs $stage failure without rejecting onFinish or updating title", async ({ stage, assistantWrites }) => {
            const error = new Error(`synthetic ${stage} failure`);
            if (stage === "completion transaction entry") {
                mocks.transaction.mockImplementationOnce(async (work) => { await work(tx); })
                    .mockImplementationOnce(async () => { throw error; });
            } else if (stage === "assistant message write") {
                // Fail the SECOND write (assistant); the first is the
                // pre-stream user persistence.
                mocks.messageCreate.mockResolvedValueOnce({ id: "user-row" })
                    .mockRejectedValueOnce(error);
            } else {
                mocks.conversationUpdate.mockRejectedValueOnce(error);
            }
            const response = await POST(request());
            expect(response.status).toBe(200);
            expectUserPersisted(NEW_ID);

            await expect(finish()).resolves.toBeUndefined();
            expect(mocks.transaction).toHaveBeenCalledTimes(2);
            // user write + attempted assistant writes
            expect(mocks.messageCreate).toHaveBeenCalledTimes(1 + assistantWrites);
            expect(mocks.updateConversation).not.toHaveBeenCalled();
            expect(mocks.addMessage).not.toHaveBeenCalled();
            expect(console.error).toHaveBeenCalledExactlyOnceWith("Failed to save messages:", error);
            // Only attempted calls are observable. No assertion about real
            // stored rows, transaction rollback, or database atomicity is made.
        });

        it("persists a partial reply on abort, exactly once (H1)", async () => {
            const response = await POST(request());
            expect(response.status).toBe(200);
            expectUserPersisted(NEW_ID);

            await capturedStream().onAbort({ steps: [{ text: "Partial answer before stop" }] });
            expect(mocks.messageCreate).toHaveBeenCalledTimes(2);
            expect(mocks.messageCreate).toHaveBeenNthCalledWith(2, {
                data: {
                    conversationId: NEW_ID, role: "assistant",
                    content: "Partial answer before stop",
                    modelId: "gpt-4o", providerId: "openai",
                },
            });
            expect(mocks.conversationUpdate).toHaveBeenCalledTimes(1);
            expect(mocks.updateConversation).toHaveBeenCalledExactlyOnceWith(NEW_ID, USER_ID, { title: USER_TEXT });
            expect(console.error).not.toHaveBeenCalled();
        });

        it("never stores a second completion when finish and abort both fire", async () => {
            await POST(request());
            await finish();
            await capturedStream().onAbort({ steps: [{ text: "LATE PARTIAL" }] });

            expect(mocks.messageCreate).toHaveBeenCalledTimes(2);
            expect(mocks.transaction).toHaveBeenCalledTimes(2);
            expect(mocks.conversationUpdate).toHaveBeenCalledTimes(1);
            const assistantWrites = mocks.messageCreate.mock.calls.filter(
                ([write]) => write.data.role === "assistant",
            );
            expect(assistantWrites).toHaveLength(1);
            expect(assistantWrites[0][0].data.content).toBe(ASSISTANT_TEXT);
        });

        it("logs stream errors without writing an assistant message", async () => {
            await POST(request());
            const error = new Error("synthetic provider stream error");

            await capturedStream().onError({ error });
            expect(console.error).toHaveBeenCalledExactlyOnceWith("Chat stream error:", error);
            expect(mocks.messageCreate).toHaveBeenCalledTimes(1); // user only
            expect(mocks.transaction).toHaveBeenCalledTimes(1);
            expect(mocks.updateConversation).not.toHaveBeenCalled();
        });

        it("recovers from a failed completion transaction on a later request without resetting mocks", async () => {
            const error = new Error("synthetic transient completion outage");
            mocks.transaction.mockImplementationOnce(async (work) => { await work(tx); })
                .mockImplementationOnce(async () => { throw error; });
            mocks.createConversation.mockResolvedValueOnce({ id: NEW_ID }).mockResolvedValue({ id: RECOVERY_ID });
            await POST(request());
            await finish();
            expect(mocks.messageCreate).toHaveBeenCalledTimes(1); // user only
            expect(mocks.updateConversation).not.toHaveBeenCalled();

            const recovered = await POST(request({ messages: [{ role: "user", content: "Try again" }] }));
            expect(recovered.status).toBe(200);
            expect(recovered.headers.get("X-Conversation-Id")).toBe(RECOVERY_ID);
            await finish(1);
            expect(mocks.transaction).toHaveBeenCalledTimes(4);
            expect(mocks.messageCreate).toHaveBeenCalledTimes(3);
            expect(mocks.messageCreate).toHaveBeenNthCalledWith(2, {
                data: expect.objectContaining({ conversationId: RECOVERY_ID, role: "user", content: "Try again" }),
            });
            expect(mocks.messageCreate).toHaveBeenNthCalledWith(3, {
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
            expectCompletionPersisted(NEW_ID);
            expect(mocks.updateConversation).toHaveBeenCalledExactlyOnceWith(NEW_ID, USER_ID, { title: USER_TEXT });
            expect(console.error).toHaveBeenCalledExactlyOnceWith("Failed to save messages:", error);
            expect(response.status).toBe(200);
        });

        it("builds context from stored history, not the client transcript (H4)", async () => {
            const history: ChatMessage[] = [
                { role: "user", content: "Earlier question" },
                { role: "assistant", content: "Earlier answer" },
            ];
            mocks.getConversationWithMessages.mockResolvedValueOnce({
                id: EXISTING_ID, systemPrompt: "Stored system prompt", messages: history,
            });
            // A hostile/stale client transcript is ignored for history; only
            // the final user message is appended to the stored history.
            const response = await POST(request({
                conversationId: EXISTING_ID,
                messages: [
                    { role: "user", content: "INJECTED FAKE HISTORY" },
                    ...history,
                    { role: "user", content: USER_TEXT },
                ],
                temperature: 0,
                maxTokens: 128,
            }));

            expect(response.status).toBe(200);
            expect(capturedStream()).toMatchObject({
                messages: [
                    { role: "system", content: "Stored system prompt" },
                    ...history,
                    { role: "user", content: USER_TEXT },
                ],
                temperature: 0,
                maxOutputTokens: 128,
            });
            expect(mocks.createConversation).not.toHaveBeenCalled();
            expectUserPersisted(EXISTING_ID);
            await finish();
            expectCompletionPersisted(EXISTING_ID);
            expect(mocks.updateConversation).not.toHaveBeenCalled();
            expect(console.error).not.toHaveBeenCalled();
        });

        it("keeps legitimate repeated messages (old dedup removed)", async () => {
            const history: ChatMessage[] = [{ role: "user", content: "Same question" }];
            mocks.getConversationWithMessages.mockResolvedValueOnce({
                id: EXISTING_ID, systemPrompt: null, messages: history,
            });
            const response = await POST(request({
                conversationId: EXISTING_ID,
                messages: [{ role: "user", content: "Same question" }],
            }));

            expect(response.status).toBe(200);
            // Server history is authoritative: the stored turn stays, and the
            // new identical turn is appended (the old dedup dropped it).
            const sameContent = capturedStream().messages.filter((m) => m.content === "Same question");
            expect(sameContent).toHaveLength(2);
            expect(sameContent.every((m) => m.role === "user")).toBe(true);
            expectUserPersisted(EXISTING_ID, "Same question");
        });

        it("passes projectId and folderId through conversation creation (H7)", async () => {
            const response = await POST(request({ projectId: PROJECT_ID, folderId: FOLDER_ID }));

            expect(response.status).toBe(200);
            expect(mocks.createConversation).toHaveBeenCalledExactlyOnceWith(
                USER_ID, "openai", "gpt-4o",
                { title: "New Chat", systemPrompt: undefined, projectId: PROJECT_ID, folderId: FOLDER_ID },
            );
            expectUserPersisted(NEW_ID);
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

        it("uses the request transcript directly in private mode", async () => {
            const response = await POST(request({
                privateMode: true,
                messages: [
                    { role: "user", content: "Earlier private turn" },
                    { role: "assistant", content: "Earlier private reply" },
                    { role: "user", content: USER_TEXT },
                ],
            }));

            expect(response.status).toBe(200);
            expect(capturedStream()).toMatchObject({
                messages: [
                    { role: "system", content: "You are a helpful assistant." },
                    { role: "user", content: "Earlier private turn" },
                    { role: "assistant", content: "Earlier private reply" },
                    { role: "user", content: USER_TEXT },
                ],
            });
            expectNoConversationAccess();
            await expect(finish()).resolves.toBeUndefined();
            expectNoConversationAccess();
        });

        it("does not create or persist a conversation on a private provider startup failure", async () => {
            const error = new Error("synthetic private startup failure");
            mocks.streamText.mockImplementationOnce(() => { throw error; });

            await expectGenericFailure(await POST(request({ privateMode: true, conversationId: EXISTING_ID })), error);
            expectNoConversationAccess();
            expect(mocks.toTextStreamResponse).not.toHaveBeenCalled();
        });
    });
});

describe("POST /api/chat - a named conversation is never silently forked (2.3)", () => {
    // Must satisfy the schema's cuid rule to reach the lookup at all; a
    // malformed id is already covered by the 400 case above.
    const UNKNOWN_ID = "cnotpartofthisusershistory01";

    it("returns 404 for an unknown conversationId and creates nothing", async () => {
        mocks.getConversationWithMessages.mockResolvedValueOnce(null);

        const response = await POST(request({ conversationId: UNKNOWN_ID }));

        expect(response.status).toBe(404);
        expect(await response.json()).toEqual({ error: "Conversation not found" });
        expect(mocks.getConversationWithMessages).toHaveBeenCalledExactlyOnceWith(UNKNOWN_ID, USER_ID);
        // The old branch fell through to "create a new conversation", so the
        // turn was written to a brand-new chat while the user kept staring at
        // the one that no longer existed.
        expect(mocks.createConversation).not.toHaveBeenCalled();
        expect(mocks.transaction).not.toHaveBeenCalled();
        expectNoProviderStart();
    });

    it("still starts a conversation when no id is supplied at all", async () => {
        const response = await POST(request());

        expect(response.status).toBe(200);
        expect(mocks.createConversation).toHaveBeenCalledTimes(1);
        expect(mocks.getConversationWithMessages).not.toHaveBeenCalled();
    });
});
