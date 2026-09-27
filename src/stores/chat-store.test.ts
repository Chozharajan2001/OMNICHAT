import { beforeEach, describe, expect, it, vi } from "vitest";
import { useChatStore, type Message } from "./chat-store";

// Behavior contract for the id-targeted stream update (audit H-frontend):
// chunks must ONLY ever write to their own assistant message, never to
// whatever happens to be last in the store.

function message(id: string, content: string, role: Message["role"] = "assistant"): Message {
    return { id, role, content, createdAt: new Date().toISOString() };
}

beforeEach(() => {
    // persist is a no-op in the node environment; reset the live state.
    useChatStore.setState({ messages: [] });
});

describe("chat-store updateMessage", () => {
    it("updates exactly the message with the given id", () => {
        useChatStore.setState({
            messages: [
                message("u1", "question", "user"),
                message("a1", ""),
                message("a0", "older reply"),
            ],
        });

        useChatStore.getState().updateMessage("a1", "partial answer");

        const { messages } = useChatStore.getState();
        expect(messages.find((m) => m.id === "a1")?.content).toBe("partial answer");
        expect(messages.find((m) => m.id === "a0")?.content).toBe("older reply");
        expect(messages.find((m) => m.id === "u1")?.content).toBe("question");
    });

    it("is a safe no-op when the target message was removed", () => {
        useChatStore.setState({ messages: [message("a0", "other conversation")] });

        useChatStore.getState().updateMessage("gone", "stale stream chunk");

        expect(useChatStore.getState().messages).toEqual([
            expect.objectContaining({ id: "a0", content: "other conversation" }),
        ]);
    });

    it("does not corrupt a different conversation loaded mid-stream", () => {
        // Old behavior (updateLastMessage) overwrote the last message of the
        // newly loaded conversation with the in-flight stream's content.
        useChatStore.setState({ messages: [message("a1", "")] });
        const streamInto = (text: string) =>
            useChatStore.getState().updateMessage("a1", text);

        streamInto("half a");
        // User switches conversations: store now shows another transcript.
        useChatStore.setState({ messages: [message("x1", "unrelated answer", "user")] });
        streamInto("broken reply");

        expect(useChatStore.getState().messages).toEqual([
            expect.objectContaining({ id: "x1", content: "unrelated answer" }),
        ]);
    });

    it("removeMessage only removes the targeted id", () => {
        useChatStore.setState({
            messages: [message("a1", "one"), message("a2", "two")],
        });

        useChatStore.getState().removeMessage("a1");

        expect(useChatStore.getState().messages.map((m) => m.id)).toEqual(["a2"]);
    });

    it("addMessage appends without touching existing content", () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
        useChatStore.setState({ messages: [] });

        useChatStore.getState().addMessage(message("u1", "hello", "user"));
        useChatStore.getState().addMessage(message("a1", ""));

        expect(useChatStore.getState().messages.map((m) => m.id)).toEqual(["u1", "a1"]);
        warn.mockRestore();
    });
});
