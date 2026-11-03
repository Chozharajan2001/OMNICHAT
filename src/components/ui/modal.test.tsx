import { fireEvent, render, screen, cleanup } from "@testing-library/react";
import { useEffect, useRef, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Modal } from "./modal";

// lucide renders raw SVG, which the repo's jsdom project mocks in every .tsx test.
vi.mock("lucide-react", () => ({ X: () => <span data-testid="x-icon" /> }));

afterEach(cleanup);

function panel(): HTMLElement {
    return screen.getByRole("dialog");
}

describe("Modal", () => {
    it("renders nothing while closed", () => {
        render(
            <Modal open={false} title="New Project" onClose={() => undefined}>
                <button type="button">Cancel</button>
            </Modal>
        );
        expect(screen.queryByRole("dialog")).toBeNull();
    });

    it("exposes dialog semantics wired to its title", () => {
        render(
            <Modal open title="Delete Conversation" onClose={() => undefined}>
                <button type="button">Cancel</button>
            </Modal>
        );
        const dialog = panel();
        expect(dialog.getAttribute("aria-modal")).toBe("true");
        const labelledBy = dialog.getAttribute("aria-labelledby");
        expect(labelledBy).toBeTruthy();
        expect(document.getElementById(labelledBy as string)?.textContent).toBe("Delete Conversation");
    });

    it("moves focus to the first control on open", () => {
        render(
            <Modal open title="New Project" onClose={() => undefined}>
                <button type="button">First</button>
                <button type="button">Second</button>
            </Modal>
        );
        expect(document.activeElement?.textContent).toBe("First");
    });

    it("leaves an autoFocus field alone", () => {
        render(
            <Modal open title="New Project" onClose={() => undefined}>
                <button type="button">Close</button>
                <input autoFocus data-testid="name" />
            </Modal>
        );
        expect(document.activeElement?.getAttribute("data-testid")).toBe("name");
    });

    it("closes on Escape", () => {
        let closed = 0;
        render(
            <Modal open title="New Project" onClose={() => { closed += 1; }}>
                <button type="button">Cancel</button>
            </Modal>
        );
        fireEvent.keyDown(panel(), { key: "Escape" });
        expect(closed).toBe(1);
    });

    it("wraps forward from the last control and backward from the first", () => {
        render(
            <Modal open title="New Project" onClose={() => undefined}>
                <button type="button">First</button>
                <button type="button">Last</button>
            </Modal>
        );
        const dialog = panel();
        const last = screen.getByText("Last");
        last.focus();
        fireEvent.keyDown(dialog, { key: "Tab" });
        expect(document.activeElement?.textContent).toBe("First");

        fireEvent.keyDown(dialog, { key: "Tab", shiftKey: true });
        expect(document.activeElement?.textContent).toBe("Last");
    });

    it("restores focus to the trigger when it closes", () => {
        function Harness() {
            const [open, setOpen] = useState(true);
            const trigger = useRef<HTMLButtonElement>(null);

            useEffect(() => {
                trigger.current?.focus();
            }, []);

            return (
                <>
                    <button ref={trigger} type="button" onClick={() => setOpen(true)}>
                        Open
                    </button>
                    <Modal open={open} title="New Project" onClose={() => setOpen(false)}>
                        <button type="button" onClick={() => setOpen(false)}>
                            Cancel
                        </button>
                    </Modal>
                </>
            );
        }

        render(<Harness />);
        expect(document.activeElement?.textContent).toBe("Open");
        fireEvent.click(screen.getByText("Cancel"));
        expect(document.activeElement?.textContent).toBe("Open");
    });

    it("restores focus to the trigger when an autoFocus field opened", () => {
        // The live browser caught this: the open effect ran after the browser had
        // already focused the autoFocus input, so restoring "the active element"
        // put focus on a node that was about to unmount and Escape landed on
        // <body>. The trigger has to be remembered while the dialog is closed.
        function Harness() {
            const [open, setOpen] = useState(false);
            return (
                <>
                    <button type="button" data-testid="trigger" onClick={() => setOpen(true)}>
                        New project
                    </button>
                    <Modal open={open} title="New Project" onClose={() => setOpen(false)}>
                        <input autoFocus data-testid="name" />
                    </Modal>
                </>
            );
        }

        render(<Harness />);
        // jsdom does not focus a button on click the way a real pointer does, and
        // the modal tracks the last focused control to restore it later.
        screen.getByTestId("trigger").focus();
        fireEvent.click(screen.getByTestId("trigger"));
        expect(document.activeElement?.getAttribute("data-testid")).toBe("name");
        fireEvent.keyDown(panel(), { key: "Escape" });
        expect(document.activeElement?.getAttribute("data-testid")).toBe("trigger");
    });

    it("closes when the overlay is pressed", () => {
        let closed = 0;
        render(
            <Modal open title="New Project" onClose={() => { closed += 1; }}>
                <button type="button">Cancel</button>
            </Modal>
        );
        const overlay = document.querySelector("[aria-hidden='true']");
        expect(overlay).toBeTruthy();
        fireEvent.mouseDown(overlay as Element);
        expect(closed).toBe(1);
    });

    it("names the optional close control", () => {
        let closed = 0;
        render(
            <Modal open title="New Project" onClose={() => { closed += 1; }} showCloseButton>
                <button type="button">Cancel</button>
            </Modal>
        );
        // An icon-only button without a name was the axe "button-name" critical
        // on /chat; a dialog control must never repeat that.
        const close = screen.getByLabelText("Close dialog");
        expect(close.textContent).toBe("");
        fireEvent.click(close);
        expect(closed).toBe(1);
    });
});
