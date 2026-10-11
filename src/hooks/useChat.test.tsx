import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useChat } from "./useChat";

// The store is the hook's only state seam: a controllable double keeps the
// recovery contract (stale id dropped, user message kept) under test without
// touching the database or the network.
const storeDouble = vi.hoisted(() => ({
    state: {
        providerId: "openai",
        modelId: "gpt-4o",
        conversationId: "conv-stale",
        messages: [],
    },
    setConversationId: vi.fn(),
    setConversationTitle: vi.fn(),
    setMessages: vi.fn(),
    addMessage: vi.fn(),
    removeMessage: vi.fn(),
    updateMessage: vi.fn(),
}));

vi.mock("@/stores/chat-store", () => ({
    useChatStore: Object.assign(
        (selector?: (state: unknown) => unknown) => {
            const state = {
                ...storeDouble.state,
                setConversationId: storeDouble.setConversationId,
                setConversationTitle: storeDouble.setConversationTitle,
                setMessages: storeDouble.setMessages,
                addMessage: storeDouble.addMessage,
                removeMessage: storeDouble.removeMessage,
                updateMessage: storeDouble.updateMessage,
            };
            // The hook reads the whole store without a selector.
            return typeof selector === "function" ? selector(state) : state;
        },
        { getState: () => ({}) }
    ),
}));

function failedFetch(status: number, error: string) {
    global.fetch = vi.fn(async () => ({
        ok: false,
        status,
        json: async () => ({ error }),
        headers: new Headers(),
    })) as unknown as typeof fetch;
}

beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    storeDouble.state.conversationId = "conv-stale";
    storeDouble.state.messages = [];
});

afterEach(() => {
    vi.restoreAllMocks();
    vi.resetAllMocks();
});

describe("useChat stale-conversation recovery", () => {
    it("drops a dead conversation id so the next turn starts fresh", async () => {
        failedFetch(404, "Conversation not found");
        const { result } = renderHook(() => useChat({}));

        await act(async () => {
            result.current.setInput("hello again");
        });
        await act(async () => {
            await result.current.handleSubmit();
        });

        expect(storeDouble.setConversationId).toHaveBeenCalledWith(null);
        expect(result.current.error).toBe(
            "That conversation is gone. Send again to start a fresh one."
        );
        // The empty assistant placeholder is withdrawn; the user's message stays.
        expect(storeDouble.removeMessage).toHaveBeenCalledTimes(1);
        expect(storeDouble.addMessage).toHaveBeenCalledTimes(2);
    });

    it("keeps the id for any other failure", async () => {
        failedFetch(500, "boom");
        const { result } = renderHook(() => useChat({}));

        await act(async () => {
            result.current.setInput("hello again");
        });
        await act(async () => {
            await result.current.handleSubmit();
        });

        expect(storeDouble.setConversationId).not.toHaveBeenCalledWith(null);
        expect(result.current.error).toBe("boom");
    });
});
