/**
 * Constants and pure helpers for ACMMFeedbackLoops.
 *
 * Extracted from ACMMFeedbackLoops.tsx to keep the main component focused
 * on data orchestration and rendering.
 */
import { ALL_CRITERIA } from '../../lib/acmm/sources'
import type { Criterion, SourceId } from '../../lib/acmm/sources/types'
import { detectionLabel } from '../../lib/acmm/missionPrompts'

export type StatusFilter = 'all' | 'detected' | 'missing'
export type ViewMode = 'by-level' | 'cross-cutting'

export const SOURCE_LABELS: Record<SourceId, string> = {
  acmm: 'ACMM',
  fullsend: 'Fullsend',
  'agentic-engineering-framework': 'AEF',
  'claude-reflect': 'Reflect',
}

export const SOURCE_COLORS: Record<SourceId, string> = {
  acmm: 'bg-primary/20 text-primary',
  fullsend: 'bg-orange-500/20 text-orange-400',
  'agentic-engineering-framework': 'bg-cyan-500/20 text-cyan-400',
  'claude-reflect': 'bg-green-500/20 text-green-400',
}

/** File each source's criteria live in — used for "propose a change" links. */
export const SOURCE_FILES: Record<SourceId, string> = {
  acmm: 'web/src/lib/acmm/sources/acmm.ts',
  fullsend: 'web/src/lib/acmm/sources/fullsend.ts',
  'agentic-engineering-framework': 'web/src/lib/acmm/sources/agentic-engineering-framework.ts',
  'claude-reflect': 'web/src/lib/acmm/sources/claude-reflect.ts',
}

export const CONSOLE_REPO = 'kubestellar/console'
/** Mirrors the badge-function threshold: a level is "earned" once 70% of
 *  its criteria are detected. Anything above earnedLevel is locked
 *  (gamification — finish what you're on before the next level opens). */
export const LEVEL_COMPLETION_THRESHOLD = 0.7
export const LOCK_OVERRIDE_KEY = 'kc-acmm-locks-overridden'

export function readLocksOverridden(): boolean {
  try {
    return sessionStorage.getItem(LOCK_OVERRIDE_KEY) === '1'
  } catch {
    return false
  }
}

export function persistLocksOverridden(v: boolean) {
  try {
    if (v) sessionStorage.setItem(LOCK_OVERRIDE_KEY, '1')
    else sessionStorage.removeItem(LOCK_OVERRIDE_KEY)
  } catch {
    // ignore
  }
}

/** Maximum maturity level (L6 = Autonomous) */
export const MAX_MATURITY_LEVEL = 6

/** Highest level where 70%+ of that level's scannable ACMM criteria are
 *  detected. Walks L2→L6 and stops at the first level that fails the
 *  threshold. Non-scannable items are excluded from the calculation. */
export function computeEarnedLevel(detectedIds: Set<string>): number {
  let earned = 1
  for (let n = 2; n <= MAX_MATURITY_LEVEL; n++) {
    const required = ALL_CRITERIA.filter(
      (c) => c.source === 'acmm' && c.level === n && c.scannable !== false,
    )
    if (required.length === 0) continue
    const detected = required.filter((c) => detectedIds.has(c.id)).length
    if (detected / required.length >= LEVEL_COMPLETION_THRESHOLD) {
      earned = n
    } else {
      break
    }
  }
  return earned
}

/** Cross-cutting dimension labels */
export const CROSS_CUTTING_LABELS = {
  learning: 'Learning & Feedback',
  traceability: 'Traceability & Audit',
} as const

export function proposeChangeUrl(c: Criterion): string {
  const title = encodeURIComponent(`ACMM criterion fix: ${c.id}`)
  const body = encodeURIComponent(
    `**Criterion:** \`${c.id}\` (${SOURCE_LABELS[c.source]})\n` +
      `**Name:** ${c.name}\n` +
      `**Current detection (${c.detection.type}):** \`${detectionLabel(c.detection)}\`\n\n` +
      `**What's wrong with the current criteria?**\n<!-- e.g. missed files in my repo, over-matches, wrong level -->\n\n` +
      `**Suggested detection pattern:**\n<!-- e.g. include additional paths, switch to glob, etc. -->\n\n` +
      `**Source file:** \`${SOURCE_FILES[c.source]}\``,
  )
  return `https://github.com/${CONSOLE_REPO}/issues/new?title=${title}&body=${body}&labels=acmm,criterion-feedback`
}
