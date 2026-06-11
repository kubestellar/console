import type { Context } from "@netlify/functions";

/**
 * /health Netlify Function — serves the same JSON shape as the Go backend's
 * GET /health (pkg/api/routes_health.go) so the frontend sidebar can
 * discover enabled_dashboards and promote the quantum dashboard entry.
 *
 * On console.kubestellar.io the backend is not deployed — only the static
 * frontend + Netlify Functions exist. Without this function, fetch('/health')
 * falls through to the SPA catch-all and returns HTML, causing the sidebar
 * to silently skip dashboard promotion.
 */

// Mirrors projectDashboardPresets["kubestellar"] from pkg/api/projects.go.
// Single source of truth for the Netlify-hosted demo site.
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
    appShortName: "Console",
    tagline: "Multi-cluster Kubernetes management",
    logoUrl: "",
    faviconUrl: "",
    themeColor: "#06b6d4",
    docsUrl: "https://docs.kubestellar.io",
    communityUrl: "https://kubestellar.io/community",
    websiteUrl: "https://kubestellar.io",
    issuesUrl: "https://github.com/kubestellar/console/issues",
    repoUrl: "https://github.com/kubestellar/console",
    hostedDomain: "console.kubestellar.io",
    showStarDecoration: true,
    showAdopterNudge: true,
    showDemoToLocalCTA: true,
    showRewards: true,
    showLinkedInShare: true,
  },
};

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "public, max-age=60, s-maxage=300",
};

export default async (req: Request, _context: Context) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  // Only allow GET
  if (req.method !== "GET") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify(HEALTH_RESPONSE), {
    status: 200,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
};
