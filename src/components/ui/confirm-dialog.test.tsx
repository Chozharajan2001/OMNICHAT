import { fireEvent, render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ConfirmDialog } from "./confirm-dialog";

vi.mock("lucide-react", () => ({ X: () => <span data-testid="x-icon" /> }));

afterEach(cleanup);

function props(overrides = {}) {
    return {
        open: true,
        title: "Delete API key",
        description: "Remove the stored key for OpenAI?",
        onConfirm: vi.fn(),
        onClose: vi.fn(),
        ...overrides,
    };
}

describe("ConfirmDialog", () => {
    it("renders the subject of the action and both choices", () => {
        render(<ConfirmDialog {...props()} />);
        expect(screen.getByRole("dialog")).toBeTruthy();
        expect(screen.getByText("Remove the stored key for OpenAI?")).toBeTruthy();
        expect(screen.getByRole("button", { name: "Cancel" })).toBeTruthy();
        expect(screen.getByRole("button", { name: "Delete" })).toBeTruthy();
    });

    it("closes before running the action, and honours a custom label", () => {
        const order: string[] = [];
        render(
            <ConfirmDialog
                {...props({
                    confirmLabel: "Delete everything",
                    onConfirm: () => order.push("confirm"),
                    onClose: () => order.push("close"),
                })}
            />
        );
        fireEvent.click(screen.getByRole("button", { name: "Delete everything" }));
        expect(order).toEqual(["close", "confirm"]);
    });

    it("is not in the document while closed", () => {
        render(<ConfirmDialog {...props({ open: false })} />);
        expect(screen.queryByRole("dialog")).toBeNull();
    });
});
