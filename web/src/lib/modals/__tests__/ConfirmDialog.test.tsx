import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ConfirmDialog } from '../ConfirmDialog'

/**
 * Tests for ConfirmDialog - a styled confirmation dialog component.
 *
 * ConfirmDialog wraps BaseModal which uses createPortal.
 * We test the component's rendering logic, variant styling, and callbacks.
 */

// BaseModal uses createPortal, so we mock it to render children inline
vi.mock('../BaseModal', () => ({
  BaseModal: ({ isOpen, children }: { isOpen: boolean; children: React.ReactNode }) => {
    if (!isOpen) return null
    return <div data-testid="base-modal">{children}</div>
  },
}))

// Mock Button component — must handle `loading` prop to render spinner (#5757)
vi.mock('../../../components/ui/Button', () => ({
  Button: ({ children, onClick, disabled, loading, ...props }: Record<string, unknown>) => (
    <button onClick={onClick as () => void} disabled={disabled as boolean} {...props}>
      {loading ? <span className="animate-spin" data-testid="loading-spinner" /> : null}
      {children as React.ReactNode}
    </button>
  ),
}))

describe('ConfirmDialog', () => {
  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    onConfirm: vi.fn(),
    title: 'Delete Resource',
    message: 'This will permanently delete the resource.',
  }

  it('renders title and message when open', () => {
    render(<ConfirmDialog {...defaultProps} />)
    expect(screen.getByText('Delete Resource')).toBeInTheDocument()
    expect(screen.getByText('This will permanently delete the resource.')).toBeInTheDocument()
  })

  it('does not render when isOpen is false', () => {
    render(<ConfirmDialog {...defaultProps} isOpen={false} />)
    expect(screen.queryByText('Delete Resource')).not.toBeInTheDocument()
  })

  it('uses default confirmLabel and cancelLabel', () => {
    render(<ConfirmDialog {...defaultProps} />)
    expect(screen.getByText('Confirm')).toBeInTheDocument()
    expect(screen.getByText('Cancel')).toBeInTheDocument()
  })

  it('uses custom confirmLabel and cancelLabel', () => {
    render(
      <ConfirmDialog
        {...defaultProps}
        confirmLabel="Yes, Delete"
        cancelLabel="No, Keep"
      />
    )
    expect(screen.getByText('Yes, Delete')).toBeInTheDocument()
    expect(screen.getByText('No, Keep')).toBeInTheDocument()
  })

  it('calls onClose when cancel button is clicked', () => {
    const onClose = vi.fn()
    render(<ConfirmDialog {...defaultProps} onClose={onClose} />)
    fireEvent.click(screen.getByText('Cancel'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('calls onConfirm when confirm button is clicked', () => {
    const onConfirm = vi.fn()
    render(<ConfirmDialog {...defaultProps} onConfirm={onConfirm} />)
    fireEvent.click(screen.getByText('Confirm'))
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it('renders with danger variant by default', () => {
    render(<ConfirmDialog {...defaultProps} />)
    const confirmBtn = screen.getByText('Confirm').closest('button')
    expect(confirmBtn?.className).toContain('red')
  })

  it('renders with warning variant', () => {
    render(
      <ConfirmDialog {...defaultProps} variant="warning" />
    )
    const confirmBtn = screen.getByText('Confirm').closest('button')
    expect(confirmBtn?.className).toContain('yellow')
  })

  it('renders with info variant', () => {
    render(
      <ConfirmDialog {...defaultProps} variant="info" />
    )
    const confirmBtn = screen.getByText('Confirm').closest('button')
    expect(confirmBtn?.className).toContain('blue')
  })

  it('disables buttons when isLoading is true', () => {
    render(<ConfirmDialog {...defaultProps} isLoading={true} />)
    const confirmBtn = screen.getByText('Confirm').closest('button')
    expect(confirmBtn).toBeDisabled()
  })

  it('shows loading spinner when isLoading', () => {
    const { container } = render(
      <ConfirmDialog {...defaultProps} isLoading={true} />
    )
    // Loader2 icon has animate-spin class
    const spinner = container.querySelector('.animate-spin')
    expect(spinner).toBeInTheDocument()
  })

  it('does not show loading spinner when not loading', () => {
    const { container } = render(
      <ConfirmDialog {...defaultProps} isLoading={false} />
    )
    const spinner = container.querySelector('.animate-spin')
    expect(spinner).not.toBeInTheDocument()
  })
})
