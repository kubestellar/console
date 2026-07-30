/**
 * /health Netlify Function — serves the same JSON shape as the Go backend's
 * GET /health (pkg/api/routes_health.go) so the frontend sidebar can
 * discover enabled_dashboards and promote the quantum dashboard entry.
 *
 * On console.kubestellar.io the backend is not deployed — only the static
 * frontend + Netlify Functions exist. Without this function, fetch('/health')
 * falls through to the SPA catch-all and returns HTML, causing the sidebar
 * to silently skip dashboard promotion.
 *
 * CORS: uses the project-wide allowlist via _shared/cors (echoes the request
 * Origin only when allowed, with `Vary: Origin`). This replaces the inline
 * `Access-Control-Allow-Origin: *` from the original landing PR; see
 * _shared/cors.ts for the OWASP ZAP rationale (#9879).
 */
import { buildCorsHeaders, handlePreflight } from "./_shared/cors";

const CORS_OPTIONS = { methods: "GET, OPTIONS" };

// Mirrors projectDashboardPresets["kubestellar"] from pkg/api/projects.go.
// KEEP IN SYNC with that file — the parity test in
// __tests__/health.test.ts catches drift.
const KUBESTELLAR_DASHBOARDS = [
  "dashboard", "clusters", "cluster-admin", "compliance", "deploy",
  "insights", "ai-ml", "ai-agents", "acmm", "ci-cd",
  "multi-tenancy", "alerts", "arcade", "quantum",
  "llm-d-benchmarks", "gpu-reservations",
  "compute", "security", "storage", "network", "events",
  "workloads", "operators", "nodes", "deployments", "pods",
  "services", "helm", "logs", "data-compliance", "cost",
  "gitops", "gpu",
];

// Branding values mirror DEFAULT_BRANDING (web/src/lib/branding.ts) so the
// hosted demo at console.kubestellar.io renders identically to a self-hosted
// console in its default state. mergeBranding() in lib/branding.ts skips
// empty strings, so set non-empty canonical values here.
const HEALTH_RESPONSE = {
  status: "ok",
  version: "netlify",
  oauth_configured: false,
  in_cluster: false,
  no_local_agent: true,
  install_method: "netlify",
  project: "kubestellar",
  workloads: {
    quantum_kc_demo_available: false,
  },
  enabled_dashboards: KUBESTELLAR_DASHBOARDS,
  branding: {
    appName: "KubeStellar Console",
    appShortName: "KubeStellar",
    tagline: "multi-cluster first, saving time and tokens",
    logoUrl: "/kubestellar-logo.svg",
    faviconUrl: "/favicon.ico",
    themeColor: "#7c3aed",
    docsUrl: "https://kubestellar.io/docs/console/readme",
    communityUrl: "https://kubestellar.io/community",
    websiteUrl: "https://kubestellar.io",
    issuesUrl: "https://github.com/kubestellar/kubestellar/issues/new",
    repoUrl: "https://github.com/kubestellar/console",
    hostedDomain: "console.kubestellar.io",
    showStarDecoration: true,
    showAdopterNudge: true,
    showDemoToLocalCTA: true,
    showRewards: true,
    showLinkedInShare: true,
  },
};

export default async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return handlePreflight(req, CORS_OPTIONS);
  }

  if (req.method !== "GET") {
    return new Response(JSON.stringify({ error: "method not allowed" }), {
      status: 405,
      headers: {
        "Content-Type": "application/json",
        Allow: "GET, OPTIONS",
        ...buildCorsHeaders(req, CORS_OPTIONS),
      },
    });
  }

  return new Response(JSON.stringify(HEALTH_RESPONSE), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=60, s-maxage=300",
      ...buildCorsHeaders(req, CORS_OPTIONS),
    },
  });
};
