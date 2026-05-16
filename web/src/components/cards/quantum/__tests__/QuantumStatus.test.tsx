import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import type { QuantumSystemStatus } from '../../../../hooks/useCachedQuantum'

const mockUseQuantumSystemStatus = vi.fn()
vi.mock('../../../../hooks/useCachedQuantum', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../hooks/useCachedQuantum')>()
  return {
    ...actual,
    useQuantumSystemStatus: (opts: Parameters<typeof actual.useQuantumSystemStatus>[0]) =>
      mockUseQuantumSystemStatus(opts),
  }
})

vi.mock('../../../../lib/demoMode', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../lib/demoMode')>()
  return {
    ...actual,
    isQuantumForcedToDemo: vi.fn(() => false),
  }
})

const mockUseAuth = vi.fn()
vi.mock('../../../../lib/auth', () => ({
  useAuth: () => mockUseAuth(),
}))

import { CardDataReportContext } from '../../CardDataContext'
import { QuantumStatus } from '../QuantumStatus'
import { DEMO_QUANTUM_STATUS } from '../../../../hooks/useCachedQuantum'

function defaultAuthReturn(overrides: Record<string, unknown> = {}) {
  return {
    isAuthenticated: true,
    isLoading: false,
    login: vi.fn(),
    ...overrides,
  }
}

function defaultHookReturn(
  overrides: Partial<{
    data: QuantumSystemStatus | null
    isLoading: boolean
    isRefreshing: boolean
    isDemoData: boolean
    error: string | null
    isFailed: boolean
    consecutiveFailures: number
    lastRefresh: number | null
    refetch: () => Promise<void>
  }> = {},
) {
  return {
    data: DEMO_QUANTUM_STATUS,
    isLoading: false,
    isRefreshing: false,
    isDemoData: false,
    error: null,
    isFailed: false,
    consecutiveFailures: 0,
    lastRefresh: Date.now(),
    refetch: vi.fn(),
    ...overrides,
  }
}

describe('QuantumStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseAuth.mockReturnValue(defaultAuthReturn())
    mockUseQuantumSystemStatus.mockReturnValue(defaultHookReturn())
  })

  it('renders loading skeleton when isLoading is true and data is null', () => {
    mockUseQuantumSystemStatus.mockReturnValue(
      defaultHookReturn({ isLoading: true, data: null }),
    )

    const { container } = render(<QuantumStatus />)

    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0)
    expect(screen.queryByText('Refresh Interval')).toBeNull()
  })

  it('renders error message when error string is set after load', () => {
    mockUseQuantumSystemStatus.mockReturnValue(
      defaultHookReturn({
        isLoading: false,
        data: null,
        error: 'fetch failed',
      }),
    )

    render(<QuantumStatus />)

    expect(screen.getByText('fetch failed')).toBeInTheDocument()
  })

  it('reports isDemoData: true to CardDataReportContext when hook returns isDemoData true', async () => {
    const report = vi.fn()
    mockUseQuantumSystemStatus.mockReturnValue(
      defaultHookReturn({ isDemoData: true, data: DEMO_QUANTUM_STATUS }),
    )

    render(
      <CardDataReportContext.Provider value={{ report }}>
        <QuantumStatus />
      </CardDataReportContext.Provider>,
    )

    await waitFor(() => {
      const reportedDemo = report.mock.calls.some(
        (call) =>
          call[0] &&
          typeof call[0] === 'object' &&
          (call[0] as { isDemoData?: boolean }).isDemoData === true,
      )
      expect(reportedDemo).toBe(true)
    })
  })

  it('renders version string when data.version_info.version is populated', () => {
    mockUseQuantumSystemStatus.mockReturnValue(
      defaultHookReturn({
        data: {
          ...DEMO_QUANTUM_STATUS,
          version_info: {
            version: '1.2.3',
            commit: 'deadbeef',
            timestamp: '2026-05-01T00:00:00.000Z',
          },
        },
      }),
    )

    render(<QuantumStatus />)

    expect(screen.getByText('1.2.3')).toBeInTheDocument()
  })

  it('renders fallback when data is object with null version_info', () => {
    mockUseQuantumSystemStatus.mockReturnValue(
      defaultHookReturn({
        data: {
          ...DEMO_QUANTUM_STATUS,
          version_info: null as unknown as typeof DEMO_QUANTUM_STATUS.version_info,
        },
      }),
    )

    render(<QuantumStatus />)

    // Should still render but without version info
    expect(screen.queryByText('1.2.3')).not.toBeInTheDocument()
  })
})
