import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ConversationList } from "./ConversationList";
import type { Conversation } from "@/stores/chat-store";

vi.mock("lucide-react", () => ({
    Archive: () => <span data-testid="i-archive" />,
    FolderOpen: () => <span data-testid="i-folder" />,
    MessageSquare: () => <span data-testid="i-message" />,
    Trash2: () => <span data-testid="i-trash" />,
}));

afterEach(cleanup);

const conversation: Conversation = {
    id: "c-1",
    title: "Refund policy draft",
    providerId: "openai",
    modelId: "gpt-4o",
    updatedAt: "2026-10-05T00:00:00.000Z",
    lastMessage: { content: "Where should the caveat go?", role: "assistant" },
};

function renderList() {
    return render(
        <ConversationList
            conversations={[conversation]}
            activeConversationId={null}
            isLoading={false}
            projects={[{ id: "p-1", name: "Support" }]}
            onAssignProject={vi.fn()}
            onArchive={vi.fn()}
            onDelete={vi.fn()}
        />
    );
}

describe("ConversationList row controls", () => {
    it("names each icon-only action with the conversation title", () => {
        renderList();
        // axe reported these as critical button-name violations: an icon with no
        // text and no label announces nothing at all to a screen reader.
        expect(screen.getByLabelText("Move “Refund policy draft” to a project")).toBeTruthy();
        expect(screen.getByLabelText("Archive “Refund policy draft”")).toBeTruthy();
        expect(screen.getByLabelText("Delete “Refund policy draft”")).toBeTruthy();
    });

    it("keeps the actions out of the navigation link", () => {
        const { container } = renderList();
        const link = container.querySelector("a[href='/chat/c-1']");
        expect(link).toBeTruthy();
        // Interactive content nested inside an <a> is invalid HTML and makes the
        // link's own accessible name swallow the control labels.
        expect(link?.querySelector("button,[role=combobox]")).toBeNull();
    });

    it("reveals the actions on keyboard focus, not only on hover", () => {
        renderList();
        const archive = screen.getByLabelText("Archive “Refund policy draft”");
        expect(archive.className).toContain("opacity-0");
        expect(archive.className).toContain("group-focus-within:opacity-100");
    });
});
