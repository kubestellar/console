import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGet, mockSet } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockSet: vi.fn(),
}));

vi.mock("@netlify/blobs", () => ({
  getStore: () => ({ get: mockGet, set: mockSet }),
}));

import handler from "../acmm-scan.mts";

describe("acmm-scan", () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockSet.mockReset();
    vi.restoreAllMocks();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network")));
  });

  it("returns 403 for repos outside the allowlist before any fetch", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const res = await handler(
      new Request("https://console.kubestellar.io/api/acmm/scan?repo=other/private-repo"),
    );

    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({ error: "Repo not allowlisted" });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(mockGet).not.toHaveBeenCalled();
  });
});
