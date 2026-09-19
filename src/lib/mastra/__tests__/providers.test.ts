// src/lib/mastra/__tests__/providers.test.ts
import { describe, it, expect } from "vitest";
import {
    getModel,
    getProvider,
    SUPPORTED_PROVIDERS,
} from "../providers";

describe("getModel", () => {
    it("returns model definition for valid OpenAI model", () => {
        const model = getModel("openai", "gpt-4o");
        expect(model).toBeDefined();
        expect(model?.id).toBe("gpt-4o");
        expect(model?.providerId).toBe("openai");
        expect(model?.contextWindow).toBeGreaterThan(0);
    });

    it("returns model definition for valid Anthropic model", () => {
        const model = getModel("anthropic", "claude-sonnet-4");
        expect(model).toBeDefined();
        expect(model?.id).toBe("claude-sonnet-4");
        expect(model?.providerId).toBe("anthropic");
    });

    it("returns undefined for invalid model ID", () => {
        const model = getModel("openai", "invalid-model");
        expect(model).toBeUndefined();
    });

    it("returns undefined for invalid provider ID", () => {
        const model = getModel("invalid-provider", "gpt-4o");
        expect(model).toBeUndefined();
    });

    it("returns undefined when provider doesn't have model", () => {
        const model = getModel("anthropic", "gpt-4o");
        expect(model).toBeUndefined();
    });
});

describe("getProvider", () => {
    it("returns provider definition for valid provider", () => {
        const provider = getProvider("openai");
        expect(provider).toBeDefined();
        expect(provider?.id).toBe("openai");
        expect(provider?.name).toBe("OpenAI");
        expect(provider?.models.length).toBeGreaterThan(0);
    });

    it("returns undefined for invalid provider ID", () => {
        const provider = getProvider("invalid-provider");
        expect(provider).toBeUndefined();
    });

    it("includes required fields in provider definition", () => {
        const provider = getProvider("openai");
        expect(provider).toHaveProperty("id");
        expect(provider).toHaveProperty("name");
        expect(provider).toHaveProperty("description");
        expect(provider).toHaveProperty("icon");
        expect(provider).toHaveProperty("website");
        expect(provider).toHaveProperty("docsUrl");
        expect(provider).toHaveProperty("supportsStreaming");
        expect(provider).toHaveProperty("models");
    });
});

describe("SUPPORTED_PROVIDERS", () => {
    it("contains multiple providers", () => {
        expect(SUPPORTED_PROVIDERS.length).toBeGreaterThan(0);
    });

    it("includes major AI providers", () => {
        const providerIds = SUPPORTED_PROVIDERS.map((p) => p.id);
        expect(providerIds).toContain("openai");
        expect(providerIds).toContain("anthropic");
        expect(providerIds).toContain("google");
    });

    it("each provider has required fields", () => {
        for (const provider of SUPPORTED_PROVIDERS) {
            expect(provider).toHaveProperty("id");
            expect(provider).toHaveProperty("name");
            expect(provider).toHaveProperty("description");
            expect(provider).toHaveProperty("models");
            expect(Array.isArray(provider.models)).toBe(true);
            expect(provider.models.length).toBeGreaterThan(0);
        }
    });

    it("each model has required fields", () => {
        for (const provider of SUPPORTED_PROVIDERS) {
            for (const model of provider.models) {
                expect(model).toHaveProperty("id");
                expect(model).toHaveProperty("name");
                expect(model).toHaveProperty("contextWindow");
                expect(model.contextWindow).toBeGreaterThan(0);
                expect(model).toHaveProperty("maxOutputTokens");
                expect(model.maxOutputTokens).toBeGreaterThan(0);
            }
        }
    });
});
