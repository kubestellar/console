// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockEnforceSimpleRateLimit } = vi.hoisted(() => ({
  mockEnforceSimpleRateLimit: vi.fn(),
}));

vi.mock("../_shared/rate-limit", () => ({
  enforceSimpleRateLimit: mockEnforceSimpleRateLimit,
}));

import analyticsHandler from "../analytics-collect.mts";

function makeAnalyticsRequest(options?: {
  method?: string;
  body?: string;
  contentLength?: string;
  searchParams?: URLSearchParams;
}): Request {
  const url = new URL("https://console.kubestellar.io/api/m");
  if (options?.searchParams) {
    url.search = options.searchParams.toString();
  }

  const headers = new Headers({ Origin: "http://localhost:5174" });
  if (options?.contentLength) {
    headers.set("content-length", options.contentLength);
  }

  return new Request(url, {
    method: options?.method ?? "GET",
    headers,
    body: options?.body,
  });
}

describe("analytics-collect", () => {
  beforeEach(() => {
    mockEnforceSimpleRateLimit.mockReset();
    mockEnforceSimpleRateLimit.mockResolvedValue({ limited: false });
    vi.stubGlobal("fetch", vi.fn());
    vi.stubGlobal("Netlify", { env: { get: vi.fn(() => "") } });
  });

  it("rejects requests whose declared body exceeds 64KB", async () => {
    const response = await analyticsHandler(makeAnalyticsRequest({
      method: "POST",
      contentLength: "65537",
      body: "ok",
    }));

    expect(response.status).toBe(413);
    expect(await response.text()).toBe("Payload too large");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects oversized encoded payloads before decoding", async () => {
    const response = await analyticsHandler(makeAnalyticsRequest({
      searchParams: new URLSearchParams({ d: "x".repeat(65537) }),
    }));

    expect(response.status).toBe(413);
    expect(await response.text()).toBe("Payload too large");
    expect(fetch).not.toHaveBeenCalled();
  });
});
