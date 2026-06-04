// @vitest-environment node
/**
 * @vitest-environment node
 *
 * Vitest unit tests for youtube-playlist.mts Netlify function (#15655, Part of #4189).
 *
 * Covers Invidious API primary path, RSS fallback, feed parsing,
 * oversized response handling, and upstream failure modes.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  makeNetlifyRequest,
  readJson,
} from "./netlify-handler-helpers";

import handler, { MAX_RESPONSE_BYTES } from "../youtube-playlist.mts";

// Named constants for HTTP status codes to prevent magic numbers
const HTTP_STATUS_OK = 200;
const HTTP_STATUS_NO_CONTENT = 204;
const HTTP_STATUS_FORBIDDEN = 403;
const HTTP_STATUS_BAD_GATEWAY = 502;

/**
 * @vitest-environment node
 *
 * Oversized response test threshold: exactly one byte above the max so the test
 * continues to validate the intended boundary condition dynamically.
 */
const TEST_OVERSIZED_RESPONSE_BYTES = MAX_RESPONSE_BYTES + 1;

const mockFetch = vi.fn();

// ── Sample Data ──────────────────────────────────────────────────────────────

/**
 * @vitest-environment node
 * Simulates a valid Invidious API JSON response */
const SAMPLE_INVIDIOUS_RESPONSE = {
  videos: [
    { videoId: "abc123", title: "Getting Started with KubeStellar" },
    { videoId: "def456", title: "KubeStellar Architecture Deep Dive" },
  ],
};

/**
 * @vitest-environment node
 * Simulates a valid YouTube Atom RSS feed with <entry> blocks */
const SAMPLE_ATOM_FEED = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns:yt="http://www.youtube.com/xml/schemas/2015"
      xmlns:media="http://search.yahoo.com/mrss/">
  <entry>
    <yt:videoId>rss001</yt:videoId>
    <title>KubeStellar Demo</title>
    <media:description>A demo video</media:description>
    <published>2026-05-20T10:00:00Z</published>
  </entry>
  <entry>
    <yt:videoId>rss002</yt:videoId>
    <title>KubeStellar Tutorial</title>
    <published>2026-05-21T10:00:00Z</published>
  </entry>
</feed>`;

/**
 * @vitest-environment node
 * Atom feed with no <entry> blocks */
const EMPTY_ATOM_FEED = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns:yt="http://www.youtube.com/xml/schemas/2015"></feed>`;

// ── Response Shapes ──────────────────────────────────────────────────────────

interface PlaylistSuccessResponse {
  videos: Array<{ id: string; title: string; description?: string; published?: string }>;
  playlistId: string;
  playlistUrl: string;
}

interface PlaylistErrorResponse {
  error: string;
  videos?: unknown[];
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("youtube-playlist", () => {
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
    it("returns 204 for OPTIONS preflight from allowed origin", async () => {
      const req = makeNetlifyRequest("/.netlify/functions/youtube-playlist", {
        method: "OPTIONS",
      });
      const res = await handler(req);
      expect(res.status).toBe(HTTP_STATUS_NO_CONTENT);
    });

    it("returns 403 for OPTIONS preflight from disallowed origin", async () => {
      const req = makeNetlifyRequest("/.netlify/functions/youtube-playlist", {
        method: "OPTIONS",
        origin: "https://evil.example.com",
      });
      const res = await handler(req);
      expect(res.status).toBe(HTTP_STATUS_FORBIDDEN);
    });
  });

  describe("Invidious API Primary Path", () => {
    it("returns videos from the first successful Invidious instance", async () => {
      mockFetch.mockImplementation(async (input) => {
        const url = typeof input === "string" ? input : (input as Request).url || input.toString();
        if (url.includes("/api/v1/playlists/")) {
          return new Response(JSON.stringify(SAMPLE_INVIDIOUS_RESPONSE), {
            status: 200,
            headers: { "content-length": "200" },
          });
        }
        return new Response("", { status: 404 });
      });

      const req = makeNetlifyRequest("/.netlify/functions/youtube-playlist");
      const res = await handler(req);
      expect(res.status).toBe(HTTP_STATUS_OK);

      const body = await readJson<PlaylistSuccessResponse>(res);
      expect(body.videos).toHaveLength(2);
      expect(body.videos[0].id).toBe("abc123");
      expect(body.videos[0].title).toBe("Getting Started with KubeStellar");
      expect(body.videos[1].id).toBe("def456");
      expect(body.playlistId).toBeTruthy();
      expect(body.playlistUrl).toContain("youtube.com/playlist");
    });

    it("skips Invidious instance with empty videos array and falls back", async () => {
      mockFetch.mockImplementation(async (input) => {
        const url = typeof input === "string" ? input : (input as Request).url || input.toString();
        if (url.includes("/api/v1/playlists/")) {
          return new Response(JSON.stringify({ videos: [] }), {
            status: 200,
            headers: { "content-length": "20" },
          });
        }
        if (url.includes("/feeds/videos.xml")) {
          return new Response(SAMPLE_ATOM_FEED, {
            status: 200,
            headers: { "content-length": String(SAMPLE_ATOM_FEED.length) },
          });
        }
        return new Response("", { status: 404 });
      });

      const req = makeNetlifyRequest("/.netlify/functions/youtube-playlist");
      const res = await handler(req);
      expect(res.status).toBe(HTTP_STATUS_OK);

      const body = await readJson<PlaylistSuccessResponse>(res);
      expect(body.videos).toHaveLength(2);
      expect(body.videos[0].id).toBe("rss001");
      expect(body.videos[0].title).toBe("KubeStellar Demo");
    });

    it("skips Invidious instances with oversized content-length", async () => {
      mockFetch.mockImplementation(async (input) => {
        const url = typeof input === "string" ? input : (input as Request).url || input.toString();
        if (url.includes("/api/v1/playlists/")) {
          return new Response(JSON.stringify(SAMPLE_INVIDIOUS_RESPONSE), {
            status: 200,
            headers: { "content-length": String(TEST_OVERSIZED_RESPONSE_BYTES) },
          });
        }
        if (url.includes("/feeds/videos.xml")) {
          return new Response(SAMPLE_ATOM_FEED, {
            status: 200,
            headers: { "content-length": String(SAMPLE_ATOM_FEED.length) },
          });
        }
        return new Response("", { status: 404 });
      });

      const req = makeNetlifyRequest("/.netlify/functions/youtube-playlist");
      const res = await handler(req);
      expect(res.status).toBe(HTTP_STATUS_OK);

      const body = await readJson<PlaylistSuccessResponse>(res);
      expect(body.videos[0].id).toBe("rss001");
    });
  });

  describe("RSS Feed Fallback Path", () => {
    /** Helper: make all Invidious instance calls fail, then return specific RSS response */
    function mockAllInvidiousFailed(rssResponse?: Response): void {
      mockFetch.mockImplementation(async (input) => {
        const url = typeof input === "string" ? input : (input as Request).url || input.toString();
        if (url.includes("/api/v1/playlists/")) {
          throw new Error("Invidious timeout");
        }
        if (url.includes("/feeds/videos.xml")) {
          return rssResponse || new Response(SAMPLE_ATOM_FEED, {
            status: 200,
            headers: { "content-length": String(SAMPLE_ATOM_FEED.length) },
          });
        }
        return new Response("", { status: 404 });
      });
    }

    it("parses Atom feed entries with description and published fields", async () => {
      mockAllInvidiousFailed();

      const req = makeNetlifyRequest("/.netlify/functions/youtube-playlist");
      const res = await handler(req);
      expect(res.status).toBe(HTTP_STATUS_OK);

      const body = await readJson<PlaylistSuccessResponse>(res);
      expect(body.videos).toHaveLength(2);
      expect(body.videos[0].id).toBe("rss001");
      expect(body.videos[0].title).toBe("KubeStellar Demo");
      expect(body.videos[0].description).toBe("A demo video");
      expect(body.videos[0].published).toBe("2026-05-20T10:00:00Z");
      // Second entry has no media:description → undefined
      expect(body.videos[1].description).toBeUndefined();
    });

    it("returns 502 with empty videos array when RSS feed has no entries", async () => {
      mockAllInvidiousFailed(
        new Response(EMPTY_ATOM_FEED, {
          status: 200,
          headers: { "content-length": String(EMPTY_ATOM_FEED.length) },
        })
      );

      const req = makeNetlifyRequest("/.netlify/functions/youtube-playlist");
      const res = await handler(req);
      expect(res.status).toBe(HTTP_STATUS_BAD_GATEWAY);

      const body = await readJson<PlaylistErrorResponse>(res);
      expect(body.error).toBe("All video sources unavailable");
      expect(body.videos).toEqual([]);
    });

    it("returns 502 when RSS upstream returns non-ok status", async () => {
      mockAllInvidiousFailed(
        new Response("", { status: 500, statusText: "Internal Server Error" })
      );

      const req = makeNetlifyRequest("/.netlify/functions/youtube-playlist");
      const res = await handler(req);
      expect(res.status).toBe(HTTP_STATUS_BAD_GATEWAY);

      const body = await readJson<PlaylistErrorResponse>(res);
      expect(body.error).toBe("All video sources unavailable");
    });

    it("returns 502 when RSS response body exceeds size limit", async () => {
      mockAllInvidiousFailed(
        new Response("x".repeat(1000), {
          status: 200,
          headers: { "content-length": String(TEST_OVERSIZED_RESPONSE_BYTES) },
        })
      );

      const req = makeNetlifyRequest("/.netlify/functions/youtube-playlist");
      const res = await handler(req);
      expect(res.status).toBe(HTTP_STATUS_BAD_GATEWAY);

      const body = await readJson<PlaylistErrorResponse>(res);
      expect(body.error).toBe("Upstream response too large");
      expect(body.videos).toEqual([]);
    });
  });

  describe("Error Handling", () => {
    it("returns 502 when all fetch sources throw network errors", async () => {
      // 3 Invidious + 1 RSS all fail
      mockFetch.mockRejectedValue(new Error("Network unreachable"));

      const req = makeNetlifyRequest("/.netlify/functions/youtube-playlist");
      const res = await handler(req);
      expect(res.status).toBe(HTTP_STATUS_BAD_GATEWAY);

      const body = await readJson<PlaylistErrorResponse>(res);
      expect(body.error).toBe("Internal server error");
    });
  });

  describe("Response Headers", () => {
    it("includes Cache-Control public, max-age=300 on success", async () => {
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify(SAMPLE_INVIDIOUS_RESPONSE), {
          status: 200,
          headers: { "content-length": "200" },
        })
      );

      const req = makeNetlifyRequest("/.netlify/functions/youtube-playlist");
      const res = await handler(req);
      expect(res.status).toBe(HTTP_STATUS_OK);
      expect(res.headers.get("cache-control")).toBe("public, max-age=300");
      expect(res.headers.get("content-type")).toBe("application/json");
    });
  });
});
