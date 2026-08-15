import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QuotaModal } from '../NamespaceQuotasModal'
import type { ResourceQuota } from '../../../hooks/useMCP'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    t: (key: string) => {
      const parts = key.split('.')
      return parts[parts.length - 1]
    },
  }),
}))

const mockUseCachedNamespaces = vi.fn()
vi.mock('../../../hooks/useCachedData', () => ({
  useCachedNamespaces: (cluster?: string) => mockUseCachedNamespaces(cluster),
}))

function renderModal(overrides: Partial<React.ComponentProps<typeof QuotaModal>> = {}) {
  const onClose = vi.fn()
  const onSave = vi.fn().mockResolvedValue(undefined)
  const props: React.ComponentProps<typeof QuotaModal> = {
    isOpen: true,
    onClose,
    onSave,
    clusters: [{ name: 'cluster-1' }, { name: 'cluster-2' }],
    namespaces: ['default', 'kube-system'],
    selectedCluster: 'all',
    selectedNamespace: 'all',
    editingQuota: null,
    isLoading: false,
    ...overrides,
  }
  return { onClose, onSave, ...render(<QuotaModal {...props} />) }
}

describe('QuotaModal (NamespaceQuotasModal)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseCachedNamespaces.mockReturnValue({ namespaces: [], isRefreshing: false, lastRefresh: null })
  })

  it('renders the create-quota title when not editing', () => {
    renderModal()
    expect(screen.getByText('createQuota')).toBeInTheDocument()
  })

  it('renders the edit-quota title and pre-fills fields when editing', () => {
    const editingQuota = {
      cluster: 'cluster-1',
      namespace: 'default',
      name: 'existing-quota',
      hard: { 'requests.cpu': '2' },
    } as ResourceQuota
    renderModal({ editingQuota })
    expect(screen.getByText('editQuota')).toBeInTheDocument()
    expect(screen.getByDisplayValue('existing-quota')).toBeInTheDocument()
  })

  it('shows a validation error when saving without cluster, namespace, or name', async () => {
    const user = userEvent.setup()
    renderModal()
    await user.click(screen.getByText('create'))
    expect(screen.getByText('Cluster, namespace, and name are required')).toBeInTheDocument()
  })

  it('calls onSave with the built spec and closes on success', async () => {
    const user = userEvent.setup()
    mockUseCachedNamespaces.mockReturnValue({ namespaces: ['default'], isRefreshing: false, lastRefresh: null })
    const { onSave, onClose } = renderModal()

    await user.selectOptions(screen.getByDisplayValue('selectCluster'), 'cluster-1')
    await user.selectOptions(screen.getByDisplayValue('selectNamespace'), 'default')
    await user.type(screen.getByPlaceholderText('quotaNamePlaceholder'), 'gpu-quota')
    await user.click(screen.getByText('create'))

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ cluster: 'cluster-1', namespace: 'default', name: 'gpu-quota' })
    )
    expect(onClose).toHaveBeenCalled()
  })

  it('calls onClose when Cancel is clicked', async () => {
    const user = userEvent.setup()
    const { onClose } = renderModal()
    await user.click(screen.getByText('cancel'))
    expect(onClose).toHaveBeenCalled()
  })
})
