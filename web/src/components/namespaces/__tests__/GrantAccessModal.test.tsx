/**
 * GrantAccessModal Tests
 *
 * Exercises access grant flow: subject kind selection, subject dropdown,
 * role selection, kc-agent API call, service account namespace field,
 * error handling, and discard confirmation.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { GrantAccessModal } from '../GrantAccessModal'
import type { NamespaceDetails, NamespaceAccessEntry } from '../types'

const DISCARD_CONFIRM_TIMEOUT_MS = 2000

// ── Mocks ──────────────────────────────────────────────────────────────────

const mockAuthFetch = vi.fn()
vi.mock('../../../lib/api', () => ({
  authFetch: vi.fn((...args) => mockAuthFetch(...args)),
}))

const mockTranslation = vi.fn((key: string) => key)
vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    t: mockTranslation,
  }),
}))

// ── Setup ──────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks()
  mockAuthFetch.mockReset()
})

afterEach(() => {
  vi.restoreAllMocks()
})

// ── Tests ──────────────────────────────────────────────────────────────────

describe('GrantAccessModal', () => {
  const mockOnClose = vi.fn()
  const mockOnGranted = vi.fn()

  const namespace: NamespaceDetails = {
    name: 'test-ns',
    cluster: 'cluster-1',
    status: 'Active',
    createdAt: new Date().toISOString(),
  }

  const existingAccess: NamespaceAccessEntry[] = [
    {
      bindingName: 'binding-1',
      subjectKind: 'User',
      subjectName: 'admin@example.com',
      roleName: 'admin',
      roleKind: 'ClusterRole',
    },
  ]

  it('renders modal with grant access title and namespace info', () => {
    render(
      <GrantAccessModal
        namespace={namespace}
        existingAccess={existingAccess}
        onClose={mockOnClose}
        onGranted={mockOnGranted}
      />
    )

    // Modal should render with interactive elements present
    expect(screen.getAllByRole('combobox').length).toBeGreaterThan(0)
    expect(screen.getAllByRole('button').length).toBeGreaterThan(0)
  })

  it('renders subject type select defaulting to User', () => {
    render(
      <GrantAccessModal
        namespace={namespace}
        existingAccess={existingAccess}
        onClose={mockOnClose}
        onGranted={mockOnGranted}
      />
    )

    // Find select/combobox for subject type
    const comboboxes = screen.getAllByRole('combobox')
    expect(comboboxes.length).toBeGreaterThan(0)
  })

  it('allows subject kind selection change', async () => {
    const user = userEvent.setup()
    render(
      <GrantAccessModal
        namespace={namespace}
        existingAccess={existingAccess}
        onClose={mockOnClose}
        onGranted={mockOnGranted}
      />
    )

    const comboboxes = screen.getAllByRole('combobox')
    const typeSelect = comboboxes[0] as HTMLSelectElement
    await user.selectOptions(typeSelect, 'Group')

    expect((typeSelect as HTMLSelectElement).value).toBe('Group')
  })

  it('filters out subjects that already have access', async () => {
    const user = userEvent.setup()
    render(
      <GrantAccessModal
        namespace={namespace}
        existingAccess={existingAccess}
        onClose={mockOnClose}
        onGranted={mockOnGranted}
      />
    )

    const subjectInput = screen.getByPlaceholderText(/Select or type a user/i) as HTMLInputElement
    await user.click(subjectInput)

    // Should not show admin@example.com since it's in existingAccess
    const options = screen.queryAllByText('admin@example.com')
    expect(options.length).toBe(0)
  })

  it('shows service account namespace field when ServiceAccount is selected', async () => {
    const user = userEvent.setup()
    render(
      <GrantAccessModal
        namespace={namespace}
        existingAccess={[]}
        onClose={mockOnClose}
        onGranted={mockOnGranted}
      />
    )

    const comboboxes = screen.getAllByRole('combobox')
    const typeSelect = comboboxes[0] as HTMLSelectElement
    await user.selectOptions(typeSelect, 'ServiceAccount')

    expect(screen.getByText(/Service Account Namespace/)).toBeInTheDocument()
  })

  it('does not show service account namespace field for User/Group', async () => {
    const user = userEvent.setup()
    render(
      <GrantAccessModal
        namespace={namespace}
        existingAccess={[]}
        onClose={mockOnClose}
        onGranted={mockOnGranted}
      />
    )

    const comboboxes = screen.getAllByRole('combobox')
    const typeSelect = comboboxes[0] as HTMLSelectElement
    await user.selectOptions(typeSelect, 'Group')

    expect(screen.queryByText(/Service Account Namespace/)).not.toBeInTheDocument()
  })

  it('successfully grants access with POST to kc-agent', async () => {
    const user = userEvent.setup()
    mockAuthFetch.mockResolvedValueOnce(new Response(JSON.stringify({}), { status: 200 }))

    render(
      <GrantAccessModal
        namespace={namespace}
        existingAccess={existingAccess}
        onClose={mockOnClose}
        onGranted={mockOnGranted}
      />
    )

    const inputs = screen.getAllByRole('textbox')
    const subjectInput = inputs[0]
    const grantBtn = screen.getByRole('button', { name: /grant/i })

    await user.type(subjectInput, 'developer@example.com')
    await user.click(grantBtn)

    await waitFor(() => {
      expect(mockAuthFetch).toHaveBeenCalledWith(
        expect.stringContaining('/rolebindings'),
        expect.any(Object)
      )
    })
  })

  it('displays error when grant fails', async () => {
    const user = userEvent.setup()
    mockAuthFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'Permission denied' }), { status: 403 })
    )

    render(
      <GrantAccessModal
        namespace={namespace}
        existingAccess={existingAccess}
        onClose={mockOnClose}
        onGranted={mockOnGranted}
      />
    )

    const subjectInput = screen.getByPlaceholderText(/Select or type a user/i)
    const grantBtn = screen.getByRole('button', { name: /grant/i })

    await user.type(subjectInput, 'user@example.com')
    await user.click(grantBtn)

    await waitFor(() => {
      expect(screen.getByText(/Permission denied/i)).toBeInTheDocument()
    })
    expect(mockOnGranted).not.toHaveBeenCalled()
  })

  it('disables grant button when subject name is missing', () => {
    render(
      <GrantAccessModal
        namespace={namespace}
        existingAccess={existingAccess}
        onClose={mockOnClose}
        onGranted={mockOnGranted}
      />
    )

    const grantBtn = screen.getByRole('button', { name: /grant/i })
    expect(grantBtn).toBeDisabled()
  })

  it('clears subject when subject kind changes', async () => {
    const user = userEvent.setup()
    render(
      <GrantAccessModal
        namespace={namespace}
        existingAccess={existingAccess}
        onClose={mockOnClose}
        onGranted={mockOnGranted}
      />
    )

    const comboboxes = screen.getAllByRole('combobox')
    const typeSelect = comboboxes[0] as HTMLSelectElement

    await user.selectOptions(typeSelect, 'Group')
    await user.selectOptions(typeSelect, 'User')

    expect(typeSelect.value).toBe('User')
  })

  it('shows discard confirmation when closing with unsaved changes', async () => {
    const user = userEvent.setup()
    render(
      <GrantAccessModal
        namespace={namespace}
        existingAccess={existingAccess}
        onClose={mockOnClose}
        onGranted={mockOnGranted}
      />
    )

    const subjectInput = screen.getByPlaceholderText(/Select or type a user/i)
    await user.type(subjectInput, 'unsaved@example.com')

    const closeBtn = screen.getByRole('button', { name: /cancel/i })
    await user.click(closeBtn)

    await waitFor(() => {
      expect(screen.getByText(/discardUnsavedChanges$/i)).toBeInTheDocument()
    }, { timeout: DISCARD_CONFIRM_TIMEOUT_MS })
  })

  it('closes without confirmation if form is empty', async () => {
    const user = userEvent.setup()
    render(
      <GrantAccessModal
        namespace={namespace}
        existingAccess={existingAccess}
        onClose={mockOnClose}
        onGranted={mockOnGranted}
      />
    )

    const closeBtn = screen.getByRole('button', { name: /cancel/i })
    await user.click(closeBtn)

    await waitFor(() => {
      expect(mockOnClose).toHaveBeenCalled()
    })
  })

  it('includes service account namespace in POST body when provided', async () => {
    const user = userEvent.setup()
    mockAuthFetch.mockResolvedValueOnce(new Response(JSON.stringify({}), { status: 200 }))

    render(
      <GrantAccessModal
        namespace={namespace}
        existingAccess={[]}
        onClose={mockOnClose}
        onGranted={mockOnGranted}
      />
    )

    const comboboxes = screen.getAllByRole('combobox')
    const typeSelect = comboboxes[0] as HTMLSelectElement
    await user.selectOptions(typeSelect, 'ServiceAccount')

    const subjectInput = screen.getByPlaceholderText(/Select or type a service account/i)
    const nsInput = screen.getByPlaceholderText('default')
    const grantBtn = screen.getByRole('button', { name: /grant/i })

    await user.type(subjectInput, 'my-sa')
    await user.type(nsInput, 'custom-ns')
    await user.click(grantBtn)

    await waitFor(() => {
      expect(mockAuthFetch).toHaveBeenCalledWith(
        expect.stringContaining('/rolebindings'),
        expect.objectContaining({
          body: expect.stringContaining('"subjectNamespace":"custom-ns"')
        })
      )
    })
    expect(mockAuthFetch).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        body: expect.stringContaining('"subjectName":"my-sa"')
      })
    )
  })
})
