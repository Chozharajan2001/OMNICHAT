import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { useApiKeys, useChatStore, setModel } = vi.hoisted(() => ({
    useApiKeys: vi.fn(),
    useChatStore: vi.fn(),
    setModel: vi.fn(),
}));

vi.mock("@/hooks/useApiKeys", () => ({ useApiKeys }));
vi.mock("@/stores/chat-store", () => ({
    useChatStore,
}));

import { ModelSelector, splitModelValue } from "./ModelSelector";

const validKey = { providerId: "openai", isValid: true };
const unverifiedKey = { providerId: "groq", isValid: false };

beforeEach(() => {
    vi.clearAllMocks();
    useChatStore.mockReturnValue({ providerId: "openai", modelId: "gpt-4o", setModel });
});

afterEach(cleanup);

describe("ModelSelector loading guard (3.7)", () => {
    it("does not offer to connect while the vault is still being read", () => {
        useApiKeys.mockReturnValue({ keys: [], loading: true });

        render(<ModelSelector />);

        expect(screen.queryByText("Connect a provider")).toBeNull();
        const button = screen.getByRole("button", { name: /loading models/i });
        expect(button.hasAttribute("disabled")).toBe(true);
    });

    it("offers to connect only once the answer is known and there is no usable key", () => {
        useApiKeys.mockReturnValue({ keys: [unverifiedKey], loading: false });

        render(<ModelSelector />);

        expect(screen.getByText("Connect a provider")).toBeDefined();
    });

    it("renders the picker when a verified key exists", () => {
        useApiKeys.mockReturnValue({ keys: [validKey], loading: false });

        render(<ModelSelector />);

        expect(screen.getByRole("combobox", { name: "Chat model" })).toBeDefined();
    });

    it("falls back to the first keyed provider when the stored one has no key", () => {
        useApiKeys.mockReturnValue({
            keys: [{ providerId: "nvidia-nim", isValid: true }],
            loading: false,
        });

        render(<ModelSelector />);

        expect(setModel).toHaveBeenCalledWith("nvidia-nim", expect.any(String));
    });

    it("leaves a keyed selection alone", () => {
        useApiKeys.mockReturnValue({ keys: [validKey], loading: false });

        render(<ModelSelector />);

        expect(setModel).not.toHaveBeenCalled();
    });
});

describe("splitModelValue (3.7)", () => {
    // `${providerId}:${modelId}` was cut with split(":"), which truncates a model
    // id that contains a separator of its own.
    it("splits at the first separator and keeps the rest intact", () => {
        expect(splitModelValue("openai:gpt-4o")).toEqual(["openai", "gpt-4o"]);
        expect(splitModelValue("proxy:model:version")).toEqual(["proxy", "model:version"]);
    });

    it("returns an empty model rather than an undefined one", () => {
        expect(splitModelValue("openai")).toEqual(["openai", ""]);
    });
});
