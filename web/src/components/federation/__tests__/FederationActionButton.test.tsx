import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { FederationActionButton } from '../FederationActionButton'
import type { ActionDescriptor, ActionResult } from '../../../hooks/useFederationActions'

/* ---------- Mocks ---------- */

const mockCheckPermission = vi.fn()
vi.mock('../../../hooks/usePermissions', () => ({
  useCanI: () => ({ checkPermission: mockCheckPermission }),
}))

const mockExecuteFederationAction = vi.fn()
vi.mock('../../../hooks/useFederationActions', () => ({
  executeFederationAction: (...args: unknown[]) => mockExecuteFederationAction(...args),
}))

vi.mock('../../ui/Button', () => ({
  Button: ({
    children,
    onClick,
    disabled,
    loading,
    variant,
    ...rest
  }: Record<string, unknown>) => (
    <button
      onClick={onClick as () => void}
      disabled={disabled as boolean}
      data-loading={String(Boolean(loading))}
      data-variant={variant as string}
      {...(rest as Record<string, unknown>)}
    >
      {children as React.ReactNode}
    </button>
  ),
}))

let confirmDialogProps: {
  isOpen: boolean
  onConfirm: () => void
  onClose: () => void
  message?: string
  isLoading?: boolean
} | null = null
vi.mock('../../../lib/modals/ConfirmDialog', () => ({
  ConfirmDialog: (props: {
    isOpen: boolean
    onConfirm: () => void
    onClose: () => void
    message?: string
    isLoading?: boolean
  }) => {
    confirmDialogProps = props
    if (!props.isOpen) return null
    return (
      <div data-testid="confirm-dialog">
        <span data-testid="confirm-message">{props.message}</span>
        <button onClick={props.onConfirm}>confirm</button>
        <button onClick={props.onClose}>cancel</button>
      </div>
    )
  },
}))

const nonDestructiveAction: ActionDescriptor = {
  id: 'ocm.acceptCluster',
  label: 'Accept Cluster',
  verb: 'patch',
  provider: 'ocm',
  destructive: false,
}

const destructiveAction: ActionDescriptor = {
  id: 'ocm.detachCluster',
  label: 'Detach Cluster',
  verb: 'delete',
  provider: 'ocm',
  destructive: true,
}

const csrAction: ActionDescriptor = {
  id: 'ocm.approveCSR',
  label: 'Approve CSR',
  verb: 'update',
  provider: 'ocm',
  destructive: false,
}

const unknownAction: ActionDescriptor = {
  id: 'ocm.unknownVerb',
  label: 'Unknown Action',
  verb: 'patch',
  provider: 'ocm',
  destructive: false,
}

describe('FederationActionButton', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    confirmDialogProps = null
  })

  it('renders nothing while the permission check is pending', () => {
    mockCheckPermission.mockReturnValue(new Promise(() => {})) // never resolves
    const { container } = render(
      <FederationActionButton action={nonDestructiveAction} hubContext="hub-1" />
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing when the SSAR check denies permission', async () => {
    mockCheckPermission.mockResolvedValue({ allowed: false })
    const { container } = render(
      <FederationActionButton action={nonDestructiveAction} hubContext="hub-1" />
    )
    await waitFor(() => expect(mockCheckPermission).toHaveBeenCalled())
    await waitFor(() => expect(container).toBeEmptyDOMElement())
  })

  it('renders the button once the SSAR check allows the action', async () => {
    mockCheckPermission.mockResolvedValue({ allowed: true })
    render(<FederationActionButton action={nonDestructiveAction} hubContext="hub-1" />)
    expect(await screen.findByText('Accept Cluster')).toBeInTheDocument()
  })

  it('checks permission with the mapped resource/group for a known action', async () => {
    mockCheckPermission.mockResolvedValue({ allowed: true })
    render(
      <FederationActionButton action={nonDestructiveAction} hubContext="hub-1" clusterName="c1" />
    )
    await waitFor(() =>
      expect(mockCheckPermission).toHaveBeenCalledWith({
        cluster: 'hub-1',
        verb: 'patch',
        resource: 'managedclusters',
        group: 'cluster.open-cluster-management.io',
      })
    )
  })

  it('uses the certificates API group for CSR-approval actions', async () => {
    mockCheckPermission.mockResolvedValue({ allowed: true })
    render(<FederationActionButton action={csrAction} hubContext="hub-1" />)
    await waitFor(() =>
      expect(mockCheckPermission).toHaveBeenCalledWith({
        cluster: 'hub-1',
        verb: 'update',
        resource: 'certificatesigningrequests/approval',
        group: 'certificates.k8s.io',
      })
    )
  })

  it('falls back to the managedclusters resource for an unmapped action id', async () => {
    mockCheckPermission.mockResolvedValue({ allowed: true })
    render(<FederationActionButton action={unknownAction} hubContext="hub-1" />)
    await waitFor(() =>
      expect(mockCheckPermission).toHaveBeenCalledWith({
        cluster: 'hub-1',
        verb: 'patch',
        resource: 'managedclusters',
        group: 'cluster.open-cluster-management.io',
      })
    )
  })

  it('executes a non-destructive action immediately on click, without a confirm dialog', async () => {
    mockCheckPermission.mockResolvedValue({ allowed: true })
    const result: ActionResult = { ok: true, already: false }
    mockExecuteFederationAction.mockResolvedValue(result)
    const onComplete = vi.fn()

    render(
      <FederationActionButton
        action={nonDestructiveAction}
        hubContext="hub-1"
        clusterName="cluster-a"
        payload={{ foo: 'bar' }}
        onComplete={onComplete}
      />
    )

    const button = await screen.findByText('Accept Cluster')
    fireEvent.click(button)

    expect(screen.queryByTestId('confirm-dialog')).not.toBeInTheDocument()
    await waitFor(() =>
      expect(mockExecuteFederationAction).toHaveBeenCalledWith({
        actionId: 'ocm.acceptCluster',
        provider: 'ocm',
        hubContext: 'hub-1',
        clusterName: 'cluster-a',
        payload: { foo: 'bar' },
      })
    )
    await waitFor(() => expect(onComplete).toHaveBeenCalledWith(result))
  })

  it('shows a confirm dialog before executing a destructive action', async () => {
    mockCheckPermission.mockResolvedValue({ allowed: true })
    render(
      <FederationActionButton
        action={destructiveAction}
        hubContext="hub-1"
        clusterName="cluster-a"
      />
    )

    const button = await screen.findByText('Detach Cluster')
    fireEvent.click(button)

    expect(await screen.findByTestId('confirm-dialog')).toBeInTheDocument()
    expect(mockExecuteFederationAction).not.toHaveBeenCalled()
    expect(confirmDialogProps?.message).toContain('cluster-a')
  })

  it('executes the destructive action only after confirmation, then closes the dialog', async () => {
    mockCheckPermission.mockResolvedValue({ allowed: true })
    const result: ActionResult = { ok: true, already: false }
    mockExecuteFederationAction.mockResolvedValue(result)
    const onComplete = vi.fn()

    render(
      <FederationActionButton
        action={destructiveAction}
        hubContext="hub-1"
        clusterName="cluster-a"
        onComplete={onComplete}
      />
    )

    fireEvent.click(await screen.findByText('Detach Cluster'))
    fireEvent.click(await screen.findByText('confirm'))

    await waitFor(() =>
      expect(mockExecuteFederationAction).toHaveBeenCalledWith(
        expect.objectContaining({ actionId: 'ocm.detachCluster', hubContext: 'hub-1' })
      )
    )
    await waitFor(() => expect(onComplete).toHaveBeenCalledWith(result))
    await waitFor(() => expect(screen.queryByTestId('confirm-dialog')).not.toBeInTheDocument())
  })

  it('dismisses the confirm dialog without executing the action on cancel', async () => {
    mockCheckPermission.mockResolvedValue({ allowed: true })
    render(
      <FederationActionButton action={destructiveAction} hubContext="hub-1" clusterName="cluster-a" />
    )

    fireEvent.click(await screen.findByText('Detach Cluster'))
    fireEvent.click(await screen.findByText('cancel'))

    await waitFor(() => expect(screen.queryByTestId('confirm-dialog')).not.toBeInTheDocument())
    expect(mockExecuteFederationAction).not.toHaveBeenCalled()
  })
})
