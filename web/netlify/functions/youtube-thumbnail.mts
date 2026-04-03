/**
 * Netlify Function: YouTube Thumbnail Proxy
 *
 * Proxies YouTube video thumbnails through the backend to avoid
 * MSW service worker blocking external image requests in demo mode.
 */

export default async (req: Request) => {
  const url = new URL(req.url);
  const videoId = url.pathname.split("/").pop() || "";

  if (!videoId || !/^[\w-]+$/.test(videoId)) {
    return new Response("invalid video id", { status: 400 });
  }

  try {
    const resp = await fetch(
      `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`
    );

    if (!resp.ok) {
      return new Response("thumbnail not found", { status: 404 });
    }

    const body = await resp.arrayBuffer();

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
