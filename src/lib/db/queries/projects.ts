import { prisma } from "@/lib/db/prisma";
import type { Project } from "@prisma/client";

/** The caller already has a project with this exact name. */
export class DuplicateProjectNameError extends Error {
    constructor() {
        super("A project with this name already exists");
        this.name = "DuplicateProjectNameError";
    }
}

// Measured on the SQLite path: the @@unique([userId, name]) pair raises
// P2002 with meta.modelName "Project". Matching on code and model rather than
// on the driver's constraint fields, because those are engine-specific.
function isProjectNameClash(error: unknown): boolean {
    return (
        typeof error === "object"
        && error !== null
        && (error as { code?: unknown }).code === "P2002"
        && (error as { meta?: { modelName?: unknown } }).meta?.modelName === "Project"
    );
}

export async function getProjects(userId: string) {
    return await prisma.project.findMany({
        where: { userId },
        orderBy: { updatedAt: "desc" },
        include: {
            _count: {
                select: {
                    conversations: {
                        where: {
                            archivedAt: null,
                        },
                    },
                },
            },
        },
    });
}

function asProjectNameClash(error: unknown): unknown {
    return isProjectNameClash(error) ? new DuplicateProjectNameError() : error;
}

export async function createProject(userId: string, name: string, color?: string): Promise<Project> {
    // The constraint is the guard, not an exists-then-create pre-check: that
    // pair still loses the race and answers with a 500.
    return await prisma.project
        .create({ data: { userId, name, color } })
        .catch((error: unknown) => {
            throw asProjectNameClash(error);
        });
}

export async function deleteProject(userId: string, projectId: string): Promise<void> {
    const project = await prisma.project.findUnique({
        where: { id: projectId },
    });

    if (!project || project.userId !== userId) {
        throw new Error("Project not found or access denied");
    }

    await prisma.project.delete({
        where: { id: projectId },
    });
}
