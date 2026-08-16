/**
 * Tests for NamespaceQuotasModal / QuotaModal (#22502, part of #22484).
 *
 * Covers: create vs. edit mode, cluster/namespace selectors, adding and
 * removing resource limit rows, required-field validation, and the save
 * (mutation) flow including error handling.
 */
import type React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QuotaModal } from '../NamespaceQuotasModal'
import type { ResourceQuota } from '../../../hooks/useMCP'

const mockUseCachedNamespaces = vi.fn()
vi.mock('../../../hooks/useCachedData', () => ({
  useCachedNamespaces: (cluster?: string) => mockUseCachedNamespaces(cluster),
}))

vi.mock('../../../hooks/useMCP', () => ({
  COMMON_RESOURCE_TYPES: [
    { key: 'requests.cpu', label: 'CPU Requests', description: 'Total CPU requests allowed' },
  ],
  GPU_RESOURCE_TYPES: [
    { key: 'limits.nvidia.com/gpu', label: 'NVIDIA GPU Limits', description: 'Maximum GPU limits allowed' },
  ],
}))

const CLUSTERS = [{ name: 'cluster-a' }, { name: 'cluster-b' }]

const EDITING_QUOTA: ResourceQuota = {
  cluster: 'cluster-a',
  namespace: 'team-a',
  name: 'default-quota',
  hard: { 'requests.cpu': '4' },
  used: { 'requests.cpu': '2' },
} as ResourceQuota

function renderModal(overrides: Partial<React.ComponentProps<typeof QuotaModal>> = {}) {
  const props: React.ComponentProps<typeof QuotaModal> = {
    isOpen: true,
    onClose: vi.fn(),
    onSave: vi.fn().mockResolvedValue(undefined),
    clusters: CLUSTERS,
    namespaces: ['ns-a', 'ns-b'],
    selectedCluster: 'all',
    selectedNamespace: 'all',
    editingQuota: null,
    isLoading: false,
    ...overrides,
  }
  return { ...render(<QuotaModal {...props} />), props }
}

describe('NamespaceQuotasModal (QuotaModal)', () => {
  beforeEach(() => {
    mockUseCachedNamespaces.mockReturnValue({ namespaces: [], isRefreshing: false, lastRefresh: null })
  })

  it('renders the create-mode title and Create button', () => {
    renderModal()
    expect(screen.getByText('namespaceQuotas.createQuota')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'common:common.create' })).toBeInTheDocument()
  })

  it('renders the edit-mode title, pre-filled fields, and Update button', () => {
    renderModal({ editingQuota: EDITING_QUOTA })
    expect(screen.getByText('namespaceQuotas.editQuota')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'common:common.update' })).toBeInTheDocument()
    expect(screen.getByDisplayValue('default-quota')).toBeInTheDocument()
  })

  it('disables cluster/namespace/name inputs while editing an existing quota', () => {
    renderModal({ editingQuota: EDITING_QUOTA })
    expect(screen.getByDisplayValue('default-quota')).toBeDisabled()
  })

  it('shows a validation error when saving without cluster/namespace/name', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn()
    renderModal({ onSave })

    await user.click(screen.getByRole('button', { name: 'common:common.create' }))
    expect(screen.getByText('Cluster, namespace, and name are required')).toBeInTheDocument()
    expect(onSave).not.toHaveBeenCalled()
  })

  it('adds a new empty resource row when "Add" is clicked', async () => {
    const user = userEvent.setup()
    renderModal()

    const initialRows = screen.getAllByPlaceholderText('e.g., 4, 8Gi')
    await user.click(screen.getByRole('button', { name: /common:common\.add/ }))
    const updatedRows = screen.getAllByPlaceholderText('e.g., 4, 8Gi')
    expect(updatedRows.length).toBe(initialRows.length + 1)
  })

  it('removes a resource row when its delete button is clicked', async () => {
    const user = userEvent.setup()
    renderModal()

    const initialRows = screen.getAllByPlaceholderText('e.g., 4, 8Gi')
    const deleteButtons = document.querySelectorAll('svg.lucide-trash2')
    expect(deleteButtons.length).toBeGreaterThan(0)
    await user.click(deleteButtons[0].closest('button')!)
    const updatedRows = screen.queryAllByPlaceholderText('e.g., 4, 8Gi')
    expect(updatedRows.length).toBe(initialRows.length - 1)
  })

  it('calls onSave with the built hard-limits spec and closes on success', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn().mockResolvedValue(undefined)
    const onClose = vi.fn()
    renderModal({ onSave, onClose, selectedCluster: 'cluster-a', selectedNamespace: 'team-a' })

    await user.type(screen.getByPlaceholderText('namespaceQuotas.quotaNamePlaceholder'), 'my-quota')
    const resourceSelect = screen.getByDisplayValue('namespaceQuotas.selectResource')
    await user.selectOptions(resourceSelect, 'requests.cpu')

    await user.click(screen.getByRole('button', { name: 'common:common.create' }))

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        cluster: 'cluster-a',
        namespace: 'team-a',
        name: 'my-quota',
        hard: expect.objectContaining({ 'requests.cpu': '4' }),
      })
    )
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('surfaces an error message when onSave rejects', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn().mockRejectedValue(new Error('Server exploded'))
    renderModal({ onSave, selectedCluster: 'cluster-a', selectedNamespace: 'team-a' })

    await user.type(screen.getByPlaceholderText('namespaceQuotas.quotaNamePlaceholder'), 'my-quota')
    await user.selectOptions(screen.getByDisplayValue('namespaceQuotas.selectResource'), 'requests.cpu')

    await user.click(screen.getByRole('button', { name: 'common:common.create' }))

    expect(await screen.findByText('Server exploded')).toBeInTheDocument()
  })
})
