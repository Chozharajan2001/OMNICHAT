import { prisma } from "@/lib/db/prisma";
import type { Message, Conversation } from "@prisma/client";

/**
 * ────────────────────────────────────────────────────────────────
 *  CONVERSATION QUERIES
 * ────────────────────────────────────────────────────────────────
 *
 * All functions expect that `userId` belongs to the authenticated user.
 * Use these helpers from API routes or server actions.
 */

/**
 * Create a new conversation (empty – no messages yet).
 */
export async function createConversation(
    userId: string,
    providerId: string,
    modelId: string,
    options?: {
        title?: string;
        folderId?: string;
        systemPrompt?: string;
    }
): Promise<Conversation> {
    return await prisma.conversation.create({
        data: {
            userId,
            providerId,
            modelId,
            title: options?.title || "New Chat",
            folderId: options?.folderId,
        },
    });
}

/**
 * Get all conversations for a user, ordered by most-recently-updated.
 *
 * Optionally include a preview of the last message.
 */
export async function getConversations(
    userId: string,
    limit = 50,
    cursor?: { id: string; updatedAt: Date }
): Promise<{
    conversations: (Conversation & {
        lastMessage?: Message | null;
    })[];
    nextCursor?: { id: string; updatedAt: Date } | null;
}> {
    const where = { userId };
    const orderBy = { updatedAt: "desc" as const };

    const conversations = await prisma.conversation.findMany({
        where,
        take: limit + 1,
        ...(cursor && { cursor, orderBy }),
        orderBy,
        include: {
            // optionally, you could include tags or folder, but omitted for MVP
            messages: {
                orderBy: { createdAt: "desc" },
                take: 1,
            },
        },
    });

    let nextCursor: typeof cursor | null = null;
    if (conversations.length > limit) {
        const next = conversations.pop(); // remove the extra one
        if (next) {
            nextCursor = { id: next.id, updatedAt: next.updatedAt };
        }
    }

    // Map last message (message array contains 0 or 1 element)
    const enriched = conversations.map((conv) => ({
        ...conv,
        lastMessage: conv.messages[0] ?? null,
    }));

    return { conversations: enriched, nextCursor };
}

/**
 * Get a single conversation with its full message history.
 * Returns null if the conversation does not belong to the user.
 */
export async function getConversationWithMessages(
    conversationId: string,
    userId: string
) {
    return await prisma.conversation.findUnique({
        where: { 
            id: conversationId,
            userId, // Ensure ownership
        },
        include: {
            messages: {
                orderBy: { createdAt: "asc" },
            },
        },
    });
}

/**
 * Add a message to a conversation.
 */
export async function addMessage(
    conversationId: string,
    role: "system" | "user" | "assistant",
    content: string,
    options?: {
        modelId?: string;
        providerId?: string;
        tokenCount?: number;
        cost?: number;
    }
): Promise<Message> {
    return await prisma.message.create({
        data: {
            conversationId,
            role,
            content,
            modelId: options?.modelId,
            providerId: options?.providerId,
            tokenCount: options?.tokenCount,
            cost: options?.cost,
        },
    });
}

/**
 * Update conversation metadata (title, folder, etc.).
 */
export async function updateConversation(
    conversationId: string,
    userId: string,
    data: {
        title?: string;
        folderId?: string | null;
        modelId?: string;
        providerId?: string;
    }
): Promise<Conversation> {
    // Ensure the conversation belongs to the user
    const existing = await prisma.conversation.findUnique({
        where: { id: conversationId },
    });
    if (!existing || existing.userId !== userId) {
        throw new Error("Conversation not found or access denied");
    }

    return await prisma.conversation.update({
        where: { id: conversationId },
        data,
    });
}

/**
 * Delete a conversation (cascades to messages).
 */
export async function deleteConversation(
    conversationId: string,
    userId: string
): Promise<void> {
    // Ensure the conversation belongs to the user
    const existing = await prisma.conversation.findUnique({
        where: { id: conversationId },
    });
    if (!existing || existing.userId !== userId) {
        throw new Error("Conversation not found or access denied");
    }

    await prisma.conversation.delete({
        where: { id: conversationId },
    });
}

/**
 * Generate a title for a conversation using the first user message
 * and the assistant reply (non‑streaming, small LLM call in the future).
 *
 * For MVP we could just take the first message snippet, but a placeholder
 * is left here for future auto‑title implementation.
 */
export async function generateConversationTitle(
    firstUserMessage: string,
    firstAssistantMessage?: string
): Promise<string> {
    const combined = `User: ${firstUserMessage.substring(0, 100)}\nAssistant: ${(
        firstAssistantMessage || ""
    ).substring(0, 100)}`;
    return Promise.resolve(combined.slice(0, 150) || "New Chat");
}
