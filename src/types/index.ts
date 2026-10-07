// Shared TypeScript types for OmniChat

export enum Role {
    system = "system",
    user = "user",
    assistant = "assistant",
}

export interface User {
    id: string;
    email: string;
    name?: string | null;
    image?: string | null;
    emailVerified?: Date | null;
}

export interface UserApiKey {
    id: string;
    userId: string;
    providerId: string;
    encryptedKey: string;
    keyHint: string;
    isValid: boolean;
    lastValidatedAt?: Date | null;
    createdAt: Date;
    updatedAt: Date;
}

export interface UserPreference {
    id: string;
    userId: string;
    defaultProviderId: string;
    defaultModelId: string;
    defaultSystemPrompt?: string;
    theme: string;
    sendWithEnter: boolean;
    showTokenCount: boolean;
}

export interface Conversation {
    id: string;
    userId: string;
    title: string;
    modelId: string;
    providerId: string;
    folderId?: string | null;
    createdAt: Date;
    updatedAt: Date;
}

export interface Message {
    id: string;
    conversationId: string;
    role: Role;
    content: string;
    modelId?: string;
    providerId?: string;
    tokenCount?: number;
    cost?: number;
    createdAt: Date;
}

export type ModelCapability =
    | "text"
    | "vision"
    | "function-calling"
    | "json-mode"
    | "streaming"
    | "code"
    | "reasoning";

export interface ModelDefinition {
    id: string;
    name: string;
    providerId: string;
    description: string;
    contextWindow: number;
    maxOutputTokens: number;
    inputPricePerMToken: number;
    outputPricePerMToken: number;
    capabilities: ModelCapability[];
    isDefault?: boolean;
}

export interface ProviderDefinition {
    id: string;
    name: string;
    description: string;
    icon: string;
    website: string;
    keyPlaceholder: string;
    docsUrl: string;
    supportsStreaming: boolean;
    models: ModelDefinition[];
}
