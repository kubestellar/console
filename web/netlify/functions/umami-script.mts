/**
 * Netlify Function: Umami Tracking Script Proxy
 *
 * Serves the Umami tracking script from the console's own domain (/api/ksc)
 * so that ad blockers and corporate firewalls don't block it. This is the
 * Netlify equivalent of the Go backend's UmamiScriptProxy handler.
 *
 * Without this, the script loads from analytics.kubestellar.io which is
 * blocked by virtually every ad blocker and most corporate networks.
 */

import type { Config } from "@netlify/functions"

/** Upstream Umami instance — the custom script name is "ksc" */
const UMAMI_SCRIPT_URL = "https://analytics.kubestellar.io/ksc"
const CACHE_MAX_AGE_SECS = 3600 // 1 hour — matches Go backend

export default async (req: Request) => {
  try {
    const resp = await fetch(UMAMI_SCRIPT_URL, {
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
  path: "/api/ksc",
}
