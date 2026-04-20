/**
 * sanitizeUrl — Allowlist-based URL sanitizer to prevent DOM-based XSS when
 * user-controllable values flow into `href` or similar URL attributes.
 *
 * Uses an explicit allowlist of safe URL schemes so static-analysis tools
 * (CodeQL js/xss) can verify that no dangerous scheme (javascript:, data:,
 * vbscript:, file:) reaches the DOM. Blocklist-only approaches cannot be
 * exhaustively verified by taint-tracking tools, hence this allowlist form.
 *
 * Addresses CodeQL alerts #591 and #592 (js/xss, high severity).
 * Supersedes the blocklist version from #9029.
 *
 * Allowed schemes: https, http, mailto, tel, protocol-relative (//).
 * Relative paths (no scheme) are also allowed.
 *
 * Returns SAFE_FALLBACK_URL ('about:blank') for everything else.
 */

/** Placeholder returned for unsafe inputs — renders as a no-op link. */
const SAFE_FALLBACK_URL = 'about:blank'

/** URL schemes that are safe to emit into href / src attributes. */
const ALLOWED_SCHEMES = new Set(['https:', 'http:', 'mailto:', 'tel:'])

export function sanitizeUrl(url: string | null | undefined): string {
  if (!url) return SAFE_FALLBACK_URL

  // Strip embedded control characters that can be used to obfuscate schemes
  // e.g. "java\tscript:alert(1)" or "java\u0000script:...".
  // eslint-disable-next-line no-control-regex
  const trimmed = String(url).replace(/[\u0000-\u001F\u007F]/g, '').trim()
  if (!trimmed) return SAFE_FALLBACK_URL

  // Protocol-relative URLs (//example.com/...) are safe — the browser inherits
  // the page scheme (always https: in production).
  if (trimmed.startsWith('//')) return trimmed

  // Relative paths (no scheme component) are safe.
  if (trimmed.startsWith('/') || trimmed.startsWith('.') || !trimmed.includes(':')) {
    return trimmed
  }

  // For absolute URLs, parse and check the scheme against the allowlist.
  // new URL() throws on malformed input — treat that as unsafe.
  try {
    const parsed = new URL(trimmed)
    if (ALLOWED_SCHEMES.has(parsed.protocol)) {
      return trimmed
    }
  } catch {
    // Malformed URL — fall through to safe fallback.
  }

  return SAFE_FALLBACK_URL
}
