// src/lib/ai/context-manager.ts
// ────────────────────────────────────────────────────────────────
// Context window management for multi-provider chat.
// Handles token counting and message truncation to fit within
// each model's context window.
// ────────────────────────────────────────────────────────────────

import { getModel, type ModelDefinition } from "@/lib/mastra/providers";

/**
 * Message format for chat requests
 */
export interface ChatMessage {
    role: "system" | "user" | "assistant";
    content: string;
}

/**
 * Estimate token count for a text string.
 * This is a rough approximation (~4 chars per token).
 * For production, consider using tiktoken for accurate counts.
 */
export function estimateTokens(text: string): number {
    // Average: ~4 characters per token for English text
    // This is an approximation; actual token count varies by tokenizer
    return Math.ceil(text.length / 4);
}

/**
 * Estimate token count for a message array.
 */
export function estimateMessagesTokens(messages: ChatMessage[]): number {
    return messages.reduce((total, msg) => {
        return total + estimateTokens(msg.content);
    }, 0);
}

/**
 * Get the safe maximum context tokens for a model.
 * Reserves 25% of the context window for the response.
 */
export function getMaxContextTokens(modelId: string): number {
    // Find the model across all providers
    const allProviders = [
        "openai", "anthropic", "google", "mistral",
        "groq", "xai", "deepseek", "perplexity"
    ];

    let model: ModelDefinition | undefined;
    for (const providerId of allProviders) {
        model = getModel(providerId, modelId);
        if (model) break;
    }

    if (!model) {
        // Default to a safe value if model not found
        return 96000; // 128k * 0.75
    }

    // Reserve 25% for the response
    return Math.floor(model.contextWindow * 0.75);
}

export interface PrepareMessagesOptions {
    /** Provider ID (e.g., "openai") */
    providerId: string;
    /** Model ID (e.g., "gpt-4o") */
    modelId: string;
    /** System prompt to prepend */
    systemPrompt?: string;
    /** Custom max tokens override */
    maxTokens?: number;
}

/**
 * Prepare messages for a chat request.
 * Applies sliding window truncation to fit within context limits.
 */
export function prepareMessages(
    messages: ChatMessage[],
    options: PrepareMessagesOptions
): ChatMessage[] {
    const { modelId, systemPrompt, maxTokens } = options;

    // Get the model's context limit
    const effectiveMaxTokens = maxTokens ?? getMaxContextTokens(modelId);

    const result: ChatMessage[] = [];
    let totalTokens = 0;

    // Add system prompt first (always included)
    if (systemPrompt) {
        result.push({ role: "system", content: systemPrompt });
        totalTokens += estimateTokens(systemPrompt);
    }

    // If we're already over budget, just return system prompt
    if (totalTokens >= effectiveMaxTokens) {
        return result;
    }

    // Work backwards from most recent messages (sliding window)
    const reversedMessages = [...messages].reverse();
    const selectedMessages: ChatMessage[] = [];

    for (const msg of reversedMessages) {
        // Skip system messages in the history (we handle them separately)
        if (msg.role === "system") continue;

        const msgTokens = estimateTokens(msg.content);

        if (totalTokens + msgTokens <= effectiveMaxTokens) {
            selectedMessages.unshift(msg);
            totalTokens += msgTokens;
        } else {
            // We've hit the limit, stop adding more
            break;
        }
    }

    return [...result, ...selectedMessages];
}

/**
 * Generate a title for a conversation based on the first user message.
 * Returns a truncated version of the first message.
 */
export function generateTitleFromMessage(content: string): string {
    // Clean up and truncate the message for use as a title
    const cleaned = content
        .replace(/\n/g, " ")
        .replace(/\s+/g, " ")
        .trim();

    if (cleaned.length <= 50) {
        return cleaned || "New Chat";
    }

    return cleaned.slice(0, 47) + "...";
}
