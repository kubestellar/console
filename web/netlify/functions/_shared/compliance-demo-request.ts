/**
 * Shared request guards for compliance dashboard demo Netlify handlers.
 * Adds method validation, optional cluster query validation, and safe JSON responses.
 */
import { buildCorsHeaders, handlePreflight } from "./cors";

const CLUSTER_PARAM_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;

const CORS_OPTIONS = {
  methods: "GET, OPTIONS",
  headers: "Content-Type",
} as const;

function jsonResponse(
  body: unknown,
  status: number,
  corsHeaders: Record<string, string>,
  extraHeaders?: Record<string, string>,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      ...extraHeaders,
      "Content-Type": "application/json",
    },
  });
}

/**
 * Wrap static compliance demo payloads with CORS, method checks, and error handling.
 */
export async function wrapComplianceDemoResponse(
  req: Request,
  body: unknown,
): Promise<Response> {
  if (req.method === "OPTIONS") {
    return handlePreflight(req, CORS_OPTIONS);
  }

  const corsHeaders = buildCorsHeaders(req, CORS_OPTIONS);

  if (req.method !== "GET") {
    return jsonResponse(
      { error: "Method not allowed" },
      405,
      corsHeaders,
      { Allow: CORS_OPTIONS.methods },
    );
  }

  const cluster = new URL(req.url).searchParams.get("cluster");
  if (cluster !== null && cluster !== "" && !CLUSTER_PARAM_RE.test(cluster)) {
    return jsonResponse({ error: "Invalid cluster parameter" }, 400, corsHeaders);
  }

  try {
    return jsonResponse(body, 200, corsHeaders);
  } catch (error) {
    console.error(
      "[compliance-demo] response serialization failed:",
      error instanceof Error ? error.message : error,
    );
    return new Response('{"error":"Compliance data temporarily unavailable"}', {
      status: 502,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
      },
    });
  }
}
