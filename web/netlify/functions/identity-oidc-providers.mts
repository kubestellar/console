/**
 * Netlify Function: Identity OIDC Providers
 *
 * Returns demo OIDC provider list for the enterprise OIDC dashboard.
 */

/** Offset constants for demo timestamps (milliseconds) */
const FIVE_MINUTES_MS = 300_000;
const TEN_MINUTES_MS = 600_000;
const FIFTEEN_MINUTES_MS = 900_000;
const TWENTY_MINUTES_MS = 1_200_000;
const ONE_DAY_MS = 86_400_000;

export default async () => {
  const now = Date.now();
  return new Response(
    JSON.stringify([
      { id: "oidc-1", name: "Okta Production", issuer_url: "https://company.okta.com", status: "connected", protocol: "OIDC", client_id: "okta-prod-001", users_synced: 485, last_sync: new Date(now - FIVE_MINUTES_MS).toISOString(), groups_mapped: 12 },
      { id: "oidc-2", name: "Azure AD", issuer_url: "https://login.microsoftonline.com/tenant-id", status: "connected", protocol: "OIDC", client_id: "azure-ad-001", users_synced: 312, last_sync: new Date(now - TEN_MINUTES_MS).toISOString(), groups_mapped: 8 },
      { id: "oidc-3", name: "GitHub Enterprise", issuer_url: "https://github.com/login/oauth", status: "connected", protocol: "OAuth2", client_id: "gh-ent-001", users_synced: 198, last_sync: new Date(now - FIFTEEN_MINUTES_MS).toISOString(), groups_mapped: 15 },
      { id: "oidc-4", name: "Google Workspace", issuer_url: "https://accounts.google.com", status: "connected", protocol: "OIDC", client_id: "gws-001", users_synced: 252, last_sync: new Date(now - TWENTY_MINUTES_MS).toISOString(), groups_mapped: 6 },
      { id: "oidc-5", name: "Keycloak Staging", issuer_url: "https://keycloak.staging.internal", status: "degraded", protocol: "OIDC", client_id: "kc-staging-001", users_synced: 0, last_sync: new Date(now - ONE_DAY_MS).toISOString(), groups_mapped: 3 },
    ]),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    },
  );
};
