import { beforeEach, describe, expect, it, vi } from "vitest";

// vi.mock is hoisted above a top-level const, so the mock has to come from
// vi.hoisted or the factory reads an uninitialized binding.
const { generateText } = vi.hoisted(() => ({ generateText: vi.fn() }));

vi.mock("ai", async (importOriginal) => {
    const actual = await importOriginal<typeof import("ai")>();
    return { ...actual, generateText };
});

import { validateApiKey } from "../index";
import { KEY_VALIDATION_MAX_TOKENS, KEY_VALIDATION_TIMEOUT_MS } from "@/lib/constants";

beforeEach(() => {
    vi.clearAllMocks();
    generateText.mockResolvedValue({ text: "ok" });
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

describe("validateApiKey bounds the billed call", () => {
    it("caps the output and the clock", async () => {
        await expect(validateApiKey("openai", "sk-some-stored-value")).resolves.toBe(true);

        expect(generateText).toHaveBeenCalledTimes(1);
        const args = generateText.mock.calls[0][0];
        // Untested before: "Say 'ok'" carried no token cap, so the model was
        // free to answer at length on the user's bill, and no signal, so a
        // stalled provider held the request open.
        expect(args.maxOutputTokens).toBe(KEY_VALIDATION_MAX_TOKENS);
        expect(args.abortSignal).toBeInstanceOf(AbortSignal);
        expect(KEY_VALIDATION_TIMEOUT_MS).toBeGreaterThan(0);
    });

    it("treats a stalled provider as not confirmed rather than throwing", async () => {
        const aborted = new Error("The operation was aborted");
        aborted.name = "AbortError";
        generateText.mockRejectedValueOnce(aborted);

        await expect(validateApiKey("openai", "sk-some-stored-value")).resolves.toBe(false);
    });

    it("treats any provider failure as not confirmed", async () => {
        generateText.mockRejectedValueOnce(new Error("401 unauthorized"));

        await expect(validateApiKey("groq", "gsk_some_key_value")).resolves.toBe(false);
    });

    it("refuses an unknown provider before asking the SDK for anything", async () => {
        await expect(validateApiKey("not-a-provider", "sk-whatever-long")).resolves.toBe(false);

        expect(generateText).not.toHaveBeenCalled();
    });

    it("uses the requested model when the caller names one", async () => {
        await validateApiKey("openai", "sk-some-stored-value", "gpt-4o-mini");

        const prompt = generateText.mock.calls[0][0];
        expect(prompt.model).toBeDefined();
    });
});
