import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGet, mockSetJSON } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockSetJSON: vi.fn(),
}));

vi.mock("@netlify/blobs", () => ({
  getStore: () => ({ get: mockGet, setJSON: mockSetJSON }),
}));

import handler from "../missions-file.mts";

function makeRequest(path: string | null, ref?: string): Request {
  const params = new URLSearchParams();
  if (path !== null) params.set("path", path);
  if (ref) params.set("ref", ref);
  return new Request(`http://localhost:8888/.netlify/functions/missions-file?${params.toString()}`, {
    headers: { Origin: "http://localhost:5174" },
  });
}

describe("missions-file", () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockSetJSON.mockReset();
    mockGet.mockResolvedValue(null);
    mockSetJSON.mockResolvedValue(undefined);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => null },
      text: async () => '{"items":[]}',
    }));
  });

  it("rejects traversal-like path input", async () => {
    const cases = [
      "../fixes/index.json",
      "%2e%2e/fixes/index.json",
      "%252e%252e/fixes/index.json",
      "fixes/%2e%2e/index.json",
      "/fixes/index.json",
      "fixes/index.json#fragment",
      "fixes/index.json?raw=1",
      "%zz",
    ];

    for (const value of cases) {
      const response = await handler(makeRequest(value));
      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({ error: "invalid path" });
    }
  });

  it("rejects percent-encoded traversal variants", async () => {
    const cases = [
      "%2e%2e%2ffixes/index.json",
      "%2e%2efixes/index.json",
      "%252e%252e%252ffixes/index.json",
      "%2E%2E%2Ffixes/index.json",
      "%2e%2E%2ffixes/index.json",
      "fixes/%2e%2e/secret.json",
      "%2ffixes/index.json",
      "%2F/etc/passwd",
      "fixes/index.json%23fragment",
      "fixes/index.json%3fraw=1",
    ];

    for (const value of cases) {
      const response = await handler(makeRequest(value));
      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({ error: "invalid path" });
    }
  });

  it("rejects ref values that would change URL parsing", async () => {
    const cases = [
      "main#fragment",
      "main?raw=1",
      "../other-repo",
      "%2e%2e/other-repo",
      "%252e%252e/other-repo",
      "/etc/passwd",
      "%zz",
    ];

    for (const value of cases) {
      const response = await handler(makeRequest("fixes/index.json", value));
      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({ error: "invalid ref" });
    }
  });

  it("rejects percent-encoded traversal in ref values", async () => {
    const cases = [
      // Single-encoded ../
      "%2e%2e%2fother-repo",
      // Double-encoded ../
      "%252e%252e%252fother-repo",
      // Encoded leading /
      "%2fetc%2fpasswd",
      // Encoded hash
      "main%23fragment",
      // Encoded question mark
      "main%3fraw=1",
    ];

    for (const value of cases) {
      const response = await handler(makeRequest("fixes/index.json", value));
      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({ error: "invalid ref" });
    }
  });

  it("fetches and caches safe paths", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => null },
      text: async () => '{"items":[]}',
    });
    vi.stubGlobal("fetch", fetchSpy);

    const response = await handler(makeRequest("fixes/index.json", "main"));

    expect(response.status).toBe(200);
    expect(await response.text()).toBe('{"items":[]}');
    expect(fetchSpy).toHaveBeenCalledWith(
      "https://raw.githubusercontent.com/kubestellar/console-kb/main/fixes/index.json",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mockSetJSON).toHaveBeenCalledWith(
      "file:main:fixes/index.json",
      expect.objectContaining({
        body: '{"items":[]}',
        contentType: "application/json",
      }),
    );
  });
});

