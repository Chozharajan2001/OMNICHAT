import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import ProjectsSettingsPage from "./page";

// The page reads projects through useJsonResource and writes them with fetch;
// mocking at those two seams keeps the test about the request bodies, not the
// network or the database.
const projectsFixture = vi.hoisted(() => ({ rows: [] as unknown[] }));
const fetchMock = vi.fn();

vi.mock("@/hooks/useJsonResource", () => ({
    useJsonResource: () => ({
        data: { projects: projectsFixture.rows },
        loading: false,
        error: null,
        refresh: vi.fn(),
        setData: vi.fn(),
    }),
}));

function jsonResponse(payload: unknown, ok = true) {
    return {
        ok,
        json: async () => payload,
        headers: new Headers(),
    };
}

beforeEach(() => {
    projectsFixture.rows = [];
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(jsonResponse({}));
    vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
});

describe("projects page color", () => {
    it("creates a project with the picked swatch color", async () => {
        render(<ProjectsSettingsPage />);

        fireEvent.click(screen.getByRole("button", { name: /New project/i }));
        fireEvent.change(screen.getByPlaceholderText("Project name"), {
            target: { value: "Red project" },
        });
        fireEvent.click(screen.getByRole("radio", { name: "Blue" }));
        fireEvent.click(screen.getByRole("button", { name: "Create" }));

        await screen.findByPlaceholderText("Project name");
        const createCall = fetchMock.mock.calls.find(
            ([url, init]) => url === "/api/projects" && (init as RequestInit)?.method === "POST"
        );
        expect(createCall).toBeTruthy();
        expect(JSON.parse((createCall![1] as RequestInit).body as string)).toEqual({
            name: "Red project",
            color: "#0ea5e9",
        });
    });

    it("sends the chosen color when renaming", async () => {
        projectsFixture.rows = [
            { id: "p-1", name: "Old name", color: "#ef4444", _count: { conversations: 0 } },
        ];
        render(<ProjectsSettingsPage />);

        fireEvent.click(screen.getByRole("button", { name: /Rename Old name/ }));
        fireEvent.click(screen.getByRole("radio", { name: "Green" }));
        fireEvent.click(screen.getByRole("button", { name: "Save" }));

        await screen.findByText(/Old name/);
        const patchCall = fetchMock.mock.calls.find(
            ([url, init]) => url === "/api/projects/p-1" && (init as RequestInit)?.method === "PATCH"
        );
        expect(patchCall).toBeTruthy();
        expect(JSON.parse((patchCall![1] as RequestInit).body as string)).toEqual({
            name: "Old name",
            color: "#22c55e",
        });
    });

    it("renders the palette default for a project with no stored color", () => {
        projectsFixture.rows = [
            { id: "p-1", name: "Legacy project", color: null, _count: { conversations: 0 } },
        ];
        const { container } = render(<ProjectsSettingsPage />);

        const dot = container.querySelector('[style*="background-color"]') as HTMLElement | null;
        expect(dot?.style.backgroundColor).toBe("rgb(124, 109, 255)");
    });
});
