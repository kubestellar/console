/**
 * HTML sanitization utilities for MDX docs rendering.
 *
 * sanitizeHtmlForMdx — allowlist-based sanitizer that strips all dangerous
 * HTML constructs (script tags, event handlers, javascript: / data: URLs,
 * SVG-embedded payloads) before content is rendered as MDX documentation.
 *
 * stripUntilStable — repeatedly applies sanitizeHtmlForMdx until the output
 * reaches a fixed point (idempotent), guarding against multi-pass injection
 * attacks where a single sanitization pass leaves residual dangerous content.
 */

import DOMPurify from 'isomorphic-dompurify'

/** Tags that are safe to render in MDX documentation. */
const ALLOWED_TAGS = [
  'a', 'abbr', 'b', 'blockquote', 'br', 'caption', 'cite', 'code',
  'col', 'colgroup', 'dd', 'details', 'div', 'dl', 'dt', 'em',
  'figure', 'figcaption', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'hr', 'i', 'img', 'kbd', 'li', 'mark', 'ol', 'p', 'pre', 'q',
  's', 'section', 'small', 'span', 'strong', 'sub', 'summary',
  'sup', 'table', 'tbody', 'td', 'th', 'thead', 'tr', 'ul', 'var',
]

/** Attributes that are safe to render in MDX documentation. */
const ALLOWED_ATTR = [
  'alt', 'class', 'href', 'id', 'lang', 'src', 'title',
  'width', 'height', 'colspan', 'rowspan', 'scope',
  'type', 'start', 'reversed', 'open',
]

/**
 * Sanitizes an HTML string for safe inclusion in MDX documentation pages.
 *
 * Uses an explicit allowlist of tags and attributes so that static-analysis
 * tools can verify no dangerous scheme or element reaches the DOM.
 * All on* event handlers, style attributes, and dangerous URL schemes
 * (javascript:, data:, vbscript:) are stripped unconditionally.
 *
 * @param html - Raw HTML string (may contain attacker-controlled content)
 * @returns Sanitized HTML string safe for dangerouslySetInnerHTML / MDX render
 */
export function sanitizeHtmlForMdx(html: string): string {
  if (typeof html !== 'string' || !html) return ''

  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    FORBID_ATTR: ['style', 'formaction', 'action'],
    FORBID_TAGS: [
      'script', 'style', 'iframe', 'object', 'embed',
      'form', 'input', 'button', 'meta', 'link', 'base', 'noscript',
    ],
    ALLOW_DATA_ATTR: false,
    ALLOW_ARIA_ATTR: true,
    FORCE_BODY: false,
    RETURN_DOM: false,
    RETURN_DOM_FRAGMENT: false,
  })
}

const DEFAULT_MAX_ITERATIONS = 5

/**
 * Repeatedly sanitizes an HTML string until the output is stable (unchanged).
 *
 * A single sanitization pass can be insufficient when crafted payloads rely
 * on the parser re-constructing dangerous markup from residual fragments.
 * Iterating until stability (idempotency) closes this gap.
 * `maxIterations` bounds the loop to prevent pathological inputs from causing
 * an infinite loop; the last sanitized value is returned if the limit is hit.
 *
 * @param html - Raw HTML string to sanitize
 * @param maxIterations - Maximum sanitization passes before giving up (default: 5)
 * @returns Stable sanitized HTML string
 */
export function stripUntilStable(html: string, maxIterations = DEFAULT_MAX_ITERATIONS): string {
  if (typeof html !== 'string' || !html) return ''

  let current = html
  for (let i = 0; i < maxIterations; i++) {
    const next = sanitizeHtmlForMdx(current)
    if (next === current) return current
    current = next
  }
  return current
}
