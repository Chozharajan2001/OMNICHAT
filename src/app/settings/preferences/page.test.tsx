import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// A brand-new account gets { preferences: null } from GET /api/preferences. That
// used to be treated as a failure, which hid the whole form - and the form was
// the only way to create the row, so the settings screen was a dead end for every
// fresh install until a row existed by some other route.

vi.mock("@/hooks/usePreferences", () => ({
    usePreferences: () => ({
        preferences: null,
        loading: false,
        error: null,
        updatePreferences: vi.fn(),
        refresh: vi.fn(),
    }),
}));

vi.mock("next/navigation", () => ({
    useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
    usePathname: () => "/settings/preferences",
}));

// lucide-react renders real <svg> nodes here; mocking it would only add a list
// of names to keep in sync with the page.

import PreferencesPage from "./page";

// jsdom gives no usable localStorage here and the personalization store
// rehydrates through it on mount; back it with a map.
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

// jsdom has no matchMedia; the theme control subscribes to "system" on mount.
window.matchMedia = () => ({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
}) as unknown as MediaQueryList;

describe("preferences page with no saved row", () => {
    afterEach(cleanup);

    it("renders the defaults form instead of an error", () => {
        render(<PreferencesPage />);
        expect(screen.queryByText(/Preferences unavailable/i)).toBeNull();
        expect(screen.getByText(/Personalize your desk/i)).toBeTruthy();
    });
});
