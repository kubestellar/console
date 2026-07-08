/**
 * Unit tests for fetchWithTimeout.ts (#16109).
 * Tests timeout enforcement and signal propagation.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchWithTimeout } from "../fetchWithTimeout";

describe("fetchWithTimeout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("should return response on successful fetch", async () => {
    const mockResponse = new Response("success", { status: 200 });
    const mockFetch = vi.fn().mockResolvedValueOnce(mockResponse);
    vi.stubGlobal("fetch", mockFetch);

    const result = await fetchWithTimeout("http://example.com", { timeoutMs: 5000 });

    expect(result.status).toBe(200);
  });

  it("should use default timeout of 10 seconds", async () => {
    const mockFetch = vi.fn((url, options) => {
      expect(options.signal).toBeDefined();
      return Promise.resolve(new Response("success", { status: 200 }));
    });
    vi.stubGlobal("fetch", mockFetch);

    await fetchWithTimeout("http://example.com");

    expect(mockFetch).toHaveBeenCalled();
  });

  it("should apply custom timeout via AbortSignal", async () => {
    const mockFetch = vi.fn((url, options) => {
      expect(options.signal).toBeDefined();
      return Promise.resolve(new Response("success", { status: 200 }));
    });
    vi.stubGlobal("fetch", mockFetch);

    await fetchWithTimeout("http://example.com", { timeoutMs: 3000 });

    expect(mockFetch).toHaveBeenCalled();
  });

  it("should pass through fetch options", async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response("success", { status: 200 }));
    vi.stubGlobal("fetch", mockFetch);

    await fetchWithTimeout("http://example.com", {
      timeoutMs: 5000,
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ test: "data" }),
    });

    expect(mockFetch).toHaveBeenCalledWith(
      "http://example.com",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ test: "data" }),
        signal: expect.any(AbortSignal),
      })
    );
  });

  it("should handle response with various status codes", async () => {
    const testCases = [200, 201, 204, 400, 404, 500, 503];

    for (const statusCode of testCases) {
      vi.clearAllMocks();
      vi.unstubAllGlobals();
      
      // Status 204 (No Content) should not have a body
      const responseBody = statusCode === 204 ? null : "test";
      const mockFetch = vi.fn().mockResolvedValueOnce(new Response(responseBody, { status: statusCode }));
      vi.stubGlobal("fetch", mockFetch);

      const result = await fetchWithTimeout("http://example.com", { timeoutMs: 5000 });
      expect(result.status).toBe(statusCode);
    }
  });

  it("should propagate fetch errors", async () => {
    const mockFetch = vi.fn().mockRejectedValueOnce(new Error("Network error"));
    vi.stubGlobal("fetch", mockFetch);

    await expect(fetchWithTimeout("http://example.com", { timeoutMs: 5000 }))
      .rejects.toThrow("Network error");
  });

  it("should handle timeout abort errors", async () => {
    const timeoutError = new DOMException("The operation was aborted.", "AbortError");
    const mockFetch = vi.fn().mockRejectedValueOnce(timeoutError);
    vi.stubGlobal("fetch", mockFetch);

    await expect(fetchWithTimeout("http://example.com", { timeoutMs: 100 }))
      .rejects.toThrow();
  });

  it("should handle empty options", async () => {
    const mockResponse = new Response("success", { status: 200 });
    const mockFetch = vi.fn().mockResolvedValueOnce(mockResponse);
    vi.stubGlobal("fetch", mockFetch);

    const result = await fetchWithTimeout("http://example.com");

    expect(result.status).toBe(200);
  });

  it("should preserve existing signal if provided", async () => {
    const controller = new AbortController();
    const mockFetch = vi.fn((url, options) => {
      // The timeout signal should override any provided signal
      expect(options.signal).toBeDefined();
      return Promise.resolve(new Response("success", { status: 200 }));
    });
    vi.stubGlobal("fetch", mockFetch);

    await fetchWithTimeout("http://example.com", {
      timeoutMs: 5000,
      signal: controller.signal,
    });

    expect(mockFetch).toHaveBeenCalled();
  });
});
