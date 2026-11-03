import { beforeEach, describe, expect, it } from "vitest";
import type { Message } from "./chat-store";

// The stores are zustand/persist over localStorage and ESM hoists static imports
// above any stub, so they are imported dynamically once the backing map exists.
// Same reason as src/hooks/useChat.test.tsx: without it setState() throws inside
// the persist middleware before a single assertion runs.
const memoryStore = new Map<string, string>();
Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
        getItem: (key: string) => memoryStore.get(key) ?? null,
        setItem: (key: string, value: string) => { memoryStore.set(key, value); },
        removeItem: (key: string) => { memoryStore.delete(key); },
        clear: () => memoryStore.clear(),
        key: (index: number) => [...memoryStore.keys()][index] ?? null,
        get length() { return memoryStore.size; },
    },
});

const { useChatStore } = await import("./chat-store");
const { usePersonalizationStore } = await import("./personalization-store");

// Private mode sends whatever the chat store holds -- useChat builds the
// transcript from the store rather than from the database -- so the transcript
// has to change with the mode. These two tests are that boundary.

const saved: Message[] = [
    { id: "m1", role: "user", content: "Question about my saved order", createdAt: "2026-10-05T08:00:00.000Z" },
    { id: "m2", role: "assistant", content: "Here is what I found.", createdAt: "2026-10-05T08:00:04.000Z" },
];

beforeEach(() => {
    usePersonalizationStore.setState({ privateChatMode: false });
    useChatStore.setState({
        messages: saved,
        conversationId: "c-saved",
        conversationTitle: "Saved order question",
    });
});

function toggle(enabled: boolean) {
    usePersonalizationStore.getState().setPrivateChatMode(enabled);
}

describe("setPrivateChatMode", () => {
    it("does not carry the open conversation into the private session", () => {
        toggle(true);

        expect(usePersonalizationStore.getState().privateChatMode).toBe(true);
        expect(useChatStore.getState().messages).toEqual([]);
        expect(useChatStore.getState().conversationId).toBeNull();
    });

    it("does not carry the private exchange back into a saved session", () => {
        toggle(true);
        useChatStore.setState({
            messages: [{
                id: "p1",
                role: "user",
                content: "Something I did not want stored",
                createdAt: "2026-10-05T09:00:00.000Z",
            }],
        });

        toggle(false);

        expect(usePersonalizationStore.getState().privateChatMode).toBe(false);
        expect(useChatStore.getState().messages).toEqual([]);
    });
});
