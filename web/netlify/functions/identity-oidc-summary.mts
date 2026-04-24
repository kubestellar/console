/**
 * Netlify Function: Identity OIDC Summary
 *
 * Returns demo OIDC identity provider summary data for the enterprise
 * OIDC dashboard. On production (console.kubestellar.io), this serves
 * the same static demo data as the MSW handler so enterprise dashboards
 * render correctly without a Go backend.
 */
export default async () => {
  return new Response(
    JSON.stringify({
      total_providers: 5,
      active_providers: 4,
      total_users: 1247,
      active_sessions: 89,
      failed_logins_24h: 7,
      mfa_adoption: 82,
      evaluated_at: new Date().toISOString(),
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    },
  );
};
