// @vitest-environment node
/**
 * Tests for sitemap.ts edge function.
 *
 * Verifies the XML structure, content-type, caching headers, and that
 * all expected public routes are present in the sitemap output.
 */
import { describe, expect, it } from "vitest";

import handler, { config } from "../sitemap.ts";

describe("sitemap.xml edge function", () => {
  it("exports config with path /sitemap.xml", () => {
    expect(config.path).toBe("/sitemap.xml");
  });

  it("returns a 200 response", async () => {
    const res = await handler();
    expect(res.status).toBe(200);
  });

  it("returns application/xml content-type", async () => {
    const res = await handler();
    expect(res.headers.get("content-type")).toBe(
      "application/xml; charset=utf-8",
    );
  });

  it("sets cache-control header for 24h", async () => {
    const res = await handler();
    const cacheControl = res.headers.get("cache-control");
    expect(cacheControl).toContain("public");
    expect(cacheControl).toContain("max-age=86400");
  });

  it("returns valid XML with urlset root element", async () => {
    const res = await handler();
    const body = await res.text();
    expect(body).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(body).toContain(
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    );
    expect(body).toContain("</urlset>");
  });

  it("includes all high-priority routes", async () => {
    const res = await handler();
    const body = await res.text();
    const highPriorityRoutes = [
      "/",
      "/clusters",
      "/workloads",
      "/missions",
      "/deploy",
      "/gpu-reservations",
      "/security",
    ];
    for (const route of highPriorityRoutes) {
      expect(body).toContain(
        `<loc>https://console.kubestellar.io${route}</loc>`,
      );
    }
  });

  it("includes lastmod with today's date in ISO format", async () => {
    const res = await handler();
    const body = await res.text();
    const today = new Date().toISOString().split("T")[0];
    expect(body).toContain(`<lastmod>${today}</lastmod>`);
  });

  it("includes changefreq and priority for each URL entry", async () => {
    const res = await handler();
    const body = await res.text();
    // The root entry has priority 1.0 and daily changefreq
    expect(body).toContain("<priority>1.0</priority>");
    expect(body).toContain("<changefreq>daily</changefreq>");
    // Arcade has monthly and low priority
    expect(body).toContain("<changefreq>monthly</changefreq>");
    expect(body).toContain("<priority>0.3</priority>");
  });

  it("each <url> block has loc, lastmod, changefreq, priority", async () => {
    const res = await handler();
    const body = await res.text();
    // Extract all <url> blocks
    const urlBlocks = body.match(/<url>[\s\S]*?<\/url>/g) || [];
    expect(urlBlocks.length).toBeGreaterThan(0);
    for (const block of urlBlocks) {
      expect(block).toMatch(/<loc>.+<\/loc>/);
      expect(block).toMatch(/<lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>/);
      expect(block).toMatch(/<changefreq>\w+<\/changefreq>/);
      expect(block).toMatch(/<priority>[\d.]+<\/priority>/);
    }
  });

  it("contains expected number of URL entries (29 routes)", async () => {
    const res = await handler();
    const body = await res.text();
    const urlBlocks = body.match(/<url>/g) || [];
    expect(urlBlocks.length).toBe(29);
  });
});
