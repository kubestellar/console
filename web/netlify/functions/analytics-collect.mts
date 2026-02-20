/**
 * Netlify Function: GA4 Analytics Collect Proxy
 *
 * Receives base64-encoded GA4 event payloads from the browser, decodes them,
 * rewrites the measurement ID (decoy→real), forwards user IP for geolocation,
 * and proxies to google-analytics.com.
 *
 * The base64 encoding prevents network-level filters from matching on
 * GA4 parameter patterns (tid=G-*, en=, cid=) in the URL.
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

  const realMeasurementId = Netlify.env.get("GA4_REAL_MEASUREMENT_ID") || process.env.GA4_REAL_MEASUREMENT_ID;
  const url = new URL(req.url);

  // Decode base64-encoded payload from `d` parameter
  // Browser sends: /api/m?d=<base64(v=2&tid=G-0000000000&cid=...)>
  let gaParams: URLSearchParams;
  const encoded = url.searchParams.get("d");
  if (encoded) {
    try {
      gaParams = new URLSearchParams(atob(encoded));
    } catch {
      return new Response("Bad payload", { status: 400, headers: corsHeaders });
    }
  } else {
    // Fallback: plain query params (backwards compat during rollout)
    gaParams = url.searchParams;
  }

  // Rewrite tid from decoy → real Measurement ID
  if (realMeasurementId && gaParams.has("tid")) {
    gaParams.set("tid", realMeasurementId);
  }

  // Forward user's real IP so GA4 geolocates correctly
  const clientIp =
    req.headers.get("x-nf-client-connection-ip") ||
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "";
  if (clientIp) {
    gaParams.set("_uip", clientIp);
  }

  const targetUrl = `https://www.google-analytics.com/g/collect?${gaParams.toString()}`;

  try {
    const body = req.method === "POST" ? await req.text() : undefined;
    const resp = await fetch(targetUrl, {
      method: req.method,
      headers: {
        "Content-Type": req.headers.get("content-type") || "text/plain",
        "User-Agent": req.headers.get("user-agent") || "",
        ...(clientIp && { "X-Forwarded-For": clientIp }),
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
    return new Response(JSON.stringify({ error: "proxy_error", message }), {
      status: 502,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
};

export const config: Config = {
  path: "/api/m",
};
