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
 * 
 * @param modelId - The model identifier (e.g., "gpt-4o")
 * @param providerId - Optional provider ID for direct lookup (O(1) vs O(8n))
 */
export function getMaxContextTokens(modelId: string, providerId?: string): number {
    // If providerId is known, use it directly for O(1) lookup
    let model: ModelDefinition | undefined;
    if (providerId) {
        model = getModel(providerId, modelId);
    } else {
        // Fallback: search across all providers (O(8n))
        const allProviders = [
            "openai", "anthropic", "google", "mistral",
            "groq", "xai", "deepseek", "perplexity"
        ];

        for (const pid of allProviders) {
            model = getModel(pid, modelId);
            if (model) break;
        }
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
 * 
 * Optimizations:
 * - Uses providerId for O(1) model lookup instead of O(8n)
 * - Iterates backwards without copying array
 * - Uses push+reverse instead of unshift (O(n) vs O(n²))
 */
export function prepareMessages(
    messages: ChatMessage[],
    options: PrepareMessagesOptions
): ChatMessage[] {
    const { providerId, modelId, systemPrompt, maxTokens } = options;

    // Get the model's context limit (pass providerId for O(1) lookup)
    const effectiveMaxTokens = maxTokens ?? getMaxContextTokens(modelId, providerId);

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
    // Optimization: iterate in-place without copying array
    const selectedMessages: ChatMessage[] = [];

    for (let i = messages.length - 1; i >= 0; i--) {
        const msg = messages[i];
        
        // Skip system messages in the history (we handle them separately)
        if (msg.role === "system") continue;

        const msgTokens = estimateTokens(msg.content);

        if (totalTokens + msgTokens <= effectiveMaxTokens) {
            // Optimization: push then reverse at end (O(n) vs O(n²) for unshift)
            selectedMessages.push(msg);
            totalTokens += msgTokens;
        } else {
            // We've hit the limit, stop adding more
            break;
        }
    }

    // Reverse to restore chronological order
    selectedMessages.reverse();

    return [...result, ...selectedMessages];
}

/**
 * Generate a title for a conversation based on the first user message.
 *
 * A raw echo makes a bad name: prompts arrive wrapped in instruction
 * boilerplate ("Reply with exactly: … Nothing else."), so the title would
 * quote the wrapper instead of the topic. The wrapper is stripped first and
 * the cut lands on a word boundary, never mid-word.
 */
const TITLE_MAX_LENGTH = 48;

// Leading scaffolding that describes the answer shape, not the subject.
const LEADING_INSTRUCTIONS = [
    /^\s*reply with exactly\s*:?\s*/i,
    /^\s*reply with only\s*:?\s*/i,
    /^\s*respond with only\s*:?\s*/i,
    /^\s*output only\s*:?\s*/i,
    /^\s*return only\s*:?\s*/i,
    /^\s*answer with only\s*:?\s*/i,
];

// Trailing scaffolding with the same problem from the other end. The optional
// colon covers prompts that end "...nothing else:" before pasted content.
const TRAILING_INSTRUCTIONS = [
    /\s*[:.]?\s*nothing else[:.]?\s*$/i,
    /\s*[:.]?\s*no other text[:.]?\s*$/i,
    /\s*[:.]?\s*do not explain[:.]?\s*$/i,
    /\s*[:.]?\s*no explanation[:.]?\s*$/i,
];

export function generateTitleFromMessage(content: string): string {
    // Markdown table chrome carries no topic: pipes become spaces and
    // separator rows (|---|---|) drop out entirely.
    const cleaned = content
        .split("\n")
        .filter((line) => !/^[\s|:-]+$/.test(line))
        .join(" ")
        .replace(/\|/g, " ")
        .replace(/\s+/g, " ")
        .trim();

    const unwrapped = TRAILING_INSTRUCTIONS.reduce(
        (text, pattern) => text.replace(pattern, "").trim(),
        LEADING_INSTRUCTIONS.reduce(
            (text, pattern) => text.replace(pattern, "").trim(),
            cleaned
        )
        // A stripped clause often leaves its comma behind ("this table,").
    ).replace(/,\s*$/, "");

    if (!unwrapped) {
        return "New Chat";
    }

    return truncateAtWord(unwrapped);
}

/** Cut to 48 characters at a word boundary, never mid-word. */
function truncateAtWord(text: string): string {
    if (text.length <= TITLE_MAX_LENGTH) {
        return text;
    }

    const boundary = text.lastIndexOf(" ", TITLE_MAX_LENGTH);
    if (boundary <= 0) {
        return `${text.slice(0, TITLE_MAX_LENGTH)}…`;
    }
    return `${text.slice(0, boundary)}…`;
}
