/**
 * Netlify Edge Function: Dynamic sitemap.xml
 *
 * Generates a sitemap for console.kubestellar.io with all public routes.
 * Only runs on Netlify — self-hosted/cluster deployments serve the default
 * robots.txt which blocks all crawlers, so no sitemap is needed there.
 */

const SITE_URL = "https://console.kubestellar.io";

/** Cache sitemap for 24 hours */
const CACHE_MAX_AGE_SECONDS = 86_400;

interface SitemapEntry {
  path: string;
  changefreq: string;
  priority: string;
}

/** Public routes to include in the sitemap with their update frequency and priority */
const SITEMAP_ENTRIES: SitemapEntry[] = [
  { path: "/", changefreq: "daily", priority: "1.0" },
  { path: "/clusters", changefreq: "daily", priority: "0.9" },
  { path: "/workloads", changefreq: "daily", priority: "0.9" },
  { path: "/missions", changefreq: "weekly", priority: "0.9" },
  { path: "/deploy", changefreq: "daily", priority: "0.8" },
  { path: "/gpu-reservations", changefreq: "daily", priority: "0.8" },
  { path: "/security", changefreq: "daily", priority: "0.8" },
  { path: "/llm-d-benchmarks", changefreq: "weekly", priority: "0.8" },
  { path: "/ai-agents", changefreq: "weekly", priority: "0.7" },
  { path: "/gitops", changefreq: "daily", priority: "0.7" },
  { path: "/marketplace", changefreq: "weekly", priority: "0.7" },
  { path: "/cost", changefreq: "daily", priority: "0.7" },
  { path: "/nodes", changefreq: "daily", priority: "0.6" },
  { path: "/deployments", changefreq: "daily", priority: "0.6" },
  { path: "/pods", changefreq: "daily", priority: "0.6" },
  { path: "/services", changefreq: "daily", priority: "0.6" },
  { path: "/operators", changefreq: "weekly", priority: "0.6" },
  { path: "/helm", changefreq: "weekly", priority: "0.6" },
  { path: "/events", changefreq: "daily", priority: "0.5" },
  { path: "/logs", changefreq: "daily", priority: "0.5" },
  { path: "/compute", changefreq: "weekly", priority: "0.5" },
  { path: "/storage", changefreq: "weekly", priority: "0.5" },
  { path: "/network", changefreq: "weekly", priority: "0.5" },
  { path: "/alerts", changefreq: "daily", priority: "0.5" },
  { path: "/security-posture", changefreq: "weekly", priority: "0.5" },
  { path: "/data-compliance", changefreq: "weekly", priority: "0.5" },
  { path: "/ci-cd", changefreq: "weekly", priority: "0.5" },
  { path: "/ai-ml", changefreq: "weekly", priority: "0.5" },
  { path: "/arcade", changefreq: "monthly", priority: "0.3" },
];

export default async () => {
  const today = new Date().toISOString().split("T")[0];

  const urls = SITEMAP_ENTRIES.map(
    (entry) => `  <url>
    <loc>${SITE_URL}${entry.path}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${entry.changefreq}</changefreq>
    <priority>${entry.priority}</priority>
  </url>`
  ).join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`;

  return new Response(xml, {
    headers: {
      "content-type": "application/xml; charset=utf-8",
      "cache-control": `public, max-age=${CACHE_MAX_AGE_SECONDS}`,
    },
  });
};

export const config = {
  path: "/sitemap.xml",
};
