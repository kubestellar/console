/**
 * Netlify Edge Function: SEO Meta Tag Injection
 *
 * Injects per-route <title>, <meta description>, Open Graph tags, and JSON-LD
 * structured data into the HTML response. This only runs on Netlify (not on
 * localhost or cluster deployments), so the SPA remains clean for self-hosted users.
 *
 * Edge Functions run at the CDN level and can modify responses before they reach
 * the browser, making them ideal for injecting SEO content into an SPA's index.html.
 */

import type { Context } from "https://edge.netlify.com";

const SITE_URL = "https://console.kubestellar.io";
const SITE_NAME = "KubeStellar Console";
const DEFAULT_IMAGE = `${SITE_URL}/kubestellar.png`;

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
};

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

    // JSON-LD Structured Data
    `<script type="application/ld+json">${buildJsonLd(route, meta)}</script>`,
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
  ],
};
