"use client";

import { Button } from "@/components/ui/button";
import { FolderPlus, X } from "lucide-react";
import { dotStyleFor } from "@/components/projects/project-color";

export interface ProjectSummary {
    id: string;
    name: string;
    color?: string | null;
    _count?: {
        conversations: number;
    };
}

interface ProjectListProps {
    projects: ProjectSummary[];
    activeProjectId: string | null;
    isLoading: boolean;
    onCreate: () => void;
    onSelect: (projectId: string | null) => void;
    onDelete: (projectId: string) => void;
}

/**
 * Projects header row plus the list. Split out of ConversationSidebar so the
 * two delete/create controls could get accessible names without pushing that
 * component past its complexity ceiling.
 */
export function ProjectList({
    projects,
    activeProjectId,
    isLoading,
    onCreate,
    onSelect,
    onDelete,
}: ProjectListProps) {
    return (
        <div className="space-y-2">
            <div className="flex items-center justify-between px-1">
                <div className="section-kicker">Projects</div>
                <Button
                    variant="ghost"
                    size="icon"
                    aria-label="New project"
                    className="h-11 w-11 shrink-0 rounded-full"
                    onClick={onCreate}
                >
                    <FolderPlus className="h-3.5 w-3.5" />
                </Button>
            </div>
            <Button
                variant={activeProjectId ? "ghost" : "secondary"}
                className="w-full justify-start rounded-2xl"
                onClick={() => onSelect(null)}
            >
                All chats
            </Button>
            {isLoading ? (
                <div role="status" aria-live="polite" className="px-2 py-2 text-xs text-muted-foreground">Loading projects...</div>
            ) : projects.length === 0 ? (
                <div className="rounded-[1.25rem] border border-dashed border-border/70 bg-background/20 p-3 text-xs text-muted-foreground">
                    No projects yet.
                </div>
            ) : (
                projects.map((project) => (
                    <div key={project.id} className="flex items-center gap-2">
                        <Button
                            variant={activeProjectId === project.id ? "secondary" : "ghost"}
                            className="min-w-0 flex-1 justify-start rounded-2xl"
                            onClick={() => onSelect(project.id)}
                        >
                            <span
                                className="mr-2 h-2.5 w-2.5 rounded-full"
                                style={dotStyleFor(project.color)}
                            />
                            <span className="truncate">{project.name}</span>
                            <span className="ml-2 text-xs text-muted-foreground">
                                {project._count?.conversations ?? 0}
                            </span>
                        </Button>
                        <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Delete project “${project.name}”`}
                            className="h-11 w-11 shrink-0 rounded-full"
                            onClick={() => onDelete(project.id)}
                        >
                            <X className="h-3.5 w-3.5" />
                        </Button>
                    </div>
                ))
            )}
        </div>
    );
}
