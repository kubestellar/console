/**
 * Netlify Function: YouTube Playlist
 *
 * Fetches videos from the KubeStellar Console YouTube playlist RSS feed
 * and returns them as JSON. Equivalent to the Go backend's
 * YouTubePlaylistHandler for Netlify deployments.
 */

import { buildCorsHeaders, handlePreflight } from "./_shared"
import { enforceSimpleRateLimit } from "./_shared/rate-limit"

const PLAYLIST_ID = "PL1ALKGr_qZKc-xehA_8iUCdiKsCo6p6nD";
const FEED_URL = `https://www.youtube.com/feeds/videos.xml?playlist_id=${PLAYLIST_ID}`;
export const MAX_RESPONSE_BYTES = 512_000; // 512 KB — playlist data is typically < 100 KB

/** Rate limit: 30 requests per minute per IP (CWE-770, #17152) */
const RATE_LIMIT_STORE_NAME = "youtube-playlist-rate-limit";
const RATE_LIMIT_MAX_REQUESTS = 30;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;

/** YouTube video ID: exactly 11 chars of [A-Za-z0-9_-] */
const YOUTUBE_VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;

interface PlaylistVideo {
  id: string;
  title: string;
  description?: string;
  published?: string;
}

function parseAtomFeed(xml: string): PlaylistVideo[] {
  const videos: PlaylistVideo[] = [];

  // Simple XML parsing without a library — extract <entry> blocks
  const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
  let match;

  while ((match = entryRegex.exec(xml)) !== null) {
    const entry = match[1];

    const videoId = entry.match(/<yt:videoId>([^<]+)<\/yt:videoId>/)?.[1] ?? "";
    const title = entry.match(/<title>([^<]+)<\/title>/)?.[1] ?? "";
    const description = entry.match(/<media:description>([^<]*)<\/media:description>/)?.[1] ?? "";
    const published = entry.match(/<published>([^<]+)<\/published>/)?.[1] ?? "";

    if (videoId && YOUTUBE_VIDEO_ID_RE.test(videoId)) {
      videos.push({
        id: videoId,
        title,
        description: description || undefined,
        published: published || undefined,
      });
    }
  }

  return videos;
}

export default async (req: Request) => {
  const corsHeaders = buildCorsHeaders(req, {
    methods: "GET, OPTIONS",
  });
  const headers = {
    ...corsHeaders,
    "Content-Type": "application/json",
    "Cache-Control": "public, max-age=300",
  };

  if (req.method === "OPTIONS") {
    return handlePreflight(req, {
      methods: "GET, OPTIONS",
    });
  }

  const clientIp =
    req.headers.get("x-nf-client-connection-ip") ??
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown";

  const rate = await enforceSimpleRateLimit({
    storeName: RATE_LIMIT_STORE_NAME,
    prefix: "youtube-playlist:",
    subject: clientIp,
    maxRequests: RATE_LIMIT_MAX_REQUESTS,
    windowMs: RATE_LIMIT_WINDOW_MS,
  });
  if (rate.limited) {
    return new Response(
      JSON.stringify({ error: "Rate limit exceeded", videos: [] }),
      {
        status: 429,
        headers: {
          ...headers,
          "Retry-After": String(rate.retryAfterSeconds),
          "Cache-Control": "no-store",
        },
      }
    );
  }

  try {
    // Primary: Invidious API (reliable, no auth required)
    const invidiousInstances = [
      "https://inv.nadeko.net",
      "https://invidious.fdn.fr",
      "https://vid.puffyan.us",
    ];

    for (const instance of invidiousInstances) {
      try {
        const invResp = await fetch(
          `${instance}/api/v1/playlists/${PLAYLIST_ID}`,
          { signal: AbortSignal.timeout(8000) }
        );
        if (invResp.ok) {
          const invContentLength = parseInt(invResp.headers.get("content-length") ?? "0", 10);
          if (invContentLength > MAX_RESPONSE_BYTES) {
            continue; // skip oversized response, try next instance
          }
          const rawText = await invResp.text();
          if (rawText.length > MAX_RESPONSE_BYTES) {
            continue;
          }
          const data = JSON.parse(rawText) as { videos?: Array<{ videoId: string; title: string }> };
          if (data.videos && data.videos.length > 0) {
            // Validate videoIds returned by third-party Invidious instances (#17152)
            const videos: PlaylistVideo[] = data.videos
              .filter((v) => YOUTUBE_VIDEO_ID_RE.test(v.videoId))
              .map((v) => ({
                id: v.videoId,
                title: v.title,
              }));
            if (videos.length > 0) {
              return new Response(
                JSON.stringify({
                  videos,
                  playlistId: PLAYLIST_ID,
                  playlistUrl: `https://www.youtube.com/playlist?list=${PLAYLIST_ID}`,
                }),
                { status: 200, headers }
              );
            }
          }
        }
      } catch {
        // try next instance
      }
    }

    // Fallback: RSS feed
    const resp = await fetch(FEED_URL, {
      headers: { "User-Agent": "KubeStellar-Console/1.0" },
      signal: AbortSignal.timeout(10_000),
    });

    if (resp.ok) {
      const rssContentLength = parseInt(resp.headers.get("content-length") ?? "0", 10);
      if (rssContentLength > MAX_RESPONSE_BYTES) {
        return new Response(
          JSON.stringify({ error: "Upstream response too large", videos: [] }),
          { status: 502, headers }
        );
      }
      const xml = await resp.text();
      if (xml.length > MAX_RESPONSE_BYTES) {
        return new Response(
          JSON.stringify({ error: "Upstream response too large", videos: [] }),
          { status: 502, headers }
        );
      }
      const videos = parseAtomFeed(xml);
      if (videos.length > 0) {
        return new Response(
          JSON.stringify({
            videos,
            playlistId: PLAYLIST_ID,
            playlistUrl: `https://www.youtube.com/playlist?list=${PLAYLIST_ID}`,
          }),
          { status: 200, headers }
        );
      }
    }

    // All sources failed
    return new Response(
      JSON.stringify({ error: "All video sources unavailable", videos: [] }),
      { status: 502, headers }
    );
  } catch (err) {
    console.error("Failed to fetch YouTube playlist:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 502, headers }
    );
  }
};

export const config = {
  path: "/api/youtube/playlist",
};
