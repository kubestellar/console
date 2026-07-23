// @vitest-environment node
/**
 * @vitest-environment node
 *
 * Unit tests for the GA4 gtag.js Netlify proxy.
 *
 * Verifies query-string forwarding, size caps (both content-length header
 * and actual body length), upstream failure handling, and success headers.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import handler from "../gtag-proxy.mts";

const GTAG_BASE_URL = "https://www.googletagmanager.com/gtag/js";
const MAX_RESPONSE_BYTES = 512_000;

const mockFetch = vi.fn<typeof globalThis.fetch>();

beforeEach(() => {
  vi.stubGlobal("fetch", mockFetch);
});

afterEach(() => {
  vi.restoreAllMocks();
});

function textResponse(body: string, init?: ResponseInit): Response {
  return new Response(body, init);
}

describe("gtag-proxy", () => {
  it("forwards query string to Google Tag Manager", async () => {
    mockFetch.mockResolvedValueOnce(textResponse("gtag_body", { status: 200 }));
    await handler(new Request("https://console.kubestellar.io/api/gtag?id=G-ABC123"));
    expect(mockFetch).toHaveBeenCalledWith(
      `${GTAG_BASE_URL}?id=G-ABC123`,
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it("passes an empty query string when none is present", async () => {
    mockFetch.mockResolvedValueOnce(textResponse("gtag_body", { status: 200 }));
    await handler(new Request("https://console.kubestellar.io/api/gtag"));
    expect(mockFetch).toHaveBeenCalledWith(
      GTAG_BASE_URL,
      expect.any(Object),
    );
  });

  it("forwards user-agent header from the incoming request", async () => {
    mockFetch.mockResolvedValueOnce(textResponse("gtag_body", { status: 200 }));
    await handler(
      new Request("https://console.kubestellar.io/api/gtag", {
        headers: { "user-agent": "Mozilla/5.0 test" },
      }),
    );
    const call = mockFetch.mock.calls[0]?.[1] as RequestInit | undefined;
    expect((call?.headers as Record<string, string>)["User-Agent"]).toBe("Mozilla/5.0 test");
  });

  it("forwards upstream non-200 status with empty body", async () => {
    mockFetch.mockResolvedValueOnce(new Response(null, { status: 429 }));
    const res = await handler(new Request("https://console.kubestellar.io/api/gtag"));
    expect(res.status).toBe(429);
    expect(await res.text()).toBe("");
  });

  it("returns 502 when content-length header exceeds the cap", async () => {
    mockFetch.mockResolvedValueOnce(
      textResponse("small body", {
        status: 200,
        headers: { "content-length": String(MAX_RESPONSE_BYTES + 1) },
      }),
    );
    const res = await handler(new Request("https://console.kubestellar.io/api/gtag"));
    expect(res.status).toBe(502);
    expect(await res.text()).toBe("Upstream response too large");
  });

  it("returns 502 when the body itself exceeds the cap (no content-length header)", async () => {
    const oversized = "x".repeat(MAX_RESPONSE_BYTES + 1);
    mockFetch.mockResolvedValueOnce(textResponse(oversized, { status: 200 }));
    const res = await handler(new Request("https://console.kubestellar.io/api/gtag"));
    expect(res.status).toBe(502);
    expect(await res.text()).toBe("Upstream response too large");
  });

  it("returns 502 when fetch throws", async () => {
    mockFetch.mockRejectedValueOnce(new Error("network boom"));
    const res = await handler(new Request("https://console.kubestellar.io/api/gtag"));
    expect(res.status).toBe(502);
  });

  it("happy path returns js content-type, cache header, and nosniff", async () => {
    const body = "console.log('ok')";
    mockFetch.mockResolvedValueOnce(textResponse(body, { status: 200 }));
    const res = await handler(new Request("https://console.kubestellar.io/api/gtag?id=G-X"));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/javascript; charset=utf-8");
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=3600");
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(await res.text()).toBe(body);
  });
});
