// @vitest-environment node
/**
 * Unit tests for the shared read-capped-json module.
 *
 * This module prevents memory exhaustion from unexpectedly large upstream
 * HTTP response payloads. Tests verify the size cap enforcement via both
 * content-length header and streaming body reads.
 */
import { describe, expect, it } from "vitest";

import {
  MAX_RESPONSE_BYTES,
  isResponseTooLargeError,
  readCappedBuffer,
  readCappedJson,
  readCappedText,
} from "../_shared/read-capped-json";

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeResponse(body: string, headers: Record<string, string> = {}): Response {
  return new Response(body, { headers });
}

function makeEmptyResponse(): Response {
  return new Response(null, { status: 204 });
}

// ── Constants ────────────────────────────────────────────────────────────────

describe("read-capped-json constants", () => {
  it("MAX_RESPONSE_BYTES is 512 KB", () => {
    expect(MAX_RESPONSE_BYTES).toBe(512_000);
  });
});

// ── isResponseTooLargeError ──────────────────────────────────────────────────

describe("isResponseTooLargeError", () => {
  it("matches errors containing 'response too large'", () => {
    expect(isResponseTooLargeError(new Error("upstream response too large (body: 999 bytes)"))).toBe(true);
  });

  it("matches content-length variant", () => {
    expect(isResponseTooLargeError(new Error("label response too large (content-length: 9999999)"))).toBe(true);
  });

  it("rejects other Error types", () => {
    expect(isResponseTooLargeError(new Error("network timeout"))).toBe(false);
  });

  it("rejects non-Error values", () => {
    expect(isResponseTooLargeError("response too large")).toBe(false);
    expect(isResponseTooLargeError(null)).toBe(false);
    expect(isResponseTooLargeError(undefined)).toBe(false);
    expect(isResponseTooLargeError(42)).toBe(false);
  });
});

// ── readCappedBuffer ────────────────────────────────────────────────────────

describe("readCappedBuffer", () => {
  it("reads a normal response body", async () => {
    const resp = makeResponse("hello world");
    const buffer = await readCappedBuffer(resp, 1000);
    expect(new TextDecoder().decode(buffer)).toBe("hello world");
  });

  it("returns empty bytes for null body", async () => {
    const resp = makeEmptyResponse();
    const buffer = await readCappedBuffer(resp, 1000);
    expect(buffer.byteLength).toBe(0);
  });

  it("throws when content-length exceeds maxBytes", async () => {
    const resp = makeResponse("x", { "content-length": "99999" });
    await expect(readCappedBuffer(resp, 100, "test")).rejects.toThrow(
      "test response too large (content-length: 99999)",
    );
  });

  it("throws when body stream exceeds maxBytes", async () => {
    // Create response without content-length, body larger than limit
    const bigBody = "x".repeat(500);
    const resp = makeResponse(bigBody);
    await expect(readCappedBuffer(resp, 100, "big")).rejects.toThrow(
      /big response too large/,
    );
  });

  it("allows body exactly at maxBytes", async () => {
    const body = "a".repeat(100);
    const resp = makeResponse(body);
    const buffer = await readCappedBuffer(resp, 100);
    expect(new TextDecoder().decode(buffer)).toBe(body);
  });

  it("uses default label 'upstream'", async () => {
    const resp = makeResponse("x", { "content-length": "99999" });
    await expect(readCappedBuffer(resp, 10)).rejects.toThrow(/upstream/);
  });

  it("ignores non-numeric content-length", async () => {
    const resp = makeResponse("small", { "content-length": "abc" });
    const buffer = await readCappedBuffer(resp, 1000);
    expect(new TextDecoder().decode(buffer)).toBe("small");
  });
});

// ── readCappedText ──────────────────────────────────────────────────────────

describe("readCappedText", () => {
  it("returns string content from response", async () => {
    const resp = makeResponse('{"key": "value"}');
    const text = await readCappedText(resp, 1000);
    expect(text).toBe('{"key": "value"}');
  });

  it("returns empty string for null body", async () => {
    const resp = makeEmptyResponse();
    const text = await readCappedText(resp, 1000);
    expect(text).toBe("");
  });

  it("throws when body exceeds maxBytes", async () => {
    const resp = makeResponse("x".repeat(200));
    await expect(readCappedText(resp, 50, "txt")).rejects.toThrow(
      /txt response too large/,
    );
  });
});

// ── readCappedJson ──────────────────────────────────────────────────────────

describe("readCappedJson", () => {
  it("parses valid JSON from response", async () => {
    const resp = makeResponse(JSON.stringify({ name: "test", value: 42 }));
    const data = await readCappedJson<{ name: string; value: number }>(resp);
    expect(data.name).toBe("test");
    expect(data.value).toBe(42);
  });

  it("throws on invalid JSON", async () => {
    const resp = makeResponse("not json at all");
    await expect(readCappedJson(resp)).rejects.toThrow();
  });

  it("throws on oversized response (content-length check)", async () => {
    const resp = makeResponse("x", { "content-length": "999999" });
    await expect(readCappedJson(resp, "oversized")).rejects.toThrow(
      /oversized response too large/,
    );
  });

  it("uses MAX_RESPONSE_BYTES (512 KB) as default limit", async () => {
    // Verify that a response declaring > 512KB is rejected
    const resp = makeResponse("x", { "content-length": "600000" });
    await expect(readCappedJson(resp)).rejects.toThrow(/response too large/);
  });

  it("parses arrays", async () => {
    const resp = makeResponse(JSON.stringify([1, 2, 3]));
    const data = await readCappedJson<number[]>(resp);
    expect(data).toEqual([1, 2, 3]);
  });

  it("uses default label 'upstream'", async () => {
    const resp = makeResponse("x", { "content-length": "999999" });
    await expect(readCappedJson(resp)).rejects.toThrow(/upstream/);
  });
});
