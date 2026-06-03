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
import { isResponseTooLargeError, readCappedText } from "./_shared/read-capped-json"
import { enforceSimpleRateLimit } from "./_shared/rate-limit"

const UMAMI_COLLECT_URL = "https://analytics.kubestellar.io/api/send"
const RATE_LIMIT_STORE_NAME = "umami-collect-rate-limit"
const UMAMI_RATE_LIMIT_MAX_REQUESTS = 500
const UMAMI_RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000
const MAX_BODY_BYTES = 65_536
const MAX_UPSTREAM_TEXT_BYTES = 1_048_576
const ALLOWED_METHODS = "POST, OPTIONS"
const JSON_OBJECT_TYPE = "object"

const REFERER_FALLBACK_HOSTS = new Set([
  "console.kubestellar.io",
  "localhost",
  "127.0.0.1",
])

function normalizeOrigin(header: string | null): string | null {
  if (!header) return null

  try {
    return new URL(header).origin
  } catch {
    return header
  }
}

function isJsonObjectPayload(body: string): boolean {
  if (!body) return false

  try {
    const parsed: unknown = JSON.parse(body)
    return typeof parsed === JSON_OBJECT_TYPE && parsed !== null && !Array.isArray(parsed)
  } catch {
    return false
  }
}

/**
 * Validates that a netlify.app hostname belongs to a KubeStellar deploy preview.
 * Rejects arbitrary attacker-controlled *.netlify.app subdomains (#16744).
 */
function isKubeStellarNetlifyHost(hostname: string): boolean {
  if (!hostname.endsWith(".netlify.app")) return false
  // KubeStellar deploy previews use patterns like:
  // deploy-preview-123--kubestellar-console.netlify.app
  // kubestellar-console.netlify.app
  const subdomain = hostname.replace(".netlify.app", "")
  return subdomain === "kubestellar-console" ||
    subdomain.startsWith("deploy-preview-") && subdomain.endsWith("--kubestellar-console")
}

function isRequestAllowed(req: Request): boolean {
  const origin = normalizeOrigin(req.headers.get("origin"))
  if (isAllowedOrigin(origin)) return true

  const referer = req.headers.get("referer")
  if (referer) {
    try {
      const hostname = new URL(referer).hostname
      if (REFERER_FALLBACK_HOSTS.has(hostname) || isKubeStellarNetlifyHost(hostname)) {
        return true
      }
    } catch {
      /* ignore parse errors */
    }
  }

  return false
}

// See web/netlify/functions/_shared/cors.ts for allowlist rationale (#9879).
const CORS_OPTS = {
  methods: ALLOWED_METHODS,
  headers: "Content-Type",
} as const

export default async (req: Request) => {
  const corsHeaders: Record<string, string> = buildCorsHeaders(req, CORS_OPTS)

  if (req.method === "OPTIONS") {
    return handlePreflight(req, CORS_OPTS)
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", {
      status: 405,
      headers: { ...corsHeaders, Allow: ALLOWED_METHODS },
    })
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

  const contentLength = Number.parseInt(req.headers.get("content-length") || "0", 10)
  if (contentLength > MAX_BODY_BYTES) {
    return new Response("Payload too large", { status: 413, headers: corsHeaders })
  }

  try {
    const body = await req.text()
    if (body.length > MAX_BODY_BYTES) {
      return new Response("Payload too large", { status: 413, headers: corsHeaders })
    }
    if (!isJsonObjectPayload(body)) {
      return new Response("Bad payload", { status: 400, headers: corsHeaders })
    }

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
    const responseBody = isNullBody ? null : await readCappedText(resp, MAX_UPSTREAM_TEXT_BYTES, "Umami upstream")
    return new Response(responseBody, {
      status: resp.status,
      headers: {
        ...corsHeaders,
        ...(!isNullBody && { "Content-Type": resp.headers.get("content-type") || "application/json" }),
      },
    })
  } catch (err) {
    console.error("[umami-collect] Proxy error:", err instanceof Error ? err.message : err)
    if (isResponseTooLargeError(err)) {
      return new Response(JSON.stringify({ error: "upstream_response_too_large" }), {
        status: 413,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }
    return new Response(JSON.stringify({ error: "proxy_error" }), {
      status: 502,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }
}

export const config: Config = {
  path: "/api/send",
}
