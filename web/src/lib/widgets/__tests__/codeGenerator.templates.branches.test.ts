/**
 * Branch coverage tests for the per-family card render generators used
 * by `generateCardRenderFunction`:
 *
 *   - codeGenerator.templates.cluster.ts (generateClusterCardRender)
 *   - codeGenerator.templates.infra.ts   (generateInfraCardRender)
 *   - codeGenerator.templates.ci.ts      (generateCICardRender)
 *
 * The existing suite in codeGenerator.test.ts exercises only five card
 * types (cluster_health, pod_issues, gpu_overview, workload_status,
 * nightly_e2e_status), leaving 25 case branches across the three files
 * uncovered. This suite runs every registered widget card through
 * generateCardWidget() and asserts that:
 *
 *   1. The generated code contains the standard render entry point.
 *   2. The card's displayName from WIDGET_CARDS appears in the output.
 *   3. The generator does NOT fall through to generateDefaultCardRender
 *      (which is the only path that emits `JSON.stringify(data, null, 2)`).
 *
 * Together those assertions verify every switch case returns a
 * non-null, card-specific template. The default renderer is separately
 * exercised via an unknown-but-quasi-registered card type in a focused
 * test below.
 */

import { describe, expect, it } from 'vitest'

import { generateCardWidget } from '../codeGenerator.widgets'
import { generateCardRenderFunction } from '../codeGenerator.templates'
import { WIDGET_CARDS } from '../widgetRegistry'

const DEFAULT_FALLBACK_MARKER = 'JSON.stringify(data, null, 2)'
const RENDER_ENTRY_POINT = 'export const render = ({ output })'
const TEST_ENDPOINT = 'http://localhost:8080'

/**
 * Card types handled by each per-family generator. Kept in sync with the
 * switch statements in codeGenerator.templates.{cluster,infra,ci}.ts.
 * If a new case is added there, add it here so this suite continues to
 * guarantee branch coverage.
 */
const CLUSTER_CARDS = [
  'cluster_health',
  'pod_issues',
  'gpu_overview',
  'cluster_metrics',
  'workload_status',
  'security_issues',
  'app_status',
  'top_pods',
  'console_ai_offline_detection',
  'console_ai_health_check',
  'namespace_overview',
  'event_summary',
  'warning_events',
] as const

const INFRA_CARDS = [
  'storage_overview',
  'pvc_status',
  'network_overview',
  'service_status',
  'operator_status',
  'opencost_overview',
  'active_alerts',
  'helm_releases',
  'provider_health',
] as const

const CI_CARDS = [
  'nightly_e2e_status',
  'nightly_release_pulse',
  'workflow_matrix',
  'pipeline_flow',
  'recent_failures',
  'issue_activity_chart',
  'github_ci_monitor',
  'github_activity',
] as const

const ALL_TEMPLATE_CARDS: ReadonlyArray<string> = [
  ...CLUSTER_CARDS,
  ...INFRA_CARDS,
  ...CI_CARDS,
]

function assertCardSpecificRender(cardType: string): void {
  const card = WIDGET_CARDS[cardType]
  // Guard: every listed card MUST be registered — otherwise the assertion
  // about displayName below would be meaningless.
  expect(card, `WIDGET_CARDS is missing an entry for '${cardType}'`).toBeDefined()

  const code = generateCardWidget(cardType, TEST_ENDPOINT)

  expect(code).toContain(RENDER_ENTRY_POINT)
  expect(code).toContain(card.displayName)
  // Falling through to generateDefaultCardRender is the ONLY path that
  // emits this exact literal. Its absence proves the per-family
  // generator handled the card type explicitly.
  expect(code).not.toContain(DEFAULT_FALLBACK_MARKER)
}

describe('generateClusterCardRender — branch coverage', () => {
  for (const cardType of CLUSTER_CARDS) {
    it(`emits a card-specific render for '${cardType}'`, () => {
      assertCardSpecificRender(cardType)
    })
  }
})

describe('generateInfraCardRender — branch coverage', () => {
  for (const cardType of INFRA_CARDS) {
    it(`emits a card-specific render for '${cardType}'`, () => {
      assertCardSpecificRender(cardType)
    })
  }
})

describe('generateCICardRender — branch coverage', () => {
  for (const cardType of CI_CARDS) {
    it(`emits a card-specific render for '${cardType}'`, () => {
      assertCardSpecificRender(cardType)
    })
  }
})

describe('generateCardRenderFunction — registry parity', () => {
  it('handles every registered widget card without falling through to the default renderer', () => {
    // Any card exposed via WIDGET_CARDS is user-selectable in the export
    // dialog; leaving it on the default renderer would ship a widget
    // that just dumps JSON.stringify(data). Catch drift explicitly.
    const drift: string[] = []
    for (const cardType of Object.keys(WIDGET_CARDS)) {
      const code = generateCardWidget(cardType, TEST_ENDPOINT)
      if (code.includes(DEFAULT_FALLBACK_MARKER)) {
        drift.push(cardType)
      }
    }
    expect(drift, `Registered cards fell through to the default renderer: ${drift.join(', ')}`).toEqual([])
  })

  it('covers exactly the switch branches enumerated in this suite', () => {
    // If a new case is added in one of the templates.*.ts files without
    // being listed above, this test flags the gap by checking that
    // every registered card is also enumerated in ALL_TEMPLATE_CARDS.
    const registered = Object.keys(WIDGET_CARDS).sort()
    const enumerated = [...ALL_TEMPLATE_CARDS].sort()
    expect(enumerated).toEqual(registered)
  })

  it('falls through to the default renderer for a card type not handled by any family', () => {
    // Call generateCardRenderFunction directly (bypassing WIDGET_CARDS
    // lookup) with an unrecognised card type — it must hit
    // generateDefaultCardRender and therefore emit JSON.stringify(...).
    const code = generateCardRenderFunction('__not_a_real_card__', 'Placeholder Widget')
    expect(code).toContain(RENDER_ENTRY_POINT)
    expect(code).toContain(DEFAULT_FALLBACK_MARKER)
    // Default renderer embeds the passed-in title verbatim.
    expect(code).toContain('Placeholder Widget')
  })

  it('uses the card type as the title when neither displayName nor override is provided', () => {
    const code = generateCardRenderFunction('__anonymous_card__')
    expect(code).toContain(DEFAULT_FALLBACK_MARKER)
    expect(code).toContain('__anonymous_card__')
  })
})
