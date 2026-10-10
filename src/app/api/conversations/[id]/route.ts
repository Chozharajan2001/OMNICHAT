// src/app/api/conversations/[id]/route.ts
// ────────────────────────────────────────────────────────────────
// Single conversation API endpoint.
// GET: Get a conversation with all messages
// PATCH: Update conversation metadata
// DELETE: Delete a conversation
// ────────────────────────────────────────────────────────────────

import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth/session";
import { guardMutationRequest } from "@/lib/api/csrf";
import {
    getConversationMeta,
    getConversationWithMessages,
    getMessagesPaginated,
    updateConversation,
    deleteConversation,
} from "@/lib/db/queries/conversations";
import { updateConversationSchema } from "@/lib/validators/schemas";
import { z, ZodError } from "zod";

const messagePageQuerySchema = z.object({
    limit: z.coerce.number().int().min(1).max(100).optional(),
    cursor: z.string().cuid().optional(),
    direction: z.enum(["prev", "next"]).optional(),
});

function messagePageErrorResponse(error: unknown): NextResponse | null {
    if (error instanceof ZodError) {
        return NextResponse.json(
            { error: "Invalid request", details: error.issues },
            { status: 400 }
        );
    }
    if (error instanceof Error && error.message === "Invalid message cursor") {
        return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof Error && error.message === "Conversation not found or access denied") {
        return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
    }
    return null;
}

type MessagePageQuery = {
    limit?: number;
    cursor?: string;
    direction?: "prev" | "next";
};

// Presence (not validity) decides the mode: an unknown direction still means
// "a window", and answers 400 rather than silently serving the transcript.
function readMessagePageQuery(searchParams: URLSearchParams): MessagePageQuery | null {
    if (
        !searchParams.has("limit") &&
        !searchParams.has("cursor") &&
        !searchParams.has("direction")
    ) {
        return null;
    }
    return messagePageQuerySchema.parse(Object.fromEntries(searchParams));
}

async function loadMessageWindow(userId: string, id: string, query: MessagePageQuery) {
    const [conversation, page] = await Promise.all([
        getConversationMeta(id, userId),
        getMessagesPaginated(id, userId, query),
    ]);
    if (!conversation) {
        return NextResponse.json(
            { error: "Conversation not found" },
            { status: 404 }
        );
    }
    return NextResponse.json({ ...conversation, ...page });
}

async function loadFullTranscript(userId: string, id: string) {
    const conversation = await getConversationWithMessages(id, userId);
    if (!conversation) {
        return NextResponse.json(
            { error: "Conversation not found" },
            { status: 404 }
        );
    }
    // Note: Ownership is already enforced in getConversationWithMessages via userId filter
    // No additional check needed here
    return NextResponse.json({
        ...conversation,
        hasMorePrev: false,
        hasMoreNext: false,
        prevCursor: null,
        nextCursor: null,
    });
}

// The catch block answers three shapes; inlined, its branches bill to GET,
// which spent its budget on auth and mode selection long ago.
function failureResponse(error: unknown): NextResponse {
    const handled = messagePageErrorResponse(error);
    if (handled) return handled;
    console.error("Failed to fetch conversation:", error);
    return NextResponse.json(
        { error: "Failed to fetch conversation" },
        { status: 500 }
    );
}

export async function GET(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await getServerSession();
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { id } = await params;

        // Any paging param switches from the legacy full transcript to one
        // window. The full shape keeps its fields and gains the page fields
        // (all false/null), so old and new clients read the same object.
        const query = readMessagePageQuery(new URL(req.url).searchParams);
        if (query) {
            // Awaited, not returned: a rejection from the window must land in
            // the catch below for the 400/404 mapping instead of escaping as
            // an unhandled rejection (a 500 with no shape).
            return await loadMessageWindow(session.user.id, id, query);
        }

        return await loadFullTranscript(session.user.id, id);
    } catch (error: unknown) {
        return failureResponse(error);
    }
}

export async function PATCH(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const rejection = guardMutationRequest(req, true);
    if (rejection) return rejection;

    try {
        const session = await getServerSession();
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { id } = await params;
        const body = await req.json();
        const { title, projectId, archived } = updateConversationSchema.parse(body);

        const conversation = await updateConversation(id, session.user.id, {
            title,
            projectId,
            archivedAt: archived === undefined ? undefined : archived ? new Date() : null,
        });

        return NextResponse.json(conversation);
    } catch (error: unknown) {
        console.error("Failed to update conversation:", error);

        if (error instanceof ZodError) {
            return NextResponse.json(
                { error: "Invalid request", details: error.issues },
                { status: 400 }
            );
        }

        if (error instanceof Error && error.message === "Conversation not found or access denied") {
            return NextResponse.json(
                { error: "Conversation not found" },
                { status: 404 }
            );
        }

        if (error instanceof Error && error.message === "Project not found or access denied") {
            return NextResponse.json(
                { error: error.message },
                { status: 404 }
            );
        }

        return NextResponse.json(
            { error: "Failed to update conversation" },
            { status: 500 }
        );
    }
}

export async function DELETE(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const rejection = guardMutationRequest(req);
    if (rejection) return rejection;

    try {
        const session = await getServerSession();
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { id } = await params;
        await deleteConversation(id, session.user.id);

        return NextResponse.json({ success: true });
    } catch (error: unknown) {
        console.error("Failed to delete conversation:", error);

        if (error instanceof Error && error.message === "Conversation not found or access denied") {
            return NextResponse.json(
                { error: "Conversation not found" },
                { status: 404 }
            );
        }

        return NextResponse.json(
            { error: "Failed to delete conversation" },
            { status: 500 }
        );
    }
}
