/**
 * Netlify Function: Medium Blog
 *
 * Fetches the latest blog posts from the @kubestellar Medium publication
 * RSS feed and returns them as JSON. Equivalent to the Go backend's
 * MediumBlogHandler for Netlify deployments.
 */

const MEDIUM_FEED_URL = "https://medium.com/feed/@kubestellar";
const MEDIUM_CHANNEL_URL = "https://medium.com/@kubestellar";

/** Only return posts published on or after this date */
const CUTOFF_DATE = "2026-04-07";

/** Maximum number of posts to return */
const MAX_POSTS = 3;

/** Maximum length of preview text */
const PREVIEW_MAX_LEN = 200;

const ALLOWED_ORIGINS = [
  "https://console.kubestellar.io",
  "https://console-deploy-preview.kubestellar.io",
];

function corsOrigin(origin: string | null): string {
  if (!origin) return ALLOWED_ORIGINS[0];
  if (ALLOWED_ORIGINS.some((o) => origin.startsWith(o) || origin.endsWith(".kubestellar.io"))) {
    return origin;
  }
  return ALLOWED_ORIGINS[0];
}

interface MediumPost {
  title: string;
  link: string;
  published: string;
  preview: string;
}

/** Strip HTML tags and return plain text, trimmed to maxLen */
function stripHTML(html: string, maxLen: number): string {
  const text = html.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
  return text.length > maxLen ? text.slice(0, maxLen) : text;
}

function parseRSSFeed(xml: string): MediumPost[] {
  const posts: MediumPost[] = [];
  const cutoff = new Date(CUTOFF_DATE);

  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;

  while ((match = itemRegex.exec(xml)) !== null && posts.length < MAX_POSTS) {
    const item = match[1];

    const title = item.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/)?.[1]
      ?? item.match(/<title>([\s\S]*?)<\/title>/)?.[1]
      ?? "";
    const link = item.match(/<link>([\s\S]*?)<\/link>/)?.[1] ?? "";
    const pubDate = item.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1] ?? "";

    // Use content:encoded for preview if available, else description
    const encoded = item.match(/<content:encoded><!\[CDATA\[([\s\S]*?)\]\]><\/content:encoded>/)?.[1] ?? "";
    const description = item.match(/<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>/)?.[1]
      ?? item.match(/<description>([\s\S]*?)<\/description>/)?.[1]
      ?? "";

    const pubTime = new Date(pubDate);
    if (isNaN(pubTime.getTime()) || pubTime < cutoff) {
      continue;
    }

    const content = encoded || description;
    const preview = stripHTML(content, PREVIEW_MAX_LEN);

    posts.push({
      title,
      link,
      published: pubTime.toISOString(),
      preview,
    });
  }

  return posts;
}

export default async (req: Request) => {
  const origin = req.headers.get("origin");
  const headers: Record<string, string> = {
    "Access-Control-Allow-Origin": corsOrigin(origin),
    "Content-Type": "application/json",
    "Cache-Control": "public, max-age=3600",
  };

  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: { ...headers, "Access-Control-Allow-Methods": "GET, OPTIONS" },
    });
  }

  try {
    const resp = await fetch(MEDIUM_FEED_URL, {
      headers: { "User-Agent": "KubeStellar-Console/1.0" },
    });

    if (!resp.ok) {
      return new Response(
        JSON.stringify({ error: "Medium returned " + resp.status }),
        { status: 502, headers }
      );
    }

    const xml = await resp.text();
    const posts = parseRSSFeed(xml);

    return new Response(
      JSON.stringify({
        posts,
        feedUrl: MEDIUM_FEED_URL,
        channelUrl: MEDIUM_CHANNEL_URL,
      }),
      { status: 200, headers }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: "Failed to fetch blog", detail: String(err) }),
      { status: 502, headers }
    );
  }
};

export const config = {
  path: "/api/medium/blog",
};
