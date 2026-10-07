// src/lib/validators/schemas.ts
// ────────────────────────────────────────────────────────────────
// Zod validation schemas for all API routes.
// These schemas ensure that incoming requests conform to expected
// shapes and provide TypeScript type inference.
// ────────────────────────────────────────────────────────────────

import { z } from "zod";
import { getModel, getProvider } from "@/lib/mastra/providers";

/* ────────────────────────────────────────────────────────────────
   Chat request (POST /api/chat)
   ──────────────────────────────────────────────────────────────── */
export const chatRequestSchema = z
    .object({
        messages: z
            .array(
                z.object({
                    role: z.enum(["system", "user", "assistant"]),
                    content: z.string().min(1).max(100000),
                })
            )
            .min(1)
            .max(100), // Limit message array to 100 messages per request
        providerId: z.string().min(1).max(64),
        modelId: z.string().min(1).max(200),
        conversationId: z.string().cuid().nullable().optional(),
        privateMode: z.boolean().optional().default(false),
        temperature: z.number().min(0).max(2).optional().default(0.7),
        maxTokens: z.number().min(1).max(200000).optional().default(4096),
        systemPrompt: z.string().max(10000).optional(),
        // H7: chat-started can attach a new conversation to a project;
        // ownership is verified server-side inside createConversation.
        projectId: z.string().cuid().optional(),
    })
    // The pair must exist in the registry before it reaches the SDK. Without
    // this, an unknown provider threw inside createLanguageModel and an unknown
    // model failed at request time -- both surfaced to the user as a 500 for
    // what is a bad request. Enforcing it here (rather than in the handler)
    // also means every future consumer of this schema inherits the guarantee.
    .superRefine((value, ctx) => {
        if (!getProvider(value.providerId)) {
            ctx.addIssue({
                code: "custom",
                path: ["providerId"],
                message: `Unknown provider: ${value.providerId}`,
            });
            return;
        }
        if (!getModel(value.providerId, value.modelId)) {
            ctx.addIssue({
                code: "custom",
                path: ["modelId"],
                message: `Unknown model for ${value.providerId}: ${value.modelId}`,
            });
        }
    });

export type ChatRequest = z.infer<typeof chatRequestSchema>;

/* ────────────────────────────────────────────────────────────────
   API key save (POST /api/api-keys)
   ──────────────────────────────────────────────────────────────── */
export const saveKeySchema = z
    .object({
        providerId: z.string().min(1),
        apiKey: z.string().min(10).max(500),
        validate: z.boolean().optional().default(true),
    })
    // A credential stored against a provider id that is not in the registry is
    // invisible: the providers list renders only known providers, so the row is
    // counted and encrypted but never shown or removable from the UI, and no chat
    // can ever select it.
    .superRefine((value, ctx) => {
        if (!getProvider(value.providerId)) {
            ctx.addIssue({
                code: "custom",
                path: ["providerId"],
                message: `Unknown provider: ${value.providerId}`,
            });
        }
    });

export type SaveKeyRequest = z.infer<typeof saveKeySchema>;

/* ────────────────────────────────────────────────────────────────
   User preferences (GET/PATCH /api/preferences)
   ──────────────────────────────────────────────────────────────── */
export const preferencesSchema = z
    .object({
        defaultProviderId: z.string().optional(),
        defaultModelId: z.string().optional(),
        defaultSystemPrompt: z.string().max(10000).optional(),
        theme: z.enum(["light", "dark", "system"]).optional(),
        sendWithEnter: z.boolean().optional(),
        showTokenCount: z.boolean().optional(),
    })
    // The defaults are what every new conversation is opened with, so a pair
    // that is not in the registry is a working chat broken at the first turn --
    // stored happily, then refused by the provider. Same boundary as 2.4 and
    // 3.5: reject at the schema so the handler gains no branch.
    .superRefine((value, ctx) => {
        // Both fields are optional: this is a PATCH, so a theme-only update must
        // stay valid. Only a value the client actually sent can be refused.
        if (value.defaultProviderId === undefined) {
            return;
        }
        if (!getProvider(value.defaultProviderId)) {
            ctx.addIssue({
                code: "custom",
                path: ["defaultProviderId"],
                message: `Unknown provider: ${value.defaultProviderId}`,
            });
            return;
        }
        if (value.defaultModelId !== undefined && !getModel(value.defaultProviderId, value.defaultModelId)) {
            ctx.addIssue({
                code: "custom",
                path: ["defaultModelId"],
                message: `Unknown model for ${value.defaultProviderId}: ${value.defaultModelId}`,
            });
        }
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
    // folderId removed: there is no Folder entity in either schema, so the
    // value was written to a column nothing can list, rename or delete by. Same
    // class as isPinned below -- add it back with the feature, not before.
    systemPrompt: z.string().max(10000).optional(),
});

export type CreateConversationRequest = z.infer<typeof createConversationSchema>;

/* ────────────────────────────────────────────────────────────────
   Conversation update (PATCH /api/conversations/[id])
   ──────────────────────────────────────────────────────────────── */
export const updateConversationSchema = z.object({
    title: z.string().max(200).optional(),
    projectId: z.string().cuid().nullable().optional(),
    // folderId removed with the create path's: no Folder model exists, and
    // unlike projectId it was never ownership-checkable because there is nothing
    // to check it against.
    archived: z.boolean().optional(),
    // isPinned removed (M11): accepted-but-ignored dead contract; no DB
    // column and no UI consumer. Add it back with the feature, not before.
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
