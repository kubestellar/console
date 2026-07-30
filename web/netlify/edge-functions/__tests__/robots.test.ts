// @vitest-environment node
/**
 * Tests for robots.ts edge function.
 *
 * Verifies the response shape, content-type, cache headers, and that
 * allowed/disallowed routes match the expected SEO configuration.
 */
import { describe, expect, it } from "vitest";

// The edge function exports a default handler and a config object.
// We import them directly since they are pure functions returning Response objects.
import handler, { config } from "../robots.ts";

describe("robots.txt edge function", () => {
  it("exports config with path /robots.txt", () => {
    expect(config.path).toBe("/robots.txt");
  });

  it("returns a 200 response", async () => {
    const res = await handler();
    expect(res.status).toBe(200);
  });

  it("returns text/plain content-type", async () => {
    const res = await handler();
    expect(res.headers.get("content-type")).toBe(
      "text/plain; charset=utf-8",
    );
  });

  it("sets cache-control header for 24h", async () => {
    const res = await handler();
    const cacheControl = res.headers.get("cache-control");
    expect(cacheControl).toContain("public");
    expect(cacheControl).toContain("max-age=86400");
  });

  it("allows crawling of public routes", async () => {
    const res = await handler();
    const body = await res.text();
    expect(body).toContain("Allow: /");
    expect(body).toContain("Allow: /clusters");
    expect(body).toContain("Allow: /workloads");
    expect(body).toContain("Allow: /missions");
  });

  it("blocks internal routes from indexing", async () => {
    const res = await handler();
    const body = await res.text();
    expect(body).toContain("Disallow: /api/");
    expect(body).toContain("Disallow: /login");
    expect(body).toContain("Disallow: /auth/");
    expect(body).toContain("Disallow: /settings");
  });

  it("includes sitemap reference", async () => {
    const res = await handler();
    const body = await res.text();
    expect(body).toContain(
      "Sitemap: https://console.kubestellar.io/sitemap.xml",
    );
  });

  it("targets all user agents", async () => {
    const res = await handler();
    const body = await res.text();
    expect(body).toContain("User-agent: *");
  });
});
