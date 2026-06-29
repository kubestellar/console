/**
 * @vitest-environment node
 *
 * Unit tests for readCappedBody.ts — stream-based DoS prevention (CWE-400).
 * This module does NOT trust Content-Length and reads actual bytes from the stream.
 */
import { describe, expect, it } from "vitest";
import { BodyTooLargeError, readCappedBody } from "../readCappedBody";

function createRequest(body: string | null): Request {
  if (body === null) {
    return new Request("http://test.local", { method: "POST" });
  }
  return new Request("http://test.local", { method: "POST", body });
}

function createChunkedRequest(chunks: string[]): Request {
  const encoded = chunks.map((c) => new TextEncoder().encode(c));
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of encoded) {
        controller.enqueue(chunk);
      }
      controller.close();
    },
  });
  return new Request("http://test.local", { method: "POST", body: stream, duplex: "half" } as RequestInit);
}

describe("readCappedBody", () => {
  describe("BodyTooLargeError", () => {
    it("has correct name and message", () => {
      const err = new BodyTooLargeError(1024);
      expect(err.name).toBe("BodyTooLargeError");
      expect(err.message).toBe("Request body exceeds 1024 byte limit");
      expect(err).toBeInstanceOf(Error);
    });
  });

  describe("readCappedBody()", () => {
    it("reads body within limit", async () => {
      const req = createRequest("hello world");
      const result = await readCappedBody(req, 1024);
      expect(result).toBe("hello world");
    });

    it("reads body exactly at limit", async () => {
      const body = "x".repeat(10);
      const req = createRequest(body);
      const result = await readCappedBody(req, 10);
      expect(result).toBe(body);
    });

    it("throws BodyTooLargeError when body exceeds limit", async () => {
      const req = createRequest("x".repeat(100));
      await expect(readCappedBody(req, 50)).rejects.toThrow(BodyTooLargeError);
      // Create fresh request since body is consumed
      const req2 = createRequest("x".repeat(100));
      await expect(readCappedBody(req2, 50)).rejects.toThrow(/exceeds 50 byte limit/);
    });

    it("returns empty string when body is null", async () => {
      // GET requests have no body
      const req = new Request("http://test.local", { method: "GET" });
      const result = await readCappedBody(req, 100);
      expect(result).toBe("");
    });

    it("handles empty POST body", async () => {
      const req = createRequest("");
      const result = await readCappedBody(req, 100);
      expect(result).toBe("");
    });

    it("handles UTF-8 multibyte characters", async () => {
      const body = "日本語テスト";
      const req = createRequest(body);
      // UTF-8 encoding: each character is 3 bytes, so 6 chars = 18 bytes
      const result = await readCappedBody(req, 100);
      expect(result).toBe(body);
    });

    it("enforces byte limit not character limit for multibyte", async () => {
      // "日" is 3 bytes in UTF-8
      const body = "日".repeat(10); // 30 bytes
      const req = createRequest(body);
      await expect(readCappedBody(req, 20)).rejects.toThrow(BodyTooLargeError);
    });

    it("does NOT trust Content-Length header (reads actual bytes)", async () => {
      // Spoofed Content-Length says 5, but actual body is 200 bytes
      const bigBody = "x".repeat(200);
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(bigBody));
          controller.close();
        },
      });
      const req = new Request("http://test.local", {
        method: "POST",
        body: stream,
        duplex: "half",
        headers: { "content-length": "5" },
      } as RequestInit);
      await expect(readCappedBody(req, 100)).rejects.toThrow(BodyTooLargeError);
    });

    it("handles chunked delivery that exceeds limit mid-stream", async () => {
      const req = createChunkedRequest(["aaaa", "bbbb", "cccc"]); // 12 bytes total
      await expect(readCappedBody(req, 10)).rejects.toThrow(BodyTooLargeError);
    });

    it("combines multiple chunks correctly", async () => {
      const req = createChunkedRequest(["hello", " ", "world"]);
      const result = await readCappedBody(req, 100);
      expect(result).toBe("hello world");
    });
  });
});
