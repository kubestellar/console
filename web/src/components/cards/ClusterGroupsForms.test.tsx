import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { CreateGroupForm, EditGroupForm } from './ClusterGroupsForms'

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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockClusterGroups.mockReturnValue(baseClusterGroups as any)
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
    const cancelBtn = screen.getByRole('button', { name: /cancel/i })
    fireEvent.click(cancelBtn)
    expect(onCancel).toHaveBeenCalledTimes(1)
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

  it('matches snapshot', () => {
    const { container } = render(
      <CreateGroupForm
        availableClusters={availableClusters}
        clusterHealthMap={healthyMap}
        onSave={onSave}
        onCancel={onCancel}
      />
    )
    expect(container).toMatchSnapshot()
  })
})

describe('EditGroupForm', () => {
  const onSave = vi.fn()
  const onCancel = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockClusterGroups.mockReturnValue(baseClusterGroups as any)
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
    const cancelBtn = screen.getByRole('button', { name: /cancel/i })
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

  it('matches snapshot', () => {
    const { container } = render(
      <EditGroupForm
        group={existingGroup}
        availableClusters={availableClusters}
        clusterHealthMap={healthyMap}
        onSave={onSave}
        onCancel={onCancel}
      />
    )
    expect(container).toMatchSnapshot()
  })
})
