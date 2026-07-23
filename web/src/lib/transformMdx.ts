/**
 * XSS sanitization functions for MDX/HTML content
 * Protects the docs system from cross-site scripting attacks
 */

const DANGEROUS_TAG_PATTERN = /<(script|iframe|object|embed|form|input|button|img|svg|style)\b[^>]*>[\s\S]*?<\/\1>|<\1[^>]*\/>/gi
const EVENT_HANDLER_PATTERN = /\s+on\w+\s*=\s*["'][^"']*["']|\s+on\w+\s*=\s*[^\s>]*/gi
const JAVASCRIPT_URL_PATTERN = /\b(href|src|action)\s*=\s*["']?javascript:/gi
const DATA_URI_SCRIPT_PATTERN = /\b(href|src)\s*=\s*["']?data:text\/html[^"'>\s]*["']?/gi

/**
 * Sanitizes HTML by removing dangerous tags, event handlers, and javascript: URLs.
 * Removes script, iframe, object, embed, form, input, button, img, svg, and style tags.
 * Strips event handler attributes (onclick, onerror, etc.) and javascript: protocol URLs.
 * @param html - The HTML string to sanitize
 * @returns Sanitized HTML string
 */
export function sanitizeHtmlForMdx(html: string): string {
  if (typeof html !== 'string') {
    return ''
  }

  let result = html
    // Remove dangerous tags and their content
    .replace(DANGEROUS_TAG_PATTERN, '')
    // Remove event handlers
    .replace(EVENT_HANDLER_PATTERN, '')
    // Remove javascript: URLs
    .replace(JAVASCRIPT_URL_PATTERN, '$1="')
    // Remove data: URLs with HTML content
    .replace(DATA_URI_SCRIPT_PATTERN, '$1=""')

  return result
}

/**
 * Recursively sanitizes HTML until the output is stable (no changes between iterations).
 * This handles cases where sanitization itself produces attackable patterns.
 * @param html - The HTML string to sanitize
 * @param maxIterations - Maximum number of sanitization iterations (default: 10)
 * @returns Fully sanitized HTML string
 */
export function stripUntilStable(html: string, maxIterations = 10): string {
  if (typeof html !== 'string') {
    return ''
  }

  let current = html
  let previous = ''
  let iterations = 0

  while (current !== previous && iterations < maxIterations) {
    previous = current
    current = sanitizeHtmlForMdx(current)
    iterations++
  }

  return current
}
