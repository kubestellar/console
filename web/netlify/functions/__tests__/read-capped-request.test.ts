// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  readCappedRequestBuffer,
  readCappedRequestJson,
  readCappedRequestText,
} from "../_shared/read-capped-request";

const TEXT_ENCODER = new TextEncoder();
const TEXT_DECODER = new TextDecoder();
const HELPER_PATH = "https://console.kubestellar.io/api/test-read-capped-request";
const SMALL_BODY = JSON.stringify({ ok: true, value: "safe" });
const SMALL_LIMIT_BYTES = 128;
const EXACT_LIMIT_BYTES = 16;
const CHUNKED_LIMIT_BYTES = 64;
const OVERSIZE_LIMIT_BYTES = 10;
const OVERSIZE_LABEL = "chunked request";
const EXACT_LIMIT_BODY = "1234567890ABCDEF";
const CHUNKED_BODY = ["stream-", "body-", "works"] as const;
const OVERSIZE_BODY = ["12345", "67890", "X"] as const;

function makeStreamingRequest(chunks: readonly string[]): Request {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(TEXT_ENCODER.encode(chunk));
      }
      controller.close();
    },
  });

  return new Request(HELPER_PATH, {
    method: "POST",
    body: stream,
    duplex: "half",
  } as RequestInit & { duplex: "half" });
}

describe("read-capped-request", () => {
  it("reads a body under the limit successfully", async () => {
    const request = new Request(HELPER_PATH, {
      method: "POST",
      body: SMALL_BODY,
    });

    const payload = await readCappedRequestJson<{ ok: boolean; value: string }>(request, SMALL_LIMIT_BYTES);

    expect(payload).toEqual({ ok: true, value: "safe" });
  });

  it("throws when the streamed body exceeds the configured byte limit", async () => {
    const request = makeStreamingRequest(OVERSIZE_BODY);

    await expect(readCappedRequestText(request, OVERSIZE_LIMIT_BYTES, OVERSIZE_LABEL)).rejects.toThrow(
      `${OVERSIZE_LABEL} body too large (read 11 bytes, limit 10)`,
    );
  });

  it("reads chunked streaming bodies by counting actual bytes", async () => {
    const request = makeStreamingRequest(CHUNKED_BODY);

    const buffer = await readCappedRequestBuffer(request, CHUNKED_LIMIT_BYTES, "streaming request");

    expect(TEXT_DECODER.decode(buffer)).toBe("stream-body-works");
  });

  it("accepts a body exactly at the byte limit", async () => {
    const request = new Request(HELPER_PATH, {
      method: "POST",
      body: EXACT_LIMIT_BODY,
    });

    const text = await readCappedRequestText(request, EXACT_LIMIT_BYTES, "exact limit request");

    expect(text).toBe(EXACT_LIMIT_BODY);
  });
});
