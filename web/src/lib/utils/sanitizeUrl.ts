/**
 * sanitizeUrl — Block dangerous URL schemes (javascript:, data:, vbscript:) to
 * prevent DOM-based XSS when user-controllable values flow into `href` /
 * similar URL attributes.
 *
 * Follow-up to #9028 / addresses CodeQL js/xss alerts 272 + 181 (#9029).
 *
 * Returns a safe placeholder ('about:blank') when the input is unsafe or
 * malformed. Accepts absolute http(s), mailto:, tel:, and protocol-relative
 * (//) URLs as well as relative paths.
 */

// Schemes we explicitly refuse to emit into the DOM
const BLOCKED_SCHEME_PATTERN = /^\s*(javascript|data|vbscript|file):/i
// Placeholder returned for unsafe inputs — renders as a no-op link
const SAFE_FALLBACK_URL = 'about:blank'

export function sanitizeUrl(url: string | null | undefined): string {
  if (!url) return SAFE_FALLBACK_URL
  const trimmed = String(url).trim()
  if (!trimmed) return SAFE_FALLBACK_URL
  if (BLOCKED_SCHEME_PATTERN.test(trimmed)) return SAFE_FALLBACK_URL
  // Also catch obfuscated schemes with embedded control chars / whitespace
  // e.g. "java\tscript:alert(1)" — normalize and re-check.
  const normalized = trimmed.replace(/[\u0000-\u001F\u007F]/g, '')
  if (BLOCKED_SCHEME_PATTERN.test(normalized)) return SAFE_FALLBACK_URL
  return trimmed
}
