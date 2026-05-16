/**
 * Netlify Function: YouTube Thumbnail Proxy
 *
 * Proxies YouTube video thumbnails through the backend to avoid
 * MSW service worker blocking external image requests in demo mode.
 */

/** Standard YouTube video ID length */
const YOUTUBE_VIDEO_ID_LEN = 11;

/**
 * Maximum size (bytes) of YouTube's default placeholder thumbnail returned
 * for non-existent video IDs. Real thumbnails are significantly larger.
 */
const DEFAULT_THUMBNAIL_MAX_BYTES = 1200;

/** Timeout for fetching thumbnails from YouTube CDN */
const YOUTUBE_CDN_TIMEOUT_MS = 10_000;

export default async (req: Request) => {
  const url = new URL(req.url);
  const videoId = url.pathname.split("/").pop() || "";

  // YouTube video IDs are exactly 11 characters: [A-Za-z0-9_-]
  if (
    !videoId ||
    videoId.length !== YOUTUBE_VIDEO_ID_LEN ||
    !/^[\w-]+$/.test(videoId)
  ) {
    return new Response("invalid video id", { status: 400 });
  }

  try {
    const resp = await fetch(
      `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`,
      { signal: AbortSignal.timeout(YOUTUBE_CDN_TIMEOUT_MS) }
    );

    if (!resp.ok) {
      return new Response("thumbnail not found", { status: 404 });
    }

    const body = await resp.arrayBuffer();

    // YouTube returns a tiny default placeholder for non-existent video IDs
    // instead of a 404. Detect by size — real thumbnails are much larger.
    if (body.byteLength < DEFAULT_THUMBNAIL_MAX_BYTES) {
      return new Response("video not found", { status: 404 });
    }

    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch {
    return new Response("failed to fetch thumbnail", { status: 502 });
  }
};

export const config = {
  path: "/api/youtube/thumbnail/*",
};
