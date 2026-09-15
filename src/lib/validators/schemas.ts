// src/lib/validators/schemas.ts
// ────────────────────────────────────────────────────────────────
// Zod validation schemas for all API routes.
// These schemas ensure that incoming requests conform to expected
// shapes and provide TypeScript type inference.
// ────────────────────────────────────────────────────────────────

import { z } from "zod";

/* ────────────────────────────────────────────────────────────────
   Chat request (POST /api/chat)
   ──────────────────────────────────────────────────────────────── */
export const chatRequestSchema = z.object({
    messages: z
        .array(
            z.object({
                role: z.enum(["system", "user", "assistant"]),
                content: z.string().min(1).max(100000),
            })
        )
        .min(1)
        .max(100), // Limit message array to 100 messages per request
    providerId: z.string().min(1),
    modelId: z.string().min(1),
    conversationId: z.string().cuid().nullable().optional(),
    privateMode: z.boolean().optional().default(false),
    temperature: z.number().min(0).max(2).optional().default(0.7),
    maxTokens: z.number().min(1).max(200000).optional().default(4096),
    systemPrompt: z.string().max(10000).optional(),
});

export type ChatRequest = z.infer<typeof chatRequestSchema>;

/* ────────────────────────────────────────────────────────────────
   API key save (POST /api/api-keys)
   ──────────────────────────────────────────────────────────────── */
export const saveKeySchema = z.object({
    providerId: z.string().min(1),
    apiKey: z.string().min(10).max(500),
    validate: z.boolean().optional().default(true),
});

export type SaveKeyRequest = z.infer<typeof saveKeySchema>;

/* ────────────────────────────────────────────────────────────────
   User preferences (GET/PATCH /api/preferences)
   ──────────────────────────────────────────────────────────────── */
export const preferencesSchema = z.object({
    defaultProviderId: z.string().optional(),
    defaultModelId: z.string().optional(),
    defaultSystemPrompt: z.string().max(10000).optional(),
    theme: z.enum(["light", "dark", "system"]).optional(),
    sendWithEnter: z.boolean().optional(),
    showTokenCount: z.boolean().optional(),
});

export type PreferencesUpdate = z.infer<typeof preferencesSchema>;

/* ────────────────────────────────────────────────────────────────
   Conversation creation (POST /api/conversations)
   ──────────────────────────────────────────────────────────────── */
export const createConversationSchema = z.object({
    title: z.string().max(200).optional(),
    providerId: z.string().min(1),
    modelId: z.string().min(1),
    projectId: z.string().cuid().optional(),
    folderId: z.string().cuid().optional(),
    systemPrompt: z.string().max(10000).optional(),
});

export type CreateConversationRequest = z.infer<typeof createConversationSchema>;

/* ────────────────────────────────────────────────────────────────
   Conversation update (PATCH /api/conversations/[id])
   ──────────────────────────────────────────────────────────────── */
export const updateConversationSchema = z.object({
    title: z.string().max(200).optional(),
    projectId: z.string().cuid().nullable().optional(),
    folderId: z.string().cuid().nullable().optional(),
    archived: z.boolean().optional(),
    isPinned: z.boolean().optional(),
    // Additional fields (e.g., model changes) can be added later.
});

export type UpdateConversationRequest = z.infer<typeof updateConversationSchema>;

/* ────────────────────────────────────────────────────────────────
   Document upload (future – RAG)
   ──────────────────────────────────────────────────────────────── */
// export const documentUploadSchema = z.object({
//   file: z.instanceof(File),
//   title: z.string().max(200).optional(),
// });
