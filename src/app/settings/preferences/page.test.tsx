import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// A brand-new account gets { preferences: null } from GET /api/preferences. That
// used to be treated as a failure, which hid the whole form - and the form was
// the only way to create the row, so the settings screen was a dead end for every
// fresh install until a row existed by some other route.

// The saved row is what each case starts from: null for a fresh account, a
// partial row for one saved before a provider or model changed.
const saved = vi.hoisted(() => ({ row: null as unknown }));

vi.mock("@/hooks/usePreferences", () => ({
    usePreferences: () => ({
        preferences: saved.row,
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
import { getProvider } from "@/lib/mastra/providers";

// Read from the real registry: pinning an id here would make the case pass for
// the wrong reason the next time a default model changes.
function defaultModelIdFor(providerId: string): string {
    const models = getProvider(providerId)?.models ?? [];
    return (models.find((model) => model.isDefault) ?? models[0]).id;
}

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

    it("picks provider and model with the shared Select, not a native one", () => {
        // M-5: this page had raw <select>s while every other picker in the app is
        // the Radix one, so the trigger, the focus ring and the option list all
        // rendered differently per OS.
        render(<PreferencesPage />);
        expect(document.querySelectorAll("select")).toHaveLength(0);
        expect(screen.getByLabelText("Provider").getAttribute("role")).toBe("combobox");
        expect(screen.getByLabelText("Model").getAttribute("role")).toBe("combobox");
    });
});

describe("preferences page with a saved row", () => {
    afterEach(() => {
        cleanup();
        saved.row = null;
    });

    it("opens clean when the stored model is the one the registry resolves to", () => {
        saved.row = {
            defaultProviderId: "openai",
            defaultModelId: defaultModelIdFor("openai"),
            defaultSystemPrompt: "Answer briefly.",
            theme: "system",
            sendWithEnter: true,
            showTokenCount: false,
        };
        render(<PreferencesPage />);

        expect(screen.queryByText(/Unsaved changes/i)).toBeNull();
        expect(screen.getByRole("button", { name: /Save preferences/i })).toBeTruthy();
    });

    it("does not report unsaved changes when the stored model no longer resolves", () => {
        // The form shows the registry default for a model id that is missing or
        // unknown, so the saved side has to derive it the same way. Comparing the
        // raw column against the derived field reported "Unsaved changes" on every
        // mount for such a row, and Save was live without the user touching anything.
        saved.row = {
            defaultProviderId: "openai",
            defaultModelId: "gpt-3.5-turbo-instruct",
            defaultSystemPrompt: null,
            theme: "system",
            sendWithEnter: true,
            showTokenCount: false,
        };
        render(<PreferencesPage />);

        expect(screen.queryByText(/Unsaved changes/i)).toBeNull();
    });
});
