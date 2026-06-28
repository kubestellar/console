import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { QuantumAuthStatus, QuantumSystemStatus } from '../../../../hooks/useCachedQuantum'

const mockUseQuantumSystemStatus = vi.fn()
const mockUseQuantumAuthStatus = vi.fn()
const mockShowToast = vi.fn()

vi.mock('../../../../hooks/useCachedQuantum', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../hooks/useCachedQuantum')>()
  return {
    ...actual,
    useQuantumSystemStatus: (opts: Parameters<typeof actual.useQuantumSystemStatus>[0]) =>
      mockUseQuantumSystemStatus(opts),
    useQuantumAuthStatus: (opts: Parameters<typeof actual.useQuantumAuthStatus>[0]) =>
      mockUseQuantumAuthStatus(opts),
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

const mockOpenDrillDown = vi.fn()
const mockCloseDrillDown = vi.fn()
vi.mock('../../../../hooks/useDrillDown', () => ({
  useDrillDown: () => ({
    open: mockOpenDrillDown,
    close: mockCloseDrillDown,
  }),
}))

vi.mock('../../../../hooks/useQASMFiles', () => ({
  useQASMFiles: () => ({
    files: [{ name: 'bell.qasm' }],
    isLoading: false,
    error: null,
  }),
}))

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock('../../../ui/Toast', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}))

vi.mock('../CustomQASMModal', () => ({
  CustomQASMModal: ({ isOpen, onSubmit }: { isOpen: boolean; onSubmit: (content: string) => void }) => (
    isOpen ? <button data-testid="custom-qasm-submit" onClick={() => onSubmit('OPENQASM 2.0;')}>Submit custom QASM</button> : null
  ),
}))

import { QuantumControlPanel } from '../QuantumControlPanel'
import { DEMO_QUANTUM_STATUS } from '../../../../hooks/useCachedQuantum'

function defaultAuthReturn(overrides: Record<string, unknown> = {}) {
  return {
    isAuthenticated: true,
    isLoading: false,
    login: vi.fn(),
    token: null,
    ...overrides,
  }
}

function statusHookReturn(
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

function authHookReturn(
  overrides: Partial<{
    data: QuantumAuthStatus
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
    data: {
      authenticated: false,
      tokenStored: false,
      lastIbmError: null,
    } as QuantumAuthStatus,
    isLoading: false,
    isRefreshing: false,
    isDemoData: false,
    error: null,
    isFailed: false,
    consecutiveFailures: 0,
    lastRefresh: null,
    refetch: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }
}

/**
 * Force the control panel onto a non-IBM (local-only) backend before
 * assertions. Use in tests that verify "stale IBM error must NOT surface
 * on local backends" so they don't depend on the component's default
 * backend value remaining `aer`.
 */
function selectNonIbmBackend(container: HTMLElement) {
  const select = container.querySelector('select') as HTMLSelectElement
  fireEvent.change(select, { target: { value: 'aer' } })
}

/**
 * Force the control panel onto an IBM-requiring backend (qx5).
 */
function selectIbmBackend(container: HTMLElement) {
  const select = container.querySelector('select') as HTMLSelectElement
  fireEvent.change(select, { target: { value: 'qx5' } })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('QuantumControlPanel — auth-status polling gating', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockShowToast.mockReset()
    mockUseAuth.mockReturnValue(defaultAuthReturn())
    mockUseQuantumSystemStatus.mockReturnValue(statusHookReturn())
    mockUseQuantumAuthStatus.mockReturnValue(authHookReturn())
  })

  it('passes autoRefresh: false to auth-status hook when default backend is aer', () => {
    render(<QuantumControlPanel />)
    expect(mockUseQuantumAuthStatus).toHaveBeenCalled()
    const lastCall = mockUseQuantumAuthStatus.mock.calls.at(-1)?.[0]
    expect(lastCall?.autoRefresh).toBe(false)
  })

  it('passes autoRefresh: true once user selects an IBM backend (qx5)', () => {
    const { container } = render(<QuantumControlPanel />)
    const select = container.querySelector('select') as HTMLSelectElement
    fireEvent.change(select, { target: { value: 'qx5' } })
    const lastCall = mockUseQuantumAuthStatus.mock.calls.at(-1)?.[0]
    expect(lastCall?.autoRefresh).toBe(true)
  })
})

describe('QuantumControlPanel — error classification', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseAuth.mockReturnValue(defaultAuthReturn())
    mockUseQuantumSystemStatus.mockReturnValue(statusHookReturn())
  })

  it('renders the soft yellow transient banner (not red) for retryable IBM errors when on an IBM backend', () => {
    mockUseQuantumAuthStatus.mockReturnValue(
      authHookReturn({ error: 'max retries attempted; service unavailable' }),
    )
    const { container } = render(<QuantumControlPanel />)
    selectIbmBackend(container)

    // Both the banner element AND its rendered copy are checked: testid alone
    // would silently pass if the banner were rendered empty or with the wrong
    // i18n key.
    const transient = screen.getByTestId('quantum-control-panel-transient-banner')
    expect(transient).toBeInTheDocument()
    expect(transient).toHaveTextContent('quantumControlPanel.ibmUpstreamUnavailable')
    // The classified-transient error must NOT also surface in the red banner.
    expect(
      screen.queryByTestId('quantum-control-panel-fatal-banner'),
    ).toBeNull()
  })

  it('renders the red banner for fatal (non-retryable) auth errors on an IBM backend', () => {
    mockUseQuantumAuthStatus.mockReturnValue(
      authHookReturn({ error: 'invalid api key' }),
    )
    const { container } = render(<QuantumControlPanel />)
    selectIbmBackend(container)

    const fatal = screen.getByTestId('quantum-control-panel-fatal-banner')
    expect(fatal).toBeInTheDocument()
    expect(fatal).toHaveTextContent('invalid api key')
    expect(
      screen.queryByTestId('quantum-control-panel-transient-banner'),
    ).toBeNull()
  })

  it('does not render the transient banner on a non-IBM backend even if the cached error is transient', () => {
    mockUseQuantumAuthStatus.mockReturnValue(
      authHookReturn({ error: 'service unavailable 503' }),
    )
    const { container } = render(<QuantumControlPanel />)
    selectNonIbmBackend(container)

    expect(
      screen.queryByTestId('quantum-control-panel-transient-banner'),
    ).toBeNull()
  })

  it('does not render the red banner on a non-IBM backend even if the cached auth error is fatal', () => {
    // A stale 401 from a prior IBM-backed validation must not surface in the
    // red banner once the user is on aer/sim doing purely local work.
    // Backend is set explicitly via selectNonIbmBackend so this test does
    // not depend on the component's default backend remaining `aer`.
    mockUseQuantumAuthStatus.mockReturnValue(
      authHookReturn({ error: 'invalid api key' }),
    )
    const { container } = render(<QuantumControlPanel />)
    selectNonIbmBackend(container)

    expect(
      screen.queryByTestId('quantum-control-panel-fatal-banner'),
    ).toBeNull()
  })

  it('drives the yellow banner from authStatus.lastIbmError.retryable when present (v0.4.0+ workload)', () => {
    // When the workload provides a structured lastIbmError, the Console
    // should classify off `retryable`, not the error message string.
    mockUseQuantumAuthStatus.mockReturnValue(
      authHookReturn({
        data: {
          authenticated: false,
          tokenStored: true,
          lastIbmError: {
            code: 'rate_limited',
            message: 'rate limit exceeded',
            retryable: true,
          },
        },
        // Note: no `error` field — workload returned 200 with structured payload.
      }),
    )
    const { container } = render(<QuantumControlPanel />)
    selectIbmBackend(container)

    const transient = screen.getByTestId('quantum-control-panel-transient-banner')
    expect(transient).toBeInTheDocument()
    expect(transient).toHaveTextContent('quantumControlPanel.ibmUpstreamUnavailable')
    expect(
      screen.queryByTestId('quantum-control-panel-fatal-banner'),
    ).toBeNull()
  })

  it('drives the red banner from authStatus.lastIbmError when retryable:false', () => {
    mockUseQuantumAuthStatus.mockReturnValue(
      authHookReturn({
        data: {
          authenticated: false,
          tokenStored: true,
          lastIbmError: {
            code: 'unknown',
            message: 'invalid api key',
            retryable: false,
          },
        },
      }),
    )
    const { container } = render(<QuantumControlPanel />)
    selectIbmBackend(container)

    const fatal = screen.getByTestId('quantum-control-panel-fatal-banner')
    expect(fatal).toBeInTheDocument()
    expect(fatal).toHaveTextContent('invalid api key')
  })

  it('REGRESSION: renders without crashing when stale cache hydrates lastIbmError as undefined', () => {
    // Stale `authStatus` cached before #15960 deployed predates the
    // `lastIbmError` field, so `useCache` hydrates the panel with
    // `lastIbmError: undefined` (not `null`). The fetcher coerces fresh
    // responses to `null`, but cached entries bypass the fetcher.
    //
    // The strict equality guard `lastIbmError !== null` was true for
    // `undefined`, then `lastIbmError.retryable` threw
    // `TypeError: Cannot read properties of undefined (reading 'retryable')`
    // and tripped the card's error boundary. The fix is the looser
    // `lastIbmError != null` guard, which covers both.
    mockUseQuantumAuthStatus.mockReturnValue(
      authHookReturn({
        data: {
          authenticated: false,
          tokenStored: false,
          // Cast: TypeScript types this `null`, but runtime hydration of a
          // stale cache entry produces `undefined`. We deliberately bypass
          // the type to model the real-world payload that crashed the panel.
          lastIbmError: undefined as unknown as null,
        },
      }),
    )
    const { container } = render(<QuantumControlPanel />)
    selectIbmBackend(container)

    // Panel must render — no error boundary, no crash.
    expect(container.querySelector('select')).toBeInTheDocument()
    // Without an error signal of any kind, neither banner should render.
    expect(
      screen.queryByTestId('quantum-control-panel-transient-banner'),
    ).toBeNull()
    expect(
      screen.queryByTestId('quantum-control-panel-fatal-banner'),
    ).toBeNull()
  })
})

describe('QuantumControlPanel — feedback', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockShowToast.mockReset()
    mockUseAuth.mockReturnValue(defaultAuthReturn())
    mockUseQuantumSystemStatus.mockReturnValue(statusHookReturn())
    mockUseQuantumAuthStatus.mockReturnValue(authHookReturn())
  })

  it('shows a success toast after saving custom QASM content', () => {
    const { container } = render(<QuantumControlPanel />)
    const selects = container.querySelectorAll('select')
    const qasmSelect = selects[1] as HTMLSelectElement

    fireEvent.change(qasmSelect, { target: { value: 'custom' } })
    fireEvent.click(screen.getByTestId('custom-qasm-submit'))

    expect(mockShowToast).toHaveBeenCalledWith('quantumControlPanel.customQasmSaved', 'success')
    expect(screen.queryByTestId('custom-qasm-submit')).toBeNull()
  })

  it('opens the credentials drilldown with translated copy and shows a success toast after save', async () => {
    const refetchAuthStatus = vi.fn().mockResolvedValue(undefined)
    mockUseQuantumAuthStatus.mockReturnValue(authHookReturn({ refetch: refetchAuthStatus }))
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({}),
    }))

    render(<QuantumControlPanel />)
    fireEvent.click(screen.getByText('quantumControlPanel.ibmCredentialsLabel'))

    expect(mockOpenDrillDown).toHaveBeenCalledWith(expect.objectContaining({
      type: 'quantum-credentials',
      title: 'quantumControlPanel.ibmCredentialsTitle',
    }))

    const drillDownConfig = mockOpenDrillDown.mock.calls.at(-1)?.[0]
    await drillDownConfig.data.onSave({ apiKey: 'test-key', crn: 'test-crn' })

    expect(refetchAuthStatus).toHaveBeenCalled()
    expect(mockShowToast).toHaveBeenCalledWith('quantumControlPanel.ibmCredentialsSaved', 'success')
  })

  it('uses ConfirmDialog and shows a success toast after clearing credentials', async () => {
    const refetchAuthStatus = vi.fn().mockResolvedValue(undefined)
    mockUseQuantumAuthStatus.mockReturnValue(authHookReturn({
      data: {
        authenticated: false,
        tokenStored: true,
        lastIbmError: null,
      },
      refetch: refetchAuthStatus,
    }))
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({}),
    }))

    render(<QuantumControlPanel />)
    fireEvent.click(screen.getByTitle('quantumControlPanel.clearCredentials'))

    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText('quantumControlPanel.clearCredentialsTitle')).toBeInTheDocument()
    expect(within(dialog).getByText('quantumControlPanel.clearCredentialsMessage')).toBeInTheDocument()

    fireEvent.click(within(dialog).getByRole('button', { name: 'quantumControlPanel.clearCredentials' }))

    await waitFor(() => {
      expect(refetchAuthStatus).toHaveBeenCalled()
      expect(mockShowToast).toHaveBeenCalledWith('quantumControlPanel.ibmCredentialsCleared', 'success')
    })
  })
})

describe('QuantumControlPanel — three-state credentials badge', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseAuth.mockReturnValue(defaultAuthReturn())
    mockUseQuantumSystemStatus.mockReturnValue(statusHookReturn())
  })

  it('shows "Not configured" when workload reports tokenStored:false', () => {
    mockUseQuantumAuthStatus.mockReturnValue(
      authHookReturn({
        data: {
          authenticated: false,
          tokenStored: false,
          lastIbmError: null,
        },
      }),
    )
    render(<QuantumControlPanel />)
    expect(screen.getByText('quantumControlPanel.credsNone')).toBeInTheDocument()
  })

  it('shows "Stored" when workload reports tokenStored:true but session has not re-confirmed', () => {
    // Common scenario: post-pod-restart. The Qiskit account file on the PV
    // survives, so the workload reports tokenStored:true even though
    // validation hasn't run this session.
    mockUseQuantumAuthStatus.mockReturnValue(
      authHookReturn({
        data: {
          authenticated: false,
          tokenStored: true,
          lastIbmError: null,
        },
      }),
    )
    render(<QuantumControlPanel />)
    expect(screen.getByText('quantumControlPanel.credsStored')).toBeInTheDocument()
  })

  it('shows "Configured" once the session observes authenticated:true', () => {
    mockUseQuantumAuthStatus.mockReturnValue(
      authHookReturn({
        data: {
          authenticated: true,
          tokenStored: true,
          lastIbmError: null,
        },
      }),
    )
    render(<QuantumControlPanel />)
    expect(screen.getByText('quantumControlPanel.credsConfigured')).toBeInTheDocument()
  })

  it('renders a Validate-now button when the badge is in Stored state', () => {
    mockUseQuantumAuthStatus.mockReturnValue(
      authHookReturn({
        data: {
          authenticated: false,
          tokenStored: true,
          lastIbmError: null,
        },
      }),
    )
    render(<QuantumControlPanel />)
    expect(screen.getByLabelText('quantumControlPanel.validateNow')).toBeInTheDocument()
  })

  it('does not render a Validate-now button when the badge is Configured', () => {
    mockUseQuantumAuthStatus.mockReturnValue(
      authHookReturn({
        data: {
          authenticated: true,
          tokenStored: true,
          lastIbmError: null,
        },
      }),
    )
    render(<QuantumControlPanel />)
    expect(screen.queryByLabelText('quantumControlPanel.validateNow')).toBeNull()
  })

  it('REGRESSION (Bug 1 from PR #15948 review): after credentials clear, badge drops to "Not configured" — not "Stored"', () => {
    // Pre-v0.4 the Console inferred tokenLikelyStored from lastRefresh!=null
    // OR authenticated:true. After a `clear`, the workload returns
    // {authenticated:false} which is still a successful fetch — so
    // lastRefresh updated, the inference flipped to true, and the badge
    // fell back to "Stored". That bug is structurally impossible now: the
    // workload reports tokenStored explicitly, and after clear it's false
    // regardless of the cache's lastRefresh state.
    mockUseQuantumAuthStatus.mockReturnValue(
      authHookReturn({
        data: {
          authenticated: false,
          tokenStored: false,
          lastIbmError: null,
        },
        lastRefresh: Date.now(), // recent successful fetch — pre-v0.4 trap
      }),
    )
    render(<QuantumControlPanel />)
    expect(screen.getByText('quantumControlPanel.credsNone')).toBeInTheDocument()
    expect(screen.queryByText('quantumControlPanel.credsStored')).toBeNull()
  })

  it('treats a pre-v0.4 workload (no tokenStored field) as "Not configured" until next validation', () => {
    // The fetcher coerces missing tokenStored to false. Until the next
    // successful auth check flips authenticated:true (which sets
    // sessionValidatedAt and moves the badge to Configured), the badge
    // sits at "Not configured" — harmless and self-healing.
    mockUseQuantumAuthStatus.mockReturnValue(
      authHookReturn({
        data: {
          authenticated: false,
          // Simulate an older workload by leaving tokenStored at its
          // coerced default and lastIbmError at null.
          tokenStored: false,
          lastIbmError: null,
        },
        lastRefresh: Date.now() - 60_000,
      }),
    )
    render(<QuantumControlPanel />)
    expect(screen.getByText('quantumControlPanel.credsNone')).toBeInTheDocument()
  })
})
