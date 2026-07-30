/**
 * urlHostname — Safe URL hostname extraction helpers.
 *
 * Substring checks like `url.includes('trusted.com')` are bypassable:
 * `evil.com/path?q=trusted.com` passes the check even though the host is
 * `evil.com`. These helpers parse the URL with the WHATWG URL API and check
 * the structural `hostname` or `protocol` property instead.
 *
 * Addresses CodeQL js/incomplete-url-substring-sanitization (issue #9119).
 */

/**
 * Returns the lowercase hostname of a URL string, or an empty string if the
 * URL is malformed or relative.
 *
 * @example
 * parsedHostname('https://api.cluster.eks.amazonaws.com:6443') // 'api.cluster.eks.amazonaws.com'
 * parsedHostname('not-a-url') // ''
 */
export function parsedHostname(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase()
  } catch {
    return ''
  }
}

/**
 * Returns true if the parsed hostname of `url` ends with `.suffix` or equals
 * `suffix` exactly (suffix should be given WITHOUT a leading dot).
 *
 * This is the correct replacement for `url.includes('.suffix.tld')` checks.
 *
 * @example
 * hostnameEndsWith('https://api.cluster.eks.amazonaws.com:6443', 'eks.amazonaws.com') // true
 * hostnameEndsWith('https://evil.com/path?q=eks.amazonaws.com', 'eks.amazonaws.com') // false
 */
export function hostnameEndsWith(url: string, suffix: string): boolean {
  const host = parsedHostname(url)
  if (!host) return false
  const lc = suffix.toLowerCase()
  return host === lc || host.endsWith('.' + lc)
}

/**
 * Returns true if the parsed hostname of `url` contains `segment` as a
 * dot-separated label — i.e. the segment appears between dots (or at the
 * start/end) of the hostname.
 *
 * This replaces `url.includes('.segment.')` checks where the segment can
 * appear anywhere in the hostname.
 *
 * @example
 * hostnameContainsLabel('https://api.fmaas.res.ibm.com:6443', 'fmaas') // true
 * hostnameContainsLabel('https://evil.com/fmaas', 'fmaas')             // false
 */
export function hostnameContainsLabel(url: string, segment: string): boolean {
  const host = parsedHostname(url)
  if (!host) return false
  const lc = segment.toLowerCase()
  const parts = host.split('.')
  return parts.includes(lc)
}

/**
 * Returns the lowercase protocol (scheme) of a URL string (e.g. 'https:'),
 * or an empty string for malformed/relative URLs.
 */
export function parsedProtocol(url: string): string {
  try {
    return new URL(url).protocol.toLowerCase()
  } catch {
    return ''
  }
}

/**
 * Returns true if `url` has an https: or http: scheme (checked via URL
 * parsing, not substring matching).
 */
export function isHttpUrl(url: string): boolean {
  const proto = parsedProtocol(url)
  return proto === 'https:' || proto === 'http:'
}
