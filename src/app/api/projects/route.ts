import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth/session";
import { createProject, getProjects } from "@/lib/db/queries/projects";
import { z } from "zod";

const createProjectSchema = z.object({
    name: z.string().min(1).max(80),
    color: z.string().max(20).optional(),
});

export async function GET() {
    try {
        const session = await getServerSession();
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const projects = await getProjects(session.user.id);
        return NextResponse.json({ projects });
    } catch (error: unknown) {
        console.error("Failed to fetch projects:", error);
        const message = error instanceof Error ? error.message : "Failed to fetch projects";
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const session = await getServerSession();
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const body = await request.json();
        const { name, color } = createProjectSchema.parse(body);
        const project = await createProject(session.user.id, name, color);
        return NextResponse.json({ project }, { status: 201 });
    } catch (error: unknown) {
        console.error("Failed to create project:", error);
        if (error instanceof Error && error.name === "ZodError") {
            return NextResponse.json({ error: "Invalid request" }, { status: 400 });
        }
        const message = error instanceof Error ? error.message : "Failed to create project";
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
