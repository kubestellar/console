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
    // Click on the backdrop (the outermost fixed element).
    // BaseModal requires mousedown + click on the backdrop to trigger
    // close (mousedown-tracking guard added in #9165).
    const backdrop = document.querySelector('.fixed.inset-0')
    if (backdrop) {
      fireEvent.mouseDown(backdrop)
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
      fireEvent.mouseDown(backdrop)
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
    const inner = screen.getByText('Inner content')
    fireEvent.mouseDown(inner)
    fireEvent.click(inner)
    expect(onClose).not.toHaveBeenCalled()
  })

  // #9165 — Regression: pressing mouse inside the modal then releasing
  // on the backdrop must NOT close the modal. The browser dispatches the
  // synthetic `click` event on the deepest common ancestor (the backdrop),
  // which previously bypassed the modal-content stopPropagation guard
  // and triggered an unintended close when users clicked near the edge
  // of internal sidebar items.
  it('does not call onClose when mousedown starts inside modal but mouseup is on backdrop (#9165)', () => {
    const onClose = vi.fn()
    render(
      <BaseModal isOpen={true} onClose={onClose}>
        <p>Inner content</p>
      </BaseModal>
    )
    const inner = screen.getByText('Inner content')
    const backdrop = document.querySelector('.fixed.inset-0') as HTMLElement
    // Press inside the modal content
    fireEvent.mouseDown(inner)
    // Release on the backdrop, which is what synthesizes the click event
    // on the deepest common ancestor.
    fireEvent.click(backdrop)
    expect(onClose).not.toHaveBeenCalled()
  })

  // #9165 — Regression: when mousedown happens on the backdrop and
  // mouseup happens on the modal content (e.g. user starts dragging
  // outside and releases on a sidebar item), the modal must not close.
  it('does not call onClose when click target is inside modal even if mousedown was on backdrop (#9165)', () => {
    const onClose = vi.fn()
    render(
      <BaseModal isOpen={true} onClose={onClose}>
        <p>Inner content</p>
      </BaseModal>
    )
    const inner = screen.getByText('Inner content')
    const backdrop = document.querySelector('.fixed.inset-0') as HTMLElement
    fireEvent.mouseDown(backdrop)
    // click bubbles up from the inner element; the contains() check
    // must reject it even though mousedown was on the backdrop.
    fireEvent.click(inner)
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
    // Default closeOnEscape=true → aria-label includes the shortcut
    const closeBtn = screen.getByLabelText('Close modal (Esc)')
    fireEvent.click(closeBtn)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('close button title and aria-label advertise Esc when closeOnEscape is default', () => {
    // See BaseModal.tsx ModalEscapeContext — escape enablement drives tooltip/aria.
    render(
      <BaseModal isOpen={true} onClose={vi.fn()}>
        <BaseModal.Header title="Title" onClose={vi.fn()} />
      </BaseModal>
    )
    const closeBtn = screen.getByLabelText('Close modal (Esc)')
    expect(closeBtn).toHaveAttribute('title', 'Close (Esc)')
  })

  it('close button title and aria-label omit Esc when closeOnEscape is false', () => {
    // Regression test for #8386 — sticky modals (closeOnEscape=false) must not
    // advertise an Esc shortcut that does nothing.
    render(
      <BaseModal isOpen={true} onClose={vi.fn()} closeOnEscape={false}>
        <BaseModal.Header title="Title" onClose={vi.fn()} />
      </BaseModal>
    )
    const closeBtn = screen.getByLabelText('Close modal')
    expect(closeBtn).toHaveAttribute('title', 'Close')
    // And the old Esc variant must not be present.
    expect(screen.queryByLabelText('Close modal (Esc)')).not.toBeInTheDocument()
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
    render(
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
  it('hides keyboard hints by default', () => {
    render(
      <BaseModal isOpen={true} onClose={vi.fn()}>
        <BaseModal.Footer />
      </BaseModal>
    )
    expect(screen.queryByText('Esc')).not.toBeInTheDocument()
  })

  it('shows keyboard hints when showKeyboardHints is true', () => {
    render(
      <BaseModal isOpen={true} onClose={vi.fn()}>
        <BaseModal.Footer showKeyboardHints={true} />
      </BaseModal>
    )
    expect(screen.getByText('Esc')).toBeInTheDocument()
    // Both Esc and Space hints show "close" as label, so use getAllByText
    const closeLabels = screen.getAllByText('close')
    expect(closeLabels.length).toBeGreaterThanOrEqual(1)
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
