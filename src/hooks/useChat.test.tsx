import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The chat store is zustand/persist over localStorage, and ESM hoists static
// imports above any stub -- so the store is imported dynamically, after the
// backing map exists. Without this setState() throws inside the persist
// middleware before a single assertion runs.
const memoryStore = new Map<string, string>();
Object.defineProperty(window, "localStorage", {
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

const { useChat } = await import("./useChat");
const { useChatStore } = await import("@/stores/chat-store");

// Behaviour under test: what the client actually puts on the wire. The route
// already honours a full transcript in private mode, so a regression here
// silently reintroduces "the private chat has no memory" without any server
// change to point at.

interface SentBody {
    messages: Array<{ role: string; content: string }>;
    privateMode?: boolean;
    conversationId?: string;
}

function captureFetch() {
    // Typed via the generic so the stub keeps fetch's signature without
    // declaring parameters it never reads.
    const mock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(
        async () => new Response("", { status: 200 })
    );
    vi.stubGlobal("fetch", mock);
    return mock;
}

function readBody(mock: ReturnType<typeof captureFetch>): SentBody {
    const [, init] = mock.mock.calls[0];
    return JSON.parse((init as RequestInit).body as string) as SentBody;
}

const prior = [
    { id: "m1", role: "user" as const, content: "What is the refund policy?", createdAt: "2026-10-05T08:00:00.000Z" },
    { id: "m2", role: "assistant" as const, content: "It covers 30 days.", createdAt: "2026-10-05T08:00:05.000Z" },
    { id: "m3", role: "user" as const, content: "And after that?", createdAt: "2026-10-05T08:01:00.000Z" },
];

beforeEach(() => {
    useChatStore.setState({
        messages: prior,
        conversationId: "c-existing",
        providerId: "openai",
        modelId: "gpt-4o",
    });
});

afterEach(() => {
    vi.unstubAllGlobals();
});

async function submitWith(privateMode: boolean) {
    const mock = captureFetch();
    const { result } = renderHook(() => useChat({ privateMode }));

    await act(async () => {
        result.current.setInput("Summarise this thread");
    });
    await act(async () => {
        await result.current.handleSubmit();
    });
    await waitFor(() => expect(mock).toHaveBeenCalled());
    return readBody(mock);
}

describe("useChat request transcript", () => {
    it("sends the whole thread in private mode", async () => {
        const body = await submitWith(true);
        expect(body.messages.map((m) => m.content)).toEqual([
            "What is the refund policy?",
            "It covers 30 days.",
            "And after that?",
            "Summarise this thread",
        ]);
        expect(body.privateMode).toBe(true);
    });

    it("sends only the new turn when the server owns the history", async () => {
        const body = await submitWith(false);
        expect(body.messages).toEqual([{ role: "user", content: "Summarise this thread" }]);
        // The route rebuilds history from the database and appends exactly this
        // message, so anything more here would be duplicated context.
        expect(body.conversationId).toBe("c-existing");
    });

    it("targets the conversation the route segment names, not whatever the store still holds", async () => {
        // /chat/[id] passes the URL's id while loadConversation() is still in
        // flight. Reading the store only meant an early message went to the
        // previously opened conversation -- or started a second one.
        useChatStore.setState({ conversationId: "c-stale-from-previous-chat" });
        const mock = captureFetch();
        const { result } = renderHook(() => useChat({ conversationId: "c-from-url" }));

        await act(async () => {
            result.current.setInput("First message after opening the link");
        });
        await act(async () => {
            await result.current.handleSubmit();
        });
        await waitFor(() => expect(mock).toHaveBeenCalled());

        expect(readBody(mock).conversationId).toBe("c-from-url");
    });
});
