// @vitest-environment node
/**
 * @vitest-environment node
 *
 * Unit tests for the YouTube thumbnail Netlify proxy.
 *
 * Mocks global fetch so every branch (input validation, upstream 404,
 * placeholder-heuristic 404, size cap, network error, happy path) is
 * exercised without touching img.youtube.com.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import handler from "../youtube-thumbnail.mts";

const VALID_ID = "dQw4w9WgXcQ";
const BASE = "https://console.kubestellar.io/api/youtube/thumbnail/";
const DEFAULT_THUMBNAIL_MAX_BYTES = 1200;
const MAX_THUMBNAIL_BYTES = 2_097_152;

const mockFetch = vi.fn<typeof globalThis.fetch>();

beforeEach(() => {
  vi.stubGlobal("fetch", mockFetch);
});

afterEach(() => {
  vi.restoreAllMocks();
});

function makeReq(id: string): Request {
  return new Request(`${BASE}${id}`);
}

function bufferResponse(bytes: number, status = 200): Response {
  return new Response(new Uint8Array(bytes), { status });
}

describe("youtube-thumbnail — input validation", () => {
  it.each([
    ["empty id", ""],
    ["too short (10 chars)", "aaaaaaaaaa"],
    ["too long (12 chars)", "aaaaaaaaaaaa"],
    ["invalid char '!'", "abcdefghij!"],
    ["invalid char space", "abcdefghi j"],
  ])("returns 400 for %s", async (_label, id) => {
    const res = await handler(makeReq(id));
    expect(res.status).toBe(400);
    expect(await res.text()).toBe("invalid video id");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("accepts hyphen and underscore in id", async () => {
    mockFetch.mockResolvedValueOnce(bufferResponse(DEFAULT_THUMBNAIL_MAX_BYTES + 100));
    const res = await handler(makeReq("aa_-bb_-cc0"));
    expect(res.status).toBe(200);
  });
});

describe("youtube-thumbnail — upstream results", () => {
  it("forwards 404 when upstream returns non-OK", async () => {
    mockFetch.mockResolvedValueOnce(new Response(null, { status: 404 }));
    const res = await handler(makeReq(VALID_ID));
    expect(res.status).toBe(404);
    expect(await res.text()).toBe("thumbnail not found");
  });

  it("returns 404 for the default placeholder (body below threshold)", async () => {
    mockFetch.mockResolvedValueOnce(bufferResponse(DEFAULT_THUMBNAIL_MAX_BYTES - 1));
    const res = await handler(makeReq(VALID_ID));
    expect(res.status).toBe(404);
    expect(await res.text()).toBe("video not found");
  });

  it("returns 413 when upstream body exceeds the size cap", async () => {
    const oversized = new Response(new Uint8Array(64), {
      status: 200,
      // content-length header alone triggers the too-large guard in readCappedBuffer
      headers: { "content-length": String(MAX_THUMBNAIL_BYTES + 1) },
    });
    mockFetch.mockResolvedValueOnce(oversized);
    const res = await handler(makeReq(VALID_ID));
    expect(res.status).toBe(413);
    expect(await res.text()).toBe("thumbnail too large");
  });

  it("returns 502 when fetch throws a non-size error", async () => {
    mockFetch.mockRejectedValueOnce(new Error("network boom"));
    const res = await handler(makeReq(VALID_ID));
    expect(res.status).toBe(502);
    expect(await res.text()).toBe("failed to fetch thumbnail");
  });

  it("happy path returns image/jpeg with long cache header", async () => {
    const size = DEFAULT_THUMBNAIL_MAX_BYTES + 500;
    mockFetch.mockResolvedValueOnce(bufferResponse(size));
    const res = await handler(makeReq(VALID_ID));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/jpeg");
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=86400");
    const body = new Uint8Array(await res.arrayBuffer());
    expect(body.byteLength).toBe(size);
    expect(mockFetch).toHaveBeenCalledWith(
      `https://img.youtube.com/vi/${VALID_ID}/mqdefault.jpg`,
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });
});
