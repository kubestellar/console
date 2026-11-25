/**
 * Parity between the Netlify scan catalog (acmm-scan/criteria.ts) and the
 * frontend ACMM source. The frontend list feeds the dashboard text, the AI
 * mission "Detection rule", and the badge fallback (ACMM_DETECTION_PATHS), so
 * it must describe exactly what the scanner detects.
 *
 * The Go handler's copy is checked against criteria.ts by
 * pkg/api/handlers/compliance/acmm_criteria_parity_test.go.
 */
import { describe, expect, it } from 'vitest'
import { CRITERIA } from '../acmm-scan/criteria'
import { acmmSource } from '../../../src/lib/acmm/sources/acmm'

/**
 * Criteria whose frontend and Netlify detection already disagreed when this
 * test was added. Remove an ID once its two definitions agree; the test fails
 * if a listed ID no longer drifts, so this list only shrinks.
 */
const KNOWN_DRIFT = new Set([
  'acmm:prereq-contrib-guide',
  'acmm:prereq-code-style',
  'acmm:prereq-coverage-gate',
  'acmm:claude-md',
  'acmm:cursor-rules',
  'acmm:pr-acceptance-metric',
  'acmm:pr-review-rubric',
  'acmm:quality-dashboard',
  'acmm:ci-matrix',
  'acmm:auto-qa-tuning',
  'acmm:nightly-compliance',
  'acmm:copilot-review-apply',
  'acmm:auto-label',
  'acmm:ai-fix-workflow',
  'acmm:tier-classifier',
  'acmm:security-ai-md',
  'acmm:public-metrics',
  'acmm:policy-as-code',
  'acmm:reflection-log',
  'acmm:auto-issue-gen',
  'acmm:multi-agent-orchestration',
  'acmm:strategic-dashboard',
  'acmm:merge-queue',
])

const netlifyAcmm = CRITERIA.filter((c) => c.source === 'acmm')
const frontendById = new Map(acmmSource.criteria.map((c) => [c.id, c]))

describe('ACMM criteria parity: Netlify scan vs frontend source', () => {
  it.each(netlifyAcmm.filter((c) => !KNOWN_DRIFT.has(c.id)).map((c) => [c.id, c] as const))(
    '%s has the same detection in both catalogs',
    (id, netlify) => {
      const frontend = frontendById.get(id)
      expect(frontend, `${id} is missing from the frontend ACMM source`).toBeDefined()
      expect(frontend?.detection).toEqual(netlify.detection)
    },
  )

  it('every scannable frontend criterion exists in the Netlify catalog', () => {
    const netlifyIds = new Set(netlifyAcmm.map((c) => c.id))
    const missing = acmmSource.criteria
      .filter((c) => c.scannable !== false && !netlifyIds.has(c.id))
      .map((c) => c.id)
    expect(missing).toEqual([])
  })

  it('KNOWN_DRIFT lists only criteria that still drift', () => {
    const resolved = [...KNOWN_DRIFT].filter((id) => {
      const netlify = netlifyAcmm.find((c) => c.id === id)
      const frontend = frontendById.get(id)
      return netlify && frontend && JSON.stringify(netlify.detection) === JSON.stringify(frontend.detection)
    })
    expect(resolved).toEqual([])
  })
})
