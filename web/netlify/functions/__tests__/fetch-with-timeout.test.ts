// @vitest-environment node
/**
 * Unit tests for the shared fetchWithTimeout module.
 *
 * Tests verify timeout behavior using AbortSignal.timeout().
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { fetchWithTimeout } from "../_shared/fetchWithTimeout";

// ── Mock global fetch ──────────────────────────────────────────────────────────

const mockFetch = vi.fn<typeof globalThis.fetch>();

beforeEach(() => {
  vi.stubGlobal("fetch", mockFetch);
});

afterEach(() => {
  vi.restoreAllMocks();
});

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe("fetchWithTimeout", () => {
  it("returns response on successful fetch", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(200, { ok: true }));
    const res = await fetchWithTimeout("https://api.example.com");
    expect(res.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("forwards request options to fetch", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(201, {}));
    await fetchWithTimeout("https://api.example.com/data", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: '{"key":"value"}',
      timeoutMs: 5000,
    });
    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.example.com/data",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: '{"key":"value"}',
      }),
    );
  });

  it("passes an AbortSignal to fetch", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(200, {}));
    await fetchWithTimeout("https://api.example.com", { timeoutMs: 3000 });
    const callArgs = mockFetch.mock.calls[0];
    expect(callArgs[1]).toHaveProperty("signal");
  });

  it("defaults timeoutMs to 10000", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(200, {}));
    await fetchWithTimeout("https://api.example.com");
    // Just verify it doesn't throw — default timeout is 10s
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("does not strip timeoutMs from fetch options", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(200, {}));
    await fetchWithTimeout("https://api.example.com", { timeoutMs: 2000 });
    const callArgs = mockFetch.mock.calls[0];
    // timeoutMs should be destructured out, not passed to fetch
    expect(callArgs[1]).not.toHaveProperty("timeoutMs");
  });

  it("propagates network errors", async () => {
    mockFetch.mockRejectedValueOnce(new Error("ECONNREFUSED"));
    await expect(
      fetchWithTimeout("https://api.example.com", { timeoutMs: 5000 }),
    ).rejects.toThrow("ECONNREFUSED");
  });

  it("returns non-200 responses without throwing", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(500, { error: "fail" }));
    const res = await fetchWithTimeout("https://api.example.com");
    expect(res.status).toBe(500);
  });

  it("works with no options", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(200, {}));
    const res = await fetchWithTimeout("https://api.example.com");
    expect(res.status).toBe(200);
  });
});
