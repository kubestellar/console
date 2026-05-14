/**
 * Netlify Function: YouTube Playlist
 *
 * Fetches videos from the KubeStellar Console YouTube playlist RSS feed
 * and returns them as JSON. Equivalent to the Go backend's
 * YouTubePlaylistHandler for Netlify deployments.
 */

const PLAYLIST_ID = "PL1ALKGr_qZKc-xehA_8iUCdiKsCo6p6nD";
const FEED_URL = `https://www.youtube.com/feeds/videos.xml?playlist_id=${PLAYLIST_ID}`;
const ALLOWED_ORIGINS = [
  "https://console.kubestellar.io",
  "https://console-deploy-preview.kubestellar.io",
];

/**
 * Returns a CORS origin header value for the given request origin.
 * Uses exact match or parsed-hostname suffix check — not substring matching —
 * to prevent bypass via crafted origins like "evil.com?origin=kubestellar.io"
 * (CodeQL js/incomplete-url-substring-sanitization, #9119).
 */
function corsOrigin(origin: string | null): string {
  if (!origin) return ALLOWED_ORIGINS[0];
  // Exact match against allowlist
  if (ALLOWED_ORIGINS.includes(origin)) return origin;
  // Allow any subdomain of kubestellar.io via parsed hostname check
  try {
    const host = new URL(origin).hostname.toLowerCase();
    if (host === "kubestellar.io" || host.endsWith(".kubestellar.io")) {
      return origin;
    }
  } catch {
    // Malformed origin — fall through to default
  }
  return ALLOWED_ORIGINS[0];
}

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

    if (videoId) {
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
  const origin = req.headers.get("origin");
  const headers: Record<string, string> = {
    "Access-Control-Allow-Origin": corsOrigin(origin),
    "Content-Type": "application/json",
    "Cache-Control": "public, max-age=300",
  };

  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: { ...headers, "Access-Control-Allow-Methods": "GET, OPTIONS" },
    });
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
          const data = (await invResp.json()) as { videos?: Array<{ videoId: string; title: string }> };
          if (data.videos && data.videos.length > 0) {
            const videos: PlaylistVideo[] = data.videos.map((v) => ({
              id: v.videoId,
              title: v.title,
            }));
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
      const xml = await resp.text();
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
