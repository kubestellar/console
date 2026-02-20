/**
 * Netlify Function: GA4 Analytics Collect Proxy
 *
 * Proxies GA4 event collection requests with two key features:
 * 1. First-party domain bypass for ad blockers
 * 2. Measurement ID rewriting (decoy→real) to defeat Measurement Protocol spam
 *
 * GA4_REAL_MEASUREMENT_ID must be set as a Netlify environment variable.
 */

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
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers });
  }

  if (!isAllowedOrigin(req)) {
    return new Response("Forbidden", { status: 403, headers });
  }

  const realMeasurementId = process.env.GA4_REAL_MEASUREMENT_ID;
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

    const responseBody = await resp.text();
    return new Response(responseBody, {
      status: resp.status,
      headers: {
        ...headers,
        "Content-Type": resp.headers.get("content-type") || "text/plain",
      },
    });
  } catch {
    return new Response("Bad Gateway", { status: 502, headers });
  }
};
