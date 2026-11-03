// src/lib/mastra/providers.ts
// ────────────────────────────────────────────────────────────────
// Provider registry – central catalog for all supported AI providers.
// This file defines the metadata (pricing, capabilities, UI hints) for
// each provider and their models.  The rest of the app consumes this
// registry to populate UI (model picker, settings, etc.).
// ────────────────────────────────────────────────────────────────

export interface ProviderDefinition {
    /** Unique provider ID (e.g., "openai") */
    id: string;
    /** Display name (e.g., "OpenAI") */
    name: string;
    /** Short description shown in UI */
    description: string;
    /** Path or URL to provider icon (favicon/logo) */
    icon: string;
    /** Link to provider website */
    website: string;
    /**
     * Placeholder shown in the API key input. There is deliberately no key
     * shape pattern: nothing enforced one, and enforcing a guessed prefix would
     * refuse a valid key the day a provider changed it. The real signal is the
     * "stored, unvalidated" state until Verify confirms the key.
     */
    keyPlaceholder: string;
    /** Link to provider's API key docs */
    docsUrl: string;
    /** Whether the provider supports streaming responses */
    supportsStreaming: boolean;
    /** All models offered by this provider */
    models: ModelDefinition[];
}

export interface ModelDefinition {
    /** Unique model ID within the provider (e.g., "gpt-4o") */
    id: string;
    /** Display name (e.g., "GPT‑4o") */
    name: string;
    /** Provider to which this model belongs */
    providerId: string;
    /** Short description (capabilities, best‑use cases) */
    description: string;
    /** Context window in tokens */
    contextWindow: number;
    /** Maximum output tokens */
    maxOutputTokens: number;
    /** Input price per million tokens (USD) */
    inputPricePerMToken: number;
    /** Output price per million tokens (USD) */
    outputPricePerMToken: number;
    /** List of capabilities (text, vision, function-calling, json-mode, streaming, code, reasoning) */
    capabilities: ModelCapability[];
    /** Whether this model should be marked as the default for its provider */
    isDefault?: boolean;
}

export type ModelCapability =
    | "text"
    | "vision"
    | "function-calling"
    | "json-mode"
    | "streaming"
    | "code"
    | "reasoning";

/* ────────────────────────────────────────────────────────────────
   PROVIDER REGISTRY
   ──────────────────────────────────────────────────────────────── */

export const SUPPORTED_PROVIDERS: ProviderDefinition[] = [
    {
        id: "openai",
        name: "OpenAI",
        description: "GPT‑4o, GPT‑4o‑mini, o1, o3 and more",
        icon: "/icons/openai.svg",
        website: "https://openai.com",
        keyPlaceholder: "sk-...",
        docsUrl: "https://platform.openai.com/api-keys",
        supportsStreaming: true,
        models: [
            {
                id: "gpt-4o",
                name: "GPT‑4o",
                providerId: "openai",
                description: "Most capable model, great for complex tasks. Supports vision.",
                contextWindow: 128000,
                maxOutputTokens: 16384,
                inputPricePerMToken: 2.5,
                outputPricePerMToken: 10.0,
                capabilities: ["text", "vision", "function-calling", "json-mode", "streaming", "code"],
                isDefault: true,
            },
            {
                id: "gpt-4o-mini",
                name: "GPT‑4o‑mini",
                providerId: "openai",
                description: "Affordable, fast small model for everyday tasks.",
                contextWindow: 128000,
                maxOutputTokens: 16384,
                inputPricePerMToken: 0.15,
                outputPricePerMToken: 0.6,
                capabilities: ["text", "vision", "function-calling", "json-mode", "streaming", "code"],
            },
            {
                id: "o3-mini",
                name: "o3‑mini",
                providerId: "openai",
                description: "Cheap reasoning model for logical problem‑solving.",
                contextWindow: 200000,
                maxOutputTokens: 100000,
                inputPricePerMToken: 1.1,
                outputPricePerMToken: 4.4,
                capabilities: ["reasoning", "text"],
                isDefault: false,
            },
        ],
    },

    {
        id: "anthropic",
        name: "Anthropic",
        description: "Claude Opus 4, Sonnet 4, Haiku 3.5 – advanced reasoning.",
        icon: "/icons/anthropic.svg",
        website: "https://anthropic.com",
        keyPlaceholder: "sk-ant-...",
        docsUrl: "https://console.anthropic.com/settings/keys",
        supportsStreaming: true,
        models: [
            {
                id: "claude-opus-4",
                name: "Claude Opus 4",
                providerId: "anthropic",
                description: "Most powerful Claude – excels at complex analysis and creative writing.",
                contextWindow: 200000,
                maxOutputTokens: 8192,
                inputPricePerMToken: 15.0,
                outputPricePerMToken: 75.0,
                capabilities: ["text", "vision", "function-calling", "json-mode"],
            },
            {
                id: "claude-sonnet-4",
                name: "Claude Sonnet 4",
                providerId: "anthropic",
                description: "Balanced model for most workloads.",
                contextWindow: 200000,
                maxOutputTokens: 8192,
                inputPricePerMToken: 3.0,
                outputPricePerMToken: 15.0,
                capabilities: ["text", "vision", "function-calling", "json-mode"],
                isDefault: true,
            },
            {
                id: "claude-haiku-3-5",
                name: "Claude Haiku 3.5",
                providerId: "anthropic",
                description: "Fast, affordable model for quick tasks.",
                contextWindow: 200000,
                maxOutputTokens: 8192,
                inputPricePerMToken: 0.25,
                outputPricePerMToken: 1.25,
                capabilities: ["text", "vision", "function-calling", "json-mode"],
            },
        ],
    },

    {
        id: "google",
        name: "Google AI",
        description: "Gemini 2.5 Pro and Flash – Google's latest generation.",
        icon: "/icons/google.svg",
        website: "https://ai.google.dev",
        keyPlaceholder: "AIza...",
        docsUrl: "https://aistudio.google.com/app/apikey",
        supportsStreaming: true,
        models: [
            {
                id: "gemini-2.5-pro",
                name: "Gemini 2.5 Pro",
                providerId: "google",
                description: "Most capable Google model with strong reasoning and vision.",
                contextWindow: 1000000,
                maxOutputTokens: 64000,
                inputPricePerMToken: 7.5,
                outputPricePerMToken: 30.0,
                capabilities: ["text", "vision", "function-calling", "json-mode", "code"],
                isDefault: true,
            },
            {
                id: "gemini-2.5-flash",
                name: "Gemini 2.5 Flash",
                providerId: "google",
                description: "Fast, low‑cost model for quick responses.",
                contextWindow: 1000000,
                maxOutputTokens: 64000,
                inputPricePerMToken: 0.3,
                outputPricePerMToken: 2.5,
                capabilities: ["text", "vision", "function-calling", "json-mode"],
            },
        ],
    },

    {
        id: "mistral",
        name: "Mistral AI",
        description: "High‑performance open‑weight models (Large, Small, Codestral).",
        icon: "/icons/mistral.svg",
        website: "https://mistral.ai",
        keyPlaceholder: "...",
        docsUrl: "https://console.mistral.ai/api-keys",
        supportsStreaming: true,
        models: [
            {
                id: "mistral-large",
                name: "Mistral Large",
                providerId: "mistral",
                description: "Top‑tier reasoning model for complex tasks.",
                contextWindow: 128000,
                maxOutputTokens: 32000,
                inputPricePerMToken: 8.0,
                outputPricePerMToken: 24.0,
                capabilities: ["text", "function-calling", "json-mode"],
                isDefault: true,
            },
            {
                id: "mistral-small",
                name: "Mistral Small",
                providerId: "mistral",
                description: "Efficient model for everyday usage.",
                contextWindow: 128000,
                maxOutputTokens: 32000,
                inputPricePerMToken: 0.7,
                outputPricePerMToken: 2.1,
                capabilities: ["text", "function-calling", "json-mode"],
            },
            {
                id: "codestral",
                name: "Codestral",
                providerId: "mistral",
                description: "Specialized code generation model.",
                contextWindow: 32768,
                maxOutputTokens: 25600,
                inputPricePerMToken: 3.0,
                outputPricePerMToken: 9.0,
                capabilities: ["code"],
            },
        ],
    },

    {
        id: "groq",
        name: "Groq",
        description: "Ultra‑fast inference on LPUs; Llama 3.3 and DeepSeek R1.",
        icon: "/icons/groq.svg",
        website: "https://groq.com",
        keyPlaceholder: "gsk_...",
        docsUrl: "https://console.groq.com/keys",
        supportsStreaming: true,
        models: [
            {
                id: "llama-3.3-70b",
                name: "Llama 3.3 70B",
                providerId: "groq",
                description: "Meta's flagship open‑source model, served on Groq's LPU.",
                contextWindow: 128000,
                maxOutputTokens: 32000,
                inputPricePerMToken: 0.59,
                outputPricePerMToken: 0.79,
                capabilities: ["text", "code"],
                isDefault: true,
            },
            {
                id: "deepseek-r1-distill-llama-70b",
                name: "DeepSeek R1 Distill Llama 70B",
                providerId: "groq",
                description: "DeepSeek's reasoning‑enhanced distillation of Llama.",
                contextWindow: 128000,
                maxOutputTokens: 32000,
                inputPricePerMToken: 0.59,
                outputPricePerMToken: 0.79,
                capabilities: ["reasoning", "code"],
            },
        ],
    },

    {
        id: "xai",
        name: "xAI (Grok)",
        description: "Grok 3 and Grok 3 Mini – X's AI models.",
        icon: "/icons/xai.svg",
        website: "https://x.ai",
        keyPlaceholder: "xai-...",
        docsUrl: "https://console.x.ai/keys",
        supportsStreaming: true,
        models: [
            {
                id: "grok-3",
                name: "Grok 3",
                providerId: "xai",
                description: "Most capable Grok model, with advanced reasoning.",
                contextWindow: 128000,
                maxOutputTokens: 4096,
                inputPricePerMToken: 15.0,
                outputPricePerMToken: 30.0,
                capabilities: ["text", "reasoning"],
                isDefault: true,
            },
            {
                id: "grok-3-mini",
                name: "Grok 3 Mini",
                providerId: "xai",
                description: "Smaller, faster Grok model.",
                contextWindow: 65536,
                maxOutputTokens: 4096,
                inputPricePerMToken: 5.0,
                outputPricePerMToken: 10.0,
                capabilities: ["text", "reasoning"],
            },
        ],
    },

    {
        id: "deepseek",
        name: "DeepSeek",
        description: "DeepSeek V3 and R1 – open‑source reasoning.",
        icon: "/icons/deepseek.svg",
        website: "https://deepseek.com",
        keyPlaceholder: "sk-...",
        docsUrl: "https://platform.deepseek.com/api-keys",
        supportsStreaming: true,
        models: [
            {
                id: "deepseek-v3",
                name: "DeepSeek V3",
                providerId: "deepseek",
                description: "Latest open‑source base model.",
                contextWindow: 65536,
                maxOutputTokens: 4096,
                inputPricePerMToken: 2.0,
                outputPricePerMToken: 8.0,
                capabilities: ["text", "code"],
                isDefault: true,
            },
            {
                id: "deepseek-r1",
                name: "DeepSeek R1",
                providerId: "deepseek",
                description: "Reasoning model with chain‑of‑thought reinforcement.",
                contextWindow: 65536,
                maxOutputTokens: 4096,
                inputPricePerMToken: 2.0,
                outputPricePerMToken: 8.0,
                capabilities: ["text", "reasoning"],
            },
        ],
    },

    {
        id: "perplexity",
        name: "Perplexity AI",
        description: "Sonar Pro, Sonar – real‑time search‑augmented models.",
        icon: "/icons/perplexity.svg",
        website: "https://perplexity.ai",
        keyPlaceholder: "pplx-...",
        docsUrl: "https://www.perplexity.ai/settings/api",
        supportsStreaming: true,
        models: [
            {
                id: "sonar-pro",
                name: "Sonar Pro",
                providerId: "perplexity",
                description: "Top‑tier model with web search and RAG capabilities.",
                contextWindow: 200000,
                maxOutputTokens: 8000,
                inputPricePerMToken: 15.0,
                outputPricePerMToken: 25.0,
                capabilities: ["text", "reasoning"],
                isDefault: true,
            },
            {
                id: "sonar",
                name: "Sonar",
                providerId: "perplexity",
                description: "Affordable search‑augmented model.",
                contextWindow: 200000,
                maxOutputTokens: 8000,
                inputPricePerMToken: 7.0,
                outputPricePerMToken: 12.0,
                capabilities: ["text", "reasoning"],
            },
        ],
    },

    {
        id: "nvidia-nim",
        name: "NVIDIA NIM",
        description: "Access NVIDIA-hosted open models (GPT-OSS, GLM, Nemotron, etc.).",
        icon: "/icons/nvidia.svg",
        website: "https://build.nvidia.com",
        keyPlaceholder: "Enter your NVIDIA API key (starts with nvapi-)",
        docsUrl: "https://build.nvidia.com/explore/discover",
        supportsStreaming: true,
        models: [
            {
                id: "openai/gpt-oss-20b",
                name: "GPT-OSS 20B",
                providerId: "nvidia-nim",
                description: "Open-weights general model, the default pick on this provider.",
                contextWindow: 128000,
                maxOutputTokens: 8000,
                inputPricePerMToken: 0,
                outputPricePerMToken: 0,
                capabilities: ["text", "code"],
                isDefault: true,
            },
            {
                id: "z-ai/glm-5.3-flash",
                name: "GLM 5.3 Flash",
                providerId: "nvidia-nim",
                description: "Z-AI fast variant for quick turns and drafts.",
                contextWindow: 128000,
                maxOutputTokens: 8000,
                inputPricePerMToken: 0,
                outputPricePerMToken: 0,
                capabilities: ["text", "code"],
            },
        ],
    },
];

/* ────────────────────────────────────────────────────────────────
   Helper functions
   ──────────────────────────────────────────────────────────────── */

/**
 * Returns the provider definition for a given providerId.
 */
export function getProvider(providerId: string): ProviderDefinition | undefined {
    return SUPPORTED_PROVIDERS.find((p) => p.id === providerId);
}

/**
 * Returns a specific model definition given providerId and modelId.
 */
export function getModel(
    providerId: string,
    modelId: string
): ModelDefinition | undefined {
    const provider = getProvider(providerId);
    return provider?.models.find((m) => m.id === modelId);
}

/**
 * Returns a flat array of all models across all providers.
 */
export function getAllModels(): ModelDefinition[] {
    return SUPPORTED_PROVIDERS.flatMap((p) => p.models);
}
