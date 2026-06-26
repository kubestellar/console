/**
 * Netlify Edge Function: robots.txt override
 *
 * The default robots.txt in the build (web/public/robots.txt) blocks all crawlers
 * to protect self-hosted and cluster deployments from accidental indexing.
 *
 * This edge function overrides it for console.kubestellar.io with an SEO-friendly
 * version that allows crawling of public pages.
 */

const SITE_URL = "https://console.kubestellar.io";

/** Cache robots.txt for 24 hours */
const CACHE_MAX_AGE_SECONDS = 86_400;

const ROBOTS_TXT = `# KubeStellar Console - Public site
# https://console.kubestellar.io

User-agent: *
Allow: /
Allow: /clusters
Allow: /workloads
Allow: /missions
Allow: /gpu-reservations
Allow: /deploy
Allow: /security
Allow: /gitops
Allow: /marketplace
Allow: /ai-agents
Allow: /llm-d-benchmarks
Allow: /cost

# Block internal/dev routes from indexing
Disallow: /api/
Disallow: /login
Disallow: /auth/
Disallow: /settings
Disallow: /users
Disallow: /widget
Disallow: /__perf/
Disallow: /test/
Disallow: /history

# Sitemap
Sitemap: ${SITE_URL}/sitemap.xml
`;

export default async () => {
  return new Response(ROBOTS_TXT, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": `public, max-age=${CACHE_MAX_AGE_SECONDS}`,
    },
  });
};

export const config = {
  path: "/robots.txt",
};
