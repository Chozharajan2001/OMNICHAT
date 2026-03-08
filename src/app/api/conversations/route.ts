// src/app/api/conversations/route.ts
// ────────────────────────────────────────────────────────────────
// Conversation list API endpoint.
// GET: List all conversations for the user
// POST: Create a new conversation
// ────────────────────────────────────────────────────────────────

import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth/session";
import {
    getConversations,
    createConversation,
} from "@/lib/db/queries/conversations";
import { getPreferences } from "@/lib/db/queries/preferences";
import { createConversationSchema } from "@/lib/validators/schemas";

export async function GET(req: Request) {
    try {
        const session = await getServerSession();
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { searchParams } = new URL(req.url);
        const limit = parseInt(searchParams.get("limit") || "50");
        const cursorId = searchParams.get("cursorId");
        const cursorUpdatedAt = searchParams.get("cursorUpdatedAt");

        const cursor = cursorId && cursorUpdatedAt
            ? { id: cursorId, updatedAt: new Date(cursorUpdatedAt) }
            : undefined;

        const result = await getConversations(session.user.id, limit, cursor);
        return NextResponse.json(result);
    } catch (error: unknown) {
        console.error("Failed to fetch conversations:", error);
        const errorMessage = error instanceof Error ? error.message : "Failed to fetch conversations";
        return NextResponse.json(
            { error: errorMessage },
            { status: 500 }
        );
    }
}

export async function POST(req: Request) {
    try {
        const session = await getServerSession();
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const body = await req.json();
        const { title, providerId, modelId, folderId } =
            createConversationSchema.parse(body);

        // Use user preferences as defaults if not provided
        const preferences = await getPreferences(session.user.id);
        const effectiveProviderId = providerId ?? preferences?.defaultProviderId ?? "openai";
        const effectiveModelId = modelId ?? preferences?.defaultModelId ?? "gpt-4o";

        const conversation = await createConversation(
            session.user.id,
            effectiveProviderId,
            effectiveModelId,
            { title, folderId }
        );

        return NextResponse.json(conversation, { status: 201 });
    } catch (error: unknown) {
        console.error("Failed to create conversation:", error);

        if (error instanceof Error && error.name === "ZodError") {
            return NextResponse.json(
                { error: "Invalid request", details: (error as import('zod').ZodError).issues },
                { status: 400 }
            );
        }

        const errorMessage = error instanceof Error ? error.message : "Failed to create conversation";
        return NextResponse.json(
            { error: errorMessage },
            { status: 500 }
        );
    }
}
