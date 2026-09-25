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
        } = chatRequestSchema.parse(body);

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
                // Conversation not found or doesn't belong to user - create new one
                conversationId = undefined;
                history = [];
            } else {
                history = conversation.messages.map((m) => ({
                    role: m.role as "system" | "user" | "assistant",
                    content: m.content,
                }));
                conversationSystemPrompt = conversation.systemPrompt;
            }
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
        // Filter out messages from submitted array that already exist in history
        // to avoid duplication when client sends full transcript
        const historyContents = new Set(history.map(m => `${m.role}:${m.content}`));
        const newMessages = messages.filter(m => !historyContents.has(`${m.role}:${m.content}`));
        
        // Use only new messages combined with history for context preparation
        const allMessages: ChatMessage[] = [...history, ...newMessages];
        const preparedMessages = prepareMessages(allMessages, {
            providerId,
            modelId,
            systemPrompt: effectiveSystemPrompt,
        });

        // 7. Create language model instance
        const model = createLanguageModel(providerId, modelId, apiKey);

        // 8. Get the user message (last one in the input)
        const userMessage = messages[messages.length - 1];
        
        // Safety check for empty messages array
        if (!userMessage) {
            return NextResponse.json(
                { error: "No message provided" },
                { status: 400 }
            );
        }

        // 9. Stream response
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

                if (privateMode || !conversationId) {
                    return;
                }

                try {
                    // Use transaction to ensure both messages are saved atomically
                    await prisma.$transaction(async (tx) => {
                        // Save user message with actual role from request
                        await tx.message.create({
                            data: {
                                conversationId,
                                role: userMessage.role,
                                content: userMessage.content,
                                modelId,
                                providerId,
                                tokenCount: usage?.inputTokens,
                            },
                        });

                        // Save assistant message
                        await tx.message.create({
                            data: {
                                conversationId,
                                role: "assistant",
                                content: text,
                                modelId,
                                providerId,
                                tokenCount: usage?.outputTokens,
                            },
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
