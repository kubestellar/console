import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NamespaceAccessPanel } from '../NamespaceAccessPanel'
import { api, authFetch } from '../../../lib/api'
import type { NamespaceDetails, NamespaceAccessEntry } from '../types'

/**
 * NamespaceAccessPanel Component Tests
 * 
 * Tests rendering of access entries, revocation callback, admin-only
 * behavior, loading states, error handling, and "Grant Access" button.
 */

// ── Mocks ──────────────────────────────────────────────────────────────────

vi.mock('../../../lib/api', () => ({
  api: {
    get: vi.fn(),
  },
  authFetch: vi.fn(),
}))

vi.mock('../../ui/ClusterBadge', () => ({
  ClusterBadge: ({ cluster }: { cluster: string }) => <div data-testid="cluster-badge">{cluster}</div>,
}))

vi.mock('../../ui/Toast', () => ({
  useToast: () => ({
    showToast: vi.fn(),
  }),
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => fallback || key,
  }),
}))

// ── Test Data ──────────────────────────────────────────────────────────────

const mockNamespace: NamespaceDetails = {
  name: 'test-namespace',
  cluster: 'cluster-1',
  status: 'Active',
  createdAt: '2024-01-01T00:00:00Z',
}

const mockAccessEntries: NamespaceAccessEntry[] = [
  {
    bindingName: 'binding-1',
    roleName: 'admin',
    subjectName: 'alice',
    subjectKind: 'User',
  },
  {
    bindingName: 'binding-2',
    roleName: 'edit',
    subjectName: 'bob',
    subjectKind: 'ServiceAccount',
  },
]

// ── Tests ──────────────────────────────────────────────────────────────────

describe('NamespaceAccessPanel', () => {
  const mockOnGrantAccess = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(window, { partial: true }).confirm = vi.fn(() => true)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders nothing when namespace is null', () => {
    const { container } = render(
      <NamespaceAccessPanel
        namespace={null}
        isAdmin={true}
        onGrantAccess={mockOnGrantAccess}
      />
    )

    expect(container).toBeEmptyDOMElement()
  })

  it('renders namespace name and cluster badge', () => {
    vi.mocked(api.get).mockResolvedValue({ data: { bindings: [] } })

    render(
      <NamespaceAccessPanel
        namespace={mockNamespace}
        isAdmin={true}
        onGrantAccess={mockOnGrantAccess}
      />
    )

    expect(screen.getByText('test-namespace')).toBeInTheDocument()
    expect(screen.getByTestId('cluster-badge')).toHaveTextContent('cluster-1')
  })

  it('shows admin-required message for non-admin users', () => {
    render(
      <NamespaceAccessPanel
        namespace={mockNamespace}
        isAdmin={false}
        onGrantAccess={mockOnGrantAccess}
      />
    )

    expect(screen.getByText(/Admin access required to view role bindings/i)).toBeInTheDocument()
  })

  it('fetches and displays access entries for admin users', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { bindings: mockAccessEntries } })

    render(
      <NamespaceAccessPanel
        namespace={mockNamespace}
        isAdmin={true}
        onGrantAccess={mockOnGrantAccess}
      />
    )

    await waitFor(() => {
      expect(screen.getByText('alice')).toBeInTheDocument()
    })

    expect(screen.getByText('bob')).toBeInTheDocument()
    expect(screen.getByText('Role: admin')).toBeInTheDocument()
    expect(screen.getByText('Role: edit')).toBeInTheDocument()
  })

  it('shows loading spinner while fetching access', async () => {
    vi.mocked(api.get).mockImplementation(
      () => new Promise(resolve => setTimeout(() => resolve({ data: { bindings: [] } }), 100))
    )

    render(
      <NamespaceAccessPanel
        namespace={mockNamespace}
        isAdmin={true}
        onGrantAccess={mockOnGrantAccess}
      />
    )

    expect(screen.getByRole('generic', { name: /spinner/i }) || document.querySelector('.spinner')).toBeTruthy()

    await waitFor(() => {
      expect(screen.queryByRole('generic', { name: /spinner/i })).not.toBeInTheDocument()
    })
  })

  it('shows "no role bindings" message when entries are empty', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { bindings: [] } })

    render(
      <NamespaceAccessPanel
        namespace={mockNamespace}
        isAdmin={true}
        onGrantAccess={mockOnGrantAccess}
      />
    )

    await waitFor(() => {
      expect(screen.getByText(/No role bindings found/i)).toBeInTheDocument()
    })
  })

  it('displays subject kind badges', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { bindings: mockAccessEntries } })

    render(
      <NamespaceAccessPanel
        namespace={mockNamespace}
        isAdmin={true}
        onGrantAccess={mockOnGrantAccess}
      />
    )

    await waitFor(() => {
      expect(screen.getByText('User')).toBeInTheDocument()
    })

    expect(screen.getByText('ServiceAccount')).toBeInTheDocument()
  })

  it('calls onGrantAccess when "Grant Access" button is clicked', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { bindings: [] } })

    render(
      <NamespaceAccessPanel
        namespace={mockNamespace}
        isAdmin={true}
        onGrantAccess={mockOnGrantAccess}
      />
    )

    const grantButton = await screen.findByRole('button', { name: /Grant Access/i })
    await userEvent.click(grantButton)

    expect(mockOnGrantAccess).toHaveBeenCalledTimes(1)
  })

  it('handles revoke access click with confirmation', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { bindings: mockAccessEntries } })
    vi.mocked(authFetch).mockResolvedValue({ ok: true } as Response)

    render(
      <NamespaceAccessPanel
        namespace={mockNamespace}
        isAdmin={true}
        onGrantAccess={mockOnGrantAccess}
      />
    )

    await waitFor(() => {
      expect(screen.getByText('alice')).toBeInTheDocument()
    })

    const revokeButtons = screen.getAllByTitle(/Revoke access/i)
    await userEvent.click(revokeButtons[0])

    expect(window.confirm).toHaveBeenCalledWith('Revoke access for alice?')
    expect(authFetch).toHaveBeenCalledWith(
      expect.stringContaining('/rolebindings'),
      expect.objectContaining({ method: 'DELETE' })
    )
  })

  it('does not revoke if user cancels confirmation', async () => {
    vi.mocked(window, { partial: true }).confirm = vi.fn(() => false)
    vi.mocked(api.get).mockResolvedValue({ data: { bindings: mockAccessEntries } })

    render(
      <NamespaceAccessPanel
        namespace={mockNamespace}
        isAdmin={true}
        onGrantAccess={mockOnGrantAccess}
      />
    )

    await waitFor(() => {
      expect(screen.getByText('alice')).toBeInTheDocument()
    })

    const revokeButtons = screen.getAllByTitle(/Revoke access/i)
    await userEvent.click(revokeButtons[0])

    expect(authFetch).not.toHaveBeenCalled()
  })

  it('handles fetch access error gracefully', async () => {
    vi.mocked(api.get).mockRejectedValue(new Error('403 Forbidden'))

    render(
      <NamespaceAccessPanel
        namespace={mockNamespace}
        isAdmin={true}
        onGrantAccess={mockOnGrantAccess}
      />
    )

    await waitFor(() => {
      expect(screen.getByText(/No role bindings found/i)).toBeInTheDocument()
    })
  })

  it('refetches access entries after namespace changes', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { bindings: mockAccessEntries } })

    const { rerender } = render(
      <NamespaceAccessPanel
        namespace={mockNamespace}
        isAdmin={true}
        onGrantAccess={mockOnGrantAccess}
      />
    )

    await waitFor(() => {
      expect(screen.getByText('alice')).toBeInTheDocument()
    })

    const newNamespace: NamespaceDetails = {
      ...mockNamespace,
      name: 'another-namespace',
    }

    rerender(
      <NamespaceAccessPanel
        namespace={newNamespace}
        isAdmin={true}
        onGrantAccess={mockOnGrantAccess}
      />
    )

    await waitFor(() => {
      expect(api.get).toHaveBeenCalledTimes(2)
    })
  })
})
