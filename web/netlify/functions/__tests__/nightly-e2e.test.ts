/**
 * Vitest handler tests for nightly-e2e.mts (#15397, Part of #4189).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  assertResponseHasNoSecrets,
  FAKE_GITHUB_TOKEN,
  readJson,
} from "./netlify-handler-helpers";

const SAMPLE_GUIDES = [
  {
    guide: "llm-d-inference",
    acronym: "INF",
    platform: "linux",
    repo: "llm-d/llm-d",
    workflowFile: "nightly-e2e.yml",
    runs: [],
    passRate: 100,
    trend: "stable",
    latestConclusion: "success",
    model: "test-model",
    gpuType: "nvidia",
    gpuCount: 1,
    llmdImages: {},
    otherImages: {},
  },
];

const { mockGet, mockSet, mockFetchAll } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockSet: vi.fn(),
  mockFetchAll: vi.fn(),
}));

vi.mock("@netlify/blobs", () => ({
  getStore: () => ({ get: mockGet, set: mockSet }),
}));

vi.mock("../_shared/nightly-e2e", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../_shared/nightly-e2e")>();
  return {
    ...actual,
    fetchAll: mockFetchAll,
  };
});

import handler from "../nightly-e2e.mts";

function makeRequest(method = "GET"): Request {
  return new Request("https://console.kubestellar.io/api/nightly-e2e/runs", {
    method,
    headers: { Origin: "https://console.kubestellar.io" },
  });
}

describe("nightly-e2e", () => {
  const originalToken = process.env.GITHUB_TOKEN;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.GITHUB_TOKEN = FAKE_GITHUB_TOKEN;
    mockGet.mockResolvedValue(null);
    mockSet.mockResolvedValue(undefined);
    mockFetchAll.mockResolvedValue(SAMPLE_GUIDES);
  });

  afterEach(() => {
    if (originalToken === undefined) {
      delete process.env.GITHUB_TOKEN;
    } else {
      process.env.GITHUB_TOKEN = originalToken;
    }
  });

  it("returns 503 when GITHUB_TOKEN is not configured", async () => {
    delete process.env.GITHUB_TOKEN;
    const res = await handler(makeRequest());
    expect(res.status).toBe(503);
    const body = await readJson<{ error: string }>(res);
    expect(body.error).toContain("GITHUB_TOKEN");
    expect(mockFetchAll).not.toHaveBeenCalled();
  });

  it("returns fresh guides on happy path", async () => {
    const res = await handler(makeRequest());
    expect(res.status).toBe(200);
    const body = await readJson<{
      guides: typeof SAMPLE_GUIDES;
      fromCache: boolean;
      cachedAt: string;
    }>(res);
    expect(body.fromCache).toBe(false);
    expect(body.guides).toHaveLength(1);
    expect(body.guides[0].guide).toBe("llm-d-inference");
    assertResponseHasNoSecrets(JSON.stringify(body), [FAKE_GITHUB_TOKEN]);
    expect(mockFetchAll).toHaveBeenCalledWith(FAKE_GITHUB_TOKEN, expect.anything());
  });

  it("returns cached guides when blob entry is fresh", async () => {
    const entry = {
      guides: SAMPLE_GUIDES,
      cachedAt: new Date().toISOString(),
      expiresAt: Date.now() + 60_000,
    };
    mockGet.mockResolvedValue(JSON.stringify(entry));
    const res = await handler(makeRequest());
    expect(res.status).toBe(200);
    const body = await readJson<{ guides: unknown[]; fromCache: boolean }>(res);
    expect(body.fromCache).toBe(true);
    expect(mockFetchAll).not.toHaveBeenCalled();
  });

  it("returns stale cached guides when fetch fails but stale window is valid", async () => {
    const entry = {
      guides: SAMPLE_GUIDES,
      cachedAt: new Date(Date.now() - 10 * 60_000).toISOString(),
      expiresAt: Date.now() - 60_000,
    };
    mockGet.mockResolvedValue(JSON.stringify(entry));
    mockFetchAll.mockRejectedValue(new Error("GitHub API down"));
    const res = await handler(makeRequest());
    expect(res.status).toBe(200);
    const body = await readJson<{ guides: unknown[]; stale: boolean; fromCache: boolean }>(res);
    expect(body.stale).toBe(true);
    expect(body.fromCache).toBe(true);
  });

  it("returns 502 when fetch fails and no stale cache exists", async () => {
    mockFetchAll.mockRejectedValue(new Error("GitHub API down"));
    const res = await handler(makeRequest());
    expect(res.status).toBe(502);
    const body = await readJson<{ error: string }>(res);
    expect(body.error).toContain("Failed to fetch");
    assertResponseHasNoSecrets(JSON.stringify(body), [FAKE_GITHUB_TOKEN]);
  });
});
