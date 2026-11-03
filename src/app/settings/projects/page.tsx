"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { FolderKanban, Pencil, Plus, Trash2 } from "lucide-react";
import { useToast } from "@/stores/toast-store";
import { useJsonResource } from "@/hooks/useJsonResource";
import { DEFAULT_PROJECT_COLOR, ProjectColorField, dotStyleFor } from "@/components/projects/project-color";

interface ProjectItem {
    id: string;
    name: string;
    color?: string | null;
    _count?: {
        conversations: number;
    };
}

function projectDeleteCopy(project: ProjectItem | null): string {
    return `Delete ${project?.name ?? "this project"}? Its conversations stay in the workspace and become unassigned.`;
}

// Create and rename agree on what "unchanged" means so Save never fires a
// no-op write, and the color half of the comparison cannot be skipped just
// because the field is new.
function isRenameUnchanged(draftName: string, currentName: string, draftColor: string, currentColor: string | null | undefined): boolean {
    return draftName.trim() === currentName && draftColor === (currentColor ?? DEFAULT_PROJECT_COLOR);
}

// Owns everything about renaming from a row: the button, the open state,
// and the dialog. ProjectsSettingsPage only passes the project and a refresh.
function RenameControl({ project, onRenamed }: {
    project: ProjectItem;
    onRenamed: () => void;
}) {
    const [open, setOpen] = useState(false);

    return (
        <>
            <Button
                variant="outline"
                size="sm"
                className="rounded-full"
                aria-label={`Rename ${project.name}`}
                onClick={() => setOpen(true)}
            >
                <Pencil className="h-3.5 w-3.5" />
                Rename
            </Button>
            {open ? (
                <RenameProjectDialog
                    key={project.id}
                    project={project}
                    onClose={() => setOpen(false)}
                    onRenamed={() => {
                        setOpen(false);
                        onRenamed();
                    }}
                />
            ) : null}
        </>
    );
}
// The dialog owns its draft, its PATCH, and the duplicate-name recovery: a
// clash answers 400 with the reason, and surfacing response.error (not a bare
// "Rename failed") is what makes it recoverable.
function RenameProjectDialog({ project, onClose, onRenamed }: {
    project: ProjectItem;
    onClose: () => void;
    onRenamed: () => void;
}) {
    const { success, error: toastError } = useToast();
    const [renameName, setRenameName] = useState(project.name);
    const [renameColor, setRenameColor] = useState(project.color ?? DEFAULT_PROJECT_COLOR);

    const renameProject = async () => {
        const name = renameName.trim();
        if (!name) return;

        try {
            const response = await fetch(`/api/projects/${project.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name, color: renameColor }),
            });

            const payload = await response.json();
            if (!response.ok) {
                throw new Error(payload.error || "Failed to rename project");
            }

            onRenamed();
            success("Project renamed");
        } catch (error) {
            console.error("Failed to rename project:", error);
            toastError("Rename failed", error instanceof Error ? error.message : undefined);
        }
    };

    return (
        <Modal open title={`Rename ${project.name}`} onClose={onClose} showCloseButton>
            <div className="space-y-4">
                <Input
                    value={renameName}
                    onChange={(event) => setRenameName(event.target.value)}
                    placeholder="Project name"
                    className="h-11 rounded-xl"
                    autoFocus
                    onKeyDown={(event) => {
                        if (event.key === "Enter") void renameProject();
                    }}
                />
                <ProjectColorField value={renameColor} onChange={setRenameColor} />
                <div className="flex gap-2">
                    <Button variant="ghost" className="flex-1 rounded-xl" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button
                        className="flex-1 rounded-xl"
                        onClick={renameProject}
                        disabled={!renameName.trim() || isRenameUnchanged(renameName, project.name, renameColor, project.color)}
                    >
                        Save
                    </Button>
                </div>
            </div>
        </Modal>
    );
}

export default function ProjectsSettingsPage() {
    const { success, error: toastError } = useToast();
    const { data, loading: isLoading, error: loadError, refresh: fetchProjects } =
        useJsonResource<{ projects: ProjectItem[] }>("/api/projects", "Failed to load projects");
    const projects = data?.projects ?? [];
    const [showCreate, setShowCreate] = useState(false);
    const [newName, setNewName] = useState("");
    const [newColor, setNewColor] = useState(DEFAULT_PROJECT_COLOR);
    const [deleteTarget, setDeleteTarget] = useState<ProjectItem | null>(null);

    if (loadError) {
        return <div role="alert" className="space-y-3 text-sm text-destructive">
            <p>{loadError}</p>
            <Button onClick={() => void fetchProjects()}>Retry</Button>
        </div>;
    }

    const createProject = async () => {
        const name = newName.trim();
        if (!name) return;

        try {
            const response = await fetch("/api/projects", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name, color: newColor }),
            });

            const payload = await response.json();
            if (!response.ok) {
                throw new Error(payload.error || "Failed to create project");
            }

            await fetchProjects();
            setNewName("");
            setNewColor(DEFAULT_PROJECT_COLOR);
            setShowCreate(false);
            success("Project created");
        } catch (error) {
            console.error("Failed to create project:", error);
            toastError("Create failed");
        }
    };

    const handleDeleteProject = async (projectId: string) => {
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

    const confirmDeleteTarget = () => {
        if (!deleteTarget) return;
        handleDeleteProject(deleteTarget.id);
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
                <Button onClick={() => setShowCreate(true)} className="rounded-full">
                    <Plus className="h-4 w-4" />
                    New project
                </Button>
            </div>

            <section className="rounded-[1.75rem] border border-border/70 bg-background/30 p-6">
                {isLoading ? (
                    <div role="status" aria-live="polite" className="text-sm text-muted-foreground">Loading projects...</div>
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
                                            style={dotStyleFor(project.color)}
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
                                    <RenameControl project={project} onRenamed={() => void fetchProjects()} />
                                    <Button
                                        variant="destructive"
                                        size="sm"
                                        className="rounded-full"
                                        onClick={() => setDeleteTarget(project)}
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

            <Modal open={showCreate} title="New Project" onClose={() => setShowCreate(false)} showCloseButton>
                <div className="space-y-4">
                    <Input
                        value={newName}
                        onChange={(event) => setNewName(event.target.value)}
                        placeholder="Project name"
                        className="h-11 rounded-xl"
                        autoFocus
                        onKeyDown={(event) => {
                            if (event.key === "Enter") void createProject();
                        }}
                    />
                    <ProjectColorField value={newColor} onChange={setNewColor} />
                    <div className="flex gap-2">
                        <Button variant="ghost" className="flex-1 rounded-xl" onClick={() => setShowCreate(false)}>
                            Cancel
                        </Button>
                        <Button className="flex-1 rounded-xl" onClick={createProject} disabled={!newName.trim()}>
                            Create
                        </Button>
                    </div>
                </div>
            </Modal>

            <ConfirmDialog
                open={!!deleteTarget}
                title="Delete Project"
                description={projectDeleteCopy(deleteTarget)}
                onConfirm={confirmDeleteTarget}
                onClose={() => setDeleteTarget(null)}
            />
        </div>
    );
}
