/**
 * Unit tests for the ACMM badge Netlify function.
 *
 * Mocks Netlify Blobs and global fetch so we can exercise every code path
 * without network access.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock @netlify/blobs ─────────────────────────────────────────────────
const mockGet = vi.fn();
const mockSetJSON = vi.fn();
vi.mock("@netlify/blobs", () => ({
  getStore: () => ({ get: mockGet, setJSON: mockSetJSON }),
}));

// ── Mock the shared ACMM module ─────────────────────────────────────────
vi.mock("../../../src/lib/acmm/scannableIdsByLevel", () => ({
  SCANNABLE_IDS_BY_LEVEL: {
    2: ["acmm:agent-instructions", "acmm:claude-md"],
    3: ["acmm:ci-matrix"],
    4: ["acmm:security-ai-md"],
    5: ["acmm:policy-as-code"],
    6: ["acmm:merge-queue"],
  },
  AGENT_INSTRUCTION_FILE_IDS: new Set(["acmm:claude-md"]),
}));

// Import the handler after mocks are set up
import handler from "../acmm-badge.mts";

// ── Helpers ─────────────────────────────────────────────────────────────
function makeRequest(repo: string, extra?: { origin?: string; force?: boolean }): Request {
  const params = new URLSearchParams();
  if (repo) params.set("repo", repo);
  if (extra?.force) params.set("force", "true");
  const url = `https://console.kubestellar.io/api/acmm/badge?${params}`;
  return new Request(url, {
    headers: extra?.origin ? { Origin: extra.origin } : {},
  });
}

async function json(res: Response) {
  return res.json();
}

function freshBlobEntry(detectedIds: string[] = ["acmm:claude-md", "acmm:ci-matrix"]) {
  return {
    scannedAt: new Date().toISOString(),
    detectedIds,
  };
}

function staleBlobEntry(detectedIds: string[] = ["acmm:claude-md"]) {
  return {
    scannedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2 hours ago
    detectedIds,
  };
}

// ── Tests ───────────────────────────────────────────────────────────────
describe("acmm-badge", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockGet.mockReset();
    mockSetJSON.mockReset();
    // Default: no blob data, all fetches fail
    mockGet.mockResolvedValue(null);
    mockSetJSON.mockResolvedValue(undefined);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network")));
  });

  // 1. Happy path — returns valid shields.io JSON
  it("returns valid shields.io JSON with schemaVersion, label, message, color", async () => {
    mockGet.mockResolvedValue(freshBlobEntry(["acmm:claude-md", "acmm:ci-matrix"]));

    const res = await handler(makeRequest("owner/repo"));
    expect(res.status).toBe(200);

    const body = await json(res);
    expect(body).toMatchObject({
      schemaVersion: 1,
      label: "ACMM",
      color: expect.any(String),
      namedLogo: "github",
    });
    expect(body.message).toMatch(/^L\d+ · .+ · \d+\/\d+$/);
  });

  // 2. Blobs cache hit — returns cached badge without calling scan endpoint
  it("returns cached badge from Blobs without calling scan endpoint", async () => {
    mockGet.mockResolvedValue(freshBlobEntry());
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const res = await handler(makeRequest("owner/repo"));
    expect(res.status).toBe(200);
    // fetch should never have been called — Blobs were fresh
    expect(fetchSpy).not.toHaveBeenCalled();

    const body = await json(res);
    expect(body.schemaVersion).toBe(1);
  });

  // 3. Blobs miss + scan success — calls scan, returns badge, stores in Blobs
  it("calls scan endpoint on Blobs miss and stores result", async () => {
    mockGet.mockResolvedValue(null);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({ detectedIds: ["acmm:claude-md"] }),
      }),
    );

    const res = await handler(makeRequest("owner/repo"));
    expect(res.status).toBe(200);

    const body = await json(res);
    expect(body.label).toBe("ACMM");
    expect(body.message).toContain("L");

    // Should have written to Blobs
    // Give the fire-and-forget writeBlobCache a tick to execute
    await new Promise((r) => setTimeout(r, 10));
    expect(mockSetJSON).toHaveBeenCalled();
  });

  // 4. Blobs miss + scan fail + direct GitHub success — fallback path works
  it("falls back to direct GitHub when scan endpoint fails", async () => {
    mockGet.mockResolvedValue(null);
    const fetchMock = vi
      .fn()
      // scan endpoint fails
      .mockRejectedValueOnce(new Error("scan timeout"))
      // direct GitHub: repo info
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ default_branch: "main" }),
      })
      // direct GitHub: tree
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          tree: [
            { path: "CLAUDE.md" },
            { path: ".github/workflows/ci.yml" },
          ],
        }),
      });
    vi.stubGlobal("fetch", fetchMock);

    const res = await handler(makeRequest("owner/repo"));
    expect(res.status).toBe(200);

    const body = await json(res);
    expect(body.label).toBe("ACMM");
    expect(body.message).toContain("L");
    // Should have attempted all three fetch calls
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  // 5. All paths fail — returns "unavailable" badge with status 200
  it("returns 'unavailable' badge with status 200 when all paths fail", async () => {
    mockGet.mockResolvedValue(null);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network")));

    const res = await handler(makeRequest("owner/repo"));
    expect(res.status).toBe(200);

    const body = await json(res);
    expect(body).toMatchObject({
      schemaVersion: 1,
      label: "ACMM",
      message: "unavailable",
      color: "lightgrey",
    });
  });

  // 6. cacheSeconds value — 900 in success response, 300 in error
  it("uses cacheSeconds=900 for success and 300 for errors", async () => {
    // Success path
    mockGet.mockResolvedValue(freshBlobEntry());
    const successRes = await handler(makeRequest("owner/repo"));
    const successBody = await json(successRes);
    expect(successBody.cacheSeconds).toBe(900);

    // Error path (all fail → unavailable)
    mockGet.mockResolvedValue(null);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network")));
    const errorRes = await handler(makeRequest("other/repo"));
    const errorBody = await json(errorRes);
    expect(errorBody.cacheSeconds).toBe(300);
  });

  // 7. CORS headers — Access-Control-Allow-Origin: * present
  it("includes CORS Access-Control-Allow-Origin header", async () => {
    mockGet.mockResolvedValue(freshBlobEntry());
    const res = await handler(makeRequest("owner/repo"));
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");

    // Also check with a kubestellar origin
    const res2 = await handler(
      makeRequest("owner/repo", { origin: "https://console.kubestellar.io" }),
    );
    expect(res2.headers.get("Access-Control-Allow-Origin")).toBe(
      "https://console.kubestellar.io",
    );
  });

  // 8. Invalid repo — returns "invalid repo" badge (not HTTP error)
  it("returns 'invalid repo' badge for malformed repo param", async () => {
    const res = await handler(makeRequest("not a valid repo!!!"));
    expect(res.status).toBe(200);

    const body = await json(res);
    expect(body).toMatchObject({
      schemaVersion: 1,
      label: "ACMM",
      message: "invalid repo",
      color: "red",
      cacheSeconds: 300,
    });
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });
});
