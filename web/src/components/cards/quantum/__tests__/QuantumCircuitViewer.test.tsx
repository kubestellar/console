import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

const mockUseQuantumCircuitAscii = vi.fn()
vi.mock('../../../../hooks/useCachedQuantum', () => ({
  useQuantumCircuitAscii: (...args: unknown[]) => mockUseQuantumCircuitAscii(...args),
  QUANTUM_CIRCUIT_DEFAULT_POLL_MS: 10000,
}))

vi.mock('../../../../lib/demoMode', () => ({
  isQuantumForcedToDemo: vi.fn().mockReturnValue(false),
}))

const mockUseAuth = vi.fn()
vi.mock('../../../../lib/auth', () => ({
  useAuth: () => mockUseAuth(),
}))

vi.mock('../../CardDataContext', () => ({
  useCardLoadingState: vi.fn().mockReturnValue({ showSkeleton: false }),
  useReportCardDataState: vi.fn().mockReturnValue(undefined),
}))

import { QuantumCircuitViewer } from '../QuantumCircuitViewer'

function defaultAuth() {
  return { isAuthenticated: true, isLoading: false, login: vi.fn(), logout: vi.fn() }
}

function defaultHook(overrides: Record<string, unknown> = {}) {
  return {
    data: null,
    isLoading: false,
    isRefreshing: false,
    isDemoData: false,
    isFailed: false,
    consecutiveFailures: 0,
    lastRefresh: null,
    error: null,
    refetch: vi.fn(),
    ...overrides,
  }
}

describe('QuantumCircuitViewer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseAuth.mockReturnValue(defaultAuth())
    mockUseQuantumCircuitAscii.mockReturnValue(defaultHook())
  })

  it('renders ASCII circuit inside pre.quantum-circuit-display when circuitAscii is provided', () => {
    const ASCII = '     ┌───┐\nq_0: ┤ H ├──■──\n     └───┘┌─┴─┐\nq_1: ─────┤ X ├\n          └───┘'
    mockUseQuantumCircuitAscii.mockReturnValue(
      defaultHook({ data: { circuitAscii: ASCII } }),
    )
    const { container } = render(<QuantumCircuitViewer />)
    const pre = container.querySelector('pre.quantum-circuit-display')
    expect(pre).not.toBeNull()
    expect(pre).toBeInTheDocument()
    expect(pre!.textContent).toBe(ASCII)
    expect(screen.queryByText('Unable to load quantum circuit diagram')).not.toBeInTheDocument()
  })

  it('renders fallback message when data is null', () => {
    mockUseQuantumCircuitAscii.mockReturnValue(defaultHook({ data: null }))
    const { container } = render(<QuantumCircuitViewer />)
    expect(container.querySelector('pre.quantum-circuit-display')).not.toBeInTheDocument()
    expect(
      screen.getByText('Unable to load quantum circuit diagram'),
    ).toBeInTheDocument()
  })

  it('renders fallback message when circuitAscii is an empty string', () => {
    mockUseQuantumCircuitAscii.mockReturnValue(
      defaultHook({ data: { circuitAscii: '' } }),
    )
    const { container } = render(<QuantumCircuitViewer />)
    expect(container.querySelector('pre.quantum-circuit-display')).not.toBeInTheDocument()
    expect(
      screen.getByText('Unable to load quantum circuit diagram'),
    ).toBeInTheDocument()
  })

  it('renders fallback message when data object has null circuitAscii field', () => {
    mockUseQuantumCircuitAscii.mockReturnValue(
      defaultHook({ data: { circuitAscii: null } }),
    )
    const { container } = render(<QuantumCircuitViewer />)
    expect(container.querySelector('pre.quantum-circuit-display')).not.toBeInTheDocument()
    expect(
      screen.getByText('Unable to load quantum circuit diagram'),
    ).toBeInTheDocument()
  })
})
