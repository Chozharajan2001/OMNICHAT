import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getServerSession, getConversationWithMessages, getConversationMeta, getMessagesPaginated } =
    vi.hoisted(() => ({
        getServerSession: vi.fn(),
        getConversationWithMessages: vi.fn(),
        getConversationMeta: vi.fn(),
        getMessagesPaginated: vi.fn(),
    }));

vi.mock("@/lib/auth/session", () => ({ getServerSession }));
vi.mock("@/lib/api/csrf", () => ({ guardMutationRequest: vi.fn() }));
vi.mock("@/lib/db/queries/conversations", () => ({
    getConversationWithMessages,
    getConversationMeta,
    getMessagesPaginated,
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
    title: "Owned conversation",
    messages: [{ id: "m1", content: "hi" }],
};

function getRequest(query = "") {
    return new Request(`http://localhost:3000/api/conversations/${ID}${query}`, { method: "GET" });
}

beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    getServerSession.mockResolvedValue({ user: { id: USER_ID } });
    getConversationWithMessages.mockResolvedValue(CONVERSATION);
    getConversationMeta.mockResolvedValue({ id: ID, userId: USER_ID, title: "Owned conversation" });
    getMessagesPaginated.mockResolvedValue({
        messages: [{ id: "m9", content: "latest" }],
        hasMorePrev: true,
        hasMoreNext: false,
        prevCursor: { id: "m9" },
        nextCursor: { id: "m9" },
    });
});

afterEach(() => {
    vi.restoreAllMocks();
    vi.resetAllMocks();
});

describe("GET /api/conversations/[id] transcript contract (D2)", () => {
    it("serves the legacy full transcript with uniform page fields", async () => {
        const response = await GET(getRequest(), CONTEXT);

        expect(response.status).toBe(200);
        expect(getConversationWithMessages).toHaveBeenCalledWith(ID, USER_ID);
        expect(getMessagesPaginated).not.toHaveBeenCalled();
        expect(await response.json()).toEqual({
            ...CONVERSATION,
            hasMorePrev: false,
            hasMoreNext: false,
            prevCursor: null,
            nextCursor: null,
        });
    });

    it("serves one window with metadata when any paging param is present", async () => {
        const response = await GET(getRequest("?limit=20"), CONTEXT);

        expect(response.status).toBe(200);
        expect(getConversationWithMessages).not.toHaveBeenCalled();
        expect(getMessagesPaginated).toHaveBeenCalledWith(ID, USER_ID, {
            limit: 20,
            cursor: undefined,
            direction: undefined,
        });
        const body = await response.json();
        expect(body.messages).toEqual([{ id: "m9", content: "latest" }]);
        expect(body.hasMorePrev).toBe(true);
        expect(body.title).toBe("Owned conversation");
    });

    it("rejects a non-numeric limit without touching the database", async () => {
        const response = await GET(getRequest("?limit=many"), CONTEXT);

        expect(response.status).toBe(400);
        expect(getMessagesPaginated).not.toHaveBeenCalled();
        expect(getConversationMeta).not.toHaveBeenCalled();
    });

    it("rejects an unknown direction without touching the database", async () => {
        const response = await GET(getRequest("?cursor=clx1234567890abcdefghijkm&direction=sideways"), CONTEXT);

        expect(response.status).toBe(400);
        expect(getMessagesPaginated).not.toHaveBeenCalled();
    });

    it("reports a foreign cursor as a client error, not a fork", async () => {
        getMessagesPaginated.mockRejectedValueOnce(new Error("Invalid message cursor"));

        const response = await GET(getRequest("?cursor=clx1234567890abcdefghijkm"), CONTEXT);

        expect(response.status).toBe(400);
        expect((await response.json()).error).toBe("Invalid message cursor");
    });

    it("reports another user's conversation as 404", async () => {
        getMessagesPaginated.mockRejectedValueOnce(
            new Error("Conversation not found or access denied")
        );

        const response = await GET(getRequest("?limit=20"), CONTEXT);

        expect(response.status).toBe(404);
    });

    it("never reaches the database unauthenticated", async () => {
        getServerSession.mockResolvedValueOnce(null);

        const response = await GET(getRequest("?limit=20"), CONTEXT);

        expect(response.status).toBe(401);
        expect(getMessagesPaginated).not.toHaveBeenCalled();
        expect(getConversationWithMessages).not.toHaveBeenCalled();
    });
});
