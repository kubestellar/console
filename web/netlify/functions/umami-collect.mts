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
import { buildCorsHeaders, handlePreflight, isAllowedOrigin } from "./_shared/cors"
import { enforceSimpleRateLimit } from "./_shared/rate-limit"

const UMAMI_COLLECT_URL = "https://analytics.kubestellar.io/api/send"
const RATE_LIMIT_STORE_NAME = "umami-collect-rate-limit"
const UMAMI_RATE_LIMIT_MAX_REQUESTS = 500
const UMAMI_RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000

/**
 * Hosts allowed via Referer fallback when Origin is absent. Keep
 * separate from the CORS allowlist because Referer is a weaker signal
 * (can be stripped by Referrer-Policy) — only used when Origin is
 * entirely missing (e.g. beacon sendBeacon() without CORS).
 */
const REFERER_FALLBACK_HOSTS = new Set([
  "console.kubestellar.io",
  "localhost",
  "127.0.0.1",
])

function isRequestAllowed(req: Request): boolean {
  // Prefer the CORS allowlist via the Origin header.
  if (isAllowedOrigin(req.headers.get("origin"))) return true

  // Fall back to Referer for requests where Origin is not sent.
  const referer = req.headers.get("referer")
  if (referer) {
    try {
      const hostname = new URL(referer).hostname
      if (REFERER_FALLBACK_HOSTS.has(hostname) || hostname.endsWith(".netlify.app")) {
        return true
      }
    } catch {
      /* ignore parse errors */
    }
  }

  // Allow if neither Origin nor Referer is present (rare, same-origin POST with strict Referrer-Policy).
  return !req.headers.get("origin") && !referer
}

// See web/netlify/functions/_shared/cors.ts for allowlist rationale (#9879).
const CORS_OPTS = {
  methods: "POST, OPTIONS",
  headers: "Content-Type",
} as const

export default async (req: Request) => {
  const corsHeaders: Record<string, string> = buildCorsHeaders(req, CORS_OPTS)

  if (req.method === "OPTIONS") {
    return handlePreflight(req, CORS_OPTS)
  }

  if (!isRequestAllowed(req)) {
    return new Response("Forbidden", { status: 403, headers: corsHeaders })
  }

  // Forward client IP for geolocation
  const clientIp =
    req.headers.get("x-nf-client-connection-ip") ||
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  if (req.method === "POST") {
    const rate = await enforceSimpleRateLimit({
      storeName: RATE_LIMIT_STORE_NAME,
      prefix: "umami-collect:",
      subject: clientIp,
      maxRequests: UMAMI_RATE_LIMIT_MAX_REQUESTS,
      windowMs: UMAMI_RATE_LIMIT_WINDOW_MS,
    })
    if (rate.limited) {
      return new Response(JSON.stringify({ error: "Rate limit exceeded", retryAfter: rate.retryAfterSeconds }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }
  }

  try {
    const body = await req.text()

    const resp = await fetch(UMAMI_COLLECT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": req.headers.get("user-agent") || "",
        ...(clientIp !== "unknown" && { "X-Forwarded-For": clientIp }),
      },
      body,
      signal: AbortSignal.timeout(10_000),
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
    console.error("[umami-collect] Proxy error:", err instanceof Error ? err.message : err)
    return new Response(JSON.stringify({ error: "proxy_error" }), {
      status: 502,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }
}

export const config: Config = {
  path: "/api/send",
}
