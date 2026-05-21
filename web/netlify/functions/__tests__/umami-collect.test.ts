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
}): Request {
  const headers = new Headers({ Origin: "http://localhost:5174", "Content-Type": "application/json" });
  if (options?.contentLength) {
    headers.set("content-length", options.contentLength);
  }

  return new Request("https://console.kubestellar.io/api/send", {
    method: "POST",
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
