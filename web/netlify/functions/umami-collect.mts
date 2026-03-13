/**
 * Netlify Function: Umami Event Collection Proxy
 *
 * Relays Umami event payloads from the browser to analytics.kubestellar.io.
 * The browser POSTs JSON to /api/send; this function forwards it to the
 * upstream Umami instance with the client's real IP for geolocation.
 *
 * This is the Netlify equivalent of the Go backend's UmamiCollectProxy handler.
 */

import type { Config } from "@netlify/functions"

const UMAMI_COLLECT_URL = "https://analytics.kubestellar.io/api/send"

const ALLOWED_HOSTS = new Set([
  "console.kubestellar.io",
  "localhost",
  "127.0.0.1",
])

function isAllowedOrigin(req: Request): boolean {
  const origin = req.headers.get("origin") || ""
  const referer = req.headers.get("referer") || ""

  for (const header of [origin, referer]) {
    if (!header) continue
    try {
      const hostname = new URL(header).hostname
      if (ALLOWED_HOSTS.has(hostname) || hostname.endsWith(".netlify.app")) {
        return true
      }
    } catch {
      /* ignore parse errors */
    }
  }
  // Allow if neither header present (browsers always send one for fetch)
  return !origin && !referer
}

export default async (req: Request) => {
  const corsHeaders: Record<string, string> = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  }

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders })
  }

  if (!isAllowedOrigin(req)) {
    return new Response("Forbidden", { status: 403, headers: corsHeaders })
  }

  // Forward client IP for geolocation
  const clientIp =
    req.headers.get("x-nf-client-connection-ip") ||
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    ""

  try {
    const body = await req.text()

    const resp = await fetch(UMAMI_COLLECT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": req.headers.get("user-agent") || "",
        ...(clientIp && { "X-Forwarded-For": clientIp }),
      },
      body,
    })

    const isNullBody = resp.status === 204 || resp.status === 304
    const responseBody = isNullBody ? null : await resp.text()
    return new Response(responseBody, {
      status: resp.status,
      headers: {
        ...corsHeaders,
        ...(!isNullBody && { "Content-Type": resp.headers.get("content-type") || "application/json" }),
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return new Response(JSON.stringify({ error: "proxy_error", message }), {
      status: 502,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }
}

export const config: Config = {
  path: "/api/send",
}
