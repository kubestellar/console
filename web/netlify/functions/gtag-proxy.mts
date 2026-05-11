/**
 * Netlify Function: GA4 gtag.js Proxy
 *
 * Serves gtag.js from the console's own domain (/api/gtag) so that
 * domain-based ad blockers don't block it. This is the Netlify equivalent
 * of the Go backend's GA4ScriptProxy handler.
 *
 * Without this, Netlify visitors fall back to the Google CDN
 * (googletagmanager.com) which is on virtually every ad blocker's
 * blocklist. When gtag.js can't load, events go through the custom
 * proxy (/api/m) which only appears in standard reports — NOT Realtime.
 *
 * With this function, gtag.js loads from console.kubestellar.io/api/gtag
 * (same origin), events go directly from browser to GA4, and visitors
 * appear in GA4 Realtime reports with accurate deployment_type.
 */

import type { Config } from "@netlify/functions"

const GTAG_BASE_URL = "https://www.googletagmanager.com/gtag/js"
const CACHE_MAX_AGE_SECS = 3600 // 1 hour — matches Go backend

export default async (req: Request) => {
  const url = new URL(req.url)
  const queryString = url.search || ""

  // Proxy the request to Google Tag Manager, preserving query params (e.g. ?id=G-...)
  const targetUrl = `${GTAG_BASE_URL}${queryString}`

  try {
    const resp = await fetch(targetUrl, {
      headers: {
        "User-Agent": req.headers.get("user-agent") || "",
      },
      signal: AbortSignal.timeout(10_000),
    })

    if (!resp.ok) {
      return new Response(null, { status: resp.status })
    }

    const body = await resp.text()

    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": "application/javascript; charset=utf-8",
        "Cache-Control": `public, max-age=${CACHE_MAX_AGE_SECS}`,
        "X-Content-Type-Options": "nosniff",
      },
    })
  } catch {
    return new Response(null, { status: 502 })
  }
}

export const config: Config = {
  path: "/api/gtag",
}
