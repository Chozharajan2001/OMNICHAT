import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { downloadConversationExport } from "./conversation-export";

const createdAnchors: HTMLAnchorElement[] = [];
const realCreateElement = document.createElement.bind(document);

beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    URL.createObjectURL = vi.fn(() => "blob:qa-test");
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(document, "createElement").mockImplementation(((tag: string) => {
        const el = realCreateElement(tag);
        if (tag === "a") {
            createdAnchors.push(el as HTMLAnchorElement);
            vi.spyOn(el as HTMLAnchorElement, "click").mockImplementation(() => undefined);
        }
        return el;
    }) as typeof document.createElement);
    global.fetch = vi.fn();
});

afterEach(() => {
    vi.restoreAllMocks();
    vi.resetAllMocks();
    createdAnchors.length = 0;
});

describe("downloadConversationExport (Export)", () => {
    it("downloads the thread under a slugged filename", async () => {
        (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
            ok: true,
            blob: async () => new Blob(["{}"], { type: "application/json" }),
        });

        await downloadConversationExport("conv-1", "My Trip Plan!");

        expect(global.fetch).toHaveBeenCalledWith("/api/conversations/conv-1/export");
        expect(createdAnchors).toHaveLength(1);
        expect(createdAnchors[0].download).toBe("my-trip-plan.json");
        expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:qa-test");
    });

    it("surfaces the server reason instead of a bare failure", async () => {
        (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
            ok: false,
            json: async () => ({ error: "Conversation not found" }),
        });

        await expect(downloadConversationExport("conv-1", "x")).rejects.toThrow(
            "Conversation not found"
        );
        expect(createdAnchors).toHaveLength(0);
    });
});
