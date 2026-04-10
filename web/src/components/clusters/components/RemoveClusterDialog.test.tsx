import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { RemoveClusterDialog } from './RemoveClusterDialog'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

// Mock BaseModal to render children directly (avoid portal complexity).
vi.mock('../../../lib/modals', () => {
  const Header = ({ title, onClose }: { title: string; onClose: () => void }) => (
    <div>
      <h2>{title}</h2>
      <button onClick={onClose} aria-label="close-header">X</button>
    </div>
  )
  const Content = ({ children }: { children: React.ReactNode }) => <div>{children}</div>
  const Footer = ({ children }: { children: React.ReactNode }) => <div>{children}</div>

  const BaseModal = ({ isOpen, children }: { isOpen: boolean; children: React.ReactNode }) => {
    if (!isOpen) return null
    return <div data-testid="modal">{children}</div>
  }
  BaseModal.Header = Header
  BaseModal.Content = Content
  BaseModal.Footer = Footer

  return { BaseModal }
})

describe('RemoveClusterDialog', () => {
  const defaultProps = {
    isOpen: true,
    contextName: 'kind-kubeflex',
    displayName: 'kind-kubeflex',
    onClose: vi.fn(),
    onConfirm: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the context name being removed', () => {
    render(<RemoveClusterDialog {...defaultProps} />)
    expect(screen.getByText('kind-kubeflex')).toBeInTheDocument()
    expect(screen.getByText('cluster.removeClusterTitle')).toBeInTheDocument()
  })

  it('surfaces the underlying error message from onConfirm (regression: #6133)', async () => {
    // The actual backend error — e.g. "HTTP 401: Unauthorized" when the
    // Authorization header is missing — must be shown to the user instead
    // of being swallowed by a generic "Failed to remove cluster" fallback.
    const underlyingError = 'HTTP 401: Unauthorized'
    const onConfirm = vi.fn().mockRejectedValue(new Error(underlyingError))
    render(<RemoveClusterDialog {...defaultProps} onConfirm={onConfirm} />)

    fireEvent.click(screen.getByLabelText('cluster.removeClusterConfirm'))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(underlyingError)
    })
    // Dialog stays open so the user can read the error.
    expect(defaultProps.onClose).not.toHaveBeenCalled()
  })

  it('surfaces backend "context not found" errors verbatim', async () => {
    const backendError = 'context "kind-kubeflex" not found'
    const onConfirm = vi.fn().mockRejectedValue(new Error(backendError))
    render(<RemoveClusterDialog {...defaultProps} onConfirm={onConfirm} />)

    fireEvent.click(screen.getByLabelText('cluster.removeClusterConfirm'))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(backendError)
    })
  })

  it('closes the dialog on successful removal', async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined)
    const onClose = vi.fn()
    render(<RemoveClusterDialog {...defaultProps} onConfirm={onConfirm} onClose={onClose} />)

    fireEvent.click(screen.getByLabelText('cluster.removeClusterConfirm'))

    await waitFor(() => {
      expect(onClose).toHaveBeenCalled()
    })
    expect(onConfirm).toHaveBeenCalledWith('kind-kubeflex')
  })
})
