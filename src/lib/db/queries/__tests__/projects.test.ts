import { beforeEach, describe, expect, it, vi } from "vitest";

const mockPrisma = vi.hoisted(() => ({
    project: {
        create: vi.fn(),
    },
}));

vi.mock("@/lib/db/prisma", () => ({ prisma: mockPrisma }));

import { createProject, DuplicateProjectNameError } from "../projects";

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
