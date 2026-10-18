/**
 * Unit tests for CardPreviewA, CardPreviewB, GenericCardPreview and
 * NightlyE2EPreview — the preview renderers used by the widget export
 * modal. These had 0% unit coverage; each render branch of the switch
 * statements is exercised here to guard against regressions when new
 * widget card types are added.
 */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CardPreviewA } from '../CardPreviewA'
import { CardPreviewB, GenericCardPreview, NightlyE2EPreview } from '../CardPreviewB'
import type { WidgetCardDefinition } from '../../../../lib/widgets/widgetRegistry'

function makeCard(overrides: Partial<WidgetCardDefinition> = {}): WidgetCardDefinition {
  return {
    cardType: 'unknown_type',
    displayName: 'Test Card',
    description: 'test',
    apiEndpoints: [],
    supportsTheme: true,
    minRefreshInterval: 30000,
    defaultSize: { width: 300, height: 200 },
    category: 'monitoring',
    ...overrides,
  }
}

const CARD_PREVIEW_A_TYPES = [
  'cluster_health',
  'pod_issues',
  'gpu_overview',
  'hardware_health',
  'nightly_e2e_status',
  'security_issues',
  'active_alerts',
  'helm_releases',
  'top_pods',
  'event_summary',
  'warning_events',
  'operator_status',
  'storage_overview',
  'pvc_status',
  'network_overview',
  'service_status',
  'opencost_overview',
  'provider_health',
  'nightly_release_pulse',
]

const CARD_PREVIEW_B_TYPES = [
  'workflow_matrix',
  'pipeline_flow',
  'recent_failures',
  'issue_activity_chart',
  'github_ci_monitor',
  'github_activity',
  'cluster_metrics',
  'workload_status',
  'app_status',
  'namespace_overview',
  'console_ai_health_check',
  'console_ai_offline_detection',
]

describe('CardPreviewA', () => {
  it.each(CARD_PREVIEW_A_TYPES)('renders %s without throwing', (cardType) => {
    const { container } = render(<CardPreviewA cardType={cardType} card={makeCard({ cardType })} />)
    expect(container.firstChild).not.toBeNull()
  })

  it('returns null for an unrecognized cardType', () => {
    const { container } = render(<CardPreviewA cardType="does_not_exist" card={makeCard()} />)
    expect(container.firstChild).toBeNull()
  })
})

describe('CardPreviewB', () => {
  it.each(CARD_PREVIEW_B_TYPES)('renders %s without throwing', (cardType) => {
    const { container } = render(<CardPreviewB cardType={cardType} card={makeCard({ cardType })} />)
    expect(container.firstChild).not.toBeNull()
  })

  it('falls back to GenericCardPreview for an unrecognized cardType', () => {
    render(<CardPreviewB cardType="does_not_exist" card={makeCard({ displayName: 'My Unknown Card' })} />)
    expect(screen.getByText('My Unknown Card')).toBeInTheDocument()
  })
})

describe('GenericCardPreview', () => {
  const categories: WidgetCardDefinition['category'][] = [
    'cluster',
    'workload',
    'gpu',
    'security',
    'monitoring',
    'ci-cd',
  ]

  it.each(categories)('renders stat items for category %s', (category) => {
    render(<GenericCardPreview card={makeCard({ category, displayName: `${category} card` })} />)
    expect(screen.getByText(`${category} card`)).toBeInTheDocument()
  })

  it('falls back to monitoring items for an unknown category', () => {
    const card = makeCard({ category: 'does-not-exist' as WidgetCardDefinition['category'], displayName: 'Fallback Card' })
    render(<GenericCardPreview card={card} />)
    expect(screen.getByText('Fallback Card')).toBeInTheDocument()
    expect(screen.getByText('Active')).toBeInTheDocument()
  })
})

describe('NightlyE2EPreview', () => {
  it('renders platform rows, guide acronyms and the no-runs fallback', () => {
    render(<NightlyE2EPreview />)
    expect(screen.getByText('Nightly E2E Status')).toBeInTheDocument()
    expect(screen.getByText('OCP')).toBeInTheDocument()
    expect(screen.getByText('GKE')).toBeInTheDocument()
    expect(screen.getByText('CKS')).toBeInTheDocument()
    // CKS guides have empty dots arrays, exercising the "no runs" branch.
    expect(screen.getAllByText('no runs').length).toBeGreaterThan(0)
  })
})
