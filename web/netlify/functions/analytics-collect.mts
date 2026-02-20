/**
 * Netlify Function: GA4 Analytics Collect Proxy
 *
 * Proxies GA4 event collection requests with two key features:
 * 1. First-party domain bypass for ad blockers
 * 2. Measurement ID rewriting (decoy→real) to defeat Measurement Protocol spam
 *
 * GA4_REAL_MEASUREMENT_ID must be set as a Netlify environment variable.
 */

import type { Config } from "@netlify/functions"

const ALLOWED_HOSTS = new Set([
  "console.kubestellar.io",
  "localhost",
  "127.0.0.1",
]);

function isAllowedOrigin(req: Request): boolean {
  const origin = req.headers.get("origin") || "";
  const referer = req.headers.get("referer") || "";

  for (const header of [origin, referer]) {
    if (!header) continue;
    try {
      const hostname = new URL(header).hostname;
      if (ALLOWED_HOSTS.has(hostname) || hostname.endsWith(".netlify.app")) {
        return true;
      }
    } catch {
      /* ignore parse errors */
    }
  }
  // Allow if neither header present (browsers always send one for fetch)
  return !origin && !referer;
}

export default async (req: Request) => {
  const corsHeaders: Record<string, string> = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (!isAllowedOrigin(req)) {
    return new Response("Forbidden", { status: 403, headers: corsHeaders });
  }

  // Netlify.env.get() is the V2 way; fall back to process.env for compatibility
  const realMeasurementId = Netlify.env.get("GA4_REAL_MEASUREMENT_ID") || process.env.GA4_REAL_MEASUREMENT_ID;
  const url = new URL(req.url);

  // Rewrite tid from decoy → real Measurement ID
  if (realMeasurementId && url.searchParams.has("tid")) {
    url.searchParams.set("tid", realMeasurementId);
  }

  const targetUrl = `https://www.google-analytics.com/g/collect?${url.searchParams.toString()}`;

  try {
    const body = req.method === "POST" ? await req.text() : undefined;
    const resp = await fetch(targetUrl, {
      method: req.method,
      headers: {
        "Content-Type": req.headers.get("content-type") || "text/plain",
        "User-Agent": req.headers.get("user-agent") || "",
      },
      body,
    });

    // 204/304 are null-body statuses — Response constructor throws if body is non-null
    const isNullBody = resp.status === 204 || resp.status === 304;
    const responseBody = isNullBody ? null : await resp.text();
    return new Response(responseBody, {
      status: resp.status,
      headers: {
        ...corsHeaders,
        ...(!isNullBody && { "Content-Type": resp.headers.get("content-type") || "text/plain" }),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: "proxy_error", message, targetUrl }), {
      status: 502,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
};

export const config: Config = {
  path: "/t/g/collect",
};
