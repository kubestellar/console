import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'

// ── Mocks ─────────────────────────────────────────────────────────────────────
const { mockShowToast, mockGetState, mockCreateAction } = vi.hoisted(() => ({
  mockShowToast: vi.fn(),
  mockGetState: vi.fn(),
  mockCreateAction: vi.fn(),
}))

vi.mock('../../ui/Toast', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}))

vi.mock('../../../services/stellar', () => ({
  stellarApi: {
    getState: mockGetState,
    createAction: mockCreateAction,
  },
}))

import { MissionBrowserScheduleActionTab } from '../MissionBrowserScheduleActionTab'

function renderScheduleTab(isActive = true) {
  return render(<MissionBrowserScheduleActionTab isActive={isActive} />)
}

describe('MissionBrowserScheduleActionTab', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetState.mockResolvedValue({ clustersWatching: ['cluster-a', 'cluster-b'] })
    mockCreateAction.mockResolvedValue({})
  })

  // ── Initial render ──────────────────────────────────────────────────────────

  it('renders the Schedule Action heading', () => {
    renderScheduleTab()
    expect(screen.getByText('Schedule Action')).toBeInTheDocument()
  })

  it('renders the Create action submit button', () => {
    renderScheduleTab()
    expect(screen.getByRole('button', { name: 'Create action' })).toBeInTheDocument()
  })

  it('renders Action type dropdown with ScaleDeployment as default', () => {
    renderScheduleTab()
    expect(screen.getByDisplayValue('Scale Deployment')).toBeInTheDocument()
  })

  it('does not load clusters when isActive=false', () => {
    renderScheduleTab(false)
    expect(mockGetState).not.toHaveBeenCalled()
  })

  it('loads clusters when isActive=true', async () => {
    renderScheduleTab(true)
    await waitFor(() => expect(mockGetState).toHaveBeenCalled())
  })

  it('populates cluster dropdown from API state', async () => {
    renderScheduleTab(true)
    await waitFor(() => {
      expect(screen.getByRole('option', { name: 'cluster-a' })).toBeInTheDocument()
      expect(screen.getByRole('option', { name: 'cluster-b' })).toBeInTheDocument()
    })
  })

  it('shows "No clusters available" when API returns empty list', async () => {
    mockGetState.mockResolvedValue({ clustersWatching: [] })
    renderScheduleTab(true)
    await waitFor(() => {
      expect(screen.getByText('No clusters available')).toBeInTheDocument()
    })
  })

  // ── Action types ────────────────────────────────────────────────────────────

  it('renders all 5 action type options', () => {
    renderScheduleTab()
    expect(screen.getByRole('option', { name: 'Scale Deployment' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Restart Deployment' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Delete Pod' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Cordon Node' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Delete Cluster' })).toBeInTheDocument()
  })

  it('shows Namespace and Deployment name fields for ScaleDeployment', () => {
    renderScheduleTab()
    expect(screen.getByText('Namespace')).toBeInTheDocument()
    expect(screen.getByText('Deployment name')).toBeInTheDocument()
  })

  it('shows Replicas field for ScaleDeployment', () => {
    renderScheduleTab()
    expect(screen.getByText('Replicas (0–50)')).toBeInTheDocument()
  })

  it('shows Node name field when CordonNode is selected', async () => {
    renderScheduleTab()
    fireEvent.change(screen.getByDisplayValue('Scale Deployment'), { target: { value: 'CordonNode' } })
    await waitFor(() => expect(screen.getByText('Node name')).toBeInTheDocument())
  })

  it('shows Confirm token field when DeleteCluster is selected', async () => {
    renderScheduleTab()
    fireEvent.change(screen.getByDisplayValue('Scale Deployment'), { target: { value: 'DeleteCluster' } })
    await waitFor(() => expect(screen.getByText('Confirm token')).toBeInTheDocument())
  })

  it('shows Pod name label for DeletePod action', async () => {
    renderScheduleTab()
    fireEvent.change(screen.getByDisplayValue('Scale Deployment'), { target: { value: 'DeletePod' } })
    await waitFor(() => expect(screen.getByText('Pod name')).toBeInTheDocument())
  })

  it('hides namespace/name fields for CordonNode', async () => {
    renderScheduleTab()
    fireEvent.change(screen.getByDisplayValue('Scale Deployment'), { target: { value: 'CordonNode' } })
    await waitFor(() => {
      expect(screen.queryByText('Namespace')).not.toBeInTheDocument()
      expect(screen.queryByText('Deployment name')).not.toBeInTheDocument()
    })
  })

  // ── Destructive warning ─────────────────────────────────────────────────────

  it('shows destructive warning for DeletePod', async () => {
    renderScheduleTab()
    fireEvent.change(screen.getByDisplayValue('Scale Deployment'), { target: { value: 'DeletePod' } })
    await waitFor(() => {
      expect(screen.getByText(/This action is destructive/)).toBeInTheDocument()
    })
  })

  it('shows destructive warning for DeleteCluster', async () => {
    renderScheduleTab()
    fireEvent.change(screen.getByDisplayValue('Scale Deployment'), { target: { value: 'DeleteCluster' } })
    await waitFor(() => {
      expect(screen.getByText(/This action is destructive/)).toBeInTheDocument()
    })
  })

  it('does not show destructive warning for ScaleDeployment', () => {
    renderScheduleTab()
    expect(screen.queryByText(/This action is destructive/)).not.toBeInTheDocument()
  })

  // ── Schedule mode ───────────────────────────────────────────────────────────

  it('renders "After approval" and "Scheduled time" radio options', () => {
    renderScheduleTab()
    expect(screen.getByLabelText('After approval')).toBeInTheDocument()
    expect(screen.getByLabelText('Scheduled time')).toBeInTheDocument()
  })

  it('defaults to after-approval mode', () => {
    renderScheduleTab()
    const afterApproval = screen.getByLabelText('After approval') as HTMLInputElement
    expect(afterApproval.checked).toBe(true)
  })

  it('shows datetime input when Scheduled time is selected', async () => {
    renderScheduleTab()
    fireEvent.click(screen.getByLabelText('Scheduled time'))
    await waitFor(() => {
      expect(document.querySelector('input[type="datetime-local"]')).toBeInTheDocument()
    })
  })

  // ── Form validation & submission ────────────────────────────────────────────

  it('shows warning toast when submitting without a cluster selected', async () => {
    mockGetState.mockResolvedValue({ clustersWatching: [] })
    renderScheduleTab(true)
    await waitFor(() => expect(screen.getByText('No clusters available')).toBeInTheDocument())

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Create action' }))
    })
    expect(mockShowToast).toHaveBeenCalledWith('Select a cluster first.', 'warning')
  })

  it('calls stellarApi.createAction on valid submission', async () => {
    renderScheduleTab(true)
    await waitFor(() => expect(screen.getByRole('option', { name: 'cluster-a' })).toBeInTheDocument())

    fireEvent.change(screen.getByLabelText('Cluster'), { target: { value: 'cluster-a' } })

    await act(async () => {
      fireEvent.submit(screen.getByRole('button', { name: 'Create action' }).closest('form')!)
    })

    await waitFor(() => expect(mockCreateAction).toHaveBeenCalled())
  })

  it('shows success toast after successful action creation', async () => {
    renderScheduleTab(true)
    await waitFor(() => expect(screen.getByRole('option', { name: 'cluster-a' })).toBeInTheDocument())

    fireEvent.change(screen.getByLabelText('Cluster'), { target: { value: 'cluster-a' } })

    await act(async () => {
      fireEvent.submit(screen.getByRole('button', { name: 'Create action' }).closest('form')!)
    })

    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith(
        'Action created — waiting for approval in Stellar panel.',
        'success',
      )
    })
  })

  it('shows error toast when createAction fails', async () => {
    mockCreateAction.mockRejectedValue(new Error('Server error'))
    renderScheduleTab(true)
    await waitFor(() => expect(screen.getByRole('option', { name: 'cluster-a' })).toBeInTheDocument())

    fireEvent.change(screen.getByLabelText('Cluster'), { target: { value: 'cluster-a' } })

    await act(async () => {
      fireEvent.submit(screen.getByRole('button', { name: 'Create action' }).closest('form')!)
    })

    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Server error', 'error')
    })
  })

  it('disables submit button while submitting', async () => {
    let resolveCreate!: () => void
    mockCreateAction.mockReturnValue(new Promise<void>((res) => { resolveCreate = res }))

    renderScheduleTab(true)
    await waitFor(() => expect(screen.getByRole('option', { name: 'cluster-a' })).toBeInTheDocument())
    fireEvent.change(screen.getByLabelText('Cluster'), { target: { value: 'cluster-a' } })

    act(() => {
      fireEvent.submit(screen.getByRole('button', { name: 'Create action' }).closest('form')!)
    })

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Creating…' })).toBeDisabled()
    })

    resolveCreate()
  })
})
