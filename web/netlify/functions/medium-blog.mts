/**
 * Netlify Function: Medium Blog
 *
 * Fetches the latest blog posts from the @kubestellar Medium publication
 * RSS feed and returns them as JSON. Equivalent to the Go backend's
 * MediumBlogHandler for Netlify deployments.
 */

// isomorphic-dompurify works in both Node (Netlify Functions) and browser
// contexts, replacing the incomplete regex-based HTML sanitization that
// could miss multi-character sequences (js/incomplete-multi-character-sanitization).
import DOMPurify from "isomorphic-dompurify";

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

const ALLOWED_ORIGIN_SET = new Set(ALLOWED_ORIGINS);
const ALLOWED_HOSTS = new Set(ALLOWED_ORIGINS.map((origin) => new URL(origin).hostname));

function isAllowedOrigin(origin: string): boolean {
  let parsedOrigin: URL;

  try {
    parsedOrigin = new URL(origin);
  } catch {
    return false;
  }

  if (parsedOrigin.protocol !== "https:") {
    return false;
  }

  if (ALLOWED_ORIGIN_SET.has(parsedOrigin.origin) || ALLOWED_HOSTS.has(parsedOrigin.hostname)) {
    return true;
  }

  return parsedOrigin.hostname === "kubestellar.io" || parsedOrigin.hostname.endsWith(".kubestellar.io");
}

function corsOrigin(origin: string | null): string {
  if (!origin) return ALLOWED_ORIGINS[0];
  if (isAllowedOrigin(origin)) {
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

/**
 * Strip HTML tags and return plain text, trimmed to maxLen.
 *
 * Uses DOMPurify.sanitize() to remove all HTML tags safely, avoiding the
 * incomplete multi-character sanitization pattern where a regex like
 * /<[^>]*>/g can be bypassed by crafted tag sequences
 * (js/incomplete-multi-character-sanitization).
 */
function stripHTML(html: string, maxLen: number): string {
  // DOMPurify.sanitize with ALLOWED_TAGS:[] strips all HTML, leaving only text
  const sanitized = DOMPurify.sanitize(html, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] });
  const text = sanitized.replace(/\s+/g, " ").trim();
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
      signal: AbortSignal.timeout(10_000),
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
  } catch {
    return new Response(
      JSON.stringify({ error: "Failed to fetch blog" }),
      { status: 502, headers }
    );
  }
};

export const config = {
  path: "/api/medium/blog",
};
