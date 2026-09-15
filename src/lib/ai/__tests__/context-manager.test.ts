// src/lib/ai/__tests__/context-manager.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
    estimateTokens,
    estimateMessagesTokens,
    getMaxContextTokens,
    prepareMessages,
    generateTitleFromMessage,
    type ChatMessage
} from "../context-manager";

// Mock the providers module
vi.mock("@/lib/mastra/providers", () => ({
    getModel: vi.fn((providerId: string, modelId: string) => {
        const models: Record<string, { contextWindow: number }> = {
            "gpt-4o": { contextWindow: 128000 },
            "claude-3-opus": { contextWindow: 200000 },
            "gemini-1.5-pro": { contextWindow: 1000000 },
        };
        const model = models[modelId];
        return model ? { ...model, id: modelId, provider: providerId } : undefined;
    }),
}));

describe("estimateTokens", () => {
    it("estimates tokens for empty string", () => {
        expect(estimateTokens("")).toBe(0);
    });

    it("estimates tokens for short text", () => {
        // 10 chars / 4 = 2.5, ceil = 3
        expect(estimateTokens("1234567890")).toBe(3);
    });

    it("estimates tokens for longer text", () => {
        // 100 chars / 4 = 25
        const text = "a".repeat(100);
        expect(estimateTokens(text)).toBe(25);
    });
});

describe("estimateMessagesTokens", () => {
    it("estimates tokens for empty message array", () => {
        expect(estimateMessagesTokens([])).toBe(0);
    });

    it("estimates tokens for multiple messages", () => {
        const messages: ChatMessage[] = [
            { role: "user", content: "1234567890" }, // 3 tokens
            { role: "assistant", content: "12345678901234567890" }, // 5 tokens
        ];
        expect(estimateMessagesTokens(messages)).toBe(8);
    });
});

describe("getMaxContextTokens", () => {
    it("returns 75% of context window for known model", () => {
        // gpt-4o has 128k context, 75% = 96k
        expect(getMaxContextTokens("gpt-4o")).toBe(96000);
    });

    it("uses providerId for O(1) lookup when provided", () => {
        // Should find model directly without searching all providers
        expect(getMaxContextTokens("gpt-4o", "openai")).toBe(96000);
    });

    it("returns default for unknown model", () => {
        expect(getMaxContextTokens("unknown-model")).toBe(96000);
    });

    it("handles large context models correctly", () => {
        // gemini-1.5-pro has 1M context, 75% = 750k
        expect(getMaxContextTokens("gemini-1.5-pro")).toBe(750000);
    });
});

describe("prepareMessages", () => {
    it("returns empty array when no messages and no system prompt", () => {
        const result = prepareMessages([], {
            providerId: "openai",
            modelId: "gpt-4o",
        });
        expect(result).toEqual([]);
    });

    it("includes system prompt when provided", () => {
        const result = prepareMessages([], {
            providerId: "openai",
            modelId: "gpt-4o",
            systemPrompt: "You are helpful",
        });
        expect(result).toHaveLength(1);
        expect(result[0].role).toBe("system");
        expect(result[0].content).toBe("You are helpful");
    });

    it("includes messages in chronological order", () => {
        const messages: ChatMessage[] = [
            { role: "user", content: "First" },
            { role: "assistant", content: "Response" },
            { role: "user", content: "Second" },
        ];

        const result = prepareMessages(messages, {
            providerId: "openai",
            modelId: "gpt-4o",
        });

        // Should preserve order
        expect(result[0].content).toBe("First");
        expect(result[1].content).toBe("Response");
        expect(result[2].content).toBe("Second");
    });

    it("truncates old messages when over token limit", () => {
        // Create messages that exceed a small token limit
        const messages: ChatMessage[] = [
            { role: "user", content: "a".repeat(40000) }, // ~10k tokens
            { role: "assistant", content: "b".repeat(40000) }, // ~10k tokens
            { role: "user", content: "Recent message" }, // Small
        ];

        const result = prepareMessages(messages, {
            providerId: "openai",
            modelId: "gpt-4o",
            maxTokens: 15000, // Force truncation
        });

        // Should only include recent messages
        expect(result.length).toBeLessThan(messages.length);
        expect(result[result.length - 1].content).toBe("Recent message");
    });

    it("skips system messages in history", () => {
        const messages: ChatMessage[] = [
            { role: "system", content: "Old system" },
            { role: "user", content: "User message" },
        ];

        const result = prepareMessages(messages, {
            providerId: "openai",
            modelId: "gpt-4o",
            systemPrompt: "New system",
        });

        // Should only have the new system prompt and user message
        expect(result).toHaveLength(2);
        expect(result[0].content).toBe("New system");
        expect(result[1].content).toBe("User message");
    });

    it("returns only system prompt when all messages exceed limit", () => {
        const messages: ChatMessage[] = [
            { role: "user", content: "a".repeat(400000) }, // Huge message
        ];

        const result = prepareMessages(messages, {
            providerId: "openai",
            modelId: "gpt-4o",
            systemPrompt: "System",
            maxTokens: 100, // Very small limit
        });

        expect(result).toHaveLength(1);
        expect(result[0].content).toBe("System");
    });
});

describe("generateTitleFromMessage", () => {
    it("returns 'New Chat' for empty message", () => {
        expect(generateTitleFromMessage("")).toBe("New Chat");
    });

    it("returns short messages unchanged", () => {
        expect(generateTitleFromMessage("Hello")).toBe("Hello");
    });

    it("truncates long messages with ellipsis", () => {
        const longMessage = "a".repeat(100);
        const result = generateTitleFromMessage(longMessage);
        expect(result.length).toBe(50); // 47 + "..."
        expect(result.endsWith("...")).toBe(true);
    });

    it("cleans up whitespace and newlines", () => {
        expect(generateTitleFromMessage("Hello\n\nWorld   Test")).toBe("Hello World Test");
    });

    it("trims leading and trailing whitespace", () => {
        expect(generateTitleFromMessage("  Hello  ")).toBe("Hello");
    });
});
