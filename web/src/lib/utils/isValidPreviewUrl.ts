/**
 * isValidPreviewUrl — Allowlist-based validator for Netlify deploy-preview URLs.
 *
 * Defense-in-depth: even though preview URLs originate from our backend,
 * a backend/database compromise could inject arbitrary URLs. This check
 * ensures only Netlify deploy-preview and the production console host are
 * opened via window.open() or rendered in <a href>.
 *
 * Extracted from UpdatesTab.tsx (PR #13387) so both UpdatesTab and
 * FeatureRequestList can reuse the same validation logic.
 *
 * Addresses issue #13386 (open redirect in preview URL handling).
 */

const ALLOWED_PREVIEW_HOSTS = [
  '.netlify.app',
  '.console-deploy-preview.kubestellar.io',
] as const

const ALLOWED_EXACT_HOSTS = [
  'console.kubestellar.io',
] as const

export function isValidPreviewUrl(url: string | null | undefined): boolean {
  if (!url) return false

  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:') return false
    return (
      ALLOWED_EXACT_HOSTS.some((host) => parsed.hostname === host) ||
      ALLOWED_PREVIEW_HOSTS.some((suffix) => parsed.hostname.endsWith(suffix))
    )
  } catch {
    return false
  }
}
