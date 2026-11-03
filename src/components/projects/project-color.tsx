// src/components/projects/project-color.tsx
// ────────────────────────────────────────────────────────────────
// Shared swatch UI + palette for project colors.
// ────────────────────────────────────────────────────────────────
// The API accepts any string ≤ 20 chars, but free text would store typos and
// invisible values -- and a guess at "the provider prefix" has no check behind
// it. Keeping the choice closed means every stored color is one the UI can
// actually render. null is never written; the DB default is the indigo below.
"use client";

import { cn } from "@/lib/utils";

/** The shade new projects get when the user picks nothing (DB default). */
export const DEFAULT_PROJECT_COLOR = "#7c6dff";

export interface ProjectColorOption {
    value: string;
    label: string;
}

export const PROJECT_COLORS: ProjectColorOption[] = [
    { value: "#7c6dff", label: "Indigo (default)" },
    { value: "#ef4444", label: "Red" },
    { value: "#f59e0b", label: "Amber" },
    { value: "#22c55e", label: "Green" },
    { value: "#0ea5e9", label: "Blue" },
    { value: "#8b5cf6", label: "Violet" },
    { value: "#ec4899", label: "Pink" },
    { value: "#14b8a6", label: "Teal" },
];

export function dotStyleFor(color: string | null | undefined): React.CSSProperties {
    return { backgroundColor: color || DEFAULT_PROJECT_COLOR };
}

export function ProjectColorField({ value, onChange }: {
    value: string;
    onChange: (color: string) => void;
}) {
    return (
        <div role="radiogroup" aria-label="Project color" className="flex flex-wrap gap-2 py-1">
            {PROJECT_COLORS.map((option) => (
                <button
                    key={option.value}
                    type="button"
                    role="radio"
                    aria-checked={value === option.value}
                    aria-label={option.label}
                    title={option.label}
                    onClick={() => onChange(option.value)}
                    className={cn(
                        "h-9 w-9 rounded-full border-2 transition",
                        value === option.value
                            ? "border-foreground scale-110"
                            : "border-transparent hover:scale-105"
                    )}
                    style={{ backgroundColor: option.value }}
                />
            ))}
        </div>
    );
}
