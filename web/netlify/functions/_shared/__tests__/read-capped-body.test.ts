/**
 * @vitest-environment node
 *
 * Unit tests for read-capped-body.ts — DoS prevention via body size enforcement (CWE-400).
 * Tests both content-length early rejection and streaming byte-count enforcement.
 */
import { describe, expect, it } from "vitest";
import {
  isBodyTooLargeError,
  readCappedBodyBuffer,
  readCappedBodyJson,
  readCappedBodyText,
} from "../read-capped-body";

function createSource(body: string | null, headers: Record<string, string> = {}) {
  const hdrs = new Headers(headers);
  if (body === null) {
    return { headers: hdrs, body: null };
  }
  const encoded = new TextEncoder().encode(body);
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoded);
      controller.close();
    },
  });
  return { headers: hdrs, body: stream };
}

function createChunkedSource(chunks: string[], headers: Record<string, string> = {}) {
  const hdrs = new Headers(headers);
  const encodedChunks = chunks.map((c) => new TextEncoder().encode(c));
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of encodedChunks) {
        controller.enqueue(chunk);
      }
      controller.close();
    },
  });
  return { headers: hdrs, body: stream };
}

describe("read-capped-body", () => {
  describe("isBodyTooLargeError", () => {
    it("returns true for errors containing 'body too large'", () => {
      expect(isBodyTooLargeError(new Error("request body too large (content-length: 999)"))).toBe(true);
      expect(isBodyTooLargeError(new Error("upload body too large (body: 500 bytes)"))).toBe(true);
    });

    it("returns false for unrelated errors", () => {
      expect(isBodyTooLargeError(new Error("network error"))).toBe(false);
      expect(isBodyTooLargeError(new Error("timeout"))).toBe(false);
    });

    it("returns false for non-Error values", () => {
      expect(isBodyTooLargeError("body too large")).toBe(false);
      expect(isBodyTooLargeError(null)).toBe(false);
      expect(isBodyTooLargeError(undefined)).toBe(false);
      expect(isBodyTooLargeError(42)).toBe(false);
    });
  });

  describe("readCappedBodyBuffer", () => {
    it("returns empty Uint8Array when body is null", async () => {
      const source = createSource(null);
      const result = await readCappedBodyBuffer(source, 1024);
      expect(result).toEqual(new Uint8Array(0));
      expect(result.byteLength).toBe(0);
    });

    it("reads a body within the limit", async () => {
      const source = createSource("hello world");
      const result = await readCappedBodyBuffer(source, 1024);
      expect(new TextDecoder().decode(result)).toBe("hello world");
    });

    it("reads body exactly at limit boundary", async () => {
      const body = "x".repeat(10);
      const source = createSource(body);
      const result = await readCappedBodyBuffer(source, 10);
      expect(result.byteLength).toBe(10);
    });

    it("throws when content-length header exceeds limit", async () => {
      const source = createSource("small", { "content-length": "9999" });
      await expect(readCappedBodyBuffer(source, 100)).rejects.toThrow(
        /request body too large \(content-length: 9999\)/,
      );
    });

    it("throws with custom label when content-length exceeds limit", async () => {
      const source = createSource("x", { "content-length": "500" });
      await expect(readCappedBodyBuffer(source, 100, "webhook")).rejects.toThrow(
        /webhook body too large/,
      );
    });

    it("throws when streaming body exceeds limit", async () => {
      const bigBody = "x".repeat(200);
      const source = createSource(bigBody);
      await expect(readCappedBodyBuffer(source, 100)).rejects.toThrow(/body too large/);
    });

    it("error from streaming is recognized by isBodyTooLargeError", async () => {
      const source = createSource("x".repeat(200));
      try {
        await readCappedBodyBuffer(source, 50);
        expect.fail("should have thrown");
      } catch (e) {
        expect(isBodyTooLargeError(e)).toBe(true);
      }
    });

    it("handles multiple chunks that combine to exceed limit", async () => {
      const source = createChunkedSource(["aaaa", "bbbb", "cccc"]); // 12 bytes
      await expect(readCappedBodyBuffer(source, 10)).rejects.toThrow(/body too large/);
    });

    it("combines multiple chunks within limit", async () => {
      const source = createChunkedSource(["hello", " ", "world"]);
      const result = await readCappedBodyBuffer(source, 100);
      expect(new TextDecoder().decode(result)).toBe("hello world");
    });

    it("returns single chunk directly without copying", async () => {
      const source = createChunkedSource(["only-one"]);
      const result = await readCappedBodyBuffer(source, 100);
      expect(new TextDecoder().decode(result)).toBe("only-one");
    });

    it("returns empty Uint8Array for empty stream", async () => {
      const stream = new ReadableStream<Uint8Array>({
        start(controller) { controller.close(); },
      });
      const source = { headers: new Headers(), body: stream };
      const result = await readCappedBodyBuffer(source, 100);
      expect(result.byteLength).toBe(0);
    });

    it("ignores non-numeric content-length header", async () => {
      const source = createSource("ok", { "content-length": "not-a-number" });
      const result = await readCappedBodyBuffer(source, 100);
      expect(new TextDecoder().decode(result)).toBe("ok");
    });

    it("ignores Infinity content-length", async () => {
      const source = createSource("ok", { "content-length": "Infinity" });
      const result = await readCappedBodyBuffer(source, 100);
      expect(new TextDecoder().decode(result)).toBe("ok");
    });
  });

  describe("readCappedBodyText", () => {
    it("returns body as text string", async () => {
      const source = createSource("hello text");
      const result = await readCappedBodyText(source, 1024);
      expect(result).toBe("hello text");
    });

    it("returns empty string for null body", async () => {
      const source = createSource(null);
      const result = await readCappedBodyText(source, 100);
      expect(result).toBe("");
    });

    it("handles UTF-8 multibyte characters", async () => {
      const source = createSource("café ☕");
      const result = await readCappedBodyText(source, 100);
      expect(result).toBe("café ☕");
    });

    it("throws when body exceeds limit", async () => {
      const source = createSource("x".repeat(200));
      await expect(readCappedBodyText(source, 50)).rejects.toThrow(/body too large/);
    });
  });

  describe("readCappedBodyJson", () => {
    it("parses valid JSON body", async () => {
      const source = createSource(JSON.stringify({ name: "test", count: 42 }));
      const result = await readCappedBodyJson<{ name: string; count: number }>(source, 1024);
      expect(result).toEqual({ name: "test", count: 42 });
    });

    it("throws on invalid JSON", async () => {
      const source = createSource("not json {{{");
      await expect(readCappedBodyJson(source, 1024)).rejects.toThrow();
    });

    it("throws when JSON body exceeds size limit", async () => {
      const bigObj = JSON.stringify({ data: "x".repeat(200) });
      const source = createSource(bigObj);
      await expect(readCappedBodyJson(source, 50)).rejects.toThrow(/body too large/);
    });

    it("parses JSON arrays", async () => {
      const source = createSource("[1,2,3]");
      const result = await readCappedBodyJson<number[]>(source, 100);
      expect(result).toEqual([1, 2, 3]);
    });
  });
});
