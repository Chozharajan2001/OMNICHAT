import { beforeEach, describe, expect, it, vi } from "vitest";

const mockPrisma = vi.hoisted(() => ({
    project: {
        create: vi.fn(),
        findUnique: vi.fn(),
        update: vi.fn(),
    },
}));

vi.mock("@/lib/db/prisma", () => ({ prisma: mockPrisma }));

import { createProject, DuplicateProjectNameError, updateProject } from "../projects";

// Measured against the SQLite database with the driver adapter: creating a
// second project with the same (userId, name) rejects with P2002 and
// meta.modelName "Project". The names are exact-match, so "Alpha" and "alpha"
// are two projects.
function prismaKnownRequestError(code: string, meta: unknown) {
    const error = new Error("Prisma known request");
    Object.assign(error, { code, meta });
    return error;
}

beforeEach(() => {
    vi.clearAllMocks();
});

describe("createProject duplicate name (3.4)", () => {
    it("turns the unique-pair rejection into a domain error", async () => {
        mockPrisma.project.create.mockRejectedValueOnce(
            prismaKnownRequestError("P2002", { modelName: "Project" })
        );

        await expect(createProject("user-1", "Alpha")).rejects.toBeInstanceOf(DuplicateProjectNameError);
    });

    it("leaves an unrelated P2002 alone", async () => {
        const other = prismaKnownRequestError("P2002", { modelName: "Conversation" });
        mockPrisma.project.create.mockRejectedValueOnce(other);

        await expect(createProject("user-1", "Alpha")).rejects.toBe(other);
    });

    it("rethrows anything that is not a constraint violation", async () => {
        const outage = new Error("database unreachable");
        mockPrisma.project.create.mockRejectedValueOnce(outage);

        await expect(createProject("user-1", "Alpha")).rejects.toBe(outage);
    });

    it("passes a successful create straight through", async () => {
        const created = { id: "p1", userId: "user-1", name: "Alpha" };
        mockPrisma.project.create.mockResolvedValueOnce(created);

        await expect(createProject("user-1", "Alpha")).resolves.toBe(created);
    });
});

describe("updateProject rename (D3)", () => {
    const owned = { id: "p1", userId: "user-1", name: "Alpha", color: null };

    it("updates a project the caller owns", async () => {
        const updated = { ...owned, name: "Beta" };
        mockPrisma.project.findUnique.mockResolvedValueOnce(owned);
        mockPrisma.project.update.mockResolvedValueOnce(updated);

        await expect(updateProject("user-1", "p1", { name: "Beta" })).resolves.toBe(updated);
        expect(mockPrisma.project.update).toHaveBeenCalledWith({
            where: { id: "p1" },
            data: { name: "Beta" },
        });
    });

    it("refuses another user's project without touching update", async () => {
        mockPrisma.project.findUnique.mockResolvedValueOnce({ ...owned, userId: "user-2" });

        await expect(updateProject("user-1", "p1", { name: "Beta" })).rejects.toThrow(
            "Project not found or access denied"
        );
        expect(mockPrisma.project.update).not.toHaveBeenCalled();
    });

    it("turns a rename clash into a domain error", async () => {
        mockPrisma.project.findUnique.mockResolvedValueOnce(owned);
        mockPrisma.project.update.mockRejectedValueOnce(
            prismaKnownRequestError("P2002", { modelName: "Project" })
        );

        await expect(updateProject("user-1", "p1", { name: "Alpha" })).rejects.toBeInstanceOf(
            DuplicateProjectNameError
        );
    });
});
