import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { DrillDownView } from '../../hooks/useDrillDown.types'

// Replace lazy loading with a marker component so routing can be asserted synchronously
vi.mock('../../lib/safeLazy', () => ({
  safeLazy: (_factory: unknown, name: string) => (props: { viewType?: string }) => (
    <div data-testid={`view-${name}`}>{props.viewType ?? ''}</div>
  ),
}))

import { renderDrillDownView } from './DrillDownModal.views'

const UNKNOWN = 'unknown-label'
const CUSTOM = 'custom-label'

function renderView(view: Partial<DrillDownView> & { type: string }) {
  const full = { title: 't', data: {}, ...view } as unknown as DrillDownView
  return render(<>{renderDrillDownView(full, UNKNOWN, CUSTOM)}</>)
}

describe('renderDrillDownView', () => {
  it.each([
    ['cluster', 'ClusterDrillDown'],
    ['pod', 'PodDrillDown'],
    ['secret', 'SecretDrillDown'],
    ['service', 'ServiceDrillDown'],
    ['resources', 'ResourcesDrillDown'],
    ['quantum-credentials', 'QuantumCredentialsDrillDown'],
  ])('routes %s to %s', (type, name) => {
    renderView({ type })
    expect(screen.getByTestId(`view-${name}`)).toBeInTheDocument()
  })

  it('routes multi-cluster summary types with viewType', () => {
    renderView({ type: 'all-pods' })
    expect(screen.getByTestId('view-MultiClusterSummaryDrillDown')).toHaveTextContent('all-pods')
  })

  it('renders the custom component when provided', () => {
    renderView({ type: 'custom', customComponent: <span>my custom</span> })
    expect(screen.getByText('my custom')).toBeInTheDocument()
  })

  it('falls back to the custom label without a component', () => {
    renderView({ type: 'custom' })
    expect(screen.getByText(CUSTOM)).toBeInTheDocument()
  })

  it('renders the unknown label for unrecognised types', () => {
    renderView({ type: 'bogus' })
    expect(screen.getByText(UNKNOWN)).toBeInTheDocument()
  })
})
