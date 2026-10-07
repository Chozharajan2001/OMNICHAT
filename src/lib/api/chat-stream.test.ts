import { describe, expect, it } from "vitest";
import { STREAM_ERROR_MARKER } from "@/lib/constants";
import { responseWithFailureNotice, streamFailureNotice } from "./chat-stream";

function textResponse(body: string, init?: ResponseInit): Response {
    return new Response(body, init);
}

describe("streamFailureNotice", () => {
    it("names the actionable cause for the statuses the vault can hit", () => {
        expect(streamFailureNotice({ statusCode: 401 })).toMatch(/API key/i);
        expect(streamFailureNotice({ statusCode: 403 })).toMatch(/API key/i);
        expect(streamFailureNotice({ statusCode: 429 })).toMatch(/rate limiting/i);
        expect(streamFailureNotice({ statusCode: 402 })).toMatch(/billing/i);
    });

    // OpenAI's 401 body quotes the key back masked ("sk-clear****-run"); the
    // upstream message is not ours to relay.
    it("does not repeat the upstream message", () => {
        const error = {
            statusCode: 401,
            message: "Incorrect API key provided: sk-clear*********************-run.",
        };

        expect(streamFailureNotice(error)).not.toContain("sk-clear");
        expect(streamFailureNotice(error)).not.toContain("Incorrect API key provided");
    });

    it("stays neutral about how much arrived", () => {
        expect(streamFailureNotice(new Error("socket hang up"))).toMatch(/cut short/i);
        expect(streamFailureNotice({ statusCode: 503 })).toMatch(/503/);
    });
});

describe("responseWithFailureNotice", () => {
    it("leaves a healthy response byte-identical", async () => {
        const response = textResponse("a clean answer", {
            status: 200,
            headers: { "X-Conversation-Id": "c-1" },
        });

        const wrapped = responseWithFailureNotice(response, { notice: null });
        const text = await wrapped.text();

        expect(text).toBe("a clean answer");
        expect(wrapped.status).toBe(200);
        expect(wrapped.headers.get("X-Conversation-Id")).toBe("c-1");
    });

    it("appends the failure the callback recorded, after the partial answer", async () => {
        const failure = { notice: "The provider rejected your API key." };

        const text = await responseWithFailureNotice(textResponse("partial "), failure).text();

        // The marker is what lets the client tell "the model said this" from
        // "the transport failed here"; without it the notice reads as answer text.
        expect(text).toBe(`partial \n\n${STREAM_ERROR_MARKER}\nThe provider rejected your API key.`);
    });

    it("stands alone when nothing was received", async () => {
        const failure = { notice: "The provider is rate limiting this key." };

        const text = await responseWithFailureNotice(textResponse(""), failure).text();

        expect(text).toBe(`${STREAM_ERROR_MARKER}\nThe provider is rate limiting this key.`);
    });

    it("keeps the SDK's status and headers on the replaced response", () => {
        const source = textResponse("x", {
            status: 202,
            statusText: "Accepted",
            headers: { "Content-Type": "text/plain; charset=utf-8", "Retry-After": "7" },
        });

        const wrapped = responseWithFailureNotice(source, { notice: null });

        expect(wrapped.status).toBe(202);
        expect(wrapped.headers.get("content-type")).toBe("text/plain; charset=utf-8");
        expect(wrapped.headers.get("retry-after")).toBe("7");
    });
});
