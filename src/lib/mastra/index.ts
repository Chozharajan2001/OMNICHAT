// src/lib/mastra/index.ts
// ────────────────────────────────────────────────────────────────
// Mastra AI – Provider factory & key validation
// ────────────────────────────────────────────────────────────────
// This module abstracts the creation of language‑model instances for
// all supported providers. It also offers a lightweight API‑key
// validation function that performs a minimal request (1 token) to
// ensure the key is active before we store it.
// ────────────────────────────────────────────────────────────────

import { generateText, LanguageModel } from "ai";
import { KEY_VALIDATION_MAX_TOKENS, KEY_VALIDATION_TIMEOUT_MS } from "@/lib/constants";

import { createOpenAI } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createMistral } from "@ai-sdk/mistral";
import { createGroq } from "@ai-sdk/groq";
import { createXai } from "@ai-sdk/xai";
import { createDeepSeek } from "@ai-sdk/deepseek";
import { createPerplexity } from "@ai-sdk/perplexity";

import { getProvider, getModel, type ModelDefinition } from "./providers";

/* ────────────────────────────────────────────────────────────────
   Provider factory map
   ──────────────────────────────────────────────────────────────── */

type ProviderFactory = (apiKey: string) => {
    languageModel: (modelId: string) => LanguageModel;
};

const PROVIDER_FACTORIES: Record<string, ProviderFactory> = {
    openai: (apiKey) => createOpenAI({ apiKey }),
    anthropic: (apiKey) => createAnthropic({ apiKey }),
    google: (apiKey) => createGoogleGenerativeAI({ apiKey }),
    mistral: (apiKey) => createMistral({ apiKey }),
    groq: (apiKey) => createGroq({ apiKey }),
    xai: (apiKey) => createXai({ apiKey }),
    deepseek: (apiKey) => createDeepSeek({ apiKey }),
    perplexity: (apiKey) => createPerplexity({ apiKey }),
    "nvidia-nim": (apiKey) => createOpenAICompatible({
        name: "nvidia-nim",
        apiKey,
        baseURL: "https://integrate.api.nvidia.com/v1",
    }),
};

/* ────────────────────────────────────────────────────────────────
   Public helpers
   ──────────────────────────────────────────────────────────────── */

/**
 * Create a language model instance for the given provider, model, and API key.
 *
 * @param providerId - e.g. "openai"
 * @param modelId - e.g. "gpt-4o"
 * @param apiKey - user‑provided API key (plain text)
 * @returns Language model object, ready to pass to `generateText` or `streamText`
 */
export function createLanguageModel(
    providerId: string,
    modelId: string,
    apiKey: string
) {
    const factory = PROVIDER_FACTORIES[providerId];
    if (!factory) {
        throw new Error(`Unsupported provider: ${providerId}`);
    }
    return factory(apiKey).languageModel(modelId);
}

/**
 * Validate an API key by performing a minimal generate request.
 *
 * Uses the provider's default model if none is provided.
 *
 * @returns true if the key is valid (request succeeded), false otherwise
 */
export async function validateApiKey(
    providerId: string,
    apiKey: string,
    modelId?: string
): Promise<boolean> {
    try {
        // Resolve model: prefer given model, else provider default, else first model
        let targetModel: ModelDefinition | undefined;
        if (modelId) {
            targetModel = getModel(providerId, modelId);
        }
        if (!targetModel) {
            const provider = getProvider(providerId);
            if (!provider) {
                throw new Error(`Unknown provider: ${providerId}`);
            }
            targetModel =
                provider.models.find((m) => m.isDefault) ?? provider.models[0];
        }

        const model = createLanguageModel(providerId, targetModel.id, apiKey);

        // Perform a tiny generate (no streaming) to verify credentials.
        // Bounded on purpose: this runs against someone's paid quota, and a
        // hung provider would otherwise hold the request open. An aborted call
        // lands in the catch below and reads as "not confirmed".
        await generateText({
            model,
            prompt: "Say 'ok'",
            maxOutputTokens: KEY_VALIDATION_MAX_TOKENS,
            abortSignal: AbortSignal.timeout(KEY_VALIDATION_TIMEOUT_MS),
        });

        return true;
    } catch (error: unknown) {
        // In development we may log the error, but we don't expose details to the caller.
        if (process.env.NODE_ENV === "development") {
            const errorMessage = error instanceof Error ? error.message : "Unknown error";
            console.warn(`API key validation failed for ${providerId}:`, errorMessage);
            // Log more details for debugging
            if (error instanceof Error && 'cause' in error) {
                console.warn('Error cause:', error.cause);
            }
        }
        return false;
    }
}
