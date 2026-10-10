import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth/session";
import { guardMutationRequest } from "@/lib/api/csrf";
import { deleteProject, DuplicateProjectNameError, updateProject } from "@/lib/db/queries/projects";
import { z, ZodError } from "zod";

const updateProjectSchema = z
    .object({
        name: z.string().min(1).max(80).optional(),
        color: z.string().max(20).optional(),
    })
    .refine((body) => body.name !== undefined || body.color !== undefined, {
        message: "Provide name or color",
    });

export async function PATCH(
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
        const body = await req.json();
        // At least one field: an empty object is a caller bug, not a no-op.
        const { name, color } = updateProjectSchema.parse(body);

        const project = await updateProject(session.user.id, id, { name, color });
        return NextResponse.json({ project });
    } catch (error: unknown) {
        if (error instanceof DuplicateProjectNameError) {
            return NextResponse.json(
                {
                    error: error.message,
                    details: [{ code: "custom", path: ["name"], message: error.message }],
                },
                { status: 400 }
            );
        }
        if (error instanceof ZodError) {
            return NextResponse.json(
                { error: "Invalid request", details: error.issues },
                { status: 400 }
            );
        }
        if (error instanceof Error && error.message === "Project not found or access denied") {
            return NextResponse.json({ error: "Project not found" }, { status: 404 });
        }
        console.error("Failed to update project:", error);
        return NextResponse.json(
            { error: "Failed to update project" },
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
        await deleteProject(session.user.id, id);
        return NextResponse.json({ success: true });
    } catch (error: unknown) {
        if (error instanceof Error && error.message === "Project not found or access denied") {
            return NextResponse.json({ error: "Project not found" }, { status: 404 });
        }
        console.error("Failed to delete project:", error);
        return NextResponse.json(
            { error: "Failed to delete project" },
            { status: 500 }
        );
    }
}
