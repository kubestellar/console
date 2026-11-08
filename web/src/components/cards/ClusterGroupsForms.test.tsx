import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { CreateGroupForm, EditGroupForm } from './ClusterGroupsForms'
import { ToastProvider } from '../ui/Toast'

vi.mock('../../hooks/useClusterGroups', () => ({
  useClusterGroups: vi.fn(),
}))

vi.mock('./ClusterGroups.constants', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('./ClusterGroups.constants')
  return {
    ...actual,
    GROUP_COLORS: ['green', 'blue', 'purple', 'cyan', 'orange', 'red'],
    FILTER_FIELDS: [],
    FILTER_OPERATORS: [],
  }
})

vi.mock('../ui/ClusterBadge', () => ({
  ClusterBadge: ({ cluster }: { cluster: string }) => <span>{cluster}</span>,
}))

import { useClusterGroups } from '../../hooks/useClusterGroups'

const mockClusterGroups = vi.mocked(useClusterGroups)

const baseClusterGroups = {
  groups: [],
  createGroup: vi.fn(),
  updateGroup: vi.fn(),
  deleteGroup: vi.fn(),
  isPersisted: false,
}

const healthyMap = new Map<string, boolean | undefined>([
  ['prod-1', true],
  ['prod-2', true],
  ['staging-1', false],
])

const availableClusters = ['prod-1', 'prod-2', 'staging-1']

const existingGroup = {
  name: 'production',
  kind: 'static' as const,
  clusters: ['prod-1', 'prod-2'],
  color: 'green',
  builtIn: false,
}

describe('CreateGroupForm', () => {
  const onSave = vi.fn()
  const onCancel = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    mockClusterGroups.mockReturnValue(baseClusterGroups as unknown as ReturnType<typeof useClusterGroups>)
  })

  it('renders form with name input and cluster list', () => {
    render(
      <CreateGroupForm
        availableClusters={availableClusters}
        clusterHealthMap={healthyMap}
        onSave={onSave}
        onCancel={onCancel}
      />
    )
    expect(screen.getByPlaceholderText('cards:clusterGroups.groupNamePlaceholder')).toBeInTheDocument()
  })

  it('calls onCancel when cancel is clicked', () => {
    render(
      <CreateGroupForm
        availableClusters={availableClusters}
        clusterHealthMap={healthyMap}
        onSave={onSave}
        onCancel={onCancel}
      />
    )
    const cancelBtn = screen.getAllByRole('button', { name: /common:common.cancel/i })[0]
    fireEvent.click(cancelBtn)
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('keeps creation pending until the save completes', async () => {
    const { promise, resolve: finish } = Promise.withResolvers<void>()
    const save = vi.fn(() => promise)
    render(<CreateGroupForm availableClusters={availableClusters} clusterHealthMap={healthyMap} onSave={save} onCancel={onCancel} />)
    fireEvent.change(screen.getByPlaceholderText('cards:clusterGroups.groupNamePlaceholder'), { target: { value: 'new group' } })
    fireEvent.click(screen.getByRole('button', { name: 'prod-1' }))
    fireEvent.click(screen.getByRole('button', { name: 'cards:clusterGroups.createGroup' }))
    expect(screen.getByRole('button', { name: 'common:common.saving' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'common:common.cancel' })).toBeDisabled()
    await act(async () => finish())
    expect(screen.getByRole('button', { name: 'cards:clusterGroups.createGroup' })).toBeEnabled()
  })

  it('allows retry and reports an unsuccessful save', async () => {
    const save = vi.fn().mockRejectedValue(new Error('save failed'))
    render(<ToastProvider><CreateGroupForm availableClusters={availableClusters} clusterHealthMap={healthyMap} onSave={save} onCancel={onCancel} /></ToastProvider>)
    fireEvent.change(screen.getByPlaceholderText('cards:clusterGroups.groupNamePlaceholder'), { target: { value: 'new group' } })
    fireEvent.click(screen.getByRole('button', { name: 'prod-1' }))
    fireEvent.click(screen.getByRole('button', { name: 'cards:clusterGroups.createGroup' }))
    expect(await screen.findByText('cards:clusterGroups.createFailed')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'cards:clusterGroups.createGroup' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'common:common.cancel' })).toBeEnabled()
  })

  it('renders with empty cluster list (empty state)', () => {
    const { container } = render(
      <CreateGroupForm
        availableClusters={[]}
        clusterHealthMap={new Map()}
        onSave={onSave}
        onCancel={onCancel}
      />
    )
    expect(container.firstChild).toBeTruthy()
  })

  it('renders with available clusters (happy-path)', () => {
    const { container } = render(
      <CreateGroupForm
        availableClusters={availableClusters}
        clusterHealthMap={healthyMap}
        onSave={onSave}
        onCancel={onCancel}
      />
    )
    expect(container.firstChild).toBeTruthy()
    expect(screen.getByText('prod-1')).toBeInTheDocument()
  })

  it('renders without crashing', () => {
    const { container } = render(
      <CreateGroupForm
        availableClusters={availableClusters}
        clusterHealthMap={healthyMap}
        onSave={onSave}
        onCancel={onCancel}
      />
    )
    expect(container.firstChild).toBeTruthy()
  })
})

describe('EditGroupForm', () => {
  const onSave = vi.fn()
  const onCancel = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    mockClusterGroups.mockReturnValue(baseClusterGroups as unknown as ReturnType<typeof useClusterGroups>)
  })

  it('renders edit form with group name pre-filled', () => {
    render(
      <EditGroupForm
        group={existingGroup}
        availableClusters={availableClusters}
        clusterHealthMap={healthyMap}
        onSave={onSave}
        onCancel={onCancel}
      />
    )
    // Group name shown in the form header (not an editable input)
    expect(screen.getByText(/production/)).toBeInTheDocument()
  })

  it('calls onCancel when cancel is clicked', () => {
    render(
      <EditGroupForm
        group={existingGroup}
        availableClusters={availableClusters}
        clusterHealthMap={healthyMap}
        onSave={onSave}
        onCancel={onCancel}
      />
    )
    const cancelBtn = screen.getAllByRole('button', { name: /common:common.cancel/i })[0]
    fireEvent.click(cancelBtn)
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('renders with empty cluster list (empty state)', () => {
    const { container } = render(
      <EditGroupForm
        group={{ ...existingGroup, clusters: [] }}
        availableClusters={[]}
        clusterHealthMap={new Map()}
        onSave={onSave}
        onCancel={onCancel}
      />
    )
    expect(container.firstChild).toBeTruthy()
  })

  it('renders without crashing', () => {
    const { container } = render(
      <EditGroupForm
        group={existingGroup}
        availableClusters={availableClusters}
        clusterHealthMap={healthyMap}
        onSave={onSave}
        onCancel={onCancel}
      />
    )
    expect(container.firstChild).toBeTruthy()
  })
})
