import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth/session";
import { deleteProject } from "@/lib/db/queries/projects";

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
        await deleteProject(session.user.id, id);
        return NextResponse.json({ success: true });
    } catch (error: unknown) {
        console.error("Failed to delete project:", error);
        return NextResponse.json(
            { error: "Failed to delete project" },
            { status: 500 }
        );
    }
}
