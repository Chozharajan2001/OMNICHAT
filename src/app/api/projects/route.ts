import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth/session";
import { createProject, getProjects } from "@/lib/db/queries/projects";
import { z, ZodError } from "zod";

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
        return NextResponse.json(
            { error: "Failed to fetch projects" },
            { status: 500 }
        );
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
        
        if (error instanceof ZodError) {
            return NextResponse.json(
                { error: "Invalid request", details: error.issues },
                { status: 400 }
            );
        }
        
        return NextResponse.json(
            { error: "Failed to create project" },
            { status: 500 }
        );
    }
}
