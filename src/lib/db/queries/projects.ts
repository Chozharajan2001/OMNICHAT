import { prisma } from "@/lib/db/prisma";
import type { Project } from "@prisma/client";

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

export async function createProject(userId: string, name: string, color?: string): Promise<Project> {
    return await prisma.project.create({
        data: {
            userId,
            name,
            color,
        },
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
