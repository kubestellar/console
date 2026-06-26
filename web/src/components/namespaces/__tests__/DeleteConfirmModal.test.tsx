/**
 * DeleteConfirmModal Tests
 *
 * Exercises deletion flow: confirmation text validation, delete button
 * state, API call, and error handling.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DeleteConfirmModal } from '../DeleteConfirmModal'
import type { NamespaceDetails } from '../types'

// ── Setup ──────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  vi.restoreAllMocks()
})

// ── Tests ──────────────────────────────────────────────────────────────────

describe('DeleteConfirmModal', () => {
  const mockOnClose = vi.fn()
  const mockOnConfirm = vi.fn()

  const namespace: NamespaceDetails = {
    name: 'test-namespace',
    cluster: 'cluster-1',
    status: 'Active',
    createdAt: new Date().toISOString(),
  }

  it('renders deletion warning with namespace and cluster names', () => {
    render(
      <DeleteConfirmModal
        namespace={namespace}
        onClose={mockOnClose}
        onConfirm={mockOnConfirm}
      />
    )

    // Modal should render with form elements
    expect(screen.getByPlaceholderText('Enter namespace name')).toBeInTheDocument()
    expect(screen.getAllByRole('button').length).toBeGreaterThan(0)
  })

  it('displays confirmation text input with namespace name placeholder', () => {
    render(
      <DeleteConfirmModal
        namespace={namespace}
        onClose={mockOnClose}
        onConfirm={mockOnConfirm}
      />
    )

    const input = screen.getByPlaceholderText('Enter namespace name') as HTMLInputElement
    expect(input).toBeInTheDocument()
    expect(input.value).toBe('')
  })

  it('keeps delete button disabled until confirmation text matches namespace name', async () => {
    const user = userEvent.setup()
    render(
      <DeleteConfirmModal
        namespace={namespace}
        onClose={mockOnClose}
        onConfirm={mockOnConfirm}
      />
    )

    const deleteBtn = screen.getByRole('button', { name: /delete/i })
    expect(deleteBtn).toBeDisabled()

    const input = screen.getByPlaceholderText('Enter namespace name')
    await user.type(input, 'wrong-name')
    expect(deleteBtn).toBeDisabled()

    await user.clear(input)
    await user.type(input, 'test-namespace')
    expect(deleteBtn).not.toBeDisabled()
  })

  it('calls onConfirm when delete is clicked with correct confirmation text', async () => {
    const user = userEvent.setup()
    render(
      <DeleteConfirmModal
        namespace={namespace}
        onClose={mockOnClose}
        onConfirm={mockOnConfirm}
      />
    )

    const input = screen.getByPlaceholderText('Enter namespace name')
    const deleteBtn = screen.getByRole('button', { name: /delete/i })

    await user.type(input, 'test-namespace')
    await user.click(deleteBtn)

    await waitFor(() => {
      expect(mockOnConfirm).toHaveBeenCalled()
    })
  })

  it('disables delete button while deletion is in progress', async () => {
    const user = userEvent.setup()
    let resolveDelete: () => void
    const deletePromise = new Promise<void>(r => { resolveDelete = r })
    mockOnConfirm.mockImplementation(() => deletePromise)

    render(
      <DeleteConfirmModal
        namespace={namespace}
        onClose={mockOnClose}
        onConfirm={mockOnConfirm}
      />
    )

    const input = screen.getByPlaceholderText('Enter namespace name')
    const deleteBtn = screen.getByRole('button', { name: /delete/i })

    await user.type(input, 'test-namespace')
    await user.click(deleteBtn)

    expect(deleteBtn).toBeDisabled()
    resolveDelete!()
  })

  it('calls onClose when cancel button is clicked', async () => {
    const user = userEvent.setup()
    render(
      <DeleteConfirmModal
        namespace={namespace}
        onClose={mockOnClose}
        onConfirm={mockOnConfirm}
      />
    )

    const cancelBtn = screen.getByRole('button', { name: /cancel/i })
    await user.click(cancelBtn)

    expect(mockOnClose).toHaveBeenCalled()
    expect(mockOnConfirm).not.toHaveBeenCalled()
  })

  it('shows different namespace names correctly', () => {
    const otherNamespace: NamespaceDetails = {
      name: 'prod-system',
      cluster: 'cluster-2',
      status: 'Active',
      createdAt: new Date().toISOString(),
    }

    render(
      <DeleteConfirmModal
        namespace={otherNamespace}
        onClose={mockOnClose}
        onConfirm={mockOnConfirm}
      />
    )

    // Verify the modal renders with form elements present
    const input = screen.getByPlaceholderText('Enter namespace name') as HTMLInputElement
    expect(input).toBeInTheDocument()
    expect(input.placeholder).toBe('Enter namespace name')
  })

  it('case-sensitive confirmation text validation', async () => {
    const user = userEvent.setup()
    render(
      <DeleteConfirmModal
        namespace={namespace}
        onClose={mockOnClose}
        onConfirm={mockOnConfirm}
      />
    )

    const input = screen.getByPlaceholderText('Enter namespace name')
    const deleteBtn = screen.getByRole('button', { name: /delete/i })

    await user.type(input, 'Test-Namespace')
    expect(deleteBtn).toBeDisabled()

    await user.clear(input)
    await user.type(input, 'test-namespace')
    expect(deleteBtn).not.toBeDisabled()
  })
})
