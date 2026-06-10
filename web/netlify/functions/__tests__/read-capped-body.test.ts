// @vitest-environment node
/**
 * Unit tests for the read-capped-body module.
 *
 * This module prevents resource exhaustion (CWE-400) by enforcing body
 * size limits on incoming requests. Tests cover all paths: content-length
 * pre-check, streaming body reads, body too large during stream, null body,
 * and JSON parsing.
 */
import { describe, expect, it } from "vitest";

import {
  readCappedBodyBuffer,
  readCappedBodyText,
  readCappedBodyJson,
  isBodyTooLargeError,
} from "../_shared/read-capped-body";

// ── Helpers ─────────────────────────────────────────────────────────────

function makeBodySource(
  body: string | null,
  contentLength?: number,
): { headers: Headers; body: ReadableStream<Uint8Array> | null } {
  const headers = new Headers();
  if (contentLength !== undefined) {
    headers.set("content-length", String(contentLength));
  }

  if (body === null) {
    return { headers, body: null };
  }

  const encoded = new TextEncoder().encode(body);
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoded);
      controller.close();
    },
  });

  return { headers, body: stream };
}

function makeMultiChunkSource(
  chunks: string[],
  contentLength?: number,
): { headers: Headers; body: ReadableStream<Uint8Array> } {
  const headers = new Headers();
  if (contentLength !== undefined) {
    headers.set("content-length", String(contentLength));
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });

  return { headers, body: stream };
}

// ── isBodyTooLargeError ─────────────────────────────────────────────────

describe("isBodyTooLargeError", () => {
  it("returns true for body-too-large errors", () => {
    const err = new Error("request body too large (content-length: 999)");
    expect(isBodyTooLargeError(err)).toBe(true);
  });

  it("returns false for other errors", () => {
    const err = new Error("network timeout");
    expect(isBodyTooLargeError(err)).toBe(false);
  });

  it("returns false for non-Error values", () => {
    expect(isBodyTooLargeError("body too large")).toBe(false);
    expect(isBodyTooLargeError(null)).toBe(false);
    expect(isBodyTooLargeError(undefined)).toBe(false);
  });
});

// ── readCappedBodyBuffer ────────────────────────────────────────────────

describe("readCappedBodyBuffer", () => {
  it("returns empty Uint8Array for null body", async () => {
    const source = makeBodySource(null);
    const result = await readCappedBodyBuffer(source, 1024);
    expect(result).toBeInstanceOf(Uint8Array);
    expect(result.byteLength).toBe(0);
  });

  it("reads body within limit", async () => {
    const source = makeBodySource("hello world");
    const result = await readCappedBodyBuffer(source, 1024);
    expect(new TextDecoder().decode(result)).toBe("hello world");
  });

  it("throws when content-length exceeds limit", async () => {
    const source = makeBodySource("short", 99999);
    await expect(
      readCappedBodyBuffer(source, 100),
    ).rejects.toThrow("body too large");
  });

  it("throws when streaming body exceeds limit", async () => {
    // Body that exceeds the 10-byte limit
    const source = makeBodySource("this is way too long for the limit");
    await expect(
      readCappedBodyBuffer(source, 10),
    ).rejects.toThrow("body too large");
  });

  it("handles multiple chunks correctly", async () => {
    const source = makeMultiChunkSource(["hello", " ", "world"]);
    const result = await readCappedBodyBuffer(source, 1024);
    expect(new TextDecoder().decode(result)).toBe("hello world");
  });

  it("uses custom label in error message", async () => {
    const source = makeBodySource("data", 99999);
    await expect(
      readCappedBodyBuffer(source, 10, "payload"),
    ).rejects.toThrow("payload body too large");
  });

  it("does not reject when content-length equals limit", async () => {
    const body = "12345";
    const source = makeBodySource(body, 5);
    const result = await readCappedBodyBuffer(source, 5);
    expect(new TextDecoder().decode(result)).toBe("12345");
  });

  it("ignores non-numeric content-length header", async () => {
    const headers = new Headers();
    headers.set("content-length", "not-a-number");
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("ok"));
        controller.close();
      },
    });
    const source = { headers, body: stream };
    const result = await readCappedBodyBuffer(source, 1024);
    expect(new TextDecoder().decode(result)).toBe("ok");
  });
});

// ── readCappedBodyText ──────────────────────────────────────────────────

describe("readCappedBodyText", () => {
  it("returns string from body", async () => {
    const source = makeBodySource("hello text");
    const result = await readCappedBodyText(source, 1024);
    expect(result).toBe("hello text");
  });

  it("returns empty string for null body", async () => {
    const source = makeBodySource(null);
    const result = await readCappedBodyText(source, 1024);
    expect(result).toBe("");
  });

  it("throws on oversized body", async () => {
    const source = makeBodySource("too much data here");
    await expect(readCappedBodyText(source, 5)).rejects.toThrow(
      "body too large",
    );
  });
});

// ── readCappedBodyJson ──────────────────────────────────────────────────

describe("readCappedBodyJson", () => {
  it("parses valid JSON", async () => {
    const source = makeBodySource('{"key":"value","num":42}');
    const result = await readCappedBodyJson<{ key: string; num: number }>(
      source,
      1024,
    );
    expect(result).toEqual({ key: "value", num: 42 });
  });

  it("throws on invalid JSON", async () => {
    const source = makeBodySource("not json at all");
    await expect(readCappedBodyJson(source, 1024)).rejects.toThrow();
  });

  it("throws on oversized JSON body", async () => {
    const source = makeBodySource('{"big":"payload"}', 99999);
    await expect(readCappedBodyJson(source, 5)).rejects.toThrow(
      "body too large",
    );
  });

  it("parses arrays", async () => {
    const source = makeBodySource("[1,2,3]");
    const result = await readCappedBodyJson<number[]>(source, 1024);
    expect(result).toEqual([1, 2, 3]);
  });
});
