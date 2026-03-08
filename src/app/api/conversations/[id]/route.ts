// src/app/api/conversations/[id]/route.ts
// ────────────────────────────────────────────────────────────────
// Single conversation API endpoint.
// GET: Get a conversation with all messages
// PATCH: Update conversation metadata
// DELETE: Delete a conversation
// ────────────────────────────────────────────────────────────────

import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth/session";
import {
    getConversationWithMessages,
    updateConversation,
    deleteConversation,
} from "@/lib/db/queries/conversations";
import { updateConversationSchema } from "@/lib/validators/schemas";

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

        // Verify ownership
        if (conversation.userId !== session.user.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
        }

        return NextResponse.json(conversation);
    } catch (error: unknown) {
        console.error("Failed to fetch conversation:", error);
        const errorMessage = error instanceof Error ? error.message : "Failed to fetch conversation";
        return NextResponse.json(
            { error: errorMessage },
            { status: 500 }
        );
    }
}

export async function PATCH(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await getServerSession();
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { id } = await params;
        const body = await req.json();
        const { title, folderId } = updateConversationSchema.parse(body);

        const conversation = await updateConversation(id, session.user.id, {
            title,
            folderId,
        });

        return NextResponse.json(conversation);
    } catch (error: unknown) {
        console.error("Failed to update conversation:", error);

        if (error instanceof Error && error.name === "ZodError") {
            return NextResponse.json(
                { error: "Invalid request", details: (error as import('zod').ZodError).issues },
                { status: 400 }
            );
        }

        if (error instanceof Error && error.message === "Conversation not found or access denied") {
            return NextResponse.json(
                { error: "Conversation not found" },
                { status: 404 }
            );
        }

        const errorMessage = error instanceof Error ? error.message : "Failed to update conversation";
        return NextResponse.json(
            { error: errorMessage },
            { status: 500 }
        );
    }
}

export async function DELETE(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
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

        const errorMessage = error instanceof Error ? error.message : "Failed to delete conversation";
        return NextResponse.json(
            { error: errorMessage },
            { status: 500 }
        );
    }
}
