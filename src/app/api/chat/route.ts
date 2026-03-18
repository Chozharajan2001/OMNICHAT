// src/app/api/chat/route.ts
// ────────────────────────────────────────────────────────────────
// Streaming chat API endpoint.
// Handles multi-provider chat with context management and persistence.
// ────────────────────────────────────────────────────────────────

import { streamText } from "ai";
import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth/session";
import { getDecryptedKey } from "@/lib/db/queries/api-keys";
import {
    createConversation,
    getConversationWithMessages,
    addMessage,
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
import { chatRateLimiter, getRateLimitHeaders } from "@/lib/rate-limit";

export const maxDuration = 60; // Allow up to 60 seconds for streaming

export async function POST(req: Request) {
    try {
        // 1. Authenticate user
        const session = await getServerSession();
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        const userId = session.user.id;

        // 2. Check rate limit
        const rateLimitResult = chatRateLimiter.check(userId);
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
        const body = await req.json();
        const {
            messages,
            providerId,
            modelId,
            conversationId: existingConversationId,
            privateMode,
            systemPrompt: customSystemPrompt,
        } = chatRequestSchema.parse(body);

        // 3. Get user's API key (decrypted)
        const apiKey = await getDecryptedKey(userId, providerId);
        if (!apiKey) {
            return NextResponse.json(
                { error: "No API key configured for this provider. Please add your API key in Settings." },
                { status: 400 }
            );
        }

        // 4. Get user preferences for defaults
        const preferences = await getPreferences(userId);
        const effectiveSystemPrompt = customSystemPrompt ?? preferences?.defaultSystemPrompt ?? "You are a helpful assistant.";

        // 5. Get or create conversation
        let conversationId: string | undefined = privateMode ? undefined : existingConversationId;
        let history: ChatMessage[] = [];

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
            }
        }

        // Create new conversation if needed
        if (!privateMode && !conversationId) {
            const newConversation = await createConversation(
                userId,
                providerId,
                modelId,
                { title: "New Chat" }
            );
            conversationId = newConversation.id;
        }

        // 6. Prepare messages with context management
        const allMessages: ChatMessage[] = [...history, ...messages];
        const preparedMessages = prepareMessages(allMessages, {
            providerId,
            modelId,
            systemPrompt: effectiveSystemPrompt,
        });

        // 7. Create language model instance
        const model = createLanguageModel(providerId, modelId, apiKey);

        // 8. Get the user message (last one in the input)
        const userMessage = messages[messages.length - 1];

        // 9. Stream response
        const result = streamText({
            model,
            messages: preparedMessages.map((m) => ({
                role: m.role,
                content: m.content,
            })),

            // Called when streaming completes successfully
            onFinish: async ({ text, usage }) => {
                if (privateMode) {
                    return;
                }

                try {
                    // Save user message
                    await addMessage(conversationId!, "user", userMessage.content, {
                        modelId,
                        providerId,
                        tokenCount: usage?.totalTokens,
                    });

                    // Save assistant message
                    await addMessage(conversationId!, "assistant", text, {
                        modelId,
                        providerId,
                        tokenCount: usage?.totalTokens,
                    });

                    // Update conversation title if it's a new conversation
                    if (history.length === 0) {
                        const title = generateTitleFromMessage(userMessage.content);
                        await updateConversation(conversationId!, userId, { title });
                    }

                    // Update conversation timestamp
                    await updateConversation(conversationId!, userId, {});
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
        console.error("Chat API error:", error);

        if (error instanceof Error && error.name === "ZodError") {
            const zodError = error as import('zod').ZodError;
            return NextResponse.json(
                { error: "Invalid request", details: zodError.issues },
                { status: 400 }
            );
        }

        const errorMessage = error instanceof Error ? error.message : "Internal server error";
        return NextResponse.json(
            { error: errorMessage },
            { status: 500 }
        );
    }
}
