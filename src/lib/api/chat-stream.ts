// src/lib/api/chat-stream.ts
// ────────────────────────────────────────────────────────────────
// Surfacing stream failures through a text-only response body.
// ────────────────────────────────────────────────────────────────

/**
 * A text stream cannot carry the SDK's error: by the time the provider refuses,
 * the route has already answered 200 and the SDK swallows the failure after
 * logging it. Measured against a real 401 from OpenAI, the user saw an empty
 * reply and no message at all. The failure is therefore appended to the body the
 * composer prints, in the app's own words.
 *
 * It is appended behind a marker so the client can separate an answer from an
 * appended failure: without it the notice would be stored as assistant output
 * and replayed to the provider on the next private turn.
 */
import { STREAM_ERROR_MARKER } from "@/lib/constants";
export function streamFailureNotice(error: unknown): string {
    const status = (error as { statusCode?: unknown })?.statusCode;
    if (status === 401 || status === 403) {
        return "The provider rejected your API key. Check the key for this provider in Settings.";
    }
    if (status === 429) {
        return "The provider is rate limiting this key. Wait a moment and send the message again.";
    }
    if (status === 402) {
        return "The provider refused for billing reasons. Check the account behind this key.";
    }
    // The upstream message is deliberately not repeated: it can quote the key
    // back, as OpenAI's 401 body does, and it is not ours to relay verbatim.
    // Wording stays neutral about how much arrived, because a failure can follow
    // partial text.
    return typeof status === "number"
        ? `The provider answered ${status}, and the reply was cut short - try again or pick another model.`
        : "The provider could not complete this request, and the reply was cut short - try again or pick another model.";
}

/**
 * Same response, with the recorded failure appended once the body ends. Works
 * on the bytes the SDK produced rather than reconstructing the stream, so the
 * status, headers and content type stay exactly as the SDK set them.
 */
export function responseWithFailureNotice(
    response: Response,
    failure: { notice: string | null }
): Response {
    if (!response.body) return response;

    const encoder = new TextEncoder();
    let received = 0;
    const body = response.body.pipeThrough(
        new TransformStream<Uint8Array, Uint8Array>({
            transform(chunk, controller) {
                received += chunk.byteLength;
                controller.enqueue(chunk);
            },
            flush(controller) {
                if (!failure.notice) return;
                // Separated from the answer when there is one, and standing
                // alone when the turn produced nothing at all.
                controller.enqueue(
                    encoder.encode(`${received > 0 ? "\n\n" : ""}${STREAM_ERROR_MARKER}\n${failure.notice}`)
                );
            },
        })
    );

    return new Response(body, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
    });
}
