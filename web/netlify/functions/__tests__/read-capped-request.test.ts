// @vitest-environment node
/**
 * Unit tests for the shared read-capped-request module.
 *
 * This module prevents memory exhaustion and DoS attacks via chunked
 * transfer encoding bypass. It enforces hard byte limits on actual
 * bytes read (not Content-Length header). Tests verify the security
 * guarantees hold.
 */
import { describe, expect, it } from "vitest";

import {
  RequestBodyTooLargeError,
  readCappedRequestBuffer,
  readCappedRequestJson,
  readCappedRequestText,
} from "../_shared/read-capped-request";

// ── Helpers ──────────────────────────────────────────────────────────────────

const TEXT_ENCODER = new TextEncoder();
const TEXT_DECODER = new TextDecoder();
const HELPER_PATH = "https://console.kubestellar.io/api/test-read-capped-request";

function makeRequest(body: BodyInit | null, method = "POST"): Request {
  return new Request(HELPER_PATH, { method, body });
}

function makeGetRequest(): Request {
  return new Request(HELPER_PATH, { method: "GET" });
}

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

// ── RequestBodyTooLargeError ─────────────────────────────────────────────────

describe("RequestBodyTooLargeError", () => {
  it("is an instance of Error", () => {
    const err = new RequestBodyTooLargeError("test", 100, 200);
    expect(err).toBeInstanceOf(Error);
  });

  it("has name RequestBodyTooLargeError", () => {
    const err = new RequestBodyTooLargeError("test", 100, 200);
    expect(err.name).toBe("RequestBodyTooLargeError");
  });

  it("includes label, limit, and actual bytes in message", () => {
    const err = new RequestBodyTooLargeError("upload", 1024, 2048);
    expect(err.message).toContain("upload");
    expect(err.message).toContain("1024");
    expect(err.message).toContain("2048");
  });
});

// ── readCappedRequestBuffer ──────────────────────────────────────────────────

describe("readCappedRequestBuffer", () => {
  it("returns empty Uint8Array for null body", async () => {
    const req = makeGetRequest();
    const buffer = await readCappedRequestBuffer(req, 1000);
    expect(buffer.byteLength).toBe(0);
  });

  it("reads body within limit", async () => {
    const req = makeRequest("hello world");
    const buffer = await readCappedRequestBuffer(req, 1000);
    expect(TEXT_DECODER.decode(buffer)).toBe("hello world");
  });

  it("reads body exactly at limit", async () => {
    const body = "1234567890ABCDEF";
    const req = makeRequest(body);
    const buffer = await readCappedRequestBuffer(req, 16);
    expect(TEXT_DECODER.decode(buffer)).toBe(body);
  });

  it("throws RequestBodyTooLargeError when body exceeds limit", async () => {
    const body = "x".repeat(200);
    const req = makeRequest(body);
    await expect(readCappedRequestBuffer(req, 50, "upload")).rejects.toThrow(
      RequestBodyTooLargeError,
    );
  });

  it("reads chunked streaming bodies by counting actual bytes", async () => {
    const req = makeStreamingRequest(["stream-", "body-", "works"]);
    const buffer = await readCappedRequestBuffer(req, 64, "streaming request");
    expect(TEXT_DECODER.decode(buffer)).toBe("stream-body-works");
  });

  it("throws when streamed body exceeds the configured byte limit", async () => {
    const req = makeStreamingRequest(["12345", "67890", "X"]);
    await expect(
      readCappedRequestBuffer(req, 10, "chunked request"),
    ).rejects.toThrow("chunked request body too large (read 11 bytes, limit 10)");
  });

  it("error message includes the label", async () => {
    const body = "x".repeat(200);
    const req = makeRequest(body);
    await expect(readCappedRequestBuffer(req, 50, "payload")).rejects.toThrow(
      /payload/,
    );
  });

  it("uses 'request' as default label", async () => {
    const body = "x".repeat(200);
    const req = makeRequest(body);
    await expect(readCappedRequestBuffer(req, 50)).rejects.toThrow(/request/);
  });

  it("enforces limit regardless of Content-Length header", async () => {
    // Simulate chunked encoding bypass: Content-Length says small, body is large
    const req = new Request(HELPER_PATH, {
      method: "POST",
      body: "x".repeat(200),
      headers: { "Content-Length": "10" },
    });
    await expect(readCappedRequestBuffer(req, 50)).rejects.toThrow(
      RequestBodyTooLargeError,
    );
  });
});

// ── readCappedRequestText ────────────────────────────────────────────────────

describe("readCappedRequestText", () => {
  it("returns string content", async () => {
    const req = makeRequest("test content");
    const text = await readCappedRequestText(req, 1000);
    expect(text).toBe("test content");
  });

  it("returns empty string for null body", async () => {
    const req = makeGetRequest();
    const text = await readCappedRequestText(req, 1000);
    expect(text).toBe("");
  });

  it("throws on oversized body", async () => {
    const req = makeRequest("x".repeat(100));
    await expect(readCappedRequestText(req, 10, "text")).rejects.toThrow(
      RequestBodyTooLargeError,
    );
  });

  it("throws with exact message for streamed oversize", async () => {
    const req = makeStreamingRequest(["12345", "67890", "X"]);
    await expect(
      readCappedRequestText(req, 10, "chunked request"),
    ).rejects.toThrow("chunked request body too large (read 11 bytes, limit 10)");
  });
});

// ── readCappedRequestJson ────────────────────────────────────────────────────

describe("readCappedRequestJson", () => {
  it("parses valid JSON", async () => {
    const req = makeRequest(JSON.stringify({ ok: true, value: "safe" }));
    const data = await readCappedRequestJson<{ ok: boolean; value: string }>(req, 128);
    expect(data).toEqual({ ok: true, value: "safe" });
  });

  it("throws on invalid JSON", async () => {
    const req = makeRequest("not json");
    await expect(readCappedRequestJson(req, 1000)).rejects.toThrow();
  });

  it("throws on oversized JSON body", async () => {
    const bigJson = JSON.stringify({ data: "x".repeat(200) });
    const req = makeRequest(bigJson);
    await expect(readCappedRequestJson(req, 50, "json")).rejects.toThrow(
      RequestBodyTooLargeError,
    );
  });

  it("parses arrays", async () => {
    const req = makeRequest(JSON.stringify([1, 2, 3]));
    const data = await readCappedRequestJson<number[]>(req, 1000);
    expect(data).toEqual([1, 2, 3]);
  });

  it("uses default label 'request'", async () => {
    const req = makeRequest("x".repeat(200));
    await expect(readCappedRequestJson(req, 10)).rejects.toThrow(/request/);
  });
});
