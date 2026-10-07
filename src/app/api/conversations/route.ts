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
    findConversationCursor,
} from "@/lib/db/queries/conversations";
import { createConversationSchema } from "@/lib/validators/schemas";
import { z, ZodError } from "zod";
import { MIN_PAGE_SIZE, MAX_PAGE_SIZE, DEFAULT_PAGE_SIZE } from "@/lib/constants";

type CursorParse = { ok: true; cursor?: { id: string } } | { ok: false };

/**
 * A cursor is its own unique id and nothing else. Measured against the SQLite
 * database, the shape this replaces failed in two ways: a garbage
 * `cursorUpdatedAt` reached `new Date()` and Prisma answered
 * PrismaClientValidationError, which the handler reported as a 500 for what the
 * client caused; and a request with `cursorId` but no `cursorUpdatedAt` built no
 * cursor at all, so the client was silently handed page one again and paged
 * forever. A cursor that points at nothing (or at another user's conversation)
 * seeks to an empty page with no nextCursor, which the client reads as "no more
 * conversations" and silently stops -- so the id is resolved to a row this user
 * owns before it is used.
 */
async function readCursor(userId: string, raw: string | null): Promise<CursorParse> {
    if (!raw) return { ok: true };
    const parsed = z.string().cuid().safeParse(raw);
    if (!parsed.success) return { ok: false };
    const cursor = await findConversationCursor(userId, parsed.data);
    return cursor ? { ok: true, cursor } : { ok: false };
}

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
        const archived = searchParams.get("archived") === "true";
        const parsedCursor = await readCursor(session.user.id, cursorId);

        if (!parsedCursor.ok) {
            return NextResponse.json(
                { error: "Invalid cursor" },
                { status: 400, headers: { "Cache-Control": "no-store" } }
            );
        }

        const result = await getConversations(session.user.id, limit, parsedCursor.cursor, { archived });
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
        const { title, providerId, modelId, projectId } =
            createConversationSchema.parse(body);

        const conversation = await createConversation(
            session.user.id,
            providerId,
            modelId,
            { title, projectId }
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
