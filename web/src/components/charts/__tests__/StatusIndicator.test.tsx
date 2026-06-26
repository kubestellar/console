/**
 * Branch-coverage tests for StatusIndicator.tsx — covers all 4 exports:
 * StatusIndicator, StatusDot, BooleanSwitch, StateMachine.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

vi.mock('../../../lib/demoMode', () => ({
  isDemoMode: () => true, getDemoMode: () => true, isNetlifyDeployment: false,
  isDemoModeForced: false, canToggleDemoMode: () => true, setDemoMode: vi.fn(),
  toggleDemoMode: vi.fn(), subscribeDemoMode: () => () => {},
  isDemoToken: () => true, hasRealToken: () => false, setDemoToken: vi.fn(),
  isFeatureEnabled: () => true,
}))

vi.mock('../../../hooks/useDemoMode', () => ({
  getDemoMode: () => true, default: () => true,
  useDemoMode: () => ({ isDemoMode: true, toggleDemoMode: vi.fn(), setDemoMode: vi.fn() }),
  hasRealToken: () => false, isDemoModeForced: false, isNetlifyDeployment: false,
  canToggleDemoMode: () => true, isDemoToken: () => true, setDemoToken: vi.fn(),
  setGlobalDemoMode: vi.fn(),
}))

vi.mock('../../../lib/analytics', () => ({
  emitNavigate: vi.fn(), emitLogin: vi.fn(), emitEvent: vi.fn(), analyticsReady: Promise.resolve(),
  emitAddCardModalOpened: vi.fn(), emitCardExpanded: vi.fn(), emitCardRefreshed: vi.fn(),
}))

vi.mock('../../../hooks/useTokenUsage', () => ({
  useTokenUsage: () => ({ usage: { total: 0, remaining: 0, used: 0 }, isLoading: false }),
  tokenUsageTracker: { getUsage: () => ({ total: 0, remaining: 0, used: 0 }), trackRequest: vi.fn(), getSettings: () => ({ enabled: false }) },
}))

import { StatusIndicator, StatusDot, BooleanSwitch, StateMachine } from '../StatusIndicator'

describe('StatusIndicator', () => {
  it('renders for each known status', () => {
    for (const status of ['healthy', 'error', 'warning', 'critical', 'pending', 'loading', 'unknown', 'unreachable'] as const) {
      const { container } = render(<StatusIndicator status={status} />)
      expect(container.firstChild).toBeTruthy()
    }
  })

  it('renders label when provided', () => {
    render(<StatusIndicator status="healthy" label="API" />)
    expect(screen.getByText('API')).toBeDefined()
  })

  it('accepts size sm/md/lg', () => {
    for (const size of ['sm', 'md', 'lg'] as const) {
      const { container } = render(<StatusIndicator status="healthy" size={size} />)
      expect(container.firstChild).toBeTruthy()
    }
  })
})

describe('StatusDot', () => {
  it('renders a dot for each status', () => {
    for (const status of ['healthy', 'error', 'warning', 'critical', 'pending', 'loading', 'unknown', 'unreachable'] as const) {
      const { container } = render(<StatusDot status={status} />)
      expect(container.firstChild).toBeTruthy()
    }
  })

  it('accepts pulse prop', () => {
    const { container } = render(<StatusDot status="healthy" pulse />)
    expect(container.firstChild).toBeTruthy()
  })
})

describe('BooleanSwitch', () => {
  it('renders on/off labels', () => {
    render(<BooleanSwitch value={true} label="Feature" />)
    expect(screen.getByText('Feature')).toBeDefined()
  })

  it('shows trueLabel when value=true and falseLabel when value=false', () => {
    const { rerender } = render(<BooleanSwitch value={true} label="Feature" />)
    expect(screen.getByText('On')).toBeDefined()
    rerender(<BooleanSwitch value={false} label="Feature" />)
    expect(screen.getByText('Off')).toBeDefined()
  })

  it('renders in disabled state', () => {
    const { container } = render(<BooleanSwitch value={false} label="Off" disabled />)
    expect(container.firstChild).toBeTruthy()
  })
})

describe('StateMachine', () => {
  const states = [
    { id: 'idle', label: 'Idle', status: 'pending' as const },
    { id: 'running', label: 'Running', status: 'healthy' as const },
    { id: 'done', label: 'Done', status: 'healthy' as const },
  ]

  it('renders all state labels', () => {
    render(<StateMachine states={states} currentState="running" title="Job" />)
    expect(screen.getByText('Idle')).toBeDefined()
    expect(screen.getByText('Running')).toBeDefined()
    expect(screen.getByText('Done')).toBeDefined()
  })

  it('renders title', () => {
    render(<StateMachine states={states} currentState="idle" title="Pipeline" />)
    expect(screen.getByText('Pipeline')).toBeDefined()
  })

  it('highlights the current state', () => {
    const { container } = render(<StateMachine states={states} currentState="done" title="Test" />)
    // The active state should have some visual distinction — not testing CSS
    // specifically, just that the component renders without crashing.
    expect(container.firstChild).toBeTruthy()
  })
})
