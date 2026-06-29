import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

vi.mock('../../../lib/demoMode', () => ({
  isDemoMode: () => true, getDemoMode: () => true, isNetlifyDeployment: false,
  isDemoModeForced: false, canToggleDemoMode: () => true, setDemoMode: vi.fn(),
  toggleDemoMode: vi.fn(), subscribeDemoMode: () => () => {},
  isDemoToken: () => true, hasRealToken: () => false, setDemoToken: vi.fn(),
  isFeatureEnabled: () => true,
}))

vi.mock('../../../hooks/useDemoMode', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../hooks/useDemoMode')>()),
  getDemoMode: () => true, default: () => true,
  useDemoMode: () => ({ isDemoMode: true, toggleDemoMode: vi.fn(), setDemoMode: vi.fn() }),
  hasRealToken: () => false, isDemoModeForced: false, isNetlifyDeployment: false,
  canToggleDemoMode: () => true, isDemoToken: () => true, setDemoToken: vi.fn(),
  setGlobalDemoMode: vi.fn(),
}))

vi.mock('../../../lib/analytics', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../lib/analytics')>()),
  emitNavigate: vi.fn(), emitLogin: vi.fn(), emitEvent: vi.fn(), analyticsReady: Promise.resolve(),
  emitAddCardModalOpened: vi.fn(), emitCardExpanded: vi.fn(), emitCardRefreshed: vi.fn(),
}
))

vi.mock('../../../hooks/useTokenUsage', () => ({
  useTokenUsage: () => ({ usage: { total: 0, remaining: 0, used: 0 }, isLoading: false }),
  tokenUsageTracker: { getUsage: () => ({ total: 0, remaining: 0, used: 0 }), trackRequest: vi.fn(), getSettings: () => ({ enabled: false }) },
}))

import { CollapsibleSection } from '../CollapsibleSection'

describe('CollapsibleSection', () => {
  it('renders without crashing', () => {
    const { container } = render(<CollapsibleSection title="test">content</CollapsibleSection>)
    expect(container).toBeTruthy()
  })

  it('renders the title and children when open by default', () => {
    render(
      <CollapsibleSection title="Test Section">
        <div data-testid="child-content">Content</div>
      </CollapsibleSection>
    )
    
    expect(screen.getByText('Test Section')).toBeInTheDocument()
    expect(screen.getByTestId('child-content')).toBeInTheDocument()
  })

  it('hides children when defaultOpen is false', () => {
    render(
      <CollapsibleSection title="Test Section" defaultOpen={false}>
        <div data-testid="child-content">Content</div>
      </CollapsibleSection>
    )
    
    expect(screen.getByText('Test Section')).toBeInTheDocument()
    expect(screen.queryByTestId('child-content')).not.toBeInTheDocument()
  })

  it('toggles children visibility when button is clicked', () => {
    render(
      <CollapsibleSection title="Test Section" defaultOpen={false}>
        <div data-testid="child-content">Content</div>
      </CollapsibleSection>
    )
    
    // Initially closed
    expect(screen.queryByTestId('child-content')).not.toBeInTheDocument()
    
    // Click to open
    fireEvent.click(screen.getByRole('button', { name: /Test Section/i }))
    expect(screen.getByTestId('child-content')).toBeInTheDocument()
    
    // Click to close
    fireEvent.click(screen.getByRole('button', { name: /Test Section/i }))
    expect(screen.queryByTestId('child-content')).not.toBeInTheDocument()
  })

  it('renders a badge when provided', () => {
    render(
      <CollapsibleSection title="Test Section" badge={<span data-testid="badge-element">New!</span>}>
        <div data-testid="child-content">Content</div>
      </CollapsibleSection>
    )
    
    expect(screen.getByTestId('badge-element')).toBeInTheDocument()
    expect(screen.getByText('New!')).toBeInTheDocument()
  })
})
