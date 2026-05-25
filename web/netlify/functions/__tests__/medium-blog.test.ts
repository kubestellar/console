/**
 * Vitest unit tests for medium-blog.mts Netlify function (#15655, Part of #4189).
 *
 * Covers CORS origin handling, RSS parsing with CDATA, cutoff date filtering,
 * HTML stripping via DOMPurify, oversized response handling, and upstream
 * failure modes that currently return 502.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  readJson,
} from "./netlify-handler-helpers";

import handler, { MAX_RESPONSE_BYTES } from "../medium-blog.mts";

// Named constants for HTTP status codes to prevent magic numbers
const HTTP_STATUS_OK = 200;
const HTTP_STATUS_NO_CONTENT = 204;
const HTTP_STATUS_BAD_GATEWAY = 502;

/**
 * Oversized response test threshold: exactly one byte above the max so the test
 * continues to validate the intended boundary condition dynamically.
 */
const TEST_OVERSIZED_RESPONSE_BYTES = MAX_RESPONSE_BYTES + 1;

/** Allowed production origin for CORS echoing */
const PROD_ORIGIN = "https://console.kubestellar.io";

const mockFetch = vi.fn();

// ── Sample Data ──────────────────────────────────────────────────────────────

/** Builds a minimal RSS <item> block with CDATA wrapping (Medium's format) */
function buildRSSItem(opts: {
  title: string;
  link: string;
  pubDate: string;
  description?: string;
  contentEncoded?: string;
}): string {
  const descBlock = opts.description
    ? `<description><![CDATA[${opts.description}]]></description>`
    : "";
  const contentBlock = opts.contentEncoded
    ? `<content:encoded><![CDATA[${opts.contentEncoded}]]></content:encoded>`
    : "";
  return `<item>
    <title><![CDATA[${opts.title}]]></title>
    <link>${opts.link}</link>
    <pubDate>${opts.pubDate}</pubDate>
    ${descBlock}
    ${contentBlock}
  </item>`;
}

/** A valid RSS feed with recent posts (after CUTOFF_DATE 2026-04-07) */
const SAMPLE_RSS_FEED = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    ${buildRSSItem({
      title: "KubeStellar v1.0 Released",
      link: "https://medium.com/@kubestellar/v1-released",
      pubDate: "Tue, 15 Apr 2026 12:00:00 GMT",
      description: "<p>We are excited to announce the release of <b>KubeStellar v1.0</b>!</p>",
    })}
    ${buildRSSItem({
      title: "Multi-Cluster at Scale",
      link: "https://medium.com/@kubestellar/multi-cluster",
      pubDate: "Mon, 14 Apr 2026 10:00:00 GMT",
      contentEncoded: "<h2>Scaling Kubernetes</h2><p>Learn how to manage clusters at scale.</p>",
    })}
  </channel>
</rss>`;

/** An RSS feed where all items predate the cutoff */
const OLD_POSTS_RSS_FEED = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    ${buildRSSItem({
      title: "Ancient Post",
      link: "https://medium.com/@kubestellar/ancient",
      pubDate: "Mon, 01 Jan 2024 10:00:00 GMT",
      description: "This is very old.",
    })}
  </channel>
</rss>`;

/** An empty RSS feed with no <item> blocks */
const EMPTY_RSS_FEED = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel></channel></rss>`;

// ── Response Shapes ──────────────────────────────────────────────────────────

interface MediumSuccessResponse {
  posts: Array<{
    title: string;
    link: string;
    published: string;
    preview: string;
  }>;
  feedUrl: string;
  channelUrl: string;
}

interface MediumErrorResponse {
  error: string;
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("medium-blog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", mockFetch);
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe("CORS & Preflight", () => {
    it("returns 204 for OPTIONS preflight", async () => {
      const req = new Request("https://console.kubestellar.io/.netlify/functions/medium-blog", {
        method: "OPTIONS",
        headers: { Origin: PROD_ORIGIN },
      });
      const res = await handler(req);
      expect(res.status).toBe(HTTP_STATUS_NO_CONTENT);
      expect(res.headers.get("access-control-allow-methods")).toContain("GET");
      expect(res.headers.get("access-control-allow-methods")).toContain("OPTIONS");
    });

    it("echoes allowed origin in CORS response", async () => {
      mockFetch.mockResolvedValueOnce(
        new Response(SAMPLE_RSS_FEED, {
          status: 200,
          headers: { "content-length": String(SAMPLE_RSS_FEED.length) },
        })
      );

      const req = new Request("https://console.kubestellar.io/.netlify/functions/medium-blog", {
        method: "GET",
        headers: { Origin: PROD_ORIGIN },
      });
      const res = await handler(req);
      expect(res.status).toBe(HTTP_STATUS_OK);
      expect(res.headers.get("access-control-allow-origin")).toBe(PROD_ORIGIN);
    });

    it("falls back to default origin for disallowed origin", async () => {
      mockFetch.mockResolvedValueOnce(
        new Response(SAMPLE_RSS_FEED, {
          status: 200,
          headers: { "content-length": String(SAMPLE_RSS_FEED.length) },
        })
      );

      const req = new Request("https://console.kubestellar.io/.netlify/functions/medium-blog", {
        method: "GET",
        headers: { Origin: "https://evil.example.com" },
      });
      const res = await handler(req);
      expect(res.status).toBe(HTTP_STATUS_OK);
      expect(res.headers.get("access-control-allow-origin")).toBe(PROD_ORIGIN);
    });
  });

  describe("Success Path & Feed Parsing", () => {
    it("parses valid RSS feed with CDATA-wrapped titles and descriptions", async () => {
      mockFetch.mockResolvedValueOnce(
        new Response(SAMPLE_RSS_FEED, {
          status: 200,
          headers: { "content-length": String(SAMPLE_RSS_FEED.length) },
        })
      );

      const req = new Request("https://console.kubestellar.io/.netlify/functions/medium-blog", {
        method: "GET",
        headers: { Origin: PROD_ORIGIN },
      });
      const res = await handler(req);
      expect(res.status).toBe(HTTP_STATUS_OK);

      const body = await readJson<MediumSuccessResponse>(res);
      expect(body.posts).toHaveLength(2);
      expect(body.posts[0].title).toBe("KubeStellar v1.0 Released");
      expect(body.posts[0].link).toBe("https://medium.com/@kubestellar/v1-released");
      expect(body.feedUrl).toContain("medium.com/feed/@kubestellar");
      expect(body.channelUrl).toContain("medium.com/@kubestellar");
    });

    it("strips HTML tags from preview text", async () => {
      mockFetch.mockResolvedValueOnce(
        new Response(SAMPLE_RSS_FEED, {
          status: 200,
          headers: { "content-length": String(SAMPLE_RSS_FEED.length) },
        })
      );

      const req = new Request("https://console.kubestellar.io/.netlify/functions/medium-blog", {
        method: "GET",
        headers: { Origin: PROD_ORIGIN },
      });
      const res = await handler(req);
      expect(res.status).toBe(HTTP_STATUS_OK);
      const body = await readJson<MediumSuccessResponse>(res);

      // First post uses <description> with <p> and <b> tags
      expect(body.posts[0].preview).not.toContain("<p>");
      expect(body.posts[0].preview).not.toContain("<b>");
      expect(body.posts[0].preview).toContain("KubeStellar v1.0");

      // Second post uses <content:encoded> with <h2> and <p> tags
      expect(body.posts[1].preview).not.toContain("<h2>");
      expect(body.posts[1].preview).not.toContain("<p>");
      expect(body.posts[1].preview).toContain("Scaling Kubernetes");
    });

    it("filters out posts published before the cutoff date", async () => {
      mockFetch.mockResolvedValueOnce(
        new Response(OLD_POSTS_RSS_FEED, {
          status: 200,
          headers: { "content-length": String(OLD_POSTS_RSS_FEED.length) },
        })
      );

      const req = new Request("https://console.kubestellar.io/.netlify/functions/medium-blog", {
        method: "GET",
        headers: { Origin: PROD_ORIGIN },
      });
      const res = await handler(req);
      expect(res.status).toBe(HTTP_STATUS_OK);

      const body = await readJson<MediumSuccessResponse>(res);
      expect(body.posts).toHaveLength(0);
    });

    it("returns empty posts array when feed has no items", async () => {
      mockFetch.mockResolvedValueOnce(
        new Response(EMPTY_RSS_FEED, {
          status: 200,
          headers: { "content-length": String(EMPTY_RSS_FEED.length) },
        })
      );

      const req = new Request("https://console.kubestellar.io/.netlify/functions/medium-blog", {
        method: "GET",
        headers: { Origin: PROD_ORIGIN },
      });
      const res = await handler(req);
      expect(res.status).toBe(HTTP_STATUS_OK);

      const body = await readJson<MediumSuccessResponse>(res);
      expect(body.posts).toEqual([]);
    });
  });

  describe("Error Handling (502 Contracts)", () => {
    it("returns 502 when upstream returns 4xx status", async () => {
      mockFetch.mockResolvedValueOnce(
        new Response("", { status: 404, statusText: "Not Found" })
      );

      const req = new Request("https://console.kubestellar.io/.netlify/functions/medium-blog", {
        method: "GET",
        headers: { Origin: PROD_ORIGIN },
      });
      const res = await handler(req);
      expect(res.status).toBe(HTTP_STATUS_BAD_GATEWAY);

      const body = await readJson<MediumErrorResponse>(res);
      expect(body.error).toBe("upstream request failed");
    });

    it("returns 502 when upstream returns 5xx status", async () => {
      mockFetch.mockResolvedValueOnce(
        new Response("", { status: 503, statusText: "Service Unavailable" })
      );

      const req = new Request("https://console.kubestellar.io/.netlify/functions/medium-blog", {
        method: "GET",
        headers: { Origin: PROD_ORIGIN },
      });
      const res = await handler(req);
      expect(res.status).toBe(HTTP_STATUS_BAD_GATEWAY);

      const body = await readJson<MediumErrorResponse>(res);
      expect(body.error).toBe("upstream request failed");
    });

    it("returns 502 when content-length exceeds MAX_RESPONSE_BYTES", async () => {
      const oversizedLength = TEST_OVERSIZED_RESPONSE_BYTES;
      mockFetch.mockResolvedValueOnce(
        new Response("x", {
          status: 200,
          headers: { "content-length": String(oversizedLength) },
        })
      );

      const req = new Request("https://console.kubestellar.io/.netlify/functions/medium-blog", {
        method: "GET",
        headers: { Origin: PROD_ORIGIN },
      });
      const res = await handler(req);
      expect(res.status).toBe(HTTP_STATUS_BAD_GATEWAY);

      const body = await readJson<MediumErrorResponse>(res);
      expect(body.error).toBe("upstream response too large");
    });

    it("returns 502 when response body exceeds MAX_RESPONSE_BYTES", async () => {
      const oversizedBody = "a".repeat(TEST_OVERSIZED_RESPONSE_BYTES);
      mockFetch.mockResolvedValueOnce(
        new Response(oversizedBody, {
          status: 200,
          headers: { "content-length": "0" },
        })
      );

      const req = new Request("https://console.kubestellar.io/.netlify/functions/medium-blog", {
        method: "GET",
        headers: { Origin: PROD_ORIGIN },
      });
      const res = await handler(req);
      expect(res.status).toBe(HTTP_STATUS_BAD_GATEWAY);

      const body = await readJson<MediumErrorResponse>(res);
      expect(body.error).toBe("upstream response too large");
    });

    it("returns 502 when network fetch throws an error", async () => {
      mockFetch.mockRejectedValueOnce(new Error("DNS resolution failed"));

      const req = new Request("https://console.kubestellar.io/.netlify/functions/medium-blog", {
        method: "GET",
        headers: { Origin: PROD_ORIGIN },
      });
      const res = await handler(req);
      expect(res.status).toBe(HTTP_STATUS_BAD_GATEWAY);

      const body = await readJson<MediumErrorResponse>(res);
      expect(body.error).toBe("Failed to fetch blog");
    });
  });

  describe("Response Headers", () => {
    it("includes Cache-Control public, max-age=3600 on success", async () => {
      mockFetch.mockResolvedValueOnce(
        new Response(SAMPLE_RSS_FEED, {
          status: 200,
          headers: { "content-length": String(SAMPLE_RSS_FEED.length) },
        })
      );

      const req = new Request("https://console.kubestellar.io/.netlify/functions/medium-blog", {
        method: "GET",
        headers: { Origin: PROD_ORIGIN },
      });
      const res = await handler(req);
      expect(res.status).toBe(HTTP_STATUS_OK);
      expect(res.headers.get("cache-control")).toBe("public, max-age=3600");
      expect(res.headers.get("content-type")).toBe("application/json");
    });
  });
});
