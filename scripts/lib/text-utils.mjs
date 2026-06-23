/**
 * Shared text processing utilities for mission generation scripts.
 * Extracted from generate-cncf-missions.mjs to enable reuse across
 * generate-platform-missions.mjs and generate-cncf-install-missions.mjs.
 */

const ENGLISH_STOPWORDS = new Set([
  'the', 'is', 'in', 'it', 'of', 'and', 'to', 'a', 'for', 'that', 'this',
  'with', 'on', 'are', 'was', 'be', 'as', 'by', 'or', 'an', 'not', 'but',
  'from', 'at', 'have', 'has', 'had', 'will', 'can', 'do', 'if', 'when',
  'which', 'their', 'would', 'been', 'were', 'there', 'should', 'we', 'you',
])
const MIN_ENGLISH_STOPWORD_RATIO = 0.08

/**
 * Strip PR template boilerplate, HTML comments, image markdown, email reply
 * headers, emoji shortcodes, and other non-content noise from issue/PR text.
 */
export function cleanText(text) {
  let t = text
  let prev
  do { prev = t; t = t.replace(/<!--[\s\S]*?-->/g, '') } while (t !== prev)
  return t
    .replace(/# \[?Codecov\]?[\s\S]*?(?=\n#{1,4}\s|\n---|\n\n\n|$)/gi, '')
    .replace(/!\[.*?\]\(https?:\/\/[^)]+\)/g, '')
    .replace(/<img\s+[^>]*>/gi, '')
    .replace(/^On\s+.{10,80}\s+wrote:\s*$/gm, '')
    .replace(/^>\s.*$/gm, '')
    .replace(/:[a-z0-9_+-]+:/gi, '')
    .replace(/\|[^|]*codecov[^|]*\|[^|]*\|[^|]*\|/gi, '')
    .replace(/\n\s*Checklist:?\s*\n[\s\S]*$/gi, '')
    .replace(/\n\s*Note on DCO:?\s*\n[\s\S]*?(?=\n#{1,4}\s|\n\n[A-Z]|\n---|\s*$)/gi, '')
    .replace(/^\s*[-*]\s*\[[ x]\]\s*.*/gm, '')
    .replace(/Please ensure your pull request adheres[\s\S]*?(?=\n#{1,4}\s|\n\n[A-Z]|\n---|\s*$)/gi, '')
    .replace(/For first.time contributors[\s\S]*?(?=\n#{1,4}\s|\n\n[A-Z]|\n---|\s*$)/gi, '')
    .replace(/\bcc\s+@[a-zA-Z0-9_-]+/g, '')
    .replace(/\bcc\s*$/gm, '')
    .replace(/#{1,4}\s*\d+\.\s+(?:Why is this|Which issue|Which documentation|Does this introduce|Special notes|If applicable|Release note|What type|How has this|Additional context)[^\n]*/gi, '')
    .replace(/\*\*(?:What type of PR|Any specific area|What this PR does|Which issue|Does this introduce|Additional context|Describe the bug|Describe the solution|Is your feature request|Expected behavi|Actual behavi|Steps to reproduce|Environment|Additional information|How to reproduce|Anything else)[^*]*\*\*:?\s*/gi, '')
    .replace(/~[^~]+(?:not ready|work in progress|WIP|draft|do not merge)[^~]*~/gi, '')
    .replace(/^\s*>?\s*\/(?:kind|area|sig)\s+\w+.*$/gm, '')
    .replace(/^\s*>\s*Uncomment\s+.*/gm, '')
    .replace(/^\s*#{1,4}\s*(?:Checklist|Further Comments?|Milestone|Related issue|Proposed Changes?|Explanation)\s*$/gim, '')
    .replace(/^\s*#{1,4}\s*Milestone of this PR.*$/gim, '')
    .replace(/#{1,4}\s*Self Checks?[\s\S]*?(?=\n#{1,4}\s[^#]|\n---|\s*$)/gi, '')
    .replace(/(?:By submitting this pull request|I have signed the CLA|Contributor License Agreement|I certify that)[\s\S]*?(?=\n#{1,4}\s|\n\n[A-Z]|\n---|\s*$)/gi, '')
    .replace(/HashiCorp employees[\s\S]*?(?=\n#{1,4}\s|\n\n[A-Z]|\n---|\s*$)/gi, '')
    .replace(/Harbor is an open source project[\s\S]*?(?=\n#{1,4}\s|\n\n[A-Z]|\n---|\s*$)/gi, '')
    .replace(/^\s*This is a\s*(?:bug fix|feature|improvement|enhancement|refactor|doc(?:umentation)?)\s*\.?\s*$/gim, '')
    .replace(/^\s*#\d+\s*$/gm, '')
    .replace(/^\s*(?:closes?|fixes?|resolves?):?\s+(?:#\d+|https:\/\/github\.com\/[^\s]+).*$/gim, '')
    .replace(/https:\/\/github\.com\/[^/]+\/[^/]+\/assets\/\S+/g, '')
    .replace(/\r\n/g, '\n')
    .replace(/^\s*:\s*/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/**
 * Detects garbage snippets that shouldn't be used as mission content.
 * Catches Codecov tables, CI bot messages, git diffs, image references, etc.
 */
export function isGarbageSnippet(snippet) {
  const lower = snippet.toLowerCase()
  if (lower.includes('codecov') || lower.includes('coverage δ') || lower.includes('impacted files')) return true
  if (snippet.startsWith('diff --git') || /^[+-]{3} [ab]\//.test(snippet)) return true
  if ((snippet.match(/!\[.*?\]\(https?:\/\//g) || []).length > 2) return true
  if (lower.includes('invalid pr title') || lower.includes('has been automatically marked as stale')) return true
  if (lower.includes('yay thanks') || lower.includes('sorry about') || lower.includes('lgtm') || lower.includes('btw ')) return true
  if ((snippet.match(/@[a-zA-Z0-9_-]+/g) || []).length >= 2) return true
  const codeChars = /[={}$:;|><\[\]()]/
  if (!codeChars.test(snippet) && snippet.length < 200) return true
  if (lower.includes('for first time contributors') || lower.includes('please ensure your pull request')) return true
  if (lower.includes('query performance') && lower.includes('![image]')) return true
  if (lower.includes('"tag_name"') || lower.includes('"html_url"') || lower.includes('"created_at"')) return true
  const urlMatches = snippet.match(/https?:\/\/[^\s"')>]+/g) || []
  if (urlMatches.some(u => { try { return new URL(u).hostname === 'api.github.com' } catch { return false } })) return true
  const words = snippet.split(/\s+/)
  const englishWords = words.filter(w => ENGLISH_STOPWORDS.has(w.toLowerCase()))
  const PROSE_THRESHOLD = 0.25
  if (words.length > 10 && (englishWords.length / words.length) > PROSE_THRESHOLD) return true
  const lines = snippet.split('\n')
  const quotedLines = lines.filter(l => l.trim().startsWith('>')).length
  if (quotedLines > lines.length * 0.7 && lines.length > 3) return true
  if (lower.includes('contributor license') || lower.includes('signed the cla') || lower.includes('developer certificate')) return true
  if (lower.includes('run actions/') || lower.includes('##[error]') || lower.includes('##[warning]')) return true
  return false
}

/**
 * Truncate text at the last word boundary within maxLen.
 */
export function truncateAtWordBoundary(text, maxLen, { ellipsis = false } = {}) {
  if (!text || text.length <= maxLen) return text || ''
  const truncated = text.slice(0, maxLen)
  const lastSpace = truncated.lastIndexOf(' ')
  const MIN_TRUNCATION_POINT = 20
  const result = lastSpace < MIN_TRUNCATION_POINT ? truncated : truncated.slice(0, lastSpace)
  return ellipsis ? `${result}…` : result
}

/**
 * Truncate at the last sentence boundary (period followed by space or end)
 * within maxLen. Falls back to word boundary if no sentence break found.
 */
const MIN_SENTENCE_TRUNCATION_POINT = 50
export function truncateAtSentenceBoundary(text, maxLen) {
  if (!text || text.length <= maxLen) return text || ''
  const truncated = text.slice(0, maxLen)
  const sentenceEnd = Math.max(
    truncated.lastIndexOf('. '),
    truncated.lastIndexOf('.\n'),
  )
  if (sentenceEnd >= MIN_SENTENCE_TRUNCATION_POINT) {
    return truncated.slice(0, sentenceEnd + 1)
  }
  return truncateAtWordBoundary(text, maxLen)
}

/**
 * Extract useful content from numbered PR templates.
 */
export function extractFromNumberedTemplate(text) {
  if (!text) return ''
  const numberedSections = text.match(/#{1,4}\s*\d+\.\s+.+/g)
  if (!numberedSections || numberedSections.length < 2) return text
  const parts = text.split(/#{1,4}\s*\d+\.\s+.+\n?/)
  const contentParts = parts
    .map(p => p.trim())
    .filter(p => {
      if (p.length < 20) return false
      if (/^#\d+\s*$/.test(p) || /^https:\/\/github\.com/.test(p)) return false
      if (/^(yes|no|none|n\/a)\.?\s*$/i.test(p)) return false
      if (p.length < 80 && /^(not that|i think|i believe|possibly|maybe|probably|sure|thanks|thank you)/i.test(p)) return false
      if (/^#\d+[\s\n]*(?:#\d+[\s\n]*)*$/.test(p)) return false
      return true
    })
  return contentParts.join('\n\n')
}

/**
 * Extract content from bold-header PR templates (Falco, KEDA, etc).
 */
export function extractFromBoldTemplate(text) {
  if (!text) return ''
  const boldHeaders = text.match(/\*\*[^*]+\*\*/g)
  if (!boldHeaders || boldHeaders.length < 2) return text
  const parts = text.split(/\*\*[^*]+\*\*\s*\n?/)
  const contentParts = parts
    .map(p => p.trim())
    .filter(p => {
      if (p.length < 20) return false
      if (/^>\s*(?:Uncomment|\/kind|\/area|\/sig)/m.test(p)) return false
      if (/^(?:>\s*)?\/(?:kind|area|sig)\s+\w+$/gm.test(p) && p.length < 100) return false
      return true
    })
  return contentParts.join('\n\n')
}

/**
 * Strip PR template boilerplate and return useful content only.
 */
export function stripPRTemplate(text) {
  if (!text) return ''
  let cleaned = text
  let prev
  do { prev = cleaned; cleaned = cleaned.replace(/<!--[\s\S]*?-->/g, '') } while (cleaned !== prev)
  const templateHeaders = [
    /#{1,4}\s*What type of PR[\s\S]*?(?=\n#{1,4}\s|\n---|\Z)/gi,
    /#{1,4}\s*What this PR does[\s\S]*?(?=\n#{1,4}\s|\n---|\Z)/gi,
    /#{1,4}\s*Which issue.*?fixes[\s\S]*?(?=\n#{1,4}\s|\n---|\Z)/gi,
    /#{1,4}\s*Special notes for.*?reviewer[\s\S]*?(?=\n#{1,4}\s|\n---|\Z)/gi,
    /#{1,4}\s*If applicable[\s\S]*?(?=\n#{1,4}\s|\n---|\Z)/gi,
    /#{1,4}\s*Release note[\s\S]*?(?=\n#{1,4}\s|\n---|\Z)/gi,
    /#{1,4}\s*Does this PR introduce a user-facing[\s\S]*?(?=\n#{1,4}\s|\n---|\Z)/gi,
    /```release-note[\s\S]*?```/gi,
  ]
  for (const re of templateHeaders) {
    cleaned = cleaned.replace(re, '')
  }
  cleaned = cleaned.replace(/^\s*[-*]\s*\[[ x]\]\s*.*/gm, '')
  cleaned = cleaned.replace(/\n\s*Checklist:?\s*\n[\s\S]*$/gi, '')
  cleaned = cleaned.replace(/\n\s*Note on DCO:?\s*\n[\s\S]*?(?=\n#{1,4}\s|\n\n[A-Z]|\n---|\s*$)/gi, '')
  cleaned = cleaned.replace(/Please ensure your pull request adheres[\s\S]*?(?=\n#{1,4}\s|\n\n[A-Z]|\n---|\s*$)/gi, '')
  cleaned = cleaned.replace(/For first.time contributors[\s\S]*?(?=\n#{1,4}\s|\n\n[A-Z]|\n---|\s*$)/gi, '')
  cleaned = cleaned.replace(/^\s*Please provide a description of this PR:?\s*$/gm, '')
  cleaned = cleaned.replace(/\*\*(?:What type of PR|Any specific area|What this PR does|Which issue|Does this introduce|Additional context|Describe the bug|Describe the solution|Is your feature request|Expected behavi|Actual behavi|Steps to reproduce|Environment|Additional information|How to reproduce|Anything else)[^*]*\*\*:?\s*/gi, '')
  cleaned = cleaned.replace(/~[^~]+(?:not ready|work in progress|WIP|draft|do not merge)[^~]*~/gi, '')
  cleaned = cleaned.replace(/^\s*>?\s*\/(?:kind|area|sig)\s+\w+.*$/gm, '')
  cleaned = cleaned.replace(/^\s*>\s*Uncomment\s+.*/gm, '')
  cleaned = cleaned.replace(/^\s*(?:closes?|fixes?|resolves?):?\s+(?:#\d+|https:\/\/github\.com\/[^\s]+).*$/gim, '')
  cleaned = cleaned.replace(/^\s*Signed-off-by:.*$/gm, '')
  cleaned = cleaned.replace(/^\s*\/\w+.*$/gm, '')
  cleaned = cleaned.replace(/https:\/\/github\.com\/[^/]+\/[^/]+\/assets\/\S+/g, '')
  cleaned = cleaned.replace(/\bcc\s+@[a-zA-Z0-9_-]+/g, '')
  cleaned = cleaned.replace(/@[a-zA-Z0-9_-]+/g, '')
  cleaned = cleaned.replace(/\bcc\s*$/gm, '')
  cleaned = cleaned.replace(/^\s*Credit where credit is due:.*$/gm, '')
  cleaned = cleaned.replace(/^\s*Demo:.*github\.com.*$/gm, '')
  cleaned = cleaned.replace(/#{1,4}\s*Self Checks?[\s\S]*?(?=\n#{1,4}\s[^#]|\n---|\s*$)/gi, '')
  cleaned = cleaned.replace(/(?:By submitting this pull request|I have signed the CLA|Contributor License Agreement|I certify that)[\s\S]*?(?=\n#{1,4}\s|\n\n[A-Z]|\n---|\s*$)/gi, '')
  cleaned = cleaned.replace(/HashiCorp employees[\s\S]*?(?=\n#{1,4}\s|\n\n[A-Z]|\n---|\s*$)/gi, '')
  cleaned = cleaned.replace(/Harbor is an open source project[\s\S]*?(?=\n#{1,4}\s|\n\n[A-Z]|\n---|\s*$)/gi, '')
  cleaned = cleaned.replace(/^\s*This is a\s*(?:bug fix|feature|improvement|enhancement|refactor|doc(?:umentation)?)\s*\.?\s*$/gim, '')
  cleaned = cleaned.replace(/#{1,4}\s*\d+\.\s+(?:Why is this|Which issue|Which documentation|Does this introduce|Special notes|If applicable|Release note|What type|How has this|Additional context)[^\n]*/gi, '')
  cleaned = cleaned.replace(/^\s*#\d+\s*$/gm, '')
  cleaned = cleaned.replace(/^\s*:\s*/gm, '')
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n').trim()
  return cleaned
}

/**
 * Basic heuristic to detect non-English text.
 */
export function isLikelyEnglish(text) {
  if (!text || text.length < 50) return true
  const words = text.toLowerCase().split(/\s+/).filter(w => w.length > 1)
  if (words.length < 10) return true
  const stopwordCount = words.filter(w => ENGLISH_STOPWORDS.has(w)).length
  return (stopwordCount / words.length) >= MIN_ENGLISH_STOPWORD_RATIO
}

/**
 * Create a URL-safe slug from text.
 */
export function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80)
}

/**
 * Replace real infrastructure details (IPs, hostnames) with documentation examples.
 */
export function sanitizeInfraDetails(text) {
  let sanitized = text.replace(
    /\b(?!10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|127\.|0\.0\.0\.)\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g,
    '192.0.2.1'
  )
  sanitized = sanitized.replace(
    /\bip-\d+-\d+-\d+-\d+\.\w+-\w+-\d+\.compute\.internal\b/g,
    'ip-10-0-1-100.us-east-1.compute.internal'
  )
  sanitized = sanitized.replace(
    /\bec2-\d+-\d+-\d+-\d+\.\w+\.compute\.amazonaws\.com\b/g,
    'ec2-192-0-2-1.us-east-1.compute.amazonaws.com'
  )
  sanitized = sanitized.replace(
    /\b[\w-]+\.[\w-]+\.c\.[\w-]+\.internal\b/g,
    'instance-1.us-central1-a.c.project-id.internal'
  )
  return sanitized
}

/**
 * Detect and redact potential credentials in scraped content.
 */
export function redactCredentials(text) {
  return text
    .replace(/(password|passwd|secret|token|apiKey|api_key|admin_password)["']?\s*[:=]\s*["']?(?!<[A-Z_]+>|changeme|CHANGE_ME|your-|YOUR_|xxx|placeholder|\$\{)([^\s"'}{,]{4,})/gi,
      '$1: <REDACTED>')
}
