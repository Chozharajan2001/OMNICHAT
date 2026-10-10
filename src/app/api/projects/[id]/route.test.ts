import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getServerSession, updateProject, Duplicates } = vi.hoisted(() => ({
    getServerSession: vi.fn(),
    updateProject: vi.fn(),
    Duplicates: class extends Error {
        constructor() {
            super("A project with this name already exists");
            this.name = "DuplicateProjectNameError";
        }
    },
}));

vi.mock("@/lib/auth/session", () => ({ getServerSession }));
vi.mock("@/lib/api/csrf", () => ({ guardMutationRequest: () => null }));
vi.mock("@/lib/db/queries/projects", () => ({
    deleteProject: vi.fn(),
    updateProject,
    // The route's 400 is an `instanceof` against this export, so the mock must
    // hand back one identity consistently.
    DuplicateProjectNameError: Duplicates,
}));

import { PATCH } from "./route";

const ID = "clx1234567890abcdefghijkl";
const CONTEXT = { params: Promise.resolve({ id: ID }) };

function patchRequest(body: unknown) {
    return new Request(`http://localhost:3000/api/projects/${ID}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Origin: "http://localhost:3000" },
        body: JSON.stringify(body),
    });
}

beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    getServerSession.mockResolvedValue({ user: { id: "user-123" } });
    updateProject.mockResolvedValue({ id: ID, name: "Beta", color: null });
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe("PATCH /api/projects/[id] rename (D3)", () => {
    it("renames a project the caller owns", async () => {
        const response = await PATCH(patchRequest({ name: "Beta" }), CONTEXT);

        expect(response.status).toBe(200);
        expect(updateProject).toHaveBeenCalledWith("user-123", ID, { name: "Beta", color: undefined });
        expect(await response.json()).toEqual({ project: { id: ID, name: "Beta", color: null } });
    });

    it("answers 400 when the new name is already taken", async () => {
        updateProject.mockRejectedValueOnce(new Duplicates());

        const response = await PATCH(patchRequest({ name: "Alpha" }), CONTEXT);

        expect(response.status).toBe(400);
        expect((await response.json()).error).toBe("A project with this name already exists");
    });

    it("answers 400 for an empty object instead of a silent no-op", async () => {
        const response = await PATCH(patchRequest({}), CONTEXT);

        expect(response.status).toBe(400);
        expect(updateProject).not.toHaveBeenCalled();
    });

    it("answers 404 for another user's project", async () => {
        updateProject.mockRejectedValueOnce(new Error("Project not found or access denied"));

        const response = await PATCH(patchRequest({ name: "Beta" }), CONTEXT);

        expect(response.status).toBe(404);
        expect((await response.json()).error).toBe("Project not found");
    });

    it("never reaches the database unauthenticated", async () => {
        getServerSession.mockResolvedValueOnce(null);

        const response = await PATCH(patchRequest({ name: "Beta" }), CONTEXT);

        expect(response.status).toBe(401);
        expect(updateProject).not.toHaveBeenCalled();
    });
});
