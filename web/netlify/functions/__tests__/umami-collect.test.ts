import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockEnforceSimpleRateLimit } = vi.hoisted(() => ({
  mockEnforceSimpleRateLimit: vi.fn(),
}));

vi.mock("../_shared/rate-limit", () => ({
  enforceSimpleRateLimit: mockEnforceSimpleRateLimit,
}));

import umamiHandler from "../umami-collect.mts";

function makeRequest(options?: {
  body?: string;
  contentLength?: string;
  method?: string;
  origin?: string | null;
  referer?: string | null;
}): Request {
  const headers = new Headers({ "Content-Type": "application/json" });
  if (options?.origin !== null) {
    headers.set("Origin", options?.origin ?? "http://localhost:5174");
  }
  if (options?.referer !== null && options?.referer !== undefined) {
    headers.set("Referer", options.referer);
  }
  if (options?.contentLength) {
    headers.set("content-length", options.contentLength);
  }

  return new Request("https://console.kubestellar.io/api/send", {
    method: options?.method ?? "POST",
    headers,
    body: options?.body ?? "{}",
  });
}

describe("umami-collect", () => {
  beforeEach(() => {
    mockEnforceSimpleRateLimit.mockReset();
    mockEnforceSimpleRateLimit.mockResolvedValue({ limited: false });
    vi.stubGlobal("fetch", vi.fn());
  });

  it("rejects requests without a trusted origin or referer", async () => {
    const response = await umamiHandler(makeRequest({ origin: null, referer: null }));

    expect(response.status).toBe(403);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects attacker-controlled netlify referers", async () => {
    const response = await umamiHandler(makeRequest({
      origin: null,
      referer: "https://evil.netlify.app/",
    }));

    expect(response.status).toBe(403);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("allows trusted referer fallback for console previews", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 204 })));

    const response = await umamiHandler(makeRequest({
      origin: null,
      referer: "https://deploy-preview-42--kubestellar-console.netlify.app/path",
    }));

    expect(response.status).toBe(204);
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("rejects non-POST methods", async () => {
    const response = await umamiHandler(makeRequest({ method: "GET" }));

    expect(response.status).toBe(405);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON payloads", async () => {
    const response = await umamiHandler(makeRequest({ body: "not-json" }));

    expect(response.status).toBe(400);
    expect(await response.text()).toBe("Bad payload");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects requests whose declared body exceeds 64KB", async () => {
    const response = await umamiHandler(makeRequest({
      contentLength: "65537",
      body: "{}",
    }));

    expect(response.status).toBe(413);
    expect(await response.text()).toBe("Payload too large");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects oversized request bodies after reading them", async () => {
    const response = await umamiHandler(makeRequest({
      body: "x".repeat(65537),
      contentLength: "1",
    }));

    expect(response.status).toBe(413);
    expect(await response.text()).toBe("Payload too large");
    expect(fetch).not.toHaveBeenCalled();
  });
});
