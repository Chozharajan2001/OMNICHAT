// src/app/api/chat/route.ts
// ────────────────────────────────────────────────────────────────
// Streaming chat API endpoint.
// Handles multi-provider chat with context management and persistence.
// ────────────────────────────────────────────────────────────────

import { streamText } from "ai";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { getServerSession } from "@/lib/auth/session";
import { guardMutationRequest } from "@/lib/api/csrf";
import { getDecryptedKey } from "@/lib/db/queries/api-keys";
import {
    createConversation,
    getConversationWithMessages,
    updateConversation,
} from "@/lib/db/queries/conversations";
import { getPreferences } from "@/lib/db/queries/preferences";
import { createLanguageModel } from "@/lib/mastra/index";
import {
    prepareMessages,
    generateTitleFromMessage,
    type ChatMessage,
} from "@/lib/ai/context-manager";
import { chatRequestSchema } from "@/lib/validators/schemas";
import { chatRateLimiter, getRateLimitHeaders, isRateLimitBackendUnavailableError } from "@/lib/rate-limit";
import { prisma } from "@/lib/db/prisma";
import { recordChatMessage } from "@/lib/metrics";

export const maxDuration = 60; // Allow up to 60 seconds for streaming

export async function POST(req: Request) {
    const rejection = guardMutationRequest(req, true);
    if (rejection) return rejection;

    try {
        // 1. Authenticate user
        const session = await getServerSession();
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        const userId = session.user.id;

        // 2. Check rate limit
        const rateLimitResult = await chatRateLimiter.check(userId);
        if (rateLimitResult.limited) {
            return NextResponse.json(
                {
                    error: "Rate limit exceeded",
                    retryAfter: rateLimitResult.retryAfter,
                    message: `Too many requests. Please wait ${rateLimitResult.retryAfter} seconds before trying again.`,
                },
                {
                    status: 429,
                    headers: {
                        "Retry-After": String(rateLimitResult.retryAfter),
                        ...getRateLimitHeaders(rateLimitResult.remaining, rateLimitResult.resetTime, 60),
                    },
                }
            );
        }

        // 2. Parse and validate request
        let body: unknown;
        try {
            body = await req.json();
        } catch {
            return NextResponse.json(
                { error: "Invalid JSON in request body" },
                { status: 400 }
            );
        }
        
        const {
            messages,
            providerId,
            modelId,
            conversationId: existingConversationId,
            privateMode,
            systemPrompt: customSystemPrompt,
            temperature,
            maxTokens,
            projectId,
            folderId,
        } = chatRequestSchema.parse(body);

        // M8: the turn must end with a user-authored message. The persisted
        // role is always the server-side literal "user", never echoed from
        // client input.
        const userMessage = messages[messages.length - 1];
        if (!userMessage || userMessage.role !== "user") {
            return NextResponse.json(
                { error: "Last message must be from the user" },
                { status: 400 }
            );
        }

        // 3. Get user's API key (decrypted)
        const apiKey = await getDecryptedKey(userId, providerId);
        if (!apiKey) {
            return NextResponse.json(
                { error: "No API key configured for this provider. Please add your API key in Settings." },
                { status: 400 }
            );
        }

        // 4. Get or create conversation
        let conversationId: string | undefined = privateMode ? undefined : (existingConversationId ?? undefined);
        let history: ChatMessage[] = [];
        let conversationSystemPrompt: string | null = null;

        if (!privateMode && conversationId) {
            const conversation = await getConversationWithMessages(conversationId, userId);
            if (!conversation) {
                // An id the caller named must never quietly become a new
                // conversation: the user keeps the transcript on screen while
                // the server writes the turn somewhere else, and the old chat
                // is silently orphaned. Not found / not yours is a 404.
                return NextResponse.json(
                    { error: "Conversation not found" },
                    { status: 404 }
                );
            }
            history = conversation.messages.map((m) => ({
                role: m.role as "system" | "user" | "assistant",
                content: m.content,
            }));
            conversationSystemPrompt = conversation.systemPrompt;
        }

        // Create new conversation if needed
        if (!privateMode && !conversationId) {
            const newConversation = await createConversation(
                userId,
                providerId,
                modelId,
                { 
                    title: "New Chat",
                    systemPrompt: customSystemPrompt,
                    // H7: chat-started entry point can attach the new
                    // conversation to a project/folder; ownership is verified
                    // inside createConversation.
                    projectId,
                    folderId,
                }
            );
            conversationId = newConversation.id;
            conversationSystemPrompt = customSystemPrompt ?? null;
        }

        // 5. Get user preferences for defaults
        const preferences = await getPreferences(userId);
        // Priority: custom prompt > conversation prompt > user preference > default
        const effectiveSystemPrompt = customSystemPrompt 
            ?? conversationSystemPrompt 
            ?? preferences?.defaultSystemPrompt 
            ?? "You are a helpful assistant.";

        // 6. Prepare messages with context management
        // H4: for stored conversations the prompt history comes from the
        // DATABASE plus exactly the new user message. The old content-based
        // dedup dropped legitimate repeated messages, and trusting the client
        // transcript let it inject arbitrary "history".
        const allMessages: ChatMessage[] = privateMode
            ? messages
            : [...history, userMessage];
        const preparedMessages = prepareMessages(allMessages, {
            providerId,
            modelId,
            systemPrompt: effectiveSystemPrompt,
        });

        // 7. Create language model instance
        const model = createLanguageModel(providerId, modelId, apiKey);

        // 8. H1: persist the user message BEFORE calling the provider, so a
        // failed or aborted turn never loses what the user asked.
        if (!privateMode && conversationId) {
            await prisma.$transaction(async (tx) => {
                await tx.message.create({
                    data: {
                        conversationId,
                        role: "user", // server-authored literal (M8)
                        content: userMessage.content,
                        modelId,
                        providerId,
                    },
                });
            });
        }

        // 9. Stream response
        // Completion persistence is shared by onFinish/onAbort with a
        // once-only guard: a turn stores exactly one assistant message.
        let completionPersisted = false;
        const persistCompletion = async (text: string, tokenCount?: number) => {
            if (completionPersisted || privateMode || !conversationId) {
                return;
            }
            completionPersisted = true;
            try {
                await prisma.$transaction(async (tx) => {
                    await tx.message.create({
                        data: {
                            conversationId,
                            role: "assistant",
                            content: text,
                            modelId,
                            providerId,
                            ...(tokenCount !== undefined ? { tokenCount } : {}),
                        },
                    });
                    // H3: touch updatedAt — drives list recency and the
                    // updatedAt-based cursor pagination.
                    await tx.conversation.update({
                        where: { id: conversationId },
                        data: { updatedAt: new Date() },
                    });
                });

                // Update conversation title if it's a new conversation
                if (history.length === 0) {
                    const title = generateTitleFromMessage(userMessage.content);
                    await updateConversation(conversationId, userId, { title });
                }
            } catch (error) {
                console.error("Failed to save messages:", error);
            }
        };

        const startTime = Date.now();
        const result = streamText({
            model,
            messages: preparedMessages.map((m) => ({
                role: m.role,
                content: m.content,
            })),
            temperature,
            maxOutputTokens: maxTokens,

            // Called when streaming completes successfully
            onFinish: async ({ text, usage }) => {
                const durationMs = Date.now() - startTime;

                // Record chat metrics
                if (usage) {
                    recordChatMessage(
                        providerId,
                        modelId,
                        usage.inputTokens ?? 0,
                        usage.outputTokens ?? 0,
                        durationMs
                    );
                }

                await persistCompletion(text, usage?.outputTokens);
            },

            // User stopped the run: keep the partial answer, if any.
            onAbort: async ({ steps }) => {
                const lastStep = steps[steps.length - 1];
                if (lastStep?.text) {
                    await persistCompletion(lastStep.text);
                }
            },

            // Provider/stream failure: the user message is already stored;
            // surface the failure in logs (the stream client sees the error).
            onError: ({ error }) => {
                console.error("Chat stream error:", error);
            },
        });

        // 10. Return streaming response with rate limit headers
        const rateLimitHeaders = getRateLimitHeaders(
            rateLimitResult.remaining,
            rateLimitResult.resetTime,
            60
        );

        return result.toTextStreamResponse({
            headers: {
                ...(privateMode ? {} : { "X-Conversation-Id": conversationId! }),
                ...rateLimitHeaders,
            },
        });
    } catch (error: unknown) {
        if (isRateLimitBackendUnavailableError(error)) {
            return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
        }
        console.error("Chat API error:", error);

        if (error instanceof ZodError) {
            return NextResponse.json(
                { error: "Invalid request", details: error.issues },
                { status: 400 }
            );
        }

        // Return generic error message to avoid leaking internal details
        return NextResponse.json(
            { error: "An error occurred while processing your request" },
            { status: 500 }
        );
    }
}
