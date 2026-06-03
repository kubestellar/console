/**
 * Vitest handler tests for acmm-scan.mts (#16507).
 */
import { describe, expect, it, vi } from "vitest";
import { readJson } from "./netlify-handler-helpers";

const { mockGet } = vi.hoisted(() => ({
  mockGet: vi.fn(),
}));

vi.mock("@netlify/blobs", () => ({
  getStore: () => ({ get: mockGet, set: vi.fn() }),
}));

import handler from "../acmm-scan.mts";

function makeRequest(search = "repo=kubestellar/console"): Request {
  return new Request(`https://console.kubestellar.io/api/acmm/scan?${search}`, {
    method: "GET",
    headers: { Origin: "https://console.kubestellar.io" },
  });
}

describe("acmm-scan", () => {
  it("returns 400 for invalid repo format", async () => {
    const res = await handler(makeRequest("repo=not-valid!!!"));
    expect(res.status).toBe(400);
    const body = await readJson<{ error: string }>(res);
    expect(body.error).toContain("Invalid repo");
    expect(mockGet).not.toHaveBeenCalled();
  });

  it("returns 403 for repos outside the allowlist", async () => {
    const res = await handler(makeRequest("repo=octocat/hello-world"));
    expect(res.status).toBe(403);
    const body = await readJson<{ error: string }>(res);
    expect(body.error).toBe("repo not permitted");
    expect(mockGet).not.toHaveBeenCalled();
  });
});
