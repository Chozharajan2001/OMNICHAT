import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth/session";
import { routeTimer } from "@/lib/api/observe";
import { getConversationWithMessages } from "@/lib/db/queries/conversations";

// One thread as a portable file. Metadata the user recognizes plus the turns
// in order; internal ids, ownership columns and prompts stay behind.
export async function GET(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const done = routeTimer("GET", "/api/conversations/[id]/export");
    try {
        const session = await getServerSession();
        if (!session?.user?.id) {
            done(401);
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { id } = await params;
        const conversation = await getConversationWithMessages(id, session.user.id);
        if (!conversation) {
            done(404);
            return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
        }

        done(200);
        return NextResponse.json(
            {
                id: conversation.id,
                title: conversation.title,
                providerId: conversation.providerId,
                modelId: conversation.modelId,
                exportedAt: new Date().toISOString(),
                messages: conversation.messages.map((m) => ({
                    role: m.role,
                    content: m.content,
                    createdAt: m.createdAt,
                })),
            },
            {
                headers: {
                    "Content-Disposition": `attachment; filename="${slugify(conversation.title)}.json"`,
                    "Cache-Control": "no-store",
                },
            }
        );
    } catch (error: unknown) {
        console.error("Failed to export conversation:", error);
        done(500);
        return NextResponse.json({ error: "Failed to export conversation" }, { status: 500 });
    }
}

function slugify(title: string): string {
    const slug = title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 60);
    return slug || "conversation";
}
