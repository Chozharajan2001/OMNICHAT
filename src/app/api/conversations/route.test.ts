// src/app/api/conversations/route.test.ts
// ────────────────────────────────────────────────────────────────
// GET /api/conversations -- the pagination cursor contract (plan 2.5).
// ────────────────────────────────────────────────────────────────

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getServerSession, findConversationCursor, getConversations } = vi.hoisted(() => ({
    getServerSession: vi.fn(),
    findConversationCursor: vi.fn(),
    getConversations: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getServerSession }));
vi.mock("@/lib/api/csrf", () => ({ guardMutationRequest: vi.fn() }));
vi.mock("@/lib/db/queries/conversations", () => ({
    getConversations,
    findConversationCursor,
    createConversation: vi.fn(),
    deleteAllConversations: vi.fn(),
}));

import { GET } from "./route";

const USER_ID = "user-123";
const OWNED_CURSOR = "cnotpartofthisusershistory01";

function listRequest(query = "") {
    return new Request(`http://localhost:3000/api/conversations${query}`, { method: "GET" });
}

beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    getServerSession.mockResolvedValue({ user: { id: USER_ID } });
    getConversations.mockResolvedValue({ conversations: [], nextCursor: null });
    findConversationCursor.mockResolvedValue({ id: OWNED_CURSOR });
});

afterEach(() => {
    vi.restoreAllMocks();
    vi.resetAllMocks();
});

describe("GET /api/conversations cursor contract (2.5)", () => {
    it("lists the first page when no cursor is supplied", async () => {
        const response = await GET(listRequest());

        expect(response.status).toBe(200);
        expect(getConversations).toHaveBeenCalledWith(USER_ID, 50, undefined, { archived: false });
        expect(findConversationCursor).not.toHaveBeenCalled();
    });

    it("rejects a malformed cursor without touching the list query", async () => {
        const response = await GET(listRequest("?cursorId=2026-13-45"));

        expect(response.status).toBe(400);
        expect(await response.json()).toEqual({ error: "Invalid cursor" });
        expect(response.headers.get("Cache-Control")).toBe("no-store");
        expect(getConversations).not.toHaveBeenCalled();
    });

    // Measured against the SQLite database: a cursor naming a row that is not
    // the caller's does not raise an error, it seeks to an empty page with no
    // nextCursor, and a client reading that as "end of list" silently loses
    // every conversation after the gap.
    it("rejects a well-formed cursor that names no conversation the caller owns", async () => {
        findConversationCursor.mockResolvedValueOnce(null);

        const response = await GET(listRequest(`?cursorId=${OWNED_CURSOR}`));

        expect(response.status).toBe(400);
        expect(findConversationCursor).toHaveBeenCalledWith(USER_ID, OWNED_CURSOR);
        expect(getConversations).not.toHaveBeenCalled();
    });

    it("resumes from a cursor the caller owns", async () => {
        const response = await GET(listRequest(`?cursorId=${OWNED_CURSOR}`));

        expect(response.status).toBe(200);
        expect(getConversations).toHaveBeenCalledWith(USER_ID, 50, { id: OWNED_CURSOR }, { archived: false });
    });

    it("never reaches the database with an unauthenticated request", async () => {
        getServerSession.mockResolvedValue(null);

        const response = await GET(listRequest(`?cursorId=${OWNED_CURSOR}`));

        expect(response.status).toBe(401);
        expect(getConversations).not.toHaveBeenCalled();
    });
});
