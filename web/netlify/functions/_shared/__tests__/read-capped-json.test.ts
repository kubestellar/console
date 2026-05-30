/**
 * Unit tests for read-capped-json.ts (#16109).
 * Tests size cap enforcement, buffer reading, and JSON parsing.
 */
import { describe, expect, it } from "vitest";
import {
  readCappedBuffer,
  readCappedText,
  readCappedJson,
  isResponseTooLargeError,
  MAX_RESPONSE_BYTES,
} from "../read-capped-json";

describe("read-capped-json", () => {
  describe("isResponseTooLargeError", () => {
    it("should return true for response too large error", () => {
      const error = new Error("upstream response too large (content-length: 600000)");
      expect(isResponseTooLargeError(error)).toBe(true);
    });

    it("should return true for body too large error", () => {
      const error = new Error("upstream response too large (body: 600000 bytes)");
      expect(isResponseTooLargeError(error)).toBe(true);
    });

    it("should return false for other errors", () => {
      const error = new Error("Network error");
      expect(isResponseTooLargeError(error)).toBe(false);
    });

    it("should return false for non-Error objects", () => {
      expect(isResponseTooLargeError("string error")).toBe(false);
      expect(isResponseTooLargeError(null)).toBe(false);
      expect(isResponseTooLargeError(undefined)).toBe(false);
      expect(isResponseTooLargeError(123)).toBe(false);
    });
  });

  describe("readCappedBuffer", () => {
    it("should read response body within limit", async () => {
      const body = "test data";
      const response = new Response(body);

      const buffer = await readCappedBuffer(response, MAX_RESPONSE_BYTES);
      const text = new TextDecoder().decode(buffer);

      expect(text).toBe(body);
    });

    it("should throw when content-length exceeds limit", async () => {
      const largeBody = "x".repeat(1000);
      const response = new Response(largeBody, {
        headers: { "content-length": "600000" },
      });

      await expect(readCappedBuffer(response, 500000))
        .rejects.toThrow("response too large (content-length: 600000)");
    });

    it("should throw when body size exceeds limit during streaming", async () => {
      const largeBody = "x".repeat(600000);
      const response = new Response(largeBody);

      await expect(readCappedBuffer(response, 500000))
        .rejects.toThrow("response too large (body:");
    });

    it("should handle empty response body", async () => {
      const response = new Response(null);

      const buffer = await readCappedBuffer(response, MAX_RESPONSE_BYTES);

      expect(buffer.byteLength).toBe(0);
    });

    it("should use custom label in error messages", async () => {
      const largeBody = "x".repeat(1000);
      const response = new Response(largeBody, {
        headers: { "content-length": "600000" },
      });

      await expect(readCappedBuffer(response, 500000, "GitHub API"))
        .rejects.toThrow("GitHub API response too large");
    });

    it("should use default label 'upstream' when not provided", async () => {
      const largeBody = "x".repeat(1000);
      const response = new Response(largeBody, {
        headers: { "content-length": "600000" },
      });

      await expect(readCappedBuffer(response, 500000))
        .rejects.toThrow("upstream response too large");
    });

    it("should handle response without content-length header", async () => {
      const body = "test data without content-length";
      const response = new Response(body);

      const buffer = await readCappedBuffer(response, MAX_RESPONSE_BYTES);
      const text = new TextDecoder().decode(buffer);

      expect(text).toBe(body);
    });

    it("should handle invalid content-length header", async () => {
      const body = "test data";
      const response = new Response(body, {
        headers: { "content-length": "invalid" },
      });

      const buffer = await readCappedBuffer(response, MAX_RESPONSE_BYTES);
      const text = new TextDecoder().decode(buffer);

      expect(text).toBe(body);
    });

    it("should combine multiple chunks correctly", async () => {
      const body = "x".repeat(10000);
      const response = new Response(body);

      const buffer = await readCappedBuffer(response, MAX_RESPONSE_BYTES);

      expect(buffer.byteLength).toBe(10000);
    });

    it("should handle single chunk optimization", async () => {
      const body = "small";
      const response = new Response(body);

      const buffer = await readCappedBuffer(response, MAX_RESPONSE_BYTES);
      const text = new TextDecoder().decode(buffer);

      expect(text).toBe(body);
    });
  });

  describe("readCappedText", () => {
    it("should read and decode text response", async () => {
      const body = "Hello, world!";
      const response = new Response(body);

      const text = await readCappedText(response, MAX_RESPONSE_BYTES);

      expect(text).toBe(body);
    });

    it("should handle UTF-8 encoded text", async () => {
      const body = "Hello 世界 🌍";
      const response = new Response(body);

      const text = await readCappedText(response, MAX_RESPONSE_BYTES);

      expect(text).toBe(body);
    });

    it("should throw when content exceeds limit", async () => {
      const largeBody = "x".repeat(600000);
      const response = new Response(largeBody);

      await expect(readCappedText(response, 500000))
        .rejects.toThrow("response too large");
    });

    it("should use custom label", async () => {
      const largeBody = "x".repeat(1000);
      const response = new Response(largeBody, {
        headers: { "content-length": "600000" },
      });

      await expect(readCappedText(response, 500000, "API"))
        .rejects.toThrow("API response too large");
    });
  });

  describe("readCappedJson", () => {
    it("should parse JSON response", async () => {
      const data = { message: "Hello", count: 42 };
      const response = new Response(JSON.stringify(data));

      const result = await readCappedJson<typeof data>(response);

      expect(result).toEqual(data);
    });

    it("should use default max bytes limit", async () => {
      const data = { test: "small" };
      const response = new Response(JSON.stringify(data));

      const result = await readCappedJson(response);

      expect(result).toEqual(data);
    });

    it("should throw on malformed JSON", async () => {
      const response = new Response("{ invalid json");

      await expect(readCappedJson(response))
        .rejects.toThrow();
    });

    it("should throw when JSON exceeds limit", async () => {
      const largeData = { data: "x".repeat(600000) };
      const response = new Response(JSON.stringify(largeData));

      await expect(readCappedJson(response))
        .rejects.toThrow("response too large");
    });

    it("should handle empty JSON objects", async () => {
      const response = new Response("{}");

      const result = await readCappedJson(response);

      expect(result).toEqual({});
    });

    it("should handle empty JSON arrays", async () => {
      const response = new Response("[]");

      const result = await readCappedJson(response);

      expect(result).toEqual([]);
    });

    it("should handle nested JSON structures", async () => {
      const data = {
        user: {
          name: "Alice",
          roles: ["admin", "user"],
          metadata: {
            created: "2024-01-01",
          },
        },
      };
      const response = new Response(JSON.stringify(data));

      const result = await readCappedJson(response);

      expect(result).toEqual(data);
    });

    it("should use custom label in errors", async () => {
      const largeData = { data: "x".repeat(1000) };
      const response = new Response(JSON.stringify(largeData), {
        headers: { "content-length": "600000" },
      });

      await expect(readCappedJson(response, "GitHub"))
        .rejects.toThrow("GitHub response too large");
    });

    it("should handle null JSON value", async () => {
      const response = new Response("null");

      const result = await readCappedJson(response);

      expect(result).toBeNull();
    });

    it("should handle JSON primitives", async () => {
      const numberResponse = new Response("42");
      const stringResponse = new Response('"hello"');
      const boolResponse = new Response("true");

      expect(await readCappedJson(numberResponse)).toBe(42);
      expect(await readCappedJson(stringResponse)).toBe("hello");
      expect(await readCappedJson(boolResponse)).toBe(true);
    });
  });

  describe("MAX_RESPONSE_BYTES constant", () => {
    it("should be 512000 (500 KB)", () => {
      expect(MAX_RESPONSE_BYTES).toBe(512_000);
    });
  });
});
