import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { useProviders, useChatStore, setModel } = vi.hoisted(() => ({
    useProviders: vi.fn(),
    useChatStore: vi.fn(),
    setModel: vi.fn(),
}));

vi.mock("@/hooks/useProviders", () => ({ useProviders }));
vi.mock("@/stores/chat-store", () => ({
    useChatStore,
}));

import { ModelSelector, splitModelValue, visibleProviders } from "./ModelSelector";

const openaiKeyed = { id: "openai", hasKey: true };
const groqUnkeyed = { id: "groq", hasKey: false };

beforeEach(() => {
    vi.clearAllMocks();
    useChatStore.mockReturnValue({ providerId: "openai", modelId: "gpt-4o", setModel });
});

afterEach(cleanup);

describe("ModelSelector loading guard (3.7)", () => {
    it("does not offer to connect while the vault is still being read", () => {
        useProviders.mockReturnValue({ providers: [], loading: true });

        render(<ModelSelector />);

        expect(screen.queryByText("Connect a provider")).toBeNull();
        const button = screen.getByRole("button", { name: /loading models/i });
        expect(button.hasAttribute("disabled")).toBe(true);
    });

    it("offers to connect only once the answer is known and there is no usable key", () => {
        useProviders.mockReturnValue({ providers: [groqUnkeyed], loading: false });

        render(<ModelSelector />);

        expect(screen.getByText("Connect a provider")).toBeDefined();
    });

    it("renders the picker when a verified key exists", () => {
        useProviders.mockReturnValue({ providers: [openaiKeyed], loading: false });

        render(<ModelSelector />);

        expect(screen.getByRole("combobox", { name: "Chat model" })).toBeDefined();
    });

    it("falls back to the first keyed provider when the stored one has no key", () => {
        useProviders.mockReturnValue({
            providers: [{ id: "nvidia-nim", hasKey: true }],
            loading: false,
        });

        render(<ModelSelector />);

        expect(setModel).toHaveBeenCalledWith("nvidia-nim", expect.any(String));
    });

    it("leaves a keyed selection alone", () => {
        useProviders.mockReturnValue({ providers: [openaiKeyed], loading: false });

        render(<ModelSelector />);

        expect(setModel).not.toHaveBeenCalled();
    });
});

describe("visibleProviders (picker hygiene)", () => {
    it("lists only providers with a confirmed credential", () => {
        const shown = visibleProviders([
            { providerId: "openai", isValid: true },
            { providerId: "groq", isValid: false },
        ]).map((provider) => provider.id);

        expect(shown).toContain("openai");
        expect(shown).not.toContain("groq");
        expect(shown).not.toContain("anthropic");
    });

    it("shows nothing keyless rather than a wall of disabled rows", () => {
        expect(visibleProviders([])).toEqual([]);
        expect(visibleProviders([{ providerId: "groq", isValid: false }])).toEqual([]);
    });
});

describe("visibleProviders (picker hygiene)", () => {
    it("lists only providers with a confirmed credential", () => {
        const shown = visibleProviders([
            { providerId: "openai", isValid: true },
            { providerId: "groq", isValid: false },
        ]).map((provider) => provider.id);

        expect(shown).toContain("openai");
        expect(shown).not.toContain("groq");
        expect(shown).not.toContain("anthropic");
    });

    it("shows nothing keyless rather than a wall of disabled rows", () => {
        expect(visibleProviders([])).toEqual([]);
        expect(visibleProviders([{ providerId: "groq", isValid: false }])).toEqual([]);
    });
});

describe("splitModelValue (3.7)", () => {    // `${providerId}:${modelId}` was cut with split(":"), which truncates a model
    // id that contains a separator of its own.
    it("splits at the first separator and keeps the rest intact", () => {
        expect(splitModelValue("openai:gpt-4o")).toEqual(["openai", "gpt-4o"]);
        expect(splitModelValue("proxy:model:version")).toEqual(["proxy", "model:version"]);
    });

    it("returns an empty model rather than an undefined one", () => {
        expect(splitModelValue("openai")).toEqual(["openai", ""]);
    });
});
