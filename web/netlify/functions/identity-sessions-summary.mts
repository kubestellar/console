/**
 * Netlify Function: Identity Sessions Summary
 *
 * Returns demo session management summary for the enterprise Session dashboard.
 */
import { buildCorsHeaders, handlePreflight } from "./_shared";

const CORS_OPTIONS = {
  methods: "GET, OPTIONS",
} as const;

export default async (req: Request) => {
  if (req.method === "OPTIONS") {
    return handlePreflight(req, CORS_OPTIONS);
  }

  const corsHeaders = buildCorsHeaders(req, CORS_OPTIONS);
  if (req.method !== "GET") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: {
        ...corsHeaders,
        Allow: CORS_OPTIONS.methods,
        "Content-Type": "application/json",
      },
    });
  }

  return new Response(
    JSON.stringify({
      active_sessions: 42,
      unique_users: 31,
      avg_duration_minutes: 47,
      sessions_terminated_24h: 15,
      policy_violations: 3,
      mfa_sessions_pct: 88,
      evaluated_at: new Date().toISOString(),
    }),
    {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
      },
    },
  );
};
