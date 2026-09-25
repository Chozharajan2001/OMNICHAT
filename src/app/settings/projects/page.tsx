"use client";

import { Button } from "@/components/ui/button";
import { FolderKanban, Plus, Trash2 } from "lucide-react";
import { useToast } from "@/stores/toast-store";
import { useJsonResource } from "@/hooks/useJsonResource";

interface ProjectItem {
    id: string;
    name: string;
    color?: string | null;
    _count?: {
        conversations: number;
    };
}

export default function ProjectsSettingsPage() {
    const { success, error: toastError } = useToast();
    const { data, loading: isLoading, error: loadError, refresh: fetchProjects } =
        useJsonResource<{ projects: ProjectItem[] }>("/api/projects", "Failed to load projects");
    const projects = data?.projects ?? [];

    if (loadError) {
        return <div role="alert" className="space-y-3 text-sm text-destructive">
            <p>{loadError}</p>
            <Button onClick={() => void fetchProjects()}>Retry</Button>
        </div>;
    }

    const handleCreateProject = async () => {
        const name = window.prompt("Project name");
        if (!name?.trim()) {
            return;
        }

        try {
            const response = await fetch("/api/projects", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: name.trim() }),
            });

            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.error || "Failed to create project");
            }

            await fetchProjects();
            success("Project created");
        } catch (error) {
            console.error("Failed to create project:", error);
            toastError("Create failed");
        }
    };

    const handleDeleteProject = async (projectId: string) => {
        if (!confirm("Delete this project? Conversations will remain and be unassigned.")) {
            return;
        }

        try {
            const response = await fetch(`/api/projects/${projectId}`, {
                method: "DELETE",
            });

            if (!response.ok) {
                throw new Error("Failed to delete project");
            }

            await fetchProjects();
            success("Project deleted");
        } catch (error) {
            console.error("Failed to delete project:", error);
            toastError("Delete failed");
        }
    };

    return (
        <div className="space-y-8">
            <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                <div>
                    <div className="section-kicker mb-3">Projects</div>
                    <h2 className="text-4xl font-semibold tracking-tight">Workspace grouping</h2>
                    <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
                        Group conversations into projects so the sidebar can focus on a specific body
                        of work instead of a flat list.
                    </p>
                </div>
                <Button onClick={handleCreateProject} className="rounded-full">
                    <Plus className="h-4 w-4" />
                    New project
                </Button>
            </div>

            <section className="rounded-[1.75rem] border border-border/70 bg-background/30 p-6">
                {isLoading ? (
                    <div className="text-sm text-muted-foreground">Loading projects...</div>
                ) : projects.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-border/70 bg-background/20 p-4 text-sm text-muted-foreground">
                        No projects yet. Create one to start grouping conversations.
                    </div>
                ) : (
                    <div className="space-y-3">
                        {projects.map((project) => (
                            <div
                                key={project.id}
                                className="flex items-center justify-between gap-4 rounded-2xl border border-border/70 bg-background/20 px-4 py-4"
                            >
                                <div className="min-w-0">
                                    <div className="flex items-center gap-2 font-medium">
                                        <span
                                            className="h-2.5 w-2.5 rounded-full"
                                            style={{ backgroundColor: project.color || "#7c6dff" }}
                                        />
                                        <span className="truncate">{project.name}</span>
                                    </div>
                                    <div className="mt-1 text-xs text-muted-foreground">
                                        {project._count?.conversations ?? 0} active conversation
                                        {(project._count?.conversations ?? 0) === 1 ? "" : "s"}
                                    </div>
                                </div>
                                <div className="flex gap-2">
                                    <Button variant="outline" size="sm" className="rounded-full" disabled>
                                        <FolderKanban className="h-3.5 w-3.5" />
                                        Active in sidebar
                                    </Button>
                                    <Button
                                        variant="destructive"
                                        size="sm"
                                        className="rounded-full"
                                        onClick={() => handleDeleteProject(project.id)}
                                    >
                                        <Trash2 className="h-3.5 w-3.5" />
                                        Delete
                                    </Button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </section>
        </div>
    );
}
