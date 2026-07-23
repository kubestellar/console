// @vitest-environment node
/**
 * @vitest-environment node
 *
 * Unit tests for the Umami tracking-script Netlify proxy.
 *
 * Covers upstream success, upstream non-200 forwarding, oversized response
 * → 413, generic fetch errors → 502, and correct response headers.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import handler from "../umami-script.mts";

const UMAMI_URL = "https://analytics.kubestellar.io/ksc";
const MAX_SCRIPT_BYTES = 1_048_576;

const mockFetch = vi.fn<typeof globalThis.fetch>();

beforeEach(() => {
  vi.stubGlobal("fetch", mockFetch);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("umami-script", () => {
  it("forwards user-agent header to upstream", async () => {
    mockFetch.mockResolvedValueOnce(new Response("script body", { status: 200 }));
    await handler(
      new Request("https://console.kubestellar.io/api/ksc", {
        headers: { "user-agent": "CustomAgent/1.0" },
      }),
    );
    expect(mockFetch).toHaveBeenCalledWith(
      UMAMI_URL,
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    const opts = mockFetch.mock.calls[0]?.[1] as RequestInit | undefined;
    expect((opts?.headers as Record<string, string>)["User-Agent"]).toBe("CustomAgent/1.0");
  });

  it("forwards upstream non-OK status with empty body", async () => {
    mockFetch.mockResolvedValueOnce(new Response(null, { status: 503 }));
    const res = await handler(new Request("https://console.kubestellar.io/api/ksc"));
    expect(res.status).toBe(503);
    expect(await res.text()).toBe("");
  });

  it("returns 413 when upstream response exceeds the size cap", async () => {
    const oversized = new Response("tiny actual body", {
      status: 200,
      headers: { "content-length": String(MAX_SCRIPT_BYTES + 1) },
    });
    mockFetch.mockResolvedValueOnce(oversized);
    const res = await handler(new Request("https://console.kubestellar.io/api/ksc"));
    expect(res.status).toBe(413);
  });

  it("returns 502 when fetch throws a non-size error", async () => {
    mockFetch.mockRejectedValueOnce(new Error("network boom"));
    const res = await handler(new Request("https://console.kubestellar.io/api/ksc"));
    expect(res.status).toBe(502);
  });

  it("happy path returns script with cache and nosniff headers", async () => {
    const body = "(function(){/* umami */})()";
    mockFetch.mockResolvedValueOnce(new Response(body, { status: 200 }));
    const res = await handler(new Request("https://console.kubestellar.io/api/ksc"));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/javascript; charset=utf-8");
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=3600");
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(await res.text()).toBe(body);
  });
});
