/**
 * Temporary debug endpoint to verify what IP Netlify sees from the client.
 * DELETE THIS after confirming geolocation works.
 */
import type { Config } from "@netlify/functions"

export default async (req: Request) => {
  const headers: Record<string, string | null> = {
    "x-nf-client-connection-ip": req.headers.get("x-nf-client-connection-ip"),
    "x-forwarded-for": req.headers.get("x-forwarded-for"),
    "x-real-ip": req.headers.get("x-real-ip"),
    "x-nf-geo": req.headers.get("x-nf-geo"),
    "x-country": req.headers.get("x-country"),
  }

  return new Response(JSON.stringify({ detected_headers: headers }, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  })
}

export const config: Config = {
  path: "/api/debug-ip",
}
