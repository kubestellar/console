// @vitest-environment node
/**
 * Unit tests for the shared fetchWithRetry module.
 *
 * Tests verify retry logic, exponential backoff behavior,
 * 4xx non-retry, 5xx retry, timeout, and network error handling.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { fetchWithRetry } from "../_shared/fetchWithRetry";

// ── Mock global fetch ──────────────────────────────────────────────────────────

const mockFetch = vi.fn<typeof globalThis.fetch>();

beforeEach(() => {
  vi.stubGlobal("fetch", mockFetch);
  // Speed up tests by faking timers
  vi.useFakeTimers();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

// Helper: advance through delays by running pending timers
async function flushRetries() {
  // Run all microtask-queued timers (covers exponential backoff delays)
  await vi.runAllTimersAsync();
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// ── Success cases ──────────────────────────────────────────────────────────────

describe("fetchWithRetry — success", () => {
  it("returns a 200 response immediately", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(200, { ok: true }));
    const promise = fetchWithRetry("https://api.example.com/data");
    await flushRetries();
    const res = await promise;
    expect(res.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("returns a 301 redirect without retrying", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(301, {}));
    const promise = fetchWithRetry("https://api.example.com/old");
    await flushRetries();
    const res = await promise;
    expect(res.status).toBe(301);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("forwards request options to fetch", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(200, {}));
    const promise = fetchWithRetry("https://api.example.com", {
      method: "POST",
      headers: { Authorization: "Bearer token" },
      body: '{"x":1}',
    });
    await flushRetries();
    await promise;
    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.example.com",
      expect.objectContaining({
        method: "POST",
        headers: { Authorization: "Bearer token" },
        body: '{"x":1}',
      }),
    );
  });
});

// ── 4xx not retried ────────────────────────────────────────────────────────────

describe("fetchWithRetry — 4xx (client errors)", () => {
  it("returns 400 without retrying", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(400, { error: "bad" }));
    const promise = fetchWithRetry("https://api.example.com");
    await flushRetries();
    const res = await promise;
    expect(res.status).toBe(400);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("returns 404 without retrying", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(404, { error: "not found" }));
    const promise = fetchWithRetry("https://api.example.com/missing");
    await flushRetries();
    const res = await promise;
    expect(res.status).toBe(404);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("returns 429 without retrying", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(429, { error: "rate limit" }));
    const promise = fetchWithRetry("https://api.example.com");
    await flushRetries();
    const res = await promise;
    expect(res.status).toBe(429);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});

// ── 5xx retries ────────────────────────────────────────────────────────────────

describe("fetchWithRetry — 5xx (server errors)", () => {
  it("retries on 500 and succeeds on second attempt", async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse(500, { error: "fail" }))
      .mockResolvedValueOnce(jsonResponse(200, { ok: true }));
    const promise = fetchWithRetry("https://api.example.com", {
      maxRetries: 3,
      initialDelayMs: 10,
    });
    await flushRetries();
    const res = await promise;
    expect(res.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("retries on 502 up to maxRetries then returns last response", async () => {
    mockFetch.mockResolvedValue(jsonResponse(502, { error: "gateway" }));
    const promise = fetchWithRetry("https://api.example.com", {
      maxRetries: 2,
      initialDelayMs: 10,
    });
    await flushRetries();
    const res = await promise;
    expect(res.status).toBe(502);
    // initial + 2 retries = 3 calls
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it("retries on 503 then succeeds on third attempt", async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse(503, {}))
      .mockResolvedValueOnce(jsonResponse(503, {}))
      .mockResolvedValueOnce(jsonResponse(200, { recovered: true }));
    const promise = fetchWithRetry("https://api.example.com", {
      maxRetries: 3,
      initialDelayMs: 10,
    });
    await flushRetries();
    const res = await promise;
    expect(res.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });
});

// ── Network errors (thrown) ────────────────────────────────────────────────────

describe("fetchWithRetry — network errors", () => {
  it("retries on network error then succeeds", async () => {
    mockFetch
      .mockRejectedValueOnce(new Error("ECONNRESET"))
      .mockResolvedValueOnce(jsonResponse(200, { ok: true }));
    const promise = fetchWithRetry("https://api.example.com", {
      maxRetries: 2,
      initialDelayMs: 10,
    });
    await flushRetries();
    const res = await promise;
    expect(res.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("throws after exhausting all retries on network error", async () => {
    mockFetch.mockRejectedValue(new Error("Network unreachable"));
    const promise = fetchWithRetry("https://api.example.com", {
      maxRetries: 2,
      initialDelayMs: 10,
    });
    await flushRetries();
    await expect(promise).rejects.toThrow("Network unreachable");
    // initial + 2 retries = 3 calls
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it("wraps non-Error thrown values", async () => {
    mockFetch.mockRejectedValue("string error");
    const promise = fetchWithRetry("https://api.example.com", {
      maxRetries: 0,
      initialDelayMs: 10,
    });
    await flushRetries();
    await expect(promise).rejects.toThrow("string error");
  });
});

// ── Options ────────────────────────────────────────────────────────────────────

describe("fetchWithRetry — options", () => {
  it("defaults to 3 retries", async () => {
    mockFetch.mockResolvedValue(jsonResponse(500, {}));
    const promise = fetchWithRetry("https://api.example.com", {
      initialDelayMs: 10,
    });
    await flushRetries();
    await promise;
    // 1 initial + 3 retries = 4 calls
    expect(mockFetch).toHaveBeenCalledTimes(4);
  });

  it("respects maxRetries: 0 (no retries)", async () => {
    mockFetch.mockRejectedValueOnce(new Error("fail"));
    const promise = fetchWithRetry("https://api.example.com", {
      maxRetries: 0,
      initialDelayMs: 10,
    });
    await flushRetries();
    await expect(promise).rejects.toThrow("fail");
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("respects maxRetries: 5", async () => {
    mockFetch.mockResolvedValue(jsonResponse(500, {}));
    const promise = fetchWithRetry("https://api.example.com", {
      maxRetries: 5,
      initialDelayMs: 10,
    });
    await flushRetries();
    await promise;
    // 1 initial + 5 retries = 6 calls
    expect(mockFetch).toHaveBeenCalledTimes(6);
  });

  it("passes timeoutMs as AbortSignal.timeout", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(200, {}));
    const promise = fetchWithRetry("https://api.example.com", {
      timeoutMs: 5000,
      initialDelayMs: 10,
    });
    await flushRetries();
    await promise;
    // Verify signal was passed (AbortSignal.timeout creates a signal)
    const callArgs = mockFetch.mock.calls[0];
    expect(callArgs[1]).toHaveProperty("signal");
  });

  it("works with no options at all", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(200, { ok: true }));
    const promise = fetchWithRetry("https://api.example.com");
    await flushRetries();
    const res = await promise;
    expect(res.status).toBe(200);
  });
});
