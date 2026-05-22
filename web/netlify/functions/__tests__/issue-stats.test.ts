/**
 * Vitest handler tests for issue-stats.mts (#15397, Part of #4189).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  assertResponseHasNoSecrets,
  FAKE_GITHUB_TOKEN,
  readJson,
} from "./netlify-handler-helpers";

const { mockGet, mockSetJSON } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockSetJSON: vi.fn(),
}));

// issue-stats.mts uses store.get(key, { type: "json" }) — Netlify returns a parsed object, not a string.
vi.mock("@netlify/blobs", () => ({
  getStore: () => ({
    get: mockGet,
    setJSON: mockSetJSON,
  }),
}));

import handler from "../issue-stats.mts";

function makeRequest(search = "repo=kubestellar/console&days=7"): Request {
  return new Request(`https://console.kubestellar.io/api/issue-stats?${search}`, {
    method: "GET",
    headers: { Origin: "https://console.kubestellar.io" },
  });
}

function makeIssue(createdAt: string, state: string, closedAt?: string) {
  return {
    created_at: createdAt,
    state,
    closed_at: closedAt ?? null,
  };
}

function makeMergedPr(mergedAt: string) {
  return {
    merged_at: mergedAt,
    state: "closed",
  };
}

describe("issue-stats", () => {
  const originalToken = process.env.GITHUB_TOKEN;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.GITHUB_TOKEN = FAKE_GITHUB_TOKEN;
    mockGet.mockResolvedValue(null);
    mockSetJSON.mockResolvedValue(undefined);

    const today = new Date();
    const yesterday = new Date(today.getTime() - 86_400_000);
    const createdToday = today.toISOString();
    const createdYesterday = yesterday.toISOString();
    const closedToday = today.toISOString().slice(0, 10);

    fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          JSON.stringify([
            makeIssue(createdToday, "open"),
            makeIssue(createdYesterday, "closed", `${closedToday}T12:00:00Z`),
          ]),
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify([makeMergedPr(createdToday)]),
      });
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    if (originalToken === undefined) {
      delete process.env.GITHUB_TOKEN;
    } else {
      process.env.GITHUB_TOKEN = originalToken;
    }
  });

  it("returns 400 for invalid repo format", async () => {
    const res = await handler(makeRequest("repo=not-valid!!!&days=7"));
    expect(res.status).toBe(400);
    const body = await readJson<{ error: string }>(res);
    expect(body.error).toContain("Invalid repo");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns 500 when GITHUB_TOKEN is not configured", async () => {
    delete process.env.GITHUB_TOKEN;
    const res = await handler(makeRequest());
    expect(res.status).toBe(500);
    const body = await readJson<{ error: string }>(res);
    expect(body.error).toContain("GITHUB_TOKEN");
  });

  it("returns daily stats array on happy path", async () => {
    const res = await handler(makeRequest());
    expect(res.status).toBe(200);
    const body = await readJson<Array<{ date: string; opened: number; closed: number; prsMerged: number }>>(res);
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThan(0);
    expect(body[0]).toMatchObject({
      date: expect.any(String),
      opened: expect.any(Number),
      closed: expect.any(Number),
      prsMerged: expect.any(Number),
    });
    expect(res.headers.get("X-Cache")).toBe("MISS");
    const raw = JSON.stringify(body);
    assertResponseHasNoSecrets(raw, [FAKE_GITHUB_TOKEN, "Bearer ", "gho_"]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const authHeader = (fetchMock.mock.calls[0][1] as RequestInit).headers as Record<string, string>;
    expect(authHeader.Authorization).toContain("Bearer");
    expect(raw).not.toContain(FAKE_GITHUB_TOKEN);
  });

  it("returns cached stats on blob cache hit", async () => {
    const cachedStats = [{ date: "2026-05-20", opened: 1, closed: 0, prsMerged: 0 }];
    // Parsed shape returned by get(..., { type: "json" }) in issue-stats.mts
    mockGet.mockResolvedValue({
      timestamp: Date.now(),
      stats: cachedStats,
    });
    const res = await handler(makeRequest());
    expect(res.status).toBe(200);
    const body = await readJson(res);
    expect(body).toEqual(cachedStats);
    expect(res.headers.get("X-Cache")).toBe("HIT");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns 502 when GitHub fetch throws", async () => {
    fetchMock.mockReset();
    fetchMock.mockRejectedValue(new Error("network failure"));
    const res = await handler(makeRequest());
    expect(res.status).toBe(502);
    const body = await readJson<{ error: string }>(res);
    expect(body.error).toContain("unavailable");
    assertResponseHasNoSecrets(JSON.stringify(body), [FAKE_GITHUB_TOKEN]);
  });

  it("returns 405 for non-GET methods", async () => {
    const res = await handler(
      new Request("https://console.kubestellar.io/api/issue-stats", { method: "POST" }),
    );
    expect(res.status).toBe(405);
  });
});
