import React from 'react'
/**
 * NamespaceAccessPanel Tests
 *
 * Exercises access entry rendering, admin/non-admin states,
 * grant access button, revoke confirmation, and error handling.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NamespaceAccessPanel } from '../NamespaceAccessPanel'
import type { NamespaceDetails } from '../types'

// ── Mocks ──────────────────────────────────────────────────────────────────

const mockShowToast = vi.fn()
const mockApiGet = vi.fn()
const mockAuthFetch = vi.fn()

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => fallback || key,
  }),
}))

vi.mock('../../ui/Toast', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}))

vi.mock('../../../lib/api', () => ({
  api: { get: (...args: unknown[]) => mockApiGet(...args) },
  authFetch: (...args: unknown[]) => mockAuthFetch(...args),
}))

vi.mock('../../../lib/constants', () => ({
  LOCAL_AGENT_HTTP_URL: 'http://localhost:9090',
}))

vi.mock('../../ui/ClusterBadge', () => ({
  ClusterBadge: ({ cluster }: { cluster: string }) => <span data-testid="cluster-badge">{cluster}</span>,
}))

vi.mock('lucide-react', () => ({
  Shield: () => <svg data-testid="shield-icon" />,
  Trash2: () => <svg data-testid="trash-icon" />,
  UserPlus: () => <svg data-testid="user-plus-icon" />,
}))

// ── Fixtures ───────────────────────────────────────────────────────────────

const testNamespace: NamespaceDetails = {
  name: 'my-namespace',
  cluster: 'cluster-1',
  status: 'Active',
  createdAt: '2024-01-01T00:00:00Z',
}

const mockBindings = [
  {
    bindingName: 'binding-1',
    subjectKind: 'User',
    subjectName: 'alice',
    roleName: 'admin',
    roleKind: 'ClusterRole',
  },
  {
    bindingName: 'binding-2',
    subjectKind: 'ServiceAccount',
    subjectName: 'deploy-bot',
    roleName: 'edit',
    roleKind: 'Role',
  },
]

// ── Tests ──────────────────────────────────────────────────────────────────

describe('NamespaceAccessPanel', () => {
  const mockOnGrantAccess = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    mockApiGet.mockResolvedValue({ data: { bindings: [] } })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns null when namespace is null', () => {
    const { container } = render(
      <NamespaceAccessPanel
        namespace={null}
        isAdmin={true}
        onGrantAccess={mockOnGrantAccess}
      />
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders namespace name and cluster badge', async () => {
    render(
      <NamespaceAccessPanel
        namespace={testNamespace}
        isAdmin={true}
        onGrantAccess={mockOnGrantAccess}
      />
    )

    expect(screen.getByText('my-namespace')).toBeInTheDocument()
    expect(screen.getByTestId('cluster-badge')).toHaveTextContent('cluster-1')
  })

  it('shows admin-required message when not admin', () => {
    render(
      <NamespaceAccessPanel
        namespace={testNamespace}
        isAdmin={false}
        onGrantAccess={mockOnGrantAccess}
      />
    )

    expect(screen.getByText('Admin access required to view role bindings')).toBeInTheDocument()
  })

  it('does not show Grant Access button for non-admin', () => {
    render(
      <NamespaceAccessPanel
        namespace={testNamespace}
        isAdmin={false}
        onGrantAccess={mockOnGrantAccess}
      />
    )

    expect(screen.queryByText('Grant Access')).not.toBeInTheDocument()
  })

  it('shows Grant Access button for admin', () => {
    render(
      <NamespaceAccessPanel
        namespace={testNamespace}
        isAdmin={true}
        onGrantAccess={mockOnGrantAccess}
      />
    )

    expect(screen.getByText('Grant Access')).toBeInTheDocument()
  })

  it('calls onGrantAccess when Grant Access button is clicked', async () => {
    const user = userEvent.setup()
    render(
      <NamespaceAccessPanel
        namespace={testNamespace}
        isAdmin={true}
        onGrantAccess={mockOnGrantAccess}
      />
    )

    await user.click(screen.getByText('Grant Access'))
    expect(mockOnGrantAccess).toHaveBeenCalled()
  })

  it('shows "No role bindings found" when entries are empty', async () => {
    mockApiGet.mockResolvedValue({ data: { bindings: [] } })

    render(
      <NamespaceAccessPanel
        namespace={testNamespace}
        isAdmin={true}
        onGrantAccess={mockOnGrantAccess}
      />
    )

    await waitFor(() => {
      expect(screen.getByText('No role bindings found')).toBeInTheDocument()
    })
  })

  it('renders access entries with subject name, kind, and role', async () => {
    mockApiGet.mockResolvedValue({ data: { bindings: mockBindings } })

    render(
      <NamespaceAccessPanel
        namespace={testNamespace}
        isAdmin={true}
        onGrantAccess={mockOnGrantAccess}
      />
    )

    await waitFor(() => {
      expect(screen.getByText('alice')).toBeInTheDocument()
      expect(screen.getByText('User')).toBeInTheDocument()
      expect(screen.getByText('Role: admin')).toBeInTheDocument()
      expect(screen.getByText('deploy-bot')).toBeInTheDocument()
      expect(screen.getByText('ServiceAccount')).toBeInTheDocument()
      expect(screen.getByText('Role: edit')).toBeInTheDocument()
    })
  })

  it('calls api.get with correct URL on mount when admin', async () => {
    render(
      <NamespaceAccessPanel
        namespace={testNamespace}
        isAdmin={true}
        onGrantAccess={mockOnGrantAccess}
      />
    )

    await waitFor(() => {
      expect(mockApiGet).toHaveBeenCalledWith(
        '/api/namespaces/my-namespace/access?cluster=cluster-1'
      )
    })
  })

  it('does not fetch access when not admin', () => {
    render(
      <NamespaceAccessPanel
        namespace={testNamespace}
        isAdmin={false}
        onGrantAccess={mockOnGrantAccess}
      />
    )

    expect(mockApiGet).not.toHaveBeenCalled()
  })

  it('shows toast on fetch error', async () => {
    mockApiGet.mockRejectedValue(new Error('Network error'))

    render(
      <NamespaceAccessPanel
        namespace={testNamespace}
        isAdmin={true}
        onGrantAccess={mockOnGrantAccess}
      />
    )

    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith(
        'Failed to fetch namespace access',
        'error'
      )
    })
  })

  it('shows admin-specific message on 403 error', async () => {
    mockApiGet.mockRejectedValue(new Error('Request failed with status 403'))

    render(
      <NamespaceAccessPanel
        namespace={testNamespace}
        isAdmin={true}
        onGrantAccess={mockOnGrantAccess}
      />
    )

    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith(
        'Admin access required to view namespace details',
        'error'
      )
    })
  })

  it('revoke button prompts confirm dialog', async () => {
    mockApiGet.mockResolvedValue({ data: { bindings: mockBindings } })
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const user = userEvent.setup()

    render(
      <NamespaceAccessPanel
        namespace={testNamespace}
        isAdmin={true}
        onGrantAccess={mockOnGrantAccess}
      />
    )

    await waitFor(() => {
      expect(screen.getByText('alice')).toBeInTheDocument()
    })

    const revokeButtons = screen.getAllByTitle('Revoke access')
    await user.click(revokeButtons[0])

    expect(confirmSpy).toHaveBeenCalledWith('Revoke access for alice?')
    confirmSpy.mockRestore()
  })

  it('calls authFetch DELETE when revoke is confirmed', async () => {
    mockApiGet.mockResolvedValue({ data: { bindings: mockBindings } })
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    mockAuthFetch.mockResolvedValue({ ok: true })
    const user = userEvent.setup()

    render(
      <NamespaceAccessPanel
        namespace={testNamespace}
        isAdmin={true}
        onGrantAccess={mockOnGrantAccess}
      />
    )

    await waitFor(() => {
      expect(screen.getByText('alice')).toBeInTheDocument()
    })

    const revokeButtons = screen.getAllByTitle('Revoke access')
    await user.click(revokeButtons[0])

    await waitFor(() => {
      expect(mockAuthFetch).toHaveBeenCalledWith(
        expect.stringContaining('http://localhost:9090/rolebindings?'),
        expect.objectContaining({ method: 'DELETE' })
      )
    })

    vi.spyOn(window, 'confirm').mockRestore()
  })
})
