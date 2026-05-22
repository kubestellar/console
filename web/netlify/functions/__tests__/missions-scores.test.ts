/**
 * Vitest handler tests for missions-scores.mts (#15403, Part of #4189).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  assertResponseHasNoSecrets,
  FAKE_GITHUB_TOKEN,
  makeNetlifyRequest,
  readJson,
} from "./netlify-handler-helpers";

const { mockGet, mockSetJSON } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockSetJSON: vi.fn(),
}));

vi.mock("@netlify/blobs", () => ({
  getStore: () => ({ get: mockGet, setJSON: mockSetJSON }),
}));

import handler from "../missions-scores.mts";

const API_MISSIONS_SCORES = "/api/missions/scores";
const DEMO_HEADERS = { "X-Demo-Mode": "true" };

const SAMPLE_INDEX = {
  missions: [
    {
      path: "fixes/alpha/mission-a.json",
      title: "Mission A",
      cncfProjects: ["console"],
      qualityScore: 90,
      qualityPass: true,
    },
    {
      path: "fixes/beta/mission-b.json",
      title: "Mission B",
      cncfProjects: ["console"],
      qualityScore: 90,
      qualityPass: true,
    },
    {
      path: "fixes/gamma/mission-c.json",
      title: "Mission C",
      cncfProjects: ["console"],
      qualityScore: 50,
      qualityPass: false,
    },
    {
      path: "fixes/delta/mission-d.json",
      title: "Mission D (no score)",
      cncfProjects: ["console"],
      qualityPass: false,
    },
  ],
};

describe("missions-scores", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockGet.mockResolvedValue(null);
    mockSetJSON.mockResolvedValue(undefined);
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns demo leaderboard list without upstream fetch", async () => {
    const res = await handler(
      makeNetlifyRequest(API_MISSIONS_SCORES, { headers: DEMO_HEADERS }),
    );
    expect(res.status).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();

    const body = await readJson<{ count: number; scores: Array<{ qualityScore: number }> }>(res);
    expect(body.count).toBe(1);
    expect(body.scores[0].qualityScore).toBe(85);
    assertResponseHasNoSecrets(JSON.stringify(body), [FAKE_GITHUB_TOKEN]);
  });

  it("returns demo single mission when project and id are provided", async () => {
    const res = await handler(
      makeNetlifyRequest(API_MISSIONS_SCORES, {
        search: "project=demo&id=demo-123",
        headers: DEMO_HEADERS,
      }),
    );
    expect(res.status).toBe(200);
    const body = await readJson<{ project: string; qualityScore: number }>(res);
    expect(body.project).toBe("demo");
    expect(body.qualityScore).toBe(85);
  });

  it("paginates scored missions and excludes entries without qualityScore", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => null },
      text: async () => JSON.stringify(SAMPLE_INDEX),
    });

    const res = await handler(
      makeNetlifyRequest(API_MISSIONS_SCORES, { search: "limit=2&offset=0" }),
    );
    expect(res.status).toBe(200);

    const body = await readJson<{
      count: number;
      scores: Array<{ title: string; qualityScore: number }>;
      hasMore: boolean;
      limit: number;
      offset: number;
    }>(res);

    expect(body.count).toBe(3);
    expect(body.limit).toBe(2);
    expect(body.offset).toBe(0);
    expect(body.hasMore).toBe(true);
    expect(body.scores).toHaveLength(2);
    expect(body.scores[0].title).toBe("Mission A");
    expect(body.scores[1].title).toBe("Mission B");
    expect(body.scores.every((s) => s.qualityScore === 90)).toBe(true);
  });

  it("returns 404 when project/id do not match any mission", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => null },
      text: async () => JSON.stringify(SAMPLE_INDEX),
    });

    const res = await handler(
      makeNetlifyRequest(API_MISSIONS_SCORES, { search: "project=missing&id=nope" }),
    );
    expect(res.status).toBe(404);
    const body = await readJson<{ error: string }>(res);
    expect(body.error).toBe("KB mission not found");
  });

  it("returns 502 when upstream fetch fails without cache", async () => {
    fetchMock.mockRejectedValue(new Error("network failure"));
    const res = await handler(makeNetlifyRequest(API_MISSIONS_SCORES));
    expect(res.status).toBe(502);
    const body = await readJson<{ error: string }>(res);
    expect(body.error).toContain("upstream");
  });
});
