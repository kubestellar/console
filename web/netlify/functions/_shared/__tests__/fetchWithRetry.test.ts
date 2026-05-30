/**
 * Unit tests for fetchWithRetry.ts (#16109).
 * Tests retry logic, exponential backoff, timeout, and error handling.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { fetchWithRetry } from "../fetchWithRetry";

describe("fetchWithRetry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return response on successful first attempt", async () => {
    const mockResponse = new Response("success", { status: 200 });
    const mockFetch = vi.fn().mockResolvedValueOnce(mockResponse);
    global.fetch = mockFetch;

    const result = await fetchWithRetry("http://example.com");

    expect(result.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("should not retry on 4xx client errors", async () => {
    const mockResponse = new Response("not found", { status: 404 });
    const mockFetch = vi.fn().mockResolvedValueOnce(mockResponse);
    global.fetch = mockFetch;

    const result = await fetchWithRetry("http://example.com");

    expect(result.status).toBe(404);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("should retry on 5xx server errors", async () => {
    const error503 = new Response("service unavailable", { status: 503 });
    const success200 = new Response("success", { status: 200 });
    const mockFetch = vi.fn()
      .mockResolvedValueOnce(error503)
      .mockResolvedValueOnce(success200);
    global.fetch = mockFetch;

    const result = await fetchWithRetry("http://example.com");

    expect(result.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("should retry on network errors", async () => {
    const success200 = new Response("success", { status: 200 });
    const mockFetch = vi.fn()
      .mockRejectedValueOnce(new Error("Network error"))
      .mockResolvedValueOnce(success200);
    global.fetch = mockFetch;

    const result = await fetchWithRetry("http://example.com");

    expect(result.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("should throw after max retries exhausted", async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error("Network error"));
    global.fetch = mockFetch;

    await expect(fetchWithRetry("http://example.com", { maxRetries: 2 }))
      .rejects.toThrow("Network error");

    expect(mockFetch).toHaveBeenCalledTimes(3); // initial + 2 retries
  });

  it("should return 5xx response after max retries exhausted", async () => {
    const error503 = new Response("service unavailable", { status: 503 });
    const mockFetch = vi.fn().mockResolvedValue(error503);
    global.fetch = mockFetch;

    const result = await fetchWithRetry("http://example.com", { maxRetries: 2 });

    expect(result.status).toBe(503);
    expect(mockFetch).toHaveBeenCalledTimes(3); // initial + 2 retries
  });

  it("should use exponential backoff delays", async () => {
    vi.useFakeTimers();
    const error503 = new Response("service unavailable", { status: 503 });
    const success200 = new Response("success", { status: 200 });
    const mockFetch = vi.fn()
      .mockResolvedValueOnce(error503)
      .mockResolvedValueOnce(error503)
      .mockResolvedValueOnce(success200);
    global.fetch = mockFetch;

    const fetchPromise = fetchWithRetry("http://example.com", {
      maxRetries: 2,
      initialDelayMs: 100,
    });

    // First call happens immediately
    await vi.advanceTimersByTimeAsync(0);

    // First retry after 100ms (initialDelayMs * 2^0)
    await vi.advanceTimersByTimeAsync(100);

    // Second retry after 200ms (initialDelayMs * 2^1)
    await vi.advanceTimersByTimeAsync(200);

    const result = await fetchPromise;
    expect(result.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(3);

    vi.useRealTimers();
  });

  it("should respect custom timeout", async () => {
    const mockFetch = vi.fn((url, options) => {
      expect(options.signal).toBeDefined();
      return Promise.resolve(new Response("success", { status: 200 }));
    });
    global.fetch = mockFetch;

    await fetchWithRetry("http://example.com", { timeoutMs: 5000 });

    expect(mockFetch).toHaveBeenCalled();
  });

  it("should use default timeout of 10 seconds", async () => {
    const mockFetch = vi.fn((url, options) => {
      expect(options.signal).toBeDefined();
      return Promise.resolve(new Response("success", { status: 200 }));
    });
    global.fetch = mockFetch;

    await fetchWithRetry("http://example.com");

    expect(mockFetch).toHaveBeenCalled();
  });

  it("should pass through fetch options", async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response("success", { status: 200 }));
    global.fetch = mockFetch;

    await fetchWithRetry("http://example.com", {
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
      })
    );
  });

  it("should handle 2xx success responses", async () => {
    const mockResponse = new Response("created", { status: 201 });
    const mockFetch = vi.fn().mockResolvedValueOnce(mockResponse);
    global.fetch = mockFetch;

    const result = await fetchWithRetry("http://example.com");

    expect(result.status).toBe(201);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("should handle 3xx redirect responses without retry", async () => {
    const mockResponse = new Response("redirect", { status: 302 });
    const mockFetch = vi.fn().mockResolvedValueOnce(mockResponse);
    global.fetch = mockFetch;

    const result = await fetchWithRetry("http://example.com");

    expect(result.status).toBe(302);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("should convert non-Error objects to Error in catch", async () => {
    const mockFetch = vi.fn().mockRejectedValueOnce("string error");
    global.fetch = mockFetch;

    await expect(fetchWithRetry("http://example.com", { maxRetries: 0 }))
      .rejects.toThrow();
  });

  it("should handle edge case of zero maxRetries", async () => {
    const mockFetch = vi.fn().mockRejectedValueOnce(new Error("Fail"));
    global.fetch = mockFetch;

    await expect(fetchWithRetry("http://example.com", { maxRetries: 0 }))
      .rejects.toThrow("Fail");

    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("should retry exactly maxRetries times", async () => {
    const error503 = new Response("service unavailable", { status: 503 });
    const mockFetch = vi.fn().mockResolvedValue(error503);
    global.fetch = mockFetch;

    await fetchWithRetry("http://example.com", { maxRetries: 5 });

    expect(mockFetch).toHaveBeenCalledTimes(6); // initial + 5 retries
  });

  it("should handle timeout errors during retry", async () => {
    const timeoutError = new DOMException("The operation was aborted.", "AbortError");
    const success200 = new Response("success", { status: 200 });
    const mockFetch = vi.fn()
      .mockRejectedValueOnce(timeoutError)
      .mockResolvedValueOnce(success200);
    global.fetch = mockFetch;

    const result = await fetchWithRetry("http://example.com");

    expect(result.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});
