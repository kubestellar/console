/**
 * Netlify Edge Function: SEO Meta Tag Injection + Landing Pages
 *
 * Two responsibilities:
 * 1. Injects per-route <title>, <meta description>, Open Graph tags, and JSON-LD
 *    structured data into the HTML response for all visitors.
 * 2. Serves static landing pages (rich HTML content) to search engine crawlers
 *    instead of the empty SPA shell. Human visitors get the normal React app.
 *
 * This only runs on Netlify (not on localhost or cluster deployments).
 */

import type { Context } from "https://edge.netlify.com";

const SITE_URL = "https://console.kubestellar.io";
const SITE_NAME = "KubeStellar Console";
const DEFAULT_IMAGE = `${SITE_URL}/kubestellar.png`;
const ORG_URL = "https://kubestellar.io";
const ORG_NAME = "KubeStellar";
const GITHUB_URL = "https://github.com/kubestellar";
const DOCS_URL = "https://docs.kubestellar.io";
const LOGO_URL = `${SITE_URL}/kubestellar.png`;

/** Known search engine crawler user-agent patterns */
const CRAWLER_UA_PATTERNS = [
  "googlebot",
  "bingbot",
  "slurp",
  "duckduckbot",
  "baiduspider",
  "yandexbot",
  "facebookexternalhit",
  "twitterbot",
  "linkedinbot",
  "whatsapp",
  "slackbot",
  "telegrambot",
  "discordbot",
  "applebot",
  "semrushbot",
  "ahrefsbot",
  "mj12bot",
  "petalbot",
];

/** Routes that have static landing pages in /landing/ */
const LANDING_PAGE_MAP: Record<string, string> = {
  "/": "/landing/index.html",
  "/clusters": "/landing/clusters.html",
  "/missions": "/landing/missions.html",
  "/gpu-reservations": "/landing/gpu.html",
  "/deploy": "/landing/deploy.html",
  "/security": "/landing/security.html",
  "/workloads": "/landing/workloads.html",
  "/llm-d-benchmarks": "/landing/llm-d-benchmarks.html",
  "/gitops": "/landing/gitops.html",
  "/marketplace": "/landing/marketplace.html",
  "/ai-agents": "/landing/ai-agents.html",
  "/cost": "/landing/cost.html",
  "/ai-ml": "/landing/ai-ml.html",
  "/nodes": "/landing/nodes.html",
  "/deployments": "/landing/deployments.html",
  "/pods": "/landing/pods.html",
  "/services": "/landing/services.html",
  "/operators": "/landing/operators.html",
  "/helm": "/landing/helm.html",
  "/events": "/landing/events.html",
  "/logs": "/landing/logs.html",
  "/compute": "/landing/compute.html",
  "/storage": "/landing/storage.html",
  "/network": "/landing/network.html",
  "/alerts": "/landing/alerts.html",
  "/security-posture": "/landing/security-posture.html",
  "/data-compliance": "/landing/data-compliance.html",
  "/ci-cd": "/landing/ci-cd.html",
  "/arcade": "/landing/arcade.html",
};

/** Check if the user-agent belongs to a search engine crawler or social bot */
function isCrawler(userAgent: string): boolean {
  const ua = userAgent.toLowerCase();
  return CRAWLER_UA_PATTERNS.some((pattern) => ua.includes(pattern));
}

/** Actual dimensions of kubestellar.png used for OG image previews */
const OG_IMAGE_WIDTH = 2048;
const OG_IMAGE_HEIGHT = 400;

interface RouteMeta {
  title: string;
  description: string;
  keywords: string[];
}

/**
 * Per-route SEO metadata. Each entry maps a URL path to its title, description,
 * and target keywords. These are injected into the HTML <head> by the edge function.
 */
const ROUTE_META: Record<string, RouteMeta> = {
  "/": {
    title:
      "KubeStellar Console - Multi-Cluster Kubernetes Dashboard & Management",
    description:
      "Open-source multi-cluster Kubernetes management dashboard. Monitor clusters, deploy workloads, manage GPU resources, and troubleshoot with AI-powered missions across all your Kubernetes environments.",
    keywords: [
      "kubernetes dashboard",
      "multi-cluster kubernetes",
      "kubernetes management",
      "k8s dashboard",
      "kubernetes monitoring",
      "kubestellar",
    ],
  },
  "/clusters": {
    title: "Multi-Cluster Management - KubeStellar Console",
    description:
      "Monitor and manage multiple Kubernetes clusters from a single dashboard. View cluster health, node status, resource utilization, and deploy workloads across clusters.",
    keywords: [
      "kubernetes multi-cluster",
      "cluster management",
      "kubernetes cluster monitoring",
      "multi-cluster dashboard",
    ],
  },
  "/workloads": {
    title: "Kubernetes Workload Management - KubeStellar Console",
    description:
      "Deploy, monitor, and manage Kubernetes workloads across multiple clusters. Track deployment status, pod health, and resource consumption in real-time.",
    keywords: [
      "kubernetes workloads",
      "kubernetes deployment management",
      "multi-cluster workloads",
      "k8s workload monitoring",
    ],
  },
  "/missions": {
    title:
      "AI-Powered Kubernetes Troubleshooting & CNCF Project Installer - KubeStellar Console",
    description:
      "Browse 400+ AI-generated missions for installing CNCF projects and troubleshooting Kubernetes issues. Step-by-step guides for Prometheus, Istio, Argo, Envoy, and more.",
    keywords: [
      "kubernetes troubleshooting",
      "CNCF project installer",
      "kubernetes AI assistant",
      "install prometheus kubernetes",
      "kubernetes troubleshooting guide",
    ],
  },
  "/gpu-reservations": {
    title:
      "Kubernetes GPU Management & Namespace Allocation - KubeStellar Console",
    description:
      "Manage GPU resources across Kubernetes clusters. Track GPU utilization, allocate GPUs by namespace, and optimize AI/ML workload placement.",
    keywords: [
      "kubernetes GPU management",
      "GPU allocation kubernetes",
      "kubernetes AI ML",
      "GPU namespace allocation",
    ],
  },
  "/deploy": {
    title:
      "Multi-Cluster Workload Deployment - KubeStellar Console",
    description:
      "Deploy applications across multiple Kubernetes clusters with smart placement. Drag-and-drop deployment, Helm chart management, and GitOps integration.",
    keywords: [
      "kubernetes multi-cluster deployment",
      "deploy across clusters",
      "kubernetes workload placement",
      "helm deployment dashboard",
    ],
  },
  "/security": {
    title: "Kubernetes Security Dashboard - KubeStellar Console",
    description:
      "Monitor security posture across Kubernetes clusters. RBAC analysis, vulnerability scanning, network policy management, and compliance reporting.",
    keywords: [
      "kubernetes security",
      "kubernetes RBAC",
      "kubernetes security dashboard",
      "cluster security monitoring",
    ],
  },
  "/llm-d-benchmarks": {
    title: "LLM Inference Benchmarks - KubeStellar Console",
    description:
      "Live performance benchmarks for LLM inference on Kubernetes. Compare throughput, latency, and resource utilization across hardware configurations.",
    keywords: [
      "LLM inference benchmark",
      "kubernetes LLM performance",
      "GPU inference benchmark",
      "llm-d benchmark",
    ],
  },
  "/gitops": {
    title: "GitOps Dashboard - KubeStellar Console",
    description:
      "Manage GitOps workflows across Kubernetes clusters. Track Argo CD applications, sync status, and drift detection from a unified dashboard.",
    keywords: [
      "kubernetes gitops",
      "argo cd dashboard",
      "gitops multi-cluster",
      "kubernetes gitops management",
    ],
  },
  "/marketplace": {
    title:
      "Kubernetes Extension Marketplace - KubeStellar Console",
    description:
      "Browse and install dashboard cards, AI missions, and extensions for your KubeStellar Console. Extend your Kubernetes management capabilities.",
    keywords: [
      "kubernetes dashboard extensions",
      "kubestellar marketplace",
      "kubernetes plugins",
    ],
  },
  "/ai-agents": {
    title: "AI Agents for Kubernetes Operations - KubeStellar Console",
    description:
      "AI-powered agents that help manage Kubernetes clusters. Natural language cluster operations, automated troubleshooting, and intelligent recommendations.",
    keywords: [
      "kubernetes AI agent",
      "AI kubernetes operations",
      "kubernetes chatbot",
      "AI cluster management",
    ],
  },
  "/cost": {
    title: "Kubernetes Cost Management - KubeStellar Console",
    description:
      "Track and optimize Kubernetes spending across clusters. Cost allocation by namespace, resource right-sizing recommendations, and spending trends.",
    keywords: [
      "kubernetes cost management",
      "kubernetes cost optimization",
      "cluster cost tracking",
      "kubernetes FinOps",
    ],
  },
  "/ai-ml": {
    title: "AI/ML Workload Management on Kubernetes - KubeStellar Console",
    description:
      "Manage AI and machine learning workloads across Kubernetes clusters. GPU scheduling, model serving, training job orchestration, and inference optimization.",
    keywords: [
      "kubernetes AI ML",
      "kubernetes machine learning",
      "GPU workload management",
      "kubernetes model serving",
    ],
  },
  "/nodes": {
    title: "Kubernetes Node Management - KubeStellar Console",
    description:
      "Monitor and manage Kubernetes nodes across clusters. Node health, capacity planning, resource pressure conditions, and scheduling status.",
    keywords: [
      "kubernetes node management",
      "kubernetes node monitoring",
      "node capacity planning",
      "kubernetes node health",
    ],
  },
  "/deployments": {
    title: "Kubernetes Deployment Management - KubeStellar Console",
    description:
      "Manage Kubernetes deployments across clusters. Rolling updates, rollback history, replica scaling, and deployment health monitoring.",
    keywords: [
      "kubernetes deployment management",
      "kubernetes rolling update",
      "deployment scaling",
      "kubernetes deployment monitoring",
    ],
  },
  "/pods": {
    title: "Kubernetes Pod Monitoring - KubeStellar Console",
    description:
      "Monitor pods across all Kubernetes clusters. Real-time pod status, container logs, resource usage, and debugging tools.",
    keywords: [
      "kubernetes pod monitoring",
      "kubernetes pod logs",
      "pod debugging",
      "kubernetes pod status",
    ],
  },
  "/services": {
    title: "Kubernetes Service Management - KubeStellar Console",
    description:
      "Manage Kubernetes services across clusters. Service discovery, endpoint health, load balancing configuration, and ingress management.",
    keywords: [
      "kubernetes service management",
      "kubernetes service discovery",
      "kubernetes load balancing",
      "kubernetes ingress",
    ],
  },
  "/operators": {
    title: "Kubernetes Operator Management - KubeStellar Console",
    description:
      "Manage Kubernetes operators and custom resources across clusters. OLM integration, operator lifecycle, CRD management, and operator health monitoring.",
    keywords: [
      "kubernetes operators",
      "kubernetes OLM",
      "custom resource management",
      "operator lifecycle",
    ],
  },
  "/helm": {
    title: "Helm Chart Management - KubeStellar Console",
    description:
      "Manage Helm releases across Kubernetes clusters. Chart repository browsing, release history, upgrade management, and values configuration.",
    keywords: [
      "helm chart management",
      "kubernetes helm dashboard",
      "helm release management",
      "helm repository",
    ],
  },
  "/events": {
    title: "Kubernetes Event Monitoring - KubeStellar Console",
    description:
      "Monitor Kubernetes events across all clusters in real-time. Warning detection, event correlation, and automated alerting for cluster issues.",
    keywords: [
      "kubernetes events",
      "kubernetes event monitoring",
      "kubernetes warning events",
      "cluster event alerting",
    ],
  },
  "/logs": {
    title: "Kubernetes Log Aggregation - KubeStellar Console",
    description:
      "Centralized log viewing across all Kubernetes clusters. Container logs, pod logs, and cluster-wide log search with filtering and streaming.",
    keywords: [
      "kubernetes logs",
      "kubernetes log aggregation",
      "container log viewer",
      "kubernetes log search",
    ],
  },
  "/compute": {
    title: "Kubernetes Compute Resources - KubeStellar Console",
    description:
      "Manage compute resources across Kubernetes clusters. CPU and memory utilization, resource quotas, limit ranges, and capacity planning.",
    keywords: [
      "kubernetes compute resources",
      "kubernetes resource management",
      "kubernetes capacity planning",
      "CPU memory utilization",
    ],
  },
  "/storage": {
    title: "Kubernetes Storage Management - KubeStellar Console",
    description:
      "Manage storage across Kubernetes clusters. Persistent volumes, storage classes, PVC monitoring, and storage capacity tracking.",
    keywords: [
      "kubernetes storage management",
      "kubernetes persistent volumes",
      "kubernetes PVC",
      "kubernetes storage class",
    ],
  },
  "/network": {
    title: "Kubernetes Network Management - KubeStellar Console",
    description:
      "Manage network policies and service mesh across Kubernetes clusters. Network policy visualization, traffic flow analysis, and connectivity debugging.",
    keywords: [
      "kubernetes network policy",
      "kubernetes service mesh",
      "kubernetes networking",
      "network policy management",
    ],
  },
  "/alerts": {
    title: "Kubernetes Alert Management - KubeStellar Console",
    description:
      "Manage alerts across Kubernetes clusters. Prometheus and Alertmanager integration, alert routing, silencing, and incident management.",
    keywords: [
      "kubernetes alerts",
      "kubernetes prometheus alerts",
      "kubernetes alertmanager",
      "kubernetes incident management",
    ],
  },
  "/security-posture": {
    title: "Kubernetes Security Posture Assessment - KubeStellar Console",
    description:
      "Assess security posture across Kubernetes clusters. CIS benchmarks, pod security standards, image vulnerability scanning, and compliance scoring.",
    keywords: [
      "kubernetes security posture",
      "kubernetes CIS benchmark",
      "kubernetes compliance",
      "pod security standards",
    ],
  },
  "/data-compliance": {
    title: "Kubernetes Data Compliance - KubeStellar Console",
    description:
      "Monitor data compliance across Kubernetes clusters. GDPR, HIPAA, SOC 2 compliance tracking, data residency policies, and audit reporting.",
    keywords: [
      "kubernetes compliance",
      "kubernetes GDPR",
      "kubernetes data governance",
      "kubernetes audit",
    ],
  },
  "/ci-cd": {
    title: "CI/CD Pipeline Monitoring - KubeStellar Console",
    description:
      "Monitor CI/CD pipelines across Kubernetes clusters. Build status tracking, deployment frequency, lead time metrics, and pipeline health dashboards.",
    keywords: [
      "kubernetes CI CD",
      "kubernetes pipeline monitoring",
      "kubernetes deployment frequency",
      "CI CD dashboard",
    ],
  },
  "/arcade": {
    title: "Kubernetes Learning Arcade - KubeStellar Console",
    description:
      "Interactive games and challenges for learning Kubernetes concepts. Practice cluster operations, debugging scenarios, and resource management in a safe environment.",
    keywords: [
      "kubernetes learning",
      "kubernetes training",
      "kubernetes interactive tutorial",
      "kubernetes practice",
    ],
  },
};

/** Human-readable names for route segments used in BreadcrumbList schema */
const ROUTE_DISPLAY_NAMES: Record<string, string> = {
  clusters: "Clusters",
  workloads: "Workloads",
  missions: "Missions",
  "gpu-reservations": "GPU Management",
  deploy: "Deploy",
  security: "Security",
  "llm-d-benchmarks": "LLM Benchmarks",
  gitops: "GitOps",
  marketplace: "Marketplace",
  "ai-agents": "AI Agents",
  cost: "Cost Management",
  nodes: "Nodes",
  deployments: "Deployments",
  pods: "Pods",
  services: "Services",
  operators: "Operators",
  helm: "Helm",
  events: "Events",
  logs: "Logs",
  compute: "Compute",
  storage: "Storage",
  network: "Network",
  alerts: "Alerts",
  "security-posture": "Security Posture",
  "data-compliance": "Data Compliance",
  "ci-cd": "CI/CD",
  "ai-ml": "AI/ML",
  arcade: "Arcade",
};

/** Build Organization JSON-LD — appears once per page for knowledge panel */
function buildOrganizationJsonLd(): string {
  return JSON.stringify({
    "@context": "https://schema.org",
    "@type": "Organization",
    name: ORG_NAME,
    url: ORG_URL,
    logo: LOGO_URL,
    sameAs: [GITHUB_URL, DOCS_URL],
    description:
      "Open-source multi-cluster Kubernetes orchestration platform by the CNCF.",
  });
}

/**
 * Build BreadcrumbList JSON-LD from the current route path.
 * Home → Section (e.g. "/" → "/clusters")
 */
function buildBreadcrumbJsonLd(route: string): string {
  const items: { "@type": string; position: number; name: string; item: string }[] = [
    {
      "@type": "ListItem",
      position: 1,
      name: "Console Home",
      item: SITE_URL,
    },
  ];

  if (route !== "/") {
    const segment = route.replace(/^\//, "");
    const displayName = ROUTE_DISPLAY_NAMES[segment] || segment;
    items.push({
      "@type": "ListItem",
      position: 2,
      name: displayName,
      item: `${SITE_URL}${route}`,
    });
  }

  return JSON.stringify({
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items,
  });
}

/** Generate JSON-LD structured data for the SoftwareApplication */
function buildJsonLd(route: string, meta: RouteMeta): string {
  const jsonLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: SITE_NAME,
    url: `${SITE_URL}${route}`,
    description: meta.description,
    applicationCategory: "DeveloperApplication",
    operatingSystem: "Web",
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
    },
    author: {
      "@type": "Organization",
      name: "KubeStellar",
      url: "https://kubestellar.io",
    },
    keywords: meta.keywords.join(", "),
  };

  // Add specific type for the missions page
  if (route === "/missions") {
    jsonLd["@type"] = "WebApplication";
    jsonLd["featureList"] =
      "CNCF Project Installation, Kubernetes Troubleshooting, AI-Powered Missions";
  }

  return JSON.stringify(jsonLd);
}

/** Build the meta tags HTML to inject into <head> */
function buildMetaTags(route: string, meta: RouteMeta): string {
  const canonicalUrl = `${SITE_URL}${route === "/" ? "" : route}`;

  return [
    // Basic SEO
    `<title>${meta.title}</title>`,
    `<meta name="description" content="${meta.description}" />`,
    `<meta name="keywords" content="${meta.keywords.join(", ")}" />`,
    `<link rel="canonical" href="${canonicalUrl}" />`,

    // Open Graph (Facebook, LinkedIn, Slack)
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="${SITE_NAME}" />`,
    `<meta property="og:title" content="${meta.title}" />`,
    `<meta property="og:description" content="${meta.description}" />`,
    `<meta property="og:url" content="${canonicalUrl}" />`,
    `<meta property="og:image" content="${DEFAULT_IMAGE}" />`,
    `<meta property="og:image:width" content="${OG_IMAGE_WIDTH}" />`,
    `<meta property="og:image:height" content="${OG_IMAGE_HEIGHT}" />`,

    // Twitter Card
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${meta.title}" />`,
    `<meta name="twitter:description" content="${meta.description}" />`,
    `<meta name="twitter:image" content="${DEFAULT_IMAGE}" />`,

    // DNS prefetch for external APIs
    `<link rel="dns-prefetch" href="https://api.github.com" />`,
    `<link rel="dns-prefetch" href="https://www.googletagmanager.com" />`,

    // JSON-LD Structured Data (SoftwareApplication + Organization + BreadcrumbList)
    `<script type="application/ld+json">${buildJsonLd(route, meta)}</script>`,
    `<script type="application/ld+json">${buildOrganizationJsonLd()}</script>`,
    `<script type="application/ld+json">${buildBreadcrumbJsonLd(route)}</script>`,
  ].join("\n    ");
}

export default async (request: Request, context: Context) => {
  const url = new URL(request.url);
  const pathname = url.pathname;

  // Only process HTML page requests (not assets, API calls, etc.)
  if (
    pathname.startsWith("/api/") ||
    pathname.startsWith("/assets/") ||
    pathname.startsWith("/.netlify/") ||
    pathname.includes(".")
  ) {
    return;
  }

  // Serve static landing pages to search engine crawlers and social bots.
  // These pages have rich, crawlable HTML content instead of the empty SPA shell.
  const userAgent = request.headers.get("user-agent") || "";
  const landingPath = LANDING_PAGE_MAP[pathname];
  if (landingPath && isCrawler(userAgent)) {
    const landingUrl = new URL(landingPath, request.url);
    const landingResponse = await fetch(landingUrl.toString());
    if (landingResponse.ok) {
      return new Response(await landingResponse.text(), {
        status: 200,
        headers: {
          "content-type": "text/html; charset=utf-8",
          "cache-control": "public, max-age=3600",
          "x-robots-tag": "index, follow",
        },
      });
    }
    // Fall through to SPA + meta injection if landing page fetch fails
  }

  // Get the response from the origin (index.html via SPA redirect)
  const response = await context.next();
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("text/html")) {
    return response;
  }

  // Find route metadata (exact match or fallback to default)
  const meta = ROUTE_META[pathname] || ROUTE_META["/"];
  if (!meta) return response;

  // Read HTML and inject meta tags
  let html = await response.text();

  // Replace the static <title> with our per-route title and meta tags
  const metaTags = buildMetaTags(pathname, meta);
  html = html.replace(
    "<title>KubeStellar Console</title>",
    metaTags
  );

  return new Response(html, {
    status: response.status,
    headers: {
      ...Object.fromEntries(response.headers.entries()),
      "content-type": "text/html; charset=utf-8",
    },
  });
};

export const config = {
  // Run on all paths except static assets and API routes
  path: "/*",
  // Exclude paths that don't need meta injection
  excludedPath: [
    "/api/*",
    "/assets/*",
    "/.netlify/*",
    "/analytics.html",
    "/*.js",
    "/*.css",
    "/*.png",
    "/*.svg",
    "/*.ico",
    "/*.json",
    "/*.woff2",
    "/landing/*",
  ],
};
