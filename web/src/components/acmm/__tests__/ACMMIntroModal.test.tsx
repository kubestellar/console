import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      if (opts?.ownerRepo) return `Scan owner/repo`
      const map: Record<string, string> = {
        'acmmIntro.gotIt': 'Got it',
        'acmmIntro.dontShowAgain': "Don't show again",
      }
      return map[key] ?? key
    },
  }),
}))

// BaseModal uses createPortal — render children inline for tests
vi.mock('../../../lib/modals', () => ({
  BaseModal: ({
    isOpen,
    onClose,
    children,
    closeOnEscape,
  }: {
    isOpen: boolean
    onClose: () => void
    children: React.ReactNode
    closeOnEscape?: boolean
  }) => {
    if (!isOpen) return null
    return (
      <div
        data-testid="base-modal"
        onKeyDown={(e) => {
          if (closeOnEscape && e.key === 'Escape') onClose()
        }}
        tabIndex={-1}
      >
        {children}
      </div>
    )
  },
}))

// Attach sub-components that ACMMIntroModal uses
import * as modals from '../../../lib/modals'
;(modals.BaseModal as unknown as Record<string, unknown>).Header = ({
  title,
  description,
  onClose,
}: {
  title: string
  description: string
  onClose: () => void
}) => (
  <div>
    <h2>{title}</h2>
    <p>{description}</p>
    <button aria-label="Close" onClick={onClose}>
      ×
    </button>
  </div>
)
;(modals.BaseModal as unknown as Record<string, unknown>).Content = ({
  children,
}: {
  children: React.ReactNode
}) => <div data-testid="modal-content">{children}</div>
;(modals.BaseModal as unknown as Record<string, unknown>).Footer = ({
  children,
}: {
  children: React.ReactNode
}) => <div data-testid="modal-footer">{children}</div>

import { ACMMIntroModal, isACMMIntroDismissed } from '../ACMMIntroModal'

const STORAGE_KEY = 'kc-acmm-intro-dismissed'

function renderModal(isOpen = true, onClose = vi.fn()) {
  return { onClose, ...render(<ACMMIntroModal isOpen={isOpen} onClose={onClose} />) }
}

describe('ACMMIntroModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  it('renders when isOpen is true', () => {
    renderModal(true)
    expect(screen.getByTestId('base-modal')).toBeInTheDocument()
  })

  it('does not render when isOpen is false', () => {
    renderModal(false)
    expect(screen.queryByTestId('base-modal')).not.toBeInTheDocument()
  })

  it('renders modal content and footer', () => {
    renderModal()
    expect(screen.getByTestId('modal-content')).toBeInTheDocument()
    expect(screen.getByTestId('modal-footer')).toBeInTheDocument()
  })

  it('renders all 6 level labels (L1–L6)', () => {
    renderModal()
    for (const label of ['L1', 'L2', 'L3', 'L4', 'L5', 'L6']) {
      expect(screen.getByText(label)).toBeInTheDocument()
    }
  })

  it('renders all 4 source framework badges', () => {
    renderModal()
    expect(screen.getByText('ACMM')).toBeInTheDocument()
    expect(screen.getByText('Fullsend')).toBeInTheDocument()
    expect(screen.getByText('AEF')).toBeInTheDocument()
    expect(screen.getByText('Reflect')).toBeInTheDocument()
  })

  it('calls onClose when Close button in header is clicked', async () => {
    const user = userEvent.setup()
    const { onClose } = renderModal()
    await user.click(screen.getByRole('button', { name: /close/i }))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('calls onClose when Got It button is clicked', async () => {
    const user = userEvent.setup()
    const { onClose } = renderModal()
    await user.click(screen.getByRole('button', { name: /got it/i }))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('does not persist dismissal when checkbox is unchecked', async () => {
    const user = userEvent.setup()
    renderModal()
    await user.click(screen.getByRole('button', { name: /got it/i }))
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
  })

  it('persists dismissal when checkbox is checked before close', async () => {
    const user = userEvent.setup()
    renderModal()
    await user.click(screen.getByRole('checkbox'))
    await user.click(screen.getByRole('button', { name: /got it/i }))
    expect(localStorage.getItem(STORAGE_KEY)).toBe('1')
  })

  it('checkbox starts unchecked', () => {
    renderModal()
    expect(screen.getByRole('checkbox')).not.toBeChecked()
  })

  it('checkbox toggles on click', async () => {
    const user = userEvent.setup()
    renderModal()
    const cb = screen.getByRole('checkbox')
    await user.click(cb)
    expect(cb).toBeChecked()
    await user.click(cb)
    expect(cb).not.toBeChecked()
  })

  it('renders external link to the ACMM paper', () => {
    renderModal()
    const links = screen.getAllByRole('link')
    const paperLink = links.find((l) =>
      l.getAttribute('href') === 'https://arxiv.org/abs/2604.09388',
    )
    expect(paperLink).toBeDefined()
    expect(paperLink).toHaveAttribute('target', '_blank')
  })

  it('renders external link to ACMM docs', () => {
    renderModal()
    const links = screen.getAllByRole('link')
    const docsLink = links.find((l) =>
      l.getAttribute('href') === 'https://console-docs.kubestellar.io/acmm/acmm-dashboard',
    )
    expect(docsLink).toBeDefined()
    expect(docsLink).toHaveAttribute('target', '_blank')
  })
})

describe('isACMMIntroDismissed', () => {
  beforeEach(() => localStorage.clear())

  it('returns false when nothing is stored', () => {
    expect(isACMMIntroDismissed()).toBe(false)
  })

  it('returns true when storage key is "1"', () => {
    localStorage.setItem(STORAGE_KEY, '1')
    expect(isACMMIntroDismissed()).toBe(true)
  })

  it('returns false for any other stored value', () => {
    localStorage.setItem(STORAGE_KEY, 'true')
    expect(isACMMIntroDismissed()).toBe(false)
  })
})
