import { beforeEach, describe, expect, it, vi } from "vitest";

import gtagProxyHandler from "../gtag-proxy.mts";

describe("gtag-proxy", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  it("rejects disallowed origins", async () => {
    const response = await gtagProxyHandler(new Request("https://console.kubestellar.io/api/gtag?id=G-TEST", {
      headers: { Origin: "https://evil.com" },
    }));

    expect(response.status).toBe(403);
    expect(await response.text()).toBe("Forbidden");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("allows allowed referers when origin is absent", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response("gtag", {
      status: 200,
      headers: { "content-length": "4" },
    }));

    const response = await gtagProxyHandler(new Request("https://console.kubestellar.io/api/gtag?id=G-TEST", {
      headers: { Referer: "https://console.kubestellar.io/dashboard" },
    }));

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("gtag");
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
