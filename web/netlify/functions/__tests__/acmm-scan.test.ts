import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGet, mockSet, mockFetchTreePaths, mockFetchWeeklyActivity } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockSet: vi.fn(),
  mockFetchTreePaths: vi.fn(),
  mockFetchWeeklyActivity: vi.fn(),
}));

vi.mock("@netlify/blobs", () => ({
  getStore: () => ({ get: mockGet, set: mockSet }),
}));

vi.mock("../acmm-scan/fetchers", () => ({
  fetchTreePaths: mockFetchTreePaths,
  fetchWeeklyActivity: mockFetchWeeklyActivity,
}));

import handler from "../acmm-scan.mts";

describe("acmm-scan", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it("returns 403 for repos outside the configured allowlist", async () => {
    vi.stubEnv("ACMM_REPOS", "kubestellar/console");

    const req = new Request("https://example.test/api/acmm/scan?repo=evil/repo");
    const res = await handler(req);

    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({ error: "Repository not allowed" });
    expect(mockGet).not.toHaveBeenCalled();
    expect(mockSet).not.toHaveBeenCalled();
    expect(mockFetchTreePaths).not.toHaveBeenCalled();
    expect(mockFetchWeeklyActivity).not.toHaveBeenCalled();
  });
});
