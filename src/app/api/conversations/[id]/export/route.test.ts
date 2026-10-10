import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getServerSession, getConversationWithMessages } = vi.hoisted(() => ({
    getServerSession: vi.fn(),
    getConversationWithMessages: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getServerSession }));
vi.mock("@/lib/db/queries/conversations", () => ({
    getConversationWithMessages,
    getConversationMeta: vi.fn(),
    getMessagesPaginated: vi.fn(),
    updateConversation: vi.fn(),
    deleteConversation: vi.fn(),
}));

import { GET } from "./route";

const USER_ID = "user-123";
const ID = "clx1234567890abcdefghijkl";
const CONTEXT = { params: Promise.resolve({ id: ID }) };
const CONVERSATION = {
    id: ID,
    userId: USER_ID,
    title: "My Trip Plan!",
    providerId: "openai",
    modelId: "gpt-4o",
    messages: [
        { id: "m1", role: "user", content: "hi", createdAt: "2026-10-05T08:00:00.000Z" },
        { id: "m2", role: "assistant", content: "hello", createdAt: "2026-10-05T08:01:00.000Z" },
    ],
};

function exportRequest() {
    return new Request(`http://localhost:3000/api/conversations/${ID}/export`, { method: "GET" });
}

beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    getServerSession.mockResolvedValue({ user: { id: USER_ID } });
    getConversationWithMessages.mockResolvedValue(CONVERSATION);
});

afterEach(() => {
    vi.restoreAllMocks();
    vi.resetAllMocks();
});

describe("GET /api/conversations/[id]/export (Export)", () => {
    it("serves portable JSON as a named download", async () => {
        const response = await GET(exportRequest(), CONTEXT);

        expect(response.status).toBe(200);
        expect(response.headers.get("Content-Disposition")).toBe(
            'attachment; filename="my-trip-plan.json"'
        );
        expect(response.headers.get("Cache-Control")).toBe("no-store");
        const body = await response.json();
        expect(body.title).toBe("My Trip Plan!");
        expect(body.messages).toHaveLength(2);
        expect(body).not.toHaveProperty("userId");
        expect(typeof body.exportedAt).toBe("string");
    });

    it("answers 404 for another user's conversation", async () => {
        getConversationWithMessages.mockResolvedValueOnce(null);

        const response = await GET(exportRequest(), CONTEXT);

        expect(response.status).toBe(404);
    });

    it("never reaches the database unauthenticated", async () => {
        getServerSession.mockResolvedValueOnce(null);

        const response = await GET(exportRequest(), CONTEXT);

        expect(response.status).toBe(401);
        expect(getConversationWithMessages).not.toHaveBeenCalled();
    });
});
