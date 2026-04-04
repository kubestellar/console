import { describe, it, expect, vi} from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { BaseModal } from '../BaseModal'

/**
 * Tests for BaseModal compound component.
 *
 * BaseModal uses createPortal to render at document.body level.
 * We test the component logic, sub-components, and keyboard navigation.
 */

// Mock useModalNavigation and useModalFocusTrap
vi.mock('../useModalNavigation', () => ({
  useModalNavigation: vi.fn(),
  useModalFocusTrap: vi.fn(),
}))

describe('BaseModal', () => {
  it('renders children when isOpen is true', () => {
    render(
      <BaseModal isOpen={true} onClose={vi.fn()}>
        <p>Modal content</p>
      </BaseModal>
    )
    expect(screen.getByText('Modal content')).toBeInTheDocument()
  })

  it('does not render when isOpen is false', () => {
    render(
      <BaseModal isOpen={false} onClose={vi.fn()}>
        <p>Modal content</p>
      </BaseModal>
    )
    expect(screen.queryByText('Modal content')).not.toBeInTheDocument()
  })

  it('renders with role="dialog" and aria-modal', () => {
    render(
      <BaseModal isOpen={true} onClose={vi.fn()}>
        <p>Content</p>
      </BaseModal>
    )
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveAttribute('aria-modal', 'true')
  })

  it('calls onClose when backdrop is clicked', () => {
    const onClose = vi.fn()
    render(
      <BaseModal isOpen={true} onClose={onClose}>
        <p>Content</p>
      </BaseModal>
    )
    // Click on the backdrop (the outermost fixed element)
    const backdrop = document.querySelector('.fixed.inset-0')
    if (backdrop) {
      fireEvent.click(backdrop)
      expect(onClose).toHaveBeenCalledTimes(1)
    }
  })

  it('does not call onClose when closeOnBackdrop is false', () => {
    const onClose = vi.fn()
    render(
      <BaseModal isOpen={true} onClose={onClose} closeOnBackdrop={false}>
        <p>Content</p>
      </BaseModal>
    )
    const backdrop = document.querySelector('.fixed.inset-0')
    if (backdrop) {
      fireEvent.click(backdrop)
      expect(onClose).not.toHaveBeenCalled()
    }
  })

  it('does not close when clicking inside the modal', () => {
    const onClose = vi.fn()
    render(
      <BaseModal isOpen={true} onClose={onClose}>
        <p>Inner content</p>
      </BaseModal>
    )
    fireEvent.click(screen.getByText('Inner content'))
    expect(onClose).not.toHaveBeenCalled()
  })

  it('applies correct size class for sm', () => {
    render(
      <BaseModal isOpen={true} onClose={vi.fn()} size="sm">
        <p>Small modal</p>
      </BaseModal>
    )
    const dialog = screen.getByRole('dialog')
    expect(dialog.className).toContain('max-w-md')
  })

  it('applies correct size class for xl', () => {
    render(
      <BaseModal isOpen={true} onClose={vi.fn()} size="xl">
        <p>XL modal</p>
      </BaseModal>
    )
    const dialog = screen.getByRole('dialog')
    expect(dialog.className).toContain('max-w-6xl')
  })

  it('applies custom className', () => {
    render(
      <BaseModal isOpen={true} onClose={vi.fn()} className="custom-modal">
        <p>Content</p>
      </BaseModal>
    )
    const dialog = screen.getByRole('dialog')
    expect(dialog.className).toContain('custom-modal')
  })
})

describe('BaseModal.Header', () => {
  it('renders title', () => {
    render(
      <BaseModal isOpen={true} onClose={vi.fn()}>
        <BaseModal.Header title="Pod Details" onClose={vi.fn()} />
      </BaseModal>
    )
    expect(screen.getByText('Pod Details')).toBeInTheDocument()
  })

  it('renders description when provided', () => {
    render(
      <BaseModal isOpen={true} onClose={vi.fn()}>
        <BaseModal.Header title="Title" description="Some description" onClose={vi.fn()} />
      </BaseModal>
    )
    expect(screen.getByText('Some description')).toBeInTheDocument()
  })

  it('renders close button that calls onClose', () => {
    const onClose = vi.fn()
    render(
      <BaseModal isOpen={true} onClose={vi.fn()}>
        <BaseModal.Header title="Title" onClose={onClose} />
      </BaseModal>
    )
    const closeBtn = screen.getByLabelText('Close modal')
    fireEvent.click(closeBtn)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('renders back button when onBack and showBack are provided', () => {
    const onBack = vi.fn()
    render(
      <BaseModal isOpen={true} onClose={vi.fn()}>
        <BaseModal.Header title="Title" onBack={onBack} showBack={true} onClose={vi.fn()} />
      </BaseModal>
    )
    const backBtn = screen.getByLabelText('Go back')
    fireEvent.click(backBtn)
    expect(onBack).toHaveBeenCalledTimes(1)
  })

  it('does not render back button when showBack is false', () => {
    render(
      <BaseModal isOpen={true} onClose={vi.fn()}>
        <BaseModal.Header title="Title" showBack={false} onClose={vi.fn()} />
      </BaseModal>
    )
    expect(screen.queryByLabelText('Go back')).not.toBeInTheDocument()
  })
})

describe('BaseModal.Content', () => {
  it('renders children with padding by default', () => {
    render(
      <BaseModal isOpen={true} onClose={vi.fn()}>
        <BaseModal.Content>
          <p>Content here</p>
        </BaseModal.Content>
      </BaseModal>
    )
    expect(screen.getByText('Content here')).toBeInTheDocument()
  })

  it('removes padding when noPadding is true', () => {
      <BaseModal isOpen={true} onClose={vi.fn()}>
        <BaseModal.Content noPadding={true}>
          <p>No padding</p>
        </BaseModal.Content>
      </BaseModal>
    )
    const content = screen.getByText('No padding').parentElement
    expect(content?.className).not.toContain('p-6')
  })
})

describe('BaseModal.Footer', () => {
  it('renders keyboard hints by default', () => {
    render(
      <BaseModal isOpen={true} onClose={vi.fn()}>
        <BaseModal.Footer />
      </BaseModal>
    )
    expect(screen.getByText('Esc')).toBeInTheDocument()
    // Both Esc and Space hints show "close" as label, so use getAllByText
    const closeLabels = screen.getAllByText('close')
    expect(closeLabels.length).toBeGreaterThanOrEqual(1)
  })

  it('hides keyboard hints when showKeyboardHints is false', () => {
    render(
      <BaseModal isOpen={true} onClose={vi.fn()}>
        <BaseModal.Footer showKeyboardHints={false} />
      </BaseModal>
    )
    expect(screen.queryByText('Esc')).not.toBeInTheDocument()
  })
})

describe('BaseModal.Tabs', () => {
  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'details', label: 'Details' },
  ]

  it('renders tab labels', () => {
    render(
      <BaseModal isOpen={true} onClose={vi.fn()}>
        <BaseModal.Tabs tabs={tabs} activeTab="overview" onTabChange={vi.fn()} />
      </BaseModal>
    )
    expect(screen.getByText('Overview')).toBeInTheDocument()
    expect(screen.getByText('Details')).toBeInTheDocument()
  })

  it('calls onTabChange when a tab is clicked', () => {
    const onTabChange = vi.fn()
    render(
      <BaseModal isOpen={true} onClose={vi.fn()}>
        <BaseModal.Tabs tabs={tabs} activeTab="overview" onTabChange={onTabChange} />
      </BaseModal>
    )
    fireEvent.click(screen.getByText('Details'))
    expect(onTabChange).toHaveBeenCalledWith('details')
  })

  it('marks active tab with aria-selected', () => {
    render(
      <BaseModal isOpen={true} onClose={vi.fn()}>
        <BaseModal.Tabs tabs={tabs} activeTab="overview" onTabChange={vi.fn()} />
      </BaseModal>
    )
    const overviewTab = screen.getByText('Overview').closest('button')
    const detailsTab = screen.getByText('Details').closest('button')
    expect(overviewTab).toHaveAttribute('aria-selected', 'true')
    expect(detailsTab).toHaveAttribute('aria-selected', 'false')
  })
})
