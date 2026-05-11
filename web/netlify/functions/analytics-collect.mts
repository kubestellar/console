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

function getAllowedCorsOrigin(origin: string): string {
  if (!origin) return "https://console.kubestellar.io";
  try {
    const hostname = new URL(origin).hostname;
    if (ALLOWED_HOSTS.has(hostname) || hostname.endsWith(".netlify.app")) {
      return origin;
    }
  } catch {
    /* ignore */
  }
  return "https://console.kubestellar.io";
}

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
  // Reject if neither header present — non-browser clients (curl, scripts) omit both
  return false;
}

export default async (req: Request) => {
  const origin = req.headers.get("origin") || "";
  const corsOrigin = getAllowedCorsOrigin(origin);
  const corsHeaders: Record<string, string> = {
    "Access-Control-Allow-Origin": corsOrigin,
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

  // Netlify provides pre-computed geolocation via x-nf-geo header.
  // GA4 ignores _uip from serverless IPs (AWS Lambda), so we inject
  // Netlify's geo as custom event parameters as a reliable fallback.
  // These appear as custom dimensions in GA4 Explore reports.
  const nfGeo = req.headers.get("x-nf-geo");
  if (nfGeo) {
    try {
      const geo = JSON.parse(atob(nfGeo));
      if (geo.country?.name) gaParams.set("ep.geo_country", geo.country.name);
      if (geo.city) gaParams.set("ep.geo_city", geo.city);
      if (geo.subdivision?.name) gaParams.set("ep.geo_region", geo.subdivision.name);
      if (geo.country?.code) gaParams.set("ep.geo_country_code", geo.country.code);
    } catch {
      /* ignore parse errors */
    }
  }

  // Send params as POST body (not URL query string) so GA4 respects _uip
  // for geolocation. The /g/collect endpoint ignores _uip in query params
  // when the request comes from a server IP.
  const targetUrl = "https://www.google-analytics.com/g/collect";
  const postBody = gaParams.toString();

  try {
    const resp = await fetch(targetUrl, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain",
        "User-Agent": req.headers.get("user-agent") || "",
        ...(clientIp && { "X-Forwarded-For": clientIp }),
      },
      body: postBody,
      signal: AbortSignal.timeout(10_000),
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
    console.error("[analytics-collect] Proxy error:", err instanceof Error ? err.message : err);
    return new Response(JSON.stringify({ error: "proxy_error" }), {
      status: 502,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
};

export const config: Config = {
  path: "/api/m",
};
