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
    getConversationWithMessages,
    updateConversation,
    deleteConversation,
} from "@/lib/db/queries/conversations";
import { updateConversationSchema } from "@/lib/validators/schemas";
import { ZodError } from "zod";

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
        const conversation = await getConversationWithMessages(id, session.user.id);

        if (!conversation) {
            return NextResponse.json(
                { error: "Conversation not found" },
                { status: 404 }
            );
        }

        // Note: Ownership is already enforced in getConversationWithMessages via userId filter
        // No additional check needed here

        return NextResponse.json(conversation);
    } catch (error: unknown) {
        console.error("Failed to fetch conversation:", error);
        return NextResponse.json(
            { error: "Failed to fetch conversation" },
            { status: 500 }
        );
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
