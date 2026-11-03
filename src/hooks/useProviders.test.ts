import { describe, expect, it } from "vitest";

import { mergeProviders } from "./useProviders";
import { SUPPORTED_PROVIDERS } from "@/lib/mastra/providers";

// The display contract: who can chat is the server's hasKey overlaid on the
// static registry, never the registry alone and never a merged guess that
// unlocks a provider the server did not confirm.
describe("mergeProviders", () => {
    it("overlays the server's key status onto every registry entry", () => {
        const merged = mergeProviders([
            { id: "openai", hasKey: true, keyHint: "…1234" },
        ]);

        expect(merged).toHaveLength(SUPPORTED_PROVIDERS.length);
        const openai = merged.find((provider) => provider.id === "openai");
        expect(openai?.hasKey).toBe(true);
        expect(openai?.keyHint).toBe("…1234");
        expect(openai?.models.length).toBeGreaterThan(0);
        expect(merged.filter((provider) => provider.hasKey)).toHaveLength(1);
    });

    it("defaults to locked when the server says nothing about a provider", () => {
        const merged = mergeProviders(undefined);

        expect(merged.every((provider) => provider.hasKey === false)).toBe(true);
        expect(merged.every((provider) => provider.keyHint === null)).toBe(true);
        // The registry itself is the fallback, so the picker never goes blank.
        expect(merged.map((provider) => provider.id)).toEqual(
            SUPPORTED_PROVIDERS.map((provider) => provider.id)
        );
    });
});
