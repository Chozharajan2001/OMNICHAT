import { fireEvent, render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import ErrorPage from "./error";

afterEach(cleanup);

describe("route error boundary", () => {
    it("shows the message, offers recovery, and resets", () => {
        const reset = vi.fn();
        render(<ErrorPage error={Object.assign(new Error("Composer exploded"), { digest: "d-1" })} reset={reset} />);

        expect(screen.getByRole("heading", { name: "Something went wrong" })).toBeTruthy();
        expect(screen.getByText("Composer exploded")).toBeTruthy();
        expect(screen.getByRole("link", { name: "Go home" })).toBeTruthy();

        fireEvent.click(screen.getByRole("button", { name: "Try again" }));
        expect(reset).toHaveBeenCalledOnce();
    });

    it("keeps the digest out of the visible copy", () => {
        render(<ErrorPage error={Object.assign(new Error(""), { digest: "secret-stack-id" })} reset={vi.fn()} />);
        // The fallback sentence is fine; an internal digest is not something to
        // show a signed-in user on a shared screen.
        expect(screen.getByText(/An unexpected error occurred/)).toBeTruthy();
        expect(screen.queryByText(/secret-stack-id/)).toBeNull();
    });
});
