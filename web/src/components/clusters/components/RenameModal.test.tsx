import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { RenameModal } from './RenameModal'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

// Mock BaseModal to render children directly (avoid portal complexity)
vi.mock('../../../lib/modals', () => {
  const Header = ({ title, onClose }: { title: string; onClose: () => void }) => (
    <div>
      <h2>{title}</h2>
      <button onClick={onClose} aria-label="close-header">X</button>
    </div>
  )
  const Content = ({ children }: { children: React.ReactNode }) => <div>{children}</div>
  const Footer = ({ children }: { children: React.ReactNode }) => <div>{children}</div>

  const BaseModal = ({ isOpen, onClose, children }: { isOpen: boolean; onClose: () => void; children: React.ReactNode }) => {
    if (!isOpen) return null
    return <div data-testid="modal" onKeyDown={(e) => { if (e.key === 'Escape') onClose() }}>{children}</div>
  }
  BaseModal.Header = Header
  BaseModal.Content = Content
  BaseModal.Footer = Footer

  return { BaseModal }
})

describe('RenameModal', () => {
  const defaultProps = {
    isOpen: true,
    clusterName: 'cluster-1',
    currentDisplayName: 'my-cluster',
    onClose: vi.fn(),
    onRename: vi.fn().mockResolvedValue(undefined),
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the modal with current display name pre-filled', () => {
    render(<RenameModal {...defaultProps} />)

    expect(screen.getByText('cluster.renameContext.title')).toBeTruthy()
    expect(screen.getByDisplayValue('my-cluster')).toBeTruthy()
    expect(screen.getByText(/my-cluster/)).toBeTruthy()
  })

  it('shows error when name is empty', async () => {
    render(<RenameModal {...defaultProps} />)

    const input = screen.getByDisplayValue('my-cluster')
    fireEvent.change(input, { target: { value: '' } })

    // The Rename button should be disabled when name is empty
    const renameBtn = screen.getByText('cluster.renameContext.rename')
    expect(renameBtn.closest('button')?.disabled).toBe(true)
  })

  it('shows error when name contains spaces', async () => {
    render(<RenameModal {...defaultProps} />)

    const input = screen.getByDisplayValue('my-cluster')
    fireEvent.change(input, { target: { value: 'has space' } })

    fireEvent.click(screen.getByText('cluster.renameContext.rename'))

    await waitFor(() => {
      expect(screen.getByText('cluster.renameContext.errorSpaces')).toBeTruthy()
    })
  })

  it('shows error when name is unchanged', async () => {
    render(<RenameModal {...defaultProps} />)

    // Name is already 'my-cluster', click rename without changing
    fireEvent.click(screen.getByText('cluster.renameContext.rename'))

    await waitFor(() => {
      expect(screen.getByText('cluster.renameContext.errorUnchanged')).toBeTruthy()
    })
  })

  it('calls onRename and onClose on successful rename', async () => {
    render(<RenameModal {...defaultProps} />)

    const input = screen.getByDisplayValue('my-cluster')
    fireEvent.change(input, { target: { value: 'new-name' } })
    fireEvent.click(screen.getByText('cluster.renameContext.rename'))

    await waitFor(() => {
      expect(defaultProps.onRename).toHaveBeenCalledWith('cluster-1', 'new-name')
      expect(defaultProps.onClose).toHaveBeenCalled()
    })
  })

  // Regression for #8927: after a successful rename the button must NOT flip
  // back to "Rename" while the modal is closing.
  it('shows "Renamed" (not "Rename") after successful rename so close animation does not flash', async () => {
    render(<RenameModal {...defaultProps} />)

    const input = screen.getByDisplayValue('my-cluster')
    fireEvent.change(input, { target: { value: 'new-name' } })
    fireEvent.click(screen.getByText('cluster.renameContext.rename'))

    // Wait for both onClose and the 'success' phase DOM update together.
    // Asserting both inside waitFor avoids a race where onClose fires before
    // the setPhase('success') re-render has been flushed to the DOM (#9107).
    await waitFor(() => {
      expect(defaultProps.onClose).toHaveBeenCalled()
      // Label must be "Renamed", not "Rename", so the button does not flash.
      expect(screen.queryByText('cluster.renameContext.rename')).toBeNull()
      expect(screen.getByText('cluster.renameContext.renamed')).toBeTruthy()
      // Button must remain disabled while the modal is closing.
      expect(screen.getByText('cluster.renameContext.renamed').closest('button')?.disabled).toBe(true)
    })
  })

  it('shows error message when onRename rejects', async () => {
    const failingRename = vi.fn().mockRejectedValue(new Error('Server error'))
    render(<RenameModal {...defaultProps} onRename={failingRename} />)

    const input = screen.getByDisplayValue('my-cluster')
    fireEvent.change(input, { target: { value: 'new-name' } })
    fireEvent.click(screen.getByText('cluster.renameContext.rename'))

    await waitFor(() => {
      expect(screen.getByText('Server error')).toBeTruthy()
    })
  })

  it('does not render when isOpen is false', () => {
    render(<RenameModal {...defaultProps} isOpen={false} />)
    expect(screen.queryByText('cluster.renameContext.title')).toBeNull()
  })

  it('calls onClose when Escape key is pressed', () => {
    render(<RenameModal {...defaultProps} />)
    const modal = screen.getByTestId('modal')
    fireEvent.keyDown(modal, { key: 'Escape' })
    expect(defaultProps.onClose).toHaveBeenCalled()
  })
})
