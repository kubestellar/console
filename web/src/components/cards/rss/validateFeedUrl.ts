/**
 * Validates an RSS feed URL to prevent SSRF attacks via CORS proxy abuse.
 * Blocks private/reserved IP ranges, non-HTTPS schemes, and embedded credentials.
 */

/** IPv4 ranges that must never be proxied (RFC 1918, loopback, link-local, metadata) */
const PRIVATE_IPV4_PATTERNS = [
  /^127\./,           // loopback
  /^10\./,            // RFC 1918
  /^172\.(1[6-9]|2\d|3[01])\./,  // RFC 1918
  /^192\.168\./,      // RFC 1918
  /^169\.254\./,      // link-local
  /^0\./,             // "this" network
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./, // CGNAT (RFC 6598)
  /^192\.0\.0\./,     // IETF protocol assignments
  /^198\.1[89]\./,    // benchmarking (RFC 2544)
  /^224\./,           // multicast
  /^255\.255\.255\.255$/,  // broadcast
]

/** IPv6 patterns that must never be proxied */
const PRIVATE_IPV6_PATTERNS = [
  /^::1$/,            // loopback
  /^fe80:/i,          // link-local
  /^fc00:/i,          // unique local (RFC 4193)
  /^fd/i,             // unique local
  /^::$/,             // unspecified
  /^::ffff:(127\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|169\.254\.)/i, // IPv4-mapped private
]

export interface FeedUrlValidationResult {
  valid: boolean
  error?: string
}

/**
 * Returns true if the hostname resolves to a private/reserved IP range.
 * Only checks hostnames that look like IP addresses (dot-notation or bracket IPv6).
 */
function isPrivateHost(hostname: string): boolean {
  // Strip brackets from IPv6
  const host = hostname.replace(/^\[|\]$/g, '')

  // Check IPv4
  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)) {
    return PRIVATE_IPV4_PATTERNS.some(pattern => pattern.test(host))
  }

  // Check IPv6
  if (host.includes(':')) {
    return PRIVATE_IPV6_PATTERNS.some(pattern => pattern.test(host))
  }

  // Hostname-based checks for common internal names
  const lower = host.toLowerCase()
  if (
    lower === 'localhost' ||
    lower.endsWith('.local') ||
    lower.endsWith('.internal') ||
    lower.endsWith('.localhost')
  ) {
    return true
  }

  return false
}

/**
 * Validates a feed URL before it is sent to a CORS proxy.
 * Rejects URLs that could enable SSRF or proxy abuse.
 */
export function validateFeedUrl(url: string): FeedUrlValidationResult {
  if (!url || !url.trim()) {
    return { valid: false, error: 'Feed URL is required' }
  }

  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return { valid: false, error: 'Invalid URL format' }
  }

  // Only allow HTTPS (block http:, file:, ftp:, data:, javascript:, etc.)
  if (parsed.protocol !== 'https:') {
    return { valid: false, error: 'Only HTTPS feed URLs are allowed' }
  }

  // Block embedded credentials (user:pass@host)
  if (parsed.username || parsed.password) {
    return { valid: false, error: 'Feed URLs must not contain credentials' }
  }

  // Block private/reserved IP ranges and internal hostnames
  if (isPrivateHost(parsed.hostname)) {
    return { valid: false, error: 'Feed URLs pointing to private/internal networks are not allowed' }
  }

  // Block URLs with port numbers pointing to common internal services
  if (parsed.port && parsed.port !== '443') {
    return { valid: false, error: 'Only standard HTTPS port (443) is allowed for feed URLs' }
  }

  return { valid: true }
}
