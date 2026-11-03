import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { scopeCaption } from "./ConversationSidebar";

vi.mock("next/navigation", () => ({
    useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
    usePathname: () => "/chat",
    useSearchParams: () => new URLSearchParams(),
}));

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

window.matchMedia = () => ({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
}) as unknown as MediaQueryList;

afterEach(cleanup);

// The list fetch asks for one page and never follows nextCursor, so a caption
// must say which page it describes. The empty-state copy handles the no-match
// case; this caption handles the other three list states.
describe("scopeCaption", () => {
    it("says nothing when the fetched page is the whole list", () => {
        expect(scopeCaption(false, "")).toBeNull();
        expect(scopeCaption(false, "alpha")).toBeNull();
    });

    it("names the full list when nothing is filtered", () => {
        render(<>{scopeCaption(true, "")}</>);

        expect(screen.getByText(/Showing the first \d+ most recent chats\./)).toBeTruthy();
    });

    it("names the server-side title scope when a query is active", () => {
        render(<>{scopeCaption(true, "  alpha ")}</>);

        expect(screen.getByText(/Showing the first \d+ title matches\./)).toBeTruthy();
    });
});
