import { afterEach, describe, expect, it, vi } from "vitest";
import { wrapIdentityDemoResponse } from "../identity-demo-request";

const TEST_URL = "https://example.test/api/identity";
const ALLOWED_ORIGIN = "http://localhost:5174";

describe("identity demo request wrapper", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("handles preflight requests with allowed CORS headers", async () => {
    const response = await wrapIdentityDemoResponse(new Request(TEST_URL, {
      method: "OPTIONS",
      headers: { Origin: ALLOWED_ORIGIN },
    }), { ok: true });

    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe(ALLOWED_ORIGIN);
    expect(response.headers.get("access-control-allow-methods")).toBe("GET, OPTIONS");
  });

  it("rejects unsupported methods and invalid cluster parameters", async () => {
    const postResponse = await wrapIdentityDemoResponse(new Request(TEST_URL, {
      method: "POST",
      headers: { Origin: ALLOWED_ORIGIN },
    }), { ok: true });
    expect(postResponse.status).toBe(405);
    expect(postResponse.headers.get("allow")).toBe("GET, OPTIONS");
    await expect(postResponse.json()).resolves.toEqual({ error: "Method not allowed" });

    const badClusterResponse = await wrapIdentityDemoResponse(new Request(`${TEST_URL}?cluster=bad/value`, {
      headers: { Origin: ALLOWED_ORIGIN },
    }), { ok: true });
    expect(badClusterResponse.status).toBe(400);
    await expect(badClusterResponse.json()).resolves.toEqual({ error: "Invalid cluster parameter" });
  });

  it("returns JSON for valid GET requests and falls back on serialization errors", async () => {
    const okResponse = await wrapIdentityDemoResponse(new Request(`${TEST_URL}?cluster=prod-cluster_1`, {
      headers: { Origin: ALLOWED_ORIGIN },
    }), { clusters: ["prod-cluster_1"] });
    expect(okResponse.status).toBe(200);
    await expect(okResponse.json()).resolves.toEqual({ clusters: ["prod-cluster_1"] });

    const circular: Record<string, unknown> = {};
    circular.self = circular;
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const fallbackResponse = await wrapIdentityDemoResponse(new Request(TEST_URL, {
      headers: { Origin: ALLOWED_ORIGIN },
    }), circular);

    expect(fallbackResponse.status).toBe(502);
    expect(await fallbackResponse.text()).toBe('{"error":"Identity data temporarily unavailable"}');
    expect(errorSpy).toHaveBeenCalledOnce();
  });
});
