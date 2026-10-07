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
        projectId?: string;
        systemPrompt?: string;
    }
): Promise<Conversation> {
    // Verify project ownership if projectId is provided
    if (options?.projectId) {
        const project = await prisma.project.findUnique({
            where: { id: options.projectId },
        });
        if (!project || project.userId !== userId) {
            throw new Error("Project not found or access denied");
        }
    }

    return await prisma.conversation.create({
        data: {
            userId,
            providerId,
            modelId,
            title: options?.title || "New Chat",
            projectId: options?.projectId,
            systemPrompt: options?.systemPrompt,
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
    cursor?: { id: string },
    options?: { archived?: boolean }
): Promise<{
    conversations: (Conversation & {
        lastMessage?: Message | null;
    })[];
    nextCursor?: { id: string } | null;
}> {
    const where = {
        userId,
        archivedAt: options?.archived ? { not: null } : null,
    };
    // updatedAt is not unique, so ordering by it alone is not a total order:
    // SQL leaves the relative position of tied rows up to the engine, which is
    // the property a page boundary must not depend on. Measured on SQLite +
    // Prisma 7 the tied rows still came back in a stable order, so this
    // tiebreaker is determinism insurance rather than a reproduced-duplicate
    // fix; it also lets the cursor be the unique id instead of an
    // (id, timestamp) pair the client has to echo back verbatim.
    const orderBy = [{ updatedAt: "desc" as const }, { id: "desc" as const }];

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
            nextCursor = { id: next.id };
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
 * Resolve a pagination cursor to a row the caller owns, or null. A cursor id
 * that names no row is not an error inside Prisma -- the seek simply returns an
 * empty page with no nextCursor, which a client reads as "end of the list" and
 * stops, silently dropping everything after the gap. Naming another user's row
 * has the same shape. Both are callers' bugs, so the cursor is authenticated
 * against its owner here instead of being guessed at from a Prisma error code.
 */
export async function findConversationCursor(
    userId: string,
    id: string,
    archived: boolean
): Promise<{ id: string } | null> {
    // The same membership rule as the listing itself: a cursor pointing at an
    // archived row is not a position in the active list, and seeking from it
    // shifts every boundary after it.
    const row = await prisma.conversation.findFirst({
        where: { userId, id, archivedAt: archived ? { not: null } : null },
        select: { id: true },
    });
    return row ? { id: row.id } : null;
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
        projectId?: string | null;
        modelId?: string;
        providerId?: string;
        archivedAt?: Date | null;
    }
): Promise<Conversation> {
    // Ensure the conversation belongs to the user
    const existing = await prisma.conversation.findUnique({
        where: { id: conversationId },
    });
    if (!existing || existing.userId !== userId) {
        throw new Error("Conversation not found or access denied");
    }

    // Verify project ownership if projectId is being changed
    if (data.projectId !== undefined && data.projectId !== null) {
        const project = await prisma.project.findUnique({
            where: { id: data.projectId },
        });
        if (!project || project.userId !== userId) {
            throw new Error("Project not found or access denied");
        }
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
 * Delete all conversations for a user.
 */
export async function deleteAllConversations(userId: string): Promise<number> {
    const result = await prisma.conversation.deleteMany({
        where: { userId },
    });

    return result.count;
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
