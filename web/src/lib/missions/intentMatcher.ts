import type { MissionExport } from './types'

const INSTALL_INTENT_PATTERN = /(?:^|\b)(?:please\s+)?(?:install|set\s+up|deploy|provision|add)\s+(.+)/i
const TRAILING_CONTEXT_PATTERN = /\b(?:on|in|to|for|with|using|via)\b/i
const TRAILING_POLITENESS_PATTERN = /\bplease$/i
const LEADING_ARTICLE_PATTERN = /^(?:the|a|an)\s+/i

function toSlug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

function extractInstallSlug(prompt: string): string | null {
  const match = prompt.match(INSTALL_INTENT_PATTERN)
  if (!match?.[1]) return null

  const rawTarget = match[1]
    .replace(/[?!.,;:]+$/g, '')
    .trim()
  const contextualTarget = rawTarget.split(TRAILING_CONTEXT_PATTERN)[0]?.trim() || ''
  const cleanedTarget = contextualTarget
    .replace(TRAILING_POLITENESS_PATTERN, '')
    .replace(LEADING_ARTICLE_PATTERN, '')
    .trim()
  const slug = toSlug(cleanedTarget)

  return slug || null
}

function buildSearchTerms(mission: MissionExport): string[] {
  return [
    mission.name || '',
    mission.cncfProject || '',
    mission.title || '',
    ...(mission.tags || []),
  ].map(toSlug).filter(Boolean)
}

export function matchInstallIntent(prompt: string, installers: MissionExport[]): MissionExport | null {
  const slug = extractInstallSlug(prompt)
  if (!slug) return null

  const installSlug = `install-${slug}`
  const candidates = installers || []

  const exactNameMatch = candidates.find(mission => toSlug(mission.name || '') === installSlug)
  if (exactNameMatch) return exactNameMatch

  const cncfProjectMatch = candidates.find(mission => toSlug(mission.cncfProject || '') === slug)
  if (cncfProjectMatch) return cncfProjectMatch

  const titleMatch = candidates.find(mission => toSlug(mission.title || '').includes(slug))
  if (titleMatch) return titleMatch

  const tokenMatch = candidates.find(mission => buildSearchTerms(mission).some(term => term.includes(slug) || slug.includes(term)))
  return tokenMatch || null
}
