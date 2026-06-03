/**
 * Vitest handler tests for acmm-scan.mts.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FAKE_GITHUB_TOKEN, readJson } from "./netlify-handler-helpers";

const {
  mockGet,
  mockSet,
  mockFetchTreePaths,
  mockFetchWeeklyActivity,
  mockDemoScan,
  envGet,
} = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockSet: vi.fn(),
  mockFetchTreePaths: vi.fn(),
  mockFetchWeeklyActivity: vi.fn(),
  mockDemoScan: vi.fn(),
  envGet: vi.fn(),
}));

vi.mock("@netlify/blobs", () => ({
  getStore: () => ({ get: mockGet, set: mockSet }),
}));

vi.mock("../acmm-scan/fetchers", () => ({
  fetchTreePaths: mockFetchTreePaths,
  fetchWeeklyActivity: mockFetchWeeklyActivity,
}));

vi.mock("../acmm-scan/demo", () => ({
  demoScan: mockDemoScan,
}));

import handler from "../acmm-scan.mts";

function makeRequest(search = "repo=kubestellar/console"): Request {
  return new Request(`https://console.kubestellar.io/api/acmm/scan?${search}`, {
    method: "GET",
    headers: { Origin: "https://console.kubestellar.io" },
  });
}

describe("acmm-scan", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    envGet.mockReturnValue(FAKE_GITHUB_TOKEN);
    vi.stubGlobal("Netlify", { env: { get: envGet } });
    mockGet.mockResolvedValue(null);
    mockSet.mockResolvedValue(undefined);
    mockFetchTreePaths.mockResolvedValue(new Set(["CLAUDE.md"]));
    mockFetchWeeklyActivity.mockResolvedValue([]);
    mockDemoScan.mockReturnValue({
      repo: "kubestellar/console",
      scannedAt: new Date().toISOString(),
      detectedIds: [],
      weeklyActivity: [],
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns 400 for invalid repo format", async () => {
    const res = await handler(makeRequest("repo=not-valid!!!"));
    expect(res.status).toBe(400);
    const body = await readJson<{ error: string }>(res);
    expect(body.error).toContain("Invalid repo");
    expect(mockFetchTreePaths).not.toHaveBeenCalled();
  });

  it("returns 403 for repos outside the allowlist", async () => {
    const res = await handler(makeRequest("repo=octocat/private-repo"));
    expect(res.status).toBe(403);
    const body = await readJson<{ error: string }>(res);
    expect(body.error).toBe("repo not permitted");
    expect(mockGet).not.toHaveBeenCalled();
    expect(mockFetchTreePaths).not.toHaveBeenCalled();
  });

  it("returns scan results for an allowlisted repo", async () => {
    const res = await handler(makeRequest("repo=kubestellar/console"));
    expect(res.status).toBe(200);
    const body = await readJson<{
      repo: string;
      detectedIds: string[];
      weeklyActivity: unknown[];
    }>(res);
    expect(body.repo).toBe("kubestellar/console");
    expect(Array.isArray(body.detectedIds)).toBe(true);
    expect(Array.isArray(body.weeklyActivity)).toBe(true);
    expect(mockFetchTreePaths).toHaveBeenCalledWith("kubestellar/console", FAKE_GITHUB_TOKEN);
    expect(mockFetchWeeklyActivity).toHaveBeenCalledWith("kubestellar/console", FAKE_GITHUB_TOKEN);
  });
});
