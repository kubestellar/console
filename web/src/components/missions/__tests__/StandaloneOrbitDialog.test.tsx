/**
 * StandaloneOrbitDialog unit tests
 *
 * Covers: smoke render, and the Issue 9373 confirmation flow when the user
 * clicks Create Orbit with no clusters selected (which would otherwise
 * silently target every connected cluster).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// ── Mocks ────────────────────────────────────────────────────────────────

// Force real (non-demo) mode so handleCreate runs the real save path
// (in demo mode it short-circuits to the SetupInstructionsDialog).
vi.mock('../../../lib/demoMode', () => ({
  isDemoMode: () => false,
  getDemoMode: () => false,
  isNetlifyDeployment: false,
  isDemoModeForced: false,
  canToggleDemoMode: () => true,
  setDemoMode: vi.fn(),
  toggleDemoMode: vi.fn(),
  subscribeDemoMode: () => () => {},
  isDemoToken: () => false,
  hasRealToken: () => true,
  setDemoToken: vi.fn(),
  isFeatureEnabled: () => true,
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    // Return the key so we can assert on it (with interpolation baked in
    // for count-style keys we actually check).
    t: (key: string, opts?: Record<string, unknown>) => {
      if (opts && typeof opts.count === 'number') {
        return `${key}:count=${opts.count}`
      }
      if (opts && typeof opts.defaultValue === 'string') {
        return opts.defaultValue
      }
      return key
    },
  }),
}))

const saveMissionMock = vi.fn()
vi.mock('../../../hooks/useMissions', () => ({
  useMissions: () => ({ saveMission: saveMissionMock }),
}))

// Two fake connected clusters so the "empty selection silently targets all"
// branch is exercised (the guard requires clusters.length > 0).
vi.mock('../../../hooks/mcp/clusters', () => ({
  useClusters: () => ({
    clusters: [
      { name: 'prod-us-east-1', healthy: true },
      { name: 'prod-eu-west-1', healthy: true },
    ],
    deduplicatedClusters: [
      { name: 'prod-us-east-1', healthy: true },
      { name: 'prod-eu-west-1', healthy: true },
    ],
    isLoading: false,
  }),
}))

vi.mock('../../../lib/analytics', () => ({
  emitOrbitMissionCreated: vi.fn(),
  emitNavigate: vi.fn(),
  emitLogin: vi.fn(),
  emitEvent: vi.fn(),
  analyticsReady: Promise.resolve(),
}))

// SetupInstructionsDialog pulls in heavy deps; stub it.
vi.mock('../../setup/SetupInstructionsDialog', () => ({
  SetupInstructionsDialog: () => null,
}))

import { StandaloneOrbitDialog } from '../StandaloneOrbitDialog'

describe('StandaloneOrbitDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders without crashing', () => {
    const { container } = render(<StandaloneOrbitDialog onClose={vi.fn()} />)
    expect(container).toBeTruthy()
    expect(screen.getByText('orbit.standaloneTitle')).toBeInTheDocument()
  })

  // Issue 9373: clicking Create with no clusters selected should open
  // a confirmation modal (not silently target all clusters).
  it('Issue 9373: shows confirmation dialog when creating with no clusters selected', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()

    render(<StandaloneOrbitDialog onClose={onClose} />)

    // Primary Create button uses the orbit.standaloneCreate translation key
    const createBtn = screen.getByText('orbit.standaloneCreate')
    await user.click(createBtn)

    // Confirmation dialog title should appear
    expect(screen.getByText('orbit.confirmAllClustersTitle')).toBeInTheDocument()
    // Message should include the cluster count (2 from our mock)
    expect(
      screen.getByText('orbit.confirmAllClustersMessage:count=2'),
    ).toBeInTheDocument()

    // Mission should NOT have been persisted yet.
    expect(saveMissionMock).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
  })

  // Issue 9373: confirming the "run on all clusters" modal should proceed
  // with persistence (legitimate run-on-all intent).
  it('Issue 9373: confirming the empty-selection modal persists the mission', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()

    render(<StandaloneOrbitDialog onClose={onClose} />)

    await user.click(screen.getByText('orbit.standaloneCreate'))

    // Click the confirm button.
    const confirmBtn = screen.getByText('orbit.confirmAllClustersContinue')
    await user.click(confirmBtn)

    // Mission should now have been saved with an empty cluster list
    // (the "all clusters" semantics are a downstream concern).
    expect(saveMissionMock).toHaveBeenCalledTimes(1)
    const saved = saveMissionMock.mock.calls[0][0] as {
      context: { orbitConfig: { clusters: string[] } }
    }
    expect(saved.context.orbitConfig.clusters).toEqual([])
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  // Issue 9373: cancelling the modal must not persist anything and must
  // leave the primary dialog open so the user can pick clusters.
  it('Issue 9373: cancelling the confirm dialog does not persist', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()

    render(<StandaloneOrbitDialog onClose={onClose} />)

    await user.click(screen.getByText('orbit.standaloneCreate'))
    // Confirm dialog open — two "Cancel" buttons exist now (parent dialog +
    // the ConfirmDialog). The ConfirmDialog is appended last, so its button
    // is the last one in DOM order.
    const cancelButtons = screen.getAllByText('Cancel')
    const confirmCancel = cancelButtons[cancelButtons.length - 1]
    await user.click(confirmCancel)

    expect(saveMissionMock).not.toHaveBeenCalled()
    // Parent dialog should still be open (Create button still in DOM)
    expect(screen.getByText('orbit.standaloneCreate')).toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
  })
})
