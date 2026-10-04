// src/app/api/conversations/route.ts
// ────────────────────────────────────────────────────────────────
// Conversation list API endpoint.
// GET: List all conversations for the user
// POST: Create a new conversation
// ────────────────────────────────────────────────────────────────

import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth/session";
import { guardMutationRequest } from "@/lib/api/csrf";
import {
    getConversations,
    createConversation,
    deleteAllConversations,
} from "@/lib/db/queries/conversations";
import { createConversationSchema } from "@/lib/validators/schemas";
import { ZodError } from "zod";
import { MIN_PAGE_SIZE, MAX_PAGE_SIZE, DEFAULT_PAGE_SIZE } from "@/lib/constants";

export async function GET(req: Request) {
    try {
        const session = await getServerSession();
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { searchParams } = new URL(req.url);
        
        // Validate and clamp limit parameter
        const limitParam = searchParams.get("limit");
        let limit = DEFAULT_PAGE_SIZE;
        if (limitParam) {
            const parsed = parseInt(limitParam, 10);
            if (!isNaN(parsed)) {
                // Clamp to valid range
                limit = Math.max(MIN_PAGE_SIZE, Math.min(MAX_PAGE_SIZE, parsed));
            }
        }
        
        const cursorId = searchParams.get("cursorId");
        const cursorUpdatedAt = searchParams.get("cursorUpdatedAt");
        const archived = searchParams.get("archived") === "true";

        const cursor = cursorId && cursorUpdatedAt
            ? { id: cursorId, updatedAt: new Date(cursorUpdatedAt) }
            : undefined;

        const result = await getConversations(session.user.id, limit, cursor, { archived });
        return NextResponse.json(result);
    } catch (error: unknown) {
        console.error("Failed to fetch conversations:", error);
        return NextResponse.json(
            { error: "Failed to fetch conversations" },
            { status: 500 }
        );
    }
}

export async function POST(req: Request) {
    const rejection = guardMutationRequest(req, true);
    if (rejection) return rejection;

    try {
        const session = await getServerSession();
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const body = await req.json();
        // createConversationSchema requires providerId/modelId, so there is no
        // preferences fallback to apply here (it was unreachable, and cost a
        // query per create).
        const { title, providerId, modelId, projectId, folderId } =
            createConversationSchema.parse(body);

        const conversation = await createConversation(
            session.user.id,
            providerId,
            modelId,
            { title, projectId, folderId }
        );

        return NextResponse.json(conversation, { status: 201 });
    } catch (error: unknown) {
        console.error("Failed to create conversation:", error);

        if (error instanceof ZodError) {
            return NextResponse.json(
                { error: "Invalid request", details: error.issues },
                { status: 400 }
            );
        }

        if (error instanceof Error && error.message === "Project not found or access denied") {
            return NextResponse.json(
                { error: error.message },
                { status: 404 }
            );
        }

        return NextResponse.json(
            { error: "Failed to create conversation" },
            { status: 500 }
        );
    }
}

export async function DELETE(req: Request) {
    const rejection = guardMutationRequest(req);
    if (rejection) return rejection;

    try {
        const session = await getServerSession();
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const deletedCount = await deleteAllConversations(session.user.id);
        return NextResponse.json({ success: true, deletedCount });
    } catch (error: unknown) {
        console.error("Failed to delete all conversations:", error);
        return NextResponse.json(
            { error: "Failed to delete all conversations" },
            { status: 500 }
        );
    }
}
