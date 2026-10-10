import { prisma } from "@/lib/db/prisma";
import type { Message, Conversation, Prisma } from "@prisma/client";
import { DEFAULT_MESSAGE_PAGE_SIZE, MAX_PAGE_SIZE, MIN_PAGE_SIZE } from "@/lib/constants";

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
 * Free-text title filter, normalized once so the query and the route agree on
 * what "blank" means. Kept out of getConversations: that function spent its
 * branch budget on ordering and paging.
 */
function normalizeSearchQuery(raw?: string): string {
    return (raw ?? "").trim().slice(0, 100);
}

function titleFilterForSearch(normalized: string): Prisma.ConversationWhereInput {
    // Title-only: message bodies are not queried here. SQLite and PostgreSQL
    // disagree on case folding for contains, so a search for "alpha" matches
    // "Alpha" on one engine and not the other; the client keeps its
    // case-insensitive in-memory filter over the returned page, which is the
    // behavior the empty-state copy promises.
    return normalized ? { title: { contains: normalized } } : {};
}

function listFilterFor(userId: string, archived: boolean | undefined, q: string | undefined): Prisma.ConversationWhereInput {
    return {
        userId,
        archivedAt: archived ? { not: null } : null,
        ...titleFilterForSearch(normalizeSearchQuery(q)),
    };
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
    options?: { archived?: boolean; q?: string }
): Promise<{
    conversations: (Conversation & {
        lastMessage?: Message | null;
    })[];
    nextCursor?: { id: string } | null;
}> {
    const where = listFilterFor(userId, options?.archived, options?.q);
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
 * Conversation metadata without the transcript. The paginated message endpoint
 * pairs this with one window so opening a long thread never loads it whole.
 */
export async function getConversationMeta(conversationId: string, userId: string) {
    return await prisma.conversation.findFirst({
        where: { id: conversationId, userId },
    });
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

export interface MessagePageOptions {
    cursor?: string;
    direction?: "prev" | "next";
    limit?: number;
}

export interface MessagePage {
    messages: Message[];
    hasMorePrev: boolean;
    hasMoreNext: boolean;
    prevCursor: { id: string } | null;
    nextCursor: { id: string } | null;
}

function clampMessageLimit(raw?: number): number {
    if (!Number.isInteger(raw)) return DEFAULT_MESSAGE_PAGE_SIZE;
    return Math.max(MIN_PAGE_SIZE, Math.min(MAX_PAGE_SIZE, raw as number));
}

async function requireOwnedConversation(conversationId: string, userId: string): Promise<void> {
    const conversation = await prisma.conversation.findFirst({
        where: { id: conversationId, userId },
        select: { id: true },
    });
    if (!conversation) {
        throw new Error("Conversation not found or access denied");
    }
}

function pageFrom(messages: Message[], hasMorePrev: boolean, hasMoreNext: boolean): MessagePage {
    if (messages.length === 0) {
        return { messages, hasMorePrev, hasMoreNext, prevCursor: null, nextCursor: null };
    }
    return {
        messages,
        hasMorePrev,
        hasMoreNext,
        prevCursor: { id: messages[0].id },
        nextCursor: { id: messages[messages.length - 1].id },
    };
}

async function latestMessagePage(conversationId: string, limit: number): Promise<MessagePage> {
    const rows = await prisma.message.findMany({
        where: { conversationId },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: limit + 1,
    });
    const hasMorePrev = rows.length > limit;
    if (hasMorePrev) rows.pop();
    return pageFrom(rows.reverse(), hasMorePrev, false);
}

interface MessageAnchor {
    id: string;
    createdAt: Date;
}

async function olderMessagePage(
    conversationId: string,
    anchor: MessageAnchor,
    limit: number
): Promise<MessagePage> {
    const rows = await prisma.message.findMany({
        where: {
            conversationId,
            OR: [
                { createdAt: { lt: anchor.createdAt } },
                { createdAt: anchor.createdAt, id: { lt: anchor.id } },
            ],
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: limit + 1,
    });
    const hasMorePrev = rows.length > limit;
    if (hasMorePrev) rows.pop();
    // Newer turns exist by construction: the anchor row itself is newer than
    // every row returned here (or the window is empty because the anchor is
    // the oldest message).
    return pageFrom(rows.reverse(), hasMorePrev, true);
}

async function newerMessagePage(
    conversationId: string,
    anchor: MessageAnchor,
    limit: number
): Promise<MessagePage> {
    const rows = await prisma.message.findMany({
        where: {
            conversationId,
            OR: [
                { createdAt: { gt: anchor.createdAt } },
                { createdAt: anchor.createdAt, id: { gt: anchor.id } },
            ],
        },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        take: limit + 1,
    });
    const hasMoreNext = rows.length > limit;
    if (hasMoreNext) rows.pop();
    return pageFrom(rows, true, hasMoreNext);
}

/**
 * One window of a conversation's transcript, newest-first paging with an id
 * tiebreaker (createdAt alone is not unique). No cursor means the latest page.
 * A cursor naming no message in this conversation is a 400 at the route, the
 * same contract as the conversation-list cursor.
 */
export async function getMessagesPaginated(
    conversationId: string,
    userId: string,
    options: MessagePageOptions = {}
): Promise<MessagePage> {
    await requireOwnedConversation(conversationId, userId);
    const limit = clampMessageLimit(options.limit);
    if (!options.cursor) {
        return latestMessagePage(conversationId, limit);
    }
    const anchor = await prisma.message.findFirst({
        where: { id: options.cursor, conversationId },
    });
    if (!anchor) {
        throw new Error("Invalid message cursor");
    }
    if (options.direction === "next") {
        return newerMessagePage(conversationId, anchor, limit);
    }
    return olderMessagePage(conversationId, anchor, limit);
}

/**
 * Add a message to a conversation.
 */export async function addMessage(
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
