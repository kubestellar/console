/**
 * Vitest handler tests for missions-browse.mts (#15403, Part of #4189).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  assertResponseHasNoSecrets,
  FAKE_GITHUB_TOKEN,
  makeNetlifyRequest,
  readJson,
} from "./netlify-handler-helpers";

const { mockEnforceSimpleRateLimit, mockGet, mockSetJSON } = vi.hoisted(() => ({
  mockEnforceSimpleRateLimit: vi.fn(),
  mockGet: vi.fn(),
  mockSetJSON: vi.fn(),
}));

vi.mock("@netlify/blobs", () => ({
  getStore: () => ({ get: mockGet, setJSON: mockSetJSON }),
}));

vi.mock("../_shared/rate-limit", () => ({
  enforceSimpleRateLimit: mockEnforceSimpleRateLimit,
}));

import handler from "../missions-browse.mts";

const API_MISSIONS_BROWSE = "/api/missions/browse";

function makeBrowseRequest(
  search = "",
  options?: { headers?: Record<string, string> },
): Request {
  return makeNetlifyRequest(API_MISSIONS_BROWSE, { search, headers: options?.headers });
}

describe("missions-browse", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockEnforceSimpleRateLimit.mockResolvedValue({ limited: false, retryAfterSeconds: 0 });
    mockGet.mockResolvedValue(null);
    mockSetJSON.mockResolvedValue(undefined);
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns 400 for invalid path query", async () => {
    const res = await handler(makeBrowseRequest("path=../secrets"));
    expect(res.status).toBe(400);
    const body = await readJson<{ error: string }>(res);
    expect(body.error).toBe("invalid path");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns 400 for unknown mission directory prefixes", async () => {
    const res = await handler(makeBrowseRequest("path=docs/security"));
    expect(res.status).toBe(400);
    const body = await readJson<{ error: string }>(res);
    expect(body.error).toBe("invalid path");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns 400 for nested mission paths outside the bounded cache key set", async () => {
    const res = await handler(makeBrowseRequest("path=fixes/networking/missing"));
    expect(res.status).toBe(400);
    const body = await readJson<{ error: string }>(res);
    expect(body.error).toBe("invalid path");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns 400 for overly long paths", async () => {
    const tooLongSegment = "a".repeat(252);
    const res = await handler(makeBrowseRequest(`path=fixes/${tooLongSegment}`));
    expect(res.status).toBe(400);
    const body = await readJson<{ error: string }>(res);
    expect(body.error).toBe("invalid path");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("transforms GitHub entries and filters infrastructure files on happy path", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => null },
      text: async () =>
        JSON.stringify([
          { type: "file", name: "index.json", path: "fixes/index.json", size: 10 },
          { type: "dir", name: "demo", path: "fixes/demo", size: 0 },
          { type: "file", name: ".gitkeep", path: "fixes/.gitkeep", size: 0 },
        ]),
    });

    const res = await handler(makeBrowseRequest("path=fixes"));
    expect(res.status).toBe(200);
    expect(res.headers.get("X-Cache")).toBe("MISS");

    const body = await readJson<Array<{ name: string; type: string; path: string }>>(res);
    expect(body).toEqual([{ name: "demo", path: "fixes/demo", type: "directory", size: 0 }]);
    assertResponseHasNoSecrets(JSON.stringify(body), [FAKE_GITHUB_TOKEN]);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/repos/kubestellar/console-kb/contents/fixes"),
      expect.any(Object),
    );
  });

  it("returns cached listing on blob cache hit without calling GitHub", async () => {
    const cachedBody = JSON.stringify([{ name: "cached", path: "fixes/cached", type: "file", size: 1 }]);
    mockGet.mockResolvedValue({ body: cachedBody, fetchedAt: Date.now(), status: 200 });

    const res = await handler(makeBrowseRequest("path=fixes"));
    expect(res.status).toBe(200);
    expect(res.headers.get("X-Cache")).toBe("HIT");
    expect(fetchMock).not.toHaveBeenCalled();
    const body = await readJson(res);
    expect(body).toEqual([{ name: "cached", path: "fixes/cached", type: "file", size: 1 }]);
  });

  it("negative-caches 404 responses and serves them from cache", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 404, headers: { get: () => null }, text: async () => "not found" });

    const first = await handler(makeBrowseRequest("path=fixes/cncf-generated/akri"));
    expect(first.status).toBe(404);
    expect(first.headers.get("X-Cache")).toBe("MISS");
    expect(await readJson<{ error: string }>(first)).toEqual({ error: "directory not found" });
    expect(mockSetJSON).toHaveBeenCalledWith(
      "browse:fixes/cncf-generated/akri",
      expect.objectContaining({ status: 404 }),
    );

    mockGet.mockResolvedValueOnce({
      body: JSON.stringify({ error: "directory not found" }),
      fetchedAt: Date.now(),
      status: 404,
    });

    const second = await handler(makeBrowseRequest("path=fixes/cncf-generated/akri"));
    expect(second.status).toBe(404);
    expect(second.headers.get("X-Cache")).toBe("HIT");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(await readJson<{ error: string }>(second)).toEqual({ error: "directory not found" });
  });

  it("returns 502 when upstream fails and no cache exists", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500, headers: { get: () => null }, text: async () => "error" });
    const res = await handler(makeBrowseRequest("path=fixes"));
    expect(res.status).toBe(502);
    const body = await readJson<{ error: string; code?: string }>(res);
    expect(body.error).toContain("upstream");
  });

  it("rate limits repeated cache-miss requests per client IP", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 404, headers: { get: () => null }, text: async () => "not found" });
    let rateLimitCalls = 0;
    mockEnforceSimpleRateLimit.mockImplementation(async () => {
      rateLimitCalls += 1;
      return {
        limited: rateLimitCalls > 60,
        retryAfterSeconds: 30,
      };
    });

    for (let i = 0; i < 60; i++) {
      const res = await handler(makeBrowseRequest("path=fixes/workloads", {
        headers: { "x-nf-client-connection-ip": "203.0.113.50" },
      }));
      expect(res.status).toBe(404);
    }

    const limited = await handler(makeBrowseRequest("path=fixes/workloads", {
      headers: { "x-nf-client-connection-ip": "203.0.113.50" },
    }));
    expect(limited.status).toBe(429);
    expect(mockEnforceSimpleRateLimit).toHaveBeenLastCalledWith(expect.objectContaining({
      storeName: "missions-browse-rate-limit",
      prefix: "missions-browse:",
      subject: "203.0.113.50",
      maxRequests: 60,
      windowMs: 60_000,
    }));
    const body = await readJson<{ error: string; retryAfter: number }>(limited);
    expect(body.error).toBe("Rate limit exceeded");
    expect(body.retryAfter).toBe(30);
    expect(fetchMock).toHaveBeenCalledTimes(60);
  });
});
