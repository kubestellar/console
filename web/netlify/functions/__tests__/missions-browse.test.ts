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

const { mockGet, mockSetJSON } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockSetJSON: vi.fn(),
}));

vi.mock("@netlify/blobs", () => ({
  getStore: () => ({ get: mockGet, setJSON: mockSetJSON }),
}));

import handler from "../missions-browse.mts";

const API_MISSIONS_BROWSE = "/api/missions/browse";

function makeBrowseRequest(search = ""): Request {
  return makeNetlifyRequest(API_MISSIONS_BROWSE, { search });
}

describe("missions-browse", () => {
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

  it("returns 400 for invalid path query", async () => {
    const res = await handler(makeBrowseRequest("path=../secrets"));
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
    mockGet.mockResolvedValue({ body: cachedBody, fetchedAt: Date.now() });

    const res = await handler(makeBrowseRequest("path=fixes"));
    expect(res.status).toBe(200);
    expect(res.headers.get("X-Cache")).toBe("HIT");
    expect(fetchMock).not.toHaveBeenCalled();
    const body = await readJson(res);
    expect(body).toEqual([{ name: "cached", path: "fixes/cached", type: "file", size: 1 }]);
  });

  it("returns 502 when upstream fails and no cache exists", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500, headers: { get: () => null }, text: async () => "error" });
    const res = await handler(makeBrowseRequest("path=fixes"));
    expect(res.status).toBe(502);
    const body = await readJson<{ error: string; code?: string }>(res);
    expect(body.error).toContain("upstream");
  });
});
