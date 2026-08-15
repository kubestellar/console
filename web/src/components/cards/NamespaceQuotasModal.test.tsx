import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QuotaModal } from './NamespaceQuotasModal'
import type { ResourceQuota } from '../../hooks/useMCP'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    t: (key: string) => {
      const parts = key.split('.')
      return parts[parts.length - 1]
    },
  }),
}))

vi.mock('../../hooks/useMCP', () => ({
  COMMON_RESOURCE_TYPES: [
    { key: 'requests.cpu', label: 'CPU Requests' },
    { key: 'limits.memory', label: 'Memory Limits' },
  ],
  GPU_RESOURCE_TYPES: [
    { key: 'limits.nvidia.com/gpu', label: 'NVIDIA GPU Limits' },
  ],
}))

const mockUseCachedNamespaces = vi.fn()
vi.mock('../../hooks/useCachedData', () => ({
  useCachedNamespaces: (cluster?: string) => mockUseCachedNamespaces(cluster),
}))

const clusters = [{ name: 'cluster-1' }, { name: 'cluster-2' }]

function setup(overrides: Partial<React.ComponentProps<typeof QuotaModal>> = {}) {
  const onClose = vi.fn()
  const onSave = vi.fn().mockResolvedValue(undefined)
  const props: React.ComponentProps<typeof QuotaModal> = {
    isOpen: true,
    onClose,
    onSave,
    clusters,
    namespaces: ['default', 'kube-system'],
    selectedCluster: 'all',
    selectedNamespace: 'all',
    isLoading: false,
    ...overrides,
  }
  const { container } = render(<QuotaModal {...props} />)
  return { onClose, onSave, props, container }
}

describe('QuotaModal (NamespaceQuotasModal)', () => {
  beforeEach(() => {
    mockUseCachedNamespaces.mockReturnValue({
      namespaces: ['team-a', 'team-b'],
      isRefreshing: false,
      lastRefresh: null,
    })
  })

  it('renders the create title when there is no editingQuota', () => {
    setup()
    expect(screen.getByText('createQuota')).toBeInTheDocument()
  })

  it('renders the edit title and pre-fills fields when editingQuota is provided', () => {
    const editingQuota: ResourceQuota = {
      cluster: 'cluster-1',
      namespace: 'team-a',
      name: 'quota-1',
      hard: { 'requests.cpu': '4' },
    } as ResourceQuota
    setup({ editingQuota })
    expect(screen.getByText('editQuota')).toBeInTheDocument()
    expect(screen.getByDisplayValue('quota-1')).toBeInTheDocument()
  })

  it('shows a validation error when saving without required fields', async () => {
    const user = userEvent.setup()
    setup()
    await user.click(screen.getByText('create'))
    expect(await screen.findByText('Cluster, namespace, and name are required')).toBeInTheDocument()
  })

  it('shows a validation error when no resource limits are provided', async () => {
    const user = userEvent.setup()
    const { container } = setup()

    const [clusterSelect, namespaceSelect] = screen.getAllByRole('combobox')
    await user.selectOptions(clusterSelect, 'cluster-1')
    await user.selectOptions(namespaceSelect, 'team-a')
    await user.type(screen.getByPlaceholderText('quotaNamePlaceholder'), 'quota-1')

    // Remove the default GPU resource row so no resource limits remain.
    const removeButton = document.querySelector('.lucide-trash-2')?.closest('button')
    if (removeButton) await user.click(removeButton)

    await user.click(screen.getByText('create'))
    expect(await screen.findByText('At least one resource limit is required')).toBeInTheDocument()
  })

  it('calls onSave with the built spec and closes the modal on success', async () => {
    const user = userEvent.setup()
    const { onSave, onClose } = setup()

    const [clusterSelect, namespaceSelect, resourceSelect] = screen.getAllByRole('combobox')
    await user.selectOptions(clusterSelect, 'cluster-1')
    await user.selectOptions(namespaceSelect, 'team-a')
    await user.type(screen.getByPlaceholderText('quotaNamePlaceholder'), 'quota-1')
    await user.selectOptions(resourceSelect, 'requests.cpu')
    const valueInput = screen.getByPlaceholderText('e.g., 4, 8Gi')
    await user.clear(valueInput)
    await user.type(valueInput, '4')

    await user.click(screen.getByText('create'))

    expect(onSave).toHaveBeenCalledWith({
      cluster: 'cluster-1',
      namespace: 'team-a',
      name: 'quota-1',
      hard: { 'requests.cpu': '4' },
    })
    expect(await screen.findByText('createQuota')).toBeInTheDocument()
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('adds a new resource row when Add is clicked', async () => {
    const user = userEvent.setup()
    setup()
    const selectsBefore = screen.getAllByRole('combobox')
    await user.click(screen.getByText('add'))
    const selectsAfter = screen.getAllByRole('combobox')
    expect(selectsAfter.length).toBe(selectsBefore.length + 1)
  })

  it('does not duplicate a GPU preset resource that is already present', async () => {
    const user = userEvent.setup()
    setup()
    // The modal seeds an initial GPU resource row by default.
    const rowsBefore = document.querySelectorAll('.space-y-2 > .flex.items-center.gap-2').length
    await user.click(screen.getByText('GPU'))
    await user.click(screen.getByText('NVIDIA GPU Limits'))
    const rowsAfter = document.querySelectorAll('.space-y-2 > .flex.items-center.gap-2').length
    expect(rowsAfter).toBe(rowsBefore)
  })

  it('calls onClose when Cancel is clicked', async () => {
    const user = userEvent.setup()
    const { onClose } = setup()
    await user.click(screen.getByText('cancel'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
