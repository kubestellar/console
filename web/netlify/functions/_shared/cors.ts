/**
 * Shared CORS helper for Netlify Functions.
 *
 * Why: OWASP ZAP (issue #9879) flagged "Cross-Domain Misconfiguration" on
 * production — previously, most of our Netlify Functions responded with a
 * blanket `Access-Control-Allow-Origin: *`. That is wrong for endpoints
 * consumed by the console itself, because several frontend hooks (auth,
 * rewards, persistence, version-check) send `credentials: 'include'`, and
 * the combination of `*` + credentialed requests is a documented
 * cross-origin leakage pattern.
 *
 * This helper echoes the request origin back only if it matches an
 * explicit allowlist, and adds `Vary: Origin` so shared caches key
 * responses per-origin. For disallowed origins, CORS headers are simply
 * omitted — the browser will still reject the cross-origin read.
 *
 * Endpoints that are intentionally cross-origin (shields.io badge
 * embeddings: acmm-badge, rewards-badge) must NOT use this helper and
 * may keep their explicit `*` — they are public, unauthenticated, and
 * designed to be fetched from arbitrary README hosts.
 */

/** Production origin for the hosted console. */
const PROD_ORIGIN = "https://console.kubestellar.io";

/** Netlify preview deploys — `{branch}--{sitename}.netlify.app`. */
const NETLIFY_PREVIEW_RE = /^https:\/\/[a-z0-9-]+--kubestellar-console\.netlify\.app$/i;

/** Netlify branch + PR deploys for the kubestellar console site. */
const NETLIFY_DEPLOY_RE =
  /^https:\/\/deploy-preview-\d+--kubestellar-console\.netlify\.app$/i;

/** Local development (Vite default + project-standard port 5174). */
const LOCALHOST_RE = /^http:\/\/(localhost|127\.0\.0\.1):(5173|5174|8080|8888)$/;

/** Static allowlist of exact-match allowed origins. */
const ALLOWED_EXACT = new Set<string>([PROD_ORIGIN]);

/**
 * Return true if the given Origin header value is allowed to make CORS
 * requests to our Netlify Functions.
 */
export function isAllowedOrigin(origin: string | null | undefined): boolean {
  if (!origin) return false;
  if (ALLOWED_EXACT.has(origin)) return true;
  if (NETLIFY_PREVIEW_RE.test(origin)) return true;
  if (NETLIFY_DEPLOY_RE.test(origin)) return true;
  if (LOCALHOST_RE.test(origin)) return true;
  return false;
}

export interface CorsOptions {
  /** Allowed HTTP methods, e.g. "GET, OPTIONS" or "POST, OPTIONS". */
  methods: string;
  /** Allowed request headers, e.g. "Content-Type, Authorization". */
  headers?: string;
  /**
   * Expose specific response headers to browser JS. Rarely needed.
   */
  exposeHeaders?: string;
}

/**
 * Build a per-request CORS header set. Only echoes `Access-Control-Allow-Origin`
 * when the request Origin is on the allowlist; otherwise CORS headers are
 * omitted entirely. Always sets `X-Content-Type-Options: nosniff` (addresses
 * a separate low-severity ZAP finding on the same endpoints).
 */
export function buildCorsHeaders(
  request: Request,
  opts: CorsOptions,
): Record<string, string> {
  const headers: Record<string, string> = {
    "X-Content-Type-Options": "nosniff",
    Vary: "Origin",
  };

  const origin = request.headers.get("origin");
  if (isAllowedOrigin(origin)) {
    headers["Access-Control-Allow-Origin"] = origin as string;
    headers["Access-Control-Allow-Methods"] = opts.methods;
    if (opts.headers) {
      headers["Access-Control-Allow-Headers"] = opts.headers;
    }
    if (opts.exposeHeaders) {
      headers["Access-Control-Expose-Headers"] = opts.exposeHeaders;
    }
  }

  return headers;
}

/**
 * Handle a preflight OPTIONS request. Returns a 204 with the CORS headers
 * if the origin is allowed, or 403 otherwise. Callers should invoke this
 * at the top of their handler when `request.method === "OPTIONS"`.
 */
export function handlePreflight(
  request: Request,
  opts: CorsOptions,
): Response {
  const origin = request.headers.get("origin");
  const status = isAllowedOrigin(origin) ? 204 : 403;
  return new Response(null, { status, headers: buildCorsHeaders(request, opts) });
}
