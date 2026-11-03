import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

// Exercise request lifecycle without adding a DOM or renderer dependency.
const hooks = vi.hoisted(() => ({
    state: [] as unknown[],
    effects: [] as (() => (() => void) | void)[],
    writes: 0,
}));
vi.mock("react", () => ({
    useState: (initial: unknown) => {
        const index = hooks.state.push(initial) - 1;
        return [initial, (value: unknown) => {
            hooks.writes++;
            hooks.state[index] = typeof value === "function" ? value(hooks.state[index]) : value;
        }];
    },
    useRef: (initial: unknown) => ({ current: initial }),
    useCallback: (callback: unknown) => callback,
    useEffect: (effect: () => (() => void) | void) => { hooks.effects.push(effect); },
}));

import { useJsonResource } from "./useJsonResource";

function deferredResponse() {
    let resolve!: (response: Response) => void;
    let reject!: (error: Error) => void;
    const promise = new Promise<Response>((accept, fail) => { resolve = accept; reject = fail; });
    return { promise, resolve, reject };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
const response = (value: unknown) => new Response(JSON.stringify(value));

beforeEach(() => {
    hooks.state = [];
    hooks.effects = [];
    hooks.writes = 0;
});
afterEach(() => vi.unstubAllGlobals());

describe("useJsonResource request lifecycle", () => {
    it("starts loading without synchronous effect state updates and accepts JSON", async () => {
        const pending = deferredResponse();
        vi.stubGlobal("fetch", vi.fn(() => pending.promise));
        useJsonResource("/resource", "Load failed");
        const cleanup = hooks.effects[0]();
        expect(hooks.state).toEqual([null, true, null]);
        expect(hooks.writes).toBe(0);
        pending.resolve(response({ value: 1 }));
        await settle();
        expect(hooks.state).toEqual([{ value: 1 }, false, null]);
        cleanup?.();
    });

    it("aborts on cleanup and ignores even a response that resolves after abort", async () => {
        const pending = deferredResponse();
        const fetchMock = vi.fn(() => pending.promise);
        vi.stubGlobal("fetch", fetchMock);
        useJsonResource("/resource", "Load failed");
        const cleanup = hooks.effects[0]();
        cleanup?.();
        const options = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
        expect(options[1].signal?.aborted).toBe(true);
        pending.resolve(response({ stale: true }));
        await settle();
        expect(hooks.writes).toBe(0);
    });

    it("awaits refresh and prevents an older GET from overwriting the new result", async () => {
        const old = deferredResponse();
        const fresh = deferredResponse();
        vi.stubGlobal("fetch", vi.fn().mockReturnValueOnce(old.promise).mockReturnValueOnce(fresh.promise));
        const resource = useJsonResource("/resource", "Load failed");
        const cleanup = hooks.effects[0]();
        const refreshed = resource.refresh();
        fresh.resolve(response({ version: 2 }));
        await refreshed;
        old.resolve(response({ version: 1 }));
        await settle();
        expect(hooks.state).toEqual([{ version: 2 }, false, null]);
        cleanup?.();
    });

    it("preserves a mutation result against an in-flight GET", async () => {
        const pending = deferredResponse();
        vi.stubGlobal("fetch", vi.fn(() => pending.promise));
        const resource = useJsonResource<{ saved: boolean }>("/resource", "Load failed");
        const cleanup = hooks.effects[0]();
        resource.setData({ saved: true });
        pending.resolve(response({ saved: false }));
        await settle();
        expect(hooks.state).toEqual([{ saved: true }, false, null]);
        cleanup?.();
    });

    it("reports HTTP failures and clears the error after a successful retry", async () => {
        vi.stubGlobal("fetch", vi.fn()
            .mockResolvedValueOnce(new Response("", { status: 500 }))
            .mockResolvedValueOnce(response({ recovered: true })));
        const resource = useJsonResource("/resource", "Load failed");
        const cleanup = hooks.effects[0]();
        await settle();
        expect(hooks.state).toEqual([null, false, "Load failed"]);
        await resource.refresh();
        expect(hooks.state).toEqual([{ recovered: true }, false, null]);
        cleanup?.();
    });

    it("does not restart requests or update state after unmount", async () => {
        const pending = deferredResponse();
        const fetchMock = vi.fn(() => pending.promise);
        vi.stubGlobal("fetch", fetchMock);
        const resource = useJsonResource("/resource", "Load failed");
        hooks.effects[0]()?.();
        await resource.refresh();
        resource.setData("late mutation");
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(hooks.writes).toBe(0);
        pending.reject(new Error("aborted"));
        await settle();
    });

    it("ignores rejected requests from a cleaned-up Strict Mode effect", async () => {
        const old = deferredResponse();
        vi.stubGlobal("fetch", vi.fn().mockReturnValueOnce(old.promise).mockResolvedValueOnce(response("current")));
        useJsonResource("/resource", "Load failed");
        hooks.effects[0]()?.();
        const cleanup = hooks.effects[0]();
        old.reject(new Error("aborted"));
        await settle();
        expect(hooks.state).toEqual(["current", false, null]);
        cleanup?.();
    });
});
